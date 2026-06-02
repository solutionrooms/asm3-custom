/*global $, jQuery, _, asm, common, config, controller, format, header, html, validate */

$(function() {

    "use strict";

    const quick_induction = {

        /**
         * Populate hidden inputs the backend insert needs (species, breed, etc.)
         * from the configured defaults, plus today's date as Date Brought In.
         */
        apply_hidden_defaults: function() {
            $("#datebroughtin").val(format.date(new Date()));
            $("#animaltype").val(config.str("AFDefaultType") || "");
            $("#species").val(config.str("AFDefaultSpecies") || "");
            $("#breed1").val(config.str("AFDefaultBreed") || "");
            $("#breed2").val(config.str("AFDefaultBreed") || "");
            $("#basecolour").val(config.str("AFDefaultColour") || "");
            $("#coattype").val(config.str("AFDefaultCoatType") || "");
            $("#entryreason").val(config.str("AFDefaultEntryReason") || "");
            $("#entrytype").val(config.str("AFDefaultEntryType") || "");
            $("#size").val(config.str("AFDefaultSize") || "");
        },

        /**
         * Fetch the units available for the currently selected location and
         * populate the unit dropdown.
         */
        update_units: async function() {
            const opts = ['<option value=""></option>'];
            $("#unit").empty();
            let response = null;
            try {
                response = await common.ajax_post(
                    "quick_induction",
                    "mode=units&locationid=" + ($("#internallocation").val() || ""));
            }
            catch (err) { response = ""; }
            const decoded = (response === undefined || response === null) ? "" : html.decode(response);
            $.each(String(decoded).split("&&"), function(i, v) {
                let [unit, desc] = v.split("|");
                if (!unit) { return false; }
                if (!desc) { desc = _("(available)"); }
                opts.push('<option value="' + html.title(unit) + '">' + unit + ' : ' + desc + '</option>');
            });
            $("#unit").html(opts.join("\n"));
        },

        /** Returns true if all fields are valid; otherwise shows an inline error and returns false. */
        validate_form: function() {
            const name = ($("#animalname").val() || "").trim();
            if (!name) {
                header.show_error(_("Name cannot be blank"));
                $("#animalname").focus();
                return false;
            }
            if (!$("#sex").val()) {
                header.show_error(_("Sex is required"));
                $("#sex").focus();
                return false;
            }
            const weightStr = ($("#weight").val() || "").trim();
            const w = format.to_float(weightStr);
            if (!weightStr || isNaN(w) || w < 1 || w > 2500) {
                header.show_error(_("Weight must be between 1 and 2500 grams"));
                $("#weight").focus();
                return false;
            }
            const dob = ($("#dateofbirth").val() || "").trim();
            const age = format.to_float(($("#estimatedage").val() || "").trim());
            if (!dob && (!age || age <= 0)) {
                header.show_error(_("Date of birth or estimated age is required"));
                $("#dateofbirth").focus();
                return false;
            }
            if (!$("#internallocation").val()) {
                header.show_error(_("Location is required"));
                $("#internallocation").focus();
                return false;
            }
            header.hide_error();
            return true;
        },

        save: async function() {
            if (!quick_induction.validate_form()) { return; }
            $(".asm-content button").button("disable");
            header.show_loading(_("Saving..."));
            try {
                quick_induction.apply_hidden_defaults();
                const formdata = "mode=save&" + $("#qi-form input, #qi-form select, #qi-form textarea").toPOST();
                const response = await common.ajax_post("quick_induction", formdata);
                const parts = String(response || "").trim().split(/\s+/);
                const animalID = parts[0] || "0";
                const code = parts[1] || "";
                if (animalID && animalID !== "0") {
                    header.show_info(_("Animal '{0}' saved with code {1}.")
                        .replace("{0}", $("#animalname").val()).replace("{1}", code));
                    setTimeout(function() { common.route("animal?id=" + animalID); }, 800);
                }
            }
            catch (err) {
                header.show_error(_("Failed to save: ") + err);
            }
            finally {
                $(".asm-content button").button("enable");
                header.hide_loading();
            }
        },

        render: function() {
            const h = [];
            h.push('<style>');
            h.push('  .qi-form { max-width: 720px; margin: 24px auto; padding: 24px 28px 28px; background: #fff; ' +
                   'border: 1px solid #e4e4dc; border-radius: 10px; box-shadow: 0 2px 14px rgba(0,0,0,0.05); }');
            h.push('  .qi-form h2 { margin: 0 0 6px; color: #1b5e20; font-size: 20px; }');
            h.push('  .qi-form .qi-intro { color: #555; font-size: 14px; margin: 0 0 18px; }');
            h.push('  .qi-row { display: flex; flex-direction: column; margin-bottom: 14px; }');
            h.push('  .qi-row label { font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #222; }');
            h.push('  .qi-hint { color: #666; font-size: 12px; margin-top: 3px; }');
            h.push('  .qi-form input.qi-text, .qi-form select.qi-select { padding: 9px 12px; font-size: 14px; ' +
                   'font-family: inherit; color: #222; background: #fff; border: 1.5px solid #cbcbc2; border-radius: 6px; ' +
                   'box-sizing: border-box; width: 100%; }');
            h.push('  .qi-form input.qi-text:focus, .qi-form select.qi-select:focus { outline: none; ' +
                   'border-color: #2e7d32; box-shadow: 0 0 0 3px rgba(46,125,50,0.18); }');
            h.push('  .qi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }');
            h.push('  .qi-req { color: #c62828; margin-left: 2px; }');
            h.push('  #qi-save { background: #2e7d32 !important; color: #fff !important; border: none !important; ' +
                   'padding: 12px 36px !important; font-size: 15px; font-weight: 600; border-radius: 8px; ' +
                   'cursor: pointer; box-shadow: 0 2px 8px rgba(46,125,50,0.25); }');
            h.push('  #qi-save:hover { background: #226625 !important; }');
            h.push('  @media (max-width: 600px) { .qi-grid { grid-template-columns: 1fr; } .qi-form { padding: 16px; } }');
            h.push('</style>');

            h.push('<div id="qi-form" class="qi-form">');
            h.push('  <h2>' + _("Quick Admission") + '</h2>');
            h.push('  <p class="qi-intro">' +
                   _("Enter the essentials to add a new hedgehog. You can fill in the rest from the animal record afterwards.") +
                   '</p>');

            // Name
            h.push('  <div class="qi-row">');
            h.push('    <label for="animalname">' + _("Name") + '<span class="qi-req">*</span></label>');
            h.push('    <input id="animalname" name="animalname" type="text" class="qi-text" />');
            h.push('  </div>');

            // Sex + Weight side-by-side
            h.push('  <div class="qi-grid">');
            h.push('    <div class="qi-row">');
            h.push('      <label for="sex">' + _("Sex") + '<span class="qi-req">*</span></label>');
            h.push('      <select id="sex" name="sex" class="qi-select"><option value=""></option>');
            $.each(controller.sexes || [], function(i, v) {
                h.push('        <option value="' + v.ID + '">' + html.title(v.SEX) + '</option>');
            });
            h.push('      </select>');
            h.push('    </div>');
            h.push('    <div class="qi-row">');
            h.push('      <label for="weight">' + _("Weight (grams)") + '<span class="qi-req">*</span></label>');
            h.push('      <input id="weight" name="weight" type="text" class="qi-text" placeholder="1 - 2500" />');
            h.push('    </div>');
            h.push('  </div>');

            // DOB + Estimated age side-by-side
            h.push('  <div class="qi-grid">');
            h.push('    <div class="qi-row">');
            h.push('      <label for="dateofbirth">' + _("Date of birth") + '</label>');
            h.push('      <input id="dateofbirth" name="dateofbirth" type="text" class="qi-text" />');
            h.push('      <span class="qi-hint">' + _("Or enter an estimated age in years (e.g. 0.25)") + '</span>');
            h.push('    </div>');
            h.push('    <div class="qi-row">');
            h.push('      <label for="estimatedage">' + _("Estimated age (years)") + '</label>');
            h.push('      <input id="estimatedage" name="estimatedage" type="text" class="qi-text" placeholder="0.25" />');
            h.push('    </div>');
            h.push('  </div>');

            // Location + Unit side-by-side
            h.push('  <div class="qi-grid">');
            h.push('    <div class="qi-row">');
            h.push('      <label for="internallocation">' + _("Location") + '<span class="qi-req">*</span></label>');
            h.push('      <select id="internallocation" name="internallocation" class="qi-select"><option value=""></option>');
            $.each(controller.internallocations || [], function(i, v) {
                h.push('        <option value="' + v.ID + '">' + html.title(v.LOCATIONNAME) + '</option>');
            });
            h.push('      </select>');
            h.push('    </div>');
            h.push('    <div class="qi-row">');
            h.push('      <label for="unit">' + _("Unit") + ' <span class="qi-hint">(' + _("optional") + ')</span></label>');
            h.push('      <select id="unit" name="unit" class="qi-select"><option value=""></option></select>');
            h.push('    </div>');
            h.push('  </div>');

            // Hidden inputs populated from configuration at save time
            h.push('  <input type="hidden" id="datebroughtin" name="datebroughtin" />');
            h.push('  <input type="hidden" id="animaltype" name="animaltype" />');
            h.push('  <input type="hidden" id="species" name="species" />');
            h.push('  <input type="hidden" id="breed1" name="breed1" />');
            h.push('  <input type="hidden" id="breed2" name="breed2" />');
            h.push('  <input type="hidden" id="basecolour" name="basecolour" />');
            h.push('  <input type="hidden" id="coattype" name="coattype" />');
            h.push('  <input type="hidden" id="entryreason" name="entryreason" />');
            h.push('  <input type="hidden" id="entrytype" name="entrytype" />');
            h.push('  <input type="hidden" id="size" name="size" />');

            h.push('  <div style="text-align:center;margin-top:18px;">');
            h.push('    <button id="qi-save" type="button">' + _("Save") + '</button>');
            h.push('  </div>');
            h.push('</div>');
            return h.join("\n");
        },

        bind: function() {
            // Default location to "Induction" if such an option exists (operator
            // convention - matches the full induction screen). The user can change it.
            const inductionOpt = $("#internallocation option").filter(function() {
                return $(this).text().trim().toLowerCase().indexOf("induction") !== -1;
            }).first();
            if (inductionOpt.length > 0) { $("#internallocation").val(inductionOpt.val()); }

            $("#dateofbirth").datepicker({
                dateFormat: format.date_js_format(),
                changeMonth: true,
                changeYear: true
            });

            $("#internallocation").change(quick_induction.update_units);
            quick_induction.update_units();

            $("#qi-save").button().click(function() { quick_induction.save(); });

            // Submit on Enter from any text input (excluding textareas)
            $("#qi-form input.qi-text").keypress(function(e) {
                if (e.which === 13) { e.preventDefault(); quick_induction.save(); }
            });
        },

        sync: function() {},

        destroy: function() { return false; },

        name: "quick_induction",
        animation: "newdata",
        autofocus: "#animalname",
        title: function() { return _("Quick Admission"); },

        routes: {
            "quick_induction": function() {
                common.module_loadandstart("quick_induction", "quick_induction");
            }
        }

    };

    common.module_register(quick_induction);

});
