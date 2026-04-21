/*global $, jQuery, FileReader, _, asm, common, controller, format, header, html */

$(function() {

    "use strict";

    const bulk_microchip = {

        // captured image data URLs (base64)
        images: [],
        // per-image rotation in degrees (0, 90, 180, 270)
        rotations: [],
        // extracted rows from the backend
        rows: [],
        // processed (rotated + downscaled) images from the last extract run,
        // cached here so we can send them with the apply call to attach as media
        processed_images: [],

        render_page: function() {
            return [
                // Mobile-friendly CSS: converts the results table into scrollable
                // cards at narrow widths, and enlarges touch targets everywhere.
                '<style>',
                    '#bulkmc-page button { min-height: 44px; padding: 0.5em 1em; }',
                    '#bulkmc-page input[type="text"], #bulkmc-page select { min-height: 40px; font-size: 15px; }',
                    '#bulkmc-page .row-check { width: 22px; height: 22px; }',
                    '#bulkmc-page .thumb-rotate, #bulkmc-page .thumb-remove { min-width: 32px; min-height: 32px; font-size: 1em; }',
                    '@media (max-width: 900px) {',
                        '#bulkmc-page h2 { margin: 0.3em 0; font-size: 1.3em; }',
                        '#bulkmc-page p { font-size: 0.9em; margin: 0.3em 0; }',
                        // Bigger main buttons with icon + label; wrap nicely
                        '#bulkmc-page #image-controls { display: flex; flex-wrap: wrap; gap: 0.3em; }',
                        '#bulkmc-page #image-controls button { flex: 1 1 45%; font-size: 0.95em; min-height: 40px; padding: 0.4em; }',
                        '#bulkmc-page #btn-apply { width: 100%; font-size: 1em; min-height: 44px; }',
                        // Inputs at least 16px to stop iOS auto-zoom on focus
                        '#bulkmc-page input[type="text"], #bulkmc-page select { font-size: 16px; min-height: 30px; padding: 0 0.3em; margin: 0; line-height: 1.2; }',
                        '#bulkmc-page .row-check { width: 22px; height: 22px; margin: 0; }',
                        // Convert the results table into a vertical stack of cards
                        '#results-table, #results-table tbody { display: block; width: 100%; }',
                        '#results-table thead { display: none; }',
                        '#results-table tr { display: block; background: #fafafa; border: 1px solid #ccc; border-radius: 6px; margin-bottom: 0.5em; padding: 0.25em 0.4em; }',
                        // Zero vertical padding, no borders between cells — compactness trumps separation
                        '#results-table td { display: flex; align-items: center; gap: 0.4em; padding: 0; border: none !important; min-height: 26px; line-height: 1.2; margin: 0; }',
                        '#results-table td::before { content: attr(data-label); font-weight: 600; color: #888; min-width: 90px; flex-shrink: 0; font-size: 0.78em; }',
                        '#results-table td > :not(::before) { flex: 1; }',
                        '#results-table input[type="text"], #results-table select { width: 100%; height: 28px; }',
                        // Compact chooser widget — it ships with its own table + padding
                        '#results-table .animalchooser table { margin: 0 !important; }',
                        '#results-table .animalchooser td { padding: 0 !important; }',
                        '#results-table .asm-chooser-container { width: 100%; }',
                        '#results-table .animalchooser-display { font-size: 0.9em; padding: 0 !important; }',
                        '#results-table .animalchooser-display a { display: inline; }',
                        '#results-table .animalchooser-link-find, #results-table .animalchooser-link-clear { min-width: 30px; min-height: 26px; padding: 0 !important; }',
                        // Status cell — allow wrapping, tighter line-height
                        '#results-table .status-cell { align-items: flex-start; font-size: 0.82em; padding: 0.1em 0 0 0; }',
                        '#results-table .status-cell > :not(::before) { line-height: 1.25; }',
                    '}',
                '</style>',

                '<div id="bulkmc-page">',
                '<h2>' + _("Bulk microchip update") + '</h2>',
                '<p>' + _("Photograph or upload one or more microchip implant log sheets. Names and chip numbers will be extracted and matched against existing animals. You must confirm each row before changes are applied.") + '</p>',

                '<div id="image-controls" class="asm-form-row" style="margin-bottom: 1em;">',
                    '<button id="btn-camera" type="button">',
                        '<span class="ui-icon ui-icon-image"></span> ',
                        _("Take photo"),
                    '</button> ',
                    '<button id="btn-gallery" type="button">',
                        '<span class="ui-icon ui-icon-folder-open"></span> ',
                        _("Upload image(s)"),
                    '</button> ',
                    '<button id="btn-process" type="button" disabled="disabled">',
                        '<span class="ui-icon ui-icon-circle-check"></span> ',
                        _("Process images"),
                    '</button> ',
                    '<button id="btn-clear" type="button">',
                        '<span class="ui-icon ui-icon-trash"></span> ',
                        _("Clear all"),
                    '</button>',
                    '<input id="input-camera" type="file" capture="environment" accept="image/*" style="display: none" />',
                    '<input id="input-gallery" type="file" accept="image/*" multiple="multiple" style="display: none" />',
                '</div>',

                '<div id="orient-hint" style="display: none; margin-bottom: 0.5em; padding: 0.5em 0.75em; ' +
                    'background: #fff8d8; border-left: 4px solid #d4a017; color: #6a4f00;">',
                    '<b>' + _("Check the orientation before processing.") + '</b> ',
                    _("Names should read left-to-right and top-to-bottom in each thumbnail. " +
                      "Use the ↻ button to rotate any thumbnail until it's upright — extraction " +
                      "is much more accurate when the image is the right way up."),
                '</div>',

                '<div id="thumbnails" style="margin-bottom: 1em;"></div>',

                '<div id="processing" style="display: none; margin-bottom: 1em;">',
                    '<img src="static/images/wait/rolling_3a87cd.svg" style="height: 24px; vertical-align: middle;" /> ',
                    _("Extracting microchip data..."),
                    ' <span id="processing-meta" style="color: #555; font-size: 0.9em;"></span>',
                '</div>',

                '<div id="results-wrap" style="display: none;">',
                    '<h3>' + _("Extracted rows") + '</h3>',
                    '<p id="results-hint"></p>',
                    '<table id="results-table" class="asm-table">',
                        '<thead>',
                            '<tr>',
                                '<th><input type="checkbox" id="check-all" /></th>',
                                '<th>#</th>',
                                '<th>' + _("Name (extracted)") + '</th>',
                                '<th>' + _("Microchip") + '</th>',
                                '<th>' + _("Implant date") + '</th>',
                                '<th>' + _("Date of Birth") + '</th>',
                                '<th>' + _("Sex") + '</th>',
                                '<th>' + _("Animal to update") + '</th>',
                                '<th>' + _("Status") + '</th>',
                            '</tr>',
                        '</thead>',
                        '<tbody id="results-body"></tbody>',
                    '</table>',
                    '<div style="margin-top: 1em;">',
                        '<button id="btn-apply" type="button">',
                            '<span class="ui-icon ui-icon-circle-check"></span> ',
                            _("Apply confirmed rows"),
                        '</button>',
                    '</div>',
                '</div>',

                '<div id="apply-result" style="display: none; margin-top: 1em;"></div>',
                '</div>' // #bulkmc-page
            ].join("\n");
        },

        add_images: function(files) {
            $.each(files, function(i, file) {
                const reader = new FileReader();
                reader.onload = function() {
                    const data_url = reader.result;
                    const idx = bulk_microchip.images.length;
                    bulk_microchip.images.push(data_url);
                    bulk_microchip.rotations.push(0);
                    $("#thumbnails").append(
                        '<span class="thumb-wrap" data-idx="' + idx + '" data-rot="0" ' +
                            'style="display: inline-block; position: relative; margin-right: 8px; margin-bottom: 8px; vertical-align: top;">' +
                            '<img class="thumb-img" style="max-height: 320px; max-width: min(320px, 90vw); border: 1px solid #ccc; cursor: zoom-in; transition: transform 0.2s;" ' +
                                'title="' + html.title(_("Click to expand")) + '" ' +
                                'src="' + data_url + '" />' +
                            '<div style="position: absolute; top: 4px; right: 4px;">' +
                                '<button type="button" class="thumb-rotate" data-idx="' + idx + '" ' +
                                    'title="' + html.title(_("Rotate")) + '">&#x21bb;</button> ' +
                                '<button type="button" class="thumb-remove" data-idx="' + idx + '">x</button>' +
                            '</div>' +
                        '</span>'
                    );
                    $("#btn-process").prop("disabled", false);
                    $("#orient-hint").show();
                };
                reader.readAsDataURL(file);
            });
        },

        remove_image: function(idx) {
            this.images[idx] = null;
            this.rotations[idx] = null;
            $(".thumb-wrap[data-idx='" + idx + "']").remove();
            const remaining = this.images.filter(function(v) { return v !== null; }).length;
            if (remaining === 0) {
                $("#btn-process").prop("disabled", true);
                $("#orient-hint").hide();
            }
        },

        rotate_image: function(idx) {
            this.rotations[idx] = ((this.rotations[idx] || 0) + 90) % 360;
            const $wrap = $(".thumb-wrap[data-idx='" + idx + "']");
            const rot = this.rotations[idx];
            $wrap.attr("data-rot", rot);
            $wrap.find(".thumb-img").css("transform", "rotate(" + rot + "deg)");
        },

        /**
         * Given an image data URL, returns a Promise resolving to a rotated + downscaled
         * JPEG data URL. Max long-edge 1600px — Claude Vision gains nothing from higher
         * resolution and phone photos are often 4000+px, which blows up the POST body.
         */
        apply_rotation: function(data_url, degrees) {
            const MAX_EDGE = 1600;
            return new Promise(function(resolve, reject) {
                const img = new Image();
                img.onload = function() {
                    // scale so the longer edge is at most MAX_EDGE
                    const longEdge = Math.max(img.width, img.height);
                    const scale = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1;
                    const sw = Math.round(img.width * scale);
                    const sh = Math.round(img.height * scale);

                    const canvas = document.createElement("canvas");
                    const rad = degrees * Math.PI / 180;
                    const swap = (degrees === 90 || degrees === 270);
                    canvas.width = swap ? sh : sw;
                    canvas.height = swap ? sw : sh;
                    const ctx = canvas.getContext("2d");
                    ctx.translate(canvas.width / 2, canvas.height / 2);
                    if (degrees) { ctx.rotate(rad); }
                    ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
                    resolve(canvas.toDataURL("image/jpeg", 0.85));
                };
                img.onerror = function() { reject(new Error("image decode failed")); };
                img.src = data_url;
            });
        },

        toggle_expand: function($img) {
            const expanded = $img.data("expanded");
            if (expanded) {
                $img.css({ "max-height": "320px", "max-width": "320px", "cursor": "zoom-in" }).data("expanded", false);
            } else {
                $img.css({ "max-height": "none", "max-width": "95vw", "cursor": "zoom-out" }).data("expanded", true);
            }
        },

        row_cell_animal: function(row, ri) {
            const value = row.matched_animal_id ? ' value="' + row.matched_animal_id + '"' : '';
            return '<input type="hidden" class="asm-animalchooser row-animal" data-ri="' + ri + '"' + value + ' />';
        },

        animal_link: function(a) {
            return '<a href="animal?id=' + a.id + '" target="_blank">' +
                html.title(a.name + " (" + a.code + ")") + '</a>';
        },

        /**
         * Build the chip-vs-existing indicator string.
         * extracted: chip from the sheet, existing: chip currently on the picked animal.
         */
        chip_compare_indicator: function(extracted, existing) {
            if (!extracted) { return ""; }
            if (!existing) {
                return '<span style="color: #080;">' + html.title(_("No chip on record — will add")) + '</span>';
            }
            if (existing === extracted) {
                return '<span style="color: #080;">' + html.title(_("Chip already matches record")) + '</span>';
            }
            return '<span style="color: #c00; font-weight: bold;">' +
                html.title(_("Record currently has different chip:")) + " " +
                html.title(existing) + " — " + html.title(_("will be replaced")) + '</span>';
        },

        /**
         * Build the date-of-birth vs-existing indicator, mirroring chip_compare_indicator.
         */
        dob_compare_indicator: function(extracted, existing) {
            if (!extracted) { return ""; }
            if (!existing) {
                return '<span style="color: #080;">' + html.title(_("No DoB on record — will add")) + '</span>';
            }
            if (existing === extracted) { return ""; }
            return '<span style="color: #c00; font-weight: bold;">' +
                html.title(_("Record currently has different DoB:")) + " " +
                html.title(existing) + " — " + html.title(_("will be replaced")) + '</span>';
        },

        row_cell_status: function(row) {
            let cls = "status-ok";
            let parts = [];
            if (row.warnings && row.warnings.length) {
                cls = row.matched_animal_id ? "status-warn" : "status-error";
                parts = row.warnings.map(html.title);
            } else {
                parts.push(html.title(_("Ready")));
            }

            // Show chip/DoB-vs-existing indicators for the auto-matched single candidate
            if (row.matched_animal_id && row.candidates && row.candidates.length === 1) {
                const cand = row.candidates[0];
                const chipInd = bulk_microchip.chip_compare_indicator(row.microchip, cand.existing_chip);
                if (chipInd) { parts.push(chipInd); }
                const dobInd = bulk_microchip.dob_compare_indicator(row.date_of_birth, cand.existing_dob);
                if (dobInd) {
                    parts.push(dobInd);
                    if (cand.existing_dob && cand.existing_dob !== row.date_of_birth) {
                        cls = "status-warn";
                    }
                }
            }

            if (row.candidates && row.candidates.length > 1) {
                const links = row.candidates.map(bulk_microchip.animal_link).join(", ");
                parts.push(html.title(_("Matches:")) + " " + links);
            }
            if (row.chip_in_use_by && row.chip_in_use_by.length) {
                const links = row.chip_in_use_by.map(bulk_microchip.animal_link).join(", ");
                parts.push(html.title(_("Chip already on:")) + " " + links);
                cls = "status-warn";
            }
            const colour = cls === "status-ok" ? "#080" : (cls === "status-warn" ? "#a60" : "#c00");
            return '<span class="status-main" style="color: ' + colour + ';">' + parts.join(" — ") + '</span>';
        },

        render_results: function(rows) {
            this.rows = rows;
            const body = [];
            $.each(rows, function(ri, row) {
                const check_attr = row.matched_animal_id ? 'checked="checked"' : '';
                body.push('<tr data-ri="' + ri + '">');
                body.push('<td data-label="' + html.title(_("Include")) + '"><input type="checkbox" class="row-check" ' + check_attr + ' /></td>');
                body.push('<td data-label="' + html.title(_("Row")) + '" style="font-weight: bold; color: #555;">' + (ri + 1) + '</td>');
                body.push('<td data-label="' + html.title(_("Name (extracted)")) + '">' + html.title(row.name || "—") + '</td>');
                body.push('<td data-label="' + html.title(_("Microchip")) + '">' + html.title(row.microchip || "—"));
                if (row.chip_source === "barcode") {
                    body.push(' <span title="' + html.title(_("Verified by barcode scanner")) +
                        '" style="color: #080; font-size: 0.85em;">✓</span>');
                } else if (row.microchip) {
                    body.push(' <span title="' + html.title(_("Vision OCR only — not verified by barcode scanner. Please double-check.")) +
                        '" style="color: #c80; font-size: 0.85em;">⚠</span>');
                }
                body.push('</td>');
                body.push('<td data-label="' + html.title(_("Implant date")) + '"><input type="text" class="row-date asm-textbox-date" value="' +
                    html.title(row.implant_date || "") + '" /></td>');
                body.push('<td data-label="' + html.title(_("Date of Birth")) + '"><input type="text" class="row-dob asm-textbox-date" value="' +
                    html.title(row.date_of_birth || "") + '" /></td>');
                body.push('<td data-label="' + html.title(_("Sex")) + '">' +
                    '<select class="row-sex asm-selectbox">' +
                        '<option value=""' + (row.sex ? '' : ' selected="selected"') + '></option>' +
                        '<option value="M"' + (row.sex === "M" ? ' selected="selected"' : '') + '>' + _("Male") + '</option>' +
                        '<option value="F"' + (row.sex === "F" ? ' selected="selected"' : '') + '>' + _("Female") + '</option>' +
                    '</select></td>');
                body.push('<td data-label="' + html.title(_("Animal to update")) + '">' + bulk_microchip.row_cell_animal(row, ri) + '</td>');
                body.push('<td class="status-cell" data-label="' + html.title(_("Status")) + '">' + bulk_microchip.row_cell_status(row) + '</td>');
                body.push('</tr>');
            });
            $("#results-body").html(body.join("\n"));
            $("#results-hint").text(_("Rows with no match are unchecked — use the Animal to update field to pick the right animal, then tick the checkbox."));
            $("#results-wrap").show();

            // Instantiate the standard ASM animal chooser widget on each row.
            // Hide the "Add an animal" button — users shouldn't be creating animals from here.
            $("#results-body .row-animal").animalchooser()
                .bind("animalchooserchange", function(event, rec) {
                    const $tr = $(this).closest("tr");
                    $tr.find(".row-check").prop("checked", true);
                    bulk_microchip.rebuild_status_for_picked(rec, $tr);
                })
                .bind("animalchooserloaded", function(event, rec) {
                    bulk_microchip.rebuild_status_for_picked(rec, $(this).closest("tr"));
                })
                .bind("animalchoosercleared", function() {
                    const $tr = $(this).closest("tr");
                    $tr.find(".row-check").prop("checked", false);
                    bulk_microchip.restore_original_status($tr);
                });
            $("#results-body .animalchooser-link-new").hide();

            // Pre-load the matched animal display for rows that came in pre-matched.
            $("#results-body .row-animal").each(function() {
                const id = parseInt($(this).val() || 0, 10);
                if (id) {
                    $(this).animalchooser("loadbyid", id);
                }
            });
        },

        /**
         * When an animal is picked via the chooser, replace the original server-side
         * status (which was based on the extracted name) with one based on the picked
         * animal. Keeps the chip-in-use-by warning since that's independent of the pick.
         */
        rebuild_status_for_picked: function(rec, $tr) {
            if (!rec) { return; }
            const ri = parseInt($tr.data("ri"), 10);
            const row = bulk_microchip.rows[ri];
            if (!row) { return; }

            const parts = [html.title(_("Ready"))];
            let cls = "status-ok";

            const chipInd = bulk_microchip.chip_compare_indicator(row.microchip, rec.IDENTICHIPNUMBER || "");
            if (chipInd) { parts.push(chipInd); }

            // The chooser returns DOB as YYYY-MM-DD HH:MM:SS; take the date portion.
            const recDob = (rec.DATEOFBIRTH || "").slice(0, 10);
            const dobInd = bulk_microchip.dob_compare_indicator(row.date_of_birth, recDob);
            if (dobInd) {
                parts.push(dobInd);
                if (recDob && recDob !== row.date_of_birth) { cls = "status-warn"; }
            }

            if (row.chip_in_use_by && row.chip_in_use_by.length) {
                const links = row.chip_in_use_by
                    .filter(function(a) { return a.id !== rec.ID; })
                    .map(bulk_microchip.animal_link).join(", ");
                if (links) {
                    parts.push(html.title(_("Chip already on:")) + " " + links);
                    cls = "status-warn";
                }
            }
            const colour = cls === "status-warn" ? "#a60" : "#080";
            $tr.find(".status-cell").html(
                '<span class="status-main" style="color: ' + colour + ';">' + parts.join(" — ") + '</span>');
        },

        /**
         * When the chooser is cleared, put the original server-side status back —
         * which includes the "No animal matches this name" warning etc.
         */
        restore_original_status: function($tr) {
            const ri = parseInt($tr.data("ri"), 10);
            const row = bulk_microchip.rows[ri];
            if (!row) { return; }
            $tr.find(".status-cell").html(bulk_microchip.row_cell_status(row));
        },

        process_images: async function() {
            // Keep indices aligned with rotations when building the payload.
            const pairs = this.images
                .map(function(img, i) { return { img: img, rot: bulk_microchip.rotations[i] || 0 }; })
                .filter(function(p) { return p.img !== null; });
            if (!pairs.length) { return; }

            // Show processing UI with model info + elapsed counter.
            const model = controller.vision_model || _("(model not configured)");
            const temp = controller.vision_temperature;
            const started = Date.now();
            const renderMeta = function() {
                const secs = Math.floor((Date.now() - started) / 1000);
                $("#processing-meta").text(
                    _("model:") + " " + model + " · " +
                    _("temperature:") + " " + temp + " · " +
                    _("elapsed:") + " " + secs + "s");
            };
            renderMeta();
            const tick = setInterval(renderMeta, 1000);

            $("#processing").show();
            $("#btn-process").prop("disabled", true);
            $("#apply-result").hide();
            try {
                const rotated = await Promise.all(pairs.map(function(p) {
                    return bulk_microchip.apply_rotation(p.img, p.rot);
                }));
                bulk_microchip.processed_images = rotated;
                const body = "mode=extract&images=" + encodeURIComponent(JSON.stringify(rotated));
                const resp = await common.ajax_post("bulk_microchip", body);
                const data = typeof resp === "string" ? JSON.parse(resp) : resp;
                if (!data.success) {
                    header.show_error(_("Extraction failed:") + " " + (data.message || ""));
                    return;
                }
                if (!data.rows.length) {
                    header.show_info(_("No rows found in the image(s)."));
                    $("#results-wrap").hide();
                    return;
                }
                bulk_microchip.render_results(data.rows);
            } catch (err) {
                header.show_error(_("Extraction failed:") + " " + err);
            } finally {
                clearInterval(tick);
                $("#processing").hide();
                $("#btn-process").prop("disabled", false);
            }
        },

        collect_confirmed: function() {
            const confirmed = [];
            $("#results-body tr").each(function() {
                const $tr = $(this);
                if (!$tr.find(".row-check").is(":checked")) { return; }
                const animal_id = parseInt($tr.find(".row-animal").val() || 0, 10);
                if (!animal_id) { return; }
                const ri = parseInt($tr.data("ri"), 10);
                const row = bulk_microchip.rows[ri];
                confirmed.push({
                    animal_id: animal_id,
                    microchip: row.microchip,
                    implant_date: $tr.find(".row-date").val(),
                    date_of_birth: $tr.find(".row-dob").val(),
                    sex: $tr.find(".row-sex").val()
                });
            });
            return confirmed;
        },

        apply_confirmed: async function() {
            const confirmed = this.collect_confirmed();
            if (!confirmed.length) {
                header.show_info(_("No rows confirmed for update."));
                return;
            }
            $("#btn-apply").prop("disabled", true);
            try {
                const body = "mode=apply" +
                    "&rows=" + encodeURIComponent(JSON.stringify(confirmed)) +
                    "&images=" + encodeURIComponent(JSON.stringify(bulk_microchip.processed_images || []));
                const resp = await common.ajax_post("bulk_microchip", body);
                const data = typeof resp === "string" ? JSON.parse(resp) : resp;
                const applied_n = (data.applied || []).length;
                const errors_n = data.errors ? data.errors.length : 0;
                const parts = [];
                if (data.success) {
                    const bg = errors_n > 0 ? "#fff4d6" : "#dff5e0";
                    const bd = errors_n > 0 ? "#d4a017" : "#2a8a3c";
                    const fg = errors_n > 0 ? "#6a4f00" : "#17572a";
                    const icon = errors_n > 0 ? "⚠" : "✓";
                    parts.push('<div style="background: ' + bg + '; border: 2px solid ' + bd +
                        '; color: ' + fg + '; border-radius: 8px; padding: 1em 1.25em; font-size: 1.2em; font-weight: bold; text-align: center;">');
                    parts.push('<div style="font-size: 2em; margin-bottom: 0.2em;">' + icon + '</div>');
                    parts.push('<div>' + html.title(_("Updated:") + " " + applied_n) + '</div>');
                    if (errors_n > 0) {
                        parts.push('<div style="margin-top: 0.4em; font-size: 0.9em;">' +
                            html.title(_("Errors:") + " " + errors_n) + '</div>');
                        parts.push('<ul style="text-align: left; font-size: 0.75em; font-weight: normal; margin: 0.5em 0 0 1em;">');
                        $.each(data.errors, function(i, e) {
                            parts.push('<li>' + html.title(_("Animal ID") + " " + e.animal_id + ": " + e.error) + '</li>');
                        });
                        parts.push('</ul>');
                    }
                    parts.push('</div>');
                } else {
                    parts.push('<div style="background: #fbe1e1; border: 2px solid #c00; color: #700; border-radius: 8px; padding: 1em 1.25em; font-size: 1.15em; font-weight: bold; text-align: center;">');
                    parts.push('<div style="font-size: 2em; margin-bottom: 0.2em;">✗</div>');
                    parts.push('<div>' + html.title(_("Apply failed:") + " " + (data.message || "")) + '</div>');
                    parts.push('</div>');
                }
                $("#apply-result").html(parts.join("")).show();
                // Scroll the banner into view so mobile users see it immediately
                if ($("#apply-result")[0] && $("#apply-result")[0].scrollIntoView) {
                    $("#apply-result")[0].scrollIntoView({ behavior: "smooth", block: "center" });
                }
                // remove applied rows visually
                if (data.success && data.applied) {
                    $("#results-body tr").each(function() {
                        const $tr = $(this);
                        const aid = parseInt($tr.find(".row-animal").val() || 0, 10);
                        if (data.applied.indexOf(aid) !== -1) {
                            $tr.css("opacity", 0.5).find("input,select,button").prop("disabled", true);
                            $tr.find(".row-check").prop("checked", false);
                        }
                    });
                }
            } catch (err) {
                header.show_error(_("Apply failed:") + " " + err);
            } finally {
                $("#btn-apply").prop("disabled", false);
            }
        },

        clear_all: function() {
            // Destroy any active animalchooser widgets before wiping the DOM
            try { $("#results-body .row-animal").animalchooser("destroy"); } catch (e) {}
            this.images = [];
            this.rotations = [];
            this.rows = [];
            this.processed_images = [];
            $("#thumbnails").empty();
            $("#results-body").empty();
            $("#results-wrap").hide();
            $("#apply-result").hide().empty();
            $("#orient-hint").hide();
            $("#btn-process").prop("disabled", true);
            $("#input-camera, #input-gallery").val("");
        },

        bind_page: function() {
            $("#btn-camera").click(function() { $("#input-camera").click(); });
            $("#btn-gallery").click(function() { $("#input-gallery").click(); });
            $("#btn-clear").click(function() { bulk_microchip.clear_all(); });

            $("#input-camera, #input-gallery").on("change", function() {
                if (this.files && this.files.length) {
                    bulk_microchip.add_images(this.files);
                }
                $(this).val("");
            });

            $("#thumbnails").on("click", ".thumb-remove", function(e) {
                e.stopPropagation();
                bulk_microchip.remove_image(parseInt($(this).data("idx"), 10));
            });
            $("#thumbnails").on("click", ".thumb-rotate", function(e) {
                e.stopPropagation();
                bulk_microchip.rotate_image(parseInt($(this).data("idx"), 10));
            });
            $("#thumbnails").on("click", ".thumb-img", function() {
                bulk_microchip.toggle_expand($(this));
            });

            $("#btn-process").click(function() { bulk_microchip.process_images(); });
            $("#btn-apply").click(function() { bulk_microchip.apply_confirmed(); });

            $("#check-all").click(function() {
                const checked = $(this).is(":checked");
                $("#results-body .row-check").prop("checked", checked);
            });
        },

        render: function() { return bulk_microchip.render_page(); },
        bind: function() { bulk_microchip.bind_page(); },
        sync: function() {
            bulk_microchip.images = [];
            bulk_microchip.rotations = [];
            bulk_microchip.rows = [];
            bulk_microchip.processed_images = [];
        },
        destroy: function() { return false; },

        name: "bulk_microchip",
        animation: "newdata",
        title: function() { return _("Bulk microchip update"); },

        routes: {
            "bulk_microchip": function() {
                common.module_loadandstart("bulk_microchip", "bulk_microchip");
            }
        }
    };

    common.module_register(bulk_microchip);

});
