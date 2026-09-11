// Master List of 40 Municipalities in Aomori Prefecture & Region Bounds

export const AOMORI_MUNICIPALITIES = [
  { name: "青森市", code: "02201", type: "市", region: "tsugaru", center: [40.8244, 140.7400] },
  { name: "弘前市", code: "02202", type: "市", region: "tsugaru", center: [40.6031, 140.4641] },
  { name: "八戸市", code: "02203", type: "市", region: "nanbu", center: [40.5123, 141.4884] },
  { name: "黒石市", code: "02204", type: "市", region: "tsugaru", center: [40.6425, 140.5975] },
  { name: "五所川原市", code: "02205", type: "市", region: "tsugaru", center: [40.8108, 140.4462] },
  { name: "十和田市", code: "02206", type: "市", region: "nanbu", center: [40.6133, 141.2064] },
  { name: "三沢市", code: "02207", type: "市", region: "nanbu", center: [40.6844, 141.3683] },
  { name: "むつ市", code: "02208", type: "市", region: "shimokita", center: [41.2931, 141.1833] },
  { name: "つがる市", code: "02209", type: "市", region: "tsugaru", center: [40.8094, 140.3800] },
  { name: "平川市", code: "02210", type: "市", region: "tsugaru", center: [40.5847, 140.5683] },
  { name: "平内町", code: "02301", type: "町", region: "tsugaru", center: [40.9239, 140.9536] },
  { name: "今別町", code: "02303", type: "町", region: "tsugaru", center: [41.1822, 140.4900] },
  { name: "蓬田村", code: "02304", type: "村", region: "tsugaru", center: [40.9856, 140.5986] },
  { name: "外ヶ浜町", code: "02307", type: "町", region: "tsugaru", center: [41.0427, 140.6394] },
  { name: "鰺ヶ沢町", code: "02321", type: "町", region: "tsugaru", center: [40.7761, 140.2197] },
  { name: "深浦町", code: "02323", type: "町", region: "tsugaru", center: [40.6506, 139.9325] },
  { name: "西目屋村", code: "02343", type: "村", region: "tsugaru", center: [40.5750, 140.3000] },
  { name: "藤崎町", code: "02361", type: "町", region: "tsugaru", center: [40.6547, 140.4939] },
  { name: "大鰐町", code: "02362", type: "町", region: "tsugaru", center: [40.5208, 140.5694] },
  { name: "田舎館村", code: "02367", type: "村", region: "tsugaru", center: [40.6319, 140.5519] },
  { name: "板柳町", code: "02381", type: "町", region: "tsugaru", center: [40.6975, 140.4578] },
  { name: "鶴田町", code: "02384", type: "町", region: "tsugaru", center: [40.7619, 140.4328] },
  { name: "中泊町", code: "02387", type: "町", region: "tsugaru", center: [40.9639, 140.4339] },
  { name: "野辺地町", code: "02401", type: "町", region: "nanbu", center: [40.8711, 141.1278] },
  { name: "七戸町", code: "02402", type: "町", region: "nanbu", center: [40.7042, 141.1558] },
  { name: "六戸町", code: "02405", type: "町", region: "nanbu", center: [40.6278, 141.3122] },
  { name: "横浜町", code: "02406", type: "町", region: "shimokita", center: [41.0850, 141.2528] },
  { name: "東北町", code: "02408", type: "町", region: "nanbu", center: [40.7500, 141.2500] },
  { name: "六ヶ所村", code: "02411", type: "村", region: "nanbu", center: [40.9678, 141.3694] },
  { name: "おいらせ町", code: "02412", type: "町", region: "nanbu", center: [40.6019, 141.4286] },
  { name: "大間町", code: "02423", type: "町", region: "shimokita", center: [41.5283, 140.9208] },
  { name: "東通村", code: "02424", type: "村", region: "shimokita", center: [41.2764, 141.3325] },
  { name: "風間浦村", code: "02425", type: "村", region: "shimokita", center: [41.4722, 141.0189] },
  { name: "佐井村", code: "02426", type: "村", region: "shimokita", center: [41.4286, 140.8586] },
  { name: "三戸町", code: "02441", type: "町", region: "nanbu", center: [40.3756, 141.2536] },
  { name: "五戸町", code: "02442", type: "町", region: "nanbu", center: [40.5239, 141.3092] },
  { name: "田子町", code: "02443", type: "町", region: "nanbu", center: [40.3392, 141.1542] },
  { name: "南部町", code: "02445", type: "町", region: "nanbu", center: [40.4464, 141.3533] },
  { name: "階上町", code: "02446", type: "町", region: "nanbu", center: [40.4561, 141.6214] },
  { name: "新郷村", code: "02450", type: "村", region: "nanbu", center: [40.4489, 141.1447] }
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
