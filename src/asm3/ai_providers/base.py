
"""
Base class for AI provider adapters.

Each provider must implement:
- convert_tools(): Convert ASM tool definitions to the provider's format
- chat(): Send messages and return a standardized response
"""

import json


class ChatResponse:
    """Standardized response from any AI provider."""

    def __init__(self, text="", tool_calls=None, stop_reason="end",
                 model="", input_tokens=0, output_tokens=0):
        """
        Args:
            text: The text content of the response
            tool_calls: List of dicts with {id, name, input} for tool calls
            stop_reason: "end" for final response, "tool_use" if tools need executing
            model: The model that was actually used
            input_tokens: Number of input/prompt tokens consumed
            output_tokens: Number of output/completion tokens consumed
        """
        self.text = text
        self.tool_calls = tool_calls or []
        self.stop_reason = stop_reason
        self.model = model
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


class BaseProvider:
    """Abstract base class for AI providers."""

    def __init__(self, api_key="", model="", max_tokens=4096, base_url="", vision_model=""):
        self.api_key = api_key
        self.model = model
        self.max_tokens = max_tokens
        self.base_url = base_url
        self.vision_model = vision_model or model

    def convert_tools(self, tools):
        """Convert ASM tool definitions to the provider's API format.

        Args:
            tools: List of dicts with {name, description, input_schema}

        Returns:
            List in the provider's native tool format
        """
        raise NotImplementedError

    def chat(self, system_prompt, messages, tools):
        """Send a chat request to the provider.

        Args:
            system_prompt: System prompt string
            messages: List of message dicts in the provider's expected format
            tools: Tool definitions already converted via convert_tools()

        Returns:
            ChatResponse with standardized fields
        """
        raise NotImplementedError

    def make_tool_result_message(self, tool_call_id, result):
        """Create a tool result message in the provider's format.

        Args:
            tool_call_id: The ID of the tool call being responded to
            result: Dict with the tool execution result

        Returns:
            A message dict ready to append to the conversation
        """
        raise NotImplementedError

    def serialize_assistant_message(self, response):
        """Serialize a ChatResponse into a message dict for conversation history.

        Args:
            response: ChatResponse from chat()

        Returns:
            A message dict ready to append to the conversation
        """
        raise NotImplementedError

    def extract_from_images(self, system_prompt, user_prompt, images):
        """Send one or more images plus a text prompt and return the text response.

        Uses self.vision_model rather than self.model.

        Args:
            system_prompt: System prompt string
            user_prompt: Text instruction sent alongside the images
            images: List of dicts {"media_type": "image/jpeg", "data": <base64-string>}

        Returns:
            ChatResponse (tool_calls always empty for vision extraction)
        """
        raise NotImplementedError
