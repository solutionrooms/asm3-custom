/*global $, jQuery, _, asm, common, config, controller, dlgfx, edit_header, format, header, html, tableform */

$(function() {

    "use strict";

    const animal_observations_history = {

        observation_photo_map: {},
        photo_dialog_initialised: false,

        parse_observation_map: function(comments) {
            let map = {};
            if (!comments) { return map; }
            try {
                // Expect comma-separated key=value pairs
                $.each(comments.split(','), function(i, part) {
                    let p = part.split('=');
                    if (p.length >= 2) {
                        let key = $.trim(p[0]);
                        let val = $.trim(p.slice(1).join('=')); // allow '=' in value just in case
                        map[key] = val;
                    }
                });
            }
            catch (e) {}
            return map;
        },

        build_columns_and_rows: function() {
            const ho = this;
            // Gather configured behaviour names in order
            let names = [];
            for (let i = 0; i < 50; i++) {
                let n = config.str("Behave" + i + "Name");
                if (n) { names.push(n); }
            }
            const normalizedNames = {};
            $.each(names, function(_, n) {
                if (!n) { return; }
                normalizedNames[$.trim(String(n)).toLowerCase()] = true;
            });
            // Define table columns: Date, By, then each name
            let columns = [
                { field: "DATE", display: _("Date"), formatter: tableform.format_datetime, initialsort: true, initialsortdirection: "desc" },
                { field: "LASTCHANGEDBY", display: _("By") }
            ];
            $.each(names, function(i, n) {
                columns.push({ field: "OBS_" + i, display: n });
            });
            const extraFieldDefs = [
                { field: "POO_SAMPLE_TAKEN", label: _("Poo Sample Taken?") },
                { field: "CLINICIAN_ALERTED", label: _("Clinician Alerted?") }
            ];
            const activeExtraFieldDefs = $.grep(extraFieldDefs, function(def) {
                const key = $.trim(String(def.label || "")).toLowerCase();
                return key === "" || !normalizedNames[key];
            });
            $.each(activeExtraFieldDefs, function(_, def) {
                columns.push({ field: def.field, display: def.label });
            });
            // Always include a column for poo sample results captured in comments
            columns.push({ field: "POO_SAMPLE_RESULT", display: _("Poo Sample Result") });
            // Append a photo column with a per-row launch button
            columns.push({
                field: "ID",
                display: _("Photos"),
                formatter: function(row, id) { return ho.photo_button_markup(row, id); },
                classes: "observation-photo-cell"
            });
            // Map rows to include OBS_i fields from comments
            let rows = [];
            $.each(controller.rows, function(i, r) {
                let m = animal_observations_history.parse_observation_map(r.COMMENTS);
                // Only include rows that look like observation entries or hold photos
                let hasAny = false;
                let row = $.extend({}, r);
                $.each(names, function(ix, n) {
                    let v = m[n] || "";
                    row["OBS_" + ix] = v;
                    if (v) { hasAny = true; }
                });
                $.each(activeExtraFieldDefs, function(_, def) {
                    let targetKey = "";
                    try {
                        targetKey = Object.keys(m).find(function(k) { return (k || "").toLowerCase() === def.label.toLowerCase(); }) || "";
                    }
                    catch (e) {}
                    let extraVal = targetKey ? (m[targetKey] || "") : "";
                    row[def.field] = extraVal;
                    if (extraVal) { hasAny = true; }
                });
                // Also surface poo sample results if present (case-insensitive key)
                let pooKey = "";
                try {
                    pooKey = Object.keys(m).find(function(k) { return (k || "").toLowerCase() === "poo_sample_result"; }) || "";
                }
                catch (e) {}
                let pooVal = pooKey ? (m[pooKey] || "") : "";
                row["POO_SAMPLE_RESULT"] = pooVal;
                if (pooVal) { hasAny = true; }
                const photoEntries = ho.photo_entries_for_log(row.ID);
                row.__PHOTOCOUNT = photoEntries.length;
                if (photoEntries.length > 0) { hasAny = true; }

                if (hasAny) { rows.push(row); }
            });
            return { columns: columns, rows: rows };
        },

        render: function() {
            const ho = this;
            let h = [];
            h.push(edit_header.animal_edit_header(controller.animal, "observations", controller.tabcounts));

            // Optional new observation button to launch single-entry form
            this.buttons = [
                { id: "newobs", text: _("New Observation"), icon: "new", enabled: "always",
                    click: function() {
                        // Route by animalname for QR-friendly URL
                        let nm = encodeURIComponent(controller.animal.ANIMALNAME || "");
                        common.route("hedgehog_observation?animalname=" + nm);
                    } },
                { id: "enterhistory", text: _("Enter historical observations"), icon: "clock", enabled: "always",
                    click: function() {
                        const aid = controller.animal && controller.animal.ID ? controller.animal.ID : 0;
                        const target = aid ? ("hedgehog_observation_history?animalid=" + aid) : "hedgehog_observation_history";
                        common.route(target);
                    } }
            ];
            h.push(tableform.buttons_render(this.buttons));

            this.observation_photo_map = controller.observation_photos || {};
            this.photo_dialog_initialised = false;

            let built = this.build_columns_and_rows();
            let table = {
                rows: built.rows,
                idcolumn: "ID",
                columns: built.columns,
                button_click: function(event) {
                    const button = $(this);
                    if (!button.hasClass("obs-photo-button")) { return; }
                    if (event) {
                        event.preventDefault();
                        event.stopPropagation();
                    }
                    const logId = button.attr("data-logid");
                    ho.open_photo_dialog(logId);
                }
            };
            h.push(tableform.table_render(table));
            h.push('<div id="dialog-view-photos" style="display:none" title="' + html.title(_("Observation Photos")) + '">');
            h.push('<p class="observation-photo-empty">' + html.title(_("No photos are attached to this observation.")) + '</p>');
            h.push('</div>');
            h.push(html.content_footer());
            this.table = table;
            return h.join("\n");
        },

        bind: function() {
            $(".asm-tabbar").asmtabs();
            tableform.buttons_bind(this.buttons || []);
            tableform.table_bind(this.table, []);
            this.initialise_photo_dialog();
        },

        photo_entries_for_log: function(logId) {
            if (!logId) { return []; }
            const map = this.observation_photo_map || {};
            const key = String(logId);
            if (!map.hasOwnProperty(key)) { return []; }
            const entries = map[key] || [];
            return $.isArray(entries) ? entries.slice() : [];
        },

        photo_button_markup: function(row, logId) {
            const resolvedId = logId || (row && row.ID);
            if (!resolvedId) { return ""; }
            let count = 0;
            if (row && typeof row.__PHOTOCOUNT !== "undefined") {
                count = row.__PHOTOCOUNT;
            }
            else {
                count = this.photo_entries_for_log(resolvedId).length;
            }
            let label = _("View Photos");
            if (count > 0) {
                label += " (" + count + ")";
            }
            const attrs = [
                'type="button"',
                'class="obs-photo-button"',
                'data-icon="image"',
                'data-text="true"',
                'data-logid="' + html.title(String(resolvedId)) + '"',
                'data-has-photos="' + (count > 0 ? "1" : "0") + '"'
            ];
            return '<button ' + attrs.join(" ") + '>' + html.title(label) + '</button>';
        },

        initialise_photo_dialog: function() {
            const dialog = $("#dialog-view-photos");
            if (!dialog.length || dialog.data("obsDialogInit")) { return; }
            let buttons = {};
            buttons[_("Close")] = function() { $(this).dialog("close"); };
            dialog.dialog({
                autoOpen: false,
                modal: true,
                width: 560,
                buttons: buttons,
                show: dlgfx.add_show,
                hide: dlgfx.add_hide
            });
            dialog.data("obsDialogInit", true);
            this.photo_dialog_initialised = true;
        },

        open_photo_dialog: function(logId) {
            if (!logId) { return; }
            this.initialise_photo_dialog();
            const dialog = $("#dialog-view-photos");
            if (!dialog.length) { return; }
            const entries = this.photo_entries_for_log(logId);
            if (!entries.length) {
                dialog.html('<p>' + html.title(_("No photos are attached to this observation.")) + '</p>');
            }
            else {
                const parts = ['<div class="hhog-photo-dialog-grid">'];
                $.each(entries, function(idx, entry) {
                    if (!entry || !entry.id) { return; }
                    const idParam = encodeURIComponent(entry.id);
                    const dateParam = entry.date ? "&date=" + encodeURIComponent(entry.date) : "";
                    parts.push('<div class="hhog-photo-dialog-item"><img src="image?mode=media&id=' + idParam + dateParam + '" alt="' + html.title(_("Observation photo")) + '" /></div>');
                });
                parts.push('</div>');
                dialog.html(parts.join(""));
            }
            dialog.dialog("open");
        },

        sync: function() {},
        destroy: function() {},

        name: "animal_observations_history",
        animation: "formtab",
        title: function() { 
            return common.substitute(_("{0} - {1} ({2} {3} aged {4})"), { 
                0: controller.animal.ANIMALNAME, 1: controller.animal.CODE, 2: controller.animal.SEXNAME,
                3: controller.animal.SPECIESNAME, 4: controller.animal.ANIMALAGE });
        },
        routes: {
            "animal_observations_history": function() { common.module_loadandstart("animal_observations_history", "animal_observations_history?" + this.rawqs); }
        }
    };

    common.module_register(animal_observations_history);

});
