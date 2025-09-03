/*global $, jQuery, _, asm, common, config, controller, dlgfx, edit_header, format, header, html, tableform, validate */

$(function() {

    "use strict";

    const hedgehog_observation = {

        render: function() {
            let a = controller.animal;

            let h = [
                html.content_header(_("Daily Observation")),
            ];

            // Animal header
            if (a) {
                h.push('<div class="asm-main-section">');
                h.push('<div class="asm-row">');
                h.push('<div class="asm-col-12">');
                h.push(html.animal_link(a, { emblemsright: true, newtab: true }));
                h.push('</div></div>');
            } else {
                h.push('<div class="asm-warning">' + _("Animal not found from query.") + '</div>');
            }

            // Build behaviour fields vertically (top-to-bottom)
            let fields = [];
            for (let i = 0; i < 50; i++) {
                let name = config.str("Behave" + i + "Name");
                let value = config.str("Behave" + i + "Values");
                if (!name) { continue; }
                let label = '<label class="asm-label">' + html.title(name) + '</label>';
                if (value) {
                    fields.push(
                        '<div class="asm-field">' + label +
                        '<select class="asm-selectbox asm-halfselectbox widget" data-name="' + html.title(name) + '">' +
                        '<option value=""></option>' + html.list_to_options(value.split("|")) +
                        '</select></div>'
                    );
                } else {
                    fields.push(
                        '<div class="asm-field">' + label +
                        '<input type="text" class="asm-textbox widget" data-name="' + html.title(name) + '" />' +
                        '</div>'
                    );
                }
            }

            h.push('<div class="asm-main-section asm-hhog-observation">');
            h.push(fields.join("\n"));

            // Buttons
            h.push('<div class="asm-button-row">');
            h.push('<button id="button-save">' + _("Save") + '</button>');
            h.push('</div>');

            h.push('</div>'); // end section
            h.push(html.content_footer());
            return h.join("\n");
        },

        bind: function() {
            // Disable widgets until we have an animal
            if (!controller.animal) {
                $(".widget").prop("disabled", true);
            }

            $("#button-save").button().click(async function() {
                if (!controller.animal) { return; }
                let avs = [];
                $(".widget").each(function() {
                    if (config.bool("SuppressBlankObservations") && !$(this).val()) { return; }
                    avs.push($(this).attr("data-name") + "=" + $(this).val());
                });
                let packed = controller.animal.ID + "==" + avs.join(", ");
                let formdata = { "mode": "save", "logtype": config.str("BehaveLogType"), "logs": packed };
                if (avs.length === 0) { return; }
                header.show_loading(_("Saving..."));
                let response = await common.ajax_post("hedgehog_observation", formdata);
                header.hide_loading();
                let msg = _("{0} observation logs successfully written.").replace("{0}", response);
                if (controller.animal && controller.animal.ANIMALNAME) {
                    msg = _("Observation saved for {0}.").replace("{0}", html.title(controller.animal.ANIMALNAME));
                }
                header.show_info(msg, 5000);
                // Attempt to close the form/tab after a short delay. If the
                // window cannot be closed (most browsers unless opened by script),
                // navigate back; if no history, go to main.
                setTimeout(function(){
                    try { window.close(); } catch(e) {}
                    if (window.history.length > 1) {
                        window.history.back();
                    } else {
                        document.location.href = "main";
                    }
                }, 1200);
            });
        },

        sync: function() {},
        destroy: function() {},
        name: "hedgehog_observation",
        animation: "book",
        title: function() { return _("Daily Observation"); },
        routes: {
            "hedgehog_observation": function() { common.module_loadandstart("hedgehog_observation", "hedgehog_observation?" + this.rawqs); }
        }
    };

    common.module_register(hedgehog_observation);

});
