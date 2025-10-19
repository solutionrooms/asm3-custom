/*global $, jQuery, _, additional, asm, common, config, controller, dlgfx, format, header, html, validate */

$(function() {

    "use strict";

    const animal_induction = {

        /** Only attempt to set the non-shelter animal type once per reset */
        set_nonsheltertype_once: false,

        weight_in_grams: function() {
            return config.bool("ShowWeightInGrams");
        },

        kg_to_grams_string: function(value) {
            if (value === null || value === undefined) { return ""; }
            const trimmed = String(value).trim();
            if (trimmed === "") { return ""; }
            const kg = format.to_float(trimmed);
            if (isNaN(kg)) { return trimmed; }
            if (trimmed.indexOf(".") === -1 && Math.abs(kg) >= 100) {
                return trimmed;
            }
            return Math.round(kg * 1000).toString();
        },

        grams_to_kg_string: function(value) {
            if (value === null || value === undefined) { return ""; }
            const trimmed = String(value).trim();
            if (trimmed === "") { return ""; }
            const grams = format.to_float(trimmed);
            if (isNaN(grams)) { return trimmed; }
            return parseFloat((grams / 1000).toFixed(3)).toString();
        },

        /**
         * Populates age group options from server data
         */
        populate_agegroup_options: function() {
            if (controller.agegroups && controller.agegroups.length > 0) {
                let options = '<option value="">' + _("Select age range") + '</option>';
                $.each(controller.agegroups, function(i, v) {
                    options += '<option value="' + html.title(v) + '">' + html.title(v) + '</option>';
                });
                $("#entryagerange").html(options);
            }
        },

        /** Ensure the photo tile matches the image aspect ratio */
        update_photo_tile_aspect: function(w, h) {
            try {
                const W = parseInt(w, 10);
                const H = parseInt(h, 10);
                if (!W || !H) { return; }
                $("#photo-upload-tile").css("aspect-ratio", W + " / " + H);
            } catch (e) {}
        },

        render: function() {
            return [
                '<div id="dialog-similar" style="display: none" title="' + _("Similar Animal") + '">',
                '<p><span class="ui-icon ui-icon-alert"></span>',
                _("This animal has the same name as another animal recently added to the system.") + '<br /><br />',
                '<span class="similar-animal"></span>',
                '</p>',
                '</div>',
                '<div id="dialog-media-viewer" style="display:none;" title="' + _("Photo") + '">',
                '  <img id="dialog-media-viewer-img" alt="" style="max-width:90vw;max-height:80vh;display:block;margin:0 auto;" />',
                '</div>',
                '<div id="dialog-photo-source" style="display:none;" title="' + _("Add Photo") + '">',
                '  <p>' + _("How would you like to add a photo?") + '</p>',
                '</div>',
                html.content_header(_("Patient Admission")),
                '<div class="patient-induction-form">',
                '<style>',
                '.patient-induction-form {',
                '    max-width: 1200px;',
                '    margin: 0 auto;',
                '    background: linear-gradient(145deg, #f8f9fa, #e9ecef);',
                '    border-radius: 15px;',
                '    padding: 30px;',
                '    box-shadow: 0 8px 32px rgba(0,0,0,0.1);',
                '}',
                /* Media grid (thumbnails up to 4) */
                '.media-grid {',
                '  display: grid;',
                '  grid-template-columns: repeat(4, minmax(80px, 1fr));',
                '  gap: 10px;',
                '}',
                '@media (max-width: 900px) { .media-grid { grid-template-columns: repeat(3, 1fr); } }',
                '@media (max-width: 640px) { .media-grid { grid-template-columns: repeat(2, 1fr); } }',
                '.media-slot {',
                '  position: relative;',
                '  background: #f9fbfd;',
                '  border: 1px dashed #cfd6df;',
                '  border-radius: 8px;',
                '  aspect-ratio: 1 / 1;',
                '  overflow: hidden;',
                '  display: flex;',
                '  align-items: center;',
                '  justify-content: center;',
                '}',
                '.media-slot img {',
                '  width: 100%; height: 100%; object-fit: cover; display: none;',
                '}',
                '.media-slot.filled img { display: block; }',
                '.media-slot .media-empty-hint {',
                '  font-size: 12px; color: #6c757d; text-align: center; padding: 6px;',
                '}',
                '.media-actions {',
                '  position: absolute; bottom: 4px; left: 4px; right: 4px;',
                '  display: flex; gap: 4px; justify-content: space-between;',
                '}',
                '.media-actions button {',
                '  font-size: 11px; padding: 2px 6px; line-height: 1.2;',
                '}',
                '.media-badge {',
                '  position: absolute; top: 4px; left: 4px;',
                '  background: #28a745; color: #fff; font-size: 10px;',
                '  padding: 2px 5px; border-radius: 10px;',
                '  display: none;',
                '}',
                '.media-slot.default .media-badge { display: inline-block; }',
                '.media-slot.dragover { outline: 2px dashed #8fb1ff; outline-offset: -2px; }',
                '@media (max-width: 768px) {',
                '  #button-upload-photo { width: 100%; font-size: 16px; padding: 10px 14px; }',
                '}',
                '.form-section {',
                '    display: block;',
                '    margin-bottom: 30px;',
                '}',
                '.form-group {',
                '    background: white;',
                '    padding: 20px;',
                '    border-radius: 10px;',
                '    box-shadow: 0 4px 16px rgba(0,0,0,0.05);',
                '    border: 1px solid #e0e6ed;',
                '    transition: all 0.3s ease;',
                '}',
                '.form-group:hover {',
                '    transform: translateY(-2px);',
                '    box-shadow: 0 8px 24px rgba(0,0,0,0.1);',
                '}',
                '.form-group h3 {',
                '    margin: 0 0 20px 0;',
                '    padding-bottom: 10px;',
                '    border-bottom: 2px solid #007bff;',
                '    color: #2c3e50;',
                '    font-size: 18px;',
                '    font-weight: 600;',
                '}',
                '.field-row {',
                '    display: grid;',
                '    grid-template-columns: 1fr 2fr;',
                '    gap: 15px;',
                '    margin-bottom: 15px;',
                '    align-items: center;',
                '}',
                '.field-label {',
                '    font-weight: 500;',
                '    color: #495057;',
                '    text-align: right;',
                '    padding-right: 10px;',
                '}',
                '.field-input {',
                '    display: flex;',
                '    align-items: center;',
                '    gap: 10px;',
                '}',
                '.field-input input, .field-input select, .field-input textarea {',
                '    border: 2px solid #e9ecef;',
                '    border-radius: 8px;',
                '    padding: 8px 12px;',
                '    font-size: 14px;',
                '    transition: border-color 0.3s ease;',
                '    flex: 1;',
                '}',
                '.field-input input:focus, .field-input select:focus, .field-input textarea:focus {',
                '    border-color: #007bff;',
                '    outline: none;',
                '    box-shadow: 0 0 0 3px rgba(0,123,255,0.1);',
                '}',
                '.field-input textarea {',
                '    resize: vertical;',
                '    min-height: 80px;',
                '}',
                '.inspection-section {',
                '    background: white;',
                '    padding: 25px;',
                '    border-radius: 10px;',
                '    box-shadow: 0 4px 16px rgba(0,0,0,0.05);',
                '    border: 1px solid #e0e6ed;',
                '    margin-bottom: 30px;',
                '    transition: all 0.3s ease;',
                '}',
                '.inspection-section:hover {',
                '    transform: translateY(-2px);',
                '    box-shadow: 0 8px 24px rgba(0,0,0,0.1);',
                '}',
                '.inspection-section h3 {',
                '    margin: 0 0 25px 0;',
                '    padding-bottom: 15px;',
                '    border-bottom: 3px solid #28a745;',
                '    color: #2c3e50;',
                '    font-size: 20px;',
                '    font-weight: 600;',
                '    text-align: center;',
                '}',
                '.inspection-grid {',
                '    display: grid;',
                '    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));',
                '    gap: 16px;',
                '    align-items: start;',
                '}',
                '.inspection-item {',
                '    background: #ffffff;',
                '    border: 2px solid #e9ecef;',
                '    border-radius: 10px;',
                '    padding: 16px;',
                '    transition: all 0.3s ease;',
                '    position: relative;',
                '    min-height: 70px;',
                '    display: flex;',
                '    flex-direction: column;',
                '    box-shadow: 0 2px 4px rgba(0,0,0,0.08);',
                '}',
                '.inspection-item:hover {',
                '    transform: translateY(-2px);',
                '    box-shadow: 0 4px 12px rgba(0,0,0,0.15);',
                '    border-color: #007bff;',
                '}',
                '/* Yes/No clickable cards */',
                '.inspection-item.yesno-field {',
                '    cursor: pointer;',
                '    user-select: none;',
                '    background: #f8f9fa;',
                '    border: 2px solid #dee2e6;',
                '    transition: all 0.3s ease;',
                '    min-height: 80px;',
                '    justify-content: center;',
                '    align-items: center;',
                '    text-align: center;',
                '}',
                '.inspection-item.yesno-field:hover {',
                '    background: #e3f2fd;',
                '    border-color: #2196f3;',
                '}',
                '.inspection-item.yesno-field.checked {',
                '    background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%);',
                '    border-color: #28a745;',
                '    color: #155724;',
                '}',
                '.inspection-item.yesno-field.checked:hover {',
                '    background: linear-gradient(135deg, #c3e6cb 0%, #b1dfbb 100%);',
                '    border-color: #1e7e34;',
                '}',
                '.inspection-item.yesno-field .yesno-label {',
                '    font-weight: 600;',
                '    font-size: 14px;',
                '    margin: 0;',
                '}',
                '.inspection-item.yesno-field .yesno-status {',
                '    font-size: 12px;',
                '    opacity: 0.7;',
                '    margin-top: 4px;',
                '}',
                '.inspection-item.yesno-field.checked .yesno-status::before {',
                '    content: "✓ ";',
                '    font-weight: bold;',
                '}',
                '.inspection-item.yesno-field:not(.checked) .yesno-status::before {',
                '    content: "○ ";',
                '    opacity: 0.5;',
                '}',
                '/* Hide the actual checkbox */',
                '.inspection-item.yesno-field input[type="checkbox"] {',
                '    display: none;',
                '}',
                '/* Select dropdown fields */',
                '.inspection-item.select-field {',
                '    min-height: 85px;',
                '}',
                '/* Tablet and mobile responsive */',
                '@media (max-width: 768px) {',
                '    .inspection-grid {',
                '        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));',
                '        gap: 12px;',
                '    }',
                '    .inspection-item {',
                '        padding: 14px;',
                '        min-height: 65px;',
                '    }',
                '    .inspection-item.yesno-field {',
                '        min-height: 70px;',
                '    }',
                '    .inspection-item.yesno-field .yesno-label {',
                '        font-size: 13px;',
                '    }',
                '}',
                '@media (max-width: 480px) {',
                '    .inspection-grid {',
                '        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));',
                '        gap: 10px;',
                '    }',
                '    .inspection-item {',
                '        padding: 12px;',
                '        min-height: 60px;',
                '    }',
                '}',
                '.inspection-field-label {',
                '    font-weight: 600;',
                '    color: #495057;',
                '    margin-bottom: 6px;',
                '    display: block;',
                '    font-size: 13px;',
                '    line-height: 1.3;',
                '}',
                '.inspection-item select, .inspection-item input:not([type="checkbox"]), .inspection-item textarea {',
                '    width: 100%;',
                '    padding: 8px 12px;',
                '    border: 2px solid #e9ecef;',
                '    border-radius: 6px;',
                '    background: white;',
                '    font-size: 14px;',
                '    color: #495057;',
                '    transition: border-color 0.3s ease;',
                '}',
                '.inspection-item select:focus, .inspection-item input:focus, .inspection-item textarea:focus {',
                '    border-color: #007bff;',
                '    outline: none;',
                '    box-shadow: 0 0 0 3px rgba(0,123,255,0.1);',
                '}',
                '/* Responsive adjustments */',
                '@media (max-width: 768px) {',
                '    .inspection-grid {',
                '        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));',
                '        gap: 12px;',
                '    }',
                '    .inspection-item {',
                '        padding: 10px 12px;',
                '        min-height: 55px;',
                '    }',
                '    .inspection-item.checkbox-field {',
                '        min-height: 40px;',
                '        padding: 8px 12px;',
                '    }',
                '    .inspection-field-label {',
                '        font-size: 12px;',
                '    }',
                '}',
                '.inspection-item select:focus {',
                '    border-color: #28a745;',
                '    outline: none;',
                '    box-shadow: 0 0 0 3px rgba(40,167,69,0.1);',
                '}',
                '.remedial-actions-grid {',
                '    display: grid;',
                '    grid-template-columns: 1fr;',
                '    gap: 16px;',
                '    align-items: start;',
                '}',
                '.remedial-actions-grid .inspection-item {',
                '    background: #ffffff;',
                '    border: 2px solid #e9ecef;',
                '    border-radius: 10px;',
                '    padding: 16px;',
                '    transition: all 0.3s ease;',
                '    position: relative;',
                '    min-height: 70px;',
                '    display: flex;',
                '    flex-direction: column;',
                '    box-shadow: 0 2px 4px rgba(0,0,0,0.08);',
                '}',
                '.remedial-actions-grid .inspection-item:hover {',
                '    transform: translateY(-2px);',
                '    box-shadow: 0 4px 12px rgba(0,0,0,0.15);',
                '    border-color: #007bff;',
                '}',
                '.remedial-actions-grid .inspection-item textarea {',
                '    min-height: 100px;',
                '    resize: vertical;',
                '}',
                '/* Floating save button */',
                '.floating-save-container {',
                '    position: fixed;',
                '    bottom: 20px;',
                '    right: 20px;',
                '    z-index: 1000;',
                '    display: flex;',
                '    gap: 10px;',
                '    background: white;',
                '    padding: 10px 15px;',
                '    border-radius: 25px;',
                '    box-shadow: 0 4px 20px rgba(0,0,0,0.15);',
                '    border: 1px solid #e0e6ed;',
                '}',
                '.floating-save-container .ui-button {',
                '    font-weight: 600;',
                '    padding: 8px 20px;',
                '    border-radius: 20px;',
                '    transition: all 0.3s ease;',
                '}',
                '.floating-save-container .ui-button:hover {',
                '    transform: translateY(-2px);',
                '    box-shadow: 0 4px 12px rgba(0,0,0,0.2);',
                '}',
                '/* Hide original buttons on mobile */',
                '@media (max-width: 768px) {',
                '    .asm-toolbar {',
                '        display: none !important;',
                '    }',
                '}',
                '.inspection-item select option[value="No"] { color: #28a745; }',
                '.inspection-item select option[value="Slight"] { color: #ffc107; }',
                '.inspection-item select option[value="Moderate"] { color: #fd7e14; }',
                '.inspection-item select option[value="Severe"] { color: #dc3545; }',
                '.inspection-item.inspection-no { border-color: #28a745; background: #d4edda; }',
                '.inspection-item.inspection-slight { border-color: #ffc107; background: #fff3cd; }',
                '.inspection-item.inspection-moderate { border-color: #fd7e14; background: #ffeaa7; }',
                '.inspection-item.inspection-severe { border-color: #dc3545; background: #f8d7da; }',
                /* Default-value match coloring for Physical Inspection */
                '.inspection-item.default-ok { border-color: #28a745; background: #d4edda; }',
                '.inspection-item.default-mismatch { border-color: #dc3545; background: #f8d7da; }',
                '.inspection-item.yesno-field.default-ok { background: #d4edda !important; border-color: #28a745 !important; color: #155724; }',
                '.inspection-item.yesno-field.default-mismatch { background: #f8d7da !important; border-color: #dc3545 !important; color: #721c24; }',
                '.field-callout {',
                '    grid-column: 2;',
                '    font-size: 12px;',
                '    color: #6c757d;',
                '    margin-top: 5px;',
                '    font-style: italic;',
                '}',
                '#microchiprow .field-input { flex-direction: column; align-items: flex-start; }',
                '#microchiprow .chip-subrow { display: flex; gap: 10px; margin-top: 6px; width: 100%; }',
                '@media (max-width: 640px) { #microchiprow .chip-subrow { flex-direction: column; gap: 6px; } }',
                '@media (max-width: 768px) {',
                '    .form-section { grid-template-columns: 1fr; gap: 20px; }',
                '    .field-row { grid-template-columns: 1fr; gap: 8px; }',
                '    .field-label { text-align: left; padding-right: 0; }',
                '}',
                '</style>',

                '<div class="form-section">',
                '    <div class="form-group">',
                '        <h3>' + _("Basic Information") + '</h3>',
                '        <div class="field-row" id="coderow">',
                '            <div class="field-label">' + _("Code") + '</div>',
                '            <div class="field-input">',
                                tableform.render_text({ post_field: "sheltercode", justwidget: true }),
                                tableform.render_text({ post_field: "shortcode", justwidget: true, placeholder: "Short" }),
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="namerow">',
                '            <div class="field-label">' + _("Name") + ' <span class="asm-has-validation">*</span></div>',
                '            <div class="field-input">',
                                tableform.render_text({ post_field: "animalname", justwidget: true }),
                '                <button id="button-animalname" type="button" title="' + _("Generate a random name for this animal") + '">🎲</button>',
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="entryagerangerow">',
                '            <div class="field-label">' + _("Entry Age Range") + ' <span class="asm-has-validation">*</span></div>',
                '            <div class="field-input"><div id="entry-age-range-container"></div></div>',
                '            <div class="field-callout">' + _("Select age range to auto-calculate estimated date of birth") + '</div>',
                '        </div>',
                '        <div class="field-row">',
                '            <div class="field-label">' + _("Date of Birth") + '</div>',
                '            <div class="field-input">',
                                tableform.render_date({ post_field: "dateofbirth", justwidget: true }),
                '            </div>',
                '        </div>',
                '        <div class="field-row">',
                '            <div class="field-label">' + _("Estimated DOB") + '</div>',
                '            <div class="field-input">',
                                tableform.render_check({ post_field: "estimateddob", justwidget: true }),
                '            </div>',
                '        </div>',
                '        <div class="field-row">',
                '            <div class="field-label">' + _("Sex") + '</div>',
                '            <div class="field-input">',
                                tableform.render_select({ post_field: "sex", justwidget: true, options: { displayfield: "SEX", rows: controller.sexes }}),
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="weightrow">',
                '            <div class="field-label">' + _("Weight") + '</div>',
                '            <div class="field-input">',
                                tableform.render_number({ post_field: "weight", justwidget: true }),
                '                <label>' + _("kg") + '</label>',
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="microchiprow">',
                '            <div class="field-label">' + _("Microchipped") + '</div>',
                '            <div class="field-input">',
                                tableform.render_check({ post_field: "microchipped", justwidget: true }),
                '                <div class="chip-subrow">',
                                    tableform.render_date({ post_field: "microchipdate", justwidget: true, placeholder: _("Date") }),
                                    tableform.render_text({ post_field: "microchipnumber", maxlength: 15, justwidget: true, placeholder: _("Number") }),
                '                </div>',
                '            </div>',
                '        </div>',
                '    </div>',

                '    <div class="form-group">',
                '        <h3>' + _("Animal Details") + '</h3>',
                '        <div class="field-row">',
                '            <div class="field-label">' + _("Type") + '</div>',
                '            <div class="field-input">',
                                tableform.render_select({ post_field: "animaltype", justwidget: true, options: { displayfield: "ANIMALTYPE", rows: controller.animaltypes }}),
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="colourrow">',
                '            <div class="field-label">' + _("Base Color") + '</div>',
                '            <div class="field-input">',
                                tableform.render_select({ post_field: "basecolour", justwidget: true, options: { displayfield: "BASECOLOUR", rows: controller.colours }}),
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="coattyperow">',
                '            <div class="field-label">' + _("Coat Type") + '</div>',
                '            <div class="field-input">',
                                tableform.render_select({ post_field: "coattype", justwidget: true, options: { displayfield: "COATTYPE", rows: controller.coattypes }}),
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="kilosrow">',
                '            <div class="field-label">' + _("Weight") + '</div>',
                '            <div class="field-input">',
                                tableform.render_number({ post_field: "weight", justwidget: true }),
                '                <label id="kglabel">' + _("kg") + '</label>',
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="poundsrow">',
                '            <div class="field-label">' + _("Weight") + '</div>',
                '            <div class="field-input">',
                                tableform.render_intnumber({ post_field: "weightlb", justwidget: true }),
                '                <label id="lblabel">' + _("lb") + '</label>',
                                tableform.render_intnumber({ post_field: "weightoz", justwidget: true }),
                '                <label id="ozlabel">' + _("oz") + '</label>',
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="sizerow">',
                '            <div class="field-label">' + _("Size") + '</div>',
                '            <div class="field-input">',
                                tableform.render_select({ post_field: "size", justwidget: true, options: { displayfield: "SIZE", rows: controller.sizes }}),
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="descriptionrow">',
                '            <div class="field-label" style="align-self: flex-start; padding-top: 8px;">' + _("Description") + '</div>',
                '            <div class="field-input">',
                                tableform.render_textarea({ post_field: "comments", justwidget: true, rows: 4 }),
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="photosrow">',
                '            <div class="field-label" style="align-self:flex-start; padding-top:8px;">' + _("Photos") + '</div>',
                '            <div class="field-input" style="flex-direction: column; align-items: stretch;">',
                '                <input id="induction-photo-file" type="file" accept="image/*" capture="environment" style="display:none;" />',
                '                <input id="induction-photo-library" type="file" accept="image/*" style="display:none;" />',
                '                <div id="media-grid" class="media-grid">',
                '                    <div class="media-slot" data-index="0">',
                '                      <span class="media-empty-hint">' + _("Tap to add a photo") + '</span>',
                '                      <span class="media-badge">' + _("Default") + '</span>',
                '                      <img alt="" />',
                '                      <div class="media-actions" style="display:none;">',
                '                        <button type="button" class="make-default">' + _("Make default") + '</button>',
                '                        <button type="button" class="delete">' + _("Delete") + '</button>',
                '                      </div>',
                '                    </div>',
                '                    <div class="media-slot" data-index="1">',
                '                      <span class="media-empty-hint">' + _("Tap to add a photo") + '</span>',
                '                      <span class="media-badge">' + _("Default") + '</span>',
                '                      <img alt="" />',
                '                      <div class="media-actions" style="display:none;">',
                '                        <button type="button" class="make-default">' + _("Make default") + '</button>',
                '                        <button type="button" class="delete">' + _("Delete") + '</button>',
                '                      </div>',
                '                    </div>',
                '                    <div class="media-slot" data-index="2">',
                '                      <span class="media-empty-hint">' + _("Tap to add a photo") + '</span>',
                '                      <span class="media-badge">' + _("Default") + '</span>',
                '                      <img alt="" />',
                '                      <div class="media-actions" style="display:none;">',
                '                        <button type="button" class="make-default">' + _("Make default") + '</button>',
                '                        <button type="button" class="delete">' + _("Delete") + '</button>',
                '                      </div>',
                '                    </div>',
                '                    <div class="media-slot" data-index="3">',
                '                      <span class="media-empty-hint">' + _("Tap to add a photo") + '</span>',
                '                      <span class="media-badge">' + _("Default") + '</span>',
                '                      <img alt="" />',
                '                      <div class="media-actions" style="display:none;">',
                '                        <button type="button" class="make-default">' + _("Make default") + '</button>',
                '                        <button type="button" class="delete">' + _("Delete") + '</button>',
                '                      </div>',
                '                    </div>',
                '                </div>',
                '                <div style="margin-top:8px;">',
                '                  <button id="button-upload-photo" type="button" class="ui-button ui-widget ui-state-default ui-corner-all">' +
                '                      <span class="ui-icon ui-icon-image"></span> ' + _("Upload Photo") +
                '                  </button>',
                '                </div>',
                '            </div>',
                '        </div>',
                '        <!-- Hidden fields for hedgehog constants -->',
                '        <div style="display: none;">',
                '            <div class="field-row">',
                '                <div class="field-label">' + _("Species") + '</div>',
                '                <div class="field-input">',
                                    tableform.render_select({ post_field: "species", justwidget: true, options: { displayfield: "SPECIESNAME", rows: controller.species }}),
                '                </div>',
                '            </div>',
                '            <div class="field-row" id="breedrow">',
                '                <div class="field-label">' + _("Breed") + '</div>',
                '                <div class="field-input">',
                                    tableform.render_select({ post_field: "breed1", justwidget: true, options: html.list_to_options_breeds(controller.breeds) }),
                '                    <span id="crossbreedcol">',
                                        tableform.render_check({ post_field: "crossbreed", label: _("Crossbreed"), justwidget: true }),
                '                    </span>',
                '                    <span id="secondbreedcol">',
                                        tableform.render_select({ post_field: "breed2", justwidget: true, options: html.list_to_options_breeds(controller.breeds) }),
                '                    </span>',
                '                </div>',
                '            </div>',
                '        </div>',
                '    </div>',
                '</div>',

                '<div class="form-section">',
                '    <div class="form-group">',
                '        <h3>' + _("Location & Housing") + '</h3>',
                '        <div class="field-row" id="locationrow">',
                '            <div class="field-label">' + _("Internal Location") + '</div>',
                '            <div class="field-input">',
                                tableform.render_select({ post_field: "internallocation", justwidget: true, options: { displayfield: "LOCATIONNAME", rows: controller.internallocations }}),
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="locationunitrow">',
                '            <div class="field-label">' + _("Unit") + '</div>',
                '            <div class="field-input">',
                                tableform.render_select({ post_field: "unit", justwidget: true, options: "" }),
                '            </div>',
                '            <div class="field-callout">' + _("Unit within the location, eg: pen or cage number") + '</div>',
                '        </div>',
                '        <div class="field-row" id="fostererrow">',
                '            <div class="field-label">' + _("Fosterer") + '</div>',
                '            <div class="field-input">',
                                tableform.render_person({ post_field: "fosterer", justwidget: true, personfilter: "fosterer" }),
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="coordinatorrow">',
                '            <div class="field-label">' + _("Adoption Coordinator") + '</div>',
                '            <div class="field-input">',
                                tableform.render_person({ post_field: "adoptioncoordinator", justwidget: true, personfilter: "coordinator" }),
                '            </div>',
                '        </div>',
                '    </div>',

                '</div>',

                '<div class="form-section">',
                '    <div class="form-group">',
                '        <h3>' + _("Entry Information") + '</h3>',
                '        <div class="field-row">',
                '            <div class="field-label">' + _("Entry Type") + '</div>',
                '            <div class="field-input">',
                                tableform.render_select({ post_field: "entrytype", justwidget: true, options: { displayfield: "ENTRYTYPENAME", rows: controller.entrytypes }}),
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="entryreasonrow">',
                '            <div class="field-label">' + _("Entry Category") + '</div>',
                '            <div class="field-input">',
                                tableform.render_select({ post_field: "entryreason", justwidget: true, options: { displayfield: "REASONNAME", rows: controller.entryreasons }}),
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="datebroughtinrow">',
                '            <div class="field-label">' + _("Date Brought In") + '</div>',
                '            <div class="field-input">',
                                tableform.render_date({ post_field: "datebroughtin", justwidget: true }),
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="timebroughtinrow">',
                '            <div class="field-label">' + _("Time Brought In") + '</div>',
                '            <div class="field-input">',
                                tableform.render_time({ post_field: "timebroughtin", justwidget: true }),
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="feerow">',
                '            <div class="field-label">' + _("Adoption Fee") + '</div>',
                '            <div class="field-input">',
                                tableform.render_currency({ post_field: "fee", justwidget: true }),
                '            </div>',
                '        </div>',
                '    </div>',

                '</div>',

                '<div class="form-section">',
                '    <div class="form-group">',
                '        <h3>' + _("Found Location") + '</h3>',
                '        <div class="field-row">',
                '            <div class="field-label">' + _("Weather Conditions") + '</div>',
                '            <div class="field-input">',
                                tableform.render_select({ 
                                    post_field: "entrylocationweather", 
                                    justwidget: true, 
                                    options: '<option value="">' + _("Select weather") + '</option>' +
                                           '<option value="Freezing">' + _("Freezing") + '</option>' +
                                           '<option value="Cold">' + _("Cold") + '</option>' +
                                           '<option value="Warm">' + _("Warm") + '</option>' +
                                           '<option value="Hot">' + _("Hot") + '</option>'
                                }),
                '            </div>',
                '            <div class="field-callout">' + _("Weather conditions when the animal was found") + '</div>',
                '        </div>',
                '        <div class="field-row">',
                '            <div class="field-label">' + _("Found By") + '</div>',
                '            <div class="field-input">',
                                tableform.render_person({ post_field: "entryfoundbyperson", justwidget: true }),
                '            </div>',
                '            <div class="field-callout">' + _("Person who found the animal") + '</div>',
                '        </div>',
                '        <div class="field-row">',
                '            <div class="field-label" style="align-self: flex-start; padding-top: 8px;">' + _("Location Description") + '</div>',
                '            <div class="field-input">',
                                tableform.render_textarea({ post_field: "entrylocationdescription", justwidget: true, rows: 4 }),
                '            </div>',
                '            <div class="field-callout">' + _("Detailed description of where the animal was found") + '</div>',
                '        </div>',
                '    </div>',


                '</div>',

                '<!-- Full-width Inspection Section -->',
                '<div class="inspection-section">',
                '    <h3>' + _("Physical Inspection") + '</h3>',
                '    <div class="inspection-grid" id="inspection-fields">',
                '        <!-- Inspection fields will be rendered here by additional fields system -->',
                '    </div>',
                '</div>',

                '<!-- Full-width Remedial Actions Section -->',
                '<div class="inspection-section">',
                '    <h3>' + _("Remedial Actions") + '</h3>',
                '    <div class="remedial-actions-grid" id="remedial-actions-fields">',
                '        <!-- Remedial action fields will be rendered here by additional fields system -->',
                '    </div>',
                '</div>',

                '</div>',
                tableform.buttons_render([
                   { id: "save", icon: "save", text: _("Save") },
                   { id: "reset", icon: "delete", text: _("Reset") },
                   { id: "barcode", icon: "print", text: _("Print QR Label") },
                   { id: "delete", icon: "delete", text: _("Delete") }
                ], { centered: true }),
                html.content_footer()
            ].join("\n");
        },

        /**
         * Render inspection additional fields in the inspection grid
         */
        render_inspection_fields: function() {
            let inspectionHtml = '';
            
            // Find all additional fields that start with "entryinspection"
            $.each(controller.additional, function(i, field) {
                if (field.FIELDNAME && field.FIELDNAME.toLowerCase().startsWith('entryinspection')) {
                    // Get the display name (remove "entryinspection" prefix and make it readable)
                    let displayName = field.FIELDNAME.substring(15); // Remove "entryinspection" prefix
                    displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1); // Capitalize first letter
                    
                    // Use field label if available, otherwise use the formatted name
                    let label = field.FIELDLABEL || displayName;
                    let fieldId = 'add_' + field.ID;
                    let postAttr = 'a.' + field.MANDATORY + '.' + field.ID;
                    
                    // Add appropriate CSS class based on field type for optimal layout
                    let itemClass = 'inspection-item';
                    if (field.FIELDTYPE == 0) { // Yes/No checkbox
                        itemClass += ' yesno-field';
                    } else if (field.FIELDTYPE == 6 || field.FIELDTYPE == 7) { // Select/Multi-select
                        itemClass += ' select-field';
                    }
                    
                    inspectionHtml += '<div class="' + itemClass + '" data-field-id="' + fieldId + '">';
                    
                    // Determine default value for field (string form)
                    let defaultVal = '';
                    if (field.DEFAULTVALUE !== undefined && field.DEFAULTVALUE !== null) {
                        defaultVal = String(field.DEFAULTVALUE);
                    }
                    // Render the appropriate field widget based on field type
                    if (field.FIELDTYPE == 0) { // YESNO - Clickable card
                        inspectionHtml += '<div class="yesno-label">' + label;
                        if (field.MANDATORY == 1) {
                            inspectionHtml += '<span class="asm-has-validation">*</span>';
                        }
                        inspectionHtml += '</div>';
                        inspectionHtml += '<div class="yesno-status">No</div>';
                        // Store default as 1/0 for yes/no
                        let defyn = (String(defaultVal).trim().toLowerCase() == '1' || String(defaultVal).trim().toLowerCase() == 'yes' || String(defaultVal).trim().toLowerCase() == 'true') ? '1' : '0';
                        inspectionHtml += '<input id="' + fieldId + '" type="checkbox" class="asm-checkbox additional" ';
                        inspectionHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" data-ftype="' + field.FIELDTYPE + '" data-default="' + defyn + '" ';
                        inspectionHtml += 'title="' + html.title(field.TOOLTIP) + '" />';
                        
                    } else {
                        // Regular label for non-checkbox fields
                        inspectionHtml += '<label class="inspection-field-label" for="' + fieldId + '">' + label;
                        if (field.MANDATORY == 1) {
                            inspectionHtml += '<span class="asm-has-validation">*</span>';
                        }
                        inspectionHtml += '</label>';
                        
                        if (field.FIELDTYPE == 1) { // TEXT - Text input
                            inspectionHtml += '<input id="' + fieldId + '" type="text" class="asm-textbox additional" ';
                            inspectionHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" data-ftype="' + field.FIELDTYPE + '" data-default="' + html.title(defaultVal) + '" ';
                            inspectionHtml += 'title="' + html.title(field.TOOLTIP) + '" />';
                            
                        } else if (field.FIELDTYPE == 2) { // NOTES - Textarea
                            inspectionHtml += '<textarea id="' + fieldId + '" class="asm-textareafixed additional" ';
                            inspectionHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" data-ftype="' + field.FIELDTYPE + '" data-default="' + html.title(defaultVal) + '" ';
                            inspectionHtml += 'title="' + html.title(field.TOOLTIP) + '"></textarea>';
                            
                        } else if (field.FIELDTYPE == 3) { // NUMBER - Number input
                            inspectionHtml += '<input id="' + fieldId + '" type="text" class="asm-textbox asm-numberbox additional" ';
                            inspectionHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" data-ftype="' + field.FIELDTYPE + '" data-default="' + html.title(defaultVal) + '" ';
                            inspectionHtml += 'title="' + html.title(field.TOOLTIP) + '" />';
                            
                        } else if (field.FIELDTYPE == 4) { // DATE - Date input
                            inspectionHtml += '<input id="' + fieldId + '" type="text" class="asm-textbox asm-datebox additional" ';
                            inspectionHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" data-ftype="' + field.FIELDTYPE + '" data-default="' + html.title(defaultVal) + '" ';
                            inspectionHtml += 'title="' + html.title(field.TOOLTIP) + '" />';
                            
                        } else if (field.FIELDTYPE == 5) { // MONEY - Currency input
                            inspectionHtml += '<input id="' + fieldId + '" type="text" class="asm-textbox asm-currencybox additional" ';
                            inspectionHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" data-ftype="' + field.FIELDTYPE + '" data-default="' + html.title(defaultVal) + '" ';
                            inspectionHtml += 'title="' + html.title(field.TOOLTIP) + '" />';
                            
                        } else if (field.FIELDTYPE == 6) { // LOOKUP - Select dropdown
                            inspectionHtml += '<select id="' + fieldId + '" class="asm-selectbox additional" ';
                            inspectionHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" data-ftype="' + field.FIELDTYPE + '" data-default="' + html.title(defaultVal) + '" ';
                            inspectionHtml += 'title="' + html.title(field.TOOLTIP) + '">';
                            inspectionHtml += '<option value="">' + _("Select...") + '</option>';
                            
                            // Parse the lookup values
                            if (field.LOOKUPVALUES) {
                                let values = field.LOOKUPVALUES.split('|');
                                $.each(values, function(j, value) {
                                    if (value.trim()) {
                                        inspectionHtml += '<option value="' + html.title(value.trim()) + '">' + value.trim() + '</option>';
                                    }
                                });
                            }
                            inspectionHtml += '</select>';
                            
                        } else if (field.FIELDTYPE == 7) { // MULTI_LOOKUP - Multi-select
                            // Normalise default list values for comparison
                            let deflist = [];
                            if (defaultVal) { deflist = defaultVal.split('|').map(function(s){ return s.trim(); }).filter(Boolean).sort(); }
                            inspectionHtml += '<select id="' + fieldId + '" class="asm-bsmselect additional" multiple="multiple" ';
                            inspectionHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" data-ftype="' + field.FIELDTYPE + '" data-default="' + html.title(deflist.join('|')) + '" ';
                            inspectionHtml += 'title="' + html.title(field.TOOLTIP) + '">';
                            
                            // Parse the lookup values for multi-select
                            if (field.LOOKUPVALUES) {
                                let values = field.LOOKUPVALUES.split('|');
                                $.each(values, function(j, value) {
                                    if (value.trim()) {
                                        inspectionHtml += '<option value="' + html.title(value.trim()) + '">' + value.trim() + '</option>';
                                    }
                                });
                            }
                            inspectionHtml += '</select>';
                            
                        } else {
                            // Fallback for other field types - render as text input
                            inspectionHtml += '<input id="' + fieldId + '" type="text" class="asm-textbox additional" ';
                            inspectionHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" ';
                            inspectionHtml += 'title="' + html.title(field.TOOLTIP) + '" />';
                        }
                    }
                    
                    inspectionHtml += '</div>';
                }
            });
            
            // Insert the generated HTML into the inspection grid
            $("#inspection-fields").html(inspectionHtml);
            
            // Re-initialize styling and widgets for the new fields
            setTimeout(function() {
                animal_induction.init_inspection_widgets();
                animal_induction.init_inspection_yesno_cards();
                animal_induction.init_inspection_styling();
                animal_induction.populate_inspection_fields();
            }, 100);
        },

        /**
         * Render remedial actions additional fields in the remedial actions grid
         */
        render_remedial_actions_fields: function() {
            let remedialActionsHtml = '';
            
            // Find all additional fields that start with "entryaction"
            $.each(controller.additional, function(i, field) {
                if (field.FIELDNAME && field.FIELDNAME.toLowerCase().startsWith('entryaction')) {
                    // Get the display name (remove "entryaction" prefix and make it readable)
                    let displayName = field.FIELDNAME.substring(11); // Remove "entryaction" prefix
                    displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1); // Capitalize first letter
                    
                    // Use field label if available, otherwise use the formatted name
                    let label = field.FIELDLABEL || displayName;
                    let fieldId = 'add_' + field.ID;
                    let postAttr = 'a.' + field.MANDATORY + '.' + field.ID;
                    
                    // Add appropriate CSS class based on field type for optimal layout
                    let itemClass = 'inspection-item';
                    if (field.FIELDTYPE == 0) { // Yes/No checkbox
                        itemClass += ' yesno-field';
                    } else if (field.FIELDTYPE == 6 || field.FIELDTYPE == 7) { // Select/Multi-select
                        itemClass += ' select-field';
                    }
                    
                    remedialActionsHtml += '<div class="' + itemClass + '" data-field-id="' + fieldId + '">';
                    
                    // Render the appropriate field widget based on field type
                    if (field.FIELDTYPE == 0) { // YESNO - Clickable card
                        remedialActionsHtml += '<div class="yesno-label">' + label;
                        if (field.MANDATORY == 1) {
                            remedialActionsHtml += '<span class="asm-has-validation">*</span>';
                        }
                        remedialActionsHtml += '</div>';
                        remedialActionsHtml += '<div class="yesno-status">No</div>';
                        remedialActionsHtml += '<input id="' + fieldId + '" type="checkbox" class="asm-checkbox additional" ';
                        remedialActionsHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" ';
                        remedialActionsHtml += 'title="' + html.title(field.TOOLTIP) + '" />';
                        
                    } else {
                        // Regular label for non-checkbox fields
                        remedialActionsHtml += '<label class="inspection-field-label" for="' + fieldId + '">' + label;
                        if (field.MANDATORY == 1) {
                            remedialActionsHtml += '<span class="asm-has-validation">*</span>';
                        }
                        remedialActionsHtml += '</label>';
                        
                        if (field.FIELDTYPE == 1) { // TEXT - Text input
                            remedialActionsHtml += '<input id="' + fieldId + '" type="text" class="asm-textbox additional" ';
                            remedialActionsHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" ';
                            remedialActionsHtml += 'title="' + html.title(field.TOOLTIP) + '" />';
                            
                        } else if (field.FIELDTYPE == 2) { // NOTES - Textarea
                            remedialActionsHtml += '<textarea id="' + fieldId + '" class="asm-textareafixed additional" ';
                            remedialActionsHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" ';
                            remedialActionsHtml += 'title="' + html.title(field.TOOLTIP) + '"></textarea>';
                            
                        } else if (field.FIELDTYPE == 3) { // NUMBER - Number input
                            remedialActionsHtml += '<input id="' + fieldId + '" type="text" class="asm-textbox asm-numberbox additional" ';
                            remedialActionsHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" ';
                            remedialActionsHtml += 'title="' + html.title(field.TOOLTIP) + '" />';
                            
                        } else if (field.FIELDTYPE == 4) { // DATE - Date input
                            remedialActionsHtml += '<input id="' + fieldId + '" type="text" class="asm-textbox asm-datebox additional" ';
                            remedialActionsHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" ';
                            remedialActionsHtml += 'title="' + html.title(field.TOOLTIP) + '" />';
                            
                        } else if (field.FIELDTYPE == 5) { // MONEY - Currency input
                            remedialActionsHtml += '<input id="' + fieldId + '" type="text" class="asm-textbox asm-currencybox additional" ';
                            remedialActionsHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" ';
                            remedialActionsHtml += 'title="' + html.title(field.TOOLTIP) + '" />';
                            
                        } else if (field.FIELDTYPE == 6) { // LOOKUP - Select dropdown
                            remedialActionsHtml += '<select id="' + fieldId + '" class="asm-selectbox additional" ';
                            remedialActionsHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" ';
                            remedialActionsHtml += 'title="' + html.title(field.TOOLTIP) + '">';
                            remedialActionsHtml += '<option value="">' + _("Select...") + '</option>';
                            
                            // Parse the lookup values
                            if (field.LOOKUPVALUES) {
                                let values = field.LOOKUPVALUES.split('|');
                                $.each(values, function(j, value) {
                                    if (value.trim()) {
                                        remedialActionsHtml += '<option value="' + html.title(value.trim()) + '">' + value.trim() + '</option>';
                                    }
                                });
                            }
                            remedialActionsHtml += '</select>';
                            
                        } else if (field.FIELDTYPE == 7) { // MULTI_LOOKUP - Multi-select
                            remedialActionsHtml += '<select id="' + fieldId + '" class="asm-bsmselect additional" multiple="multiple" ';
                            remedialActionsHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" ';
                            remedialActionsHtml += 'title="' + html.title(field.TOOLTIP) + '">';
                            
                            // Parse the lookup values for multi-select
                            if (field.LOOKUPVALUES) {
                                let values = field.LOOKUPVALUES.split('|');
                                $.each(values, function(j, value) {
                                    if (value.trim()) {
                                        remedialActionsHtml += '<option value="' + html.title(value.trim()) + '">' + value.trim() + '</option>';
                                    }
                                });
                            }
                            remedialActionsHtml += '</select>';
                            
                        } else {
                            // Fallback for other field types - render as text input
                            remedialActionsHtml += '<input id="' + fieldId + '" type="text" class="asm-textbox additional" ';
                            remedialActionsHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" ';
                            remedialActionsHtml += 'title="' + html.title(field.TOOLTIP) + '" />';
                        }
                    }
                    
                    remedialActionsHtml += '</div>';
                }
            });
            
            // If no fields found, show a message
            if (remedialActionsHtml === '') {
                remedialActionsHtml = '<div class="inspection-item"><p style="text-align: center; color: #6c757d; font-style: italic;">No remedial action fields configured. Please add additional fields with names starting with "entryaction" in ASM3 Settings > Options > Additional Fields.</p></div>';
            }
            
            // Insert the generated HTML into the remedial actions grid
            $("#remedial-actions-fields").html(remedialActionsHtml);
            
            // Re-initialize styling and widgets for the new fields
            setTimeout(function() {
                animal_induction.init_remedial_actions_widgets();
                animal_induction.init_remedial_actions_yesno_cards();
                animal_induction.init_remedial_actions_styling();
                animal_induction.populate_remedial_actions_fields();
            }, 100);
        },

        /**
         * Render the Entry Age Range additional field into the Basic Information section
         */
        render_entry_age_range_field: function() {
            let $container = $("#entry-age-range-container");
            if ($container.length == 0) { return; }
            // Find the additional field named 'entryagerange'
            let field = null;
            $.each(controller.additional, function(i, f) {
                if (f.FIELDNAME && f.FIELDNAME.toLowerCase() === 'entryagerange') { field = f; return false; }
            });
            let htmlOut = '';
            if (field) {
                htmlOut += '<select id="entryagerange" class="asm-selectbox additional" ' +
                           'data-id="' + field.ID + '" data-post="a.' + field.MANDATORY + '.' + field.ID + '" ' +
                           'title="' + html.title(field.TOOLTIP || '') + '">';
                htmlOut += '<option value="">' + _("Select age range") + '</option>';
                if (field.LOOKUPVALUES) {
                    let values = field.LOOKUPVALUES.split('|');
                    $.each(values, function(j, value) {
                        let v = value.trim(); if (!v) { return; }
                        htmlOut += '<option value="' + html.title(v) + '">' + v + '</option>';
                    });
                }
                htmlOut += '</select>';
            }
            else {
                // Fallback to static choices if additional field is missing
                htmlOut += '<select id="entryagerange" class="asm-selectbox">' +
                           '<option value="">' + _("Select age range") + '</option>' +
                           '<option value="Baby">Baby</option>' +
                           '<option value="Juvenile">Juvenile</option>' +
                           '<option value="Adult">Adult</option>' +
                           '<option value="Senior">Senior</option>' +
                           '</select>';
            }
            // Always include a hidden mirror that posts by stable name
            htmlOut += '<input id="entryagerange_post" type="hidden" class="asm-field" data-post="additionalentryagerange" />';
            $container.html(htmlOut);

            // Keep mirror value in sync
            const syncMirror = function() {
                const v = $("#entryagerange").val() || "";
                $("#entryagerange_post").val(v);
            };
            $(document).off('change.asm_entryage', '#entryagerange').on('change.asm_entryage', '#entryagerange', syncMirror);
            // Initial sync
            syncMirror();

            // Populate from saved additional value if present
            animal_induction.populate_entry_age_range_field();
        },

        /**
         * Populate the Entry Age Range field from additional VALUE if available
         */
        populate_entry_age_range_field: function() {
            const $sel = $("#entryagerange");
            if ($sel.length == 0) { return; }
            // Try additional value first
            let desired = null;
            $.each(controller.additional, function(i, f) {
                if (f.FIELDNAME && f.FIELDNAME.toLowerCase() === 'entryagerange') {
                    if (f.VALUE !== undefined && f.VALUE !== null && String(f.VALUE).trim() !== '') {
                        desired = String(f.VALUE);
                    }
                    return false;
                }
            });
            const applySelect = function(val) {
                if (!val) { return; }
                $sel.val(val);
                if ($sel.val() !== val) {
                    $sel.find('option').each(function() {
                        const t = $(this).text();
                        if (t && t.toLowerCase().indexOf(String(val).toLowerCase()) !== -1) {
                            $sel.val($(this).val());
                            return false;
                        }
                    });
                }
                $("#entryagerange_post").val($sel.val() || "");
            };
            if (desired) {
                applySelect(desired);
            } else {
                // Derive from DOB if no additional value present
                if (controller.animal && controller.animal.DATEOFBIRTH) {
                    const dob = format.date_js(controller.animal.DATEOFBIRTH);
                    if (dob) {
                        const today = new Date();
                        let months = (today.getFullYear() - dob.getFullYear()) * 12 + (today.getMonth() - dob.getMonth());
                        if (today.getDate() < dob.getDate()) { months -= 1; }
                        let label = "";
                        if (months < 12) { label = "Baby"; }
                        else if (months < 24) { label = "Juvenile"; }
                        else if (months < 60) { label = "Adult"; }
                        else { label = "Senior"; }
                        applySelect(label);
                    }
                }
            }
        },

        /**
         * Initialize inspection widgets (date pickers, currency boxes, etc.)
         */
        init_inspection_widgets: function() {
            // Initialize datepickers
            $("#inspection-fields .asm-datebox").datepicker({
                changeMonth: true,
                changeYear: true,
                yearRange: "-100:+10",
                dateFormat: "dd/mm/yy"
            });
            
            // Initialize currency boxes
            $("#inspection-fields .asm-currencybox").each(function() {
                $(this).currency();
            });
            
            // Initialize number boxes
            $("#inspection-fields .asm-numberbox").each(function() {
                $(this).number(true, 2);
            });
            
            // Initialize multi-select boxes
            $("#inspection-fields .asm-bsmselect").each(function() {
                $(this).asmselect({
                    animate: true,
                    sortable: true,
                    removeLabel: '<strong>&times;</strong>'
                });
            });
        },

        /**
         * Populate inspection fields with saved values
         */
        populate_inspection_fields: function() {
            $.each(controller.additional, function(i, field) {
                if (field.FIELDNAME && field.FIELDNAME.toLowerCase().startsWith('entryinspection')) {
                    let fieldId = 'add_' + field.ID;
                    let $element = $("#" + fieldId);
                    
                    if ($element.length && field.VALUE !== undefined && field.VALUE !== null) {
                        if (field.FIELDTYPE == 0) { // YESNO - Checkbox
                            let isChecked = field.VALUE == "1" || field.VALUE === true;
                            $element.prop('checked', isChecked);
                            
                            // Update the card appearance
                            let $card = $element.closest('.yesno-field');
                            let $status = $card.find('.yesno-status');
                            
                            if (isChecked) {
                                $card.addClass('checked');
                                $status.text('Yes');
                            } else {
                                $card.removeClass('checked');
                                $status.text('No');
                            }
                        } else if (field.FIELDTYPE == 1 || field.FIELDTYPE == 2 || field.FIELDTYPE == 3) { // TEXT, NOTES, NUMBER
                            $element.val(field.VALUE);
                        } else if (field.FIELDTYPE == 4) { // DATE
                            $element.val(field.VALUE);
                        } else if (field.FIELDTYPE == 5) { // MONEY
                            $element.currency("value", field.VALUE);
                        } else if (field.FIELDTYPE == 6) { // LOOKUP
                            $element.val(field.VALUE);
                        } else if (field.FIELDTYPE == 7) { // MULTI_LOOKUP
                            if (field.VALUE) {
                                let values = field.VALUE.split('|');
                                $element.val(values);
                            }
                        }
                    }
                }
            });
            // Apply default coloring after values are populated
            $("#inspection-fields input, #inspection-fields select, #inspection-fields textarea").each(function(){
                $(this).trigger('change');
            });
        },

        /**
         * Initialize yes/no clickable cards functionality
         */
        init_inspection_yesno_cards: function() {
            // Add click handlers for yes/no cards
            $("#inspection-fields .yesno-field").on('click', function() {
                const $card = $(this);
                const $checkbox = $card.find('input[type="checkbox"]');
                const $status = $card.find('.yesno-status');
                
                // Toggle checkbox state
                $checkbox.prop('checked', !$checkbox.prop('checked'));
                
                // Update card appearance
                if ($checkbox.prop('checked')) {
                    $card.addClass('checked');
                    $status.text('Yes');
                } else {
                    $card.removeClass('checked');
                    $status.text('No');
                }
                
                // Trigger change event for ASM3 form handling
                $checkbox.trigger('change');
            });
            
            // Initialize card states based on current checkbox values
            $("#inspection-fields .yesno-field").each(function() {
                const $card = $(this);
                const $checkbox = $card.find('input[type="checkbox"]');
                const $status = $card.find('.yesno-status');
                
                if ($checkbox.prop('checked')) {
                    $card.addClass('checked');
                    $status.text('Yes');
                } else {
                    $card.removeClass('checked');
                    $status.text('No');
                }
            });
        },

        /**
         * Initialize remedial actions widgets (date pickers, currency boxes, etc.)
         */
        init_remedial_actions_widgets: function() {
            // Initialize datepickers
            $("#remedial-actions-fields .asm-datebox").datepicker({
                changeMonth: true,
                changeYear: true,
                yearRange: "-100:+10",
                dateFormat: "dd/mm/yy"
            });
            
            // Initialize currency boxes
            $("#remedial-actions-fields .asm-currencybox").each(function() {
                $(this).currency();
            });
            
            // Initialize number boxes
            $("#remedial-actions-fields .asm-numberbox").each(function() {
                $(this).number(true, 2);
            });
            
            // Initialize multi-select boxes
            $("#remedial-actions-fields .asm-bsmselect").each(function() {
                $(this).asmselect({
                    animate: true,
                    sortable: true,
                    removeLabel: '<strong>&times;</strong>'
                });
            });
        },

        /**
         * Populate remedial actions fields with saved values
         */
        populate_remedial_actions_fields: function() {
            $.each(controller.additional, function(i, field) {
                if (field.FIELDNAME && field.FIELDNAME.toLowerCase().startsWith('entryaction')) {
                    let fieldId = 'add_' + field.ID;
                    let $element = $("#" + fieldId);
                    
                    if ($element.length && field.VALUE !== undefined && field.VALUE !== null) {
                        if (field.FIELDTYPE == 0) { // YESNO - Checkbox
                            let isChecked = field.VALUE == "1" || field.VALUE === true;
                            $element.prop('checked', isChecked);
                            
                            // Update the card appearance
                            let $card = $element.closest('.yesno-field');
                            let $status = $card.find('.yesno-status');
                            
                            if (isChecked) {
                                $card.addClass('checked');
                                $status.text('Yes');
                            } else {
                                $card.removeClass('checked');
                                $status.text('No');
                            }
                        } else if (field.FIELDTYPE == 1 || field.FIELDTYPE == 2 || field.FIELDTYPE == 3) { // TEXT, NOTES, NUMBER
                            $element.val(field.VALUE);
                        } else if (field.FIELDTYPE == 4) { // DATE
                            $element.val(field.VALUE);
                        } else if (field.FIELDTYPE == 5) { // MONEY
                            $element.currency("value", field.VALUE);
                        } else if (field.FIELDTYPE == 6) { // LOOKUP
                            $element.val(field.VALUE);
                        } else if (field.FIELDTYPE == 7) { // MULTI_LOOKUP
                            if (field.VALUE) {
                                let values = field.VALUE.split('|');
                                $element.val(values);
                            }
                        }
                    }
                }
            });
        },

        /**
         * Initialize remedial actions yes/no clickable cards functionality
         */
        init_remedial_actions_yesno_cards: function() {
            // Add click handlers for yes/no cards
            $("#remedial-actions-fields .yesno-field").on('click', function() {
                const $card = $(this);
                const $checkbox = $card.find('input[type="checkbox"]');
                const $status = $card.find('.yesno-status');
                
                // Toggle checkbox state
                $checkbox.prop('checked', !$checkbox.prop('checked'));
                
                // Update card appearance
                if ($checkbox.prop('checked')) {
                    $card.addClass('checked');
                    $status.text('Yes');
                } else {
                    $card.removeClass('checked');
                    $status.text('No');
                }
                
                // Trigger change event for ASM3 form handling
                $checkbox.trigger('change');
            });
            
            // Initialize card states based on current checkbox values
            $("#remedial-actions-fields .yesno-field").each(function() {
                const $card = $(this);
                const $checkbox = $card.find('input[type="checkbox"]');
                const $status = $card.find('.yesno-status');
                
                if ($checkbox.prop('checked')) {
                    $card.addClass('checked');
                    $status.text('Yes');
                } else {
                    $card.removeClass('checked');
                    $status.text('No');
                }
            });
        },

        /**
         * Initialize remedial actions dropdown styling and color coding
         */
        init_remedial_actions_styling: function() {
            $("#remedial-actions-fields select").each(function() {
                // Add color coding based on selected value
                $(this).change(function() {
                    const value = $(this).val();
                    const item = $(this).closest('.inspection-item');
                    
                    // Remove previous state classes
                    item.removeClass('inspection-no inspection-slight inspection-moderate inspection-severe');
                    
                    // Add appropriate class based on selection
                    if (value === 'No') {
                        item.addClass('inspection-no');
                    } else if (value === 'Slight') {
                        item.addClass('inspection-slight');
                    } else if (value === 'Moderate') {
                        item.addClass('inspection-moderate');
                    } else if (value === 'Severe') {
                        item.addClass('inspection-severe');
                    }
                });
                
                // Trigger change event to apply initial styling
                $(this).trigger('change');
            });
        },

        /**
         * Initialize inspection dropdown styling and color coding
         */
        init_inspection_styling: function() {
            // Utility to normalise values for comparison
            const normalise = function(v) {
                if (v === undefined || v === null) { return ''; }
                return String(v).trim().toLowerCase();
            };
            const equalsDefault = function($el) {
                const rawFtype = $el.data('ftype');
                const ftype = (rawFtype === undefined || rawFtype === null) ? -1 : parseInt(rawFtype, 10);
                const rawDef = $el.data('default');
                const def = (rawDef === undefined || rawDef === null) ? '' : String(rawDef).trim();
                if (ftype === 0) {
                    // Yes/No checkbox
                    const val = $el.prop('checked') ? '1' : '0';
                    return val === (def === '' ? '0' : def);
                } else if (ftype === 7) {
                    // Multi select
                    const sel = $el.val() || [];
                    const sval = sel.map(function(s){ return String(s).trim(); }).filter(Boolean).sort().join('|');
                    const dval = def.split('|').map(function(s){ return String(s).trim(); }).filter(Boolean).sort().join('|');
                    return sval === dval;
                } else {
                    const val = normalise($el.val());
                    const dval = normalise(def);
                    return val === dval;
                }
            };
            const applyClass = function($el) {
                const $item = $el.closest('.inspection-item');
                $item.removeClass('default-ok default-mismatch inspection-no inspection-slight inspection-moderate inspection-severe');
                if (equalsDefault($el)) { $item.addClass('default-ok'); } else { $item.addClass('default-mismatch'); }
            };

            // Bind to changes on all inputs in the inspection grid
            $("#inspection-fields").on('change keyup', 'input, select, textarea', function() {
                applyClass($(this));
            });
            // Initial pass
            $("#inspection-fields input, #inspection-fields select, #inspection-fields textarea").each(function(){ applyClass($(this)); });
        },

        /**
         * Add floating save/reset buttons for easier access
         */
        add_floating_buttons: function() {
            // Create floating button container if it doesn't exist
            if ($('.floating-save-container').length === 0) {
                $('body').append(
                    '<div class="floating-save-container">' +
                    '<button id="floating-save" type="button" class="ui-button ui-widget ui-state-default ui-corner-all" title="Save Progress">' +
                    '<span class="ui-icon ui-icon-disk"></span> Save' +
                    '</button>' +
                    '<button id="floating-reset" type="button" class="ui-button ui-widget ui-state-default ui-corner-all" title="Reset Form">' +
                    '<span class="ui-icon ui-icon-arrowrefresh-1-w"></span> Reset' +
                    '</button>' +
                    '</div>'
                );
                
                // Bind click events to existing functionality
                $('#floating-save').click(function() {
                    animal_induction.save_progress();
                });
                
                $('#floating-reset').click(function() {
                    animal_induction.reset();
                });
                
                // Initial visibility check - show buttons if toolbar is hidden (mobile)
                const $toolbar = $('.asm-toolbar');
                if ($toolbar.length === 0 || !$toolbar.is(':visible')) {
                    $('.floating-save-container').show();
                }
                
                // Hide floating buttons when original toolbar is visible
                $(window).scroll(function() {
                    const $toolbar = $('.asm-toolbar');
                    if ($toolbar.length > 0 && $toolbar.is(':visible')) {
                        const toolbarTop = $toolbar.offset().top;
                        const windowBottom = $(window).scrollTop() + $(window).height();
                        
                        if (windowBottom >= toolbarTop) {
                            // Original toolbar is visible, hide floating buttons
                            $('.floating-save-container').fadeOut(200);
                        } else {
                            // Original toolbar not visible, show floating buttons
                            $('.floating-save-container').fadeIn(200);
                        }
                    } else {
                        // No toolbar or toolbar is hidden (mobile), always show floating buttons
                        $('.floating-save-container').fadeIn(200);
                    }
                });
            }
        },

        /**
         * Posts the animal details to the backend.
         * mode: "add" to stay on this screen after post, anything else to edit the created animal
         */
        add_animal: async function(mode) {

            if (!animal_induction.validation()) { return; }

            $(".asm-content button").button("disable");
            header.show_loading(controller.animal ? _("Updating...") : _("Creating..."));
            let weightRestore = null;
            if (animal_induction.weight_in_grams()) {
                const rawWeight = $("#weight").val();
                if (rawWeight !== null && rawWeight !== undefined && String(rawWeight).trim() !== "") {
                    const converted = animal_induction.grams_to_kg_string(rawWeight);
                    if (converted !== "") {
                        weightRestore = rawWeight;
                        $("#weight").val(converted);
                    }
                }
            }
            let formdata = "mode=save&" + $("input, textarea, select").not(".chooser").toPOST();
            
            // Add animal ID if we're editing an existing animal
            if (controller.animal) {
                formdata += "&id=" + controller.animal.ID;
                formdata += "&recordversion=" + controller.animal.RECORDVERSION;
                // Debug logging removed for production
            } else {
                // Debug logging removed for production
            }
            // Debug logging removed for production
            
            // Parse and log specific key fields  
            // Debug logging removed for production
            
            try {
                // Mark as not dirty while attempting to save. If it fails, we'll restore it.
                if (typeof validate !== 'undefined' && validate.dirty) { validate.dirty(false); }
                const response = await common.ajax_post("animal_induction", formdata);
                // Defensive parsing in case response is missing or a different shape
                const parts = String(response || "").trim().split(/\s+/);
                const createdID = parts[0] || "0";
                const newCode = parts[1] || "";
                // Debug logging removed for production
                
                // Update record version after successful save to prevent "changed by another user" errors
                if (controller.animal && createdID) {
                    controller.animal.RECORDVERSION = parseInt(controller.animal.RECORDVERSION) + 1;
                    
                    // After successful save, the controller.animal object may have stale data
                    // For now, just let the normal sync process handle it
                } else {
                    // Debug logging removed for production
                }
                
                if (mode == "add") {
                    header.show_info(_("Animal '{0}' created with code {1}").replace("{0}", $("#animalname").val()).replace("{1}", newCode));
                }
                else {
                    if (createdID != "0") { 
                        if (controller.animal) {
                            // Check if location was changed away from Induction
                            const currentLocation = $("#internallocation option:selected").text();
                            
                            if (currentLocation && !currentLocation.toLowerCase().includes("induction")) {
                                // Location changed away from Induction, go to normal animal view
                                // Debug logging removed for production
                                setTimeout(function() {
                                    common.route("animal?id=" + createdID);
                                }, 1000);
                            } else {
                                // Still in Induction, reload current page
                                // Debug logging removed for production
                                setTimeout(function() {
                                    common.route_reload();
                                }, 1000);
                            }
                        } else {
                            // For new animals, go to regular animal view
                            common.route("animal?id=" + createdID); 
                        }
                    }
                }
            }
            finally {
                if (weightRestore !== null) {
                    $("#weight").val(weightRestore);
                }
                $(".asm-content button").button("enable");
                header.hide_loading();
            }
        },

        /**
         * Saves current progress by creating an animal record with minimal validation
         */
        save_progress: async function() {
            // Check that name is populated (required field)
            if (!$("#animalname").val() || $("#animalname").val().trim() === "") {
                header.show_error(_("Animal name is required to save progress"));
                $("#animalname").focus();
                return;
            }
            // If creating new, require Entry Age Range as well
            if (!controller.animal || !controller.animal.ID) {
                const ear = $("#entryagerange").val();
                if (!ear || String(ear).trim() === "") {
                    header.show_error(_("Entry Age Range is required"));
                    $("#entryagerange").focus();
                    return;
                }
            }

            $(".asm-content button").button("disable");
            header.show_loading(_("Saving progress..."));
            let weightRestore = null;
            if (animal_induction.weight_in_grams()) {
                const rawWeight = $("#weight").val();
                if (rawWeight !== null && rawWeight !== undefined && String(rawWeight).trim() !== "") {
                    const converted = animal_induction.grams_to_kg_string(rawWeight);
                    if (converted !== "") {
                        weightRestore = rawWeight;
                        $("#weight").val(converted);
                    }
                }
            }
            let formdata = "mode=save&" + $("input, textarea, select").not(".chooser").toPOST();
            
            // Add animal ID if we're editing an existing animal
            if (controller.animal) {
                formdata += "&id=" + controller.animal.ID;
                formdata += "&recordversion=" + controller.animal.RECORDVERSION;
            }
            try {
                const response = await common.ajax_post("animal_induction", formdata);
                const parts = String(response || "").trim().split(/\s+/);
                const animalID = parts[0] || "0";
                const code = parts[1] || "";
                
                // Update record version after successful save to prevent "changed by another user" errors
                if (controller.animal && animalID) {
                    controller.animal.RECORDVERSION = parseInt(controller.animal.RECORDVERSION) + 1;
                }
                // Clear dirty flag after a successful save
                if (typeof validate !== 'undefined' && validate.dirty) { validate.dirty(false); }
                
                if (animalID && animalID !== "0") {
                    if (controller.animal) {
                        // Check if location was changed away from Induction
                        const currentLocation = $("#internallocation option:selected").text();
                        
                        header.show_info(_("Animal '{0}' updated successfully.").replace("{0}", $("#animalname").val()));
                        
                        if (currentLocation && !currentLocation.toLowerCase().includes("induction")) {
                            // Location changed away from Induction, go to normal animal view
                            setTimeout(function() {
                                common.route("animal?id=" + animalID);
                            }, 1000);
                        } else {
                            // Still in Induction, reload current page
                            setTimeout(function() {
                                common.route_reload();
                            }, 1000);
                        }
                    } else {
                        // First save successful - reload page in edit mode to prevent duplicate name errors
                        header.show_info(_("Animal '{0}' saved with code {1}. Reloading to continue editing...").replace("{0}", $("#animalname").val()).replace("{1}", code));
                        setTimeout(function() {
                            common.route("animal_induction?id=" + animalID);
                        }, 1000);
                    }
                } else {
                    header.show_info(_("Progress saved successfully"));
                }
            }
            catch(err) {
                header.show_error(_("Failed to save progress: ") + err);
                // Restore dirty flag so the user can try again
                if (typeof validate !== 'undefined' && validate.dirty) { validate.dirty(true); }
            }
            finally {
                if (weightRestore !== null) {
                    $("#weight").val(weightRestore);
                }
                $(".asm-content button").button("enable");
                header.hide_loading();
            }
        },

        /**
         * Updates widget enabled/visable after changes
         */
        enable_widgets: function() {

            animal_induction.update_units();
                
            // Crossbreed flag being unset disables second breed field
            if ($("#crossbreed").is(":checked")) {
                $("#breed2").fadeIn();
            }
            else {
                $("#breed2").fadeOut();
                $("#breed2").select("value", ($("#breed1").val()));
            }

            // Not having any active litters disables join litter button
            if ($("#sellitter option").length == 0) {
                $("#button-litterjoin").button("disable");
            }

            // If the user ticked hold, there's no hold until date and
            // we have an auto remove days period, default the date
            if ($("#hold").is(":checked") && $("#holduntil").val() == "" && config.integer("AutoRemoveHoldDays") > 0) {
                let holddate = new Date().getTime();
                holddate += config.integer("AutoRemoveHoldDays") * 86400000;
                holddate = format.date( new Date(holddate) );
                $("#holduntil").val(holddate);
            }

            // If the user entered a hold until date and hold is not 
            // ticked, tick it
            if ($("#holduntil").val() != "" && !($("#hold").is(":checked"))) {
                $("#hold").prop("checked", true);
            }

            // Setting non-shelter should assign the non-shelter animal type
            // and show the original owner field as well as getting rid of
            // any fields that aren't relevant to non-shelter animals
            if ($("#nonshelter").is(":checked")) {
                $("#nsownerrow").fadeIn();
                if ($("#animaltype option[value='" + config.integer("AFNonShelterType") + "']").length > 0 && !animal_induction.set_nonsheltertype_once) { 
                    animal_induction.set_nonsheltertype_once = true;
                    $("#animaltype").select("value", config.integer("AFNonShelterType")); 
                }
                $("#holdrow, #locationrow, #locationunitrow, #fostererrow, #coordinatorrow, #litterrow, #entryreasonrow, #entrytyperow, #transferinrow, #datebroughtinrow, #timebroughtinrow, #broughtinbyrow, #originalownerrow, #pickuprow, #feerow").fadeOut();
            }
            else {
                $("#nsownerrow").fadeOut();
                if (config.bool("AddAnimalsShowAcceptance")) { $("#litterrow").fadeIn(); }
                if (config.bool("AddAnimalsShowBroughtInBy")) { $("#broughtinbyrow").fadeIn(); }
                if (config.bool("AddAnimalsShowDateBroughtIn")) { $("#datebroughtinrow").fadeIn(); }
                if (config.bool("AddAnimalsShowTimeBroughtIn")) { $("#timebroughtinrow").fadeIn(); }
                if (config.bool("AddAnimalsShowOriginalOwner")) { $("#originalownerrow").fadeIn(); }
                if (config.bool("AddAnimalsShowEntryCategory")) { $("#entryreasonrow").fadeIn(); }
                if (config.bool("AddAnimalsShowEntryType")) { 
                    $("#entrytyperow").fadeIn(); $("#transferinrow").fadeOut(); 
                }
                else {
                    $("#entrytyperow").fadeOut(); $("#transferinrow").fadeIn();
                }
                if (config.bool("AddAnimalsShowFee")) { $("#feerow").fadeIn(); }
                if (config.bool("AddAnimalsShowFosterer")) { $("#fostererrow").fadeIn(); }
                if (config.bool("AddAnimalsShowCoordinator")) { $("#coordinatorrow").fadeIn(); }
                if (config.bool("AddAnimalsShowHold")) { $("#holdrow").fadeIn(); }
                if (config.bool("AddAnimalsShowLocation")) { $("#locationrow").fadeIn(); }
                if (config.bool("AddAnimalsShowLocationUnit")) { $("#locationunitrow").fadeIn(); }
                if (config.bool("AddAnimalsShowPickup")) { $("#pickuprow").fadeIn(); }
            }

            // Fields that apply to both shelter and non-shelter animals based on config
            $("#jurisdictionrow").hide();
            if (config.bool("AddAnimalsShowJurisdiction")) { $("#jurisdictionrow").show(); }

            // Force-hide fields that should be permanently removed in this flow
            $("#coordinatorrow, #feerow, #kilosrow, #poundsrow").hide();

            // If transfer in is available and ticked, change the broughtinby label
            if (!config.bool("AddAnimalsShowEntryType") && $("#transferin").is(":checked")) {
                $("label[for='broughtinby']").html(_("Transferred From")); 
                $("#broughtinby").personchooser("set_filter", "shelter");
            }
            // If entry type is available and set to transfer, change the broughtinby label
            else if (config.bool("AddAnimalsShowEntryType") && $("#entrytype").val() == 3) { 
                $("label[for='broughtinby']").html(_("Transferred From")); 
                $("#broughtinby").personchooser("set_filter", "shelter");
            }
            else { 
                $("label[for='broughtinby']").html(_("Brought In By")); 
                $("#broughtinby").personchooser("set_filter", "all");
            }

        },

        /**
         * Uploads a photo for the current animal via the mobile uploader endpoint.
         * Requires an existing animal ID (ie: editing mode). Returns a promise.
         */
        upload_photo: function(file) {
            let deferred = $.Deferred();
            // Ensure record exists before attempting upload
            if (!controller.animal || !controller.animal.ID) {
                // Try a silent save to create the record if a name has been entered
                animal_induction.ensure_saved_for_media()
                    .then(function(){
                        // retry upload after save
                        return animal_induction.upload_photo(file).then(deferred.resolve, deferred.reject);
                    })
                    .fail(function(err){
                        deferred.reject(err || "noid");
                    });
                return deferred.promise();
            }
            let reader = new FileReader();
            reader.addEventListener("load", function() {
                let formdata = "animalid=" + controller.animal.ID +
                    "&type=gallery" +
                    "&filename=" + encodeURIComponent(file.name) +
                    "&filedata=" + encodeURIComponent(reader.result);
                header.show_loading(_("Uploading..."));
                $.ajax({
                    method: "POST",
                    url: "mobile_photo_upload",
                    data: formdata,
                    dataType: "text",
                    mimeType: "textPlain",
                    success: async function(mid) {
                        try {
                            // If this is the first photo, set as default
                            const hasAny = $("#media-grid .media-slot.filled").length > 0;
                            if (!hasAny) {
                                await common.ajax_post("media", "mode=web&ids=" + encodeURIComponent(mid));
                            }
                        } catch (e) {}
                        header.hide_loading();
                        header.show_info(_("Photo successfully uploaded."));
                        // Grid will be refreshed by caller
                        deferred.resolve(mid);
                    },
                    error: function(obj, error, errorthrown) {
                        header.hide_loading();
                        header.show_error(error || errorthrown || _("Failed to upload photo."));
                        deferred.reject(error || errorthrown);
                    },
                    complete: function() {}
                });
            }, false);
            reader.readAsDataURL(file);
            return deferred.promise();
        },

        /**
         * Ensures the animal has been created server-side so media can attach.
         * Returns a promise that resolves when an ID is available.
         * Does minimal validation: requires Name to be present.
         */
        ensure_saved_for_media: function() {
            let deferred = $.Deferred();
            const name = $("#animalname").val();
            if (!name || String(name).trim() === "") {
                header.show_error(_("Please enter a name before adding photos."));
                $("#animalname").focus();
                deferred.reject("noname");
                return deferred.promise();
            }
            if (controller.animal && controller.animal.ID) {
                deferred.resolve(controller.animal.ID);
                return deferred.promise();
            }
            // Silent minimal save without routing or UI disruption
            let formdata = "mode=save&" + $("input, textarea, select").not(".chooser").toPOST();
            common.ajax_post("animal_induction", formdata)
                .then(function(response){
                    const parts = String(response || "").trim().split(/\s+/);
                    const animalID = parts[0] || "0";
                    if (!animalID || animalID === "0") { deferred.reject("savefailed"); return; }
                    if (!controller.animal) { controller.animal = { ID: parseInt(animalID, 10), RECORDVERSION: 0 }; }
                    else { controller.animal.ID = parseInt(animalID, 10); }
                    deferred.resolve(controller.animal.ID);
                })
                .fail(function(err){ deferred.reject(err); });
            return deferred.promise();
        },

        /**
         * Loads media list for current animal and renders the 4-slot grid
         */
        load_media_list: async function() {
            try {
                if (!controller.animal || !controller.animal.ID) {
                    // Clear grid if no animal
                    $("#media-grid .media-slot").each(function() {
                        $(this).removeClass('filled default').attr('data-mid', '');
                        $(this).find('img').attr('src','').hide();
                        $(this).find('.media-actions').hide();
                        $(this).find('.media-empty-hint').show();
                    });
                    return;
                }
                const response = await common.ajax_post("mobile", "mode=loadanimal&id=" + controller.animal.ID);
                let data = {};
                try { data = jQuery.parseJSON(response); } catch(e) { data = {}; }
                let media = (data && data.media) ? data.media : [];
                // filter to jpg/jpeg images not excluded
                media = media.filter(function(m){
                    const name = String(m.MEDIANAME || "").toLowerCase();
                    const mimetype = String(m.MEDIAMIMETYPE || "").toLowerCase();
                    const isimg = mimetype.indexOf('image/jpeg') !== -1 || name.endsWith('.jpg') || name.endsWith('.jpeg');
                    const notexcluded = (m.EXCLUDEFROMPUBLISH === 0 || m.EXCLUDEFROMPUBLISH === null || m.EXCLUDEFROMPUBLISH === undefined);
                    return isimg && notexcluded;
                });
                // preferred first, then by Date desc (already desc from backend)
                media.sort(function(a,b){
                    const ap = (a.WEBSITEPHOTO ? 1 : 0);
                    const bp = (b.WEBSITEPHOTO ? 1 : 0);
                    if (ap !== bp) { return bp - ap; }
                    return 0;
                });
                animal_induction.render_media_grid(media.slice(0,4));
            } catch (e) {
                // Silent failure: keep grid as-is
            }
        },

        /**
         * Renders given media array into the 4-slot grid and binds actions
         */
        render_media_grid: function(items) {
            const $slots = $("#media-grid .media-slot");
            // Reset all
            $slots.each(function(){
                $(this).removeClass('filled default').attr('data-mid', '');
                $(this).find('img').attr('src','').hide();
                $(this).find('.media-actions').hide();
                $(this).find('.media-empty-hint').show();
            });
            // Fill slots
            $.each(items, function(i, m){
                const $slot = $slots.eq(i);
                if ($slot.length === 0) { return false; }
                const mid = m.ID;
                const isDefault = !!m.WEBSITEPHOTO;
                $slot.attr('data-mid', mid);
                $slot.addClass('filled');
                if (isDefault) { $slot.addClass('default'); }
                $slot.find('.media-empty-hint').hide();
                $slot.find('img')
                    .attr('src', 'image?db=' + asm.useraccount + '&mode=media&id=' + encodeURIComponent(mid))
                    .show();
                $slot.find('.media-actions').show();
            });
            // Bind action handlers
            animal_induction.bind_media_action_handlers();
        },

        /**
         * Binds Make Default and Delete handlers for media grid
         */
        bind_media_action_handlers: function() {
            $("#media-grid .media-slot .make-default").off('click').on('click', async function(e){
                e.preventDefault();
                const mid = $(this).closest('.media-slot').attr('data-mid');
                if (!mid) { return; }
                try {
                    await common.ajax_post("media", "mode=web&ids=" + encodeURIComponent(mid));
                    animal_induction.load_media_list();
                } catch (ex) {}
            });
            $("#media-grid .media-slot .delete").off('click').on('click', async function(e){
                e.preventDefault();
                const mid = $(this).closest('.media-slot').attr('data-mid');
                if (!mid) { return; }
                if (!confirm(_("Delete this photo?"))) { return; }
                try {
                    await common.ajax_post("media", "mode=delete&ids=" + encodeURIComponent(mid));
                    animal_induction.load_media_list();
                } catch (ex) {}
            });
            // View larger
            $("#media-grid .media-slot img").off('click').on('click', function(){
                const mid = $(this).closest('.media-slot').attr('data-mid');
                if (!mid) { return; }
                animal_induction.open_media_viewer(mid);
            });
            // Enable drag-to-reorder
            $("#media-grid .media-slot").attr('draggable', true)
                .off('dragstart').on('dragstart', function(ev){
                    try { ev.originalEvent.dataTransfer.setData('text/plain', $(this).attr('data-index')); } catch(e) {}
                    $(this).addClass('dragging');
                })
                .off('dragend').on('dragend', function(){ $(this).removeClass('dragging'); })
                .off('dragover').on('dragover', function(ev){ ev.preventDefault(); $(this).addClass('dragover'); })
                .off('dragleave').on('dragleave', function(){ $(this).removeClass('dragover'); })
                .off('drop').on('drop', function(ev){
                    ev.preventDefault();
                    $(this).removeClass('dragover');
                    let src = 0;
                    try { src = parseInt(ev.originalEvent.dataTransfer.getData('text/plain'), 10) || 0; } catch(e) { src = 0; }
                    const dst = parseInt($(this).attr('data-index'), 10) || 0;
                    if (src === dst) { return; }
                    animal_induction.swap_media_slots(src, dst);
                    animal_induction.apply_reorder();
                });

            // Click empty slot to upload (mobile friendly)
            $("#media-grid .media-slot").off('click.empty').on('click.empty', function(e){
                // Ignore clicks on action buttons or images (those have their own handlers)
                if ($(e.target).is('button') || $(e.target).is('img')) { return; }
                const isFilled = $(this).hasClass('filled');
                if (!isFilled) {
                    // Require name before allowing upload
                    const name = $("#animalname").val();
                    if (!name || String(name).trim() === "") {
                        header.show_error(_("Please enter a name before adding photos."));
                        $("#animalname").focus();
                        return;
                    }
                    animal_induction.prompt_photo_source();
                }
            });
        },

        /** Swap the contents of two media slots by index */
        swap_media_slots: function(i, j) {
            const $slots = $("#media-grid .media-slot");
            const $a = $slots.eq(i), $b = $slots.eq(j);
            if ($a.length === 0 || $b.length === 0) { return; }
            // Grab state of A
            const aMid = $a.attr('data-mid') || '';
            const aSrc = $a.find('img').attr('src') || '';
            const aFilled = $a.hasClass('filled');
            const aDefault = $a.hasClass('default');
            // Grab state of B
            const bMid = $b.attr('data-mid') || '';
            const bSrc = $b.find('img').attr('src') || '';
            const bFilled = $b.hasClass('filled');
            const bDefault = $b.hasClass('default');
            // Apply A->B
            $b.attr('data-mid', aMid);
            $b.toggleClass('filled', aFilled);
            $b.toggleClass('default', aDefault);
            $b.find('img').attr('src', aSrc).toggle(!!aSrc);
            $b.find('.media-actions').toggle(aFilled);
            $b.find('.media-empty-hint').toggle(!aFilled);
            // Apply B->A
            $a.attr('data-mid', bMid);
            $a.toggleClass('filled', bFilled);
            $a.toggleClass('default', bDefault);
            $a.find('img').attr('src', bSrc).toggle(!!bSrc);
            $a.find('.media-actions').toggle(bFilled);
            $a.find('.media-empty-hint').toggle(!bFilled);
        },

        /** After a reorder, ensure slot 0 is the default on server */
        apply_reorder: async function() {
            const mid0 = $("#media-grid .media-slot").eq(0).attr('data-mid');
            if (!mid0) { return; }
            try {
                await common.ajax_post("media", "mode=web&ids=" + encodeURIComponent(mid0));
                // Refresh grid to reflect default badge according to server state
                animal_induction.load_media_list();
            } catch (e) {}
        },

        /** Open a dialog to view a larger version of a photo */
        open_media_viewer: function(mid) {
            try {
                const src = 'image?db=' + asm.useraccount + '&mode=media&id=' + encodeURIComponent(mid);
                const $dlg = $("#dialog-media-viewer");
                const $img = $("#dialog-media-viewer-img");
                $img.attr('src', src);
                const w = Math.min($(window).width()*0.9, 1000);
                $dlg.dialog({ modal: true, width: w, resizable: true });
            } catch (e) {}
        },

        /** Prompt camera vs library before selecting a photo */
        prompt_photo_source: function() {
            try {
                $("#dialog-photo-source").dialog({
                    modal: true,
                    width: Math.min($(window).width()*0.9, 420),
                    buttons: [
                        { text: _("Take Photo"), click: function(){ $(this).dialog('close'); $("#induction-photo-file").trigger('click'); } },
                        { text: _("Choose from Library"), click: function(){ $(this).dialog('close'); $("#induction-photo-library").trigger('click'); } },
                        { text: _("Cancel"), click: function(){ $(this).dialog('close'); } }
                    ]
                });
            } catch (e) {
                // Fallback to camera input
                $("#induction-photo-file").trigger('click');
            }
        },

        /** Show only the minimum fields for a new record (Name + Entry Age Range) */
        apply_minimal_mode: function() {
            const isNew = !controller.animal || !controller.animal.ID;
            // Always show everything for existing animals
            if (!isNew) {
                $(".form-group, .inspection-section").show();
                $(".form-group .field-row").show();
                return;
            }
            // Hide all groups except the first Basic Information group
            const $groups = $(".patient-induction-form .form-group");
            $groups.hide();
            const $basic = $groups.first();
            $basic.show();
            // Hide all rows except Name and Entry Age Range
            $basic.find('.field-row').hide();
            $basic.find('#namerow, #entryagerangerow').show();
            // Hide other full-width sections
            $(".inspection-section").hide();
        },

        /* Update the breed selects to only show the breeds for the selected species.
         * If the species is not in the list of CrossbreedSpecies, hides the crossbreed/second species.
         * If there are no breeds for the species, includes a blank option with ID 0
         * */
        update_breed_select: function() {
            $('optgroup', $('#breed1')).remove();

            $('#breed1').children().each(function(){
                if($(this).attr('id') != 'ngp-'+$('#species').val()){
                    $(this).remove();
                }
            });

            if ($('#breed1 option').length == 0) {
                $('#breed1').append("<option value='0'></option>");
                //$('#breed1').append("<option value='0'>"+$('#species option:selected').text()+"</option>");
            }

            $('optgroup', $('#breed2')).remove();

            $('#breed2').children().each(function(){
                if($(this).attr('id') != 'ngp-'+$('#species').val()) {
                    $(this).remove();
                }
            });

            if ($('#breed2 option').length == 0) {
                $('#breed2').append("<option value='0'></option>");
            }

            if (common.array_in($("#species").val(), config.str("CrossbreedSpecies").split(",")) && !config.bool("UseSingleBreedField")) {
                $("#crossbreedcol, #secondbreedcol").show();
            }
            else {
                $("#crossbreedcol, #secondbreedcol").hide();
                $("#crossbreed").prop("checked", false);
            }
        },

        // Set the entry type based on the other field values if it has been disabled
        update_entry_type: function() {
            if (config.bool("AddAnimalsShowEntryType")) { return; }
            let reasonname = common.get_field(controller.entryreasons, $("#entryreason").select("value"), "REASONNAME").toLowerCase();
            let entrytype = 1; //surrender
            if ($("#deadonarrival").is(":checked")) { entrytype = 9; } // dead on arrival
            else if ($("#dateofbirth").val() == $("#datebroughtin").val()) { entrytype = 5; } // born in shelter
            else if ($("#crueltycase").is(":checked")) { entrytype = 7; } // seized
            else if ($("#transferin").is(":checked")) { entrytype = 3; } // transfer in
            else if (reasonname.indexOf("transfer") != -1) { entrytype = 3; } // transfer in
            else if (reasonname.indexOf("born") != -1) { entrytype = 5; } // born in shelter
            else if (reasonname.indexOf("stray") != -1) { entrytype = 2; } // stray
            else if (reasonname.indexOf("tnr") != -1) { entrytype = 4; } // tnr
            else if (reasonname.indexOf("wildlife") != -1) { entrytype = 6; } // wildlife
            else if (reasonname.indexOf("abandoned") != -1) { entrytype = 8; } // abandoned
            $("#entrytype").select("value", entrytype);
        },

        // Update the units available for the selected location
        update_units: async function() {
            let opts = ['<option value=""></option>'];
            $("#unit").empty();
            let response = null;
            try {
                response = await common.ajax_post("animal_induction", "mode=units&locationid=" + $("#internallocation").val());
            }
            catch (err) {
                // If unit load fails, leave the list empty but don't crash
                response = "";
            }
            const decoded = (response === undefined || response === null) ? "" : html.decode(response);
            $.each(String(decoded).split("&&"), function(i, v) {
                let [unit, desc] = v.split("|");
                if (!unit) { return false; }
                if (!desc) { desc = _("(available)"); }
                opts.push('<option value="' + html.title(unit) + '">' + unit +
                    ' : ' + desc + '</option>');
            });
            $("#unit").html(opts.join("\n")).change();
        },

        reset: function() {

            $("#animalname, #dateofbirth, #weight, #weightlb, #comments").val("").change();
            $(".asm-checkbox").prop("checked", false).change();
            $(".asm-personchooser").personchooser("clear");

            // Set brought in by label back to non-transfer
            $("label[for='broughtinby']").html(_("Brought In By")); 
            $("#broughtinby").personchooser("set_filter", "all");

            // Set estimated DOB flag based on default age config
            $("#estimateddob").prop("checked", false);
            if (config.str("DefaultAnimalAge") != "0") {
                $("#estimateddob").prop("checked", true);
            }

            // If auto non shelter is on click checkbox
            if (config.bool("AutoNonShelter")) { $("#nonshelter").prop("checked", true).change(); }

            // Set select box default values
            $("#animaltype").select("value", config.str("AFDefaultType"));
            animal_induction.set_nonsheltertype_once = false;
            $("#species").select("value", config.str("AFDefaultSpecies"));
            $("#species").change();
            animal_induction.update_breed_select();
            $("#breed1, #breed2").select("value", config.str("AFDefaultBreed"));
            $("#basecolour").select("value", config.str("AFDefaultColour"));
            $("#coattype").select("value", config.str("AFDefaultCoatType"));
            $("#entryreason").select("value", config.str("AFDefaultEntryReason"));
            $("#entrytype").select("value", config.str("AFDefaultEntryType"));
            $("#internallocation").select("value", config.str("AFDefaultLocation"));
            $("#jurisdiction").select("value", config.str("DefaultJurisdiction"));
            $("#size").select("value", config.str("AFDefaultSize"));
            $("#sex").select("value", "2"); // Unknown

            // Remove any retired lookups from the lists
            $(".asm-selectbox").select("removeRetiredOptions");

            // Any lookups that don't have a value after setting the defaults
            // should inherit the first in their list instead.
            $(".asm-selectbox").select("firstIfBlank");

            // Set date/time defaults
            $("#datebroughtin").val(format.date(new Date()));
            if ($("#timebroughtin").length) {
                $("#timebroughtin").val(format.time(new Date()));
            }

            // Update units according to any location selected
            animal_induction.update_units();

            // Currency defaults
            $("#fee").currency("value", 0);

            // Change additional fields to default
            additional.reset_default(controller.additional);

            // Clear media grid
            $("#media-grid .media-slot").each(function() {
                $(this).removeClass('filled default').attr('data-mid', '');
                $(this).find('img').attr('src','').hide();
                $(this).find('.media-actions').hide();
                $(this).find('.media-empty-hint').show();
            });
        },

        validation: function() {
            // Remove any previous errors
            header.hide_error();
            validate.reset();

            // Minimal mode: new record — only require Name and Entry Age Range
            const isNew = !controller.animal || !controller.animal.ID;
            if (isNew) {
                if (common.trim($("#animalname").val()) == "") {
                    header.show_error(_("Name cannot be blank"));
                    validate.highlight("animalname");
                    return false;
                }
                const ear = $("#entryagerange").val();
                if (!ear || String(ear).trim() === "") {
                    header.show_error(_("Entry Age Range is required"));
                    $("#entryagerange").focus();
                    return false;
                }
                return true;
            }

            // Full validation for editing existing record
            if (config.bool("ManualCodes")) {
                if (common.trim($("#sheltercode").val()) == "") {
                    header.show_error(_("Shelter code cannot be blank"));
                    validate.highlight("sheltercode");
                    return false;
                }
            }
            if (common.trim($("#animalname").val()) == "") {
                header.show_error(_("Name cannot be blank"));
                validate.highlight("animalname");
                return false;
            }
            // If an Entry Age Range was chosen, accept DOB via auto-calc; otherwise enforce DOB/estimated DOB
            const hasEAR = $("#entryagerange").val() && String($("#entryagerange").val()).trim() !== "";
            if (!hasEAR) {
                const dob = common.trim($("#dateofbirth").val());
                const est = $("#estimateddob").is(":checked");
                if (dob === "" && !est) {
                    header.show_error(_("Date of birth cannot be blank"));
                    validate.highlight("dateofbirth");
                    return false;
                }
            }
            if (!additional.validate_mandatory()) { return false; }
            return true;
        },

        bind: function() {

            validate.indicator(["animalname", "sheltercode", "dateofbirth"]);

            let similarbuttons = {};
            similarbuttons[_("Close")] = function() { 
                $(this).dialog("close");
            };
            $("#dialog-similar").dialog({
                 autoOpen: false,
                 resizable: false,
                 modal: true,
                 width: 500,
                 dialogClass: "dialogshadow",
                 show: dlgfx.delete_show,
                 hide: dlgfx.delete_hide,
                 buttons: similarbuttons
            });

            // Check the name has not been used recently once the user leaves
            // the field.
            if (config.bool("WarnSimilarAnimalName")) {
                $("#animalname").blur(async function() {
                    try {
                        let formdata = "mode=recentnamecheck&animalname=" + encodeURIComponent($("#animalname").val());
                        const response = await common.ajax_post("animal_induction", formdata);
                        if (response == "None") { return; }
                        const [animalid, sheltercode, animalname] = response.split("|");
                        let h = "<a class='asm-embed-name' href='animal?id=" + animalid + "'>" + sheltercode + " - " + animalname + "</a>";
                        $(".similar-animal").html(h);
                        $("#dialog-similar").dialog("open");
                    }
                    finally {
                        $(".asm-content button").button("enable");
                    }
                });
            }

            // Converting between whole number for weight and pounds and ounces
            const lboz_to_fraction = function() {
                let lb = format.to_int($("#weightlb").val());
                lb += format.to_int($("#weightoz").val()) / 16.0;
                $("#weight").val(String(lb));
            };

            if (animal_induction.weight_in_grams()) {
                $("#kglabel").html(_("g"));
                $("#kilosrow").show();
                $("#poundsrow").hide();
                const converted = animal_induction.kg_to_grams_string($("#weight").val());
                if (converted !== "") { $("#weight").val(converted); }
            }
            else if (config.bool("ShowWeightInLbs")) {
                $("#kilosrow").hide();
                $("#poundsrow").show();
                $("#weightlb, #weightoz").change(lboz_to_fraction);
            }
            else if (config.bool("ShowWeightInLbsFraction")) {
                $("#kglabel").html(_("lb"));
                $("#kilosrow").show();
                $("#poundsrow").hide();
            }
            else {
                $("#kglabel").html(_("kg"));
                $("#kilosrow").show();
                $("#poundsrow").hide();
            }

            // Disable rows based on config options
            if (!config.bool("AddAnimalsShowAcceptance")) { $("#litterrow").hide(); }
            if (!config.bool("AddAnimalsShowBreed")) { $("#breedrow").hide(); }
            if (!config.bool("AddAnimalsShowBroughtInBy")) { $("#broughtinbyrow").hide(); }
            if (!config.bool("AddAnimalsShowCoordinator")) { $("#coordinatorrow").hide(); }
            if (!config.bool("AddAnimalsShowOriginalOwner")) { $("#originalownerrow").hide(); }
            if (!config.bool("AddAnimalsShowCoatType")) { $("#coattyperow").hide(); }
            if (!config.bool("AddAnimalsShowColour")) { $("#colourrow").hide(); }
            if (!config.bool("AddAnimalsShowDateBroughtIn")) { $("#datebroughtinrow").hide(); }
            if (!config.bool("AddAnimalsShowEntryCategory")) { $("#entryreasonrow").hide(); }
            if (!config.bool("AddAnimalsShowFee")) { $("#feerow").hide(); }
            if (!config.bool("AddAnimalsShowFosterer")) { $("#fostererrow").hide(); }
            if (!config.bool("AddAnimalsShowHold")) { $("#holdrow").hide(); }
            if (!config.bool("AddAnimalsShowLocation")) { $("#locationrow").hide(); }
            if (!config.bool("AddAnimalsShowLocationUnit")) { $("#locationunitrow").hide(); }
            if (!config.bool("AddAnimalsShowMicrochip")) { $("#microchiprow").hide(); }
            if (!config.bool("AddAnimalsShowNeutered")) { $("#neuteredrow").hide(); }
            if (!config.bool("AddAnimalsShowPickup")) { $("#pickuprow").hide(); }
            if (!config.bool("AddAnimalsShowSize")) { $("#sizerow").hide(); }
            if (!config.bool("AddAnimalsShowTattoo")) { $("#tattoorow").hide(); }
            if (!config.bool("AddAnimalsShowTimeBroughtIn")) { $("#timebroughtinrow").hide(); }
            if (!config.bool("AddAnimalsShowWeight")) { $("#kilosrow, #poundsrow").hide(); }
            if (config.bool("UseSingleBreedField")) {
                $("#crossbreedcol, #secondbreedcol").hide();
            }
            if (config.bool("DisableShortCodesControl")) {
                $("#shortcode").hide();
                $("#sheltercode").addClass("asm-textbox");
                $("#sheltercode").removeClass("asm-halftextbox");
            }
            if (!config.bool("ManualCodes")) { $("#coderow").hide(); }


            // Keep breed2 in sync with breed1 for non-crossbreeds
            $("#breed1").change(function() {
                if (!$("#crossbreed").is(":checked")) {
                    $("#breed2").select("value", $("#breed1").select("value"));
                }
            });

            // Changing species updates the breed list
            $('#species').change(function() {
                animal_induction.update_breed_select();
            });

            // Changing various fields that guess the entry category
            $("#entryreason, #transferin, #datebroughtin, #dateofbirth").change(function() {
                animal_induction.update_entry_type();
            });

            // Setting the neutered date sets the checkbox
            $("#neutereddate").change(function() {
                if ($("#neutereddate").val()) {
                    $("#neutered").prop("checked", true);
                }
            });

            // Setting the microchipped date or number sets the checkbox
            $("#microchipdate").change(function() {
                if ($("#microchipdate").val()) {
                    $("#microchipped").prop("checked", true);
                }
            });
            $("#microchipnumber").change(function() {
                if ($("#microchipnumber").val()) {
                    $("#microchipped").prop("checked", true);
                }
            });

            // Setting the tattoo number sets the checkbox
            $("#tattoodate").change(function() {
                if ($("#tattoodate").val()) {
                    $("#tattoo").prop("checked", true);
                }
            });
            $("#tattoonumber").change(function() {
                if ($("#tattoonumber").val()) {
                    $("#tattoo").prop("checked", true);
                }
            });

            // Setting microchip date or number ticks microchipped
            $("#microchipdate").change(function() {
                if ($("#microchipdate").val()) { $("#microchipped").prop("checked", true); }
            });
            $("#microchipnumber").change(function() {
                if ($("#microchipnumber").val()) { $("#microchipped").prop("checked", true); }
            });

            // Setting the pickup address or location sets the checkbox
            $("#pickuplocation").change(function() {
                $("#pickedup").prop("checked", true);
            });
            $("#pickupaddress").change(function() {
                if ($("#pickupaddress").val()) {
                    $("#pickedup").prop("checked", true);
                }
            });

            $("#internallocation").change(animal_induction.update_units);
            $("#crossbreed").change(animal_induction.enable_widgets);
            $("#nonshelter").change(animal_induction.enable_widgets);
            $("#transferin").change(animal_induction.enable_widgets);
            $("#entrytype").change(animal_induction.enable_widgets);
            $("#hold").change(animal_induction.enable_widgets);
            $("#holduntil").change(animal_induction.enable_widgets);
            animal_induction.enable_widgets();

            // Default species has been set, update the available breeds
            // before choosing the default breed
            animal_induction.update_breed_select();
            $("#breed1").val(config.str("AFDefaultBreed"));
            $("#breed2").val(config.str("AFDefaultBreed"));

            // Set default location to Induction for Patient Induction screen
            // Try multiple approaches to ensure it works
            setTimeout(function() {
                // Method 1: Find by text content
                var inductionOption = $("#internallocation option").filter(function() {
                    return $(this).text().trim() === 'Induction';
                });
                if (inductionOption.length > 0) {
                    $("#internallocation").val(inductionOption.val()).trigger('change');
                } else {
                    // Method 2: Try to find by partial text match
                    $("#internallocation option").each(function() {
                        if ($(this).text().toLowerCase().indexOf('induction') !== -1) {
                            $("#internallocation").val($(this).val()).trigger('change');
                            return false;
                        }
                    });
                }
            }, 500);

            // Buttons
            $("#button-reset").button().click(function() {
                animal_induction.reset();
            });

            $("#button-save").button().click(function() {
                animal_induction.save_progress();
            });

            $("#button-barcode").button().click(function() {
                if (!controller.animal || !controller.animal.ID) { return; }
                const url = "animal_barcode?id=" + controller.animal.ID;
                window.open(url, "_blank", "noopener");
            });

            // Delete / barcode buttons (only for existing records)
            if (!controller.animal || !controller.animal.ID) {
                $("#button-delete").hide();
                $("#button-barcode").hide();
            } else {
                $("#button-delete").button().click(async function() {
                    await tableform.delete_dialog(null, _("This will permanently remove this animal, are you sure?"));
                    await common.ajax_post("animal", "mode=delete&animalid=" + controller.animal.ID);
                    common.route("main");
                });
            }

            // Media upload: select file and upload to next available slot
            $("#button-upload-photo").button().click(async function() {
                // Ensure name present before opening picker
                const name = $("#animalname").val();
                if (!name || String(name).trim() === "") {
                    header.show_error(_("Please enter a name before adding photos."));
                    $("#animalname").focus();
                    return;
                }
                animal_induction.prompt_photo_source();
            });
            // Common change handler for both camera and library inputs
            const onPhotoFileChange = async function(input) {
                let f = $("#induction-photo-file")[0].files[0];
                if (input && input.id === 'induction-photo-library') {
                    f = $("#induction-photo-library")[0].files[0];
                }
                if (!f) { return; }
                // Enforce max 4 photos
                const used = $("#media-grid .media-slot.filled").length;
                if (used >= 4) { header.show_error(_("Maximum 4 photos allowed")); $(input).val(""); return; }
                try {
                    // Ensure the record exists (auto-save silently)
                    await animal_induction.ensure_saved_for_media();
                    await animal_induction.upload_photo(f);
                    animal_induction.load_media_list();
                } finally {
                    $("#induction-photo-file, #induction-photo-library").val("");
                }
            };
            $("#induction-photo-file").off('change').on('change', function(){ onPhotoFileChange(this); });
            $("#induction-photo-library").off('change').on('change', function(){ onPhotoFileChange(this); });

            $("#button-animalname")
                .button({ icons: { primary: "ui-icon-tag" }, text: false })
                .click(async function() {
                let formdata = "mode=randomname&sex=" + $("#sex").val();
                const response = await common.ajax_post("animal", formdata);
                $("#animalname").val(response); 
            });

            $("#species").change(function() {
                additional.toggle_elements_by_species("additional", $("#species").val());
            });

            // Render inspection additional fields in the inspection section
            animal_induction.render_inspection_fields();
            
            // Render remedial actions additional fields in the remedial actions section
            animal_induction.render_remedial_actions_fields();
            
            // Add floating save buttons
            animal_induction.add_floating_buttons();

            // Render Entry Age Range from Additional Fields
            animal_induction.render_entry_age_range_field();

            // Entry Age Range calculation (handles dynamic labels like "Baby (<1)")
            $(document).on('change', '#entryagerange', function() {
                const label = $(this).val();
                if (!label) {
                    $("#dateofbirth").val("").change();
                    $("#estimateddob").prop("checked", false).change();
                    return;
                }

                const lower = String(label).toLowerCase();
                let monthsBack = null;

                // Try to parse numeric ranges in label, eg: "1-2" years, "<1", "5+"
                const rangeMatch = label.match(/(\d+)\s*-\s*(\d+)/);
                const ltOneMatch = /<\s*1/.test(label);
                const plusMatch = label.match(/(\d+)\s*\+/);
                if (rangeMatch) {
                    const a = parseInt(rangeMatch[1], 10);
                    const b = parseInt(rangeMatch[2], 10);
                    monthsBack = Math.round(((a + b) / 2) * 12);
                } else if (ltOneMatch) {
                    monthsBack = 6; // midpoint for <1 year
                } else if (plusMatch) {
                    const n = parseInt(plusMatch[1], 10);
                    monthsBack = (n + 2) * 12; // choose a reasonable midpoint beyond n
                }

                // Fallback to prefix matching if no numbers parsed
                if (monthsBack === null) {
                    if (lower.indexOf("baby") === 0) { monthsBack = 6; }
                    else if (lower.indexOf("juvenile") === 0) { monthsBack = 18; }
                    else if (lower.indexOf("adult") === 0) { monthsBack = 42; }
                    else if (lower.indexOf("senior") === 0) { monthsBack = 84; }
                }

                if (monthsBack === null) { return; }

                const estimatedBirthDate = new Date();
                estimatedBirthDate.setMonth(estimatedBirthDate.getMonth() - monthsBack);

                const formattedDate = format.date(estimatedBirthDate);
                $("#dateofbirth").val(formattedDate);
                $("#estimateddob").prop("checked", true);
                $("#dateofbirth").change();
                $("#estimateddob").change();
            });

            // Unsaved changes handling
            if (typeof validate !== 'undefined') {
                // Provide a save routine for the global Unsaved Changes dialog
                validate.save = async function(callback) {
                    // Use minimal validation for dialog-driven save
                    const name = $("#animalname").val();
                    if (!name || String(name).trim() === "") {
                        header.show_error(_("Animal name is required to save progress"));
                        $("#animalname").focus();
                        return;
                    }
                    validate.dirty(false);
                    let formdata = "mode=save&" + $("input, textarea, select").not(".chooser").toPOST();
                    if (controller.animal) {
                        formdata += "&id=" + controller.animal.ID;
                        formdata += "&recordversion=" + controller.animal.RECORDVERSION;
                    }
                    let response;
                    try {
                        response = await common.ajax_post("animal_induction", formdata);
                    }
                    catch (err) {
                        validate.dirty(true);
                        header.show_error(_("Failed to save progress: ") + err);
                        return;
                    }
                    // Defer the navigation callback outside the try/catch so route errors
                    // are not reported as save failures
                    if (callback) { setTimeout(function(){ callback(response); }, 0); }
                };
                // Activate change tracking + beforeunload guard
                validate.bind_dirty();
            }

            // Permanently hide unwanted rows/fields
            $("#kilosrow, #poundsrow, #coordinatorrow, #feerow").hide();

            // Minimal mode on new animals: show only Name and Entry Age Range
            animal_induction.apply_minimal_mode();


        },

        sync: function() {
            // If we have an animal to load (editing mode), populate the form
            if (controller.animal) {
                // Delay loading to ensure all form fields are rendered
                setTimeout(function() {
                    animal_induction.load_animal(controller.animal);
                }, 200);
            } else {
                // New animal mode - reset form
                animal_induction.reset();
            }
            // After initial programmatic setup, ensure we don't warn as dirty
            if (typeof validate !== 'undefined' && validate.dirty) {
                try { validate.dirty(false); } catch(e) {}
                // Some initial UI adjustments are delayed; clear again shortly after
                setTimeout(function(){ try { validate.dirty(false); } catch(e) {} }, 800);
            }
            // Apply minimal mode visibility if needed
            animal_induction.apply_minimal_mode();
        },

        /**
         * Loads existing animal data into the form for editing
         */
        load_animal: function(animal) {
            $("#animalname").val(animal.ANIMALNAME);
            $("#sheltercode").val(animal.SHELTERCODE);
            $("#shortcode").val(animal.SHORTCODE);
            $("#sex").val(animal.SEX);
            $("#animaltype").val(animal.ANIMALTYPEID);
            $("#species").val(animal.SPECIESID);
            $("#breed1").val(animal.BREEDID);
            $("#breed2").val(animal.BREED2ID);
            $("#crossbreed").prop("checked", animal.CROSSBREED == 1);
            $("#basecolour").val(animal.BASECOLOURID);
            // Coat type is stored as column "CoatType" (ID), not CoatTypeID
            // Be defensive and fall back to any alternative property names
            (function() {
                const id = animal.COATTYPE !== undefined ? animal.COATTYPE : (animal.COATTYPEID !== undefined ? animal.COATTYPEID : "");
                if (id !== "" && id !== null && id !== undefined) {
                    $("#coattype").val(id);
                } else if (animal.COATTYPENAME) {
                    // Fallback by matching visible text if only the name is available
                    let matched = false;
                    $("#coattype option").each(function() {
                        if ($(this).text() === String(animal.COATTYPENAME)) {
                            $("#coattype").val($(this).val());
                            matched = true;
                            return false;
                        }
                    });
                }
            })();
            $("#size").val(animal.SIZE);
            // Description
            if (animal.ANIMALCOMMENTS !== undefined && animal.ANIMALCOMMENTS !== null) {
                $("#comments").val(animal.ANIMALCOMMENTS);
            }
            // Load and render media thumbnails
            animal_induction.load_media_list();
            
            // Set weight field
            if (animal.WEIGHT) {
                $("#weight").val(animal.WEIGHT);
            }
            // Microchip fields
            if (animal.IDENTICHIPPED !== undefined) {
                $("#microchipped").prop("checked", animal.IDENTICHIPPED == 1);
            }
            if (animal.IDENTICHIPNUMBER !== undefined && animal.IDENTICHIPNUMBER !== null) {
                $("#microchipnumber").val(animal.IDENTICHIPNUMBER);
            }
            if (animal.IDENTICHIPDATE) {
                $("#microchipdate").val(format.date(animal.IDENTICHIPDATE));
            }
            // Set internal location - handle null/0 values
            if (animal.SHELTERLOCATION && animal.SHELTERLOCATION != "0") {
                $("#internallocation").val(animal.SHELTERLOCATION);
                // Update units after setting location
                setTimeout(function() {
                    animal_induction.update_units().then(function() {
                        $("#unit").val(animal.SHELTERLOCATIONUNIT || "");
                    });
                }, 100);
            } else {
                $("#internallocation").val(""); // Set to empty if null/0
                $("#unit").val("");
            }
            // Ensure select widgets are set via the widget API
            if (animal.ENTRYTYPEID !== undefined && animal.ENTRYTYPEID !== null && animal.ENTRYTYPEID !== "") {
                $("#entrytype").select && $("#entrytype").select("value", animal.ENTRYTYPEID);
            }
            // Populate Entry Category (Entry Reason)
            if (animal.ENTRYREASONID !== undefined && animal.ENTRYREASONID !== null && animal.ENTRYREASONID !== "") {
                $("#entryreason").select && $("#entryreason").select("value", animal.ENTRYREASONID);
            }
            $("#datebroughtin").val(format.date(animal.DATEBROUGHTIN));
            if (animal.TIMEBROUGHTIN) {
                $("#timebroughtin").val(format.time(animal.TIMEBROUGHTIN));
            }
            if (animal.DATEOFBIRTH) {
                $("#dateofbirth").val(format.date(animal.DATEOFBIRTH));
                $("#estimateddob").prop("checked", false); // Clear estimated flag if we have DOB
            }
            // Set estimated DOB checkbox
            if (animal.ESTIMATEDDOB) {
                $("#estimateddob").prop("checked", animal.ESTIMATEDDOB == 1);
            } else {
                $("#estimateddob").prop("checked", false);
            }
            // Derive entry age range from Date of Birth if not explicitly set in additional field
            const setAgeRangeFromDOB = function() {
                // Prefer persisted additional value if available
                let hasPersisted = false;
                $.each(controller.additional, function(i, f) {
                    if (f.FIELDNAME && f.FIELDNAME.toLowerCase() === 'entryagerange') {
                        if (f.VALUE !== undefined && f.VALUE !== null && String(f.VALUE).trim() !== '') { hasPersisted = true; }
                        return false;
                    }
                });
                if (hasPersisted) { animal_induction.populate_entry_age_range_field(); return; }
                if (!animal.DATEOFBIRTH) { return; }
                const dob = format.date_js(animal.DATEOFBIRTH);
                if (!dob) { return; }
                const today = new Date();
                let months = (today.getFullYear() - dob.getFullYear()) * 12 + (today.getMonth() - dob.getMonth());
                if (today.getDate() < dob.getDate()) { months -= 1; }

                let label = "";
                if (months < 12) { label = "Baby"; }
                else if (months < 24) { label = "Juvenile"; }
                else if (months < 60) { label = "Adult"; }
                else { label = "Senior"; }

                const applyLabel = function(l) {
                    const $sel = $("#entryagerange");
                    $sel.val(l);
                    if ($sel.val() !== l) {
                        // Fallback: try to match by visible text contains label
                        let matched = false;
                        $sel.find('option').each(function() {
                            const t = $(this).text().toLowerCase();
                            if (t.indexOf(l.toLowerCase()) !== -1) {
                                $sel.val($(this).val());
                                matched = true;
                                return false;
                            }
                        });
                        if (!matched) {
                            // As last resort, try widget API
                            $sel.select && $sel.select("value", l);
                        }
                    }
                };

                // Delay to ensure dropdown is rendered and populated
                setTimeout(function() { applyLabel(label); }, 500);
            };

            setAgeRangeFromDOB();
            $("#nonshelter").prop("checked", animal.NONSHELTERANIMAL == 1);
            $("#hold").prop("checked", animal.HASACTIVEHOLD == 1);
            if (animal.HOLDUNTILDATE) {
                $("#holduntil").val(format.date(animal.HOLDUNTILDATE));
            }
            
            // Load additional fields data
            $("#asm-content input[data-id], #asm-content select[data-id], #asm-content textarea[data-id]").fromJSON(animal);

            // Populate Found Location static fields from additional values if present
            (function populate_found_location_fields() {
                if (!controller.additional) { return; }
                let addmap = {};
                $.each(controller.additional, function(i, f) {
                    if (!f.FIELDNAME) { return; }
                    addmap[String(f.FIELDNAME).toLowerCase()] = f;
                });
                // Weather Conditions
                if (addmap["entrylocationweather"] && addmap["entrylocationweather"].VALUE !== undefined) {
                    $("#entrylocationweather").val(addmap["entrylocationweather"].VALUE);
                }
                // Found By person
                if (addmap["entryfoundbyperson"] && addmap["entryfoundbyperson"].VALUE) {
                    let pid = parseInt(addmap["entryfoundbyperson"].VALUE, 10) || 0;
                    if (pid > 0) { $("#entryfoundbyperson").personchooser("loadbyid", pid); }
                }
                // Location description
                if (addmap["entrylocationdescription"] && addmap["entrylocationdescription"].VALUE !== undefined) {
                    $("#entrylocationdescription").val(addmap["entrylocationdescription"].VALUE);
                }
            })();

            // Set fosterer chooser from active foster movement (uses CurrentOwnerID on active movement)
            if (animal.ACTIVEMOVEMENTTYPE == 2 && animal.CURRENTOWNERID) {
                $("#fosterer").personchooser("loadbyid", animal.CURRENTOWNERID);
            } else {
                // Clear if not fostered
                $("#fosterer").personchooser("clear");
            }
            
            // Enable/disable widgets based on loaded data
            animal_induction.enable_widgets();
            animal_induction.update_breed_select();
            animal_induction.update_units();
        },

        destroy: function() {
            if (typeof validate !== 'undefined' && validate.unbind_dirty) { validate.unbind_dirty(); }
            common.widget_destroy("#dialog-similar");
            common.widget_destroy("#nsowner", "personchooser");
            common.widget_destroy("#coordinator", "personchooser");
            common.widget_destroy("#fosterer", "personchooser");
            common.widget_destroy("#originalowner", "personchooser");
            common.widget_destroy("#broughtinby", "personchooser");
        },

        name: "animal_induction",
        animation: "newdata",
        autofocus: "#nonshelter", 
        title: function() { return _("Patient Admission"); },
        
        routes: {
            "animal_induction": function() {
                common.module_loadandstart("animal_induction", "animal_induction?" + this.rawqs);
            }
        }

    };

    common.module_register(animal_induction);

});
