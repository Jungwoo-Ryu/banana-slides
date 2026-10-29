"""
工厂类 - 负责创建和配置具体的提取器和Inpaint提供者
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
    """服务配置类 - 纯配置，不持有具体服务引用"""
    
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
        初始化服务配置

        Args:
            upload_folder: 上传文件夹路径
            extractor_registry: 元素类型到提取器的注册表
            inpaint_registry: 元素类型到重绘方法的注册表
            max_depth: 最大递归深度（默认1）
            min_image_size: 最小图片尺寸
            min_image_area: 最小图片面积
            segmentation_provider: 百度智能抠图 Provider（可选），用于图标主体提取
            enable_icon_subject_extraction: 是否启用图标主体提取（默认 False，需配合 provider）
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
        extractor_method: Optional[str] = None,  # 'mineru' 或 'hybrid'，优先于 use_hybrid_extractor
        inpaint_method: Optional[str] = None,    # 'generative', 'baidu', 'hybrid'，优先于 use_hybrid_inpaint
        **kwargs
    ) -> 'ServiceConfig':
        """
        从默认参数创建配置
        
        默认配置（推荐用于导出PPTX）：
        - 元素提取：混合提取器（MinerU版面分析 + 百度高精度OCR）
        - 背景生成：混合Inpaint（百度图像修复 + 生成式画质提升）
        - 递归深度：1
        
        混合提取器合并策略：
        1. 图片类型bbox里包含的百度OCR bbox → 删除
        2. 表格类型bbox里包含的百度OCR bbox → 保留百度OCR结果，删除MinerU表格bbox
        3. 其他类型与百度OCR bbox有交集 → 使用百度OCR结果
        
        混合Inpaint策略：
        1. 先用百度图像修复精确去除指定区域的文字
        2. 再用生成式模型提升整体画质
        
        支持动态注册新的元素类型到不同的提取器/重绘方法。
        
        如果不提供参数，会自动从 Flask app.config 获取配置。
        
        Args:
            mineru_token: MinerU API token（可选，默认从 Flask config 获取）
            mineru_api_base: MinerU API base URL（可选，默认从 Flask config 获取）
            upload_folder: 上传文件夹路径（可选，默认从 Flask config 获取）
            ai_service: AI服务实例（可选，用于生成式重绘）
            use_hybrid_extractor: 是否使用混合提取器（默认True，会被 extractor_method 覆盖）
            use_hybrid_inpaint: 是否使用混合Inpaint（默认True，会被 inpaint_method 覆盖）
            extractor_method: 组件提取方法，'mineru' 或 'hybrid'（优先于 use_hybrid_extractor）
            inpaint_method: 背景修复方法，'generative', 'baidu', 'hybrid'（优先于 use_hybrid_inpaint）
            **kwargs: 其他配置参数
                - max_depth: 最大递归深度（默认1）
                - min_image_size: 最小图片尺寸（默认200）
                - min_image_area: 最小图片面积（默认40000）
                - contain_threshold: 混合提取器包含判断阈值（默认0.8）
                - intersection_threshold: 混合提取器交集判断阈值（默认0.3）
                - enhance_quality: 混合Inpaint是否启用画质提升（默认True）
        
        Returns:
            ServiceConfig实例
        
        Raises:
            ValueError: 如果 mineru_token 未配置
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
    """文字属性提取器工厂"""
    
    @staticmethod
    def create_caption_model_extractor(
        ai_service: Optional[Any] = None,
        prompt_template: Optional[str] = None
    ) -> TextAttributeExtractor:
        """
        创建基于Caption Model的文字属性提取器
        
        使用视觉语言模型（如Gemini）分析文字区域图像，
        通过生成JSON的方式获取字体颜色、是否粗体、是否斜体等属性。
        
        Args:
            ai_service: AIService实例（可选，如果不提供则自动获取）
            prompt_template: 自定义的prompt模板（可选），必须使用 {content_hint} 作为占位符
        
        Returns:
            CaptionModelTextAttributeExtractor实例
        
        Raises:
            如果AI服务初始化失败，会抛出异常
        """
        from services.runtime_config import setting
        if setting('TEXT_STYLE_PROVIDER', 'local') == 'local':
            from .local_adapters import LocalTextAttributeExtractor
            return LocalTextAttributeExtractor()
        if ai_service is None:
            from services.ai_service_manager import get_ai_service
            ai_service = get_ai_service()
        
        logger.info("创建CaptionModelTextAttributeExtractor")
        return CaptionModelTextAttributeExtractor(ai_service, prompt_template)
    
    @staticmethod
    def create_text_attribute_registry(
        caption_extractor: Optional[TextAttributeExtractor] = None,
        ai_service: Optional[Any] = None
    ) -> TextAttributeExtractorRegistry:
        """
        创建文字属性提取器注册表
        
        支持动态注册新元素类型，不限于预定义类型。
        
        Args:
            caption_extractor: Caption Model提取器（可选，自动创建）
            ai_service: AIService实例（可选，用于自动创建提取器）
        
        Returns:
            配置好的TextAttributeExtractorRegistry实例
        
        Raises:
            如果提取器创建失败，会抛出异常
        """
        # 自动创建提取器
        if caption_extractor is None:
            caption_extractor = TextAttributeExtractorFactory.create_caption_model_extractor(
                ai_service=ai_service
            )
        
        # 创建注册表
        registry = TextAttributeExtractorRegistry()
        
        # 设置默认提取器
        registry.register_default(caption_extractor)
        
        # 注册文本类型
        registry.register_types(
            ['text', 'title', 'paragraph', 'heading', 'table_cell'],
            caption_extractor
        )
        
        logger.info("创建TextAttributeExtractorRegistry")
        
        return registry

