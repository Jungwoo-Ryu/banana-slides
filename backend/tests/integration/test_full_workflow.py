"""
Full workflow integration test

Test from creation to export PPTX . . . .
"""

import pytest
import time
import io
from pathlib import Path
from flask import current_app
from PIL import Image
from conftest import assert_success_response


class TestFullWorkflow:
    """Full workflow testing"""

    def test_create_project_and_get_details(self, client):
        """Test creation items and get details"""
        # 1. Create Item
        create_response = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': 'Generates a matter of quantum calculations PPT，Total 3 Page'
        })

        data = assert_success_response(create_response, 201)
        project_id = data['data']['project_id']

        # 2. Retrieving project details
        get_response = client.get(f'/api/projects/{project_id}')

        data = assert_success_response(get_response)
        assert data['data']['project_id'] == project_id
        assert data['data']['status'] == 'DRAFT'

    def test_template_upload_workflow(self, client, sample_image_file):
        """Test template uploading workflows"""
        # 1. Create Item
        create_response = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': 'Test Template Upload'
        })

        data = assert_success_response(create_response, 201)
        project_id = data['data']['project_id']

        # 2. Upload Template
        upload_response = client.post(
            f'/api/projects/{project_id}/template',
            data={'template_image': (sample_image_file, 'template.png')},
            content_type='multipart/form-data'
        )

        # Check for upload results
        assert upload_response.status_code in [200, 201]

    def test_invalid_template_upload_is_rejected_and_does_not_replace_existing(self, client, sample_image_file):
        """Template upload of extension correctly but not of pictures should be rejected at the saving stage"""
        create_response = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': 'Test for illegal template upload'
        })
        data = assert_success_response(create_response, 201)
        project_id = data['data']['project_id']

        upload_response = client.post(
            f'/api/projects/{project_id}/template',
            data={'template_image': (sample_image_file, 'template.png')},
            content_type='multipart/form-data'
        )
        assert_success_response(upload_response)

        template_path = Path(current_app.config['UPLOAD_FOLDER']) / project_id / 'template' / 'template.png'
        assert template_path.exists()

        invalid_response = client.post(
            f'/api/projects/{project_id}/template',
            data={'template_image': (io.BytesIO(b'<html>not an image</html>'), 'template.png')},
            content_type='multipart/form-data'
        )

        assert invalid_response.status_code == 400
        with Image.open(template_path) as image:
            assert image.size == (100, 100)

    def test_invalid_user_template_upload_is_rejected(self, client):
        """The user template library cannot save non-photo content disguised by extension"""
        response = client.post(
            '/api/user-templates',
            data={'template_image': (io.BytesIO(b'<html>not an image</html>'), 'template.png')},
            content_type='multipart/form-data'
        )

        assert response.status_code == 400

    def test_project_lifecycle(self, client):
        """Test the full life cycle of the project"""
        # 1. Create
        create_response = client.post('/api/projects', json={
            'creation_type': 'idea',
            'idea_prompt': 'Life cycle test'
        })
        data = assert_success_response(create_response, 201)
        project_id = data['data']['project_id']

        # 2. Read
        get_response = client.get(f'/api/projects/{project_id}')
        assert_success_response(get_response)

        # 3. Update (if) API Support）
        # update_response = client.put(f'/api/projects/{project_id}', json={...})

        # 4. Delete
        delete_response = client.delete(f'/api/projects/{project_id}')
        assert_success_response(delete_response)

        # 5. Confirm Delete
        verify_response = client.get(f'/api/projects/{project_id}')
        assert verify_response.status_code == 404


class TestAPIErrorHandling:
    """API Error Processing Test"""

    def test_invalid_json_body(self, client):
        """The test is invalid. JSON Request"""
        response = client.post(
            '/api/projects',
            data='invalid json',
            content_type='application/json'
        )

        assert response.status_code in [400, 415, 422]

    def test_missing_required_fields(self, client):
        """Test missing required field"""
        response = client.post('/api/projects', json={})

        assert response.status_code in [400, 422]

    def test_method_not_allowed(self, client):
        """Tests are not allowed. HTTP Methodology"""
        response = client.patch('/api/projects')

        # PATCH Could not be supported
        assert response.status_code in [404, 405]


class TestConcurrentRequests:
    """Combine Request Test"""

    def test_multiple_project_creation(self, client):
        """Test multiple projects to create non-conflict"""
        project_ids = []

        for i in range(3):
            response = client.post('/api/projects', json={
                'creation_type': 'idea',
                'idea_prompt': f'Concurrent Test Project {i}'
            })

            data = assert_success_response(response, 201)
            project_ids.append(data['data']['project_id'])

        # Ensure all projects ID It’s all different.
        assert len(set(project_ids)) == 3

        # Cleaning
        for pid in project_ids:
            client.delete(f'/api/projects/{pid}')
