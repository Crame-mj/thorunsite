// 개념서 내용.
// 첫 장('개념서' 제목 페이지)은 어느 섹션에도 속하지 않는 고유 페이지다.
// 섹션은 항상 왼쪽 페이지에서 시작한다 (필요하면 빈 페이지가 자동으로 끼워진다).
// 섹션 첫 장은 자동으로 만들어진다: 왼쪽은 빈 페이지, 오른쪽은 섹션 제목 페이지 ('·' 앞이 큰 제목, 뒤가 부제).
// 페이지 마커를 누르면 이 첫 장으로 이동한다.
//
// 섹션 필드
//   id     : 고유 이름
//   label  : 페이지 마커와 섹션 첫 페이지 머리말에 쓰이는 이름. '·' 앞뒤로 마커에서 두 줄로 나뉜다.
//   marker : 'left' | 'right' — 페이지 마커가 책 왼쪽/오른쪽 중 어디에 붙는지 (위에서부터 순서대로)
//   markerShift : (선택) 마커 위아래 위치 미세 조정. 음수면 아래로 (페이지 높이가 1.8 기준)
//   pages  : 섹션 첫 장 다음에 이어지는 내용 페이지 목록. 지금은 비어 있음 (첫 장만 있음).
//
// 페이지 형식 (모두 선택)
//   {}                                    빈 페이지
//   { heading: '소제목', body: '본문…' }   글 페이지. 본문은 자동 줄바꿈되고 \n은 그대로 줄바꿈된다.
//   { type: 'people', items: [ { name, title, description, portrait } , … ] }  인물 2명짜리 페이지
//     portrait: 초상화 이미지 경로 (선택). 없으면 이름 첫 글자 자리표시자.
export const BOOK_TITLE = '개념서';   // 책을 펼친 첫 장 제목
export const COVER_TITLE = 'Lexicon'; // 표지 금박 글자

export const SECTIONS = [
  { id: 'world-concept', label: '세계관·개념', marker: 'left', pages: [{}, {}, {}, {}, {}, {}, {}, {}] },
  { id: 'world-region', label: '세계관·지역', marker: 'left', markerShift: -0.04, pages: [] },
  { id: 'world-race', label: '세계관·종족', marker: 'left', markerShift: -0.06, pages: [] },
  { id: 'people-upper', label: '인명록·상위', marker: 'right', pages: [] },
  { id: 'people-middle', label: '인명록·중위', marker: 'right', pages: [] },
  { id: 'people-lower', label: '인명록·하위', marker: 'right', pages: [] },
  { id: 'monsters', label: '마물', marker: 'right', markerShift: -0.09, pages: [] },
];
