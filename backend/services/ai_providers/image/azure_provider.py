"""Azure native images adapter. Deployment and model capability are independent."""
from openai import AzureOpenAI
from config import get_config
from services.http_transport import http_client
from .openai_provider import OpenAIImageProvider


class AzureImageProvider(OpenAIImageProvider):
    def __init__(self, api_key, api_base, deployment, api_version, model='gpt-image-1', image_quality='auto'):
        super().__init__(api_key, api_base, model, image_api_protocol='images', image_quality=image_quality)
        self.client.close()
        config = get_config()
        self.client = AzureOpenAI(api_key=api_key, azure_endpoint=api_base,
                                  api_version=api_version,
                                  http_client=http_client(config.OPENAI_TIMEOUT),
                                  timeout=config.OPENAI_TIMEOUT, max_retries=config.OPENAI_MAX_RETRIES)
        self.request_model = deployment
