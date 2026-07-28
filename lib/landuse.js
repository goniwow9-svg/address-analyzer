// VWorld "토지이용계획정보속성조회" - PNU 하나로 용도지역/지구, 도시계획시설 저촉여부 등을 가져옵니다.
// 이사님이 강조하신 "용도지역·지구 + 도시계획시설 저촉여부"가 여기서 나옵니다.
export async function getLandUseInfo({ pnu }) {
  const paramsObj = {
    key: process.env.VWORLD_KEY,
    pnu,
    format: "json",
    numOfRows: "50",
    pageNo: "1",
  };
  // domain 파라미터는 값이 있을 때만 포함 (빈 문자열로 보내면 VWorld 게이트웨이가 502를 내는 경우가 있음)
  if (process.env.VWORLD_DOMAIN) paramsObj.domain = process.env.VWORLD_DOMAIN;

  const params = new URLSearchParams(paramsObj);

  const url = `https://api.vworld.kr/ned/data/getLandUseAttr?${params.toString()}`;

  const res = await fetch(url);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`토지이용계획 API 오류 (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`토지이용계획 API 응답 파싱 실패: ${text.slice(0, 300)}`);
  }

  const field = json?.landUses?.field;
  const resultCode = json?.landUses?.resultCode;

  if (resultCode && resultCode !== "0" && !field) {
    throw new Error(`토지이용계획 API 오류: [${resultCode}] ${json?.landUses?.resultMsg || ""}`);
  }

  const items = !field ? [] : Array.isArray(field) ? field : [field];

  return items.map((item) => ({
    name: item.prposAreaDstrcCodeNm, // 용도지역/지구/시설 이름 (예: "일반상업지역", "대로3류(폭 25m~30m)")
    isConflict: item.cnflcAtNm === "저촉", // 저촉이면 계획시설(도로/공원 등)이 이 땅을 지나간다는 뜻
    registeredDate: item.registDt || null,
  }));
}
