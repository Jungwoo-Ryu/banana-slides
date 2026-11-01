"""No implicit public provider fallback is allowed."""
import pytest
from config import Config
from services.ai_providers import _get_model_type_provider_config


def test_default_model_roles_use_company_azure():
    assert Config.AI_PROVIDER_FORMAT == 'azure'
    assert Config.TEXT_MODEL == Config.IMAGE_CAPTION_MODEL == 'gpt-5.5'
    assert Config.IMAGE_MODEL == 'gpt-image-2'
    assert not hasattr(Config, 'OPENAI_API_BASE')


def test_missing_azure_credentials_fail_without_public_fallback(app, monkeypatch):
    for key in ('AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_API_KEY_FILE'):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv('OPENAI_API_KEY', 'legacy-public-key')
    with app.app_context(), pytest.raises(ValueError, match='AZURE_OPENAI'):
        _get_model_type_provider_config('text')
