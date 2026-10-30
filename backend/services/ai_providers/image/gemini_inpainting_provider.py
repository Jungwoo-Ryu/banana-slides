"""
Gemini Inpainting Elimination of service providers
Usage Gemini 2.5 Flash Image Preview Model based on mask Image Edition
"""
import logging
from typing import Optional
from PIL import Image, ImageDraw
import numpy as np
from tenacity import retry, stop_after_attempt, wait_exponential
from .genai_provider import GenAIImageProvider
from config import get_config

logger = logging.getLogger(__name__)


class GeminiInpaintingProvider:
    """Gemini Inpainting Elimination of services (use) Gemini 2.5 Flash）"""

    # DEFAULT_MODEL = "gemini-2.5-flash-image"
    DEFAULT_MODEL = "gemini-3-pro-image-preview"
    DEFAULT_PROMPT = """\
You’re a professional photo-foreseeing specialist, working with a high degree of precision to remove the foreground elements.。
Now the user has provided you with two different images.：
1. Original Picture
2. Use a black rectangle to mark the image behind it, and the black rectangular region means the foreground elements to be removed. You just have to process these areas.。

You need to redraw the black masked areas based on the original picture and black mask information, remove the foreground elements so that they are seamlessly integrated around them, as if the foreground elements have never appeared. If an area is marked as a whole, remove it as a whole, rather than simply remove its internal content.。

Ban the omission of any black rectangle labeled area。

"""

    def __init__(
        self,
        api_key: str,
        api_base: str = None,
        model: str = None,
        timeout: int = 60
    ):
        """
        Initialize Gemini Inpainting Provider

        Args:
            api_key: Google API key
            api_base: API base URL (for proxies like aihubmix)
            model: Model name to use (default: gemini-2.5-flash-image)
            timeout: API Request timeout (sec)）
        """
        self.model = model or self.DEFAULT_MODEL
        self.timeout = timeout

        # Reuse GenAIImageProvider %1 %1
        self.genai_provider = GenAIImageProvider(
            api_key=api_key,
            api_base=api_base,
            model=self.model
        )

        logger.info(f"✅ Gemini Inpainting Provider Initialize (model={self.model})")

    @staticmethod
    def create_marked_image(original_image: Image.Image, mask_image: Image.Image) -> Image.Image:
        """
        Mark the area to be repaired with a pure black box on the original map

        Args:
            original_image: Original Image
            mask_image: Mask Image (White)=Areas to remove）

        Returns:
            Images after the label (original figure) + Pure Black Rectangle Overwrite）
        """
        # Ensure mask Same size as original.
        if mask_image.size != original_image.size:
            mask_image = mask_image.resize(original_image.size, Image.LANCZOS)

        # Convert to RGB Mode
        if original_image.mode != 'RGB':
            original_image = original_image.convert('RGB')
        if mask_image.mode != 'RGB':
            mask_image = mask_image.convert('RGB')

        # Create a copy for the label
        marked_image = original_image.copy()

        # Yes, sir. mask Convert to numpy array To deal with it.
        mask_array = np.array(mask_image)
        marked_array = np.array(marked_image)

        # White area found (areas to mark)）
        # White pixels. RGB It’s almost worth it. 255
        white_threshold = 200
        mask_regions = np.all(mask_array > white_threshold, axis=2)

        # With pure black. (0, 0, 0) Fully overwrite the indicated area
        black_overlay = np.array([0, 0, 0], dtype=np.uint8)
        marked_array[mask_regions] = black_overlay

        # Turn around. PIL Image
        marked_image = Image.fromarray(marked_array)

        logger.debug(f"✅ Created tag image, covered in pure black {np.sum(mask_regions)} Pixels")

        return marked_image

    @retry(
        stop=stop_after_attempt(3),  # Most Multiple Tests 3 Numbers
        wait=wait_exponential(multiplier=1, min=2, max=10),  # Index Refusal: 2s, 4s, 8s
        reraise=True
    )
    def inpaint_image(
        self,
        original_image: Image.Image,
        mask_image: Image.Image,
        inpaint_mode: str = "remove",
        custom_prompt: Optional[str] = None,
        full_page_image: Optional[Image.Image] = None,
        crop_box: Optional[tuple] = None
    ) -> Optional[Image.Image]:
        """
        Usage Gemini Image editing with mask

        Args:
            original_image: Original Image
            mask_image: Mask Image (White)=Clear, black.=Reservations）
            inpaint_mode: Repair mode (unused, compatibility preserved)）
            custom_prompt: Custom prompt（If it’s None Use default）
            full_page_image: Full PPT Page Image（16:9），Directly if provided
            crop_box: Crop Box (x0, y0, x1, y1)，Specifies the region to be cut from the full page result

        Returns:
            processed image, failed to return None
        """
        try:
            logger.info("🚀 Start Call Gemini inpainting（Note Mode）")

            working_image = full_page_image

            # 1. Extension mask To Full Page Size
            result_crop_box = crop_box  # Save inbound crop_box

            # Use the full page image directly
            final_image = working_image

            # Extension mask To Full Page Size
            # Create black as full page size mask
            full_mask = Image.new('RGB', final_image.size, (0, 0, 0))
            # Redirect former mask Paste to the right position
            x0, y0, x1, y1 = crop_box
            # Ensure mask Size Match
            mask_resized = mask_image.resize((x1 - x0, y1 - y0), Image.LANCZOS)
            full_mask.paste(mask_resized, (x0, y0))
            final_mask = full_mask
            logger.info(f"📷 Full Page Mode: Page={final_image.size}, mask Expand={final_mask.size}, Paste Location={crop_box}")

            # 2. Create an image (in plain black box on the original map) to mark the area to be repaired）
            logger.info("🎨 Create label image (a pure black box indicates areas to be removed)）...")
            marked_image = self.create_marked_image(final_image, final_mask)
            logger.info(f"✅ Mark image creation complete: {marked_image.size}")

            # 3. Build prompt
            prompt = custom_prompt or self.DEFAULT_PROMPT
            logger.info(f"📝 Prompt: {prompt[:100]}...")

            # 4. Call GenAI Provider Generate images (postmarked images only, not passed) mask）
            logger.info("🌐 Call GenAI Provider Conduct inpainting（Only pass an annotation）...")

            result_image = self.genai_provider.generate_image(
                prompt=prompt,
                ref_images=[full_page_image, marked_image],
                aspect_ratio="16:9",
                resolution="1K"
            )

            if result_image is None:
                logger.error("❌ Gemini Inpainting Failed： did not return image")
                return None

            # 5. Convert to PIL Image（If necessary,）
            # GenAI SDK The return is... google.genai.types.Image object to be converted to PIL Image
            if hasattr(result_image, '_pil_image'):
                logger.debug("🔄 Convert GenAI Image Yes. PIL Image")
                result_image = result_image._pil_image

            logger.info(f"✅ Gemini Inpainting Success！API Return Size: {result_image.size}, {result_image.mode}")

            # 6. Resize To original scale
            if result_image.size != final_image.size:
                logger.info(f"🔄 Resize From {result_image.size} Present. {final_image.size}")
                result_image = result_image.resize(final_image.size, Image.LANCZOS)

            # 7. Synthetic image： Only mask Regional use inpaint As a result, other regions retained original maps
            logger.info("🎨 Synthetic image： will inpaint Results and original figure by mask Merge...")

            # Make sure you have all the images. RGB Mode
            if result_image.mode != 'RGB':
                result_image = result_image.convert('RGB')
            if final_image.mode != 'RGB':
                final_image = final_image.convert('RGB')

            # Yes, sir. mask Convert to Greyscale Chart（L Mode）
            mask_for_composite = final_mask.convert('L')

            # Usage PIL It’s... composite Methodological synthesis
            # mask Medium White(255)Regional use inpainting Turns out, black.(0)Area Use Original Map
            composited_image = Image.composite(result_image, final_image, mask_for_composite)
            logger.info(f"✅ Image synthesis complete! Size complete!: {composited_image.size}")

            # 8. Crop back to target size
            cropped_result = composited_image.crop(result_crop_box)
            logger.info(f"✂️  Crop From Full Page: {composited_image.size} -> {cropped_result.size}")
            return cropped_result

        except Exception as e:
            logger.error(f"❌ Gemini Inpainting Failed: {e}", exc_info=True)
            raise
