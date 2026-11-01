"""
Project management API Unit Test
"""

import pytest
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from conftest import assert_success_response, assert_error_response


class TestProjectCreate:
    """Project Creation Test"""

    def test_create_project_idea_mode(self, client):
        """Test to create items from ideas"""
        response = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': 'Generate a question AI It’s... PPT'
        })

        data = assert_success_response(response, 201)
        assert 'project_id' in data['data']
        assert data['data']['status'] == 'DRAFT'

    def test_create_project_outline_mode(self, client):
        """Test to create items from outline"""
        response = client.post('/api/projects', json={
            'creation_type': 'outline',
            'outline_text': 'Page 1： Introduction\n- Key points 1\n\n Page 2： Programmes\n- Key points 2'
        })

        data = assert_success_response(response, 201)
        assert 'project_id' in data['data']

    @pytest.mark.parametrize('payload, expected_message', [
        (
            {'creation_type': 'idea', 'idea_prompt': '  \n\t '},
            'idea_prompt must contain non-whitespace text',
        ),
        (
            {'creation_type': 'outline', 'outline_text': ''},
            'outline_text must contain non-whitespace text',
        ),
        (
            {'creation_type': 'descriptions', 'description_text': None},
            'description_text is required',
        ),
        (
            {'creation_type': 'descriptions', 'description_text': ['not text']},
            'description_text must be a string',
        ),
    ])
    def test_create_project_rejects_missing_blank_or_non_text_content(
        self, client, payload, expected_message
    ):
        response = client.post('/api/projects', json=payload)

        data = assert_error_response(response, 400)
        assert data['error']['message']
        assert any('가' <= c <= '힣' for c in data['error']['message'])

    def test_create_project_normalizes_selected_content_and_template_style(self, client):
        response = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': '  AI Product launch  ',
            'outline_text': 'Should not write to current mode',
            'template_style': '  A very simple business wind.  ',
        })

        created = assert_success_response(response, 201)['data']
        project = assert_success_response(
            client.get(f"/api/projects/{created['project_id']}")
        )['data']
        assert project['idea_prompt'] == 'AI Product launch'
        assert project['outline_text'] is None
        assert project['template_style'] == 'A very simple business wind.'

    def test_create_project_rejects_non_text_template_style(self, client):
        response = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': 'AI Product launch',
            'template_style': {'name': 'invalid'},
        })

        data = assert_error_response(response, 400)
        assert '스타일 설명' in data['error']['message']

    @pytest.mark.parametrize('template_style', ['', '   \n\t '])
    def test_create_project_normalizes_empty_template_style_to_none(
        self, client, template_style
    ):
        response = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': 'AI Product launch',
            'template_style': template_style,
        })

        created = assert_success_response(response, 201)['data']
        project = assert_success_response(
            client.get(f"/api/projects/{created['project_id']}")
        )['data']
        assert project['template_style'] is None

    def test_create_project_missing_type(self, client):
        """Test is missing creation_type Parameters"""
        response = client.post('/api/projects', json={
            'idea_prompt': 'Test'
        })

        # Should return the error
        assert response.status_code in [400, 422]

    def test_create_project_invalid_type(self, client):
        """The test is invalid. creation_type"""
        response = client.post('/api/projects', json={
            'creation_type': 'invalid_type',
            'idea_prompt': 'Test'
        })

        assert response.status_code in [400, 422]


class TestPageBatchCreate:
    """Page Batch Creation Test"""

    def test_batch_create_pages_preserves_request_order_and_shifts_existing_pages(self, client):
        response = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': 'Batch Import Test'
        })
        data = assert_success_response(response, 201)
        project_id = data['data']['project_id']

        first_page = assert_success_response(client.post(f'/api/projects/{project_id}/pages', json={
            'order_index': 0,
            'outline_content': {'title': 'Original First Page', 'points': ['Existing content']},
        }), 201)['data']
        second_page = assert_success_response(client.post(f'/api/projects/{project_id}/pages', json={
            'order_index': 1,
            'outline_content': {'title': 'Original Page 2', 'points': ['Existing content']},
        }), 201)['data']

        response = client.post(f'/api/projects/{project_id}/pages/batch', json={
            'pages': [
                {
                    'order_index': 1,
                    'part': 'Import Chapter',
                    'outline_content': {'title': 'Import First Page', 'points': ['A']},
                    'description_content': {'text': 'First Page Description'},
                },
                {
                    'order_index': 2,
                    'outline_content': {'title': 'Import Page 2', 'points': ['B']},
                },
            ]
        })

        created = assert_success_response(response, 201)['data']
        assert [page['outline_content']['title'] for page in created] == ['Import First Page', 'Import Page 2']
        assert created[0]['status'] == 'DESCRIPTION_GENERATED'
        assert created[0]['part'] == 'Import Chapter'

        project = assert_success_response(client.get(f'/api/projects/{project_id}'))['data']
        pages = sorted(project['pages'], key=lambda page: page['order_index'])

        assert [page['outline_content']['title'] for page in pages] == [
            'Original First Page',
            'Import First Page',
            'Import Page 2',
            'Original Page 2',
        ]
        assert [page['order_index'] for page in pages] == [0, 1, 2, 3]
        assert pages[0]['page_id'] == first_page['page_id']
        assert pages[3]['page_id'] == second_page['page_id']

    def test_batch_create_pages_rejects_empty_payload(self, client):
        response = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': 'Batch Import Test'
        })
        data = assert_success_response(response, 201)
        project_id = data['data']['project_id']

        response = client.post(f'/api/projects/{project_id}/pages/batch', json={'pages': []})

        assert response.status_code == 400

    @pytest.mark.parametrize('page_payload', [
        {'order_index': '1', 'outline_content': {'title': 'bad'}},
        {'order_index': 1, 'outline_content': 'bad'},
        {'order_index': 1, 'description_content': 'bad'},
    ])
    def test_batch_create_pages_validates_payload_types(self, client, page_payload):
        response = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': 'Batch Import Test'
        })
        data = assert_success_response(response, 201)
        project_id = data['data']['project_id']

        response = client.post(f'/api/projects/{project_id}/pages/batch', json={
            'pages': [page_payload]
        })

        assert response.status_code == 400

    def test_batch_create_pages_allows_null_optional_content(self, client):
        response = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': 'Batch Import Test'
        })
        data = assert_success_response(response, 201)
        project_id = data['data']['project_id']

        response = client.post(f'/api/projects/{project_id}/pages/batch', json={
            'pages': [{
                'order_index': 0,
                'outline_content': None,
                'description_content': None,
            }]
        })

        created = assert_success_response(response, 201)['data']
        assert created[0]['status'] == 'DRAFT'
        assert created[0]['outline_content'] is None
        assert created[0]['description_content'] is None


class TestProjectGet:
    """Project Acquisition Test"""

    def test_get_project_success(self, client, sample_project):
        """Test to obtain project success"""
        if not sample_project:
            pytest.skip("Project creation failed")

        project_id = sample_project['project_id']
        response = client.get(f'/api/projects/{project_id}')

        data = assert_success_response(response)
        assert data['data']['project_id'] == project_id

    def test_get_project_not_found(self, client):
        """Test to get items that do not exist"""
        response = client.get('/api/projects/non-existent-id')

        assert response.status_code == 404

    def test_get_project_invalid_id_format(self, client):
        """Invalid Test Item ID Format"""
        response = client.get('/api/projects/invalid!@#$%id')

        # Possible Return 404 or 400
        assert response.status_code in [400, 404]


class TestResourceConcurrency:
    def test_image_limiter_allows_more_than_global_four_workers(self, app):
        """Photo resources should be sent to image limiter Control over the old world. 4 worker It’s stuck early.。"""
        from services.task_manager import (
            TaskManager,
            ResourceLimiter,
        )

        limiter = ResourceLimiter("image-test", 8)
        executor = ThreadPoolExecutor(max_workers=10)
        started = []
        active = 0
        peak_active = 0
        gate = threading.Event()
        state_lock = threading.Lock()

        def worker(i: int):
            nonlocal active, peak_active
            with limiter.slot(f"page-{i}"):
                with state_lock:
                    started.append(i)
                    active += 1
                    peak_active = max(peak_active, active)
                gate.wait(timeout=5)
                with state_lock:
                    active -= 1

        futures = [executor.submit(worker, i) for i in range(8)]

        deadline = time.time() + 2
        while time.time() < deadline:
            with state_lock:
                if len(started) == 8:
                    break
            time.sleep(0.05)

        gate.set()
        for future in futures:
            future.result(timeout=5)
        executor.shutdown(wait=True)

        assert len(started) == 8
        assert peak_active == 8

    def test_shared_task_pool_no_longer_caps_single_page_image_tasks_at_four(self, app):
        """Even if we share the pool, 4 An old act, a photo mission. image limiter Decision-making。"""
        from models import db, Project, Page
        from controllers import page_controller as page_controller_module
        from services import task_manager as task_manager_module
        from services.task_manager import sync_resource_limits

        class SlowAIService:
            def extract_image_urls_from_markdown(self, _text):
                return []

            def generate_image_prompt(self, *args, **kwargs):
                return "prompt"

            def generate_image(self, *args, **kwargs):
                time.sleep(0.3)
                from PIL import Image
                return Image.new('RGB', (32, 32), color='blue')

        with app.app_context():
            app.config['MAX_IMAGE_WORKERS'] = 8
            app.config['MAX_DESCRIPTION_WORKERS'] = 2
            sync_resource_limits(2, 8)

            project = Project(
                id='proj-concurrency',
                creation_type='idea',
                idea_prompt='test',
                template_style='clean',
                image_aspect_ratio='16:9',
                status='DRAFT',
            )
            db.session.add(project)

            pages = []
            for i in range(5):
                page = Page(project_id=project.id, order_index=i, status='DESCRIPTION_GENERATED')
                page.set_outline_content({'title': f'Page {i+1}', 'points': []})
                page.set_description_content({'text': f'Description {i+1}'})
                db.session.add(page)
                pages.append(page)

            db.session.commit()

            client = app.test_client()
            task_ids = []

            def fake_save_image_with_version(_image, _project_id, _page_id, _file_service, page_obj=None, image_format='PNG'):
                if page_obj:
                    page_obj.generated_image_path = f"generated/{_page_id}.png"
                    page_obj.status = 'COMPLETED'
                return (f"generated/{_page_id}.png", 1)

            with (
                patch.object(page_controller_module, 'get_ai_service', return_value=SlowAIService()),
                patch.object(task_manager_module, 'save_image_with_version', side_effect=fake_save_image_with_version),
            ):
                for page in pages:
                    response = client.post(
                        f'/api/projects/{project.id}/pages/{page.id}/generate/image',
                        json={'force_regenerate': True},
                    )
                    data = assert_success_response(response, 202)
                    task_ids.append(data['data']['task_id'])

                deadline = time.time() + 1.5
                processed = 0
                while time.time() < deadline:
                    statuses = [client.get(f'/api/projects/{project.id}/tasks/{task_id}').get_json()['data']['status'] for task_id in task_ids]
                    processed = sum(status in {'PROCESSING', 'COMPLETED'} for status in statuses)
                    if processed >= 5:
                        break
                    time.sleep(0.05)

                assert processed >= 5

                completion_deadline = time.time() + 3
                while time.time() < completion_deadline:
                    statuses = [client.get(f'/api/projects/{project.id}/tasks/{task_id}').get_json()['data']['status'] for task_id in task_ids]
                    if all(status == 'COMPLETED' for status in statuses):
                        break
                    time.sleep(0.05)

                assert all(status == 'COMPLETED' for status in statuses)


class TestProjectOutlineStream:
    """Fluid Outline Generation Test"""

    def test_flatten_outline_preserves_falsy_parent_part_values(self):
        """Parent part Even empty strings or None，You should cover the sub-pages like the old logic. part"""
        from services.ai_service import AIService

        service = AIService.__new__(AIService)

        pages = service.flatten_outline([
            {'part': '', 'pages': [{'title': 'Empty Group', 'points': []}]},
            {'part': None, 'pages': [{'title': 'No Grouping', 'points': [], 'part': 'Subpage Grouping'}]},
        ])

        assert pages[0]['part'] == ''
        assert pages[1]['part'] is None

    def test_flatten_outline_strips_title_and_part_whitespace(self):
        """Cleaning of header and group name beginning and end blanks when relativization"""
        from services.ai_service import AIService

        service = AIService.__new__(AIService)

        pages = service.flatten_outline([
            {'title': '  Direct Page  ', 'points': [], 'part': '  Subpage Grouping  '},
            {'part': '  Parent Group  ', 'pages': [{'title': '  Group Pages  ', 'points': []}]},
        ])

        assert pages[0]['title'] == 'Direct Page'
        assert pages[0]['part'] == 'Subpage Grouping'
        assert pages[1]['title'] == 'Group Pages'
        assert pages[1]['part'] == 'Parent Group'

    def test_flatten_outline_drops_blank_points_from_ai_output(self):
        """AI Empty Return/None The main points should not be lost. bullet Or string None"""
        from services.ai_service import AIService

        service = AIService.__new__(AIService)

        pages = service.flatten_outline([
            {'title': 'Cleanup point', 'points': ['  Elements of effectiveness  ', None, '', '   ']},
            {'title': 'String Elements', 'points': '  Single points  '},
            {'title': 'Empty String Points', 'points': '   '},
        ])

        assert pages[0]['points'] == ['Elements of effectiveness']
        assert pages[1]['points'] == ['Single points']
        assert pages[2]['points'] == []

    def test_from_description_normalizes_string_outline_pages_after_count_mismatch(self, client, app, monkeypatch):
        """Compatibility from description generation AI Returns a string page and does not match pages because page_data.get Crash"""
        response = client.post('/api/projects', json={
            'creation_type': 'descriptions',
            'description_text': 'Page 1： Cover. Page 2： Summary。'
        })
        data = assert_success_response(response, 201)
        project_id = data['data']['project_id']

        class FakeAIService:
            def parse_description_to_outline(self, project_context, language=None):
                return ['Cover Page', 'Summary page']

            def parse_description_to_page_descriptions(self, project_context, outline, language=None):
                return [f'Page description {index}' for index in range(16)]

            def flatten_outline(self, outline):
                from services.ai_service import AIService
                service = AIService.__new__(AIService)
                return AIService.flatten_outline(service, outline)

        monkeypatch.setattr('controllers.project_controller.get_ai_service', lambda: FakeAIService())

        generate_response = client.post(
            f'/api/projects/{project_id}/generate/from-description',
            json={'language': 'zh'},
        )

        data = assert_success_response(generate_response)
        assert len(data['data']['pages']) == 2
        assert data['data']['pages'][0]['outline_content'] == {'title': 'Cover Page', 'points': []}
        assert data['data']['pages'][0]['description_content']['text'] == 'Page description 0'

        with app.app_context():
            from models import Page, Project
            project = Project.query.get(project_id)
            pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()

            assert project.status == 'DESCRIPTIONS_GENERATED'
            assert len(pages) == 2
            assert pages[1].get_outline_content() == {'title': 'Summary page', 'points': []}
            assert pages[1].get_description_content()['text'] == 'Page description 1'

    def test_description_stream_prompt_uses_latest_description_format(self):
        """Generated from Description SSE prompt Respond to the latest page description format instead of the old version Slide title/SLIDE_TEXT Format"""
        from services.ai_service import ProjectContext
        from services.prompts import get_description_to_outline_prompt_markdown

        context = ProjectContext({
            'creation_type': 'descriptions',
            'description_text': 'Page 1： Introduction to the theme',
        })

        prompt = get_description_to_outline_prompt_markdown(
            context,
            language='zh',
            extra_fields=['Visual assets'],
        )

        assert '<!-- PAGE_DESCRIPTION -->' in prompt
        assert '--- SLIDE_TEXT ---' in prompt
        assert '--- SLIDE_TEXT_END ---' in prompt
        # Material citation incorporated"Visual assets"fields, no longer independent"Image assets"Paragraph
        assert 'Image assets：' not in prompt
        assert 'Visual assets：' in prompt
        assert 'Slide title：' not in prompt

    def test_outline_stream_parses_legacy_outline_only_markdown(self):
        """General outline SSE Still compatible with only headings and points Markdown Output"""
        from services.ai_service import AIService, ProjectContext

        class FakeTextProvider:
            def generate_text_stream(self, prompt, thinking_budget=0):
                yield '# Chapter I\n## Page I\n- Key points 1\n One sentence to add\n## Page 2\n- Key points 2\n<!-- END -->'

        service = AIService(text_provider=FakeTextProvider(), image_provider=None, caption_provider=None)
        context = ProjectContext({
            'creation_type': 'outline',
            'outline_text': 'Page I\n- Key points 1\n Page 2\n- Key points 2',
        })

        pages = list(service.generate_outline_stream(context, language='zh'))

        assert pages[:-1] == [
            {'title': 'Page I', 'points': ['Key points 1', 'One sentence to add'], 'part': 'Chapter I'},
            {'title': 'Page 2', 'points': ['Key points 2'], 'part': 'Chapter I'},
        ]
        assert pages[-1] == {'__stream_complete__': True}

    def test_outline_stream_ignores_deck_title_before_cover(self):
        """SSE Fluid resolution： deck Level H1 Document title shall not contaminate the cover part；
        It’s legal after cover. # Part Subsections still need to enter into force。"""
        from services.ai_service import AIService, ProjectContext

        class FakeTextProvider:
            def generate_text_stream(self, prompt, thinking_budget=0):
                yield (
                    '# Decision-making reporting：AI Strategic choice of reasoning structure\n'
                    '## Decision-making reporting：AI Strategic choice of reasoning structure\n'
                    '- Subtitles and reporting person information\n'
                    '# Part I： Economic analysis\n'
                    '## Existing expenditure has increased exponentially\n'
                    '- Risk of out-of-control costs and urgent need for alternatives\n'
                    '<!-- END -->'
                )

        service = AIService(text_provider=FakeTextProvider(), image_provider=None, caption_provider=None)
        context = ProjectContext({
            'creation_type': 'outline',
            'outline_text': 'x',
        })

        pages = list(service.generate_outline_stream(context, language='zh'))
        content = pages[:-1]

        assert len(content) == 2
        # Cover Page：deck Title ignored, not generated part
        assert content[0]['title'] == 'Decision-making reporting：AI Strategic choice of reasoning structure'
        assert 'part' not in content[0]
        # Legitimate subsections after the cover are still valid.
        assert content[1].get('part') == 'Part I： Economic analysis'
        assert pages[-1] == {'__stream_complete__': True}

    def test_description_stream_parser_binds_description_to_same_page(self):
        """Description SSE The new format should bind the outline and page description of the same page to the same result"""
        from services.ai_service import AIService, ProjectContext

        class FakeTextProvider:
            def generate_text_stream(self, prompt, thinking_budget=0):
                yield (
                    '## Page I\n'
                    '<!-- OUTLINE_POINTS -->\n'
                    '- Establish the page purpose and connect the audience from context to the main argument.\n'
                    '<!-- PAGE_DESCRIPTION -->\n'
                    '--- SLIDE_TEXT ---\n'
                    '- Background and objectives\n'
                    '\n--- SLIDE_TEXT_END ---\n'
                    '\nImage assets：\n'
                    'Use a simple background map\n'
                    '\nVisual elements：Key indicators card\n'
                    '<!-- PAGE_END -->\n'
                    '<!-- END -->'
                )

        service = AIService(text_provider=FakeTextProvider(), image_provider=None, caption_provider=None)
        context = ProjectContext({
            'creation_type': 'descriptions',
            'description_text': 'Page 1： Background and objectives',
        })

        pages = list(service.generate_outline_stream(context, language='zh'))

        assert pages[0]['title'] == 'Page I'
        assert pages[0]['points'] == ['Establish the page purpose and connect the audience from context to the main argument.']
        assert '--- SLIDE_TEXT ---' in pages[0]['description_text']
        assert 'Slide title：' not in pages[0]['description_text']
        assert pages[0]['extra_fields']['Visual elements'] == 'Key indicators card'
        assert pages[-1] == {'__stream_complete__': True}

    def test_description_stream_persists_outline_and_description(self, client, app, monkeypatch):
        """The same article should govern generation from the description SSE Flow library outline and page description to avoid double splits of pages"""
        response = client.post('/api/projects', json={
            'creation_type': 'descriptions',
            'description_text': 'Page 1： Introduction to the theme. Page 2： Launching the programme。'
        })
        data = assert_success_response(response, 201)
        project_id = data['data']['project_id']

        class FakeAIService:
            def generate_outline_stream(self, project_context, language=None):
                yield {
                    'title': 'Introduction of themes',
                    'points': ['Background', 'Objective'],
                    'description_text': '--- SLIDE_TEXT ---\n- Background\n- Objective\n\n--- SLIDE_TEXT_END ---',
                    'extra_fields': {'Visual elements': 'Background chart'},
                }
                yield {
                    'title': 'Launch programme',
                    'points': ['Path', 'Result'],
                    'description_text': '--- SLIDE_TEXT ---\n- Path\n- Result\n\n--- SLIDE_TEXT_END ---',
                }
                yield {'__stream_complete__': True}

        monkeypatch.setattr('controllers.project_controller.get_ai_service', lambda: FakeAIService())

        stream_response = client.post(
            f'/api/projects/{project_id}/generate/outline/stream',
            json={'language': 'zh'},
            buffered=True,
        )
        assert stream_response.status_code == 200
        body = stream_response.get_data(as_text=True)

        assert 'event: page' in body
        assert 'description_text' in body
        assert 'event: done' in body

        with app.app_context():
            from models import Page, Project
            project = Project.query.get(project_id)
            pages = Page.query.filter_by(project_id=project_id).order_by(Page.order_index).all()

            assert project.status == 'DESCRIPTIONS_GENERATED'
            assert len(pages) == 2
            assert pages[0].get_outline_content() == {'title': 'Introduction of themes', 'points': ['Background', 'Objective']}
            assert pages[0].get_description_content()['text'].startswith('--- SLIDE_TEXT ---')
            assert pages[0].get_description_content()['extra_fields'] == {'Visual elements': 'Background chart'}
            assert pages[1].get_outline_content()['title'] == 'Launch programme'


class TestProjectUpdate:
    """Project Update Tests"""

    def test_update_project_status(self, client, sample_project):
        """Test Update Project Status"""
        if not sample_project:
            pytest.skip("Project creation failed")

        project_id = sample_project['project_id']
        response = client.put(f'/api/projects/{project_id}', json={
            'status': 'GENERATING'
        })

        # Status update should be successful
        assert response.status_code == 200
        data = response.get_json()
        assert data['success'] is True

    def test_update_project_title(self, client, sample_project):
        """The title of the test update item does not affect idea_prompt"""
        if not sample_project:
            pytest.skip("Project creation failed")

        project_id = sample_project['project_id']
        get_before = client.get(f'/api/projects/{project_id}')
        before_data = assert_success_response(get_before)

        response = client.put(f'/api/projects/{project_id}', json={
            'project_title': 'New item title'
        })

        data = assert_success_response(response)
        assert data['data']['project_title'] == 'New item title'
        assert data['data']['idea_prompt'] == before_data['data']['idea_prompt']


class TestProjectDelete:
    """Item Delete Test"""

    def test_delete_project_success(self, client, sample_project):
        """Test to delete item successfully"""
        if not sample_project:
            pytest.skip("Project creation failed")

        project_id = sample_project['project_id']
        response = client.delete(f'/api/projects/{project_id}')

        data = assert_success_response(response)

        # Confirm item deleted
        get_response = client.get(f'/api/projects/{project_id}')
        assert get_response.status_code == 404

    def test_delete_project_not_found(self, client):
        """Test to delete items that do not exist"""
        response = client.delete('/api/projects/non-existent-id')

        assert response.status_code == 404
