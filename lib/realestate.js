import { parseStringPromise } from "xml2js";

// 국토교통부 "아파트 매매 실거래가 상세" 조회
// 이 API는 주소 하나를 콕 집어서 조회할 수 없고, "지역(LAWD_CD) + 계약년월(DEAL_YMD)" 단위로만
// 그 달의 전체 거래 목록을 돌려줍니다. 그래서 최근 몇 개월치를 받아온 뒤, 우리가 찾는 지번과
// 일치하는 것만 걸러내는 방식으로 동작합니다.
export async function getRecentTransactions({ sigunguCd, bun, ji, months = 6 }) {
  const targetMain = parseInt(bun, 10); // 본번 (숫자)
  const targetSub = parseInt(ji, 10); // 부번 (숫자)

  const yearMonths = getRecentYearMonths(months);

  const monthlyResults = await Promise.all(
    yearMonths.map((ym) => fetchOneMonth({ sigunguCd, dealYmd: ym }))
  );

  const allRows = monthlyResults.flat();

  const matched = allRows.filter((row) => {
    const { main, sub } = parseJibun(row.jibun);
    return main === targetMain && sub === targetSub;
  });

  // 계약 해제(cdealType === 'O')된 거래는 시세 왜곡을 막기 위해 제외
  const validMatched = matched.filter((row) => row.cdealType !== "O");

  validMatched.sort((a, b) => (a.dealDateSortKey < b.dealDateSortKey ? 1 : -1));

  return {
    monthsSearched: months,
    totalRowsScanned: allRows.length,
    matchedCount: validMatched.length,
    transactions: validMatched,
  };
}

async function fetchOneMonth({ sigunguCd, dealYmd }) {
  const params = new URLSearchParams({
    serviceKey: process.env.DATA_GO_KR_KEY,
    LAWD_CD: sigunguCd,
    DEAL_YMD: dealYmd,
    numOfRows: "1000",
    pageNo: "1",
    _type: "json",
  });

  const url = `http://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev?${params.toString()}`;

  const res = await fetch(url);
  const text = await res.text();

  let items = [];

  if (text.trim().startsWith("<")) {
    const parsed = await parseStringPromise(text, { explicitArray: false });
    const header = parsed?.response?.header;
    if (header?.resultCode && header.resultCode !== "00") {
      // 해당 월에 자료가 없는 경우도 있어 에러를 던지지 않고 빈 배열로 처리
      return [];
    }
    const rawItems = parsed?.response?.body?.items?.item;
    items = !rawItems ? [] : Array.isArray(rawItems) ? rawItems : [rawItems];
  } else {
    const json = JSON.parse(text);
    const header = json?.response?.header;
    if (header?.resultCode && header.resultCode !== "00") {
      return [];
    }
    const rawItems = json?.response?.body?.items?.item;
    items = !rawItems ? [] : Array.isArray(rawItems) ? rawItems : [rawItems];
  }

  return items.map(normalizeRow);
}

function normalizeRow(item) {
  const dealYear = item.dealYear;
  const dealMonth = String(item.dealMonth).padStart(2, "0");
  const dealDay = String(item.dealDay).padStart(2, "0");

  return {
    aptName: (item.aptNm || "").trim(),
    dong: (item.aptDong || "").trim() || null,
    exclusiveArea: Number(item.excluUseAr), // 전용면적 (㎡)
    floor: item.floor,
    dealAmount: (item.dealAmount || "").trim(), // "거래금액" 문자열 (만원 단위, 쉼표 포함)
    dealAmountNumeric: parseAmount(item.dealAmount),
    dealDate: `${dealYear}-${dealMonth}-${dealDay}`,
    dealDateSortKey: `${dealYear}${dealMonth}${dealDay}`,
    dealingType: item.dealingGbn || null, // 중개거래 / 직거래
    jibun: item.jibun || "",
    cdealType: item.cdealType || null, // "O"면 해제된 거래
  };
}

function parseAmount(raw) {
  if (!raw) return null;
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isNaN(n) ? null : n * 10000; // 만원 -> 원 단위로 환산
}

function parseJibun(jibun) {
  if (!jibun) return { main: null, sub: null };
  const parts = String(jibun).split("-");
  const main = parseInt(parts[0], 10);
  const sub = parts.length > 1 ? parseInt(parts[1], 10) : 0;
  return { main: Number.isNaN(main) ? null : main, sub: Number.isNaN(sub) ? 0 : sub };
}

function getRecentYearMonths(count) {
  const result = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
    result.push(ym);
  }
  return result;
}
