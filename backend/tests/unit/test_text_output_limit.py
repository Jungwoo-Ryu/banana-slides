"""Azure text/vision/streaming output limits and persistence."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock
import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from config import Config
from services.ai_providers.text.base import get_text_output_limit
from services.ai_providers.text.azure_provider import AzureTextProvider


@pytest.mark.parametrize('method', ['generate_text', 'generate_text_stream', 'generate_with_image'])
def test_azure_requests_use_completion_limit(app, tmp_path, monkeypatch, method):
    from PIL import Image
    path = tmp_path/'slide.png'
    Image.new('RGB', (16,16), 'white').save(path)
    provider = AzureTextProvider.__new__(AzureTextProvider)
    provider.model, provider.client = 'company-text-alias', MagicMock()
    create = provider.client.chat.completions.create
    create.return_value = (iter([]) if method == 'generate_text_stream' else
                           SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='ok'))]))
    monkeypatch.setitem(app.config, 'TEXT_MAX_OUTPUT_TOKENS', 32768)
    with app.app_context():
        args = ('prompt', str(path)) if method == 'generate_with_image' else ('prompt',)
        result = getattr(provider, method)(*args)
        if method == 'generate_text_stream': list(result)
    assert create.call_args.kwargs['max_completion_tokens'] == 32768
    assert create.call_args.kwargs['model'] == 'company-text-alias'
    assert 'max_tokens' not in create.call_args.kwargs


def test_settings_save_reload_reset_and_cached_provider(client, app, monkeypatch):
    from models import Settings, db
    monkeypatch.setattr(Config, 'TEXT_MAX_OUTPUT_TOKENS', 32768)
    monkeypatch.setitem(app.config, 'TEXT_MAX_OUTPUT_TOKENS', 32768)
    provider = AzureTextProvider.__new__(AzureTextProvider)
    provider.model = 'company-text-deployment'
    assert client.get('/api/settings').json['data']['text_max_output_tokens'] == 32768
    assert client.put('/api/settings', json={'text_max_output_tokens': 16384}).status_code == 200
    db.session.remove()
    assert Settings.get_settings().text_max_output_tokens == 16384
    assert client.get('/api/settings').json['data']['text_max_output_tokens'] == 16384
    assert provider._output_limit_params() == {'max_completion_tokens': 16384}
    # Startup must also reload the persisted value.
    from app import _load_settings_to_config
    from flask import current_app
    current_app.config['TEXT_MAX_OUTPUT_TOKENS'] = 1
    _load_settings_to_config(current_app)
    assert get_text_output_limit() == 16384
    assert client.post('/api/settings/reset').status_code == 200
    assert client.get('/api/settings').json['data']['text_max_output_tokens'] == 32768
    assert provider._output_limit_params() == {'max_completion_tokens': 32768}


@pytest.mark.parametrize('value', [0, -1, 1.5, True, '32768', None, 2147483648])
def test_invalid_limit_does_not_change_saved_setting(client, value):
    assert client.put('/api/settings', json={'text_max_output_tokens': 16384}).status_code == 200
    assert client.put('/api/settings', json={'text_max_output_tokens': value}).status_code == 400
    assert client.get('/api/settings').json['data']['text_max_output_tokens'] == 16384


def test_unsaved_service_test_overrides_are_rejected(client):
    assert client.post('/api/settings/tests/text-model', json={'text_max_output_tokens':4096}).status_code == 400


def test_existing_database_migration_preserves_settings(tmp_path):
    migration = Path(__file__).parents[2] / 'migrations/versions/d84c2a7f9130_add_text_output_limit.py'
    spec = importlib.util.spec_from_file_location('output_limit_migration', migration)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    engine = sa.create_engine(f'sqlite:///{tmp_path}/old.db')
    with engine.begin() as connection:
        connection.execute(sa.text('CREATE TABLE settings (id INTEGER PRIMARY KEY, text_model TEXT)'))
        connection.execute(sa.text("INSERT INTO settings VALUES (1, 'existing-model')"))
        module.op = Operations(MigrationContext.configure(connection))
        module.upgrade()
        module.upgrade()  # Desktop schema repair may already have added it.
        assert connection.execute(sa.text('SELECT text_model, text_max_output_tokens FROM settings')).one() == ('existing-model', None)
        module.downgrade()
        assert connection.execute(sa.text('SELECT text_model FROM settings')).scalar_one() == 'existing-model'
