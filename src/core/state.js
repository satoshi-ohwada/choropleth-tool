// Application Central Reactive State

export const state = {
  geojsonData: null,
  baselinePopulation: {},
  isPerCapitaMode: false,
  activeVariableKey: null,
  variables: {}, // key -> { id, name, label, unit, title, subtitle, remarks, palette, data }
  currentValues: {}, // muniName -> number or special string
  title: "",
  subtitle: "",
  unit: "",
  remarks: "",
  paletteKey: "blues",
  lastStandardPalette: "blues",
  useCustomGradient: false,
  customStartColor: "#eff6ff",
  customEndColor: "#1e3a8a",
  invertPalette: false,
  binningMode: "equal", // 'equal' | 'jenks' | 'quantile' | 'custom'
  stepCount: 5,
  numClasses: 5,
  customBreaks: [],
  mapBg: "none",
  strokeOpacity: 0.8,
  strokeWidth: 1.5,
  strokeColor: "dark",
  showOuterBorder: false,
  labelMode: "none",
  labelContent: "name_val",
  legendPosition: "rightmiddle",
  exportScale: 3,
  activeRegion: "all",
  leafletMap: null,
  geojsonLayer: null,
  outerBorderLayer: null,
  labelGroup: null,
  dynamicCentroids: {},
  computedBreaks: [],
  selectedMuni: null,
  miniMap: null,
  miniMapLayer: null,
  transformMode: "raw", // 'raw' | 'per_capita' | 'zscore' | 'tscore'
  isPerCapitaMode: false, // true when per_capita is active
  perCapitaMultiplier: 100, // 1 | 100 | 1000 | 10000
  standardizeMode: "none", // 'none' | 'zscore' | 'tscore'
  exportFormat: "png", // 'png' | 'svg'
  showBoxplot: true,
  boxplotPosition: "auto",
  hoveredMunicipality: null,
  // Bubble Map Settings
  mapRenderMode: "choropleth", // 'choropleth' | 'bubble'
  bubbleSizeMode: "equal", // 'equal' | 'step' | 'value' | 'population'
  bubbleLabelMode: "name", // 'name' | 'name_val' | 'none'
  bubbleNameFormat: "full", // 'full' | 'short'
  bubbleGroup: null
};

// Make window.state globally accessible for debugging in DEV mode
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  window.state = state;
}
