"""Sol.A model boundary: company Azure Foundry OpenAI deployments only."""
from services.runtime_config import setting, secret
from services.http_transport import validate_endpoint, http_client
from .text.base import TextProvider
from .image.base import ImageProvider

SUPPORTED_PROVIDERS = {'azure'}
MODELS = {'text': 'gpt-5.5', 'image_caption': 'gpt-5.5', 'image': 'gpt-image-2'}


def get_provider_format():
    return 'azure'


def _get_model_type_provider_config(model_type):
    roles = {'text': 'AZURE_OPENAI_DEPLOYMENT', 'image_caption': 'AZURE_OPENAI_CAPTION_DEPLOYMENT',
             'image': 'AZURE_OPENAI_IMAGE_DEPLOYMENT', 'tts': 'AZURE_OPENAI_TTS_DEPLOYMENT'}
    if model_type not in roles:
        raise ValueError('지원하지 않는 모델 역할입니다.')
    endpoint = setting('AZURE_OPENAI_ENDPOINT', '')
    key = secret('AZURE_OPENAI_API_KEY')
    deployment = setting(roles[model_type])
    if model_type == 'image_caption' and not deployment:
        deployment = setting('AZURE_OPENAI_DEPLOYMENT')
    if not endpoint or not key:
        raise ValueError('AZURE_OPENAI_ENDPOINT와 AZURE_OPENAI_API_KEY 또는 _FILE을 설정하세요.')
    if not deployment:
        raise ValueError(f'{roles[model_type]}에 사내 Azure 배포 이름을 설정하세요.')
    return {'format': 'azure', 'api_key': key, 'api_base': validate_endpoint(endpoint),
            'deployment': deployment, 'api_version': setting('AZURE_OPENAI_API_VERSION', 'v1')}


def azure_client(config):
    """Use the configured Azure resource with v1 or a dated Azure API."""
    from openai import AzureOpenAI, OpenAI
    timeout = float(setting('OPENAI_TIMEOUT', 480))
    options = dict(api_key=config['api_key'], http_client=http_client(timeout), timeout=timeout,
                   max_retries=int(setting('OPENAI_MAX_RETRIES', 2)))
    endpoint = config['api_base'].rstrip('/')
    if config['api_version'] == 'v1':
        base = endpoint if endpoint.endswith('/openai/v1') else endpoint + '/openai/v1'
        return OpenAI(base_url=base + '/', **options)
    return AzureOpenAI(azure_endpoint=endpoint, api_version=config['api_version'], **options)


def _build_provider_config():
    return _get_model_type_provider_config('text')


def get_image_caption_provider_config():
    return _get_model_type_provider_config('image_caption')


def get_text_provider(model='gpt-5.5'):
    from .text.azure_provider import AzureTextProvider
    return AzureTextProvider(**_get_model_type_provider_config('text'))


def get_caption_provider(model='gpt-5.5'):
    from .text.azure_provider import AzureTextProvider
    return AzureTextProvider(**_get_model_type_provider_config('image_caption'))


def get_image_provider(model='gpt-image-2'):
    from .image.azure_provider import AzureImageProvider
    return AzureImageProvider(**_get_model_type_provider_config('image'),
                              image_quality=setting('IMAGE_QUALITY', 'auto'))
