"""Azure GPT-5.5 text/vision/streaming contract."""
from config import get_config
from .openai_provider import OpenAITextProvider


class AzureTextProvider(OpenAITextProvider):
    def __init__(self, api_key, api_base, deployment, api_version, format='azure'):
        from services.ai_providers import azure_client
        config = get_config()
        self.client = azure_client(dict(api_key=api_key, api_base=api_base, api_version=api_version))
        self.model = deployment
        self.request_timeout_seconds = config.OPENAI_TIMEOUT
        self.max_attempts = config.OPENAI_MAX_RETRIES + 1

    def _output_limit_params(self):
        from .base import get_text_output_limit
        return {'max_completion_tokens': get_text_output_limit()}
