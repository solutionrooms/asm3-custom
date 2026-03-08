
"""OpenRouter AI provider adapter.

OpenRouter uses the OpenAI-compatible API with a different base URL
and optional extra headers.
"""

from asm3.ai_providers.openai import OpenAIProvider

DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"


class OpenRouterProvider(OpenAIProvider):
    """Provider adapter for OpenRouter (OpenAI-compatible API)."""

    def __init__(self, **kwargs):
        if not kwargs.get("base_url"):
            kwargs["base_url"] = DEFAULT_BASE_URL
        super().__init__(**kwargs)

    def _get_client(self):
        if self._client is None:
            import openai
            self._client = openai.OpenAI(
                api_key=self.api_key,
                base_url=self.base_url,
                default_headers={
                    "HTTP-Referer": "https://sheltermanager.com",
                    "X-Title": "ASM3 AI Assistant"
                }
            )
        return self._client
