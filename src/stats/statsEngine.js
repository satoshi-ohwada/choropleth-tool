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
      let valCurr = list[id];
      if (valCurr <= kclass[0] && id + 1 < list.length) {
        kclass[count - 1] = (list[id] + list[id + 1]) / 2.0;
      } else {
        kclass[count - 1] = valCurr;
      }
    } else {
      kclass[count - 1] = list[0];
    }
    last = pivot - 1;
    count--;
  }

  for (let i = 1; i < kclass.length; i++) {
    if (kclass[i] <= kclass[i - 1]) {
      let candidate = list.find(x => x > kclass[i - 1]);
      if (candidate !== undefined) {
        kclass[i] = candidate;
      } else {
        kclass[i] = kclass[i - 1] + 1e-4;
      }
    }
  }

  return kclass;
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
        baseVals[key] = (val / base) * (state.perCapitaMultiplier || 10000);
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
    let sum = numericVals.reduce((a, b) => a + b, 0);
    let mean = sum / numericVals.length;
    let variance = numericVals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numericVals.length;
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

export function calculateStats(effectiveValuesObj) {
  const vals = Object.entries(effectiveValuesObj)
    .filter(([name, v]) => typeof v === 'number' && !isNaN(v));

  let specialCount = 0;
  Object.values(effectiveValuesObj).forEach(v => {
    if (isSpecialValue(v)) specialCount++;
  });

  if (vals.length === 0) {
    return { count: 0, specialCount, sum: 0, mean: 0, median: 0, max: null, min: null, q1: 0, q3: 0, iqr: 0 };
  }

  const numList = vals.map(v => v[1]).sort((a, b) => a - b);
  const sum = numList.reduce((a, b) => a + b, 0);
  const mean = sum / numList.length;
  
  let median = 0;
  let mid = Math.floor(numList.length / 2);
  if (numList.length % 2 === 0) {
    median = (numList[mid - 1] + numList[mid]) / 2;
  } else {
    median = numList[mid];
  }

  let q1Idx = Math.floor(numList.length * 0.25);
  let q3Idx = Math.floor(numList.length * 0.75);
  let q1 = numList[q1Idx];
  let q3 = numList[q3Idx];

  let maxEntry = vals.reduce((prev, curr) => (curr[1] > prev[1]) ? curr : prev, vals[0]);
  let minEntry = vals.reduce((prev, curr) => (curr[1] < prev[1]) ? curr : prev, vals[0]);

  return {
    count: vals.length,
    specialCount,
    sum,
    mean,
    median,
    q1,
    q3,
    iqr: q3 - q1,
    max: maxEntry,
    min: minEntry,
    numList
  };
}

export function updateStatsSummary() {
  const vals = Object.entries(getEffectiveValues())
    .filter(([name, v]) => typeof v === 'number' && !isNaN(v));

  const countEl = document.getElementById("stat-count");
  const sumEl = document.getElementById("stat-sum");
  const meanEl = document.getElementById("stat-mean");
  const medianEl = document.getElementById("stat-median");
  const maxEl = document.getElementById("stat-max");
  const minEl = document.getElementById("stat-min");

  if (!countEl) return;

  let specialCount = 0;
  Object.values(getEffectiveValues()).forEach(v => {
    if (isSpecialValue(v)) specialCount++;
  });

  if (specialCount > 0) {
    countEl.innerHTML = `${vals.length} <small style="font-size:0.75rem; color:#d97706; font-weight:700;">(秘匿等${specialCount})</small>`;
    countEl.title = `有効数値データ: ${vals.length} 自治体 / 秘匿・欠測等: ${specialCount} 自治体`;
  } else {
    countEl.textContent = `${vals.length} / 40`;
    countEl.title = `有効数値データ: ${vals.length} 自治体`;
  }
  countEl.className = (vals.length + specialCount) === 40 ? "stat-value text-blue" : "stat-value text-orange";

  if (vals.length === 0) {
    if (sumEl) sumEl.textContent = "-";
    if (meanEl) meanEl.textContent = "-";
    if (medianEl) medianEl.textContent = "-";
    if (maxEl) maxEl.textContent = "-";
    if (minEl) minEl.textContent = "-";
    renderDistributionChart([]);
    return;
  }

  const numList = vals.map(v => v[1]).sort((a, b) => a - b);
  const sum = numList.reduce((a, b) => a + b, 0);
  const mean = sum / numList.length;
  
  let median = 0;
  let mid = Math.floor(numList.length / 2);
  if (numList.length % 2 === 0) {
    median = (numList[mid - 1] + numList[mid]) / 2;
  } else {
    median = numList[mid];
  }

  let maxEntry = vals.reduce((prev, curr) => (curr[1] > prev[1]) ? curr : prev, vals[0]);
  let minEntry = vals.reduce((prev, curr) => (curr[1] < prev[1]) ? curr : prev, vals[0]);

  if (sumEl) sumEl.textContent = formatNumber(sum);
  if (meanEl) meanEl.textContent = formatNumber(mean);
  if (medianEl) medianEl.textContent = formatNumber(median);
  
  if (maxEl) {
    maxEl.textContent = `${formatNumber(maxEntry[1])} (${maxEntry[0]})`;
    maxEl.title = `${maxEntry[0]}: ${maxEntry[1].toLocaleString()}`;
  }
  
  if (minEl) {
    minEl.textContent = `${formatNumber(minEntry[1])} (${minEntry[0]})`;
    minEl.title = `${minEntry[0]}: ${minEntry[1].toLocaleString()}`;
  }

  renderDistributionChart(vals);
  renderBoxPlot();
}

export function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return "-";
  if (Math.abs(num) >= 100000000) {
    let val = (num / 100000000);
    return (val % 1 === 0 ? val.toLocaleString() : val.toFixed(1)) + "億";
  }
  if (Math.abs(num) >= 10000) {
    let val = (num / 10000);
    return (val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)) + "万";
  }
  if (Math.abs(num) < 10 && num % 1 !== 0) {
    return num.toFixed(2);
  }
  return (num % 1 === 0) ? num.toLocaleString() : num.toFixed(1);
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
