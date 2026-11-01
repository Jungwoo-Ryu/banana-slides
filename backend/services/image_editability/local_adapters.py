"""Adapters from configurable OCR and local inpainting into editable PPTX."""
from PIL import Image
from .extractors import ElementExtractor, ExtractionResult
from .inpaint_providers import InpaintProvider
from services.document_providers import get_ocr_provider


class ConfiguredOCRExtractor(ElementExtractor):
    def supports_type(self, element_type):
        return True

    def extract(self, image_path, element_type=None, **kwargs):
        with Image.open(image_path) as image:
            elements = get_ocr_provider().recognize(image)
        return ExtractionResult(elements=elements)


class LocalInpaintProvider(InpaintProvider):
    def inpaint_regions(self, image, bboxes, types=None, **kwargs):
        import cv2
        import numpy as np
        pixels = np.array(image.convert('RGB'))
        mask = np.zeros(pixels.shape[:2], dtype=np.uint8)
        for x0,y0,x1,y1 in bboxes:
            x0=max(0,int(x0)-2); y0=max(0,int(y0)-2)
            x1=min(image.width,int(x1)+2); y1=min(image.height,int(y1)+2)
            mask[y0:y1,x0:x1] = 255
        return Image.fromarray(cv2.inpaint(pixels, mask, 3, cv2.INPAINT_TELEA))


from .text_attribute_extractors import TextAttributeExtractor, TextStyleResult


class LocalTextAttributeExtractor(TextAttributeExtractor):
    """Estimate a single foreground color; no hidden vision-model requests."""
    def supports_batch(self):
        return False

    def extract(self, image, text_content=None, **kwargs):
        import numpy as np
        if isinstance(image, (str, __import__('pathlib').Path)):
            with Image.open(image) as source:
                pixels = np.array(source.convert('RGB'), dtype=float)
        else:
            pixels = np.array(image.convert('RGB'), dtype=float)
        border = np.concatenate([pixels[0], pixels[-1], pixels[:, 0], pixels[:, -1]])
        background = np.median(border, axis=0)
        distance = np.linalg.norm(pixels - background, axis=2)
        foreground = pixels[distance >= max(25, float(np.percentile(distance, 85)))]
        color = tuple(int(x) for x in np.median(foreground, axis=0)) if len(foreground) else (0,0,0)
        return TextStyleResult(font_color_rgb=color, confidence=.5, metadata={'method': 'local_color_estimate'})
