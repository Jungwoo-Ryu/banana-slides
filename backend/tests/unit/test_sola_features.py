"""Sol.A Azure boundary, editable scripts, design defaults and safe video admission."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock
import pytest


def test_removed_provider_options_cannot_be_saved(client):
    from models import Settings
    forbidden = ('ai_provider_format','text_model','image_model','image_caption_model',
                 'text_model_source','image_model_source','image_api_base_url','elevenlabs_enabled')
    result = client.get('/api/settings').json['data']
    for key in forbidden:
        assert key not in result
        assert key not in Settings.__table__.columns
        assert client.put('/api/settings', json={key:'openai'}).status_code == 400


def test_legacy_environment_cannot_redirect_azure(app, monkeypatch):
    from services.ai_providers import _get_model_type_provider_config
    monkeypatch.setenv('AZURE_OPENAI_API_KEY','company-secret')
    monkeypatch.setenv('TEXT_API_KEY','public-secret')
    monkeypatch.setitem(app.config,'TEXT_MODEL_SOURCE','openai')
    monkeypatch.setitem(app.config,'TEXT_API_BASE','https://api.openai.com/v1')
    monkeypatch.setitem(app.config,'AZURE_OPENAI_ENDPOINT','https://company.openai.azure.com')
    monkeypatch.setitem(app.config,'AZURE_OPENAI_DEPLOYMENT','company-text')
    with app.app_context():
        result = _get_model_type_provider_config('text')
    assert result['format'] == 'azure'
    assert result['api_base'] == 'https://company.openai.azure.com'
    assert result['api_key'] == 'company-secret'
    assert result['deployment'] == 'company-text'


def test_design_system_is_copied_to_new_project(client):
    from models import db, Project
    style='Sol.A: 흰색 배경, 금색 강조, 넓은 여백'
    assert client.put('/api/settings',json={'design_system_prompt':style}).status_code == 200
    result=client.post('/api/projects',json={'creation_type':'blank'}).json['data']
    assert db.session.get(Project,result['project_id']).template_style == style
    # Existing projects retain the reviewed style when the global default changes.
    client.put('/api/settings',json={'design_system_prompt':'New default'})
    assert db.session.get(Project,result['project_id']).template_style == style
    result=client.post('/api/projects',json={'creation_type':'blank','template_style':'Custom'}).json['data']
    assert db.session.get(Project,result['project_id']).template_style == 'Custom'


def test_generated_script_is_separate_and_user_edits_survive():
    from models import Page
    page=Page(project_id='test',order_index=0)
    page.set_description_content({'text':'Visible text','extra_fields':{'TTS_SCRIPT':'발표 대본','Visual assets':'Chart'}})
    assert page.narration_text == '발표 대본'
    assert 'TTS_SCRIPT' not in page.get_description_content()['extra_fields']
    page.set_narration_text('사용자 수정 대본')
    page.set_description_content({'text':'New slide','extra_fields':{'TTS_SCRIPT':'Regenerated'}})
    assert page.narration_text == '사용자 수정 대본'
    page.set_narration_text('')
    page.set_description_content({'text':'New slide','extra_fields':{'TTS_SCRIPT':'Regenerated'}})
    assert page.narration_text == ''


def test_generated_descriptions_request_and_parse_script():
    from services.ai_service import AIService, ProjectContext
    provider=MagicMock()
    provider.generate_text.return_value='Slide title: Test\n--- SLIDE_TEXT ---\nVisible\n--- SLIDE_TEXT_END ---\nTTS_SCRIPT: Spoken explanation'
    ai=AIService(text_provider=provider,image_provider=MagicMock(),caption_provider=MagicMock())
    result=ai.generate_page_description(ProjectContext({'idea_prompt':'Test'}),[],{'title':'Test'},1,language='ko')
    assert 'TTS_SCRIPT:' in provider.generate_text.call_args.args[0]
    assert result['extra_fields']['TTS_SCRIPT'] == 'Spoken explanation'
    assert 'Spoken explanation' not in result['text']


def test_script_api_roundtrip_and_validation(client):
    project=client.post('/api/projects',json={'creation_type':'blank'}).json['data']['project_id']
    page=client.post(f'/api/projects/{project}/pages',json={'order_index':0,'outline_content':{'title':'Test'}}).json['data']['page_id']
    route=f'/api/projects/{project}/pages/{page}/narration'
    assert client.put(route,json={'narration_text':'내 발표 스크립트'}).status_code==200
    assert client.get(f'/api/projects/{project}').json['data']['pages'][0]['narration_text']=='내 발표 스크립트'
    for bad in ([],None,'a'*4001):
        assert client.put(route,json={'narration_text':bad}).status_code==400


def test_operational_errors_never_return_chinese():
    from utils.user_messages import localize_error, status_message
    value='오류: '+chr(0x9519)+chr(0x8bef)
    assert chr(0x9519) not in localize_error(value)
    assert chr(0x9519) not in status_message(value)


@pytest.mark.parametrize('version,allowed', [('22.23.3',False),('22.23.4',True),('24.19.0',False),('24.22.1',True),('26.12.0',False),('26.12.1',True),('20.20.0',False),('27.0.0',False),('24.22.1-rc.1',False)])
def test_node_security_floor(version,allowed):
    import sys
    sys.path.insert(0,str(Path(__file__).parents[3]/'scripts'))
    from node_version import require_secure_node
    if allowed: require_secure_node(version)
    else:
        with pytest.raises(RuntimeError): require_secure_node(version)


def test_video_admission_is_bounded(client, app, monkeypatch):
    from models import db, Project, Page
    from services import tts_video_service as video
    from services.task_manager import task_manager
    monkeypatch.setenv('AZURE_OPENAI_API_KEY','test')
    monkeypatch.setitem(app.config,'AZURE_OPENAI_ENDPOINT','https://company.openai.azure.com')
    monkeypatch.setitem(app.config,'AZURE_OPENAI_TTS_DEPLOYMENT','company-speech')
    monkeypatch.setattr(video,'check_ffmpeg_available',lambda *_:True)
    submit=MagicMock();monkeypatch.setattr(task_manager,'submit_task',submit)
    project=Project();db.session.add(project);db.session.flush()
    page=Page(project_id=project.id,order_index=0,generated_image_path='test.png',narration_text='User script')
    db.session.add(page);db.session.commit()
    try:
        assert client.post(f'/api/projects/{project.id}/export/video',json={}).status_code==202
        assert client.post(f'/api/projects/{project.id}/export/video',json={}).status_code==409
        assert submit.call_count==1
    finally: video.VIDEO_SLOT.release()


def test_azure_settings_migration_preserves_content(tmp_path):
    import sqlalchemy as sa
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    path=Path(__file__).parents[2]/'migrations/versions/sola_azure_only.py'
    spec=importlib.util.spec_from_file_location('sola_migration',path)
    migration=importlib.util.module_from_spec(spec);spec.loader.exec_module(migration)
    engine=sa.create_engine(f'sqlite:///{tmp_path}/upgrade.db')
    with engine.begin() as connection:
        columns=', '.join(f'{name} TEXT' for name in migration.REMOVED)
        connection.exec_driver_sql(f'CREATE TABLE settings (id INTEGER PRIMARY KEY, image_quality TEXT, {columns})')
        connection.exec_driver_sql("INSERT INTO settings (id,image_quality,text_model_source,text_model) VALUES (1,'high','openai','old-model')")
        connection.exec_driver_sql('CREATE TABLE pages (id INTEGER PRIMARY KEY,narration_text TEXT)')
        connection.exec_driver_sql("INSERT INTO pages VALUES (1,'User-reviewed script')")
        migration.op=Operations(MigrationContext.configure(connection));migration.upgrade()
        names={col['name'] for col in sa.inspect(connection).get_columns('settings')}
        assert not names.intersection(migration.REMOVED)
        assert connection.exec_driver_sql('SELECT image_quality FROM settings').scalar_one()=='high'
        assert connection.exec_driver_sql('SELECT narration_text FROM pages').scalar_one()=='User-reviewed script'
        assert 'design_system_prompt' in names


def test_video_task_preserves_saved_script_and_releases_slot(client,app,monkeypatch):
    from models import db,Project,Page,Task
    from services import tts_video_service as video
    from services.task_manager import export_video_task
    from services.file_service import FileService
    from PIL import Image
    project=Project();db.session.add(project);db.session.flush()
    page=Page(project_id=project.id,order_index=0,narration_text='Reviewed script')
    db.session.add(page);db.session.flush()
    service=FileService(app.config['UPLOAD_FOLDER'])
    page.generated_image_path=service.save_generated_image(Image.new('RGB',(16,16)),project.id,page.id)
    task=Task(project_id=project.id,task_type='EXPORT_VIDEO',status='PENDING')
    db.session.add(task);db.session.commit()
    captured=[]
    def render(data,path,**kwargs): captured.extend(data);Path(path).write_bytes(b'unit artifact')
    monkeypatch.setattr(video,'generate_narration_video',render)
    assert video.VIDEO_SLOT.acquire(blocking=False)
    export_video_task(task.id,project.id,'video',service,app=app)
    assert captured[0]['narration_text']=='Reviewed script'
    db.session.expire_all()
    assert db.session.get(Task,task.id).status=='COMPLETED'
    assert video.VIDEO_SLOT.acquire(blocking=False)
    video.VIDEO_SLOT.release()
