/*global $, jQuery, _, asm, common, config, controller, dlgfx, edit_header, format, header, html, tableform */

$(function() {

    "use strict";

    const animal_analysis = {
        _escape: function(s) {
            if (s === null || s === undefined) { return ""; }
            return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        },

        render: function() {
            let h = [];
            h.push(edit_header.animal_edit_header(controller.animal, "analysis", controller.tabcounts));

            // Controls
            this.buttons = [
                { id: "btn_weight_graph", text: _("Weight Graph"), icon: "chart", enabled: "always",
                    click: () => { this.load_weight_graph(); } }
            ];
            h.push(tableform.buttons_render(this.buttons));

            // Placeholder for graph + options
            h.push('<div id="analysis-content" class="asm-form" style="padding: 8px 0;">');
            h.push('  <div id="analysis-opts" style="margin-bottom: 8px;">');
            // Future options could go here (date range, unit toggles, smoothing, etc)
            h.push('  </div>');
            h.push('  <div id="analysis-output" style="position: relative;">');
            h.push('    <canvas id="weight-graph-canvas" width="900" height="320" style="border: 0; display: none;"></canvas>');
            h.push('    <img id="weight-graph" alt="Weight Graph" style="max-width: 100%; display: none;" />');
            h.push('    <div id="weight-tooltip" class="asm-tooltip" style="position:absolute; display:none; pointer-events:none; background:#333; color:#fff; padding:6px 8px; border-radius:4px; font-size:11px; max-width: 360px; z-index: 10;"></div>');
            h.push('  </div>');
            h.push('</div>');

            h.push(html.content_footer());
            return h.join("\n");
        },

        bind: function() {
            $(".asm-tabbar").asmtabs();
            tableform.buttons_bind(this.buttons || []);
            // Auto-load interactive weight graph on first view
            this.load_weight_graph();
        },

        load_weight_graph: function() {
            const canvas = document.getElementById("weight-graph-canvas");
            const ctx = canvas.getContext("2d");
            const dpr = window.devicePixelRatio || 1;
            const baseW = canvas.width, baseH = canvas.height;
            // Scale for retina
            canvas.style.width = baseW + "px";
            canvas.style.height = baseH + "px";
            canvas.width = Math.round(baseW * dpr);
            canvas.height = Math.round(baseH * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            // Fetch data
            $.getJSON("animal_weight_observations", { id: controller.animal.ID, json: true }, (data) => {
                const gramsMode = config.bool("ShowWeightInGrams");
                const convertWeight = (wt) => {
                    const parsed = parseFloat(wt);
                    if (!Number.isFinite(parsed)) { return null; }
                    if (!gramsMode) {
                        return parsed;
                    }
                    // If value already looks like grams (legacy data), keep it.
                    if (parsed > 10) {
                        return Math.round(parsed);
                    }
                    // Otherwise treat as kilograms and convert.
                    return Math.round(parsed * 1000);
                };
                const points = (data.points || []).map(p => {
                    const converted = convertWeight(p.weight);
                    if (converted === null) { return null; }
                    return {
                        t: new Date(p.dateiso),
                        wt: converted,
                        by: p.by || "",
                        extras: p.extras || {},
                        raw: p
                    };
                }).filter(p => p !== null);
                const targetWeightValue = convertWeight(data.targetweight);
                const targetWeight = targetWeightValue === null ? null : targetWeightValue;
                const pooPoints = (data.poo || []).map(p => ({
                    t: new Date(p.dateiso),
                    result: p.result || "",
                    by: p.by || "",
                    raw: p
                }));
                this.draw_weight_graph(canvas, ctx, points, targetWeight, pooPoints, gramsMode);
            });
        },

        draw_weight_graph: function(canvas, ctx, points, targetWeight, pooPoints, useGrams) {
            const tooltip = $("#weight-tooltip");
            const unitLabel = useGrams ? "g" : "kg";
            $("#weight-graph").hide(); // ensure PNG fallback hidden
            $(canvas).show();

            // Guard: no data
            if (!points || points.length === 0) {
                ctx.clearRect(0,0,canvas.width,canvas.height);
                ctx.save();
                ctx.fillStyle = "#666";
                ctx.font = "12px sans-serif";
                ctx.fillText("No weight data", 20, 30);
                ctx.restore();
                return;
            }

            // Layout
            const W = canvas.width / (window.devicePixelRatio || 1);
            const H = canvas.height / (window.devicePixelRatio || 1);
            const pad = { left: 56, right: 12, top: 18, bottom: 46 };
            const plotW = W - pad.left - pad.right;
            const plotH = H - pad.top - pad.bottom;

            // Data bounds
            const minT = new Date(Math.min.apply(null, points.map(p => p.t.getTime())));
            const maxT = new Date(Math.max.apply(null, points.map(p => p.t.getTime())));
            let minW = Math.min.apply(null, points.map(p => p.wt));
            let maxW = Math.max.apply(null, points.map(p => p.wt));
            if (Number.isFinite(targetWeight)) {
                minW = Math.min(minW, targetWeight);
                maxW = Math.max(maxW, targetWeight);
            }
            const yPad = (maxW - minW) * 0.07 || 1;
            // Always start the Y axis at zero so baseline markers (e.g., poo samples) are visible
            const yMin = 0;
            const yMax = Math.ceil((maxW + yPad));

            // Monday ticks (one label per week)
            const mondayTicks = [];
            const start = new Date(minT.getTime());
            const day = start.getDay(); // 0=Sun..6=Sat
            const daysToMon = (day === 0 ? 1 : (day > 1 ? 8 - day : 0));
            let firstMon = new Date(start.getFullYear(), start.getMonth(), start.getDate() + daysToMon);
            if (firstMon < minT) firstMon = new Date(firstMon.getTime() + 7*86400000);
            for (let d = firstMon; d <= maxT; d = new Date(d.getTime() + 7*86400000)) {
                mondayTicks.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
            }

            // Scaling
            const xVal = (t) => pad.left + ( (t - minT) / (maxT - minT || 1) ) * plotW;
            const yVal = (w) => pad.top + plotH - ( (w - yMin) / (yMax - yMin || 1) ) * plotH;

            const render_static = () => {
                ctx.clearRect(0, 0, W, H);

                // Grid
                ctx.save();
                ctx.strokeStyle = "#ddd";
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                mondayTicks.forEach(t => {
                    const x = xVal(t);
                    ctx.beginPath();
                    ctx.moveTo(x, pad.top);
                    ctx.lineTo(x, pad.top + plotH);
                    ctx.stroke();
                });
                ctx.setLineDash([]);

                // Axes
                ctx.strokeStyle = "#333";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(pad.left, pad.top);
                ctx.lineTo(pad.left, pad.top + plotH);
                ctx.lineTo(pad.left + plotW, pad.top + plotH);
                ctx.stroke();

                // X labels (Mondays)
                ctx.fillStyle = "#333";
                ctx.font = "10px sans-serif"; // smaller and neater
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                mondayTicks.forEach(t => {
                    const x = xVal(t);
                    const dd = t.getDate().toString().padStart(2,'0');
                    const mm = (t.getMonth()+1).toString().padStart(2,'0');
                    const yy = String(t.getFullYear()).slice(-2).padStart(2,'0');
                    const s = dd + '/' + mm + '/' + yy; // dd/mm/yy
                    ctx.fillText(s, x, pad.top + plotH + 6);
                });

                // Y labels (nice 4-6 steps)
                const steps = 4;
                const stepSize = (yMax - yMin) / steps;
                ctx.textAlign = "right";
                ctx.textBaseline = "middle";
                for (let i=0;i<=steps;i++){
                    const yv = yMin + i*stepSize;
                    const y = yVal(yv);
                    const label = Math.round(yv);
                    ctx.fillText(label + " " + unitLabel, pad.left - 6, y);
                }

                // Title
                ctx.textAlign = "center";
                ctx.textBaseline = "alphabetic";
                ctx.font = "12px sans-serif";
                ctx.fillText("Weight Over Time (" + unitLabel + ") — " + (controller.animal.ANIMALNAME || ''), pad.left + plotW/2, 14);

                // Target Weight line (if provided)
                if (Number.isFinite(targetWeight)) {
                    let ty = yVal(targetWeight);
                    // Clamp label position inside plot area
                    const labelY = Math.max(pad.top + 10, Math.min(pad.top + plotH - 10, ty));
                    ctx.save();
                    ctx.strokeStyle = "#2ca02c"; // green
                    ctx.setLineDash([6, 3]);
                    ctx.lineWidth = 1.25;
                    ctx.beginPath();
                    ctx.moveTo(pad.left, ty);
                    ctx.lineTo(pad.left + plotW, ty);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.fillStyle = "#2ca02c";
                    ctx.font = "10px sans-serif";
                    ctx.textAlign = "right";
                    ctx.textBaseline = "bottom";
                    ctx.fillText("Target: " + targetWeight + " " + unitLabel, pad.left + plotW - 4, labelY - 3);
                    ctx.restore();
                }

                // Line (trend)
                ctx.strokeStyle = "#ff7f0e";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                points.forEach((p, i) => {
                    const x = xVal(p.t);
                    const y = yVal(p.wt);
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                });
                ctx.stroke();

                // Points
                const dotR = 3.5;
                ctx.fillStyle = "#1f77b4";
                points.forEach(p => {
                    const x = xVal(p.t), y = yVal(p.wt);
                    p._px = x; p._py = y; // store for hover
                    ctx.beginPath();
                    ctx.arc(x, y, dotR, 0, Math.PI*2);
                    ctx.fill();
                });

                // Poo Sample markers along x-axis baseline (brown dots)
                if (pooPoints && pooPoints.length) {
                    const baseY = Math.max(pad.top + 6, Math.min(pad.top + plotH - 6, yVal(0) - 6)); // just above 0 line
                    ctx.fillStyle = "#8B4513"; // saddle brown
                    pooPoints.forEach(p => {
                        const x = xVal(p.t), y = baseY;
                        p._px = x; p._py = y;
                        ctx.beginPath();
                        ctx.arc(x, y, 3.5, 0, Math.PI*2);
                        ctx.fill();
                    });
                }
            };

            render_static();

            // Hover interaction
            const onMove = (ev) => {
                const rect = canvas.getBoundingClientRect();
                const mx = (ev.clientX - rect.left);
                const my = (ev.clientY - rect.top);
                // Combine candidates: weight points + poo markers
                const candidates = (points || []).map(p => ({kind:'w', p}))
                    .concat((pooPoints || []).map(p => ({kind:'poo', p})));
                const hit = candidates.reduce((acc, it) => {
                    const p = it.p; const dx = mx - p._px, dy = my - p._py; const d2 = dx*dx + dy*dy;
                    if (d2 < (acc.d2 || Infinity)) return { kind: it.kind, p, d2 };
                    return acc;
                }, {});
                const radius = 9; // px radius for hover
                if (hit.p && hit.d2 <= radius*radius) {
                    // Highlight
                    render_static();
                    ctx.save();
                    ctx.strokeStyle = "#000";
                    ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.arc(hit.p._px, hit.p._py, 6.5, 0, Math.PI*2); ctx.stroke();
                    ctx.restore();

                    // Tooltip
                    const dt = hit.p.t;
                    const dtStr = dt.getDate().toString().padStart(2,'0') + '/' + String(dt.getMonth()+1).padStart(2,'0') + '/' + String(dt.getFullYear()).slice(-2).padStart(2,'0') + ' ' + String(dt.getHours()).padStart(2,'0') + ':' + String(dt.getMinutes()).padStart(2,'0');
                    let html = '';
                    if (hit.kind === 'poo') {
                        html += '<div><b>' + this._escape(_('Poo Sample Result')) + ':</b> ' + this._escape(hit.p.result) + '</div>';
                        html += '<div><b>' + this._escape(_('Date')) + ':</b> ' + this._escape(dtStr) + '</div>';
                        if (hit.p.by) html += '<div><b>' + this._escape(_('By')) + ':</b> ' + this._escape(hit.p.by) + '</div>';
                    } else {
                        const weightText = hit.p.wt + " " + unitLabel;
                        html += '<div><b>' + this._escape(_('Weight')) + ':</b> ' + this._escape(weightText) + '</div>';
                        html += '<div><b>' + this._escape(_('Date')) + ':</b> ' + this._escape(dtStr) + '</div>';
                        if (hit.p.by) html += '<div><b>' + this._escape(_('By')) + ':</b> ' + this._escape(hit.p.by) + '</div>';
                        const keys = Object.keys(hit.p.extras || {});
                        if (keys.length) {
                            html += '<hr style="border:0;border-top:1px solid #555;margin:6px 0;">';
                            keys.forEach(k => {
                                const v = hit.p.extras[k];
                                if (v !== undefined && v !== null && String(v) !== '') {
                                    html += '<div><b>' + this._escape(k) + ':</b> ' + this._escape(String(v)) + '</div>';
                                }
                            });
                        }
                    }
                    tooltip.html(html).css({ left: (mx + 12) + 'px', top: (my + 12) + 'px' }).show();
                }
                else {
                    tooltip.hide();
                    render_static();
                }
            };
            const onLeave = () => { tooltip.hide(); };
            canvas.onmousemove = onMove.bind(this);
            canvas.onmouseleave = onLeave;
        },

        sync: function() {},
        destroy: function() {},

        name: "animal_analysis",
        animation: "formtab",
        title: function() { 
            return common.substitute(_("{0} - {1} ({2} {3} aged {4})"), { 
                0: controller.animal.ANIMALNAME, 1: controller.animal.CODE, 2: controller.animal.SEXNAME,
                3: controller.animal.SPECIESNAME, 4: controller.animal.ANIMALAGE });
        },
        routes: {
            "animal_analysis": function() { common.module_loadandstart("animal_analysis", "animal_analysis?" + this.rawqs); }
        }
    };

    common.module_register(animal_analysis);

});
