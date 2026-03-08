
"""OpenAI AI provider adapter."""

import json
from asm3.ai_providers.base import BaseProvider, ChatResponse


class OpenAIProvider(BaseProvider):
    """Provider adapter for the OpenAI Chat Completions API."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._client = None

    def _get_client(self):
        if self._client is None:
            import openai
            kwargs = {"api_key": self.api_key}
            if self.base_url:
                kwargs["base_url"] = self.base_url
            self._client = openai.OpenAI(**kwargs)
        return self._client

    def convert_tools(self, tools):
        """Convert from Anthropic format {name, description, input_schema}
        to OpenAI format {type: "function", function: {name, description, parameters}}."""
        converted = []
        for t in tools:
            converted.append({
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t["description"],
                    "parameters": t["input_schema"]
                }
            })
        return converted

    def chat(self, system_prompt, messages, tools):
        """Call the OpenAI Chat Completions API."""
        client = self._get_client()

        # OpenAI uses system message in the messages array
        api_messages = [{"role": "system", "content": system_prompt}] + messages

        kwargs = {
            "model": self.model,
            "max_completion_tokens": self.max_tokens,
            "messages": api_messages,
        }
        if tools:
            kwargs["tools"] = tools

        response = client.chat.completions.create(**kwargs)

        choice = response.choices[0]
        text = choice.message.content or ""

        # Parse tool calls
        tool_calls = []
        if choice.message.tool_calls:
            for tc in choice.message.tool_calls:
                try:
                    args = json.loads(tc.function.arguments)
                except (json.JSONDecodeError, TypeError):
                    args = {}
                tool_calls.append({
                    "id": tc.id,
                    "name": tc.function.name,
                    "input": args
                })

        stop_reason = "tool_use" if choice.finish_reason == "tool_calls" else "end"
        input_tokens = response.usage.prompt_tokens if response.usage else 0
        output_tokens = response.usage.completion_tokens if response.usage else 0
        return ChatResponse(text=text, tool_calls=tool_calls, stop_reason=stop_reason,
            model=response.model or self.model, input_tokens=input_tokens, output_tokens=output_tokens)

    def make_tool_result_message(self, tool_call_id, result):
        """OpenAI tool results use role=tool with tool_call_id."""
        return {
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": json.dumps(result)
        }

    def serialize_assistant_message(self, response):
        """Serialize a ChatResponse for OpenAI conversation history."""
        msg = {"role": "assistant", "content": response.text or ""}

        if response.tool_calls:
            msg["tool_calls"] = []
            for tc in response.tool_calls:
                msg["tool_calls"].append({
                    "id": tc["id"],
                    "type": "function",
                    "function": {
                        "name": tc["name"],
                        "arguments": json.dumps(tc["input"])
                    }
                })
        return msg
