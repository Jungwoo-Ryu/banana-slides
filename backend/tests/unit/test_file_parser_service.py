"""
Unit tests for FileParserService provider-specific behavior.
"""

import os
import io
import builtins
import tempfile
import uuid
import zipfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import requests
from PIL import Image

from services.file_parser_service import FileParserService, _resolve_upload_folder




def _create_temp_image() -> str:
    with tempfile.NamedTemporaryFile(prefix='caption_test_', suffix='.png', delete=False) as tmp:
        Image.new('RGB', (20, 20), color='green').save(tmp.name)
        return tmp.name


def test_generate_single_caption_uses_provider_factory():
    """Caption generation should delegate to the provider factory's generate_with_image."""
    image_path = _create_temp_image()
    try:
        service = FileParserService(
        )

        mock_provider = MagicMock()
        mock_provider.generate_with_image.return_value = 'Example Description'

        with patch('utils.path_utils.find_parsed_file_with_prefix', return_value=Path(image_path)):
            with patch.object(service, '_get_caption_provider', return_value=mock_provider):
                caption = service._generate_single_caption('/files/parsed/demo.png')

        assert caption == 'Example Description'
        mock_provider.generate_with_image.assert_called_once()
        call_args = mock_provider.generate_with_image.call_args
        assert 'Briefly describe' in call_args[0][0]
        assert '한국어' in call_args[0][0]
    finally:
        if os.path.exists(image_path):
            os.remove(image_path)


def test_can_generate_captions_returns_false_when_factory_fails():
    """_can_generate_captions should return False when the provider factory raises."""
    service = FileParserService(
    )
    with patch(
        'services.file_parser_service.FileParserService._get_caption_provider',
        side_effect=ValueError("no key"),
    ):
        assert service._can_generate_captions() is False


def test_can_generate_captions_returns_true_when_factory_succeeds():
    """_can_generate_captions should return True when the provider factory returns a provider."""
    service = FileParserService(
    )
    mock_provider = MagicMock()
    with patch.object(service, '_get_caption_provider', return_value=mock_provider):
        assert service._can_generate_captions() is True


def test_caption_provider_is_lazy_and_uses_company_azure_factory():
    with patch('services.ai_providers.get_caption_provider') as factory:
        service = FileParserService()
        factory.assert_not_called()
        assert service._get_caption_provider() is factory.return_value
        assert service._get_caption_provider() is factory.return_value
        factory.assert_called_once_with()


@pytest.mark.parametrize('remote_url', [
    'http://127.0.0.1/latest/meta-data/',
    'https://169.254.169.254/latest/meta-data/',
])
def test_generate_single_caption_rejects_remote_urls(remote_url):
    """Uploaded Markdown must not make the backend fetch attacker-controlled URLs."""
    service = FileParserService()
    mock_provider = MagicMock()
    service._caption_provider = mock_provider

    with patch('requests.get') as mock_get:
        caption = service._generate_single_caption(remote_url)

    assert caption == ''
    mock_get.assert_not_called()
    mock_provider.generate_with_image.assert_not_called()


def test_enhance_markdown_only_captions_local_mineru_images():
    """Remote and unsupported image references remain untouched and are never submitted."""
    service = FileParserService()
    markdown = '\n'.join([
        '![](http://127.0.0.1/internal.png)',
        '![](/files/parsed/extract123/images/chart.png)',
        '![](data:image/png;base64,AAAA)',
    ])

    with patch.object(service, '_can_generate_captions', return_value=True):
        with patch.object(
            service,
            '_generate_captions_parallel',
            return_value=(['Local Charts'], 0),
        ) as mock_generate:
            enhanced, failed_count = service._enhance_markdown_with_captions(markdown)

    assert failed_count == 0
    assert '![](http://127.0.0.1/internal.png)' in enhanced
    assert '![Local Charts](/files/parsed/extract123/images/chart.png)' in enhanced
    assert '![](data:image/png;base64,AAAA)' in enhanced
    mock_generate.assert_called_once_with(['/files/parsed/extract123/images/chart.png'])












def test_relative_upload_folder_cannot_escape_project_root():
    """Relative upload roots are project-local only; desktop absolute paths remain supported separately."""
    with pytest.raises(ValueError, match='project root'):
        FileParserService( upload_folder='../outside-uploads')


def test_resolve_upload_folder_uses_env_when_flask_import_is_unavailable(tmp_path, monkeypatch):
    env_uploads = tmp_path / 'env-uploads'
    monkeypatch.setenv('UPLOAD_FOLDER', str(env_uploads))
    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == 'flask':
            raise ImportError('flask unavailable')
        return real_import(name, *args, **kwargs)

    with patch('builtins.__import__', side_effect=fake_import):
        assert _resolve_upload_folder() == env_uploads.resolve()


def test_resolve_upload_folder_ignores_invalid_flask_config(app, tmp_path, monkeypatch):
    env_uploads = tmp_path / 'env-uploads'
    monkeypatch.setenv('UPLOAD_FOLDER', str(env_uploads))

    with app.app_context():
        monkeypatch.setitem(app.config, 'UPLOAD_FOLDER', object())

        assert _resolve_upload_folder() == env_uploads.resolve()
