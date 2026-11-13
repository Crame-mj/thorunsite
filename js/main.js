import * as THREE from 'three';
import { Globe } from './globe.js';
import { Book } from './book.js';
import { PEOPLE, BOOK_TITLE } from './people.js';

// 지구본 텍스처: 등장방형(equirectangular) 2:1 이미지
const GLOBE_TEXTURE_URL = 'assets/textures/world-map.webp';
// 책 텍스처: 표지 가죽, 내용 페이지 종이
const BOOK_TEXTURES = { cover: 'assets/textures/cover-leather.jpg', paper: 'assets/textures/page-paper.jpg' };
const TRANSITION_MS = 1100;

const canvas = document.getElementById('scene');
const btnToBook = document.getElementById('to-book');
const btnToGlobe = document.getElementById('to-globe');
const loading = document.getElementById('loading');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (err) {
  loading.textContent = '이 브라우저에서는 WebGL을 사용할 수 없습니다.';
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x0b0e17);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);

scene.add(new THREE.HemisphereLight(0xfff6e8, 0x1a2030, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-3, 4, 6);
scene.add(sun);

const globe = new Globe({ radius: 1 });
if (GLOBE_TEXTURE_URL) globe.setTexture(GLOBE_TEXTURE_URL, renderer);
scene.add(globe.object);

// 캔버스 텍스트에 웹폰트를 쓰려면 폰트가 먼저 로드돼야 한다. 실패/지연 시 기본 serif로 진행.
await Promise.race([
  Promise.all([
    document.fonts.load('400 32px "Noto Serif KR"', '가A'),
    document.fonts.load('700 32px "Noto Serif KR"', '가A'),
  ]).catch(() => {}),
  new Promise((r) => setTimeout(r, 2500)),
]);

const book = await Book.create({
  renderer, pageWidth: 1.3, pageHeight: 1.8, people: PEOPLE, title: BOOK_TITLE, textures: BOOK_TEXTURES,
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

const state = { mode: 'globe', t: 0 }; // t: 0=지구본 화면, 1=책 화면

function setMode(mode) {
  state.mode = mode;
  btnToBook.hidden = mode !== 'globe';
  btnToGlobe.hidden = mode !== 'book';
  (mode === 'globe' ? btnToBook : btnToGlobe).focus({ preventScroll: true });
}
btnToBook.addEventListener('click', () => setMode('book'));
btnToGlobe.addEventListener('click', () => setMode('globe'));

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function applyLayout() {
  const e = ease(state.t);
  globe.object.position.x = THREE.MathUtils.lerp(0, -fit.offX, e);
  book.object.position.x = THREE.MathUtils.lerp(fit.offX, 0, e);
  camera.position.set(0, 0, THREE.MathUtils.lerp(fit.globeDist, fit.bookDist, e));
  camera.lookAt(0, 0, 0);
  globe.object.visible = e < 0.999;
  book.object.visible = e > 0.001;
}

// ------------------------------------------------------------------ 입력

// 전환이 끝난 상태에서만 해당 화면의 오브젝트를 조작할 수 있다.
function activeController() {
  if (state.mode === 'globe' && state.t === 0) return 'globe';
  if (state.mode === 'book' && state.t === 1) return 'book';
  return null;
}

let dragOwner = null;

canvas.addEventListener('pointerdown', (e) => {
  if (dragOwner || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const c = activeController();
  const rect = canvas.getBoundingClientRect();
  const ok = c === 'globe' ? globe.pointerDown(e) : c === 'book' ? book.pointerDown(e, camera, rect) : false;
  if (!ok) return;
  dragOwner = c;
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
  e.preventDefault();
});

canvas.addEventListener('pointermove', (e) => {
  if (dragOwner === 'globe') globe.pointerMove(e, canvas.clientHeight);
  else if (dragOwner === 'book') book.pointerMove(e, camera, canvas.getBoundingClientRect());
});

function endDrag(e) {
  if (!dragOwner) return;
  if (dragOwner === 'globe') globe.pointerUp(e);
  else book.pointerUp(e);
  if (!globe.isDragging && !book.isDragging) {
    dragOwner = null;
    canvas.classList.remove('dragging');
  }
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

window.addEventListener('keydown', (e) => {
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
  applyLayout();

  globe.update(dt);
  book.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

loading.classList.add('done');
