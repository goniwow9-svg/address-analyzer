import { useState } from "react";
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

  async function performSearch(rawAddress) {
    const target = rawAddress.trim();
    if (!target) return;

    setLoading(true);
    setError(null);
    setResult(null);

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
                (이 코드가 정부24 건축물대장 열람 결과와 다르면 지번 매칭 오류, 같은데도 안 나오면
                해당 건물의 데이터가 세움터에 등록되지 않은 경우입니다)
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
            <h2>최근 실거래가 (최근 {result.realestate.monthsSearched}개월)</h2>
            {result.realestate.error && (
              <div className="notice">실거래가 조회 실패: {result.realestate.error}</div>
            )}
            {!result.realestate.error && result.realestate.matchedCount === 0 && (
              <div className="notice">
                해당 기간 동안 이 지번과 일치하는 아파트 거래 내역이 없습니다. (단독/연립/토지는
                Phase 2에서 지원 예정입니다)
              </div>
            )}
            {!result.realestate.error && result.realestate.matchedCount > 0 && (
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
      `}</style>
    </div>
  );
}
