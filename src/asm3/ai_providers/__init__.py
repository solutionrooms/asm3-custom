
"""
AI Provider adapters for the ASM3 AI Assistant.

Supports multiple LLM providers: Anthropic (Claude), OpenAI, and OpenRouter.
Provider selection is controlled by the AI_PROVIDER config setting.
"""

from asm3.sitedefs import AI_PROVIDER, AI_API_KEY, AI_MODEL, AI_MAX_TOKENS, AI_BASE_URL


def get_provider():
    """Return a provider instance based on configuration."""
    provider_name = AI_PROVIDER.lower()

    if provider_name == "anthropic":
        from asm3.ai_providers.anthropic import AnthropicProvider
        return AnthropicProvider(api_key=AI_API_KEY, model=AI_MODEL, max_tokens=AI_MAX_TOKENS)

    elif provider_name == "openai":
        from asm3.ai_providers.openai import OpenAIProvider
        return OpenAIProvider(api_key=AI_API_KEY, model=AI_MODEL, max_tokens=AI_MAX_TOKENS, base_url=AI_BASE_URL)

    elif provider_name == "openrouter":
        from asm3.ai_providers.openrouter import OpenRouterProvider
        return OpenRouterProvider(api_key=AI_API_KEY, model=AI_MODEL, max_tokens=AI_MAX_TOKENS, base_url=AI_BASE_URL)

    else:
        raise ValueError("Unknown AI provider: %s. Supported: anthropic, openai, openrouter" % AI_PROVIDER)
