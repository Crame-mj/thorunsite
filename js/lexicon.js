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
//   { title, subtitle, image, body }       글 페이지 (모두 선택, 위에서부터 이 순서로 배치)
//     title: 크고 굵은 제목 / subtitle: 중간 크기 부제 / image: 삽화 경로 (남은 공간에 맞춰 크기 조절)
//     imageScale: 삽화 최대 폭 (글 폭 대비, 기본 0.85) / body: 본문. \n은 문단 나눔.
//   { type: 'people', items: [ { name, title, description, portrait } , … ] }  인물 2명짜리 페이지
//     portrait: 초상화 이미지 경로 (선택). 없으면 이름 첫 글자 자리표시자.
export const BOOK_TITLE = '개념서';   // 책을 펼친 첫 장 제목
export const COVER_TITLE = 'Lexicon'; // 표지 금박 글자

export const SECTIONS = [
  {
    id: 'world-concept', label: '세계관·개념', marker: 'left',
    pages: [
      // 4페이지
      {
        title: '에테르',
        subtitle: '에테르란?',
        body: '에테르란, 영혼을 구성하는 미지의 에너지를 칭하는 개념이다. 에테르는 어디에나 존재한다. 사람, 동물, 식물, 심지어는 길거리의 조약돌에도 일정량 스며들어 있다. 그러나 이 에테르를 직접 보거나 느낄 수 있는 존재는 한정적이며, 이를 다룰 수 있는 존재는 더더욱 드물다.\n'
          + '에테르는 본디 균형 잡힌 힘으로, 특정한 파장에 기울어져 있지 않다. 그러나 어떻게 뭉치느냐, 어디에 남기느냐, 어떤 목적으로 다루느냐에 따라, 마치 색 유리를 통과한 빛처럼 그 특성이 변화할 수 있다.',
      },
      // 5페이지
      {
        subtitle: '조화의 힘, 영력',
        image: 'assets/lexicon/ather_b.webp',
        body: '영력은 본래 에테르의 성질과 가장 가까운, 순수한 형태의 힘이다. 힘의 성질이 어느 한쪽으로 기울어지지 않고 조화를 이루어 그 어떤 존재와도 부드럽게 섞이며 기운의 균형을 맞춘다. 그러나 워낙 정순한 힘이기에, 순수를 잃은 대부분의 존재는 이것을 온전히 다룰 수 없으며, 그 덕에 가장 희귀한 기운이 되었다.',
      },
      {}, {}, {}, {}, {}, {}, // 6~11페이지
    ],
  },
  { id: 'world-region', label: '세계관·지역', marker: 'left', markerShift: -0.04, pages: [] },
  { id: 'world-race', label: '세계관·종족', marker: 'left', markerShift: -0.06, pages: [] },
  { id: 'people-upper', label: '인명록·상위', marker: 'right', pages: [] },
  { id: 'people-middle', label: '인명록·중위', marker: 'right', pages: [] },
  { id: 'people-lower', label: '인명록·하위', marker: 'right', pages: [] },
  { id: 'monsters', label: '마물', marker: 'right', markerShift: -0.09, pages: [] },
];
