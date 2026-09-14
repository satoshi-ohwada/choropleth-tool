// A4 Analysis Report Generator (PDF / Print) Engine
import { state } from '../core/state.js';
import { getEffectiveValues, calculateStats, formatNumber, computePercentile } from '../stats/statsEngine.js';
import { generateMapPNGData } from './imageExporter.js';
import { showToast } from '../ui/toast.js';
import { getColorForValue } from '../map/legendRenderer.js';

export function setPrintPageOrientation(orientation) {
  const styleEl = document.getElementById("print-page-style");
  if (styleEl) {
    if (orientation === "portrait") {
      styleEl.textContent = "@page { size: A4 portrait; margin: 10mm 8mm; }";
    } else {
      styleEl.textContent = "@page { size: A4 landscape; margin: 8mm 10mm; }";
    }
  }
}

function buildReportDistributionSVG(nums, min, mean, median, max, width = 530, height = 118, unitStr = "", formatValFn = null) {
  if (!nums || nums.length < 3) {
    return `<svg width="${width}" height="${height}"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="10" fill="#94a3b8">データ不足（3件以上必要）</text></svg>`;
  }
  const valFmt = typeof formatValFn === "function" ? formatValFn : formatNumber;
  const n = nums.length;
  const range = (max - min) || 1;

  // 7 Bins (ヒストグラム階級分割)
  const numBins = 7;
  const binWidth = range / numBins;
  const bins = Array(numBins).fill(0);

  nums.forEach(v => {
    let idx = Math.floor((v - min) / binWidth);
    if (idx >= numBins) idx = numBins - 1;
    bins[idx]++;
  });
  const maxBinCount = Math.max(...bins, 1);

  // カーネル密度推定 (KDE: Kernel Density Estimation) - Silverman's rule of thumb
  const variance = nums.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1 || 1);
  const sd = Math.sqrt(variance) || 1;
  const q1 = computePercentile(nums, 0.25);
  const q3 = computePercentile(nums, 0.75);
  const iqr = (q3 - q1) || sd;
  const bw = (0.9 * Math.min(sd, iqr / 1.34) * Math.pow(n, -0.2)) || (range / 8);

  const pts = 60;
  const kdePoints = [];
  let kdeScaledMax = 0;

  for (let p = 0; p <= pts; p++) {
    const xVal = min + (range / pts) * p;
    let density = 0;
    nums.forEach(xi => {
      const u = (xVal - xi) / bw;
      density += (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * u * u);
    });
    density = density / (n * bw); // 確率密度 f(x)
    
    // 統計的尺度整合: ヒストグラムの度数スケールに換算 (期待度数密度 = density * n * binWidth)
    const scaledDensity = density * n * binWidth;
    if (scaledDensity > kdeScaledMax) kdeScaledMax = scaledDensity;
    kdePoints.push({ xVal, density, scaledDensity });
  }

  // Y軸上限（ヒストグラム度数と度数換算KDEの最大値に基づき統計的一致を保持）
  const peakVal = Math.max(maxBinCount, kdeScaledMax);
  let yMax = Math.ceil(peakVal * 1.18);
  if (yMax < 2) yMax = 2;

  const isNarrow = width <= 340;

  // パディングと描画寸法
  const padL = isNarrow ? 26 : 38;
  const padR = isNarrow ? 12 : 24;
  const padT = isNarrow ? 14 : 24;
  const padB = isNarrow ? 14 : 22;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  let svgInner = '';

  // 1. Y軸度数グリッド線 & 基準線
  const midCount = Math.round(yMax / 2);
  const midY = padT + chartH - (midCount / yMax) * chartH;

  // ベースライン (0)
  svgInner += `<line x1="${padL}" y1="${padT + chartH}" x2="${padL + chartW}" y2="${padT + chartH}" stroke="#334155" stroke-width="1.2" />`;
  // 中間度数破線
  svgInner += `<line x1="${padL}" y1="${midY.toFixed(1)}" x2="${padL + chartW}" y2="${midY.toFixed(1)}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3,3" />`;
  // 上端破線
  svgInner += `<line x1="${padL}" y1="${padT}" x2="${padL + chartW}" y2="${padT}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="2,2" />`;

  // Y軸度数ラベル
  const yLabelSize = isNarrow ? "7" : "7.5";
  svgInner += `<text x="${padL - 4}" y="${padT + chartH + 3}" font-size="${yLabelSize}" fill="#475569" text-anchor="end">0</text>`;
  svgInner += `<text x="${padL - 4}" y="${(midY + 3).toFixed(1)}" font-size="${yLabelSize}" fill="#475569" text-anchor="end">${midCount}</text>`;
  svgInner += `<text x="${padL - 4}" y="${padT + 3}" font-size="${yLabelSize}" fill="#475569" text-anchor="end">${yMax}</text>`;
  if (!isNarrow) {
    svgInner += `<text x="${padL}" y="${padT - 11}" font-size="7.5" fill="#475569" font-weight="700" text-anchor="start">度数 (自治体数)</text>`;
  }

  // 2. ヒストグラムの描画
  const barWidth = chartW / numBins;
  bins.forEach((count, i) => {
    const barH = (count / yMax) * chartH;
    const x = padL + i * barWidth + (isNarrow ? 1 : 2);
    const y = padT + chartH - barH;
    const w = Math.max(barWidth - (isNarrow ? 2 : 4), 2);

    svgInner += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${barH.toFixed(1)}" fill="#f1f5f9" stroke="#334155" stroke-width="1.1" rx="1" />`;
    if (count > 0) {
      svgInner += `<text x="${(x + w / 2).toFixed(1)}" y="${(y - 2).toFixed(1)}" font-size="${isNarrow ? '7.5' : '8.5'}" fill="#0f172a" text-anchor="middle" font-weight="700">${count}</text>`;
    }
  });

  // 3. カーネル密度推定 (KDE) 曲線
  let pathD = `M `;
  kdePoints.forEach((pt, idx) => {
    const x = padL + ((pt.xVal - min) / range) * chartW;
    const y = padT + chartH - (pt.scaledDensity / yMax) * chartH;
    pathD += `${idx === 0 ? '' : 'L '}${x.toFixed(1)},${y.toFixed(1)} `;
  });

  svgInner += `<path d="${pathD}" fill="none" stroke="#0f172a" stroke-width="${isNarrow ? '1.6' : '2'}" stroke-linejoin="round" />`;

  // 4. 平均値・中央値のリファレンス垂直線
  const meanX = padL + Math.max(0, Math.min(1, (mean - min) / range)) * chartW;
  const medianX = padL + Math.max(0, Math.min(1, (median - min) / range)) * chartW;
  const closeTogether = Math.abs(meanX - medianX) < (isNarrow ? 35 : 45);

  let meanY = padT - 3;
  let medianY = padT - 3;
  if (closeTogether) {
    if (meanX <= medianX) {
      meanY = padT - (isNarrow ? 5 : 10);
      medianY = padT - 2;
    } else {
      medianY = padT - (isNarrow ? 5 : 10);
      meanY = padT - 2;
    }
  }

  const getAnchor = (x) => {
    if (x < padL + (isNarrow ? 18 : 25)) return "start";
    if (x > padL + chartW - (isNarrow ? 18 : 25)) return "end";
    return "middle";
  };
  const meanAnchor = getAnchor(meanX);
  const medianAnchor = getAnchor(medianX);

  const refLabelSize = isNarrow ? "7" : "8";

  // 平均値線（黒破線）
  svgInner += `<line x1="${meanX.toFixed(1)}" y1="${padT}" x2="${meanX.toFixed(1)}" y2="${padT + chartH}" stroke="#0f172a" stroke-width="1.3" stroke-dasharray="3,2" />`;
  svgInner += `<text x="${meanX.toFixed(1)}" y="${meanY}" font-size="${refLabelSize}" fill="#0f172a" text-anchor="${meanAnchor}" font-weight="700" paint-order="stroke fill" stroke="#ffffff" stroke-width="2" stroke-linejoin="round">平均:${valFmt(mean)}</text>`;

  // 中央値線（濃灰破線）
  svgInner += `<line x1="${medianX.toFixed(1)}" y1="${padT}" x2="${medianX.toFixed(1)}" y2="${padT + chartH}" stroke="#475569" stroke-width="1.3" stroke-dasharray="2,2" />`;
  svgInner += `<text x="${medianX.toFixed(1)}" y="${medianY}" font-size="${refLabelSize}" fill="#475569" text-anchor="${medianAnchor}" font-weight="700" paint-order="stroke fill" stroke="#ffffff" stroke-width="2" stroke-linejoin="round">中央:${valFmt(median)}</text>`;

  // 5. X軸目盛り＆注釈ラベル
  const unitLabel = unitStr ? ` (${unitStr})` : '';
  const axisLabelSize = isNarrow ? "6.8" : "7.8";

  svgInner += `<text x="${padL}" y="${height - 2}" text-anchor="start" font-size="${axisLabelSize}" font-weight="600" fill="#334155">最小: ${valFmt(min)}${unitLabel}</text>`;
  svgInner += `<text x="${padL + chartW}" y="${height - 2}" text-anchor="end" font-size="${axisLabelSize}" font-weight="600" fill="#334155">最大: ${valFmt(max)}${unitLabel}</text>`;

  if (!isNarrow) {
    let noteText = "※KDE: ガウス核推定（度数スケール換算）";
    if (unitStr && (unitStr.includes("Zスコア") || unitStr.includes("Z値"))) {
      noteText = "※Zスコア標準化尺度（平均0, SD=1）";
    } else if (unitStr && unitStr.includes("偏差値")) {
      noteText = "※偏差値尺度（平均50, SD=10）";
    }
    svgInner += `<text x="${(padL + chartW / 2).toFixed(1)}" y="${height - 3}" text-anchor="middle" font-size="7.2" fill="#64748b">${noteText}</text>`;
  }

  return `
  <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" style="overflow:visible; display:block;">
    ${svgInner}
  </svg>`;
}

function buildMuniHorizontalBarChartHtml(muniList, formatReportVal, axisUnitStr, transformShortLabel) {
  if (!muniList || muniList.length === 0) {
    return '<div class="text-muted p-2" style="font-size:0.75rem;">有効なデータがありません</div>';
  }

  const validVals = muniList.map(item => item[1]).filter(v => v !== null && v !== undefined && !isNaN(v));
  const maxVal = validVals.length > 0 ? Math.max(...validVals) : 0;
  const minVal = validVals.length > 0 ? Math.min(...validVals) : 0;

  const hasNegative = minVal < 0;
  const absMax = Math.max(Math.abs(maxVal), Math.abs(minVal)) || 1;

  // 2列に均等分割（左列: 1〜20位、右列: 21〜40位）
  const half = Math.ceil(muniList.length / 2);
  const col1 = muniList.slice(0, half);
  const col2 = muniList.slice(half);

  const renderCol = (list, startRank) => {
    return list.map((item, idx) => {
      const rank = startRank + idx;
      const name = item[0];
      const val = item[1];
      const formattedVal = formatReportVal(val);
      const color = (val !== null && !isNaN(val)) ? getColorForValue(val) : "#cbd5e1";

      let barWidthPercent = 0;
      if (val !== null && !isNaN(val)) {
        if (!hasNegative) {
          barWidthPercent = maxVal > 0 ? Math.max(1, Math.min(100, (val / maxVal) * 100)) : 0;
        } else {
          barWidthPercent = Math.max(1, Math.min(100, (Math.abs(val) / absMax) * 100));
        }
      }

      const rankClass = rank === 1 ? 'rank-gold' : rank === 2 ? 'rank-silver' : rank === 3 ? 'rank-bronze' : '';

      return `
        <div class="rep-bar-row">
          <span class="rep-bar-rank ${rankClass}">${rank}</span>
          <span class="rep-bar-name" title="${name}">${name}</span>
          <div class="rep-bar-track">
            <div class="rep-bar-fill" style="width:${barWidthPercent.toFixed(1)}%; background-color:${color}; border:1px solid #334155;"></div>
          </div>
          <span class="rep-bar-val">${formattedVal}</span>
        </div>
      `;
    }).join("");
  };

  const unitDesc = axisUnitStr ? `[${axisUnitStr}]` : `(${transformShortLabel})`;

  return `
    <div class="rep-bar-card-title">
      <div class="d-flex align-items-center gap-1">
        <i class="fa-solid fa-chart-simple" style="color:#0f172a;"></i>
        <span>40市町村 横棒グラフ (多い順)</span>
      </div>
      <span style="font-size:0.66rem; font-weight:normal; color:#64748b;">${unitDesc}</span>
    </div>
    <div class="rep-bar-grid">
      <div class="rep-bar-col">
        <div class="rep-bar-col-header">
          <span>順位 / 自治体</span>
          <span>比較バー ＆ 数値</span>
        </div>
        ${renderCol(col1, 1)}
      </div>
      <div class="rep-bar-col">
        <div class="rep-bar-col-header">
          <span>順位 / 自治体</span>
          <span>比較バー ＆ 数値</span>
        </div>
        ${renderCol(col2, half + 1)}
      </div>
    </div>
  `;
}

function buildMuniVerticalBarChartSVG(muniList, formatReportVal, axisUnitStr, transformShortLabel, width = 630, height = 245, mean = null) {
  if (!muniList || muniList.length === 0) {
    return `<svg width="${width}" height="${height}"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="11" fill="#94a3b8">有効なデータがありません</text></svg>`;
  }

  const validVals = muniList.map(item => item[1]).filter(v => v !== null && v !== undefined && !isNaN(v));
  const maxVal = validVals.length > 0 ? Math.max(...validVals) : 0;
  const minVal = validVals.length > 0 ? Math.min(...validVals) : 0;

  const padL = 46;
  const padR = 14;
  const padT = 22;
  const padB = 64; // 市町村名ラベル用領域
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const n = muniList.length;
  const colStep = chartW / n;
  const barW = Math.max(5, Math.min(10.5, colStep - 3.2));

  const hasNeg = minVal < 0;
  let zeroY = padT + chartH;
  if (hasNeg) {
    zeroY = padT + (maxVal / (maxVal - minVal || 1)) * chartH;
  }

  let svgInner = '';

  // 水平グリッド線 ＆ Y軸ラベル (0%, 25%, 50%, 75%, 100%)
  const numGridLines = 4;
  for (let i = 0; i <= numGridLines; i++) {
    const ratio = i / numGridLines;
    const y = padT + chartH * (1 - ratio);
    const gridVal = hasNeg ? (minVal + (maxVal - minVal) * ratio) : (maxVal * ratio);

    svgInner += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + chartW}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="${i === 0 ? 'none' : '2,2'}" />`;
    svgInner += `<text x="${padL - 5}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="7.5" font-family="ui-monospace, monospace" fill="#64748b">${formatReportVal(gridVal)}</text>`;
  }

  // 平均値基準線
  if (mean !== null && !isNaN(mean)) {
    let meanY;
    if (hasNeg) {
      meanY = padT + ((maxVal - mean) / (maxVal - minVal || 1)) * chartH;
    } else {
      meanY = padT + chartH - (mean / (maxVal || 1)) * chartH;
    }
    if (meanY >= padT && meanY <= padT + chartH) {
      svgInner += `<line x1="${padL}" y1="${meanY.toFixed(1)}" x2="${padL + chartW}" y2="${meanY.toFixed(1)}" stroke="#dc2626" stroke-width="1.2" stroke-dasharray="4,2" />`;
      svgInner += `<text x="${padL + chartW - 2}" y="${(meanY - 3).toFixed(1)}" text-anchor="end" font-size="7.5" font-weight="700" fill="#dc2626" paint-order="stroke fill" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round">平均: ${formatReportVal(mean)}</text>`;
    }
  }

  // 40本の垂直バーと市町村名ラベル
  muniList.forEach((item, idx) => {
    const rank = idx + 1;
    const name = item[0];
    const val = item[1];
    const color = (val !== null && !isNaN(val)) ? getColorForValue(val) : "#cbd5e1";

    const cx = padL + colStep * idx + colStep / 2;
    const x = cx - barW / 2;

    let barY = zeroY;
    let barH = 0;

    if (val !== null && !isNaN(val)) {
      if (!hasNeg) {
        barH = maxVal > 0 ? (val / maxVal) * chartH : 0;
        barY = padT + chartH - barH;
      } else {
        if (val >= 0) {
          barH = ((val) / (maxVal - minVal || 1)) * chartH;
          barY = zeroY - barH;
        } else {
          barH = (Math.abs(val) / (maxVal - minVal || 1)) * chartH;
          barY = zeroY;
        }
      }
    }

    barH = Math.max(1.5, barH);

    // バー矩形（最小階級が白色でもくっきり見えるよう濃いグレーで縁取り）
    svgInner += `<rect x="${x.toFixed(1)}" y="${barY.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="1.5" ry="1.5" fill="${color}" stroke="#334155" stroke-width="0.9">
      <title>${rank}位: ${name} (${formatReportVal(val)})</title>
    </rect>`;


    // 市町村名（縦書き・90度回転で美しく下部に整列）
    const labelY = padT + chartH + 7;
    svgInner += `<text x="${cx.toFixed(1)}" y="${labelY}" transform="rotate(90, ${cx.toFixed(1)}, ${labelY})" text-anchor="start" font-size="8.2" font-weight="600" fill="#1e293b" letter-spacing="-0.02em">${name}</text>`;
  });

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" style="overflow:hidden; max-height:100%; display:block;">
      ${svgInner}
    </svg>
  `;
}

export async function generateA4ReportPDF(orientation = "landscape") {
  setPrintPageOrientation(orientation);

  const modal = document.getElementById("report-modal");
  const sheet = document.getElementById("report-sheet");
  if (!modal || !sheet) return;

  sheet.className = `report-sheet orient-${orientation}`;

  // Update modal orientation button active states
  const btnLand = document.getElementById("btn-modal-orient-landscape");
  const btnPort = document.getElementById("btn-modal-orient-portrait");
  if (btnLand) btnLand.classList.toggle("active", orientation === "landscape");
  if (btnPort) btnPort.classList.toggle("active", orientation === "portrait");

  // Update tab page orientation radio and card active states
  const radio = document.querySelector(`input[name="report-orientation"][value="${orientation}"]`);
  if (radio) radio.checked = true;
  const labelLand = document.getElementById("label-orient-landscape");
  const labelPort = document.getElementById("label-orient-portrait");
  if (labelLand) labelLand.classList.toggle("active", orientation === "landscape");
  if (labelPort) labelPort.classList.toggle("active", orientation === "portrait");

  modal.classList.remove("hidden");

  // Title / Subtitle / Meta
  const title = state.title || "青森県市町村データ分析レポート";
  const subtitle = state.subtitle || "";
  const activeVar = state.variables[state.activeVariableKey];
  const varName = activeVar ? activeVar.name : "作図指標データ";
  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

  const remarksText = state.remarks || (document.getElementById("map-remarks-input") ? document.getElementById("map-remarks-input").value : "");

  // Effective Stats & Numbers (変換モード適用済みの数値配列)
  const effectiveVals = getEffectiveValues();
  const stats = calculateStats(effectiveVals);

  const sorted = stats.sorted;
  const nums = stats.numList;
  const n = stats.count;
  const sum = stats.sum;
  const mean = stats.mean;

  const v = state.variables[state.activeVariableKey];
  const rawUnitClean = (v && v.unit ? v.unit : (state.unit || ""))
    .replace(/^単位[：:]\s*/, "")
    .replace(/\s*\(.*?\)\s*$/, "")
    .trim();

  let transformBadge = "（実測値）";
  let transformShortLabel = "実測値";
  let effectiveUnitStr = "";
  let axisUnitStr = "";
  const isPerCapita = (state.isPerCapitaMode || state.transformMode === "per_capita") && (state.perCapitaMultiplier > 0);
  const stdMode = state.standardizeMode || (state.transformMode === "zscore" ? "zscore" : (state.transformMode === "tscore" ? "tscore" : "none"));
  const isZScore = (stdMode === "zscore");
  const isTScore = (stdMode === "tscore");

  let pBadge = "";
  let pShort = "";
  let pAxis = "";
  if (isPerCapita) {
    const mult = state.perCapitaMultiplier || 100;
    if (mult === 100) {
      pBadge = "人口100人あたり(％)";
      pShort = "100人あたり(％)";
      pAxis = "%";
    } else if (mult === 1000) {
      pBadge = "人口1,000人あたり";
      pShort = "1,000人あたり";
      pAxis = rawUnitClean ? `${rawUnitClean}/千人` : "1,000人対";
    } else if (mult === 1) {
      pBadge = "人口1人あたり";
      pShort = "1人あたり";
      pAxis = rawUnitClean ? `${rawUnitClean}/人` : "1人対";
    } else {
      pBadge = `人口${mult.toLocaleString()}人あたり`;
      pShort = `${mult.toLocaleString()}人あたり`;
      pAxis = `/${mult.toLocaleString()}人`;
    }
  }

  if (isZScore) {
    transformBadge = pShort ? `${pShort} ✕ Zスコア` : "Zスコア標準化偏差";
    transformShortLabel = pShort ? `${pShort} ✕ Zスコア` : "Zスコア標準化";
    effectiveUnitStr = pShort ? `Zスコア (${pShort})` : "Zスコア (平均=0, SD=1)";
    axisUnitStr = "Zスコア";
  } else if (isTScore) {
    transformBadge = pShort ? `${pShort} ✕ 偏差値` : "偏差値（Tスコア）";
    transformShortLabel = pShort ? `${pShort} ✕ 偏差値` : "偏差値";
    effectiveUnitStr = pShort ? `偏差値 (${pShort})` : "偏差値 (平均=50, SD=10)";
    axisUnitStr = "偏差値";
  } else if (isPerCapita) {
    transformBadge = pBadge;
    transformShortLabel = pBadge;
    effectiveUnitStr = rawUnitClean ? `${rawUnitClean} (${pShort})` : pShort;
    axisUnitStr = pAxis;
  } else {
    transformBadge = "実測値";
    transformShortLabel = "実測値";
    effectiveUnitStr = rawUnitClean ? rawUnitClean : "";
    axisUnitStr = rawUnitClean ? rawUnitClean : "";
  }

  // レポート用フォーマッタ
  function formatReportVal(val) {
    if (val === null || val === undefined || isNaN(val)) return "-";
    if (isZScore) return Number(val).toFixed(2);
    if (isTScore) return Number(val).toFixed(1);
    if (isPerCapita) {
      if (Math.abs(val) < 10 && val % 1 !== 0) return Number(val).toFixed(2);
      return formatNumber(val);
    }
    return formatNumber(val);
  }

  const min = stats.min[1] !== null ? stats.min[1] : 0;
  const max = stats.max[1] !== null ? stats.max[1] : 0;
  const q1 = stats.q1;
  const median = stats.median;
  const q3 = stats.q3;
  const iqr = stats.iqr;
  const stdDev = stats.stdDev;
  const minEntry = stats.min;
  const maxEntry = stats.max;

  const isRatioOrTransformed = isPerCapita || isZScore || isTScore;
  const sumDisplay = isRatioOrTransformed
    ? `- <span style="font-size:0.68rem; color:#64748b; font-weight:normal;">(対象外)</span>`
    : formatReportVal(sum);

  const avgNoteHtml = isPerCapita
    ? `<div style="font-size:0.68rem; color:#64748b; margin-top:4px; line-height:1.2;">※平均値は各市町村の単純算術平均（人口加重なし）<br>※人口補正基準: 令和2年(2020年)国勢調査人口</div>`
    : '';

  const statTableHtmlLandscape = `
    <table class="rep-stat-table">
      <tbody>
        <tr>
          <th>対象数</th>
          <td>${n} / 40</td>
          <th>合　計</th>
          <td>${sumDisplay}</td>
        </tr>
        <tr>
          <th>平均値</th>
          <td>${formatReportVal(mean)}</td>
          <th>中央値</th>
          <td>${formatReportVal(median)}</td>
        </tr>
        <tr>
          <th>最　大</th>
          <td>${formatReportVal(maxEntry[1])}<span class="muni-tag">(${maxEntry[0]})</span></td>
          <th>最　小</th>
          <td>${formatReportVal(minEntry[1])}<span class="muni-tag">(${minEntry[0]})</span></td>
        </tr>
        <tr>
          <th>標準偏差</th>
          <td>${formatReportVal(stdDev)}</td>
          <th>四分位範囲</th>
          <td>${formatReportVal(iqr)}</td>
        </tr>
      </tbody>
    </table>
    ${avgNoteHtml}
  `;

  const statTableHtmlPortrait = `
    <table class="rep-stat-table">
      <tbody>
        <tr>
          <th>対象数</th>
          <td>${n} / 40</td>
          <th>合　計</th>
          <td>${sumDisplay}</td>
        </tr>
        <tr>
          <th>平均値</th>
          <td>${formatReportVal(mean)}</td>
          <th>中央値</th>
          <td>${formatReportVal(median)}</td>
        </tr>
        <tr>
          <th>最　大</th>
          <td>${formatReportVal(maxEntry[1])}<span class="muni-tag">(${maxEntry[0]})</span></td>
          <th>最　小</th>
          <td>${formatReportVal(minEntry[1])}<span class="muni-tag">(${minEntry[0]})</span></td>
        </tr>
        <tr>
          <th>標準偏差</th>
          <td>${formatReportVal(stdDev)}</td>
          <th>四分位範囲</th>
          <td>${formatReportVal(iqr)}</td>
        </tr>
      </tbody>
    </table>
    ${avgNoteHtml}
  `;

  // 全40市町村 棒グラフ（多い方から順に降順ソート）
  const descMuniList = [...sorted].reverse();
  const horizontalBarChartHtml = buildMuniHorizontalBarChartHtml(descMuniList, formatReportVal, axisUnitStr, transformShortLabel);
  const verticalBarChartHtml = buildMuniVerticalBarChartSVG(descMuniList, formatReportVal, axisUnitStr, transformShortLabel, 630, 195, mean);

  const distSvgHtmlLandscape = `
    <div class="rep-dist-svg-wrap">
      ${buildReportDistributionSVG(nums, min, mean, median, max, 520, 105, axisUnitStr, formatReportVal)}
    </div>
  `;

  const distSvgHtmlPortrait = `
    <div class="rep-dist-svg-wrap">
      ${buildReportDistributionSVG(nums, min, mean, median, max, 305, 94, axisUnitStr, formatReportVal)}
    </div>
  `;

  const repSubHtml = `
    <p class="rep-sub">
      ${subtitle ? subtitle + ' ｜ ' : ''}
      <strong>${varName}</strong>
      ${rawUnitClean ? ` <span style="font-weight:normal; color:#475569;">[${rawUnitClean}]</span>` : ''}
      <span class="rep-mode-badge" style="display:inline-block; margin-left:8px; padding:2px 8px; font-size:0.75rem; font-weight:700; background:#f1f5f9; border:1px solid #94a3b8; border-radius:4px; color:#0f172a;">${transformBadge}</span>
    </p>
  `;

  // タイトルの長さに応じたフォントサイズ動的スケーリング（3行はみ出し・枠破壊防止）
  const titleLen = (title || "").length;
  let landTitleFontSize = "1.22rem";
  if (titleLen > 36) {
    landTitleFontSize = "0.94rem";
  } else if (titleLen > 24) {
    landTitleFontSize = "1.08rem";
  }

  let portTitleFontSize = "1.25rem";
  if (titleLen > 36) {
    portTitleFontSize = "0.98rem";
  } else if (titleLen > 24) {
    portTitleFontSize = "1.12rem";
  }

  // First render initial template with loading state for map image
  if (orientation === "landscape") {
    sheet.innerHTML = `
      <header class="rep-header">
        <div class="rep-title-group">
          <h1 style="font-size:${landTitleFontSize};">${title}</h1>
          ${repSubHtml}
        </div>
        <div class="rep-meta-badge">
          <div class="rep-date">作成日: ${dateStr}</div>
        </div>
      </header>

      <main class="rep-body-landscape">
        <div class="rep-map-col">
          <div class="rep-map-frame">
            <img id="rep-map-img" src="" alt="${title}" style="display:none;">
            <div id="rep-map-loading" style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#64748b; font-size:0.85rem;">
              <i class="fa-solid fa-spinner fa-spin mb-2" style="font-size:1.4rem; color:#475569;"></i>
              <span>地図画像を最適化中...</span>
            </div>
          </div>

          <div class="rep-card rep-dist-card">
            <div class="rep-card-title rep-dist-card-title">
              <div class="rep-dist-title-text">
                <i class="fa-solid fa-chart-area" style="color:#0f172a;"></i>
                <span>データ分布</span>
                <span class="rep-dist-subtitle">(${transformShortLabel})</span>
              </div>
              <div class="rep-dist-legend">
                <span class="rep-legend-item"><span class="rep-legend-box"></span>度数</span>
                <span class="rep-legend-item"><span class="rep-legend-line rep-kde-line"></span>KDE</span>
                <span class="rep-legend-item"><span class="rep-legend-line rep-mean-line"></span>平均</span>
                <span class="rep-legend-item"><span class="rep-legend-line rep-median-line"></span>中央</span>
              </div>
            </div>
            ${distSvgHtmlLandscape}
          </div>
        </div>

        <div class="rep-info-col">
          <div class="rep-card rep-stat-card">
            <div class="rep-card-title"><i class="fa-solid fa-table-cells" style="color:#0f172a;"></i> 基本統計サマリー <span style="font-size:0.72rem; font-weight:normal; color:#64748b;">(${transformShortLabel})</span></div>
            ${statTableHtmlLandscape}
          </div>

          <div class="rep-card rep-bar-card" style="flex:1;">
            ${horizontalBarChartHtml}
          </div>
        </div>
      </main>

      <footer class="rep-footer">
        <div class="rep-footer-remarks">${remarksText || `分析対象: 青森県全40市町村 (${n}市町村の有効データを集計)`}</div>
        <div class="rep-footer-brand">青森県市町村コロプレスツール</div>
      </footer>
    `;
  } else {
    // Portrait Mode
    sheet.innerHTML = `
      <header class="rep-header">
        <div class="rep-title-group">
          <h1 style="font-size:${portTitleFontSize};">${title}</h1>
          ${repSubHtml}
        </div>
        <div class="rep-meta-badge">
          <div class="rep-date">作成日: ${dateStr}</div>
        </div>
      </header>

      <main class="rep-body-portrait">
        <!-- 上段: 最大化地図エリア -->
        <div class="rep-map-frame rep-portrait-map">
          <img id="rep-map-img" src="" alt="${title}" style="display:none;">
          <div id="rep-map-loading" style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#64748b; font-size:0.85rem;">
            <i class="fa-solid fa-spinner fa-spin mb-2" style="font-size:1.4rem; color:#475569;"></i>
            <span>地図画像を最適化中...</span>
          </div>
        </div>

        <!-- 中段: サマリー & データ分布図 -->
        <div class="rep-portrait-mid">
          <div class="rep-card" style="display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <div class="rep-card-title"><i class="fa-solid fa-table-cells" style="color:#0f172a;"></i> 基本統計サマリー <span style="font-size:0.72rem; font-weight:normal; color:#64748b;">(${transformShortLabel})</span></div>
              ${statTableHtmlPortrait}
            </div>
            ${remarksText ? `<div style="font-size:0.67rem; color:#475569; margin-top:2px; line-height:1.2; border-top:1px dashed #cbd5e1; padding-top:2px; white-space:pre-line;"><strong>備考:</strong> ${remarksText}</div>` : ''}
          </div>

          <div class="rep-card rep-dist-card" style="display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <div class="rep-card-title" style="margin-bottom:2px;">
                <div class="d-flex align-items-center gap-1">
                  <i class="fa-solid fa-chart-area" style="color:#0f172a;"></i>
                  <span>データ分布</span>
                </div>
                <span class="rep-dist-subtitle" style="font-size:0.68rem; font-weight:normal; color:#64748b;">(${transformShortLabel})</span>
              </div>
              <div class="rep-dist-legend-compact">
                <span class="rep-legend-item"><span class="rep-legend-box"></span>度数</span>
                <span class="rep-legend-item"><span class="rep-legend-line rep-kde-line"></span>KDE</span>
                <span class="rep-legend-item"><span class="rep-legend-line rep-mean-line"></span>平均</span>
                <span class="rep-legend-item"><span class="rep-legend-line rep-median-line"></span>中央</span>
              </div>
            </div>
            ${distSvgHtmlPortrait}
          </div>
        </div>

        <!-- 下段: 40市町村 縦棒グラフ（横軸: 40市町村, 縦軸: 値） -->
        <div class="rep-card rep-bar-card rep-portrait-bottom">
          <div class="rep-bar-card-title">
            <div class="d-flex align-items-center gap-1">
              <i class="fa-solid fa-chart-column" style="color:#0f172a;"></i>
              <span>40市町村 棒グラフ (多い順)</span>
            </div>
            <span style="font-size:0.68rem; font-weight:normal; color:#64748b;">
              ${axisUnitStr ? `[${axisUnitStr}]` : `(${transformShortLabel})`}
            </span>
          </div>
          <div class="rep-vbar-svg-wrap">
            ${verticalBarChartHtml}
          </div>
        </div>
      </main>

      <footer class="rep-footer">
        <div class="rep-footer-remarks">${remarksText || `分析対象: 青森県全40市町村 (${n}市町村の有効データを集計)`}</div>
        <div class="rep-footer-brand">青森県市町村コロプレスツール</div>
      </footer>
    `;
  }

  // Asynchronously generate and insert high quality map PNG
  try {
    const mapDataUrl = await generateMapPNGData();
    const repImg = document.getElementById("rep-map-img");
    const repLoading = document.getElementById("rep-map-loading");
    if (repImg && mapDataUrl) {
      repImg.src = mapDataUrl;
      repImg.style.display = "block";
    }
    if (repLoading) {
      repLoading.style.display = "none";
    }
  } catch (err) {
    console.error("Report map image capture failed:", err);
    const repLoading = document.getElementById("rep-map-loading");
    if (repLoading) {
      repLoading.innerHTML = `<span class="text-muted">地図画像の埋め込みに失敗しました</span>`;
    }
  }
}

export async function generateReportPNGData(scale = 2.5) {
  const sheet = document.getElementById("report-sheet");
  if (!sheet) throw new Error("レポート要素が見つかりません");

  // 地図画像（rep-map-img）の読み込み完了を待機
  const repImg = document.getElementById("rep-map-img");
  const repLoading = document.getElementById("rep-map-loading");
  if (repLoading && repLoading.style.display !== "none") {
    let waitCount = 0;
    while (waitCount < 25 && repLoading.style.display !== "none") {
      await new Promise(r => setTimeout(r, 100));
      waitCount++;
    }
  }
  if (repImg && !repImg.complete) {
    await new Promise(resolve => {
      repImg.onload = resolve;
      repImg.onerror = resolve;
      setTimeout(resolve, 1500);
    });
  }

  // レポート用紙の外枠シャドウ・変形を一時解除してクリーンな画像にする
  const prevBoxShadow = sheet.style.boxShadow;
  const prevTransform = sheet.style.transform;
  sheet.style.boxShadow = "none";
  sheet.style.transform = "none";

  try {
    let dataUrl = null;
    if (window.htmlToImage && typeof window.htmlToImage.toPng === "function") {
      dataUrl = await window.htmlToImage.toPng(sheet, {
        pixelRatio: scale,
        skipFonts: true,
        cacheBust: true,
        backgroundColor: "#ffffff"
      });
    } else if (typeof html2canvas === "function") {
      const canvas = await html2canvas(sheet, {
        scale: scale,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false
      });
      dataUrl = canvas.toDataURL("image/png");
    } else {
      throw new Error("画像出力ライブラリが見つかりません");
    }
    return dataUrl;
  } finally {
    sheet.style.boxShadow = prevBoxShadow;
    sheet.style.transform = prevTransform;
  }
}

export async function exportReportPNG() {
  const btn = document.getElementById("btn-export-report-png");
  const origHtml = btn ? btn.innerHTML : "";
  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i> 生成中...`;
    }
    showToast("A4レポートの高解像度PNG画像を生成しています...", "info");
    const dataUrl = await generateReportPNGData(2.5);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const orient = document.getElementById("report-sheet")?.classList.contains("orient-portrait") ? "portrait" : "landscape";
    const orientLabel = orient === "portrait" ? "縦" : "横";
    const varName = state.variables[state.activeVariableKey]?.name || "統計レポート";
    link.download = `A4分析レポート_${varName}_${orientLabel}_${dateStr}.png`;
    link.href = dataUrl;
    link.click();
    showToast("A4レポートのPNG画像をダウンロード保存しました", "success");
  } catch (err) {
    console.error("Report PNG export error:", err);
    showToast("レポートPNG画像の出力に失敗しました: " + err.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
}

export async function copyReportPNGToClipboard() {
  const btn = document.getElementById("btn-copy-report-png");
  const origHtml = btn ? btn.innerHTML : "";
  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i> 処理中...`;
    }
    showToast("レポート画像をクリップボードに生成しています...", "info");
    const dataUrl = await generateReportPNGData(2.0);
    const res = await fetch(dataUrl);
    const blob = await res.blob();

    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([
        new window.ClipboardItem({ [blob.type]: blob })
      ]);
      showToast("レポート画像をクリップボードにコピーしました！資料にそのまま貼り付けできます", "success");
    } else {
      throw new Error("お使いのブラウザはクリップボードへの画像コピーに対応していません");
    }
  } catch (err) {
    console.error("Copy report PNG error:", err);
    showToast("クリップボードへのコピーに失敗しました: " + err.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
}

