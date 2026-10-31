"""Subject extraction provider Compatible Layer。"""
from typing import Optional, Protocol, runtime_checkable

from PIL import Image


@runtime_checkable
class SubjectExtractionProvider(Protocol):
    """Main Cursor provider Compatible Layer。

    Anything achieved extract_subject I’ll be able to use them all. provider，
    It’s easy for the future from locally. RMBG ONNX Cut BRIA Host API Wait.。
    """

    def extract_subject(self, image: Image.Image) -> Optional[Image.Image]:
        """Enter any type mode PIL Image，Back RGBA main maps;failures None。"""
        ...
