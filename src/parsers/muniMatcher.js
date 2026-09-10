// Name Normalizer & Fuzzy Matcher for Aomori Municipalities
import { AOMORI_MUNICIPALITIES } from '../config/municipalities.js';

const ALIAS_TO_STANDARD = {
  // Hiragana / Katakana
  "あおもり": "青森市", "アオモリ": "青森市",
  "ひろさき": "弘前市", "ヒロサキ": "弘前市",
  "はちのへ": "八戸市", "ハチノヘ": "八戸市",
  "くろいし": "黒石市", "クロイシ": "黒石市",
  "ごしょがわら": "五所川原市", "ゴショガワラ": "五所川原市",
  "とわだ": "十和田市", "トワダ": "十和田市",
  "みさわ": "三沢市", "ミサワ": "三沢市",
  "むつ": "むつ市", "ムツ": "むつ市",
  "つがる": "つがる市", "ツガル": "つがる市",
  "ひらかわ": "平川市", "ヒラカワ": "平川市",
  "ひらない": "平内町", "ヒラナイ": "平内町",
  "いまべつ": "今別町", "イマベツ": "今別町",
  "よもぎた": "蓬田村", "ヨモギタ": "蓬田村",
  "そとがはま": "外ヶ浜町", "ソトガハマ": "外ヶ浜町",
  "あじがさわ": "鰺ヶ沢町", "アジガサワ": "鰺ヶ沢町",
  "ふかうら": "深浦町", "フカウラ": "深浦町",
  "にしめや": "西目屋村", "ニシメヤ": "西目屋村",
  "ふじさき": "藤崎町", "フジサキ": "藤崎町",
  "おおわに": "大鰐町", "オオワニ": "大鰐町",
  "いなかだて": "田舎館村", "イナカダテ": "田舎館村",
  "いたやなぎ": "板柳町", "イタヤナギ": "板柳町",
  "つるた": "鶴田町", "ツルタ": "鶴田町",
  "なかどまり": "中泊町", "ナカドマリ": "中泊町",
  "のへじ": "野辺地町", "ノヘジ": "野辺地町",
  "しちのへ": "七戸町", "シチノヘ": "七戸町",
  "ろくのへ": "六戸町", "ロクノヘ": "六戸町",
  "よこはま": "横浜町", "ヨコハマ": "横浜町",
  "とうほく": "東北町", "トウホク": "東北町",
  "ろっかしょ": "六ヶ所村", "ロッカショ": "六ヶ所村",
  "おいらせ": "おいらせ町", "オイラセ": "おいらせ町",
  "おおま": "大間町", "オオマ": "大間町", "オーマ": "大間町",
  "ひがしどおり": "東通村", "ヒガシドオリ": "東通村",
  "かざまうら": "風間浦村", "カザマウラ": "風間浦村",
  "さい": "佐井村", "サイ": "佐井村",
  "さんもへ": "三戸町", "サンモヘ": "三戸町",
  "ごのへ": "五戸町", "ゴノヘ": "五戸町",
  "たっこ": "田子町", "タッコ": "田子町",
  "なんぶ": "南部町", "ナンブ": "南部町",
  "はしかみ": "階上町", "ハシカミ": "階上町",
  "しんごう": "新郷村", "シンゴウ": "新郷村",

  // Former Municipalities (Legacy / Merger Support) & Common Kanji Variants
  "津軽市": "つがる市", "津軽": "つがる市", "ツガルシ": "つがる市",
  "鯵ヶ沢町": "鰺ヶ沢町", "鯵ヶ沢": "鰺ヶ沢町", "アジガサワマチ": "鰺ヶ沢町",
  "浪岡町": "青森市", "浪岡": "青森市",
  "岩木町": "弘前市", "岩木": "弘前市", "相馬村": "弘前市", "相馬": "弘前市",
  "南郷村": "八戸市", "南郷": "八戸市",
  "金木町": "五所川原市", "金木": "五所川原市", "市浦村": "五所川原市", "市浦": "五所川原市",
  "十和田湖町": "十和田市", "十和田湖": "十和田市",
  "川内町": "むつ市", "脇野沢村": "むつ市", "大畑町": "むつ市",
  "木造町": "つがる市", "森田村": "つがる市", "柏村": "つがる市", "稲垣村": "つがる市", "車力村": "つがる市",
  "尾上町": "平川市", "平賀町": "平川市", "碇ヶ関村": "平川市",
  "蟹田町": "外ヶ浜町", "平舘村": "外ヶ浜町", "三厩村": "外ヶ浜町",
  "岩崎村": "深浦町",
  "常盤村": "藤崎町",
  "中里町": "中泊町", "小泊村": "中泊町",
  "天間林村": "七戸町",
  "上北町": "東北町",
  "百石町": "おいらせ町", "下田町": "おいらせ町",
  "名川町": "南部町", "福地村": "南部町",
  "倉石村": "五戸町"
};

export function normalizeNameInfo(inputName) {
  if (!inputName) return { matched: null, type: "empty", original: "" };
  let orig = String(inputName).trim();
  let s = orig.normalize('NFKC')
    .replace(/^青森県/, "")
    .replace(/[\s\u3000,\.\-"']/g, "");

  if (!s) return { matched: null, type: "empty", original: orig };

  // Normalize 'ケ' (large) / 'ｹ' (half-width) to 'ヶ' (small), and '鯵' to '鰺'
  let sCanonical = s.replace(/[ケｹ]/g, "ヶ").replace(/鯵/g, "鰺");
  if (sCanonical === "津軽市" || sCanonical === "津軽") {
    sCanonical = "つがる市";
  }

  // 1. Municipality Code Match
  for (let m of AOMORI_MUNICIPALITIES) {
    if (m.code === s || m.code === "0" + s || m.code.slice(1) === s) {
      return { matched: m.name, type: (orig === m.name ? "exact" : "code"), original: orig };
    }
  }

  // 2. Direct Match (with exact or ケ/ヶ normalized)
  for (let m of AOMORI_MUNICIPALITIES) {
    let mCanonical = m.name.replace(/[ケｹ]/g, "ヶ");
    if (m.name === s) {
      return { matched: m.name, type: "exact", original: orig };
    }
    if (mCanonical === sCanonical) {
      return { matched: m.name, type: "corrected", original: orig };
    }
  }

  // 3. Match without Suffix ('市', '町', '村') - Auto-completing missing suffix
  for (let m of AOMORI_MUNICIPALITIES) {
    let base = m.name.replace(/[市町村]$/, "");
    let baseCanonical = base.replace(/[ケｹ]/g, "ヶ");

    if (s === base || sCanonical === baseCanonical) {
      return { matched: m.name, type: "suffix_completed", original: orig };
    }
    if (s === base + "市" || s === base + "町" || s === base + "村" ||
        sCanonical === baseCanonical + "市" || sCanonical === baseCanonical + "町" || sCanonical === baseCanonical + "村") {
      return { matched: m.name, type: "corrected", original: orig };
    }
  }

  // 4. Hiragana / Katakana / Legacy Merger Alias Match
  if (ALIAS_TO_STANDARD[s]) {
    return { matched: ALIAS_TO_STANDARD[s], type: "alias", original: orig };
  }
  if (ALIAS_TO_STANDARD[sCanonical]) {
    return { matched: ALIAS_TO_STANDARD[sCanonical], type: "alias", original: orig };
  }

  return { matched: null, type: "unmatched", original: orig };
}

export function normalizeName(inputName) {
  const res = normalizeNameInfo(inputName);
  return res.matched;
}
