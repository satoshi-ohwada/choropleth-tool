// Data Table Inline Editor & Real-Time Sync
import { state } from '../core/state.js';
import { AOMORI_MUNICIPALITIES } from '../config/municipalities.js';
import { isNumericValue, isSpecialValue, getSpecialValueLabel, parseCleanNumber, normalizeSpecialValue } from '../parsers/numberParser.js';
import { getEffectiveValues, updateStatsSummary } from '../stats/statsEngine.js';
import { renderGeoJSONLayer, renderMiniMapLayer } from '../map/mapRenderer.js';
import { showToast } from './toast.js';

export function updateDataTable() {
  const tbody = document.getElementById("data-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  let numericCount = 0;
  let specialCount = 0;
  const filterQuery = (document.getElementById("table-search")?.value || "").trim().toLowerCase();

  let visibleCount = 0;

  AOMORI_MUNICIPALITIES.forEach(m => {
    let isVisible = true;
    if (filterQuery) {
      let matchName = m.name.toLowerCase().includes(filterQuery);
      let matchCode = m.code.includes(filterQuery);
      let matchType = m.type.includes(filterQuery);
      isVisible = matchName || matchCode || matchType;
    }

    let val = getEffectiveValues()[m.name];
    let hasVal = isNumericValue(val);
    let isSpecial = isSpecialValue(val);
    if (hasVal) numericCount++;
    if (isSpecial) specialCount++;

    let tr = document.createElement("tr");
    tr.setAttribute("data-name", m.name);
    if (!isVisible) {
      tr.style.display = "none";
    } else {
      visibleCount++;
    }

    let valInputStr = (hasVal || isSpecial) ? val : "";
    let statusIcon = hasVal 
      ? '<i class="fa-solid fa-circle-check text-green" title="数値入力済"></i>' 
      : (isSpecial ? `<i class="fa-solid fa-shield-halved text-amber" title="${getSpecialValueLabel(val)}"></i>` : '<i class="fa-solid fa-circle-minus text-muted" title="未入力"></i>');

    let specialInputClass = isSpecial ? "is-special" : "";
    const isTransformed = (state.transformMode !== "raw");
    const cellReadonlyAttr = isTransformed ? 'readonly style="background:#f8fafc; color:#475569; cursor:not-allowed;"' : '';
    const cellTitleAttr = isTransformed ? 'title="※数値変換適用中は直接編集できません。"' : '';

    tr.innerHTML = `
      <td style="text-align:center;">${statusIcon}</td>
      <td style="font-family:var(--font-mono); color:#64748b; font-size:0.75rem;">${m.code}</td>
      <td><strong>${m.name}</strong></td>
      <td style="text-align:center;">
        <span class="badge ${m.type === '市' ? 'badge-primary' : 'badge-secondary'}" style="background:#f1f5f9; color:#475569; border:1px solid #e2e8f0;">${m.type}</span>
      </td>
      <td style="text-align:right;">
        <input type="text" inputmode="decimal" class="cell-val-input ${hasVal || isSpecial ? '' : 'is-empty'} ${specialInputClass}" data-name="${m.name}" value="${valInputStr}" placeholder="未入力" ${cellReadonlyAttr} ${cellTitleAttr}>
      </td>
    `;

    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".cell-val-input").forEach(input => {
    input.addEventListener("input", (e) => {
      if (state.transformMode !== "raw") {
        showToast("数値変換適用中は数値を直接編集できません。実測値モードで編集してください。", "warning");
        return;
      }
      let name = e.target.getAttribute("data-name");
      let rawVal = e.target.value.trim();
      if (rawVal === "") {
        delete state.currentValues[name];
        e.target.classList.add("is-empty");
        e.target.classList.remove("is-special");
      } else {
        let num = parseCleanNumber(rawVal);
        let sp = normalizeSpecialValue(rawVal);
        if (!isNaN(num)) {
          state.currentValues[name] = num;
          e.target.classList.remove("is-empty");
          e.target.classList.remove("is-special");
        } else if (sp) {
          state.currentValues[name] = sp;
          e.target.classList.remove("is-empty");
          e.target.classList.add("is-special");
        }
      }
      renderGeoJSONLayer();
      renderMiniMapLayer();
      updateStatsSummary();
    });
  });

  syncMatchBadges(numericCount, specialCount);
}

export function syncMatchBadges(numericCount, specialCount) {
  let totalEntered = numericCount + specialCount;
  let text = specialCount > 0 
    ? `${totalEntered}/40 (数値${numericCount}・秘匿等${specialCount})` 
    : `${totalEntered} / 40 入力済`;
  let className = totalEntered === 40 ? "badge badge-success" : (totalEntered > 0 ? "badge badge-info" : "badge badge-warning");

  const badge = document.getElementById("match-badge");
  if (badge) {
    badge.textContent = text;
    badge.className = className;
  }
}
