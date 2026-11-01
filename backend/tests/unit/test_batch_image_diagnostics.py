"""Failure-path coverage through the real SDK, batch worker, DB and image files."""
import base64
from io import BytesIO
import json
from unittest.mock import MagicMock
import httpx
from openai import OpenAI
from PIL import Image
import pytest
from models import db, Page, Project, Task
from services.ai_service import AIService
from services.ai_providers.image.azure_provider import AzureImageProvider
from services.generation_diagnostics import failure_details


def image_response():
    with BytesIO() as buffer:
        Image.new('RGB', (64, 36), 'navy').save(buffer, format='PNG')
        return {'data': [{'b64_json': base64.b64encode(buffer.getvalue()).decode()}]}


def provider(handler):
    result = AzureImageProvider.__new__(AzureImageProvider)
    result.request_model = 'company-image'
    result.image_quality = 'auto'
    result.client = OpenAI(api_key='sk-do-not-log', base_url='http://azure.test/openai/v1/', max_retries=0,
                           http_client=httpx.Client(transport=httpx.MockTransport(handler)))
    return result


@pytest.mark.parametrize('status,expected', [(400, 'AZURE_IMAGE_REQUEST'), (401, 'AZURE_IMAGE_AUTH'),
    (403, 'AZURE_IMAGE_AUTH'), (404, 'AZURE_IMAGE_DEPLOYMENT'), (429, 'AZURE_IMAGE_RATE_LIMIT'), (503, 'AZURE_IMAGE_UNAVAILABLE')])
def test_azure_errors_retain_codes_and_request_ids_without_response_bodies(status, expected, caplog):
    p = provider(lambda r: httpx.Response(status, headers={'x-request-id': 'azure-fixture'},
        json={'error': {'code': 'FixtureError', 'message': 'sk-secret echoed private-prompt', 'param': 'size'}}))
    with pytest.raises(Exception) as caught:
        p.generate_image('private-prompt')
    details = failure_details(caught.value, 'generate_image')
    assert details['code'] == expected
    assert details['stage'] == 'azure_image_request'
    assert details['http_status'] == status
    assert details['provider_request_id'] == 'azure-fixture'
    assert details['provider_code'] == 'FixtureError'
    assert 'sk-secret' not in caplog.text and 'private-prompt' not in caplog.text
    p.client.close()


@pytest.mark.parametrize('kind', ['empty', 'base64', 'image', 'timeout'])
def test_invalid_image_responses_and_timeout_have_distinct_stages(kind):
    def respond(request):
        if kind == 'timeout': raise httpx.ReadTimeout('private upstream data', request=request)
        data = [] if kind == 'empty' else [{'b64_json': 'invalid!!' if kind == 'base64' else base64.b64encode(b'not an image').decode()}]
        return httpx.Response(200, json={'data': data})
    p = provider(respond)
    with pytest.raises(Exception) as caught: p.generate_image('slide')
    details = failure_details(caught.value, 'generate_image')
    assert details['code'] == ('AZURE_IMAGE_TIMEOUT' if kind == 'timeout' else 'AZURE_IMAGE_RESPONSE')
    assert details['stage'] == ('azure_image_request' if kind == 'timeout' else 'decode_image')
    p.client.close()


@pytest.fixture
def batch(client, monkeypatch):
    project_id = client.post('/api/projects', json={'creation_type': 'blank', 'template_style': 'Navy and gold'}).json['data']['project_id']
    ids = [client.post(f'/api/projects/{project_id}/pages', json={'order_index': i,
        'outline_content': {'title': f'Slide {i+1}'}, 'description_content': {'text': f'private slide {i+1}'}}).json['data']['page_id'] for i in range(2)]
    calls = []
    monkeypatch.setattr('controllers.project_controller.task_manager.submit_task', lambda task_id, fn, *args, **kw: calls.append((task_id, fn, args, kw)))
    def run(ai, page_ids=None):
        monkeypatch.setattr('controllers.project_controller.get_ai_service', lambda: ai)
        response = client.post(f'/api/projects/{project_id}/generate/images', json={'page_ids': page_ids or ids, 'max_workers': 1})
        assert response.status_code == 202, response.json
        task_id, fn, args, kw = calls.pop()
        fn(task_id, *args, **kw)
        db.session.expire_all()
        return client.get(f'/api/projects/{project_id}/tasks/{task_id}').json['data']
    return project_id, ids, run


def test_partial_failure_is_reported_success_is_kept_and_only_failed_page_is_retried(batch, monkeypatch, caplog):
    project_id, ids, run = batch
    requests = []
    def respond(request):
        requests.append(json.loads(request.content))
        if len(requests) == 1:
            return httpx.Response(401, headers={'x-request-id': 'failed-first-page'}, json={'error': {'code': 'Unauthorized', 'message': 'sk-secret'}})
        return httpx.Response(200, json=image_response())
    p = provider(respond)
    ai = AIService(text_provider=MagicMock(), image_provider=p, caption_provider=MagicMock())
    monkeypatch.setattr('services.document_providers.LocalOCRProvider.recognize', lambda *a: pytest.fail('Image generation must not call OCR'))
    monkeypatch.setenv('TESSERACT_CMD', '/nonexistent/tesseract')
    caplog.set_level('INFO', logger='services.generation_diagnostics')
    result = run(ai)
    assert result['status'] == 'FAILED'
    assert result['progress']['completed'] == result['progress']['failed'] == 1
    detail = result['progress']['page_errors'][0]
    assert detail['page_id'] == ids[0] and detail['http_status'] == 401
    assert detail['stage'] == 'azure_image_request'
    successful = db.session.get(Page, ids[1]).generated_image_path
    assert successful and db.session.get(Project, project_id).status != 'COMPLETED'
    assert db.session.get(Page, ids[0]).status == 'FAILED'
    retry = run(ai, [ids[0]])
    assert retry['status'] == 'COMPLETED'
    assert db.session.get(Page, ids[1]).generated_image_path == successful
    assert 'private slide 1' in requests[-1]['prompt']
    assert all(stage in caplog.text for stage in ('description', 'template', 'prompt', 'azure_image_request', 'decode_image', 'save_image'))
    assert 'sk-secret' not in caplog.text
    p.client.close()


def test_all_failed_pages_are_not_reported_as_completed(batch):
    _, _, run = batch
    p = provider(lambda r: httpx.Response(404, json={'error': {'code': 'DeploymentNotFound', 'message': 'missing'}}))
    result = run(AIService(text_provider=MagicMock(), image_provider=p, caption_provider=MagicMock()))
    assert result['status'] == 'FAILED'
    assert result['progress']['failed'] == 2 and result['progress']['completed'] == 0
    assert all(e['code'] == 'AZURE_IMAGE_DEPLOYMENT' for e in result['progress']['page_errors'])
    assert 'AZURE_OPENAI_IMAGE_DEPLOYMENT' in result['error_message']
    p.client.close()


def test_storage_failure_is_distinguished_from_model_failure(batch, monkeypatch):
    _, _, run = batch
    p = provider(lambda r: httpx.Response(200, json=image_response()))
    def fail(*args, **kwargs): raise PermissionError('private filesystem path')
    monkeypatch.setattr('services.task_manager.save_image_with_version', fail)
    result = run(AIService(text_provider=MagicMock(), image_provider=p, caption_provider=MagicMock()))
    assert result['status'] == 'FAILED'
    assert result['progress']['page_errors'][0]['code'] == 'IMAGE_SAVE_FAILED'
    assert 'private filesystem path' not in json.dumps(result)
    p.client.close()


def test_subset_generation_uses_the_selected_page_outline(batch):
    project_id, ids, run = batch
    prompts = []
    def respond(request):
        prompts.append(json.loads(request.content)['prompt'])
        return httpx.Response(200, json=image_response())
    p = provider(respond)
    result = run(AIService(text_provider=MagicMock(), image_provider=p, caption_provider=MagicMock()), [ids[1]])
    assert result['status'] == 'COMPLETED'
    # Page description alone also contains its number; require the outline title.
    assert 'private slide 2' in prompts[0]
    assert 'This is the cover slide' not in prompts[0]
    assert db.session.get(Page, ids[0]).generated_image_path is None
    assert db.session.get(Project, project_id).status != 'COMPLETED'
    p.client.close()


@pytest.mark.parametrize('workers', [0, -1, True, None, '2'])
def test_invalid_worker_count_is_rejected_before_a_task_is_created(batch, client, workers):
    project_id, _, _ = batch
    before = Task.query.count()
    response = client.post(f'/api/projects/{project_id}/generate/images', json={'max_workers': workers})
    assert response.status_code == 400
    assert Task.query.count() == before


def test_missing_image_deployment_has_actionable_diagnostics(batch, app, monkeypatch):
    from services.ai_providers import get_image_provider
    from services.ai_providers.deferred import DeferredProvider
    _, _, run = batch
    monkeypatch.setitem(app.config, 'AZURE_OPENAI_ENDPOINT', 'https://company.openai.azure.com')
    monkeypatch.setitem(app.config, 'AZURE_OPENAI_IMAGE_DEPLOYMENT', '')
    monkeypatch.setenv('AZURE_OPENAI_API_KEY', 'sk-fixture')
    monkeypatch.delenv('AZURE_OPENAI_IMAGE_DEPLOYMENT', raising=False)
    result = run(AIService(text_provider=MagicMock(), image_provider=DeferredProvider(get_image_provider, 'gpt-image-2'), caption_provider=MagicMock()))
    assert result['status'] == 'FAILED'
    assert result['progress']['page_errors'][0]['code'] == 'AZURE_IMAGE_CONFIG'
    assert 'AZURE_OPENAI_IMAGE_DEPLOYMENT' in result['error_message']


def test_quality_review_uses_vision_without_tesseract(batch, monkeypatch):
    from models import Settings
    _, _, run = batch
    settings = Settings.get_settings(); settings.enable_image_quality_control = True; db.session.commit()
    monkeypatch.setattr('services.document_providers.LocalOCRProvider.health', lambda *a: pytest.fail('Vision review must not require OCR'))
    p = provider(lambda r: httpx.Response(200, json=image_response()))
    caption = MagicMock(); caption.generate_with_image.return_value = '{"passed": true, "issues": [], "reason": "OK"}'
    result = run(AIService(text_provider=MagicMock(), image_provider=p, caption_provider=caption))
    assert result['status'] == 'COMPLETED'
    assert caption.generate_with_image.call_count == 2
    p.client.close()


def test_missing_description_reports_the_validation_stage(batch):
    _, ids, run = batch
    page = db.session.get(Page, ids[0]); page.description_content = None; db.session.commit()
    p = provider(lambda r: httpx.Response(200, json=image_response()))
    result = run(AIService(text_provider=MagicMock(), image_provider=p, caption_provider=MagicMock()), [ids[0]])
    assert result['status'] == 'FAILED'
    assert result['progress']['page_errors'][0]['code'] == 'IMAGE_DESCRIPTION_REQUIRED'
    p.client.close()
