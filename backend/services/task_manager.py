"""
Task Manager - handles background tasks using ThreadPoolExecutor
No need for Celery or Redis, uses in-memory task tracking
"""
import logging
import os
import shutil
import tempfile
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager
from typing import Callable, List, Dict, Any, Optional
from datetime import datetime
from math import gcd
import time
from sqlalchemy import func
from sqlalchemy.exc import OperationalError
from PIL import Image, ImageDraw, ImageFilter
from models import db, Task, Page, Material, PageImageVersion, Settings, ProjectTemplateAsset, Project
from services.task_watchdog import task_scope, task_watchdog
from utils import get_filtered_pages
from utils.image_utils import check_image_resolution

logger = logging.getLogger(__name__)

IMAGE_QUALITY_CONTROL_MAX_ATTEMPTS = 3


class ImageQualityControlError(ValueError):
    """Raised when generated images repeatedly fail quality review."""


def get_image_prompt_field_names() -> set:
    """Read settings to allow entry into the texture prompt Additional field name。"""
    try:
        settings = Settings.get_settings()
        return set(settings.get_image_prompt_extra_fields())
    except Exception as e:
        logger.warning("Failed to retrieve image prompt extra fields; using defaults: %s", e)
        return set(Settings.DEFAULT_IMAGE_PROMPT_FIELDS)


def _append_extra_fields(
    desc_text: Optional[str],
    desc_content: Optional[dict],
    allowed_fields: Optional[set] = None,
) -> str:
    """Yes, sir. extra_fields Collapse the end of the description text for the image generation prompt Usage。

    Old field name in stock data（Visual elements/Visual focus/Page layout Wait, wait. LEGACY_FIELD_EQUIV Equivalent.
    The new field name will be judged after the field name is changed to avoid the sudden failure of these elements to recreate the old project prompt。
    """
    safe_desc = (desc_text or "").strip()
    if not desc_content or not isinstance(desc_content, dict):
        return safe_desc
    extra_fields = desc_content.get('extra_fields')
    if not extra_fields or not isinstance(extra_fields, dict):
        return safe_desc
    allowed = allowed_fields if allowed_fields is not None else get_image_prompt_field_names()
    parts = []
    if safe_desc:
        parts.append(safe_desc)
    for name, value in extra_fields.items():
        if value is None or str(value).strip() == "":
            continue
        if name in allowed or Settings.LEGACY_FIELD_EQUIV.get(name) in allowed:
            parts.append(f"{Settings.LEGACY_INPUT_FIELDS.get(name, name)}: {value}")
    return '\n'.join(parts)


def get_image_quality_control_enabled() -> bool:
    """Return whether generated page images should pass visual QC before saving."""
    try:
        return bool(Settings.get_settings().enable_image_quality_control)
    except Exception as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        logger.warning("Failed to retrieve image quality control setting; using disabled: %s", e)
        return False


def _format_quality_review_failure(review: Optional[dict]) -> str:
    if not review:
        return "Quality control not passed"
    issues = review.get('issues') or []
    if isinstance(issues, str):
        issues = [issues]
    elif not isinstance(issues, list):
        issues = []
    reason = (review.get('reason') or '').strip()
    details = "；".join(str(issue).strip() for issue in issues if str(issue).strip())
    if reason and details:
        return f"{reason}（{details}）"
    return reason or details or "Quality control not passed"


def _get_absolute_page_index(page_obj, fallback_index: Optional[int]) -> Optional[int]:
    order_index = getattr(page_obj, 'order_index', None)
    if order_index is None:
        return fallback_index
    return order_index + 1


def review_image_quality(
    ai_service,
    image: Image.Image,
    generation_prompt: str,
    page_desc: str,
    page_data: Optional[Dict[str, Any]] = None,
    page_index: Optional[int] = None,
) -> dict:
    """Run the multimodal quality review on an unsaved generated image."""
    temp_path = None
    converted_image = None
    try:
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
            temp_path = tmp.name
        review_image = image
        if image.mode != 'RGB':
            converted_image = image.convert('RGB')
            review_image = converted_image
        review_image.save(temp_path, format='JPEG', quality=85)
        return ai_service.review_generated_slide_image(
            temp_path,
            generation_prompt=generation_prompt,
            page_desc=page_desc,
            page_outline=page_data or {},
            page_index=page_index,
        )
    finally:
        if converted_image is not None:
            converted_image.close()
        if temp_path:
            try:
                os.remove(temp_path)
            except OSError:
                pass


def generate_image_until_quality_passes(
    generate_image: Callable[[], Optional[Image.Image]],
    ai_service,
    generation_prompt: str,
    page_desc: str,
    page_data: Optional[Dict[str, Any]] = None,
    page_index: Optional[int] = None,
    quality_control_enabled: bool = False,
    max_attempts: int = IMAGE_QUALITY_CONTROL_MAX_ATTEMPTS,
) -> Image.Image:
    """Generate an image and, when enabled, retry until QC passes or attempts are exhausted."""
    attempts = max(1, int(max_attempts)) if quality_control_enabled else 1
    last_error: Optional[Exception] = None
    last_review: Optional[dict] = None

    for attempt in range(1, attempts + 1):
        try:
            image = generate_image()
            if not image:
                raise ValueError("Failed to generate image")

            if not quality_control_enabled:
                return image

            review = review_image_quality(
                ai_service,
                image,
                generation_prompt,
                page_desc,
                page_data=page_data,
                page_index=page_index,
            )
            last_review = review
            last_error = None
            if review.get('passed'):
                logger.info("Image quality control passed for page %s on attempt %s", page_index, attempt)
                return image

            logger.warning(
                "Image quality control rejected page %s on attempt %s/%s: %s",
                page_index,
                attempt,
                attempts,
                _format_quality_review_failure(review),
            )
        except Exception as e:
            last_error = e
            last_review = None
            logger.warning(
                "Image quality control attempt %s/%s failed for page %s: %s",
                attempt,
                attempts,
                page_index,
                e,
            )
            if attempt >= attempts and not quality_control_enabled:
                raise

    if last_review:
        reason = _format_quality_review_failure(last_review)
        raise ImageQualityControlError(f"Photo quality control not passed：{reason}。Please try again after adjusting the page description or hint。")
    if last_error:
        raise ImageQualityControlError(f"Image quality control failed：{last_error}。Please try again after adjusting the page description or hint。") from last_error
    raise ImageQualityControlError("Picture quality control not passed. Try again after adjusting the page description or hint。")
from pathlib import Path
from services.pdf_service import split_pdf_to_pages


class ResourceLimiter:
    """Thread-safe concurrency limiter for a shared external resource."""

    def __init__(self, name: str, capacity: int):
        self.name = name
        self.capacity = max(1, int(capacity))
        self._in_use = 0
        self._condition = threading.Condition()

    def update_capacity(self, capacity: int):
        new_capacity = max(1, int(capacity))
        with self._condition:
            if new_capacity == self.capacity:
                return
            logger.info(f"Updating {self.name} limiter: {self.capacity} -> {new_capacity}")
            self.capacity = new_capacity
            self._condition.notify_all()

    @contextmanager
    def slot(self, label: str, on_acquire: Optional[Callable[[], None]] = None):
        waited = False
        with self._condition:
            while self._in_use >= self.capacity:
                if not waited:
                    waited = True
                    logger.info(
                        f"{self.name} limiter full ({self._in_use}/{self.capacity}), "
                        f"waiting: {label}"
                    )
                # Waiting for limit slots worker Still alive, keep your heart beating, and avoid getting stuck by the guard dog.
                task_watchdog.touch_current_thread()
                self._condition.wait(timeout=0.5)

            self._in_use += 1

        if waited:
            logger.info(f"{self.name} limiter slot acquired: {label}")

        try:
            if on_acquire:
                on_acquire()
            yield
        finally:
            with self._condition:
                self._in_use -= 1
                self._condition.notify()


class TaskManager:
    """Simple task manager using ThreadPoolExecutor"""

    def __init__(self, max_workers: int = 4):
        """Initialize task manager"""
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self.active_tasks = {}  # task_id -> Future
        self.lock = threading.Lock()
        self.max_workers = max_workers

    def submit_task(self, task_id: str, func: Callable, *args, **kwargs):
        """Submit a background task"""
        with self.lock:
            executor = self.executor

        def _run(tid, *run_args, **run_kwargs):
            # Waiting in line doesn’t count."Hold it!"：worker The heart beats are registered when the real start starts.，
            # So the queue won’t be because"There’s no heartbeat."I’ve been convicted of being stuck.
            task_watchdog.touch(tid, 'Commencement')
            task_watchdog.bind_thread(tid)
            try:
                return func(tid, *run_args, **run_kwargs)
            finally:
                task_watchdog.unbind_thread()

        try:
            future = executor.submit(_run, task_id, *args, **kwargs)
        except Exception:
            task_watchdog.forget(task_id)
            raise

        with self.lock:
            self.active_tasks[task_id] = future

        # Add callback to clean up when done and log exceptions
        future.add_done_callback(lambda f: self._task_done_callback(task_id, f))

    def _task_done_callback(self, task_id: str, future):
        """Handle task completion and log any exceptions"""
        try:
            # Check if task raised an exception
            exception = future.exception()
            if exception:
                logger.error(f"Task {task_id} failed with exception: {exception}", exc_info=exception)
        except Exception as e:
            logger.error(f"Error in task callback for {task_id}: {e}", exc_info=True)
        finally:
            self._cleanup_task(task_id)

    def _cleanup_task(self, task_id: str):
        """Clean up completed task"""
        task_watchdog.forget(task_id)
        with self.lock:
            if task_id in self.active_tasks:
                del self.active_tasks[task_id]

    def is_task_active(self, task_id: str) -> bool:
        """Check if task is still running"""
        with self.lock:
            return task_id in self.active_tasks

    def shutdown(self):
        """Shutdown the executor"""
        self.executor.shutdown(wait=True)

    def update_max_workers(self, max_workers: int):
        """Replace the shared executor so new tasks use a higher/lower ceiling."""
        new_max_workers = max(1, int(max_workers))
        old_executor = None

        with self.lock:
            if new_max_workers == self.max_workers:
                return

            logger.info(f"Updating background task pool size: {self.max_workers} -> {new_max_workers}")
            old_executor = self.executor
            self.executor = ThreadPoolExecutor(max_workers=new_max_workers)
            self.max_workers = new_max_workers

        if old_executor is not None:
            old_executor.shutdown(wait=False, cancel_futures=False)


def _compute_background_worker_target(description_workers: int, image_workers: int) -> int:
    """Keep the shared task pool from becoming the product-level bottleneck."""
    return max(8, int(description_workers) + int(image_workers) + 4)


# Global task manager and resource limiters
task_manager = TaskManager(max_workers=max(8, int(os.getenv('MAX_BACKGROUND_TASK_WORKERS', '16'))))
image_resource_limiter = ResourceLimiter("image", int(os.getenv('MAX_IMAGE_WORKERS', '20')))
text_resource_limiter = ResourceLimiter("text", int(os.getenv('MAX_DESCRIPTION_WORKERS', '20')))


def sync_resource_limits(description_workers: int, image_workers: int):
    """Apply the latest runtime settings to shared concurrency controls."""
    task_manager.update_max_workers(
        _compute_background_worker_target(description_workers, image_workers)
    )
    image_resource_limiter.update_capacity(image_workers)
    text_resource_limiter.update_capacity(description_workers)


def save_image_with_version(image, project_id: str, page_id: str, file_service,
                            page_obj=None, image_format: str = 'PNG') -> tuple[str, int]:
    """
    Public function to save pictures and create historical versions of records

    Args:
        image: PIL Image Object
        project_id: Item ID
        page_id: Page ID
        file_service: FileService Examples
        page_obj: Page Object (optional, update page status if available)）
        image_format: Picture format, default PNG

    Returns:
        tuple: (image_path, version_number) - Picture path and version number

    This function will...：
    1. Calculates the next version number (use MAX Query secure.）
    2. Mark all old versions as non-current versions
    3. Save picture to final position
    4. Generate and save compressed cache pictures
    5. Create new version of the record
    6. If provided page_obj，Update page status and picture path
    """
    # Usage MAX Query to ensure that version numbers are secure (even if the version is deleted will not be repeated)）
    max_version = db.session.query(func.max(PageImageVersion.version_number)).filter_by(page_id=page_id).scalar() or 0
    next_version = max_version + 1

    # Batch update： Mark all old versions as non-current versions (use single bar) SQL More efficient.）
    PageImageVersion.query.filter_by(page_id=page_id).update({'is_current': False})

    # Save original map to final position (use version number)）
    image_path = file_service.save_generated_image(
        image, project_id, page_id,
        version_number=next_version,
        image_format=image_format
    )

    # Generate and save compressed cache pictures (for front-end quick display)）
    cached_image_path = file_service.save_cached_image(
        image, project_id, page_id,
        version_number=next_version,
        quality=85
    )

    # Create new version of the record
    new_version = PageImageVersion(
        page_id=page_id,
        image_path=image_path,
        version_number=next_version,
        is_current=True
    )
    db.session.add(new_version)

    # If provided page_obj，Update page status and picture path
    if page_obj:
        page_obj.generated_image_path = image_path
        page_obj.cached_image_path = cached_image_path
        page_obj.status = 'COMPLETED'
        page_obj.updated_at = datetime.utcnow()

    _commit_with_retry()

    logger.debug(f"Page {page_id} image saved as version {next_version}: {image_path}, cached: {cached_image_path}")

    return image_path, next_version


def resolve_page_template(page, project, file_service):
    """Per-page-template priority chain (PRD §13).

    Returns (ref_image_abs_path | None, page_style_text | None).

    Priority:
      1. page.template_asset_id        → asset.image_path (per-page image)
      2. page.template_style_text      → page-level style text
      3. project.template_image_path   → legacy project-level image (backfill / single-mode)
      4. project.template_style        → legacy project-level style
    """
    image_path = None
    style_text = None

    asset = getattr(page, 'template_asset', None)
    if asset and getattr(asset, 'image_path', None):
        image_path = file_service.get_absolute_path(asset.image_path)

    if getattr(page, 'template_style_text', None):
        style_text = page.template_style_text

    if image_path is None and project and getattr(project, 'template_image_path', None):
        image_path = file_service.get_template_path(project.id)

    if not style_text and project and getattr(project, 'template_style', None):
        style_text = project.template_style

    return image_path, style_text


def _commit_with_retry(max_retries=5, base_delay=0.5):
    for attempt in range(max_retries):
        try:
            db.session.commit()
            return
        except OperationalError as e:
            if "database is locked" in str(e) and attempt < max_retries - 1:
                db.session.rollback()
                delay = base_delay * (2 ** attempt)
                logger.warning(f"Database locked, retrying commit in {delay:.1f}s (attempt {attempt + 1}/{max_retries})")
                time.sleep(delay)
            else:
                raise


SUPPORTED_IMAGE_ASPECT_RATIOS = (
    '1:1',
    '1:4',
    '1:8',
    '2:3',
    '3:2',
    '3:4',
    '4:1',
    '4:3',
    '4:5',
    '5:4',
    '8:1',
    '9:16',
    '16:9',
    '21:9',
)


def _aspect_ratio_from_size(width: int, height: int) -> str:
    """Map arbitrary pixel dimensions to the nearest provider-supported aspect ratio."""
    safe_width = max(1, width)
    safe_height = max(1, height)
    divisor = gcd(safe_width, safe_height)
    normalized = f"{safe_width // divisor}:{safe_height // divisor}"
    if normalized in SUPPORTED_IMAGE_ASPECT_RATIOS:
        return normalized

    source_ratio = safe_width / safe_height
    return min(
        SUPPORTED_IMAGE_ASPECT_RATIOS,
        key=lambda candidate: abs(source_ratio - (int(candidate.split(':')[0]) / int(candidate.split(':')[1]))),
    )


def _normalize_selection_bbox(selection: dict, image_size: tuple[int, int]) -> tuple[int, int, int, int]:
    """Clamp a selection rectangle into source image bounds."""
    width, height = image_size
    x0 = max(0, min(int(selection['x']), width - 1))
    y0 = max(0, min(int(selection['y']), height - 1))
    x1 = max(x0 + 1, min(x0 + int(selection['width']), width))
    y1 = max(y0 + 1, min(y0 + int(selection['height']), height))
    return x0, y0, x1, y1


def _create_marked_reference_image(source_image: Image.Image, bbox: tuple[int, int, int, int]) -> Image.Image:
    """Highlight the selected region so edit models can focus on it reliably."""
    marked = source_image.convert('RGB').copy()
    draw = ImageDraw.Draw(marked, 'RGBA')
    outline_width = max(4, min(source_image.size) // 120)
    draw.rectangle(bbox, fill=(0, 0, 0, 190), outline=(255, 255, 255, 255), width=outline_width)
    return marked


def _blend_region_into_source(
    source_image: Image.Image,
    edited_image: Image.Image,
    bbox: tuple[int, int, int, int],
    feather_radius: int = 12,
) -> Image.Image:
    """Blend only the selected region from the edited result back into the source image."""
    if edited_image.size != source_image.size:
        edited_image = edited_image.resize(source_image.size, Image.Resampling.LANCZOS)

    source_rgb = source_image.convert('RGB')
    edited_rgb = edited_image.convert('RGB')
    mask = Image.new('L', source_rgb.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rectangle(bbox, fill=255)
    if feather_radius > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(radius=feather_radius))
    return Image.composite(edited_rgb, source_rgb, mask)


def _build_region_edit_instruction(prompt: str, operation: str) -> str:
    """Create a focused prompt for region-based edits using a marked reference image."""
    cleaned_prompt = (prompt or '').strip()
    if operation == 'erase_region':
        user_goal = cleaned_prompt or "Remove the main contents of the black marked area and naturally complete the background texture and light。"
        return (
            "Users will provide two reference maps： one original, one with a black and solid constituency tag。\n"
            "Please process only the black marked area, remove its contents and naturally complete it according to the surrounding visual。\n"
            "Maps, text, photocopy, tone outside the black area remain as constant as possible。\n"
            f"Additional requirements：{user_goal}"
        )

    return (
        "Users will provide two reference maps： one original, one with a black and solid constituency tag。\n"
        "Please focus on changing the Black Marked Area to strictly implement user directives around it.。\n"
        "Unmarked areas remain as they are, to the extent possible, and do not involve changes to the overall structure。\n"
        f"User-editing requirements：{cleaned_prompt}"
    )


def generate_descriptions_task(task_id: str, project_id: str, ai_service,
                               project_context, outline: List[Dict],
                               max_workers: int = 5, app=None,
                               language: str = None,
                               detail_level: str = 'default'):
    """
    Background task for generating page descriptions
    Based on demo.py gen_desc() with parallel processing

    Note: app instance MUST be passed from the request context

    Args:
        task_id: Task ID
        project_id: Project ID
        ai_service: AI service instance
        project_context: ProjectContext object containing all project information
        outline: Complete outline structure
        max_workers: Maximum number of parallel workers
        app: Flask app instance
        language: Output language (zh, en, ja, auto)
        detail_level: Description detail level (concise/default/detailed)
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")

    # Apply context throughout the mission
    with app.app_context():
        try:
            # Important： At the beginning of the backstage line. task and set the status
            task = Task.query.get(task_id)
            if not task:
                logger.error(f"Task {task_id} not found")
                return

            task.status = 'PROCESSING'
            db.session.commit()
            logger.info(f"Task {task_id} status updated to PROCESSING")

            # Flatten outline to get pages
            pages_data = ai_service.flatten_outline(outline)

            # Get all pages for this project
            pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()

            if len(pages) != len(pages_data):
                raise ValueError("Page count mismatch")

            # Mark all pages as GENERATING_DESCRIPTION before starting
            for page in pages:
                page.status = 'GENERATING_DESCRIPTION'

            # Initialize progress
            task.set_progress({
                "total": len(pages),
                "completed": 0,
                "failed": 0
            })
            db.session.commit()

            # Generate descriptions in parallel
            completed = 0
            failed = 0

            def generate_single_desc(page_id, page_outline, page_index):
                """
                Generate description for a single page
                Note： Passes only page_id（String), do not pass ORM Object, avoid cross-line session problems
                """
                # Critical repairs： also need to apply context in sub-routing
                with app.app_context():
                    try:
                        # Get singleton AI service instance
                        from services.ai_service_manager import get_ai_service
                        ai_service = get_ai_service()

                        with task_scope(task_id), text_resource_limiter.slot(
                            f"description project={project_id} page={page_id}"
                        ):
                            desc_result = ai_service.generate_page_description(
                                project_context, outline, page_outline, page_index,
                                language=language,
                                detail_level=detail_level
                            )

                        # generate_page_description returns dict with text + optional extra_fields
                        desc_content = {
                            "text": desc_result['text'],
                            "generated_at": datetime.utcnow().isoformat()
                        }
                        if desc_result.get('extra_fields'):
                            desc_content['extra_fields'] = desc_result['extra_fields']

                        return (page_id, desc_content, None)
                    except Exception as e:
                        import traceback
                        error_detail = traceback.format_exc()
                        logger.error(f"Failed to generate description for page {page_id}: {error_detail}")
                        return (page_id, None, str(e))

            # Use ThreadPoolExecutor for parallel generation
            # Key： Advance extraction page.id，Do not pass. ORM Object to Sub-Range
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = [
                    executor.submit(generate_single_desc, page.id, page_data, i)
                    for i, (page, page_data) in enumerate(zip(pages, pages_data), 1)
                ]

                # Process results as they complete
                for future in as_completed(futures):
                    page_id, desc_content, error = future.result()

                    db.session.expire_all()

                    # Update page in database
                    page = Page.query.get(page_id)
                    if page:
                        if error:
                            page.status = 'FAILED'
                            failed += 1
                        else:
                            page.set_description_content(desc_content)
                            page.status = 'DESCRIPTION_GENERATED'
                            completed += 1

                        db.session.commit()

                    # Update task progress
                    task = Task.query.get(task_id)
                    if task:
                        task.update_progress(completed=completed, failed=failed)
                        db.session.commit()
                        logger.info(f"Description Progress: {completed}/{len(pages)} pages completed")

            # Mark task as completed
            task = Task.query.get(task_id)
            if task:
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                db.session.commit()
                logger.info(f"Task {task_id} COMPLETED - {completed} pages generated, {failed} failed")

            # Update project status
            from models import Project
            project = Project.query.get(project_id)
            if project and failed == 0:
                project.status = 'DESCRIPTIONS_GENERATED'
                db.session.commit()
                logger.info(f"Project {project_id} status updated to DESCRIPTIONS_GENERATED")

        except Exception as e:
            # Mark task as failed
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()


def generate_images_task(task_id: str, project_id: str, ai_service, file_service,
                        outline: List[Dict], use_template: bool = True,
                        max_workers: int = 8, aspect_ratio: str = "16:9",
                        resolution: str = "2K", app=None,
                        extra_requirements: str = None,
                        language: str = None,
                        page_ids: list = None,
                        image_prompt_field_names: Optional[set] = None):
    """
    Background task for generating page images
    Based on demo.py gen_images_parallel()

    Note: app instance MUST be passed from the request context

    Args:
        language: Output language (zh, en, ja, auto)
        page_ids: Optional list of page IDs to generate (if not provided, generates all pages)
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        try:
            # Update task status to PROCESSING
            task = Task.query.get(task_id)
            if not task:
                return

            task.status = 'PROCESSING'
            db.session.commit()

            # Get pages for this project (filtered by page_ids if provided)
            pages = get_filtered_pages(project_id, page_ids)
            all_pages_data = ai_service.flatten_outline(outline)
            image_prompt_field_names = (
                image_prompt_field_names
                if image_prompt_field_names is not None
                else get_image_prompt_field_names()
            )
            quality_control_enabled = get_image_quality_control_enabled()

            # Build mapping from order_index to page_data so filtered pages
            # get matched to the correct outline entry (not just first N)
            pages_data_by_index = {i: pd for i, pd in enumerate(all_pages_data)}

            # Note： The template path is not retrieved at the start of the task, but dynamically in each sub-routine
            # This ensures the use of the latest template even if the user produces it immediately after uploading the new template

            # Initialize progress
            task.set_progress({
                "total": len(pages),
                "completed": 0,
                "failed": 0
            })
            db.session.commit()

            # Generate images in parallel
            completed = 0
            failed = 0
            resolution_mismatched = 0  # Count of resolution mismatches

            def generate_single_image(page_id, page_data, page_index):
                """
                Generate image for a single page
                Note： Passes only page_id（String), do not pass ORM Object, avoid cross-line session problems
                """
                # Critical repairs： also need to apply context in sub-routing
                with app.app_context():
                    try:
                        logger.debug(f"Starting image generation for page {page_id}, index {page_index}")
                        # Get page from database in this thread
                        page_obj = Page.query.get(page_id)
                        if not page_obj:
                            raise ValueError(f"Page {page_id} not found")

                        def mark_generating():
                            page_for_update = Page.query.get(page_id)
                            if page_for_update:
                                page_for_update.status = 'GENERATING'
                                db.session.commit()
                                logger.debug(f"Page {page_id} status updated to GENERATING")

                        with task_scope(task_id), image_resource_limiter.slot(
                            f"project={project_id} page={page_id}",
                            on_acquire=mark_generating,
                        ):
                            # Get description content
                            desc_content = page_obj.get_description_content()
                            if not desc_content:
                                raise ValueError("No description content for page")

                            # Fetch description text (possibly) text Field or text_content Array）
                            desc_text = desc_content.get('text', '')
                            if not desc_text and desc_content.get('text_content'):
                                # If... text Field does not exist, try from text_content Numeric Fetch
                                text_content = desc_content.get('text_content', [])
                                if isinstance(text_content, list):
                                    desc_text = '\n'.join(text_content)
                                else:
                                    desc_text = str(text_content)

                            # Yes, sir. extra_fields Spell description text for image generation
                            desc_text = _append_extra_fields(desc_text, desc_content, image_prompt_field_names)

                            logger.debug(f"Got description text for page {page_id}: {desc_text[:100]}...")

                            # Extract pictures from the description of the current page URL
                            page_additional_ref_images = []
                            has_material_images = False

                            # Extract pictures from the description text
                            if desc_text:
                                image_urls = ai_service.extract_image_urls_from_markdown(desc_text)
                                if image_urls:
                                    logger.info(f"Found {len(image_urls)} image(s) in page {page_id} description")
                                    page_additional_ref_images = image_urls
                                    has_material_images = True

                            # Per-page-template (PRD §13): resolve image + style
                            # per-page, falling back to project-level for legacy/single-mode.
                            project_for_template = Project.query.get(project_id)
                            page_ref_image_path, page_style_text = resolve_page_template(
                                page_obj, project_for_template, file_service)
                            has_template_image = bool(page_ref_image_path)

                            # Generate image prompt
                            prompt = ai_service.generate_image_prompt(
                                outline, page_data, desc_text, page_index,
                                has_material_images=has_material_images,
                                extra_requirements=extra_requirements,
                                language=language,
                                has_template=has_template_image,
                                aspect_ratio=aspect_ratio,
                                page_style_text=page_style_text,
                            )
                            logger.debug(f"Generated image prompt for page {page_id}")

                            logger.info(f"🎨 Calling AI service to generate image for page {page_index}/{len(pages)}...")
                            image = generate_image_until_quality_passes(
                                lambda: ai_service.generate_image(
                                    prompt, page_ref_image_path, aspect_ratio, resolution,
                                    additional_ref_images=page_additional_ref_images if page_additional_ref_images else None
                                ),
                                ai_service,
                                prompt,
                                desc_text,
                                page_data=page_data,
                                page_index=_get_absolute_page_index(page_obj, page_index),
                                quality_control_enabled=quality_control_enabled,
                            )
                        logger.info(f"✅ Image generated successfully for page {page_index}")

                        if not image:
                            raise ValueError("Failed to generate image")

                        # Check resolution for all providers
                        actual_res, is_match = check_image_resolution(image, resolution)
                        if not is_match:
                            logger.warning(f"Resolution mismatch for page {page_index}: requested {resolution}, got {actual_res}")

                        # Optimization： Calculating version numbers directly in the sub-routine and saving them to final position
                        # Each page is independent, using database services to ensure the atomicity of the version number and avoid temporary files
                        image_path, next_version = save_image_with_version(
                            image, project_id, page_id, file_service, page_obj=page_obj
                        )

                        return (page_id, image_path, None, not is_match)

                    except Exception as e:
                        import traceback
                        error_detail = traceback.format_exc()
                        logger.error(f"Failed to generate image for page {page_id}: {error_detail}")
                        return (page_id, None, str(e), None)

            # Use ThreadPoolExecutor for parallel generation
            # Key： Advance extraction page.id，Do not pass. ORM Object to Sub-Range
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = [
                    executor.submit(
                        generate_single_image, page.id,
                        pages_data_by_index.get(page.order_index, {}), i
                    )
                    for i, page in enumerate(pages, 1)
                ]

                # Process results as they complete
                for future in as_completed(futures):
                    page_id, image_path, error, is_mismatched = future.result()

                    if is_mismatched:
                        resolution_mismatched += 1

                    db.session.expire_all()

                    # Update page in database (It’s mostly about updating the failure.)
                    page = Page.query.get(page_id)
                    if page:
                        if error:
                            page.status = 'FAILED'
                            failed += 1
                            db.session.commit()
                        else:
                            # Pictures have been saved and version records created in a sub-routine, which requires only an update of the count
                            completed += 1
                            # Refresh page objects to get up to date
                            db.session.refresh(page)

                    # Update task progress
                    task = Task.query.get(task_id)
                    if task:
                        progress = task.get_progress()
                        progress['completed'] = completed
                        progress['failed'] = failed
                        # Set a warning when a match is detected first
                        if resolution_mismatched > 0 and 'warning_message' not in progress:
                            progress['warning_message'] = "생성된 이미지 해상도가 요청한 설정과 다릅니다. 이미지 크기를 확인하세요."
                        task.set_progress(progress)
                        db.session.commit()
                        logger.info(f"Image Progress: {completed}/{len(pages)} pages completed")

            # Mark task as completed
            task = Task.query.get(task_id)
            if task:
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                if resolution_mismatched > 0:
                    logger.warning(f"Task {task_id} has {resolution_mismatched} resolution mismatches")
                db.session.commit()
                logger.info(f"Task {task_id} COMPLETED - {completed} images generated, {failed} failed")

            # Update project status
            project = Project.query.get(project_id)
            if project and failed == 0:
                project.status = 'COMPLETED'
                db.session.commit()
                logger.info(f"Project {project_id} status updated to COMPLETED")

        except Exception as e:
            # Mark task as failed
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()


def generate_single_page_image_task(task_id: str, project_id: str, page_id: str,
                                    ai_service, file_service, outline: List[Dict],
                                    use_template: bool = True, aspect_ratio: str = "16:9",
                                    resolution: str = "2K", app=None,
                                    extra_requirements: str = None,
                                    language: str = None,
                                    image_prompt_field_names: Optional[set] = None):
    """
    Background task for generating a single page image

    Note: app instance MUST be passed from the request context
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        try:
            # Update task status to PROCESSING
            task = Task.query.get(task_id)
            if not task:
                return

            task.status = 'PENDING'
            db.session.commit()

            # Get page from database
            page = Page.query.get(page_id)
            if not page or page.project_id != project_id:
                raise ValueError(f"Page {page_id} not found")

            # Single-page requests should only flip to GENERATING after they acquire
            # a real image-generation slot.
            page.status = 'QUEUED'
            db.session.commit()

            # Get description content
            desc_content = page.get_description_content()
            if not desc_content:
                raise ValueError("No description content for page")
            image_prompt_field_names = (
                image_prompt_field_names
                if image_prompt_field_names is not None
                else get_image_prompt_field_names()
            )
            quality_control_enabled = get_image_quality_control_enabled()

            # Fetch description text (possibly) text Field or text_content Array）
            desc_text = desc_content.get('text', '')
            if not desc_text and desc_content.get('text_content'):
                text_content = desc_content.get('text_content', [])
                if isinstance(text_content, list):
                    desc_text = '\n'.join(text_content)
                else:
                    desc_text = str(text_content)

            # Yes, sir. extra_fields Spell description text for image generation
            desc_text = _append_extra_fields(desc_text, desc_content, image_prompt_field_names)

            # Extract pictures from the description text URL
            additional_ref_images = []
            has_material_images = False

            if desc_text:
                image_urls = ai_service.extract_image_urls_from_markdown(desc_text)
                if image_urls:
                    logger.info(f"Found {len(image_urls)} image(s) in page {page_id} description")
                    additional_ref_images = image_urls
                    has_material_images = True

            # Per-page-template (PRD §13): resolve image + style per-page,
            # falling back to project-level for legacy/single-mode.
            project_for_template = Project.query.get(project_id)
            ref_image_path, page_style_text = resolve_page_template(
                page, project_for_template, file_service)
            if not use_template:
                ref_image_path = None
            if ref_image_path and not Path(ref_image_path).is_file():
                logger.warning(
                    "Template image disappeared before generation for page %s: %s",
                    page_id,
                    ref_image_path,
                )
                ref_image_path = None
            if not ref_image_path and not page_style_text:
                raise ValueError(
                    "No template image or style description found for page")
            has_template_image = bool(ref_image_path)

            # Generate image prompt
            page_data = page.get_outline_content() or {}
            if page.part:
                page_data['part'] = page.part

            prompt = ai_service.generate_image_prompt(
                outline, page_data, desc_text, page.order_index + 1,
                has_material_images=has_material_images,
                extra_requirements=extra_requirements,
                language=language,
                has_template=has_template_image,
                aspect_ratio=aspect_ratio,
                page_style_text=page_style_text,
            )

            def mark_generating():
                task_obj = Task.query.get(task_id)
                if task_obj:
                    task_obj.status = 'PROCESSING'
                    db.session.commit()
                page_obj = Page.query.get(page_id)
                if page_obj:
                    page_obj.status = 'GENERATING'
                    db.session.commit()

            with task_scope(task_id), image_resource_limiter.slot(
                f"project={project_id} page={page_id}",
                on_acquire=mark_generating,
            ):
                logger.info(f"🎨 Generating image for page {page_id}...")
                image = generate_image_until_quality_passes(
                    lambda: ai_service.generate_image(
                        prompt, ref_image_path, aspect_ratio, resolution,
                        additional_ref_images=additional_ref_images if additional_ref_images else None
                    ),
                    ai_service,
                    prompt,
                    desc_text,
                    page_data=page_data,
                    page_index=page.order_index + 1,
                    quality_control_enabled=quality_control_enabled,
                )

            if not image:
                raise ValueError("Failed to generate image")

            # Save pictures and create history records
            image_path, next_version = save_image_with_version(
                image, project_id, page_id, file_service, page_obj=page
            )

            # Mark task as completed
            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            task.set_progress({
                "total": 1,
                "completed": 1,
                "failed": 0
            })
            db.session.commit()

            logger.info(f"✅ Task {task_id} COMPLETED - Page {page_id} image generated")

        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"Task {task_id} FAILED: {error_detail}")

            # Mark task as failed
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()

            # Update page status
            page = Page.query.get(page_id)
            if page:
                page.status = 'FAILED'
                db.session.commit()


def edit_page_image_task(task_id: str, project_id: str, page_id: str,
                         edit_instruction: str, ai_service, file_service,
                         aspect_ratio: str = "16:9", resolution: str = "2K",
                         original_description: str = None,
                         additional_ref_images: List[str] = None,
                         temp_dir: str = None, app=None):
    """
    Background task for editing a page image

    Note: app instance MUST be passed from the request context
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        try:
            # Update task status to PROCESSING
            task = Task.query.get(task_id)
            if not task:
                return

            # Get page from database
            page = Page.query.get(page_id)
            if not page or page.project_id != project_id:
                raise ValueError(f"Page {page_id} not found")

            if not page.generated_image_path:
                raise ValueError("Page must have generated image first")

            # Get current image path
            current_image_path = file_service.get_absolute_path(page.generated_image_path)

            def mark_generating():
                task_obj = Task.query.get(task_id)
                if task_obj:
                    task_obj.status = 'PROCESSING'
                    db.session.commit()
                page_obj = Page.query.get(page_id)
                if page_obj:
                    page_obj.status = 'GENERATING'
                    db.session.commit()

            # Edit image
            logger.info(f"🎨 Editing image for page {page_id}...")
            try:
                with task_scope(task_id), image_resource_limiter.slot(
                    f"edit project={project_id} page={page_id}",
                    on_acquire=mark_generating,
                ):
                    image = ai_service.edit_image(
                        edit_instruction,
                        current_image_path,
                        aspect_ratio,
                        resolution,
                        original_description=original_description,
                        additional_ref_images=additional_ref_images if additional_ref_images else None
                    )
            finally:
                # Clean up temp directory if created
                if temp_dir:
                    import shutil
                    from pathlib import Path
                    temp_path = Path(temp_dir)
                    if temp_path.exists():
                        shutil.rmtree(temp_dir)

            if not image:
                raise ValueError("Failed to edit image")

            # Save edited pictures and create historical version records
            image_path, next_version = save_image_with_version(
                image, project_id, page_id, file_service, page_obj=page
            )

            # Mark task as completed
            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            task.set_progress({
                "total": 1,
                "completed": 1,
                "failed": 0
            })
            db.session.commit()

            logger.info(f"✅ Task {task_id} COMPLETED - Page {page_id} image edited")

        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"Task {task_id} FAILED: {error_detail}")

            # Clean up temp directory on error
            if temp_dir:
                import shutil
                from pathlib import Path
                temp_path = Path(temp_dir)
                if temp_path.exists():
                    shutil.rmtree(temp_dir)

            # Mark task as failed
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()

            # Update page status
            page = Page.query.get(page_id)
            if page:
                page.status = 'FAILED'
                db.session.commit()


def generate_material_image_task(task_id: str, project_id: str, prompt: str,
                                 ai_service, file_service,
                                 ref_image_path: str = None,
                                 additional_ref_images: List[str] = None,
                                 aspect_ratio: str = "16:9",
                                 resolution: str = "2K",
                                 temp_dir: str = None, app=None):
    """
    Background task for generating a material image
    Restart the core. generate_image Logical, but save to Material It’s not a table. Page Table

    Note: app instance MUST be passed from the request context
    project_id can be None for global materials (but Task model requires a project_id,
    so we use a special value 'global' for task tracking)
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        try:
            # Update task status to PENDING until a real image slot is acquired
            task = Task.query.get(task_id)
            if not task:
                return

            task.status = 'PENDING'
            db.session.commit()

            def mark_processing():
                task_obj = Task.query.get(task_id)
                if task_obj:
                    task_obj.status = 'PROCESSING'
                    db.session.commit()

            # Generate image (Reuse Core Logic)
            logger.info(f"🎨 Generating material image with prompt: {prompt[:100]}...")
            with task_scope(task_id), image_resource_limiter.slot(
                f"material-generate project={project_id} task={task_id}",
                on_acquire=mark_processing,
            ):
                image = ai_service.generate_image(
                    prompt=prompt,
                    ref_image_path=ref_image_path,
                    aspect_ratio=aspect_ratio,
                    resolution=resolution,
                    additional_ref_images=additional_ref_images or None,
                )

            if not image:
                raise ValueError("Failed to generate image")

            # Processing project_id：If it’s'global'or None，Convert to None
            actual_project_id = None if (project_id == 'global' or project_id is None) else project_id

            # Save generated material image
            relative_path = file_service.save_material_image(image, actual_project_id)
            relative = Path(relative_path)
            filename = relative.name

            # Construct frontend-accessible URL
            image_url = file_service.get_file_url(actual_project_id, 'materials', filename)

            # Save material info to database
            material = Material(
                project_id=actual_project_id,
                filename=filename,
                relative_path=relative_path,
                url=image_url
            )
            db.session.add(material)

            # Mark task as completed
            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            task.set_progress({
                "total": 1,
                "completed": 1,
                "failed": 0,
                "material_id": material.id,
                "image_url": image_url
            })
            db.session.commit()

            logger.info(f"✅ Task {task_id} COMPLETED - Material {material.id} generated")

        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"Task {task_id} FAILED: {error_detail}")

            # Mark task as failed
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()

        finally:
            if temp_dir:
                import shutil
                temp_path = Path(temp_dir)
                if temp_path.exists():
                    shutil.rmtree(temp_dir, ignore_errors=True)


def process_material_image_task(
    task_id: str,
    project_id: str,
    operation: str,
    prompt: str,
    ai_service,
    file_service,
    source_image_path: str = None,
    ref_image_path: str = None,
    additional_ref_images: List[str] = None,
    aspect_ratio: str = "16:9",
    resolution: str = "2K",
    selection: Optional[dict] = None,
    apply_mode: str = "overlay_selection",
    temp_dir: str = None,
    app=None,
):
    """Unified material processing task for generate/edit/region-edit workflows."""
    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        try:
            task = Task.query.get(task_id)
            if not task:
                return

            task.status = 'PENDING'
            db.session.commit()

            refs = list(additional_ref_images or [])
            result_image: Optional[Image.Image] = None
            source_image = None
            source_aspect_ratio = aspect_ratio

            if source_image_path:
                source_image = Image.open(source_image_path).convert('RGB')
                source_aspect_ratio = _aspect_ratio_from_size(*source_image.size)

            def mark_processing():
                task_obj = Task.query.get(task_id)
                if task_obj:
                    task_obj.status = 'PROCESSING'
                    db.session.commit()

            with task_scope(task_id), image_resource_limiter.slot(
                f"material-process operation={operation} project={project_id} task={task_id}",
                on_acquire=mark_processing,
            ):
                if operation == 'generate':
                    result_image = ai_service.generate_image(
                        prompt=prompt,
                        ref_image_path=ref_image_path,
                        aspect_ratio=aspect_ratio,
                        resolution=resolution,
                        additional_ref_images=refs if refs else None,
                    )
                elif operation == 'edit_full':
                    if not source_image_path:
                        raise ValueError("source_image_path is required for edit_full")

                    if ref_image_path:
                        refs.insert(0, ref_image_path)

                    result_image = ai_service.edit_image(
                        prompt=prompt,
                        current_image_path=source_image_path,
                        aspect_ratio=source_aspect_ratio,
                        resolution=resolution,
                        additional_ref_images=refs if refs else None,
                    )
                elif operation in {'region_edit', 'erase_region'}:
                    if not source_image or not source_image_path:
                        raise ValueError("source_image_path is required for region operations")
                    if not selection:
                        raise ValueError("selection is required for region operations")

                    bbox = _normalize_selection_bbox(selection, source_image.size)
                    marked_reference = _create_marked_reference_image(source_image, bbox)
                    if not temp_dir:
                        raise ValueError("Area Operations Requirements temp_dir")

                    marked_reference_path = str(Path(temp_dir) / f"{task_id}_marked_region.png")
                    marked_reference.save(marked_reference_path)
                    refs.insert(0, marked_reference_path)

                    if ref_image_path:
                        refs.insert(0, ref_image_path)

                    instruction = _build_region_edit_instruction(prompt, operation)
                    generated = ai_service.edit_image(
                        prompt=instruction,
                        current_image_path=source_image_path,
                        aspect_ratio=source_aspect_ratio,
                        resolution=resolution,
                        additional_ref_images=refs if refs else None,
                    )

                    if generated is None:
                        raise ValueError("Failed to process region edit")

                    if generated.size != source_image.size:
                        generated = generated.resize(source_image.size, Image.Resampling.LANCZOS)

                    if operation == 'erase_region' or apply_mode == 'overlay_selection':
                        result_image = _blend_region_into_source(source_image, generated, bbox)
                    else:
                        result_image = generated
                else:
                    raise ValueError(f"Unsupported material operation: {operation}")

            if result_image is None:
                raise ValueError("Failed to generate image")

            actual_project_id = None if (project_id == 'global' or project_id is None) else project_id
            relative_path = file_service.save_material_image(result_image, actual_project_id)
            relative = Path(relative_path)
            filename = relative.name
            image_url = file_service.get_file_url(actual_project_id, 'materials', filename)

            material = Material(
                project_id=actual_project_id,
                filename=filename,
                relative_path=relative_path,
                url=image_url
            )
            db.session.add(material)

            task.status = 'COMPLETED'
            task.completed_at = datetime.utcnow()
            task.set_progress({
                "total": 1,
                "completed": 1,
                "failed": 0,
                "operation": operation,
                "apply_mode": apply_mode if operation == 'region_edit' else None,
                "selection": selection if operation in {'region_edit', 'erase_region'} else None,
                "material_id": material.id,
                "image_url": image_url
            })
            db.session.commit()

            logger.info(f"✅ Task {task_id} COMPLETED - Material {material.id} processed via {operation}")

        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"Task {task_id} FAILED: {error_detail}")

            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                db.session.commit()

        finally:
            if source_image is not None:
                try:
                    source_image.close()
                except Exception:
                    pass
            if temp_dir:
                temp_path = Path(temp_dir)
                if temp_path.exists():
                    shutil.rmtree(temp_dir, ignore_errors=True)


def process_ppt_renovation_task(task_id: str, project_id: str, ai_service,
                                file_service, file_parser_service,
                                keep_layout: bool = False,
                                max_workers: int = 5, app=None,
                                language: str = 'ko'):
    """
    Background task for PPT renovation: parse PDF pages → extract content → fill outline + description

    Flow:
    1. Split PDF → per-page PDFs
    2. Parallel: parse each page PDF → markdown via fileparser
    3. Parallel: AI extract {title, points, description} from each markdown
    4. If keep_layout: parallel caption model describe layout → append to description
    5. Update page.outline_content + page.description_content
    6. Concatenate descriptions → project.description_text
    7. project.status = DESCRIPTIONS_GENERATED

    Args:
        task_id: Task ID
        project_id: Project ID
        ai_service: AI service instance
        file_service: FileService instance
        file_parser_service: FileParserService instance
        keep_layout: Whether to preserve original layout via caption model
        max_workers: Maximum parallel workers
        app: Flask app instance
        language: Output language
    """
    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        try:
            task = Task.query.get(task_id)
            if not task:
                logger.error(f"Task {task_id} not found")
                return

            task.status = 'PROCESSING'
            db.session.commit()

            from models import Project
            project = Project.query.get(project_id)
            if not project:
                raise ValueError(f"Project {project_id} not found")

            # Get the PDF path from project
            pdf_path = None
            project_dir = Path(app.config['UPLOAD_FOLDER']) / project_id
            # Look for the uploaded PDF file
            for f in (project_dir / "template").iterdir() if (project_dir / "template").exists() else []:
                if f.suffix.lower() == '.pdf':
                    pdf_path = str(f)
                    break

            if not pdf_path:
                raise ValueError("No PDF file found for renovation project")

            # Step 1: Split PDF into per-page PDFs
            split_dir = str(project_dir / "split_pages")
            page_pdfs = split_pdf_to_pages(pdf_path, split_dir)
            logger.info(f"Split PDF into {len(page_pdfs)} pages")

            # Get existing pages
            pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()

            # Ensure page count matches
            if len(pages) != len(page_pdfs):
                logger.warning(f"Page count mismatch: {len(pages)} pages vs {len(page_pdfs)} PDFs. Using min.")
            page_count = min(len(pages), len(page_pdfs))
            if page_count == 0:
                raise ValueError("No pages to process")

            task.set_progress({
                "total": page_count,
                "completed": 0,
                "failed": 0,
                "current_step": "parsing"
            })
            db.session.commit()

            # Process each page as an independent pipeline:
            # parse markdown → AI extract content → (optional layout caption) → write to DB
            logger.info("Processing pages (parse → extract → save pipeline)...")
            import threading
            progress_lock = threading.Lock()
            completed = 0
            failed = 0
            extraction_errors = []
            content_results = {}  # index -> {title, points, description}

            def process_single_page(idx, page_pdf_path):
                nonlocal completed, failed
                with app.app_context():
                    try:
                        # Step A: Parse page PDF → markdown
                        filename = os.path.basename(page_pdf_path)
                        _batch_id, md_text, extract_id, error_msg, _failed = file_parser_service.parse_file(page_pdf_path, filename)
                        if error_msg:
                            # Do not silently turn a parser failure into a blank, successful page.
                            # In particular, this preserves MinerU credential failures for the UI.
                            raise ValueError(f"MinerU parsing failed: {error_msg}")
                        md_text = md_text or ''

                        # Supplement with header/footer from layout.json
                        if extract_id:
                            hf_text = file_parser_service.extract_header_footer_from_layout(extract_id)
                            if hf_text:
                                md_text = hf_text + '\n\n' + md_text

                        if not md_text.strip():
                            content = {'title': f'Page {idx + 1}', 'points': [], 'description': ''}
                            error = 'empty_input'
                        else:
                            # Step B: AI extract structured content
                            with task_scope(task_id), text_resource_limiter.slot(
                                f"renovation-extract project={project_id} page-index={idx}"
                            ):
                                content = ai_service.extract_page_content(md_text, language=language)
                            error = None

                        # Step C: Optional layout caption
                        if keep_layout and not error:
                            try:
                                page_obj = pages[idx] if idx < len(pages) else None
                                if page_obj:
                                    image_path = None
                                    if page_obj.cached_image_path:
                                        image_path = file_service.get_absolute_path(page_obj.cached_image_path)
                                    elif page_obj.generated_image_path:
                                        image_path = file_service.get_absolute_path(page_obj.generated_image_path)
                                    if image_path and Path(image_path).exists():
                                        with task_scope(task_id), text_resource_limiter.slot(
                                            f"layout-caption project={project_id} page-index={idx}"
                                        ):
                                            caption = ai_service.generate_layout_caption(image_path)
                                        if caption:
                                            content['description'] += f"\n\n{caption}"
                            except Exception as e:
                                logger.error(f"Layout caption failed for page {idx}: {e}")

                        # Step D: Write to DB immediately
                        content_results[idx] = content
                        page_obj = Page.query.get(pages[idx].id)
                        if page_obj:
                            title = content.get('title', f'Page {idx + 1}')
                            points = content.get('points', [])
                            description = content.get('description', '')

                            page_obj.set_outline_content({
                                'title': title,
                                'points': points
                            })
                            page_obj.set_description_content({
                                "text": description,
                                "generated_at": datetime.utcnow().isoformat()
                            })
                            page_obj.status = 'DESCRIPTION_GENERATED'
                            db.session.commit()

                        with progress_lock:
                            if error and error != 'empty_input':
                                failed += 1
                                extraction_errors.append(error)
                            else:
                                completed += 1
                            task_obj = Task.query.get(task_id)
                            if task_obj:
                                task_obj.update_progress(completed=completed, failed=failed)
                                db.session.commit()

                        logger.info(f"Page {idx} pipeline done (completed={completed}, failed={failed})")

                    except Exception as e:
                        logger.error(f"Pipeline failed for page {idx}: {e}")
                        with progress_lock:
                            failed += 1
                            extraction_errors.append(str(e))
                            task_obj = Task.query.get(task_id)
                            if task_obj:
                                task_obj.update_progress(completed=completed, failed=failed)
                                db.session.commit()

            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = [
                    executor.submit(process_single_page, i, page_pdfs[i])
                    for i in range(page_count)
                ]
                for future in as_completed(futures):
                    future.result()  # propagate any unexpected exceptions

            logger.info(f"All pages processed: {completed} completed, {failed} failed")

            # Fail-fast: any extraction failure aborts the entire task
            if failed > 0:
                reason = extraction_errors[0] if extraction_errors else "empty page content"
                raise ValueError(f"{failed}/{page_count} Page extraction failed: {reason}")

            # Update project-level aggregated text
            project = Project.query.get(project_id)
            if project:
                all_outlines = []
                all_descriptions = []
                for i in range(page_count):
                    content = content_results.get(i, {})
                    title = content.get('title', '')
                    points = content.get('points', [])
                    description = content.get('description', '')
                    header = f"Page{i + 1}Page：{title}"
                    if points:
                        all_outlines.append(f"{header}\n" + "\n".join(f"- {p}" for p in points))
                    else:
                        all_outlines.append(header)
                    all_descriptions.append(f"--- Page{i + 1}Page ---\n{description}")
                project.outline_text = "\n\n".join(all_outlines)
                project.description_text = "\n\n".join(all_descriptions)
                project.status = 'DESCRIPTIONS_GENERATED'
                project.updated_at = datetime.utcnow()

            db.session.commit()

            # Mark task as completed
            task = Task.query.get(task_id)
            if task:
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                task.set_progress({
                    "total": page_count,
                    "completed": completed,
                    "failed": failed,
                    "current_step": "done"
                })
                db.session.commit()

            logger.info(f"Task {task_id} COMPLETED - PPT renovation processed {page_count} pages")

        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"Task {task_id} FAILED: {error_detail}")

            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()

            # Reset project status so user can retry
            project = Project.query.get(project_id)
            if project:
                project.status = 'DRAFT'

            db.session.commit()


def export_editable_pptx_with_recursive_analysis_task(
    task_id: str,
    project_id: str,
    filename: str,
    file_service,
    page_ids: list = None,
    max_depth: int = 2,
    max_workers: int = 4,
    export_extractor_method: str = 'hybrid',
    export_inpaint_method: str = 'hybrid',
    enable_icon_subject_extraction: bool = True,
    app=None
):
    """
    Editable with recursive images PPTX Backstage Tasks

    It’s a new architecture approach. ImageEditabilityService Perform recursive face analysis。
    Distinction from old methods：
    - Let’s not assume that the picture is 16:9
    - Supports any size and resolution
    - Recursively analyze the subgraphs and charts in the picture
    - Smarter coordinate map and element extraction
    - I don’t need it. ai_service（Usage ImageEditabilityService and MinerU）

    Args:
        task_id: Tasks ID
        project_id: Item ID
        filename: Output filename
        file_service: Examples of documentation services
        page_ids: Optional Pages ID List (if available, only these pages are exported)）
        max_depth: Maximum Recursive Depth
        max_workers: Combination Number
        export_extractor_method: Component extraction method ('mineru' or 'hybrid')
        export_inpaint_method: Background repair method ('generative', 'baidu', 'hybrid')
        app: Flask Apply Examples
    """
    logger.info(f"🚀 Task {task_id} started: export_editable_pptx_with_recursive_analysis (project={project_id}, depth={max_depth}, workers={max_workers}, extractor={export_extractor_method}, inpaint={export_inpaint_method}, icon_subject_extraction={enable_icon_subject_extraction})")

    if app is None:
        raise ValueError("Flask app instance must be provided")

    with app.app_context():
        import os
        from datetime import datetime
        from PIL import Image
        from models import Project
        from services.export_service import ExportService, ExportError
        from services.task_watchdog import touch_task

        logger.info(f"Start recursive analysis export task {task_id} for project {project_id}")

        current_stage = "Ready."

        def persist_export_failure(failure: ExportError):
            """Persist a terminal backend failure without discarding the last real progress."""
            failed_task = Task.query.get(task_id)
            if not failed_task:
                return

            previous_progress = failed_task.get_progress()
            previous_messages = previous_progress.get('messages') or []
            display_stage = {
                'style_extraction': 'Style Ripping',
                'export': 'Export',
            }.get(failure.stage, failure.stage)
            failed_task.status = 'FAILED'
            failed_task.error_message = failure.message
            failed_task.completed_at = datetime.utcnow()
            failed_task.set_progress({
                **previous_progress,
                "total": previous_progress.get('total', 100),
                "completed": previous_progress.get('completed', previous_progress.get('percent', 0)),
                "failed": 1,
                "current_step": f"{display_stage}Failed",
                "percent": previous_progress.get('percent', 0),
                "messages": [*previous_messages, f"[{display_stage}] {failure.message}"][-10:],
                "backend_status": "FAILED",
                "error_code": failure.error_code,
                "error_type": failure.error_type,
                "error_stage": failure.stage,
                "error_details": failure.details,
                "help_text": failure.help_text,
            })
            db.session.commit()

        try:
            # Get project
            project = Project.query.get(project_id)
            if not project:
                raise ValueError(f'Project {project_id} not found')

            # Read export settings for items： whether to allow return of semi-finished products
            export_allow_partial = project.export_allow_partial or False
            fail_fast = not export_allow_partial
            logger.info(f"Export Settings: export_allow_partial={export_allow_partial}, fail_fast={fail_fast}")

            # IMPORTANT: Expire cached objects to ensure fresh data from database
            # This prevents reading stale generated_image_path after page regeneration
            db.session.expire_all()

            # Get pages (filtered by page_ids if provided)
            pages = get_filtered_pages(project_id, page_ids)
            if not pages:
                raise ValueError('No pages found for project')

            image_paths = []
            for page in pages:
                if page.generated_image_path:
                    img_path = file_service.get_absolute_path(page.generated_image_path)
                    if os.path.exists(img_path):
                        image_paths.append(img_path)

            if not image_paths:
                raise ValueError('No generated images found for project')

            logger.info(f"Found it. {len(image_paths)} Picture")

            # Initialise task progress (includes message log)）
            task = Task.query.get(task_id)
            task.set_progress({
                "total": 100,  # Percentage used
                "completed": 0,
                "failed": 0,
                "current_step": "Ready....",
                "percent": 0,
                "messages": ["Start exporting editable PPTX..."],  # Message Log
            })
            db.session.commit()

            # Progress Retrieval Function - Update progress in database
            progress_messages = ["Start exporting editable PPTX..."]
            max_messages = 10  # Keep the latest at most 10 Message

            def progress_callback(step: str, message: str, percent: int):
                """Update task progress to database"""
                nonlocal progress_messages, current_stage
                try:
                    current_stage = step
                    # Heart beats： update memory watch dogs and write down databases，
                    # This way, once restarted, we can see if the mission is really running. services/task_watchdog.py）
                    touch_task(task_id, step)
                    # Add New Message to Log
                    new_message = f"[{step}] {message}"
                    progress_messages.append(new_message)
                    # Just keep the latest information.
                    if len(progress_messages) > max_messages:
                        progress_messages = progress_messages[-max_messages:]

                    # Update database
                    task = Task.query.get(task_id)
                    if task:
                        task.set_progress({
                            "total": 100,
                            "completed": percent,
                            "failed": 0,
                            "current_step": message,
                            "percent": percent,
                            "messages": progress_messages.copy(),
                        })
                        db.session.commit()
                except Exception as e:
                    logger.warning(f"Update progress failed: {e}")

            def heartbeat_callback(step: str):
                """Update memory heartbeat only (no library) for elemental fine particle degree progress。"""
                touch_task(task_id, step)

            # Step 1: Preparations
            logger.info("Step 1: Preparations...")
            progress_callback("Ready.", f"Found it. {len(image_paths)} A slide picture", 2)

            # Prepare output path
            exports_dir = os.path.join(app.config['UPLOAD_FOLDER'], project_id, 'exports')
            os.makedirs(exports_dir, exist_ok=True)

            # Handle filename collision
            if not filename.endswith('.pptx'):
                filename += '.pptx'

            output_path = os.path.join(exports_dir, filename)
            if os.path.exists(output_path):
                base_name = filename.rsplit('.', 1)[0]
                timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
                filename = f"{base_name}_{timestamp}.pptx"
                output_path = os.path.join(exports_dir, filename)
                logger.info(f"Filename conflicts, use new filenames: {filename}")

            # Get the size of the first picture for reference
            first_img = Image.open(image_paths[0])
            slide_width, slide_height = first_img.size
            first_img.close()

            logger.info(f"Slide Size: {slide_width}x{slide_height}")
            logger.info(f"Recursive Depth: {max_depth}, Parallel Numbers: {max_workers}")
            progress_callback("Ready.", f"Slide Size: {slide_width}×{slide_height}", 3)

            # Step 2: Create Text Properties Ripper
            from services.image_editability import TextAttributeExtractorFactory
            text_attribute_extractor = TextAttributeExtractorFactory.create_caption_model_extractor()
            progress_callback("Ready.", "Text Properties Ripper Initialized", 5)

            # Step 3: Call export method (using project export settings)）
            logger.info(f"Step 3: Create Editable PPTX (extractor={export_extractor_method}, inpaint={export_inpaint_method}, fail_fast={fail_fast})...")
            progress_callback("Configuration", f"Ripping method: {export_extractor_method}, Background fixes: {export_inpaint_method}", 6)

            _, export_warnings = ExportService.create_editable_pptx_with_recursive_analysis(
                image_paths=image_paths,
                output_file=output_path,
                slide_width_pixels=slide_width,
                slide_height_pixels=slide_height,
                max_depth=max_depth,
                max_workers=max_workers,
                text_attribute_extractor=text_attribute_extractor,
                progress_callback=progress_callback,
                heartbeat_callback=heartbeat_callback,
                export_extractor_method=export_extractor_method,
                export_inpaint_method=export_inpaint_method,
                enable_icon_subject_extraction=enable_icon_subject_extraction,
                fail_fast=fail_fast
            )

            logger.info(f"✓ Editable PPTX Created: {output_path}")

            # Step 4: Tag Task Completed
            download_path = f"/files/{project_id}/exports/{filename}"

            # Can not open message
            progress_messages.append("Export complete.！")

            # Add warning message (if any)）
            warning_messages = []
            if export_warnings and export_warnings.has_warnings():
                warning_messages = export_warnings.to_summary()
                progress_messages.extend(warning_messages)
                logger.warning(f"Export has {len(warning_messages)} A warning.")

            task = Task.query.get(task_id)
            if task:
                # Note： If the task is judged to be a failure by the Watchdog,，Task.status Validator
                # I’ll keep it. FAILED Final, but the following product information will be written in progress.。
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                touch_task(task_id, "Completed")
                task.set_progress({
                    "total": 100,
                    "completed": 100,
                    "failed": 0,
                    "current_step": "Export complete.",
                    "percent": 100,
                    "messages": progress_messages,
                    "download_url": download_path,
                    "filename": filename,
                    "method": "recursive_analysis",
                    "max_depth": max_depth,
                    "warnings": warning_messages,  # Single Warning List
                    "warning_details": export_warnings.to_dict() if export_warnings else {}  # Detailed Warning Information
                })
                db.session.commit()
                if task.status == 'COMPLETED':
                    logger.info(f"✓ Tasks {task_id} Completed - Recursively exported successfully (Depth)={max_depth}）")
                else:
                    logger.warning(
                        f"Tasks {task_id} After the guard dog failed, he finished the export. Hold. FAILED Final，"
                        f"Products: {filename}"
                    )

        except ExportError as e:
            # Export error（fail_fast Detailed error in mode）
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"✗ Tasks {task_id} Export failed: {e.message}")
            logger.error(f"Error Type: {e.error_type}, Details: {e.details}")

            persist_export_failure(e)

        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            logger.error(f"✗ Tasks {task_id} Failed: {error_detail}")

            persist_export_failure(
                ExportService._build_unexpected_export_error(str(e), current_stage)
            )


def export_video_task(task_id, project_id, filename, file_service, voice='alloy', speed=1.0,
                      page_ids=None, generate_narration=True, language='ko', app=None):
    """Use saved scripts verbatim; generate only missing scripts; release admission on every exit."""
    from services.tts_video_service import generate_narration_video, VIDEO_SLOT
    from utils.user_messages import localize_error
    try:
        with app.app_context():
            task = db.session.get(Task, task_id)
            if not task:
                return
            try:
                task.status = 'PROCESSING'
                db.session.commit()
                pages = get_filtered_pages(project_id, page_ids)
                if not pages:
                    raise ValueError('내보낼 슬라이드가 없습니다.')
                def progress(step, message, percent):
                    task.set_progress({'total': 100, 'completed': percent, 'percent': percent,
                                       'failed': 0, 'current_step': message})
                    db.session.commit()
                data = []
                for index, page in enumerate(pages):
                    image = file_service.get_absolute_path(page.generated_image_path) if page.generated_image_path else None
                    if not image or not Path(image).is_file():
                        raise ValueError(f'{index+1}번 슬라이드 이미지를 먼저 생성하세요.')
                    if not (page.narration_text or '').strip():
                        if not generate_narration:
                            raise ValueError(f'{index+1}번 발표 스크립트를 입력하세요.')
                        from services.ai_service_manager import get_ai_service
                        from services.prompts import get_narration_generation_prompt, parse_narration_generation_result
                        progress('script', f'{index+1}번 발표 스크립트를 생성하고 있습니다.', 1)
                        content = page.get_description_content() or {}
                        outline = page.get_outline_content() or {}
                        prompt = get_narration_generation_prompt([{'page_index': 1, 'title': outline.get('title', ''),
                            'points': outline.get('points', []), 'description_text': content.get('text', '')}], language=language)
                        generated = parse_narration_generation_result(get_ai_service().text_provider.generate_text(prompt)).get(1, '')
                        db.session.refresh(page)
                        # A user edit made during generation wins over the generated draft.
                        if not (page.narration_text or '').strip():
                            page.set_narration_text(generated)
                            db.session.commit()
                    if not (page.narration_text or '').strip():
                        raise ValueError(f'{index+1}번 발표 스크립트를 생성하지 못했습니다.')
                    data.append({'image_path': image, 'narration_text': page.narration_text})
                folder = Path(app.config['UPLOAD_FOLDER']) / project_id / 'exports'
                folder.mkdir(parents=True, exist_ok=True)
                # Every export has its own name, including concurrent requests/retries.
                filename = f'{Path(filename).stem}_{task_id}.mp4'
                generate_narration_video(data, str(folder / filename), voice=voice, speed=speed,
                                         ffmpeg_path=app.config.get('FFMPEG_PATH', 'ffmpeg'),
                                         progress_callback=progress)
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                task.set_progress({'total': 100, 'completed': 100, 'percent': 100, 'failed': 0,
                                   'current_step': '발표 동영상을 만들었습니다.', 'filename': filename,
                                   'download_url': f'/files/{project_id}/exports/{filename}'})
                db.session.commit()
            except Exception as error:
                db.session.rollback()
                logger.exception('Azure presentation video export failed')
                task = db.session.get(Task, task_id)
                if task:
                    task.status = 'FAILED'
                    task.error_message = localize_error(str(error))
                    task.completed_at = datetime.utcnow()
                    db.session.commit()
    finally:
        VIDEO_SLOT.release()


# ============================================================================
# Per-page template tasks
# ============================================================================


def _set_task_processing(task_id: str) -> None:
    task = Task.query.get(task_id)
    if task and task.status == 'PENDING':
        task.status = 'PROCESSING'
        db.session.commit()


def process_template_pdf_split_task(task_id: str, project_id: str,
                                    pdf_relpath: str, file_service, app):
    """SPLIT_TEMPLATE_PDF — render each page as PNG, import into asset library.

    Each successful page becomes a `ProjectTemplateAsset(source='pdf_split')`
    and triggers its own `analyze_template_task`. Per-page failures are kept
    in `progress.failed` but do not abort the whole task.
    """
    if app is None:
        raise ValueError('Flask app instance must be provided')

    from services.pdf_image_service import pdf_to_page_images
    from services.ai_service import AIService

    with app.app_context():
        task = Task.query.get(task_id)
        if not task:
            return

        try:
            _set_task_processing(task_id)

            pdf_abs = file_service.get_absolute_path(pdf_relpath)
            output_dir = file_service.get_template_pdf_temp_dir(project_id, task_id)

            try:
                renders = pdf_to_page_images(pdf_abs, str(output_dir))
            except ValueError as exc:
                # E.g. > max_pages — fail the whole task
                task = Task.query.get(task_id)
                if task:
                    task.status = 'FAILED'
                    task.error_message = str(exc)
                    task.completed_at = datetime.utcnow()
                    db.session.commit()
                return

            total = len(renders)
            completed = 0
            failed = 0
            created_asset_ids = []

            # Determine starting sort_order so PDF-imported assets append cleanly
            base_sort = (
                db.session.query(func.coalesce(func.max(ProjectTemplateAsset.sort_order), -1))
                .filter(ProjectTemplateAsset.project_id == project_id)
                .scalar()
            ) + 1

            ai_service = AIService()

            task = Task.query.get(task_id)
            if task:
                task.set_progress({
                    'total': total,
                    'completed': 0,
                    'failed': 0,
                    'created_asset_ids': [],
                })
                db.session.commit()

            for render in renders:
                page_index = render['index']
                src_path = render.get('path')
                if not src_path:
                    failed += 1
                    task = Task.query.get(task_id)
                    if task:
                        task.update_progress(completed=completed, failed=failed)
                        db.session.commit()
                    continue

                asset_id = str(uuid.uuid4())
                try:
                    image_path, thumb_path = file_service.save_template_asset_from_path(
                        src_path, project_id, asset_id
                    )
                    asset = ProjectTemplateAsset(
                        id=asset_id,
                        project_id=project_id,
                        image_path=image_path,
                        thumb_path=thumb_path,
                        source='pdf_split',
                        source_pdf_id=task_id,
                        source_page_index=page_index,
                        analysis_status='pending',
                        sort_order=base_sort + page_index - 1,
                    )
                    db.session.add(asset)
                    db.session.commit()
                    created_asset_ids.append(asset_id)
                    completed += 1
                except Exception as exc:
                    logger.warning('Failed to import PDF page %s as asset: %s',
                                   page_index, exc)
                    db.session.rollback()
                    failed += 1
                    task = Task.query.get(task_id)
                    if task:
                        task.update_progress(completed=completed, failed=failed)
                        db.session.commit()
                    continue

                task = Task.query.get(task_id)
                if task:
                    progress = task.get_progress()
                    progress.update({
                        'total': total,
                        'completed': completed,
                        'failed': failed,
                        'created_asset_ids': list(created_asset_ids),
                    })
                    task.set_progress(progress)
                    db.session.commit()

                # Fire per-asset analyze task. Failure here is non-fatal.
                try:
                    sub_task = Task(
                        project_id=project_id,
                        task_type='ANALYZE_TEMPLATE',
                        status='PENDING',
                    )
                    sub_task.set_progress({'asset_id': asset_id, 'stage': 'queued'})
                    db.session.add(sub_task)
                    db.session.commit()
                except Exception as exc:
                    logger.warning('Failed to enqueue analyze for asset %s: %s',
                                   asset_id, exc)
                    # Roll back so a failed commit doesn't poison the session and
                    # break the remaining iterations of this loop.
                    db.session.rollback()
                    continue

                try:
                    task_manager.submit_task(
                        sub_task.id,
                        analyze_template_task,
                        project_id,
                        asset_id,
                        ai_service,
                        file_service,
                        app,
                    )
                except Exception as exc:
                    # The PENDING row is already committed; if submission fails
                    # mark it FAILED so it can't hang as "analyzing" forever.
                    logger.warning('Failed to submit analyze task for asset %s: %s',
                                   asset_id, exc)
                    try:
                        sub_task.status = 'FAILED'
                        sub_task.error_message = f'Task submission failed: {exc}'
                        db.session.commit()
                    except Exception as commit_exc:
                        logger.error(
                            'Failed to commit FAILED status for sub_task %s: %s',
                            sub_task.id,
                            commit_exc,
                        )
                        db.session.rollback()

            task = Task.query.get(task_id)
            if task:
                task.status = 'COMPLETED' if failed < total else 'FAILED'
                task.completed_at = datetime.utcnow()
                task.set_progress({
                    'total': total,
                    'completed': completed,
                    'failed': failed,
                    'created_asset_ids': created_asset_ids,
                })
                if failed >= total:
                    task.error_message = 'All PDF pages failed to render'
                db.session.commit()

        except Exception as exc:
            db.session.rollback()
            import traceback
            logger.error('SPLIT_TEMPLATE_PDF task %s crashed: %s',
                         task_id, traceback.format_exc())
            task = Task.query.get(task_id)
            if task:
                task.status = 'FAILED'
                task.error_message = str(exc)
                task.completed_at = datetime.utcnow()
                db.session.commit()
        finally:
            # Always remove the PDF scratch dir, even if rendering crashed.
            file_service.cleanup_template_pdf_temp(project_id, task_id)


def analyze_template_task(task_id: str, project_id: str, asset_id: str,
                          ai_service, file_service, app):
    """ANALYZE_TEMPLATE — call ai_service.analyze_template, persist 9-field
    schema (PRD §5.3). Decision 2: AI-declared not_a_slide → analysis_status
    = 'failed', asset stays manual-only.
    """
    if app is None:
        raise ValueError('Flask app instance must be provided')
    with app.app_context():
        task = Task.query.get(task_id)
        if not task:
            return
        with task_scope(task_id), text_resource_limiter.slot(label=f'analyze_template:{asset_id}'):
            try:
                _set_task_processing(task_id)
                task.set_progress({'asset_id': asset_id, 'stage': 'calling_ai'})
                db.session.commit()

                asset = ProjectTemplateAsset.query.get(asset_id)
                if not asset:
                    raise ValueError(f'Asset {asset_id} no longer exists')

                asset.analysis_status = 'processing'
                _commit_with_retry()

                image_abs_path = file_service.get_absolute_path(asset.image_path)
                language = (app.config.get('OUTPUT_LANGUAGE') or 'zh').lower()

                result = ai_service.analyze_template(image_abs_path, language=language)

                asset = ProjectTemplateAsset.query.get(asset_id)
                if isinstance(result, dict) and result.get('error') == 'not_a_slide':
                    asset.analysis_status = 'failed'
                    asset.analysis_error = 'not_a_slide'
                    asset.analysis_json = None
                    asset.analysis_notes = None
                else:
                    asset.set_analysis(result)
                    asset.analysis_notes = (result or {}).get('notes')
                    asset.analysis_status = 'completed'
                    asset.analysis_error = None
                _commit_with_retry()

                task = Task.query.get(task_id)
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                task.set_progress({'asset_id': asset_id, 'stage': 'done',
                                   'analysis_status': asset.analysis_status})
                _commit_with_retry()
            except Exception as exc:
                # Clear any poisoned session state from a failed commit so the
                # FAILED-status writes below can actually go through.
                db.session.rollback()
                import traceback
                logger.error('ANALYZE_TEMPLATE task %s crashed: %s',
                             task_id, traceback.format_exc())
                asset = ProjectTemplateAsset.query.get(asset_id)
                if asset:
                    asset.analysis_status = 'failed'
                    asset.analysis_error = str(exc)[:500]
                    db.session.commit()
                task = Task.query.get(task_id)
                if task:
                    task.status = 'FAILED'
                    task.error_message = str(exc)[:500]
                    task.completed_at = datetime.utcnow()
                    task.set_progress({'asset_id': asset_id, 'stage': 'failed'})
                    db.session.commit()


def auto_match_templates_task(task_id: str, project_id: str,
                              page_id: Optional[str],
                              overwrite_existing: bool,
                              preserve_non_empty: bool,
                              ai_service, app):
    """AUTO_MATCH_TEMPLATES — calls ai_service.auto_match_templates and
    writes per-page template_asset_id / style_text / match metadata.

    Decision 5: batching is inside ai_service. Decision 7: writes are
    bulk-by-page, no project-level fields touched. PRD §8.4: undecided
    rows null out template_asset_id when overwrite_existing=True.
    """
    if app is None:
        raise ValueError('Flask app instance must be provided')
    with app.app_context():
        task = Task.query.get(task_id)
        if not task:
            return
        with task_scope(task_id), text_resource_limiter.slot(label=f'auto_match:{project_id}'):
            try:
                _set_task_processing(task_id)
                language = (app.config.get('OUTPUT_LANGUAGE') or 'zh').lower()

                if page_id:
                    page = Page.query.filter_by(
                        id=page_id, project_id=project_id).first()
                    if not page:
                        raise ValueError(f'Page {page_id} not in project {project_id}')
                    desc = page.get_description_content()
                    if not desc:
                        raise ValueError('MISSING_DESCRIPTION')
                    templates = [t for t in ProjectTemplateAsset.query.filter_by(
                        project_id=project_id, analysis_status='completed').order_by(
                        ProjectTemplateAsset.sort_order.asc()).all()]
                    if not templates:
                        raise ValueError('NO_ANALYZED_TEMPLATES')
                    pages_payload = [ai_service._trim_page_for_match(page, desc)]
                    templates_payload = [ai_service._trim_template_for_match(t)
                                         for t in templates]
                    from .prompts import get_template_auto_match_prompt
                    prompt = get_template_auto_match_prompt(
                        templates=templates_payload, pages=pages_payload,
                        language=language)
                    results = ai_service.generate_json(prompt)
                    if isinstance(results, dict):
                        results = [results]
                    if not isinstance(results, list):
                        raise ValueError('auto_match: Expected return list')
                else:
                    results = ai_service.auto_match_templates(
                        project_id=project_id, language=language,
                        overwrite_existing=overwrite_existing,
                        preserve_non_empty=preserve_non_empty)

                matched = 0
                undecided = 0
                # Only completed templates were offered to the model, so only
                # they are valid auto-match targets.
                valid_template_ids = {t.id for t in
                                       ProjectTemplateAsset.query.filter_by(
                                           project_id=project_id,
                                           analysis_status='completed').all()}

                # Pre-load all project pages once to avoid an N+1 query per row.
                pages_by_id = {
                    p.id: p for p in
                    Page.query.filter_by(project_id=project_id).all()
                }
                for row in results:
                    if not isinstance(row, dict):
                        continue
                    pid = row.get('page_id')
                    if not pid:
                        continue
                    page = pages_by_id.get(pid)
                    if not page:
                        continue
                    if preserve_non_empty and page.template_asset_id:
                        continue

                    status = row.get('status', 'undecided')
                    chosen = row.get('template_asset_id')
                    if chosen and chosen not in valid_template_ids:
                        chosen = None
                        status = 'undecided'

                    if status == 'matched' and chosen:
                        page.template_asset_id = chosen
                        page.template_selection_source = 'auto'
                        page.template_match_reason = (row.get('reason') or '')[:500]
                        try:
                            page.template_match_confidence = float(
                                row.get('confidence') or 0.0)
                        except (TypeError, ValueError):
                            page.template_match_confidence = None
                        matched += 1
                    else:
                        if overwrite_existing:
                            page.template_asset_id = None
                            page.template_selection_source = None
                            page.template_match_reason = (row.get('reason') or '')[:500]
                            page.template_match_confidence = None
                        undecided += 1

                _commit_with_retry()

                task = Task.query.get(task_id)
                task.status = 'COMPLETED'
                task.completed_at = datetime.utcnow()
                task.set_progress({
                    'total_pages': len(results),
                    'matched': matched,
                    'undecided': undecided,
                    'scope': 'page' if page_id else 'project',
                })
                _commit_with_retry()
            except Exception as exc:
                db.session.rollback()
                import traceback
                logger.error('AUTO_MATCH_TEMPLATES task %s crashed: %s',
                             task_id, traceback.format_exc())
                task = Task.query.get(task_id)
                if task:
                    task.status = 'FAILED'
                    task.error_message = str(exc)[:500]
                    task.completed_at = datetime.utcnow()
                    db.session.commit()
