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

    # AI Service Configuration
    GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY', '')
    GOOGLE_API_BASE = os.getenv('GOOGLE_API_BASE') or ''

    # Provider format: gemini | openai | volcengine | vertex | lazyllm
    AI_PROVIDER_FORMAT = os.getenv('AI_PROVIDER_FORMAT', 'azure')

    # Google Cloud Vertex AI (requires AI_PROVIDER_FORMAT=vertex)
    VERTEX_PROJECT_ID = os.getenv('VERTEX_PROJECT_ID', '')
    VERTEX_LOCATION = os.getenv('VERTEX_LOCATION', 'us-central1')

    # GenAI (Gemini) Format Special Configuration
    GENAI_TIMEOUT = float(os.getenv('GENAI_TIMEOUT', '300.0'))  # Gemini Timeout (seconds)）
    GENAI_MAX_RETRIES = int(os.getenv('GENAI_MAX_RETRIES', '2'))  # Gemini Maximum number of re-tests (appliance layer achieved)）

    # OpenAI Format Special Configuration (when) AI_PROVIDER_FORMAT=openai Use of time）
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')  # Required when AI_PROVIDER_FORMAT=openai
    OPENAI_API_BASE = os.getenv('OPENAI_API_BASE') or 'https://api.openai.com/v1'
    OPENAI_TIMEOUT = float(os.getenv('OPENAI_TIMEOUT', '480.0'))  # 8 Minutes： Stay gpt-image-2 Life map(~225s)+Residual amount of the transfer
    OPENAI_MAX_RETRIES = int(os.getenv('OPENAI_MAX_RETRIES', '2'))  # Reduce the number of retests and avoid multiple trials leading to cumulative timeout

    # Global output limit for text and image-understanding responses.
    TEXT_MAX_OUTPUT_TOKENS = int(os.getenv("TEXT_MAX_OUTPUT_TOKENS", os.getenv("ANTHROPIC_MAX_TOKENS", "32768")))

    # Anthropic Format Special Configuration (when) AI_PROVIDER_FORMAT=anthropic Use of time）
    # Support ANTHROPIC_AUTH_TOKEN As ANTHROPIC_API_KEY aliases
    # Support ANTHROPIC_BASE_URL As ANTHROPIC_API_BASE aliases
    ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY', '') or os.getenv('ANTHROPIC_AUTH_TOKEN', '')
    ANTHROPIC_API_BASE = os.getenv('ANTHROPIC_API_BASE', '') or os.getenv('ANTHROPIC_BASE_URL', 'https://api.anthropic.com')
    ANTHROPIC_VERSION = os.getenv('ANTHROPIC_VERSION', '2023-06-01')
    ANTHROPIC_MAX_TOKENS = TEXT_MAX_OUTPUT_TOKENS  # legacy alias

    # Lazyllm Format Special Configuration (when) AI_PROVIDER_FORMAT=lazyllm Use of time）
    TEXT_MODEL_SOURCE = os.getenv('TEXT_MODEL_SOURCE', '')                   # Text Generation Modeller (leave left and follow global AI_PROVIDER_FORMAT）
    IMAGE_MODEL_SOURCE = os.getenv('IMAGE_MODEL_SOURCE', '')                   # Photo Generating Modeller (leave left and follow the whole picture) AI_PROVIDER_FORMAT）
    IMAGE_CAPTION_MODEL_SOURCE = os.getenv('IMAGE_CAPTION_MODEL_SOURCE', '')   # Photo recognition model manufacturer (leave left behind and follow the entire site) AI_PROVIDER_FORMAT）

    # Independence of model types API Configuration (priority above global configuration)）
    # Text Model Independent Configuration
    TEXT_API_KEY = os.getenv('TEXT_API_KEY', '')
    TEXT_API_BASE = os.getenv('TEXT_API_BASE', '')
    # Image Model Independent Configuration
    IMAGE_API_KEY = os.getenv('IMAGE_API_KEY', '')
    IMAGE_API_BASE = os.getenv('IMAGE_API_BASE', '')
    # Image Identification Model Independent Configuration
    IMAGE_CAPTION_API_KEY = os.getenv('IMAGE_CAPTION_API_KEY', '')
    IMAGE_CAPTION_API_BASE = os.getenv('IMAGE_CAPTION_API_BASE', '')

    # AI Model Configuration
    TEXT_MODEL = os.getenv('TEXT_MODEL', 'gpt-5.5')
    IMAGE_MODEL = os.getenv('IMAGE_MODEL', 'gpt-image-1')

    # MinerU File parsing service configuration
    MINERU_TOKEN = os.getenv('MINERU_TOKEN', '')
    MINERU_API_BASE = os.getenv('MINERU_API_BASE', '')

    # Picture Recognition Model Configuration
    IMAGE_CAPTION_MODEL = os.getenv('IMAGE_CAPTION_MODEL', 'gpt-5.5')

    # Combination Configuration
    MAX_DESCRIPTION_WORKERS = int(os.getenv('MAX_DESCRIPTION_WORKERS', '3'))
    MAX_IMAGE_WORKERS = int(os.getenv('MAX_IMAGE_WORKERS', '3'))

    # Picture Generation Configuration
    DEFAULT_ASPECT_RATIO = "16:9"
    DEFAULT_RESOLUTION = "2K"
    # Picture quality slot（OpenAI Compatible image model: auto/low/medium/high/xhigh/max）
    # xhigh / max Yes. gpt-image-2.5 And update the model, the old model will automatically fall back. high
    IMAGE_QUALITY = os.getenv('IMAGE_QUALITY', 'auto')

    # Log Configuration
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO').upper()
    WERKZEUG_LOG_LEVEL = (os.getenv('WERKZEUG_LOG_LEVEL') or 'INFO').strip().upper()

    # CORS Configuration
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', f'http://localhost:{DEFAULT_FRONTEND_PORT}').split(',')

    # Output Language Configuration
    # Optional value: 'zh' (Chinese), 'ja' (Japanese), 'en' (English), 'auto' (Auto)
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
    AZURE_OPENAI_API_VERSION = os.getenv('AZURE_OPENAI_API_VERSION', '2025-04-01-preview')
    TTS_ENABLED = os.getenv('TTS_ENABLED', 'false').lower() == 'true'

    # TTS Video Export Configuration
    TTS_DEFAULT_VOICE_ZH = os.getenv('TTS_DEFAULT_VOICE_ZH', 'zh-CN-XiaoxiaoNeural')
    TTS_DEFAULT_VOICE_EN = os.getenv('TTS_DEFAULT_VOICE_EN', 'en-US-JennyNeural')
    TTS_DEFAULT_VOICE_JA = os.getenv('TTS_DEFAULT_VOICE_JA', 'ja-JP-NanamiNeural')
    TTS_DEFAULT_RATE = os.getenv('TTS_DEFAULT_RATE', '+0%')
    VIDEO_OUTPUT_WIDTH = int(os.getenv('VIDEO_OUTPUT_WIDTH', '1920'))
    VIDEO_OUTPUT_HEIGHT = int(os.getenv('VIDEO_OUTPUT_HEIGHT', '1080'))
    VIDEO_FPS = int(os.getenv('VIDEO_FPS', '25'))
    FFMPEG_PATH = os.getenv('FFMPEG_PATH', 'ffmpeg')
    DEFAULT_SILENT_CLIP_DURATION = float(os.getenv('DEFAULT_SILENT_CLIP_DURATION', '3.0'))


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
