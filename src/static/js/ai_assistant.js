/*global $, Mousetrap, _, asm, common, config, controller, format, header, html */
/*global ai_assistant: true */

var ai_assistant;

$(function() {

"use strict";

// Don't initialize on login or database pages
if (common.current_url().indexOf("/login") != -1 ||
    common.current_url().indexOf("/database") != -1) {
    return;
}

ai_assistant = {

    conversation_history: [],
    pending_action: null,
    panel_visible: false,
    voice_output_enabled: false,

    /** Check if viewport is mobile-sized */
    is_mobile: function() {
        return window.innerWidth < 768;
    },

    /** Render the floating chat panel HTML (injected into body, not asm-body-container) */
    render_panel: function() {
        return [
            '<div id="ai-chat-panel" style="display:none; position:fixed; bottom:20px; right:20px; width:380px; height:480px; min-width:300px; min-height:250px; z-index:10000;">',
            '<div class="ui-widget ui-corner-all" style="box-shadow: 0 4px 12px rgba(0,0,0,0.15); display:flex; flex-direction:column; height:100%; overflow:hidden; border:2px solid #4a8c5c; background:#f0f7f0;">',
                // Resize handle (mobile split-screen)
                '<div id="ai-resize-handle" style="display:none; height:14px; cursor:ns-resize; background:#3d7a4e; text-align:center; flex-shrink:0;">',
                    '<div style="width:40px; height:4px; background:rgba(255,255,255,0.5); border-radius:2px; margin:5px auto 0;"></div>',
                '</div>',
                // Header
                '<div id="ai-chat-header" style="padding:8px 12px; cursor:move; display:flex; align-items:center; justify-content:space-between; flex-shrink:0; background:#4a8c5c; color:#fff; border-radius:4px 4px 0 0;">',
                    '<span style="font-weight:bold;">' + _("AI Assistant") + '</span>',
                    '<span>',
                        '<span id="ai-voice-toggle" style="cursor:pointer; margin-right:8px; opacity:0.5;" title="' + html.title(_("Toggle voice output")) + '">',
                            '<svg width="16" height="16" viewBox="0 0 24 24" style="vertical-align:middle; fill:#fff;">',
                                '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>',
                            '</svg>',
                        '</span>',
                        '<span id="ai-new" style="cursor:pointer; margin-right:8px;" title="' + html.title(_("New conversation")) + '">',
                            '<span class="asm-icon asm-icon-new"></span>',
                        '</span>',
                        '<span id="ai-minimize" style="cursor:pointer; margin-right:8px;" title="' + html.title(_("Minimize")) + '">&#8211;</span>',
                        '<span id="ai-close" style="cursor:pointer;" title="' + html.title(_("Close")) + '">&times;</span>',
                    '</span>',
                '</div>',
                // Messages area
                '<div id="ai-messages" style="flex:1; overflow-y:auto; padding:12px; background:#f5faf5;">',
                    '<div class="ai-welcome" style="color:#888; text-align:center; margin-top:80px;">',
                        '<p>' + _("How can I help you?") + '</p>',
                        '<p style="font-size:0.85em;">' + _("Try: \"Find hedgehog Bob\" or \"today's observation\" or \"Fred has been released\"") + '</p>',
                        '<p style="font-size:0.8em; margin-top:12px; line-height:1.4;">' +
                            _("Use the microphone button below to speak, or the speaker icon above to hear responses read back to you.") +
                        '</p>',
                    '</div>',
                '</div>',
                // Input area
                '<div style="padding:8px; border-top:1px solid #4a8c5c; display:flex; gap:6px; align-items:center; flex-shrink:0; background:#e8f0e8;">',
                    '<button id="ai-mic" type="button" title="' + html.title(_("Push to talk")) + '" ',
                        'style="width:32px; height:32px; padding:0; border:1px solid #ccc; border-radius:4px; background:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center;">',
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="#333">',
                            '<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/>',
                            '<path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>',
                        '</svg>',
                    '</button>',
                    '<button id="ai-dictate" type="button" title="' + html.title(_("Record induction notes")) + '" ',
                        'style="width:32px; height:32px; padding:0; border:1px solid #ccc; border-radius:4px; background:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center;">',
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="#333">',
                            '<path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 9h-2v2H9v-2H7v-2h2V7h2v2h2v2zm-1-7.5V9h4.5L12 3.5z"/>',
                        '</svg>',
                    '</button>',
                    '<input id="ai-input" type="text" placeholder="' + html.title(_("Type a command...")) + '" ',
                        'style="flex:1; padding:6px 8px; border:1px solid #ccc; border-radius:4px;" />',
                    '<button id="ai-send" type="button" title="' + html.title(_("Send")) + '" ',
                        'style="width:32px; height:32px; padding:0; border:1px solid #ccc; border-radius:4px; background:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center;">',
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="#333">',
                            '<path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>',
                        '</svg>',
                    '</button>',
                '</div>',
            '</div>',
            '</div>'
        ].join("\n");
    },

    /** Inject the panel into the page and bind events */
    init: function() {
        // Inject the chat panel into body
        $("body").append(this.render_panel());
        this.bind_panel();
        this.voice.init();
        this.dictation.init();
        // Hide dictation button if user doesn't have the permission
        if (!common.has_permission("uaid")) {
            $("#ai-dictate").hide();
        }
        // Restore previous conversation if available
        this._restore_session();
    },

    /** Bind all chat panel event handlers */
    bind_panel: function() {
        var self = this;

        // Send button
        $("#ai-send").click(function() {
            self.send_from_input();
        });

        // Enter key in input
        $("#ai-input").keypress(function(e) {
            if (e.which == 13) {
                self.send_from_input();
                e.preventDefault();
            }
        });

        // Mic button
        $("#ai-mic").click(function() {
            self.voice.toggle_listening();
        });

        // Dictation button
        $("#ai-dictate").click(function() {
            if (self.dictation.is_recording) {
                self.dictation.stop();
            } else {
                self.dictation.start();
            }
        });

        // Voice output toggle
        $("#ai-voice-toggle").click(function() {
            self.voice_output_enabled = !self.voice_output_enabled;
            $(this).css("opacity", self.voice_output_enabled ? "1" : "0.5");
        });

        // New conversation
        $("#ai-new").click(function() {
            self.new_conversation();
        });

        // Minimize
        $("#ai-minimize").click(function() {
            self.toggle_panel();
        });

        // Close (X) - just hide the panel, keep conversation
        $("#ai-close").click(function() {
            self.toggle_panel();
        });

        // Make panel draggable and resizable (desktop only)
        if (!self.is_mobile()) {
            $("#ai-chat-panel").draggable({ handle: "#ai-chat-header" })
                .resizable({ minWidth: 300, minHeight: 250, handles: "n, e, w, ne, nw" });
        }
        self._bind_mobile_resize();

        // Re-apply layout on orientation change / window resize
        $(window).on("resize.aipanel", function() {
            if (self.panel_visible) {
                if (self.is_mobile()) {
                    self._apply_mobile_layout();
                } else {
                    self._remove_mobile_layout();
                }
            }
        });

        // Keyboard shortcut
        Mousetrap.bind("alt+shift+q", function() {
            self.toggle_panel();
            return false;
        });

        // Delegate click on confirm/cancel buttons (dynamically added)
        $("#ai-messages").on("click", ".ai-confirm-btn", function() {
            self.confirm_action();
        });
        $("#ai-messages").on("click", ".ai-cancel-btn", function() {
            self.cancel_action();
        });

        // Delegate click on entity/navigation links
        $("#ai-messages").on("click", ".ai-entity-link", function(e) {
            e.preventDefault();
            var url = $(this).data("url");
            if (url) { common.route(url); }
        });

        // Delegate click on process transcript button
        $("#ai-messages").on("click", ".ai-process-btn", function() {
            var transcript = $(this).data("transcript");
            if (transcript) { self.process_transcript(transcript); }
        });

        // Delegate click on feedback (thumbs down) button
        $("#ai-messages").on("click", ".ai-feedback-btn", function() {
            var btn = $(this);
            if (btn.data("sent")) { return; }
            var responseText = btn.data("response");
            self._show_feedback_form(btn, responseText);
        });
    },

    /** Toggle panel visibility */
    toggle_panel: function() {
        if (this.panel_visible) {
            $("#ai-chat-panel").fadeOut(200);
            this._remove_mobile_layout();
        } else {
            if (this.is_mobile()) {
                this._apply_mobile_layout();
            }
            $("#ai-chat-panel").fadeIn(200);
            $("#ai-input").focus();
        }
        this.panel_visible = !this.panel_visible;
    },

    /** Reset conversation state */
    new_conversation: function() {
        this.conversation_history = [];
        this.pending_action = null;
        this._clear_session();
        $("#ai-messages").html(
            '<div class="ai-welcome" style="color:#888; text-align:center; margin-top:80px;">' +
            '<p>' + _("How can I help you?") + '</p>' +
            '<p style="font-size:0.85em;">' + _("Try: \"Find hedgehog Bob\" or \"today's observation\" or \"Fred has been released\"") + '</p>' +
            '<p style="font-size:0.8em; margin-top:12px; line-height:1.4;">' +
                _("Use the microphone button below to speak, or the speaker icon above to hear responses read back to you.") +
            '</p>' +
            '</div>'
        );
    },

    /** Get the text from input and send it */
    send_from_input: function() {
        var text = $.trim($("#ai-input").val());
        if (text === "") { return; }
        $("#ai-input").val("");
        this.send_message(text);
    },

    /** Send a message to the backend */
    send_message: function(text) {
        var self = this;

        // Remove welcome message
        $(".ai-welcome").remove();

        // Display user message
        self.append_message("user", text);

        // Show typing indicator
        var typingId = self.append_typing();

        // Build the POST data
        var formdata = "mode=chat" +
            "&message=" + encodeURIComponent(text) +
            "&history=" + encodeURIComponent(JSON.stringify(self.conversation_history)) +
            "&context=" + encodeURIComponent(JSON.stringify(self.get_page_context()));

        common.ajax_post("ai_assistant", formdata, function(result) {
            // Remove typing indicator
            $("#" + typingId).remove();

            var response;
            try {
                response = JSON.parse(result);
            } catch(e) {
                if (result && result.indexOf("login") != -1) {
                    self.append_message("error", _("Your session has expired. Please log in again."));
                } else if (result && result.indexOf("location_select") != -1) {
                    self.append_message("error", _("Please select a location first."));
                } else {
                    self.append_message("error", _("Failed to get a response from the AI service."));
                }
                return;
            }

            // Update conversation history
            if (response.history) {
                self.conversation_history = response.history;
            }

            // Display AI response
            if (response.text) {
                self.append_message("ai", response.text);
                self.voice.speak(response.text);
            }

            // Display clickable entity links
            if (response.entity_links && response.entity_links.length > 0) {
                self.append_entity_links(response.entity_links);
            }

            // Handle navigation
            if (response.navigate) {
                self.append_nav_link(response.navigate);
            }

            // Handle confirmation flow
            if (response.requires_confirmation && response.pending_action) {
                self.pending_action = response.pending_action;
                self.append_confirmation(response.pending_action);
            }

            // Persist conversation state
            self._save_session();

        }, function(errmsg) {
            $("#" + typingId).remove();
            self.append_message("error", _("Error") + ": " + errmsg);
        });
    },

    /** Confirm a pending action */
    confirm_action: function() {
        var self = this;
        if (!self.pending_action) { return; }

        var action = self.pending_action;
        self.pending_action = null;

        // Remove confirm/cancel buttons
        $(".ai-action-buttons").remove();

        var typingId = self.append_typing();

        var formdata = "mode=confirm" +
            "&tool=" + encodeURIComponent(action.tool) +
            "&params=" + encodeURIComponent(JSON.stringify(action.params));

        common.ajax_post("ai_assistant", formdata, function(result) {
            $("#" + typingId).remove();

            var response;
            try {
                response = JSON.parse(result);
            } catch(e) {
                self.append_message("error", _("Failed to get a response from the AI service."));
                return;
            }

            if (response.success) {
                self.append_message("ai", _("Done!"));
                // If result has useful info, display it
                if (response.result && response.result.message) {
                    self.append_message("ai", response.result.message);
                }
                // Refresh page if the action affected the currently viewed record
                self._refresh_if_current(action);
            } else {
                self.append_message("error", response.message || _("Action failed."));
            }
            self._save_session();

        }, function(errmsg) {
            $("#" + typingId).remove();
            self.append_message("error", _("Error") + ": " + errmsg);
        });
    },

    /** Cancel a pending action */
    cancel_action: function() {
        this.pending_action = null;
        $(".ai-action-buttons").remove();
        this.append_message("ai", _("Cancelled."));
        this._save_session();
    },

    /** Refresh the current page if the action affected the record being viewed */
    _refresh_if_current: function(action) {
        var ctx = this.get_page_context();
        var animal_id = action.params.animal_id || action.params.animal;
        if (ctx.type === "animal" && animal_id && String(ctx.id) === String(animal_id)) {
            setTimeout(function() { common.route_reload(); }, 1000);
        }
    },

    /** Apply mobile docked-bottom layout */
    _apply_mobile_layout: function() {
        var panel = $("#ai-chat-panel");
        panel.css({
            position: "fixed",
            bottom: "0",
            left: "0",
            right: "0",
            top: "auto",
            width: "100%",
            height: "50vh",
            "min-width": "0",
            "min-height": "150px",
            "border-radius": "0"
        });
        panel.find(".ui-widget").css("border-radius", "0");
        $("#ai-resize-handle").show();
        $("#ai-chat-header").css("cursor", "default");
        $("#asm-body-container").css("padding-bottom", panel.css("height"));
    },

    /** Remove mobile layout and restore desktop styles */
    _remove_mobile_layout: function() {
        var panel = $("#ai-chat-panel");
        panel.css({
            position: "fixed",
            bottom: "20px",
            left: "",
            right: "20px",
            top: "",
            width: "380px",
            height: "480px",
            "min-width": "300px",
            "min-height": "250px",
            "border-radius": ""
        });
        panel.find(".ui-widget").css("border-radius", "");
        $("#ai-resize-handle").hide();
        $("#ai-chat-header").css("cursor", "move");
        $("#asm-body-container").css("padding-bottom", "");
    },

    /** Bind touch and mouse events on the mobile resize handle */
    _bind_mobile_resize: function() {
        var handle = document.getElementById("ai-resize-handle");
        if (!handle) { return; }
        var startY = 0, startHeight = 0;

        // Touch support
        handle.addEventListener("touchstart", function(e) {
            startY = e.touches[0].clientY;
            startHeight = $("#ai-chat-panel").height();
            e.preventDefault();
        }, { passive: false });

        handle.addEventListener("touchmove", function(e) {
            var dy = startY - e.touches[0].clientY;
            var newHeight = Math.max(150, Math.min(window.innerHeight - 60, startHeight + dy));
            $("#ai-chat-panel").css("height", newHeight + "px");
            $("#asm-body-container").css("padding-bottom", newHeight + "px");
            e.preventDefault();
        }, { passive: false });

        // Mouse support (for testing on desktop)
        handle.addEventListener("mousedown", function(e) {
            startY = e.clientY;
            startHeight = $("#ai-chat-panel").height();
            var onMove = function(ev) {
                var dy = startY - ev.clientY;
                var newHeight = Math.max(150, Math.min(window.innerHeight - 60, startHeight + dy));
                $("#ai-chat-panel").css("height", newHeight + "px");
                $("#asm-body-container").css("padding-bottom", newHeight + "px");
            };
            var onUp = function() {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
            e.preventDefault();
        });
    },

    /** Show a button to process a transcript into the induction form */
    _show_process_button: function(transcript) {
        var html_str = '<div class="ai-process-buttons" style="text-align:left; margin-bottom:8px; margin-left:8px;">' +
            '<button class="ai-process-btn" type="button" data-transcript="' + html.title(transcript) + '" ' +
            'style="padding:6px 16px; background:#1565c0; color:#fff; border:none; border-radius:4px; cursor:pointer;">' +
            _("Review & Create Record") + '</button></div>';
        $("#ai-messages").append(html_str);
        this.scroll_to_bottom();
    },

    /** Process a transcript through the AI to extract animal data, then navigate to induction */
    process_transcript: function(transcript) {
        var self = this;
        $(".ai-process-buttons").remove();
        self.append_message("ai", _("Extracting animal data from transcript..."));
        var typingId = self.append_typing();

        var formdata = "mode=extract&transcript=" + encodeURIComponent(transcript);

        common.ajax_post("ai_assistant", formdata, function(result) {
            $("#" + typingId).remove();
            var response;
            try { response = JSON.parse(result); } catch(e) { response = {}; }
            if (response.success && response.data) {
                // Store extracted data in sessionStorage for the induction page to pick up
                sessionStorage.setItem("ai_induction_data", JSON.stringify(response.data));
                sessionStorage.setItem("ai_induction_transcript", transcript);
                self.append_message("ai", _("Data extracted. Opening admission form..."));
                setTimeout(function() { common.route("animal_induction"); }, 1000);
            } else {
                self.append_message("error", response.message || _("Failed to extract data from transcript."));
            }
        }, function(errmsg) {
            $("#" + typingId).remove();
            self.append_message("error", _("Error") + ": " + errmsg);
        });
    },

    /** Append a message to the chat area */
    append_message: function(role, text) {
        var msgClass, align, bg, color;
        if (role === "user") {
            msgClass = "ai-msg-user";
            align = "right";
            bg = "#0078d4";
            color = "#fff";
        } else if (role === "error") {
            msgClass = "ai-msg-error";
            align = "left";
            bg = "#fee";
            color = "#c00";
        } else {
            msgClass = "ai-msg-ai";
            align = "left";
            bg = "#e8e8e8";
            color = "#333";
        }

        var escapedText = $("<div>").text(text).html().replace(/\n/g, "<br>");
        var feedbackBtn = "";
        if (role === "ai") {
            var fbId = "ai-fb-" + new Date().getTime();
            feedbackBtn = '<div style="text-align:left; margin-left:12px; margin-top:2px;">' +
                '<span class="ai-feedback-btn" data-fbid="' + fbId + '" data-response="' + html.title(text) + '" ' +
                'style="cursor:pointer; opacity:0.3; font-size:0.75em;" title="' + html.title(_("Report a problem with this response")) + '">' +
                '&#128078;</span></div>';
        }

        var msgHtml = '<div class="' + msgClass + '" style="text-align:' + align + '; margin-bottom:8px;">' +
            '<span style="display:inline-block; max-width:85%; padding:8px 12px; border-radius:12px; ' +
            'background:' + bg + '; color:' + color + '; text-align:left; font-size:0.9em; word-wrap:break-word;">' +
            escapedText + '</span>' + feedbackBtn + '</div>';

        $("#ai-messages").append(msgHtml);
        this.scroll_to_bottom();
    },

    /** Append a user-friendly confirmation box describing the action */
    append_confirmation: function(action) {
        var desc = $("<span>").text(action.description || action.tool).html();
        var html_str = '<div class="ai-action-buttons" style="margin:8px; border:1px solid #e0e0e0; border-radius:8px; ' +
            'background:#fff; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.1);">' +
            '<div style="padding:10px 12px; background:#fff3e0; border-bottom:1px solid #ffe0b2;">' +
                '<strong style="color:#e65100;">&#9888; ' + _("Confirm action") + '</strong>' +
            '</div>' +
            '<div style="padding:10px 12px; font-size:0.9em; color:#333;">' +
                desc +
            '</div>' +
            '<div style="padding:8px 12px; display:flex; gap:8px; justify-content:flex-end; background:#fafafa; border-top:1px solid #eee;">' +
                '<button class="ai-cancel-btn" type="button" style="padding:6px 16px; ' +
                'background:#fff; color:#555; border:1px solid #ccc; border-radius:4px; cursor:pointer;">' +
                _("Cancel") + '</button>' +
                '<button class="ai-confirm-btn" type="button" style="padding:6px 16px; ' +
                'background:#28a745; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">' +
                _("Confirm") + '</button>' +
            '</div>' +
        '</div>';

        $("#ai-messages").append(html_str);
        this.scroll_to_bottom();
    },

    /** Append clickable entity links (animals, people found by search) */
    append_entity_links: function(links) {
        var parts = [];
        $.each(links, function(i, link) {
            var icon = link.type === "animal" ? "&#128062;" : "&#128100;";
            parts.push('<a href="#" class="ai-entity-link" data-url="' + link.url + '" ' +
                'style="display:inline-block; margin:2px 4px; padding:4px 10px; border-radius:12px; ' +
                'background:#e3f2fd; color:#1565c0; text-decoration:none; font-size:0.85em; cursor:pointer;">' +
                icon + ' ' + $("<span>").text(link.name).html() + '</a>');
        });
        if (parts.length > 0) {
            var html_str = '<div style="text-align:left; margin-bottom:8px; margin-left:8px;">' +
                parts.join("") + '</div>';
            $("#ai-messages").append(html_str);
            this.scroll_to_bottom();
        }
    },

    /** Append a navigation link that auto-navigates after a short delay */
    append_nav_link: function(url) {
        var html_str = '<div style="text-align:left; margin-bottom:8px; margin-left:8px;">' +
            '<a href="#" class="ai-entity-link" data-url="' + url + '" ' +
            'style="display:inline-block; padding:4px 12px; border-radius:12px; ' +
            'background:#e8f5e9; color:#2e7d32; text-decoration:none; font-size:0.85em; cursor:pointer;">' +
            '&#10132; ' + _("Go to") + ' ' + $("<span>").text(url.split("?")[0]).html() + '</a></div>';
        $("#ai-messages").append(html_str);
        this.scroll_to_bottom();
        // Auto-navigate after brief delay so user sees the message
        setTimeout(function() { common.route(url); }, 1500);
    },

    /** Show a typing indicator and return its ID for removal */
    append_typing: function() {
        var id = "ai-typing-" + new Date().getTime();
        var html_str = '<div id="' + id + '" class="ai-msg-ai" style="text-align:left; margin-bottom:8px;">' +
            '<span style="display:inline-block; padding:8px 12px; border-radius:12px; ' +
            'background:#e8e8e8; color:#888; font-size:0.9em;">' +
            '<em>' + _("Thinking...") + '</em></span></div>';
        $("#ai-messages").append(html_str);
        this.scroll_to_bottom();
        return id;
    },

    /** Scroll messages area to bottom */
    scroll_to_bottom: function() {
        var el = document.getElementById("ai-messages");
        if (el) { el.scrollTop = el.scrollHeight; }
    },

    /** Save conversation state to sessionStorage */
    _save_session: function() {
        try {
            sessionStorage.setItem("ai_history", JSON.stringify(this.conversation_history));
            sessionStorage.setItem("ai_messages_html", $("#ai-messages").html());
        } catch(e) {}
    },

    /** Restore conversation state from sessionStorage */
    _restore_session: function() {
        try {
            var hist = sessionStorage.getItem("ai_history");
            var html = sessionStorage.getItem("ai_messages_html");
            if (hist && html) {
                this.conversation_history = JSON.parse(hist);
                $("#ai-messages").html(html);
                // Remove any stale typing indicators or pending confirmation buttons
                $(".ai-action-buttons").remove();
                $("[id^='ai-typing-']").remove();
            }
        } catch(e) {}
    },

    /** Clear saved conversation state */
    _clear_session: function() {
        try {
            sessionStorage.removeItem("ai_history");
            sessionStorage.removeItem("ai_messages_html");
        } catch(e) {}
    },

    /** Show inline feedback form below a response */
    _show_feedback_form: function(btn, responseText) {
        var self = this;
        // Replace the thumbs-down with a small form
        var container = btn.parent();
        container.html(
            '<div style="margin-top:4px; padding:6px; background:#fff8e1; border:1px solid #ffe082; border-radius:6px; font-size:0.8em;">' +
                '<div style="margin-bottom:4px; color:#555;">' + _("What was wrong with this response?") + '</div>' +
                '<input type="text" class="ai-fb-reason" placeholder="' + html.title(_("e.g. wrong weight, should have offered more detail...")) + '" ' +
                    'style="width:100%; padding:4px 6px; border:1px solid #ccc; border-radius:3px; font-size:0.9em; box-sizing:border-box;" />' +
                '<div style="margin-top:4px; display:flex; gap:4px; justify-content:flex-end;">' +
                    '<button class="ai-fb-cancel" type="button" style="padding:3px 10px; background:#fff; color:#555; border:1px solid #ccc; ' +
                        'border-radius:3px; cursor:pointer; font-size:0.85em;">' + _("Cancel") + '</button>' +
                    '<button class="ai-fb-submit" type="button" style="padding:3px 10px; background:#e65100; color:#fff; border:none; ' +
                        'border-radius:3px; cursor:pointer; font-size:0.85em;">' + _("Send") + '</button>' +
                '</div>' +
            '</div>'
        );
        container.find(".ai-fb-reason").focus();
        container.find(".ai-fb-reason").keypress(function(e) {
            if (e.which == 13) { container.find(".ai-fb-submit").click(); e.preventDefault(); }
        });
        container.find(".ai-fb-cancel").click(function() {
            container.html('<span class="ai-feedback-btn" data-response="' + html.title(responseText) + '" ' +
                'style="cursor:pointer; opacity:0.3; font-size:0.75em;" title="' + html.title(_("Report a problem with this response")) + '">' +
                '&#128078;</span>');
        });
        container.find(".ai-fb-submit").click(function() {
            var reason = $.trim(container.find(".ai-fb-reason").val());
            self._submit_feedback(responseText, reason);
            container.html('<span style="color:#888; font-size:0.75em;">' + _("Thanks for your feedback") + '</span>');
            self._save_session();
        });
    },

    /** Submit feedback to the backend */
    _submit_feedback: function(responseText, reason) {
        var ctx = this.get_page_context();
        var formdata = "mode=feedback" +
            "&response=" + encodeURIComponent(responseText) +
            "&reason=" + encodeURIComponent(reason) +
            "&page=" + encodeURIComponent(ctx.page || "") +
            "&context_id=" + encodeURIComponent(ctx.id || "");
        common.ajax_post("ai_assistant", formdata, function() {}, function() {});
    },

    /** Extract context from the current page */
    get_page_context: function() {
        var path = common.current_url().split("?")[0];
        // Get just the last segment of the path
        var parts = path.split("/");
        var page = parts[parts.length - 1];
        var ctx = { page: page };

        try {
            // Animal page
            if (page === "animal" && controller && controller.animal) {
                ctx.id = controller.animal.ID;
                ctx.name = controller.animal.ANIMALNAME;
                ctx.species = controller.animal.SPECIESNAME;
                ctx.location = controller.animal.SHELTERLOCATIONNAME;
                ctx.code = controller.animal.SHELTERCODE;
                ctx.type = "animal";
            }
            // Person page
            else if (page === "person" && controller && controller.person) {
                ctx.id = controller.person.ID;
                ctx.name = controller.person.OWNERNAME;
                ctx.type = "person";
            }
        } catch(e) {
            // controller may not be defined on some pages
        }

        return ctx;
    },

    /** Voice input/output via Web Speech API */
    voice: {
        recognition: null,
        synthesis: window.speechSynthesis,
        is_listening: false,

        init: function() {
            var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SR) {
                // Hide mic button if speech recognition not supported
                $("#ai-mic").hide();
                $("#ai-dictate").hide();
                return;
            }
            this.recognition = new SR();
            this.recognition.continuous = false;
            this.recognition.interimResults = true;
            this.recognition.lang = asm.locale ? asm.locale.replace("_", "-") : "en-GB";

            var self = this;

            this.recognition.onresult = function(event) {
                var transcript = "";
                for (var i = event.resultIndex; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }
                $("#ai-input").val(transcript);
                if (event.results[event.results.length - 1].isFinal) {
                    self.is_listening = false;
                    $("#ai-mic").css("background", "");
                    $("#ai-input").val("");
                    ai_assistant.send_message(transcript);
                }
            };

            this.recognition.onerror = function() {
                self.is_listening = false;
                $("#ai-mic").css("background", "");
            };

            this.recognition.onend = function() {
                self.is_listening = false;
                $("#ai-mic").css("background", "");
            };
        },

        toggle_listening: function() {
            if (!this.recognition) { return; }
            if (this.is_listening) {
                this.recognition.stop();
            } else {
                this.recognition.start();
                this.is_listening = true;
                $("#ai-mic").css("background", "#ff4444");
            }
        },

        speak: function(text) {
            if (!ai_assistant.voice_output_enabled) { return; }
            if (!this.synthesis) { return; }
            var utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = asm.locale ? asm.locale.replace("_", "-") : "en-GB";
            // Apply configured voice if set
            var voiceName = config.str("AIVoice");
            if (voiceName) {
                var voices = this.synthesis.getVoices();
                for (var i = 0; i < voices.length; i++) {
                    if (voices[i].name === voiceName) {
                        utterance.voice = voices[i];
                        break;
                    }
                }
            }
            // Apply configured speed
            var rate = parseFloat(config.str("AIVoiceRate"));
            if (rate && !isNaN(rate)) { utterance.rate = rate; }
            this.synthesis.speak(utterance);
        }
    },

    /** Long-form dictation mode - continuous recording saved as media transcript */
    dictation: {
        recognition: null,
        is_recording: false,
        transcript: "",
        interim: "",
        start_time: null,
        timer_interval: null,

        init: function() {
            var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SR) { return; }

            this.recognition = new SR();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = asm.locale ? asm.locale.replace("_", "-") : "en-GB";

            var self = this;

            this.recognition.onresult = function(event) {
                var interim = "";
                for (var i = event.resultIndex; i < event.results.length; i++) {
                    if (event.results[i].isFinal) {
                        self.transcript += event.results[i][0].transcript + " ";
                    } else {
                        interim += event.results[i][0].transcript;
                    }
                }
                self.interim = interim;
                self._update_display();
            };

            this.recognition.onerror = function(event) {
                // Ignore no-speech errors during continuous recording
                if (event.error === "no-speech") { return; }
                self.stop();
            };

            this.recognition.onend = function() {
                // Auto-restart if still supposed to be recording (browser stops after silence)
                if (self.is_recording) {
                    try { self.recognition.start(); } catch(e) {}
                }
            };
        },

        start: function() {
            if (!this.recognition) { return; }
            // Only available on animal pages
            var ctx = ai_assistant.get_page_context();
            if (ctx.type !== "animal") {
                ai_assistant.append_message("error", _("Dictation is only available when viewing an animal record."));
                return;
            }
            this.transcript = "";
            this.interim = "";
            this.is_recording = true;
            this.start_time = new Date();
            this._show_overlay();
            try { this.recognition.start(); } catch(e) {}
        },

        stop: function() {
            this.is_recording = false;
            if (this.timer_interval) {
                clearInterval(this.timer_interval);
                this.timer_interval = null;
            }
            try { this.recognition.stop(); } catch(e) {}
            this._hide_overlay();

            var text = $.trim(this.transcript);
            if (text === "") {
                ai_assistant.append_message("error", _("No speech was detected."));
                return;
            }
            this._save_transcript(text);
        },

        _show_overlay: function() {
            var self = this;
            var overlay = '<div id="ai-dictation-overlay" style="position:fixed; bottom:0; left:0; right:0; z-index:10001; ' +
                'background:#d32f2f; color:#fff; padding:12px 20px; display:flex; align-items:center; justify-content:space-between; ' +
                'box-shadow:0 -2px 8px rgba(0,0,0,0.3);">' +
                '<div style="display:flex; align-items:center; gap:12px;">' +
                    '<span style="display:inline-block; width:12px; height:12px; background:#fff; border-radius:50%; ' +
                        'animation:ai-pulse 1s infinite;"></span>' +
                    '<span style="font-weight:bold;">' + _("Recording") + '</span>' +
                    '<span id="ai-dictation-timer" style="font-family:monospace;">00:00</span>' +
                '</div>' +
                '<div id="ai-dictation-preview" style="flex:1; margin:0 20px; font-size:0.85em; opacity:0.9; ' +
                    'max-height:40px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></div>' +
                '<button id="ai-dictation-stop" type="button" style="padding:6px 20px; background:#fff; color:#d32f2f; ' +
                    'border:none; border-radius:4px; font-weight:bold; cursor:pointer;">' + _("Stop & Save") + '</button>' +
                '</div>';
            // Add pulse animation
            if ($("#ai-pulse-style").length === 0) {
                $("head").append('<style id="ai-pulse-style">@keyframes ai-pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }</style>');
            }
            $("body").append(overlay);
            $("#ai-dictation-stop").click(function() { self.stop(); });

            // Update timer every second
            this.timer_interval = setInterval(function() {
                var elapsed = Math.floor((new Date() - self.start_time) / 1000);
                var mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
                var secs = String(elapsed % 60).padStart(2, "0");
                $("#ai-dictation-timer").text(mins + ":" + secs);
            }, 1000);
        },

        _hide_overlay: function() {
            $("#ai-dictation-overlay").remove();
        },

        _update_display: function() {
            var preview = this.transcript + this.interim;
            // Show last 100 chars
            if (preview.length > 100) { preview = "..." + preview.slice(-100); }
            $("#ai-dictation-preview").text(preview);
        },

        _save_transcript: function(text) {
            var ctx = ai_assistant.get_page_context();
            if (!ctx.id) { return; }

            ai_assistant.append_message("ai", _("Saving transcript") + " (" + text.split(/\s+/).length + " " + _("words") + ")...");

            var formdata = "mode=transcript" +
                "&animal_id=" + encodeURIComponent(ctx.id) +
                "&transcript=" + encodeURIComponent(text);

            common.ajax_post("ai_assistant", formdata, function(result) {
                var response;
                try { response = JSON.parse(result); } catch(e) { response = {}; }
                if (response.success) {
                    ai_assistant.append_message("ai", _("Transcript saved to media."));
                    // Offer to process transcript into induction form
                    ai_assistant._show_process_button(text);
                } else {
                    ai_assistant.append_message("error", response.message || _("Failed to save transcript."));
                }
            }, function(errmsg) {
                ai_assistant.append_message("error", _("Error") + ": " + errmsg);
            });
        }
    }
};

// Module registration for when navigating to /ai_assistant directly
ai_assistant.render = function() {
    return [
        '<div class="asm-toolbar">',
            '<button id="ai-open-panel">' + _("Open AI Assistant Panel") + '</button>',
        '</div>',
        '<div id="asm-main-content">',
            '<p>' + _("The AI Assistant is available as a floating panel on any page.") + '</p>',
            '<p>' + _("Click the AI button in the toolbar, or press Alt+Shift+Q to toggle it.") + '</p>',
        '</div>'
    ].join("\n");
};
ai_assistant.bind = function() {
    $("#ai-open-panel").button().click(function() {
        if (!ai_assistant.panel_visible) { ai_assistant.toggle_panel(); }
    });
};
ai_assistant.sync = function() {
    // Auto-open the panel when on this page
    if (!ai_assistant.panel_visible) { ai_assistant.toggle_panel(); }
};
ai_assistant.destroy = function() { return false; };
ai_assistant.name = "ai_assistant";
ai_assistant.animation = "newdata";
ai_assistant.title = function() { return _("AI Assistant"); };
ai_assistant.routes = {
    "ai_assistant": function() {
        common.module_loadandstart("ai_assistant", "ai_assistant");
    }
};

common.module_register(ai_assistant);

// Auto-initialize the floating chat panel if user has permission
if (common.has_permission("uaia")) {
    ai_assistant.init();
} else {
    $("#asm-topline-ai").hide();
}

});
