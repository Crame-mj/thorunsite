// 지구본 대륙 데이터.
// lat/lon: 지구본 텍스처(world-map-globe.webp) 기준 핀 위치(도). 북위·동경이 +.
// image: 팝업 왼쪽에 들어갈 대륙 상세 이미지 경로 (예: 'assets/continents/arkeh.webp'). 없으면 null.
// description: 팝업 오른쪽 설명. 줄바꿈(\n)은 그대로 표시된다.
export const CONTINENTS = [
  { id: 'arkeh', name: 'Arkeh', lat: 75.0, lon: -140.0, image: null, description: '' },
  { id: 'ashadon', name: 'Ashadon', lat: 37.1, lon: -104.4, image: null, description: '' },
  { id: 'laniel', name: 'Laniel', lat: 42.5, lon: -22.8, image: null, description: '' },
  { id: 'soran', name: 'Soran', lat: 22.8, lon: 105.9, image: null, description: '' },
  { id: 'alkahran', name: 'Alkahran', lat: -18.6, lon: -124.9, image: null, description: '' },
  { id: 'eremos', name: 'Eremos', lat: -34.4, lon: -36.0, image: null, description: '' },
  { id: 'yidra', name: 'Yidra', lat: -22.4, lon: 28.3, image: null, description: '' },
  { id: 'yumir', name: 'Yumir', lat: -88.0, lon: 0.0, image: null, description: '' },
];
