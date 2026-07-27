import { parseStringPromise } from "xml2js";

// 두 좌표 사이의 직선거리(m) - 하버사인 공식
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

// 서울시 버스운행정보 공유서비스(api.bus.go.kr)의 "좌표기반근접정류소목록조회".
// 이 서비스는 XML만 응답하고, 필드명이 문서마다 조금씩 달라서 여러 이름을 다 시도합니다.
export async function getSeoulNearbyBusStops({ lat, lng, radius = 500 }) {
  const params = new URLSearchParams({
    ServiceKey: process.env.SEOUL_BUS_KEY,
    tmX: String(lng),
    tmY: String(lat),
    radius: String(radius),
  });

  const url = `https://ws.bus.go.kr/api/rest/stationinfo/getStationByPos?${params.toString()}`;

  const res = await fetch(url);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`서울버스 API 오류 (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }

  const parsed = await parseStringPromise(text, { explicitArray: false });
  const root = parsed?.ServiceResult;
  if (!root) {
    throw new Error(`서울버스 API 응답 형식을 인식하지 못함: ${text.slice(0, 300)}`);
  }

  const headerCd = root?.msgHeader?.headerCd;
  if (headerCd && headerCd !== "0") {
    throw new Error(`서울버스 API 오류: ${root?.msgHeader?.headerMsg || headerCd}`);
  }

  const rawItems = root?.msgBody?.itemList;
  const items = !rawItems ? [] : Array.isArray(rawItems) ? rawItems : [rawItems];

  return items
    .map((item) => {
      const stopLat = Number(item.gpsY ?? item.tmY ?? item.stlat);
      const stopLng = Number(item.gpsX ?? item.tmX ?? item.stlng);
      return {
        name: item.stNm || item.stationNm || "이름 없음",
        arsId: item.arsId,
        distance:
          Number.isFinite(stopLat) && Number.isFinite(stopLng)
            ? haversine(lat, lng, stopLat, stopLng)
            : null,
      };
    })
    .filter((s) => s.distance !== null)
    .sort((a, b) => a.distance - b.distance);
}
