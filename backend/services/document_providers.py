"""Replaceable document/OCR boundaries. Local by default, explicit HTTP opt-in."""
from abc import ABC, abstractmethod
from pathlib import Path
import os
from services.runtime_config import setting, secret
from services.http_transport import validate_endpoint


class DocumentProvider(ABC):
    @abstractmethod
    def parse(self, path: str, filename: str) -> str: ...


class LocalDocumentProvider(DocumentProvider):
    def parse(self, path, filename):
        ext = Path(filename).suffix.lower()
        if ext in ('.txt', '.md', '.csv'):
            return Path(path).read_text(encoding='utf-8-sig')
        if ext == '.pdf':
            import fitz
            parts = []
            with fitz.open(path) as doc:
                for page in doc:
                    text = page.get_text().strip()
                    if not text:
                        from PIL import Image
                        import io
                        image = Image.open(io.BytesIO(page.get_pixmap(matrix=fitz.Matrix(2, 2)).tobytes('png')))
                        text = '\n'.join(item['content'] for item in get_ocr_provider().recognize(image))
                    parts.append(text)
            return '\n\n'.join(parts)
        if ext in ('.docx', '.pptx', '.xlsx', '.xls'):
            from markitdown import MarkItDown
            return MarkItDown(enable_plugins=False).convert(path).text_content
        raise ValueError('지원하지 않는 로컬 문서 형식입니다. PDF, DOCX, PPTX, XLSX, TXT 또는 Markdown을 사용하세요.')


class HttpDocumentProvider(DocumentProvider):
    def parse(self, path, filename):
        import requests
        url = validate_endpoint(setting('DOCUMENT_PARSER_URL', ''))
        headers = {'Authorization': f'Bearer {secret("DOCUMENT_PARSER_TOKEN")}'} if secret('DOCUMENT_PARSER_TOKEN') else {}
        with open(path, 'rb') as file:
            response = requests.post(url, files={'file': (filename, file)}, headers=headers, timeout=300)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data.get('markdown'), str):
            raise ValueError('문서 서비스가 올바른 Markdown 응답을 반환하지 않았습니다.')
        return data['markdown']


def get_document_provider():
    provider = setting('DOCUMENT_PARSER', 'local')
    if provider == 'local': return LocalDocumentProvider()
    if provider == 'http': return HttpDocumentProvider()
    raise ValueError('문서 제공자는 local, http 또는 명시적으로 구성한 mineru를 사용하세요.')


class OCRProvider(ABC):
    @abstractmethod
    def recognize(self, image) -> list[dict]: ...

    def health(self):
        return {'provider': type(self).__name__}


class LocalOCRProvider(OCRProvider):
    def health(self):
        import pytesseract
        if setting('TESSERACT_CMD'):
            pytesseract.pytesseract.tesseract_cmd = setting('TESSERACT_CMD')
        try:
            version = str(pytesseract.get_tesseract_version())
            available = pytesseract.get_languages(config='')
        except Exception as error:
            raise ValueError('로컬 OCR을 사용하려면 Tesseract와 한국어 언어 데이터를 설치하고 TESSERACT_CMD를 설정하세요.') from error
        missing = set(str(setting('OCR_LANGUAGES', 'kor+eng')).split('+')) - set(available)
        if missing:
            raise ValueError('Tesseract 언어 데이터가 없습니다: ' + ', '.join(sorted(missing)))
        return {'provider': 'local', 'version': version, 'languages': available}

    def recognize(self, image):
        import pytesseract
        self.health()
        data = pytesseract.image_to_data(image, lang=setting('OCR_LANGUAGES', 'kor+eng'), output_type=pytesseract.Output.DICT)
        lines = {}
        for i, value in enumerate(data['text']):
            if not value.strip() or float(data['conf'][i]) < 20: continue
            key = (data['block_num'][i], data['par_num'][i], data['line_num'][i])
            x, y, w, h = (int(data[k][i]) for k in ('left','top','width','height'))
            entry = lines.setdefault(key, {'type': 'text', 'bbox': [x,y,x+w,y+h], 'content': '', 'metadata': {}})
            entry['content'] = (entry['content'] + ' ' + value).strip()
            b = entry['bbox']; entry['bbox'] = [min(x,b[0]), min(y,b[1]), max(x+w,b[2]), max(y+h,b[3])]
        return list(lines.values())


class HttpOCRProvider(OCRProvider):
    def recognize(self, image):
        import requests
        from io import BytesIO
        buffer = BytesIO(); image.convert('RGB').save(buffer, format='PNG')
        url = validate_endpoint(setting('OCR_API_URL', ''))
        headers = {'Authorization': f'Bearer {secret("OCR_API_KEY")}'} if secret('OCR_API_KEY') else {}
        response = requests.post(url, files={'file': ('slide.png', buffer.getvalue(), 'image/png')}, headers=headers, timeout=300)
        response.raise_for_status()
        elements = response.json().get('elements')
        if not isinstance(elements, list): raise ValueError('OCR 응답에 elements 배열이 없습니다.')
        for e in elements:
            bbox = e.get('bbox')
            if not isinstance(bbox, list) or len(bbox) != 4 or not all(isinstance(x,(int,float)) for x in bbox):
                raise ValueError('OCR 응답의 좌표가 올바르지 않습니다.')
            if not 0 <= bbox[0] < bbox[2] <= image.width or not 0 <= bbox[1] < bbox[3] <= image.height:
                raise ValueError('OCR 좌표는 원본 이미지 픽셀 범위 안에 있어야 합니다.')
            if e.get('type', 'text') not in ('text', 'title', 'image', 'figure', 'table', 'equation'):
                raise ValueError('OCR 요소 유형을 확인하세요.')
            if not isinstance(e.get('content', ''), str): raise ValueError('OCR 텍스트를 확인하세요.')
            # Never accept arbitrary local filesystem paths from remote services.
            e.pop('image_path', None)
        return elements

    def health(self):
        from PIL import Image
        self.recognize(Image.new('RGB', (128,128), 'white'))
        return {'provider':'http'}


def get_ocr_provider():
    provider = setting('OCR_PROVIDER', 'local')
    if provider == 'local': return LocalOCRProvider()
    if provider == 'http': return HttpOCRProvider()
    raise ValueError('OCR_PROVIDER는 local 또는 http로 설정하세요.')
