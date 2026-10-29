"""
元素提取器 - 抽象不同的元素识别方法

包含：
- ElementExtractor: 提取器抽象接口
- MinerUElementExtractor: MinerU版面分析提取器
- BaiduOCRElementExtractor: 百度表格OCR提取器
- BaiduAccurateOCRElementExtractor: 百度高精度OCR提取器（文字识别）
- ExtractorRegistry: 元素类型到提取器的映射注册表
"""
import os
import json
import logging
import tempfile
import uuid
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, Tuple, Type
from pathlib import Path
from PIL import Image

from utils.latex_utils import latex_to_text

logger = logging.getLogger(__name__)


class ExtractionContext:
    """提取上下文 - 提取器可能需要的额外信息"""
    
    def __init__(
        self,
        result_dir: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Args:
            result_dir: 结果目录（如MinerU的输出目录）
            metadata: 其他元数据
        """
        self.result_dir = result_dir
        self.metadata = metadata or {}


class ExtractionResult:
    """提取结果"""

    def __init__(
        self,
        elements: List[Dict[str, Any]],
        context: Optional[ExtractionContext] = None,
        error: Optional[str] = None
    ):
        """
        Args:
            elements: 提取的元素列表
            context: 提取上下文（用于后续递归处理）
            error: 提取过程中的错误信息（如果有）
        """
        self.elements = elements
        self.context = context or ExtractionContext()
        self.error = error

    @property
    def has_error(self) -> bool:
        """是否有错误"""
        return self.error is not None


class ElementExtractor(ABC):
    """
    元素提取器抽象接口
    
    用于抽象不同的元素识别方法，支持接入多种实现：
    - MinerU解析器（当前默认）
    - 百度OCR（用于表格）
    - PaddleOCR
    - Tesseract OCR
    - 其他自定义识别服务
    """
    
    @abstractmethod
    def extract(
        self,
        image_path: str,
        element_type: Optional[str] = None,
        **kwargs
    ) -> ExtractionResult:
        """
        从图像中提取元素
        
        Args:
            image_path: 图像文件路径
            element_type: 元素类型提示（如 'table', 'text', 'image'等），可选
            **kwargs: 其他由具体实现自定义的参数
        
        Returns:
            ExtractionResult对象，包含：
            - elements: 元素字典列表，每个字典包含：
                - bbox: List[float] - 边界框 [x0, y0, x1, y1]
                - type: str - 元素类型（'text', 'image', 'table', 'title'等）
                - content: Optional[str] - 文本内容
                - image_path: Optional[str] - 图片相对路径
                - metadata: Dict[str, Any] - 其他元数据
            - context: 提取上下文（用于后续递归处理）
        """
        pass
    
    @abstractmethod
    def supports_type(self, element_type: Optional[str]) -> bool:
        """
        检查提取器是否支持指定的元素类型
        
        Args:
            element_type: 元素类型（如 'table', 'image'等），None表示通用
        
        Returns:
            是否支持该类型
        """
        pass


class MinerUElementExtractor(ElementExtractor):
    """
    基于MinerU的元素提取器（默认实现）
    
    从MinerU的解析结果中提取文本、图片、表格等元素
    自包含：自己处理PDF转换、MinerU解析、结果提取
    """
    
    def __init__(self, parser_service, upload_folder: Path):
        """
        初始化MinerU提取器
        
        Args:
            parser_service: FileParserService实例
            upload_folder: 上传文件夹路径
        """
        self._parser_service = parser_service
        self._upload_folder = upload_folder
    
    def supports_type(self, element_type: Optional[str]) -> bool:
        """MinerU支持所有通用类型（除了特殊的表格单元格）"""
        return element_type != 'table_cell'
    
    def extract(
        self,
        image_path: str,
        element_type: Optional[str] = None,
        **kwargs
    ) -> ExtractionResult:
        """
        从图像中提取元素（自动处理PDF转换和MinerU解析）

        支持的kwargs:
        - depth: int, 递归深度（用于日志）
        """
        depth = kwargs.get('depth', 0)

        # 获取图片尺寸
        img = Image.open(image_path)
        image_size = img.size  # (width, height)

        # 1. 检查缓存
        cached_dir = self._find_cache(image_path)
        if cached_dir:
            logger.info(f"{'  ' * depth}使用MinerU缓存")
            mineru_result_dir = cached_dir
            parse_error = None
        else:
            # 2. 解析图片
            mineru_result_dir, parse_error = self._parse_image(image_path, depth)
            if not mineru_result_dir:
                return ExtractionResult(elements=[], error=parse_error)

        # 3. 提取元素
        elements = self._extract_from_result(
            mineru_result_dir=mineru_result_dir,
            target_image_size=image_size,
            depth=depth
        )

        # 4. 返回结果（带上下文）
        context = ExtractionContext(
            result_dir=mineru_result_dir,
            metadata={'source': 'mineru', 'image_size': image_size}
        )

        return ExtractionResult(elements=elements, context=context)
    
    def _find_cache(self, image_path: str) -> Optional[str]:
        """查找缓存的MinerU结果"""
        try:
            import hashlib
            import time
            
            img_path = Path(image_path)
            if not img_path.exists():
                return None
            
            mineru_files_dir = self._upload_folder / 'mineru_files'
            if not mineru_files_dir.exists():
                return None
            
            # 简单策略：不使用缓存（更安全）
            return None
            
        except Exception as e:
            logger.debug(f"查找缓存失败: {e}")
            return None
    
    def _parse_image(self, image_path: str, depth: int) -> Tuple[Optional[str], Optional[str]]:
        """解析图片，返回MinerU结果目录和错误信息

        Returns:
            Tuple of (result_dir, error_message)
        """
        from services.export_service import ExportService

        # 转换为PDF
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_pdf:
            pdf_path = tmp_pdf.name

        try:
            ExportService.create_pdf_from_images([image_path], output_file=pdf_path)

            # 调用MinerU解析
            image_id = str(uuid.uuid4())[:8]
            batch_id, markdown_content, extract_id, error_message, failed_image_count = \
                self._parser_service.parse_file(pdf_path, f"image_{image_id}.pdf")

            if error_message or not extract_id:
                logger.error(f"{'  ' * depth}MinerU解析失败: {error_message}")
                return None, error_message or "MinerU解析失败，未返回extract_id"

            mineru_result_dir = (self._upload_folder / 'mineru_files' / extract_id).resolve()
            if not mineru_result_dir.exists():
                err = f"MinerU结果目录不存在: {mineru_result_dir}"
                logger.error(f"{'  ' * depth}{err}")
                return None, err

            return str(mineru_result_dir), None

        finally:
            if os.path.exists(pdf_path):
                os.remove(pdf_path)
    
    def _extract_from_result(
        self,
        mineru_result_dir: str,
        target_image_size: Tuple[int, int],
        depth: int
    ) -> List[Dict[str, Any]]:
        """从MinerU结果目录中提取元素"""
        elements = []
        
        try:
            mineru_dir = Path(mineru_result_dir)
            
            # 加载layout.json和content_list.json
            layout_file = mineru_dir / 'layout.json'
            content_list_files = list(mineru_dir.glob("*_content_list.json"))
            
            if not layout_file.exists() or not content_list_files:
                logger.warning(f"layout.json或content_list.json不存在")
                return []
            
            with open(layout_file, 'r', encoding='utf-8') as f:
                layout_data = json.load(f)
            
            with open(content_list_files[0], 'r', encoding='utf-8') as f:
                content_list = json.load(f)
            
            # 从layout.json提取元素
            if 'pdf_info' not in layout_data or not layout_data['pdf_info']:
                return []
            
            page_info = layout_data['pdf_info'][0]
            source_page_size = page_info.get('page_size', target_image_size)
            
            # 计算缩放比例
            scale_x = target_image_size[0] / source_page_size[0]
            scale_y = target_image_size[1] / source_page_size[1]
            
            # 处理块的通用函数
            def process_block(block):
                bbox = block.get('bbox')
                block_type = block.get('type', 'text')
                equation_types = {'equation', 'interline_equation', 'inline_equation'}
                is_equation_source_block = block_type in equation_types
                
                if not bbox or len(bbox) != 4:
                    return None
                
                # 过滤掉 type 为 header/footer 且内容仅为 "#" 的特殊标记
                if block_type in ['header', 'footer']:
                    if block.get('lines'):
                        # 提取所有文本内容
                        all_text = []
                        for line in block['lines']:
                            for span in line.get('spans', []):
                                if span.get('type') == 'text' and span.get('content'):
                                    all_text.append(span['content'])
                        # 如果所有文本合并后仅为"#"，则跳过此块
                        combined_text = ''.join(all_text).strip()
                        if combined_text == '#':
                            return None
                
                # 缩放bbox到目标尺寸
                scaled_bbox = [
                    bbox[0] * scale_x,
                    bbox[1] * scale_y,
                    bbox[2] * scale_x,
                    bbox[3] * scale_y
                ]
                
                # 对于 header/footer，需要根据实际内容判断类型
                actual_content_type = 'text' if is_equation_source_block else block_type
                if block_type in ['header', 'footer']:
                    # 检查是否包含图片
                    has_image = False
                    if block.get('blocks'):
                        for sub_block in block['blocks']:
                            if sub_block.get('type') == 'image_body':
                                has_image = True
                                break
                    
                    # 检查是否包含文本
                    has_text = False
                    if block.get('lines'):
                        for line in block['lines']:
                            for span in line.get('spans', []):
                                if span.get('type') in ['text', 'inline_equation'] and span.get('content', '').strip():
                                    has_text = True
                                    break
                            if has_text:
                                break
                    
                    # 根据内容判断实际类型
                    if has_image and not has_text:
                        actual_content_type = 'image'
                    elif has_text:
                        actual_content_type = 'text'  # 将 header/footer 转换为 text
                    else:
                        # 默认当作文本处理
                        actual_content_type = 'text'
                
                # 辅助函数：从 lines 提取文本
                def extract_text_from_lines(lines, preserve_equations=False):
                    """从 lines 数组提取所有文本内容"""
                    line_texts = []
                    for line in lines:
                        span_texts = []
                        for span in line.get('spans', []):
                            span_type = span.get('type', '')
                            span_content = span.get('content', '')
                            
                            if span_type == 'text' and span_content:
                                span_texts.append(span_content)
                            elif span_type in equation_types and span_content:
                                if preserve_equations:
                                    span_texts.append(span_content)
                                else:
                                    converted = latex_to_text(span_content)
                                    span_texts.append(converted)
                        
                        if span_texts:
                            line_text = ''.join(span_texts)
                            line_texts.append(line_text)
                    return line_texts
                
                # 提取content（文本）- 包括 caption 类型
                content = None
                if actual_content_type in ['text', 'title', 'table_caption', 'image_caption']:
                    if block.get('lines'):
                        line_texts = extract_text_from_lines(
                            block['lines'],
                            preserve_equations=is_equation_source_block
                        )
                        if line_texts:
                            content = '\n'.join(line_texts).strip()

                elif actual_content_type == 'list':
                    # list 类型包含 blocks 子数组，每个 block 有 lines
                    if block.get('blocks'):
                        all_line_texts = []
                        for sub_block in block['blocks']:
                            if sub_block.get('lines'):
                                sub_texts = extract_text_from_lines(sub_block['lines'])
                                all_line_texts.extend(sub_texts)
                        if all_line_texts:
                            content = '\n'.join(all_line_texts).strip()
                
                # 提取img_path（图片/表格）- 转换为绝对路径
                img_path = None
                if actual_content_type in ['image', 'table']:
                    if block.get('blocks'):
                        for sub_block in block['blocks']:
                            for line in sub_block.get('lines', []):
                                for span in line.get('spans', []):
                                    if span.get('image_path'):
                                        relative_path = span['image_path']
                                        if not relative_path.startswith('images/'):
                                            relative_path = 'images/' + relative_path
                                        # 转换为绝对路径
                                        abs_path = mineru_dir / relative_path
                                        if abs_path.exists():
                                            img_path = str(abs_path)
                                        break
                                if img_path:
                                    break
                            if img_path:
                                break
                
                return {
                    'bbox': scaled_bbox,
                    'type': actual_content_type,  # 使用实际内容类型而不是原始类型
                    'content': content,
                    'image_path': img_path,  # 现在是绝对路径
                    'metadata': {
                        **block,
                        'original_type': block_type  # 保留原始类型（header/footer）在metadata中
                    }
                }
            
            # 处理主要内容块（para_blocks）
            for block in page_info.get('para_blocks', []):
                element = process_block(block)
                if element:
                    elements.append(element)
                # 递归处理子块（table_caption, image_caption 等）
                # 注意：list 类型的子块已在 process_block 中处理，不需要再递归
                block_type = block.get('type', '')
                if block_type != 'list':
                    for sub_block in block.get('blocks', []):
                        sub_elem = process_block(sub_block)
                        if sub_elem:
                            elements.append(sub_elem)
            
            # 处理页眉页脚（discarded_blocks）
            for block in page_info.get('discarded_blocks', []):
                element = process_block(block)
                if element:
                    elements.append(element)
                # 递归处理子块
                # 注意：list 类型的子块已在 process_block 中处理，不需要再递归
                block_type = block.get('type', '')
                if block_type != 'list':
                    for sub_block in block.get('blocks', []):
                        sub_elem = process_block(sub_block)
                        if sub_elem:
                            elements.append(sub_elem)
            
            logger.info(f"MinerU提取了 {len(elements)} 个元素")
        
        except Exception as e:
            logger.error(f"MinerU提取元素失败: {e}", exc_info=True)
        
        return elements


class ExtractorRegistry:
    """
    元素类型到提取器的映射注册表
    
    用于管理不同元素类型应该使用哪个提取器进行子元素提取：
    - 图片/图表元素 → MinerU 版面分析
    - 表格元素 → 百度表格OCR
    - 其他类型 → 默认提取器
    
    使用方式：
        >>> registry = ExtractorRegistry()
        >>> registry.register('table', baidu_ocr_extractor)
        >>> registry.register('image', mineru_extractor)
        >>> registry.register_default(mineru_extractor)
        >>> 
        >>> extractor = registry.get_extractor('table')  # 返回 baidu_ocr_extractor
        >>> extractor = registry.get_extractor('chart')  # 返回 mineru_extractor (默认)
    """
    
    # 预定义的元素类型分组
    TABLE_TYPES = {'table', 'table_cell'}
    IMAGE_TYPES = {'image', 'figure', 'chart', 'diagram'}
    TEXT_TYPES = {'text', 'title', 'paragraph', 'header', 'footer', 'list'}
    
    def __init__(self):
        """初始化注册表"""
        self._type_mapping: Dict[str, ElementExtractor] = {}
        self._default_extractor: Optional[ElementExtractor] = None
    
    def register(self, element_type: str, extractor: ElementExtractor) -> 'ExtractorRegistry':
        """
        注册元素类型到提取器的映射
        
        Args:
            element_type: 元素类型（如 'table', 'image' 等）
            extractor: 对应的提取器实例
        
        Returns:
            self，支持链式调用
        """
        self._type_mapping[element_type] = extractor
        logger.debug(f"注册提取器: {element_type} -> {extractor.__class__.__name__}")
        return self
    
    def register_types(self, element_types: List[str], extractor: ElementExtractor) -> 'ExtractorRegistry':
        """
        批量注册多个元素类型到同一个提取器
        
        Args:
            element_types: 元素类型列表
            extractor: 对应的提取器实例
        
        Returns:
            self，支持链式调用
        """
        for t in element_types:
            self.register(t, extractor)
        return self
    
    def register_default(self, extractor: ElementExtractor) -> 'ExtractorRegistry':
        """
        注册默认提取器（当没有特定类型映射时使用）
        
        Args:
            extractor: 默认提取器实例
        
        Returns:
            self，支持链式调用
        """
        self._default_extractor = extractor
        logger.debug(f"注册默认提取器: {extractor.__class__.__name__}")
        return self
    
    def get_extractor(self, element_type: Optional[str]) -> Optional[ElementExtractor]:
        """
        根据元素类型获取对应的提取器
        
        Args:
            element_type: 元素类型，None表示使用默认提取器
        
        Returns:
            对应的提取器，如果没有注册则返回默认提取器
        """
        if element_type is None:
            return self._default_extractor
        
        # 先查找精确匹配
        if element_type in self._type_mapping:
            return self._type_mapping[element_type]
        
        # 返回默认提取器
        return self._default_extractor
    
    def get_all_extractors(self) -> List[ElementExtractor]:
        """
        获取所有已注册的提取器（去重）
        
        Returns:
            提取器列表
        """
        extractors = list(set(self._type_mapping.values()))
        if self._default_extractor and self._default_extractor not in extractors:
            extractors.append(self._default_extractor)
        return extractors
    
    @classmethod
    def create_default(
        cls,
        mineru_extractor: ElementExtractor,
        baidu_ocr_extractor: Optional[ElementExtractor] = None,
        baidu_accurate_ocr_extractor: Optional[ElementExtractor] = None
    ) -> 'ExtractorRegistry':
        """
        创建默认配置的注册表
        
        默认配置：
        - 表格类型 → 百度表格OCR（如果可用）
        - 文字类型 → 百度高精度OCR（如果可用），否则MinerU
        - 图片类型 → MinerU
        - 其他类型 → MinerU（默认）
        
        Args:
            mineru_extractor: MinerU提取器实例
            baidu_ocr_extractor: 百度表格OCR提取器实例（可选）
            baidu_accurate_ocr_extractor: 百度高精度OCR提取器实例（可选）
        
        Returns:
            配置好的注册表实例
        """
        registry = cls()
        
        # 设置默认提取器
        registry.register_default(mineru_extractor)
        
        # 图片类型使用MinerU
        registry.register_types(list(cls.IMAGE_TYPES), mineru_extractor)
        
        # 表格类型使用百度表格OCR（如果可用），否则使用MinerU
        table_extractor = baidu_ocr_extractor if baidu_ocr_extractor else mineru_extractor
        registry.register_types(list(cls.TABLE_TYPES), table_extractor)
        
        # 文字类型使用百度高精度OCR（如果可用），否则使用MinerU
        text_extractor = baidu_accurate_ocr_extractor if baidu_accurate_ocr_extractor else mineru_extractor
        registry.register_types(list(cls.TEXT_TYPES), text_extractor)
        
        logger.info(f"创建默认ExtractorRegistry: "
                   f"表格->{table_extractor.__class__.__name__}, "
                   f"文字->{text_extractor.__class__.__name__}, "
                   f"图片->{mineru_extractor.__class__.__name__}")
        
        return registry
