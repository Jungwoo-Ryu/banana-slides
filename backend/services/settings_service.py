"""Non-secret preferences, shared by HTTP today and future MCP tools."""
import json
from config import Config
from services.runtime_config import secret
from services.ai_providers import SUPPORTED_PROVIDERS, _get_model_type_provider_config

FIELD_CONFIG = {
    'ai_provider_format': 'AI_PROVIDER_FORMAT', 'text_model': 'TEXT_MODEL',
    'image_model': 'IMAGE_MODEL', 'image_caption_model': 'IMAGE_CAPTION_MODEL',
    'image_resolution': 'DEFAULT_RESOLUTION', 'image_aspect_ratio': 'DEFAULT_ASPECT_RATIO',
    'image_quality': 'IMAGE_QUALITY', 'output_language': 'OUTPUT_LANGUAGE',
    'max_description_workers': 'MAX_DESCRIPTION_WORKERS', 'max_image_workers': 'MAX_IMAGE_WORKERS',
    'text_model_source': 'TEXT_MODEL_SOURCE', 'image_model_source': 'IMAGE_MODEL_SOURCE',
    'image_caption_model_source': 'IMAGE_CAPTION_MODEL_SOURCE',
    'text_api_base_url': 'TEXT_API_BASE', 'image_api_base_url': 'IMAGE_API_BASE',
    'image_caption_api_base_url': 'IMAGE_CAPTION_API_BASE',
    'text_max_output_tokens': 'TEXT_MAX_OUTPUT_TOKENS',
    'enable_text_reasoning': 'ENABLE_TEXT_REASONING', 'enable_image_reasoning': 'ENABLE_IMAGE_REASONING',
    'text_thinking_budget': 'TEXT_THINKING_BUDGET', 'image_thinking_budget': 'IMAGE_THINKING_BUDGET',
    'enable_image_quality_control': 'ENABLE_IMAGE_QUALITY_CONTROL',
    'openai_image_api_protocol': 'OPENAI_IMAGE_API_PROTOCOL',
}
EXTRA_FIELDS = {'description_generation_mode', 'description_extra_fields', 'image_prompt_extra_fields'}
SECRET_FIELDS = ('api_key', 'text_api_key', 'image_api_key', 'image_caption_api_key', 'mineru_token',
                 'baidu_api_key', 'lazyllm_api_keys', 'elevenlabs_api_key', 'openai_oauth_access_token',
                 'openai_oauth_refresh_token', 'openai_oauth_account_id', 'openai_oauth_expires_at')


def sync_settings(app, preferences):
    for field, key in FIELD_CONFIG.items():
        value = getattr(preferences, field, None)
        if value is not None:
            # Old third-party selections must never silently change destinations.
            if field.endswith('model_source') or field == 'ai_provider_format':
                if value and value not in SUPPORTED_PROVIDERS:
                    value = getattr(Config, key, '')
            app.config[key] = value
        elif hasattr(Config, key):
            app.config[key] = getattr(Config, key)
    from services.ai_service_manager import clear_ai_service_cache
    clear_ai_service_cache()


def serialize_settings(preferences):
    from flask import current_app
    result = {field: current_app.config.get(key, getattr(Config, key, None)) for field, key in FIELD_CONFIG.items()}
    result.update(description_generation_mode=preferences.description_generation_mode or 'streaming',
                  description_extra_fields=preferences.get_description_extra_fields(),
                  image_prompt_extra_fields=preferences.get_image_prompt_extra_fields())
    result['providers'] = {}
    for role in ('text', 'image', 'image_caption'):
        try:
            cfg = _get_model_type_provider_config(role)
            result['providers'][role] = {k: v for k, v in cfg.items() if k != 'api_key'} | {'configured': True}
        except (ValueError, OSError) as error:
            if isinstance(error, OSError):
                error = ValueError('Secret Manager 파일 경로(_FILE)를 읽지 못했습니다. 경로와 읽기 권한을 확인하세요.')
            result['providers'][role] = {'configured': False, 'message': str(error)}
    result['external_services'] = {
        'document_parser': current_app.config.get('DOCUMENT_PARSER', 'local'),
        'document_parser_url': current_app.config.get('DOCUMENT_PARSER_URL', ''),
        'ocr_provider': current_app.config.get('OCR_PROVIDER', 'local'),
        'ocr_url': current_app.config.get('OCR_API_URL', ''),
        'inpainting_provider': current_app.config.get('INPAINTING_PROVIDER', 'local'),
        'tts_enabled': current_app.config.get('TTS_ENABLED', False),
    }
    return result


def update_preferences(data):
    from models import Settings, db
    from flask import current_app
    from services.http_transport import validate_endpoint
    if not isinstance(data, dict):
        raise ValueError('설정은 JSON 객체여야 합니다.')
    if set(data) - (FIELD_CONFIG.keys() | EXTRA_FIELDS):
        raise ValueError('허용하지 않는 설정입니다. API 키와 서비스 연결 정보는 .env 또는 Secret Manager에서 설정하세요.')
    clean = dict(data)
    for field, value in clean.items():
        if field.endswith('model_source') or field == 'ai_provider_format':
            if value and value not in SUPPORTED_PROVIDERS:
                raise ValueError('지원하지 않는 제공자입니다.')
        if field.endswith('_api_base_url') and value:
            validate_endpoint(value)
        if field.startswith('max_') and (not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 20):
            raise ValueError('동시 작업 수는 1~20 사이의 정수여야 합니다.')
        if field.startswith('enable_') and not isinstance(value, bool):
            raise ValueError('활성화 설정은 참 또는 거짓이어야 합니다.')
        if field in ('text_thinking_budget', 'image_thinking_budget', 'text_max_output_tokens'):
            if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 100000:
                raise ValueError('토큰 설정은 1~100000 사이의 정수여야 합니다.')
        choices = {'image_resolution': {'1K','2K','4K'}, 'output_language': {'ko','en','auto'},
                   'description_generation_mode': {'streaming','parallel'},
                   'openai_image_api_protocol': {'auto','images','chat'},
                   'image_quality': {'auto','low','medium','high','xhigh','max'}}
        if field in choices and value not in choices[field]:
            raise ValueError(f'올바르지 않은 설정 값입니다: {field}')
        if field in ('description_extra_fields', 'image_prompt_extra_fields'):
            if not isinstance(value, list) or len(value) > 12 or not all(isinstance(x,str) and 0 < len(x) < 100 for x in value):
                raise ValueError('추가 필드는 100자 미만의 이름을 최대 12개 지정할 수 있습니다.')
            clean[field] = json.dumps(value, ensure_ascii=False)
    settings = Settings.get_settings()
    for field, value in clean.items():
        setattr(settings, field, value)
    db.session.commit()
    sync_settings(current_app, settings)
    return serialize_settings(settings)
