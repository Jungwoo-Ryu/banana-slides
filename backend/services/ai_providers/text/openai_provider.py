"""
OpenAI SDK implementation for text generation
"""
import base64
import logging
from typing import Generator
from .base import get_text_output_limit, TextProvider, strip_think_tags

logger = logging.getLogger(__name__)


class OpenAITextProvider(TextProvider):
    """Text generation using OpenAI SDK (used by the Azure deployment adapter)"""
    
    def __init__(self, *args, **kwargs):
        raise RuntimeError('Use AzureTextProvider with the company Azure deployment.')

    def _output_limit_params(self):
        return {'max_completion_tokens': get_text_output_limit()}

    def generate_text(self, prompt: str, thinking_budget: int = 0) -> str:
        """
        Generate text using OpenAI SDK
        
        Args:
            prompt: The input prompt
            thinking_budget: Not used in OpenAI format, kept for interface compatibility (0 = default)
            
        Returns:
            Generated text
        """
        response = self.client.chat.completions.create(
            model=self.model,
            **self._output_limit_params(),
            messages=[
                {"role": "user", "content": prompt}
            ],
            stream=False,
        )
        return strip_think_tags(response.choices[0].message.content)

    def generate_text_stream(self, prompt: str, thinking_budget: int = 0) -> Generator[str, None, None]:
        """Stream text using OpenAI SDK with stream=True."""
        response = self.client.chat.completions.create(
            model=self.model,
            **self._output_limit_params(),
            messages=[{"role": "user", "content": prompt}],
            stream=True,
        )
        for chunk in response:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield delta.content

    def generate_with_image(self, prompt: str, image_path: str, thinking_budget: int = 0) -> str:
        """Generate text with image input using OpenAI-compatible chat completions."""
        with open(image_path, "rb") as image_file:
            encoded = base64.b64encode(image_file.read()).decode("ascii")

        response = self.client.chat.completions.create(
            model=self.model,
            **self._output_limit_params(),
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{encoded}"},
                        },
                    ],
                }
            ],
            stream=False,
        )

        message_content = response.choices[0].message.content
        if isinstance(message_content, str):
            return strip_think_tags(message_content)

        parts = []
        for item in message_content or []:
            text = item.get("text") if isinstance(item, dict) else getattr(item, "text", None)
            if text:
                parts.append(text)
        return strip_think_tags("\n".join(parts))
