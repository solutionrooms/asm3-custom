/*global $, jQuery, _, common, header, html */

/**
 * check_form — shared helper for "Check Admission Form" feature.
 *
 * Given an animal id and (optionally) a specific media id, run the stored
 * form image through the vision model on the server, show the user a per-field
 * comparison against the current animal record, and apply the ticked rows.
 *
 * Used by:
 *   - animal.js — header "Check Form" button (auto-finds admission_form_scan.jpg)
 *   - media.js — per-row "Check against record" action (passes the selected mediaid)
 */
$(function() {

    "use strict";

    const DIALOG_ID = "dialog-check-form";

    const ensure_dialog = function() {
        if ($("#" + DIALOG_ID).length) { return; }
        $("body").append(
            '<div id="' + DIALOG_ID + '" style="display:none;" title="' +
            html.title(_("Check Admission Form")) + '">' +
            '<style>' +
            '#' + DIALOG_ID + ' .cf-summary { color:#555; margin-bottom:10px; font-size:0.9em; }' +
            '#' + DIALOG_ID + ' table.cf-table { width:100%; border-collapse:collapse; }' +
            '#' + DIALOG_ID + ' table.cf-table th, #' + DIALOG_ID + ' table.cf-table td { ' +
                'padding:8px 6px; border-bottom:1px solid #eee; vertical-align:top; font-size:0.92em; }' +
            '#' + DIALOG_ID + ' table.cf-table th { background:#f6f8fa; text-align:left; font-weight:600; }' +
            '#' + DIALOG_ID + ' table.cf-table td.cf-cur { color:#555; }' +
            '#' + DIALOG_ID + ' table.cf-table td.cf-new { color:#1e5fb8; font-weight:500; }' +
            '#' + DIALOG_ID + ' .cf-check { text-align:center; width:36px; }' +
            '#' + DIALOG_ID + ' .cf-bar { margin:8px 0; display:flex; gap:8px; flex-wrap:wrap; }' +
            '#' + DIALOG_ID + ' .cf-bar button { padding:6px 12px; }' +
            '#' + DIALOG_ID + ' .cf-empty { color:#080; padding:16px; text-align:center; }' +
            '</style>' +
            '<div class="cf-summary" id="cf-summary">' + _("Loading…") + '</div>' +
            '<div class="cf-bar" id="cf-bar" style="display:none;">' +
            '  <button type="button" id="cf-btn-all">' + _("Select all") + '</button>' +
            '  <button type="button" id="cf-btn-none">' + _("Clear selection") + '</button>' +
            '</div>' +
            '<div id="cf-body"></div>' +
            '</div>');
    };

    const render_comparison = function(payload) {
        const rows = payload.comparison || [];
        const differCount = rows.filter(function(r) { return r.differ; }).length;
        $("#cf-summary").html(
            html.title(_("Model: {0} • {1}s • {2} differences, {3} matching")
                .replace("{0}", payload.model || "?")
                .replace("{1}", String(payload.elapsed_seconds || "?"))
                .replace("{2}", String(differCount))
                .replace("{3}", String(rows.length - differCount))));
        if (rows.length === 0) {
            $("#cf-body").html('<div class="cf-empty">' +
                _("Nothing differs — the record already matches the form.") + '</div>');
            return;
        }
        $("#cf-bar").show();
        const lines = [];
        lines.push('<table class="cf-table">');
        lines.push('<thead><tr>');
        lines.push('<th class="cf-check">' + _("Apply") + '</th>');
        lines.push('<th>' + _("Field") + '</th>');
        lines.push('<th>' + _("Current") + '</th>');
        lines.push('<th>' + _("From form") + '</th>');
        lines.push('</tr></thead><tbody>');
        $.each(rows, function(i, r) {
            const differClass = r.differ ? ' style="background:#fff7e6;"' : '';
            lines.push('<tr data-i="' + i + '"' + differClass + '>');
            lines.push('<td class="cf-check"><input type="checkbox" class="cf-row-check" /></td>');
            lines.push('<td>' + html.title(r.label) + '<br><code style="color:#888; font-size:0.82em;">' +
                html.title(r.key) + '</code></td>');
            lines.push('<td class="cf-cur">' + html.title(r.current || "—") + '</td>');
            lines.push('<td class="cf-new">' + html.title(r.scanned || "—") + '</td>');
            lines.push('</tr>');
        });
        lines.push('</tbody></table>');
        $("#cf-body").html(lines.join(""));
        $("#cf-btn-all").off("click").on("click", function() {
            $(".cf-row-check").prop("checked", true);
        });
        $("#cf-btn-none").off("click").on("click", function() {
            $(".cf-row-check").prop("checked", false);
        });
    };

    const apply_selections = async function(animalID, payload) {
        const rows = payload.comparison || [];
        const selections = [];
        $("#cf-body tr").each(function() {
            if (!$(this).find(".cf-row-check").prop("checked")) { return; }
            const i = parseInt($(this).attr("data-i"), 10);
            const r = rows[i];
            if (!r) { return; }
            selections.push({ key: r.key, scanned_raw: r.scanned_raw });
        });
        if (selections.length === 0) {
            header.show_error(_("Tick at least one row to apply."));
            return;
        }
        try {
            const response = await common.ajax_post(
                "animal",
                "mode=applyform&id=" + animalID +
                    "&selections=" + encodeURIComponent(JSON.stringify(selections)));
            let result = null;
            try { result = JSON.parse(response); } catch (e) {}
            if (!result) { header.show_error(_("Unexpected response.")); return; }
            const errs = result.errors || [];
            if (errs.length > 0) {
                header.show_error(_("Applied {0}, errors: ").replace("{0}", String(result.applied || 0)) +
                    errs.join("; "));
            } else {
                header.show_info(_("Applied {0} field(s). Reloading…").replace("{0}", String(result.applied || 0)));
            }
            $("#" + DIALOG_ID).dialog("close");
            setTimeout(function() { common.route_reload(); }, 800);
        } catch (err) {
            header.show_error(_("Apply failed: ") + String(err && err.message || err));
        }
    };

    /**
     * Public entry point.
     *   animalID: required, the animal whose form we're checking
     *   mediaID: optional, force-use a specific media id (Media-tab use case).
     *            If omitted, backend auto-finds by filename.
     */
    window.check_form = {
        open: async function(animalID, mediaID) {
            if (!animalID) { return; }
            ensure_dialog();
            $("#cf-summary").text(_("Scanning admission form — this can take up to a minute…"));
            $("#cf-body").empty();
            $("#cf-bar").hide();

            let last_payload = null;
            const btns = [
                { text: _("Apply selected"), click: function() {
                    if (last_payload) { apply_selections(animalID, last_payload); }
                } },
                { text: _("Close"), click: function() { $(this).dialog("close"); } }
            ];
            $("#" + DIALOG_ID).dialog({
                autoOpen: true, modal: true, dialogClass: "dialogshadow",
                width: Math.min(820, $(window).width() - 40),
                buttons: btns
            });

            try {
                let params = "mode=checkform&id=" + animalID;
                if (mediaID) { params += "&mediaid=" + mediaID; }
                const response = await common.ajax_post("animal", params);
                let payload = null;
                try { payload = JSON.parse(response); } catch (e) {}
                if (!payload) {
                    $("#cf-summary").text(_("Could not parse server response."));
                    return;
                }
                if (!payload.found) {
                    $("#cf-summary").text(payload.message || _("No admission form scan found on this animal."));
                    return;
                }
                last_payload = payload;
                render_comparison(payload);
            } catch (err) {
                $("#cf-summary").text(_("Scan failed: ") + String(err && err.message || err || ""));
            }
        }
    };

});
