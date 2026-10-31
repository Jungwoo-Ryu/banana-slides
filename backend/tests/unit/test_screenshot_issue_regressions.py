"""Local reference files may not escape their extraction directory."""
import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path
from PIL import Image

def test_mineru_traversal_and_symlink_never_reach_image_provider(monkeypatch, tmp_path):
    from config import get_config
    from services.ai_service import AIService
    upload = tmp_path / 'uploads'
    valid = upload / 'mineru_files' / 'extract' / 'valid.png'
    valid.parent.mkdir(parents=True)
    Image.new('RGB', (4, 4), 'blue').save(valid)
    secret = tmp_path / 'uploads_secret' / 'flag.png'
    secret.parent.mkdir()
    Image.new('RGB', (4, 4), 'red').save(secret)
    (valid.parent / 'linked.png').symlink_to(secret)
    monkeypatch.setattr(get_config(), 'UPLOAD_FOLDER', str(upload))
    monkeypatch.setenv('UPLOAD_FOLDER', str(upload))
    provider = MagicMock()
    received_pixels = []
    def capture(**kwargs):
        received_pixels.extend(image.getpixel((0, 0)) for image in kwargs['ref_images'])
        return Image.new('RGB', (4, 4))
    provider.generate_image.side_effect = capture
    AIService(text_provider=object(), image_provider=provider, caption_provider=object()).generate_image(
        'test', additional_ref_images=[
            '/files/mineru/../../uploads_secret/flag.png',
            '/files/mineru/extract/linked.png',
            '/files/mineru/extract/valid.png',
        ])
    refs = provider.generate_image.call_args.kwargs['ref_images']
    assert len(refs) == 1
    assert received_pixels == [(0, 0, 255)]
