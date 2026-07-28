import { geocodeAddress } from "../../lib/kakao";
import { getBuildingInfo } from "../../lib/buildinghub";
import { getRecentTransactions } from "../../lib/realestate";
import { calculateLocationScore } from "../../lib/locationScore";

export default async function handler(req, res) {
  const address = req.query.address;

  if (!address || !address.trim()) {
    return res.status(400).json({ error: "주소를 입력해주세요." });
  }

  try {
    // 1단계: 주소 -> 좌표 + 법정동코드 + 지번
    const geo = await geocodeAddress(address.trim());

    // 1.5단계: 건물명은 실거래가 매칭(지번이 안 맞을 때 대안)에 쓰이므로 먼저 조회
    const building = await getBuildingInfo({
      sigunguCd: geo.sigunguCd,
      bjdongCd: geo.bjdongCd,
      bun: geo.bun,
      ji: geo.ji,
    }).catch((err) => ({ error: err.message }));

    const buildingName = building && !building.error && !building.notFound ? building.buildingName : null;

    // 2단계, 입지점수는 서로 의존하지 않으므로 동시에 요청해서 속도를 아낍니다.
    // 용도지역·지구(토지이용계획)는 VWorld가 클라우드 서버 IP를 차단하는 것으로 확인되어
    // 서버가 아니라 방문자 브라우저가 직접 호출하도록 클라이언트 쪽으로 옮겼습니다.
    const [realestate, locationScore] = await Promise.all([
      getRecentTransactions({
        sigunguCd: geo.sigunguCd,
        bun: geo.bun,
        ji: geo.ji,
        buildingName,
        months: 6,
      }).catch((err) => ({ error: err.message })),
      calculateLocationScore({
        x: geo.longitude,
        y: geo.latitude,
        region1: geo.region1,
        region2: geo.region2,
      }).catch((err) => ({ error: err.message })),
    ]);

    return res.status(200).json({
      geo,
      building,
      realestate,
      locationScore,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "알 수 없는 오류가 발생했습니다." });
  }
}
