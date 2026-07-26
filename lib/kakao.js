// 카카오 로컬 API로 주소를 검색해서 좌표 + 법정동코드 + 지번 정보를 뽑아냅니다.
// 이 b_code(법정동코드)가 있어야 건축HUB, 실거래가 API에 넣을 지역코드를 만들 수 있습니다.

export async function geocodeAddress(address) {
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(
    address
  )}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`카카오 지오코딩 API 오류 (${res.status}): ${text}`);
  }

  const data = await res.json();

  if (!data.documents || data.documents.length === 0) {
    throw new Error("입력하신 주소를 찾을 수 없습니다. 주소를 다시 확인해주세요.");
  }

  // 여러 결과 중 첫 번째(가장 정확도 높은) 결과 사용
  const doc = data.documents[0];
  const addr = doc.address; // 지번 주소 상세정보 (도로명 주소만 있는 경우도 있어 road_address도 함께 확인)

  if (!addr) {
    throw new Error(
      "지번 주소 정보를 찾을 수 없습니다. 도로명주소 대신 지번주소로 다시 시도해보세요."
    );
  }

  const bCode = addr.b_code; // 10자리 법정동코드
  const sigunguCd = bCode.slice(0, 5); // 앞 5자리: 시군구 코드
  const bjdongCd = bCode.slice(5, 10); // 뒤 5자리: 법정동 코드

  // 본번/부번을 건축HUB API가 요구하는 4자리 형식으로 변환 (예: "660" -> "0660")
  const bun = (addr.main_address_no || "0").padStart(4, "0");
  const ji = (addr.sub_address_no || "0").padStart(4, "0");

  return {
    inputAddress: address,
    matchedAddress: doc.address_name,
    roadAddress: doc.road_address ? doc.road_address.address_name : null,
    longitude: doc.x,
    latitude: doc.y,
    bCode,
    sigunguCd,
    bjdongCd,
    bun,
    ji,
    region1: addr.region_1depth_name, // 시/도
    region2: addr.region_2depth_name, // 시/군/구
    region3: addr.region_3depth_name, // 읍/면/동
  };
}
