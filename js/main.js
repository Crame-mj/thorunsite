import * as THREE from 'three';
import { Globe } from './globe.js';
import { Book } from './book.js';
import { PEOPLE, BOOK_TITLE, COVER_TITLE } from './people.js';
import { CONTINENTS } from './continents.js';
import { setupAudioPlayer } from './audio-player.js';

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
await Promise.race([
  Promise.all([
    document.fonts.load('400 32px "Noto Serif KR"', '가A'),
    document.fonts.load('700 32px "Noto Serif KR"', '가A'),
    document.fonts.load('700 32px "Lobster Two"', 'Lexicon'),
  ]).catch(() => {}),
  new Promise((r) => setTimeout(r, 2500)),
]);

const book = await Book.create({
  renderer, pageWidth: 1.3, pageHeight: 1.8, people: PEOPLE, title: BOOK_TITLE, coverTitle: COVER_TITLE, textures: BOOK_TEXTURES,
});
scene.add(book.object);

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
  fit.bookDist = Math.max(1.05 / t, 1.7 / (t * a));
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
  camera.position.set(0, 0, THREE.MathUtils.lerp(fit.globeDist, fit.bookDist, e) * zoom);
  camera.lookAt(0, 0, 0);
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
  popupDesc.parentElement.scrollTop = 0;
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
  state.zoomTarget = 0;
  globe.select(null);
  if (popupReturnFocus && document.contains(popupReturnFocus)) popupReturnFocus.focus({ preventScroll: true });
  popupReturnFocus = null;
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
let tap = null; // 지구본을 짧게 눌렀는지 판정 (핀 클릭)
const ndc = new THREE.Vector2();

function toNdc(e) {
  const rect = canvas.getBoundingClientRect();
  return ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
}

canvas.addEventListener('pointerdown', (e) => {
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
  if (dragOwner === 'globe') globe.pointerMove(e, canvas.clientHeight);
  else if (dragOwner === 'book') book.pointerMove(e, camera, canvas.getBoundingClientRect());
  else if (e.pointerType === 'mouse') {
    // 핀 위에 마우스를 올리면 손가락 커서
    const overPin = activeController() === 'globe' && !globe.isFocusing && globe.pick(toNdc(e), camera);
    canvas.style.cursor = overPin ? 'pointer' : '';
  }
});

function endDrag(e) {
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

  globe.update(dt);
  book.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

loading.classList.add('done');

// 배경 영상: 움직임 줄이기 설정이면 첫 프레임에 멈춘다. 자동재생이 막혀도 poster 이미지가 보이므로 오류는 무시.
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) bgVideo.pause();
else bgVideo.play().catch(() => {});
