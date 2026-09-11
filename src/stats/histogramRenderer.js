// SVG Histogram & Kernel Density Estimation (KDE) Curve Renderer
import { formatNumber, computePercentile } from './statsEngine.js';

export function renderDistributionChart(valEntries) {
  const svg = document.getElementById("dist-chart-svg");
  const badge = document.getElementById("dist-skew-badge");
  const adviceText = document.getElementById("dist-zscore-advice-text");
  const minLabel = document.getElementById("dist-chart-min-label");
  const meanLabel = document.getElementById("dist-chart-mean-label");
  const maxLabel = document.getElementById("dist-chart-max-label");

  if (!svg) return;

  if (!valEntries || valEntries.length < 3) {
    svg.innerHTML = `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-size="12">データ入力後にヒストグラムと密度曲線を描画します</text>`;
    if (badge) {
      badge.textContent = "未判定";
      badge.className = "badge badge-secondary";
      badge.style.background = "#94a3b8";
    }
    if (adviceText) {
      adviceText.textContent = "データを読み込むと、分布の歪み（歪度）およびZスコア・偏差値利用の可否アドバイスが表示されます。";
    }
    if (minLabel) minLabel.textContent = "最小: -";
    if (meanLabel) meanLabel.textContent = "平均: -";
    if (maxLabel) maxLabel.textContent = "最大: -";
    return;
  }

  const nums = valEntries.map(e => e[1]).sort((a, b) => a - b);
  const n = nums.length;
  const min = nums[0];
  const max = nums[nums.length - 1];
  const range = (max - min) || 1;

  const sum = nums.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  
  const variance = nums.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1 || 1);
  const sd = Math.sqrt(variance) || 1;

  const m3 = nums.reduce((acc, v) => acc + Math.pow(v - mean, 3), 0) / n;
  const skewness = sd > 0 ? (m3 / Math.pow(sd, 3)) : 0;

  if (minLabel) minLabel.textContent = `最小: ${formatNumber(min)}`;
  if (meanLabel) meanLabel.textContent = `平均: ${formatNumber(mean)}`;
  if (maxLabel) maxLabel.textContent = `最大: ${formatNumber(max)}`;

  const numBins = 7;
  const binWidth = range / numBins;
  const bins = Array(numBins).fill(0);

  nums.forEach(v => {
    let idx = Math.floor((v - min) / binWidth);
    if (idx >= numBins) idx = numBins - 1;
    bins[idx]++;
  });

  const maxBinCount = Math.max(...bins, 1);

  // Kernel Density Estimation (KDE) - Silverman's rule of thumb with IQR
  const q1 = computePercentile(nums, 0.25);
  const q3 = computePercentile(nums, 0.75);
  const iqr = (q3 - q1) || sd;
  const bw = (0.9 * Math.min(sd, iqr / 1.34) * Math.pow(n, -0.2)) || (range / 8);

  const kdeSteps = 60;
  let kdePoints = [];
  let kdeScaledMax = 0;

  for (let step = 0; step <= kdeSteps; step++) {
    const xVal = min + (step / kdeSteps) * range;
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

  const svgW = 500;
  const svgH = 180;
  const padL = 34;
  const padR = 20;
  const padT = 22;
  const padB = 26;
  const chartW = svgW - padL - padR;
  const chartH = svgH - padT - padB;

  let barsHTML = "";
  const barW = chartW / numBins;

  bins.forEach((cnt, i) => {
    const h = (cnt / yMax) * chartH;
    const x = padL + i * barW + 2;
    const y = padT + (chartH - h);
    const w = barW - 4;
    barsHTML += `
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#6366f1" opacity="0.65" rx="3" ry="3">
        <title>階級 ${i + 1}: ${cnt}自治体 (${formatNumber(min + i * binWidth)} 〜 ${formatNumber(min + (i + 1) * binWidth)})</title>
      </rect>
      ${cnt > 0 ? `<text x="${(x + w / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" font-size="10" font-weight="bold" fill="#4338ca" text-anchor="middle">${cnt}</text>` : ""}
    `;
  });

  let kdePathD = "";
  kdePoints.forEach((pt, idx) => {
    const px = padL + ((pt.xVal - min) / range) * chartW;
    const py = padT + chartH - (pt.scaledDensity / yMax) * chartH;
    kdePathD += (idx === 0 ? "M" : "L") + ` ${px.toFixed(1)} ${py.toFixed(1)}`;
  });

  const median = computePercentile(nums, 0.50);
  const meanX = padL + ((mean - min) / range) * chartW;
  const medianX = padL + ((median - min) / range) * chartW;

  const midCount = Math.round(yMax / 2);
  const midY = padT + chartH - (midCount / yMax) * chartH;

  const axisHTML = `
    <g class="grid-lines">
      <line x1="${padL}" y1="${padT + chartH}" x2="${padL + chartW}" y2="${padT + chartH}" stroke="#334155" stroke-width="1.2"/>
      <line x1="${padL}" y1="${midY.toFixed(1)}" x2="${padL + chartW}" y2="${midY.toFixed(1)}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3,3"/>
      <line x1="${padL}" y1="${padT}" x2="${padL + chartW}" y2="${padT}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="2,2"/>
      <text x="${padL - 4}" y="${padT + chartH + 3}" font-size="8.5" fill="#64748b" text-anchor="end">0</text>
      <text x="${padL - 4}" y="${(midY + 3).toFixed(1)}" font-size="8.5" fill="#64748b" text-anchor="end">${midCount}</text>
      <text x="${padL - 4}" y="${padT + 3}" font-size="8.5" fill="#64748b" text-anchor="end">${yMax}</text>
      <text x="${padL}" y="${padT - 8}" font-size="8.5" fill="#64748b" font-weight="700">度数</text>
    </g>
  `;

  const meanLineHTML = `
    <line x1="${meanX.toFixed(1)}" y1="${padT}" x2="${meanX.toFixed(1)}" y2="${padT + chartH}" stroke="#ef4444" stroke-width="1.8" stroke-dasharray="4 3"/>
    <text x="${meanX > padL + chartW - 55 ? (meanX - 4).toFixed(1) : (meanX + 4).toFixed(1)}" y="${padT + 12}" font-size="9" font-weight="bold" fill="#ef4444" text-anchor="${meanX > padL + chartW - 55 ? 'end' : 'start'}">平均: ${formatNumber(mean)}</text>
  `;

  const medianLineHTML = `
    <line x1="${medianX.toFixed(1)}" y1="${padT}" x2="${medianX.toFixed(1)}" y2="${padT + chartH}" stroke="#475569" stroke-width="1.6" stroke-dasharray="2 2"/>
    <text x="${medianX > padL + chartW - 55 ? (medianX - 4).toFixed(1) : (medianX + 4).toFixed(1)}" y="${padT + 23}" font-size="9" font-weight="bold" fill="#475569" text-anchor="${medianX > padL + chartW - 55 ? 'end' : 'start'}">中央: ${formatNumber(median)}</text>
  `;

  svg.innerHTML = `
    ${axisHTML}
    ${barsHTML}
    <path d="${kdePathD}" fill="none" stroke="#312e81" stroke-width="2.2" stroke-linejoin="round"/>
    ${meanLineHTML}
    ${medianLineHTML}
  `;

  if (badge && adviceText) {
    if (Math.abs(skewness) <= 0.5) {
      badge.textContent = "正規分布に近い (左右対称)";
      badge.className = "badge badge-success";
      badge.style.background = "#10b981";
      adviceText.textContent = "データはほぼ左右対称の正規分布です。Zスコア（標準化）や偏差値変換による分析・比較が極めて有効です。";
    } else if (skewness > 0.5) {
      badge.textContent = `右に裾が長い (正の歪み ${skewness.toFixed(2)})`;
      badge.className = "badge badge-warning";
      badge.style.background = "#f59e0b";
      adviceText.textContent = "都市部や一部自治体に高い値が集中しています。Zスコア/偏差値変換のほか、人口1万人当たり補正や分位数（Quantile）階級区分も検討してください。";
    } else {
      badge.textContent = `左に裾が長い (負の歪み ${skewness.toFixed(2)})`;
      badge.className = "badge badge-info";
      badge.style.background = "#3b82f6";
      adviceText.textContent = "多くの自治体が相対的に高い値に分布しています。Jenks自然分類や等間隔区分での地図表現が適しています。";
    }
  }
}
