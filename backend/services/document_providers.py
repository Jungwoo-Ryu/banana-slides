"""Local document parsing and Tesseract OCR; no external upload adapters."""
from abc import ABC, abstractmethod
from pathlib import Path
from services.runtime_config import setting


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


def get_document_provider():
    if setting('DOCUMENT_PARSER', 'local') != 'local':
        raise ValueError('외부 문서 서비스 연동은 제거되었습니다. DOCUMENT_PARSER=local로 설정하세요.')
    return LocalDocumentProvider()


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


def get_ocr_provider():
    if setting('OCR_PROVIDER', 'local') != 'local':
        raise ValueError('외부 OCR 서비스 연동은 제거되었습니다. OCR_PROVIDER=local로 설정하세요.')
    return LocalOCRProvider()
