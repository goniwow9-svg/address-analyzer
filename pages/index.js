import { useState, useEffect } from "react";
import Script from "next/script";

const PYEONG = 3.3058;

function toPyeong(sqm) {
  if (sqm === null || sqm === undefined) return null;
  return (sqm / PYEONG).toFixed(1);
}

function fmtArea(sqm) {
  if (sqm === null || sqm === undefined) return "-";
  const py = toPyeong(sqm);
  return `${sqm.toLocaleString()}㎡ (${py}평)`;
}

function fmtWon(amount) {
  if (amount === null || amount === undefined) return "-";
  return `${Math.round(amount / 10000).toLocaleString()}만원`;
}

function fmtDate(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return "-";
  return `${yyyymmdd.slice(0, 4)}.${yyyymmdd.slice(4, 6)}.${yyyymmdd.slice(6, 8)}`;
}

export default function Home() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState(null);
  const [trendData, setTrendData] = useState(null);
  const [landUseLoading, setLandUseLoading] = useState(false);
  const [landUseError, setLandUseError] = useState(null);
  const [landUseData, setLandUseData] = useState(null);

  async function loadLandUse() {
    if (!result?.geo?.pnu) return;
    setLandUseLoading(true);
    setLandUseError(null);
    setLandUseData(null);
    try {
      const res = await fetch(`/api/landuseEdge?pnu=${encodeURIComponent(result.geo.pnu)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "조회 중 오류가 발생했습니다.");
      setLandUseData(data);
    } catch (err) {
      setLandUseError(err.message);
    } finally {
      setLandUseLoading(false);
    }
  }

  async function performSearch(rawAddress) {
    const target = rawAddress.trim();
    if (!target) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setTrendData(null);
    setTrendError(null);

    try {
      const res = await fetch(`/api/analyze?address=${encodeURIComponent(target)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "조회 중 오류가 발생했습니다.");
      }

      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    performSearch(address);
  }

  async function loadTrend() {
    if (!result?.geo) return;
    setTrendLoading(true);
    setTrendError(null);
    try {
      const params = new URLSearchParams({
        sigunguCd: result.geo.sigunguCd,
        bun: result.geo.bun,
        ji: result.geo.ji,
      });
      if (result.building && !result.building.error && !result.building.notFound) {
        params.set("buildingName", result.building.buildingName || "");
      }
      const res = await fetch(`/api/priceTrend?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "추이 조회 중 오류가 발생했습니다.");
      setTrendData(data);
    } catch (err) {
      setTrendError(err.message);
    } finally {
      setTrendLoading(false);
    }
  }

  // 다음(카카오) 우편번호 서비스 팝업 - 주소를 정확히 몰라도 검색해서 목록에서 고를 수 있게 해줌
  function openAddressSearch() {
    if (!window.daum || !window.daum.Postcode) {
      setError("주소 검색 팝업을 불러오는 중입니다. 잠시 후 다시 눌러주세요.");
      return;
    }

    new window.daum.Postcode({
      oncomplete: function (data) {
        const picked = data.roadAddress || data.jibunAddress || data.address;
        setAddress(picked);
        performSearch(picked); // 선택하자마자 바로 조회까지 실행
      },
    }).open();
  }

  return (
    <div className="wrap">
      <h1>우리집 분석기</h1>
      <p className="subtitle">주소를 입력하면 대지면적·건물면적·최근 실거래가를 보여드립니다</p>

      <Script
        src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"
        strategy="afterInteractive"
      />

      <form onSubmit={handleSubmit} className="form">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="예: 인천 서구 청라동 123 또는 도로명주소"
        />
        <button type="button" className="secondary" onClick={openAddressSearch}>
          주소 찾기
        </button>
        <button type="submit" disabled={loading}>
          {loading ? "조회 중..." : "조회하기"}
        </button>
      </form>

      {error && <div className="error">⚠ {error}</div>}

      {result && (
        <div className="result">
          <section>
            <h2>기본 정보</h2>
            <table>
              <tbody>
                <tr>
                  <th>입력 주소</th>
                  <td>{result.geo.matchedAddress}</td>
                </tr>
                {result.geo.roadAddress && (
                  <tr>
                    <th>도로명주소</th>
                    <td>{result.geo.roadAddress}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section>
            <h2>건축물대장 정보</h2>
            {result.building && result.building.error && (
              <div className="notice">건축물대장 조회 실패: {result.building.error}</div>
            )}
            {result.building && result.building.notFound && (
              <div className="notice">
                건축물대장 정보를 찾지 못했습니다.
                <br />
                조회에 사용한 코드 — 시군구: {result.building.queried.sigunguCd} / 법정동:{" "}
                {result.building.queried.bjdongCd} / 본번: {result.building.queried.bun} / 부번:{" "}
                {result.building.queried.ji}
                <br />
                (지번은 정확히 매칭되었으나 결과가 없다면, 세움터에 아직 전산 등록되지 않은
                건물일 가능성이 높습니다)
                <br />
                <a
                  href="https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=15000000098"
                  target="_blank"
                  rel="noreferrer"
                >
                  정부24에서 직접 열람해보기 →
                </a>{" "}
                또는{" "}
                <a href="https://www.eais.go.kr" target="_blank" rel="noreferrer">
                  세움터
                </a>
                에서도 확인 가능합니다.
              </div>
            )}
            {result.building && !result.building.error && !result.building.notFound && (
              <table>
                <tbody>
                  <tr>
                    <th>건물명</th>
                    <td>{result.building.buildingName || "-"}</td>
                  </tr>
                  <tr>
                    <th>대지면적</th>
                    <td>{fmtArea(result.building.landArea)}</td>
                  </tr>
                  <tr>
                    <th>건축면적</th>
                    <td>{fmtArea(result.building.buildingArea)}</td>
                  </tr>
                  <tr>
                    <th>연면적</th>
                    <td>{fmtArea(result.building.totalFloorArea)}</td>
                  </tr>
                  <tr>
                    <th>건폐율 / 용적률</th>
                    <td>
                      {result.building.buildingCoverageRatio ?? "-"}% /{" "}
                      {result.building.floorAreaRatio ?? "-"}%
                    </td>
                  </tr>
                  <tr>
                    <th>규모</th>
                    <td>
                      지상 {result.building.groundFloors ?? "-"}층 / 지하{" "}
                      {result.building.undergroundFloors ?? "-"}층
                    </td>
                  </tr>
                  <tr>
                    <th>사용승인일</th>
                    <td>{fmtDate(result.building.approvalDate)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </section>

          <section>
            <h2>용도지역·지구 (도시계획 정보)</h2>
            <button type="button" className="secondary" onClick={loadLandUse} disabled={landUseLoading}>
              {landUseLoading ? "불러오는 중..." : "용도지역·지구 조회"}
            </button>
            {landUseError && (
              <div className="notice" style={{ marginTop: "8px" }}>
                토지이용계획 조회 실패: {landUseError}
                <br />
                정확한 정보는{" "}
                <a href="https://www.eum.go.kr" target="_blank" rel="noreferrer">
                  토지이음(eum.go.kr)
                </a>
                에서 직접 확인해주세요.
              </div>
            )}
            {landUseData && landUseData.length === 0 && (
              <div className="notice" style={{ marginTop: "8px" }}>조회된 용도지역·지구 정보가 없습니다.</div>
            )}
            {landUseData && landUseData.length > 0 && (
              <table style={{ marginTop: "8px" }}>
                <tbody>
                  {landUseData.map((item, i) => (
                    <tr key={i}>
                      <td>{item.name}</td>
                      <td style={{ color: item.isConflict ? "#b3261e" : "#555", fontWeight: item.isConflict ? 600 : 400 }}>
                        {item.isConflict ? "⚠ 저촉 (계획시설이 이 땅을 지나감)" : "포함"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <h2>입지점수</h2>
            {result.locationScore && result.locationScore.error && (
              <div className="notice">입지점수 계산 실패: {result.locationScore.error}</div>
            )}
            {result.locationScore && !result.locationScore.error && (
              <>
                <div className="scoreSummary">
                  <span className="grade">{result.locationScore.grade}</span>
                  <div>
                    <div className="scoreNum">
                      {result.locationScore.totalRaw} / {result.locationScore.totalMax}점 (
                      {result.locationScore.percentage}%)
                    </div>
                    <div className="comment">"{result.locationScore.comment}"</div>
                  </div>
                </div>

                <table>
                  <thead>
                    <tr>
                      <th>카테고리</th>
                      <th>점수</th>
                      <th>세부 근거</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(result.locationScore.categories).map(([name, cat]) => (
                      <tr key={name}>
                        <td>{name}</td>
                        <td>
                          {cat.score} / {cat.max}
                        </td>
                        <td className="detailCell">
                          {cat.details.map((d, i) => (
                            <div key={i}>{d}</div>
                          ))}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td>감점</td>
                      <td>{result.locationScore.deduction.score}</td>
                      <td className="detailCell">
                        {result.locationScore.deduction.details.length === 0
                          ? "해당 없음"
                          : result.locationScore.deduction.details.map((d, i) => <div key={i}>{d}</div>)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div className="notice" style={{ marginTop: "8px" }}>
                  아직 준비 중: {result.locationScore.pendingCategories.join(", ")} — 다음 업데이트에서
                  추가됩니다. (현재 {result.locationScore.totalMax}점 만점 기준 점수입니다)
                </div>
              </>
            )}
          </section>

          <section>
            <h2>최근 실거래가 (최근 {result.realestate.monthsSearched}개월)</h2>
            {result.realestate.error && (
              <div className="notice">실거래가 조회 실패: {result.realestate.error}</div>
            )}
            {!result.realestate.error && result.realestate.matchedCount === 0 && (
              <div className="notice">
                해당 기간 동안 이 지번/건물명과 일치하는 아파트 거래 내역이 없습니다. (단독/연립/토지는
                Phase 2에서 지원 예정입니다)
                {result.realestate.sampleAptNames && result.realestate.sampleAptNames.length > 0 && (
                  <>
                    <br />
                    참고 — 이 지역(같은 시군구) 최근 거래에 등록된 단지명들:{" "}
                    {result.realestate.sampleAptNames.join(", ")}
                  </>
                )}
              </div>
            )}
            {!result.realestate.error && result.realestate.matchedCount > 0 && (
              <>
                <p className="notice">
                  매칭 방식: {result.realestate.transactions[0].matchMethod === "건물명"
                    ? "지번이 정확히 안 맞아 건물명으로 매칭했습니다 (참고용)"
                    : "지번 매칭"}
                </p>
                <table>
                <thead>
                  <tr>
                    <th>계약일</th>
                    <th>단지명</th>
                    <th>동</th>
                    <th>층</th>
                    <th>전용면적</th>
                    <th>거래금액</th>
                    <th>거래유형</th>
                  </tr>
                </thead>
                <tbody>
                  {result.realestate.transactions.map((t, i) => (
                    <tr key={i}>
                      <td>{t.dealDate}</td>
                      <td>{t.aptName}</td>
                      <td>{t.dong || "-"}</td>
                      <td>{t.floor}층</td>
                      <td>{fmtArea(t.exclusiveArea)}</td>
                      <td>{fmtWon(t.dealAmountNumeric)}</td>
                      <td>{t.dealingType || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </>
            )}
          </section>

          <section>
            <h2>5년치 실거래가 추이</h2>
            {!trendData && (
              <button type="button" className="secondary" onClick={loadTrend} disabled={trendLoading}>
                {trendLoading ? "불러오는 중... (최대 1분 정도 걸릴 수 있어요)" : "5년 추이 보기"}
              </button>
            )}
            {trendError && <div className="notice">추이 조회 실패: {trendError}</div>}
            {trendData && trendData.yearly.length === 0 && (
              <div className="notice">
                최근 5년간 이 지번/건물명과 일치하는 아파트 거래가 없습니다.
                {trendData.sampleAptNames && trendData.sampleAptNames.length > 0 && (
                  <>
                    <br />
                    참고 — 이 지역(같은 시군구) 최근 거래에 등록된 단지명들:{" "}
                    {trendData.sampleAptNames.join(", ")}
                  </>
                )}
              </div>
            )}
            {trendData && trendData.yearly.length > 0 && (
              <>
                {trendData.matchMethod === "건물명" && (
                  <p className="notice">지번이 정확히 안 맞아 건물명으로 매칭했습니다 (참고용)</p>
                )}
                <div className="chart">
                  {trendData.yearly.map((y) => {
                    const max = Math.max(...trendData.yearly.map((v) => v.avgPricePerPyeong));
                    const heightPct = Math.max(4, Math.round((y.avgPricePerPyeong / max) * 100));
                    return (
                      <div className="chartCol" key={y.year}>
                        <div className="chartValue">{fmtWon(y.avgPricePerPyeong)}</div>
                        <div className="chartBar" style={{ height: `${heightPct}%` }} />
                        <div className="chartLabel">
                          {y.year} ({y.count}건)
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="notice">평당가(3.3㎡ 기준) 연도별 평균입니다. 거래건수가 적은 해는 참고용으로만 봐주세요.</p>
              </>
            )}
          </section>
        </div>
      )}

      <style jsx>{`
        .wrap {
          max-width: 720px;
          margin: 0 auto;
          padding: 24px 16px 64px;
          font-family: -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
          color: #222;
        }
        h1 {
          font-size: 24px;
          margin-bottom: 4px;
        }
        .subtitle {
          color: #666;
          font-size: 14px;
          margin-bottom: 20px;
        }
        .form {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
        }
        input {
          flex: 1;
          padding: 10px 12px;
          border: 1px solid #ccc;
          border-radius: 6px;
          font-size: 14px;
        }
        button {
          padding: 10px 18px;
          background: #2b2b2b;
          color: #fff;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          white-space: nowrap;
        }
        button:disabled {
          background: #999;
          cursor: default;
        }
        button.secondary {
          background: #fff;
          color: #2b2b2b;
          border: 1px solid #2b2b2b;
        }
        .error {
          background: #fdecea;
          color: #b3261e;
          padding: 12px 14px;
          border-radius: 6px;
          margin-bottom: 16px;
          font-size: 14px;
        }
        .notice {
          background: #f4f1ea;
          color: #555;
          padding: 12px 14px;
          border-radius: 6px;
          font-size: 13px;
        }
        section {
          margin-bottom: 28px;
        }
        h2 {
          background: #2b2b2b;
          color: #fff;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 15px;
          margin-bottom: 10px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        th,
        td {
          padding: 8px 10px;
          border-bottom: 1px solid #eee;
          text-align: left;
        }
        tbody tr:nth-child(even) {
          background: #f7f6f3;
        }
        thead th {
          background: #ebe8e1;
        }
        .scoreSummary {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 14px;
        }
        .grade {
          font-size: 36px;
          font-weight: 800;
          width: 60px;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #2b2b2b;
          color: #fff;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .scoreNum {
          font-size: 16px;
          font-weight: 600;
        }
        .comment {
          color: #666;
          font-size: 13px;
          margin-top: 2px;
        }
        .detailCell {
          color: #777;
          font-size: 12px;
        }
        .chart {
          display: flex;
          align-items: flex-end;
          gap: 12px;
          height: 180px;
          padding: 12px 8px 0;
          border-bottom: 2px solid #2b2b2b;
        }
        .chartCol {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          height: 100%;
        }
        .chartValue {
          font-size: 11px;
          color: #555;
          margin-bottom: 4px;
          white-space: nowrap;
        }
        .chartBar {
          width: 100%;
          max-width: 48px;
          background: #2b2b2b;
          border-radius: 4px 4px 0 0;
        }
        .chartLabel {
          font-size: 11px;
          color: #777;
          margin-top: 6px;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
