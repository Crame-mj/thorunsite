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
  { id: 'soran', name: '소란', nameEn: 'Soran', lat: 22.8, lon: 105.9, image: 'assets/continents/soran.webp',
    description: '소란은 거친 산맥과 넓은 평야, 그리고 화산지대가 특징적인 동방의 대륙이다. 다른 대륙과의 거리가 꽤 있어 교류가 한정적인 만큼, 타 대륙의 민족들과 확연한 문화 차이를 보인다. 주 종족은 인간과 수인이며, 고유한 무술을 연마하는 것을 중요시하는 특유의 분위기 덕에 출신이나 종족보다는 얼마나 뛰어난 무인인지가 그 사람에 대한 대우를 정하는 데에 큰 영향을 미친다.',
    regions: [
      {
        id: 'jisim', name: '지심산', nameEn: 'Jisim', x: 35.0, y: 19.5,
        image: 'assets/regions/soran/jisim.webp',
        description: '소란 북부에 위치한 거대한 화산이다. 큰 화산인 만큼 분화 후 주변 넓은 지역을 재로 덮어버렸다. 아직도 용암이 들끓는 활화산으로, 소란의 주민들에게 이곳은 대지의 심장으로 불리며 두렵고도 신성한 땅으로 여겨진다.',
      },
      {
        id: 'goguk', name: '고국', nameEn: 'Goguk', x: 65.3, y: 26.6,
        image: 'assets/regions/soran/goguk.webp',
        description: '소란 북동부에서 서부에 걸친 긴 영토를 가진 나라로, 왕권국가다. 상류층은 대부분 인간으로, 수인에 대한 직접적인 차별은 없지만 인간에 비해 낮게 보는 사회적 인식이 있다. 서부 항구를 통해 라니엘과 주로 교류하며, 특산품은 활과 직물이다. 무예의 경우 초장거리 궁술에 강하다.',
      },
      {
        id: 'soryujin', name: '소류진', nameEn: 'Soryujin', x: 38.7, y: 77.8,
        image: 'assets/regions/soran/soryujin.webp',
        description: '소란 남부에 위치한 나라로, 자연과 어우러진 고즈넉한 풍경이 특징이다. 다양한 꽃차가 특산물이며, 라니엘과는 주로 고국의 중계를 통해 교류하지만, 알카란과는 남쪽의 작은 항구를 통해 직접 무역을 한다. 무예의 경우 빠른 발도술이 특징인 검술에 강하다.',
      },
      {
        id: 'chenkun-gung', name: '첸쿤궁', nameEn: 'Chenkun-gung', x: 81.1, y: 57.8,
        image: 'assets/regions/soran/chenkun-gung.webp',
        description: '소란 동부 거친 산맥에 위치한 곳으로, 공식적인 국가는 아니지만 실질적 지도자라 할 수 있는 수도원장의 존재에 더해, 이곳의 수도승들은 그 어느 나라에도 속하지 않아 타국에서는 준 국가로 여겨진다. 오직 수련을 통한 통달만을 목적으로 살아가는 이들이기에, 뛰어난 경지에 오른 무인들이 많다.',
      },
    ],
  },
  { id: 'alkahran', name: '알카란', nameEn: 'Alkahran', lat: -18.6, lon: -124.9, image: 'assets/continents/alkahran.webp',
    description: '알카란은 거친 사암 협곡과 황무지, 사막으로 이루어진 척박한 땅이다. 주 종족은 인간과 수인인데, 수인 중에서도 리자드맨처럼 파충류 수인이 많다. 대체로 수인에 대한 대우는 좋지 못하며, 아예 야만인이나 노예 취급하기도 한다. 땅이 메말라 농사는 어렵지만 지하 자원이 풍부하기에 알카란의 국가들은 이것을 바탕으로 고유한 기술을 갖추거나 무역품으로 가공해 판매하는 방식으로 발전했다.',
    regions: [
      {
        id: 'sharif', name: '샤리프', nameEn: 'Sharif', x: 55.3, y: 18.7,
        image: 'assets/regions/alkahran/sharif.webp',
        description: '알카란 북부에 위치한 나라로, 척박한 사암지대를 기반으로 하지만 광물 자원이 풍부하게 매장되어 있어 이를 가공한 아름다운 보석과 장신구가 발달했다. 북동부 해안을 통해 라니엘과 교역을 하며 부를 축적했으며, 무역이 주요 수입 수단인 만큼 타 국가와 가능한 원만한 관계를 유지하려고 노력한다.',
      },
      {
        id: 'zantar', name: '잔타르', nameEn: 'Zantar', x: 24.1, y: 46.7,
        image: 'assets/regions/alkahran/zantar.webp',
        description: '알카란 중심부에 위치한 나라로, 지하 자원을 이용해 독자적인 기술을 발전시켰다. 잔타르의 국민들은 힘을 숭상하며 더욱 강인해지기 위해 자신의 신체를 개조하는 것도 마다하지 않는다. 주 종족은 인간이며 타 종족을 배척하지만, 강함을 증명한다면 소속으로 받아들이기도 한다.',
      },
      {
        id: 'barako', name: '바라코', nameEn: 'Barako', x: 84.0, y: 51.2,
        image: 'assets/regions/alkahran/barako.webp',
        description: '알카란 동부에 위치한 군도로, 나라라기 보다는 파충류 수인들이 모여 사는 일종의 큰 부락에 가깝다. 생선을 비롯한 질 좋은 해산물이 주요 특산품이며, 샤리프의 중계를 통해 다양한 국가와 교류하고 있다.',
      },
      {
        id: 'azit', name: '아짓', nameEn: 'Azit', x: 40.7, y: 75.3,
        image: 'assets/regions/alkahran/azit.webp',
        description: '알카란 남부에 위치한 나라로, 거대한 오아시스를 품고 있어 알카란에서 유일하게 드넓은 농경지를 가졌다. 풍부한 식자원을 바탕으로 안정적으로 발전했으며, 국민들은 이 풍요로움을 태양신의 은총이라 여긴다. 아짓의 왕은 태양신의 화신으로 추앙된다.',
      },
    ],
  },
  { id: 'eremos', name: '에레모스', nameEn: 'Eremos', lat: -34.4, lon: -36.0, image: 'assets/continents/eremos.webp',
    description: '에레모스는 남반구에 위치한 작은 대륙이다. 본래 인간들만 살던 곳으로, 늘 그렇듯 이 좁은 땅에서도 국가가 나뉘고 전쟁이 벌어졌지만, 그래도 비교적 평화롭고 풍요로운 지역이었다. 그러나 외신이라 불리는 강대한 존재가 무려 일곱이나 이 땅에 내려왔고, 에레모스는 과거의 평화를 더는 찾아볼 수 없는 폐허가 되었다.',
    regions: [
      {
        id: 'akros', name: '아크로스', nameEn: 'Akros', x: 28.0, y: 15.9,
        image: 'assets/regions/eremos/akros.webp',
        description: '에레모스 북서부에 위치한 험준한 산악지대이다. 외신 텔리시엘에게 점령 당해 항상 낮처럼 밝은데, 표면적으로 보면 번듯한 도시 외관을 그대로 유지하고 있다. 거주민들은 노예처럼 끊임없이 부려지며, 일하는 것을 멈추면 벌을 받기에 이곳 사람들은 죽을 때까지 쉴 수 없다. 서베일런트가 거주민을 감시하면서도 침입자를 막는 경비병 역할을 겸해서 다른 마물은 거의 없다.',
      },
      {
        id: 'umvale', name: '움배일', nameEn: 'Umvale', x: 47.3, y: 23.8,
        image: 'assets/regions/eremos/umvale.webp',
        description: '에레모스 중북부에 위치한 좁은 평야지대이다. 외신 아스테론이 지배하고 있어 항상 밤처럼 어둡다. 빛이 들지 않아 식물이 거의 자라지 못하고 땅이 메말랐지만, 거주민들은 조금 굶주린 것 외에는 큰 문제 없이 지내고 있다. 이유는 알 수 없지만 아스테론은 성 안에 칩거 중이고, 그가 부리는 워더들도 주민들을 움배일 밖으로 나가지 못하게 막을 뿐, 해를 끼치지 않기 때문이다.',
      },
      {
        id: 'lophia', name: '로피아', nameEn: 'Lophia', x: 75.6, y: 21.4,
        image: 'assets/regions/eremos/lophia.webp',
        description: '에레모스 북동부에 위치한 평야지대이다. 표면적으로 비교적 기존의 모습을 유지하고는 있지만, 거주민들이 외신 마네모에 의해 저항 의지를 모조리 잃었기에 무슨 짓을 당해도 반격하지 않는다. 때문에 이곳은 온갖 범죄를 저지르는 무법자들의 놀이터가 되었다.',
      },
      {
        id: 'agonos', name: '애고노스', nameEn: 'Agonos', x: 22.0, y: 57.6,
        image: 'assets/regions/eremos/agonos.webp',
        description: '에레모스 남서부에 위치한 평야지대이다. 원래는 넓고 비옥한 땅이었으나, 이곳의 모든 생명체는 죽었다. 외신 에우랄레나가 이곳에 죽음의 기운을 퍼뜨렸기 때문이다. 이제 이곳은 살아 숨 쉬는 것을 찾아볼 수 없는 황무지가 되었다.',
      },
      {
        id: 'tangloot', name: '탱글룻', nameEn: 'Tangloot', x: 52.6, y: 50.5,
        image: 'assets/regions/eremos/tangloot.webp',
        description: '에레모스 중심부에 위치한 우거진 수림이다. 외신 엘레라그실이 지배하고 있다. 이곳의 거주민들은 엘레라그실의 열매를 먹고 불멸이 되었는데, 이 불멸의 방식이 단순히 육체와 영혼을 강제로 묶는 것일 뿐이었기에, 열매를 먹은 이들은 살이 썩는 고통을 모두 느끼며 점차 이성을 놓고 마물 스켈레톤이 되어가고 있다.',
      },
      {
        id: 'eutopos', name: '유토포스', nameEn: 'Eutopos', x: 79.4, y: 45.3,
        image: 'assets/regions/eremos/eutopos.webp',
        description: '에레모스 동부에 위치한 평야지대이다. 큰 강이 흐르고 비옥한 토양을 가져 원래는 농경이 발달한 국가였으나, 이제 그 풍족한 작물들은 거주민들의 마음과 함께 모조리 말라붙었다. 외신 네프라티스가 주민들의 감정을 모조리 흡수하는 바람에 대다수는 마물 허스크가 되었으며, 아직 남아있는 주민들도 대체로 무감정한 모습을 보인다.',
      },
      {
        id: 'tiabay', name: '티아배이', nameEn: 'Tiabay', x: 77.2, y: 67.4,
        image: 'assets/regions/eremos/tiabay.webp',
        description: '에레모스 남동부에 위치한 드넓은 평야지대이다. 본래 아름다운 해안 풍경을 가져 관광지로 유명했으며, 농업과 어업이 모두 발달한 풍족한 나라였다. 지금은 외신 해그니어에 의해 마물 비게터로 변해버린 대부분의 거주민과, 그들의 눈을 피해 다니는 일부 생존자들의 숨 막히는 숨바꼭질만이 이어지고 있다.',
      },
    ],
  },
  { id: 'yidra', name: '이드라', nameEn: 'Yidra', lat: -22.4, lon: 28.3, image: 'assets/continents/yidra.webp', description: '' },
  { id: 'yumir', name: '유미르', nameEn: 'Yumir', lat: -88.0, lon: 0.0, image: 'assets/continents/yumir.webp', description: '' },
];
