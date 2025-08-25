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
                tableform.fields_render([
                    { post_field: "nonshelter", label: _("Non-Shelter"), type: "check",
                        callout: _("This animal should not be shown in figures and is not in the custody of the shelter") },
                    { post_field: "transferin", label: _("Transfer In"), type: "check" },
                    { post_field: "hold", label: _("Hold until"), type: "check", 
                        callout: _("Hold the animal until this date or blank to hold indefinitely"),
                        xmarkup: tableform.render_date({ post_field: "holduntil", halfsize: true, justwidget: true }) }, 
                    { post_field: "nsowner", label: _("Owner"), type: "person" },
                    { post_field: "sheltercode", label: _("Code"), type: "text", halfsize: true, rowid: "coderow", 
                        xmarkup: tableform.render_text({ post_field: "shortcode", halfsize: true, justwidget: true }) }, 
                    { post_field: "animalname", label: _("Name"), type: "text", xbutton: _("Generate a random name for this animal") },
                    { post_field: "dateofbirth", label: _("Date of Birth"), type: "date" },
                    { post_field: "estimateddob", label: _("Estimated DOB"), type: "check" },
                    { post_field: "sex", label: _("Sex"), type: "select", 
                        options: { displayfield: "SEX", rows: controller.sexes }},
                    { post_field: "animaltype", label: _("Type"), type: "select", 
                        options: { displayfield: "ANIMALTYPE", rows: controller.animaltypes }},
                    { post_field: "species", label: _("Species"), type: "select", 
                        options: { displayfield: "SPECIESNAME", rows: controller.species }},
                    { post_field: "breed1", label: _("Breed"), type: "select", rowid: "breedrow", 
                        options: html.list_to_options_breeds(controller.breeds),
                        xmarkup: [ '<span id="crossbreedcol">',
                            tableform.render_check({ post_field: "crossbreed", label: _("Crossbreed"), justwidget: true }),
                            '</span> ',
                            '<span id="secondbreedcol">',
                            tableform.render_select({ post_field: "breed2", justwidget: true, 
                                options: html.list_to_options_breeds(controller.breeds) }),
                            '</span>' ].join("\n") },
                    { post_field: "basecolour", label: _("Base Color"), type: "select", rowid: "colourrow", 
                        options: { displayfield: "BASECOLOUR", rows: controller.colours }},
                    { post_field: "coattype", label: _("Coat Type"), type: "select", 
                        options: { displayfield: "COATTYPE", rows: controller.coattypes }},
                    { post_field: "location", label: _("Internal Location"), type: "select", rowid: "locationrow", 
                        options: { displayfield: "LOCATIONNAME", rows: controller.internallocations }},
                    { post_field: "unit", label: _("Unit"), type: "select", rowid: "locationunitrow", 
                        options: "", callout: _("Unit within the location, eg: pen or cage number") },
                    { post_field: "fosterer", label: _("Fosterer"), type: "person", personfilter: "fosterer", 
                        colclasses: config.bool("AddAnimalsShowCoordinator") ? "bottomborder" : "" },
                    { post_field: "adoptioncoordinator", label: _("Adoption Coordinator"), type: "person", personfilter: "coordinator" },
                    { post_field: "size", label: _("Size"), type: "select", 
                        options: { displayfield: "SIZE", rows: controller.sizes }},
                    { post_field: "weight", label: _("Weight"), type: "number", rowid: "kilosrow", halfsize: true, 
                        xmarkup: ' <label id="kglabel">' + _("kg") + '</label>' },
                    { post_field: "weightlb", label: _("Weight"), type: "intnumber", rowid: "poundsrow", halfsize: true, 
                        xmarkup: [ ' <label id="lblabel">' + _("lb") + '</label>',
                            tableform.render_intnumber({ post_field: "weightoz", justwidget: true, halfsize: true }),
                            ' <label id="ozlabel">' + _("oz") + '</label>' ].join("\n") },
                    { type: "raw", rowid: "neuteredrow", label: _("Altered"), 
                        markup: tableform.render_check({ post_field: "neutered", justwidget: true }) +
                            tableform.render_date({ post_field: "neutereddate", justwidget: true }) },
                    { type: "raw", rowid: "microchiprow", label: _("Microchipped"), 
                        markup: tableform.render_check({ post_field: "microchipped", justwidget: true }) +
                            tableform.render_date({ post_field: "microchipdate", halfsize: true, justwidget: true, placeholder: _("Date") }) + 
                            tableform.render_text({ post_field: "microchipnumber", maxlength: 15, justwidget: true, placeholder: _("Number") }) },
                    { type: "raw", rowid: "tattoorow", label: _("Tattoo"), 
                        markup: tableform.render_check({ post_field: "tattoo", label: "", justwidget: true }) +
                            tableform.render_date({ post_field: "tattoodate", halfsize: true, justwidget: true, placeholder: _("Date") }) + 
                            tableform.render_text({ post_field: "tattoonumber", justwidget: true, placeholder: _("Number") }) },
                    { post_field: "litterid", label: _("Litter"), type: "autotext", rowid: "litterrow",
                        options: { rows: controller.activelitters, displayfield: "label", valuefield: "value" }},
                    { post_field: "entrytype", label: _("Entry Type"), type: "select", 
                        options: { displayfield: "ENTRYTYPENAME", rows: controller.entrytypes }},
                    { post_field: "entryreason", label: _("Entry Category"), type: "select", 
                        options: { displayfield: "REASONNAME", rows: controller.entryreasons }},
                    { post_field: "jurisdiction", label: _("Jurisdiction"), type: "select", 
                        options: { displayfield: "JURISDICTIONNAME", rows: controller.jurisdictions }},
                    { post_field: "fee", label: _("Adoption Fee"), type: "currency" },
                    { type: "raw", rowid: "pickuprow", label: _("Picked Up"),
                        markup: tableform.render_check({ post_field: "pickedup", justwidget: true }) +
                            tableform.render_select({ post_field: "pickuplocation", justwidget: true,
                                options: '<option value="0"></option>' + 
                                    html.list_to_options(controller.pickuplocations, "ID", "LOCATIONNAME") }) + 
                            '<br>' +
                            tableform.render_text({ post_field: "pickupaddress", justwidget: true, doublesize: true, placeholder: _("Pickup Address") }) },
                    { post_field: "originalowner", label: _("Original Owner"), type: "person", colclasses: "bottomborder" },
                    { post_field: "broughtinby", label: _("Brought In By"), type: "person" },
                    { post_field: "datebroughtin", label: _("Date Brought In"), type: "date" },
                    { post_field: "timebroughtin", label: _("Time Brought In"), type: "time" },
                    { type: "additional", markup: additional.additional_new_fields(controller.additional) }
                ], { full_width: false }),
                tableform.buttons_render([
                   { id: "addedit", icon: "animal-add", text: _("Create and edit") },
                   { id: "add", icon: "animal-add", text: _("Create") },
                   { id: "save", icon: "save", text: _("Save") },
                   { id: "reset", icon: "delete", text: _("Reset") }
                ], { centered: true }),
                html.content_footer()
            ].join("\n");
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
                            const currentLocation = $("#location option:selected").text();
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
                        const currentLocation = $("#location option:selected").text();
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
            const response = await common.ajax_post("animal_induction", "mode=units&locationid=" + $("#location").val());
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
            $("#location").select("value", config.str("AFDefaultLocation"));
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

            $("#location").change(animal_induction.update_units);
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
                var inductionOption = $("#location option").filter(function() {
                    return $(this).text().trim() === 'Induction';
                });
                if (inductionOption.length > 0) {
                    $("#location").val(inductionOption.val()).trigger('change');
                } else {
                    // Method 2: Try to find by partial text match
                    $("#location option").each(function() {
                        if ($(this).text().toLowerCase().indexOf('induction') !== -1) {
                            $("#location").val($(this).val()).trigger('change');
                            return false;
                        }
                    });
                }
            }, 500);

            // Buttons
            $("#button-add").button().click(function() {
                animal_induction.add_animal("add");
            });

            $("#button-addedit").button().click(function() {
                animal_induction.add_animal("addedit");
            });

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
            $("#location").val(animal.SHELTERLOCATION);
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
