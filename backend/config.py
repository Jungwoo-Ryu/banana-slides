"""
Backend configuration file
"""
import os
import sys
from datetime import timedelta

# Basic Configuration - More reliable path calculations
# Calculating and fixing the path immediately when the module is loaded
_current_file = os.path.realpath(__file__)  # Usage realpath Parsing All Symbolic Links
BASE_DIR = os.path.dirname(_current_file)
PROJECT_ROOT = os.path.dirname(BASE_DIR)
DEFAULT_FRONTEND_PORT = 3011
DEFAULT_BACKEND_PORT = 5011

# Flask Configuration
class Config:
    """Base configuration"""
    SECRET_KEY = os.getenv('SECRET_KEY', 'your-secret-key-change-this')

    # Database Configuration
    # Use absolute path to avoid WSL path issues
    db_path = os.path.join(BASE_DIR, 'instance', 'database.db')
    SQLALCHEMY_DATABASE_URI = os.getenv(
        'DATABASE_URL',
        f'sqlite:///{db_path}'
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # SQLite Thread Security Configuration - Critical repairs
    SQLALCHEMY_ENGINE_OPTIONS = {
        'connect_args': {
            'check_same_thread': False,  # Allow cross-line (only) SQLite）
            'timeout': 30  # Increase timeout
        },
        'pool_pre_ping': True,  # Check before connecting
        'pool_recycle': 3600,  # 1 Hourly recovery connection
    }

    # File Storage Configuration
    UPLOAD_FOLDER = os.path.join(PROJECT_ROOT, 'uploads')
    MAX_CONTENT_LENGTH = 200 * 1024 * 1024  # 200MB max file size
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
    ALLOWED_REFERENCE_FILE_EXTENSIONS = {'pdf', 'docx', 'pptx', 'doc', 'ppt', 'xlsx', 'xls', 'csv', 'txt', 'md'}

    # Only company Azure Foundry OpenAI resources are supported.
    AI_PROVIDER_FORMAT = 'azure'
    TEXT_MODEL = 'gpt-5.5'
    IMAGE_MODEL = 'gpt-image-2'
    IMAGE_CAPTION_MODEL = 'gpt-5.5'
    OPENAI_TIMEOUT = float(os.getenv('AZURE_OPENAI_TIMEOUT', '480'))
    OPENAI_MAX_RETRIES = int(os.getenv('AZURE_OPENAI_MAX_RETRIES', '2'))
    TEXT_MAX_OUTPUT_TOKENS = int(os.getenv('TEXT_MAX_OUTPUT_TOKENS', '16384'))
    MINERU_API_BASE = os.getenv('MINERU_API_BASE', '')
    MINERU_TOKEN = os.getenv('MINERU_TOKEN', '')
    DESIGN_SYSTEM_PROMPT = os.getenv('DESIGN_SYSTEM_PROMPT', '')

    # Combination Configuration
    MAX_DESCRIPTION_WORKERS = int(os.getenv('MAX_DESCRIPTION_WORKERS', '3'))
    MAX_IMAGE_WORKERS = int(os.getenv('MAX_IMAGE_WORKERS', '1'))

    # Picture Generation Configuration
    DEFAULT_ASPECT_RATIO = "16:9"
    DEFAULT_RESOLUTION = "2K"
    # Azure GPT-image-2 quality: auto, low, medium or high.
    IMAGE_QUALITY = os.getenv('IMAGE_QUALITY', 'auto')

    # Log Configuration
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO').upper()
    WERKZEUG_LOG_LEVEL = (os.getenv('WERKZEUG_LOG_LEVEL') or 'INFO').strip().upper()

    # CORS Configuration
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', f'http://localhost:{DEFAULT_FRONTEND_PORT}').split(',')

    # Output Language Configuration
    # Supported output languages: ko, en, auto.
    OUTPUT_LANGUAGE = os.getenv('OUTPUT_LANGUAGE', 'ko')

    # Explicit adapters; no implicit external OCR or parser uploads.
    DOCUMENT_PARSER = os.getenv('DOCUMENT_PARSER', 'local')
    DOCUMENT_PARSER_URL = os.getenv('DOCUMENT_PARSER_URL', '')
    OCR_PROVIDER = os.getenv('OCR_PROVIDER', 'local')
    OCR_API_URL = os.getenv('OCR_API_URL', '')
    INPAINTING_PROVIDER = os.getenv('INPAINTING_PROVIDER', 'local')
    AZURE_OPENAI_ENDPOINT = os.getenv('AZURE_OPENAI_ENDPOINT', '')
    AZURE_OPENAI_DEPLOYMENT = os.getenv('AZURE_OPENAI_DEPLOYMENT', 'gpt-5.5')
    AZURE_OPENAI_IMAGE_DEPLOYMENT = os.getenv('AZURE_OPENAI_IMAGE_DEPLOYMENT', '')
    AZURE_OPENAI_CAPTION_DEPLOYMENT = os.getenv('AZURE_OPENAI_CAPTION_DEPLOYMENT', '')
    AZURE_OPENAI_API_VERSION = os.getenv('AZURE_OPENAI_API_VERSION', 'v1')
    AZURE_OPENAI_TTS_DEPLOYMENT = os.getenv('AZURE_OPENAI_TTS_DEPLOYMENT', '')
    TTS_VOICE = os.getenv('AZURE_OPENAI_TTS_VOICE', 'alloy')
    TTS_INSTRUCTIONS = os.getenv('AZURE_OPENAI_TTS_INSTRUCTIONS', '')
    TTS_MAX_INPUT_CHARS = 4000
    VIDEO_OUTPUT_WIDTH = 1280
    VIDEO_OUTPUT_HEIGHT = 720
    VIDEO_FPS = 25
    FFMPEG_PATH = os.getenv('FFMPEG_PATH', 'ffmpeg')
    VIDEO_MAX_PAGES = int(os.getenv('VIDEO_MAX_PAGES', '50'))


class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True


class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False


# Select Configuration Based on Environmental Variables
config_map = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}

def get_config():
    """Get configuration based on environment"""
    env = os.getenv('FLASK_ENV', 'development')
    return config_map.get(env, DevelopmentConfig)
