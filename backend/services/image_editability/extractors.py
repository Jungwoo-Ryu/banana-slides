"""
Element Ripper - The abstraction of different methods of element identification

Organisation：
- ElementExtractor: Extractor Abstract Interface
- MinerUElementExtractor: MinerU Board Analysis Ripper
- BaiduOCRElementExtractor: 100 Degrees Table OCR Ripper
- BaiduAccurateOCRElementExtractor: 100 degrees high accuracy OCR Ripper (word recognition)）
- ExtractorRegistry: Map registration form for element type to extractor
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
    """Extract Context - Additional information that may be required by the extractor"""

    def __init__(
        self,
        result_dir: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Args:
            result_dir: Summary of results (e.g., MinerU Output Directory）
            metadata: Other metadata
        """
        self.result_dir = result_dir
        self.metadata = metadata or {}


class ExtractionResult:
    """Extract Results"""

    def __init__(
        self,
        elements: List[Dict[str, Any]],
        context: Optional[ExtractionContext] = None,
        error: Optional[str] = None
    ):
        """
        Args:
            elements: List of elements extracted
            context: Extract context (for subsequent recursive processing)）
            error: Error information during extraction (if any)）
        """
        self.elements = elements
        self.context = context or ExtractionContext()
        self.error = error

    @property
    def has_error(self) -> bool:
        """Is there a mistake?"""
        return self.error is not None


class ElementExtractor(ABC):
    """
    An abstract interface for the element extractor

    Use in abstraction of different element identification methods to support multiple achievement of access：
    - MinerU Parser (Current Default)）
    - 100 degrees OCR（For Tables）
    - PaddleOCR
    - Tesseract OCR
    - Other custom identification services
    """

    @abstractmethod
    def extract(
        self,
        image_path: str,
        element_type: Optional[str] = None,
        **kwargs
    ) -> ExtractionResult:
        """
        Extract elements from images

        Args:
            image_path: Image File Path
            element_type: Type of element hint (e. g.) 'table', 'text', 'image'Wait, you can choose.
            **kwargs: Other self-defined parameters by concrete achievement

        Returns:
            ExtractionResult Object, includes：
            - elements: List of elements of the dictionary, each of which contains：
                - bbox: List[float] - Boundary Border [x0, y0, x1, y1]
                - type: str - Element Type（'text', 'image', 'table', 'title'Wait.）
                - content: Optional[str] - Text content
                - image_path: Optional[str] - Picture relative path
                - metadata: Dict[str, Any] - Other metadata
            - context: Extract context (for subsequent recursive processing)）
        """
        pass

    @abstractmethod
    def supports_type(self, element_type: Optional[str]) -> bool:
        """
        Check if the extractor supports the specified element type

        Args:
            element_type: Type of element (e.g. 'table', 'image'Wait.），None Means generic

        Returns:
            Whether or not to support this type
        """
        pass


class MinerUElementExtractor(ElementExtractor):
    """
    Based on MinerU Element extractor (default achieved)）

    From MinerU extracts text, pictures, tables, etc. from the resolution results
    Self-inclusion： handling it yourself PDF Convert、MinerU Parsing, extracting results
    """

    def __init__(self, parser_service, upload_folder: Path):
        """
        Initialize MinerU Ripper

        Args:
            parser_service: FileParserService Examples
            upload_folder: Upload Folder Path
        """
        self._parser_service = parser_service
        self._upload_folder = upload_folder

    def supports_type(self, element_type: Optional[str]) -> bool:
        """MinerU Support all common types (except for special table cells)）"""
        return element_type != 'table_cell'

    def extract(
        self,
        image_path: str,
        element_type: Optional[str] = None,
        **kwargs
    ) -> ExtractionResult:
        """
        Extracting elements from images (auto-procession) PDF Convert and MinerU Parsing）

        Supported kwargs:
        - depth: int, Recursive Depth (for logs)）
        """
        depth = kwargs.get('depth', 0)

        # Get Picture Dimensions
        img = Image.open(image_path)
        image_size = img.size  # (width, height)

        # 1. Check Cache
        cached_dir = self._find_cache(image_path)
        if cached_dir:
            logger.info(f"{'  ' * depth}Usage MinerU Cache")
            mineru_result_dir = cached_dir
            parse_error = None
        else:
            # 2. Parsing Pictures
            mineru_result_dir, parse_error = self._parse_image(image_path, depth)
            if not mineru_result_dir:
                return ExtractionResult(elements=[], error=parse_error)

        # 3. Extract Element
        elements = self._extract_from_result(
            mineru_result_dir=mineru_result_dir,
            target_image_size=image_size,
            depth=depth
        )

        # 4. Return results (with the following)：）
        context = ExtractionContext(
            result_dir=mineru_result_dir,
            metadata={'source': 'mineru', 'image_size': image_size}
        )

        return ExtractionResult(elements=elements, context=context)

    def _find_cache(self, image_path: str) -> Optional[str]:
        """Find Caches MinerU Result"""
        try:
            import hashlib
            import time

            img_path = Path(image_path)
            if not img_path.exists():
                return None

            mineru_files_dir = self._upload_folder / 'mineru_files'
            if not mineru_files_dir.exists():
                return None

            # Simple strategy： no cache (safer)）
            return None

        except Exception as e:
            logger.debug(f"Failed to find cache: {e}")
            return None

    def _parse_image(self, image_path: str, depth: int) -> Tuple[Optional[str], Optional[str]]:
        """Parsing pictures, returning MinerU Results directory and error message

        Returns:
            Tuple of (result_dir, error_message)
        """
        from services.export_service import ExportService

        # Convert to PDF
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_pdf:
            pdf_path = tmp_pdf.name

        try:
            ExportService.create_pdf_from_images([image_path], output_file=pdf_path)

            # Call MinerU Parsing
            image_id = str(uuid.uuid4())[:8]
            batch_id, markdown_content, extract_id, error_message, failed_image_count = \
                self._parser_service.parse_file(pdf_path, f"image_{image_id}.pdf")

            if error_message or not extract_id:
                logger.error(f"{'  ' * depth}MinerU Parsing failed: {error_message}")
                return None, error_message or "MinerU Parsing failed, did not return extract_id"

            mineru_result_dir = (self._upload_folder / 'mineru_files' / extract_id).resolve()
            if not mineru_result_dir.exists():
                err = f"MinerU The result directory does not exist: {mineru_result_dir}"
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
        """From MinerU Extract elements from the results directory"""
        elements = []

        try:
            mineru_dir = Path(mineru_result_dir)

            # Load layout.json and content_list.json
            layout_file = mineru_dir / 'layout.json'
            content_list_files = list(mineru_dir.glob("*_content_list.json"))

            if not layout_file.exists() or not content_list_files:
                logger.warning(f"layout.json or content_list.json does not exist")
                return []

            with open(layout_file, 'r', encoding='utf-8') as f:
                layout_data = json.load(f)

            with open(content_list_files[0], 'r', encoding='utf-8') as f:
                content_list = json.load(f)

            # From layout.json Extract Element
            if 'pdf_info' not in layout_data or not layout_data['pdf_info']:
                return []

            page_info = layout_data['pdf_info'][0]
            source_page_size = page_info.get('page_size', target_image_size)

            # Calculate scaling
            scale_x = target_image_size[0] / source_page_size[0]
            scale_y = target_image_size[1] / source_page_size[1]

            # Generic Functions for Process Blocks
            def process_block(block):
                bbox = block.get('bbox')
                block_type = block.get('type', 'text')
                equation_types = {'equation', 'interline_equation', 'inline_equation'}
                is_equation_source_block = block_type in equation_types

                if not bbox or len(bbox) != 4:
                    return None

                # Filter out. type Yes. header/footer And it’s just... "#" Special Tags
                if block_type in ['header', 'footer']:
                    if block.get('lines'):
                        # Extract all text contents
                        all_text = []
                        for line in block['lines']:
                            for span in line.get('spans', []):
                                if span.get('type') == 'text' and span.get('content'):
                                    all_text.append(span['content'])
                        # If all text is combined only"#"，Skip this block
                        combined_text = ''.join(all_text).strip()
                        if combined_text == '#':
                            return None

                # Scale bbox To Target Size
                scaled_bbox = [
                    bbox[0] * scale_x,
                    bbox[1] * scale_y,
                    bbox[2] * scale_x,
                    bbox[3] * scale_y
                ]

                # Yeah. header/footer，Type to be judged based on actual content
                actual_content_type = 'text' if is_equation_source_block else block_type
                if block_type in ['header', 'footer']:
                    # Check to include pictures
                    has_image = False
                    if block.get('blocks'):
                        for sub_block in block['blocks']:
                            if sub_block.get('type') == 'image_body':
                                has_image = True
                                break

                    # Check to include text
                    has_text = False
                    if block.get('lines'):
                        for line in block['lines']:
                            for span in line.get('spans', []):
                                if span.get('type') in ['text', 'inline_equation'] and span.get('content', '').strip():
                                    has_text = True
                                    break
                            if has_text:
                                break

                    # Actual type judged by content
                    if has_image and not has_text:
                        actual_content_type = 'image'
                    elif has_text:
                        actual_content_type = 'text'  # Yes, sir. header/footer Convert to text
                    else:
                        # Default as text processing
                        actual_content_type = 'text'

                # Auxiliary function： From lines Extracting text
                def extract_text_from_lines(lines, preserve_equations=False):
                    """From lines Numerical extract of all text contents"""
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

                # Ripping content（Text）- Including caption Type
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
                    # list Organisation blocks Subset, each block Yes. lines
                    if block.get('blocks'):
                        all_line_texts = []
                        for sub_block in block['blocks']:
                            if sub_block.get('lines'):
                                sub_texts = extract_text_from_lines(sub_block['lines'])
                                all_line_texts.extend(sub_texts)
                        if all_line_texts:
                            content = '\n'.join(all_line_texts).strip()

                # Ripping img_path（Image/Table）- Convert to Absolute Path
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
                                        # Convert to Absolute Path
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
                    'type': actual_content_type,  # Use actual content type instead of original type
                    'content': content,
                    'image_path': img_path,  # It’s an absolute path.
                    'metadata': {
                        **block,
                        'original_type': block_type  # Keep original type（header/footer）Yes. metadata Medium
                    }
                }

            # Process main content blocks（para_blocks）
            for block in page_info.get('para_blocks', []):
                element = process_block(block)
                if element:
                    elements.append(element)
                # Recursive Processor Block（table_caption, image_caption Wait.）
                # Attention.：list The type of piece already exists. process_block Processed, no recursive return required
                block_type = block.get('type', '')
                if block_type != 'list':
                    for sub_block in block.get('blocks', []):
                        sub_elem = process_block(sub_block)
                        if sub_elem:
                            elements.append(sub_elem)

            # Handle Header Footer（discarded_blocks）
            for block in page_info.get('discarded_blocks', []):
                element = process_block(block)
                if element:
                    elements.append(element)
                # Recursive Processor Block
                # Attention.：list The type of piece already exists. process_block Processed, no recursive return required
                block_type = block.get('type', '')
                if block_type != 'list':
                    for sub_block in block.get('blocks', []):
                        sub_elem = process_block(sub_block)
                        if sub_elem:
                            elements.append(sub_elem)

            logger.info(f"MinerU It’s extracted. {len(elements)} An element")

        except Exception as e:
            logger.error(f"MinerU Failed to extract element: {e}", exc_info=True)

        return elements


class ExtractorRegistry:
    """
    Map registration form for element type to extractor

    Which extractor should be used to manage different types of elements for sub-element extraction：
    - Image/Chart Elements → MinerU Board Analysis
    - Table Elements → 100 Degrees Table OCR
    - Other types → Default Ripper

    Usage：
        >>> registry = ExtractorRegistry()
        >>> registry.register('table', baidu_ocr_extractor)
        >>> registry.register('image', mineru_extractor)
        >>> registry.register_default(mineru_extractor)
        >>>
        >>> extractor = registry.get_extractor('table')  # Back baidu_ocr_extractor
        >>> extractor = registry.get_extractor('chart')  # Back mineru_extractor (Default)
    """

    # Predefined Element Type Grouping
    TABLE_TYPES = {'table', 'table_cell'}
    IMAGE_TYPES = {'image', 'figure', 'chart', 'diagram'}
    TEXT_TYPES = {'text', 'title', 'paragraph', 'header', 'footer', 'list'}

    def __init__(self):
        """Initialization of the registration form"""
        self._type_mapping: Dict[str, ElementExtractor] = {}
        self._default_extractor: Optional[ElementExtractor] = None

    def register(self, element_type: str, extractor: ElementExtractor) -> 'ExtractorRegistry':
        """
        Map of the registered element type to the extractor

        Args:
            element_type: Type of element (e.g. 'table', 'image' Wait.）
            extractor: Corresponding extractor instance

        Returns:
            self，Support chain call
        """
        self._type_mapping[element_type] = extractor
        logger.debug(f"Register extractor: {element_type} -> {extractor.__class__.__name__}")
        return self

    def register_types(self, element_types: List[str], extractor: ElementExtractor) -> 'ExtractorRegistry':
        """
        Batch registration of multiple element types to the same extractor

        Args:
            element_types: List of Elements Type
            extractor: Corresponding extractor instance

        Returns:
            self，Support chain call
        """
        for t in element_types:
            self.register(t, extractor)
        return self

    def register_default(self, extractor: ElementExtractor) -> 'ExtractorRegistry':
        """
        Register the default extractor (used when no specific type map exists)）

        Args:
            extractor: Default extractor instance

        Returns:
            self，Support chain call
        """
        self._default_extractor = extractor
        logger.debug(f"Register Default Ripper: {extractor.__class__.__name__}")
        return self

    def get_extractor(self, element_type: Optional[str]) -> Optional[ElementExtractor]:
        """
        Get the corresponding extractor according to the type of element

        Args:
            element_type: Element Type，None This means using the default extractor

        Returns:
            The corresponding extractor, if not registered, returns the default extractor
        """
        if element_type is None:
            return self._default_extractor

        # Find exact matches first.
        if element_type in self._type_mapping:
            return self._type_mapping[element_type]

        # Return Default Ripper
        return self._default_extractor

    def get_all_extractors(self) -> List[ElementExtractor]:
        """
        Get all registered extractors (drives)）

        Returns:
            Ripper List
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
        Creates a registry for the default configuration

        Default Configuration：
        - Table Type → 100 Degrees Table OCR（If available）
        - Text Type → 100 degrees high accuracy OCR（(if available) MinerU
        - Picture Type → MinerU
        - Other types → MinerU（Default）

        Args:
            mineru_extractor: MinerU Ripper instance
            baidu_ocr_extractor: 100 Degrees Table OCR Example of extractor (optional)）
            baidu_accurate_ocr_extractor: 100 degrees high accuracy OCR Example of extractor (optional)）

        Returns:
            configured registry instance
        """
        registry = cls()

        # Set Default Ripper
        registry.register_default(mineru_extractor)

        # Use picture type MinerU
        registry.register_types(list(cls.IMAGE_TYPES), mineru_extractor)

        # Use 100-degree tables for table type OCR（if available) MinerU
        table_extractor = baidu_ocr_extractor if baidu_ocr_extractor else mineru_extractor
        registry.register_types(list(cls.TABLE_TYPES), table_extractor)

        # Use 100 degrees of precision for text type OCR（if available) MinerU
        text_extractor = baidu_accurate_ocr_extractor if baidu_accurate_ocr_extractor else mineru_extractor
        registry.register_types(list(cls.TEXT_TYPES), text_extractor)

        logger.info(f"Create Default ExtractorRegistry: "
                   f"Table->{table_extractor.__class__.__name__}, "
                   f"Text->{text_extractor.__class__.__name__}, "
                   f"Image->{mineru_extractor.__class__.__name__}")

        return registry
