"""Page description field compacts v2 . . . . .。

Contracts：SLIDE_TEXT（Word-by-word）/ Visual assets（What do you mean?）/ Layout and emphasis（How?）/ Speaker notes（What do you mean?）。
Coverage： the definition of a field directive is exclusive, the extent of injection of the outline judgement rules, compatibility with the old field name, fine-fixed field。
"""

import json

import pytest

from models import Settings, db
from services import prompts
from services.prompts import (
    EXTRA_FIELD_INSTRUCTIONS,
    _format_extra_field_instructions,
    get_all_descriptions_stream_prompt,
    get_description_to_outline_prompt,
    get_description_to_outline_prompt_markdown,
    get_outline_generation_prompt,
    get_outline_generation_prompt_markdown,
    get_outline_parsing_prompt,
    get_outline_parsing_prompt_markdown,
    get_outline_refinement_prompt,
    get_page_description_prompt,
)
from services.task_manager import _append_extra_fields


class _Ctx:
    """Min ProjectContext A double. Just a double. prompt Construct the properties used。"""

    creation_type = 'idea'
    idea_prompt = 'Introduction AI Development history'
    outline_text = ''
    description_text = 'Page I：AI The origin of the\n Talk about the Dartmouth meeting.'
    reference_files_content = None
    outline_requirements = None
    description_requirements = None


@pytest.fixture
def ctx():
    return _Ctx()


# --- Field Command ---

def test_default_fields_render_full_instructions():
    result = _format_extra_field_instructions(list(Settings.DEFAULT_EXTRA_FIELDS))

    for name in Settings.DEFAULT_EXTRA_FIELDS:
        assert EXTRA_FIELD_INSTRUCTIONS[name] in result


def test_field_instructions_state_exclusion_rules():
    """Fields must be mutually exclusive： cross-border content must be explicitly pushed to other fields。"""
    materials = EXTRA_FIELD_INSTRUCTIONS['Visual assets']
    assert 'Do not write body text' in materials
    assert 'Do not specify positioning' in materials

    layout = EXTRA_FIELD_INSTRUCTIONS['Layout and emphasis']
    assert 'Do not introduce new content' in layout
    assert 'repeat SLIDE_TEXT' in layout

    notes = EXTRA_FIELD_INSTRUCTIONS['Speaker notes']
    assert 'not rendered on the slide' in notes


def test_field_instructions_carry_length_budget():
    """The length budget is hard-pressed： the texture of the textual drawings is limited, and long fields crowd it out.。"""
    assert 'At most 3 items' in EXTRA_FIELD_INSTRUCTIONS['Visual assets']
    assert 'At most two sentences' in EXTRA_FIELD_INSTRUCTIONS['Layout and emphasis']


def test_custom_field_falls_back_to_generic_instruction():
    result = _format_extra_field_instructions(['Brand norms'])

    assert 'Brand norms: [Guidance for Brand norms; include only information not covered by other fields.]' in result


def test_legacy_field_names_do_not_borrow_new_definitions():
    """Both old fields have an equal price. Layout and emphasis，A new definition would result in a duplicate output。"""
    result = _format_extra_field_instructions(['Visual focus', 'Page layout'])

    assert EXTRA_FIELD_INSTRUCTIONS['Layout and emphasis'] not in result
    assert 'Visual focus: [Guidance for Visual focus' in result
    assert 'Page layout: [Guidance for Page layout' in result


def test_script_is_requested_even_without_optional_fields():
    assert 'TTS_SCRIPT:' in _format_extra_field_instructions([])
    assert 'TTS_SCRIPT:' in _format_extra_field_instructions(None)


# --- Description Generation prompt ---

def test_page_description_prompt_drops_standalone_material_section(ctx):
    prompt = get_page_description_prompt(
        ctx, outline=[], page_outline={'title': 'AI The origin of the'}, page_index=2,
        extra_fields=list(Settings.DEFAULT_EXTRA_FIELDS),
    )

    assert 'Image assets:' not in prompt
    assert 'Image assets：' not in prompt
    assert EXTRA_FIELD_INSTRUCTIONS['Visual assets'] in prompt


def test_page_description_prompt_states_verbatim_and_title_rules(ctx):
    prompt = get_page_description_prompt(
        ctx, outline=[], page_outline={'title': 'AI The origin of the'}, page_index=2,
        extra_fields=list(Settings.DEFAULT_EXTRA_FIELDS),
    )

    assert 'verbatim' in prompt
    assert 'assertion' in prompt
    assert 'takeaway' in prompt


def test_stream_description_prompt_matches_contract(ctx):
    prompt = get_all_descriptions_stream_prompt(
        ctx, outline=[], flat_pages=[{'title': 'AI The origin of the', 'points': ['Dartmouth Conference']}],
        extra_fields=list(Settings.DEFAULT_EXTRA_FIELDS),
    )

    assert 'Image assets：' not in prompt
    assert 'verbatim' in prompt
    assert 'assertion' in prompt
    # Flow resolution dependent tags cannot be altered
    for marker in ('<!-- BEGIN -->', '<!-- PAGE_END -->', '<!-- END -->'):
        assert marker in prompt


# --- Outline rules ---

@pytest.mark.parametrize('build', [
    lambda c: get_outline_generation_prompt(c),
    lambda c: get_outline_generation_prompt_markdown(c),
    lambda c: get_outline_refinement_prompt([], 'Add a page summary', c),
])
def test_generation_and_refinement_prompts_carry_takeaway_rule(ctx, build):
    prompt = build(ctx)

    assert 'takeaway' in prompt.lower()
    assert 'never a topic phrase' in prompt or 'topic phrase' in prompt


def test_takeaway_rule_exempts_functional_pages(ctx):
    prompt = get_outline_generation_prompt(ctx)

    assert 'functional pages' in prompt
    assert 'do not force assertions' in prompt


def test_takeaway_rule_requires_coherent_storyline(ctx):
    prompt = get_outline_generation_prompt(ctx)

    assert 'storyline' in prompt


@pytest.mark.parametrize('build', [
    lambda c: get_outline_generation_prompt(c),
    lambda c: get_outline_generation_prompt_markdown(c),
    lambda c: get_outline_refinement_prompt([], 'Add a page summary', c),
])
def test_cover_and_toc_are_exempt_from_part_grouping(ctx, build):
    """Cover/The directory belongs to the whole deck，Shouldn’t be put on the chapter.（part）Label。"""
    prompt = build(ctx)

    assert 'table of contents' in prompt or 'Contents' in prompt
    assert 'never to a part' in prompt or 'Do not embed any' in prompt


def test_outline_json_format_example_keeps_cover_outside_part():
    """JSON The example of outline format cannot embed the cover itself part Grouping, otherwise the example will teach counter-rules。"""
    assert '"part": "Part 1: Introduction"' in prompts._OUTLINE_JSON_FORMAT
    # "Welcome"（The cover must be in the first place. part Grouping before parenthesis
    welcome_pos = prompts._OUTLINE_JSON_FORMAT.index('"Welcome"')
    part1_pos = prompts._OUTLINE_JSON_FORMAT.index('"part": "Part 1: Introduction"')
    assert welcome_pos < part1_pos


@pytest.mark.parametrize('build', [
    lambda c: get_description_to_outline_prompt(c),
    lambda c: get_description_to_outline_prompt_markdown(c),
])
def test_description_derived_outlines_exempt_cover_from_part(ctx, build):
    prompt = build(ctx)
    assert 'never to a part' in prompt


@pytest.mark.parametrize('build', [
    lambda c: get_outline_parsing_prompt(c),
    lambda c: get_outline_parsing_prompt_markdown(c),
])
def test_outline_parsing_prompts_do_not_inject_part_exemption(ctx, build):
    """Parsing the user’s own outline must be genuine and not injected into the cover. part and structural rules。"""
    prompt = build(ctx)
    assert 'never to a part' not in prompt


@pytest.mark.parametrize('build', [
    lambda c: get_description_to_outline_prompt(c),
    lambda c: get_description_to_outline_prompt_markdown(c),
])
def test_description_derived_outlines_use_conditional_takeaway(ctx, build):
    """Presentation of the outline from the user text： the argument must be derived from the user content and cannot be invented in a vacuum。"""
    prompt = build(ctx)

    assert 'takeaway assertion' in prompt
    assert "implied by the user's text" in prompt


@pytest.mark.parametrize('build', [
    lambda c: get_outline_parsing_prompt(c),
    lambda c: get_outline_parsing_prompt_markdown(c),
])
def test_outline_parsing_prompts_stay_faithful(ctx, build):
    """Precedence when parsing user ’s own outline, not into theory and rewrite。"""
    prompt = build(ctx)

    assert 'takeaway' not in prompt.lower()


# --- Default compatible with old fields ---

def test_default_fields_are_orthogonal_trio():
    assert Settings.DEFAULT_EXTRA_FIELDS == ['Visual assets', 'Layout and emphasis', 'Speaker notes']
    assert Settings.DEFAULT_IMAGE_PROMPT_FIELDS == ['Visual assets', 'Layout and emphasis']
    assert 'Speaker notes' not in Settings.DEFAULT_IMAGE_PROMPT_FIELDS


def test_legacy_equiv_covers_all_retired_names():
    expected = {
        'Visual elements': 'Visual assets',
        'Visual focus': 'Layout and emphasis',
        'Page layout': 'Layout and emphasis',
        'Layout suggestions': 'Layout and emphasis',
    }
    assert expected.items() <= Settings.LEGACY_FIELD_EQUIV.items()
    assert set(Settings.LEGACY_INPUT_FIELDS) <= set(Settings.LEGACY_FIELD_EQUIV)


# --- Quality of judgement： prohibition of hypocritical judgements and requirement of proof ---

@pytest.mark.parametrize('build', [
    lambda c: get_outline_generation_prompt(c),
    lambda c: get_outline_generation_prompt_markdown(c),
])
def test_takeaway_rule_bans_topic_announcing_sentences(ctx, build):
    """Hypocrisy (a sentence that only proclaims the existence of a conclusion and does not give a conclusion) must be expressly prohibited by name.。"""
    prompt = build(ctx)
    # Negative is called.：'The break-even analysis reveals when to switch'
    assert 'reveals when to switch' in prompt


def test_takeaway_rule_requires_evidence_not_restatement(ctx):
    """Subsequent elements must be evidence (data)/Cases/of the Convention on the Rights of the Child)。"""
    prompt = get_outline_generation_prompt(ctx)
    assert 'EVIDENCE' in prompt
    assert 'not a reworded restatement' in prompt


def test_outline_markdown_prompt_bans_deck_level_title(ctx):
    """markdown Edit must be disabled. deck Level document title to avoid contamination of cover part。"""
    prompt = get_outline_generation_prompt_markdown(ctx)
    assert 'deck-level document title' in prompt


# --- Parser： the one in front of the seal deck Level H1 You can’t be treated like that. part ---

def test_parse_outline_ignores_deck_title_before_cover():
    """Whole deck It’s... H1 The title appears in front of the cover page and should not be contaminated. part；
    And it’s legal after the cover. # Part Subsections still need to enter into force。"""
    from services.ai_service import AIService

    md = (
        "# Decision-making reporting：AI Strategic choice of reasoning structure\n"
        "## Decision-making reporting：AI Strategic choice of reasoning structure\n"
        "- Cover subtitles and reporting person information\n"
        "# Part I： Economic analysis\n"
        "## Existing AI Transfer expenditures show an exponential growth trend\n"
        "- Risk of out-of-control costs and urgent need for alternatives\n"
    )
    pages = AIService.parse_markdown_outline(md)

    assert len(pages) == 2
    # Cover page not available deck Headline pollution.
    assert 'part' not in pages[0]
    assert pages[0]['title'] == 'Decision-making reporting：AI Strategic choice of reasoning structure'
    # Legitimate After Cover part Still in force.
    assert pages[1].get('part') == 'Part I： Economic analysis'


def test_parse_outline_keeps_opening_chapter_without_cover():
    """When there is no separate cover, start directly with the chapter, first H1 It’s true. part，We can’t be missed.。"""
    from services.ai_service import AIService

    md = (
        "# Chapter I\n"
        "## Page I\n"
        "- Key points 1\n"
        "## Page 2\n"
        "- Key points 2\n"
    )
    pages = AIService.parse_markdown_outline(md)

    assert len(pages) == 2
    assert pages[0].get('part') == 'Chapter I'
    assert pages[1].get('part') == 'Chapter I'


@pytest.mark.parametrize('legacy_name', ['Visual elements', 'Visual focus', 'Page layout', 'Layout suggestions'])
def test_legacy_fields_still_reach_image_prompt(legacy_name):
    """The old field name cannot be silently invalidated by a change of name at the time the inventory project is recreated。"""
    result = _append_extra_fields(
        'Page Body',
        {'extra_fields': {legacy_name: 'A request.'}},
        set(Settings.DEFAULT_IMAGE_PROMPT_FIELDS),
    )

    assert f'{legacy_name}: A request.' in result


def test_legacy_speaker_notes_still_excluded():
    result = _append_extra_fields(
        'Page Body',
        {'extra_fields': {'Speaker notes': 'Oral supplement'}},
        set(Settings.DEFAULT_IMAGE_PROMPT_FIELDS),
    )

    assert result == 'Page Body'


def test_new_fields_reach_image_prompt():
    result = _append_extra_fields(
        'Page Body',
        {'extra_fields': {'Visual assets': 'Line Chart', 'Layout and emphasis': 'Left Right Chart'}},
        set(Settings.DEFAULT_IMAGE_PROMPT_FIELDS),
    )

    assert 'Visual assets: Line Chart' in result
    assert 'Layout and emphasis: Left Right Chart' in result


def test_unknown_custom_field_still_filtered():
    result = _append_extra_fields(
        'Page Body',
        {'extra_fields': {'Brand norms': 'Internal use only'}},
        set(Settings.DEFAULT_IMAGE_PROMPT_FIELDS),
    )

    assert result == 'Page Body'


def test_settings_default_getters_return_new_fields(client):
    with client.application.app_context():
        settings = Settings.get_settings()
        settings.description_extra_fields = None
        settings.image_prompt_extra_fields = None
        db.session.commit()

        assert settings.get_description_extra_fields() == ['Visual assets', 'Layout and emphasis', 'Speaker notes']
        assert settings.get_image_prompt_extra_fields() == ['Visual assets', 'Layout and emphasis']


def test_parseable_names_extend_instruction_names_with_legacy(client):
    """Command only configuration fields to parse additional accepted old field names。"""
    from services.ai_service import AIService

    with client.application.app_context():
        settings = Settings.get_settings()
        settings.description_extra_fields = None
        db.session.commit()

        instructed = AIService._get_extra_field_names()
        parseable = AIService._get_parseable_field_names()

    assert instructed == list(Settings.DEFAULT_EXTRA_FIELDS)
    # The disabled field name cannot appear in the instructions to the model
    for legacy in Settings.LEGACY_FIELD_EQUIV:
        assert legacy not in instructed
        assert legacy in parseable
    for name in instructed:
        assert name in parseable


# --- Precise retention of additional fields ---

def test_refinement_prompt_includes_existing_extra_fields(ctx):
    prompt = prompts.get_descriptions_refinement_prompt(
        current_descriptions=[{
            'index': 0,
            'title': 'AI The origin of the',
            'description_content': {
                'text': '- Dartmouth Conference',
                'extra_fields': {'Layout and emphasis': 'Centre Big Header'},
            },
        }],
        user_requirement='It’s simpler.',
        project_context=ctx,
    )

    assert 'Layout and emphasis：Centre Big Header' in prompt
    assert 'do not silently delete them' in prompt


def test_refine_descriptions_splits_extra_fields_back_out(client, monkeypatch):
    """The finely returned field line must be cut back extra_fields，Or else they’ll be taken hostage. SLIDE_TEXT Render Screen。"""
    from services.ai_service import AIService

    service = AIService.__new__(AIService)
    monkeypatch.setattr(
        AIService, 'generate_json',
        lambda self, prompt, **kwargs: [
            'Slide title：AI The origin of the\nSLIDE_TEXT：\n- Dartmouth Conference\nVisual assets：Photo taken of the Conference\nLayout and emphasis：Centre Big Header',
        ],
    )
    monkeypatch.setattr(
        AIService, '_get_extra_field_names',
        staticmethod(lambda: list(Settings.DEFAULT_EXTRA_FIELDS)),
    )

    with client.application.app_context():
        result = service.refine_descriptions([], 'It’s simpler.', _Ctx())

    assert len(result) == 1
    assert result[0]['extra_fields'] == {'Visual assets': 'Photo taken of the Conference', 'Layout and emphasis': 'Centre Big Header'}
    assert 'Visual assets' not in result[0]['text']
    assert 'Dartmouth Conference' in result[0]['text']


def test_refine_descriptions_splits_legacy_field_names(client, monkeypatch):
    from services.ai_service import AIService

    service = AIService.__new__(AIService)
    monkeypatch.setattr(
        AIService, 'generate_json',
        lambda self, prompt, **kwargs: ['SLIDE_TEXT：\n- Text\nPage layout：Left Right Chart'],
    )
    monkeypatch.setattr(
        AIService, '_get_extra_field_names',
        staticmethod(lambda: list(Settings.DEFAULT_EXTRA_FIELDS)),
    )

    with client.application.app_context():
        result = service.refine_descriptions([], 'Adjustments', _Ctx())

    assert result[0]['extra_fields'] == {'Page layout': 'Left Right Chart'}


def test_refine_descriptions_without_fields_returns_text_only(client, monkeypatch):
    from services.ai_service import AIService

    service = AIService.__new__(AIService)
    monkeypatch.setattr(
        AIService, 'generate_json',
        lambda self, prompt, **kwargs: ['SLIDE_TEXT：\n- Only text'],
    )
    monkeypatch.setattr(
        AIService, '_get_extra_field_names',
        staticmethod(lambda: list(Settings.DEFAULT_EXTRA_FIELDS)),
    )

    with client.application.app_context():
        result = service.refine_descriptions([], 'Adjustments', _Ctx())

    assert 'extra_fields' not in result[0]
    assert 'Only text' in result[0]['text']


def test_refine_descriptions_flattens_dict_items(client, monkeypatch):
    """When the model returns to the object instead of the string, it cannot be used Python dict Text Rendering to Slide。"""
    from services.ai_service import AIService

    service = AIService.__new__(AIService)
    monkeypatch.setattr(
        AIService, 'generate_json',
        lambda self, prompt, **kwargs: [
            {'SLIDE_TEXT': '- High market growth', 'Layout and emphasis': 'Left Right Chart'},
        ],
    )
    monkeypatch.setattr(
        AIService, '_get_extra_field_names',
        staticmethod(lambda: list(Settings.DEFAULT_EXTRA_FIELDS)),
    )

    with client.application.app_context():
        result = service.refine_descriptions([], 'Adjustments', _Ctx())

    assert result[0]['extra_fields'] == {'Layout and emphasis': 'Left Right Chart'}
    assert 'High market growth' in result[0]['text']
    assert '{' not in result[0]['text']


def test_parse_extra_fields_matches_field_at_text_start():
    """Field rows should also be identified at the beginning of the text, otherwise they will remain in the body to render the screen。"""
    from services.ai_service import AIService

    text, fields = AIService._parse_extra_fields(
        'Visual assets: Line Chart\nLayout and emphasis: Left Right Chart',
        ['Visual assets', 'Layout and emphasis'],
    )

    assert fields == {'Visual assets': 'Line Chart', 'Layout and emphasis': 'Left Right Chart'}
    assert text == ''


def test_refine_descriptions_flattens_dict_with_field_first(client, monkeypatch):
    """Do not leak when the first key in the dictionary is a field name。"""
    from services.ai_service import AIService

    service = AIService.__new__(AIService)
    monkeypatch.setattr(
        AIService, 'generate_json',
        lambda self, prompt, **kwargs: [
            {'Visual assets': 'Line Chart', 'Layout and emphasis': 'Left Right Chart'},
        ],
    )
    monkeypatch.setattr(
        AIService, '_get_extra_field_names',
        staticmethod(lambda: list(Settings.DEFAULT_EXTRA_FIELDS)),
    )

    with client.application.app_context():
        result = service.refine_descriptions([], 'Adjustments', _Ctx())

    assert result[0]['extra_fields'] == {'Visual assets': 'Line Chart', 'Layout and emphasis': 'Left Right Chart'}
    assert result[0]['text'] == ''


def test_refine_descriptions_flattens_list_values(client, monkeypatch):
    """Value groups are split into multiple rows, not outputable Python List Font Volume。"""
    from services.ai_service import AIService

    service = AIService.__new__(AIService)
    monkeypatch.setattr(
        AIService, 'generate_json',
        lambda self, prompt, **kwargs: [
            {'SLIDE_TEXT': ['- Point one.', '- Point two.'], 'Layout and emphasis': 'Left Right Chart'},
        ],
    )
    monkeypatch.setattr(
        AIService, '_get_extra_field_names',
        staticmethod(lambda: list(Settings.DEFAULT_EXTRA_FIELDS)),
    )

    with client.application.app_context():
        result = service.refine_descriptions([], 'Adjustments', _Ctx())

    assert result[0]['extra_fields'] == {'Layout and emphasis': 'Left Right Chart'}
    assert 'Point one.' in result[0]['text'] and 'Point two.' in result[0]['text']
    assert '[' not in result[0]['text']


def test_refinement_prompt_tolerates_null_text(ctx):
    """description_content Lee. text Yes. null Don’t blow it up. prompt Construct。"""
    prompt = prompts.get_descriptions_refinement_prompt(
        current_descriptions=[{
            'index': 0,
            'title': 'Empty Page',
            'description_content': {'text': None, 'extra_fields': {'Layout and emphasis': 'Centred'}},
        }],
        user_requirement='Additional elements',
        project_context=ctx,
    )

    assert 'Layout and emphasis：Centred' in prompt


def test_refine_descriptions_rejects_non_list(client, monkeypatch):
    from services.ai_service import AIService

    service = AIService.__new__(AIService)
    monkeypatch.setattr(AIService, 'generate_json', lambda self, prompt, **kwargs: {'oops': 1})

    with client.application.app_context():
        with pytest.raises(ValueError):
            service.refine_descriptions([], 'Adjustments', _Ctx())
