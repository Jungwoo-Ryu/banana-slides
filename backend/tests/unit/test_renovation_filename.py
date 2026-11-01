"""Non-ASCII filename regression tests for renovation uploads.

secure_filename() may strip the basename and leave only the extension. Saving
as original.<ext> lets background tasks discover the file regardless of its name.
"""

import io
import os
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock


def _make_minimal_pdf() -> bytes:
    """Returns a minimum legitimate single page PDF（Without relying on any external library）"""
    return b"""%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer<</Size 4/Root 1 0 R>>
startxref
190
%%EOF"""


def _post_renovation(client, filename: str, pdf_bytes: bytes):
    """Align /api/projects/renovation Send file upload request"""
    return client.post(
        '/api/projects/renovation',
        data={
            'file': (io.BytesIO(pdf_bytes), filename, 'application/pdf'),
        },
        content_type='multipart/form-data',
    )


@pytest.fixture(autouse=True)
def mock_heavy_deps():
    """Mock Drop it. AI、Task Queue and PDF Render to keep the file logically running"""
    mock_ai = MagicMock()
    mock_ai.extract_page_content.return_value = {
        'title': 'Test', 'points': [], 'description': ''
    }

    # fitz Yes. controller Internal `import fitz`，Yes. patch Global modules
    mock_fitz = MagicMock()
    mock_doc = MagicMock()
    first_page = MagicMock()
    first_page.rect.width = 792
    first_page.rect.height = 612
    mock_doc.__len__ = MagicMock(return_value=1)
    mock_doc.__iter__ = MagicMock(return_value=iter([first_page]))
    mock_doc.__getitem__ = MagicMock(return_value=first_page)
    mock_doc.close = MagicMock()
    mock_fitz.open.return_value = mock_doc
    mock_fitz.Matrix.return_value = MagicMock()

    pix = MagicMock()
    first_page.get_pixmap.return_value = pix

    from PIL import Image as PILImage

    def fake_pix_save(path):
        img = PILImage.new('RGB', (1, 1), color='white')
        img.save(path, 'PNG')

    pix.save.side_effect = fake_pix_save

    with (
        patch('controllers.project_controller.get_ai_service', return_value=mock_ai),
        patch('controllers.project_controller.task_manager') as mock_tm,
        patch('controllers.project_controller.subprocess.run'),   # Skip LibreOffice
        patch('services.file_parser_service.FileParserService', return_value=MagicMock()),
        patch.dict('sys.modules', {
            'fitz': mock_fitz,                                      # fitz Intraconnection import
        }),
    ):
        mock_tm.submit_task = MagicMock()
        yield mock_tm


class TestRenovationFilename:
    """Authentication of uploading filenames and background tasks PDF Found Logic"""

    def test_nonascii_filename_saved_as_original_pdf(self, client, app):
        """Korean filenames should be saved as original.pdf，Not without an extension. 'pdf'"""
        pdf_bytes = _make_minimal_pdf()
        response = _post_renovation(client, '발표자료.pdf', pdf_bytes)

        assert response.status_code == 202, (
            f"Expected 202, got {response.status_code}: {response.get_json()}"
        )

        data = response.get_json()
        project_id = data['data']['project_id']

        upload_folder = app.config['UPLOAD_FOLDER']
        template_dir = Path(upload_folder) / project_id / 'template'

        # The file must be filed .pdf Extension exists
        pdf_files = list(template_dir.glob('*.pdf'))
        assert pdf_files, (
            f"No .pdf file found in {template_dir}. "
            f"Files present: {list(template_dir.iterdir())}"
        )

        # Validation is a fixed name. original.pdf
        assert pdf_files[0].name == 'original.pdf', (
            f"Expected 'original.pdf', got '{pdf_files[0].name}'"
        )

    def test_task_manager_can_discover_pdf(self, client, app):
        """The files of the simulation task manager find logic and confirm that you can find the right thing. PDF"""
        pdf_bytes = _make_minimal_pdf()
        response = _post_renovation(client, '보고자료.pdf', pdf_bytes)
        assert response.status_code == 202

        data = response.get_json()
        project_id = data['data']['project_id']

        upload_folder = app.config['UPLOAD_FOLDER']
        project_dir = Path(upload_folder) / project_id
        template_dir = project_dir / 'template'

        # Revert task_manager.py The file in which the login is found
        pdf_path = None
        for f in template_dir.iterdir() if template_dir.exists() else []:
            if f.suffix.lower() == '.pdf':
                pdf_path = str(f)
                break

        assert pdf_path is not None, (
            "task_manager It’s... PDF Found Logic Unable to Find File — "
            f"template/ files in: {list(template_dir.iterdir())}"
        )

    def test_ascii_filename_also_works(self, client, app):
        """ASCII File names should remain functional after restoration"""
        pdf_bytes = _make_minimal_pdf()
        response = _post_renovation(client, 'presentation.pdf', pdf_bytes)
        assert response.status_code == 202

        data = response.get_json()
        project_id = data['data']['project_id']

        upload_folder = app.config['UPLOAD_FOLDER']
        template_dir = Path(upload_folder) / project_id / 'template'

        pdf_files = list(template_dir.glob('*.pdf'))
        assert pdf_files, "ASCII Refurbishment projects for file names should also include .pdf Documentation"
        assert pdf_files[0].name == 'original.pdf'
