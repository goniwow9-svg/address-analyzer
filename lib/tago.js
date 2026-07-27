import { parseStringPromise } from "xml2js";

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// TAGO "좌표기반근접정류소목록조회" - 위경도만 넣으면 가까운 버스정류소를 거리순으로 돌려줍니다.
// 카카오와 달리 실제 버스정류소 데이터라 정확도가 높습니다.
export async function getNearbyBusStops({ lat, lng }) {
  const params = new URLSearchParams({
    serviceKey: process.env.TAGO_KEY,
    gpsLati: String(lat),
    gpsLong: String(lng),
    numOfRows: "20",
    pageNo: "1",
    _type: "json",
  });

  const url = `https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getCrdntPrxmtSttnList?${params.toString()}`;

  const res = await fetch(url);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`TAGO API 오류 (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }

  let items = [];

  if (text.trim().startsWith("<")) {
    const parsed = await parseStringPromise(text, { explicitArray: false });
    const header = parsed?.response?.header;
    if (header?.resultCode && header.resultCode !== "00") {
      throw new Error(`TAGO API 오류: ${header.resultMsg || header.resultCode}`);
    }
    const rawItems = parsed?.response?.body?.items?.item;
    items = !rawItems ? [] : Array.isArray(rawItems) ? rawItems : [rawItems];
  } else {
    const json = JSON.parse(text);
    const header = json?.response?.header;
    if (header?.resultCode && header.resultCode !== "00") {
      throw new Error(`TAGO API 오류: ${header.resultMsg || header.resultCode}`);
    }
    const rawItems = json?.response?.body?.items?.item;
    items = !rawItems ? [] : Array.isArray(rawItems) ? rawItems : [rawItems];
  }

  return items
    .map((item) => {
      const rawDist = Number(item.dist);
      const distance =
        Number.isFinite(rawDist) && rawDist > 0
          ? Math.round(rawDist)
          : haversine(lat, lng, Number(item.gpslati), Number(item.gpslong));
      return {
        name: item.nodenm,
        nodeId: item.nodeid,
        distance,
      };
    })
    .filter((s) => Number.isFinite(s.distance))
    .sort((a, b) => a.distance - b.distance);
}
