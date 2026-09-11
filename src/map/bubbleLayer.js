// Bubble Map Layer (重なり回避・引き出し線付きバブル塗り分け)
import { state } from '../core/state.js';
import { AOMORI_MUNICIPALITIES } from '../config/municipalities.js';
import { isNumericValue, isSpecialValue, getSpecialValueLabel, getContrastingTextColor } from '../parsers/numberParser.js';
import { getEffectiveValues, formatNumber, getEffectiveUnit } from '../stats/statsEngine.js';
import { getColorForValue, getStepIndexForValue } from './legendRenderer.js';
import { setBoxplotHover, clearBoxplotHover } from './boxplotRenderer.js';

export function renderBubbleLayer() {
  if (!state.leafletMap || !state.dynamicCentroids || Object.keys(state.dynamicCentroids).length === 0) return;

  if (typeof L === 'undefined') return;

  if (!state.bubbleGroup) {
    state.bubbleGroup = L.layerGroup().addTo(state.leafletMap);
  }
  state.bubbleGroup.clearLayers();

  if (state.mapRenderMode !== "bubble") return;

  // 1. 各自治体の初期ノード構築
  const effectiveVals = getEffectiveValues();
  const validNums = Object.values(effectiveVals).filter(v => typeof v === 'number' && !isNaN(v));
  const minVal = validNums.length > 0 ? Math.min(...validNums) : 0;
  const maxVal = validNums.length > 0 ? Math.max(...validNums) : 1;

  let nodes = [];
  AOMORI_MUNICIPALITIES.forEach(m => {
    let centroid = state.dynamicCentroids[m.name];
    if (!centroid) return;

    let pt = state.leafletMap.latLngToLayerPoint(centroid);
    let val = effectiveVals[m.name];
    let rawVal = state.currentValues[m.name];
    let hasVal = isNumericValue(val);
    let isSpecial = isSpecialValue(val);

    // 半径の決定
    let r = 21; // default equal mode: 直径42px
    if (state.bubbleSizeMode === "step") {
      // 塗り分けのステップ（階級）に完全に合わせた段階的サイズ拡大（段階シンボル図）
      let stepIdx = getStepIndexForValue(val);
      let numClasses = (state.computedBreaks && state.computedBreaks.length > 1) 
        ? state.computedBreaks.length - 1 
        : 1;
      if (stepIdx >= 0 && numClasses > 1) {
        let stepRatio = stepIdx / (numClasses - 1);
        r = Math.round(17 + stepRatio * 16); // 半径17px〜33px（直径34px〜66px）
      } else {
        r = 19;
      }
    } else if (state.bubbleSizeMode === "population") {
      let pop = state.baselinePopulation[m.name] || 5000;
      let popRatio = (Math.sqrt(pop) - Math.sqrt(1000)) / (Math.sqrt(270000) - Math.sqrt(1000));
      popRatio = Math.max(0, Math.min(1, popRatio));
      r = Math.round(17 + popRatio * 15); // 半径17px〜32px（直径34px〜64px）
    } else if (state.bubbleSizeMode === "value") {
      // 最小値〜最大値の相対差分に応じた面積比例（半径の平方根スケーリング）
      if (hasVal && maxVal > minVal) {
        let valRatio = Math.sqrt(Math.max(0, val - minVal) / (maxVal - minVal));
        valRatio = Math.max(0, Math.min(1, valRatio));
        r = Math.round(17 + valRatio * 17); // 半径17px〜34px（直径34px〜68px）
      } else {
        r = 21;
      }
    }

    // 中核都市はアンカーとして位置を安定化（弘前市を中心に周囲の小町村を放射状に綺麗に押し出す）
    let isAnchor = (m.name === "弘前市" || m.name === "青森市" || m.name === "八戸市");

    nodes.push({
      name: m.name,
      latlng: centroid,
      origX: pt.x,
      origY: pt.y,
      x: pt.x,
      y: pt.y,
      r: r,
      isAnchor: isAnchor,
      val: val,
      rawVal: rawVal,
      hasVal: hasVal,
      isSpecial: isSpecial
    });
  });

  // 2. 力学シミュレーション（フォースレイアウトによる衝突回避・弘前市周辺などの小自治体オフセット）
  const ITERATIONS = 120;
  const PADDING = 3; // バブル間の余白

  for (let iter = 0; iter < ITERATIONS; iter++) {
    let alpha = Math.pow(1.0 - (iter / ITERATIONS), 1.0); // 冷却

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        let a = nodes[i];
        let b = nodes[j];

        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        let minDist = a.r + b.r + PADDING;

        if (dist < minDist) {
          if (dist === 0) {
            dx = (Math.random() - 0.5) * 2;
            dy = (Math.random() - 0.5) * 2;
            dist = Math.sqrt(dx * dx + dy * dy) || 1;
          }

          let overlap = minDist - dist;
          let fx = (dx / dist) * overlap * 0.5;
          let fy = (dy / dist) * overlap * 0.5;

          if (a.isAnchor && !b.isAnchor) {
            b.x -= fx * 1.8;
            b.y -= fy * 1.8;
            a.x += fx * 0.2;
            a.y += fy * 0.2;
          } else if (!a.isAnchor && b.isAnchor) {
            a.x += fx * 1.8;
            a.y += fy * 1.8;
            b.x -= fx * 0.2;
            b.y -= fy * 0.2;
          } else {
            a.x += fx;
            a.y += fy;
            b.x -= fx;
            b.y -= fy;
          }
        }
      }
    }

    // 重心への緩やかな復元引力と、最大変位の制限
    nodes.forEach(node => {
      let spring = node.isAnchor ? 0.05 : 0.025;
      node.x += (node.origX - node.x) * spring * alpha;
      node.y += (node.origY - node.y) * spring * alpha;

      let offX = node.x - node.origX;
      let offY = node.y - node.origY;
      let distFromOrig = Math.sqrt(offX * offX + offY * offY);
      let maxOffset = node.isAnchor ? 15 : 68;
      if (distFromOrig > maxOffset) {
        let scale = maxOffset / distFromOrig;
        node.x = node.origX + offX * scale;
        node.y = node.origY + offY * scale;
      }
    });
  }

  // 3. レイヤー描画（引き出し線 ＋ 起点ドット ＋ バブルマーカー）
  nodes.forEach(node => {
    let targetPt = L.point(node.x, node.y);
    let targetLatLng = state.leafletMap.layerPointToLatLng(targetPt);
    let distFromOrig = Math.sqrt(Math.pow(node.x - node.origX, 2) + Math.pow(node.y - node.origY, 2));

    // 9px以上ずれた場合は引き出し線と起点ドットを描画
    if (distFromOrig >= 9) {
      L.circleMarker(node.latlng, {
        radius: 2.5,
        fillColor: "#475569",
        color: "#ffffff",
        weight: 1,
        fillOpacity: 0.9,
        interactive: false
      }).addTo(state.bubbleGroup);

      L.polyline([node.latlng, targetLatLng], {
        color: "#64748b",
        weight: 1.3,
        opacity: 0.85,
        dashArray: "3,3",
        interactive: false
      }).addTo(state.bubbleGroup);
    }

    let fillColor = getColorForValue(node.val);
    let isPattern = (typeof fillColor === "string" && fillColor.startsWith("url("));
    let textColor;
    let strokeBorder;
    let textShadowStyle = "";
    let strokeDashAttr = "";

    if (isPattern) {
      let patMatch = fillColor.match(/pat-(\d+)/);
      let patIdx = patMatch ? parseInt(patMatch[1], 10) : 0;
      if (patIdx >= 6) {
        // 暗いパターン（太格子・黒ベタ）: 白文字 + 黒縁取り
        textColor = "#ffffff";
        strokeBorder = "#000000";
        textShadowStyle = "text-shadow: 0 0 3px #000, 0 0 3px #000, 0 1px 2px #000;";
      } else {
        // 明るいパターン（白無地・点・線・クロス）: 濃い黒文字 + 白縁取り光彩
        textColor = "#0f172a";
        strokeBorder = "#0f172a";
        textShadowStyle = "text-shadow: 0 0 3px #fff, 0 0 3px #fff, 0 0 2px #fff;";
      }
    } else {
      textColor = getContrastingTextColor(fillColor);
      strokeBorder = (textColor === '#0f172a') ? '#334155' : '#ffffff';
      textShadowStyle = (textColor === '#0f172a')
        ? "text-shadow: 0 1px 2px rgba(255, 255, 255, 0.7);"
        : "text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);";
    }

    if (node.isSpecial) {
      strokeBorder = "#64748b";
      strokeDashAttr = 'stroke-dasharray="3,3"';
    }

    let shortVal = node.hasVal ? formatNumber(node.val) : (node.isSpecial ? node.val : "-");

    // 団体名表示フォーマット（正式名称 vs 簡略表記）
    let displayName = (state.bubbleNameFormat === "short")
      ? node.name.replace(/(?:市|町|村)$/, "")
      : node.name;
    let charLen = displayName.length;

    // バブル内径（利用可能幅）と文字数に応じた動的フォントサイズ＆文字詰めスケーリング
    // 円の内径はボーダー(4px)と左右安全マージン(4px)を引いたもの
    let availWidth = Math.max(16, (node.r * 2) - 8);
    if (state.bubbleLabelMode === "name_val") {
      // 上下2段組の場合は弦の長さになるため利用可能幅が約85%
      availWidth = Math.max(14, Math.round(node.r * 1.76) - 6);
    }
    let charWidthLimit = availWidth / Math.max(1, charLen);

    let targetFontPx = 11;
    let nameLetterSpacing = "-0.01em";
    let valFontSizePx = Math.max(6.5, Math.min(10.0, Math.round(node.r * 0.42)));

    if (state.bubbleLabelMode === "name") {
      // 自治体名のみ表示の場合
      if (charLen >= 5) {
        nameLetterSpacing = "-0.05em";
        targetFontPx = Math.min(9.5, charWidthLimit * 1.05);
      } else if (charLen === 4) {
        nameLetterSpacing = "-0.035em";
        targetFontPx = Math.min(10.8, charWidthLimit * 1.03);
      } else if (charLen === 3) {
        nameLetterSpacing = "-0.02em";
        targetFontPx = Math.min(12.0, charWidthLimit * 1.02);
      } else {
        nameLetterSpacing = "-0.01em";
        targetFontPx = Math.min(13.2, charWidthLimit * 1.0);
      }
      targetFontPx = Math.max(7.2, targetFontPx);
    } else if (state.bubbleLabelMode === "name_val") {
      // 自治体名＋数値表示の場合
      if (charLen >= 5) {
        nameLetterSpacing = "-0.05em";
        targetFontPx = Math.min(8.0, charWidthLimit * 1.05);
      } else if (charLen === 4) {
        nameLetterSpacing = "-0.035em";
        targetFontPx = Math.min(9.2, charWidthLimit * 1.03);
      } else if (charLen === 3) {
        nameLetterSpacing = "-0.02em";
        targetFontPx = Math.min(10.2, charWidthLimit * 1.02);
      } else {
        nameLetterSpacing = "-0.01em";
        targetFontPx = Math.min(11.4, charWidthLimit * 1.0);
      }
      targetFontPx = Math.max(6.8, targetFontPx);
    }

    let nameFontSize = `${targetFontPx.toFixed(1)}px`;
    let valFontSize = `${valFontSizePx.toFixed(1)}px`;

    let labelHTML = "";
    if (state.bubbleLabelMode === "name") {
      labelHTML = `<span class="muni-bubble-name" style="color:${textColor}; font-size:${nameFontSize}; letter-spacing:${nameLetterSpacing}; ${textShadowStyle}">${displayName}</span>`;
    } else if (state.bubbleLabelMode === "name_val") {
      labelHTML = `
        <span class="muni-bubble-name" style="color:${textColor}; font-size:${nameFontSize}; letter-spacing:${nameLetterSpacing}; ${textShadowStyle}">${displayName}</span>
        <span class="muni-bubble-val" style="color:${textColor}; font-size:${valFontSize}; ${textShadowStyle}">${shortVal}</span>
      `;
    }

    let diameter = node.r * 2;

    let icon = L.divIcon({
      className: "bubble-div-icon",
      html: `
        <div class="muni-bubble-marker" style="
          width: ${diameter}px;
          height: ${diameter}px;
          position: relative;
          background: transparent;
        ">
          <svg width="${diameter}" height="${diameter}" style="position:absolute; top:0; left:0; pointer-events:none; border-radius:50%; z-index:0; overflow:hidden;">
            <circle cx="${node.r}" cy="${node.r}" r="${node.r - 1}" fill="${fillColor}" stroke="${strokeBorder}" stroke-width="2" ${strokeDashAttr} />
          </svg>
          <div style="position:relative; z-index:1; display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%; pointer-events:none;">
            ${labelHTML}
          </div>
        </div>
      `,
      iconSize: [diameter, diameter],
      iconAnchor: [node.r, node.r]
    });

    let marker = L.marker(targetLatLng, { icon: icon });

    let displayVal = node.hasVal 
      ? `${node.val.toLocaleString()} <small style="color:#cbd5e1">${getEffectiveUnit()}</small>` 
      : (node.isSpecial ? getSpecialValueLabel(node.val) : "未入力");

    marker.bindTooltip(`
      <div style="font-weight:700; font-size:0.9rem;">${node.name}</div>
      <div style="color:#60a5fa; font-size:0.85rem; margin-top:2px;">
        ${displayVal}
      </div>
    `, { sticky: true, direction: 'top', offset: [0, -node.r] });

    marker.on({
      mouseover: (e) => {
        state.hoveredMunicipality = node.name;
        if (node.hasVal && typeof setBoxplotHover === "function") {
          setBoxplotHover(node.name, node.val);
        }
      },
      mouseout: (e) => {
        state.hoveredMunicipality = null;
        if (typeof clearBoxplotHover === "function") {
          clearBoxplotHover();
        }
      },
      click: () => {
        const tr = document.querySelector(`.data-table tbody tr[data-name="${node.name}"]`);
        if (tr) {
          tr.scrollIntoView({ behavior: "smooth", block: "center" });
          const input = tr.querySelector(".cell-val-input");
          if (input) {
            input.focus();
            input.style.transition = "background 0.3s";
            input.style.backgroundColor = "#fef08a";
            setTimeout(() => {
              input.style.backgroundColor = "";
            }, 1200);
          }
        }
      }
    });

    marker.addTo(state.bubbleGroup);
  });
}
