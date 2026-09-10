// UI Controller & Event Bindings
import { state } from '../core/state.js';
import { REGION_BOUNDS } from '../config/municipalities.js';
import { initLeafletMap, renderGeoJSONLayer, renderMiniMapLayer, renderLabelsLayer } from '../map/mapRenderer.js';
import { renderBubbleLayer } from '../map/bubbleLayer.js';
import { renderLegend } from '../map/legendRenderer.js';
import { renderBoxPlot, updateBoxplotPosition } from '../map/boxplotRenderer.js';
import { updateDataTable } from './tableEditor.js';
import { updateStatsSummary } from '../stats/statsEngine.js';
import { exportPNG, copyPNGToClipboard, exportCSVData } from '../export/imageExporter.js';
import { generateA4ReportPDF, setPrintPageOrientation } from '../export/pdfExporter.js';
import { showToast } from './toast.js';
import { parseRawText, parseFileInput } from '../parsers/csvParser.js';
import nenkanCsv from '../../public/data/nenkan_data100.csv?raw';
import sugataCsv from '../../public/data/sugata2026.csv?raw';

export { nenkanCsv, sugataCsv };

export function populateVariableDropdowns() {
  const dropdowns = [
    document.getElementById("select-variable-step1"),
    document.getElementById("select-variable-step2"),
    document.getElementById("select-variable-header")
  ].filter(Boolean);

  const keys = Object.keys(state.variables);

  dropdowns.forEach(dd => {
    dd.innerHTML = "";
    if (keys.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "（データ未読み込み）";
      opt.disabled = true;
      opt.selected = true;
      dd.appendChild(opt);
      dd.disabled = true;
    } else {
      dd.disabled = false;
      keys.forEach(key => {
        const v = state.variables[key];
        const opt = document.createElement("option");
        opt.value = key;
        
        let unitClean = v.unit ? v.unit.replace(/^単位[：:]\s*/, "") : "";
        let labelText = v.name + (unitClean && !v.name.includes(unitClean) ? ` (${unitClean})` : "");
        
        opt.textContent = labelText;
        opt.title = labelText;

        if (key === state.activeVariableKey) opt.selected = true;
        dd.appendChild(opt);
      });
      if (state.activeVariableKey) dd.value = state.activeVariableKey;
    }
  });
}

export function switchActiveVariable(key, notify = true) {
  if (!key || !state.variables[key]) return;
  const v = state.variables[key];
  state.activeVariableKey = key;

  const card = document.getElementById("variable-select-card");
  if (card) card.classList.remove("hidden");

  ["select-variable-step1", "select-variable-step2", "select-variable-header"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = false;
      el.value = key;
    }
  });

  state.currentValues = Object.assign({}, v.data);
  state.title = v.title || `市町村別 ${v.name}`;
  state.subtitle = v.subtitle || "";
  if (v.unit) {
    state.unit = (v.unit.startsWith("単位：") || v.unit.startsWith("単位:")) ? v.unit : `単位：${v.unit}`;
  } else {
    state.unit = "";
  }
  state.remarks = v.remarks || "";

  if (!state.paletteKey) {
    state.paletteKey = v.palette || "blues";
  }

  document.querySelectorAll(".palette-btn").forEach(btn => {
    btn.classList.toggle("active", !state.useCustomGradient && btn.getAttribute("data-palette") === state.paletteKey);
  });

  const titleInput = document.getElementById("map-title-input");
  const subTitleInput = document.getElementById("map-subtitle-input");
  const unitInput = document.getElementById("map-unit-input");
  const remarksInput = document.getElementById("map-remarks-input");

  if (titleInput) titleInput.value = state.title;
  if (subTitleInput) subTitleInput.value = state.subtitle;
  if (unitInput) unitInput.value = state.unit;
  if (remarksInput) remarksInput.value = state.remarks;

  const displayTitle = document.getElementById("display-map-title");
  const displaySubtitle = document.getElementById("display-map-subtitle");
  const displayUnit = document.getElementById("display-legend-unit");
  const displayRemarks = document.getElementById("display-map-remarks");

  if (displayTitle) displayTitle.textContent = state.title;
  if (displaySubtitle) displaySubtitle.textContent = state.subtitle;
  if (displayUnit) displayUnit.textContent = state.unit;
  if (displayRemarks) displayRemarks.textContent = state.remarks;

  let currentModeVal = state.isPerCapitaMode ? `per_capita_${state.perCapitaMultiplier || 100}` : state.transformMode;
  ["select-transform-mode", "select-transform-mode-step1"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = currentModeVal;
  });

  updatePerCapitaUnit();

  const badge = document.getElementById("variable-meta-badge");
  if (badge) {
    badge.textContent = `${state.unit ? state.unit + ' | ' : ''}全40自治体データ読込済`;
  }

  const thVal = document.getElementById("th-val-col");
  if (thVal) {
    thVal.textContent = `${v.name || '数値'}（${v.unit || '入力'}）`;
  }

  try { updateDataTable(); } catch (e) { console.error(e); }
  try { renderGeoJSONLayer(); } catch (e) { console.error(e); }
  try { renderMiniMapLayer(); } catch (e) { console.error(e); }
  try { updateStatsSummary(); } catch (e) { console.error(e); }

  if (notify) {
    showToast(`作図項目を「${v.name}」に変更しました`, "info");
  }
}

export function updatePerCapitaUnit() {
  const v = state.variables[state.activeVariableKey];
  let baseUnit = v && v.unit ? `単位：${v.unit}` : "";
  
  if (state.isPerCapitaMode) {
    let label = "100人(%)";
    if (state.perCapitaMultiplier === 1) label = "1人";
    else if (state.perCapitaMultiplier === 100) label = "100人(%)";
    else if (state.perCapitaMultiplier === 1000) label = "1,000人";
    else if (state.perCapitaMultiplier === 10000) label = "1万人";
    else if (state.perCapitaMultiplier === 100000) label = "10万人";
    state.unit = baseUnit ? `${baseUnit} (${label}あたり)` : `単位：/${label}`;
  } else if (state.transformMode === "zscore") {
    state.unit = "単位：Zスコア (平均=0, SD=1)";
  } else if (state.transformMode === "tscore") {
    state.unit = "単位：偏差値 (平均=50, SD=10)";
  } else {
    state.unit = baseUnit;
  }

  const displayUnit = document.getElementById("display-legend-unit");
  const unitInput = document.getElementById("map-unit-input");
  if (displayUnit) displayUnit.textContent = state.unit;
  if (unitInput) unitInput.value = state.unit;
}

export function updateZScorePaletteUI() {
  const box = document.getElementById("zscore-palette-box") || document.getElementById("zscore-palette-card");
  const badge = document.getElementById("zscore-palette-badge");
  if (!box) return;
  const isZScoreOrTScore = (state.transformMode === "zscore" || state.transformMode === "tscore");
  if (isZScoreOrTScore) {
    box.classList.remove("disabled-section");
    box.classList.add("active-section");
    if (badge) {
      badge.innerHTML = `<i class="fa-solid fa-unlock me-1"></i> 利用可能`;
      badge.style.background = "#059669";
    }
  } else {
    box.classList.add("disabled-section");
    box.classList.remove("active-section");
    if (badge) {
      badge.innerHTML = `<i class="fa-solid fa-lock me-1"></i> Zスコア/偏差値選択時に解放`;
      badge.style.background = "#94a3b8";
    }
  }
}

export function handleTransformModeChange(modeVal, notify = true) {
  if (!modeVal) return;

  if (modeVal.startsWith("per_capita")) {
    state.transformMode = "per_capita";
    state.isPerCapitaMode = true;
    state.perCapitaMultiplier = parseInt(modeVal.replace("per_capita_", ""), 10) || 100;
  } else {
    state.transformMode = modeVal;
    state.isPerCapitaMode = false;
  }

  const isZScoreOrTScore = (state.transformMode === "zscore" || state.transformMode === "tscore");
  if (isZScoreOrTScore) {
    if (!state.paletteKey || !state.paletteKey.startsWith("div_")) {
      state.paletteKey = "div_blue_red";
    }
  } else {
    if (state.paletteKey && state.paletteKey.startsWith("div_")) {
      state.paletteKey = "blues";
    }
  }

  document.querySelectorAll(".palette-btn").forEach(btn => {
    btn.classList.toggle("active", !state.useCustomGradient && btn.getAttribute("data-palette") === state.paletteKey);
  });

  ["select-transform-mode", "select-transform-mode-step1"].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value !== modeVal) el.value = modeVal;
  });

  updatePerCapitaUnit();
  updateZScorePaletteUI();

  try { updateDataTable(); } catch (e) { console.error(e); }
  try { renderGeoJSONLayer(); } catch (e) { console.error(e); }
  try { renderMiniMapLayer(); } catch (e) { console.error(e); }
  try { updateStatsSummary(); } catch (e) { console.error(e); }

  if (notify) {
    const refEl = document.getElementById("select-transform-mode-step1") || document.getElementById("select-transform-mode");
    const selOptText = refEl?.options[refEl?.selectedIndex]?.text || "";
    const paletteNotice = isZScoreOrTScore ? `（発散型パレット「${state.paletteKey}」を自動適用）` : "";
    showToast(`数値を「${selOptText}」に切替・変換しました${paletteNotice}`, "info");
  }
}

export function openVariableModal() {
  const modal = document.getElementById("variable-modal");
  const container = document.getElementById("modal-variable-list");
  const countEl = document.getElementById("modal-var-count");
  if (!modal || !container) return;

  container.innerHTML = "";
  const keys = Object.keys(state.variables);
  if (countEl) countEl.textContent = `全 ${keys.length} 項目`;

  keys.forEach((key) => {
    const v = state.variables[key];
    let unitClean = v.unit ? v.unit.replace(/^単位[：:]\s*/, "") : "";
    let labelText = v.name + (unitClean && !v.name.includes(unitClean) ? ` (${unitClean})` : "");

    const card = document.createElement("label");
    card.className = `variable-radio-card ${key === state.activeVariableKey ? "active" : ""}`;
    card.innerHTML = `
      <input type="radio" name="modal-var-selection" value="${key}" ${key === state.activeVariableKey ? "checked" : ""}>
      <div class="var-radio-info">
        <span class="var-radio-title">${labelText}</span>
        <span class="var-radio-sub">${v.source || v.unit || "統計データ"}</span>
      </div>
    `;
    card.addEventListener("click", () => {
      container.querySelectorAll(".variable-radio-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
    });
    container.appendChild(card);
  });

  modal.classList.remove("hidden");
}

export function bindUIEvents() {
  const btnCloseBanner = document.getElementById("btn-close-norm-banner");
  if (btnCloseBanner) {
    btnCloseBanner.onclick = () => {
      const banner = document.getElementById("normalization-report-banner");
      if (banner) banner.classList.add("hidden");
    };
  }

  // Step 1 File Import Triggers
  const btnFileSelect = document.getElementById("btn-file-select-trigger");
  const fileInput = document.getElementById("file-input");
  const dropZone = document.getElementById("drop-zone");

  if (btnFileSelect && fileInput) {
    btnFileSelect.addEventListener("click", () => fileInput.click());
  }
  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        parseFileInput(e.target.files[0]);
      }
    });
  }
  if (dropZone) {
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    });
    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("dragover");
    });
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        parseFileInput(e.dataTransfer.files[0]);
      }
    });
  }

  const btnApplyPaste = document.getElementById("btn-apply-paste");
  const rawPasteInput = document.getElementById("raw-paste-input");
  if (btnApplyPaste && rawPasteInput) {
    btnApplyPaste.addEventListener("click", () => {
      const text = rawPasteInput.value.trim();
      if (text) {
        parseRawText(text, "手動ペーストデータ");
        populateVariableDropdowns();
        switchActiveVariable(Object.keys(state.variables)[0], false);
      } else {
        showToast("テキストが入力されていません", "warning");
      }
    });
  }

  // Step Navigation
  function goToStep2() {
    const step1 = document.getElementById("step1-data");
    const step2 = document.getElementById("step2-map");
    if (step1) step1.style.display = "none";
    if (step2) {
      step2.style.display = "flex";
      step2.style.flex = "1";
      step2.style.width = "100%";
      step2.style.height = "100%";
    }

    requestAnimationFrame(() => {
      if (!state.leafletMap) {
        initLeafletMap();
      } else {
        state.leafletMap.invalidateSize({ animate: false });
      }
      renderGeoJSONLayer();
      
      setTimeout(() => {
        if (state.leafletMap) {
          state.leafletMap.invalidateSize({ animate: false });
          let bounds = REGION_BOUNDS[state.activeRegion] || REGION_BOUNDS.all;
          state.leafletMap.fitBounds(bounds);
        }
      }, 50);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const btnNext = document.getElementById("btn-next-step");
  if (btnNext) btnNext.addEventListener("click", goToStep2);

  const btnNextSide = document.getElementById("btn-next-step-side");
  if (btnNextSide) btnNextSide.addEventListener("click", goToStep2);

  const btnPrev = document.getElementById("btn-prev-step");
  if (btnPrev) {
    btnPrev.addEventListener("click", () => {
      const step1 = document.getElementById("step1-data");
      const step2 = document.getElementById("step2-map");
      if (step2) step2.style.display = "none";
      if (step1) step1.style.display = "block";
      updateDataTable();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // Step 2 Sidebar Tab Switching
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const targetTabId = btn.getAttribute("data-tab");
      document.querySelectorAll(".tab-page").forEach(page => {
        if (page.id === targetTabId) {
          page.classList.add("active");
          page.style.display = "block";
        } else {
          page.classList.remove("active");
          page.style.display = "none";
        }
      });
    });
  });

  // Variable Dropdown Selection
  ["select-variable-step1", "select-variable-step2", "select-variable-header"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", (e) => {
        switchActiveVariable(e.target.value);
      });
    }
  });

  // Transform Mode Dropdowns (実測値 / 人口補正 / Zスコア / 偏差値)
  ["select-transform-mode", "select-transform-mode-step1"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", (e) => {
        handleTransformModeChange(e.target.value, true);
      });
    }
  });

  // Color Palette Buttons Selection
  document.querySelectorAll(".palette-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".palette-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.paletteKey = btn.getAttribute("data-palette");
      state.useCustomGradient = false;
      
      const chkGrad = document.getElementById("chk-use-custom-gradient");
      if (chkGrad) chkGrad.checked = false;
      const customPickers = document.getElementById("custom-color-pickers");
      if (customPickers) customPickers.classList.add("hidden");

      renderGeoJSONLayer();
      renderMiniMapLayer();
      showToast(`カラーパレットを「${state.paletteKey}」に変更しました`, "info");
    });
  });

  // Palette Invert Checkbox
  const chkInvert = document.getElementById("chk-invert-palette");
  if (chkInvert) {
    chkInvert.addEventListener("change", (e) => {
      state.invertPalette = e.target.checked;
      renderGeoJSONLayer();
      renderMiniMapLayer();
    });
  }

  // Custom Gradient Checkbox & Color Pickers
  const chkCustomGrad = document.getElementById("chk-use-custom-gradient");
  const customPickers = document.getElementById("custom-color-pickers");
  if (chkCustomGrad) {
    chkCustomGrad.addEventListener("change", (e) => {
      state.useCustomGradient = e.target.checked;
      if (customPickers) customPickers.classList.toggle("hidden", !state.useCustomGradient);
      if (state.useCustomGradient) {
        document.querySelectorAll(".palette-btn").forEach(b => b.classList.remove("active"));
      }
      renderGeoJSONLayer();
      renderMiniMapLayer();
    });
  }

  const startColorInput = document.getElementById("color-picker-start");
  const endColorInput = document.getElementById("color-picker-end");
  if (startColorInput) {
    startColorInput.addEventListener("input", (e) => {
      state.customStartColor = e.target.value;
      if (state.useCustomGradient) {
        renderGeoJSONLayer();
        renderMiniMapLayer();
      }
    });
  }
  if (endColorInput) {
    endColorInput.addEventListener("input", (e) => {
      state.customEndColor = e.target.value;
      if (state.useCustomGradient) {
        renderGeoJSONLayer();
        renderMiniMapLayer();
      }
    });
  }

  // Binning Mode Radios (equal, jenks, quantile, custom)
  document.querySelectorAll('input[name="binning-mode"]').forEach(radio => {
    radio.addEventListener("change", (e) => {
      state.binningMode = e.target.value;
      const stepWrapper = document.getElementById("step-count-wrapper");
      const customWrapper = document.getElementById("custom-breaks-wrapper");

      if (stepWrapper && customWrapper) {
        if (state.binningMode === "custom") {
          stepWrapper.classList.add("hidden");
          customWrapper.classList.remove("hidden");
        } else {
          stepWrapper.classList.remove("hidden");
          customWrapper.classList.add("hidden");
        }
      }
      renderGeoJSONLayer();
      renderMiniMapLayer();
      updateStatsSummary();
    });
  });

  // Step Count Select Slider & Stepper Buttons
  const stepSlider = document.getElementById("step-count-slider");
  const stepVal = document.getElementById("step-count-value");
  if (stepSlider) {
    stepSlider.addEventListener("input", (e) => {
      let count = parseInt(e.target.value, 10);
      state.stepCount = count;
      state.numClasses = count;
      if (stepVal) stepVal.textContent = `${count} 段階`;
      renderGeoJSONLayer();
      renderMiniMapLayer();
      updateStatsSummary();
    });
  }

  const btnStepDec = document.getElementById("btn-step-count-dec");
  const btnStepInc = document.getElementById("btn-step-count-inc");
  if (btnStepDec && stepSlider) {
    btnStepDec.addEventListener("click", () => {
      let cur = parseInt(stepSlider.value, 10);
      if (cur > 3) {
        let count = cur - 1;
        stepSlider.value = count;
        state.stepCount = count;
        state.numClasses = count;
        if (stepVal) stepVal.textContent = `${count} 段階`;
        renderGeoJSONLayer();
        renderMiniMapLayer();
        updateStatsSummary();
      }
    });
  }
  if (btnStepInc && stepSlider) {
    btnStepInc.addEventListener("click", () => {
      let cur = parseInt(stepSlider.value, 10);
      if (cur < 7) {
        let count = cur + 1;
        stepSlider.value = count;
        state.stepCount = count;
        state.numClasses = count;
        if (stepVal) stepVal.textContent = `${count} 段階`;
        renderGeoJSONLayer();
        renderMiniMapLayer();
        updateStatsSummary();
      }
    });
  }

  // Manual Custom Breaks Apply Button
  const btnApplyBreaks = document.getElementById("btn-apply-breaks");
  const customBreaksInput = document.getElementById("custom-breaks-input");
  if (btnApplyBreaks && customBreaksInput) {
    btnApplyBreaks.addEventListener("click", () => {
      const text = customBreaksInput.value.trim();
      if (!text) return;
      const parts = text.split(/[\s,]+/).map(v => parseFloat(v)).filter(v => !isNaN(v));
      if (parts.length >= 2) {
        parts.sort((a, b) => a - b);
        state.computedBreaks = parts;
        state.binningMode = "custom";
        renderGeoJSONLayer();
        renderMiniMapLayer();
        showToast(`手動階級区分（${parts.length - 1}段階）を適用しました`, "info");
      } else {
        showToast("2つ以上の区切り数値を入力してください", "warning");
      }
    });
  }

  // Render Mode Radios (choropleth vs bubble)
  document.querySelectorAll('input[name="map-render-mode"]').forEach(el => {
    el.addEventListener("change", (e) => {
      state.mapRenderMode = e.target.value;
      const bubbleOptions = document.getElementById("bubble-options-section");
      if (bubbleOptions) {
        bubbleOptions.classList.toggle("hidden", state.mapRenderMode !== "bubble");
      }
      renderGeoJSONLayer();
    });
  });

  // Bubble Map Options (Size, Label, Format)
  const selectBubbleSize = document.getElementById("select-bubble-size-mode");
  if (selectBubbleSize) {
    selectBubbleSize.addEventListener("change", (e) => {
      state.bubbleSizeMode = e.target.value;
      if (state.mapRenderMode === "bubble") renderBubbleLayer();
    });
  }

  const selectBubbleLabel = document.getElementById("select-bubble-label-mode");
  if (selectBubbleLabel) {
    selectBubbleLabel.addEventListener("change", (e) => {
      state.bubbleLabelMode = e.target.value;
      if (state.mapRenderMode === "bubble") renderBubbleLayer();
    });
  }

  const selectBubbleNameFmt = document.getElementById("select-bubble-name-format");
  if (selectBubbleNameFmt) {
    selectBubbleNameFmt.addEventListener("change", (e) => {
      state.bubbleNameFormat = e.target.value;
      if (state.mapRenderMode === "bubble") renderBubbleLayer();
    });
  }

  // Canvas Background Selector
  const selectMapBg = document.getElementById("select-map-bg");
  if (selectMapBg) {
    selectMapBg.addEventListener("change", (e) => {
      state.mapBg = e.target.value;
      const frame = document.getElementById("export-map-frame");
      if (frame) {
        frame.classList.remove("theme-light", "theme-dark", "transparent-bg");
        frame.style.background = "";
        frame.style.backgroundImage = "";
        frame.style.backgroundColor = "";

        if (state.mapBg === "minimal-dark") {
          frame.classList.add("theme-dark");
        } else if (state.mapBg === "transparent") {
          frame.classList.add("transparent-bg");
        } else if (state.mapBg === "minimal-light") {
          frame.style.background = "#f8fafc";
        } else if (state.mapBg === "none") {
          frame.classList.add("theme-light");
          frame.style.background = "#ffffff";
        }
      }
    });
  }

  // Region View Zoom Selectors
  ["select-sidebar-region", "select-region-zoom", "select-region"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", (e) => {
        const regionKey = e.target.value;
        state.activeRegion = regionKey;
        ["select-sidebar-region", "select-region-zoom", "select-region"].forEach(otherId => {
          const oEl = document.getElementById(otherId);
          if (oEl && oEl.value !== regionKey) oEl.value = regionKey;
        });
        if (state.leafletMap) {
          let bounds = REGION_BOUNDS[regionKey] || REGION_BOUNDS.all;
          state.leafletMap.fitBounds(bounds);
        }
      });
    }
  });

  const btnFitBounds = document.getElementById("btn-fit-bounds");
  if (btnFitBounds) {
    btnFitBounds.addEventListener("click", () => {
      state.activeRegion = "all";
      ["select-sidebar-region", "select-region-zoom", "select-region"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "all";
      });
      if (state.leafletMap) {
        state.leafletMap.fitBounds(REGION_BOUNDS.all);
      }
    });
  }

  // Stroke Color, Opacity & Width Selectors & Steppers
  const selectStrokeColor = document.getElementById("select-stroke-color");
  if (selectStrokeColor) {
    selectStrokeColor.addEventListener("change", (e) => {
      state.strokeColor = e.target.value;
      renderGeoJSONLayer();
    });
  }

  const strokeSlider = document.getElementById("stroke-opacity-slider");
  const strokeVal = document.getElementById("stroke-opacity-value");
  if (strokeSlider) {
    strokeSlider.addEventListener("input", (e) => {
      state.strokeOpacity = parseFloat(e.target.value);
      if (strokeVal) strokeVal.textContent = state.strokeOpacity;
      renderGeoJSONLayer();
    });
  }

  const btnStrokeDec = document.getElementById("btn-stroke-opacity-dec");
  const btnStrokeInc = document.getElementById("btn-stroke-opacity-inc");
  if (btnStrokeDec && strokeSlider) {
    btnStrokeDec.addEventListener("click", () => {
      let cur = parseFloat(strokeSlider.value);
      if (cur > 0.1) {
        cur = Math.max(0.1, Math.round((cur - 0.1) * 10) / 10);
        strokeSlider.value = cur;
        state.strokeOpacity = cur;
        if (strokeVal) strokeVal.textContent = cur;
        renderGeoJSONLayer();
      }
    });
  }
  if (btnStrokeInc && strokeSlider) {
    btnStrokeInc.addEventListener("click", () => {
      let cur = parseFloat(strokeSlider.value);
      if (cur < 1.0) {
        cur = Math.min(1.0, Math.round((cur + 0.1) * 10) / 10);
        strokeSlider.value = cur;
        state.strokeOpacity = cur;
        if (strokeVal) strokeVal.textContent = cur;
        renderGeoJSONLayer();
      }
    });
  }

  const strokeWidthSlider = document.getElementById("stroke-width-slider");
  const strokeWidthVal = document.getElementById("stroke-width-value");
  if (strokeWidthSlider) {
    strokeWidthSlider.addEventListener("input", (e) => {
      state.strokeWidth = parseFloat(e.target.value);
      if (strokeWidthVal) strokeWidthVal.textContent = `${state.strokeWidth} px`;
      renderGeoJSONLayer();
    });
  }

  const btnStrokeWidthDec = document.getElementById("btn-stroke-width-dec");
  const btnStrokeWidthInc = document.getElementById("btn-stroke-width-inc");
  if (btnStrokeWidthDec && strokeWidthSlider) {
    btnStrokeWidthDec.addEventListener("click", () => {
      let cur = parseFloat(strokeWidthSlider.value);
      if (cur > 0.5) {
        cur = Math.max(0.5, Math.round((cur - 0.5) * 10) / 10);
        strokeWidthSlider.value = cur;
        state.strokeWidth = cur;
        if (strokeWidthVal) strokeWidthVal.textContent = `${cur} px`;
        renderGeoJSONLayer();
      }
    });
  }
  if (btnStrokeWidthInc && strokeWidthSlider) {
    btnStrokeWidthInc.addEventListener("click", () => {
      let cur = parseFloat(strokeWidthSlider.value);
      if (cur < 5.0) {
        cur = Math.min(5.0, Math.round((cur + 0.5) * 10) / 10);
        strokeWidthSlider.value = cur;
        state.strokeWidth = cur;
        if (strokeWidthVal) strokeWidthVal.textContent = `${cur} px`;
        renderGeoJSONLayer();
      }
    });
  }

  // Outer Border Checkbox
  const chkOuterBorder = document.getElementById("chk-show-outer-border");
  if (chkOuterBorder) {
    chkOuterBorder.addEventListener("change", (e) => {
      state.showOuterBorder = e.target.checked;
      renderGeoJSONLayer();
    });
  }

  // Label Mode & Content Selectors
  const selectLabelMode = document.getElementById("select-label-mode");
  if (selectLabelMode) {
    selectLabelMode.addEventListener("change", (e) => {
      state.labelMode = e.target.value;
      const labelContentGroup = document.getElementById("label-content-group");
      if (labelContentGroup) {
        labelContentGroup.style.display = (state.labelMode === "none") ? "none" : "block";
      }
      renderLabelsLayer();
    });
  }

  document.querySelectorAll('input[name="labelContent"]').forEach(el => {
    el.addEventListener("change", (e) => {
      state.labelContent = e.target.value;
      renderLabelsLayer();
    });
  });

  // Legend Position Selector
  const legendPosSelect = document.getElementById("legend-position-select");
  if (legendPosSelect) {
    legendPosSelect.addEventListener("change", (e) => {
      state.legendPosition = e.target.value;
      const legendBox = document.getElementById("map-legend");
      if (legendBox) legendBox.className = `map-legend-box position-${state.legendPosition}`;
      updateBoxplotPosition();
    });
  }

  // Boxplot Checkbox & Position Selector
  const chkShowBoxplot = document.getElementById("chk-show-boxplot");
  if (chkShowBoxplot) {
    chkShowBoxplot.addEventListener("change", (e) => {
      state.showBoxplot = e.target.checked;
      const boxplotBox = document.getElementById("map-boxplot");
      if (boxplotBox) {
        boxplotBox.classList.toggle("hidden", !state.showBoxplot);
      }
      if (state.showBoxplot) {
        renderBoxPlot();
      }
    });
  }

  const boxplotPosSelect = document.getElementById("boxplot-position-select");
  if (boxplotPosSelect) {
    boxplotPosSelect.addEventListener("change", (e) => {
      state.boxplotPosition = e.target.value;
      updateBoxplotPosition();
    });
  }

  // Map Title, Subtitle, Unit, Remarks Text Input & Visibility Listeners
  const titleInput = document.getElementById("map-title-input");
  const subTitleInput = document.getElementById("map-subtitle-input");
  const unitInput = document.getElementById("map-unit-input");
  const remarksInput = document.getElementById("map-remarks-input");

  if (titleInput) {
    titleInput.addEventListener("input", (e) => {
      state.title = e.target.value;
      const el = document.getElementById("display-map-title");
      if (el) el.textContent = state.title;
    });
  }
  if (subTitleInput) {
    subTitleInput.addEventListener("input", (e) => {
      state.subtitle = e.target.value;
      const el = document.getElementById("display-map-subtitle");
      if (el) el.textContent = state.subtitle;
    });
  }
  if (unitInput) {
    unitInput.addEventListener("input", (e) => {
      state.unit = e.target.value;
      const el = document.getElementById("display-legend-unit");
      if (el) el.textContent = state.unit;
      renderLegend();
    });
  }
  if (remarksInput) {
    remarksInput.addEventListener("input", (e) => {
      state.remarks = e.target.value;
      const el = document.getElementById("display-map-remarks");
      if (el) el.textContent = state.remarks;
    });
  }

  const chkShowTitle = document.getElementById("chk-show-title");
  if (chkShowTitle) {
    chkShowTitle.addEventListener("change", (e) => {
      state.showTitle = e.target.checked;
      const headerBox = document.querySelector(".map-overlay-header");
      if (headerBox) headerBox.style.display = state.showTitle ? "block" : "none";
    });
  }

  const chkShowRemarks = document.getElementById("chk-show-remarks");
  if (chkShowRemarks) {
    chkShowRemarks.addEventListener("change", (e) => {
      state.showRemarks = e.target.checked;
      const footerBox = document.querySelector(".map-overlay-footer");
      if (footerBox) footerBox.style.display = state.showRemarks ? "block" : "none";
    });
  }

  // Export Buttons
  const btnExportPNGHeader = document.getElementById("btn-export-png-header");
  if (btnExportPNGHeader) btnExportPNGHeader.addEventListener("click", exportPNG);

  const btnCopyPNGHeader = document.getElementById("btn-copy-png-header");
  if (btnCopyPNGHeader) btnCopyPNGHeader.addEventListener("click", copyPNGToClipboard);

  const btnExportPNGTab = document.getElementById("btn-export-png-tab");
  if (btnExportPNGTab) btnExportPNGTab.addEventListener("click", exportPNG);

  const btnCopyPNGTab = document.getElementById("btn-copy-png-tab");
  if (btnCopyPNGTab) btnCopyPNGTab.addEventListener("click", copyPNGToClipboard);

  const btnExportCSVTab = document.getElementById("btn-export-csv-tab");
  if (btnExportCSVTab) btnExportCSVTab.addEventListener("click", exportCSVData);

  const selectFormat = document.getElementById("select-export-format");
  if (selectFormat) {
    selectFormat.addEventListener("change", (e) => {
      state.exportFormat = e.target.value;
    });
  }

  const selectScale = document.getElementById("select-export-scale");
  if (selectScale) {
    selectScale.addEventListener("change", (e) => {
      state.exportScale = parseInt(e.target.value, 10) || 3;
    });
  }

  // Report Modal Triggers & Controls
  const btnReportPDF = document.getElementById("btn-open-report-modal");
  if (btnReportPDF) btnReportPDF.addEventListener("click", () => generateA4ReportPDF("landscape"));

  const btnCloseReport = document.getElementById("btn-close-report-modal");
  const btnCancelReport = document.getElementById("btn-cancel-report-modal");
  const reportModal = document.getElementById("report-modal");
  if (reportModal) {
    if (btnCloseReport) btnCloseReport.onclick = () => reportModal.classList.add("hidden");
    if (btnCancelReport) btnCancelReport.onclick = () => reportModal.classList.add("hidden");
  }

  const btnPrintReport = document.getElementById("btn-print-report-modal");
  if (btnPrintReport) {
    btnPrintReport.addEventListener("click", () => {
      window.print();
    });
  }

  const btnModalOrientLandscape = document.getElementById("btn-modal-orient-landscape");
  const btnModalOrientPortrait = document.getElementById("btn-modal-orient-portrait");

  if (btnModalOrientLandscape && btnModalOrientPortrait) {
    btnModalOrientLandscape.addEventListener("click", () => {
      btnModalOrientLandscape.classList.add("active");
      btnModalOrientPortrait.classList.remove("active");
      setPrintPageOrientation("landscape");
      generateA4ReportPDF("landscape");
    });
    btnModalOrientPortrait.addEventListener("click", () => {
      btnModalOrientPortrait.classList.add("active");
      btnModalOrientLandscape.classList.remove("active");
      setPrintPageOrientation("portrait");
      generateA4ReportPDF("portrait");
    });
  }

  // Variable Modal Triggers & Controls
  ["btn-open-var-modal-step1", "btn-open-var-modal-step2", "btn-open-var-modal-header"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", openVariableModal);
  });

  const varModal = document.getElementById("variable-modal");
  const btnCloseVar = document.getElementById("btn-close-var-modal");
  const btnCancelVar = document.getElementById("btn-cancel-var-modal");
  const btnConfirmVar = document.getElementById("btn-confirm-var-modal");

  if (varModal) {
    if (btnCloseVar) btnCloseVar.onclick = () => varModal.classList.add("hidden");
    if (btnCancelVar) btnCancelVar.onclick = () => varModal.classList.add("hidden");
    if (btnConfirmVar) {
      btnConfirmVar.onclick = () => {
        const selectedRadio = document.querySelector('input[name="modal-var-selection"]:checked');
        if (selectedRadio && selectedRadio.value) {
          switchActiveVariable(selectedRadio.value);
        }
        varModal.classList.add("hidden");
      };
    }
  }

  // Reset App Button
  const btnReset = document.getElementById("btn-reset");
  if (btnReset) {
    btnReset.addEventListener("click", resetAppState);
  }

  // Load Presets
  const btnLoadNenkan = document.getElementById("btn-load-preset-nenkan");
  if (btnLoadNenkan) {
    btnLoadNenkan.addEventListener("click", () => {
      try {
        parseRawText(nenkanCsv, "R8青森県統計年鑑 市町村データ100");
        populateVariableDropdowns();
        switchActiveVariable(Object.keys(state.variables)[0], false);
        showToast("「R8青森県統計年鑑 市町村データ100」データを読み込みました。（全100項目）", "info");
      } catch (err) {
        console.error(err);
        showToast("プリセットデータの読み込みに失敗しました", "error");
      }
    });
  }

  const btnLoadSugata = document.getElementById("btn-load-preset-sugata");
  if (btnLoadSugata) {
    btnLoadSugata.addEventListener("click", () => {
      try {
        parseRawText(sugataCsv, "統計でみる市区町村のすがた 2026");
        populateVariableDropdowns();
        switchActiveVariable(Object.keys(state.variables)[0], false);
        showToast("「統計でみる市区町村のすがた 2026」データを読み込みました。（89指標）", "info");
      } catch (err) {
        console.error(err);
        showToast("プリセットデータの読み込みに失敗しました", "error");
      }
    });
  }
}

export function resetAppState(showToastMsg = true) {
  state.activeVariableKey = null;
  state.variables = {};
  state.currentValues = {};
  state.title = "";
  state.subtitle = "";
  state.unit = "";
  state.remarks = "";
  state.transformMode = "raw";
  state.isPerCapitaMode = false;
  state.perCapitaMultiplier = 100;
  state.paletteKey = "blues";
  state.useCustomGradient = false;
  state.invertPalette = false;
  state.binningMode = "equal";
  state.stepCount = 5;
  state.numClasses = 5;
  state.customBreaks = [];
  state.mapRenderMode = "choropleth";
  state.bubbleSizeMode = "equal";
  state.bubbleLabelMode = "name";
  state.bubbleNameFormat = "full";
  state.showBoxplot = true;
  state.boxplotPosition = "auto";
  state.legendPosition = "rightmiddle";
  state.labelStyle = "compact";
  state.showOuterBorder = false;

  if (state.bubbleGroup) {
    try { state.bubbleGroup.clearLayers(); } catch (e) {}
  }

  // Clear text inputs in DOM
  const titleInput = document.getElementById("map-title-input");
  const subTitleInput = document.getElementById("map-subtitle-input");
  const unitInput = document.getElementById("map-unit-input");
  const remarksInput = document.getElementById("map-remarks-input");
  const rawPasteInput = document.getElementById("raw-paste-input");

  if (titleInput) titleInput.value = "";
  if (subTitleInput) subTitleInput.value = "";
  if (unitInput) unitInput.value = "";
  if (remarksInput) remarksInput.value = "";
  if (rawPasteInput) rawPasteInput.value = "";

  const displayTitle = document.getElementById("display-map-title");
  const displaySubtitle = document.getElementById("display-map-subtitle");
  const displayUnit = document.getElementById("display-legend-unit");
  const displayRemarks = document.getElementById("display-map-remarks");

  if (displayTitle) displayTitle.textContent = "市町村別統計マップ";
  if (displaySubtitle) displaySubtitle.textContent = "データを読み込むと作図が始まります";
  if (displayUnit) displayUnit.textContent = "";
  if (displayRemarks) displayRemarks.textContent = "";

  const card = document.getElementById("variable-select-card");
  if (card) card.classList.add("hidden");

  // Synchronize Form Controls
  ["select-transform-mode", "select-transform-mode-step1"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "raw";
  });

  ["select-binning-mode", "select-binning-mode-step1"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "equal";
  });

  const stepInput = document.getElementById("step-count-input");
  if (stepInput) stepInput.value = 5;

  const stepCountBadge = document.getElementById("step-count-badge");
  if (stepCountBadge) stepCountBadge.textContent = "5階級";

  const renderModeRadio = document.querySelector('input[name="map-render-mode"][value="choropleth"]');
  if (renderModeRadio) renderModeRadio.checked = true;

  const chkBoxplot = document.getElementById("check-show-boxplot");
  if (chkBoxplot) chkBoxplot.checked = true;

  document.querySelectorAll(".palette-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-palette") === "blues");
  });

  populateVariableDropdowns();
  try { updateDataTable(); } catch (e) {}
  try { renderGeoJSONLayer(); } catch (e) {}
  try { renderMiniMapLayer(); } catch (e) {}
  try { updateStatsSummary(); } catch (e) {}

  if (showToastMsg) {
    showToast("初期状態（データ未読み込み）にリセットしました", "info");
  }
}
