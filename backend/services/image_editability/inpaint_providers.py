"""
Inpaint Provider - It’s different in abstraction. inpaint Achieved

Provide multiple redrawing methods：
1. DefaultInpaintProvider - Based on mask Accurate area redrawing (use) Volcengine Inpainting Services）
2. GenerativeEditInpaintProvider - Edit repainting based on an integer based on a large generating model (e.g., Gemini Picture Editor）
3. BaiduInpaintProvider - 100 Degree Image Restoration API Redraw the area
4. HybridInpaintProvider - Mixing method： 100 degrees of text removal first, followed by the generation of paint upgrades

and the registration form：
- InpaintProviderRegistry - Map Registration Table for Element Type to Redraw Method
"""
import logging
import tempfile
from abc import ABC, abstractmethod
from typing import List, Optional, Dict
from PIL import Image

from utils.mask_utils import create_mask_from_bboxes

logger = logging.getLogger(__name__)


class InpaintProvider(ABC):
    """
    Inpaint Provider ’s Abstract Interface

    It’s used in abstraction. inpaint Methodologies to support multiple access realization：
    - Based on InpaintingService Achieved (current default)）
    - Gemini API Achieved
    - SD/SDXL Other models achieved
    - Third parties API Achieved
    """

    @abstractmethod
    def inpaint_regions(
        self,
        image: Image.Image,
        bboxes: List[tuple],
        types: Optional[List[str]] = None,
        **kwargs
    ) -> Optional[Image.Image]:
        """
        Initiating the specified area in the image inpaint Processing

        Args:
            image: Original PIL Image Object
            bboxes: List of Boundary Boxes, Each bbox Format As (x0, y0, x1, y1)
            types: List of optional elements, with bboxes One-on-one (e.g., 'text', 'image', 'table'Wait.）
            **kwargs: Other self-defined parameters by concrete achievement

        Returns:
            Processed PIL Image Object, Failed to Return None
        """
        pass


class DefaultInpaintProvider(InpaintProvider):
    """
    Based on InpaintingService Default Inpaint Provider

    This is what the current system uses. Call what’s available. InpaintingService
    """

    def __init__(self, inpainting_service):
        """
        Initialize Default Inpaint Provider

        Args:
            inpainting_service: InpaintingService Examples
        """
        self.inpainting_service = inpainting_service

    def inpaint_regions(
        self,
        image: Image.Image,
        bboxes: List[tuple],
        types: Optional[List[str]] = None,
        **kwargs
    ) -> Optional[Image.Image]:
        """
        Usage InpaintingService Processing inpaint

        Supported kwargs Parameters：
        - expand_pixels: int, Expand pixels, default 10
        - merge_bboxes: bool, Merge or not bbox，Default False
        - merge_threshold: int, Merge threshold, default 20
        - save_mask_path: str, mask Save Path, Optional
        - full_page_image: Image.Image, Full Page Image (for Gemini），Optional
        - crop_box: tuple, Crop Box (x0, y0, x1, y1)，Optional
        """
        expand_pixels = kwargs.get('expand_pixels', 10)
        merge_bboxes = kwargs.get('merge_bboxes', False)
        merge_threshold = kwargs.get('merge_threshold', 20)
        save_mask_path = kwargs.get('save_mask_path')
        full_page_image = kwargs.get('full_page_image')
        crop_box = kwargs.get('crop_box')

        try:
            result_img = self.inpainting_service.remove_regions_by_bboxes(
                image=image,
                bboxes=bboxes,
                expand_pixels=expand_pixels,
                merge_bboxes=merge_bboxes,
                merge_threshold=merge_threshold,
                save_mask_path=save_mask_path,
                full_page_image=full_page_image,
                crop_box=crop_box
            )
            return result_img
        except Exception as e:
            logger.error(f"DefaultInpaintProvider Process failed: {e}", exc_info=True)
            return None


class GenerativeEditInpaintProvider(InpaintProvider):
    """
    Edited on the basis of a large, generating model image Inpaint Provider

    Use a large generating model (e.g. Gemini to remove text, icons, etc. from pictures by natural language command。

    and DefaultInpaintProvider The difference.：
    - DefaultInpaintProvider: Based on mask Accurate area redrawing (required for accuracy) bbox）
    - GenerativeEditInpaintProvider: Edit wholechart-generated (through prompt Describe what to remove）

    Advantages： Not dependent mask，Combinable bbox A hint to get larger models to more accurately remove associated elements
    Disadvantages： Possible change in background detail, slower generation, more consumption token

    Apply scene：
    - bbox When not precise enough
    - When complex or dispersed elements need to be removed
    - As mask-based Options for a methodology
    """

    def __init__(self, ai_service, aspect_ratio: str = "16:9", resolution: str = "2K"):
        """
        Initializing Generous Edition Inpaint Provider

        Args:
            ai_service: AIService Examples (support required) edit_image Methodology）
            aspect_ratio: Target width ratio
            resolution: Target Resolution
        """
        self.ai_service = ai_service
        self.aspect_ratio = aspect_ratio
        self.resolution = resolution

    @staticmethod
    def _build_normalized_removal_regions(
        image_size: tuple[int, int],
        bboxes: List[tuple],
        types: Optional[List[str]] = None,
    ) -> List[Dict]:
        """Put pixels in bbox Convert 0-1 Normalization JSON，For prompt Specify areas to be removed。"""
        image_width, image_height = image_size
        if image_width <= 0 or image_height <= 0:
            return []

        def clamp_01(value: float) -> float:
            return max(0.0, min(1.0, value))

        removal_regions = []
        for index, bbox in enumerate(bboxes):
            if not isinstance(bbox, (tuple, list)) or len(bbox) != 4:
                continue

            raw_x0, raw_y0, raw_x1, raw_y1 = [float(v) for v in bbox]
            x0, x1 = sorted((raw_x0, raw_x1))
            y0, y1 = sorted((raw_y0, raw_y1))

            nx0 = round(clamp_01(x0 / image_width), 6)
            ny0 = round(clamp_01(y0 / image_height), 6)
            nx1 = round(clamp_01(x1 / image_width), 6)
            ny1 = round(clamp_01(y1 / image_height), 6)

            removal_regions.append({
                'region_id': index + 1,
                'element_type': types[index] if types and index < len(types) else 'unknown',
                'bbox': {
                    'x0': nx0,
                    'y0': ny0,
                    'x1': nx1,
                    'y1': ny1,
                    'width': round(nx1 - nx0, 6),
                    'height': round(ny1 - ny0, 6),
                }
            })

        return removal_regions

    def inpaint_regions(
        self,
        image: Image.Image,
        bboxes: List[tuple],
        types: Optional[List[str]] = None,
        **kwargs
    ) -> Optional[Image.Image]:
        """
        Generate a clean background using a large, generating model

        Note： This method will not be used directly bbox Do it. mask，But it will. bbox Convert 0-1 Normalization JSON Write prompt，Reminds big models to focus on removing these areas

        Supported kwargs Parameters：
        - aspect_ratio: str, width ratio, default value when initialised
        - resolution: str, Resolution, default value at initialization
        """
        aspect_ratio = kwargs.get('aspect_ratio', self.aspect_ratio)
        resolution = kwargs.get('resolution', self.resolution)

        try:
            from services.prompts import get_clean_background_prompt

            normalized_regions = self._build_normalized_removal_regions(
                image.size,
                bboxes,
                types,
            )

            # Retrieving background prompt
            edit_instruction = get_clean_background_prompt(normalized_regions)

            # Save temporary photo files（AI Service requires file path）
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp_file:
                tmp_path = tmp_file.name
                image.save(tmp_path)

            logger.info("GenerativeEditInpaintProvider: Start Generating Edit Repainting...")

            # Call AI Service Edit Pictures
            clean_bg_image = self.ai_service.edit_image(
                prompt=edit_instruction,
                current_image_path=tmp_path,
                aspect_ratio=aspect_ratio,
                resolution=resolution,
                original_description=None,
                additional_ref_images=None
            )

            if not clean_bg_image:
                logger.error("GenerativeEditInpaintProvider: Generating Edit returns empty result")
                return None

            # Convert to PIL Image
            if not isinstance(clean_bg_image, Image.Image):
                # Google GenAI Go back to yourself. Image Type, to extract_pil_image
                if hasattr(clean_bg_image, '_pil_image'):
                    clean_bg_image = clean_bg_image._pil_image
                else:
                    logger.error(f"GenerativeEditInpaintProvider: Unknown picture type: {type(clean_bg_image)}")
                    return None

            logger.info("GenerativeEditInpaintProvider: Redraw complete.")
            return clean_bg_image

        except Exception as e:
            logger.error(f"GenerativeEditInpaintProvider Process failed: {e}", exc_info=True)
            return None


class InpaintProviderRegistry:
    """
    Map Registration Table for Element Type to Redraw Method

    Select the appropriate redraw method according to the type of element：
    - Text Elements → DefaultInpaintProvider（mask-based Exact Remove）
    - Table Elements → DefaultInpaintProvider（Keep Table Frames）
    - Image/Chart Elements → GenerativeEditInpaintProvider（Reshaping the whole picture）
    - Other types → Default Provider

    Usage：
        >>> registry = InpaintProviderRegistry()
        >>> registry.register('text', mask_provider)
        >>> registry.register('image', generative_provider)
        >>> registry.register_default(mask_provider)
        >>>
        >>> provider = registry.get_provider('text')  # Back mask_provider
        >>> provider = registry.get_provider('chart')  # Back generative_provider
    """

    # Predefined Element Type Grouping
    TEXT_TYPES = {'text', 'title', 'paragraph', 'header', 'footer', 'list'}
    TABLE_TYPES = {'table', 'table_cell'}
    IMAGE_TYPES = {'image', 'figure', 'chart', 'diagram'}

    def __init__(self):
        """Initialization of the registration form"""
        self._type_mapping: Dict[str, InpaintProvider] = {}
        self._default_provider: Optional[InpaintProvider] = None

    def register(self, element_type: str, provider: InpaintProvider) -> 'InpaintProviderRegistry':
        """
        Map of Registered Element Type to Redraw Method

        Args:
            element_type: Type of element (e.g. 'text', 'image' Wait.）
            provider: Examples of counterpart redrawing providers

        Returns:
            self，Support chain call
        """
        self._type_mapping[element_type] = provider
        logger.debug(f"Registered redrawer: {element_type} -> {provider.__class__.__name__}")
        return self

    def register_types(self, element_types: List[str], provider: InpaintProvider) -> 'InpaintProviderRegistry':
        """
        Batch registration of multiple element types to the same redraw method

        Args:
            element_types: List of Elements Type
            provider: Examples of counterpart redrawing providers

        Returns:
            self，Support chain call
        """
        for t in element_types:
            self.register(t, provider)
        return self

    def register_default(self, provider: InpaintProvider) -> 'InpaintProviderRegistry':
        """
        Register the default redraw method (use when no specific type map is available)）

        Args:
            provider: Examples of default redraw providers

        Returns:
            self，Support chain call
        """
        self._default_provider = provider
        logger.debug(f"Register the default repainting provider: {provider.__class__.__name__}")
        return self

    def get_provider(self, element_type: Optional[str]) -> Optional[InpaintProvider]:
        """
        Get the corresponding repainting method according to the type of element

        Args:
            element_type: Element Type，None Indicates the use of default providers

        Returns:
            Corresponding repainting provider, return default provider if not registered
        """
        if element_type is None:
            return self._default_provider

        # Find exact matches first.
        if element_type in self._type_mapping:
            return self._type_mapping[element_type]

        # Return to Default Provider
        return self._default_provider

    def get_all_providers(self) -> List[InpaintProvider]:
        """
        Acquisition of all registered redraw providers (weighted)）

        Returns:
            Repaint provider list
        """
        providers = list(set(self._type_mapping.values()))
        if self._default_provider and self._default_provider not in providers:
            providers.append(self._default_provider)
        return providers

    @classmethod
    def create_default(
        cls,
        mask_provider: Optional[InpaintProvider] = None,
        generative_provider: Optional[InpaintProvider] = None
    ) -> 'InpaintProviderRegistry':
        """
        Creates a registry for the default configuration

        Default Configuration：
        - Text Type → mask-based（Exactly remove text area）
        - Table Type → mask-based（Keep table frames and only remove cell contents）
        - Image/Chart Type → generative（Redraw the whole chart, handle complex graphics）
        - Other types → mask-based（Default）

        Args:
            mask_provider: Based on mask Re-painting provider（DefaultInpaintProvider）
            generative_provider: Generating Repainting Provider（GenerativeEditInpaintProvider）

        Returns:
            configured registry instance
        """
        registry = cls()

        # If nothing is provided provider，Return empty registration form
        if not mask_provider and not generative_provider:
            logger.warning("Create InpaintProviderRegistry No information provided provider")
            return registry

        # Set Default Provider (Priority) mask_provider）
        default_provider = mask_provider or generative_provider
        registry.register_default(default_provider)

        # Use text type mask-based
        if mask_provider:
            registry.register_types(list(cls.TEXT_TYPES), mask_provider)
            registry.register_types(list(cls.TABLE_TYPES), mask_provider)

        # Use picture type generative（if available) mask-based
        image_provider = generative_provider or mask_provider
        if image_provider:
            registry.register_types(list(cls.IMAGE_TYPES), image_provider)

        logger.info(f"Create Default InpaintProviderRegistry: "
                   f"Text/Table->{mask_provider.__class__.__name__ if mask_provider else 'None'}, "
                   f"Image->{image_provider.__class__.__name__ if image_provider else 'None'}")

        return registry
