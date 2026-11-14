// 지구본 대륙 데이터.
// name/nameEn: 한글 이름 / 영문 이름. 화면에는 '한글(영문)'으로 표시된다.
// lat/lon: 지구본 텍스처(world-map-globe.webp) 기준 핀 위치(도). 북위·동경이 +.
// image: 팝업 왼쪽에 들어갈 대륙 상세 이미지 경로 (예: 'assets/continents/arkeh.webp'). 없으면 null.
// description: 팝업 오른쪽 설명. 줄바꿈(\n)은 그대로 표시된다.
export const CONTINENTS = [
  { id: 'arkeh', name: '아르케', nameEn: 'Arkeh', lat: 75.0, lon: -140.0, image: null, description: '' },
  { id: 'ashadon', name: '아샤돈', nameEn: 'Ashadon', lat: 37.1, lon: -104.4, image: null, description: '' },
  { id: 'laniel', name: '라니엘', nameEn: 'Laniel', lat: 42.5, lon: -22.8, image: null, description: '' },
  { id: 'soran', name: '소란', nameEn: 'Soran', lat: 22.8, lon: 105.9, image: null, description: '' },
  { id: 'alkahran', name: '알카란', nameEn: 'Alkahran', lat: -18.6, lon: -124.9, image: null, description: '' },
  { id: 'eremos', name: '에레모스', nameEn: 'Eremos', lat: -34.4, lon: -36.0, image: null, description: '' },
  { id: 'yidra', name: '이드라', nameEn: 'Yidra', lat: -22.4, lon: 28.3, image: null, description: '' },
  { id: 'yumir', name: '유미르', nameEn: 'Yumir', lat: -88.0, lon: 0.0, image: null, description: '' },
];
