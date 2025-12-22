/*global $, jQuery, _, asm, common, controller, format, header, html, tableform */

$(function() {

    "use strict";

    const animal_feeding = {

        today_lookup: null,

        render: function() {
            this.today_lookup = null;

            // Remove empty internal locations and include counts
            let locs = [];
            $.each(controller.internallocations, function(i, v) {
                v.DISPLAY = _("{0} ({1})").replace("{0}", v.LOCATIONNAME).replace("{1}", v.TOTAL);
                if (v.TOTAL > 0) { locs.push(v); }
            });
            controller.internallocations = locs;

            let headerTitle = _("Daily Feeding");
            if (controller.todaydate) {
                try {
                    headerTitle = _("Daily feeding for {0}").replace("{0}", format.date(controller.todaydate));
                }
                catch (ex) {
                    headerTitle = _("Daily Feeding");
                }
            }

            let h = [
                html.content_header(headerTitle),
                tableform.buttons_render([
                    { id: "save", icon: "save", text: _("Save"), tooltip: _("Write feeding log entries") },
                    { id: "location", type: "dropdownfilter", options: html.list_to_options(controller.internallocations, "ID", "DISPLAY") }
                ])
            ];

            h.push('<table class="asm-daily-observations">');
            h.push('<thead><tr><th>' + _("Animal") + '</th><th>' + _("Unit") + '</th><th>' + _("Diet") + '</th>' +
                '<th>' + _("Last fed") + '</th><th>' + _("Who by") + '</th><th>' + _("Confirmed") + '</th>' +
                '<th>' + _("Comments") + '</th></tr></thead>');
            h.push('<tbody>');
            $.each(controller.animals, function(i, a) {
                if (a.ACTIVEMOVEMENTTYPE) { return; }
                let dietName = common.nulltostr(a.ACTIVEDIETNAME);
                let dietTitle = html.title(common.nulltostr(a.ACTIVEDIETDESCRIPTION));
                let isDefault = a.ACTIVEDIETDEFAULT === 1 || a.ACTIVEDIETDEFAULT === true;
                let dietLabel = dietName;
                if (dietLabel && isDefault) {
                    dietLabel = dietLabel + " " + _("(default)");
                }
                let lastFed = "";
                if (a.LASTFEDDATE) {
                    lastFed = format.date(a.LASTFEDDATE);
                    if (format.time(a.LASTFEDDATE) !== "00:00:00") {
                        lastFed += " " + format.time(a.LASTFEDDATE);
                    }
                }
                h.push('<tr data-animalid="' + a.ID + '" data-locationid="' + a.SHELTERLOCATION + '" style="display: none">');
                h.push('<td>' + html.animal_link(a, { emblemsright: true, newtab: true }) + '</td>');
                h.push('<td>' + common.nulltostr(a.SHELTERLOCATIONUNIT) + '</td>');
                h.push('<td title="' + dietTitle + '">' + (dietLabel ? html.truncate(dietLabel, 60) : _("None")) + '</td>');
                h.push('<td class="centered">' + lastFed + '</td>');
                h.push('<td>' + html.truncate(a.LASTFEDBY, 40) + '</td>');
                h.push('<td class="centered"><input type="checkbox" class="asm-checkbox feed-confirmed" /></td>');
                h.push('<td><input type="text" class="asm-textbox feed-comments" /></td>');
                h.push('</tr>');
            });
            h.push('</tbody></table>');
            h.push(html.content_footer());
            return h.join("\n");
        },

        build_today_lookup: function() {
            const lookup = {};
            if (Array.isArray(controller.todaylogs)) {
                $.each(controller.todaylogs, function(_, entry) {
                    const aid = parseInt(entry.ANIMALID || entry.animalid || 0, 10);
                    if (aid) { lookup[aid] = entry; }
                });
            }
            return lookup;
        },

        parse_log_comment: function(comments) {
            let result = { confirmed: false, comments: "" };
            if (!comments) { return result; }
            const parts = String(comments).split(/\r?\n/);
            $.each(parts, function(_, part) {
                if (part.indexOf("=") === -1) { return; }
                let pieces = part.split("=");
                let key = $.trim(pieces[0]).toLowerCase();
                let val = $.trim(pieces.slice(1).join("="));
                if (key === "confirmed") {
                    let lower = val.toLowerCase();
                    result.confirmed = ["yes", "y", "true", "1"].indexOf(lower) !== -1;
                }
                if (key === "comments") {
                    result.comments = val;
                }
            });
            return result;
        },

        prefill_existing: function() {
            const af = animal_feeding;
            if (!af.today_lookup) {
                af.today_lookup = af.build_today_lookup();
            }
            $(".asm-daily-observations tbody tr").each(function() {
                const row = $(this);
                const aid = parseInt(row.attr("data-animalid"), 10);
                if (!aid) { return; }
                const entry = af.today_lookup[aid];
                if (!entry || !entry.COMMENTS) { return; }
                const parsed = af.parse_log_comment(entry.COMMENTS);
                if (parsed.confirmed) {
                    row.find(".feed-confirmed").prop("checked", true);
                }
                if (parsed.comments) {
                    row.find(".feed-comments").val(parsed.comments);
                }
                row.addClass("asm-has-existing");
            });
        },

        change_location: function() {
            const selected = $("#location").val();
            $(".asm-daily-observations tbody tr").each(function() {
                $(this).toggle(!selected || $(this).attr("data-locationid") === selected);
            });
        },

        collect_entries: function() {
            const entries = [];
            $(".asm-daily-observations tbody tr:visible").each(function() {
                const row = $(this);
                const aid = parseInt(row.attr("data-animalid"), 10);
                if (!aid) { return; }
                const confirmed = row.find(".feed-confirmed").is(":checked");
                const comments = common.trim(row.find(".feed-comments").val());
                if (!confirmed && comments === "") { return; }
                entries.push({ animalid: aid, confirmed: confirmed, comments: comments });
            });
            return entries;
        },

        save_entries: async function() {
            header.hide_error();
            const entries = this.collect_entries();
            if (!entries.length) {
                header.show_info(_("No feeding entries to save."));
                return;
            }
            header.show_loading(_("Saving..."));
            try {
                let response = await common.ajax_post("animal_feeding", "mode=save&entries=" + encodeURIComponent(JSON.stringify(entries)));
                let result = {};
                try {
                    result = jQuery.parseJSON(response);
                } catch (ex) {}
                const count = result.count || entries.length;
                header.show_info(_("{0} feeding records saved.").replace("{0}", count));
                $.each(entries, function(_, entry) {
                    $(".asm-daily-observations tbody tr[data-animalid='" + entry.animalid + "']").addClass("asm-has-existing");
                });
            }
            catch (err) {
                header.show_error(_("Failed to save feeding entries."));
            }
            finally {
                header.hide_loading();
            }
        },

        bind: function() {
            $(".asm-daily-observations").table();
            $(".asm-daily-observations").trigger("sorton", [[[1, 0]]]);
            this.prefill_existing();
            $("#location").change(this.change_location);
            $("#button-save").button().click(this.save_entries.bind(this));
        },

        sync: function() {
            this.change_location();
        },

        destroy: function() {},

        name: "animal_feeding",
        animation: "book",
        title: function() { return _("Daily Feeding"); },
        routes: {
            "animal_feeding": function() { common.module_loadandstart("animal_feeding", "animal_feeding?" + this.rawqs); }
        }

    };

    common.module_register(animal_feeding);

});
