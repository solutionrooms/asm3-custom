/*global $, jQuery, _, asm, common, config, controller, dlgfx, edit_header, format, header, html, tableform, validate */

$(function() {

    "use strict";

    const hedgehog_observation = {

        today_map: null,
        today_log_id: null,
        today_extras: {},
        is_mobile: false,
        state_restored: false,

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
            this.state_restored = false;
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
                this.state_restored = true;
            } catch(e) { /* ignore parse/storage errors */ }
        },

        render: function() {
            let a = controller.animal;
            this.today_map = controller.today ? this.parse_observation_map(controller.today.COMMENTS) : null;
            this.today_log_id = controller.today ? controller.today.LOGID : null;
            this.today_extras = {};
            this.is_mobile = !!controller.is_mobile;
            this.state_restored = false;

            let h = [ html.content_header(_("Daily Observation")) ];

            h.push('<style>');
            h.push('.hhog-hero-card{background:linear-gradient(135deg,#f8fafc,#ffffff);border-radius:18px;padding:22px;box-shadow:0 18px 45px rgba(15,23,42,0.12);margin-bottom:20px;}');
            h.push('.hhog-hero{display:flex;flex-wrap:wrap;gap:20px;align-items:center;}');
            h.push('.hhog-hero-thumb img{width:120px;height:120px;border-radius:18px;object-fit:cover;box-shadow:0 12px 32px rgba(15,23,42,0.18);}');
            h.push('.hhog-hero-details{flex:1 1 260px;min-width:220px;}');
            h.push('.hhog-hero-name{font-size:1.65rem;font-weight:700;color:#1f2937;margin-bottom:6px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;}');
            h.push('.hhog-hero-meta{color:#475569;font-size:0.95rem;display:flex;flex-wrap:wrap;gap:10px;}');
            h.push('.hhog-hero-tags{margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;}');
            h.push('.hhog-tag{background:#eef2ff;color:#4338ca;font-weight:600;border-radius:999px;padding:4px 12px;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;}');
            h.push('.hhog-card{background:#ffffff;border-radius:16px;padding:20px;box-shadow:0 14px 36px rgba(15,23,42,0.08);margin-bottom:20px;}');
            h.push('.hhog-intro{color:#4b5563;font-size:0.95rem;margin-bottom:12px;}');
            h.push('.asm-hhog-observation{background:#ffffff;border-radius:18px;padding:24px 26px 30px;box-shadow:0 22px 55px rgba(15,23,42,0.1);}');
            h.push('.hhog-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px 24px;}');
            h.push('.hhog-field{background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;transition:box-shadow .2s,border-color .2s,background .2s;}');
            h.push('.hhog-field-label{display:block;font-size:0.78rem;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#475569;margin-bottom:8px;}');
            h.push('.hhog-field input,.hhog-field select{width:100%;font-size:0.95rem;}');
            h.push('.hhog-field:focus-within{background:#fff;border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,0.2);}');
            h.push('.hhog-field-error{border-color:#ef4444!important;background:#fef2f2!important;box-shadow:0 0 0 2px rgba(239,68,68,0.15)!important;}');
            h.push('.hhog-field-alert{border-color:#fb923c!important;background:#fff7ed!important;}');
            h.push('.hhog-banner{display:flex;gap:12px;align-items:flex-start;padding:16px 18px;border-radius:14px;margin-bottom:20px;}');
            h.push('.hhog-banner-icon{font-size:22px;}');
            h.push('.hhog-banner-title{font-weight:700;font-size:1rem;margin-bottom:4px;}');
            h.push('.hhog-banner-note{font-size:0.92rem;}');
            h.push('.hhog-banner-update{background:#ecfdf3;border:1px solid #86efac;color:#065f46;}');
            h.push('.hhog-banner-info{background:#f1f5f9;border:1px solid #bfdbfe;color:#1e3a8a;}');
            h.push('.hhog-confirm{background:#fff7ed;border:1px solid #fdba74;border-radius:14px;padding:18px 20px;margin-top:24px;display:none;}');
            h.push('#clinician-confirm.hhog-confirm{background:#fef2f2;border-color:#fca5a5;}');
            h.push('.hhog-alert-heading{font-weight:700;margin-bottom:6px;font-size:1rem;color:#1f2937;}');
            h.push('.hhog-alert-copy{margin:0 0 12px 0;font-size:0.92rem;color:#4b5563;}');
            h.push('.hhog-pill-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;}');
            h.push('.hhog-pill{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:#e0f2fe;color:#0369a1;font-size:0.75rem;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;}');
            h.push('#clinician-confirm .hhog-pill{background:#fee2e2;color:#b91c1c;}');
            h.push('.hhog-checkbox-group{display:flex;flex-wrap:wrap;gap:14px;}');
            h.push('.hhog-checkbox{display:flex;align-items:center;gap:8px;font-weight:600;color:#1f2937;font-size:0.9rem;}');
            h.push('.hhog-checkbox input{width:auto;}');
            h.push('.hhog-actions{margin-top:30px;display:flex;flex-wrap:wrap;gap:14px;}');
            h.push('.hhog-actions button{min-width:170px;font-size:1rem;padding:11px 20px;}');
            h.push('@media (max-width:780px){.hhog-hero{gap:16px;}.hhog-hero-thumb img{width:96px;height:96px;}.hhog-card{padding:18px;}.asm-hhog-observation{padding:22px;}.hhog-actions{flex-direction:column;}.hhog-banner{flex-direction:column;align-items:flex-start;}.hhog-checkbox-group{flex-direction:column;}}');
            h.push('</style>');

            if (a) {
                h.push('<div class="hhog-hero-card">');
                h.push('<div class="hhog-hero">');
                let thumb = '';
                if (a.WEBSITEMEDIANAME) {
                    thumb = html.animal_link_thumb_bare(a);
                }
                else if (controller.latestmediaid) {
                    thumb = '<a href="animal?id=' + a.ID + '"><img class="asm-thumbnail thumbnailshadow" src="media?id=' + controller.latestmediaid + '" alt="" /></a>';
                }
                if (thumb) {
                    h.push('<div class="hhog-hero-thumb">' + thumb + '</div>');
                }
                h.push('<div class="hhog-hero-details">');
                h.push('<div class="hhog-hero-name">' + html.animal_link(a, { emblemsright: true, newtab: true }) + '</div>');
                let metaParts = [];
                if (a.SPECIESNAME) { metaParts.push(html.title(a.SPECIESNAME)); }
                if (a.BREEDNAME) { metaParts.push(html.title(a.BREEDNAME)); }
                if (a.ANIMALAGE) { metaParts.push(html.title(a.ANIMALAGE)); }
                if (metaParts.length) {
                    h.push('<div class="hhog-hero-meta">' + metaParts.join(' • ') + '</div>');
                }
                let tagParts = [];
                if (a.CODE) { tagParts.push('<span class="hhog-tag">' + html.title(a.CODE) + '</span>'); }
                if (a.SHELTERLOCATIONNAME) {
                    let loc = a.SHELTERLOCATIONNAME;
                    if (a.SHELTERLOCATIONUNIT) { loc += ' • ' + a.SHELTERLOCATIONUNIT; }
                    tagParts.push('<span class="hhog-tag">' + html.title(loc) + '</span>');
                }
                if (tagParts.length) {
                    h.push('<div class="hhog-hero-tags">' + tagParts.join('') + '</div>');
                }
                h.push('</div></div></div>');
            }

            const chooserValueAttr = a ? ' value="' + a.ID + '"' : '';
            h.push('<div class="hhog-card asm-main-section">');
            h.push('<div class="hhog-intro">' + (a ? _("Switch to another animal to record their observations.") : _("Select an animal to start a new observation.")) + '</div>');
            h.push('<div class="asm-field">');
            h.push('<label class="asm-label" for="animal">' + _("Animal") + '</label>');
            h.push('<input id="animal" type="hidden" class="asm-animalchooser"' + chooserValueAttr + ' />');
            h.push('</div></div>');

            if (controller.today && a) {
                let stamp = format.date(controller.today.DATE) + ' ' + format.time(controller.today.DATE);
                let by = controller.today.BY ? html.title(controller.today.BY) : _("Unknown");
                h.push('<div class="hhog-banner hhog-banner-update">');
                h.push('<span class="asm-icon asm-icon-info hhog-banner-icon"></span>');
                h.push('<div><div class="hhog-banner-title">' + _("Updating today's observation") + '</div>');
                h.push('<div class="hhog-banner-note">' + common.substitute(_("Last recorded {0} by {1}. Saving will update the same log entry."), { "0": html.title(stamp), "1": by }) + '</div></div></div>');
            }

            if (controller.recent && a) {
                const sameLog = controller.today && controller.today.LOGID === controller.recent.LOGID;
                if (!sameLog) {
                    let d = format.date(controller.recent.DATE) + ' ' + format.time(controller.recent.DATE);
                    let obs = this.parse_observation_map(controller.recent.COMMENTS);
                    let parts = [];
                    $.each(obs, function(k, v){ if (v) { parts.push(html.title(k) + ': ' + html.title(v)); } });
                    h.push('<div class="hhog-banner hhog-banner-info">');
                    h.push('<span class="asm-icon asm-icon-info hhog-banner-icon"></span>');
                    h.push('<div><div class="hhog-banner-title">' + _("Last observation") + '</div>');
                    h.push('<div class="hhog-banner-note">' + common.substitute(_("Recorded at {0} with: {1}"), { "0": html.title(d), "1": html.title(parts.join(' | ')) }) + '</div></div></div>');
                }
            }

            let fields = [], meta = [];
            for (let i = 0; i < 50; i++) {
                let name = config.str("Behave" + i + "Name");
                let value = config.str("Behave" + i + "Values");
                if (!name) { continue; }
                let req = config.str("Behave" + i + "Required").toLowerCase() === "yes";
                let range = config.str("Behave" + i + "Range");
                meta.push({ idx: i, name: name, required: req, range: range });
                let label = '<label class="hhog-field-label">' + html.title(name) + '</label>';
                if (value) {
                    fields.push('<div class="hhog-field">' + label + '<select class="asm-selectbox widget" data-index="' + i + '" data-name="' + html.title(name) + '"><option value=""></option>' + html.list_to_options(value.split("|")) + '</select></div>');
                }
                else {
                    fields.push('<div class="hhog-field">' + label + '<input type="text" class="asm-textbox widget" data-index="' + i + '" data-name="' + html.title(name) + '" /></div>');
                }
            }

            h.push('<div class="asm-main-section asm-hhog-observation">');
            h.push('<div class="hhog-grid">' + fields.join("\n") + '</div>');
            h.push('<div id="poo-confirm" class="hhog-confirm"></div>');
            h.push('<div id="clinician-confirm" class="hhog-confirm"></div>');
            h.push('<div class="hhog-actions">');
            h.push('<button id="button-save" class="asm-mobile-full">' + _("Save") + '</button>');
            if (a) {
                h.push('<button id="button-photo" class="asm-mobile-full">' + _("Attach Photo") + '</button>');
            }
            h.push('</div></div>');

            if (a) {
                h.push('<div id="dialog-photo" style="display:none" title="' + html.title(_("Attach Photo")) + '">');
                h.push('<form id="photoform" method="post" enctype="multipart/form-data" action="media">');
                h.push('<input type="hidden" name="mode" value="create" />');
                h.push('<input type="hidden" name="linkid" value="' + a.ID + '" />');
                h.push('<input type="hidden" name="linktypeid" value="0" />');
                h.push('<input type="hidden" name="controller" value="hedgehog_observation" />');
                h.push('<p><input type="file" name="filechooser" accept="image/*" class="asm-textbox" /></p>');
                h.push('</form></div>');
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

        ensure_clinician_confirm: function(triggerFields) {
            const container = $("#clinician-confirm");
            if (!container.length) { return; }
            const key = triggerFields.join("|");
            if (container.data("reason-key") !== key) {
                const chips = triggerFields.map(function(f) {
                    return '<span class="hhog-pill">' + html.title(f) + '</span>';
                }).join("");
                const markup = [
                    '<div class="hhog-alert-heading">' + _("No faeces or no sign of animal recorded") + '</div>',
                    '<p class="hhog-alert-copy">' + _("Please notify the clinician and confirm before saving.") + '</p>',
                    '<div class="hhog-pill-row">' + chips + '</div>',
                    '<label class="hhog-checkbox"><input type="checkbox" id="clinician-notify" /> ' + _("I have notified the clinician") + '</label>'
                ];
                container.html(markup.join(""));
                container.data("reason-key", key);
            }
            container.show();
        },

        clear_clinician_confirm: function() {
            const container = $("#clinician-confirm");
            if (!container.length) { return; }
            container.hide().removeData("reason-key").empty();
        },

        bind: function() {
            const ho = hedgehog_observation;
            const chooser = $("#animal");
            chooser.animalchooser();
            chooser.off("animalchooserchange").on("animalchooserchange", function(event, rec) {
                if (rec && rec.ID) {
                    if (controller.animal && String(controller.animal.ID) === String(rec.ID)) { return; }
                    common.route("hedgehog_observation?animalid=" + rec.ID);
                }
            });

            if (!controller.animal) {
                $(".widget").prop("disabled", true);
            }
            else {
                chooser.val(controller.animal.ID || "");
                ho.restore_state();
                if (!ho.state_restored && ho.today_map) {
                    const extras = {};
                    const skipExtras = ["take poo sample", "notify clinician"];
                    $.each(ho.today_map, function(key, value) {
                        const widgets = $(".widget").filter(function(){ return $(this).attr("data-name") === key; });
                        if (widgets.length) {
                            widgets.val(value);
                        }
                        else if (key && skipExtras.indexOf(key.toLowerCase()) === -1) {
                            extras[key] = value;
                        }
                    });
                    ho.today_extras = extras;
                }
            }

            $("#button-save").button();
            if (ho.today_log_id) {
                $("#button-save").button("option", "label", _("Update Observation"));
            }

            $("#button-save").off("click").on("click", async function() {
                if (!controller.animal) { return; }
                let avs = [], map = {};
                let valid = true;
                let clinicianConfirmed = false;

                const removeKey = function(list, keyName) {
                    const lower = (keyName || "").toLowerCase();
                    return list.filter(function(entry) {
                        if (!entry) { return false; }
                        const eq = entry.indexOf("=");
                        const key = (eq === -1 ? entry : entry.substring(0, eq)).toLowerCase();
                        return key !== lower;
                    });
                };

                $(".hhog-field").removeClass("hhog-field-error hhog-field-alert");

                $(".widget").each(function() {
                    let nm = $(this).attr("data-name"), idx = $(this).attr("data-index");
                    let val = $(this).val();
                    map[nm] = val;
                    let meta = (ho.behave_meta || []).find(m => String(m.idx) === String(idx));
                    let fieldShell = $(this).closest(".hhog-field");
                    if (meta && meta.required && (!val || val === "")) {
                        fieldShell.addClass("hhog-field-error");
                        valid = false;
                    }
                    if (meta && meta.range && val) {
                        let parts = meta.range.split("-");
                        if (parts.length === 2) {
                            let v = parseFloat(val), lo = parseFloat(parts[0]), hi = parseFloat(parts[1]);
                            if (!isNaN(v) && !isNaN(lo) && !isNaN(hi) && (v < lo || v > hi)) {
                                fieldShell.addClass("hhog-field-error");
                                valid = false;
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
                            let m = ho.parse_observation_map(r.COMMENTS);
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

                if (!triggers.length && $("#poo-confirm").is(":visible")) {
                    $("#poo-confirm").hide().empty();
                }

                const valueIndicatesNone = function(value) {
                    if (value === null || value === undefined) { return true; }
                    const v = String(value).trim().toLowerCase();
                    if (v === "") { return true; }
                    if (["none", "no", "absent", "missing", "n/a", "na", "nil", "zero", "0"].indexOf(v) !== -1) { return true; }
                    if (v.startsWith("no ") || v.startsWith("none ") || v.indexOf("no sign") !== -1 || v.indexOf("not seen") !== -1 || v.indexOf("no poo") !== -1 || v.indexOf("no faec") !== -1 || v.indexOf("no fec") !== -1) { return true; }
                    return false;
                };

                let clinicianTriggers = [];
                $.each(map, function(key, value) {
                    const lk = (key || "").toLowerCase();
                    if (!lk) { return; }
                    if ((lk.indexOf("faec") !== -1 || lk.indexOf("feces") !== -1 || lk.indexOf("faeces") !== -1 || lk.indexOf("poo") !== -1) && valueIndicatesNone(value)) {
                        clinicianTriggers.push(key);
                        return;
                    }
                    if (lk.indexOf("sign") !== -1 && lk.indexOf("animal") !== -1 && valueIndicatesNone(value)) {
                        clinicianTriggers.push(key);
                        return;
                    }
                    if ((lk.indexOf("seen") !== -1 || lk.indexOf("sighting") !== -1) && valueIndicatesNone(value)) {
                        clinicianTriggers.push(key);
                    }
                });
                const uniqueClinicianTriggers = [...new Set(clinicianTriggers)];
                if (uniqueClinicianTriggers.length) {
                    $(".widget").each(function(){
                        if (uniqueClinicianTriggers.indexOf($(this).attr("data-name")) !== -1) {
                            $(this).closest(".hhog-field").addClass("hhog-field-alert");
                        }
                    });
                    const wasVisible = $("#clinician-confirm").is(":visible");
                    ho.ensure_clinician_confirm(uniqueClinicianTriggers);
                    if (!wasVisible) {
                        header.show_info(_("Please confirm clinician notification before saving."));
                        return;
                    }
                    if (!$("#clinician-notify").is(":checked")) {
                        header.show_error(_("Please confirm clinician notification before saving."));
                        return;
                    }
                    clinicianConfirmed = true;
                }
                else {
                    ho.clear_clinician_confirm();
                }

                if (triggers.length && $("#poo-confirm").is(":hidden")) {
                    $(".widget").each(function(){
                        if (triggers.indexOf($(this).attr("data-name")) !== -1) {
                            $(this).closest(".hhog-field").addClass("hhog-field-alert");
                        }
                    });
                    const chips = triggers.map(function(t){ return '<span class="hhog-pill">' + html.title(t) + '</span>'; }).join("");
                    const pc = [
                        '<div class="hhog-alert-heading">' + _("Poo sample requested") + '</div>',
                        '<p class="hhog-alert-copy">' + _("The following fields triggered a poo sample check:") + '</p>',
                        '<div class="hhog-pill-row">' + chips + '</div>',
                        '<div class="hhog-checkbox-group">',
                        '<label class="hhog-checkbox"><input type="radio" name="poosample" value="Yes" /> ' + _("Take poo sample now") + '</label>',
                        '<label class="hhog-checkbox"><input type="radio" name="poosample" value="No" /> ' + _("Do not take a poo sample") + '</label>',
                        '</div>'
                    ];
                    $("#poo-confirm").html(pc.join("")).show();
                    header.show_info(_("Please confirm poo sample before saving."));
                    return; // Block this save; user must confirm Yes/No
                }

                if ($("#poo-confirm").is(":visible")) {
                    let v = $("input[name=poosample]:checked").val();
                    if (!v) { header.show_error(_("Please select Yes or No for poo sample.")); return; }
                    avs = removeKey(avs, "Take poo sample");
                    avs.push("Take poo sample=" + v);
                }

                avs = removeKey(avs, "Notify clinician");
                if (clinicianConfirmed) {
                    avs.push("Notify clinician=Yes");
                }

                if (ho.today_extras && Object.keys(ho.today_extras).length) {
                    $.each(ho.today_extras, function(extraKey, extraValue) {
                        avs = removeKey(avs, extraKey);
                        avs.push(extraKey + "=" + extraValue);
                    });
                }

                if (avs.length === 0) {
                    header.show_error(_("Please enter at least one observation value."));
                    return;
                }

                let packed = controller.animal.ID + "==" + avs.join(", ");
                // Use the configured log type from Options -> Daily Observations
                let formdata = { "mode": "save", "logtype": config.str("BehaveLogType"), "logs": packed };
                if (ho.today_log_id) { formdata.updatelogid = ho.today_log_id; }
                $(".asm-content button").button("disable");
                header.show_loading(_("Saving..."));
                let response;
                try {
                    response = await common.ajax_post("hedgehog_observation", formdata);
                }
                finally {
                    header.hide_loading();
                    $(".asm-content button").button("enable");
                }
                let msg;
                if (controller.animal && controller.animal.ANIMALNAME) {
                    msg = (ho.today_log_id ? _("Observation updated for {0}.") : _("Observation saved for {0}."));
                    msg = msg.replace("{0}", html.title(controller.animal.ANIMALNAME));
                }
                else {
                    msg = _("{0} observation logs successfully written.").replace("{0}", response);
                }
                header.show_info(msg, 5000);
                setTimeout(function(){
                    try { if (!ho.is_mobile) { window.close(); } } catch(e) {}
                    if (window.history.length > 1) {
                        window.history.back();
                    } else {
                        document.location.href = ho.is_mobile ? "mobile" : "main";
                    }
                }, 1200);
            });

            // Photo upload
            if (controller.animal) {
                $("#dialog-photo").dialog({ autoOpen: false, modal: true, width: 420,
                    buttons: (function(){ let b={}; b[_("Upload")] = function(){ $("#photoform").submit(); }; b[_("Cancel")] = function(){ $(this).dialog("close"); }; return b; })(),
                    show: dlgfx.add_show, hide: dlgfx.add_hide
                });
                $("#button-photo").button().off("click").on("click", () => { ho.save_state(); $("#dialog-photo").dialog("open"); });
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
