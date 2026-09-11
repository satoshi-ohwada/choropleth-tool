// Statistics Engine & Data Transformations
import { state } from '../core/state.js';
import { isSpecialValue } from '../parsers/numberParser.js';
import { renderDistributionChart } from './histogramRenderer.js';
import { renderBoxPlot } from '../map/boxplotRenderer.js';

export function getJenksBreaks(dataList, numClasses) {
  let list = dataList.filter(v => typeof v === 'number' && !isNaN(v)).sort((a, b) => a - b);
  if (list.length === 0) return [];
  
  let uniqueVals = [...new Set(list)];
  let k = Math.min(numClasses, uniqueVals.length);
  if (k <= 1) {
    return [list[0], list[list.length - 1]];
  }

  let n = list.length;
  let mat1 = Array.from({ length: n + 1 }, () => Array(k + 1).fill(0));
  let mat2 = Array.from({ length: n + 1 }, () => Array(k + 1).fill(0));

  for (let y = 1; y <= k; y++) {
    mat1[1][y] = 1;
    mat2[1][y] = 0;
    for (let t = 2; t <= n; t++) {
      mat2[t][y] = Infinity;
    }
  }

  let v = 0;
  for (let l = 2; l <= n; l++) {
    let s1 = 0;
    let s2 = 0;
    let w = 0;
    for (let m = 1; m <= l; m++) {
      let i3 = l - m + 1;
      let val = list[i3 - 1];
      s2 += val * val;
      s1 += val;
      w++;
      v = s2 - (s1 * s1) / w;
      let i4 = i3 - 1;
      if (i4 !== 0) {
        for (let j = 2; j <= k; j++) {
          if (mat2[l][j] >= (v + mat2[i4][j - 1])) {
            mat1[l][j] = i3;
            mat2[l][j] = v + mat2[i4][j - 1];
          }
        }
      }
    }
    mat1[l][1] = 1;
    mat2[l][1] = v;
  }

  let kclass = Array(k + 1).fill(0);
  kclass[k] = list[list.length - 1];
  kclass[0] = list[0];
  let count = k;
  let last = n;

  while (count >= 2) {
    let pivot = parseInt(mat1[last][count], 10);
    let id = pivot - 2;
    if (id >= 0 && id < list.length) {
      kclass[count - 1] = list[id];
    } else {
      kclass[count - 1] = list[0];
    }
    last = pivot - 1;
    count--;
  }

  let cleanBreaks = [...new Set(kclass)].sort((a, b) => a - b);
  if (cleanBreaks[0] > list[0]) cleanBreaks.unshift(list[0]);
  if (cleanBreaks[cleanBreaks.length - 1] < list[list.length - 1]) cleanBreaks.push(list[list.length - 1]);
  if (cleanBreaks.length < 2) {
    return [list[0], list[list.length - 1]];
  }
  return cleanBreaks;
}

export function computeQuantileBreaks(dataList, numClasses) {
  let list = dataList.filter(v => typeof v === 'number' && !isNaN(v)).sort((a, b) => a - b);
  if (list.length === 0) return [];
  let breaks = [list[0]];
  for (let i = 1; i < numClasses; i++) {
    let idx = Math.floor((i / numClasses) * (list.length - 1));
    breaks.push(list[idx]);
  }
  breaks.push(list[list.length - 1]);
  return [...new Set(breaks)];
}

export function getEffectiveValues() {
  let baseVals = {};
  if (state.transformMode === "per_capita" || state.isPerCapitaMode) {
    for (let key in state.currentValues) {
      let val = state.currentValues[key];
      let base = state.baselinePopulation[key];
      if (typeof val === 'number' && typeof base === 'number' && base > 0) {
        baseVals[key] = (val / base) * (state.perCapitaMultiplier || 100);
      } else {
        baseVals[key] = val;
      }
    }
    return baseVals;
  } else if (state.transformMode === "zscore" || state.transformMode === "tscore") {
    let numericVals = [];
    for (let key in state.currentValues) {
      let v = state.currentValues[key];
      if (typeof v === 'number' && !isNaN(v)) numericVals.push(v);
    }
    if (numericVals.length === 0) return state.currentValues;
    let count = numericVals.length;
    let sum = numericVals.reduce((a, b) => a + b, 0);
    let mean = sum / count;
    let variance = count > 1 ? numericVals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (count - 1) : 0;
    let std = Math.sqrt(variance);

    for (let key in state.currentValues) {
      let v = state.currentValues[key];
      if (typeof v === 'number' && !isNaN(v)) {
        if (std === 0) {
          baseVals[key] = state.transformMode === "tscore" ? 50 : 0;
        } else {
          let z = (v - mean) / std;
          baseVals[key] = state.transformMode === "tscore" ? (50 + z * 10) : z;
        }
      } else {
        baseVals[key] = v;
      }
    }
    return baseVals;
  }
  return state.currentValues;
}

export function computePercentile(sortedNums, p) {
  const n = sortedNums.length;
  if (n === 0) return 0;
  if (n === 1) return sortedNums[0];
  const idx = p * (n - 1);
  const low = Math.floor(idx);
  const high = Math.ceil(idx);
  const weight = idx - low;
  return sortedNums[low] * (1 - weight) + sortedNums[high] * weight;
}

export function calculateStats(effectiveValuesObj) {
  const vals = Object.entries(effectiveValuesObj)
    .filter(([name, v]) => typeof v === 'number' && !isNaN(v));

  let specialCount = 0;
  Object.values(effectiveValuesObj).forEach(v => {
    if (isSpecialValue(v)) specialCount++;
  });

  if (vals.length === 0) {
    return {
      count: 0,
      specialCount,
      sum: 0,
      mean: 0,
      median: 0,
      q1: 0,
      q3: 0,
      iqr: 0,
      stdDev: 0,
      variance: 0,
      max: ["-", null],
      min: ["-", null],
      sorted: [],
      numList: []
    };
  }

  const sorted = [...vals].sort((a, b) => a[1] - b[1]);
  const numList = sorted.map(v => v[1]);
  const count = numList.length;
  const sum = numList.reduce((a, b) => a + b, 0);
  const mean = count > 0 ? sum / count : 0;
  
  const variance = count > 1 ? numList.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (count - 1) : 0;
  const stdDev = Math.sqrt(variance);

  const median = computePercentile(numList, 0.50);
  const q1 = computePercentile(numList, 0.25);
  const q3 = computePercentile(numList, 0.75);
  const iqr = q3 - q1;

  const minEntry = sorted[0];
  const maxEntry = sorted[sorted.length - 1];

  return {
    count,
    specialCount,
    sum,
    mean,
    median,
    q1,
    q3,
    iqr,
    stdDev,
    variance,
    max: maxEntry,
    min: minEntry,
    sorted,
    numList
  };
}

export function updateStatsSummary() {
  const effectiveVals = getEffectiveValues();
  const stats = calculateStats(effectiveVals);

  const countEl = document.getElementById("stat-count");
  const sumEl = document.getElementById("stat-sum");
  const meanEl = document.getElementById("stat-mean");
  const medianEl = document.getElementById("stat-median");
  const maxEl = document.getElementById("stat-max");
  const minEl = document.getElementById("stat-min");

  if (!countEl) return;

  if (stats.specialCount > 0) {
    countEl.innerHTML = `${stats.count} <small style="font-size:0.75rem; color:#d97706; font-weight:700;">(秘匿等${stats.specialCount})</small>`;
    countEl.title = `有効数値データ: ${stats.count} 自治体 / 秘匿・欠測等: ${stats.specialCount} 自治体`;
  } else {
    countEl.textContent = `${stats.count} / 40`;
    countEl.title = `有効数値データ: ${stats.count} 自治体`;
  }
  countEl.className = (stats.count + stats.specialCount) === 40 ? "stat-value text-blue" : "stat-value text-orange";

  if (stats.count === 0) {
    if (sumEl) sumEl.textContent = "-";
    if (meanEl) meanEl.textContent = "-";
    if (medianEl) medianEl.textContent = "-";
    if (maxEl) maxEl.textContent = "-";
    if (minEl) minEl.textContent = "-";
    renderDistributionChart([]);
    return;
  }

  const isRatioOrTransformed = (state.transformMode === "per_capita" || state.isPerCapitaMode || state.transformMode === "zscore" || state.transformMode === "tscore");

  if (sumEl) {
    if (isRatioOrTransformed) {
      sumEl.textContent = "- (対象外)";
      sumEl.title = "※比率・標準化データのため単純合算は行いません";
    } else {
      sumEl.textContent = formatNumber(stats.sum);
      sumEl.title = `合　計: ${stats.sum.toLocaleString()}`;
    }
  }

  if (meanEl) {
    meanEl.textContent = formatNumber(stats.mean);
    meanEl.title = `平均値: ${stats.mean.toLocaleString()}`;
  }

  if (medianEl) {
    medianEl.textContent = formatNumber(stats.median);
    medianEl.title = `中央値: ${stats.median.toLocaleString()}`;
  }
  
  if (maxEl) {
    maxEl.textContent = `${formatNumber(stats.max[1])} (${stats.max[0]})`;
    maxEl.title = `${stats.max[0]}: ${stats.max[1].toLocaleString()}`;
  }
  
  if (minEl) {
    minEl.textContent = `${formatNumber(stats.min[1])} (${stats.min[0]})`;
    minEl.title = `${stats.min[0]}: ${stats.min[1].toLocaleString()}`;
  }

  renderDistributionChart(stats.sorted);
  renderBoxPlot();
}

export function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return "-";
  const isInt = (v) => Math.abs(v - Math.round(v)) < 1e-6;
  if (Math.abs(num) >= 100000000) {
    let val = (num / 100000000);
    return (isInt(val) ? Math.round(val).toLocaleString() : val.toFixed(1)) + "億";
  }
  if (Math.abs(num) >= 10000) {
    let val = (num / 10000);
    return (isInt(val) ? Math.round(val).toLocaleString() : val.toFixed(1)) + "万";
  }
  if (Math.abs(num) < 10 && !isInt(num)) {
    return num.toFixed(2);
  }
  return isInt(num) ? Math.round(num).toLocaleString() : num.toFixed(1);
}


export function getEffectiveUnit() {
  if (state.transformMode === "zscore") return "Zスコア (平均=0, SD=1)";
  if (state.transformMode === "tscore") return "偏差値 (平均=50, SD=10)";
  if (state.transformMode === "per_capita") {
    const mult = state.perCapitaMultiplier || 100;
    return mult === 1 ? "1人あたり" : mult === 100 ? "100人あたり(％)" : mult === 1000 ? "1,000人あたり" : `${mult.toLocaleString()}人あたり`;
  }
  return state.unit || "";
}
