// Master List of 40 Municipalities in Aomori Prefecture & Region Bounds

export const AOMORI_MUNICIPALITIES = [
  { name: "青森市", code: "02201", type: "市", region: "tsugaru", center: [40.7701, 140.7542] },
  { name: "弘前市", code: "02202", type: "市", region: "tsugaru", center: [40.6051, 140.3844] },
  { name: "八戸市", code: "02203", type: "市", region: "nanbu", center: [40.4740, 141.4811] },
  { name: "黒石市", code: "02204", type: "市", region: "tsugaru", center: [40.6171, 140.7047] },
  { name: "五所川原市", code: "02205", type: "市", region: "tsugaru", center: [40.8577, 140.5053] },
  { name: "十和田市", code: "02206", type: "市", region: "nanbu", center: [40.5668, 141.0570] },
  { name: "三沢市", code: "02207", type: "市", region: "nanbu", center: [40.7463, 141.3812] },
  { name: "むつ市", code: "02208", type: "市", region: "shimokita", center: [41.2909, 141.0333] },
  { name: "つがる市", code: "02209", type: "市", region: "tsugaru", center: [40.8698, 140.3496] },
  { name: "平川市", code: "02210", type: "市", region: "tsugaru", center: [40.5183, 140.7005] },
  { name: "平内町", code: "02301", type: "町", region: "tsugaru", center: [40.9076, 140.9563] },
  { name: "今別町", code: "02303", type: "町", region: "tsugaru", center: [41.1603, 140.5163] },
  { name: "蓬田村", code: "02304", type: "村", region: "tsugaru", center: [40.9950, 140.5967] },
  { name: "外ヶ浜町", code: "02307", type: "町", region: "tsugaru", center: [41.0959, 140.5744] },
  { name: "鰺ヶ沢町", code: "02321", type: "町", region: "tsugaru", center: [40.6514, 140.1867] },
  { name: "深浦町", code: "02323", type: "町", region: "tsugaru", center: [40.6049, 140.0183] },
  { name: "西目屋村", code: "02343", type: "村", region: "tsugaru", center: [40.5106, 140.2370] },
  { name: "藤崎町", code: "02361", type: "町", region: "tsugaru", center: [40.6752, 140.5166] },
  { name: "大鰐町", code: "02362", type: "町", region: "tsugaru", center: [40.4841, 140.5514] },
  { name: "田舎館村", code: "02367", type: "村", region: "tsugaru", center: [40.6421, 140.5417] },
  { name: "板柳町", code: "02381", type: "町", region: "tsugaru", center: [40.7156, 140.4811] },
  { name: "鶴田町", code: "02384", type: "町", region: "tsugaru", center: [40.7565, 140.4212] },
  { name: "中泊町", code: "02387", type: "町", region: "tsugaru", center: [41.0013, 140.4507] },
  { name: "野辺地町", code: "02401", type: "町", region: "nanbu", center: [40.8847, 141.1465] },
  { name: "七戸町", code: "02402", type: "町", region: "nanbu", center: [40.7316, 141.0787] },
  { name: "六戸町", code: "02405", type: "町", region: "nanbu", center: [40.6276, 141.3154] },
  { name: "横浜町", code: "02406", type: "町", region: "shimokita", center: [41.0670, 141.2850] },
  { name: "東北町", code: "02408", type: "町", region: "nanbu", center: [40.7955, 141.2347] },
  { name: "六ヶ所村", code: "02411", type: "村", region: "nanbu", center: [40.9568, 141.3311] },
  { name: "おいらせ町", code: "02412", type: "町", region: "nanbu", center: [40.6263, 141.4020] },
  { name: "大間町", code: "02423", type: "町", region: "shimokita", center: [41.4760, 140.9277] },
  { name: "東通村", code: "02424", type: "村", region: "shimokita", center: [41.2783, 141.3519] },
  { name: "風間浦村", code: "02425", type: "村", region: "shimokita", center: [41.4640, 141.0143] },
  { name: "佐井村", code: "02426", type: "村", region: "shimokita", center: [41.3527, 140.8552] },
  { name: "三戸町", code: "02441", type: "町", region: "nanbu", center: [40.3771, 141.1756] },
  { name: "五戸町", code: "02442", type: "町", region: "nanbu", center: [40.5082, 141.2967] },
  { name: "田子町", code: "02443", type: "町", region: "nanbu", center: [40.3091, 141.0499] },
  { name: "南部町", code: "02445", type: "町", region: "nanbu", center: [40.4222, 141.3471] },
  { name: "階上町", code: "02446", type: "町", region: "nanbu", center: [40.4304, 141.5842] },
  { name: "新郷村", code: "02450", type: "村", region: "nanbu", center: [40.4473, 141.1076] }
];

// Region bounding boxes for map view zooming (all, 3 major regions, and sub-regions)
export const REGION_BOUNDS = {
  "all": [[40.186, 139.477], [41.706, 142.028]],
  "tsugaru": [[40.350, 139.450], [41.300, 141.120]], // 津軽地域
  "sanpachi": [[40.180, 140.900], [40.640, 141.720]], // 三八地域（南部地方・八戸市/三戸郡）
  "kamikita": [[40.380, 140.800], [41.200, 141.520]], // 上北地域（南部地方・十和田市/三沢市/上北郡）
  "shimokita": [[41.050, 140.720], [41.600, 141.520]], // 下北地域
  "nanbu": [[40.180, 140.800], [41.200, 141.720]]     // 南部地方広域（三八＋上北）
};
