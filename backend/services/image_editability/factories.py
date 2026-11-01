"""
Plant type - Responsible for the creation and configuration of specific extractors and Inpaint Provider
"""
import logging
from typing import List, Optional, Any
from pathlib import Path

from .extractors import ExtractorRegistry
from .inpaint_providers import (
    InpaintProvider,
    DefaultInpaintProvider,
    GenerativeEditInpaintProvider,
    InpaintProviderRegistry
)
from .text_attribute_extractors import (
    TextAttributeExtractor,
    CaptionModelTextAttributeExtractor,
    TextAttributeExtractorRegistry,
    TextStyleResult
)

logger = logging.getLogger(__name__)


class ServiceConfig:
    """Service Configuration Category - Pure configuration without specific service references"""

    def __init__(
        self,
        upload_folder: Path,
        extractor_registry: ExtractorRegistry,
        inpaint_registry: InpaintProviderRegistry,
        max_depth: int = 1,
        min_image_size: int = 200,
        min_image_area: int = 40000,
        segmentation_provider: Optional[Any] = None,
        enable_icon_subject_extraction: bool = False,
    ):
        """
        Initialisation Service Configuration

        Args:
            upload_folder: Upload Folder Path
            extractor_registry: Registration table for element type to extractor
            inpaint_registry: Registration Table for Element Type to Redraw Method
            max_depth: Maximum Recursive Depth (default) 1）
            min_image_size: Minimum Image Dimensions
            min_image_area: Minimum picture area
            segmentation_provider: 100-degree smart map Provider（optional) for the main extract of icons
            enable_icon_subject_extraction: Whether or not to enable icon main extract (default) False，Need to cooperate. provider）
        """
        self.upload_folder = upload_folder
        self.extractor_registry = extractor_registry
        self.inpaint_registry = inpaint_registry
        self.max_depth = max_depth
        self.min_image_size = min_image_size
        self.min_image_area = min_image_area
        self.segmentation_provider = segmentation_provider
        self.enable_icon_subject_extraction = enable_icon_subject_extraction

    @classmethod
    def from_defaults(
        cls,
        mineru_token: Optional[str] = None,
        mineru_api_base: Optional[str] = None,
        upload_folder: Optional[str] = None,
        ai_service: Optional[Any] = None,
        use_hybrid_extractor: bool = True,
        use_hybrid_inpaint: bool = True,
        extractor_method: Optional[str] = None,  # 'mineru' or 'hybrid'，Priority use_hybrid_extractor
        inpaint_method: Optional[str] = None,    # 'generative', 'baidu', 'hybrid'，Priority use_hybrid_inpaint
        **kwargs
    ) -> 'ServiceConfig':
        """
        Create Configuration From Default Parameters

        Default Configuration (Recommended for Export PPTX）：
        - Element extraction： Mixed extractor（MinerU Board Analysis + 100 degrees high accuracy OCR）
        - Background generation： mixing Inpaint（100 Degree Image Restoration + Generating Paint Upgrade）
        - Recursive Depth：1

        Mixed Ripper Merger Policy：
        1. Picture Type bbox 100 degrees contained in it OCR bbox → Delete
        2. Table Type bbox 100 degrees contained in it OCR bbox → Keep 100 Degrees OCR Result, Delete MinerU Table bbox
        3. Other types and 100 degrees OCR bbox There’s an intersection. → Use 100 Degrees OCR Result

        Mixed Inpaint Policy：
        1. First fixes the exact removal of the text from the given area with 100 degrees of image
        2. Use a generating model to enhance the whole picture

        Support dynamic registration of new element types to different extractors/Redraw Method。

        If the parameters are not provided, they automatically start Flask app.config Fetch Configuration。

        Args:
            mineru_token: MinerU API token（Optional, Default From Flask config Access）
            mineru_api_base: MinerU API base URL（Optional, Default From Flask config Access）
            upload_folder: Upload folder path (optional, default from Flask config Access）
            ai_service: AI Examples of services (optional, used for generating redrawing)）
            use_hybrid_extractor: Whether or not to use a hybrid extractor (default) True，overridden by extractor_method）
            use_hybrid_inpaint: Whether to use mixing Inpaint（Default True，overridden by inpaint_method）
            extractor_method: Component extraction method，'mineru' or 'hybrid'（Priority use_hybrid_extractor）
            inpaint_method: Background repair method，'generative', 'baidu', 'hybrid'（Priority use_hybrid_inpaint）
            **kwargs: Other configuration parameters
                - max_depth: Maximum Recursive Depth (default) 1）
                - min_image_size: Minimum image size (default) 200）
                - min_image_area: Minimum picture area (default) 40000）
                - contain_threshold: Mixed extractor contains a judgement threshold (default) 0.8）
                - intersection_threshold: Mixed extractor cross-judgment threshold (default) 0.3）
                - enhance_quality: Mixed Inpaint Whether to enable painting upgrades (default) True）

        Returns:
            ServiceConfig Examples

        Raises:
            ValueError: If... mineru_token Unconfigured
        """
        from services.runtime_config import setting
        from .local_adapters import ConfiguredOCRExtractor, LocalInpaintProvider
        upload_path = Path(upload_folder or setting('UPLOAD_FOLDER', './uploads')).resolve()
        registry = ExtractorRegistry()
        registry.register_default(ConfiguredOCRExtractor())
        inpaint = InpaintProviderRegistry()
        method = inpaint_method if inpaint_method in ('local', 'generative') else setting('INPAINTING_PROVIDER', 'local')
        if method == 'local':
            inpaint.register_default(LocalInpaintProvider())
        elif method == 'generative':
            if ai_service is None:
                from services.ai_service_manager import get_ai_service
                ai_service = get_ai_service()
            inpaint.register_default(GenerativeEditInpaintProvider(ai_service))
        else:
            raise ValueError('INPAINTING_PROVIDER는 local 또는 generative로 설정하세요.')
        return cls(upload_folder=upload_path, extractor_registry=registry,
                   inpaint_registry=inpaint, max_depth=kwargs.get('max_depth', 1),
                   min_image_size=kwargs.get('min_image_size', 200),
                   min_image_area=kwargs.get('min_image_area', 40000),
                   segmentation_provider=None, enable_icon_subject_extraction=False)


class TextAttributeExtractorFactory:
    """Text Properties Ripper Plant"""

    @staticmethod
    def create_caption_model_extractor(
        ai_service: Optional[Any] = None,
        prompt_template: Optional[str] = None
    ) -> TextAttributeExtractor:
        """
        Create Based Caption Model Text Properties Ripper

        Use visual language models (e.g. Gemini）Analyse text area images，
        By Generating JSON to get the font colour, boldness, italics, etc.。

        Args:
            ai_service: AIService Example (optional, automatic access if not available)）
            prompt_template: Custom prompt Template (optional), must be used {content_hint} As Placeholder

        Returns:
            CaptionModelTextAttributeExtractor Examples

        Raises:
            If... AI The service has failed to initialize. It’s going to throw out an anomaly.
        """
        from services.runtime_config import setting
        if setting('TEXT_STYLE_PROVIDER', 'local') == 'local':
            from .local_adapters import LocalTextAttributeExtractor
            return LocalTextAttributeExtractor()
        if ai_service is None:
            from services.ai_service_manager import get_ai_service
            ai_service = get_ai_service()

        logger.info("Create CaptionModelTextAttributeExtractor")
        return CaptionModelTextAttributeExtractor(ai_service, prompt_template)

    @staticmethod
    def create_text_attribute_registry(
        caption_extractor: Optional[TextAttributeExtractor] = None,
        ai_service: Optional[Any] = None
    ) -> TextAttributeExtractorRegistry:
        """
        Creates a text property extractor registration form

        Support dynamic registration of new element types, not limited to predefined types。

        Args:
            caption_extractor: Caption Model Ripper (optional, automatically created)）
            ai_service: AIService Example (optional, for automatic creation of extractor）

        Returns:
            It’s configured. TextAttributeExtractorRegistry Examples

        Raises:
            If the extractor fails to create, the anomaly is thrown out.
        """
        # Automatically create extractor
        if caption_extractor is None:
            caption_extractor = TextAttributeExtractorFactory.create_caption_model_extractor(
                ai_service=ai_service
            )

        # Create registration form
        registry = TextAttributeExtractorRegistry()

        # Set Default Ripper
        registry.register_default(caption_extractor)

        # Type of registered text
        registry.register_types(
            ['text', 'title', 'paragraph', 'heading', 'table_cell'],
            caption_extractor
        )

        logger.info("Create TextAttributeExtractorRegistry")

        return registry

