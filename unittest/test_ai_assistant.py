
import unittest
import base
import json

import asm3.ai_assistant
import asm3.animal
import asm3.log
import asm3.lookups
import asm3.users
import asm3.utils


class FakeSession:
    """Minimal session object for testing permission filtering.
    ASM3 uses 'in' operator on session (e.g., "superuser" in session),
    so we need __contains__ to check for attribute existence.
    """
    def __init__(self, superuser=1, securitymap="", locale="en", user="test"):
        self.superuser = superuser
        self.securitymap = securitymap
        self.locale = locale
        self.user = user

    def __contains__(self, item):
        return hasattr(self, item)


class TestToolDefinitions(unittest.TestCase):
    """Verify all tool definitions are well-formed."""

    def test_all_tools_have_required_fields(self):
        for t in asm3.ai_assistant.TOOL_DEFINITIONS:
            self.assertIn("name", t, "Tool missing 'name'")
            self.assertIn("description", t, "Tool %s missing 'description'" % t.get("name"))
            self.assertIn("permission", t, "Tool %s missing 'permission'" % t["name"])
            self.assertIn("confirm", t, "Tool %s missing 'confirm'" % t["name"])
            self.assertIn("input_schema", t, "Tool %s missing 'input_schema'" % t["name"])

    def test_all_tools_have_handlers(self):
        for t in asm3.ai_assistant.TOOL_DEFINITIONS:
            self.assertIn(t["name"], asm3.ai_assistant.TOOL_HANDLERS,
                "Tool %s has no handler in TOOL_HANDLERS" % t["name"])

    def test_tool_names_are_unique(self):
        names = [t["name"] for t in asm3.ai_assistant.TOOL_DEFINITIONS]
        self.assertEqual(len(names), len(set(names)), "Duplicate tool names found")

    def test_input_schemas_are_valid(self):
        for t in asm3.ai_assistant.TOOL_DEFINITIONS:
            schema = t["input_schema"]
            self.assertEqual(schema["type"], "object",
                "Tool %s schema type must be 'object'" % t["name"])
            self.assertIn("properties", schema,
                "Tool %s schema missing 'properties'" % t["name"])

    def test_confirm_tiers_are_valid(self):
        valid_tiers = (
            asm3.ai_assistant.CONFIRM_NONE,
            asm3.ai_assistant.CONFIRM_STANDARD,
            asm3.ai_assistant.CONFIRM_ALWAYS
        )
        for t in asm3.ai_assistant.TOOL_DEFINITIONS:
            self.assertIn(t["confirm"], valid_tiers,
                "Tool %s has invalid confirm tier: %s" % (t["name"], t["confirm"]))

    def test_read_tools_do_not_require_confirmation(self):
        read_tools = ["search_animal", "get_animal_details", "get_locations",
                       "get_species", "get_breeds", "get_vaccination_types",
                       "get_test_types", "search_person"]
        for name in read_tools:
            tool = asm3.ai_assistant.get_tool_by_name(name)
            self.assertIsNotNone(tool, "Read tool %s not found" % name)
            self.assertEqual(tool["confirm"], asm3.ai_assistant.CONFIRM_NONE,
                "Read tool %s should not require confirmation" % name)

    def test_write_tools_require_confirmation(self):
        write_tools = ["add_animal", "update_weight", "move_animal",
                        "add_vaccination", "add_test", "add_medical_treatment",
                        "add_diary"]
        for name in write_tools:
            tool = asm3.ai_assistant.get_tool_by_name(name)
            self.assertIsNotNone(tool, "Write tool %s not found" % name)
            self.assertNotEqual(tool["confirm"], asm3.ai_assistant.CONFIRM_NONE,
                "Write tool %s should require confirmation" % name)

    def test_add_log_is_immediate(self):
        """add_log is a quick observation note and should not require confirmation."""
        tool = asm3.ai_assistant.get_tool_by_name("add_log")
        self.assertEqual(tool["confirm"], asm3.ai_assistant.CONFIRM_NONE)


class TestGetToolByName(unittest.TestCase):

    def test_existing_tool(self):
        tool = asm3.ai_assistant.get_tool_by_name("search_animal")
        self.assertIsNotNone(tool)
        self.assertEqual(tool["name"], "search_animal")

    def test_nonexistent_tool(self):
        tool = asm3.ai_assistant.get_tool_by_name("nonexistent_tool")
        self.assertIsNone(tool)


class TestPermissionFiltering(unittest.TestCase):

    def test_superuser_gets_all_tools(self):
        session = FakeSession(superuser=1)
        tools = asm3.ai_assistant.get_available_tools(session)
        self.assertEqual(len(tools), len(asm3.ai_assistant.TOOL_DEFINITIONS))

    def test_no_permissions_gets_no_tools(self):
        session = FakeSession(superuser=0, securitymap="")
        tools = asm3.ai_assistant.get_available_tools(session)
        self.assertEqual(len(tools), 0)

    def test_view_animal_only(self):
        """User with only VIEW_ANIMAL should get read-only animal tools."""
        session = FakeSession(superuser=0, securitymap="va *")
        tools = asm3.ai_assistant.get_available_tools(session)
        tool_names = [t["name"] for t in tools]
        self.assertIn("search_animal", tool_names)
        self.assertIn("get_animal_details", tool_names)
        self.assertIn("get_locations", tool_names)
        self.assertIn("get_species", tool_names)
        self.assertNotIn("add_animal", tool_names)
        self.assertNotIn("move_animal", tool_names)
        self.assertNotIn("add_vaccination", tool_names)

    def test_add_animal_permission(self):
        session = FakeSession(superuser=0, securitymap="va *aa *")
        tools = asm3.ai_assistant.get_available_tools(session)
        tool_names = [t["name"] for t in tools]
        self.assertIn("add_animal", tool_names)
        self.assertNotIn("add_vaccination", tool_names)

    def test_tools_formatted_for_claude_api(self):
        """Tools returned should have name, description, input_schema only (Claude API format)."""
        session = FakeSession(superuser=1)
        tools = asm3.ai_assistant.get_available_tools(session)
        for t in tools:
            self.assertIn("name", t)
            self.assertIn("description", t)
            self.assertIn("input_schema", t)
            # Should NOT have internal fields
            self.assertNotIn("permission", t)
            self.assertNotIn("confirm", t)


class TestSystemPrompt(unittest.TestCase):

    def test_basic_prompt(self):
        dbo = base.get_dbo()
        session = FakeSession()
        prompt = asm3.ai_assistant.build_system_prompt(dbo, session)
        self.assertIn("animal shelter", prompt.lower())
        self.assertIn("test", prompt)  # username

    def test_prompt_with_animal_context(self):
        dbo = base.get_dbo()
        session = FakeSession()
        context = {
            "type": "animal",
            "id": 42,
            "name": "Bob",
            "code": "HH042",
            "species": "Hedgehog",
            "location": "Shelter 1"
        }
        prompt = asm3.ai_assistant.build_system_prompt(dbo, session, context)
        self.assertIn("Bob", prompt)
        self.assertIn("HH042", prompt)
        self.assertIn("Hedgehog", prompt)

    def test_prompt_with_person_context(self):
        dbo = base.get_dbo()
        session = FakeSession()
        context = {"type": "person", "id": 15, "name": "Jane Smith"}
        prompt = asm3.ai_assistant.build_system_prompt(dbo, session, context)
        self.assertIn("Jane Smith", prompt)

    def test_prompt_without_context(self):
        dbo = base.get_dbo()
        session = FakeSession()
        prompt = asm3.ai_assistant.build_system_prompt(dbo, session, None)
        self.assertNotIn("currently viewing", prompt)


class TestToolExecution(unittest.TestCase):
    """Test tool handler execution against the test database."""

    nid = 0

    def setUp(self):
        data = {
            "animalname": "TestAIAnimal",
            "estimatedage": "1",
            "animaltype": "1",
            "entryreason": "1",
            "species": "1"
        }
        post = asm3.utils.PostedData(data, "en")
        self.nid, self.code = asm3.animal.insert_animal_from_form(base.get_dbo(), post, "test")
        self.session = FakeSession()

    def tearDown(self):
        asm3.animal.delete_animal(base.get_dbo(), "test", self.nid)

    def test_search_animal(self):
        dbo = base.get_dbo()
        result = asm3.ai_assistant.handle_search_animal(dbo, self.session, {"query": "TestAIAnimal"})
        self.assertGreater(result["count"], 0)
        self.assertEqual(result["animals"][0]["name"], "TestAIAnimal")

    def test_get_animal_details(self):
        dbo = base.get_dbo()
        result = asm3.ai_assistant.handle_get_animal_details(dbo, self.session, {"animal_id": self.nid})
        self.assertEqual(result["name"], "TestAIAnimal")
        self.assertEqual(result["id"], self.nid)

    def test_get_animal_details_not_found(self):
        dbo = base.get_dbo()
        result = asm3.ai_assistant.handle_get_animal_details(dbo, self.session, {"animal_id": 999999})
        self.assertIn("error", result)

    def test_update_weight(self):
        dbo = base.get_dbo()
        result = asm3.ai_assistant.handle_update_weight(dbo, self.session, {
            "animal_id": self.nid,
            "weight": 450
        })
        self.assertIn("message", result)
        # Verify weight was updated
        a = asm3.animal.get_animal(dbo, self.nid)
        self.assertEqual(float(a.WEIGHT), 450.0)

    def test_update_weight_not_found(self):
        dbo = base.get_dbo()
        result = asm3.ai_assistant.handle_update_weight(dbo, self.session, {
            "animal_id": 999999,
            "weight": 100
        })
        self.assertIn("error", result)

    def test_add_log(self):
        dbo = base.get_dbo()
        result = asm3.ai_assistant.handle_add_log(dbo, self.session, {
            "animal_id": self.nid,
            "comments": "Test AI observation note"
        })
        self.assertIn("log_id", result)
        self.assertGreater(result["log_id"], 0)
        # Clean up
        asm3.log.delete_log(dbo, "test", result["log_id"])

    def test_get_locations(self):
        dbo = base.get_dbo()
        result = asm3.ai_assistant.handle_get_locations(dbo, self.session, {})
        self.assertIn("locations", result)
        self.assertIsInstance(result["locations"], list)

    def test_get_species(self):
        dbo = base.get_dbo()
        result = asm3.ai_assistant.handle_get_species(dbo, self.session, {})
        self.assertIn("species", result)
        self.assertIsInstance(result["species"], list)

    def test_get_breeds(self):
        dbo = base.get_dbo()
        result = asm3.ai_assistant.handle_get_breeds(dbo, self.session, {})
        self.assertIn("breeds", result)
        self.assertIsInstance(result["breeds"], list)

    def test_get_breeds_filtered(self):
        dbo = base.get_dbo()
        result = asm3.ai_assistant.handle_get_breeds(dbo, self.session, {"species_id": 1})
        self.assertIn("breeds", result)

    def test_get_vaccination_types(self):
        dbo = base.get_dbo()
        result = asm3.ai_assistant.handle_get_vaccination_types(dbo, self.session, {})
        self.assertIn("vaccination_types", result)

    def test_get_test_types(self):
        dbo = base.get_dbo()
        result = asm3.ai_assistant.handle_get_test_types(dbo, self.session, {})
        self.assertIn("test_types", result)


class TestExecuteTool(unittest.TestCase):
    """Test the execute_tool dispatcher."""

    def setUp(self):
        self.session = FakeSession()

    def test_unknown_tool(self):
        dbo = base.get_dbo()
        result = asm3.ai_assistant.execute_tool(dbo, self.session, "nonexistent", {})
        self.assertIn("error", result)

    def test_permission_denied(self):
        """User without ADD_ANIMAL permission should be denied."""
        dbo = base.get_dbo()
        session = FakeSession(superuser=0, securitymap="va *")
        with self.assertRaises(asm3.utils.ASMPermissionError):
            asm3.ai_assistant.execute_tool(dbo, session, "add_animal", {"name": "Test"})

    def test_execute_read_tool(self):
        dbo = base.get_dbo()
        result = asm3.ai_assistant.execute_tool(dbo, self.session, "get_locations", {})
        self.assertIn("locations", result)


class TestMakePost(unittest.TestCase):

    def test_values_converted_to_strings(self):
        post = asm3.ai_assistant._make_post({"animal_id": 42, "weight": 450.5, "name": "Bob"})
        self.assertEqual(post.data["animal_id"], "42")
        self.assertEqual(post.data["weight"], "450.5")
        self.assertEqual(post.data["name"], "Bob")

    def test_none_becomes_empty_string(self):
        post = asm3.ai_assistant._make_post({"field": None})
        self.assertEqual(post.data["field"], "")


class TestDescribeAction(unittest.TestCase):

    def test_add_animal_description(self):
        desc = asm3.ai_assistant._describe_action("add_animal", {"name": "Spike"})
        self.assertIn("Spike", desc)

    def test_update_weight_description(self):
        desc = asm3.ai_assistant._describe_action("update_weight", {"animal_id": 42, "weight": 450})
        self.assertIn("450", desc)

    def test_unknown_action_description(self):
        desc = asm3.ai_assistant._describe_action("unknown_tool", {})
        self.assertIn("unknown_tool", desc)


class TestSerializeContent(unittest.TestCase):

    def test_serialize_text_block(self):
        class FakeBlock:
            type = "text"
            text = "Hello"
        result = asm3.ai_assistant._serialize_content([FakeBlock()])
        self.assertEqual(result, [{"type": "text", "text": "Hello"}])

    def test_serialize_tool_use_block(self):
        class FakeBlock:
            type = "tool_use"
            id = "123"
            name = "search_animal"
            input = {"query": "Bob"}
        result = asm3.ai_assistant._serialize_content([FakeBlock()])
        self.assertEqual(result[0]["type"], "tool_use")
        self.assertEqual(result[0]["name"], "search_animal")
        self.assertEqual(result[0]["input"], {"query": "Bob"})


class TestChatNoApiKey(unittest.TestCase):
    """Test chat function when API key is not configured."""

    def test_chat_returns_error_without_api_key(self):
        dbo = base.get_dbo()
        session = FakeSession()
        # Temporarily clear the API key
        import asm3.ai_assistant as ai
        original_key = ai.AI_API_KEY
        ai.AI_API_KEY = ""
        try:
            result = ai.chat(dbo, session, "Hello")
            self.assertIn("not configured", result["text"])
            self.assertFalse(result["requires_confirmation"])
        finally:
            ai.AI_API_KEY = original_key


if __name__ == "__main__":
    unittest.main()
