/*global $, jQuery, _, asm, common, config, controller, dlgfx, edit_header, format, header, html, tableform */

$(function() {

    "use strict";

    const animal_observations_history = {

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
            // Gather configured behaviour names in order
            let names = [];
            for (let i = 0; i < 50; i++) {
                let n = config.str("Behave" + i + "Name");
                if (n) { names.push(n); }
            }
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
            $.each(extraFieldDefs, function(_, def) {
                columns.push({ field: def.field, display: def.label });
            });
            // Always include a column for poo sample results captured in comments
            columns.push({ field: "POO_SAMPLE_RESULT", display: _("Poo Sample Result") });
            // Map rows to include OBS_i fields from comments
            let rows = [];
            $.each(controller.rows, function(i, r) {
                let m = animal_observations_history.parse_observation_map(r.COMMENTS);
                // Only include rows that look like observation entries
                let hasAny = false;
                let row = $.extend({}, r);
                $.each(names, function(ix, n) { 
                    let v = m[n] || "";
                    row["OBS_" + ix] = v; 
                    if (v) { hasAny = true; }
                });
                $.each(extraFieldDefs, function(_, def) {
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

                if (hasAny) { rows.push(row); }
            });
            return { columns: columns, rows: rows };
        },

        render: function() {
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

            let built = this.build_columns_and_rows();
            let table = {
                rows: built.rows,
                idcolumn: "ID",
                columns: built.columns
            };
            h.push(tableform.table_render(table));
            h.push(html.content_footer());
            this.table = table;
            return h.join("\n");
        },

        bind: function() {
            $(".asm-tabbar").asmtabs();
            tableform.buttons_bind(this.buttons || []);
            tableform.table_bind(this.table, []);
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
