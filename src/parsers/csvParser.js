// CSV & Excel Raw Text Parsing Engine & Multi-variable Store Integration
import { state } from '../core/state.js';
import { normalizeNameInfo } from './muniMatcher.js';
import { parseCleanNumber, normalizeSpecialValue } from './numberParser.js';
import { renderMiniMapLayer } from '../map/mapRenderer.js';
import { updateStatsSummary } from '../stats/statsEngine.js';
import { populateVariableDropdowns, switchActiveVariable } from '../ui/uiController.js';
import { showToast } from '../ui/toast.js';

export function parseCSVLine(lineStr, delimiter = ",") {
  let result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < lineStr.length; i++) {
    let c = lineStr[i];
    if (c === '"') {
      if (inQuotes && lineStr[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === delimiter && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

export function parseRawText(rawText, sourceTitle = "取り込みデータ") {
  if (!rawText || !rawText.trim()) {
    showToast("テキストデータが空です", "warning");
    return;
  }

  if (rawText.charCodeAt(0) === 0xFEFF) {
    rawText = rawText.slice(1);
  }
  rawText = rawText.normalize("NFKC");
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    showToast("有効なデータ行が見つかりませんでした", "warning");
    return;
  }

  let firstLine = lines[0];
  let sep = firstLine.includes("\t") ? "\t" : ",";
  let headerParts = parseCSVLine(firstLine, sep).map(s => s.replace(/^[\uFEFF"']|["']$/g, ""));

  let nameColIdx = headerParts.findIndex(h => /市町村|自治体|名称|市区町村|name/i.test(h));
  if (nameColIdx === -1) {
    nameColIdx = headerParts.length > 1 && /コード|code|id/i.test(headerParts[0]) ? 1 : 0;
  }

  const isPrefOrSummaryRow = (str) => {
    let clean = (str || "").replace(/[\s　\uFEFF]+/g, "");
    return /^(県|青森県|県計|県全体|県平均|全県|合計|総数|全国|全国平均|平均)$/i.test(clean);
  };

  let valCols = [];
  headerParts.forEach((colName, idx) => {
    let trimmed = (colName || "").trim();
    if (idx !== nameColIdx && trimmed && !/^(コード|code|id|区分|type)$/i.test(trimmed)) {
      valCols.push({ idx: idx, name: trimmed });
    }
  });

  if (valCols.length === 0) {
    showToast("作図可能なデータ列が見つかりませんでした", "warning");
    return;
  }

  let unitRowParts = null;
  let sourceRowParts = null;
  let metaRowIndices = new Set();

  for (let i = 1; i < lines.length; i++) {
    let parts = parseCSVLine(lines[i], sep).map(s => s.replace(/^["']|["']$/g, "").trim());
    let nameCand = (parts[nameColIdx] || "").replace(/[\s　]+/g, "");

    if (parts.every(p => !p)) {
      metaRowIndices.add(i);
      continue;
    }

    let normInfo = normalizeNameInfo(nameCand);
    if (normInfo.matched) {
      continue; // 自治体データ行
    }

    if (isPrefOrSummaryRow(nameCand)) {
      metaRowIndices.add(i);
      continue;
    }

    let isUnitRow = false;
    if (/^(?:※\s*)?(?:数値の)?単位(?:\s*[：:].*)?$/i.test(nameCand)) {
      isUnitRow = true;
    } else {
      for (let j = 0; j < parts.length; j++) {
        if (/^(?:※\s*)?(?:数値の)?単位$/i.test(parts[j])) {
          isUnitRow = true;
          break;
        }
      }
    }

    if (isUnitRow) {
      unitRowParts = parts;
      metaRowIndices.add(i);
      continue;
    }

    let isSourceRow = false;
    if (/^(?:※\s*)?(?:データ)?(?:出典|ソース|資料|出所|備考|備考欄)(?:\s*[：:].*)?$/i.test(nameCand)) {
      isSourceRow = true;
    } else {
      for (let j = 0; j < parts.length; j++) {
        if (/^(?:※\s*)?(?:データ)?(?:出典|ソース|資料|出所|備考|備考欄)$/i.test(parts[j]) ||
            /^(?:※|注)?\s*(?:データ)?(?:出典|ソース|資料|出所)[：:]/i.test(parts[j])) {
          isSourceRow = true;
          break;
        }
      }
    }

    if (!isSourceRow && !nameCand) {
      let hasTextInVal = false;
      let hasNumInVal = false;
      for (let col of valCols) {
        let cell = parts[col.idx] || "";
        if (cell) {
          let num = parseCleanNumber(cell);
          if (isNaN(num)) {
            hasTextInVal = true;
          } else {
            hasNumInVal = true;
          }
        }
      }
      if (hasTextInVal && !hasNumInVal) {
        isSourceRow = true;
      }
    }

    if (isSourceRow) {
      sourceRowParts = parts;
      metaRowIndices.add(i);
      continue;
    }

    if (i <= 4) {
      let hasNum = valCols.some(col => !isNaN(parseCleanNumber(parts[col.idx] || "")));
      if (!hasNum && parts.some(p => Boolean(p))) {
        metaRowIndices.add(i);
        if (!sourceRowParts) {
          sourceRowParts = parts;
        }
      }
    }
  }

  let newVars = {};
  let varKeys = [];

  valCols.forEach((col, offset) => {
    let varKey = `var_${col.idx}_${Date.now()}`;
    let colName = col.name;

    let unitStr = "";
    if (unitRowParts && unitRowParts[col.idx]) {
      unitStr = unitRowParts[col.idx].replace(/^単位[：:]\s*/, "");
    }

    let sourceStr = "";
    if (sourceRowParts && sourceRowParts[col.idx]) {
      sourceStr = sourceRowParts[col.idx];
    } else if (sourceRowParts && sourceRowParts[0]) {
      sourceStr = sourceRowParts[0];
    }

    newVars[varKey] = {
      id: varKey,
      name: colName,
      label: colName,
      unit: unitStr,
      title: colName,
      subtitle: sourceTitle,
      remarks: sourceStr,
      palette: "blues",
      data: {}
    };
    varKeys.push(varKey);
  });

  for (let i = 1; i < lines.length; i++) {
    if (metaRowIndices.has(i)) continue;

    let parts = parseCSVLine(lines[i], sep).map(s => s.replace(/^["']|["']$/g, "").trim());
    let rawMuni = parts[nameColIdx];
    let norm = normalizeNameInfo(rawMuni);

    if (norm.matched) {
      let muniName = norm.matched;

      valCols.forEach((col, offset) => {
        let key = varKeys[offset];
        let rawVal = parts[col.idx];

        let num = parseCleanNumber(rawVal);
        if (!isNaN(num)) {
          newVars[key].data[muniName] = num;
        } else {
          let spec = normalizeSpecialValue(rawVal);
          if (spec) {
            newVars[key].data[muniName] = spec;
          }
        }
      });
    }
  }

  state.variables = newVars;
  state.activeVariableKey = varKeys[0];

  // 新規データ読み込み時は統計分析モードを「実測値（raw）」に初期化
  state.transformMode = "raw";
  state.isPerCapitaMode = false;
  state.perCapitaMultiplier = 100;
  ["select-transform-mode", "select-transform-mode-step1"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "raw";
  });

  populateVariableDropdowns();
  switchActiveVariable(varKeys[0], false);
  showToast(`${Object.keys(newVars).length}個の指標データを正常に読み込みました`, "success");
}

export function parseFileInput(file) {
  if (!file) return;

  const fileName = file.name || "";
  const isExcel = /\.(xlsx|xls)$/i.test(fileName);

  if (isExcel) {
    if (typeof window.XLSX === "undefined" && typeof XLSX === "undefined") {
      showToast("Excelファイルの読み込みライブラリがロードされていません", "error");
      return;
    }
    const xlsxLib = window.XLSX || XLSX;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = xlsxLib.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const csvText = xlsxLib.utils.sheet_to_csv(worksheet);
        parseRawText(csvText, `Excel: ${fileName} (${firstSheetName})`);
      } catch (err) {
        console.error(err);
        showToast("Excelファイルの解析に失敗しました: " + err.message, "error");
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        parseRawText(text, `ファイル: ${fileName}`);
      } catch (err) {
        console.error(err);
        showToast("ファイルの解析に失敗しました: " + err.message, "error");
      }
    };
    reader.readAsText(file, "UTF-8");
  }
}

