import { parseStringPromise } from "xml2js";

// 국토교통부 건축HUB "건축물대장 표제부" 조회
// 대지면적, 건축면적, 연면적(=집 면적 관련 총합), 사용승인일(=재건축 연한 계산의 기준) 등을 가져옵니다.
export async function getBuildingInfo({ sigunguCd, bjdongCd, bun, ji }) {
  const params = new URLSearchParams({
    serviceKey: process.env.DATA_GO_KR_KEY,
    sigunguCd,
    bjdongCd,
    platGbCd: "0", // 0: 일반 대지
    bun,
    ji,
    numOfRows: "10",
    pageNo: "1",
    _type: "json",
  });

  const url = `http://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?${params.toString()}`;

  const res = await fetch(url);
  const text = await res.text();

  let items = [];

  // _type=json을 지정해도 일부 데이터포털 API는 여전히 XML로 응답하는 경우가 있어 두 방식 모두 처리
  if (text.trim().startsWith("<")) {
    const parsed = await parseStringPromise(text, { explicitArray: false });
    const body = parsed?.response?.body;
    const header = parsed?.response?.header;

    if (header?.resultCode && header.resultCode !== "00") {
      throw new Error(`건축HUB API 오류: ${header.resultMsg || header.resultCode}`);
    }

    const rawItems = body?.items?.item;
    if (!rawItems) {
      items = [];
    } else {
      items = Array.isArray(rawItems) ? rawItems : [rawItems];
    }
  } else {
    const json = JSON.parse(text);
    const header = json?.response?.header;
    if (header?.resultCode && header.resultCode !== "00") {
      throw new Error(`건축HUB API 오류: ${header.resultMsg || header.resultCode}`);
    }
    const rawItems = json?.response?.body?.items?.item;
    if (!rawItems) {
      items = [];
    } else {
      items = Array.isArray(rawItems) ? rawItems : [rawItems];
    }
  }

  if (items.length === 0) {
    return {
      notFound: true,
      queried: { sigunguCd, bjdongCd, bun, ji }, // 어떤 코드로 조회했는지 - 문제 진단용
    };
  }

  // 동이 여러 개인 건물(예: 아파트 단지)은 여러 row가 나올 수 있어 첫 번째 것 기준으로 요약
  const item = items[0];

  return {
    buildingName: item.bldNm || null, // 건물명
    address: item.platPlc || null, // 대지위치(지번)
    roadAddress: item.newPlatPlc || null, // 도로명대지위치
    landArea: toNumber(item.platArea), // 대지면적 (㎡)
    buildingArea: toNumber(item.archArea), // 건축면적 (㎡)
    totalFloorArea: toNumber(item.totArea), // 연면적 (㎡)
    buildingCoverageRatio: toNumber(item.bcRat), // 건폐율 (%)
    floorAreaRatio: toNumber(item.vlRat), // 용적률 (%)
    structure: item.strctCdNm || null, // 구조
    mainUse: item.mainPurpsCdNm || null, // 주용도
    groundFloors: toNumber(item.grndFlrCnt), // 지상층수
    undergroundFloors: toNumber(item.ugrndFlrCnt), // 지하층수
    approvalDate: item.useAprDay || null, // 사용승인일 (YYYYMMDD)
    raw: item,
    matchedCount: items.length,
  };
}

function toNumber(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
