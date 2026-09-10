// Special Values Handler (秘匿 X, 欠測 -, 不詳 …) & Robust Number Parser

export function normalizeSpecialValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return null;
  const s = String(val).trim().normalize("NFKC");
  if (!s) return null;
  if (/^[xXｘＸ]$/.test(s)) return "X";
  if (/^[-ー―—－]$/.test(s)) return "-";
  if (/^[.]{2,}$/.test(s) || s === "…" || s === "‥") return "…";
  if (/^(N\/?A|null|none|\*)$/i.test(s)) return "-";
  return null;
}

export function parseCleanNumber(valStr) {
  if (valStr === null || valStr === undefined) return NaN;
  if (typeof valStr === "number") return isNaN(valStr) ? NaN : valStr;
  let s = String(valStr).trim().normalize("NFKC");
  if (!s) return NaN;
  // Handle Japanese accounting negative signs: ▲123.4, △50
  s = s.replace(/^[▲△]/, "-");
  // Remove commas, currency symbols, and spaces
  s = s.replace(/[,\s"'\¥$円]/g, "");
  // Extract leading number even if trailing unit exists (e.g. 1200人, 15.3%, 55km2)
  let match = s.match(/^[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?/);
  if (match) {
    let parsed = parseFloat(match[0]);
    return isNaN(parsed) ? NaN : parsed;
  }
  return parseFloat(s);
}

export function isSpecialValue(val) {
  return val === "X" || val === "-" || val === "…";
}

export function isNumericValue(val) {
  return typeof val === "number" && !isNaN(val);
}

export function getSpecialValueLabel(val) {
  if (val === "X") return "秘匿 (X)";
  if (val === "-") return "欠測・該当なし (-)";
  if (val === "…") return "不詳・欠測 (…)";
  return "未入力";
}

export function getContrastingTextColor(hexColor) {
  if (!hexColor || !hexColor.startsWith("#")) return "#ffffff";
  let hex = hexColor.replace("#", "");
  if (hex.length === 3) {
    hex = hex.split("").map(c => c + c).join("");
  }
  let r = parseInt(hex.substr(0, 2), 16) || 0;
  let g = parseInt(hex.substr(2, 2), 16) || 0;
  let b = parseInt(hex.substr(4, 2), 16) || 0;
  let yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 140) ? "#0f172a" : "#ffffff";
}
