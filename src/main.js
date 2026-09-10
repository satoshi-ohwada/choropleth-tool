// Aomori Choropleth Studio - Modular Main Entrypoint
import './style.css';
import { state } from './core/state.js';
import { loadGeoJSONData, initLeafletMap, renderGeoJSONLayer } from './map/mapRenderer.js';
import { updateDataTable } from './ui/tableEditor.js';
import { bindUIEvents, resetAppState } from './ui/uiController.js';
import { updateStatsSummary } from './stats/statsEngine.js';
import { normalizeName } from './parsers/muniMatcher.js';
import { showToast } from './ui/toast.js';

import baselinePopCsv from '../public/data/baseline_population_2020.csv?raw';

export function loadBaselinePopulation() {
  return Promise.resolve(baselinePopCsv)
    .then(text => {
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",");
        if (parts.length >= 3) {
          let muniName = normalizeName(parts[1]) || parts[1];
          let pop = parseFloat(parts[2]);
          if (muniName && !isNaN(pop)) {
            state.baselinePopulation[muniName] = pop;
          }
        }
      }
      console.log("Baseline population loaded successfully:", Object.keys(state.baselinePopulation).length, "municipalities");
    });
}

document.addEventListener("DOMContentLoaded", () => {
  // Bind UI Events
  bindUIEvents();
  
  // Initialize DataTable & Stats
  updateDataTable();
  updateStatsSummary();

  // Load Baseline Population and GeoJSON Data asynchronously
  loadBaselinePopulation()
    .then(() => loadGeoJSONData())
    .then(() => {
      resetAppState(false);
      showToast("青森県境界データ(GeoJSON)および基準人口データの読み込みが完了しました", "info");
    })
    .catch(err => {
      console.error(err);
      showToast("初期データ(GeoJSON/人口データ)の読み込みに失敗しました", "error");
    });
});
