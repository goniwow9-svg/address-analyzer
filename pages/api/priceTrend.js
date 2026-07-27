import { getYearlyPriceHistory } from "../../lib/realestate";

export default async function handler(req, res) {
  const { sigunguCd, bun, ji } = req.query;

  if (!sigunguCd || !bun || !ji) {
    return res.status(400).json({ error: "필요한 정보가 없습니다." });
  }

  try {
    const history = await getYearlyPriceHistory({ sigunguCd, bun, ji, years: 5 });
    return res.status(200).json(history);
  } catch (err) {
    return res.status(500).json({ error: err.message || "알 수 없는 오류가 발생했습니다." });
  }
}
