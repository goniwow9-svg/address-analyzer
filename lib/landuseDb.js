import { Pool } from "pg";

// 우리가 직접 채워넣은 DB(Neon)에서 용도지역·지구를 조회합니다.
// VWorld를 직접 부르지 않으므로 IDC 차단 문제가 없습니다.
let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function getLandUseInfo({ pnu }) {
  const db = getPool();
  const { rows } = await db.query(
    "SELECT conflict_status, use_name FROM landuse WHERE pnu = $1",
    [pnu]
  );

  return rows.map((r) => ({
    name: r.use_name,
    isConflict: r.conflict_status === "저촉",
  }));
}
