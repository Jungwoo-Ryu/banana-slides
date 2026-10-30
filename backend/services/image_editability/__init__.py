"""
Photo Editable Service Module

Core design：
- No status service - Threads are secure. We can call in parallel.
- Reliance on injection - Injecting all dependencies by Configure Object
- Single responsibilities - Only editable single picture, batch processing controlled by caller

Component：
- Data Model（BBox, EditableElement, EditableImage）
- Element Ripper（ElementExtractor and its realization）
- Inpaint Provider（InpaintProvider and its realization）
- Plant and configuration（ServiceConfig）
- Main service category（ImageEditabilityService）

Example:
    >>> from services.image_editability import ServiceConfig, ImageEditabilityService
    >>>
    >>> # Create Configuration
    >>> config = ServiceConfig.from_defaults(mineru_token="your_token")
    >>>
    >>> # Create Service
    >>> service = ImageEditabilityService(config)
    >>>
    >>> # Serial processing
    >>> result = service.make_image_editable("image.png")
    >>>
    >>> # Parallel processing (recommended)）
    >>> from concurrent.futures import ThreadPoolExecutor, as_completed
    >>>
    >>> images = ["img1.png", "img2.png", "img3.png"]
    >>> with ThreadPoolExecutor(max_workers=4) as executor:
    ...     futures = {executor.submit(service.make_image_editable, img): img
    ...                for img in images}
    ...     results = {images[i]: future.result()
    ...                for i, future in enumerate(as_completed(futures))}
"""

# Data Model
from .data_models import BBox, EditableElement, EditableImage

# Coordinate Map
from .coordinate_mapper import CoordinateMapper

# Element Ripper
from .extractors import (
    ElementExtractor,
    MinerUElementExtractor,
    ExtractorRegistry
)

# Mixed Ripper

# Inpaint Provider
from .inpaint_providers import (
    InpaintProvider,
    DefaultInpaintProvider,
    GenerativeEditInpaintProvider,
    InpaintProviderRegistry
)

# Text Properties Ripper
from .text_attribute_extractors import (
    TextStyleResult,
    TextAttributeExtractor,
    CaptionModelTextAttributeExtractor,
    TextAttributeExtractorRegistry
)

# Plant and configuration
from .factories import (
    TextAttributeExtractorFactory,
    ServiceConfig
)

# Main Services
from .service import ImageEditabilityService

__all__ = [
    # Data Model
    'BBox',
    'EditableElement',
    'EditableImage',
    # Coordinate Map
    'CoordinateMapper',
    # Element Ripper
    'ElementExtractor',
    'MinerUElementExtractor',
    'ExtractorRegistry',
    # Mixed Ripper
    # Inpaint Provider
    'InpaintProvider',
    'DefaultInpaintProvider',
    'GenerativeEditInpaintProvider',
    'InpaintProviderRegistry',
    # Text Properties Ripper
    'TextStyleResult',
    'TextAttributeExtractor',
    'CaptionModelTextAttributeExtractor',
    'TextAttributeExtractorRegistry',
    # Plant and configuration
    'TextAttributeExtractorFactory',
    'ServiceConfig',
    # Main Services
    'ImageEditabilityService',
]

