#!/usr/bin/env python3
"""
Editable PPTX Export Script

This script is used to generate editable images from a given picture PPTX Documentation。
Support single or multiple photo batch processing。

Usage method:
    # Handle single pictures
    python scripts/export_editable_pptx.py path/to/image.png

    # Handle multiple pictures
    python scripts/export_editable_pptx.py img1.png img2.png img3.png

    # Process all pictures in the directory
    python scripts/export_editable_pptx.py path/to/images/

    # Specify output file
    python scripts/export_editable_pptx.py image.png -o output.pptx

    # Use different extraction methods
    python scripts/export_editable_pptx.py image.png --extractor mineru
    python scripts/export_editable_pptx.py image.png --extractor hybrid

    # Using different techniques of context repair
    python scripts/export_editable_pptx.py image.png --inpaint baidu
    python scripts/export_editable_pptx.py image.png --inpaint generative
    python scripts/export_editable_pptx.py image.png --inpaint hybrid

Environmental requirements:
    Requires Configuration .env File, containing the following variables：
    - MINERU_TOKEN: MinerU API token
    - BAIDU_API_KEY, BAIDU_SECRET_KEY: 100 degrees API Key (used for baidu/hybrid Methodology）
    - GEMINI_API_KEY or OPENAI_API_KEY: For generative/hybrid Methodology

Cost hint:
    - 'generative' and 'hybrid' The background fixer will call on the texture model. API，Additional costs incurred
    - 'baidu' Method for repairing images using 100 degrees API，Lower cost
    - 'mineru' and 'hybrid' The extraction method is used. MinerU API
"""

import os
import sys
import argparse
import logging
from pathlib import Path
from typing import List, Optional

# Add root directory to Python Path
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
BACKEND_DIR = PROJECT_ROOT / 'backend'
sys.path.insert(0, str(BACKEND_DIR))

# Set Log
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def setup_flask_app():
    """Initialize Flask Apply context (for loading configuration)）"""
    from dotenv import load_dotenv

    # Load .env Documentation
    env_path = PROJECT_ROOT / '.env'
    if env_path.exists():
        load_dotenv(env_path)
        logger.info(f"Loaded Environmental Variables: {env_path}")

    # Create Flask Apply
    from app import create_app
    app = create_app()
    return app


def collect_image_paths(paths: List[str]) -> List[str]:
    """Collect all photo paths to process"""
    image_extensions = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}
    result = []

    for path_str in paths:
        path = Path(path_str)

        if path.is_file():
            if path.suffix.lower() in image_extensions:
                result.append(str(path.resolve()))
            else:
                logger.warning(f"Skip non-photo files: {path}")
        elif path.is_dir():
            for file in sorted(path.iterdir()):
                if file.suffix.lower() in image_extensions:
                    result.append(str(file.resolve()))
        else:
            logger.warning(f"Path does not exist: {path}")

    return result


def create_service_config(
    extractor_method: str = 'hybrid',
    inpaint_method: str = 'hybrid'
):
    """
    Create Service Configuration

    Args:
        extractor_method: Ripping method ('mineru' or 'hybrid')
        inpaint_method: Background repair method ('generative', 'baidu', 'hybrid')
    """
    from services.image_editability import ServiceConfig

    # Select Configuration Based on Method
    use_hybrid_extractor = (extractor_method == 'hybrid')
    use_hybrid_inpaint = (inpaint_method == 'hybrid')

    logger.info(f"Configuration: Ripping method={extractor_method}, Background fixes={inpaint_method}")

    config = ServiceConfig.from_defaults(
        use_hybrid_extractor=use_hybrid_extractor,
        use_hybrid_inpaint=use_hybrid_inpaint,
        max_depth=1  # Recursive Depth
    )

    # If you’re not, hybrid It’s... inpaint Method, manual configuration required
    if inpaint_method != 'hybrid':
        from services.image_editability import (
            InpaintProviderFactory,
            InpaintProviderRegistry
        )

        inpaint_registry = InpaintProviderRegistry()

        if inpaint_method == 'generative':
            provider = InpaintProviderFactory.create_generative_edit_provider()
            inpaint_registry.register_default(provider)
            logger.info("Use of generating restoration methods (to call on the comical model) API）")
        elif inpaint_method == 'baidu':
            provider = InpaintProviderFactory.create_baidu_inpaint_provider()
            if provider:
                inpaint_registry.register_default(provider)
                logger.info("Use 100 Degree Image Restoration Method")
            else:
                logger.warning("100 degrees of repair not available, back to the method of generation")
                provider = InpaintProviderFactory.create_generative_edit_provider()
                inpaint_registry.register_default(provider)

        config.inpaint_registry = inpaint_registry

    return config


def export_editable_pptx(
    image_paths: List[str],
    output_file: str,
    extractor_method: str = 'hybrid',
    inpaint_method: str = 'hybrid',
    extract_text_styles: bool = True
):
    """
    Export Editable PPTX

    Args:
        image_paths: Picture Path List
        output_file: Output file path
        extractor_method: Ripping method
        inpaint_method: Background repair method
        extract_text_styles: Whether to extract text styles (colour, bold, etc.)）
    """
    from services.image_editability import ImageEditabilityService
    from services.export_service import ExportService
    from concurrent.futures import ThreadPoolExecutor, as_completed

    logger.info(f"Start processing. {len(image_paths)} Picture...")

    # Create Configuration and Service
    config = create_service_config(extractor_method, inpaint_method)
    service = ImageEditabilityService(config)

    # Analyse all pictures in parallel
    logger.info("Steps 1/3: Analyse the image structure...")
    editable_images = []

    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(service.make_image_editable, path): idx
            for idx, path in enumerate(image_paths)
        }

        results = [None] * len(image_paths)
        for future in as_completed(futures):
            idx = futures[future]
            try:
                results[idx] = future.result()
                logger.info(f"  Completed: {image_paths[idx]}")
            except Exception as e:
                logger.error(f"  Failed: {image_paths[idx]} - {e}")
                raise

        editable_images = results

    # Create Text Properties Ripper (optional)）
    text_attribute_extractor = None
    if extract_text_styles:
        logger.info("Steps 2/3: Extract text styles...")
        try:
            from services.image_editability import TextAttributeExtractorFactory
            text_attribute_extractor = TextAttributeExtractorFactory.create_caption_model_extractor()
            logger.info("  Text Style Ripper created (to call visual language models) API）")
        except Exception as e:
            logger.warning(f"  Cannot create text style extractor: {e}")
    else:
        logger.info("Steps 2/3: Skip Text Style Ripping")

    # Generate PPTX
    logger.info("Steps 3/3: Generate Editable PPTX...")

    def progress_callback(step, message, percent):
        logger.info(f"  [{percent}%] {step}: {message}")

    # If... output_file Already exists. Give a suffix to prevent conflict
    if os.path.exists(output_file):
        output_file = output_file.rsplit('.', 1)[0] + '_1.pptx'
        logger.warning(f"Output file already exists to pre-empt conflict with a suffix: {output_file}")

    # Set slide sizes based on actual image size dynamics
    # Harmonize to the minimum size and check if all pictures are as 16:9 Percentage
    if editable_images:
        # 16:9 Standard value of the ratio
        ASPECT_RATIO_16_9 = 16 / 9  # ≈ 1.7778
        ASPECT_RATIO_TOLERANCE = 0.02  # Allow 2%Errors

        # Check if all pictures are as 16:9 Scale and find minimum sizes
        min_width = float('inf')
        min_height = float('inf')

        for idx, img in enumerate(editable_images):
            aspect_ratio = img.width / img.height
            ratio_diff = abs(aspect_ratio - ASPECT_RATIO_16_9) / ASPECT_RATIO_16_9

            if ratio_diff > ASPECT_RATIO_TOLERANCE:
                logger.error(f"Image {idx + 1} ({image_paths[idx]}) No, it’s not. 16:9 Percentage: "
                           f"{img.width}x{img.height} (Percentage {aspect_ratio:.4f}, Expectations {ASPECT_RATIO_16_9:.4f})")
                raise ValueError(f"All pictures must be 16:9 Percentage, but no. {idx + 1} Picture ({img.width}x{img.height}) No, it’s not.")

            min_width = min(min_width, img.width)
            min_height = min(min_height, img.height)
            logger.info(f"Image {idx + 1}: {img.width}x{img.height} (Percentage {aspect_ratio:.4f})")

        slide_width_pixels = int(min_width)
        slide_height_pixels = int(min_height)
        logger.info(f"Harmonize the minimum size as the slide size: {slide_width_pixels}x{slide_height_pixels}")

        # If the size of the picture does not match, give a warning.
        if any(img.width != slide_width_pixels or img.height != slide_height_pixels for img in editable_images):
            logger.warning(f"The size of the picture is not consistent. It is harmonized to the minimum size. {slide_width_pixels}x{slide_height_pixels}")
    else:
        # Use default size if no picture
        slide_width_pixels = 1920
        slide_height_pixels = 1080
        logger.warning("No pictures, use default dimensions: 1920x1080")

    ExportService.create_editable_pptx_with_recursive_analysis(
        editable_images=editable_images,
        output_file=output_file,
        slide_width_pixels=slide_width_pixels,
        slide_height_pixels=slide_height_pixels,
        text_attribute_extractor=text_attribute_extractor,
        progress_callback=progress_callback
    )

    logger.info(f"✓ Export complete.: {output_file}")


def main():
    parser = argparse.ArgumentParser(
        description='Generate Editable From Pictures PPTX Documentation',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Example：:
  %(prog)s slide1.png slide2.png -o presentation.pptx
  %(prog)s ./slides/ --extractor hybrid --inpaint baidu
  %(prog)s image.png --no-text-styles

Cost hint:
  - 'generative' and 'hybrid' The background fixer will call on the texture model. API
  - '--no-text-styles' Skipping text style extracts, decreasing API Call
        """
    )

    parser.add_argument(
        'images',
        nargs='+',
        help='Picture file or directory path'
    )

    parser.add_argument(
        '-o', '--output',
        default='output_editable.pptx',
        help='Output PPTX File Path (Default): output_editable.pptx）'
    )

    parser.add_argument(
        '--extractor',
        choices=['mineru', 'hybrid'],
        default='hybrid',
        help='Component extraction method (default): hybrid）'
    )

    parser.add_argument(
        '--inpaint',
        choices=['generative', 'baidu', 'hybrid'],
        default='hybrid',
        help='Background fixer method (default): hybrid）。generative/hybrid We’ll call the Ventural Model.'
    )

    parser.add_argument(
        '--no-text-styles',
        action='store_true',
        help='Skip text style extraction (reduced) API Call）'
    )

    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Show detailed logs'
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Path to collecting pictures
    image_paths = collect_image_paths(args.images)

    if not image_paths:
        logger.error("No photo file found")
        sys.exit(1)

    logger.info(f"Found it. {len(image_paths)} Picture:")
    for path in image_paths:
        logger.info(f"  - {path}")

    # Initialize Flask Apply
    app = setup_flask_app()

    with app.app_context():
        try:
            export_editable_pptx(
                image_paths=image_paths,
                output_file=args.output,
                extractor_method=args.extractor,
                inpaint_method=args.inpaint,
                extract_text_styles=not args.no_text_styles
            )
        except Exception as e:
            logger.error(f"Export failed: {e}", exc_info=True)
            sys.exit(1)


if __name__ == '__main__':
    main()

