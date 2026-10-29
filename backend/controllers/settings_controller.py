"""Local settings API. Secrets are never accepted, stored or returned."""
from datetime import datetime, timezone
from pathlib import Path
from flask import Blueprint, current_app, request
from models import db, Settings, Task
from utils import success_response, error_response
from services.settings_service import serialize_settings, update_preferences, sync_settings, FIELD_CONFIG, EXTRA_FIELDS
from services.task_manager import task_manager
from services.runtime_config import setting

settings_bp = Blueprint('settings', __name__, url_prefix='/api/settings')


@settings_bp.get('')
def get_settings():
    return success_response(serialize_settings(Settings.get_settings()))


@settings_bp.route('', methods=['PUT', 'PATCH'])
def update_settings():
    try:
        return success_response(update_preferences(request.get_json()), '설정을 저장했습니다.')
    except ValueError as error:
        return error_response('INVALID_SETTINGS', str(error))


@settings_bp.post('/reset')
def reset_settings():
    preferences = Settings.get_settings()
    for field in FIELD_CONFIG.keys() | EXTRA_FIELDS:
        if not field.startswith('enable_') and not field.endswith('thinking_budget'):
            setattr(preferences, field, None)
    for field in ('enable_text_reasoning', 'enable_image_reasoning', 'enable_image_quality_control'):
        setattr(preferences, field, False)
    db.session.commit()
    sync_settings(current_app, preferences)
    return success_response(serialize_settings(preferences))


@settings_bp.get('/active-config')
def get_active_config():
    return get_settings()


def _run_test(task_id, name, app):
    with app.app_context():
        task = db.session.get(Task, task_id)
        task.status = 'PROCESSING'
        db.session.commit()
        try:
            from services.ai_providers import get_text_provider, get_image_provider, get_caption_provider
            from PIL import Image
            result = {}
            if name == 'text-model':
                result['text'] = get_text_provider(setting('TEXT_MODEL')).generate_text('연결 확인입니다. 한국어로 확인이라고 답하세요.')
            elif name == 'image-model':
                provider = get_image_provider(setting('IMAGE_MODEL'))
                image = provider.generate_image(prompt='A simple blue circle on a white background.', aspect_ratio='1:1', resolution='1K')
                if image is None:
                    raise ValueError('이미지 생성 결과가 비어 있습니다.')
                result['size'] = list(image.size)
            elif name == 'caption-model':
                import tempfile
                with tempfile.TemporaryDirectory() as folder:
                    path = str(Path(folder) / 'sample.png')
                    Image.new('RGB', (64,64), 'blue').save(path)
                    result['text'] = get_caption_provider(setting('IMAGE_CAPTION_MODEL')).generate_with_image('이미지 색상을 한국어로 답하세요.', path)
            elif name == 'ocr':
                from services.document_providers import get_ocr_provider
                result = get_ocr_provider().health()
            task.status = 'COMPLETED'
            task.set_progress({'result': result, 'message': '서비스 연결을 확인했습니다.'})
        except Exception as error:
            from utils.user_messages import localize_error
            task.status = 'FAILED'
            task.error_message = localize_error(str(error))
        task.completed_at = datetime.now(timezone.utc)
        db.session.commit()


@settings_bp.post('/tests/<name>')
def run_settings_test(name):
    if name not in ('text-model', 'image-model', 'caption-model', 'ocr'):
        return error_response('INVALID_TEST', '지원하지 않는 서비스 테스트입니다.')
    if request.get_json(silent=True):
        return error_response('INVALID_TEST', '설정을 먼저 저장한 다음 테스트하세요.')
    task = Task(project_id='settings-test', task_type='TEST_' + name.upper().replace('-', '_'), status='PENDING')
    db.session.add(task)
    db.session.commit()
    task_manager.submit_task(task.id, _run_test, name, current_app._get_current_object())
    return success_response({'task_id': task.id, 'status': task.status})


@settings_bp.get('/tests/<task_id>/status')
def get_test_status(task_id):
    task = db.session.get(Task, task_id)
    if not task or task.project_id != 'settings-test':
        return error_response('TASK_NOT_FOUND', '테스트 작업을 찾을 수 없습니다.', 404)
    from services.task_watchdog import reconcile_task_for_response
    reconcile_task_for_response(task)
    return success_response({'status': task.status, 'error': task.error_message, **(task.get_progress() or {})})


@settings_bp.post('/verify')
def verify_configuration():
    from services.ai_providers import _get_model_type_provider_config
    try:
        _get_model_type_provider_config('text')
        return success_response({'available': True, 'message': '텍스트 생성 설정을 확인했습니다.'})
    except ValueError as error:
        return success_response({'available': False, 'message': str(error)})
