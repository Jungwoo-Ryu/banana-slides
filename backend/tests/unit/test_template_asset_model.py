"""Model Layer Monometry：ProjectTemplateAsset + Project.template_mode + Page Template Fields。

Overwrite：
1. Project Default template_mode='single'
2. ProjectTemplateAsset Create、to_dict、URL Generate、JSON Parsing/Writing
3. Project.template_assets Relationship cascades (delete project cascades) asset）
4. Page.template_asset relationship + ON DELETE SET NULL（Delete asset Post page field emptied）
"""

import uuid

import pytest


def _create_project(db_session):
    from models import Project
    proj = Project(
        id=str(uuid.uuid4()),
        creation_type='idea',
        idea_prompt='unit test',
    )
    db_session.add(proj)
    db_session.commit()
    return proj


def _create_page(db_session, project, order_index=0):
    from models import Page
    page = Page(
        id=str(uuid.uuid4()),
        project_id=project.id,
        order_index=order_index,
    )
    db_session.add(page)
    db_session.commit()
    return page


def _create_asset(db_session, project, **overrides):
    from models import ProjectTemplateAsset
    payload = dict(
        project_id=project.id,
        image_path='template-assets/abc/original.png',
        thumb_path='template-assets/abc/thumb.jpg',
        source='upload',
        analysis_status='pending',
    )
    payload.update(overrides)
    asset = ProjectTemplateAsset(**payload)
    db_session.add(asset)
    db_session.commit()
    return asset


def test_project_template_mode_default_single(db_session):
    proj = _create_project(db_session)
    assert proj.template_mode == 'single'
    assert proj.to_dict()['template_mode'] == 'single'


def test_project_template_mode_can_be_multi(db_session):
    proj = _create_project(db_session)
    proj.template_mode = 'multi'
    db_session.commit()
    db_session.refresh(proj)
    assert proj.template_mode == 'multi'


def test_template_asset_to_dict_shape(db_session):
    proj = _create_project(db_session)
    asset = _create_asset(db_session, proj, user_label='Cover Map', sort_order=2)
    asset.set_analysis({'summary': 'Top Title + Double Bar Body', 'visual_density': 'medium'})
    db_session.commit()

    data = asset.to_dict()
    assert data['id'] == asset.id
    assert data['project_id'] == proj.id
    assert data['analysis_status'] == 'pending'
    assert data['user_label'] == 'Cover Map'
    assert data['sort_order'] == 2
    assert data['analysis_json'] == {'summary': 'Top Title + Double Bar Body', 'visual_density': 'medium'}
    assert data['image_url'].endswith('/original.png')
    assert data['image_url'].startswith(f'/files/{proj.id}/template-assets/{asset.id}/')
    assert data['thumb_url'].endswith('/thumb.jpg')
    assert data['referenced_page_ids'] == []


def test_template_asset_thumb_url_falls_back_to_none(db_session):
    proj = _create_project(db_session)
    asset = _create_asset(db_session, proj, thumb_path=None)
    assert asset.get_thumb_url() is None
    assert asset.to_dict()['thumb_url'] is None


def test_template_asset_invalid_json_returns_none(db_session):
    proj = _create_project(db_session)
    asset = _create_asset(db_session, proj)
    asset.analysis_json = 'this is not json'
    db_session.commit()
    assert asset.get_analysis() is None


def test_project_cascade_deletes_assets(db_session):
    from models import ProjectTemplateAsset
    proj = _create_project(db_session)
    _create_asset(db_session, proj)
    _create_asset(db_session, proj, image_path='template-assets/zzz/original.png')

    assert db_session.query(ProjectTemplateAsset).filter_by(project_id=proj.id).count() == 2

    db_session.delete(proj)
    db_session.commit()
    assert db_session.query(ProjectTemplateAsset).filter_by(project_id=proj.id).count() == 0


def test_page_template_relationship_loads_asset(db_session):
    proj = _create_project(db_session)
    asset = _create_asset(db_session, proj, user_label='Contrast Pages')
    page = _create_page(db_session, proj)
    page.template_asset_id = asset.id
    page.template_style_text = 'Extremely simple style'
    page.template_selection_source = 'manual'
    db_session.commit()
    db_session.refresh(page)

    assert page.template_asset is not None
    assert page.template_asset.user_label == 'Contrast Pages'
    assert page.to_dict()['template_asset_id'] == asset.id
    assert page.to_dict()['template_style_text'] == 'Extremely simple style'
    assert page.to_dict()['template_selection_source'] == 'manual'


def test_template_asset_pages_referenced_backref(db_session):
    proj = _create_project(db_session)
    asset = _create_asset(db_session, proj)
    p1 = _create_page(db_session, proj, order_index=0)
    p2 = _create_page(db_session, proj, order_index=1)
    p1.template_asset_id = asset.id
    p2.template_asset_id = asset.id
    db_session.commit()
    db_session.refresh(asset)

    assert {p.id for p in asset.pages_referenced} == {p1.id, p2.id}
    assert set(asset.to_dict()['referenced_page_ids']) == {p1.id, p2.id}


def test_delete_asset_sets_page_template_id_null(db_session):
    """ON DELETE SET NULL Authentication： Delete asset Post-reference page template_asset_id Auto Empty。"""
    from models import db, Page
    proj = _create_project(db_session)
    asset = _create_asset(db_session, proj)
    page = _create_page(db_session, proj)
    page.template_asset_id = asset.id
    db_session.commit()

    # SQLite Default not open foreign_keys；Manually Open Authentication ON DELETE SET NULL
    db_session.execute(db.text('PRAGMA foreign_keys = ON'))

    db_session.delete(asset)
    db_session.commit()

    refreshed = db_session.get(Page, page.id)
    assert refreshed.template_asset_id is None


def test_page_to_dict_includes_template_fields_when_unset(db_session):
    proj = _create_project(db_session)
    page = _create_page(db_session, proj)
    data = page.to_dict()
    assert data['template_asset_id'] is None
    assert data['template_style_text'] is None
    assert data['template_selection_source'] is None
    assert data['template_match_reason'] is None
    assert data['template_match_confidence'] is None
