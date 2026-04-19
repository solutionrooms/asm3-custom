
"""
AI Provider adapters for the ASM3 AI Assistant.

Supports multiple LLM providers: Anthropic (Claude), OpenAI, and OpenRouter.
Provider selection is controlled by the AI_PROVIDER config setting.
"""

from asm3.sitedefs import AI_PROVIDER, AI_API_KEY, AI_MODEL, AI_MAX_TOKENS, AI_BASE_URL, AI_VISION_MODEL


def get_provider():
    """Return a provider instance based on configuration."""
    provider_name = AI_PROVIDER.lower()
    common = dict(api_key=AI_API_KEY, model=AI_MODEL, max_tokens=AI_MAX_TOKENS,
                  vision_model=AI_VISION_MODEL)

    if provider_name == "anthropic":
        from asm3.ai_providers.anthropic import AnthropicProvider
        return AnthropicProvider(**common)

    elif provider_name == "openai":
        from asm3.ai_providers.openai import OpenAIProvider
        return OpenAIProvider(base_url=AI_BASE_URL, **common)

    elif provider_name == "openrouter":
        from asm3.ai_providers.openrouter import OpenRouterProvider
        return OpenRouterProvider(base_url=AI_BASE_URL, **common)

    else:
        raise ValueError("Unknown AI provider: %s. Supported: anthropic, openai, openrouter" % AI_PROVIDER)
