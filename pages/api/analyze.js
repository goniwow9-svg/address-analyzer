import { geocodeAddress } from "../../lib/kakao";
import { getBuildingInfo } from "../../lib/buildinghub";
import { getRecentTransactions } from "../../lib/realestate";

export default async function handler(req, res) {
  const address = req.query.address;

  if (!address || !address.trim()) {
    return res.status(400).json({ error: "주소를 입력해주세요." });
  }

  try {
    // 1단계: 주소 -> 좌표 + 법정동코드 + 지번
    const geo = await geocodeAddress(address.trim());

    // 2단계, 3단계는 서로 의존하지 않으므로 동시에 요청해서 속도를 아낍니다.
    const [building, realestate] = await Promise.all([
      getBuildingInfo({
        sigunguCd: geo.sigunguCd,
        bjdongCd: geo.bjdongCd,
        bun: geo.bun,
        ji: geo.ji,
      }).catch((err) => ({ error: err.message })),
      getRecentTransactions({
        sigunguCd: geo.sigunguCd,
        bun: geo.bun,
        ji: geo.ji,
        months: 6,
      }).catch((err) => ({ error: err.message })),
    ]);

    return res.status(200).json({
      geo,
      building,
      realestate,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "알 수 없는 오류가 발생했습니다." });
  }
}
