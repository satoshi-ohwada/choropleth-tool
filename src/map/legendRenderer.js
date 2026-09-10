// Map Legend Renderer
import { state } from '../core/state.js';
import { PALETTES } from '../config/palettes.js';
import { AOMORI_MUNICIPALITIES } from '../config/municipalities.js';
import { formatNumber, getEffectiveValues } from '../stats/statsEngine.js';

export function getStepIndexForValue(val) {
  if (val === undefined || val === null || isNaN(val) || typeof val !== 'number') {
    return -1;
  }
  const breaks = state.computedBreaks;
  if (!breaks || breaks.length < 2) return 0;
  const numClasses = breaks.length - 1;

  if (val <= breaks[0]) return 0;
  if (val >= breaks[numClasses]) return numClasses - 1;

  for (let i = 0; i < numClasses; i++) {
    if (i === 0) {
      if (val <= breaks[1]) return 0;
    } else {
      if (val > breaks[i] && val <= breaks[i + 1]) return i;
    }
  }
  return numClasses - 1;
}

function hexToRgb(hex) {
  let c = (hex || "#ffffff").replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  return [ (num >> 16) & 255, (num >> 8) & 255, num & 255 ];
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map(x => {
    const hex = Math.round(x).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join('');
}

function interpolateColors(color1, color2, factor) {
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);
  const r = c1[0] + factor * (c2[0] - c1[0]);
  const g = c1[1] + factor * (c2[1] - c1[1]);
  const b = c1[2] + factor * (c2[2] - c1[2]);
  return rgbToHex(r, g, b);
}

function darkenHex(hex, factor = 0.3) {
  const rgb = hexToRgb(hex || "#ffffff");
  const r = Math.max(0, Math.round(rgb[0] * (1 - factor)));
  const g = Math.max(0, Math.round(rgb[1] * (1 - factor)));
  const b = Math.max(0, Math.round(rgb[2] * (1 - factor)));
  return rgbToHex(r, g, b);
}

export function getBorderStrokeForFeature(fillColor) {
  let mode = state.strokeColor || "dark";
  if (mode === "none") {
    return { color: "transparent", weight: 0 };
  }

  if (fillColor && fillColor.startsWith("url")) {
    if (fillColor.includes("pat-7") || fillColor.includes("pat-6") || fillColor.includes("pat-5")) {
      return { color: "#ffffff", weight: 2.0 };
    }
    return { color: "#0f172a", weight: 1.8 };
  }

  if (fillColor === "transparent") {
    return { color: "#475569", weight: 1.5 };
  }

  const rgb = hexToRgb(fillColor || "#ffffff");
  const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  const isVeryDark = (lum < 60);

  if (mode === "white") {
    return { color: "#ffffff", weight: 1.8 };
  }

  if (mode === "black") {
    if (isVeryDark) {
      return { color: "#ffffff", weight: 2.0 };
    }
    return { color: "#000000", weight: 1.8 };
  }

  if (mode === "match_palette") {
    if (isVeryDark) {
      return { color: "#ffffff", weight: 2.0 };
    }
    return { color: darkenHex(fillColor, 0.4), weight: 1.6 };
  }

  if (mode === "auto") {
    if (lum < 150) {
      return { color: "#ffffff", weight: 2.0 };
    }
    return { color: "#1e293b", weight: 1.5 };
  }

  if (isVeryDark) {
    return { color: "#ffffff", weight: 2.0 };
  }
  return { color: "#334155", weight: 1.5 };
}

export function getColorForValue(val) {
  if (val === undefined || val === null || isNaN(val) || typeof val !== 'number') {
    if (val === "X") return "#cbd5e1";
    if (val === "-" || val === "…") return "#e2e8f0";
    return "#f1f5f9";
  }

  const breaks = state.computedBreaks;
  if (!breaks || breaks.length < 2) return "#f1f5f9";

  const numClasses = breaks.length - 1;
  let colors = [];

  if (state.useCustomGradient) {
    let startC = state.customStartColor || "#eff6ff";
    let endC = state.customEndColor || "#1e3a8a";
    for (let i = 0; i < numClasses; i++) {
      let factor = (numClasses === 1) ? 0.5 : (i / (numClasses - 1));
      colors.push(interpolateColors(startC, endC, factor));
    }
  } else {
    const CLASS_INDICES_7 = {
      3: [0, 3, 6],
      4: [0, 2, 4, 6],
      5: [0, 2, 3, 4, 6],
      6: [0, 1, 2, 4, 5, 6],
      7: [0, 1, 2, 3, 4, 5, 6]
    };
    let rawPalette = PALETTES[state.paletteKey] || PALETTES.blues;
    for (let i = 0; i < numClasses; i++) {
      let idx = (rawPalette.length === 7 && CLASS_INDICES_7[numClasses])
        ? CLASS_INDICES_7[numClasses][i]
        : Math.round((i / (numClasses - 1 || 1)) * (rawPalette.length - 1));
      colors.push(rawPalette[idx]);
    }
  }

  if (state.invertPalette) {
    colors = [...colors].reverse();
  }

  const stepIdx = getStepIndexForValue(val);
  if (stepIdx >= 0 && stepIdx < colors.length) {
    return colors[stepIdx];
  }
  return colors[0];
}



export function renderLegend() {
  const container = document.getElementById("legend-items-container");
  const unitEl = document.getElementById("display-legend-unit");
  const isDimensionless = (state.transformMode === "zscore" || state.transformMode === "tscore");
  if (unitEl) {
    if (isDimensionless) {
      unitEl.textContent = "";
      unitEl.style.display = "none";
    } else {
      unitEl.textContent = state.unit || "";
      unitEl.style.display = state.unit ? "inline" : "none";
    }
  }
  if (!container) return;
  container.innerHTML = "";

  const breaks = state.computedBreaks;
  if (!breaks || breaks.length < 2) {
    container.innerHTML = `<div class="text-muted p-2" style="font-size:0.8rem; text-align:center;">データ未読み込み</div>`;
    const noteEl = document.getElementById("legend-method-note");
    if (noteEl) {
      noteEl.style.display = "none";
      noteEl.textContent = "";
    }
    return;
  }

  const numClasses = breaks.length - 1;
  const classCounts = Array(numClasses).fill(0);
  const effVals = getEffectiveValues();

  Object.values(effVals).forEach(v => {
    if (typeof v === 'number' && !isNaN(v)) {
      const stepIdx = getStepIndexForValue(v);
      if (stepIdx >= 0 && stepIdx < numClasses) {
        classCounts[stepIdx]++;
      }
    }
  });

  for (let i = 0; i < numClasses; i++) {
    let bMin = breaks[i];
    let bMax = breaks[i + 1];

    let strMin = formatNumber(bMin);
    let strMax = formatNumber(bMax);
    let rangeLabel = (bMin === bMax) ? strMin : `${strMin} ～ ${strMax}`;
    let midVal = (bMin + bMax) / 2;
    let color = getColorForValue(midVal);
    let count = classCounts[i];

    let itemDiv = document.createElement("div");
    itemDiv.className = "legend-item";
    itemDiv.innerHTML = `
      <div class="legend-swatch-label">
        <span class="legend-swatch" style="overflow:hidden;">
          <svg width="100%" height="100%" style="display:block;"><rect width="100%" height="100%" fill="${color}" /></svg>
        </span>
        <span class="legend-range-text">${rangeLabel}</span>
      </div>
      <span class="legend-count-badge">${count}</span>
    `;
    container.appendChild(itemDiv);
  }

  let confidentialCount = 0;
  let missingCount = 0;
  let unenteredCount = 0;

  AOMORI_MUNICIPALITIES.forEach(m => {
    let v = effVals[m.name];
    if (v === "X") {
      confidentialCount++;
    } else if (v === "-" || v === "…") {
      missingCount++;
    } else if (v === undefined || v === null || isNaN(v) || typeof v !== 'number') {
      unenteredCount++;
    }
  });

  if (confidentialCount > 0 || missingCount > 0 || (unenteredCount > 0 && unenteredCount < 40)) {
    let divider = document.createElement("div");
    divider.className = "legend-divider";
    container.appendChild(divider);

    const appendSpecialLegend = (label, color, count, hasBorderDash = true) => {
      let itemDiv = document.createElement("div");
      itemDiv.className = "legend-item legend-item-special";
      itemDiv.innerHTML = `
        <div class="legend-swatch-label">
          <span class="legend-swatch" style="border: 1px ${hasBorderDash ? 'dashed' : 'solid'} #94a3b8; overflow:hidden;">
            <svg width="100%" height="100%" style="display:block;"><rect width="100%" height="100%" fill="${color}" /></svg>
          </span>
          <span class="legend-range-text">${label}</span>
        </div>
        <span class="legend-count-badge special">${count}</span>
      `;
      container.appendChild(itemDiv);
    };

    if (confidentialCount > 0) appendSpecialLegend("秘匿 (X)", "#cbd5e1", confidentialCount, true);
    if (missingCount > 0) appendSpecialLegend("欠測・該当なし", "#e2e8f0", missingCount, true);
    if (unenteredCount > 0 && unenteredCount < 40) appendSpecialLegend("未入力", "#f1f5f9", unenteredCount, false);
  }

  const noteEl = document.getElementById("legend-method-note");
  if (noteEl) {
    noteEl.style.display = "flex";

    let binText = "";
    if (state.binningMode === "jenks") {
      binText = `階級区分: Jenks自然分類法（${numClasses}段階）`;
    } else if (state.binningMode === "quantile") {
      binText = `階級区分: 分位数（${numClasses}段階）`;
    } else if (state.binningMode === "equal") {
      binText = `階級区分: 等間隔（${numClasses}段階）`;
    } else {
      binText = `階級区分: 手動指定（カスタム ${numClasses}段階）`;
    }

    let modeText = "";
    if (state.isPerCapitaMode || state.transformMode === "per_capita") {
      const mult = state.perCapitaMultiplier || 100;
      let pLabel = mult === 100 ? "100人あたり(％)" : (mult === 1000 ? "1,000人あたり" : (mult === 1 ? "1人あたり" : `${mult.toLocaleString()}人あたり`));
      modeText = `分析モード: 人口${pLabel}`;
    } else if (state.transformMode === "zscore") {
      modeText = "分析モード: Zスコア（平均=0, SD=1）";
    } else if (state.transformMode === "tscore") {
      modeText = "分析モード: 偏差値（平均=50, SD=10）";
    }

    if (modeText) {
      noteEl.innerHTML = `<div>※${modeText}</div><div>※${binText}</div>`;
    } else {
      noteEl.innerHTML = `<div>※${binText}</div>`;
    }
  }
}
