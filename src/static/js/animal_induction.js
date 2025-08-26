/*global $, jQuery, _, additional, asm, common, config, controller, dlgfx, format, header, html, validate */

$(function() {

    "use strict";

    const animal_induction = {

        /** Only attempt to set the non-shelter animal type once per reset */
        set_nonsheltertype_once: false,

        render: function() {
            return [
                '<div id="dialog-similar" style="display: none" title="' + _("Similar Animal") + '">',
                '<p><span class="ui-icon ui-icon-alert"></span>',
                _("This animal has the same name as another animal recently added to the system.") + '<br /><br />',
                '<span class="similar-animal"></span>',
                '</p>',
                '</div>',
                html.content_header(_("Patient Induction")),
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
                '.form-section {',
                '    display: grid;',
                '    grid-template-columns: 1fr 1fr;',
                '    gap: 30px;',
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
                '    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));',
                '    gap: 20px;',
                '}',
                '.inspection-item {',
                '    padding: 16px 20px;',
                '    background: #f8f9fa;',
                '    border: 2px solid #e9ecef;',
                '    border-radius: 8px;',
                '    transition: all 0.2s ease;',
                '}',
                '.inspection-item:hover {',
                '    background: #e3f2fd;',
                '    border-color: #2196f3;',
                '    transform: translateY(-1px);',
                '}',
                '.inspection-field-label {',
                '    font-weight: 600;',
                '    color: #495057;',
                '    margin-bottom: 8px;',
                '    display: block;',
                '    font-size: 14px;',
                '}',
                '.inspection-item select {',
                '    width: 100%;',
                '    padding: 8px 12px;',
                '    border: 2px solid #e9ecef;',
                '    border-radius: 6px;',
                '    background: white;',
                '    font-size: 14px;',
                '    color: #495057;',
                '    transition: border-color 0.3s ease;',
                '}',
                '.inspection-item select:focus {',
                '    border-color: #28a745;',
                '    outline: none;',
                '    box-shadow: 0 0 0 3px rgba(40,167,69,0.1);',
                '}',
                '.inspection-item select option[value="No"] { color: #28a745; }',
                '.inspection-item select option[value="Slight"] { color: #ffc107; }',
                '.inspection-item select option[value="Moderate"] { color: #fd7e14; }',
                '.inspection-item select option[value="Severe"] { color: #dc3545; }',
                '.inspection-item.inspection-no { border-color: #28a745; background: #d4edda; }',
                '.inspection-item.inspection-slight { border-color: #ffc107; background: #fff3cd; }',
                '.inspection-item.inspection-moderate { border-color: #fd7e14; background: #ffeaa7; }',
                '.inspection-item.inspection-severe { border-color: #dc3545; background: #f8d7da; }',
                '.field-callout {',
                '    grid-column: 2;',
                '    font-size: 12px;',
                '    color: #6c757d;',
                '    margin-top: 5px;',
                '    font-style: italic;',
                '}',
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
                '        <div class="field-row">',
                '            <div class="field-label">' + _("Name") + '</div>',
                '            <div class="field-input">',
                                tableform.render_text({ post_field: "animalname", justwidget: true }),
                '                <button id="button-animalname" type="button" title="' + _("Generate a random name for this animal") + '">🎲</button>',
                '            </div>',
                '        </div>',
                '        <div class="field-row">',
                '            <div class="field-label">' + _("Entry Age Range") + '</div>',
                '            <div class="field-input">',
                                tableform.render_select({ 
                                    post_field: "entryagerange", 
                                    justwidget: true, 
                                    options: '<option value="">' + _("Select age range") + '</option>' +
                                           '<option value="Baby">Baby (&lt;1)</option>' +
                                           '<option value="Juvenile">Juvenile (1-2)</option>' +
                                           '<option value="Adult">Adult (2-5)</option>' +
                                           '<option value="Senior">Senior (5+)</option>'
                                }),
                '            </div>',
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
                '        <div class="field-row">',
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
                '        <div class="field-row">',
                '            <div class="field-label">' + _("Size") + '</div>',
                '            <div class="field-input">',
                                tableform.render_select({ post_field: "size", justwidget: true, options: { displayfield: "SIZE", rows: controller.sizes }}),
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

                '    <div class="form-group">',
                '        <h3>' + _("Health & Physical") + '</h3>',
                '        <div class="field-row" id="neuteredrow">',
                '            <div class="field-label">' + _("Altered") + '</div>',
                '            <div class="field-input">',
                                tableform.render_check({ post_field: "neutered", justwidget: true }),
                                tableform.render_date({ post_field: "neutereddate", justwidget: true }),
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="microchiprow">',
                '            <div class="field-label">' + _("Microchipped") + '</div>',
                '            <div class="field-input">',
                                tableform.render_check({ post_field: "microchipped", justwidget: true }),
                                tableform.render_date({ post_field: "microchipdate", justwidget: true, placeholder: _("Date") }),
                                tableform.render_text({ post_field: "microchipnumber", maxlength: 15, justwidget: true, placeholder: _("Number") }),
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="tattoorow">',
                '            <div class="field-label">' + _("Tattoo") + '</div>',
                '            <div class="field-input">',
                                tableform.render_check({ post_field: "tattoo", label: "", justwidget: true }),
                                tableform.render_date({ post_field: "tattoodate", justwidget: true, placeholder: _("Date") }),
                                tableform.render_text({ post_field: "tattoonumber", justwidget: true, placeholder: _("Number") }),
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

                '    <div class="form-group">',
                '        <h3>' + _("Special Conditions") + '</h3>',
                '        <div class="field-row">',
                '            <div class="field-label">' + _("Non-Shelter") + '</div>',
                '            <div class="field-input">',
                                tableform.render_check({ post_field: "nonshelter", justwidget: true }),
                '            </div>',
                '            <div class="field-callout">' + _("This animal should not be shown in figures and is not in the custody of the shelter") + '</div>',
                '        </div>',
                '        <div class="field-row" id="transferinrow">',
                '            <div class="field-label">' + _("Transfer In") + '</div>',
                '            <div class="field-input">',
                                tableform.render_check({ post_field: "transferin", justwidget: true }),
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="holdrow">',
                '            <div class="field-label">' + _("Hold until") + '</div>',
                '            <div class="field-input">',
                                tableform.render_check({ post_field: "hold", justwidget: true }),
                                tableform.render_date({ post_field: "holduntil", justwidget: true }),
                '            </div>',
                '            <div class="field-callout">' + _("Hold the animal until this date or blank to hold indefinitely") + '</div>',
                '        </div>',
                '        <div class="field-row" id="nsownerrow">',
                '            <div class="field-label">' + _("Owner") + '</div>',
                '            <div class="field-input">',
                                tableform.render_person({ post_field: "nsowner", justwidget: true }),
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="litterrow">',
                '            <div class="field-label">' + _("Litter") + '</div>',
                '            <div class="field-input">',
                                tableform.render_autotext({ post_field: "litterid", justwidget: true, options: { rows: controller.activelitters, displayfield: "label", valuefield: "value" }}),
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

                '    <div class="form-group">',
                '        <h3>' + _("People & Location") + '</h3>',
                '        <div class="field-row" id="originalownerrow">',
                '            <div class="field-label">' + _("Original Owner") + '</div>',
                '            <div class="field-input">',
                                tableform.render_person({ post_field: "originalowner", justwidget: true }),
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="broughtinbyrow">',
                '            <div class="field-label">' + _("Brought In By") + '</div>',
                '            <div class="field-input">',
                                tableform.render_person({ post_field: "broughtinby", justwidget: true }),
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="jurisdictionrow">',
                '            <div class="field-label">' + _("Jurisdiction") + '</div>',
                '            <div class="field-input">',
                                tableform.render_select({ post_field: "jurisdiction", justwidget: true, options: { displayfield: "JURISDICTIONNAME", rows: controller.jurisdictions }}),
                '            </div>',
                '        </div>',
                '        <div class="field-row" id="pickuprow">',
                '            <div class="field-label">' + _("Picked Up") + '</div>',
                '            <div class="field-input">',
                                tableform.render_check({ post_field: "pickedup", justwidget: true }),
                                tableform.render_select({ post_field: "pickuplocation", justwidget: true, options: '<option value="0"></option>' + html.list_to_options(controller.pickuplocations, "ID", "LOCATIONNAME") }),
                '            </div>',
                '        </div>',
                '        <div class="field-row">',
                '            <div class="field-label">' + _("Pickup Address") + '</div>',
                '            <div class="field-input">',
                                tableform.render_text({ post_field: "pickupaddress", justwidget: true, placeholder: _("Pickup Address") }),
                '            </div>',
                '        </div>',
                '    </div>',

                '    <div class="form-group">',
                '        <h3>' + _("Additional Fields") + '</h3>',
                '        <div class="field-row">',
                '            <div style="grid-column: 1 / -1;">',
                                additional.additional_fields_linktype(controller.additional, 4),
                '            </div>',
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

                '</div>',
                tableform.buttons_render([
                   { id: "save", icon: "save", text: _("Save") },
                   { id: "reset", icon: "delete", text: _("Reset") }
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
                    
                    inspectionHtml += '<div class="inspection-item">';
                    inspectionHtml += '<label class="inspection-field-label" for="' + fieldId + '">' + label;
                    if (field.MANDATORY == 1) {
                        inspectionHtml += '<span class="asm-has-validation">*</span>';
                    }
                    inspectionHtml += '</label>';
                    
                    // Render the appropriate field widget based on field type
                    if (field.FIELDTYPE == 0) { // YESNO - Checkbox
                        inspectionHtml += '<input id="' + fieldId + '" type="checkbox" class="asm-checkbox additional" ';
                        inspectionHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" ';
                        inspectionHtml += 'title="' + html.title(field.TOOLTIP) + '" />';
                        
                    } else if (field.FIELDTYPE == 1) { // TEXT - Text input
                        inspectionHtml += '<input id="' + fieldId + '" type="text" class="asm-textbox additional" ';
                        inspectionHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" ';
                        inspectionHtml += 'title="' + html.title(field.TOOLTIP) + '" />';
                        
                    } else if (field.FIELDTYPE == 2) { // NOTES - Textarea
                        inspectionHtml += '<textarea id="' + fieldId + '" class="asm-textareafixed additional" ';
                        inspectionHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" ';
                        inspectionHtml += 'title="' + html.title(field.TOOLTIP) + '"></textarea>';
                        
                    } else if (field.FIELDTYPE == 3) { // NUMBER - Number input
                        inspectionHtml += '<input id="' + fieldId + '" type="text" class="asm-textbox asm-numberbox additional" ';
                        inspectionHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" ';
                        inspectionHtml += 'title="' + html.title(field.TOOLTIP) + '" />';
                        
                    } else if (field.FIELDTYPE == 4) { // DATE - Date input
                        inspectionHtml += '<input id="' + fieldId + '" type="text" class="asm-textbox asm-datebox additional" ';
                        inspectionHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" ';
                        inspectionHtml += 'title="' + html.title(field.TOOLTIP) + '" />';
                        
                    } else if (field.FIELDTYPE == 5) { // MONEY - Currency input
                        inspectionHtml += '<input id="' + fieldId + '" type="text" class="asm-textbox asm-currencybox additional" ';
                        inspectionHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" ';
                        inspectionHtml += 'title="' + html.title(field.TOOLTIP) + '" />';
                        
                    } else if (field.FIELDTYPE == 6) { // LOOKUP - Select dropdown
                        inspectionHtml += '<select id="' + fieldId + '" class="asm-selectbox additional" ';
                        inspectionHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" ';
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
                        inspectionHtml += '<select id="' + fieldId + '" class="asm-bsmselect additional" multiple="multiple" ';
                        inspectionHtml += 'data-id="' + field.ID + '" data-post="' + postAttr + '" ';
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
                    
                    inspectionHtml += '</div>';
                }
            });
            
            // Insert the generated HTML into the inspection grid
            $("#inspection-fields").html(inspectionHtml);
            
            // Re-initialize styling and widgets for the new fields
            setTimeout(function() {
                animal_induction.init_inspection_styling();
                animal_induction.init_inspection_widgets();
            }, 100);
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
         * Initialize inspection dropdown styling and color coding
         */
        init_inspection_styling: function() {
            $("#inspection-fields select").each(function() {
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
         * Posts the animal details to the backend.
         * mode: "add" to stay on this screen after post, anything else to edit the created animal
         */
        add_animal: async function(mode) {

            if (!animal_induction.validation()) { return; }

            $(".asm-content button").button("disable");
            header.show_loading(controller.animal ? _("Updating...") : _("Creating..."));
            let formdata = "mode=save&" + $("input, textarea, select").not(".chooser").toPOST();
            
            // Add animal ID if we're editing an existing animal
            if (controller.animal) {
                formdata += "&id=" + controller.animal.ID;
                formdata += "&recordversion=" + controller.animal.RECORDVERSION;
                console.log("Editing existing animal ID:", controller.animal.ID, "RecordVersion:", controller.animal.RECORDVERSION);
            } else {
                console.log("Creating new animal");
            }
            console.log("FULL ADD ANIMAL FORM DATA:", formdata);
            
            // Parse and log specific key fields  
            const formParams = new URLSearchParams(formdata);
            console.log("ADD ANIMAL - Key Fields:");
            console.log("  mode:", formParams.get('mode'));
            console.log("  id:", formParams.get('id'));
            console.log("  animalname:", formParams.get('animalname'));
            console.log("  breed1:", formParams.get('breed1'));
            console.log("  location:", formParams.get('location'));
            console.log("  shelterlocationunit:", formParams.get('shelterlocationunit'));
            console.log("  recordversion:", formParams.get('recordversion'));
            
            try {
                const response = await common.ajax_post("animal_induction", formdata);
                console.log("ADD ANIMAL: Raw response from server:", response);
                const [createdID, newCode] = response.split(" ");
                console.log("ADD ANIMAL: Parsed createdID:", createdID, "newCode:", newCode);
                console.log("ADD ANIMAL: controller.animal exists?", !!controller.animal);
                console.log("ADD ANIMAL: Old RECORDVERSION:", controller.animal ? controller.animal.RECORDVERSION : "N/A");
                
                // Update record version after successful save to prevent "changed by another user" errors
                if (controller.animal && createdID) {
                    const oldVersion = controller.animal.RECORDVERSION;
                    controller.animal.RECORDVERSION = parseInt(controller.animal.RECORDVERSION) + 1;
                    console.log("ADD ANIMAL: Updated RECORDVERSION from", oldVersion, "to", controller.animal.RECORDVERSION);
                } else {
                    console.log("ADD ANIMAL: NOT updating RECORDVERSION - controller.animal:", !!controller.animal, "createdID:", createdID);
                }
                
                if (mode == "add") {
                    header.show_info(_("Animal '{0}' created with code {1}").replace("{0}", $("#animalname").val()).replace("{1}", newCode));
                }
                else {
                    if (createdID != "0") { 
                        if (controller.animal) {
                            // Check if location was changed away from Induction
                            const currentLocation = $("#internallocation option:selected").text();
                            console.log("ADD ANIMAL: Current selected location:", currentLocation);
                            
                            if (currentLocation && !currentLocation.toLowerCase().includes("induction")) {
                                // Location changed away from Induction, go to normal animal view
                                console.log("ADD ANIMAL: Location changed away from Induction, redirecting to animal view");
                                setTimeout(function() {
                                    common.route("animal?id=" + createdID);
                                }, 1000);
                            } else {
                                // Still in Induction, reload current page
                                console.log("ADD ANIMAL: Still in Induction location, reloading page");
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
            // Check that name is populated (required field)
            if (!$("#animalname").val() || $("#animalname").val().trim() === "") {
                header.show_error(_("Animal name is required to save progress"));
                $("#animalname").focus();
                return;
            }

            $(".asm-content button").button("disable");
            header.show_loading(_("Saving progress..."));
            let formdata = "mode=save&" + $("input, textarea, select").not(".chooser").toPOST();
            
            // Add animal ID if we're editing an existing animal
            if (controller.animal) {
                formdata += "&id=" + controller.animal.ID;
                formdata += "&recordversion=" + controller.animal.RECORDVERSION;
                console.log("Save progress: Editing existing animal ID:", controller.animal.ID, "RecordVersion:", controller.animal.RECORDVERSION);
            } else {
                console.log("Save progress: Creating new animal");
            }
            console.log("FULL SAVE PROGRESS FORM DATA:", formdata);
            
            // Parse and log specific key fields
            const formParams = new URLSearchParams(formdata);
            console.log("SAVE PROGRESS - Key Fields:");
            console.log("  mode:", formParams.get('mode'));
            console.log("  id:", formParams.get('id'));
            console.log("  animalname:", formParams.get('animalname'));
            console.log("  breed1:", formParams.get('breed1'));
            console.log("  location:", formParams.get('location'));
            console.log("  shelterlocationunit:", formParams.get('shelterlocationunit'));
            console.log("  recordversion:", formParams.get('recordversion'));
            
            try {
                const response = await common.ajax_post("animal_induction", formdata);
                console.log("SAVE PROGRESS: Raw response from server:", response);
                const [animalID, code] = response.split(" ");
                console.log("SAVE PROGRESS: Parsed animalID:", animalID, "code:", code);
                console.log("SAVE PROGRESS: controller.animal exists?", !!controller.animal);
                console.log("SAVE PROGRESS: Old RECORDVERSION:", controller.animal ? controller.animal.RECORDVERSION : "N/A");
                
                // Update record version after successful save to prevent "changed by another user" errors
                if (controller.animal && animalID) {
                    const oldVersion = controller.animal.RECORDVERSION;
                    controller.animal.RECORDVERSION = parseInt(controller.animal.RECORDVERSION) + 1;
                    console.log("SAVE PROGRESS: Updated RECORDVERSION from", oldVersion, "to", controller.animal.RECORDVERSION);
                } else {
                    console.log("SAVE PROGRESS: NOT updating RECORDVERSION - controller.animal:", !!controller.animal, "animalID:", animalID);
                }
                
                if (animalID && animalID !== "0") {
                    if (controller.animal) {
                        // Check if location was changed away from Induction
                        const currentLocation = $("#internallocation option:selected").text();
                        console.log("SAVE PROGRESS: Current selected location:", currentLocation);
                        
                        header.show_info(_("Animal '{0}' updated successfully.").replace("{0}", $("#animalname").val()));
                        
                        if (currentLocation && !currentLocation.toLowerCase().includes("induction")) {
                            // Location changed away from Induction, go to normal animal view
                            console.log("SAVE PROGRESS: Location changed away from Induction, redirecting to animal view");
                            setTimeout(function() {
                                common.route("animal?id=" + animalID);
                            }, 1000);
                        } else {
                            // Still in Induction, reload current page
                            console.log("SAVE PROGRESS: Still in Induction location, reloading page");
                            setTimeout(function() {
                                common.route_reload();
                            }, 1000);
                        }
                    } else {
                        header.show_info(_("Animal '{0}' saved with code {1}. You can return to complete details later.").replace("{0}", $("#animalname").val()).replace("{1}", code));
                    }
                } else {
                    header.show_info(_("Progress saved successfully"));
                }
            }
            catch(err) {
                header.show_error(_("Failed to save progress: ") + err);
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
            const response = await common.ajax_post("animal_induction", "mode=units&locationid=" + $("#internallocation").val());
            $.each(html.decode(response).split("&&"), function(i, v) {
                let [unit, desc] = v.split("|");
                if (!unit) { return false; }
                if (!desc) { desc = _("(available)"); }
                opts.push('<option value="' + html.title(unit) + '">' + unit +
                    ' : ' + desc + '</option>');
            });
            $("#unit").html(opts.join("\n")).change();
        },

        reset: function() {

            $("#animalname, #dateofbirth, #weight, #weightlb").val("").change();
            $(".asm-checkbox").prop("checked", false).change();
            $(".asm-personchooser").personchooser("clear");

            // Set brought in by label back to non-transfer
            $("label[for='broughtinby']").html(_("Brought In By")); 
            $("#broughtinby").personchooser("set_filter", "all");

            // Set estimated age
            $("#estimateddob").val("");
            if (config.str("DefaultAnimalAge") != "0") {
                $("#estimateddob").val(config.str("DefaultAnimalAge"));
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
            if (config.bool("AddAnimalsShowTimeBroughtIn")) {
                $("#timebroughtin").val(format.time(new Date()));
            }

            // Update units according to any location selected
            animal_induction.update_units();

            // Currency defaults
            $("#fee").currency("value", 0);

            // Change additional fields to default
            additional.reset_default(controller.additional);
        },

        validation: function() {
            // Remove any previous errors
            header.hide_error();
            validate.reset();

            // code
            if (config.bool("ManualCodes")) {
                if (common.trim($("#sheltercode").val()) == "") {
                    header.show_error(_("Shelter code cannot be blank"));
                    validate.highlight("sheltercode");
                    return false;
                }
            }

            // name
            if (common.trim($("#animalname").val()) == "") {
                header.show_error(_("Name cannot be blank"));
                validate.highlight("animalname");
                return false;
            }

            // date of birth
            if (common.trim($("#dateofbirth").val()) == "" && common.trim($("#estimateddob").val()) == "") {
                header.show_error(_("Date of birth cannot be blank"));
                validate.highlight("dateofbirth");
                return false;
            }

            // mandatory additional fields
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

            if (config.bool("ShowWeightInLbs")) {
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

            // Entry Age Range calculation
            $("#entryagerange").change(function() {
                const ageRange = $(this).val();
                if (!ageRange) { return; }
                
                const today = new Date();
                let estimatedBirthDate;
                
                // Calculate estimated birth date based on midpoint of age ranges
                switch(ageRange) {
                    case "Baby": // <1 year, midpoint = 6 months
                        estimatedBirthDate = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
                        break;
                    case "Juvenile": // 1-2 years, midpoint = 1.5 years = 18 months
                        estimatedBirthDate = new Date(today.getFullYear() - 1, today.getMonth() - 6, today.getDate());
                        break;
                    case "Adult": // 2-5 years, midpoint = 3.5 years
                        estimatedBirthDate = new Date(today.getFullYear() - 3, today.getMonth() - 6, today.getDate());
                        break;
                    case "Senior": // 5+ years, estimate = 7 years (reasonable midpoint for senior range)
                        estimatedBirthDate = new Date(today.getFullYear() - 7, today.getMonth(), today.getDate());
                        break;
                    default:
                        return;
                }
                
                // Format date and set in the DOB field
                const formattedDate = format.date(estimatedBirthDate);
                $("#dateofbirth").val(formattedDate);
                
                // Set Estimated DOB checkbox to true
                $("#estimateddob").prop("checked", true);
                
                // Trigger change events to update any dependent logic
                $("#dateofbirth").change();
                $("#estimateddob").change();
            });


        },

        sync: function() {
            // If we have an animal to load (editing mode), populate the form
            if (controller.animal) {
                animal_induction.load_animal(controller.animal);
            } else {
                // New animal mode - reset form
                animal_induction.reset();
            }
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
            $("#coattype").val(animal.COATTYPEID);
            $("#size").val(animal.SIZE);
            $("#internallocation").val(animal.SHELTERLOCATION);
            $("#unit").val(animal.SHELTERLOCATIONUNIT);
            $("#entrytype").val(animal.ENTRYTYPEID);
            $("#datebroughtin").val(format.date(animal.DATEBROUGHTIN));
            if (animal.TIMEBROUGHTIN) {
                $("#timebroughtin").val(format.time(animal.TIMEBROUGHTIN));
            }
            if (animal.DATEOFBIRTH) {
                $("#dateofbirth").val(format.date(animal.DATEOFBIRTH));
                $("#estimateddob").val(""); // Clear estimated age if we have DOB
            } else if (animal.ESTIMATEDAGE) {
                $("#estimateddob").val(animal.ESTIMATEDAGE);
                $("#dateofbirth").val(""); // Clear DOB if we have estimated age
            }
            $("#nonshelter").prop("checked", animal.NONSHELTERANIMAL == 1);
            $("#hold").prop("checked", animal.HASACTIVEHOLD == 1);
            if (animal.HOLDUNTILDATE) {
                $("#holduntil").val(format.date(animal.HOLDUNTILDATE));
            }
            
            // Load additional fields data
            $("#asm-content input[data-id], #asm-content select[data-id], #asm-content textarea[data-id]").fromJSON(animal);
            
            // Enable/disable widgets based on loaded data
            animal_induction.enable_widgets();
            animal_induction.update_breed_select();
            animal_induction.update_units();
        },

        destroy: function() {
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
        title: function() { return _("Patient Induction"); },
        
        routes: {
            "animal_induction": function() {
                common.module_loadandstart("animal_induction", "animal_induction?" + this.rawqs);
            }
        }

    };

    common.module_register(animal_induction);

});
