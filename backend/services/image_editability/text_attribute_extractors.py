"""
Text Properties Ripper - Visual properties of extracting text from text area images

Organisation：
- TextStyleResult: Text Style Data Structure
- TextAttributeExtractor: Extractor Abstract Interface
- CaptionModelTextAttributeExtractor: Based on Caption Model Default Realization
- TextAttributeExtractorRegistry: Extractor Registration Form
"""
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from typing import Dict, Any, List, Optional, Tuple, Union
from PIL import Image
from services.prompts import get_text_attribute_extraction_prompt

logger = logging.getLogger(__name__)


@dataclass
class ColoredSegment:
    """
    Coloured Text Snippets

    To represent a text and its colour, support LaTeX Formula
    """
    text: str  # Text content (if it is a formula) LaTeX Format）
    color_rgb: Tuple[int, int, int] = (0, 0, 0)  # RGB Colours (0-255)
    is_latex: bool = False  # Whether it is LaTeX Formula

    def to_dict(self) -> Dict[str, Any]:
        """Convert to Dictionary"""
        result = {
            'text': self.text,
            'color': f"#{self.color_rgb[0]:02x}{self.color_rgb[1]:02x}{self.color_rgb[2]:02x}"
        }
        if self.is_latex:
            result['is_latex'] = True
        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ColoredSegment':
        """Create instance from dictionary"""
        text = data.get('text', '')
        color = data.get('color', '#000000')
        is_latex = bool(data.get('is_latex', False))

        # Parsing Colours
        if isinstance(color, str):
            color = color.lstrip('#')
            if len(color) == 3:
                color = ''.join(c * 2 for c in color)
            try:
                r = int(color[0:2], 16)
                g = int(color[2:4], 16)
                b = int(color[4:6], 16)
                color_rgb = (r, g, b)
            except (ValueError, IndexError):
                color_rgb = (0, 0, 0)
        else:
            color_rgb = (0, 0, 0)
        return cls(text=text, color_rgb=color_rgb, is_latex=is_latex)


@dataclass
class TextStyleResult:
    """
    Text Style Data Structure

    Include visual properties extracted from text area images

    Note:
        The font size is not extracted here because it’s a cut-up submap that cannot be estimated accurately。
        Font size should be PPTXBuilder.calculate_font_size Based on bbox Calculate。
    """
    # Font Colours RGB (0-255) - Default colour for whole colour or bottom
    font_color_rgb: Tuple[int, int, int] = (0, 0, 0)

    # Colored Text Snippet List - Supports multiple colours for one line of text
    # If there’s a value, use this first when rendering, and the text will follow here.
    colored_segments: List[ColoredSegment] = field(default_factory=list)

    # Bold or not
    is_bold: bool = False

    # Italics
    is_italic: bool = False

    # Is there a underline?
    is_underline: bool = False

    # Text Alignment - Optional ('left', 'center', 'right', 'justify')
    text_alignment: Optional[str] = None

    # Confidence (0.0-1.0)
    confidence: float = 1.0

    # Additional metadata
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to Dictionary"""
        result = asdict(self)
        # Yes, sir. tuple Convert to list In order to JSON Sequenced
        result['font_color_rgb'] = list(self.font_color_rgb)
        # Convert colored_segments
        result['colored_segments'] = [seg.to_dict() if isinstance(seg, ColoredSegment) else seg for seg in self.colored_segments]
        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TextStyleResult':
        """Create instance from dictionary"""
        if 'font_color_rgb' in data and isinstance(data['font_color_rgb'], list):
            data['font_color_rgb'] = tuple(data['font_color_rgb'])
        # Convert colored_segments
        if 'colored_segments' in data:
            data['colored_segments'] = [
                ColoredSegment.from_dict(seg) if isinstance(seg, dict) else seg
                for seg in data['colored_segments']
            ]
        return cls(**data)

    def get_hex_color(self) -> str:
        """Fetch hexadecimal colour value (default colour)）"""
        r, g, b = self.font_color_rgb
        return f"#{r:02x}{g:02x}{b:02x}"

    def get_full_text(self) -> str:
        """Fetch full text content (from colored_segments Collapse）"""
        if self.colored_segments:
            return ''.join(seg.text for seg in self.colored_segments)
        return ""

    def has_multi_color(self) -> bool:
        """Are there multiple colours?"""
        if not self.colored_segments or len(self.colored_segments) <= 1:
            return False
        colors = set(seg.color_rgb for seg in self.colored_segments)
        return len(colors) > 1


class TextAttributeExtractor(ABC):
    """
    Text Properties Extractor Abstract Interface

    Visual properties used to extract text from text area images to support multiple access realizations：
    - CaptionModelTextAttributeExtractor: Use visual language models (e.g. Gemini）Analyse Images
    - The future is scalable： based on tradition CV methodology, special OCR Models, etc.
    """

    @abstractmethod
    def extract(
        self,
        image: Union[str, Image.Image],
        text_content: Optional[str] = None,
        **kwargs
    ) -> TextStyleResult:
        """
        Extract text style properties from text area images

        Args:
            image: Image in text area, which can be a file path or PIL Image Object
            text_content: Text content (optional, some realizations may be used to support identification)）
            **kwargs: Other self-defined parameters by concrete achievement

        Returns:
            TextStyleResult Object, contains extracted text style properties
        """
        pass

    @abstractmethod
    def supports_batch(self) -> bool:
        """
        Whether batch processing is supported

        Returns:
            If batch processing returns are supported True
        """
        pass

    def extract_batch(
        self,
        items: List[Tuple[Union[str, Image.Image], Optional[str]]],
        **kwargs
    ) -> List[TextStyleResult]:
        """
        Batch extraction text style properties

        Default realization： call-by-call extract Methodology
        Subcategory to overwrite this method to achieve more efficient batch processing

        Args:
            items: List, each element is (image, text_content) Divisions
            **kwargs: Other parameters

        Returns:
            TextStyleResult List
        """
        results = []
        for image, text_content in items:
            try:
                result = self.extract(image, text_content, **kwargs)
                results.append(result)
            except Exception as e:
                logger.error(f"Batch extraction of text properties failed: {e}")
                # Returns the default result
                results.append(TextStyleResult(confidence=0.0))
        return results


class CaptionModelTextAttributeExtractor(TextAttributeExtractor):
    """
    Based on Caption Model（Text Properties Extractor for Visual Language Models)

    Use visual language models (e.g. Gemini）Analyse text area images，
    By Generating JSON to get the font colour, boldness, italics, etc.。
    """
    @staticmethod
    def build_prompt(text_content: Optional[str] = None) -> str:
        """
        Build consolidated prompt
        If... text_content Insert a hint if there is a presence, otherwise omitted
        """
        if text_content:
            content_hint = f'The text in the picture is：: "{text_content}"'
        else:
            content_hint = ""
        return get_text_attribute_extraction_prompt(content_hint=content_hint)

    def __init__(self, ai_service, prompt_template: Optional[str] = None):
        """
        Initialize Caption Model Text Properties Ripper

        Args:
            ai_service: AIService Examples (support required) generate_json Method and Picture Input）
            prompt_template: Custom prompt Template (optional), must be used {content_hint} As Placeholder
        """
        self.ai_service = ai_service
        self.prompt_template = prompt_template

    def supports_batch(self) -> bool:
        """Do not currently support batch processing"""
        return False

    def extract(
        self,
        image: Union[str, Image.Image],
        text_content: Optional[str] = None,
        **kwargs
    ) -> TextStyleResult:
        """
        Usage Caption Model Extract text style properties

        Args:
            image: Image in text area
            text_content: Text content (optional, to assist in identification)）
            **kwargs:
                - thinking_budget: int, Think budget, default. 500

        Returns:
            TextStyleResult Object
        """
        thinking_budget = kwargs.get('thinking_budget', 500)

        try:
            # Prepare the pictures.
            if isinstance(image, str):
                pil_image = Image.open(image)
            else:
                pil_image = image

            # Build prompt
            # Unique use content_hint Format
            if text_content:
                content_hint = f'The text in the picture is：: "{text_content}"'
            else:
                content_hint = ""

            if self.prompt_template:
                # Custom template must be used {content_hint} Placeholder
                prompt = self.prompt_template.format(content_hint=content_hint)
            else:
                prompt = get_text_attribute_extraction_prompt(content_hint=content_hint)

            # Call AI Service (needs to support photo input) generate_json）
            # Here’s the assumption. text_provider Support for those with pictures generate Methodology
            result_json = self._call_vision_model(pil_image, prompt, thinking_budget)

            # Parsing Results
            return self._parse_result(result_json)

        except Exception as e:
            logger.error(f"CaptionModelTextAttributeExtractor Ripping failed: {e}", exc_info=True)
            return TextStyleResult(confidence=0.0, metadata={'error': str(e)})

    def _call_vision_model(self, image: Image.Image, prompt: str, thinking_budget: int) -> Dict[str, Any]:
        """
        Call visual language model, use ai_service.generate_json_with_image（With a retest mechanism）

        Args:
            image: PIL Image Object
            prompt: Phrasing
            thinking_budget: Thinking about the budget

        Returns:
            After parsing JSON Result
        """
        import tempfile
        import os

        # Save temporary photo files
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp_file:
            tmp_path = tmp_file.name
            image.save(tmp_path)

        try:
            # Usage ai_service.generate_json_with_image（With a retest mechanism）
            result = self.ai_service.generate_json_with_image(
                prompt=prompt,
                image_path=tmp_path,
                thinking_budget=thinking_budget
            )
            return result if isinstance(result, dict) else {}

        except ValueError as e:
            if "Image input is not supported" in str(e):
                raise RuntimeError(f"The current image style extraction model does not support photo input: {e}") from e
            raise RuntimeError(f"Visual model returns content undefeated: {e}") from e

        except Exception as e:
            raise RuntimeError(f"Failed to call visual model to extract text styles: {e}") from e

        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    @staticmethod
    def _hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
        """
        Convert hexadecimal colour to RGB Divisions

        Args:
            hex_color: Hexadecimal colours, e. g. "#FF6B6B" or "FF6B6B"

        Returns:
            RGB Divisions (R, G, B)
        """
        # Remove # Prefix
        hex_color = hex_color.lstrip('#')

        # Process Scrutiny Formats (Like #FFF -> #FFFFFF)
        if len(hex_color) == 3:
            hex_color = ''.join(c * 2 for c in hex_color)

        if len(hex_color) != 6:
            return (0, 0, 0)  # Invalid format, return black

        try:
            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16)
            b = int(hex_color[4:6], 16)
            return (r, g, b)
        except ValueError:
            return (0, 0, 0)

    def _parse_result(self, result_json: Dict[str, Any]) -> TextStyleResult:
        """
        Parsing AI Returned JSON Result

        Args:
            result_json: AI Returned JSON Dictionary, supporting both formats：
                - New format： Include colored_segments Array (text)-Colours）
                - Old format： Include font_color Single Colour

        Returns:
            TextStyleResult Object
        """
        if not result_json:
            return TextStyleResult(
                confidence=0.0,
                metadata={'error': 'The visual model does not return the parseable style result'}
            )

        try:
            # Parsing colored_segments（New format： Support a row of multiple colours）
            colored_segments = []
            segments_data = result_json.get('colored_segments', [])

            if segments_data and isinstance(segments_data, list):
                for seg in segments_data:
                    if isinstance(seg, dict):
                        colored_segments.append(ColoredSegment.from_dict(seg))

            # Calculates the default colour (from segments Take the first one, or the old one. font_color）
            if colored_segments:
                font_color_rgb = colored_segments[0].color_rgb
            else:
                # Compatible with old format
                font_color_hex = result_json.get('font_color', '#000000')
                if isinstance(font_color_hex, str):
                    font_color_rgb = self._hex_to_rgb(font_color_hex)
                else:
                    font_color_rgb = (0, 0, 0)

            # Parsing Boolean Values
            is_bold = bool(result_json.get('is_bold', False))
            is_italic = bool(result_json.get('is_italic', False))
            is_underline = bool(result_json.get('is_underline', False))

            # Parsing Text Alignment
            text_alignment = result_json.get('text_alignment')
            if text_alignment not in ('left', 'center', 'right', 'justify', None):
                text_alignment = None

            return TextStyleResult(
                font_color_rgb=font_color_rgb,
                colored_segments=colored_segments,
                is_bold=is_bold,
                is_italic=is_italic,
                is_underline=is_underline,
                text_alignment=text_alignment,
                confidence=0.9,  # The result of the model’s return gives higher confidence
                metadata={'source': 'caption_model', 'raw_response': result_json}
            )

        except Exception as e:
            logger.error(f"Parsing result failed: {e}")
            return TextStyleResult(confidence=0.0, metadata={'error': str(e)})

    def extract_batch_with_full_image(
        self,
        full_image: Union[str, Image.Image],
        text_elements: List[Dict[str, Any]],
        **kwargs
    ) -> Dict[str, TextStyleResult]:
        """
        【New Logic】One-time extract style properties of all text elements using the full chart

        Advantages： The model can see the global context and improve analytical accuracy

        Args:
            full_image: Full page picture, which can be a file path or PIL Image Object
            text_elements: List of text elements, each element contains：
                - element_id: Unique identification of elements
                - bbox: Boundary Border [x0, y0, x1, y1]
                - content: Text content
            **kwargs:
                - thinking_budget: int, Think budget, default. 1000

        Returns:
            dictionaries，key Yes. element_id，value Yes. TextStyleResult
        """
        import json
        import tempfile
        from services.prompts import get_batch_text_attribute_extraction_prompt

        thinking_budget = kwargs.get('thinking_budget', 1000)

        if not text_elements:
            return {}

        try:
            # Prepare the pictures.
            if isinstance(full_image, str):
                pil_image = Image.open(full_image)
                tmp_path = full_image  # If it’s already a path, use it directly.
                need_cleanup = False
            else:
                pil_image = full_image
                # Save temporary photo files
                with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp_file:
                    tmp_path = tmp_file.name
                    pil_image.save(tmp_path)
                need_cleanup = True

            # Build text elements JSON Description
            elements_for_prompt = []
            for elem in text_elements:
                elements_for_prompt.append({
                    'element_id': elem['element_id'],
                    'bbox': elem['bbox'],
                    'content': elem['content']
                })

            text_elements_json = json.dumps(elements_for_prompt, ensure_ascii=False, indent=2)

            # Build prompt
            prompt = get_batch_text_attribute_extraction_prompt(text_elements_json)

            # Call ai_service.generate_json_with_image（With a retest mechanism）
            try:
                result = self.ai_service.generate_json_with_image(
                    prompt=prompt,
                    image_path=tmp_path,
                    thinking_budget=thinking_budget
                )

                # Make sure the results are on the list.
                if isinstance(result, list):
                    result_list = result
                elif isinstance(result, dict):
                    # If returned is a dictionary, try to get a list
                    result_list = result.get('results', [result])
                else:
                    result_list = []

                # Parsing Results
                return self._parse_batch_result(result_list, text_elements)

            except ValueError as e:
                if "Image input is not supported" in str(e):
                    raise RuntimeError(f"The current image style extraction model does not support photo input: {e}") from e
                raise RuntimeError(f"Visual model returns content undefeated: {e}") from e

            except Exception as e:
                raise RuntimeError(f"Batch calls for visual models to extract text style failed: {e}") from e

            finally:
                if need_cleanup:
                    import os
                    if os.path.exists(tmp_path):
                        os.remove(tmp_path)

        except Exception as e:
            logger.error(f"Batch extraction of text properties failed: {e}", exc_info=True)
            raise

    def _parse_batch_result(
        self,
        result_list: List[Dict[str, Any]],
        original_elements: List[Dict[str, Any]]
    ) -> Dict[str, TextStyleResult]:
        """
        Parsing batch extracts AI Return Result

        Args:
            result_list: AI Returned JSON list, each element contains style properties
            original_elements: List of elements originally entered for matching element_id

        Returns:
            dictionaries，key Yes. element_id，value Yes. TextStyleResult
        """
        results = {}

        # Create element_id Map to original element for regression
        original_map = {elem['element_id']: elem for elem in original_elements}

        for item in result_list:
            try:
                element_id = item.get('element_id')
                if not element_id:
                    continue

                # Parsing colours (hexadecimal format)）
                font_color_hex = item.get('font_color', '#000000')
                if isinstance(font_color_hex, str):
                    font_color_rgb = self._hex_to_rgb(font_color_hex)
                else:
                    font_color_rgb = (0, 0, 0)

                # Parsing Boolean Values
                is_bold = bool(item.get('is_bold', False))
                is_italic = bool(item.get('is_italic', False))
                is_underline = bool(item.get('is_underline', False))

                # Parsing Text Alignment
                text_alignment = item.get('text_alignment')
                if text_alignment not in ('left', 'center', 'right', 'justify', None):
                    text_alignment = None

                results[element_id] = TextStyleResult(
                    font_color_rgb=font_color_rgb,
                    is_bold=is_bold,
                    is_italic=is_italic,
                    is_underline=is_underline,
                    text_alignment=text_alignment,
                    confidence=0.9,
                    metadata={'source': 'batch_caption_model', 'raw_response': item}
                )

            except Exception as e:
                logger.warning(f"Parsing Elements {item.get('element_id', 'unknown')} Style failed: {e}")
                continue

        logger.info(f"Batch resolution complete.: Success {len(results)}/{len(original_elements)} An element")
        return results


class TextAttributeExtractorRegistry:
    """
    Text Properties Extracter Registration Table

    Which text attribute extractor should be used to manage different element types：
    - Normal Text → CaptionModelTextAttributeExtractor
    - Title text → Ripper with different configurations
    - Other types → Default Ripper

    Usage：
        >>> registry = TextAttributeExtractorRegistry()
        >>> registry.register('text', caption_extractor)
        >>> registry.register('title', title_extractor)
        >>> registry.register_default(caption_extractor)
        >>>
        >>> extractor = registry.get_extractor('text')
        >>> extractor = registry.get_extractor('unknown_type')  # Return Default Ripper
    """

    # Predefined Element Type Grouping
    TEXT_TYPES = {'text', 'title', 'paragraph', 'heading', 'header', 'footer', 'list'}
    TABLE_TEXT_TYPES = {'table_cell'}

    def __init__(self):
        """Initialization of the registration form"""
        self._type_mapping: Dict[str, TextAttributeExtractor] = {}
        self._default_extractor: Optional[TextAttributeExtractor] = None

    def register(self, element_type: str, extractor: TextAttributeExtractor) -> 'TextAttributeExtractorRegistry':
        """
        Map of the registered element type to the extractor

        Args:
            element_type: Type of element (e.g. 'text', 'title' Wait.）
            extractor: Corresponding extractor instance

        Returns:
            self，Support chain call
        """
        self._type_mapping[element_type] = extractor
        logger.debug(f"Register Text Properties Ripper: {element_type} -> {extractor.__class__.__name__}")
        return self

    def register_types(self, element_types: List[str], extractor: TextAttributeExtractor) -> 'TextAttributeExtractorRegistry':
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

    def register_default(self, extractor: TextAttributeExtractor) -> 'TextAttributeExtractorRegistry':
        """
        Register the default extractor (used when no specific type map exists)）

        Args:
            extractor: Default extractor instance

        Returns:
            self，Support chain call
        """
        self._default_extractor = extractor
        logger.debug(f"Register the default text properties extractor: {extractor.__class__.__name__}")
        return self

    def get_extractor(self, element_type: Optional[str]) -> Optional[TextAttributeExtractor]:
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

    def get_all_extractors(self) -> List[TextAttributeExtractor]:
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
        caption_extractor: Optional[TextAttributeExtractor] = None
    ) -> 'TextAttributeExtractorRegistry':
        """
        Creates a registry for the default configuration

        Default Configuration：
        - All Text Types → CaptionModelTextAttributeExtractor
        - Other types → Default Ripper

        Args:
            caption_extractor: Caption Model Ripper instance

        Returns:
            configured registry instance
        """
        registry = cls()

        if not caption_extractor:
            logger.warning("Create TextAttributeExtractorRegistry No information provided extractor")
            return registry

        # Set Default Ripper
        registry.register_default(caption_extractor)

        # Use the same extractor for all text types
        registry.register_types(list(cls.TEXT_TYPES), caption_extractor)
        registry.register_types(list(cls.TABLE_TEXT_TYPES), caption_extractor)

        logger.info(f"Create Default TextAttributeExtractorRegistry: "
                   f"Default Ripper->{caption_extractor.__class__.__name__}")

        return registry
