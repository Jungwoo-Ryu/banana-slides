"""Task manager image prompt field filtering regression tests."""

import json

import pytest

from models import Settings, db
from services.task_manager import _append_extra_fields, get_image_prompt_field_names


@pytest.fixture(autouse=True)
def restore_image_prompt_fields(client):
    with client.application.app_context():
        settings = Settings.get_settings()
        original_value = settings.image_prompt_extra_fields
    yield
    with client.application.app_context():
        db.session.rollback()
        settings = Settings.get_settings()
        settings.image_prompt_extra_fields = original_value
        db.session.commit()


def _set_image_prompt_fields(client, value):
    with client.application.app_context():
        settings = Settings.get_settings()
        settings.image_prompt_extra_fields = value
        db.session.commit()


def test_image_prompt_field_names_fallback_to_default_when_not_set(client):
    _set_image_prompt_fields(client, None)

    with client.application.app_context():
        fields = get_image_prompt_field_names()
        assert fields == set(Settings.DEFAULT_IMAGE_PROMPT_FIELDS)
        assert 'Speaker notes' not in fields


def test_append_extra_fields_filters_by_allowlist(client):
    _set_image_prompt_fields(client, json.dumps(['Visual elements', 'Visual focus']))

    with client.application.app_context():
        desc_content = {
            'extra_fields': {
                'Visual elements': 'Blue Color',
                'Speaker notes': 'Prove content in the lower right corner',
            }
        }
        result = _append_extra_fields('Page Body', desc_content)
        assert 'Visual elements: Blue Color' in result
        assert 'Speaker notes' not in result


def test_append_extra_fields_respects_empty_allowlist(client):
    _set_image_prompt_fields(client, json.dumps([]))

    with client.application.app_context():
        desc_content = {
            'extra_fields': {
                'Visual elements': 'Blue Color',
                'Visual focus': 'The centerman.',
            }
        }
        result = _append_extra_fields('Page Body', desc_content)
        assert result == 'Page Body'


def test_append_extra_fields_uses_prefetched_allowlist(monkeypatch):
    def fail_if_fetching_settings():
        raise AssertionError('settings should be pre-fetched by the task')

    monkeypatch.setattr(
        'services.task_manager.get_image_prompt_field_names',
        fail_if_fetching_settings,
    )

    desc_content = {
        'extra_fields': {
            'Visual elements': 'Blue Color',
            'Speaker notes': 'Do not enter a graphic hint',
        }
    }

    result = _append_extra_fields('Page Body', desc_content, {'Visual elements'})
    assert 'Visual elements: Blue Color' in result
    assert 'Speaker notes' not in result


def test_append_extra_fields_handles_missing_description_text():
    result = _append_extra_fields(None, {'extra_fields': {'Visual elements': 'Blue Color'}}, {'Visual elements'})

    assert result == 'Visual elements: Blue Color'


def test_append_extra_fields_handles_missing_description_content():
    result = _append_extra_fields('Page Body', None, {'Visual elements'})

    assert result == 'Page Body'


def test_append_extra_fields_keeps_zero_values():
    result = _append_extra_fields(
        'Page Body',
        {'extra_fields': {'Number': 0, 'Space': '   ', 'Missing': None}},
        {'Number', 'Space', 'Missing'},
    )

    assert 'Number: 0' in result
    assert 'Space' not in result
    assert 'Missing' not in result
