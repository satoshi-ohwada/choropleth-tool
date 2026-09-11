// PNG & SVG Map Image Exporter & Clipboard Copy Engine
import { state } from '../core/state.js';
import { AOMORI_MUNICIPALITIES } from '../config/municipalities.js';
import { getEffectiveValues, getEffectiveUnit } from '../stats/statsEngine.js';
import { initLeafletMap, renderGeoJSONLayer } from '../map/mapRenderer.js';
import { showToast } from '../ui/toast.js';

export async function generateMapPNGData() {
  const step2 = document.getElementById("step2-map");
  const wasStep2Hidden = step2 && (step2.style.display === "none" || (typeof window !== "undefined" && window.getComputedStyle(step2).display === "none"));
  if (wasStep2Hidden) {
    step2.style.display = "flex";
    step2.style.visibility = "hidden";
    step2.style.position = "absolute";
    step2.style.left = "-9999px";
    step2.style.width = "1200px";
    step2.style.height = "850px";
  }

  if (!state.leafletMap && typeof initLeafletMap === "function") {
    initLeafletMap();
    renderGeoJSONLayer();
  } else if (state.leafletMap) {
    state.leafletMap.invalidateSize({ animate: false });
  }

  const frame = document.getElementById("export-map-frame");
  if (!frame) throw new Error("Export map frame not found");

  const leafletMapEl = document.getElementById("leaflet-map");
  const zoomControls = document.querySelectorAll(".leaflet-control-zoom");
  const detailCard = document.getElementById("municipality-detail-card");

  zoomControls.forEach(el => el.style.display = "none");
  if (detailCard) detailCard.classList.add("hidden");

  const prevBoxShadow = frame.style.boxShadow;
  const prevBorder = frame.style.border;
  const prevBgImage = frame.style.backgroundImage;
  const prevBgColor = frame.style.backgroundColor;
  const prevBg = frame.style.background;
  const prevMapBg = leafletMapEl ? leafletMapEl.style.background : "";
  const prevMapBgColor = leafletMapEl ? leafletMapEl.style.backgroundColor : "";

  frame.style.boxShadow = "none";
  frame.style.border = "none";

  const isTransparent = (state.mapBg === "transparent");
  if (isTransparent) {
    frame.classList.remove("transparent-bg");
    frame.style.backgroundImage = "none";
    frame.style.backgroundColor = "transparent";
    frame.style.background = "none";
    if (leafletMapEl) {
      leafletMapEl.style.background = "none";
      leafletMapEl.style.backgroundColor = "transparent";
    }
  }

  try {
    const scale = parseInt(state.exportScale, 10) || 3;
    const bgColor = isTransparent ? null : (state.mapBg === "minimal-dark" ? "#0f172a" : (state.mapBg === "minimal-light" ? "#f8fafc" : "#ffffff"));

    let dataUrl = null;
    if (window.htmlToImage && typeof window.htmlToImage.toPng === "function") {
      dataUrl = await window.htmlToImage.toPng(frame, {
        pixelRatio: scale,
        skipFonts: true,
        cacheBust: true,
        backgroundColor: bgColor
      });
    } else {
      throw new Error("htmlToImage library is missing");
    }

    return dataUrl;
  } finally {
    if (isTransparent) {
      frame.classList.add("transparent-bg");
    }
    frame.style.boxShadow = prevBoxShadow;
    frame.style.border = prevBorder;
    frame.style.backgroundImage = prevBgImage;
    frame.style.backgroundColor = prevBgColor;
    frame.style.background = prevBg;
    if (leafletMapEl) {
      leafletMapEl.style.background = prevMapBg;
      leafletMapEl.style.backgroundColor = prevMapBgColor;
    }
    zoomControls.forEach(el => el.style.display = "");

    if (wasStep2Hidden) {
      step2.style.display = "none";
      step2.style.visibility = "";
      step2.style.position = "";
      step2.style.left = "";
      step2.style.width = "";
      step2.style.height = "";
    }
  }
}

export async function exportPNG() {
  try {
    showToast("高解像度PNG画像を生成しています...", "info");
    const dataUrl = await generateMapPNGData();
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    link.download = `青森県コロプレスマップ_${state.title || "統計マップ"}_${dateStr}.png`;
    link.href = dataUrl;
    link.click();
    showToast("高解像度PNG画像をダウンロード保存しました", "success");
  } catch (err) {
    console.error(err);
    showToast("PNG画像の生成に失敗しました: " + err.message, "error");
  }
}

export async function copyPNGToClipboard() {
  try {
    showToast("クリップボード用画像を生成中...", "info");
    const dataUrl = await generateMapPNGData();
    const res = await fetch(dataUrl);
    const blob = await res.blob();

    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([
        new window.ClipboardItem({ [blob.type]: blob })
      ]);
      showToast("マップ画像をクリップボードにコピーしました！資料にそのまま貼り付けできます", "success");
    } else {
      showToast("お使いのブラウザは直接の画像コピーに対応していません", "warning");
    }
  } catch (err) {
    console.error(err);
    showToast("画像のクリップボードコピーに失敗しました: " + err.message, "error");
  }
}

export function exportCSVData() {
  try {
    const v = state.variables[state.activeVariableKey];
    const effVals = getEffectiveValues();
    const unit = getEffectiveUnit() || state.unit || "";
    const colName = v ? v.name : "数値";
    const headerUnit = unit ? ` (${unit})` : "";
    let csvRows = [`自治体コード,市町村名,${colName}${headerUnit}`];

    AOMORI_MUNICIPALITIES.forEach(m => {
      let val = effVals[m.name];
      csvRows.push(`${m.code},${m.name},${val !== undefined && val !== null ? val : ""}`);
    });

    const csvString = "\uFEFF" + csvRows.join("\r\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    link.download = `青森県市町村データ_${v ? v.name : "集計"}_${dateStr}.csv`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("CSVデータを正常にダウンロードしました", "success");
  } catch (err) {
    console.error(err);
    showToast("CSVデータの保存に失敗しました", "error");
  }
}

export function exportCSVTemplate() {
  try {
    let csvRows = ["自治体コード,市町村名,数値"];
    AOMORI_MUNICIPALITIES.forEach(m => {
      csvRows.push(`${m.code},${m.name},`);
    });

    const csvString = "\uFEFF" + csvRows.join("\r\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = "青森県市町村データ入力用テンプレート.csv";
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("CSV入力用テンプレートをダウンロードしました", "success");
  } catch (err) {
    console.error(err);
    showToast("テンプレートのダウンロードに失敗しました", "error");
  }
}

