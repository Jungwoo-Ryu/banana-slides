"""Existing projects must retain their fields after internal labels become English."""
import json

from models import Page, Settings
from services.ai_service import AIService
from services.task_manager import _append_extra_fields

# These are historical persisted identifiers, not untranslated UI or prompt prose.
OLD_ASSETS = '\u914d\u56fe\u4e0e\u7d20\u6750'
OLD_LAYOUT = '\u7248\u5f0f\u4e0e\u91cd\u70b9'
OLD_NOTES = '\u6f14\u8bb2\u8005\u5907\u6ce8'


def test_saved_settings_resolve_old_names_without_overwriting_custom_fields():
    settings = Settings(description_extra_fields=json.dumps([OLD_ASSETS, OLD_NOTES, 'Custom field']),
                        image_prompt_extra_fields=json.dumps([OLD_ASSETS, OLD_LAYOUT]))
    assert settings.get_description_extra_fields() == ['Visual assets', 'Speaker notes', 'Custom field']
    assert settings.get_image_prompt_extra_fields() == ['Visual assets', 'Layout and emphasis']
    assert OLD_ASSETS in settings.description_extra_fields or '\\u914d' in settings.description_extra_fields


def test_existing_page_read_normalizes_labels_preserves_content_and_stored_json():
    original = json.dumps({'text': 'Original slide', 'extra_fields': {
        OLD_ASSETS: 'Earlier illustration', 'Visual assets': 'New illustration',
        OLD_NOTES: 'Do not render these notes', 'Custom field': 'Keep this content',
    }})
    page = Page(description_content=original)
    fields = page.get_description_content()['extra_fields']
    assert fields['Visual assets'] == 'Earlier illustration\nNew illustration'
    assert fields['Speaker notes'] == 'Do not render these notes'
    assert fields['Custom field'] == 'Keep this content'
    assert page.description_content == original


def test_legacy_assets_reach_image_prompt_but_speaker_notes_do_not():
    prompt = _append_extra_fields('Visible text', {'extra_fields': {
        OLD_ASSETS: 'A blue diagram', OLD_LAYOUT: 'Two columns', OLD_NOTES: 'Private narration',
    }}, set(Settings.DEFAULT_IMAGE_PROMPT_FIELDS))
    assert 'Visual assets: A blue diagram' in prompt
    assert 'Layout and emphasis: Two columns' in prompt
    assert 'Private narration' not in prompt


def test_parser_still_separates_historical_field_names(monkeypatch):
    monkeypatch.setattr(AIService, '_get_extra_field_names', staticmethod(lambda: Settings.DEFAULT_EXTRA_FIELDS))
    text, fields = AIService._parse_extra_fields(
        f'Visible text\n{OLD_ASSETS}: A diagram\n{OLD_NOTES}: Notes',
        AIService._get_parseable_field_names(),
    )
    assert text == 'Visible text'
    assert fields == {OLD_ASSETS: 'A diagram', OLD_NOTES: 'Notes'}
