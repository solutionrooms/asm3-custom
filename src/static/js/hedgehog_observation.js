/*global $, jQuery, _, asm, common, config, controller, dlgfx, edit_header, format, header, html, tableform, validate */

$(function() {

    "use strict";

    const hasExistingTranslate = (typeof window !== "undefined" && typeof window._ === "function");
    const __translate = hasExistingTranslate ? window._ : function() {
        if (arguments.length === 0) { return ""; }
        return arguments[0];
    };
    const translate = function() {
        return __translate.apply(this, arguments);
    };
    if (typeof window !== "undefined") {
        window._ = translate;
    }

    const hedgehog_observation = {

        today_map: null,
        today_log_id: null,
        today_extras: {},
        allow_custom_date: false,
        history_mode: false,
        history_map: {},
        history_selected_id: null,
        is_mobile: false,
        state_restored: false,

        storage_key: function() {
            let aid = controller.animal ? controller.animal.ID : "unknown";
            let prefix = this.history_mode ? "hedgehog_observation_history" : "hedgehog_observation";
            return prefix + ":" + aid;
        },

        save_state: function() {
            try {
                let state = {};
                $(".widget, .hhog-store").each(function(){
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
                $(".widget, .hhog-store").each(function(){
                    let k = $(this).attr("data-name");
                    if (!k) { return; }
                    if (state.hasOwnProperty(k)) { $(this).val(state[k]); }
                });
                sessionStorage.removeItem(this.storage_key());
                this.state_restored = true;
            } catch(e) { /* ignore parse/storage errors */ }
        },

        default_datetime_values: function() {
            let base = controller.defaultlogdatetime || (controller.recent && controller.recent.DATE) || null;
            let dateValue = base ? format.date(base) : format.date(new Date());
            let timeValue = base ? format.time(base) : format.time_now();
            if (!timeValue) { timeValue = format.time_now(); }
            return { date: dateValue, time: timeValue };
        },

        render: function() {
            const ho = this;
            let a = controller.animal;
            const historyRows = Array.isArray(controller.history) ? controller.history : [];
            this.history_mode = !!controller.history_mode;
            this.allow_custom_date = !!controller.allow_custom_date;
            this.history_map = {};
            this.history_selected_id = null;
            const effectiveToday = this.history_mode ? null : controller.today;
            this.today_map = effectiveToday ? this.parse_observation_map(effectiveToday.COMMENTS) : null;
            this.today_log_id = effectiveToday ? effectiveToday.LOGID : null;
            this.today_extras = {};
            this.is_mobile = !!controller.is_mobile;
            this.state_restored = false;

            let h = [ html.content_header(translate("Daily Observation")) ];

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
            h.push('.hhog-field-label{display:flex;align-items:center;gap:6px;font-size:0.78rem;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#475569;margin-bottom:8px;}');
            h.push('.hhog-field input,.hhog-field select{width:100%;font-size:0.95rem;}');
            h.push('.hhog-help-icon{background:none;border:0;padding:0;margin:0 0 0 4px;cursor:pointer;}');
            h.push('.hhog-help-icon .asm-icon{font-size:0.95rem;}');
            h.push('.hhog-help-tooltip{max-width:280px;font-size:0.9rem;line-height:1.4;}');
            h.push('.hhog-help-tooltip-content p{margin:0.2rem 0;}');
            h.push('.hhog-help-tooltip-content a{color:#2563eb;font-weight:600;text-decoration:none;}');
            h.push('.hhog-help-tooltip-content a:hover{text-decoration:underline;}');
            h.push('.hhog-help-chart{max-width:240px;margin-top:0.5rem;border-radius:6px;box-shadow:0 6px 18px rgba(15,23,42,0.18);}');
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
            h.push('.hhog-doc-button{white-space:nowrap;}');
            h.push('.hhog-schedule{display:flex;flex-wrap:wrap;gap:16px;margin-top:20px;}');
            h.push('.hhog-schedule .hhog-field{flex:1 1 200px;}');
            h.push('.hhog-schedule-note{margin-top:18px;color:#475569;font-size:0.9rem;}');
            h.push('.hhog-history{margin-top:12px;}');
            h.push('.hhog-history-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}');
            h.push('.hhog-history-title{font-weight:700;font-size:1.05rem;color:#1f2937;}');
            h.push('.hhog-history-reset{display:inline-flex;gap:6px;align-items:center;padding:6px 12px;border-radius:999px;background:#e0f2fe;color:#1d4ed8;border:none;font-size:0.85rem;font-weight:600;cursor:pointer;}');
            h.push('.hhog-history-reset:hover{background:#bfdbfe;}');
            h.push('.hhog-history-list{list-style:none;margin:0;padding:0;}');
            h.push('.hhog-history-item{border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;margin-bottom:8px;background:#f8fafc;cursor:pointer;transition:background .2s,border-color .2s,box-shadow .2s;}');
            h.push('.hhog-history-item:hover{background:#fff;border-color:#3b82f6;box-shadow:0 10px 24px rgba(59,130,246,0.14);}');
            h.push('.hhog-history-item.active{border-color:#2563eb;background:#eff6ff;box-shadow:0 0 0 2px rgba(37,99,235,0.22);}');
            h.push('.hhog-history-item-title{font-weight:600;color:#1f2937;margin-bottom:2px;}');
            h.push('.hhog-history-item-meta{font-size:0.85rem;color:#475569;}');
            h.push('.hhog-history-empty{font-size:0.93rem;color:#475569;background:#f1f5f9;border-radius:12px;padding:16px;}');
            h.push('.hhog-history-item span.asm-icon{margin-right:6px;}');
            h.push('.hhog-history-item-meta span{display:block;}');
            h.push('@media (max-width:780px){.hhog-hero{gap:16px;}.hhog-hero-thumb img{width:96px;height:96px;}.hhog-card{padding:18px;}.asm-hhog-observation{padding:22px;}.hhog-actions{flex-direction:column;}.hhog-banner{flex-direction:column;align-items:flex-start;}.hhog-checkbox-group{flex-direction:column;}.hhog-schedule{flex-direction:column;}.hhog-history-header{flex-direction:column;align-items:flex-start;gap:8px;}.hhog-history-reset{align-self:flex-start;}}');
            h.push('</style>');

            const slugify = function(value) {
                return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
            };
            const docsBase = "static/custom/processes/weight-gaining.html";
            const baseLinkText = translate("Open detailed guidance");
            const pooChartImg = '<img src="static/custom/processes/images/poo_chart_wg.jpg" alt="' + html.title(translate("Poo consistency reference chart")) + '" class="hhog-help-chart" />';
            const helpConfig = {
                "weight": { summary: translate("Enter today's weight in grams only (numbers). Pair the reading with a photo."), anchor: "#field-weight" },
                "eaten": { summary: translate("Use the dropdown to record how much was eaten."), anchor: "#field-eaten" },
                "poo-inspection": { summary: translate("Rate the stool consistency from 1 (hard pellets) to 7 (fully liquid)."), anchor: "#field-poo", extra: pooChartImg },
                "unusual-symptoms": { summary: translate("Log anything that looks out of the ordinary. Leave blank if nothing to report."), anchor: "#field-unusual" },
                "medication": { summary: translate("Record the medication name and dose if anything was given; leave blank otherwise."), anchor: "#field-medication" },
                "drunk": { summary: translate("Use the dropdown to show how much water the animal drank."), anchor: "#field-drunk" },
                "toilet": { summary: translate("Record whether urine, faeces, or both were observed."), anchor: "#field-toilet" }
            };
            const buildFieldLabel = function(fieldName) {
                const label = html.title(fieldName);
                const slug = slugify(fieldName);
                const info = helpConfig[slug];
                if (!info) {
                    return '<label class="hhog-field-label">' + label + '</label>';
                }
                const summary = info.summary;
                const url = docsBase + info.anchor;
                info.url = url;
                const tooltipParts = [
                    '<div class="hhog-help-tooltip-content">',
                    '<p>' + html.title(summary) + '</p>'
                ];
                if (info.extra) {
                    tooltipParts.push(info.extra);
                }
                tooltipParts.push('<p><a href="' + url + '" target="_blank" rel="noopener">' + html.title(baseLinkText) + '</a></p>');
                tooltipParts.push('</div>');
                info.tooltip = tooltipParts.join("");
                const aria = translate("View help for {0}").replace("{0}", fieldName);
                const icon = '<button type="button" class="hhog-help-icon" data-help-key="' + slug + '" aria-label="' + html.title(aria) + '" title="' + html.title(summary) + '">' + html.icon("help") + '</button>';
                return '<label class="hhog-field-label">' + label + icon + '</label>';
            };

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
            if (!controller.animal) {
                h.push('<div class="hhog-card asm-main-section">');
                h.push('<div class="asm-field">');
                h.push('<label class="asm-label" for="animal">' + translate("Animal") + '</label>');
                h.push('<input id="animal" type="hidden" class="asm-animalchooser"' + chooserValueAttr + ' />');
                h.push('</div></div>');
            }
            else {
                h.push('<input id="animal" type="hidden" class="asm-animalchooser"' + chooserValueAttr + ' />');
            }

            if (!this.history_mode && controller.today && a) {
                let stamp = format.date(controller.today.DATE) + ' ' + format.time(controller.today.DATE);
                let by = controller.today.BY ? html.title(controller.today.BY) : translate("Unknown");
                h.push('<div class="hhog-banner hhog-banner-update">');
                h.push('<span class="asm-icon asm-icon-info hhog-banner-icon"></span>');
                h.push('<div><div class="hhog-banner-title">' + translate("Updating today's observation") + '</div>');
                h.push('<div class="hhog-banner-note">' + common.substitute(translate("Last recorded {0} by {1}. Saving will update the same log entry."), { "0": html.title(stamp), "1": by }) + '</div></div></div>');
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
                    h.push('<div><div class="hhog-banner-title">' + translate("Last observation") + '</div>');
                    h.push('<div class="hhog-banner-note">' + common.substitute(translate("Recorded at {0} with: {1}"), { "0": html.title(d), "1": html.title(parts.join(' | ')) }) + '</div></div></div>');
                }
            }

            const weightGainerFieldNames = Array.isArray(controller.weight_gainer_fields) ? controller.weight_gainer_fields : [];
            const weightLookup = {};
            $.each(weightGainerFieldNames, function(_, nm) {
                if (!nm) { return; }
                weightLookup[$.trim(String(nm)).toLowerCase()] = true;
            });
            let weightFilterActive = !!controller.weight_gainer_mode && Object.keys(weightLookup).length > 0;

            const rawFieldDefs = [];
            for (let i = 0; i < 50; i++) {
                let name = config.str("Behave" + i + "Name");
                if (!name) { continue; }
                rawFieldDefs.push({
                    idx: i,
                    name: name,
                    values: config.str("Behave" + i + "Values"),
                    required: config.str("Behave" + i + "Required").toLowerCase() === "yes",
                    range: config.str("Behave" + i + "Range")
                });
            }

            let fieldDefs = rawFieldDefs;
            if (weightFilterActive) {
                fieldDefs = rawFieldDefs.filter(function(def) {
                    return weightLookup[$.trim(String(def.name)).toLowerCase()];
                });
                if (fieldDefs.length === 0) {
                    weightFilterActive = false;
                    fieldDefs = rawFieldDefs;
                }
            }

            let fields = [], meta = [];
            $.each(fieldDefs, function(_, def) {
                meta.push({ idx: def.idx, name: def.name, required: def.required, range: def.range });
                const label = buildFieldLabel(def.name);
                if (def.values) {
                    fields.push('<div class="hhog-field">' + label + '<select class="asm-selectbox widget" data-index="' + def.idx + '" data-name="' + html.title(def.name) + '"><option value=""></option>' + html.list_to_options(def.values.split("|")) + '</select></div>');
                }
                else {
                    fields.push('<div class="hhog-field">' + label + '<input type="text" class="asm-textbox widget" data-index="' + def.idx + '" data-name="' + html.title(def.name) + '" /></div>');
                }
            });

            const ensureBinaryField = function(label) {
                const lower = (label || "").toLowerCase();
                const exists = meta.some(function(m){ return (m.name || m.label || "").toLowerCase() === lower; });
                if (exists) { return; }
                const idx = "extra-" + lower.replace(/[^a-z0-9]+/g, "-");
                const labelMarkup = buildFieldLabel(label);
                const options = [
                    '<option value=""></option>',
                    '<option value="Yes">' + translate("Yes") + '</option>',
                    '<option value="No">' + translate("No") + '</option>'
                ].join("");
                fields.push('<div class="hhog-field">' + labelMarkup + '<select class="asm-selectbox widget" data-index="' + idx + '" data-name="' + html.title(label) + '">' + options + '</select></div>');
                meta.push({ idx: idx, name: label, required: false, range: "" });
            };

            if (!weightFilterActive) {
                ensureBinaryField("Poo Sample Taken?");
                ensureBinaryField("Clinician Alerted?");
            }

            h.push('<div class="asm-main-section asm-hhog-observation">');
            if (this.allow_custom_date) {
                const datetimeDefaults = this.default_datetime_values();
                const dateDefault = datetimeDefaults.date || "";
                const timeDefault = datetimeDefaults.time || "";
                h.push('<div class="hhog-schedule-note">' + translate("Choose the observation date and optional time before entering values below.") + '</div>');
                h.push('<div class="hhog-schedule">');
                h.push('<div class="hhog-field"><label class="hhog-field-label" for="log-date">' + translate("Observation date") + '</label><input id="log-date" type="text" class="asm-textbox asm-datebox hhog-store" data-name="__logdate__" value="' + html.title(dateDefault) + '" /></div>');
                h.push('<div class="hhog-field"><label class="hhog-field-label" for="log-time">' + translate("Observation time") + '</label><input id="log-time" type="text" class="asm-textbox asm-timebox hhog-store" data-name="__logtime__" value="' + html.title(timeDefault) + '" placeholder="' + html.title(translate("Optional")) + '" /></div>');
                h.push('</div>');
            }
            h.push('<div class="hhog-grid">' + fields.join("\n") + '</div>');
            h.push('<div id="poo-confirm" class="hhog-confirm"></div>');
            h.push('<div id="clinician-confirm" class="hhog-confirm"></div>');
            h.push('<div class="hhog-actions">');
            h.push('<button id="button-save" class="asm-mobile-full">' + translate("Save") + '</button>');
            if (a) {
                h.push('<button id="button-photo" class="asm-mobile-full">' + translate("Attach Photo") + '</button>');
                h.push('<button id="button-docs" class="asm-mobile-full hhog-doc-button">' + translate("Open Help Guide") + '</button>');
            }
            h.push('</div></div>');

            if (a) {
                h.push('<div id="dialog-photo" style="display:none" title="' + html.title(translate("Attach Photo")) + '">');
                h.push('<form id="photoform" method="post" enctype="multipart/form-data" action="media">');
                h.push('<input type="hidden" name="mode" value="create" />');
                h.push('<input type="hidden" name="linkid" value="' + a.ID + '" />');
                h.push('<input type="hidden" name="linktypeid" value="0" />');
                h.push('<input type="hidden" name="controller" value="hedgehog_observation" />');
                h.push('<p><input type="file" name="filechooser" accept="image/*" class="asm-textbox" /></p>');
                h.push('</form></div>');
            }

            if (this.allow_custom_date && a) {
                h.push('<div class="hhog-card hhog-history">');
                h.push('<div class="hhog-history-header">');
                h.push('<div class="hhog-history-title">' + translate("Historical observations") + '</div>');
                if (historyRows.length) {
                    h.push('<button id="hhog-history-reset" type="button" class="hhog-history-reset"><span class="asm-icon asm-icon-refresh"></span>' + translate("Start new entry") + '</button>');
                }
                h.push('</div>');
                const metaOrder = (meta || []).map(function(m){ return html.title(m.name); });
                if (historyRows.length) {
                    h.push('<ul class="hhog-history-list" id="hhog-history-list">');
                    $.each(historyRows, function(_, rec) {
                        if (!rec) { return; }
                        let map = ho.parse_observation_map(rec.COMMENTS);
                        ho.history_map[String(rec.ID)] = { record: rec, map: map };
                        let when = format.date(rec.DATE);
                        let whenTime = format.time(rec.DATE);
                        let identifier = html.title(String(rec.ID));
                        h.push('<li class="hhog-history-item" data-logid="' + identifier + '">');
                        let heading = when ? when : translate("Unknown date");
                        if (whenTime) {
                            heading += ' ' + translate("at") + ' ' + whenTime;
                        }
                        h.push('<div class="hhog-history-item-title">' + html.title(heading) + '</div>');
                        let rendered = [];
                        const renderedKeys = {};
                        $.each(metaOrder, function(_, label){
                            const matchKey = Object.keys(map).find(function(k){ return (k || "").toLowerCase() === label.toLowerCase(); });
                            if (matchKey && map[matchKey]) {
                                rendered.push({ key: matchKey, value: map[matchKey] });
                                renderedKeys[matchKey.toLowerCase()] = true;
                            }
                        });
                        $.each(map, function(key, value){
                            if (!value) { return; }
                            if (renderedKeys[key.toLowerCase()]) { return; }
                            rendered.push({ key: key, value: value });
                        });
                        if (rendered.length) {
                            h.push('<div class="hhog-history-item-meta">');
                            $.each(rendered, function(ix, entry){
                                h.push('<span>' + html.title(entry.key) + ': ' + html.title(entry.value) + '</span>');
                            });
                            h.push('</div>');
                        }
                        else {
                            h.push('<div class="hhog-history-item-meta">' + translate("No details recorded.") + '</div>');
                        }
                        h.push('</li>');
                    });
                    h.push('</ul>');
                }
                else {
                    h.push('<div class="hhog-history-empty">' + translate("No historical observations recorded yet.") + '</div>');
                }
                h.push('</div>');
            }

            h.push(html.content_footer());
            this.help_config = helpConfig;
            this.help_docs_base = docsBase;
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
                    '<div class="hhog-alert-heading">' + translate("No faeces or no sign of animal recorded") + '</div>',
                    '<p class="hhog-alert-copy">' + translate("Please notify the clinician and confirm before saving.") + '</p>',
                    '<div class="hhog-pill-row">' + chips + '</div>',
                    '<label class="hhog-checkbox"><input type="checkbox" id="clinician-notify" /> ' + translate("I have notified the clinician") + '</label>'
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

        reset_history_selection: function(showMessage) {
            const ho = this;
            ho.history_selected_id = null;
            ho.today_log_id = null;
            ho.today_map = null;
            ho.today_extras = {};
            $(".hhog-history-item").removeClass("active");
            $(".widget").each(function() {
                $(this).val("").trigger("change");
            });
            if (ho.allow_custom_date) {
                const defaults = ho.default_datetime_values();
                $("#log-date").val(defaults.date || "");
                $("#log-time").val(defaults.time || "");
            }
            if (ho.history_mode) {
                $("#button-save").button("option", "label", translate("Save Historical Observation"));
            }
            if (showMessage !== false && ho.history_mode && controller.animal && controller.animal.ANIMALNAME) {
                header.show_info(translate("Entering a new historical observation for {0}.").replace("{0}", html.title(controller.animal.ANIMALNAME)));
            }
        },

        load_history_entry: function(logid) {
            const ho = this;
            if (!logid || !ho.history_map || !ho.history_map.hasOwnProperty(logid)) { return; }
            const entry = ho.history_map[logid];
            const rec = entry && entry.record ? entry.record : entry;
            if (!rec) { return; }
            const map = entry && entry.map ? entry.map : ho.parse_observation_map(rec.COMMENTS);
            ho.today_log_id = rec.ID;
            ho.today_map = map;
            ho.today_extras = {};
            ho.history_selected_id = logid;
            $(".hhog-history-item").removeClass("active");
            $(".hhog-history-item[data-logid='" + logid + "']").addClass("active");
            const extras = {};
            $(".widget").each(function() {
                const widget = $(this);
                const nm = widget.attr("data-name");
                let applied = false;
                $.each(map, function(key, value) {
                    if (!key || applied) { return; }
                    if (key === nm) {
                        widget.val(value).trigger("change");
                        applied = true;
                    }
                });
                if (!applied && nm) {
                    widget.val("").trigger("change");
                }
            });
            $.each(map, function(key, value) {
                if (!key) { return; }
                const widgets = $(".widget").filter(function(){ return $(this).attr("data-name") === key; });
                if (!widgets.length) {
                    extras[key] = value;
                }
            });
            ho.today_extras = extras;
            if (ho.allow_custom_date && rec.DATE) {
                $("#log-date").val(format.date(rec.DATE) || "");
                $("#log-time").val(format.time(rec.DATE) || "");
            }
            if (ho.history_mode) {
                $("#button-save").button("option", "label", translate("Update Historical Observation"));
            }
            if (controller.animal && controller.animal.ANIMALNAME) {
                const ts = format.date(rec.DATE) + (format.time(rec.DATE) ? " " + format.time(rec.DATE) : "");
                header.show_info(translate("Editing observation from {0} for {1}.").replace("{0}", html.title(ts)).replace("{1}", html.title(controller.animal.ANIMALNAME)));
            }
        },

        bind: function() {
            const ho = hedgehog_observation;
            const endpointUrl = controller.endpoint || "hedgehog_observation";
            if (ho.allow_custom_date) {
                $("#log-date").date();
                $("#log-time").time();
            }
            const chooser = $("#animal");
            chooser.animalchooser();
            chooser.off("animalchooserchange").on("animalchooserchange", function(event, rec) {
                if (rec && rec.ID) {
                    if (controller.animal && String(controller.animal.ID) === String(rec.ID)) { return; }
                    const target = ho.history_mode ? "hedgehog_observation_history" : "hedgehog_observation";
                    common.route(target + "?animalid=" + rec.ID);
                }
            });

            if (!controller.animal) {
                $(".widget").prop("disabled", true);
                if (ho.allow_custom_date) {
                    $("#log-date, #log-time").prop("disabled", true);
                }
            }
            else {
                chooser.val(controller.animal.ID || "");
                if (ho.allow_custom_date) {
                    $("#log-date, #log-time").prop("disabled", false);
                }
                ho.restore_state();
                if (!ho.state_restored && ho.today_map) {
                    const extras = {};
                    const skipExtras = ["take poo sample", "notify clinician", "poo sample taken?", "clinician alerted?"];
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
                if (ho.history_mode) {
                    $("#button-save").button("option", "label", translate("Save Historical Observation"));
                }
                if (!ho.history_mode && ho.today_log_id) {
                    $("#button-save").button("option", "label", translate("Update Observation"));
                }
            const helpInfoMap = ho.help_config || {};
            if ($.fn.tooltip) {
                $(".hhog-help-icon").tooltip({
                    items: ".hhog-help-icon",
                    content: function() {
                        const slug = $(this).data("help-key");
                        const info = helpInfoMap[slug];
                        return info && info.tooltip ? info.tooltip : "";
                    },
                    tooltipClass: "hhog-help-tooltip",
                    track: true,
                    position: { my: "left+10 top+10", at: "right top" }
                });
            }
            $(".hhog-help-icon").attr("tabindex", "0").off("click").on("click", function(event) {
                event.preventDefault();
                const slug = $(this).data("help-key");
                if ($.fn.tooltip) {
                    try { $(this).tooltip("close"); } catch (e) {}
                }
                const info = helpInfoMap[slug];
                if (info && info.url) {
                    window.open(info.url, "_blank", "noopener");
                }
            }).off("keydown").on("keydown", function(event) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    $(this).trigger("click");
                }
            });
            if (ho.allow_custom_date) {
                $("#hhog-history-reset").off("click").on("click", function() {
                    ho.reset_history_selection();
                });
                $("#hhog-history-list").off("click", ".hhog-history-item").on("click", ".hhog-history-item", function() {
                    const logId = String($(this).attr("data-logid"));
                    ho.load_history_entry(logId);
                });
                if (ho.history_mode && !ho.state_restored && controller.animal) {
                    ho.reset_history_selection(false);
                }
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
                const removeMany = function(list, labels) {
                    let updated = list;
                    $.each(labels || [], function(_, label) {
                        updated = removeKey(updated, label);
                    });
                    return updated;
                };
                const findMapKey = function(labels) {
                    const items = Array.isArray(labels) ? labels : [labels];
                    let found = null;
                    $.each(items, function(_, label) {
                        if (found) { return false; }
                        const key = Object.keys(map).find(function(k){ return (k || "").toLowerCase() === String(label).toLowerCase(); });
                        if (key) { found = key; }
                    });
                    return found;
                };
                const findWidgetForLabels = function(labels) {
                    const items = Array.isArray(labels) ? labels : [labels];
                    let found = $();
                    $.each(items, function(_, label) {
                        const candidate = $(".widget").filter(function(){ return ($(this).attr("data-name") || "").toLowerCase() === String(label).toLowerCase(); }).first();
                        if (candidate && candidate.length) {
                            found = candidate;
                            return false;
                        }
                    });
                    return found;
                };
                const sampleFieldLabels = ["Poo Sample Taken?", "Take poo sample"];
                const clinicianFieldLabels = ["Clinician Alerted?", "Notify clinician"];

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
                if (!valid) { header.show_error(translate("Please fix highlighted fields.")); return; }

                let triggers = [];
                if (!controller.weight_gainer_mode) {
                    const f = function(label){ return findMapKey(label); };
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
                }

                if (controller.weight_gainer_mode) {
                    $("#poo-confirm").hide().empty();
                    ho.clear_clinician_confirm();
                }
                else if (ho.history_mode) {
                    $("#poo-confirm").hide().empty();
                    ho.clear_clinician_confirm();
                }
                else {
                    if (!triggers.length && $("#poo-confirm").is(":visible")) {
                        $("#poo-confirm").hide().empty();
                    }
                    else if (triggers.length) {
                        $(".widget").each(function(){
                            if (triggers.indexOf($(this).attr("data-name")) !== -1) {
                                $(this).closest(".hhog-field").addClass("hhog-field-alert");
                            }
                        });
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
                            header.show_info(translate("Please confirm clinician notification before saving."));
                            return;
                        }
                        if (!$("#clinician-notify").is(":checked")) {
                            header.show_error(translate("Please confirm clinician notification before saving."));
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
                            '<div class="hhog-alert-heading">' + translate("Poo sample requested") + '</div>',
                            '<p class="hhog-alert-copy">' + translate("The following fields triggered a poo sample check:") + '</p>',
                            '<div class="hhog-pill-row">' + chips + '</div>',
                            '<div class="hhog-checkbox-group">',
                            '<label class="hhog-checkbox"><input type="radio" name="poosample" value="Yes" /> ' + translate("Take poo sample now") + '</label>',
                            '<label class="hhog-checkbox"><input type="radio" name="poosample" value="No" /> ' + translate("Do not take a poo sample") + '</label>',
                            '</div>'
                        ];
                        $("#poo-confirm").html(pc.join("")).show();
                        header.show_info(translate("Please confirm poo sample before saving."));
                        return; // Block this save; user must confirm Yes/No
                    }

                    if ($("#poo-confirm").is(":visible")) {
                        let v = $("input[name=poosample]:checked").val();
                        if (!v) { header.show_error(translate("Please select Yes or No for poo sample.")); return; }
                        const sampleWidget = findWidgetForLabels(sampleFieldLabels);
                        if (sampleWidget && sampleWidget.length) {
                            sampleWidget.val(v).trigger("change");
                            const label = sampleWidget.attr("data-name");
                            map[label] = v;
                            avs = removeMany(avs, sampleFieldLabels.concat([label]));
                            avs.push(label + "=" + v);
                        }
                        else {
                            avs = removeMany(avs, sampleFieldLabels);
                            const label = sampleFieldLabels[0];
                            map[label] = v;
                            avs.push(label + "=" + v);
                        }
                    }

                    const clinicianWidget = findWidgetForLabels(clinicianFieldLabels);
                    if (!clinicianConfirmed && clinicianWidget && clinicianWidget.length) {
                        clinicianWidget.val("").trigger("change");
                        const label = clinicianWidget.attr("data-name");
                        avs = removeMany(avs, clinicianFieldLabels.concat([label]));
                    }
                    else if (!clinicianConfirmed) {
                        avs = removeMany(avs, clinicianFieldLabels);
                    }
                    if (clinicianConfirmed) {
                        if (clinicianWidget && clinicianWidget.length) {
                            clinicianWidget.val("Yes").trigger("change");
                            const label = clinicianWidget.attr("data-name");
                            map[label] = "Yes";
                            avs = removeMany(avs, clinicianFieldLabels.concat([label]));
                            avs.push(label + "=Yes");
                        }
                        else {
                            avs = removeMany(avs, clinicianFieldLabels);
                            const label = clinicianFieldLabels[0];
                            map[label] = "Yes";
                            avs.push(label + "=Yes");
                        }
                    }
                }

                if (ho.today_extras && Object.keys(ho.today_extras).length) {
                    $.each(ho.today_extras, function(extraKey, extraValue) {
                        avs = removeKey(avs, extraKey);
                        avs.push(extraKey + "=" + extraValue);
                    });
                }

                if (avs.length === 0) {
                    header.show_error(translate("Please enter at least one observation value."));
                    return;
                }

                let logIso = null;
                if (ho.allow_custom_date) {
                    const dateVal = $("#log-date").val();
                    if (!dateVal) {
                        header.show_error(translate("Please choose an observation date."));
                        $("#log-date").closest(".hhog-field").addClass("hhog-field-error");
                        return;
                    }
                    logIso = format.date_iso(dateVal);
                    if (!logIso) {
                        header.show_error(translate("Observation date format is invalid."));
                        $("#log-date").closest(".hhog-field").addClass("hhog-field-error");
                        return;
                    }
                    const timeVal = $("#log-time").val();
                    if (timeVal) {
                        logIso = format.date_iso_settime(logIso, timeVal);
                    }
                    else {
                        logIso = format.date_iso_settime(logIso, "12:00:00");
                    }
                }

                let packed = controller.animal.ID + "==" + avs.join(", ");
                // Use the configured log type from Options -> Daily Observations
                let formdata = { "mode": "save", "logtype": config.str("BehaveLogType"), "logs": packed };
                if (ho.today_log_id) { formdata.updatelogid = ho.today_log_id; }
                if (logIso) { formdata.logdatetime = logIso; }
                $(".asm-content button").button("disable");
                header.show_loading(translate("Saving..."));
                let response;
                try {
                    response = await common.ajax_post(endpointUrl, formdata);
                }
                finally {
                    header.hide_loading();
                    $(".asm-content button").button("enable");
                }
                let msg;
                if (controller.animal && controller.animal.ANIMALNAME) {
                    if (ho.history_mode) {
                        let tmpl = ho.today_log_id ? translate("Historical observation updated for {0}.") : translate("Historical observation saved for {0}.");
                        msg = tmpl.replace("{0}", html.title(controller.animal.ANIMALNAME));
                    }
                    else {
                        let tmpl = ho.today_log_id ? translate("Observation updated for {0}.") : translate("Observation saved for {0}.");
                        msg = tmpl.replace("{0}", html.title(controller.animal.ANIMALNAME));
                    }
                }
                else {
                    msg = translate("{0} observation logs successfully written.").replace("{0}", response);
                }
                header.show_info(msg, 5000);
                if (ho.history_mode) {
                    setTimeout(function() {
                        window.location.reload();
                    }, 900);
                    return;
                }
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
                    buttons: (function(){ let b={}; b[translate("Upload")] = function(){ $("#photoform").submit(); }; b[translate("Cancel")] = function(){ $(this).dialog("close"); }; return b; })(),
                    show: dlgfx.add_show, hide: dlgfx.add_hide
                });
                $("#button-photo").button().off("click").on("click", () => { ho.save_state(); $("#dialog-photo").dialog("open"); });
                $("#button-docs").button().off("click").on("click", () => {
                    const url = (ho.help_docs_base || "static/custom/processes/weight-gaining.html") + "#field-guidance";
                    window.open(url, "_blank", "noopener");
                });
            }
        },

        sync: function() {},
        destroy: function() {},
        name: "hedgehog_observation",
        animation: "book",
        title: function() { return translate("Daily Observation"); },
        routes: {
            "hedgehog_observation": function() { common.module_loadandstart("hedgehog_observation", "hedgehog_observation?" + this.rawqs); },
            "hedgehog_observation_history": function() { common.module_loadandstart("hedgehog_observation", "hedgehog_observation_history?" + this.rawqs); }
        }
    };

    common.module_register(hedgehog_observation);

});
