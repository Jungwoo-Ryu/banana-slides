"""Role-specific model provider registry for the local web application.

No account login, vendor fallback, credential persistence or implicit third-party
proxy. New providers implement TextProvider/ImageProvider and register here.
"""
from typing import Any, Dict
from services.runtime_config import setting, secret
from services.http_transport import validate_endpoint
from .text import TextProvider, GenAITextProvider, OpenAITextProvider, AnthropicTextProvider
from .image import ImageProvider, GenAIImageProvider, OpenAIImageProvider

SUPPORTED_PROVIDERS = {'azure', 'openai', 'gemini', 'anthropic', 'vertex'}


def _resolve_setting(key, fallback=None):
    return setting(key, fallback)


def get_provider_format():
    return str(setting('AI_PROVIDER_FORMAT', 'azure')).lower()


def _get_model_type_provider_config(model_type: str) -> Dict[str, Any]:
    prefix = model_type.upper()
    fmt = str(setting(f'{prefix}_MODEL_SOURCE') or get_provider_format()).lower()
    if fmt not in SUPPORTED_PROVIDERS:
        raise ValueError(f'지원하지 않는 AI 제공자입니다: {fmt}. 설정에서 제공자를 다시 선택하세요.')
    cfg = {'format': fmt}
    if fmt == 'vertex':
        cfg.update(project_id=setting('VERTEX_PROJECT_ID'), location=setting('VERTEX_LOCATION', 'global'))
        if not cfg['project_id']:
            raise ValueError('VERTEX_PROJECT_ID 환경변수를 설정하세요.')
        return cfg
    keys = {'azure': 'AZURE_OPENAI', 'openai': 'OPENAI', 'gemini': 'GOOGLE', 'anthropic': 'ANTHROPIC'}
    vendor = keys[fmt]
    cfg['api_key'] = secret(f'{prefix}_API_KEY') or secret(f'{vendor}_API_KEY')
    defaults = {'openai': 'https://api.openai.com/v1', 'gemini': 'https://generativelanguage.googleapis.com', 'anthropic': 'https://api.anthropic.com'}
    cfg['api_base'] = setting(f'{prefix}_API_BASE') or setting(f'{vendor}_ENDPOINT' if fmt == 'azure' else f'{vendor}_API_BASE', defaults.get(fmt))
    if not cfg['api_key']:
        raise ValueError(f'{prefix}_API_KEY 또는 {vendor}_API_KEY 환경변수(또는 _FILE)를 설정하세요.')
    if not cfg['api_base']:
        raise ValueError('AZURE_OPENAI_ENDPOINT 환경변수를 설정하세요.')
    cfg['api_base'] = validate_endpoint(cfg['api_base'])
    if fmt == 'azure':
        role_key = 'AZURE_OPENAI_IMAGE_DEPLOYMENT' if model_type == 'image' else 'AZURE_OPENAI_CAPTION_DEPLOYMENT' if model_type == 'image_caption' else 'AZURE_OPENAI_DEPLOYMENT'
        cfg['deployment'] = setting(role_key) or (setting('AZURE_OPENAI_DEPLOYMENT') if model_type != 'image' else None)
        cfg['api_version'] = setting('AZURE_OPENAI_API_VERSION', '2025-04-01-preview')
        if not cfg['deployment']:
            raise ValueError(f'{role_key} 환경변수를 설정하세요. 이미지에는 별도의 이미지 생성 배포가 필요합니다.')
    return cfg


def _build_provider_config():
    return _get_model_type_provider_config('text')


def get_image_caption_provider_config():
    return _get_model_type_provider_config('image_caption')


def _text(role, model):
    c = _get_model_type_provider_config(role)
    fmt = c.pop('format')
    if fmt == 'azure':
        from .text.azure_provider import AzureTextProvider
        return AzureTextProvider(**c)
    if fmt == 'vertex':
        return GenAITextProvider(model=model, vertexai=True, **c)
    provider = {'openai': OpenAITextProvider, 'gemini': GenAITextProvider, 'anthropic': AnthropicTextProvider}[fmt]
    return provider(model=model, **c)


def get_text_provider(model='gpt-5.5') -> TextProvider:
    return _text('text', model)


def get_caption_provider(model='gpt-5.5') -> TextProvider:
    return _text('image_caption', model)


def get_image_provider(model='gpt-image-1') -> ImageProvider:
    c = _get_model_type_provider_config('image')
    fmt = c.pop('format')
    quality = setting('IMAGE_QUALITY', 'auto')
    if fmt == 'azure':
        from .image.azure_provider import AzureImageProvider
        return AzureImageProvider(model=model, image_quality=quality, **c)
    if fmt == 'vertex':
        return GenAIImageProvider(model=model, vertexai=True, **c)
    if fmt == 'anthropic':
        raise ValueError('Anthropic은 이미지 생성 API를 제공하지 않습니다. 이미지 제공자를 별도로 설정하세요.')
    if fmt == 'openai':
        return OpenAIImageProvider(model=model, image_api_protocol=setting('OPENAI_IMAGE_API_PROTOCOL', 'auto'), image_quality=quality, **c)
    return GenAIImageProvider(model=model, **c)
