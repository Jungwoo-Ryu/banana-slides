"""Document parsing must stay local even when retired vendor settings remain."""
from unittest.mock import patch

import pytest
from PIL import Image

from services.document_providers import get_document_provider, get_ocr_provider
from services.file_parser_service import FileParserService


def test_text_and_pdf_parse_without_network(app, tmp_path):
    import fitz
    text = tmp_path / 'notes.txt'
    text.write_text('회사 내부 발표 자료', encoding='utf-8')
    pdf = tmp_path / 'notes.pdf'
    with fitz.open() as document:
        document.new_page().insert_text((72, 72), 'Local document only')
        document.save(pdf)
    with app.app_context(), patch('requests.sessions.Session.request', side_effect=AssertionError('Network forbidden')) as network:
        app.config['DOCUMENT_PARSER'] = 'local'
        for file, expected in [(text, '회사 내부'), (pdf, 'Local document only')]:
            _, markdown, _, error, _ = FileParserService().parse_file(str(file), file.name)
            assert error is None
            assert expected in markdown
        network.assert_not_called()


@pytest.mark.parametrize('name,factory', [('DOCUMENT_PARSER', get_document_provider), ('OCR_PROVIDER', get_ocr_provider)])
@pytest.mark.parametrize('mode', ['http', 'mineru', 'unknown'])
def test_removed_remote_modes_fail_closed(app, name, factory, mode):
    with app.app_context(), patch('requests.sessions.Session.request') as network:
        app.config[name] = mode
        with pytest.raises(ValueError, match='local'):
            factory()
        network.assert_not_called()


def test_scanned_page_uses_local_ocr(app, tmp_path):
    import fitz
    image = tmp_path / 'scan.png'
    Image.new('RGB', (50, 30), 'white').save(image)
    pdf = tmp_path / 'scan.pdf'
    with fitz.open() as document:
        page = document.new_page()
        page.insert_image(page.rect, filename=str(image))
        document.save(pdf)
    with app.app_context(), patch('services.document_providers.LocalOCRProvider.recognize', return_value=[{'content': '로컬 OCR 결과'}]) as ocr:
        app.config.update(DOCUMENT_PARSER='local', OCR_PROVIDER='local')
        assert get_document_provider().parse(str(pdf), pdf.name) == '로컬 OCR 결과'
        ocr.assert_called_once()


def test_editable_slide_extraction_uses_local_coordinates(app, tmp_path):
    from services.image_editability.local_adapters import ConfiguredOCRExtractor
    image = tmp_path / 'slide.png'
    Image.new('RGB', (200, 100), 'white').save(image)
    with app.app_context(), patch('services.document_providers.LocalOCRProvider.recognize', return_value=[{
        'type': 'text', 'content': '제목', 'bbox': [10, 20, 100, 60], 'metadata': {},
    }]):
        app.config['OCR_PROVIDER'] = 'local'
        result = ConfiguredOCRExtractor().extract(str(image))
        assert not result.has_error
        assert result.elements[0]['content'] == '제목'
        assert result.elements[0]['bbox'][0] == 10
