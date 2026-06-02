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
            // Clear any leftover error from a previous attempt - if we don't,
            // a stale "name in use" stays on screen alongside the new success
            // banner and confuses the user.
            try { header.hide_error(); } catch (e) {}
            $(".asm-content button").button("disable");
            header.show_loading(_("Saving..."));
            try {
                quick_induction.apply_hidden_defaults();
                const savedName = $("#animalname").val();
                const savedLocText = $("#internallocation option:selected").text();
                const formdata = "mode=save&" + $("#qi-form input, #qi-form select, #qi-form textarea").toPOST();
                const response = await common.ajax_post("quick_induction", formdata);
                const parts = String(response || "").trim().split(/\s+/);
                const animalID = parts[0] || "0";
                const code = parts[1] || "";
                if (animalID && animalID !== "0") {
                    quick_induction.show_success(animalID, code, savedName, savedLocText);
                    quick_induction.reset_form_for_next();
                }
            }
            catch (err) {
                // common.ajax_post has already called header.show_error with the
                // friendly message extracted from the ASMValidationError HTML
                // response, so there's nothing to do here - duplicating the
                // call would just overwrite with the same text.
            }
            finally {
                $(".asm-content button").button("enable");
                header.hide_loading();
            }
        },

        /** Inline success banner — replaces the "redirect on save" flow so the
         *  user can keep entering animals from a phone without losing context. */
        show_success: function(animalID, code, name, locationText) {
            const url = "animal?id=" + animalID;
            const safeName = html.title(name || "");
            const safeLoc = html.title(locationText || "");
            const safeCode = html.title(code || "");
            const banner =
                '<div class="qi-success" role="status">' +
                '  <div class="qi-success-icon">&#10003;</div>' +
                '  <div class="qi-success-body">' +
                '    <strong>' + safeName + '</strong> ' + _("saved") +
                (safeLoc ? ' &middot; ' + safeLoc : '') +
                (safeCode ? ' &middot; <span class="qi-code">' + safeCode + '</span>' : '') +
                '    <div class="qi-success-actions">' +
                '      <a href="#' + url + '" class="qi-link" data-link="' + html.title(url) + '">' + _("Open record") + ' &rarr;</a>' +
                '    </div>' +
                '  </div>' +
                '  <button type="button" class="qi-success-close" aria-label="' + _("Dismiss") + '">&times;</button>' +
                '</div>';
            $("#qi-success-host").prepend(banner);
            const $b = $("#qi-success-host .qi-success").first();
            $b.find(".qi-link").click(function(e) {
                e.preventDefault();
                common.route($(this).attr("data-link"));
            });
            $b.find(".qi-success-close").click(function() { $b.fadeOut(150, function() { $(this).remove(); }); });
            // No auto-dismiss - the link to the saved record is the only way
            // off this screen, so it must stay visible until the user dismisses.
        },

        /** Clear every user-entered field so the next admission starts fresh. */
        reset_form_for_next: function() {
            $("#animalname").val("");
            $("#weight").val("");
            $("#dateofbirth").val("");
            $("#estimatedage").val("");
            $("#sex").val("");
            $("#internallocation").val("");
            $("#unit").empty().append('<option value=""></option>');
            $("#animalname").focus();
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
            // Inputs sized for touch on mobile: min 44px hit target, 16px font
            // so iOS doesn't zoom on focus.
            h.push('  .qi-form input.qi-text, .qi-form select.qi-select { padding: 12px 14px; font-size: 16px; ' +
                   'font-family: inherit; color: #222; background: #fff; border: 1.5px solid #cbcbc2; border-radius: 8px; ' +
                   'box-sizing: border-box; width: 100%; min-height: 48px; }');
            h.push('  .qi-form input.qi-text:focus, .qi-form select.qi-select:focus { outline: none; ' +
                   'border-color: #2e7d32; box-shadow: 0 0 0 3px rgba(46,125,50,0.18); }');
            h.push('  .qi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }');
            h.push('  .qi-req { color: #c62828; margin-left: 2px; }');
            h.push('  #qi-save { background: #2e7d32 !important; color: #fff !important; border: none !important; ' +
                   'padding: 14px 36px !important; font-size: 16px; font-weight: 600; border-radius: 10px; ' +
                   'cursor: pointer; box-shadow: 0 2px 8px rgba(46,125,50,0.25); min-height: 52px; min-width: 200px; }');
            h.push('  #qi-save:hover { background: #226625 !important; }');
            h.push('  #qi-save:disabled { background: #6f8b71 !important; cursor: wait; }');
            h.push('  /* Success banner */');
            h.push('  #qi-success-host { max-width: 720px; margin: 0 auto; padding: 0 18px; }');
            h.push('  .qi-success { display: flex; align-items: flex-start; gap: 12px; ' +
                   'background: #e8f5e9; border: 1.5px solid #2e7d32; border-radius: 10px; ' +
                   'padding: 12px 14px; margin: 14px 0; color: #1b5e20; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }');
            h.push('  .qi-success-icon { font-size: 20px; line-height: 1; color: #2e7d32; ' +
                   'background: #fff; border-radius: 50%; width: 32px; height: 32px; flex: 0 0 32px; ' +
                   'display: flex; align-items: center; justify-content: center; font-weight: 700; }');
            h.push('  .qi-success-body { flex: 1; font-size: 15px; line-height: 1.4; }');
            h.push('  .qi-success-body .qi-code { font-family: ui-monospace,Menlo,monospace; ' +
                   'background: #fff; padding: 1px 6px; border-radius: 4px; font-size: 13px; }');
            h.push('  .qi-success-actions { margin-top: 6px; }');
            h.push('  .qi-success-actions .qi-link { color: #1b5e20; font-weight: 600; ' +
                   'text-decoration: none; padding: 4px 0; display: inline-block; }');
            h.push('  .qi-success-actions .qi-link:hover { text-decoration: underline; }');
            h.push('  .qi-success-close { background: transparent; border: none; cursor: pointer; ' +
                   'color: #1b5e20; font-size: 22px; line-height: 1; padding: 0 4px; align-self: flex-start; }');
            h.push('  /* Mobile */');
            h.push('  @media (max-width: 700px) {');
            h.push('    body { background: #fff; }');
            h.push('    .qi-form { max-width: 100%; margin: 0; padding: 16px 14px 24px; ' +
                   'border-radius: 0; border: none; box-shadow: none; }');
            h.push('    #qi-success-host { padding: 0 14px; }');
            h.push('    .qi-form h2 { font-size: 22px; }');
            h.push('    .qi-grid { grid-template-columns: 1fr; gap: 0; }');
            h.push('    .qi-row { margin-bottom: 16px; }');
            h.push('    .qi-row label { font-size: 15px; }');
            h.push('    #qi-save { width: 100%; max-width: none; }');
            h.push('  }');
            h.push('</style>');

            // Where success banners are appended after a save. Placed above the
            // form so the user immediately sees the confirmation without scrolling.
            h.push('<div id="qi-success-host"></div>');

            h.push('<div id="qi-form" class="qi-form">');
            h.push('  <h2>' + _("Quick Admission") + '</h2>');
            h.push('  <p class="qi-intro">' +
                   _("Enter the essentials to add a new hedgehog. You can fill in the rest from the animal record afterwards.") +
                   '</p>');

            // Name
            h.push('  <div class="qi-row">');
            h.push('    <label for="animalname">' + _("Name") + '<span class="qi-req">*</span></label>');
            h.push('    <input id="animalname" name="animalname" data="animalname" type="text" class="qi-text" />');
            h.push('  </div>');

            // Sex + Weight side-by-side
            h.push('  <div class="qi-grid">');
            h.push('    <div class="qi-row">');
            h.push('      <label for="sex">' + _("Sex") + '<span class="qi-req">*</span></label>');
            h.push('      <select id="sex" name="sex" data="sex" class="qi-select"><option value=""></option>');
            $.each(controller.sexes || [], function(i, v) {
                h.push('        <option value="' + v.ID + '">' + html.title(v.SEX) + '</option>');
            });
            h.push('      </select>');
            h.push('    </div>');
            h.push('    <div class="qi-row">');
            h.push('      <label for="weight">' + _("Weight (grams)") + '<span class="qi-req">*</span></label>');
            h.push('      <input id="weight" name="weight" data="weight" type="text" inputmode="decimal" class="qi-text" placeholder="1 - 2500" />');
            h.push('    </div>');
            h.push('  </div>');

            // DOB + Estimated age side-by-side
            h.push('  <div class="qi-grid">');
            h.push('    <div class="qi-row">');
            h.push('      <label for="dateofbirth">' + _("Date of birth") + '</label>');
            h.push('      <input id="dateofbirth" name="dateofbirth" data="dateofbirth" type="text" inputmode="numeric" class="qi-text asm-datebox" />');
            h.push('      <span class="qi-hint">' + _("Or enter an estimated age in years (e.g. 0.25)") + '</span>');
            h.push('    </div>');
            h.push('    <div class="qi-row">');
            h.push('      <label for="estimatedage">' + _("Estimated age (years)") + '</label>');
            h.push('      <input id="estimatedage" name="estimatedage" data="estimatedage" type="text" inputmode="decimal" class="qi-text" placeholder="0.25" />');
            h.push('    </div>');
            h.push('  </div>');

            // Location + Unit side-by-side
            h.push('  <div class="qi-grid">');
            h.push('    <div class="qi-row">');
            h.push('      <label for="internallocation">' + _("Location") + '<span class="qi-req">*</span></label>');
            h.push('      <select id="internallocation" name="internallocation" data="internallocation" class="qi-select"><option value=""></option>');
            $.each(controller.internallocations || [], function(i, v) {
                h.push('        <option value="' + v.ID + '">' + html.title(v.LOCATIONNAME) + '</option>');
            });
            h.push('      </select>');
            h.push('    </div>');
            h.push('    <div class="qi-row">');
            h.push('      <label for="unit">' + _("Unit") + ' <span class="qi-hint">(' + _("optional") + ')</span></label>');
            h.push('      <select id="unit" name="unit" data="unit" class="qi-select"><option value=""></option></select>');
            h.push('    </div>');
            h.push('  </div>');

            // Hidden inputs populated from configuration at save time
            h.push('  <input type="hidden" id="datebroughtin" name="datebroughtin" data="datebroughtin" />');
            h.push('  <input type="hidden" id="animaltype" name="animaltype" data="animaltype" />');
            h.push('  <input type="hidden" id="species" name="species" data="species" />');
            h.push('  <input type="hidden" id="breed1" name="breed1" data="breed1" />');
            h.push('  <input type="hidden" id="breed2" name="breed2" data="breed2" />');
            h.push('  <input type="hidden" id="basecolour" name="basecolour" data="basecolour" />');
            h.push('  <input type="hidden" id="coattype" name="coattype" data="coattype" />');
            h.push('  <input type="hidden" id="entryreason" name="entryreason" data="entryreason" />');
            h.push('  <input type="hidden" id="entrytype" name="entrytype" data="entrytype" />');
            h.push('  <input type="hidden" id="size" name="size" data="size" />');

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

            // Initialise the datepicker using ASM's custom jQuery .date()
            // plugin (it picks up the locale date format from asm.dateformat).
            $("#dateofbirth").date();

            // Auto-insert slashes as the user types digits, so the mobile
            // numeric keypad (which has no '/' key) can still produce e.g.
            // "02/06/2026". Assumes a 2-2-4 day/month/year layout, which is
            // the case for every locale ASM ships with that uses '/'. The
            // datepicker calendar still works in parallel - selecting a date
            // sets the value programmatically and bypasses this handler.
            $("#dateofbirth").on("input", function() {
                var digits = String(this.value || "").replace(/\D/g, "").substr(0, 8);
                var v = digits;
                if (digits.length > 4) {
                    v = digits.substr(0,2) + "/" + digits.substr(2,2) + "/" + digits.substr(4);
                } else if (digits.length > 2) {
                    v = digits.substr(0,2) + "/" + digits.substr(2);
                }
                if (v !== this.value) { this.value = v; }
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
