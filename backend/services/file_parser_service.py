"""
Local document parsing and optional company Azure image captions.
"""
import os
import re
import logging
import tempfile
from typing import Optional, List, Union
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image
from services.ai_providers.text import strip_think_tags

logger = logging.getLogger(__name__)


def _default_project_root() -> Path:
    current_file = Path(__file__).resolve()
    backend_dir = current_file.parent.parent
    return backend_dir.parent


def _resolve_upload_folder(upload_folder: Optional[Union[os.PathLike, str]] = None) -> Path:
    if upload_folder:
        upload_path = Path(upload_folder)
    else:
        upload_path = None
        try:
            from flask import current_app, has_app_context
            if has_app_context() and hasattr(current_app, 'config'):
                configured_upload_folder = current_app.config.get('UPLOAD_FOLDER')
                if (
                    isinstance(configured_upload_folder, (str, os.PathLike))
                    and str(configured_upload_folder)
                ):
                    upload_path = Path(configured_upload_folder)
        except (RuntimeError, ImportError, TypeError, AttributeError):
            pass

        if upload_path is None:
            env_upload_folder = os.getenv('UPLOAD_FOLDER')
            if env_upload_folder:
                upload_path = Path(env_upload_folder)

        if upload_path is None:
            upload_path = _default_project_root() / 'uploads'

    if not upload_path.is_absolute():
        project_root = _default_project_root()
        upload_path = (project_root / upload_path).resolve()
        try:
            upload_path.relative_to(project_root)
        except ValueError as exc:
            raise ValueError("Relative UPLOAD_FOLDER must stay within the project root") from exc

    return upload_path.resolve()


class FileParserService:
    """Local parsing service; documents are never uploaded to a parsing vendor."""

    def __init__(self, upload_folder: Optional[Union[os.PathLike, str]] = None):
        self._caption_provider = None
        if upload_folder:
            _resolve_upload_folder(upload_folder)
        self._upload_folder_param = upload_folder

    @property
    def upload_folder(self) -> Path:
        return _resolve_upload_folder(self._upload_folder_param)

    def _get_caption_provider(self):
        """Lazily initialize caption provider via the provider factory"""
        if self._caption_provider is None:
            from services.ai_providers import get_caption_provider
            self._caption_provider = get_caption_provider()
        return self._caption_provider

    def _can_generate_captions(self) -> bool:
        """Check if image caption generation is available"""
        try:
            return self._get_caption_provider() is not None
        except (ValueError, ImportError):
            return False

    def parse_file(self, file_path: str, filename: str) -> tuple[Optional[str], Optional[str], Optional[str], Optional[str], int]:
        """Parse locally. The tuple remains compatible with asynchronous job callers."""
        from services.document_providers import get_document_provider
        try:
            markdown = get_document_provider().parse(file_path, filename)
            return None, markdown, None, None, 0
        except Exception as error:
            logger.exception("Local document parsing failed")
            return None, None, None, str(error), 0

    def _enhance_markdown_with_captions(self, markdown_content: str) -> tuple[str, int]:
        """
        Enhance markdown by adding captions to images that don't have alt text

        Args:
            markdown_content: Original markdown content

        Returns:
            Tuple of (enhanced_markdown, failed_image_count)
        """
        # Extract all image URLs from markdown (both with and without alt text)
        image_pattern = r'!\[(.*?)\]\(([^\)]+)\)'
        matches = list(re.finditer(image_pattern, markdown_content))

        logger.info(f"Found {len(matches)} markdown image references")

        if not matches:
            logger.info("No markdown image syntax found")
            return markdown_content, 0

        # Filter to only images without alt text (empty brackets)
        images_to_caption = []
        for match in matches:
            alt_text = match.group(1).strip()
            image_url = match.group(2).strip()
            logger.debug(f"Image found: alt='{alt_text}', url='{image_url}'")

            if not alt_text and image_url.startswith('/files/parsed/'):
                images_to_caption.append(match)

        if not images_to_caption:
            logger.info(
                "Found %s markdown images, but none are captionable local parsed files. "
                "Skipping caption generation.",
                len(matches),
            )
            return markdown_content, 0

        if not self._can_generate_captions():
            return markdown_content, 0

        logger.info(f"Found {len(images_to_caption)} images without descriptions out of {len(matches)} total, generating captions...")

        # Generate captions in parallel (only for images without alt text)
        image_urls = [match.group(2) for match in images_to_caption]
        captions, failed_count = self._generate_captions_parallel(image_urls)

        # Log results
        success_count = len(images_to_caption) - failed_count
        logger.info(f"Image caption generation completed: {success_count} succeeded, {failed_count} failed out of {len(images_to_caption)} total")

        # Replace image syntax with captioned version (in reverse order to maintain positions)
        enhanced_content = markdown_content
        for match, caption in zip(reversed(images_to_caption), reversed(captions)):
            old_text = match.group(0)
            url = match.group(2)
            # Use caption as alt text (empty if generation failed)
            new_text = f"![{caption}]({url})"
            enhanced_content = enhanced_content[:match.start()] + new_text + enhanced_content[match.end():]

        return enhanced_content, failed_count

    def _generate_captions_parallel(self, image_urls: List[str], max_workers: int = 12, max_retries: int = 3) -> tuple[List[str], int]:
        """
        Generate captions for multiple images in parallel with retry mechanism

        Args:
            image_urls: List of image URLs
            max_workers: Maximum number of parallel workers
            max_retries: Maximum number of retries for each image

        Returns:
            Tuple of (list of captions, number of failed images)
        """
        captions = [""] * len(image_urls)
        failed_count = 0

        def generate_with_retry(url: str, idx: int) -> tuple[int, str, bool]:
            """Generate caption with retry logic"""
            for attempt in range(max_retries):
                try:
                    caption = self._generate_single_caption(url)
                    if caption:
                        logger.debug(f"Generated caption for image {idx + 1}/{len(image_urls)} (attempt {attempt + 1})")
                        return (idx, caption, True)
                    else:
                        logger.warning(f"Empty caption for image {idx + 1} (attempt {attempt + 1}/{max_retries})")
                except Exception as e:
                    logger.warning(f"Failed to generate caption for image {idx + 1} (attempt {attempt + 1}/{max_retries}): {str(e)}")
                    if attempt < max_retries - 1:
                                                time.sleep(1 * (attempt + 1))  # Exponential backoff: 1s, 2s, 3s

            # All retries failed
            logger.error(f"Failed to generate caption for image {idx + 1} after {max_retries} attempts")
            return (idx, "", False)

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_idx = {
                executor.submit(generate_with_retry, url, idx): idx
                for idx, url in enumerate(image_urls)
            }

            for future in as_completed(future_to_idx):
                try:
                    idx, caption, success = future.result()
                    captions[idx] = caption
                    if not success:
                        failed_count += 1
                except Exception as e:
                    idx = future_to_idx[future]
                    logger.error(f"Unexpected error generating caption for image {idx + 1}: {str(e)}")
                    failed_count += 1

        return captions, failed_count

    def _generate_single_caption(self, image_url: str) -> str:
        """
        Generate caption for a single local parsed image.

        Args:
            image_url: Local /files/parsed/ path of the image

        Returns:
            Generated caption
        """
        try:
            if image_url.startswith('/files/parsed/'):
                # Local parsed extracted file with prefix matching support
                from utils.path_utils import find_parsed_file_with_prefix

                # Find file with prefix matching
                img_path = find_parsed_file_with_prefix(
                    image_url,
                    upload_folder=self.upload_folder
                )

                if img_path is None or not img_path.exists():
                    logger.warning(f"Local image file not found (with prefix matching): {image_url}")
                    return ""

                image = Image.open(img_path)
            else:
                # Unsupported path type
                logger.warning(f"Unsupported image path type: {image_url}")
                return ""

            # Generate caption via provider factory
            from services.prompts import LANGUAGE_CONFIG
            from services.runtime_config import setting
            language = LANGUAGE_CONFIG.get(setting('OUTPUT_LANGUAGE', 'ko'), LANGUAGE_CONFIG['ko'])
            prompt = 'Briefly describe the main contents of this picture. ' + language['instruction']

            with tempfile.NamedTemporaryFile(prefix='caption_', suffix='.jpg', delete=False) as tmp:
                temp_path = tmp.name
            try:
                if image.mode in ('RGBA', 'LA', 'P'):
                    image = image.convert('RGB')
                image.save(temp_path, format="JPEG", quality=95)
                image.close()

                provider = self._get_caption_provider()
                caption = provider.generate_with_image(prompt, temp_path)
            finally:
                try:
                    os.remove(temp_path)
                except OSError:
                    pass

            # Strip <think>...</think> tags from reasoning models
            caption = strip_think_tags(caption)

            return caption

        except Exception as e:
            logger.warning(f"Failed to generate caption for {image_url}: {str(e)}")
            return ""  # Return empty string on failure
