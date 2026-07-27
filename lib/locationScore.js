import { kakaoSearch, nearest } from "./kakaoPlaces";
import { getNearbyBusStops } from "./tago";

const GANGNAM_3GU = ["강남구", "서초구", "송파구"];

// 도보 4km/h(분속 약 67m) 가정 - 카카오 API가 주는 거리는 "직선거리"라 실제 도보거리보다
// 짧게 나올 수 있음. 그 점을 문구에 명시해서 오해를 막습니다.
function fmtDist(m) {
  const walkMin = Math.max(1, Math.round(m / 67));
  return `${m}m 직선거리 (도보 약 ${walkMin}분 추정)`;
}

// ── 교통 (25점) ──────────────────────────────────────────────
async function scoreTraffic(x, y) {
  const details = [];
  let score = 0;

  // 지하철역 최근접 거리
  const subway = await kakaoSearch({ type: "category", categoryGroupCode: "SW8", x, y, radius: 2000 });
  const nearestSubway = nearest(subway.documents);
  if (nearestSubway) {
    let pts = 0;
    if (nearestSubway.distance <= 400) pts = 12;
    else if (nearestSubway.distance <= 800) pts = 8;
    else if (nearestSubway.distance <= 1500) pts = 4;
    score += pts;
    details.push(`지하철 ${nearestSubway.name}까지 ${fmtDist(nearestSubway.distance)} (+${pts})`);

    // GTX 근사 판단: 카카오 place_name/category에 "GTX" 문구가 있는 경우만 (2km 이내)
    const gtxHit = subway.documents.find((d) => d.distance <= 2000 && /GTX/i.test(d.name));
    if (gtxHit) {
      score += 5;
      details.push(`GTX 연계역(${gtxHit.name}) 2km 이내 (+5, 개통 전이면 개통 후 재조정 필요)`);
    }
  } else {
    details.push("2km 이내 지하철역 없음 (+0)");
  }

  // 버스정류장: TAGO(국가대중교통정보센터) 좌표기반 근접 정류소 조회 - 실제 정류소 데이터라 정확함
  try {
    const busStops = await getNearbyBusStops({ lat: y, lng: x });
    const within500 = busStops.filter((s) => s.distance <= 500);
    let busPts = 0;
    if (within500.length >= 10) busPts = 8;
    else if (within500.length >= 5) busPts = 5;
    else if (within500.length >= 1) busPts = 2;
    score += busPts;

    if (busStops.length > 0) {
      const top2 = busStops.slice(0, 2);
      const names = top2.map((s) => `${s.name}(${fmtDist(s.distance)})`).join(", ");
      details.push(`반경 500m 버스정류소 ${within500.length}곳 — 가까운 순: ${names} (+${busPts})`);
    } else {
      details.push("주변 버스정류소를 찾지 못함 (+0)");
    }
  } catch (err) {
    details.push(`버스정류소 조회 실패: ${err.message} (+0)`);
  }

  return { score: Math.min(score, 25), max: 25, details };
}

// ── 생활편의 (20점) ──────────────────────────────────────────
async function scoreConvenience(x, y) {
  const details = [];
  let score = 0;

  const mart = await kakaoSearch({ type: "category", categoryGroupCode: "MT1", x, y, radius: 1000 });
  const martPts = mart.count >= 1 ? 5 : 0;
  score += martPts;
  details.push(`반경 1km 대형마트/백화점 ${mart.count}곳 (+${martPts})`);

  const hospital = await kakaoSearch({ type: "category", categoryGroupCode: "HP8", x, y, radius: 2000 });
  const hasGeneral = hospital.documents.some((d) => /종합병원/.test(d.category) || /종합병원/.test(d.name));
  const hospitalPts = hasGeneral ? 6 : hospital.count >= 1 ? 3 : 0;
  score += hospitalPts;
  details.push(
    `반경 2km 병원 ${hospital.count}곳${hasGeneral ? " (종합병원 포함)" : ""} (+${hospitalPts})`
  );

  const cvs = await kakaoSearch({ type: "category", categoryGroupCode: "CS2", x, y, radius: 500 });
  let cvsPts = 0;
  if (cvs.count >= 5) cvsPts = 4;
  else if (cvs.count >= 2) cvsPts = 2;
  score += cvsPts;
  details.push(`반경 500m 편의점 ${cvs.count}곳 (+${cvsPts})`);

  const [cafe, food] = await Promise.all([
    kakaoSearch({ type: "category", categoryGroupCode: "CE7", x, y, radius: 500 }),
    kakaoSearch({ type: "category", categoryGroupCode: "FD6", x, y, radius: 500 }),
  ]);
  const foodDensity = cafe.count + food.count;
  let densityPts = 0;
  if (foodDensity >= 20) densityPts = 5;
  else if (foodDensity >= 10) densityPts = 3;
  else if (foodDensity >= 1) densityPts = 1;
  score += densityPts;
  details.push(`반경 500m 카페·음식점 합계 ${foodDensity}곳 (+${densityPts})`);

  return { score: Math.min(score, 20), max: 20, details };
}

// ── 교육 (15점) ──────────────────────────────────────────────
async function scoreEducation(x, y, region2) {
  const details = [];
  let score = 0;

  const schools = await kakaoSearch({ type: "category", categoryGroupCode: "SC4", x, y, radius: 2000 });

  const elementary = schools.documents.filter((d) => d.name.includes("초등학교"));
  const secondary = schools.documents.filter(
    (d) => d.name.includes("중학교") || d.name.includes("고등학교")
  );

  const nearestElem = nearest(elementary);
  if (nearestElem) {
    let pts = 0;
    if (nearestElem.distance <= 300) pts = 8;
    else if (nearestElem.distance <= 800) pts = 4;
    score += pts;
    details.push(`초등학교 ${nearestElem.name}까지 ${fmtDist(nearestElem.distance)} (+${pts})`);
  } else {
    details.push("2km 이내 초등학교 없음 (+0)");
  }

  const nearestSecondary = nearest(secondary);
  const isGangnam3 = GANGNAM_3GU.includes(region2);
  if (nearestSecondary && nearestSecondary.distance <= 100 && !isGangnam3) {
    score -= 3;
    details.push(`${nearestSecondary.name}이 ${fmtDist(nearestSecondary.distance)}로 매우 근접 (-3)`);
  } else if (nearestSecondary && nearestSecondary.distance <= 100 && isGangnam3) {
    details.push(
      `${nearestSecondary.name}이 ${fmtDist(nearestSecondary.distance)}로 근접하지만 강남3구 학군 특성상 감점 미적용`
    );
  }

  const academy = await kakaoSearch({ type: "category", categoryGroupCode: "AC5", x, y, radius: 500 });
  const academyPts = academy.count >= 1 ? 4 : 0;
  score += academyPts;
  details.push(`반경 500m 학원 ${academy.count}곳 (+${academyPts})`);

  return { score: Math.max(0, Math.min(score, 15)), max: 15, details };
}

// ── 자연환경 (15점) ──────────────────────────────────────────
async function scoreNature(x, y) {
  const details = [];
  let score = 0;

  const park = await kakaoSearch({ type: "keyword", query: "공원", x, y, radius: 1000 });
  const nearestPark = nearest(park.documents);
  if (nearestPark) {
    let pts = 0;
    if (nearestPark.distance <= 300) pts = 6;
    else if (nearestPark.distance <= 500) pts = 3;
    score += pts;
    details.push(`공원(${nearestPark.name})까지 ${fmtDist(nearestPark.distance)} (+${pts})`);
  } else {
    details.push("1km 이내 공원 없음 (+0)");
  }

  const water = await kakaoSearch({ type: "keyword", query: "한강공원", x, y, radius: 1000 });
  const waterHit = nearest(water.documents);
  if (waterHit && waterHit.distance >= 500 && waterHit.distance <= 1000) {
    score += 3;
    details.push(`한강 접근성(${waterHit.name}) ${fmtDist(waterHit.distance)} (+3)`);
  }

  return { score: Math.min(score, 15), max: 15, details };
}

// ── 감점 (현재는 종교시설만 구현, 최대 -15) ──────────────────
async function scoreDeduction(x, y) {
  const details = [];
  let deduction = 0;

  const religious = await kakaoSearch({ type: "keyword", query: "교회 성당 사찰", x, y, radius: 500 });
  const nearestReligious = nearest(religious.documents);
  if (nearestReligious) {
    let pts = 0;
    if (nearestReligious.distance <= 200) pts = -3;
    else if (nearestReligious.distance <= 500) pts = -1;
    if (pts !== 0) {
      deduction += pts;
      details.push(`종교시설(${nearestReligious.name}) ${fmtDist(nearestReligious.distance)} (${pts})`);
    }
  }

  return { score: Math.max(deduction, -15), max: -15, details };
}

function buildComment(categoryPercents) {
  const entries = Object.entries(categoryPercents);
  const best = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const worst = entries.reduce((a, b) => (b[1] < a[1] ? b : a));
  if (best[0] === worst[0]) return "전반적으로 무난한 입지입니다";
  return `${best[0]}은(는) 좋은데 ${worst[0]}이(가) 아쉬운 집`;
}

export async function calculateLocationScore({ x, y, region2 }) {
  const [traffic, convenience, education, nature, deduction] = await Promise.all([
    scoreTraffic(x, y),
    scoreConvenience(x, y),
    scoreEducation(x, y, region2),
    scoreNature(x, y),
    scoreDeduction(x, y),
  ]);

  const categories = { 교통: traffic, 생활편의: convenience, 교육: education, 자연환경: nature };

  const totalMax = Object.values(categories).reduce((s, c) => s + c.max, 0); // 현재 75
  const totalRaw = Object.values(categories).reduce((s, c) => s + c.score, 0) + deduction.score;
  const percentage = Math.round((totalRaw / totalMax) * 100);

  let grade = "D";
  if (percentage >= 90) grade = "S";
  else if (percentage >= 80) grade = "A";
  else if (percentage >= 70) grade = "B";
  else if (percentage >= 60) grade = "C";

  const categoryPercents = Object.fromEntries(
    Object.entries(categories).map(([k, v]) => [k, Math.round((v.score / v.max) * 100)])
  );

  return {
    categories,
    deduction,
    totalRaw,
    totalMax,
    percentage,
    grade,
    comment: buildComment(categoryPercents),
    pendingCategories: ["치안·치안(범죄율)", "미래가치(정비사업)"], // 다음 업데이트 예정
  };
}
