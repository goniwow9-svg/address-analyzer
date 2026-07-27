// 카카오 로컬 API의 "카테고리로 검색"과 "키워드로 검색"을 공통으로 처리하는 함수.
// 두 API 모두 x,y(좌표) + radius(반경, m)를 주면 결과에 "distance"(중심으로부터 거리, m)를 같이 줘서
// 우리가 따로 거리 계산을 할 필요가 없습니다. sort=distance로 가까운 순 정렬.
export async function kakaoSearch({ type, query, categoryGroupCode, x, y, radius, size = 15 }) {
  const base =
    type === "category"
      ? "https://dapi.kakao.com/v2/local/search/category.json"
      : "https://dapi.kakao.com/v2/local/search/keyword.json";

  const params = new URLSearchParams({
    x: String(x),
    y: String(y),
    radius: String(radius),
    sort: "distance",
    size: String(size),
  });

  if (categoryGroupCode) params.set("category_group_code", categoryGroupCode);
  if (query) params.set("query", query);

  const res = await fetch(`${base}?${params.toString()}`, {
    headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`카카오 검색 API 오류 (${res.status}): ${text}`);
  }

  const data = await res.json();

  return {
    documents: (data.documents || []).map((d) => ({
      name: d.place_name,
      category: d.category_name,
      distance: Number(d.distance), // m
    })),
    count: data.meta ? data.meta.pageable_count : 0, // 최대 45로 집계됨 (카카오 API 한계)
  };
}

export function nearest(documents) {
  if (!documents || documents.length === 0) return null;
  return documents[0]; // sort=distance라 이미 첫 번째가 가장 가까움
}
