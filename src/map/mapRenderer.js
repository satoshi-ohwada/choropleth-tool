// Leaflet Map Setup & Layer Renderer
import { state } from '../core/state.js';
import { AOMORI_MUNICIPALITIES, REGION_BOUNDS } from '../config/municipalities.js';
import { normalizeName } from '../parsers/muniMatcher.js';
import { isNumericValue, isSpecialValue, getSpecialValueLabel, getContrastingTextColor } from '../parsers/numberParser.js';
import { getEffectiveValues, getJenksBreaks, computeQuantileBreaks, formatNumber, getEffectiveUnit, updateStatsSummary } from '../stats/statsEngine.js';
import { getColorForValue, getBorderStrokeForFeature, renderLegend } from './legendRenderer.js';
import { setBoxplotHover, clearBoxplotHover, renderBoxPlot } from './boxplotRenderer.js';
import { renderBubbleLayer } from './bubbleLayer.js';
import inlineGeojsonRaw from '../../public/data/aomori_municipalities.geojson?raw';
const inlineGeojsonData = JSON.parse(inlineGeojsonRaw);

function hexToRgb(hex) {
  let c = (hex || "#ffffff").replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  return [ (num >> 16) & 255, (num >> 8) & 255, num & 255 ];
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map(x => {
    const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join('');
}

export function computeBreaks() {
  const vals = Object.values(getEffectiveValues())
    .filter(v => typeof v === 'number' && !isNaN(v));

  if (vals.length === 0) {
    state.computedBreaks = [];
    return;
  }

  const min = Math.min(...vals);
  const max = Math.max(...vals);

  if (min === max) {
    state.computedBreaks = [min, max + 1];
    return;
  }

  if (state.binningMode === "custom" && state.customBreaks && state.customBreaks.length > 0) {
    let b = [...state.customBreaks].sort((a, b) => a - b);
    if (b[0] > min) b.unshift(min);
    if (b[b.length - 1] < max) b.push(max);
    state.computedBreaks = b;
    return;
  }

  const k = parseInt(state.stepCount || state.numClasses || 5, 10);
  state.computedBreaks = [];

  if (state.binningMode === "jenks") {
    state.computedBreaks = getJenksBreaks(vals, k);
  } else if (state.binningMode === "quantile") {
    state.computedBreaks = computeQuantileBreaks(vals, k);
  } else {
    // Equal Interval (default)
    let step = (max - min) / k;
    for (let i = 0; i <= k; i++) {
      if (i === 0) {
        state.computedBreaks.push(min);
      } else if (i === k) {
        state.computedBreaks.push(max);
      } else {
        state.computedBreaks.push(min + step * i);
      }
    }
  }
}

export function initMainMap() {
  if (state.leafletMap || typeof L === 'undefined') return;

  const mapEl = document.getElementById("leaflet-map");
  if (!mapEl) return;

  state.leafletMap = L.map("leaflet-map", {
    zoomControl: false,
    attributionControl: false,
    center: [40.82, 140.75],
    zoom: 8.8,
    zoomSnap: 0.1,
    dragging: true,
    scrollWheelZoom: true,
    doubleClickZoom: true
  });

  state.leafletMap.on('click', () => {
    state.hoveredMunicipality = null;
    if (typeof clearBoxplotHover === "function") {
      clearBoxplotHover();
    }
  });

  let zoomTimeout;
  state.leafletMap.on('zoomend', () => {
    clearTimeout(zoomTimeout);
    zoomTimeout = setTimeout(() => {
      if (state.mapRenderMode === "bubble") {
        renderBubbleLayer();
      } else if (state.labelMode !== "none") {
        renderLabelsLayer();
      }
    }, 200);
  });

  L.control.zoom({ position: 'topleft' }).addTo(state.leafletMap);
}

export function initMiniMap() {
  if (state.miniMap || typeof L === 'undefined') return;
  const miniEl = document.getElementById("step1-mini-map");
  if (!miniEl) return;

  state.miniMap = L.map("step1-mini-map", {
    zoomControl: false,
    attributionControl: false,
    center: [40.92, 140.75],
    zoom: 8.2,
    zoomSnap: 0.1,
    dragging: true,
    scrollWheelZoom: false,
    doubleClickZoom: false
  });

  renderMiniMapLayer();
}

export function renderMiniMapLayer() {
  if (!state.miniMap || !state.geojsonData || typeof L === 'undefined') return;

  if (state.miniMapLayer) {
    state.miniMap.removeLayer(state.miniMapLayer);
  }

  computeBreaks();

  let values = getEffectiveValues();
  const v = state.variables[state.activeVariableKey];

  let modeSuffix = "";
  if (state.transformMode === "per_capita" || state.isPerCapitaMode) {
    const mult = state.perCapitaMultiplier || 100;
    modeSuffix = mult === 100 ? " / 100人あたり" : (mult === 1000 ? " / 1,000人あたり" : (mult === 1 ? " / 1人あたり" : ` / ${mult}人あたり`));
  } else if (state.transformMode === "zscore") {
    modeSuffix = " / Zスコア";
  } else if (state.transformMode === "tscore") {
    modeSuffix = " / 偏差値";
  }

  const lbl = document.getElementById("mini-map-variable-label");
  if (lbl) {
    lbl.textContent = v ? `(${v.name}${modeSuffix})` : (modeSuffix ? `(${modeSuffix.replace(/^\s*\/\s*/, '')})` : "(データ未選択)");
  }

  state.miniMapLayer = L.geoJSON(state.geojsonData, {
    style: (feature) => {
      let rawName = feature.properties.name || feature.properties.N03_004;
      let matchedName = normalizeName(rawName) || rawName;
      let val = values[matchedName];
      let color = getColorForValue(val);
      let strokeStyle = getBorderStrokeForFeature(color);

      return {
        fillColor: color,
        fillOpacity: 0.85,
        color: strokeStyle.color,
        weight: Math.max(0.5, strokeStyle.weight * 0.7),
        opacity: strokeStyle.opacity !== undefined ? strokeStyle.opacity : 0.9,
        stroke: true
      };
    },
    onEachFeature: (feature, layer) => {
      let rawName = feature.properties.name || feature.properties.N03_004;
      let matchedName = normalizeName(rawName) || rawName;
      let val = values[matchedName];
      let hasVal = isNumericValue(val);
      let isSpecial = isSpecialValue(val);
      let displayVal = hasVal 
        ? `${val.toLocaleString()} ${state.unit || ""}` 
        : (isSpecial ? `<span style="color:#f59e0b; font-weight:700;">${getSpecialValueLabel(val)}</span>` : "データなし");

      layer.bindTooltip(`
        <div style="font-weight:700; font-size:0.85rem;">${matchedName}</div>
        <div style="color:#60a5fa; font-size:0.78rem;">${displayVal}</div>
      `, { sticky: true });

      layer.on("click", () => {
        const tr = document.querySelector(`.data-table tbody tr[data-name="${matchedName}"]`);
        if (tr) {
          tr.scrollIntoView({ behavior: "smooth", block: "center" });
          const input = tr.querySelector(".cell-val-input");
          if (input) {
            input.focus();
            input.style.transition = "background 0.3s";
            input.style.backgroundColor = "#fef08a";
            setTimeout(() => {
              input.style.backgroundColor = "";
            }, 1200);
          }
        }
      });
    }
  }).addTo(state.miniMap);

  renderMiniMapLegend();
}

export function renderMiniMapLegend() {
  const legendEl = document.getElementById("mini-map-legend-bar");
  if (!legendEl) return;

  const breaks = state.computedBreaks;
  if (!breaks || breaks.length < 2) {
    legendEl.innerHTML = `<span class="text-muted">（凡例未生成）</span>`;
    return;
  }

  const numClasses = breaks.length - 1;
  let items = [];
  for (let i = 0; i < numClasses; i++) {
    let valLow = breaks[i];
    let color = getColorForValue(valLow);
    items.push(`<span style="background:${color}; flex:1; height:12px; border-radius:2px; border:1px solid rgba(0,0,0,0.15);" title="${valLow.toFixed(1)}"></span>`);
  }

  legendEl.innerHTML = `<div class="d-flex align-items-center gap-1 w-100 mb-1">${items.join("")}</div>
    <div class="d-flex justify-content-between text-muted" style="font-size:0.7rem;">
      <span>${breaks[0].toLocaleString(undefined, {maximumFractionDigits:1})}</span>
      <span>${breaks[breaks.length - 1].toLocaleString(undefined, {maximumFractionDigits:1})}</span>
    </div>`;
}

export function loadGeoJSONData() {
  return Promise.resolve(inlineGeojsonData)
    .then(data => {
      state.geojsonData = data;
      calculateCentroids(data);
      initMiniMap();
      renderMiniMapLayer();
      renderGeoJSONLayer();
      return data;
    });
}

function calculateCentroids(geojson) {
  state.dynamicCentroids = {};
  
  // 1. マスター定義の代表座標（役場所在地・中心市街地）を最優先で代入（飛び地対策）
  AOMORI_MUNICIPALITIES.forEach(m => {
    if (m.center && Array.isArray(m.center) && m.center.length === 2) {
      state.dynamicCentroids[m.name] = [m.center[0], m.center[1]];
    }
  });

  // 2. 未定義の自治体があればGeoJSONの外接矩形中心でフォールバック
  if (geojson && geojson.features) {
    geojson.features.forEach(f => {
      let rawName = f.properties.name || f.properties.N03_004;
      let matchedName = normalizeName(rawName) || rawName;
      if (!state.dynamicCentroids[matchedName]) {
        let layer = L.geoJSON(f);
        let bounds = layer.getBounds();
        let center = bounds.getCenter();
        state.dynamicCentroids[matchedName] = [center.lat, center.lng];
      }
    });
  }
}

export function updateMapTransformModeBadge() {
  const badgeEl = document.getElementById("display-map-mode-tag");
  if (!badgeEl) return;

  const isPerCapita = (state.isPerCapitaMode || state.transformMode === "per_capita") && (state.perCapitaMultiplier > 0);
  const stdMode = state.standardizeMode || (state.transformMode === "zscore" ? "zscore" : (state.transformMode === "tscore" ? "tscore" : "none"));

  let pLabel = "";
  if (isPerCapita) {
    const mult = state.perCapitaMultiplier || 100;
    if (mult === 100) pLabel = "人口100人あたり ％";
    else if (mult === 1000) pLabel = "人口1,000人あたり";
    else if (mult === 1) pLabel = "人口1人あたり";
    else pLabel = `人口${mult.toLocaleString()}人あたり`;
  }

  let label = "（実測値）";
  if (stdMode === "zscore") {
    label = pLabel ? `（${pLabel}・Zスコア偏差）` : "（Zスコア標準化偏差）";
  } else if (stdMode === "tscore") {
    label = pLabel ? `（${pLabel}・偏差値 Tスコア）` : "（偏差値 Tスコア）";
  } else if (pLabel) {
    label = `（${pLabel}）`;
  }

  badgeEl.textContent = label;
}

export function renderGeoJSONLayer() {
  updateMapTransformModeBadge();
  if (!state.leafletMap || !state.geojsonData || typeof L === 'undefined') return;

  computeBreaks();

  if (state.geojsonLayer) {
    state.leafletMap.removeLayer(state.geojsonLayer);
  }

  let effectiveVals = getEffectiveValues();

  state.geojsonLayer = L.geoJSON(state.geojsonData, {
    style: (feature) => {
      let rawName = feature.properties.name || feature.properties.N03_004;
      let matchedName = normalizeName(rawName) || rawName;
      let val = effectiveVals[matchedName];
      let fillColor = getColorForValue(val);
      let strokeInfo = getBorderStrokeForFeature(fillColor);
      let isSpecial = isSpecialValue(val);

      if (state.mapRenderMode === "bubble") {
        return {
          fillColor: "#f1f5f9",
          fillOpacity: 0.85,
          color: "#94a3b8",
          weight: 1.0,
          opacity: 0.65,
          dashArray: null
        };
      }

      return {
        fillColor: fillColor,
        fillOpacity: isSpecial ? 0.95 : 0.92,
        color: isSpecial ? "#64748b" : strokeInfo.color,
        weight: strokeInfo.weight,
        opacity: parseFloat(state.strokeOpacity !== undefined ? state.strokeOpacity : 0.9),
        dashArray: isSpecial ? "3,3" : null
      };
    },
    onEachFeature: (feature, layer) => {
      let rawName = feature.properties.name || feature.properties.N03_004;
      let matchedName = normalizeName(rawName) || rawName;
      let val = effectiveVals[matchedName];
      let rawVal = state.currentValues ? state.currentValues[matchedName] : undefined;
      let hasVal = isNumericValue(val);
      let isSpecial = isSpecialValue(val);

      let displayVal = "";
      let extraInfo = "";

      if (hasVal) {
        displayVal = `${val.toLocaleString()} <small style="color:#cbd5e1">${getEffectiveUnit()}</small>`;
        if (state.transformMode === "zscore" || state.transformMode === "tscore") {
          const v = state.variables[state.activeVariableKey];
          const rawUnit = v && v.unit ? v.unit.replace(/^単位[：:]\s*/, "").trim() : "";
          const unitSuffix = rawUnit ? ` ${rawUnit}` : "";
          extraInfo = `<div style="color:#cbd5e1; font-size:0.75rem; margin-top:2px;">(実測値: ${rawVal !== undefined ? rawVal.toLocaleString() + unitSuffix : 'なし'})</div>`;
        }
      } else if (isSpecial) {
        let spLabel = getSpecialValueLabel(val);
        displayVal = `<span style="color:#f59e0b; font-weight:700;">${spLabel}</span>`;
        extraInfo = `<div style="color:#94a3b8; font-size:0.75rem; margin-top:2px;">※ 統計集計対象外</div>`;
      } else {
        displayVal = `<span style="color:#94a3b8;">未入力</span>`;
      }

      layer.bindTooltip(`
        <div style="font-weight:700; font-size:0.9rem;">${matchedName}</div>
        <div style="color:#60a5fa; font-size:0.85rem; margin-top:2px;">
          ${displayVal}
        </div>
        ${extraInfo}
      `, { sticky: true, direction: 'top', offset: [0, -10] });

      layer.on({
        mouseover: (e) => {
          let l = e.target;
          let currentWeight = (l.options && l.options.weight) || 1.2;
          l.setStyle({
            weight: currentWeight + 2,
            color: "#38bdf8",
            fillOpacity: 1.0
          });
          l.bringToFront();
          state.hoveredMunicipality = matchedName;
          if (hasVal && typeof setBoxplotHover === "function") {
            setBoxplotHover(matchedName, val);
          }
        },
        mouseout: (e) => {
          if (state.geojsonLayer) state.geojsonLayer.resetStyle(e.target);
          state.hoveredMunicipality = null;
          if (typeof clearBoxplotHover === "function") {
            clearBoxplotHover();
          }
        },
        click: () => {
          const tr = document.querySelector(`.data-table tbody tr[data-name="${matchedName}"]`);
          if (tr) {
            tr.scrollIntoView({ behavior: "smooth", block: "center" });
            const input = tr.querySelector(".cell-val-input");
            if (input) {
              input.focus();
              input.style.transition = "background 0.3s";
              input.style.backgroundColor = "#fef08a";
              setTimeout(() => {
                input.style.backgroundColor = "";
              }, 1200);
            }
          }
        }
      });
    }
  }).addTo(state.leafletMap);

  if (state.outerBorderLayer) {
    state.leafletMap.removeLayer(state.outerBorderLayer);
    state.outerBorderLayer = null;
  }

  if (state.showOuterBorder && state.geojsonData) {
    state.outerBorderLayer = L.geoJSON(state.geojsonData, {
      style: {
        color: "#0f172a",
        weight: 2.2,
        fill: false,
        opacity: 0.95
      },
      interactive: false
    }).addTo(state.leafletMap);
  }

  if (state.mapRenderMode === "bubble") {
    if (state.labelGroup) state.labelGroup.clearLayers();
    try { renderBubbleLayer(); } catch (e) { console.error("renderBubbleLayer error:", e); }
  } else {
    if (state.bubbleGroup) state.bubbleGroup.clearLayers();
    try { renderLabelsLayer(); } catch (e) { console.error("renderLabelsLayer error:", e); }
  }

  try { renderLegend(); } catch (e) { console.error("renderLegend error:", e); }
  try { updateStatsSummary(); } catch (e) { console.error("updateStatsSummary error:", e); }
  try { renderMiniMapLayer(); } catch (e) { console.error("renderMiniMapLayer error:", e); }
}

export function renderLabelsLayer() {
  if (!state.leafletMap || !state.dynamicCentroids || Object.keys(state.dynamicCentroids).length === 0) return;

  if (!state.labelGroup) {
    state.labelGroup = L.layerGroup().addTo(state.leafletMap);
  }
  state.labelGroup.clearLayers();

  if (state.labelMode === "none") return;

  const CITIES_LIST = ["青森市", "弘前市", "八戸市", "黒石市", "五所川原市", "十和田市", "三沢市", "むつ市", "つがる市", "平川市"];
  const isCitiesOnly = (state.labelMode === "cities_only");
  const isCompact = (state.labelMode === "compact");
  let labels = [];

  const effectiveVals = getEffectiveValues();

  AOMORI_MUNICIPALITIES.forEach(m => {
    if (isCitiesOnly && !CITIES_LIST.includes(m.name)) return;

    let centroid = state.dynamicCentroids[m.name];
    if (!centroid) return;

    let val = effectiveVals[m.name];
    let hasVal = isNumericValue(val);
    let isSpecial = isSpecialValue(val);
    let shortVal = hasVal ? formatNumber(val) : (isSpecial ? val : "");
    let nameOnly = (state.labelContent === "name_only" || (!hasVal && !isSpecial));

    let labelHTML = "";
    let w = 40;
    let h = 20;

    if (isCompact) {
      if (nameOnly) {
        labelHTML = `<div class="static-label-compact">${m.name}</div>`;
        w = Math.round(m.name.length * 11 + 8);
        h = 17;
      } else {
        let spClass = isSpecial ? ' class="special-val"' : '';
        labelHTML = `<div class="static-label-compact">${m.name}<span${spClass}>${shortVal}</span></div>`;
        w = Math.round((m.name.length + shortVal.length) * 8.5 + 10);
        h = 18;
      }
    } else {
      if (nameOnly) {
        labelHTML = `<div class="static-label-name">${m.name}</div>`;
        w = Math.round(m.name.length * 12 + 10);
        h = 22;
      } else {
        let valClass = isSpecial ? "static-label-val special-val" : "static-label-val";
        labelHTML = `<div class="static-label-name">${m.name}</div><div class="${valClass}">${shortVal}</div>`;
        let maxLen = Math.max(m.name.length, String(shortVal).length);
        w = Math.round(maxLen * 11.5 + 12);
        h = 30;
      }
    }

    let pt = state.leafletMap.latLngToLayerPoint(centroid);
    labels.push({
      name: m.name,
      latlng: centroid,
      x: pt.x,
      y: pt.y,
      origX: pt.x,
      origY: pt.y,
      w: w,
      h: h,
      html: labelHTML
    });
  });

  const ITERATIONS = 35;
  const SPRING = isCompact ? 0.28 : 0.22;
  const maxOffset = isCompact ? 14 : 25;
  const REPULSION_BASE = isCompact ? 0.35 : 0.45;

  for (let i = 0; i < ITERATIONS; i++) {
    let temp = Math.pow(1.0 - (i / ITERATIONS), 1.2);

    for (let a = 0; a < labels.length; a++) {
      for (let b = a + 1; b < labels.length; b++) {
        let la = labels[a];
        let lb = labels[b];

        let dx = la.x - lb.x;
        let dy = la.y - lb.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        let minDistX = (la.w + lb.w) / 2 + 3;
        let minDistY = (la.h + lb.h) / 2 + 3;

        if (Math.abs(dx) < minDistX && Math.abs(dy) < minDistY) {
          if (dist === 0) {
            dx = (Math.random() - 0.5);
            dy = (Math.random() - 0.5);
            dist = Math.sqrt(dx * dx + dy * dy) || 1;
          }
          let overlapX = minDistX - Math.abs(dx);
          let overlapY = minDistY - Math.abs(dy);
          let pushX = (dx / dist) * REPULSION_BASE * overlapX * temp;
          let pushY = (dy / dist) * REPULSION_BASE * overlapY * temp;
          la.x += pushX;
          la.y += pushY;
          lb.x -= pushX;
          lb.y -= pushY;
        }
      }
    }

    labels.forEach(l => {
      l.x += (l.origX - l.x) * SPRING;
      l.y += (l.origY - l.y) * SPRING;

      let offX = l.x - l.origX;
      let offY = l.y - l.origY;
      let distFromOrig = Math.sqrt(offX * offX + offY * offY);
      if (distFromOrig > maxOffset) {
        let scale = maxOffset / distFromOrig;
        l.x = l.origX + offX * scale;
        l.y = l.origY + offY * scale;
      }
    });
  }

  labels.forEach(l => {
    let finalPt = L.point(l.x, l.y);
    let targetPos = state.leafletMap.layerPointToLatLng(finalPt);

    let distFromOrig = Math.sqrt(Math.pow(l.x - l.origX, 2) + Math.pow(l.y - l.origY, 2));
    let showLeader = (!isCompact && distFromOrig >= 16);

    if (showLeader) {
      L.polyline([l.latlng, targetPos], {
        color: "#475569",
        weight: 1.2,
        opacity: 0.75,
        dashArray: "2,2",
        interactive: false
      }).addTo(state.labelGroup);
    }

    let cardClass = isCompact 
      ? "static-marker-card compact" 
      : (showLeader ? "static-marker-card leader-offset" : "static-marker-card");

    let icon = L.divIcon({
      className: "static-map-marker",
      html: `<div class="${cardClass}">${l.html}</div>`,
      iconSize: [l.w, l.h],
      iconAnchor: [l.w / 2, l.h / 2]
    });
    L.marker(targetPos, { icon: icon, interactive: false }).addTo(state.labelGroup);
  });
}

export { initMainMap as initLeafletMap };

