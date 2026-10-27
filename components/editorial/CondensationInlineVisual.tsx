export default function CondensationInlineVisual({index}:{index:number}) {
 if(index===2)return <figure className="decision-visual"><h3>젖는 위치 → 점검 경로</h3><div className="decision-steps"><div><strong>실내 쪽에서 닦임</strong><p>가습량 낮추기·물기 제거<br/>→ 배치·환기·발생 조건 기록</p></div><div><strong>유리 사이·이음부</strong><p>사진·날짜·비 온 날 구분<br/>→ 창호·관리 주체 상담</p></div></div><figcaption>문제의 범위를 나누기 위한 자체 설명도입니다. 사진만으로 결로·누수·하자를 판정하는 기준이 아닙니다.</figcaption></figure>
 if(index===5)return <figure className="decision-visual"><h3>같은 겨울 기간으로 비용을 비교하세요</h3><div className="decision-steps"><div><strong>기존 유지</strong><p>소모품 + 전기료<br/>+ 필요한 점검비</p></div><div><strong>새 가습기</strong><p>본체·배송 + 소모품<br/>+ 전기료</p></div><div><strong>건물 문제 상담</strong><p>창호 점검·시공 견적<br/>→ 본체 교체비와 분리</p></div></div><figcaption>미확인 가격 대신 지출 항목을 연결한 자체 비교도입니다. 구매나 시공이 모두 필요하다는 뜻은 아닙니다.</figcaption></figure>
 return null
}
