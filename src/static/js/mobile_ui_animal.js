/*global $, jQuery, controller, alert */
/*global asm, common, config, format, html */
/*global _, mobile, mobile_ui_addanimal, mobile_ui_incident, mobile_ui_image, mobile_ui_person, mobile_ui_stock */
/*global mobile_ui_animal: true */

"use strict";

const mobile_ui_animal = {

    dailyobs_single_id: 0,

    dailyobs_meta: [],

    dailyobs_init_meta: function() {
        let meta = [];
        for (let i = 0; i < 50; i++) {
            let name = config.str("Behave" + i + "Name"),
                required = config.str("Behave" + i + "Required"),
                range = config.str("Behave" + i + "Range");
            if (!name) { continue; }
            meta.push({
                idx: i,
                label: name,
                dataName: html.title(name),
                required: (required || "").toLowerCase() === "yes",
                range: range || ""
            });
        }
        this.dailyobs_meta = meta;
    },

    dailyobs_lookup_entry: function(container, animalid) {
        if (!container) { return null; }
        if (Array.isArray(container)) {
            for (let i = 0; i < container.length; i++) {
                const entry = container[i];
                if (!entry) { continue; }
                const aid = parseInt(entry.ANIMALID || entry.animalid || entry.id || 0, 10);
                if (aid === animalid) { return entry; }
            }
            return null;
        }
        let key = String(animalid);
        if (Object.prototype.hasOwnProperty.call(container, key)) { return container[key]; }
        if (Object.prototype.hasOwnProperty.call(container, animalid)) { return container[animalid]; }
        return null;
    },

    dailyobs_parse_map: function(comments) {
        let map = {};
        if (!comments) { return map; }
        try {
            $.each(comments.split(','), function(i, part) {
                let pieces = part.split('=');
                if (pieces.length >= 2) {
                    let key = $.trim(pieces[0]);
                    let val = $.trim(pieces.slice(1).join('='));
                    map[key] = val;
                }
            });
        } catch (ex) {}
        return map;
    },

    dailyobs_find_key: function(map, label) {
        if (!map || !label) { return null; }
        const target = $.trim(label).toLowerCase();
        let match = null;
        $.each(map, function(k) {
            if ($.trim(k || "").toLowerCase() === target) {
                match = k;
                return false;
            }
        });
        return match;
    },

    dailyobs_remove_key: function(list, key) {
        if (!list || !key) { return list || []; }
        const target = $.trim(key).toLowerCase();
        return $.grep(list, function(item) {
            if (item.indexOf("=") === -1) { return true; }
            const lhs = $.trim(item.split("=", 1)[0]).toLowerCase();
            return lhs !== target;
        });
    },

    dailyobs_value_indicates_none: function(value) {
        if (value === null || value === undefined) { return true; }
        const v = String(value).trim().toLowerCase();
        if (v === "") { return true; }
        if (["none", "no", "absent", "missing", "n/a", "na", "nil", "zero", "0"].indexOf(v) !== -1) { return true; }
        if (v.startsWith("no ") || v.startsWith("none ") || v.indexOf("no sign") !== -1 || v.indexOf("not seen") !== -1 ||
            v.indexOf("no poo") !== -1 || v.indexOf("no faec") !== -1 || v.indexOf("no fec") !== -1) { return true; }
        return false;
    },

    dailyobs_prefill_item: function(item, animal, todayEntry, history) {
        const state = {
            logid: 0,
            map: {},
            extras: {},
            history: history || [],
            animalname: animal ? animal.ANIMALNAME : ""
        };
        if (todayEntry && todayEntry.COMMENTS) {
            state.logid = todayEntry.LOGID || todayEntry.ID || 0;
            state.map = this.dailyobs_parse_map(todayEntry.COMMENTS);
            const used = [];
            item.find(".widget").each(function() {
                const widget = $(this);
                const key = mobile_ui_animal.dailyobs_find_key(state.map, widget.attr("data-name"));
                if (key) {
                    widget.val(state.map[key]);
                    used.push(key);
                }
            });
            const extras = {};
            $.each(state.map, function(k, v) {
                if (used.indexOf(k) === -1) { extras[k] = v; }
            });
            state.extras = extras;
            item.addClass("dailyobs-existing");
        }
        item.attr("data-existing-logid", state.logid || 0);
        item.data("obsState", state);
    },

    dailyobs_update_header: function() {
        const labelId = "#dailyobs-today-label";
        if (!$(labelId).length) {
            $("#content-dailyobs .list-group").before('<h5 id="dailyobs-today-label" class="mt-3"></h5>');
        }
        if (controller.todaydate) {
            $(labelId).text(_("Daily observations for {0}").replace("{0}", format.date(controller.todaydate)));
        }
        else {
            $(labelId).text(_("Daily Observations"));
        }
    },

    dailyobs_row_name: function(item) {
        const state = item.data("obsState") || {};
        return state.animalname || "";
    },

    dailyobs_process_item: function(item) {
        const meta = this.dailyobs_meta || [];
        const state = item.data("obsState") || { extras: {}, history: [], map: {} };
        const map = {};
        let avs = [];
        let valid = true;
        let hasValue = false;

        item.find(".widget").removeClass("is-invalid");

        item.find(".widget").each(function() {
            const widget = $(this);
            const nm = widget.attr("data-name");
            const idx = widget.attr("data-index");
            const val = widget.val();
            map[nm] = val;
            const metaEntry = meta.find(function(m) { return String(m.idx) === String(idx); });
            if (metaEntry && metaEntry.required && (!val || $.trim(val) === "")) {
                widget.addClass("is-invalid");
                valid = false;
            }
            if (metaEntry && metaEntry.range && val) {
                let parts = metaEntry.range.split("-");
                if (parts.length === 2) {
                    let lo = parseFloat(parts[0]), hi = parseFloat(parts[1]), v = parseFloat(val);
                    if (!isNaN(lo) && !isNaN(hi) && !isNaN(v) && (v < lo || v > hi)) {
                        widget.addClass("is-invalid");
                        valid = false;
                    }
                }
            }
            if (val && $.trim(val) !== "") { hasValue = true; }
            if (config.bool("SuppressBlankObservations") && !val) { return; }
            avs.push(nm + "=" + val);
        });

        if (!valid) {
            mobile.show_error(_("Error"), _("Please fix highlighted fields."));
            return null;
        }

        let extras = $.extend({}, state.extras || {});

        const findField = function(label) { return mobile_ui_animal.dailyobs_find_key(map, label); };
        const triggers = [];

        const unusualField = findField("Unusual Symptoms");
        const drankField = findField("Drunk");
        const eatenField = findField("Eaten");
        const pooInspectField = findField("Poo Inspection");
        if (unusualField && map[unusualField]) { triggers.push(unusualField); }
        if (drankField && (map[drankField] || "").toLowerCase() === "none") { triggers.push(drankField); }
        if (eatenField && (map[eatenField] || "").toLowerCase() === "none") { triggers.push(eatenField); }
        if (pooInspectField && (map[pooInspectField] === "7" || map[pooInspectField] === "8")) { triggers.push(pooInspectField); }

        const weightFieldKey = findField("Weight");
        if (weightFieldKey && map[weightFieldKey]) {
            const parseWeight = function(s) {
                const w = parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
                return isNaN(w) ? null : w;
            };
            const currentWeight = parseWeight(map[weightFieldKey]);
            if (currentWeight !== null && state.history && state.history.length) {
                let within1d = null, within7d = null;
                const now = new Date();
                $.each(state.history, function(_, entry) {
                    if (!entry || !entry.DATE || !entry.COMMENTS) { return; }
                    const histMap = mobile_ui_animal.dailyobs_parse_map(entry.COMMENTS);
                    const histKey = mobile_ui_animal.dailyobs_find_key(histMap, weightFieldKey) || mobile_ui_animal.dailyobs_find_key(histMap, "Weight");
                    if (!histKey) { return; }
                    const previous = parseWeight(histMap[histKey]);
                    if (previous === null) { return; }
                    const dt = new Date(entry.DATE);
                    const hours = Math.abs((now - dt) / 36e5);
                    if (hours <= 24 && within1d === null) { within1d = previous; }
                    if (hours <= 24 * 7 && within7d === null) { within7d = previous; }
                });
                if (within1d !== null && currentWeight <= within1d * 0.98) {
                    triggers.push(weightFieldKey);
                }
                else if (within7d !== null && currentWeight <= within7d * 0.95) {
                    triggers.push(weightFieldKey);
                }
            }
        }

        let clinicianTriggers = [];
        $.each(map, function(key, value) {
            const lk = (key || "").toLowerCase();
            if (!lk) { return; }
            if ((lk.indexOf("faec") !== -1 || lk.indexOf("feces") !== -1 || lk.indexOf("faeces") !== -1 || lk.indexOf("poo") !== -1) &&
                mobile_ui_animal.dailyobs_value_indicates_none(value)) {
                clinicianTriggers.push(key);
                return;
            }
            if (lk.indexOf("sign") !== -1 && lk.indexOf("animal") !== -1 && mobile_ui_animal.dailyobs_value_indicates_none(value)) {
                clinicianTriggers.push(key);
                return;
            }
            if ((lk.indexOf("seen") !== -1 || lk.indexOf("sighting") !== -1) &&
                mobile_ui_animal.dailyobs_value_indicates_none(value)) {
                clinicianTriggers.push(key);
            }
        });
        clinicianTriggers = [...new Set(clinicianTriggers)];

        if (clinicianTriggers.length) {
            let msg = _("Please notify the clinician before saving for {0}. Triggered fields: {1}. Continue?")
                .replace("{0}", mobile_ui_animal.dailyobs_row_name(item) || _("this animal"))
                .replace("{1}", clinicianTriggers.join(", "));
            const confirmed = window.confirm(msg);
            if (!confirmed) { return null; }
            extras["Notify clinician"] = "Yes";
        } else if (state.extras && state.extras["Notify clinician"] && extras["Notify clinician"] === undefined) {
            extras["Notify clinician"] = state.extras["Notify clinician"];
        }

        if (triggers.length) {
            let msg = _("Take a poo sample now for {0}? Triggered fields: {1}")
                .replace("{0}", mobile_ui_animal.dailyobs_row_name(item) || _("this animal"))
                .replace("{1}", triggers.join(", "));
            const choice = window.confirm(msg);
            extras["Take poo sample"] = choice ? "Yes" : "No";
        } else if (state.extras && state.extras["Take poo sample"] && extras["Take poo sample"] === undefined) {
            extras["Take poo sample"] = state.extras["Take poo sample"];
        }

        $.each(extras, function(k, v) {
            avs = mobile_ui_animal.dailyobs_remove_key(avs, k);
            if (common.nulltostr(v) !== "") {
                avs.push(k + "=" + v);
            }
        });

        if (avs.length === 0 && !hasValue) {
            mobile.show_error(_("Error"), _("Please enter at least one observation value."));
            return null;
        }

        const finalMap = $.extend({}, map);
        $.each(extras, function(k, v) {
            finalMap[k] = v;
        });

        return {
            animalid: parseInt(item.attr("data-id"), 10),
            packed: avs.join(", "),
            logid: state.logid || 0,
            map: finalMap,
            extras: extras
        };
    },

    dailyobs_parse_response: function(resp) {
        if (!resp) { return { count: 0 }; }
        if (typeof resp === "object") { return resp; }
        try {
            return JSON.parse(resp);
        } catch (ex) {
            const count = parseInt(resp, 10);
            if (isNaN(count)) { return { count: 0 }; }
            return { count: count };
        }
    },

    dailyobs_after_save: function(results, payload) {
        payload = payload || {};
        const createdMap = {};
        const updatedMap = {};
        $.each(payload.created || [], function(_, item) {
            createdMap[item.animalid] = item.logid;
        });
        $.each(payload.updated || [], function(_, item) {
            updatedMap[item.animalid] = item.logid;
        });
        $.each(results, function(_, info) {
            const item = info.item;
            const result = info.result;
            const state = item.data("obsState") || { history: [] };
            const aid = result.animalid;
            if (createdMap.hasOwnProperty(aid)) {
                state.logid = createdMap[aid];
            }
            else if (updatedMap.hasOwnProperty(aid)) {
                state.logid = updatedMap[aid];
            }
            state.map = result.map;
            state.extras = result.extras;
            state.history = state.history || [];
            if (result.packed) {
                state.history.unshift({
                    "ID": state.logid,
                    "LOGID": state.logid,
                    "DATE": controller.todaydate || null,
                    "COMMENTS": result.packed,
                    "ANIMALID": aid
                });
                if (state.history.length > 10) {
                    state.history = state.history.slice(0, 10);
                }
            }
            item.data("obsState", state);
            item.attr("data-existing-logid", state.logid || 0);
            item.find(".widget").prop("disabled", true).removeClass("is-invalid");
            item.find(".dailyobsselector").prop("checked", false);
            item.addClass("dailyobs-existing");

            const entryPayload = {
                "ID": state.logid,
                "LOGID": state.logid,
                "DATE": controller.todaydate || null,
                "COMMENTS": result.packed,
                "ANIMALID": aid
            };
            // Update controller caches so subsequent location changes reflect new data
            if (!Array.isArray(controller.todaylogs)) {
                controller.todaylogs = [];
            }
            const existingIndex = (controller.todaylogs || []).findIndex(function(e) {
                return parseInt((e || {}).ANIMALID || 0, 10) === aid;
            });
            if (existingIndex >= 0) {
                controller.todaylogs[existingIndex] = entryPayload;
            }
            else {
                controller.todaylogs.push(entryPayload);
            }
            controller.historylogs = controller.historylogs || {};
            controller.historylogs[String(aid)] = state.history;
            $.each(controller.animals || [], function(_, a) {
                if (a && parseInt(a.ID, 10) === aid) {
                    a.TODAYOBS = entryPayload;
                    a.OBSERVATIONHISTORY = state.history;
                }
            });
        });
    },

    get_query_param: function(name) {
        try {
            const params = new URLSearchParams(window.location.search || "");
            return params.get(name);
        }
        catch (ex) {
            return null;
        }
    },

    /**
     * This probably wants separating in future, as this method is render, bind and sync all in one
     * for an animal record. Handles retrieving the record from the backend, hence async.
     */
    render: async function(a) {
        // Returns the HTML for rendering an animal record
        const i = function(label, value, cfg) {
            if (!value) { value = ""; }
            if (cfg && config.bool(cfg)) { return; } // Hide if this config element is true, eg: DontShowLocationUnit
            return '<div class="row align-items-start"><div class="col">' + label + '</div><div class="col">' + value + '</div></div>';
        };
        const col3 = function(c1, c2, c3) {
            if (!c1 && !c2 && !c3) { return ""; }
            return '<div class="row align-items-start"><div class="col">' + c1 + '</div><div class="col">' + c2 + '</div><div class="col">' + c3 + '</div></div>';
        };
        const hd = function(value) {
            return '<div class="row align-items-start mt-3"><div class="col fw-bold">' + value + '</div></div>';
        };
        const n = function(s) {
            if (!s) { return ""; }
            return s;
        };
        const fgs = function(s) {
            let o = [];
            if (!s) { return ""; }
            $.each(s.split("|"), function(i, v) {
                if (v.trim()) { o.push(v.trim()); }
            });
            return o.join(", ");
        };
        const aci = function(id, headerhtml, bodyhtml, show) {
            if (!show) { show=""; }
            return '<div class="accordion-item">' +
                '<h2 class="accordion-header" id="heading-' + id + '">' +
                '<button class="accordion-button ' + ( show ? "" : "collapsed") + '" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-' + id + 
                    '" aria-expanded="false" aria-controls="collapse-' + id + '">' + headerhtml + '</button></h2>' + 
                '<div id="collapse-' + id + '" class="accordion-collapse collapse ' + show + '" aria-labelledby="heading-' + id + '" data-bs-parent="#accordion-animal">' + 
                '<div class="accordion-body">' + bodyhtml + '</div>' +
                '</div></div>';
        };
        // Grab the extra data for this animal from the backend
        let o = await common.ajax_post(mobile.post_handler, "mode=loadanimal&id=" + a.ID);
        o = jQuery.parseJSON(o);
        a = o.animal;
        const adoptionDisabled = config.bool("DisableAdoptionChecks");
        let adoptableInfo = [true, _("Care Only")];
        if (!adoptionDisabled) {
            adoptableInfo = html.is_animal_adoptable(a);
        }
        const adoptable = adoptableInfo[0];
        const adoptreason = adoptableInfo[1];
        let x = [];
        let h = [
            '<div class="list-group mt-3">',
            '<a href="#" data-link="shelteranimals" class="list-group-item list-group-item-action internal-link">',
            '&#8592; ' + _("Back"),
            '</a>',
            '<div class="list-group-item">',
            '<img style="float: right" height="75px" src="' + html.thumbnail_src(a, "animalthumb") + '">',
            '<h5 class="mb-1">' + a.ANIMALNAME + ' - ' + a.CODE + '</h5>',
            '<small>' + common.substitute(_("{0} {1} {2} aged {3}"), { "0": a.SEXNAME, "1": a.BREEDNAME, "2": a.SPECIESNAME, "3": a.ANIMALAGE }) + '<br/>',
            a.IDENTICHIPNUMBER + '</small>',
            '<br/><small class="fst-italic">' + fgs(a.ADDITIONALFLAGS) + '</small>',
            //'<br/>',
            //'<button type="button" class="uploadphoto btn btn-primary"><i class="bi-cloud-upload-fill"></i> ' + _("Upload"),
            //'</button>',
            //'<input type="file" accept="image/*" class="uploadphotofile" style="display: none" />',
            '</div>',
            '</div>',

            '<div class="accordion" id="accordion-animal">',

            aci("details", _("Animal"), [
                i(_("Status"), adoptionDisabled ? '<span class="text-primary">' + _("Care Only") + '</span>' : 
                    (adoptable ? '<span class="text-success">' + _("Available for adoption") + '</span>' : 
                    '<span class="text-danger">' + _("Not available for adoption") + " (" + adoptreason + ")</span>")),
                i(_("Type"), a.ANIMALTYPENAME),
                i(_("Location"), mobile_ui_animal.display_location(a)),
                i(_("Color"), a.BASECOLOURNAME),
                i(_("Coat Type"), a.COATTYPENAME, "DontShowCoatType"),
                i(_("Size"), a.SIZENAME, "DontShowSize"),
                i(_("DOB"), format.date(a.DATEOFBIRTH) + " (" + a.ANIMALAGE + ")"),
                
                i(_("Markings"), a.MARKINGS),
                i(_("Hidden Comments"), a.HIDDENANIMALDETAILS),
                i(_("Description"), a.ANIMALCOMMENTS),
                
                i(_("Cats"), a.ISGOODWITHCATSNAME, "DontShowGoodWith"),
                i(_("Dogs"), a.ISGOODWITHDOGSNAME, "DontShowGoodWith"),
                i(_("Children"), a.ISGOODWITHCHILDRENNAME, "DontShowGoodWith"),
                i(_("Housetrained"), a.ISHOUSETRAINEDNAME, "DontShowGoodWith")
            ].join("\n"), "show"),
        
            aci("entry", _("Entry"), [
                i(_("Date Brought In"), format.date(a.DATEBROUGHTIN)),
                i(_("Entry Type"), a.ENTRYTYPENAME, "DontShowEntryType"),
                i(_("Entry Category"), a.ENTRYREASONNAME),
                i(_("Entry Reason"), a.REASONFORENTRY),
                common.has_permission("vo") ? i(_("Original Owner"), a.ORIGINALOWNERNAME) : "",
                common.has_permission("vo") ? i(_("Brought In By"), a.BROUGHTINBYOWNERNAME) : "",
                i(_("Bonded With"), n(a.BONDEDANIMAL1CODE) + " " + n(a.BONDEDANIMAL1NAME) + " " + n(a.BONDEDANIMAL2CODE) + " " + n(a.BONDEDANIMAL2NAME), "DontShowBonded")
            ].join("\n")),

            aci("health", _("Health and Identification"), [
                i(_("Microchipped"), format.date(a.IDENTICHIPDATE) + " " + (a.IDENTICHIPPED==1 ? a.IDENTICHIPNUMBER : ""), "DontShowMicrochip"),
                i(_("Tattoo"), format.date(a.TATTOODATE) + " " + (a.TATTOO==1 ? a.TATTOONUMBER : ""), "DontShowTattoo"),
                i(_("Neutered"), a.NEUTEREDNAME + " " + format.date(a.NEUTEREDDATE), "DontShowNeutered"),
                i(_("Declawed"), a.DECLAWEDNAME, "DontShowDeclawed"),
                i(_("Heartworm Tested"), format.date(a.HEARTWORMTESTDATE) + " " + (a.HEARTWORMTESTED==1 ? a.HEARTWORMTESTRESULTNAME : ""), "DontShowHeartworm"),
                i(_("FIV/L Tested"), format.date(a.COMBITESTDATE) + " " + (a.COMBITESTED==1 ? a.COMBITESTRESULTNAME + " " + a.FLVRESULTNAME : ""), "DontShowCombi"),
                i(_("Health Problems"), a.HEALTHPROBLEMS),
                i(_("Rabies Tag"), a.RABIESTAG),
                i(_("Special Needs"), a.HASSPECIALNEEDSNAME),
                i(_("Current Vet"), n(a.CURRENTVETNAME) + " " + n(a.CURRENTVETWORKTELEPHONE))
            ].join("\n")),

            aci("animalimages", _("Images"), [
                mobile_ui_image.render_slider(o.media, "animalimage"),
            ].join("\n"))
        ];
        if (o.additional.length > 0) {
            x = [];
            $.each(o.additional, function(d, v) {
                x.push(i(v.NAME, v.VALUE)); 
            });
            h.push(aci("additional", _("Additional"), x.join("\n")));
        }
        if (common.has_permission("dvad") && o.diets.length > 0) {
            x = [];
            $.each(o.diets, function(d, v) {
                x.push(col3(format.date(v.DATESTARTED), v.DIETNAME, v.COMMENTS));
            });
            h.push(aci("diet", _("Diet"), x.join("\n")));
        }
        if (common.has_permission("vav") && o.vaccinations.length > 0) {
            x = [];
            $.each(o.vaccinations, function(d, v) {
                x.push(col3(format.date(v.DATEOFVACCINATION) || _("Due {0}").replace("{0}", format.date(v.DATEREQUIRED)), v.VACCINATIONTYPE, v.COMMENTS));
            });
            h.push(aci("vacc", _("Vaccination"), x.join("\n")));
        }
        if (common.has_permission("vat") && o.tests.length > 0) {
            x = [];
            $.each(o.tests, function(d, v) {
                x.push(col3(format.date(v.DATEOFTEST) || _("Due {0}").replace("{0}", format.date(v.DATEREQUIRED)), v.TESTNAME, v.RESULTNAME || ""));
            });
            h.push(aci("test", _("Test"), x.join("\n")));
        }
        if (common.has_permission("mvam") && o.medicals.length > 0) {
            x = [];
            $.each(o.medicals, function(d, v) {
                x.push(col3(format.date(v.STARTDATE), v.TREATMENTNAME, v.DOSAGE));
            });
            h.push(aci("medical", _("Medical"), x.join("\n")));
        }
        if (common.has_permission("vdn") && o.diary.length > 0) {
            x = [];
            $.each(o.diary, function(d, v) {
                x.push(col3(format.date(v.DIARYDATETIME), v.SUBJECT, v.NOTE));
            });
            h.push(aci("diary", _("Diary"), x.join("\n")));
        }
        if (common.has_permission("vle") && o.logs.length > 0) {
            x = [];
            $.each(o.logs, function(d, v) {
                x.push(col3(format.date(v.DATE), v.LOGTYPENAME, v.COMMENTS));
            });
            h.push(aci("log", _("Log"), x.join("\n")));
        }
        if (common.has_permission("ale")) {
            h.push(aci("addlog", _("Add Log"), mobile.render_addlog(a.ID, 0)));
        }
        h.push('</div>'); // close accordion
        $("#content-animal").html( h.join("\n") );

        // Display our animal now it's rendered
        $(".container").hide();
        $("#content-animal").show();

        // Show images based on clicked thumbnail
        $("#content-animal").on("click", ".media-thumb", function() {
            $(this).parent().find(".media-thumb").css("border-color", "#fff");
            $(this).css("border-color", "#000");
            $("#animalimage-image").prop("src", "/image?db=" + asm.useraccount + "&mode=media&id=" + $(this).attr("data-imageid"));
            $("#animalimage-anchor").prop("href", "/image?db=" + asm.useraccount + "&mode=media&id=" + $(this).attr("data-imageid"));
            $("#animalimage-notes").html($(this).attr("data-description"));
        });

        // Add listener for adding media
        $("#animalimage-button-gallery").click(function() {
            $("#animalimage-input-gallery").trigger("click");
        });
        $("#animalimage-button-camera").click(function() {
            $("#animalimage-input-camera").trigger("click");
        });
        $("#animalimage-input-gallery").change(function() {
            $.each($("#animalimage-input-gallery")[0].files, function(imagecount, imagefile) {
                mobile_ui_animal.upload_animal_image(imagefile, a.ID, "gallery");
            });
        });
        $("#animalimage-input-camera").change(function() {
            mobile_ui_animal.upload_animal_image($("#animalimage-input-camera")[0].files[0], a.ID, "camera");
        });
        // Handle the uploading of a photo when one is chosen
        $("#content-animal .uploadphoto").click(function() { $("#content-animal .uploadphotofile").click(); });
        $("#content-animal .uploadphotofile").change(function() { alert($("#content-animal .uploadphotofile").val()); });
    },

    render_shelteranimalslist: function() {
        // Load shelter animals list
        $("#content-shelteranimals .list-group").empty();
        $.each(controller.animals, function(i, v) {
            let h = '<a href="#" data-id="' + v.ID + '" class="list-group-item list-group-item-action">' +
                '<img style="float: right" height="75px" src="' + html.thumbnail_src(v, "animalthumb") + '">' + 
                '<h5 class="mb-1">' + v.ANIMALNAME + ' - ' + v.CODE + '</h5>' +
                '<small>(' + v.SEXNAME + ' ' + v.BREEDNAME + ' ' + v.SPECIESNAME + ')<br/>' + v.IDENTICHIPNUMBER + ' ' + mobile_ui_animal.display_location(v) + '</small>' +
                '</a>';
            $("#content-shelteranimals .list-group").append(h);
        });
    },

    /* Outputs the displaylocation for an animal. If the user does not have permission to view
        person records and the animal has left on an active movement to a person, only show the
        active movement and remove the person name */
    display_location: function(a) {
        let displaylocation = a.DISPLAYLOCATION;
        if (a.ACTIVEMOVEMENTTYPE > 0 && !common.has_permission("vo") && displaylocation.indexOf("::") != -1) { 
            displaylocation = a.DISPLAYLOCATIONNAME;
        }
        return displaylocation;
    },

    upload_animal_image: function(file, animalid, uploadtype) {
        let reader = new FileReader();
        reader.addEventListener("load", function() {
            let formdata = "animalid=" + animalid + "&type=" + uploadtype + "&filename=" + encodeURIComponent(file.name) + "&filedata=" + encodeURIComponent(reader.result);
            let targeturl =  "mobile_photo_upload";
            $("#animalimage-button-" + uploadtype + " .media-button-icon").hide();
            $("#animalimage-button-" + uploadtype + " .media-button-spinner").show();
            $.ajax({
                method: "POST",
                url: targeturl,
                data: formdata,
                dataType: "text",
                mimeType: "textPlain",
                error: function(obj, error, errorthrown) {
                    mobile.show_error(error, errorthrown);
                    $(".media-button-icon").show();
                    $(".media-button-spinner").hide();
                },
                success: function(mid) {
                    let newthumbnail = mobile_ui_image.render_thumbnail(mid, "animalimage");
                    $(newthumbnail).insertAfter($("#animalimage-input-gallery"));
                    $(".media-button-icon").show();
                    $(".media-button-spinner").hide();
                }
            });
        }, false);
        reader.readAsDataURL(file);
    },

    bind: function() {

        // Handle a change of internal location on daily observations
            $("#dailyobslocation").change(function() {
            $("#content-dailyobs .list-group").empty();
            mobile_ui_animal.dailyobs_init_meta();
            mobile_ui_animal.dailyobs_update_header();
            controller.animals.sort(common.sort_single("SHELTERLOCATIONUNIT"));
            $.each(controller.animals, function(i, v) {
                if (v.SHELTERLOCATION == $("#dailyobslocation").val()) {
                    let h = '<div data-id="' + v.ID + '" class="list-group-item list-group-item-action">' +
                        '<img style="float: right" height="75px" src="' + html.thumbnail_src(v, "animalthumb") + '">' + 
                        '<h5 class="mb-1"><input type="checkbox" class="dailyobsselector">&nbsp;' + v.ANIMALNAME + ' - ' + v.CODE + ' - ' + v.SHELTERLOCATIONUNIT + '</h5>';
                    for (let j = 0; j < 50; j++) {
                        let name = config.str("Behave" + j + "Name"), value = config.str("Behave" + j + "Values");
                        if (!name) { continue; }
                        let dataName = html.title(name);
                        if (value) {
                            h += '<select class="asm-selectbox asm-halfselectbox widget" data-name="' + dataName + '" data-index="' + j + '" disabled>' +
                                '<option value="">' + name + '</option>' + html.list_to_options(value.split("|")) + '</select>';
                        }
                        else {
                            h += '<input type="text" class="asm-textbox widget" data-name="' + dataName + '" data-index="' + j + '" placeholder="' + name + '" disabled />';
                        }
                    }
                    h += '<div class="d-grid gap-2 mt-3">';
                    h += '<button type="button" class="btn btn-outline-primary btn-sm dailyobs-single" data-id="' + v.ID + '">' + _("Single entry view") + '</button>';
                    h += '</div>';
                    h += '</div>';
                    $("#content-dailyobs .list-group").append(h);
                    let item = $("#content-dailyobs .list-group .list-group-item").last();
                    let todayEntry = v.TODAYOBS || mobile_ui_animal.dailyobs_lookup_entry(controller.todaylogs || {}, v.ID);
                    let history = v.OBSERVATIONHISTORY || mobile_ui_animal.dailyobs_lookup_entry(controller.historylogs || {}, v.ID) || [];
                    mobile_ui_animal.dailyobs_prefill_item(item, v, todayEntry, history);
                }
            });
        });

        // Handle clicking on the clear daily obs button
        $("#btn-clear-dailyobs").click(function() {
            $("#content-dailyobs .list-group .widget").val('');
            $("#content-dailyobs .list-group .widget").prop('disabled', true).removeClass('is-invalid');
            $("#content-dailyobs .list-group .dailyobsselector").prop('checked', false);
        });

        $("#content-dailyobs").on('click', '.dailyobsselector', function() {
            if ($(this).closest('.list-group-item').find('.widget').first().prop('disabled')) {
                $(this).closest('.list-group-item').find('.widget').prop('disabled', false).removeClass('is-invalid');
            } else {
                $(this).closest('.list-group-item').find('.widget').prop('disabled', true).removeClass('is-invalid');
            }
        });

        $("#content-dailyobs").on('click', '.dailyobs-single', function(evt) {
            evt.preventDefault();
            evt.stopPropagation();
            const aid = $(this).attr("data-id");
            if (!aid) { return; }
            window.location.href = "hedgehog_observation?mobile=1&animalid=" + aid;
        });

        $("#btn-commit-dailyobs").click(async function() {
            let selected = $("#content-dailyobs .list-group .list-group-item").filter(function() {
                return $(this).find(".dailyobsselector").is(":checked");
            });
        if (selected.length === 0) {
            mobile.show_info(_("Daily observations"), _("Select at least one animal to record observations."));
            return;
        }

        let logs = [];
            let updateMap = {};
            let results = [];

            selected.each(function() {
                const item = $(this);
                const outcome = mobile_ui_animal.dailyobs_process_item(item);
                if (!outcome) {
                    logs = [];
                    return false;
                }
                logs.push(outcome.animalid + "==" + outcome.packed);
                if (outcome.logid) {
                    updateMap[outcome.animalid] = outcome.logid;
                }
                results.push({ item: item, result: outcome });
            });

            if (!logs.length) { return; }

            let formdata = {
                "mode": "save",
                "logtype": config.str("BehaveLogType"),
                "logs": logs.join("^^")
            };
            if (Object.keys(updateMap).length) {
                formdata.updatemap = JSON.stringify(updateMap);
            }

            let response = await common.ajax_post("animal_observations", formdata);
        let payload = mobile_ui_animal.dailyobs_parse_response(response);
        let countText = (payload && typeof payload.count !== "undefined") ? payload.count : response;
        mobile.show_info(_("Daily observations"), _("{0} observation logs successfully written.").replace("{0}", countText));
            mobile_ui_animal.dailyobs_after_save(results, payload);
        });

        const singleParam = mobile_ui_animal.get_query_param("animalid");
        if (singleParam) {
            const aid = parseInt(singleParam, 10);
            if (!isNaN(aid)) {
                mobile_ui_animal.dailyobs_single_id = aid;
                let match = null;
                $.each(controller.animals, function(i, v) {
                    if (v.ID === aid) { match = v; return false; }
                });
                if (match) {
                    $("#dailyobslocation").val(match.SHELTERLOCATION);
                    $("#dailyobslocation").trigger("change");
                    setTimeout(function() {
                        $("#content-dailyobs .list-group .list-group-item").each(function() {
                            if (parseInt($(this).attr("data-id"), 10) !== aid) { $(this).hide(); }
                        });
                    }, 0);
                }
                else {
                    $("#dailyobslocation").trigger("change");
                }
            }
            else {
                $("#dailyobslocation").trigger("change");
            }
        }
        else {
            $("#dailyobslocation").trigger("change");
        }

        // Handle clicking on check microchip button
        $("#btn-check-microchip").click(function() {
            if ($("#microchipnumbersearch").val() == '') {
                mobile.show_error(_("Error"), _("A microchip number must be supplied"));
            } else {
                let spinner = $(this).find(".spinner-border");
                spinner.show();
                // Retrieve results
                let formdata = {
                    "mode": "checkmicrochip",
                    "microchipnumber": $("#microchipnumbersearch").val()
                };
                mobile.ajax_post(formdata, function(response) {
                    spinner.hide();
                    controller.microchipresults = jQuery.parseJSON(response);
                    // Display person list
                    $("#content-microchipresults .list-group").empty();
                    $.each(controller.microchipresults, function(i, v) {
                        let a = '"' + v.ANIMALNAME + '": ' + common.substitute(_("{0} {1} aged {2}"), { "0": v.SEX, "1": v.SPECIESNAME, "2": v.ANIMALAGE }) + '<br>';
                        if (!v.ANIMALNAME) { a = ""; }
                        let h = '<div data-id="' + v.ID + '" class="list-group-item list-group-item-action">' +
                            '<img style="float: right" height="75px" src="' + html.thumbnail_src(v, "animalthumb") + '">' + 
                            '<h5 class="mb-1">' + v.SHELTERCODE + ' ' + v.ANIMALNAME + ' - ' + v.ANIMALAGE + '</h5>';
                        if (v.CURRENTOWNERID) {
                            h += '<small>' + _("Current Owner") + ': ' + 
                                v.CURRENTOWNERNAME + '<br>' + v.CURRENTOWNERADDRESS + ', ' + v.CURRENTOWNERTOWN + ' ' + v.CURRENTOWNERCOUNTY + ' ' + v.CURRENTOWNERPOSTCODE;
                            $.each([v.CURRENTOWNERHOMETELEPHONE, v.CURRENTOWNERWORKTELEPHONE, v.CURRENTOWNERMOBILETELEPHONE], function(i, v) {
                                if (v) {
                                    h += '<br><a href=tel:' + v.replace(/ /g, '') + '>' + v + '</a>';
                                }
                            });
                            if (v.CURRENTOWNEREMAILADDRESS) {
                                h += '<br><a href=mailto:' + v.CURRENTOWNEREMAILADDRESS + '>' + v.CURRENTOWNEREMAILADDRESS + '</a>';
                            }
                            h += '</small>';
                            
                        } else {
                            h += '<small>' + _("No current owner found") + '</small>';
                        }
                        h += '</div>';
                        $("#content-microchipresults .list-group").append(h);
                    });
                    if (controller.microchipresults.length == 0) {
                        let h = '<p>' + _("No results found") + '</p>';
                        $("#content-microchipresults .list-group").append(h);
                    }
                    $(".container").hide();
                    $("#content-microchipresults").show();
                });
            }
        });

        // When a shelter animal link is clicked, display the record
        $("#content-shelteranimals").on("click", "a", function() {
            let animalid = format.to_int($(this).attr("data-id")), a = null;
            $.each(controller.animals, function(i, v) {
                if (v.ID == animalid) { a = v; return false; }
            });
            if (a) { 
                mobile_ui_animal.render(a);
            }
        });

        // Handle clicking an animal to medicate and showing a popup dialog to confirm
        $("#content-medicate").on("click", "a", function() {
            let treatmentid = $(this).attr("data-id");
            $.each(controller.medicals, function(i, v) {
                if (v.TREATMENTID == treatmentid) {
                    $("#administerdlg .btn-primary").unbind("click");
                    $("#administerdlg .btn-primary").html(_("Give"));
                    $("#administerdlg .btn-primary").click(function() {
                        mobile.ajax_post("mode=medical&id=" + treatmentid, function() {
                            $("#content-medicate [data-id='" + treatmentid + "']").remove(); // remove the item from the list on success
                        });
                    });
                    $("#administertitle").html(_("Give Treatments"));
                    $("#administerresult").hide();
                    $("#administertext").html(format.date(v.DATEREQUIRED) + ": " + v.ANIMALNAME + ' - ' + v.SHELTERCODE + ': ' + v.TREATMENTNAME);
                    $("#administerdlg").modal("show");
                }
            });
        });

        // Handle clicking an animal to test and showing a popup dialog to confirm
        $("#content-test").on("click", "a", function() {
            let testid = $(this).attr("data-id");
            $.each(controller.tests, function(i, v) {
                if (v.ID == testid) {
                    $("#administerdlg .btn-primary").unbind("click");
                    $("#administerdlg .btn-primary").html(_("Perform"));
                    $("#administerdlg .btn-primary").click(function() {
                        mobile.ajax_post("mode=test&id=" + testid + "&resultid=" + $("#administerresult").val(), function() {
                            $("#content-test [data-id='" + testid + "']").remove(); // remove the item from the list on success
                        });
                    });
                    $("#administertitle").html(_("Perform Test"));
                    $("#administerresult").show();
                    $("#administertext").html(format.date(v.DATEREQUIRED) + ": " + v.ANIMALNAME + ' - ' + v.SHELTERCODE + ': ' + v.TESTNAME);
                    $("#administerdlg").modal("show");
                }
            });
        });

        // Handle clicking an animal to vaccinate and showing a popup dialog to confirm
        $("#content-vaccinate").on("click", "a", function() {
            let vaccid = $(this).attr("data-id");
            $.each(controller.vaccinations, function(i, v) {
                if (v.ID == vaccid) {
                    $("#administerdlg .btn-primary").unbind("click");
                    $("#administerdlg .btn-primary").html(_("Give"));
                    $("#administerdlg .btn-primary").click(function() {
                        mobile.ajax_post("mode=vaccinate&id=" + vaccid, function() {
                            $("#content-vaccinate [data-id='" + vaccid + "']").remove(); // remove the item from the list on success
                        });
                    });
                    $("#administertitle").html(_("Give Vaccination"));
                    $("#administerresult").hide();
                    $("#administertext").html(format.date(v.DATEREQUIRED) + ": " + v.ANIMALNAME + ' - ' + v.SHELTERCODE + ': ' + v.VACCINATIONTYPE);
                    $("#administerdlg").modal("show");
                }
            });
        });
    },

    sync: function() {

        // Load list of animals to medicate
        $("#content-medicate .list-group").empty();
        $.each(controller.medicals, function(i, v) {
            let h = '<a href="#" data-id="' + v.TREATMENTID + '" class="list-group-item list-group-item-action">' +
                '<img style="float: right" height="75px" src="' + html.thumbnail_src(v, "animalthumb") + '">' + 
                '<h5 class="mb-1">' + v.ANIMALNAME + ' - ' + v.SHELTERCODE + '</h5>' +
                '<small>(' + v.TREATMENTNAME + ', ' + format.date(v.DATEREQUIRED) + ') ' + mobile_ui_animal.display_location(v) + '</small>' +
                '</a>';
            $("#content-medicate .list-group").append(h);
        });

        // Load list of animals to test
        $("#content-test .list-group").empty();
        $.each(controller.tests, function(i, v) {
            let h = '<a href="#" data-id="' + v.ID + '" class="list-group-item list-group-item-action">' +
                '<img style="float: right" height="75px" src="' + html.thumbnail_src(v, "animalthumb") + '">' + 
                '<h5 class="mb-1">' + v.ANIMALNAME + ' - ' + v.SHELTERCODE + '</h5>' +
                '<small>(' + v.TESTNAME + ', ' + format.date(v.DATEREQUIRED) + ') ' + mobile_ui_animal.display_location(v) + '</small>' +
                '</a>';
            $("#content-test .list-group").append(h);
        });

        // Load list of animals to vaccinate
        $("#content-vaccinate .list-group").empty();
        $.each(controller.vaccinations, function(i, v) {
            let h = '<a href="#" data-id="' + v.ID + '" class="list-group-item list-group-item-action">' +
                '<img style="float: right" height="75px" src="' + html.thumbnail_src(v, "animalthumb") + '">' + 
                '<h5 class="mb-1">' + v.ANIMALNAME + ' - ' + v.SHELTERCODE + '</h5>' +
                '<small>(' + v.VACCINATIONTYPE + ', ' + format.date(v.DATEREQUIRED) + ') ' + mobile_ui_animal.display_location(v) + '</small>' +
                '</a>';
            $("#content-vaccinate .list-group").append(h);
        });

        // Load list of animals for daily obs
        $("#dailyobslocation").change();

    }

};
