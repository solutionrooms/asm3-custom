
"""Anthropic (Claude) AI provider adapter."""

import json
from asm3.ai_providers.base import BaseProvider, ChatResponse


class AnthropicProvider(BaseProvider):
    """Provider adapter for the Anthropic Claude API."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._client = None

    def _get_client(self):
        if self._client is None:
            import anthropic
            self._client = anthropic.Anthropic(api_key=self.api_key)
        return self._client

    def convert_tools(self, tools):
        """Anthropic uses {name, description, input_schema} - same as our internal format."""
        return tools

    def chat(self, system_prompt, messages, tools):
        """Call the Anthropic Messages API."""
        client = self._get_client()

        kwargs = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "system": system_prompt,
            "messages": messages,
        }
        if tools:
            kwargs["tools"] = tools

        response = client.messages.create(**kwargs)

        # Parse response into standardized format
        text = ""
        tool_calls = []
        for block in response.content:
            if block.type == "text":
                text = block.text
            elif block.type == "tool_use":
                tool_calls.append({
                    "id": block.id,
                    "name": block.name,
                    "input": block.input
                })

        stop_reason = "tool_use" if response.stop_reason == "tool_use" else "end"
        input_tokens = getattr(response.usage, "input_tokens", 0) if response.usage else 0
        output_tokens = getattr(response.usage, "output_tokens", 0) if response.usage else 0
        return ChatResponse(text=text, tool_calls=tool_calls, stop_reason=stop_reason,
            model=response.model, input_tokens=input_tokens, output_tokens=output_tokens)

    def make_tool_result_message(self, tool_call_id, result):
        """Anthropic tool results go as a user message with tool_result content block."""
        return {
            "role": "user",
            "content": [{
                "type": "tool_result",
                "tool_use_id": tool_call_id,
                "content": json.dumps(result)
            }]
        }

    def serialize_assistant_message(self, response):
        """Serialize a ChatResponse for Anthropic conversation history."""
        content = []
        if response.text:
            content.append({"type": "text", "text": response.text})
        for tc in response.tool_calls:
            content.append({
                "type": "tool_use",
                "id": tc["id"],
                "name": tc["name"],
                "input": tc["input"]
            })
        return {"role": "assistant", "content": content}

    def extract_from_images(self, system_prompt, user_prompt, images):
        client = self._get_client()
        content = []
        for img in images:
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": img["media_type"],
                    "data": img["data"],
                }
            })
        content.append({"type": "text", "text": user_prompt})

        response = client.messages.create(
            model=self.vision_model,
            max_tokens=self.max_tokens,
            temperature=0,
            system=system_prompt,
            messages=[{"role": "user", "content": content}],
        )

        text = ""
        for block in response.content:
            if block.type == "text":
                text += block.text
        input_tokens = getattr(response.usage, "input_tokens", 0) if response.usage else 0
        output_tokens = getattr(response.usage, "output_tokens", 0) if response.usage else 0
        return ChatResponse(text=text, model=response.model,
            input_tokens=input_tokens, output_tokens=output_tokens)
