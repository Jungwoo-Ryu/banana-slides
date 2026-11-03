"""
Element Ripper - The abstraction of different methods of element identification

Organisation：
- ElementExtractor: Extractor Abstract Interface
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
            result_dir: Summary of results (e.g., local document parser Output Directory）
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
    - local document parser Parser (Current Default)）
    - Local OCR
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


class ExtractorRegistry:
    """
    Map registration form for element type to extractor

    Which extractor should be used to manage different types of elements for sub-element extraction：
    - Image/Chart Elements → Configured local extraction
    - Table Elements → Configured local OCR
    - Other types → Default Ripper

    Usage：
        >>> registry = ExtractorRegistry()
        >>> registry.register('table', ocr_extractor)
        >>> registry.register('image', local_extractor)
        >>> registry.register_default(local_extractor)
        >>>
        >>> extractor = registry.get_extractor('table')  # Back ocr_extractor
        >>> extractor = registry.get_extractor('chart')  # Back local_extractor (Default)
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
