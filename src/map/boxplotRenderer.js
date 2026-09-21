// Box Plot (箱ひげ図) Overlay Renderer - Restored to exact pre-modular shape
import { state } from '../core/state.js';
import { getEffectiveValues, calculateStats, formatNumber } from '../stats/statsEngine.js';
import { getColorForValue } from './legendRenderer.js';

export function updateBoxplotPosition() {
  const boxplotBox = document.getElementById("map-boxplot");
  if (!boxplotBox) return;

  let pos = state.boxplotPosition;
  if (pos === "auto") {
    if (state.legendPosition && state.legendPosition.includes("right")) {
      pos = "leftmiddle";
    } else {
      pos = "rightmiddle";
    }
  }

  boxplotBox.className = `map-boxplot-box position-${pos}${state.showBoxplot ? "" : " hidden"}`;
}

export function renderBoxPlot() {
  const boxplotBox = document.getElementById("map-boxplot");
  const svg = document.getElementById("boxplot-svg");
  const statBadge = document.getElementById("display-boxplot-stat");
  const summaryEl = document.getElementById("boxplot-legend-summary");
  if (!boxplotBox || !svg) return;

  if (!state.showBoxplot) {
    boxplotBox.classList.add("hidden");
    return;
  } else {
    boxplotBox.classList.remove("hidden");
  }

  updateBoxplotPosition();

  const effectiveVals = getEffectiveValues();
  const stats = calculateStats(effectiveVals);

  if (stats.count < 3) {
    svg.innerHTML = `<text x="80" y="105" text-anchor="middle" font-size="11" fill="#94a3b8">データ不足</text>`;
    if (statBadge) statBadge.textContent = "未入力";
    if (summaryEl) summaryEl.innerHTML = `<span>最小: -</span><span>中央: -</span><span>最大: -</span>`;
    return;
  }

  const sorted = stats.sorted;
  const nums = stats.numList;
  const n = stats.count;
  const min = stats.min[1];
  const max = stats.max[1];
  const q1 = stats.q1;
  const median = stats.median;
  const q3 = stats.q3;
  const iqr = stats.iqr || 1;
  const mean = stats.mean;

  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;

  let lowerWhisker = min;
  for (let i = 0; i < n; i++) {
    if (nums[i] >= lowerFence) {
      lowerWhisker = nums[i];
      break;
    }
  }
  let upperWhisker = max;
  for (let i = n - 1; i >= 0; i--) {
    if (nums[i] <= upperFence) {
      upperWhisker = nums[i];
      break;
    }
  }

  if (statBadge) {
    statBadge.textContent = `中: ${formatNumber(median)}`;
    statBadge.title = `中央値: ${median.toLocaleString()}`;
  }
  if (summaryEl) {
    summaryEl.innerHTML = `
      <span title="最小値: ${min.toLocaleString()}">最小: <b>${formatNumber(min)}</b></span>
      <span class="stat-med" title="中央値: ${median.toLocaleString()}">中: <b>${formatNumber(median)}</b></span>
      <span title="最大値: ${max.toLocaleString()}">最大: <b>${formatNumber(max)}</b></span>
    `;
  }

  const topY = 16;
  const bottomY = 178;
  const plotH = bottomY - topY;
  const valRange = (max - min) || 1;
  const y = (v) => bottomY - ((v - min) / valRange) * plotH;

  let svgHtml = "";

  // 0. 縦の基準軸線（x=34）
  svgHtml += `<line x1="34" y1="${topY}" x2="34" y2="${bottomY}" stroke="#e2e8f0" stroke-width="1" />`;

  // 1. カラーパレットの階級区分カラーバー（x=78〜84）
  const breaks = state.computedBreaks;
  if (breaks && breaks.length >= 2) {
    svgHtml += `<g class="boxplot-color-strip">`;
    for (let i = 0; i < breaks.length - 1; i++) {
      let b1 = Math.max(min, Math.min(max, breaks[i]));
      let b2 = Math.max(min, Math.min(max, breaks[i + 1]));
      let yTop = y(b2);
      let yBot = y(b1);
      let h = Math.max(1, yBot - yTop);
      let midVal = (b1 + b2) / 2;
      let col = getColorForValue(midVal);
      svgHtml += `<rect x="78" y="${yTop.toFixed(1)}" width="6" height="${h.toFixed(1)}" fill="${col}" opacity="0.85" rx="1.2" />`;
    }
    svgHtml += `</g>`;
  }

  // 2. 箱ひげ図本体（x=40〜72, 中心 x=56, 幅=32）
  const boxLeft = 40;
  const boxRight = 72;
  const boxCenter = 56;
  const boxWidth = 32;

  const yMin = y(lowerWhisker);
  const yMax = y(upperWhisker);
  const yQ1 = y(q1);
  const yQ3 = y(q3);
  const yMed = y(median);
  const yMean = y(mean);

  // 下ひげ線 & 端バー
  svgHtml += `
    <!-- Lower Whisker -->
    <line x1="${boxCenter}" y1="${yQ1.toFixed(1)}" x2="${boxCenter}" y2="${yMin.toFixed(1)}" stroke="#64748b" stroke-width="1.3" stroke-dasharray="2.5 2" />
    <line x1="${boxCenter - 8}" y1="${yMin.toFixed(1)}" x2="${boxCenter + 8}" y2="${yMin.toFixed(1)}" stroke="#64748b" stroke-width="1.3" />
    
    <!-- Upper Whisker -->
    <line x1="${boxCenter}" y1="${yQ3.toFixed(1)}" x2="${boxCenter}" y2="${yMax.toFixed(1)}" stroke="#64748b" stroke-width="1.3" stroke-dasharray="2.5 2" />
    <line x1="${boxCenter - 8}" y1="${yMax.toFixed(1)}" x2="${boxCenter + 8}" y2="${yMax.toFixed(1)}" stroke="#64748b" stroke-width="1.3" />
  `;

  // 箱（IQR）
  const boxH = Math.max(2, yQ1 - yQ3);
  svgHtml += `
    <!-- Box (IQR) -->
    <rect x="${boxLeft}" y="${yQ3.toFixed(1)}" width="${boxWidth}" height="${boxH.toFixed(1)}" fill="#f8fafc" stroke="#334155" stroke-width="1.3" rx="2.5" />
  `;

  // 中央値（赤ライン）
  svgHtml += `
    <!-- Median Line -->
    <line x1="${boxLeft}" y1="${yMed.toFixed(1)}" x2="${boxRight}" y2="${yMed.toFixed(1)}" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round" />
  `;

  // 平均値（青◆マーカー）
  svgHtml += `
    <!-- Mean Diamond -->
    <polygon points="${boxCenter},${(yMean - 3.5).toFixed(1)} ${boxCenter + 3.5},${yMean.toFixed(1)} ${boxCenter},${(yMean + 3.5).toFixed(1)} ${boxCenter - 3.5},${yMean.toFixed(1)}" fill="#2563eb" stroke="#ffffff" stroke-width="0.8" />
  `;

  // 3. 全自治体のジッタードット（x=97〜115）
  svgHtml += `<g class="boxplot-dots">`;
  sorted.forEach((entry, idx) => {
    let muniName = entry[0];
    let val = entry[1];
    let cy = y(val);
    let jitter = ((idx * 37) % 18) - 9;
    let cx = 106 + jitter;
    let color = getColorForValue(val);
    let isOutlier = (val < lowerWhisker || val > upperWhisker);

    svgHtml += `
      <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${isOutlier ? '3.0' : '2.0'}"
              fill="${color}" stroke="${isOutlier ? '#dc2626' : '#ffffff'}" stroke-width="${isOutlier ? '1.2' : '0.6'}"
              opacity="0.85" style="cursor:pointer;"
              data-name="${muniName}" data-val="${val}">
        <title>${muniName}: ${val.toLocaleString()}${isOutlier ? ' (外れ値)' : ''}</title>
      </circle>
    `;
  });
  svgHtml += `</g>`;

  // 4. 左側の目盛りラベル
  svgHtml += `
    <!-- Axis labels -->
    <text x="30" y="${Math.min(topY + 3, y(max) + 3).toFixed(1)}" text-anchor="end" font-size="7.5" fill="#64748b" font-weight="600">${formatNumber(max)}</text>
    <text x="30" y="${Math.max(bottomY - 2, y(min) + 3).toFixed(1)}" text-anchor="end" font-size="7.5" fill="#64748b" font-weight="600">${formatNumber(min)}</text>
  `;

  // 5. ホバー時のハイライトグループ
  svgHtml += `<g id="boxplot-hover-group" style="display:none; pointer-events:none;"></g>`;

  svg.innerHTML = svgHtml;

  svg.querySelectorAll("circle[data-name]").forEach(c => {
    c.addEventListener("mouseenter", (e) => {
      let name = e.target.getAttribute("data-name");
      let val = parseFloat(e.target.getAttribute("data-val"));
      setBoxplotHover(name, val);
    });
    c.addEventListener("mouseleave", () => {
      clearBoxplotHover();
    });
  });

  if (state.hoveredMunicipality && effectiveVals[state.hoveredMunicipality] !== undefined) {
    setBoxplotHover(state.hoveredMunicipality, effectiveVals[state.hoveredMunicipality]);
  }
}

export function setBoxplotHover(muniName, val) {
  const hoverGroup = document.getElementById("boxplot-hover-group");
  if (!hoverGroup) return;

  const effectiveVals = getEffectiveValues();
  const nums = Object.values(effectiveVals).filter(v => typeof v === "number" && !isNaN(v));
  if (nums.length === 0) return;

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const topY = 16;
  const bottomY = 178;
  const plotH = bottomY - topY;
  const valRange = (max - min) || 1;
  const cy = bottomY - ((val - min) / valRange) * plotH;

  let hoverStr = `${muniName} ${formatNumber(val)}`;
  let badgeW = Math.min(68, Math.max(52, hoverStr.length * 5.8 + 8));

  hoverGroup.style.display = "block";
  hoverGroup.innerHTML = `
    <line x1="2" y1="${cy.toFixed(1)}" x2="128" y2="${cy.toFixed(1)}" stroke="#0284c7" stroke-width="1.5" stroke-dasharray="2 2" />
    <rect x="2" y="${(cy - 8).toFixed(1)}" width="${badgeW}" height="16" fill="#0284c7" rx="2.5" />
    <text x="${(2 + badgeW / 2).toFixed(1)}" y="${(cy + 3).toFixed(1)}" fill="#ffffff" font-size="7.5" font-weight="700" text-anchor="middle">
      ${hoverStr}
    </text>
  `;
}

export function clearBoxplotHover() {
  const hoverGroup = document.getElementById("boxplot-hover-group");
  if (hoverGroup) {
    hoverGroup.style.display = "none";
    hoverGroup.innerHTML = "";
  }
}
