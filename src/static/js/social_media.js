/*global $, jQuery, _, asm, common, config, controller, dlgfx, format, header, html, tableform, validate */

$(function() {

    "use strict";

    const social_media = {

        STATUS_DRAFT: 0,
        STATUS_APPROVED: 1,
        STATUS_POSTED: 2,
        current_index: 0,

        status_label: function(status) {
            if (status == 0) { return '<span style="background:#f0ad4e;color:#fff;padding:2px 8px;border-radius:3px;font-size:0.85em;">Draft</span>'; }
            if (status == 1) { return '<span style="background:#5cb85c;color:#fff;padding:2px 8px;border-radius:3px;font-size:0.85em;">Approved</span>'; }
            if (status == 2) { return '<span style="background:#337ab7;color:#fff;padding:2px 8px;border-radius:3px;font-size:0.85em;">Posted</span>'; }
            return "";
        },

        display_text: function(row) {
            if (row.EDITEDTEXT && row.EDITEDTEXT !== "") { return row.EDITEDTEXT; }
            return row.GENERATEDTEXT || "";
        },

        /** Returns rows sorted by date descending (newest first) */
        sorted_rows: function() {
            return controller.rows.slice().sort(function(a, b) {
                if (a.SUMMARYDATE > b.SUMMARYDATE) return -1;
                if (a.SUMMARYDATE < b.SUMMARYDATE) return 1;
                return 0;
            });
        },

        render: function() {
            return [
                html.content_header(_("Social Media Summaries")),

                // Main display area - shows the selected summary in full
                '<div id="summary-display">',
                    '<div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">',
                        '<h3 id="summary-date" style="margin:0;"></h3>',
                        '<span id="summary-status"></span>',
                    '</div>',
                    '<div class="asm-toolbar" style="margin-bottom:10px;">',
                        '<button id="button-prev"><span class="asm-icon asm-icon-left"></span> ' + _("Previous Day") + '</button>',
                        '<button id="button-next">' + _("Next Day") + ' <span class="asm-icon asm-icon-right"></span></button>',
                        '<button id="button-copy"><span class="asm-icon asm-icon-copy"></span> ' + _("Copy to Clipboard") + '</button>',
                        '<button id="button-approve" style="display:none;"><span class="asm-icon asm-icon-check"></span> ' + _("Approve") + '</button>',
                        '<button id="button-markposted" style="display:none;"><span class="asm-icon asm-icon-publish"></span> ' + _("Mark as Posted") + '</button>',
                        '<button id="button-save" style="display:none;"><span class="asm-icon asm-icon-save"></span> ' + _("Save Changes") + '</button>',
                        '<button id="button-regenerate" style="display:none;"><span class="asm-icon asm-icon-refresh"></span> ' + _("Regenerate") + '</button>',
                    '</div>',
                    '<textarea id="summary-text" rows="15" style="width:100%; font-size:1em; line-height:1.6; padding:10px; border:1px solid #ccc; border-radius:4px;"></textarea>',
                    '<div style="margin-top:10px;">',
                        '<h4 style="cursor:pointer;" id="toggle-raw">' + _("Raw Data") + ' &#9660;</h4>',
                        '<pre id="raw-data" style="display:none; background:#f5f5f5; padding:10px; border-radius:4px; max-height:400px; overflow-y:auto; white-space:pre-wrap;"></pre>',
                    '</div>',
                '</div>',

                // Previous days list
                '<div id="previous-days" style="margin-top:20px;">',
                    '<h4>' + _("Previous Summaries") + '</h4>',
                    '<table id="days-list" class="asm-table" style="width:100%;"><tbody></tbody></table>',
                '</div>',

                html.content_footer()
            ].join("\n");
        },

        bind: function() {

            $("#button-prev").button().click(function() {
                social_media.navigate(1); // older = higher index
            });

            $("#button-next").button().click(function() {
                social_media.navigate(-1); // newer = lower index
            });

            $("#button-copy").button().click(function() {
                let text = $("#summary-text").val();
                navigator.clipboard.writeText(text).then(function() {
                    header.show_info(_("Copied to clipboard"));
                });
            });

            if (common.has_permission("esm")) {
                $("#button-save").button().click(async function() {
                    let rows = social_media.sorted_rows();
                    let row = rows[social_media.current_index];
                    let text = $("#summary-text").val();
                    await common.ajax_post("social_media", "mode=update&id=" + row.ID + "&editedtext=" + encodeURIComponent(text));
                    row.EDITEDTEXT = text;
                    header.show_info(_("Saved"));
                });

                $("#button-approve").button().click(async function() {
                    let rows = social_media.sorted_rows();
                    let row = rows[social_media.current_index];
                    await common.ajax_post("social_media", "mode=approve&id=" + row.ID);
                    row.STATUS = social_media.STATUS_APPROVED;
                    social_media.show_summary(social_media.current_index);
                    header.show_info(_("Approved"));
                });

                $("#button-markposted").button().click(async function() {
                    let rows = social_media.sorted_rows();
                    let row = rows[social_media.current_index];
                    await common.ajax_post("social_media", "mode=posted&id=" + row.ID);
                    row.STATUS = social_media.STATUS_POSTED;
                    social_media.show_summary(social_media.current_index);
                    header.show_info(_("Marked as posted"));
                });

                $("#button-regenerate").button().click(async function() {
                    let rows = social_media.sorted_rows();
                    let row = rows[social_media.current_index];
                    header.show_loading(_("Regenerating..."));
                    try {
                        let result = await common.ajax_post("social_media", "mode=regenerate&id=" + row.ID);
                        result = jQuery.parseJSON(result);
                        if (result.success) {
                            row.GENERATEDTEXT = result.text;
                            row.EDITEDTEXT = "";
                            row.STATUS = social_media.STATUS_DRAFT;
                            social_media.show_summary(social_media.current_index);
                            header.show_info(_("Regenerated"));
                        } else {
                            header.show_error(result.message);
                        }
                    } catch(e) {
                        header.show_error(e);
                    }
                    header.hide_loading();
                });
            }

            $("#toggle-raw").click(function() {
                $("#raw-data").toggle();
            });

            // Click handler for previous days list (delegated)
            $("#days-list").on("click", "tr", function() {
                let idx = $(this).data("index");
                social_media.show_summary(idx);
            });
        },

        show_summary: function(index) {
            let rows = social_media.sorted_rows();
            if (index < 0 || index >= rows.length) { return; }
            social_media.current_index = index;
            let row = rows[index];

            $("#summary-date").html(format.date(row.SUMMARYDATE));
            $("#summary-status").html(social_media.status_label(row.STATUS));
            $("#summary-text").val(social_media.display_text(row));
            $("#raw-data").text(row.RAWDATA || "").hide();

            // Update buttons
            let canEdit = common.has_permission("esm");
            $("#button-save").toggle(canEdit);
            $("#button-regenerate").toggle(canEdit);
            $("#button-approve").toggle(canEdit && row.STATUS == social_media.STATUS_DRAFT);
            $("#button-markposted").toggle(canEdit && row.STATUS == social_media.STATUS_APPROVED);
            $("#button-prev").button("option", "disabled", index >= rows.length - 1);
            $("#button-next").button("option", "disabled", index <= 0);

            // Rebuild the previous days list (all rows except current)
            social_media.render_days_list(rows, index);
        },

        render_days_list: function(rows, activeIndex) {
            let tbody = $("#days-list tbody");
            tbody.empty();
            for (let i = 0; i < rows.length; i++) {
                if (i === activeIndex) { continue; }
                let row = rows[i];
                let preview = social_media.display_text(row);
                if (preview.length > 150) { preview = preview.substring(0, 150) + "..."; }
                preview = html.title(preview);
                let tr = '<tr data-index="' + i + '" style="cursor:pointer;">' +
                    '<td style="width:100px; white-space:nowrap;">' + format.date(row.SUMMARYDATE) + '</td>' +
                    '<td style="width:80px;">' + social_media.status_label(row.STATUS) + '</td>' +
                    '<td>' + preview + '</td>' +
                    '</tr>';
                tbody.append(tr);
            }
        },

        navigate: function(direction) {
            let rows = social_media.sorted_rows();
            let newIndex = social_media.current_index + direction;
            if (newIndex < 0 || newIndex >= rows.length) { return; }
            social_media.show_summary(newIndex);
        },

        sync: function() {
            // Show the most recent summary on load
            let rows = social_media.sorted_rows();
            if (rows.length > 0) {
                social_media.show_summary(0);
            }
        },

        destroy: function() {
        },

        name: "social_media",
        animation: "book",
        title: function() { return _("Social Media Summaries"); },
        routes: {
            "social_media": function() { common.module_loadandstart("social_media", "social_media"); }
        }
    };

    common.module_register(social_media);

});
