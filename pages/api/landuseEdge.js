// 일부러 별도 파일로 분리 - Edge Runtime은 xml2js 같은 일반 Node 기능을 못 쓰기 때문에
// (VWorld 응답은 JSON이라 xml2js가 필요 없어서 이 라우트만 Edge로 돌릴 수 있음)
export const config = { runtime: "edge" };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const pnu = searchParams.get("pnu");

  if (!pnu) {
    return new Response(JSON.stringify({ error: "pnu가 필요합니다." }), { status: 400 });
  }

  const paramsObj = {
    key: process.env.VWORLD_KEY,
    pnu,
    format: "json",
  };
  if (process.env.VWORLD_DOMAIN) paramsObj.domain = process.env.VWORLD_DOMAIN;

  const params = new URLSearchParams(paramsObj);
  const url = `https://api.vworld.kr/ned/data/getLandUseAttr?${params.toString()}`;

  try {
    const res = await fetch(url);
    const text = await res.text();

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `토지이용계획 API 오류 (HTTP ${res.status}): ${text.slice(0, 200)}` }),
        { status: 502 }
      );
    }

    const json = JSON.parse(text);
    const field = json?.landUses?.field;
    const items = !field ? [] : Array.isArray(field) ? field : [field];

    const result = items.map((item) => ({
      name: item.prposAreaDstrcCodeNm,
      isConflict: item.cnflcAtNm === "저촉",
    }));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const cause = err.cause ? ` (${err.cause.code || err.cause.message || err.cause})` : "";
    return new Response(
      JSON.stringify({ error: `Edge에서도 연결 실패: ${err.message}${cause}` }),
      { status: 502 }
    );
  }
}
