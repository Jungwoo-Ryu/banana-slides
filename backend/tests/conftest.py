"""
pytest Profile - Provide testing fixtures and Configure

Shared configuration for all backend tests and fixtures
"""

import os
import sys
import pytest
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure backend The directories and the warehouse root directories are here. Python Path
# CLI Test to import from repository root directory `cli.*`
backend_path = Path(__file__).parent.parent
project_root = backend_path.parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(backend_path))

# Set the test environment variable - Must Import app Prior Settings
os.environ['TESTING'] = 'true'
os.environ['USE_MOCK_AI'] = 'true'  # Tag Usage mock AI Services
os.environ['GOOGLE_API_KEY'] = os.environ.get('GOOGLE_API_KEY', 'mock-api-key-for-testing')
os.environ['FLASK_ENV'] = 'testing'


@pytest.fixture(scope='session')
def app():
    """Create Flask Test Application"""
    # Create temporary directory for testing
    temp_dir = tempfile.mkdtemp()
    temp_db = os.path.join(temp_dir, 'test.db')

    # Set the test database path
    os.environ['DATABASE_PATH'] = temp_db
    os.environ.pop('DATABASE_URL', None)
    os.environ.pop('ACCESS_CODE', None)

    # Import now app
    from app import create_app

    # Create a test application using a plant function
    test_app = create_app()

    # Overwrite Configuration
    test_app.config.update({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': f'sqlite:///{temp_db}',
        'WTF_CSRF_ENABLED': False,
        'UPLOAD_FOLDER': temp_dir,
    })

    # Create an application context
    with test_app.app_context():
        from models import db
        db.create_all()

    yield test_app

    # Cleaning
    import shutil
    try:
        shutil.rmtree(temp_dir)
    except Exception:
        pass


@pytest.fixture(scope='function')
def client(app):
    """Create a test client"""
    with app.test_client() as test_client:
        with app.app_context():
            from models import db
            # Clean up old data and keep test quarantine.
            db.session.rollback()
            for table in reversed(db.metadata.sorted_tables):
                db.session.execute(table.delete())
            db.session.commit()
            yield test_client
            db.session.rollback()


@pytest.fixture(scope='function')
def db_session(app):
    """Create a database session。

    Delete only rows during cleanup, no drop_all：app fixture Yes. session Level one, table only once.，
    If it’s here drop_all It’ll delete the watch, and it’ll lead to subsequent dependency. client fixture Tests
    Report! "no such table"。
    """
    with app.app_context():
        from models import db
        db.create_all()
        yield db.session
        db.session.rollback()
        for table in reversed(db.metadata.sorted_tables):
            db.session.execute(table.delete())
        db.session.commit()
        db.session.remove()


@pytest.fixture
def sample_project(client):
    """Create Example Item"""
    response = client.post('/api/projects',
        json={
            'creation_type': 'idea',
            'idea_prompt': 'Test PPT Generate'
        }
    )
    data = response.get_json()
    return data['data'] if data.get('success') else None


@pytest.fixture
def mock_ai_service():
    """Mock AI Service, avoid real. API Call (use standard library) unittest.mock）"""
    with patch('services.ai_service.AIService') as mock:
        # Mock Examples
        mock_instance = MagicMock()
        mock.return_value = mock_instance

        # Mock Outline Generation
        mock_instance.generate_outline.return_value = [
            {'title': 'Test Page 1', 'points': ['Key points 1', 'Key points 2']},
            {'title': 'Test Page 2', 'points': ['Key points 3', 'Key points 4']},
        ]

        # Mock Flattening Outline
        mock_instance.flatten_outline.return_value = [
            {'title': 'Test Page 1', 'points': ['Key points 1', 'Key points 2']},
            {'title': 'Test Page 2', 'points': ['Key points 3', 'Key points 4']},
        ]

        # Mock Description Generation
        mock_instance.generate_page_description.return_value = {
            'title': 'Test Title',
            'text_content': ['Contents 1', 'Contents 2'],
            'extra_fields': {'Page layout': 'Centre Layout'}
        }

        # Mock Picture Generation - Returns a simple test picture
        from PIL import Image
        test_image = Image.new('RGB', (1920, 1080), color='blue')
        mock_instance.generate_image.return_value = test_image

        yield mock_instance


@pytest.fixture
def temp_upload_dir():
    """Create temporary upload directory"""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir


@pytest.fixture
def sample_image_file():
    """Create example picture file"""
    # Create a simple PNG Documentation（1x1 Red picture of pixels）
    import io
    from PIL import Image

    img = Image.new('RGB', (100, 100), color='red')
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='PNG')
    img_bytes.seek(0)

    return img_bytes


# =====================================
# Test Tool Functions
# =====================================

def assert_success_response(response, status_code=200):
    """Call it a successful response."""
    assert response.status_code == status_code
    data = response.get_json()
    assert data is not None
    assert data.get('success') is True
    return data


def assert_error_response(response, expected_status=None):
    """Call it a wrong response."""
    if expected_status:
        assert response.status_code == expected_status
    data = response.get_json()
    assert data is not None
    assert data.get('success') is False or 'error' in data
    return data
