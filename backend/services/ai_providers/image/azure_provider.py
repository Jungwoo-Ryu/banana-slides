"""GPT Image 2 generation/editing through the company Azure deployment."""
import base64
import math
from contextlib import ExitStack
from io import BytesIO
from PIL import Image
from .base import ImageProvider


def image_size(aspect_ratio, resolution):
    try:
        w, h = map(float, aspect_ratio.split(':'))
        if not all(math.isfinite(x) and x > 0 for x in (w, h)) or max(w/h, h/w) > 3:
            raise ValueError()
    except (ValueError, AttributeError):
        raise ValueError('이미지 비율은 최대 3:1 범위의 올바른 비율이어야 합니다.')
    edge = {'1K': 1024, '2K': 2048, '4K': 3840}.get(resolution)
    if not edge:
        raise ValueError('지원하지 않는 이미지 해상도입니다.')
    scale = edge / max(w, h)
    w, h = max(16, int(w*scale/16)*16), max(16, int(h*scale/16)*16)
    if w*h > 8_294_400:
        scale = math.sqrt(8_294_400/(w*h))
        w, h = int(w*scale/16)*16, int(h*scale/16)*16
    return f'{w}x{h}'


class AzureImageProvider(ImageProvider):
    def __init__(self, api_key, api_base, deployment, api_version, image_quality='auto', format='azure'):
        from services.ai_providers import azure_client
        self.client = azure_client(dict(api_key=api_key, api_base=api_base, api_version=api_version))
        self.model = 'gpt-image-2'
        self.request_model = deployment
        self.image_quality = image_quality

    def generate_image(self, prompt, ref_images=None, aspect_ratio='16:9', resolution='2K',
                       enable_thinking=False, thinking_budget=0):
        if self.image_quality not in {'auto', 'low', 'medium', 'high'}:
            raise ValueError('이미지 품질은 auto, low, medium, high 중 하나여야 합니다.')
        params = dict(model=self.request_model, prompt=prompt, n=1,
                      size=image_size(aspect_ratio, resolution), quality=self.image_quality)
        if len(ref_images or []) > 16:
            raise ValueError('참고 이미지는 최대 16개까지 사용할 수 있습니다.')
        with ExitStack() as stack:
            if ref_images:
                files = []
                for index, image in enumerate(ref_images):
                    buffer = stack.enter_context(BytesIO())
                    mode = 'RGBA' if 'A' in image.getbands() or 'transparency' in image.info else 'RGB'
                    with image.convert(mode) as normalized:
                        normalized.save(buffer, format='PNG')
                    buffer.seek(0)
                    files.append((f'reference-{index}.png', buffer, 'image/png'))
                response = self.client.images.edit(image=files, **params)
            else:
                response = self.client.images.generate(**params)
        if not response.data or not response.data[0].b64_json:
            raise ValueError('Azure 이미지 응답에 이미지 데이터가 없습니다.')
        with BytesIO(base64.b64decode(response.data[0].b64_json, validate=True)) as data:
            with Image.open(data) as result:
                result.load()
                return result.copy()
