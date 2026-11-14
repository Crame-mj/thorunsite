// 지구본 대륙 데이터.
// name/nameEn: 한글 이름 / 영문 이름. 화면에는 '한글(영문)'으로 표시된다.
// lat/lon: 지구본 텍스처(world-map-globe.webp) 기준 핀 위치(도). 북위·동경이 +.
// image: 팝업 왼쪽에 들어갈 대륙 상세 이미지 경로 (예: 'assets/continents/arkeh.webp'). 없으면 null.
// description: 팝업 오른쪽 설명. 줄바꿈(\n)은 그대로 표시된다.
// regions: 팝업 이미지 위 구역(국가) 핀. 누르면 왼쪽 이미지와 오른쪽 설명이 그 구역 것으로 바뀐다.
//   x, y: 대륙 이미지 안 핀 위치(왼쪽 위 기준 %, 0~100). name/nameEn: 구역 이름(한글/영문).
//   image: 구역 이미지 경로 (없으면 대륙 이미지 유지). description: 구역 설명.
export const CONTINENTS = [
  { id: 'arkeh', name: '아르케', nameEn: 'Arkeh', lat: 75.0, lon: -140.0, image: 'assets/continents/arkeh.webp', description: '' },
  { id: 'ashadon', name: '아샤돈', nameEn: 'Ashadon', lat: 37.1, lon: -104.4, image: 'assets/continents/ashadon.webp', description: '' },
  { id: 'laniel', name: '라니엘', nameEn: 'Laniel', lat: 42.5, lon: -22.8, image: 'assets/continents/laniel.webp',
    description: '라니엘은 인간, 엘프, 드워프를 비롯한 다양한 종족이 어우러져 살아가는 대륙이다. 드넓은 평야, 깊은 숲과 축축한 늪, 험준한 산지와 협곡까지 다채로운 환경이 특징이다. 주 종족은 인간, 엘프, 드워프, 오크이며 다수의 대륙을 주변에 끼고 있어 주요 무역로 역할을 하는 만큼 많은 종족들을 만나볼 수 있다.',
    regions: [
      {
        id: 'saintra', name: '세인트라', nameEn: 'Saintra', x: 27.5, y: 26.5,
        image: 'assets/regions/laniel/saintra.webp',
        description: '라니엘 서부 드넓은 평야에 위치한 신권국가다. 교황이 통치하고 있으며, 신앙심 깊고 뛰어난 신성력을 가진 사제와 성기사들을 양성한다. 종족에 대한 직접적 차별은 없으나, 종교적인 분위기 탓에 인구의 거의 대부분이 인간이고 다른 종족은 보기 드물다.',
      },
      {
        id: 'bernights', name: '버나이츠 제국', nameEn: 'Bernights', x: 47.4, y: 36.5,
        image: 'assets/regions/laniel/bernights.webp',
        description: '라니엘 중심부에 위치한 거대한 왕정국가다. 뛰어난 무예를 뽐내는 기사단의 존재로 유명하며, 세인트라와는 오랜 동맹 관계이다. 인간이 가장 많고, 뒤이어 엘프와 드워프가 인구의 다수를 차지하고 있으나, 종족에 대한 차별을 금지하고 있어 다양한 종족이 어우러져 살아간다. 주 수입은 무역 중계로, 타국과 오가는 대형 상단이 다수 소속되어 있다.',
      },
      {
        id: 'metrome', name: '메트롬', nameEn: 'Metrome', x: 24.6, y: 67.5,
        image: 'assets/regions/laniel/metrome.webp',
        description: '라니엘 남서부 협곡에 위치한 공화국가다. 협곡에 매장되어 있던 고대 유물을 바탕으로 기술자들이 모여들어 세운 나라로, 뛰어난 기계 문명을 구축했다. 인구는 주로 인간과 드워프로 구성되어 있다. 지상 환경이 척박해 대부분의 도시는 지하에 건설되어 있으며, 실내는 냉방 장치의 존재로 인해 시원하지만 실외는 매우 뜨겁다.',
      },
      {
        id: 'udrah', name: '우드라', nameEn: 'Udrah', x: 80.3, y: 60.5,
        image: 'assets/regions/laniel/udrah.webp',
        description: '라니엘 남동부 늪지에 위치한 공화국가다. 요정이 머물던 숲이 가진 방대한 에테르를 바탕으로 마법사들이 모여들어 세운 나라로, 다양한 마법이 발달했다. 인구는 주로 엘프이며, 인간과 오크도 꽤 많다. 우거진 수림과 늪이 국토의 대부분을 차지하고 있기에 늘 습하며 그늘진 곳이 많다.',
      },
      {
        id: 'highlands', name: '북부 고산지대', nameEn: 'Northern Highlands', x: 69.5, y: 26.0,
        image: 'assets/regions/laniel/highlands.webp',
        description: '라니엘 북동부에 위치한 넓은 산악지대이다. 법적으로는 버나이츠 제국의 영토라고 볼 수 있으나 척박한 환경 탓에 사실상 무법지대로 방치되어 있다.',
      },
    ],
  },
  { id: 'soran', name: '소란', nameEn: 'Soran', lat: 22.8, lon: 105.9, image: 'assets/continents/soran.webp', description: '' },
  { id: 'alkahran', name: '알카란', nameEn: 'Alkahran', lat: -18.6, lon: -124.9, image: 'assets/continents/alkahran.webp', description: '' },
  { id: 'eremos', name: '에레모스', nameEn: 'Eremos', lat: -34.4, lon: -36.0, image: 'assets/continents/eremos.webp', description: '' },
  { id: 'yidra', name: '이드라', nameEn: 'Yidra', lat: -22.4, lon: 28.3, image: 'assets/continents/yidra.webp', description: '' },
  { id: 'yumir', name: '유미르', nameEn: 'Yumir', lat: -88.0, lon: 0.0, image: 'assets/continents/yumir.webp', description: '' },
];
