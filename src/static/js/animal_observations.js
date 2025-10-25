/*global $, jQuery, _, asm, common, config, controller, dlgfx, edit_header, format, header, html, tableform, validate */

$(function() {

    "use strict";

    const animal_observations = {

        behave_meta: [],
        animal_map: {},
        today_lookup: null,
        history_lookup: null,

        render: function() {

            this.today_lookup = null;
            this.history_lookup = null;

            // Remove empty internal locations and include counts
            let locs = [];
            $.each(controller.internallocations, function(i, v) {
                v.DISPLAY = _("{0} ({1})").replace("{0}", v.LOCATIONNAME).replace("{1}", v.TOTAL);
                if (v.TOTAL > 0) { locs.push(v); }
            });
            controller.internallocations = locs;

            // Header text with today's date if supplied
            let headerTitle = _("Daily Observations");
            if (controller.todaydate) {
                try {
                    headerTitle = _("Daily observations for {0}").replace("{0}", format.date(controller.todaydate));
                }
                catch (ex) {
                    headerTitle = _("Daily Observations");
                }
            }

            // Record metadata about configured behaviour fields
            let colnames = [], colwidgets = [], meta = [];
            for (let i = 0; i < 50; i++) {
                let name = config.str("Behave" + i + "Name"),
                    values = config.str("Behave" + i + "Values"),
                    required = config.str("Behave" + i + "Required"),
                    range = config.str("Behave" + i + "Range");
                if (!name) { continue; }
                let dataName = html.title(name);
                meta.push({
                    idx: i,
                    label: name,
                    dataName: dataName,
                    required: (required || "").toLowerCase() === "yes",
                    range: range || ""
                });
                colnames.push(name);
                if (values) {
                    colwidgets.push('<select class="asm-selectbox asm-halfselectbox widget" data-name="' + dataName + '" data-index="' + i + '">' +
                        '<option value=""></option>' + html.list_to_options(values.split("|")) + '</select>');
                }
                else {
                    colwidgets.push('<input type="text" class="asm-textbox widget" data-name="' + dataName + '" data-index="' + i + '" />');
                }
            }
            const ensureBinaryField = function(label) {
                const lower = (label || "").toLowerCase();
                const exists = meta.some(function(entry){ return (entry.label || "").toLowerCase() === lower; });
                if (exists) { return; }
                const idx = "extra-" + lower.replace(/[^a-z0-9]+/g, "-");
                const dataName = html.title(label);
                meta.push({
                    idx: idx,
                    label: label,
                    dataName: dataName,
                    required: false,
                    range: ""
                });
                colnames.push(label);
                const yesNoOptions = '<option value=""></option><option value="Yes">' + _("Yes") + '</option><option value="No">' + _("No") + '</option>';
                colwidgets.push('<select class="asm-selectbox asm-halfselectbox widget" data-name="' + dataName + '" data-index="' + idx + '">' + yesNoOptions + '</select>');
            };

            ensureBinaryField("Poo Sample Taken?");
            ensureBinaryField("Clinician Alerted?");
            animal_observations.behave_meta = meta;

            // Map animal ids for quick lookup later
            animal_observations.animal_map = {};
            $.each(controller.animals, function(i, a) {
                animal_observations.animal_map[a.ID] = a;
            });
            let h = [
                html.content_header(headerTitle),
                tableform.buttons_render([
                    { type: "raw", markup: '<button id="button-selectall">' + _("Select all") + '</button>' },
                    { type: "raw", markup: '<button id="button-history">' + _("Enter historical observations") + '</button>' },
                    { id: "save", icon: "save", tooltip: _("Write observation logs for all selected rows") },
                    { id: "location", type: "dropdownfilter", options: html.list_to_options(controller.internallocations, "ID", "DISPLAY") }
                ]),
                '<table class="asm-daily-observations">'
            ];

            // Table headings
            h.push('<thead><tr><th>' + _("Animal") + '</th><th>' + _("Unit") + '</th>');
            $.each(colnames, function(i, v) {
                h.push('<th>' + v + '</th>');
            });
            h.push('</tr></thead>');

            // Rows for each on-shelter animal
            h.push('<tbody>');
            $.each(controller.animals, function(i, a) {
                if (a.ACTIVEMOVEMENTTYPE) { return; } // Only animals currently on shelter
                h.push('<tr data-animalid="' + a.ID + '" data-locationid="' + a.SHELTERLOCATION + '" style="display: none">');
                h.push('<td><input type="checkbox" class="asm-checkbox selector" /> ');
                h.push(html.animal_link(a, { emblemsright: true, newtab: true }));
                h.push('</td>');
                h.push('<td>' + common.nulltostr(a.SHELTERLOCATIONUNIT) + '</td>');
                $.each(colwidgets, function(ix, widgetMarkup) {
                    h.push('<td class="centered">' + widgetMarkup + '</td>');
                });
                h.push('</tr>');
            });
            h.push('</tbody></table>');
            h.push(html.content_footer());
            return h.join("\n");
        },

        ensure_dialog_shells: function() {
            if (!$("#dialog-poo-confirm").length) {
                $("body").append('<div id="dialog-poo-confirm" style="display:none"></div>');
            }
            if (!$("#dialog-clinician-confirm").length) {
                $("body").append('<div id="dialog-clinician-confirm" style="display:none"></div>');
            }
        },

        parse_observation_map: function(comments) {
            let map = {};
            if (!comments) { return map; }
            try {
                $.each(comments.split(','), function(i, part) {
                    let pieces = part.split('=');
                    if (pieces.length >= 2) {
                        let key = $.trim(pieces[0]);
                        let val = $.trim(pieces.slice(1).join('='));
                        map[key] = val;
                    }
                });
            } catch (ex) {}
            return map;
        },

        find_map_key: function(map, label) {
            if (!map || !label) { return null; }
            let target = $.trim(label).toLowerCase();
            let match = null;
            $.each(map, function(k) {
                if ($.trim(k || "").toLowerCase() === target) {
                    match = k;
                    return false;
                }
            });
            return match;
        },

        remove_key: function(list, key) {
            if (!list || !key) { return list || []; }
            let target = $.trim(key).toLowerCase();
            return $.grep(list, function(item) {
                if (item.indexOf("=") === -1) { return true; }
                let lhs = $.trim(item.split("=", 1)[0]).toLowerCase();
                return lhs !== target;
            });
        },

        build_today_lookup: function() {
            const lookup = {};
            const idlist = Array.isArray(controller.todayids) ? controller.todayids : [];
            if (Array.isArray(controller.todaylogs)) {
                $.each(controller.todaylogs, function(_, entry) {
                    if (!entry) { return; }
                    const aid = parseInt(entry.ANIMALID || entry.animalid || entry.id || 0, 10);
                    if (!aid) { return; }
                    lookup[aid] = entry;
                });
            }
            else if (controller.todaylogs) {
                $.each(controller.todaylogs, function(k, v) {
                    const aid = parseInt(k, 10);
                    if (!isNaN(aid)) { lookup[aid] = v; }
                });
            }
            $.each(controller.animals || [], function(_, a) {
                if (!a || !a.ID || !a.TODAYOBS) { return; }
                lookup[parseInt(a.ID, 10)] = a.TODAYOBS;
            });
            // Ensure placeholders exist for animals with today ids but no comment (fallback for cached data)
            $.each(idlist, function(_, aidRaw) {
                const aid = parseInt(aidRaw, 10);
                if (!aid || lookup[aid]) { return; }
                lookup[aid] = { "ANIMALID": aid, "COMMENTS": "" };
            });
            return lookup;
        },

        build_history_lookup: function() {
            const lookup = {};
            if (controller.historylogs) {
                $.each(controller.historylogs, function(k, v) {
                    const aid = parseInt(k, 10);
                    if (!isNaN(aid) && Array.isArray(v)) { lookup[aid] = v; }
                });
            }
            $.each(controller.animals || [], function(_, a) {
                if (!a || !a.ID || !a.OBSERVATIONHISTORY) { return; }
                lookup[parseInt(a.ID, 10)] = a.OBSERVATIONHISTORY;
            });
            return lookup;
        },

        lookup_entry: function(container, animalid) {
            if (!container) { return null; }
            if (Array.isArray(container)) {
                for (let i = 0; i < container.length; i++) {
                    const entry = container[i];
                    if (!entry) { continue; }
                    const aid = parseInt(entry.ANIMALID || entry.animalid || entry.id || 0, 10);
                    if (aid === animalid) { return entry; }
                }
                return null;
            }
            let key = String(animalid);
            if (Object.prototype.hasOwnProperty.call(container, key)) { return container[key]; }
            if (Object.prototype.hasOwnProperty.call(container, animalid)) { return container[animalid]; }
            return null;
        },

        apply_map_to_row: function(row, map, state) {
            const extras = {};
            const seen = [];
            row.find(".widget").each(function() {
                let widget = $(this);
                let dataName = widget.attr("data-name");
                let key = animal_observations.find_map_key(map, dataName);
                if (key) {
                    widget.val(map[key]);
                    seen.push(key);
                }
            });
            $.each(map, function(k, v) {
                if (seen.indexOf(k) === -1) {
                    extras[k] = v;
                }
            });
            state.extras = extras;
        },

        prefill_existing: function() {
            const ao = animal_observations;
            if (!this.today_lookup) { this.today_lookup = this.build_today_lookup(); }
            if (!this.history_lookup) { this.history_lookup = this.build_history_lookup(); }
            $(".asm-daily-observations tbody tr").each(function() {
                const row = $(this);
                const animalid = parseInt(row.attr("data-animalid"), 10);
                const state = {
                    logid: 0,
                    map: {},
                    extras: {},
                    history: ao.lookup_entry(ao.history_lookup, animalid) || [],
                    animalname: (ao.animal_map[animalid] && ao.animal_map[animalid].ANIMALNAME) || ""
                };
                const todayEntry = ao.lookup_entry(ao.today_lookup, animalid);
                if (todayEntry && todayEntry.COMMENTS) {
                    state.logid = todayEntry.LOGID || todayEntry.ID || 0;
                    state.map = ao.parse_observation_map(todayEntry.COMMENTS);
                    ao.apply_map_to_row(row, state.map, state);
                    row.addClass("asm-has-existing");
                }
                row.attr("data-existing-logid", state.logid || 0);
                row.data("obsState", state);
            });
        },

        change_location: function() {
            $(".asm-daily-observations tbody tr").each(function() {
                $(this).toggle($(this).attr("data-locationid") === $("#location").val());
            });
        },

        value_indicates_none: function(value) {
            if (value === null || value === undefined) { return true; }
            const v = String(value).trim().toLowerCase();
            if (v === "") { return true; }
            if (["none", "no", "absent", "missing", "n/a", "na", "nil", "zero", "0"].indexOf(v) !== -1) { return true; }
            if (v.startsWith("no ") || v.startsWith("none ") || v.indexOf("no sign") !== -1 || v.indexOf("not seen") !== -1 ||
                v.indexOf("no poo") !== -1 || v.indexOf("no faec") !== -1 || v.indexOf("no fec") !== -1) { return true; }
            return false;
        },

        row_name: function(row) {
            const state = row.data("obsState") || {};
            if (state.animalname) { return state.animalname; }
            const aid = parseInt(row.attr("data-animalid"), 10);
            if (animal_observations.animal_map[aid]) {
                return animal_observations.animal_map[aid].ANIMALNAME || "";
            }
            return "";
        },

        request_poo_choice: function(animalName, triggers) {
            return new Promise(function(resolve) {
                const dialog = $("#dialog-poo-confirm");
                let resolved = false;
                const finish = function(val) {
                    if (resolved) { return; }
                    resolved = true;
                    dialog.dialog("close");
                    resolve(val);
                };
                const chips = triggers.map(function(t) { return '<span class="asm-pill">' + html.title(t) + '</span>'; }).join("");
                const markup = [
                    '<div class="asm-dialog-heading">' + _("Poo sample requested") + '</div>',
                    '<p>' + _("The following fields triggered a poo sample check for {0}:").replace("{0}", html.title(animalName || _("this animal"))) + '</p>',
                    '<div class="asm-pill-row">' + chips + '</div>'
                ];
                dialog.html(markup.join(""));
                const buttons = {};
                buttons[_("Take poo sample")] = function() { finish("Yes"); };
                buttons[_("Do not take poo sample")] = function() { finish("No"); };
                buttons[_("Cancel")] = function() { finish(null); };
                dialog.dialog({
                    modal: true,
                    width: 420,
                    dialogClass: "dialogshadow",
                    show: dlgfx.add_show,
                    hide: dlgfx.add_hide,
                    buttons: buttons,
                    close: function() {
                        if (!resolved) { resolve(null); }
                        dialog.dialog("destroy");
                    }
                });
            });
        },

        request_clinician_confirm: function(animalName, triggers) {
            return new Promise(function(resolve) {
                const dialog = $("#dialog-clinician-confirm");
                let resolved = false;
                const finish = function(val) {
                    if (resolved) { return; }
                    resolved = true;
                    dialog.dialog("close");
                    resolve(val);
                };
                const chips = triggers.map(function(t) { return '<span class="asm-pill">' + html.title(t) + '</span>'; }).join("");
                const markup = [
                    '<div class="asm-dialog-heading">' + _("No faeces or no sign of animal recorded") + '</div>',
                    '<p>' + _("Please notify the clinician and confirm before saving.") + '</p>',
                    '<div class="asm-pill-row">' + chips + '</div>',
                    '<label class="asm-dialog-checkbox"><input type="checkbox" id="dialog-clinician-checkbox" /> ' + _("I have notified the clinician") + '</label>',
                    '<div class="asm-dialog-error" style="display:none;color:#cc0000;margin-top:8px;">' + _("Please confirm notification before saving.") + '</div>'
                ];
                dialog.html(markup.join(""));
                const buttons = {};
                buttons[_("Confirm")] = function() {
                    if (!dialog.find("#dialog-clinician-checkbox").is(":checked")) {
                        dialog.find(".asm-dialog-error").show();
                        return;
                    }
                    finish(true);
                };
                buttons[_("Cancel")] = function() { finish(false); };
                dialog.dialog({
                    modal: true,
                    width: 420,
                    dialogClass: "dialogshadow",
                    show: dlgfx.add_show,
                    hide: dlgfx.add_hide,
                    buttons: buttons,
                    close: function() {
                        if (!resolved) { resolve(false); }
                        dialog.dialog("destroy");
                    }
                });
            });
        },

        process_row: async function(row) {
            const ao = animal_observations;
            const state = row.data("obsState") || { extras: {}, history: [], map: {} };
            const meta = ao.behave_meta || [];
            const map = {};
            let avs = [];
            let valid = true;
            let hasValue = false;

            row.removeClass("asm-row-error");
            row.find(".widget").removeClass("ui-state-error");

            row.find(".widget").each(function() {
                const widget = $(this);
                const nm = widget.attr("data-name");
                const idx = widget.attr("data-index");
                const val = widget.val();
                map[nm] = val;
                const metaEntry = meta.find(function(m) { return String(m.idx) === String(idx); });
                if (metaEntry && metaEntry.required && (!val || $.trim(val) === "")) {
                    widget.addClass("ui-state-error");
                    valid = false;
                }
                if (metaEntry && metaEntry.range && val) {
                    let parts = metaEntry.range.split("-");
                    if (parts.length === 2) {
                        let lo = parseFloat(parts[0]), hi = parseFloat(parts[1]), v = parseFloat(val);
                        if (!isNaN(lo) && !isNaN(hi) && !isNaN(v) && (v < lo || v > hi)) {
                            widget.addClass("ui-state-error");
                            valid = false;
                        }
                    }
                }
                if (val && $.trim(val) !== "") { hasValue = true; }
                if (config.bool("SuppressBlankObservations") && !val) { return; }
                avs.push(nm + "=" + val);
            });

            if (!valid) {
                row.addClass("asm-row-error");
                header.show_error(_("Please fix highlighted fields."));
                return null;
            }

            let extras = $.extend({}, state.extras || {});

            // Determine triggers for poo sample confirmation
            const findField = function(label) { return ao.find_map_key(map, label); };
            const triggers = [];

            const unusualField = findField("Unusual Symptoms");
            const drankField = findField("Drunk");
            const eatenField = findField("Eaten");
            const pooInspectField = findField("Poo Inspection");
            if (unusualField && map[unusualField]) { triggers.push(unusualField); }
            if (drankField && (map[drankField] || "").toLowerCase() === "none") { triggers.push(drankField); }
            if (eatenField && (map[eatenField] || "").toLowerCase() === "none") { triggers.push(eatenField); }
            if (pooInspectField && (map[pooInspectField] === "7" || map[pooInspectField] === "8")) { triggers.push(pooInspectField); }

            const weightFieldKey = findField("Weight");
            if (weightFieldKey && map[weightFieldKey]) {
                const parseWeight = function(s) {
                    const w = parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
                    return isNaN(w) ? null : w;
                };
                const currentWeight = parseWeight(map[weightFieldKey]);
                if (currentWeight !== null && state.history && state.history.length) {
                    let within1d = null, within7d = null;
                    const now = new Date();
                    $.each(state.history, function(_, entry) {
                        if (!entry || !entry.DATE || !entry.COMMENTS) { return; }
                        const histMap = ao.parse_observation_map(entry.COMMENTS);
                        const histKey = ao.find_map_key(histMap, weightFieldKey) || ao.find_map_key(histMap, "Weight");
                        if (!histKey) { return; }
                        const previous = parseWeight(histMap[histKey]);
                        if (previous === null) { return; }
                        const dt = new Date(entry.DATE);
                        const hours = Math.abs((now - dt) / 36e5);
                        if (hours <= 24 && within1d === null) { within1d = previous; }
                        if (hours <= 24 * 7 && within7d === null) { within7d = previous; }
                    });
                    if (within1d !== null && currentWeight <= within1d * 0.98) {
                        triggers.push(weightFieldKey);
                    }
                    else if (within7d !== null && currentWeight <= within7d * 0.95) {
                        triggers.push(weightFieldKey);
                    }
                }
            }

            // Clinician notification triggers
            let clinicianTriggers = [];
            $.each(map, function(key, value) {
                const lk = (key || "").toLowerCase();
                if (!lk) { return; }
                if ((lk.indexOf("faec") !== -1 || lk.indexOf("feces") !== -1 || lk.indexOf("faeces") !== -1 || lk.indexOf("poo") !== -1) && ao.value_indicates_none(value)) {
                    clinicianTriggers.push(key);
                    return;
                }
                if (lk.indexOf("sign") !== -1 && lk.indexOf("animal") !== -1 && ao.value_indicates_none(value)) {
                    clinicianTriggers.push(key);
                    return;
                }
                if ((lk.indexOf("seen") !== -1 || lk.indexOf("sighting") !== -1) && ao.value_indicates_none(value)) {
                    clinicianTriggers.push(key);
                }
            });
            clinicianTriggers = [...new Set(clinicianTriggers)];

            if (clinicianTriggers.length) {
                const confirmed = await ao.request_clinician_confirm(ao.row_name(row), clinicianTriggers);
                if (!confirmed) {
                    header.show_info(_("Save cancelled."));
                    return null;
                }
                extras["Notify clinician"] = "Yes";
            }

            if (triggers.length) {
                const choice = await ao.request_poo_choice(ao.row_name(row), triggers);
                if (choice === null) {
                    header.show_info(_("Save cancelled."));
                    return null;
                }
                extras["Take poo sample"] = choice;
            }

            // Preserve existing extras if no new prompts occurred
            if (!triggers.length && extras["Take poo sample"] === undefined && state.extras && state.extras["Take poo sample"]) {
                extras["Take poo sample"] = state.extras["Take poo sample"];
            }
            if (!clinicianTriggers.length && extras["Notify clinician"] === undefined && state.extras && state.extras["Notify clinician"]) {
                extras["Notify clinician"] = state.extras["Notify clinician"];
            }

            $.each(extras, function(k, v) {
                avs = ao.remove_key(avs, k);
                if (common.nulltostr(v) !== "") {
                    avs.push(k + "=" + v);
                }
            });

            if (avs.length === 0 && !hasValue) {
                header.show_error(_("Please enter at least one observation value."));
                return null;
            }

            const finalMap = $.extend({}, map);
            $.each(extras, function(k, v) {
                finalMap[k] = v;
            });

            return {
                animalid: parseInt(row.attr("data-animalid"), 10),
                packed: avs.join(", "),
                logid: state.logid || 0,
                map: finalMap,
                extras: extras
            };
        },

        parse_response: function(resp) {
            if (!resp) { return { count: 0 }; }
            if (typeof resp === "object") { return resp; }
            try {
                const parsed = JSON.parse(resp);
                return parsed;
            }
            catch (ex) {
                const count = parseInt(resp, 10);
                if (isNaN(count)) {
                    return { count: 0 };
                }
                return { count: count };
            }
        },

        after_save: function(results, payload) {
            const ao = animal_observations;
            payload = payload || {};
            const createdMap = {};
            const updatedMap = {};
            $.each(payload.created || [], function(_, item) {
                createdMap[item.animalid] = item.logid;
            });
            $.each(payload.updated || [], function(_, item) {
                updatedMap[item.animalid] = item.logid;
            });
            $.each(results, function(_, info) {
                const row = info.row;
                const result = info.result;
                const state = row.data("obsState") || { history: [] };
                const aid = result.animalid;
                if (createdMap.hasOwnProperty(aid)) {
                    state.logid = createdMap[aid];
                }
                else if (updatedMap.hasOwnProperty(aid)) {
                    state.logid = updatedMap[aid];
                }
                state.map = result.map;
                state.extras = result.extras;
                state.history = state.history || [];
                if (result.packed) {
                    state.history.unshift({
                        "ID": state.logid,
                        "LOGID": state.logid,
                        "DATE": controller.todaydate || null,
                        "COMMENTS": result.packed,
                        "ANIMALID": aid
                    });
                    if (state.history.length > 10) {
                        state.history = state.history.slice(0, 10);
                    }
                }
                row.data("obsState", state);
                row.attr("data-existing-logid", state.logid || 0);
                row.removeClass("ui-state-highlight asm-row-error");
                row.addClass("asm-has-existing asm-completerow");
                row.find(".selector").prop("checked", false);
                row.find(".widget").prop("disabled", true).removeClass("ui-state-error");

                const entryPayload = {
                    "ID": state.logid,
                    "LOGID": state.logid,
                    "DATE": controller.todaydate || null,
                    "COMMENTS": result.packed,
                    "ANIMALID": aid
                };
                if (!ao.today_lookup) { ao.today_lookup = {}; }
                ao.today_lookup[aid] = entryPayload;
                if (ao.animal_map[aid]) {
                    ao.animal_map[aid].TODAYOBS = entryPayload;
                    ao.animal_map[aid].OBSERVATIONHISTORY = state.history;
                }
                if (!ao.history_lookup) { ao.history_lookup = {}; }
                ao.history_lookup[aid] = state.history;
            });
        },

        bind: function() {

            const ao = animal_observations;

            $(".asm-daily-observations").table();
            $(".asm-daily-observations").trigger("sorton", [[[1, 0]]]);

            ao.ensure_dialog_shells();
            ao.prefill_existing();

            $("#button-selectall").button({
                icons: { primary: "ui-icon-check" },
                text: false
            }).click(function() {
                $(".asm-daily-observations tbody tr:visible").each(function() {
                    $(this).find(".selector").prop("checked", true);
                    $(this).removeClass("asm-completerow").addClass("ui-state-highlight");
                    $(this).find(".widget").prop("disabled", false);
                });
            });

            $("#button-history").button({
                icons: { primary: "ui-icon-clock" }
            }).click(function() {
                let target = "hedgehog_observation_history";
                const selectedRow = $(".asm-daily-observations tbody tr").filter(function() {
                    return $(this).find(".selector").is(":checked");
                }).first();
                if (selectedRow.length) {
                    const aid = selectedRow.data("animalid");
                    if (aid) {
                        target += "?animalid=" + aid;
                    }
                }
                common.route(target);
            });

            $("#button-save").button().click(async function() {
                const selectedRows = $(".asm-daily-observations tbody tr").filter(function() {
                    return $(this).find(".selector").is(":checked");
                });
                if (selectedRows.length === 0) {
                    header.show_info(_("Select at least one animal to record observations."));
                    return;
                }
                let logs = [];
                let updateMap = {};
                let results = [];

                for (let i = 0; i < selectedRows.length; i++) {
                    const row = $(selectedRows[i]);
                    const outcome = await ao.process_row(row);
                    if (!outcome) {
                        return; // User cancelled or validation failed
                    }
                    if (!outcome.packed) {
                        header.show_error(_("Please enter at least one observation value."));
                        return;
                    }
                    logs.push(outcome.animalid + "==" + outcome.packed);
                    if (outcome.logid) {
                        updateMap[outcome.animalid] = outcome.logid;
                    }
                    results.push({ row: row, result: outcome });
                }

                if (!logs.length) {
                    header.show_error(_("Please enter at least one observation value."));
                    return;
                }

                const formdata = {
                    "mode": "save",
                    "logtype": config.str("BehaveLogType"),
                    "logs": logs.join("^^")
                };
                if (Object.keys(updateMap).length) {
                    formdata.updatemap = JSON.stringify(updateMap);
                }

                header.show_loading(_("Saving..."));
                let response;
                try {
                    response = await common.ajax_post("animal_observations", formdata);
                }
                finally {
                    header.hide_loading();
                }
                const payload = ao.parse_response(response);
                const countText = (payload && typeof payload.count !== "undefined") ? payload.count : response;
                header.show_info(_("{0} observation logs successfully written.").replace("{0}", countText));
                ao.after_save(results, payload);
            });

            $(".asm-daily-observations").on("click", ".selector", function() {
                const row = $(this).closest("tr");
                if ($(this).is(":checked")) {
                    row.removeClass("asm-completerow").addClass("ui-state-highlight");
                    row.find(".widget").prop("disabled", false);
                }
                else {
                    row.addClass("asm-completerow").removeClass("ui-state-highlight");
                    row.find(".widget").prop("disabled", true).removeClass("ui-state-error");
                }
                row.removeClass("asm-row-error");
            });

            $(".asm-daily-observations tbody tr").addClass("asm-completerow");
            $(".asm-daily-observations .widget").prop("disabled", true);

            $("#location").change(this.change_location);
        },

        sync: function() {
            this.change_location();
        },

        destroy: function() {},

        name: "animal_observations",
        animation: "book",
        title: function() { return _("Daily Observations"); },
        routes: {
            "animal_observations": function() { common.module_loadandstart("animal_observations", "animal_observations?" + this.rawqs); }
        }

    };

    common.module_register(animal_observations);

});
