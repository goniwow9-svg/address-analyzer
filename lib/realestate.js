import { parseStringPromise } from "xml2js";

// 국토교통부 "아파트 매매 실거래가 상세" 조회
// 이 API는 주소 하나를 콕 집어서 조회할 수 없고, "지역(LAWD_CD) + 계약년월(DEAL_YMD)" 단위로만
// 그 달의 전체 거래 목록을 돌려줍니다. 그래서 최근 몇 개월치를 받아온 뒤, 우리가 찾는 지번과
// 일치하는 것만 걸러내는 방식으로 동작합니다.
export async function getRecentTransactions({ sigunguCd, bun, ji, buildingName, months = 6 }) {
  const yearMonths = getRecentYearMonths(months);

  const { rows: allRows, error } = await fetchMonths(sigunguCd, yearMonths);

  if (error) {
    return { monthsSearched: months, totalRowsScanned: 0, matchedCount: 0, transactions: [], error };
  }

  const { matched, sampleAptNames } = filterMatching(allRows, { bun, ji, buildingName });

  matched.sort((a, b) => (a.dealDateSortKey < b.dealDateSortKey ? 1 : -1));

  return {
    monthsSearched: months,
    totalRowsScanned: allRows.length,
    matchedCount: matched.length,
    transactions: matched,
    sampleAptNames,
  };
}

// 최근 N년치 거래를 연도별로 묶어서 평균가/평당가/거래건수 추이를 계산합니다.
// 60개월치를 한 번에 요청하면 데이터포털에 부담이 될 수 있어 12개월씩 나눠서(연도 단위) 순차 요청합니다.
export async function getYearlyPriceHistory({ sigunguCd, bun, ji, buildingName, years = 5 }) {
  const now = new Date();
  const allRows = [];
  let firstError = null;

  for (let y = 0; y < years; y++) {
    const year = now.getFullYear() - y;
    const monthsInYear = [];
    for (let m = 1; m <= 12; m++) {
      const d = new Date(year, m - 1, 1);
      if (d > now) continue; // 미래 월은 건너뜀
      monthsInYear.push(`${year}${String(m).padStart(2, "0")}`);
    }
    // 한 해(최대 12개월)씩 병렬 요청 - 전체를 한꺼번에 쏘지 않아 서버 부담을 줄임
    const { rows, error } = await fetchMonths(sigunguCd, monthsInYear);
    allRows.push(...rows);
    if (error && !firstError && rows.length === 0) firstError = error;
  }

  if (allRows.length === 0 && firstError) {
    return { years, totalMatched: 0, matchMethod: null, yearly: [], sampleAptNames: [], error: firstError };
  }

  const { matched, sampleAptNames } = filterMatching(allRows, { bun, ji, buildingName });

  const byYear = {};
  for (const row of matched) {
    const year = row.dealDate.slice(0, 4);
    if (!byYear[year]) byYear[year] = [];
    byYear[year].push(row);
  }

  const yearly = Object.entries(byYear)
    .map(([year, rows]) => {
      const avgAmount = Math.round(rows.reduce((s, r) => s + r.dealAmountNumeric, 0) / rows.length);
      const avgPricePerPyeong = Math.round(
        rows.reduce((s, r) => s + r.dealAmountNumeric / (r.exclusiveArea / 3.3058), 0) / rows.length
      );
      return { year, count: rows.length, avgAmount, avgPricePerPyeong };
    })
    .sort((a, b) => a.year.localeCompare(b.year));

  return {
    years,
    totalMatched: matched.length,
    matchMethod: matched[0]?.matchMethod || null,
    yearly,
    sampleAptNames,
  };
}

// 지번이 정확히 맞으면 그걸로, 아니면(대단지가 여러 필지로 나뉜 경우 등) 건물명으로 보조 매칭.
// 계약 해제(cdealType === 'O')된 거래는 시세 왜곡을 막기 위해 항상 제외합니다.
function filterMatching(rows, { bun, ji, buildingName }) {
  const targetMain = parseInt(bun, 10);
  const targetSub = parseInt(ji, 10);
  const buildingNorm = normalizeName(buildingName);

  const jibunMatched = rows.filter((row) => {
    if (row.cdealType === "O") return false;
    const { main, sub } = parseJibun(row.jibun);
    return main === targetMain && sub === targetSub;
  });

  if (jibunMatched.length > 0) {
    return { matched: jibunMatched.map((r) => ({ ...r, matchMethod: "지번" })), sampleAptNames: [] };
  }

  const nameMatched = buildingNorm
    ? rows.filter((row) => {
        if (row.cdealType === "O") return false;
        const aptNorm = normalizeName(row.aptName);
        return aptNorm && (aptNorm.includes(buildingNorm) || buildingNorm.includes(aptNorm));
      })
    : [];

  if (nameMatched.length > 0) {
    return { matched: nameMatched.map((r) => ({ ...r, matchMethod: "건물명" })), sampleAptNames: [] };
  }

  // 둘 다 실패하면, 이 지역에 실제로 어떤 단지명들이 있는지 샘플을 보여줘서 눈으로 비교할 수 있게 함
  const sampleAptNames = [...new Set(rows.map((r) => r.aptName).filter(Boolean))].slice(0, 15);
  return { matched: [], sampleAptNames };
}

function normalizeName(s) {
  return (s || "").replace(/\s+/g, "").toLowerCase();
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

  if (!res.ok) {
    throw new Error(`실거래가 API 오류 (HTTP ${res.status}, ${dealYmd}): ${text.slice(0, 300)}`);
  }

  let items = [];

  if (text.trim().startsWith("<")) {
    const parsed = await parseStringPromise(text, { explicitArray: false });
    const header = parsed?.response?.header;
    // resultCode "00"은 정상, 데이터가 없을 때도 "00"으로 오고 items가 비어있을 뿐입니다.
    // 그 외 코드는 진짜 오류(인증키 문제 등)라 화면에 그대로 보여줄 수 있게 던집니다.
    if (header?.resultCode && !["00", "000"].includes(header.resultCode)) {
      throw new Error(`실거래가 API 오류 (${dealYmd}): [${header.resultCode}] ${header.resultMsg}`);
    }
    const rawItems = parsed?.response?.body?.items?.item;
    items = !rawItems ? [] : Array.isArray(rawItems) ? rawItems : [rawItems];
  } else {
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`실거래가 API 응답 파싱 실패 (${dealYmd}): ${text.slice(0, 300)}`);
    }
    const header = json?.response?.header;
    if (header?.resultCode && !["00", "000"].includes(header.resultCode)) {
      throw new Error(`실거래가 API 오류 (${dealYmd}): [${header.resultCode}] ${header.resultMsg}`);
    }
    const rawItems = json?.response?.body?.items?.item;
    items = !rawItems ? [] : Array.isArray(rawItems) ? rawItems : [rawItems];
  }

  return items.map(normalizeRow);
}

// 여러 달을 한꺼번에 병렬 요청하되, 하나라도 실패하면 전체가 죽지 않게 감싸고
// 실패 사유는 모아서 대표 메시지 하나로 반환합니다 (화면에 그대로 보여주기 위함).
async function fetchMonths(sigunguCd, yearMonths) {
  const settled = await Promise.allSettled(
    yearMonths.map((ym) => fetchOneMonth({ sigunguCd, dealYmd: ym }))
  );

  const rows = [];
  let firstError = null;
  for (const s of settled) {
    if (s.status === "fulfilled") rows.push(...s.value);
    else if (!firstError) firstError = s.reason.message;
  }

  return { rows, error: rows.length === 0 ? firstError : null };
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
