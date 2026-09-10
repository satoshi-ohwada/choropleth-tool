// SVG Histogram & Kernel Density Estimation (KDE) Curve Renderer
import { formatNumber } from './statsEngine.js';

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

  const svgW = 500;
  const svgH = 180;
  const padL = 30;
  const padR = 20;
  const padT = 20;
  const padB = 30;
  const chartW = svgW - padL - padR;
  const chartH = svgH - padT - padB;

  let barsHTML = "";
  const barW = chartW / numBins;

  bins.forEach((cnt, i) => {
    const h = (cnt / maxBinCount) * chartH;
    const x = padL + i * barW + 2;
    const y = padT + (chartH - h);
    const w = barW - 4;
    barsHTML += `
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#6366f1" opacity="0.65" rx="3" ry="3">
        <title>階級 ${i + 1}: ${cnt}自治体 (${formatNumber(min + i * binWidth)} 〜 ${formatNumber(min + (i + 1) * binWidth)})</title>
      </rect>
      ${cnt > 0 ? `<text x="${x + w / 2}" y="${y - 4}" font-size="10" font-weight="bold" fill="#4338ca" text-anchor="middle">${cnt}</text>` : ""}
    `;
  });

  // Gaussian Kernel Density Estimation (KDE)
  const hBandwidth = 1.06 * sd * Math.pow(n, -0.2);
  const kdeSteps = 60;
  let kdePoints = [];
  let maxDensity = 0;

  for (let step = 0; step <= kdeSteps; step++) {
    const xVal = min + (step / kdeSteps) * range;
    let kdeSum = 0;
    nums.forEach(v => {
      const u = (xVal - v) / (hBandwidth || 1);
      kdeSum += Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
    });
    const density = kdeSum / (n * (hBandwidth || 1));
    if (density > maxDensity) maxDensity = density;
    kdePoints.push({ xVal, density });
  }

  let kdePathD = "";
  kdePoints.forEach((pt, idx) => {
    const px = padL + ((pt.xVal - min) / range) * chartW;
    const py = padT + chartH - (pt.density / (maxDensity || 1)) * (chartH * 0.85);
    kdePathD += (idx === 0 ? "M" : "L") + ` ${px.toFixed(1)} ${py.toFixed(1)}`;
  });

  const meanX = padL + ((mean - min) / range) * chartW;
  const meanLineHTML = `
    <line x1="${meanX}" y1="${padT}" x2="${meanX}" y2="${padT + chartH}" stroke="#ef4444" stroke-width="2" stroke-dasharray="4 3"/>
    <text x="${meanX + 4}" y="${padT + 12}" font-size="10" font-weight="bold" fill="#ef4444">平均: ${formatNumber(mean)}</text>
  `;

  svg.innerHTML = `
    <g class="grid-lines">
      <line x1="${padL}" y1="${padT + chartH}" x2="${padL + chartW}" y2="${padT + chartH}" stroke="#cbd5e1" stroke-width="1"/>
    </g>
    ${barsHTML}
    <path d="${kdePathD}" fill="none" stroke="#312e81" stroke-width="2.5" stroke-linejoin="round"/>
    ${meanLineHTML}
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
