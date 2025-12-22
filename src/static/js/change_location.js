/*global $, _, common, controller, header, html, log, tableform */

$(function() {

  "use strict";

  const WARNING_TEXT = _("You should only attempt log-on to the area that you have been assigned to. Clare will be notified on each location switch.");

  const change_location = {

    mode: controller.mode || "change",
    selectedLocationId: "",
    selectedLocationName: "",

    render: function() {
      const title = this.mode === "login" ? _("Select Location") : _("Change Location");
      const currentName = controller.currentlocationname ? controller.currentlocationname : _("None");
      const currentInfo = this.mode === "change"
        ? html.info(_("Current location: {0}").replace("{0}", html.title(currentName)))
        : "";
      const buttonText = this.mode === "login" ? _("Continue") : _("Continue");

      return [
        html.content_header(title),
        html.warn(WARNING_TEXT, "location-warning"),
        currentInfo,
        '<div id="location-select">',
          tableform.fields_render([
            { post_field: "locationid", label: _("Location"), type: "select",
              options: '<option value=""></option>' + html.list_to_options(controller.internallocations, "ID", "LOCATIONNAME") }
          ], { full_width: false }),
          tableform.buttons_render([
            { id: "continue", icon: "check", text: buttonText }
          ], { centered: false }),
        '</div>',
        '<div id="location-confirm" style="display: none;">',
          '<p id="location-confirm-text"></p>',
          tableform.buttons_render([
            { id: "confirm", icon: "check", text: _("Confirm") },
            { id: "back", icon: "close", text: _("Back") }
          ], { centered: false }),
        '</div>',
        html.content_footer()
      ].join("\n");
    },

    bind: function() {
      const self = this;

      $("#button-continue").button().click(function() {
        header.hide_error();
        const locationId = $("#locationid").val();
        if (!locationId) {
          header.show_error(_("Please select a location."));
          return;
        }
        if (self.mode === "change") {
          const currentId = String(controller.currentlocationid || "");
          if (currentId !== "" && locationId === currentId) {
            header.show_info(_("Location unchanged."));
            common.route("main", true);
            return;
          }
          self.selectedLocationId = locationId;
          self.selectedLocationName = $("#locationid option:selected").text();
          $("#location-confirm-text").html(
            _("You are about to switch to: {0}").replace("{0}", html.title(self.selectedLocationName))
          );
          $("#location-select").hide();
          $("#location-confirm").show();
          return;
        }
        self.submit(locationId);
      });

      $("#button-confirm").button().click(function() {
        if (!self.selectedLocationId) {
          header.show_error(_("Please select a location."));
          return;
        }
        self.submit(self.selectedLocationId);
      });

      $("#button-back").button().click(function() {
        $("#location-confirm").hide();
        $("#location-select").show();
      });
    },

    submit: async function(locationId) {
      const endpoint = (this.mode === "login") ? "location_select" : "change_location";
      header.show_loading(_("Saving..."));
      try {
        await common.ajax_post(endpoint, "locationid=" + encodeURIComponent(locationId));
        common.route("main", true);
      }
      catch (err) {
        log.error(err, err);
        header.show_error(_("Unable to update location."));
      }
      finally {
        header.hide_loading();
      }
    },

    sync: function() {
      $("#location-confirm").hide();
      if (this.mode === "change" && controller.currentlocationid) {
        $("#locationid").select("value", controller.currentlocationid);
      }
    },

    name: "change_location",
    animation: "options",
    autofocus: "#locationid",
    title: function() {
      return this.mode === "login" ? _("Select Location") : _("Change Location");
    },
    routes: {
      "change_location": function() { return common.module_loadandstart("change_location", "change_location"); },
      "location_select": function() { return common.module_loadandstart("change_location", "change_location"); }
    }

  };

  common.module_register(change_location);

});
