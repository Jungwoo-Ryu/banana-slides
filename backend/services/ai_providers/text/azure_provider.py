"""Azure deployment adapter; reuse the text/vision/streaming contract."""
from openai import AzureOpenAI
from config import get_config
from services.http_transport import http_client
from .openai_provider import OpenAITextProvider


class AzureTextProvider(OpenAITextProvider):
    def __init__(self, api_key, api_base, deployment, api_version):
        config = get_config()
        self.client = AzureOpenAI(api_key=api_key, azure_endpoint=api_base,
                                  api_version=api_version,
                                  http_client=http_client(config.OPENAI_TIMEOUT),
                                  timeout=config.OPENAI_TIMEOUT, max_retries=config.OPENAI_MAX_RETRIES)
        self.model = deployment
        self.request_timeout_seconds = config.OPENAI_TIMEOUT
        self.max_attempts = config.OPENAI_MAX_RETRIES + 1

    def _output_limit_params(self):
        from .base import get_text_output_limit
        # Deployment aliases need not contain the underlying model name.
        return {'max_completion_tokens': get_text_output_limit()}
