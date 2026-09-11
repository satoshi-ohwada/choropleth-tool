// A4 Analysis Report Generator (PDF / Print) Engine
import { state } from '../core/state.js';
import { getEffectiveValues, calculateStats, formatNumber } from '../stats/statsEngine.js';
import { generateMapPNGData } from './imageExporter.js';
import { showToast } from '../ui/toast.js';

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
  const iqr = (nums[Math.floor(n * 0.75)] - nums[Math.floor(n * 0.25)]) || sd;
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

  // パディングと描画寸法
  const padL = 38;
  const padR = 24;
  const padT = 26;
  const padB = 22;
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
  svgInner += `<text x="${padL - 5}" y="${padT + chartH + 3}" font-size="7.5" fill="#475569" text-anchor="end">0</text>`;
  svgInner += `<text x="${padL - 5}" y="${(midY + 3).toFixed(1)}" font-size="7.5" fill="#475569" text-anchor="end">${midCount}</text>`;
  svgInner += `<text x="${padL - 5}" y="${padT + 3}" font-size="7.5" fill="#475569" text-anchor="end">${yMax}</text>`;
  svgInner += `<text x="${padL}" y="${padT - 13}" font-size="7.5" fill="#475569" font-weight="700" text-anchor="start">度数 (自治体数)</text>`;

  // 2. ヒストグラムの描画
  const barWidth = chartW / numBins;
  bins.forEach((count, i) => {
    const barH = (count / yMax) * chartH;
    const x = padL + i * barWidth + 2;
    const y = padT + chartH - barH;
    const w = Math.max(barWidth - 4, 2);

    svgInner += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${barH.toFixed(1)}" fill="#f1f5f9" stroke="#334155" stroke-width="1.2" rx="1" />`;
    if (count > 0) {
      svgInner += `<text x="${(x + w / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" font-size="8.5" fill="#0f172a" text-anchor="middle" font-weight="700">${count}</text>`;
    }
  });

  // 3. カーネル密度推定 (KDE) 曲線
  let pathD = `M `;
  kdePoints.forEach((pt, idx) => {
    const x = padL + ((pt.xVal - min) / range) * chartW;
    const y = padT + chartH - (pt.scaledDensity / yMax) * chartH;
    pathD += `${idx === 0 ? '' : 'L '}${x.toFixed(1)},${y.toFixed(1)} `;
  });

  svgInner += `<path d="${pathD}" fill="none" stroke="#0f172a" stroke-width="2" stroke-linejoin="round" />`;

  // 4. 平均値・中央値のリファレンス垂直線
  const meanX = padL + Math.max(0, Math.min(1, (mean - min) / range)) * chartW;
  const medianX = padL + Math.max(0, Math.min(1, (median - min) / range)) * chartW;
  const closeTogether = Math.abs(meanX - medianX) < 45;

  let meanY = padT - 4;
  let medianY = padT - 4;
  if (closeTogether) {
    if (meanX <= medianX) {
      meanY = padT - 13;
      medianY = padT - 3;
    } else {
      medianY = padT - 13;
      meanY = padT - 3;
    }
  }

  const getAnchor = (x) => {
    if (x < padL + 25) return "start";
    if (x > padL + chartW - 25) return "end";
    return "middle";
  };
  const meanAnchor = getAnchor(meanX);
  const medianAnchor = getAnchor(medianX);

  // 平均値線（黒破線）
  svgInner += `<line x1="${meanX.toFixed(1)}" y1="${padT}" x2="${meanX.toFixed(1)}" y2="${padT + chartH}" stroke="#0f172a" stroke-width="1.5" stroke-dasharray="4,3" />`;
  svgInner += `<text x="${meanX.toFixed(1)}" y="${meanY}" font-size="8" fill="#0f172a" text-anchor="${meanAnchor}" font-weight="700" paint-order="stroke fill" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round">平均: ${valFmt(mean)}</text>`;

  // 中央値線（濃灰破線）
  svgInner += `<line x1="${medianX.toFixed(1)}" y1="${padT}" x2="${medianX.toFixed(1)}" y2="${padT + chartH}" stroke="#475569" stroke-width="1.5" stroke-dasharray="2,2" />`;
  svgInner += `<text x="${medianX.toFixed(1)}" y="${medianY}" font-size="8" fill="#475569" text-anchor="${medianAnchor}" font-weight="700" paint-order="stroke fill" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round">中央: ${valFmt(median)}</text>`;

  // 5. X軸目盛り＆注釈ラベル
  const unitLabel = unitStr ? ` (${unitStr})` : '';
  let noteText = "※KDE: ガウス核推定（度数スケール換算）";
  if (unitStr && (unitStr.includes("Zスコア") || unitStr.includes("Z値"))) {
    noteText = "※Zスコア標準化尺度（平均0, SD=1）";
  } else if (unitStr && unitStr.includes("偏差値")) {
    noteText = "※偏差値尺度（平均50, SD=10）";
  }

  svgInner += `<text x="${padL}" y="${height - 5}" text-anchor="start" font-size="7.8" font-weight="600" fill="#334155">最小: ${valFmt(min)}${unitLabel}</text>`;
  svgInner += `<text x="${padL + chartW}" y="${height - 5}" text-anchor="end" font-size="7.8" font-weight="600" fill="#334155">最大: ${valFmt(max)}${unitLabel}</text>`;
  svgInner += `<text x="${(padL + chartW / 2).toFixed(1)}" y="${height - 5}" text-anchor="middle" font-size="7.2" fill="#64748b">${noteText}</text>`;

  return `
  <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" style="overflow:visible; display:block;">
    ${svgInner}
  </svg>`;
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
  const isZScore = (state.transformMode === "zscore");
  const isTScore = (state.transformMode === "tscore");
  const isPerCapita = (state.transformMode === "per_capita" || state.isPerCapitaMode);

  if (isZScore) {
    transformBadge = "（Zスコア標準化偏差）";
    transformShortLabel = "Zスコア標準化";
    effectiveUnitStr = "Zスコア (平均=0, SD=1)";
    axisUnitStr = "Zスコア";
  } else if (isTScore) {
    transformBadge = "（偏差値 Tスコア）";
    transformShortLabel = "偏差値";
    effectiveUnitStr = "偏差値 (平均=50, SD=10)";
    axisUnitStr = "偏差値";
  } else if (isPerCapita) {
    const mult = state.perCapitaMultiplier || 100;
    if (mult === 100) {
      transformBadge = "（人口100人あたり ％）";
      transformShortLabel = "人口100人あたり(％)";
      axisUnitStr = "%";
    } else if (mult === 1000) {
      transformBadge = "（人口1,000人あたり）";
      transformShortLabel = "人口1,000人あたり";
      axisUnitStr = rawUnitClean ? `${rawUnitClean}/千人` : "1,000人対";
    } else if (mult === 1) {
      transformBadge = "（人口1人あたり）";
      transformShortLabel = "人口1人あたり";
      axisUnitStr = rawUnitClean ? `${rawUnitClean}/人` : "1人対";
    } else {
      transformBadge = `（人口${mult.toLocaleString()}人あたり）`;
      transformShortLabel = `人口${mult.toLocaleString()}人あたり`;
      axisUnitStr = `/${mult.toLocaleString()}人`;
    }
    effectiveUnitStr = rawUnitClean ? `${rawUnitClean} (${transformShortLabel})` : transformShortLabel;
  } else {
    transformBadge = "（実測値）";
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
    ? `<div style="font-size:0.68rem; color:#64748b; margin-top:4px; line-height:1.2;">※平均値は各市町村の単純算術平均（人口加重なし）</div>`
    : '';

  const statTableHtml = `
    <table class="rep-stat-table">
      <tbody>
        <tr>
          <th>対象自治体数</th>
          <td>${n} / 40 市町村</td>
        </tr>
        <tr>
          <th>合　計</th>
          <td>${sumDisplay}</td>
        </tr>
        <tr>
          <th>平均値 (Mean)</th>
          <td>${formatReportVal(mean)}</td>
        </tr>
        <tr>
          <th>中央値 (Median)</th>
          <td>${formatReportVal(median)}</td>
        </tr>
        <tr>
          <th>最　大 (Max)</th>
          <td>${formatReportVal(maxEntry[1])}<span class="muni-tag">(${maxEntry[0]})</span></td>
        </tr>
        <tr>
          <th>最　小 (Min)</th>
          <td>${formatReportVal(minEntry[1])}<span class="muni-tag">(${minEntry[0]})</span></td>
        </tr>
        <tr>
          <th>標準偏差 (SD)</th>
          <td>${formatReportVal(stdDev)}</td>
        </tr>
        <tr>
          <th>四分位範囲 (IQR)</th>
          <td>${formatReportVal(iqr)}</td>
        </tr>
      </tbody>
    </table>
    ${avgNoteHtml}
  `;

  // Rankings (上位・下位各10位)
  const rankLimit = 10;
  const topRank = [...sorted].reverse().slice(0, rankLimit);
  const bottomRank = [...sorted].slice(0, rankLimit);

  const rankRows = (list, isTop) => list.map((item, idx) => `
    <tr>
      <td class="rank-num">${idx + 1}</td>
      <td class="rank-name" title="${item[0]}">${item[0]}</td>
      <td class="rank-val">${formatReportVal(item[1])}</td>
    </tr>
  `).join("");

  const rankGridHtml = `
    <div class="rep-rank-grid">
      <div>
        <div class="rep-rank-sub"><i class="fa-solid fa-arrow-trend-up me-1"></i>上位 ${rankLimit} 自治体</div>
        <table class="rep-rank-table">
          <tbody>${rankRows(topRank, true)}</tbody>
        </table>
      </div>
      <div>
        <div class="rep-rank-sub"><i class="fa-solid fa-arrow-trend-down me-1"></i>下位 ${rankLimit} 自治体</div>
        <table class="rep-rank-table">
          <tbody>${rankRows(bottomRank, false)}</tbody>
        </table>
      </div>
    </div>
  `;

  const distSvgHtml = `
    <div class="rep-dist-svg-wrap">
      ${buildReportDistributionSVG(nums, min, mean, median, max, orientation === "portrait" ? 630 : 530, orientation === "portrait" ? 130 : 118, axisUnitStr, formatReportVal)}
    </div>
  `;

  const repSubHtml = `
    <p class="rep-sub">
      ${subtitle ? subtitle + ' ｜ ' : ''}
      <strong>${varName}</strong>
      ${effectiveUnitStr ? ` <span style="font-weight:normal; color:#475569;">[${effectiveUnitStr}]</span>` : ''}
      <span class="rep-mode-badge" style="display:inline-block; margin-left:8px; padding:2px 8px; font-size:0.75rem; font-weight:700; background:#f1f5f9; border:1px solid #94a3b8; border-radius:4px; color:#0f172a;">${transformBadge}</span>
    </p>
  `;

  // First render initial template with loading state for map image
  if (orientation === "landscape") {
    sheet.innerHTML = `
      <header class="rep-header">
        <div class="rep-title-group">
          <h1>${title}</h1>
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
                <span class="rep-legend-item"><span class="rep-legend-box"></span>度数(ヒストグラム)</span>
                <span class="rep-legend-item"><span class="rep-legend-line rep-kde-line"></span>KDE密度曲線</span>
                <span class="rep-legend-item"><span class="rep-legend-line rep-mean-line"></span>平均値</span>
                <span class="rep-legend-item"><span class="rep-legend-line rep-median-line"></span>中央値</span>
              </div>
            </div>
            ${distSvgHtml}
          </div>
        </div>

        <div class="rep-info-col">
          <div class="rep-card">
            <div class="rep-card-title"><i class="fa-solid fa-table-cells" style="color:#0f172a;"></i> 基本統計サマリー <span style="font-size:0.75rem; font-weight:normal; color:#64748b;">(${transformShortLabel})</span></div>
            ${statTableHtml}
          </div>

          <div class="rep-card" style="flex:1;">
            <div class="rep-card-title"><i class="fa-solid fa-ranking-star" style="color:#0f172a;"></i> 自治体ランキング (上位・下位各10) <span style="font-size:0.75rem; font-weight:normal; color:#64748b;">(${axisUnitStr || transformShortLabel})</span></div>
            ${rankGridHtml}
          </div>
        </div>
      </main>

      <footer class="rep-footer">
        <div class="rep-footer-remarks">${remarksText || '※ 本資料は完全ローカル環境で作成・出力されたデータ分析レポートです。'}</div>
        <div class="rep-footer-brand">青森県市町村コロプレスツール</div>
      </footer>
    `;
  } else {
    // Portrait Mode
    sheet.innerHTML = `
      <header class="rep-header">
        <div class="rep-title-group">
          <h1 style="font-size:1.35rem;">${title}</h1>
          ${repSubHtml}
        </div>
        <div class="rep-meta-badge">
          <div class="rep-date">作成日: ${dateStr}</div>
        </div>
      </header>

      <main class="rep-body-portrait">
        <div class="rep-map-frame rep-portrait-top">
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
              <span class="rep-legend-item"><span class="rep-legend-box"></span>度数(ヒストグラム)</span>
              <span class="rep-legend-item"><span class="rep-legend-line rep-kde-line"></span>KDE密度曲線</span>
              <span class="rep-legend-item"><span class="rep-legend-line rep-mean-line"></span>平均値</span>
              <span class="rep-legend-item"><span class="rep-legend-line rep-median-line"></span>中央値</span>
            </div>
          </div>
          ${distSvgHtml}
        </div>

        <div class="rep-portrait-bottom">
          <div class="rep-info-col">
            <div class="rep-card">
              <div class="rep-card-title"><i class="fa-solid fa-table-cells" style="color:#0f172a;"></i> 基本統計サマリー <span style="font-size:0.75rem; font-weight:normal; color:#64748b;">(${transformShortLabel})</span></div>
              ${statTableHtml}
            </div>
            <div class="rep-card" style="flex:1;">
              <div class="rep-card-title"><i class="fa-solid fa-circle-info" style="color:#0f172a;"></i> 備考・出典</div>
              <div style="font-size:0.72rem; color:#475569; line-height:1.4; white-space:pre-line;">${remarksText || '※ 本資料は完全ローカル環境で作成・出力されたデータ分析レポートです。'}</div>
            </div>
          </div>

          <div class="rep-info-col">
            <div class="rep-card" style="flex:1;">
              <div class="rep-card-title"><i class="fa-solid fa-ranking-star" style="color:#0f172a;"></i> 自治体ランキング (上位・下位各10) <span style="font-size:0.75rem; font-weight:normal; color:#64748b;">(${axisUnitStr || transformShortLabel})</span></div>
              ${rankGridHtml}
            </div>
          </div>
        </div>
      </main>

      <footer class="rep-footer">
        <div class="rep-footer-remarks">分析対象: 青森県全40市町村 (${n}市町村の有効データを集計)</div>
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

