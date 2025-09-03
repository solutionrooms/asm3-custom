/*global $, jQuery, _, asm, common, config, controller, dlgfx, edit_header, format, header, html, tableform, validate */

$(function() {

    "use strict";

    const hedgehog_observation = {

        storage_key: function() {
            let aid = controller.animal ? controller.animal.ID : "unknown";
            return "hedgehog_observation:" + aid;
        },

        save_state: function() {
            try {
                let state = {};
                $(".widget").each(function(){
                    let k = $(this).attr("data-name");
                    if (!k) { return; }
                    state[k] = $(this).val();
                });
                sessionStorage.setItem(this.storage_key(), JSON.stringify(state));
            } catch(e) { /* ignore storage errors */ }
        },

        restore_state: function() {
            try {
                let raw = sessionStorage.getItem(this.storage_key());
                if (!raw) { return; }
                let state = JSON.parse(raw);
                $(".widget").each(function(){
                    let k = $(this).attr("data-name");
                    if (!k) { return; }
                    if (state.hasOwnProperty(k)) { $(this).val(state[k]); }
                });
                sessionStorage.removeItem(this.storage_key());
            } catch(e) { /* ignore parse/storage errors */ }
        },

        render: function() {
            let a = controller.animal;

            let h = [
                html.content_header(_("Daily Observation")),
            ];

            // Animal header or chooser
            if (a) {
                h.push('<div class="asm-main-section">');
                h.push('<div class="asm-row">');
                h.push('<div class="asm-col-12">');
                h.push('<div class="asm-flex-row" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">');
                // thumbnail: prefer website thumb; else use latest media id
                if (a.WEBSITEMEDIANAME) {
                    h.push(html.animal_link_thumb_bare(a));
                }
                else if (controller.latestmediaid) {
                    h.push('<a href="animal?id=' + a.ID + '"><img class="asm-thumbnail thumbnailshadow" style="height: 88px" src="media?id=' + controller.latestmediaid + '" /></a>');
                }
                h.push('<div>');
                h.push(html.animal_link(a, { emblemsright: true, newtab: true }));
                h.push('</div></div>');
                h.push('</div></div>');
            } else {
                h.push('<div class="asm-main-section">');
                h.push(html.info(_("Select an animal to start")));
                h.push('<input id="animal" type="hidden" class="asm-animalchooser" />');
                h.push('</div>');
            }

            // Recent observation note (last 12 hours)
            if (controller.recent && a) {
                let d = format.date(controller.recent.DATE) + ' ' + format.time(controller.recent.DATE);
                let obs = hedgehog_observation.parse_observation_map(controller.recent.COMMENTS);
                let parts = [];
                $.each(obs, function(k, v){ if (v) { parts.push(k + ': ' + v); } });
                h.push('<div class="asm-main-section">');
                h.push(html.info(_("Note: a previous observation was taken at {timestamp} the values were:").replace("{timestamp}", d) + '<br>' + html.title(parts.join(' | '))));
                h.push('</div>');
            }

            // Build behaviour fields vertically (top-to-bottom)
            let fields = [], meta = [];
            for (let i = 0; i < 50; i++) {
                let name = config.str("Behave" + i + "Name");
                let value = config.str("Behave" + i + "Values");
                if (!name) { continue; }
                let req = config.str("Behave" + i + "Required").toLowerCase() === "yes";
                let range = config.str("Behave" + i + "Range");
                meta.push({ idx: i, name: name, required: req, range: range });
                let label = '<label class="asm-label">' + html.title(name) + '</label>';
                if (value) {
                    fields.push(
                        '<div class="asm-field">' + label +
                        '<select class="asm-selectbox asm-halfselectbox widget" data-index="' + i + '" data-name="' + html.title(name) + '">' +
                        '<option value=""></option>' + html.list_to_options(value.split("|")) +
                        '</select></div>'
                    );
                } else {
                    fields.push(
                        '<div class="asm-field">' + label +
                        '<input type="text" class="asm-textbox widget" data-index="' + i + '" data-name="' + html.title(name) + '" />' +
                        '</div>'
                    );
                }
            }

            h.push('<div class="asm-main-section asm-hhog-observation">');
            h.push(fields.join("\n"));
            // Placeholder for poo confirmation step
            h.push('<div id="poo-confirm" style="display:none; margin-top:10px;"></div>');

            // Buttons
            h.push('<div class="asm-button-row">');
            h.push('<button id="button-save" class="asm-mobile-full">' + _("Save") + '</button>');
            if (a) {
                h.push('<button id="button-photo" class="asm-mobile-full">' + _("Attach Photo") + '</button>');
            }
            h.push('</div>');

            h.push('</div>'); // end section

            // Photo upload dialog (simple)
            if (a) {
                h.push('<div id="dialog-photo" style="display: none" title="' + html.title(_("Attach Photo")) + '">');
                h.push('<form id="photoform" method="post" enctype="multipart/form-data" action="media">');
                h.push('<input type="hidden" name="mode" value="create" />');
                h.push('<input type="hidden" name="linkid" value="' + a.ID + '" />');
                h.push('<input type="hidden" name="linktypeid" value="0" />');
                h.push('<input type="hidden" name="controller" value="hedgehog_observation" />');
                h.push('<p><input type="file" name="filechooser" accept="image/*" class="asm-textbox" /></p>');
                h.push('</form>');
                h.push('</div>');
            }

            h.push(html.content_footer());
            this.behave_meta = meta;
            return h.join("\n");
        },

        parse_observation_map: function(comments) {
            let map = {};
            if (!comments) { return map; }
            try {
                $.each(comments.split(','), function(i, part) {
                    let p = part.split('=');
                    if (p.length >= 2) {
                        let key = $.trim(p[0]);
                        let val = $.trim(p.slice(1).join('='));
                        map[key] = val;
                    }
                });
            } catch(e) {}
            return map;
        },

        bind: function() {
            // Disable widgets until we have an animal
            if (!controller.animal) {
                $(".widget").prop("disabled", true);
                // Animal chooser to select and route back in
                $("#animal").animalchooser().bind("animalchooserchange", function(event, rec) {
                    if (rec && rec.ID) {
                        common.route("hedgehog_observation?animalid=" + rec.ID);
                    }
                });
            }
            else {
                // Attempt to restore saved values after a photo upload
                this.restore_state();
            }

            $("#button-save").button().click(async function() {
                if (!controller.animal) { return; }
                let avs = [], map = {};
                let valid = true;
                // reset highlights
                $(".widget").css({ borderColor: "", background: "" });
                // Build values + validate required + range
                $(".widget").each(function() {
                    let nm = $(this).attr("data-name"), idx = $(this).attr("data-index");
                    let val = $(this).val();
                    map[nm] = val;
                    // required check
                    let meta = (hedgehog_observation.behave_meta || []).find(m => String(m.idx) === String(idx));
                    if (meta && meta.required && (!val || val === "")) {
                        $(this).css({ borderColor: "red", background: "#ffecec" });
                        valid = false;
                    }
                    // numeric range check, format min-max
                    if (meta && meta.range && val) {
                        let parts = meta.range.split("-");
                        if (parts.length === 2) {
                            let v = parseFloat(val), lo = parseFloat(parts[0]), hi = parseFloat(parts[1]);
                            if (!isNaN(v) && !isNaN(lo) && !isNaN(hi)) {
                                if (v < lo || v > hi) {
                                    $(this).css({ borderColor: "red", background: "#fff2e5" });
                                    valid = false;
                                }
                            }
                        }
                    }
                    if (config.bool("SuppressBlankObservations") && !val) { return; }
                    avs.push(nm + "=" + val);
                });
                if (!valid) { header.show_error(_("Please fix highlighted fields.")); return; }

                // Poo sample rule checks
                const f = function(label){ return Object.keys(map).find(k => k.toLowerCase() === label.toLowerCase()); };
                let triggers = [];
                let weightField = f("Weight");
                let drankField = f("Drunk");
                let eatenField = f("Eaten");
                let unusualField = f("Unusual Symptoms");
                let pooInspectField = f("Poo Inspection");
                if (unusualField && map[unusualField]) { triggers.push(unusualField); }
                if (drankField && (map[drankField] || "").toLowerCase() === "none") { triggers.push(drankField); }
                if (eatenField && (map[eatenField] || "").toLowerCase() === "none") { triggers.push(eatenField); }
                if (pooInspectField && (map[pooInspectField] === "7" || map[pooInspectField] === "8")) { triggers.push(pooInspectField); }
                // weight delta
                const parseWeight = function(s) { let v = parseFloat(String(s).replace(/[^0-9.\-]/g, '')); return isNaN(v) ? null : v; };
                if (weightField && map[weightField]) {
                    let currentW = parseWeight(map[weightField]);
                    if (currentW !== null && controller.history7 && controller.history7.length) {
                        let within1d = null, within7d = null;
                        let now = new Date();
                        $.each(controller.history7, function(i, r){
                            let m = hedgehog_observation.parse_observation_map(r.COMMENTS);
                            let prev = parseWeight(m[weightField]);
                            if (prev === null) { return; }
                            let dt = new Date(r.DATE);
                            let hours = Math.abs((now - dt) / 36e5);
                            if (hours <= 24 && within1d === null) { within1d = prev; }
                            if (hours <= 24*7 && within7d === null) { within7d = prev; }
                        });
                        if (within1d !== null && currentW <= within1d * 0.98) { triggers.push(weightField); }
                        else if (within7d !== null && currentW <= within7d * 0.95) { triggers.push(weightField); }
                    }
                }

                if (triggers.length && $("#poo-confirm").is(":hidden")) {
                    // Highlight triggering fields
                    $(".widget").each(function(){ let nm = $(this).attr("data-name"); if (triggers.indexOf(nm) !== -1) { $(this).css({ borderColor: "red", background: "#ffecec" }); }});
                    let reason = triggers.join(', ');
                    let pc = [
                        '<div class="asm-warning" style="padding:8px">' + _("The following fields triggered a poo sample check: ") + html.title(reason) + '</div>',
                        '<div style="margin-top:6px">',
                        '<label><input type="radio" name="poosample" value="Yes" /> ' + _("Take poo sample now") + '</label> ',
                        '<label style="margin-left:20px"><input type="radio" name="poosample" value="No" /> ' + _("Do not take a poo sample") + '</label>',
                        '</div>'
                    ];
                    $("#poo-confirm").html(pc.join("\n")).show();
                    header.show_info(_("Please confirm poo sample before saving."));
                    return; // Block this save; user must confirm Yes/No
                }

                if ($("#poo-confirm").is(":visible")) {
                    let v = $("input[name=poosample]:checked").val();
                    if (!v) { header.show_error(_("Please select Yes or No for poo sample.")); return; }
                    avs.push("Take poo sample=" + v);
                }

                let packed = controller.animal.ID + "==" + avs.join(", ");
                // Use the configured log type from Options -> Daily Observations
                let formdata = { "mode": "save", "logtype": config.str("BehaveLogType"), "logs": packed };
                if (avs.length === 0) { return; }
                header.show_loading(_("Saving..."));
                let response = await common.ajax_post("hedgehog_observation", formdata);
                header.hide_loading();
                let msg = _("{0} observation logs successfully written.").replace("{0}", response);
                if (controller.animal && controller.animal.ANIMALNAME) {
                    msg = _("Observation saved for {0}.").replace("{0}", html.title(controller.animal.ANIMALNAME));
                }
                header.show_info(msg, 5000);
                // Attempt to close the form/tab after a short delay.
                setTimeout(function(){
                    try { window.close(); } catch(e) {}
                    if (window.history.length > 1) {
                        window.history.back();
                    } else {
                        document.location.href = "main";
                    }
                }, 1200);
            });

            // Photo upload
            if (controller.animal) {
                $("#dialog-photo").dialog({ autoOpen: false, modal: true, width: 420,
                    buttons: (function(){ let b={}; b[_("Upload")] = function(){ $("#photoform").submit(); }; b[_("Cancel")] = function(){ $(this).dialog("close"); }; return b; })(),
                    show: dlgfx.add_show, hide: dlgfx.add_hide
                });
                $("#button-photo").button().click(() => { this.save_state(); $("#dialog-photo").dialog("open"); });
            }
        },

        sync: function() {},
        destroy: function() {},
        name: "hedgehog_observation",
        animation: "book",
        title: function() { return _("Daily Observation"); },
        routes: {
            "hedgehog_observation": function() { common.module_loadandstart("hedgehog_observation", "hedgehog_observation?" + this.rawqs); }
        }
    };

    common.module_register(hedgehog_observation);

});
