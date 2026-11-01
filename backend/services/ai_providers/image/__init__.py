"""Azure image generation and local subject extraction interfaces."""
from .base import ImageProvider
from .subject_extraction_provider import SubjectExtractionProvider
from .rmbg_segmentation_provider import RmbgSegmentationProvider, create_rmbg_segmentation_provider
