// 지구본 대륙 데이터.
// name/nameEn: 한글 이름 / 영문 이름. 화면에는 '한글(영문)'으로 표시된다.
// lat/lon: 지구본 텍스처(world-map-globe.webp) 기준 핀 위치(도). 북위·동경이 +.
// image: 팝업 왼쪽에 들어갈 대륙 상세 이미지 경로 (예: 'assets/continents/arkeh.webp'). 없으면 null.
// description: 팝업 오른쪽 설명. 줄바꿈(\n)은 그대로 표시된다.
// regions: 팝업 이미지 위 구역(국가) 핀. 누르면 오른쪽 설명이 그 구역 설명으로 바뀐다.
//   x, y: 이미지 안 위치(왼쪽 위 기준 %, 0~100). name: 구역 이름. description: 구역 설명.
export const CONTINENTS = [
  { id: 'arkeh', name: '아르케', nameEn: 'Arkeh', lat: 75.0, lon: -140.0, image: 'assets/continents/arkeh.webp', description: '' },
  { id: 'ashadon', name: '아샤돈', nameEn: 'Ashadon', lat: 37.1, lon: -104.4, image: 'assets/continents/ashadon.webp', description: '' },
  { id: 'laniel', name: '라니엘', nameEn: 'Laniel', lat: 42.5, lon: -22.8, image: 'assets/continents/laniel.webp',
    description: '라니엘은 인간, 엘프, 드워프를 비롯한 다양한 종족이 어우러져 살아가는 대륙이다. 드넓은 평야, 깊은 숲과 축축한 늪, 험준한 산지와 협곡까지 다채로운 환경이 특징이다. 주 종족은 인간, 엘프, 드워프, 오크이며 다수의 대륙을 주변에 끼고 있어 주요 무역로 역할을 하는 만큼 많은 종족들을 만나볼 수 있다.',
    regions: [
      { id: 'saintra', name: 'Saintra', x: 27.5, y: 26.5, description: '' },
      { id: 'bernights', name: 'Bernights', x: 47.4, y: 36.5, description: '' },
      { id: 'metrome', name: 'Metrome', x: 24.6, y: 67.5, description: '' },
      { id: 'udrah', name: 'Udrah', x: 80.3, y: 60.5, description: '' },
      { id: 'snowfield', name: '북동부 설원', x: 69.5, y: 26.0, description: '' },
    ],
  },
  { id: 'soran', name: '소란', nameEn: 'Soran', lat: 22.8, lon: 105.9, image: 'assets/continents/soran.webp', description: '' },
  { id: 'alkahran', name: '알카란', nameEn: 'Alkahran', lat: -18.6, lon: -124.9, image: 'assets/continents/alkahran.webp', description: '' },
  { id: 'eremos', name: '에레모스', nameEn: 'Eremos', lat: -34.4, lon: -36.0, image: 'assets/continents/eremos.webp', description: '' },
  { id: 'yidra', name: '이드라', nameEn: 'Yidra', lat: -22.4, lon: 28.3, image: 'assets/continents/yidra.webp', description: '' },
  { id: 'yumir', name: '유미르', nameEn: 'Yumir', lat: -88.0, lon: 0.0, image: 'assets/continents/yumir.webp', description: '' },
];
