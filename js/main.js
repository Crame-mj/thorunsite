import * as THREE from 'three';
import { Globe } from './globe.js';
import { Book } from './book.js';
import { SECTIONS, BOOK_TITLE, COVER_TITLE } from './lexicon.js';
import { CONTINENTS } from './continents.js';
import { setupAudioPlayer } from './audio-player.js';
import { createBookSfx } from './sfx.js';
import { setupMagnifier } from './magnifier.js';

// 지구본 텍스처: 등장방형(equirectangular) 2:1 이미지
// world-map-globe.webp는 원본(world-map.webp)을 극지방 왜곡이 덜하도록 재투영한 버전
const GLOBE_TEXTURE_URL = 'assets/textures/world-map-globe.webp';
// 책 텍스처: 표지 가죽, 내용 페이지 종이, 종이 더미 단면
const BOOK_TEXTURES = {
  cover: 'assets/textures/cover-leather.jpg',
  paper: 'assets/textures/page-paper.jpg',
  edge: 'assets/textures/page-edge.jpg',
};
const TRANSITION_MS = 1100;
const ZOOM_MS = 1200;        // 대륙 선택 시 확대 시간 (지구본 회전 시간과 맞춤)
const ZOOM_AMOUNT = 0.42;    // 확대 정도: 카메라 거리를 이 비율만큼 줄인다

const canvas = document.getElementById('scene');
const btnToBook = document.getElementById('to-book');
const btnToGlobe = document.getElementById('to-globe');
const loading = document.getElementById('loading');
const bgVideo = document.getElementById('bg');
const magnifier = document.getElementById('magnifier');
const continentList = document.getElementById('continent-list');
document.body.dataset.mode = 'globe';
setupAudioPlayer(document.getElementById('audio-player'));
const popup = document.getElementById('continent-popup');
const popupTitle = document.getElementById('popup-title');
const popupDesc = document.getElementById('popup-desc');
const popupImage = document.getElementById('popup-image');
const popupImageEmpty = document.getElementById('popup-image-empty');
const popupFigure = document.getElementById('popup-figure');
const popupPins = document.getElementById('popup-pins');
const popupSubtitle = document.getElementById('popup-subtitle');

let renderer;
try {
  // alpha: 캔버스를 투명하게 해서 뒤의 배경 영상(#bg)이 보이도록
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (err) {
  loading.textContent = '이 브라우저에서는 WebGL을 사용할 수 없습니다.';
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);

scene.add(new THREE.HemisphereLight(0xfff6e8, 0x1a2030, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-3, 4, 6);
scene.add(sun);

const globe = new Globe({ radius: 1 });
if (GLOBE_TEXTURE_URL) globe.setTexture(GLOBE_TEXTURE_URL, renderer);
globe.addPins(CONTINENTS);
scene.add(globe.object);

// 캔버스 텍스트에 웹폰트를 쓰려면 폰트가 먼저 로드돼야 한다. 실패/지연 시 기본 serif로 진행.
// 개념서 내부 글씨(Nanum Pen Script)는 글자 범위별 파일로 나뉘어 있어서, 책에 쓰이는 글자를 넘겨 해당 파일만 미리 받는다.
const BOOK_TEXT = `${BOOK_TITLE}0123456789 가나다라마바사 ${JSON.stringify(SECTIONS)}`; // 가나다라마바사: 목록 칸 크기 기준
await Promise.race([
  Promise.all([
    document.fonts.load('400 32px "Nanum Pen Script"', BOOK_TEXT),
    document.fonts.load('400 32px "Noto Serif KR"', '가A'),
    document.fonts.load('700 32px "Noto Serif KR"', '가A'),
    document.fonts.load('700 32px "Lobster Two"', 'Lexicon'),
  ]).catch(() => {}),
  new Promise((r) => setTimeout(r, 4000)),
]);

const book = await Book.create({
  renderer, pageWidth: 1.3, pageHeight: 1.8, sections: SECTIONS, title: BOOK_TITLE, coverTitle: COVER_TITLE, textures: BOOK_TEXTURES,
});
scene.add(book.object);
const bookSfx = createBookSfx();
const lensTool = setupMagnifier({
  icon: magnifier, sceneCanvas: canvas, bgVideo,
  onChange: (on) => magnifier.classList.toggle('out', on), // 돋보기를 꺼내 쓰는 동안 아이콘은 숨김
});

// ------------------------------------------------------------------ 화면 맞춤

const fit = { globeDist: 6, bookDist: 6, offX: 5 };

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const a = camera.aspect;
  // 각 오브젝트가 화면에 여유 있게 들어오도록 필요한 카메라 거리 계산 (반폭/반높이 기준)
  fit.globeDist = Math.max(1.45 / t, 1.3 / (t * a));
  // 책은 기울어져 있어 앞쪽 모서리가 원근으로 커 보이므로 폭에 여유를 더 둔다
  fit.bookDist = Math.max(1.05 / t, 1.85 / (t * a)); // 좌우로 튀어나온 페이지 마커까지 들어오도록
  // 화면 밖으로 밀어낼 거리: 더 먼 카메라 기준 보이는 반폭 + 오브젝트 크기
  const halfW = Math.max(fit.globeDist, fit.bookDist) * t * a;
  fit.offX = halfW + 1.6;
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ 모드 전환

// t: 0=지구본 화면, 1=책 화면 / zoom: 0=기본, 1=대륙 확대
const state = { mode: 'globe', t: 0, zoom: 0, zoomTarget: 0 };

function setMode(mode) {
  state.mode = mode;
  document.body.dataset.mode = mode; // 오디오 플레이어 위치 이동(CSS)
  state.zoomTarget = 0;
  resetBookZoom();
  if (mode !== 'book') lensTool.deactivate(); // 지구본 화면으로 가면 돋보기는 자동으로 끈다
  btnToBook.hidden = mode !== 'globe';
  btnToGlobe.hidden = mode !== 'book';
  continentList.hidden = mode !== 'globe';
  (mode === 'globe' ? btnToBook : btnToGlobe).focus({ preventScroll: true });
}
btnToBook.addEventListener('click', () => setMode('book'));
btnToGlobe.addEventListener('click', () => setMode('globe'));

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function applyLayout() {
  const e = ease(state.t);
  globe.object.position.x = THREE.MathUtils.lerp(0, -fit.offX, e);
  book.object.position.x = THREE.MathUtils.lerp(fit.offX, 0, e);
  const zoom = 1 - ZOOM_AMOUNT * ease(state.zoom);
  // 개념서 두 손가락 확대: 카메라를 그만큼 당기고, 옮긴 만큼 카메라를 평행 이동
  const bz = THREE.MathUtils.lerp(1, bookZoom.s, e);
  const px = bookZoom.x * e, py = bookZoom.y * e;
  camera.position.set(px, py, (THREE.MathUtils.lerp(fit.globeDist, fit.bookDist, e) * zoom) / bz);
  camera.lookAt(px, py, 0);
  globe.object.visible = e < 0.999;
  book.object.visible = e > 0.001;
}

// ------------------------------------------------------------------ 대륙 선택 / 팝업

let popupReturnFocus = null;

const displayName = (c) => (c.nameEn ? `${c.name}(${c.nameEn})` : c.name);

function focusContinent(id) {
  if (activeController() !== 'globe' || globe.isFocusing || !popup.hidden) return;
  state.zoomTarget = 1;
  globe.focusOn(id, () => openPopup(id));
  // 이미 거의 정면을 보고 있어서 회전이 거의 없으면 효과음은 생략
  if (globe.lastFocusAngle > 0.15) bookSfx.playMove();
}

function setPopupImage(src, alt) {
  popupImage.src = src;
  popupImage.alt = alt;
}

/** 대륙 개요(region=null) 또는 구역을 보여준다. 구역 이미지가 있으면 이미지도 바꾸고 구역 핀은 숨긴다. */
function showDescription(c, region) {
  const regionImage = region && region.image;
  if (c.image) {
    if (regionImage) setPopupImage(region.image, `${region.name ? displayName(region) : displayName(c)} ${region.label ?? ''} 이미지`.replace(/\s+/g, ' '));
    else if (!region) setPopupImage(c.image, `${displayName(c)} 이미지`);
  }
  popupPins.classList.toggle('pins-hidden', Boolean(regionImage));
  // 구역 설명이 비어 있으면 대륙 설명을 그대로 보여준다 (이미지만 바꾸는 핀)
  const text = region && region.description ? region.description : c.description;
  const hasDesc = Boolean(text && text.trim());
  popupDesc.textContent = hasDesc ? text : '설명 준비 중';
  popupDesc.classList.toggle('empty', !hasDesc);
  const showSub = Boolean(region && region.name);
  popupSubtitle.hidden = !showSub;
  popupSubtitle.textContent = showSub ? displayName(region) : '';
  popupBody.scrollTop = 0;
  requestAnimationFrame(updateScrollHint);
  for (const pin of popupPins.children) {
    const active = region ? pin.dataset.region === region.id : pin.dataset.region === '';
    pin.classList.toggle('active', active);
    pin.setAttribute('aria-pressed', String(active));
  }
}

function makePin(label, regionId, x, y, isHome) {
  const pin = document.createElement('button');
  pin.type = 'button';
  pin.className = isHome ? 'region-pin home' : 'region-pin';
  pin.dataset.region = regionId;
  pin.style.left = `${x}%`;
  pin.style.top = `${y}%`;
  pin.setAttribute('aria-label', label);
  pin.title = label;
  if (isHome) pin.innerHTML = '<span class="label">대륙 개요</span>';
  return pin;
}

function openPopup(id) {
  const c = CONTINENTS.find((x) => x.id === id);
  if (!c) return;
  popupTitle.textContent = displayName(c);
  if (c.image) {
    popupImage.src = c.image;
    popupImage.alt = `${displayName(c)} 이미지`;
    popupFigure.hidden = false;
    popupImageEmpty.hidden = true;
  } else {
    popupImage.removeAttribute('src');
    popupFigure.hidden = true;
    popupImageEmpty.hidden = false;
  }

  // 구역 핀: 구역이 있는 대륙만. 왼쪽 위 핀은 대륙 설명으로 돌아가는 용도.
  popupPins.replaceChildren();
  const regions = c.image && c.regions ? c.regions : [];
  if (regions.length) {
    const home = makePin('대륙 개요', '', 0, 0, true);
    home.addEventListener('click', () => showDescription(c, null));
    popupPins.append(home);
    for (const r of regions) {
      const pin = makePin(r.name ? displayName(r) : (r.label ?? ''), r.id, r.x, r.y, false);
      pin.addEventListener('click', () => showDescription(c, r));
      popupPins.append(pin);
    }
  }
  showDescription(c, null);
  popupReturnFocus = document.activeElement;
  popup.hidden = false;
  requestAnimationFrame(() => popup.classList.add('open'));
  popup.querySelector('.popup-close').focus({ preventScroll: true });
}

function closePopup() {
  if (popup.hidden) return;
  popup.classList.remove('open');
  setTimeout(() => { popup.hidden = true; }, 300);
  if (state.zoomTarget !== 0) bookSfx.playBack(); // 확대가 풀리는 순간에만
  state.zoomTarget = 0;
  globe.select(null);
  if (popupReturnFocus && document.contains(popupReturnFocus)) popupReturnFocus.focus({ preventScroll: true });
  popupReturnFocus = null;
}

// 설명 칸: 스크롤바 없이 드래그로 올리고 내린다. 터치는 브라우저 기본 스크롤을 그대로 쓰고,
// 마우스는 직접 드래그를 처리한다. 아래에 내용이 더 있으면 끝을 흐리게 해서 알려준다.
const popupBody = popupDesc.parentElement;
function updateScrollHint() {
  const max = popupBody.scrollHeight - popupBody.clientHeight;
  popupBody.classList.toggle('scrollable', max > 2);
  popupBody.classList.toggle('more-below', popupBody.scrollTop < max - 2);
  popupBody.classList.toggle('more-above', popupBody.scrollTop > 2);
}
popupBody.addEventListener('scroll', updateScrollHint, { passive: true });
window.addEventListener('resize', updateScrollHint);
new ResizeObserver(updateScrollHint).observe(popupBody);
{
  let drag = null;
  popupBody.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (popupBody.scrollHeight <= popupBody.clientHeight) return;
    e.preventDefault(); // 끌어서 스크롤할 때 글자가 선택되지 않도록
    drag = { id: e.pointerId, y: e.clientY, top: popupBody.scrollTop, moved: false };
  });
  popupBody.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dy) < 3) return;
    if (!drag.moved) { drag.moved = true; popupBody.setPointerCapture(e.pointerId); popupBody.classList.add('dragging'); }
    popupBody.scrollTop = drag.top - dy;
  });
  const end = (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    drag = null;
    popupBody.classList.remove('dragging');
  };
  popupBody.addEventListener('pointerup', end);
  popupBody.addEventListener('pointercancel', end);
}

popup.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closePopup();
});

// 팝업에 들어갈 이미지를 미리 받아 둔다 (팝업이 뜰 때 늦게 그려지지 않도록)
window.addEventListener('load', () => {
  for (const c of CONTINENTS) {
    if (c.image) new Image().src = c.image;
    for (const r of c.regions ?? []) if (r.image) new Image().src = r.image;
  }
});

for (const c of CONTINENTS) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'continent-btn';
  btn.innerHTML = '<span class="dot" aria-hidden="true"></span>';
  btn.append(document.createTextNode(displayName(c)));
  btn.addEventListener('click', () => focusContinent(c.id));
  continentList.append(btn);
}

// ------------------------------------------------------------------ 입력

// 전환이 끝난 상태에서만 해당 화면의 오브젝트를 조작할 수 있다.
function activeController() {
  if (state.mode === 'globe' && state.t === 0) return 'globe';
  if (state.mode === 'book' && state.t === 1) return 'book';
  return null;
}

let dragOwner = null;

// ---------------------------------------------------------------- 개념서 두 손가락 확대/축소 (터치 전용)
// 한 손가락 = 페이지 넘기기, 두 손가락 = 확대·축소와 이동. 두 번째 손가락이 닿으면
// 막 시작된 페이지 넘김은 취소(제자리로)되고 확대 모드로 바뀐다. 손가락을 다 떼기 전까지 넘김은 다시 시작되지 않는다.
const BOOK_ZOOM_MAX = 3;
const bookZoom = { s: 1, x: 0, y: 0 };
const touches = new Map();  // 개념서 위에 올라간 손가락들 pointerId → {x, y}
let pinch = null;           // { d0, s0, wx, wy } 두 손가락 시작 거리·배율과 손가락 중심 아래의 월드 좌표
let pinchLock = false;      // 확대 후 남은 한 손가락으로 페이지가 넘어가지 않도록

function resetBookZoom() {
  bookZoom.s = 1; bookZoom.x = 0; bookZoom.y = 0;
  touches.clear(); pinch = null; pinchLock = false;
}

/** 화면 1px이 개념서 확대 배율 s에서 카메라 평면 기준 몇 월드 단위인지 */
function worldPerPx(s) {
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return (2 * t * fit.bookDist) / s / canvas.clientHeight;
}

function pinchInfo() {
  const [a, b] = [...touches.values()];
  const rect = canvas.getBoundingClientRect();
  return {
    d: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1),
    mx: (a.x + b.x) / 2 - rect.left - rect.width / 2,   // 화면 가운데 기준
    my: (a.y + b.y) / 2 - rect.top - rect.height / 2,
  };
}

function clampBookPan() {
  // 확대한 만큼만 옆으로 움직일 수 있게 (책이 화면 밖으로 사라지지 않도록)
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const halfH = t * fit.bookDist, halfW = halfH * camera.aspect;
  const k = 1 - 1 / bookZoom.s;
  bookZoom.x = THREE.MathUtils.clamp(bookZoom.x, -halfW * k, halfW * k);
  bookZoom.y = THREE.MathUtils.clamp(bookZoom.y, -halfH * k, halfH * k);
}

function startPinch() {
  const { d, mx, my } = pinchInfo();
  const k = worldPerPx(bookZoom.s);
  pinch = { d0: d, s0: bookZoom.s, wx: bookZoom.x + mx * k, wy: bookZoom.y - my * k };
  pinchLock = true;
}

function updatePinch() {
  const { d, mx, my } = pinchInfo();
  bookZoom.s = THREE.MathUtils.clamp(pinch.s0 * d / pinch.d0, 1, BOOK_ZOOM_MAX);
  // 처음 손가락 사이에 있던 지점이 계속 손가락 사이에 오도록 이동 (확대하면서 끌어 옮기기 가능)
  const k = worldPerPx(bookZoom.s);
  bookZoom.x = pinch.wx - mx * k;
  bookZoom.y = pinch.wy + my * k;
  if (bookZoom.s < 1.02) { bookZoom.s = 1; }
  clampBookPan();
}
let tap = null; // 지구본을 짧게 눌렀는지 판정 (핀 클릭)
const ndc = new THREE.Vector2();

function toNdc(e) {
  const rect = canvas.getBoundingClientRect();
  return ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' && activeController() === 'book') {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      // 두 번째 손가락: 넘기던 페이지는 제자리로 돌리고 확대 모드로
      if (dragOwner === 'book') { book.cancelDrag(); dragOwner = null; canvas.classList.remove('dragging'); }
      for (const id of touches.keys()) { try { canvas.setPointerCapture(id); } catch { /* 이미 뗀 손가락 */ } }
      startPinch();
      e.preventDefault();
      return;
    }
    if (touches.size > 2 || pinchLock) return;
  }
  if (dragOwner || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const c = activeController();
  const rect = canvas.getBoundingClientRect();
  const ok = c === 'globe' ? globe.pointerDown(e) : c === 'book' ? book.pointerDown(e, camera, rect) : false;
  if (!ok) return;
  dragOwner = c;
  tap = c === 'globe' ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
  e.preventDefault();
});

canvas.addEventListener('pointermove', (e) => {
  if (touches.has(e.pointerId)) {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size === 2) { updatePinch(); return; }
  }
  if (dragOwner === 'globe') globe.pointerMove(e, canvas.clientHeight);
  else if (dragOwner === 'book') book.pointerMove(e, camera, canvas.getBoundingClientRect());
  else if (e.pointerType === 'mouse') {
    // 핀 위에 마우스를 올리면 손가락 커서
    // 지구본 핀이나 개념서 페이지 마커 위에 마우스를 올리면 손가락 커서
    const c = activeController();
    const overPin = c === 'globe' && !globe.isFocusing && globe.pick(toNdc(e), camera);
    const overMarker = c === 'book' && book.markerAt(e, camera, canvas.getBoundingClientRect());
    canvas.style.cursor = overPin || overMarker ? 'pointer' : '';
  }
});

function endDrag(e) {
  if (touches.delete(e.pointerId)) {
    if (pinch && touches.size < 2) pinch = null;
    if (touches.size === 0) pinchLock = false; // 손가락을 모두 떼야 다시 페이지를 넘길 수 있다
  }
  if (!dragOwner) return;
  if (dragOwner === 'globe') {
    globe.pointerUp(e);
    // 거의 움직이지 않고 짧게 눌렀다 떼면 클릭으로 보고 핀을 찾는다
    if (tap && e.type === 'pointerup' && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 6 && performance.now() - tap.t < 400) {
      const id = globe.pick(toNdc(e), camera);
      if (id) focusContinent(id);
    }
    tap = null;
  } else book.pointerUp(e);
  if (!globe.isDragging && !book.isDragging) {
    dragOwner = null;
    canvas.classList.remove('dragging');
  }
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closePopup(); return; }
  // 볼륨 슬라이더 등 입력 요소에서 누른 방향키로 책장이 넘어가지 않도록
  if (e.target.closest?.('input, select, textarea, .audio-player')) return;
  if (activeController() !== 'book') return;
  if (e.key === 'ArrowRight') book.next();
  else if (e.key === 'ArrowLeft') book.prev();
});

// ------------------------------------------------------------------ 발광효과
// 조작할 수 있는 대상이 가만히 있을 때 테두리가 금빛으로 느리게 밝아졌다 옅어진다.

const GLOW_PERIOD = 2600;    // 한 번 밝아졌다 옅어지는 주기 (ms)
const GLOW_FADE = 500;       // 조건이 바뀔 때 켜지고 꺼지는 시간 (ms)
const ICON_IN_MS = 800;      // 돋보기 아이콘이 다 들어오기까지 (CSS 0.15s 지연 + 0.6s 이동)
const glow = { globe: 0, book: 0, iconSince: null };

function updateGlow(now, dt) {
  const globeOn = state.mode === 'globe' && state.t === 0 && state.zoom === 0 && state.zoomTarget === 0
    && popup.hidden && !globe.isDragging && !globe.isFocusing && !globe.isMoving;
  const bookOn = state.mode === 'book' && state.t === 1 && book.isClosedIdle;
  const step = dt / GLOW_FADE;
  glow.globe = THREE.MathUtils.clamp(glow.globe + (globeOn ? step : -step * 2), 0, 1);
  glow.book = THREE.MathUtils.clamp(glow.book + (bookOn ? step : -step * 2), 0, 1);
  const pulse = 0.35 + 0.65 * (0.5 - 0.5 * Math.cos((now / GLOW_PERIOD) * Math.PI * 2));
  globe.setGlow(glow.globe * pulse * 0.9);
  book.setGlow(glow.book * pulse * 0.85);

  // 돋보기 아이콘: 완전히 들어와 자리 잡은 뒤부터, 실제 돋보기를 꺼내면 꺼짐
  const shown = magnifier.classList.contains('show') && !magnifier.classList.contains('out');
  if (!shown) glow.iconSince = null;
  else if (glow.iconSince === null) glow.iconSince = now;
  magnifier.classList.toggle('glow', shown && now - glow.iconSince >= ICON_IN_MS);
}

// ------------------------------------------------------------------ 루프

let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 50);
  last = now;

  const dir = state.mode === 'book' ? 1 : -1;
  state.t = THREE.MathUtils.clamp(state.t + (dir * dt) / TRANSITION_MS, 0, 1);
  const zdir = Math.sign(state.zoomTarget - state.zoom);
  state.zoom = THREE.MathUtils.clamp(state.zoom + (zdir * dt) / ZOOM_MS, 0, 1);
  applyLayout();
  // 돋보기: 개념서 화면에서 책이 완전히 펼쳐져 페이지 마커가 나올 때 함께 나오고, 덮으면 함께 들어간다
  magnifier.classList.toggle('show', state.mode === 'book' && state.t === 1 && book.markersShown);
  updateGlow(now, dt);

  globe.update(dt);
  book.update(dt);
  bookSfx.update(book);
  renderer.render(scene, camera);
  lensTool.render(); // 방금 그린 화면을 렌즈 안에 확대해서 그린다 (렌더 직후여야 캔버스 내용을 읽을 수 있다)
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

loading.classList.add('done');

// 배경 영상: 움직임 줄이기 설정이면 첫 프레임에 멈춘다. 자동재생이 막혀도 poster 이미지가 보이므로 오류는 무시.
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) bgVideo.pause();
else bgVideo.play().catch(() => {});
