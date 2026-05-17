/*global $, jQuery, _, additional, asm, common, config, controller, dlgfx, format, header, html, validate */

$(function() {

    "use strict";

    // Debug marker to confirm latest grams-only induction build

    const animal_induction = {

        /** Only attempt to set the non-shelter animal type once per reset */
        set_nonsheltertype_once: false,

        /** True once the user has manually changed the internal location.
         *  Used to stop the "default to Induction" timer from clobbering a
         *  location the user deliberately chose. */
        location_touched: false,

        /** Scan-form state: original data URL, current rotation, processed (rotated+downscaled) URL */
        scan_form_raw: null,
        scan_form_rotation: 0,
        scan_form_processed: null,

        weight_in_grams: function() {
            return config.bool("ShowWeightInGrams");
        },

        grams_string: function(value) {
            if (value === null || value === undefined) { return ""; }
            const trimmed = String(value).trim();
            if (trimmed === "") { return ""; }
            const grams = format.to_float(trimmed);
            if (isNaN(grams)) { return trimmed; }
            return grams.toString();
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
                '<div id="dialog-import-transcript" style="display:none;" title="' + _("Import from Transcript") + '">',
                '  <p>' + _("Paste or type examination notes below. The AI will extract animal data to pre-fill the form.") + '</p>',
                '  <textarea id="import-transcript-text" rows="10" style="width:100%; font-size:0.9em;"></textarea>',
                '</div>',
                '<div id="dialog-scan-form" style="display:none;" title="' + _("Scan Admission Form") + '">',
                '  <style>',
                '    #dialog-scan-form .scan-action-bar {',
                '      position: sticky; top: 0; z-index: 5;',
                '      display: flex; flex-wrap: wrap; gap: 8px;',
                '      padding: 8px 0; margin: 0 0 10px 0;',
                '      background: #fff; border-bottom: 1px solid #e5e7eb;',
                '    }',
                '    #dialog-scan-form .scan-action-bar button { flex: 1 1 auto; min-height: 44px; }',
                '    #dialog-scan-form .scan-extract-btn {',
                '      background: #1e5fb8; color: #fff; border: none; border-radius: 8px;',
                '      font-weight: 600; padding: 10px 16px;',
                '    }',
                '    #dialog-scan-form .scan-extract-btn:hover { filter: brightness(1.08); }',
                '    #dialog-scan-form .scan-extract-btn:disabled { background: #9aa4b1; cursor: not-allowed; }',
                '    #dialog-scan-form .scan-secondary-btn {',
                '      background: #f3f4f6; border: 1px solid #cfd6df; border-radius: 8px;',
                '      padding: 10px 14px;',
                '    }',
                '    #dialog-scan-form p.scan-hint { margin: 0 0 8px 0; font-size: 0.9em; color: #555; }',
                '    #dialog-scan-form #scan-form-status { font-size: 0.9em; color: #555; min-height: 1.3em; margin-top: 6px; }',
                '  </style>',
                '  <div class="scan-action-bar">',
                '    <button type="button" id="scan-form-btn-camera" class="scan-secondary-btn">' + _("Take Photo") + '</button>',
                '    <button type="button" id="scan-form-btn-library" class="scan-secondary-btn">' + _("Choose from Library") + '</button>',
                '    <button type="button" id="scan-form-btn-extract" class="scan-extract-btn" style="display:none;">' + _("Extract & Fill") + '</button>',
                '    <button type="button" id="scan-form-rotate" class="scan-secondary-btn" style="display:none;">&#x21bb; ' + _("Rotate") + '</button>',
                '    <button type="button" id="scan-form-replace" class="scan-secondary-btn" style="display:none;">' + _("Replace") + '</button>',
                '  </div>',
                '  <input id="scan-form-file-camera" type="file" accept="image/*" capture="environment" style="display:none;" />',
                '  <input id="scan-form-file-library" type="file" accept="image/*" style="display:none;" />',
                '  <p class="scan-hint">' + _("Take a photo or choose an image of a handwritten patient record sheet. The AI will read the form and pre-fill as many fields as possible.") + '</p>',
                '  <div id="scan-form-thumb-wrap" style="display:none; text-align:center; margin-bottom:10px;">',
                '    <img id="scan-form-thumb" style="max-width:100%; max-height:60vh; border:1px solid #ccc; cursor:zoom-in;" alt="" />',
                '  </div>',
                '  <div id="scan-form-status"></div>',
                '</div>',
                html.content_header(_("Patient Admission")),
                '<style>',
                '.induction-top-actions {',
                '  max-width: 1200px; margin: 12px auto 0; padding: 0 16px;',
                '  display: flex; gap: 12px; flex-wrap: wrap;',
                '}',
                '.induction-top-actions .topaction-btn {',
                '  flex: 1 1 260px;',
                '  display: inline-flex; align-items: center; justify-content: center; gap: 10px;',
                '  padding: 14px 20px;',
                '  font-size: 16px; font-weight: 600; line-height: 1.2;',
                '  color: #fff; background: linear-gradient(135deg, #2b7de9, #1e5fb8);',
                '  border: none; border-radius: 10px; cursor: pointer;',
                '  box-shadow: 0 3px 10px rgba(30,95,184,0.25);',
                '  transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;',
                '  min-height: 52px;', // >= mobile touch target
                '}',
                '.induction-top-actions .topaction-btn:hover {',
                '  transform: translateY(-1px);',
                '  box-shadow: 0 6px 16px rgba(30,95,184,0.30);',
                '  filter: brightness(1.05);',
                '}',
                '.induction-top-actions .topaction-btn:active { transform: translateY(0); filter: brightness(0.95); }',
                '.induction-top-actions .topaction-btn .asm-icon {',
                '  filter: brightness(0) invert(1);', // make the icon white to match text
                '  opacity: 0.95;',
                '}',
                '.induction-top-actions .topaction-btn.secondary {',
                '  background: linear-gradient(135deg, #6c757d, #495057);',
                '  box-shadow: 0 3px 10px rgba(73,80,87,0.25);',
                '}',
                '@media (max-width: 640px) {',
                '  .induction-top-actions { gap: 8px; padding: 0 10px; }',
                '  .induction-top-actions .topaction-btn { flex-basis: 100%; font-size: 15px; padding: 14px 16px; }',
                '}',
                '</style>',
                '<div class="induction-top-actions">',
                '  <button type="button" id="button-top-scanform" class="topaction-btn">' +
                     html.icon("document") + _("Scan Admission Form") + '</button>',
                '  <button type="button" id="button-top-importtranscript" class="topaction-btn secondary">' +
                     html.icon("message") + _("AI Import from Transcript") + '</button>',
                '</div>',
                animal_induction.render_littermates_banner(),
                '<div id="scan-result-panel" style="display:none; max-width:1200px; margin:10px auto; padding:14px 16px; ',
                    'background:#fff; border:1px solid #cfd6df; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,0.05); font-size:0.92em;">',
                '  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:10px;">',
                '    <strong id="scan-result-title">' + _("Scan result") + '</strong>',
                '    <button type="button" id="scan-result-close" style="font-size:0.85em;">' + _("Dismiss") + '</button>',
                '  </div>',
                '  <div id="scan-result-summary" style="color:#555; margin-bottom:8px;"></div>',
                '  <details style="margin-bottom:0;"><summary style="cursor:pointer; color:#1e5fb8; font-weight:600; user-select:none;">&#9656; ' + _("Diagnostics") + ' <span id="scan-result-diag-counts" style="font-weight:400; color:#888;"></span></summary>',
                '    <div style="margin-top:8px;">',
                '      <details open style="margin-bottom:6px;"><summary style="cursor:pointer; color:#080;">',
                '        <span id="scan-result-applied-count">0</span> ' + _("applied") + '</summary>',
                '        <ul id="scan-result-applied" style="margin:6px 0 0 18px; color:#555;"></ul>',
                '      </details>',
                '      <details open style="margin-bottom:6px;"><summary style="cursor:pointer; color:#a60;">',
                '        <span id="scan-result-unmapped-count">0</span> ' + _("not applied — review matching") + '</summary>',
                '        <ul id="scan-result-unmapped" style="margin:6px 0 0 18px; color:#555;"></ul>',
                '      </details>',
                '      <details style="margin-bottom:0;"><summary style="cursor:pointer; color:#888;">' + _("Raw AI response") + '</summary>',
                '        <pre id="scan-result-raw" style="max-height:300px; overflow:auto; font-size:0.8em; background:#f8f9fa; padding:8px; border-radius:6px;"></pre>',
                '      </details>',
                '    </div>',
                '  </details>',
                '</div>',
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
                '    display: flex;',
                '    flex-direction: column;',
                '    gap: 12px;',
                '    align-items: stretch;',
                '}',
                '.inspection-row {',
                '    display: grid;',
                '    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));',
                '    gap: 12px;',
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
                '    .inspection-row {',
                '        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));',
                '        gap: 10px;',
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
                '    .inspection-row {',
                '        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));',
                '        gap: 8px;',
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
                '    .inspection-row {',
                '        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));',
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
                '        <div class="field-row" id="kilosrow">',
                '            <div class="field-label">' + _("Weight") + '</div>',
                '            <div class="field-input">',
                                tableform.render_number({ post_field: "weight", justwidget: true }),
                '                <label id="kglabel">' + _("kg") + '</label>',
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

                '<!-- Siblings section — shows after first save, hidden by minimal mode -->',
                '<div class="inspection-section" id="siblingsection">',
                '    <h3>' + _("Siblings") + '</h3>',
                '    <p style="margin: 0 0 15px 0; color: #555; text-align: center;">' + _("If more than one animal was admitted together, enter how many additional siblings. They inherit all the details above (species, breed, age, location, medical info, etc.) — you can customize each sibling\'s name and sex below.") + '</p>',
                '    <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 10px; justify-content: center;">',
                '        <label for="siblings" style="font-weight: 600;">' + _("Number of additional siblings") + '</label>',
                '        <input type="number" id="siblings" name="siblings" value="0" min="0" max="20" style="width: 80px; padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px;">',
                '    </div>',
                '    <table id="siblingrows" style="margin-top: 15px; display: none; border-collapse: collapse; width: 100%;">',
                '      <thead><tr style="background: #f0f0f0;">',
                '        <th style="padding: 8px; text-align: left; width: 40px;">#</th>',
                '        <th style="padding: 8px; text-align: left;">' + _("Name") + '</th>',
                '        <th style="padding: 8px; text-align: left; width: 180px;">' + _("Sex") + '</th>',
                '      </tr></thead>',
                '      <tbody></tbody>',
                '    </table>',
                '</div>',

                '</div>',
                tableform.buttons_render([
                   { id: "save", icon: "save", text: _("Save") },
                   { id: "reset", icon: "delete", text: _("Reset") },
                   { id: "importtranscript", icon: "message", text: _("AI Import from Transcript") },
                   { id: "scanform", icon: "document", text: _("Scan Admission Form") },
                   { id: "barcode", icon: "print", text: _("Print QR Label") },
                   { id: "delete", icon: "delete", text: _("Delete") }
                ], { centered: true }),
                html.content_footer()
            ].join("\n");
        },

        /**
         * Rebuild the sibling rows table from the current count + base name.
         * Preserves any manually edited row values when possible.
         */
        rebuild_sibling_rows: function() {
            const count = parseInt($("#siblings").val() || "0", 10);
            const $body = $("#siblingrows tbody");
            const $table = $("#siblingrows");
            if (isNaN(count) || count <= 0) {
                $body.empty();
                $table.hide();
                return;
            }
            const baseName = $.trim($("#animalname").val() || "") || _("Sibling");
            // Preserve existing row values keyed by index
            const existing = [];
            $body.find("tr").each(function(i) {
                existing.push({
                    name: $(this).find("input.sibling-name").val(),
                    sex: $(this).find("select.sibling-sex").val()
                });
            });
            const sexOptions = (controller.sexes || []).map(function(s) {
                return '<option value="' + s.ID + '">' + html.title(s.SEX) + '</option>';
            }).join("");
            const rows = [];
            // Rows represent ADDITIONAL siblings only (not the primary).
            // Number them starting at 2 so the total litter reads as primary (1) + siblings (2..N+1).
            for (let i = 0; i < count; i++) {
                const sibNumber = i + 2;
                const defaultName = baseName + " " + sibNumber;
                const prev = existing[i];
                const nameVal = (prev && prev.name) ? prev.name : defaultName;
                const sexVal = (prev && prev.sex !== undefined) ? prev.sex : "2";
                rows.push(
                    '<tr>' +
                    '<td style="padding: 6px;">' + sibNumber + '</td>' +
                    '<td style="padding: 6px;"><input type="text" class="sibling-name asm-textbox" style="width: 100%;" value="' + html.title(nameVal) + '"></td>' +
                    '<td style="padding: 6px;"><select class="sibling-sex asm-selectbox" style="width: 100%;" data-default="' + sexVal + '">' + sexOptions + '</select></td>' +
                    '</tr>'
                );
            }
            $body.html(rows.join(""));
            $body.find("select.sibling-sex").each(function() {
                $(this).val($(this).data("default"));
            });
            $table.show();
        },

        /**
         * Serialize sibling rows into a JSON array for POST.
         */
        serialize_sibling_rows: function() {
            const $rows = $("#siblingrows tbody tr");
            if (!$rows.length) { return ""; }
            const data = [];
            $rows.each(function() {
                data.push({
                    name: $.trim($(this).find("input.sibling-name").val() || ""),
                    sex: parseInt($(this).find("select.sibling-sex").val() || "2", 10)
                });
            });
            return JSON.stringify(data);
        },

        /**
         * Render the littermates banner at the top of the page.
         * Only shows when the current animal has littermates (same AcceptanceNumber).
         */
        render_littermates_banner: function() {
            const mates = controller.littermates || [];
            if (!mates.length) { return ""; }
            const links = mates.map(function(m) {
                return '<a href="animal_induction?id=' + m.ID + '" class="littermate-link">' +
                       html.title(m.ANIMALNAME) + '</a>';
            }).join(" &nbsp; ");
            return '<div id="littermates-banner" style="padding: 10px 15px; margin: 10px auto; max-width: 1200px; background: #e7f3ff; border: 1px solid #b3d7ff; border-radius: 6px; font-size: 0.95em;">' +
                   '<strong>' + _("Littermates") + ':</strong> &nbsp; ' + links +
                   '</div>';
        },

        /**
         * Render inspection additional fields in the inspection grid
         */
        render_inspection_fields: function() {
            let inspectionHtml = '';

            // Find and sort additional fields that start with "entryinspection"
            const inspectionFields = (controller.additional || [])
                .filter(function(f) { return f.FIELDNAME && f.FIELDNAME.toLowerCase().startsWith("entryinspection"); })
                .slice()
                .sort(function(a, b) {
                    const ai = parseInt(a.DISPLAYINDEX || 0, 10);
                    const bi = parseInt(b.DISPLAYINDEX || 0, 10);
                    return ai - bi;
                });

            let currentPrefix = null;

            $.each(inspectionFields, function(i, field) {
                // Start a new row when the DISPLAYINDEX prefix changes (first 2 chars)
                const di = (field.DISPLAYINDEX === undefined || field.DISPLAYINDEX === null) ? "" : String(field.DISPLAYINDEX);
                const prefix = di.substring(0, 2);
                if (currentPrefix === null || prefix !== currentPrefix) {
                    if (currentPrefix !== null) {
                        inspectionHtml += '</div>';
                    }
                    inspectionHtml += '<div class="inspection-row" data-prefix="' + html.title(prefix) + '">';
                    currentPrefix = prefix;
                }

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
            });

            // Close the last row if any were opened
            if (currentPrefix !== null) {
                inspectionHtml += '</div>';
            }
            
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
                const rawFtype = $el.data('ftype');
                const ftype = (rawFtype === undefined || rawFtype === null) ? -1 : parseInt(rawFtype, 10);
                // For yes/no checkboxes, color by current value: No/unchecked = green (all good),
                // Yes/checked = red (flag raised). This overrides the default-match behaviour which
                // would paint "No" red when the field's default happens to be "Yes".
                if (ftype === 0) {
                    if ($el.prop('checked')) { $item.addClass('default-mismatch'); }
                    else { $item.addClass('default-ok'); }
                    return;
                }
                // For text/select/severity fields keep the default-match coloring.
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
            let formdata = "mode=save&" + $("input, textarea, select").not(".chooser").not(".sibling-name").not(".sibling-sex").toPOST();

            // Add animal ID if we're editing an existing animal
            if (controller.animal) {
                formdata += "&id=" + controller.animal.ID;
                formdata += "&recordversion=" + controller.animal.RECORDVERSION;
            }
            const siblingsJsonAddAnimal = animal_induction.serialize_sibling_rows();
            if (siblingsJsonAddAnimal) {
                formdata += "&siblingrows=" + encodeURIComponent(siblingsJsonAddAnimal);
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
                
                // If a scan image is pending, attach it as media to the newly-created (or just-saved) animal
                if (createdID && createdID !== "0" && animal_induction.scanned_form_image_data) {
                    await animal_induction.upload_scan_form_image(createdID);
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
                $(".asm-content button").button("enable");
                header.hide_loading();
            }
        },

        /**
         * Saves current progress by creating an animal record with minimal validation
         */
        save_progress: async function() {
            // Live weight validation before any network request
            if (!animal_induction.validate_weight_field(true)) { return; }

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
            let formdata = "mode=save&" + $("input, textarea, select").not(".chooser").not(".sibling-name").not(".sibling-sex").toPOST();

            // Add animal ID if we're editing an existing animal
            if (controller.animal) {
                formdata += "&id=" + controller.animal.ID;
                formdata += "&recordversion=" + controller.animal.RECORDVERSION;
            }
            // Always include sibling rows if user has entered a count > 0
            const siblingsJson = animal_induction.serialize_sibling_rows();
            if (siblingsJson) {
                formdata += "&siblingrows=" + encodeURIComponent(siblingsJson);
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

                // If a scan image is pending, attach it as media to the newly-saved animal
                if (animalID && animalID !== "0" && animal_induction.scanned_form_image_data) {
                    await animal_induction.upload_scan_form_image(animalID);
                }

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
            $("#coordinatorrow, #feerow, #poundsrow").hide();

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
                    // Clear grid if no animal — but preserve any pending-scan preview
                    $("#media-grid .media-slot").each(function() {
                        if ($(this).attr('data-pending-scan') === '1') { return; }
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
            // Preserve any slot occupied by the pending form scan preview.
            const $slots = $("#media-grid .media-slot").filter(function() {
                return $(this).attr('data-pending-scan') !== '1';
            });
            // Reset the non-pending slots
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
            // Single-page induction: show all sections and groups. Do NOT blanket-show
            // individual field rows — bind() selectively hides rows (Code when auto-generated,
            // optional rows when config disables them). Respect those hides.
            $(".form-group, .inspection-section").show();
            // Force weight row visible (useful field for animal entry)
            $("#kilosrow").css("display", "grid");
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
            animal_induction.location_touched = false;
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

            // Helper to validate the weight field in grams range (1-2500)
            const validate_weight_field = animal_induction.validate_weight_field;

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
            if (!validate_weight_field(true)) { return false; }
            if (!additional.validate_mandatory()) { return false; }
            return true;
        },

        /**
         * Validate weight field range (grams only). Returns true if ok.
         * When showError is true, surfaces an error header and highlights the field.
         */
        validate_weight_field: function(showError) {
            const weightValStr = common.trim($("#weight").val());
            if (weightValStr === "") { return true; }
            const w = format.to_float(weightValStr);
            const ok = !(isNaN(w) || w < 1 || w > 2500);
            if (!ok && showError) {
                header.show_error(_("Weight must be between 1 and 2500 grams"));
                validate.highlight("weight");
            } else if (ok && showError) {
                // Clear any prior weight error when the field becomes valid
                header.hide_error();
                validate.unhighlight && validate.unhighlight("weight");
            }
            return ok;
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
            if (animal_induction.weight_in_grams()) {
                $("#kglabel").html(_("g"));
                $("#kilosrow").show();
                const grams = animal_induction.grams_string($("#weight").val());
                if (grams !== "") { 
                    $("#weight").val(grams); 
                }
            }
            else {
                $("#kglabel").html(_("kg"));
                $("#kilosrow").show();
            }

            // Debug visibility and config for weight row
            console.info("[asm] AddAnimalsShowWeight:", config.bool("AddAnimalsShowWeight"),
                "kilosrow exists:", $("#kilosrow").length,
                "display:", $("#kilosrow").css("display"));

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
            if (!config.bool("AddAnimalsShowWeight")) {
            }
            if (config.bool("UseSingleBreedField")) {
                $("#crossbreedcol, #secondbreedcol").hide();
            }
            if (config.bool("DisableShortCodesControl")) {
                $("#shortcode").hide();
                $("#sheltercode").addClass("asm-textbox");
                $("#sheltercode").removeClass("asm-halftextbox");
            }
            // Hide the Code row when:
            //  - new animal AND auto-generated codes (server will generate on save — no value to show yet)
            //  - existing animal AND auto-generated codes (keep backwards-compatible hide)
            // Show when ManualCodes is enabled (user must enter it).
            if (!config.bool("ManualCodes")) { $("#coderow").hide(); }
            // For existing animals the code is useful — show it read-only so the user can see/copy it.
            if (controller.animal && controller.animal.ID && !config.bool("ManualCodes")) {
                $("#coderow").show();
                $("#sheltercode").prop("readonly", true).css({ background: "#f5f5f5" });
                $("#shortcode").prop("readonly", true).css({ background: "#f5f5f5" });
            }


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
            // Track genuine user changes (jQuery sets e.isTrigger for programmatic
            // .trigger('change') calls, so those are ignored here).
            $("#internallocation").on("change", function(e) {
                if (!e.isTrigger) { animal_induction.location_touched = true; }
            });
            $("#crossbreed").change(animal_induction.enable_widgets);
            $("#nonshelter").change(animal_induction.enable_widgets);
            $("#transferin").change(animal_induction.enable_widgets);
            $("#entrytype").change(animal_induction.enable_widgets);
            $("#hold").change(animal_induction.enable_widgets);
            $("#holduntil").change(animal_induction.enable_widgets);
            animal_induction.enable_widgets();
            $("#weight").on("change blur input", function() {
                // Live validate weight range so users see errors immediately
                animal_induction.validate_weight_field(true);
            });

            // Default species has been set, update the available breeds
            // before choosing the default breed
            animal_induction.update_breed_select();
            $("#breed1").val(config.str("AFDefaultBreed"));
            $("#breed2").val(config.str("AFDefaultBreed"));

            // Set default location to Induction, but ONLY for a brand-new
            // induction (not when editing an existing animal — sync() sets the
            // location from the saved record there) and ONLY if the user
            // hasn't already chosen a location. Without these guards this timer
            // clobbers the user's location 500ms after load and on every
            // reload, causing their change (and the animal's location) to be
            // lost on the first save.
            if (!controller.animal) {
                setTimeout(function() {
                    if (animal_induction.location_touched) { return; }
                    if ($("#internallocation").val()) { return; }
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
            }

            // Buttons
            $("#button-reset").button().click(function() {
                animal_induction.reset();
            });

            $("#button-save").button().click(function() {
                animal_induction.save_progress();
            });

            // Siblings table rebuild triggers
            $("#siblings").on("change keyup input", function() { animal_induction.rebuild_sibling_rows(); });
            $("#animalname").on("change keyup input", function() {
                if (parseInt($("#siblings").val() || "0", 10) > 0) {
                    const $body = $("#siblingrows tbody");
                    const baseName = $.trim($("#animalname").val() || "") || _("Sibling");
                    $body.find("tr").each(function(i) {
                        const $input = $(this).find("input.sibling-name");
                        if ($input.data("custom") !== true) {
                            $input.val(baseName + " " + (i + 2));
                        }
                    });
                }
            });
            // Track user edits to sibling names
            $("#siblingrows").on("input", "input.sibling-name", function() {
                $(this).data("custom", true);
            });

            $("#button-barcode").button().click(function() {
                if (!controller.animal || !controller.animal.ID) { return; }
                const url = "animal_barcode?id=" + controller.animal.ID;
                window.open(url, "_blank", "noopener");
            });

            // Scan Admission Form button — reuses the AI Dictation permission.
            // The bottom-toolbar versions of scan/transcript are hidden because we
            // also surface them in the top actions bar (see render()), but all the
            // click logic is bound to the bottom buttons — the top buttons simply
            // proxy-click them.
            $("#button-top-scanform").off("click").on("click", function() { $("#button-scanform").click(); });
            $("#button-top-importtranscript").off("click").on("click", function() { $("#button-importtranscript").click(); });
            $("#button-scanform, #button-importtranscript").hide();
            if (!common.has_permission("uaid")) {
                $("#button-top-scanform, #button-top-importtranscript").hide();
            }
            // Toggle which action-bar buttons are visible based on whether an image
            // has been chosen. The action bar stays sticky at the top of the dialog
            // so mobile users can always tap Extract & Fill without scrolling past
            // the full-size preview.
            const scan_update_bar = function() {
                const loaded = !!animal_induction.scan_form_raw;
                $("#scan-form-btn-camera, #scan-form-btn-library").toggle(!loaded);
                $("#scan-form-btn-extract, #scan-form-rotate, #scan-form-replace").toggle(loaded);
                $("#scan-form-btn-extract").prop("disabled", !loaded);
            };

            $("#button-scanform").button().click(function() {
                animal_induction.scan_form_raw = null;
                animal_induction.scan_form_rotation = 0;
                animal_induction.scan_form_processed = null;
                $("#scan-form-thumb").attr("src", "").css("transform", "");
                $("#scan-form-thumb-wrap").hide();
                $("#scan-form-status").text("");
                $("#scan-form-file-camera, #scan-form-file-library").val("");
                scan_update_bar();
                $("#dialog-scan-form").dialog({
                    autoOpen: true, width: Math.min(700, $(window).width() - 40),
                    modal: true, dialogClass: "dialogshadow",
                    buttons: [{ text: _("Close"), click: function() { $(this).dialog("close"); } }]
                });
            });
            $("#scan-form-btn-camera").off("click").on("click", function() { $("#scan-form-file-camera").trigger("click"); });
            $("#scan-form-btn-library").off("click").on("click", function() { $("#scan-form-file-library").trigger("click"); });
            $("#scan-form-btn-extract").off("click").on("click", function() {
                if (!animal_induction.scan_form_raw) {
                    $("#scan-form-status").text(_("Please choose or take a photo first."));
                    return;
                }
                animal_induction.scan_form_process();
            });
            $("#scan-form-rotate").off("click").on("click", function() {
                animal_induction.scan_form_rotation = (animal_induction.scan_form_rotation + 90) % 360;
                animal_induction.scan_form_refresh_thumb();
            });
            $("#scan-form-replace").off("click").on("click", function() {
                animal_induction.scan_form_raw = null;
                animal_induction.scan_form_rotation = 0;
                $("#scan-form-thumb-wrap").hide();
                $("#scan-form-file-camera, #scan-form-file-library").val("");
                $("#scan-form-status").text("");
                scan_update_bar();
            });
            const onScanFileChange = async function(input) {
                const f = input.files && input.files[0];
                if (!f) { return; }
                try {
                    animal_induction.scan_form_raw = await animal_induction.scan_form_read_file(f);
                    animal_induction.scan_form_rotation = 0;
                    animal_induction.scan_form_refresh_thumb();
                    $("#scan-form-thumb-wrap").show();
                    $("#scan-form-status").text(_("Check the form is the right way up, then tap Extract & Fill."));
                    scan_update_bar();
                } catch (e) {
                    $("#scan-form-status").text(_("Could not read that image."));
                }
            };
            $("#scan-form-file-camera").off("change").on("change", function() { onScanFileChange(this); });
            $("#scan-form-file-library").off("change").on("change", function() { onScanFileChange(this); });
            $("#scan-form-thumb").off("click").on("click", function() {
                const $img = $(this);
                const expanded = $img.data("expanded");
                if (expanded) {
                    $img.css({ "max-height": "50vh", "max-width": "95%", "cursor": "zoom-in" }).data("expanded", false);
                } else {
                    $img.css({ "max-height": "none", "max-width": "95vw", "cursor": "zoom-out" }).data("expanded", true);
                }
            });
            $("#scan-result-close").button().click(function() { $("#scan-result-panel").hide(); });

            // Import from Transcript button
            if (!common.has_permission("uaid")) {
                $("#button-importtranscript").hide();
            }
            $("#button-importtranscript").button().click(function() {
                $("#import-transcript-text").val("");
                let btns = {};
                btns[_("Extract & Fill")] = {
                    text: _("Extract & Fill"),
                    "class": "asm-dialog-actionbutton",
                    click: function() {
                        let text = $.trim($("#import-transcript-text").val());
                        if (!text) { return; }
                        $("#dialog-import-transcript").dialog("close");
                        header.show_loading(_("Extracting data from transcript..."));
                        common.ajax_post("ai_assistant", "mode=extract&transcript=" + encodeURIComponent(text), function(result) {
                            header.hide_loading();
                            let response;
                            try { response = JSON.parse(result); } catch(e) { response = {}; }
                            if (response.success && response.data) {
                                sessionStorage.setItem("ai_induction_data", JSON.stringify(response.data));
                                sessionStorage.setItem("ai_induction_transcript", text);
                                animal_induction.load_from_transcript();
                            } else {
                                header.show_error(response.message || _("Failed to extract data from transcript."));
                            }
                        });
                    }
                };
                btns[_("Cancel")] = function() { $(this).dialog("close"); };
                $("#dialog-import-transcript").dialog({
                    autoOpen: true, width: 600, modal: true,
                    dialogClass: "dialogshadow", buttons: btns
                });
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
            $("#poundsrow, #coordinatorrow, #feerow").hide();

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
                // Check for AI transcript data to pre-fill
                animal_induction.load_from_transcript();
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

        /** Load pre-fill data from AI transcript extraction (stored in sessionStorage) */
        load_from_transcript: function() {
            var raw = sessionStorage.getItem("ai_induction_data");
            if (!raw) { return; }
            // Clear it so it doesn't re-apply on next visit
            sessionStorage.removeItem("ai_induction_data");
            var transcript = sessionStorage.getItem("ai_induction_transcript") || "";
            sessionStorage.removeItem("ai_induction_transcript");

            var data;
            try { data = JSON.parse(raw); } catch(e) { return; }

            // Show a banner so the user knows this was pre-filled
            header.show_info(_("Form pre-filled from voice transcript. Please review before saving."));

            // Delay to ensure form is fully rendered
            setTimeout(function() {
                if (data.animalname) { $("#animalname").val(data.animalname); }
                if (data.species_id) { $("#species").val(data.species_id).change(); }
                if (data.breed_id) {
                    setTimeout(function() { $("#breed1").val(data.breed_id); }, 300);
                }
                if (data.sex !== undefined && data.sex !== null) { $("#sex").val(data.sex); }
                if (data.colour_id) { $("#basecolour").val(data.colour_id); }
                if (data.weight) { $("#weight").val(data.weight); }
                if (data.microchip) {
                    $("#microchipped").prop("checked", true);
                    $("#microchipnumber").val(data.microchip);
                }
                if (data.markings) { $("#markings").val(data.markings); }
                if (data.location_id) { $("#internallocation").val(data.location_id); }
                // Combine comments, health_problems, and original transcript
                var comments = [];
                if (data.comments) { comments.push(data.comments); }
                if (data.health_problems) { comments.push("Health: " + data.health_problems); }
                if (transcript) { comments.push("--- Original transcript ---\n" + transcript); }
                if (comments.length > 0) { $("#comments").val(comments.join("\n\n")); }
            }, 300);
        },

        /**
         * Display the scanned form as a preview in the first empty Photos slot,
         * so the user sees it will be attached as media on save. Purely visual —
         * the actual upload happens in upload_scan_form_image() after the animal
         * record is created.
         */
        place_scan_in_media_grid: function(data_url) {
            if (!data_url) { return; }
            // If we previously placed a pending scan, remove it before placing the new one
            const $prev = $("#media-grid .media-slot[data-pending-scan='1']");
            if ($prev.length) {
                $prev.removeAttr("data-pending-scan")
                    .removeClass("filled")
                    .find("img").attr("src", "").end()
                    .find(".media-empty-hint").show().end()
                    .find(".pending-scan-badge").remove();
            }
            const $slot = $("#media-grid .media-slot:not(.filled)").first();
            if ($slot.length === 0) {
                // Grid is full — leave a hint in the scan result panel instead.
                try {
                    const $hint = $('<div style="color:#a60; margin-top:6px;"></div>')
                        .text(_("Photos grid is full — the scan will still be attached as media on save."));
                    $("#scan-result-summary").append($hint);
                } catch (e) {}
                return;
            }
            $slot.attr("data-pending-scan", "1")
                .addClass("filled")
                .find("img").attr("src", data_url).show().end()
                .find(".media-empty-hint").hide().end()
                .find(".media-actions").show().end()
                .find(".make-default").hide();  // not meaningful for a form scan
            // Badge to make it clear this is the form scan, not a regular photo
            if ($slot.find(".pending-scan-badge").length === 0) {
                $slot.append(
                    '<span class="pending-scan-badge" style="' +
                    'position:absolute; top:4px; right:4px; background:#1e5fb8; color:#fff; ' +
                    'font-size:10px; padding:2px 6px; border-radius:10px; z-index:2;">' +
                    _("Form scan") + '</span>');
            }
            // Delete handler: clear the pending scan + nullify cached data URL
            $slot.find(".delete").off("click.pendingscan").on("click.pendingscan", function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (!confirm(_("Remove the scanned form? It won't be attached on save."))) { return; }
                animal_induction.clear_pending_scan();
            });
        },

        /** Clear the pending-scan slot and forget the cached image */
        clear_pending_scan: function() {
            animal_induction.scanned_form_image_data = null;
            const $slot = $("#media-grid .media-slot[data-pending-scan='1']");
            if ($slot.length === 0) { return; }
            $slot.removeAttr("data-pending-scan").removeClass("filled");
            $slot.find("img").attr("src", "").hide();
            $slot.find(".media-empty-hint").show();
            $slot.find(".media-actions").hide();
            $slot.find(".make-default").show();
            $slot.find(".pending-scan-badge").remove();
        },

        /** Read a File into a data URL */
        scan_form_read_file: function(file) {
            return new Promise(function(resolve, reject) {
                const reader = new FileReader();
                reader.onload = function() { resolve(reader.result); };
                reader.onerror = function() { reject(new Error("read failed")); };
                reader.readAsDataURL(file);
            });
        },

        /**
         * Apply rotation and downscale to max 1600px long edge.
         * Returns a JPEG data URL ready to send to the vision model.
         */
        scan_form_apply_rotation: function(data_url, degrees) {
            const MAX_EDGE = 1600;
            return new Promise(function(resolve, reject) {
                const img = new Image();
                img.onload = function() {
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

        /** Update the preview thumbnail with the current rotation */
        scan_form_refresh_thumb: function() {
            const raw = animal_induction.scan_form_raw;
            if (!raw) { return; }
            $("#scan-form-thumb").attr("src", raw)
                .css("transform", "rotate(" + animal_induction.scan_form_rotation + "deg)");
        },

        /** Send the current scan image to the backend for extraction, then pre-fill */
        scan_form_process: async function() {
            if (!animal_induction.scan_form_raw) { return; }
            $("#scan-form-status").text(_("Preparing image..."));
            let rotated;
            try {
                rotated = await animal_induction.scan_form_apply_rotation(
                    animal_induction.scan_form_raw, animal_induction.scan_form_rotation);
            } catch (e) {
                $("#scan-form-status").text(_("Could not process image."));
                return;
            }
            animal_induction.scan_form_processed = rotated;
            $("#scan-form-status").text(_("Reading form with AI — this may take up to a minute..."));
            const started = Date.now();
            try {
                const response = await common.ajax_post(
                    "animal_induction",
                    "mode=scanform&filedata=" + encodeURIComponent(rotated));
                let payload;
                try { payload = JSON.parse(response); } catch(e) { payload = null; }
                if (!payload || typeof payload !== "object") {
                    $("#scan-form-status").text(_("AI returned an unexpected response."));
                    return;
                }
                const elapsed = ((Date.now() - started) / 1000).toFixed(1);
                $("#dialog-scan-form").dialog("close");
                const report = animal_induction.apply_scan_result(payload);
                animal_induction.render_scan_result_panel(payload, report, elapsed);
                try { console.log("[scan-form] payload:", payload, "report:", report); } catch (e) {}
                const appliedCount = (report.applied || []).length;
                const unmappedCount = (report.unmapped || []).length;
                if (unmappedCount === 0) {
                    header.show_info(
                        _("Form pre-filled from scan ({0} fields applied, {1}s). Please review before saving.")
                            .replace("{0}", String(appliedCount))
                            .replace("{1}", elapsed));
                } else {
                    header.show_info(
                        _("Form pre-filled from scan ({0} applied, {1} not applied — see panel below).")
                            .replace("{0}", String(appliedCount))
                            .replace("{1}", String(unmappedCount)));
                }
            } catch (err) {
                const msg = (err && err.message) ? err.message : String(err || "");
                $("#scan-form-status").text(_("Scan failed: ") + msg);
            }
        },

        /** Parse an ISO date (YYYY-MM-DD) and return it in the locale's date format */
        scan_form_format_date: function(iso) {
            if (!iso) { return ""; }
            // Prefer ASM's format helpers when the value looks like an ISO date
            if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
                try {
                    const parts = iso.split("-");
                    const y = parseInt(parts[0], 10);
                    const m = parseInt(parts[1], 10) - 1;
                    const d = parseInt(parts[2], 10);
                    const dt = new Date(y, m, d);
                    if (typeof format !== "undefined" && format.date) {
                        return format.date(dt);
                    }
                } catch(e) {}
            }
            return iso;
        },

        /**
         * Resolve a free-text value against the actual options of a <select>.
         * Returns an option VALUE that can be passed to .val(), or null.
         *
         * Matching tries: exact value, exact text, substring on value, substring on text
         * (both directions). This is robust to the AI returning a shorter label than the
         * option (e.g. "Baby" for an option valued "Baby (<1 month)").
         */
        scan_form_match_select_option: function(selector, wanted) {
            const $sel = $(selector);
            if ($sel.length === 0 || !wanted) { return null; }
            const needle = String(wanted).trim().toLowerCase();
            let matched = null;
            const options = $sel.find("option").toArray();

            // Pass 1: exact value (case-insensitive)
            for (let i = 0; i < options.length; i++) {
                const v = $(options[i]).val();
                if (v != null && String(v).toLowerCase() === needle) { matched = v; break; }
            }
            // Pass 2: exact text
            if (!matched) {
                for (let i = 0; i < options.length; i++) {
                    const t = $(options[i]).text();
                    if (t && String(t).toLowerCase().trim() === needle) {
                        matched = $(options[i]).val(); break;
                    }
                }
            }
            // Pass 3: substring on value or text (either direction)
            if (!matched) {
                for (let i = 0; i < options.length; i++) {
                    const v = String($(options[i]).val() || "").toLowerCase();
                    const t = String($(options[i]).text() || "").toLowerCase();
                    if (!v && !t) { continue; }
                    if (v && (v.indexOf(needle) !== -1 || needle.indexOf(v) !== -1)) {
                        matched = $(options[i]).val(); break;
                    }
                    if (t && (t.indexOf(needle) !== -1 || needle.indexOf(t) !== -1)) {
                        matched = $(options[i]).val(); break;
                    }
                }
            }
            return matched || null;
        },

        /**
         * Resolve a free-text value against a list of lookup rows. Returns the ID of
         * the closest match (case-insensitive, trimmed, contains or startswith), or null.
         */
        scan_form_match_lookup: function(rows, nameKey, valueKey, wanted) {
            if (!rows || !rows.length || !wanted) { return null; }
            const target = String(wanted).trim().toLowerCase();
            // Exact match first
            for (let i = 0; i < rows.length; i++) {
                const name = String(rows[i][nameKey] || "").trim().toLowerCase();
                if (name === target) { return rows[i][valueKey]; }
            }
            // Contains either way
            for (let i = 0; i < rows.length; i++) {
                const name = String(rows[i][nameKey] || "").trim().toLowerCase();
                if (name && (name.indexOf(target) !== -1 || target.indexOf(name) !== -1)) {
                    return rows[i][valueKey];
                }
            }
            return null;
        },

        /**
         * Apply extracted values to the form. Standard fields map to fixed IDs;
         * the 'additional' object keys match FIELDNAME and map to add_{ID}.
         * Returns a report: { applied: [...], unmapped: [...] } so the caller can
         * surface a diagnostic panel — the user iterates on matching from this.
         */
        apply_scan_result: function(payload) {
            const data = (payload && payload.extracted) || {};
            const additional_data = (data && typeof data.additional === "object" && data.additional) || {};
            const applied = [];
            const unmapped = [];
            const applyOK = function(label, value) { applied.push({ field: label, value: value }); };
            const noMatch = function(key, value, reason) {
                unmapped.push({ key: key, value: value, reason: reason });
            };

            // Cache the scan image so we can upload it as media after save
            animal_induction.scanned_form_image_data = animal_induction.scan_form_processed;
            // Surface the scan in the Photos grid so the user can see what will be attached
            animal_induction.place_scan_in_media_grid(animal_induction.scan_form_processed);

            // Standard fields
            if (data.animalname) { $("#animalname").val(data.animalname); applyOK("animalname", data.animalname); }
            if (data.sex === "M" || data.sex === "F") {
                $("#sex").val(data.sex === "M" ? "1" : "0").trigger("change");
                applyOK("sex", data.sex);
            } else if (data.sex != null && data.sex !== "") {
                noMatch("sex", data.sex, _("expected \"M\" or \"F\""));
            }
            if (data.weight_grams != null && data.weight_grams !== "") {
                $("#weight").val(String(data.weight_grams));
                applyOK("weight (g)", data.weight_grams);
            }
            if (data.microchip_number) {
                // The microchip row is hidden when AddAnimalsShowMicrochip=false.
                // Unhide so the user can see and edit the extracted value.
                $("#microchiprow").show();
                $("#microchipnumber").val(String(data.microchip_number));
                $("#microchipped").prop("checked", true);
                if (data.microchip_source === "barcode") {
                    $("#microchipnumber").attr("title", _("Verified by barcode scanner"));
                }
                applyOK("microchipnumber" + (data.microchip_source === "barcode" ? " (barcode)" : ""),
                        data.microchip_number);
            } else if (data.microchipped === "N") {
                $("#microchipped").prop("checked", false);
                applyOK("microchipped", "N");
            } else if (data.microchipped === "Y") {
                $("#microchipped").prop("checked", true);
                applyOK("microchipped", "Y");
            }

            // Dates
            if (data.date_brought_in) {
                const ds = animal_induction.scan_form_format_date(data.date_brought_in);
                if (ds) { $("#datebroughtin").val(ds); applyOK("datebroughtin", ds); }
                else { noMatch("date_brought_in", data.date_brought_in, _("could not parse as date")); }
            }
            if (data.date_of_birth) {
                const ds = animal_induction.scan_form_format_date(data.date_of_birth);
                if (ds) { $("#dateofbirth").val(ds); applyOK("dateofbirth", ds); }
                else { noMatch("date_of_birth", data.date_of_birth, _("could not parse as date")); }
            }

            // Age group — match against the actual <select>'s option values (NOT
            // controller.agegroups, which is a separate config list and can disagree
            // with the additional field's LOOKUPVALUES used to populate the select).
            if (data.age_group) {
                const ag = String(data.age_group).trim();
                const matched = animal_induction.scan_form_match_select_option("#entryagerange", ag);
                if (matched) {
                    $("#entryagerange").val(matched).trigger("change");
                    // Direct sync of the hidden mirror — the change handler syncs it too
                    // but rely-and-verify is safer (and cheap).
                    $("#entryagerange_post").val(matched);
                    applyOK("entryagerange", matched);
                } else {
                    const opts = $("#entryagerange option").map(function() {
                        return $(this).val() || $(this).text();
                    }).get().filter(Boolean);
                    noMatch("age_group", ag, _("no matching option in ") + "[" + opts.join(", ") + "]");
                }
            }

            // Base colour
            if (data.base_colour) {
                const cid = animal_induction.scan_form_match_lookup(
                    controller.colours || [], "BASECOLOUR", "ID", data.base_colour);
                if (cid) {
                    $("#basecolour").val(cid).trigger("change");
                    applyOK("basecolour", data.base_colour + " (ID " + cid + ")");
                } else {
                    noMatch("base_colour", data.base_colour, _("no matching colour in lookup"));
                }
            }

            // Entry reason
            if (data.entry_reason) {
                const rid = animal_induction.scan_form_match_lookup(
                    controller.entryreasons || [], "REASONNAME", "ID", data.entry_reason);
                if (rid) {
                    $("#entryreason").val(rid).trigger("change");
                    applyOK("entryreason", data.entry_reason + " (ID " + rid + ")");
                } else {
                    noMatch("entry_reason", data.entry_reason, _("no matching entry reason in lookup"));
                }
            }

            if (data.where_found) {
                $("#entrylocationdescription").val(data.where_found);
                applyOK("entrylocationdescription", String(data.where_found).substring(0, 80));
            }

            if (data.comments) {
                const existing = $("#comments").val() || "";
                const joined = existing ? existing + "\n\n" + data.comments : data.comments;
                $("#comments").val(joined);
                applyOK("comments (appended)", String(data.comments).substring(0, 80));
            }

            // Catch any top-level keys we didn't consume. "additional",
            // "microchip_source", barcode etc. are expected metadata.
            const knownTop = {
                "animalname": 1, "sex": 1, "weight_grams": 1, "microchip_number": 1,
                "microchipped": 1, "microchip_source": 1, "date_brought_in": 1,
                "date_of_birth": 1, "age_group": 1, "base_colour": 1, "entry_reason": 1,
                "where_found": 1, "comments": 1, "additional": 1
            };
            $.each(data, function(k, v) {
                if (knownTop[k]) { return; }
                if (v == null || v === "") { return; }
                noMatch(k, v, _("unknown top-level key"));
            });

            // Additional (custom) fields
            if (controller.additional && typeof additional_data === "object") {
                $.each(additional_data, function(fname, value) {
                    if (value == null || value === "") { return; }
                    let field = null;
                    for (let i = 0; i < controller.additional.length; i++) {
                        if (String(controller.additional[i].FIELDNAME || "").toLowerCase() ===
                                String(fname).toLowerCase()) {
                            field = controller.additional[i];
                            break;
                        }
                    }
                    if (!field) {
                        noMatch("additional." + fname, value, _("no FIELDNAME matches in controller.additional"));
                        return;
                    }
                    // Some additional fields are surfaced with a plain-name UI widget
                    // (e.g. #entrylocationweather) rather than the generic #add_{ID} —
                    // main.py post_save re-maps them back to the additional system. Prefer
                    // the plain selector when it exists.
                    let selector = "#" + field.FIELDNAME;
                    let $el = $(selector);
                    if ($el.length === 0) {
                        selector = "#add_" + field.ID;
                        $el = $(selector);
                    }
                    if ($el.length === 0) {
                        noMatch("additional." + fname, value,
                            _("FIELDNAME found but neither #") + field.FIELDNAME +
                            _(" nor #add_") + field.ID + _(" is in the DOM"));
                        return;
                    }
                    const ftype = field.FIELDTYPE;
                    const label = "additional." + fname + " → " + selector;
                    if (ftype === 0) {
                        const on = (String(value).toUpperCase() === "Y" ||
                                    String(value) === "1" ||
                                    String(value).toLowerCase() === "true");
                        $el.prop("checked", on).trigger("change");
                        applyOK(label, on ? "Y" : "N");
                    } else if (ftype === 4) {
                        const ds = animal_induction.scan_form_format_date(value);
                        $el.val(ds);
                        applyOK(label, ds);
                    } else if (ftype === 6) {
                        // LOOKUP — match against the actual <select>'s options (robust
                        // to label variations and Y/N abbreviations).
                        const v = String(value).trim();
                        let hit = animal_induction.scan_form_match_select_option(selector, v);
                        if (!hit) {
                            // Y/N → Yes/No fallback
                            const vu = v.toUpperCase();
                            if (vu === "Y" || vu === "YES") {
                                hit = animal_induction.scan_form_match_select_option(selector, "Yes");
                            } else if (vu === "N" || vu === "NO") {
                                hit = animal_induction.scan_form_match_select_option(selector, "No");
                            }
                        }
                        if (hit) {
                            $el.val(hit).trigger("change");
                            if ($el.val() === hit) { applyOK(label, hit); }
                            else { noMatch(label, v, _("assignment did not stick — option value mismatch")); }
                        } else {
                            const opts = $el.find("option").map(function() {
                                return $(this).val() || $(this).text();
                            }).get().filter(Boolean);
                            if (opts.length === 0) {
                                $el.val(v).trigger("change");
                                applyOK(label + " (no lookup defined)", v);
                            } else {
                                noMatch(label, v, _("no matching option: ") + "[" + opts.join(", ") + "]");
                            }
                        }
                    } else if (ftype === 7) {
                        let arr = value;
                        if (typeof value === "string") {
                            arr = value.split("|").map(function(s) { return s.trim(); }).filter(Boolean);
                        }
                        if (Array.isArray(arr)) {
                            $el.val(arr).trigger("change");
                            if (typeof $el.bsmSelect === "function") { $el.change(); }
                            applyOK(label, arr.join(" | "));
                        } else {
                            noMatch(label, value, _("expected array or pipe-separated string"));
                        }
                    } else {
                        $el.val(String(value)).trigger("change");
                        applyOK(label, String(value));
                    }
                });
                // Refresh Y/N card visuals
                setTimeout(function() {
                    $(".yesno-field").each(function() {
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
                }, 50);
            } else if (additional_data && Object.keys(additional_data).length > 0) {
                $.each(additional_data, function(fname, value) {
                    if (value == null || value === "") { return; }
                    noMatch("additional." + fname, value, _("no controller.additional defined"));
                });
            }

            return { applied: applied, unmapped: unmapped };
        },

        /**
         * Render the diagnostic panel with the extract/apply report, raw payload,
         * and model/timing metadata. Users dismiss it when they're done reviewing.
         */
        render_scan_result_panel: function(payload, report, elapsed_seconds) {
            const renderValue = function(v) {
                if (typeof v === "object") { return JSON.stringify(v); }
                return String(v);
            };
            const extracted = (payload && payload.extracted) || {};
            const extractedKeys = Object.keys(extracted).length +
                (extracted.additional ? Object.keys(extracted.additional).length - 1 : 0);
            const summary = _("Extracted {0} fields. Model: {1}. Elapsed: {2}s. Tokens: {3} in / {4} out.")
                .replace("{0}", String(extractedKeys))
                .replace("{1}", payload.model || "?")
                .replace("{2}", String(elapsed_seconds))
                .replace("{3}", String(payload.input_tokens || 0))
                .replace("{4}", String(payload.output_tokens || 0));
            $("#scan-result-summary").text(summary);

            const appliedHtml = (report.applied || []).map(function(a) {
                return '<li><code>' + html.title(a.field) + '</code> = ' + html.title(renderValue(a.value)) + '</li>';
            }).join("");
            $("#scan-result-applied").html(appliedHtml || '<li style="color:#888;">' + _("(none)") + '</li>');
            $("#scan-result-applied-count").text(String((report.applied || []).length));

            const unmappedHtml = (report.unmapped || []).map(function(u) {
                return '<li><code>' + html.title(u.key) + '</code> = ' + html.title(renderValue(u.value)) +
                    ' <span style="color:#a60;">— ' + html.title(u.reason) + '</span></li>';
            }).join("");
            $("#scan-result-unmapped").html(unmappedHtml || '<li style="color:#888;">' + _("(none)") + '</li>');
            $("#scan-result-unmapped-count").text(String((report.unmapped || []).length));

            const nApplied = (report.applied || []).length;
            const nUnmapped = (report.unmapped || []).length;
            $("#scan-result-diag-counts").text(
                "(" + nApplied + " " + _("applied") + ", " + nUnmapped + " " + _("not applied") + ")");

            try {
                $("#scan-result-raw").text(JSON.stringify(payload, null, 2));
            } catch (e) {
                $("#scan-result-raw").text(String(payload));
            }

            $("#scan-result-panel").show();
            try { $("html, body").animate({ scrollTop: $("#scan-result-panel").offset().top - 80 }, 300); } catch (e) {}
        },

        /**
         * If a scan image was captured, upload it as media to the newly-created animal.
         * Called from add_animal() after a successful save; silently no-ops if no scan.
         * Uses callback-style ajax (wrapped in a Promise) because jqXHR's thenable
         * semantics aren't always await-safe across jQuery versions.
         */
        upload_scan_form_image: function(animalID) {
            return new Promise(function(resolve) {
                const data_url = animal_induction.scanned_form_image_data;
                if (!data_url || !animalID || animalID === "0") {
                    try { console.log("[scan-form] upload skipped", { animalID: animalID, hasImage: !!data_url }); } catch (e) {}
                    resolve();
                    return;
                }
                try { console.log("[scan-form] uploading scan image", { animalID: animalID, bytes: data_url.length }); } catch (e) {}
                const formdata = "animalid=" + animalID +
                    "&type=gallery" +
                    "&filename=" + encodeURIComponent("admission_form_scan.jpg") +
                    "&filedata=" + encodeURIComponent(data_url);
                $.ajax({
                    method: "POST",
                    url: "mobile_photo_upload",
                    data: formdata,
                    dataType: "text",
                    mimeType: "textPlain",
                    success: function(mid) {
                        try { console.log("[scan-form] upload success, mid=", mid); } catch (e) {}
                        animal_induction.scanned_form_image_data = null;
                        // Demote the slot marker so a subsequent load_media_list can pick up
                        // the server-side version of this same image.
                        $("#media-grid .media-slot[data-pending-scan='1']")
                            .removeAttr("data-pending-scan")
                            .find(".pending-scan-badge").remove();
                        resolve();
                    },
                    error: function(jqXHR, textStatus, errorThrown) {
                        try {
                            console.error("[scan-form] upload failed",
                                { status: jqXHR && jqXHR.status, textStatus: textStatus, error: errorThrown,
                                  responseText: (jqXHR && jqXHR.responseText || "").substring(0, 200) });
                        } catch (e) {}
                        try { header.show_error(_("Animal saved but form scan image could not be attached.")); } catch (e2) {}
                        resolve();
                    }
                });
            });
        },

        destroy: function() {
            // Clear any lingering validation banner when leaving the module
            header.hide_error();
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
