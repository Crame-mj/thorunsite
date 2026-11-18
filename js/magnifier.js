// 개념서 돋보기.
//  - 화면 오른쪽 아래 돋보기 아이콘을 끌면 아이콘이 사라지고 실제로 동작하는 큰 돋보기가 끌려 나온다.
//  - 돋보기는 끌어서 어디든 옮길 수 있고(화면 밖으로는 절반까지만), 렌즈 안은 ZOOM배로 확대되어 보인다.
//  - 아이콘이 있던 오른쪽 아래 구역에 놓으면(손을 뗐을 때만) 꺼지고 아이콘이 다시 나타난다.
//  - 렌즈 확대는 3D 화면(캔버스)과 배경 영상을 그대로 확대해서 그린다. 로고·버튼 같은 화면 UI는 확대되지 않는다.

const ZOOM = 2;                // 렌즈 확대율 (2 = 200%)
const TOOL_SRC = 'assets/brand/magnifier-tool.webp';
// 돋보기 이미지에서 렌즈(유리) 타원의 위치 — 이미지 크기 대비 비율
const LENS = { cx: 0.618, cy: 0.385, rx: 0.319, ry: 0.301 };
const GRAB = { x: 0.15, y: 0.82 }; // 아이콘에서 끌어낼 때 손가락이 잡는 위치 (손잡이 부근)
const DOCK = { w: 200, h: 200 };   // 오른쪽 아래에서 이 범위 안에 놓으면 꺼진다 (px)

export function setupMagnifier({ icon, sceneCanvas, bgVideo, onChange }) {
  const tool = document.createElement('div');
  tool.className = 'magnifier-tool';
  tool.hidden = true;
  const lens = document.createElement('canvas');
  lens.className = 'magnifier-lens';
  const img = new Image();
  img.src = TOOL_SRC;
  img.alt = '';
  img.draggable = false;
  tool.append(lens, img);
  document.body.append(tool);
  const lg = lens.getContext('2d');

  // 손잡이·테두리 같은 불투명 부분만 잡을 수 있게 하기 위한 알파 맵
  let alpha = null, aw = 0, ah = 0;
  img.addEventListener('load', () => {
    aw = 180; ah = Math.round(aw * img.naturalHeight / img.naturalWidth);
    const c = document.createElement('canvas');
    c.width = aw; c.height = ah;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, aw, ah);
    alpha = g.getImageData(0, 0, aw, ah).data;
  });

  const st = { active: false, x: 0, y: 0, w: 0, h: 0, drag: null };

  function size() {
    const vw = window.innerWidth, vh = window.innerHeight;
    // 돋보기 크기: 화면 짧은 쪽의 60% (최소 280px, 최대 560px)
    st.w = Math.round(Math.min(Math.max(Math.min(vw, vh) * 0.6, 280), 560));
    const ratio = img.naturalWidth ? img.naturalHeight / img.naturalWidth : 717 / 720;
    st.h = Math.round(st.w * ratio);
    tool.style.width = `${st.w}px`;
    tool.style.height = `${st.h}px`;
    const lw = LENS.rx * 2 * st.w, lh = LENS.ry * 2 * st.h;
    Object.assign(lens.style, {
      left: `${(LENS.cx - LENS.rx) * st.w}px`, top: `${(LENS.cy - LENS.ry) * st.h}px`,
      width: `${lw}px`, height: `${lh}px`,
    });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    lens.width = Math.round(lw * dpr);
    lens.height = Math.round(lh * dpr);
  }

  /** 화면 밖으로는 돋보기 크기의 절반까지만 나갈 수 있다 */
  function place(x, y) {
    const vw = window.innerWidth, vh = window.innerHeight;
    st.x = Math.min(Math.max(x, -st.w / 2), vw - st.w / 2);
    st.y = Math.min(Math.max(y, -st.h / 2), vh - st.h / 2);
    tool.style.transform = `translate(${st.x}px, ${st.y}px)`;
  }

  function inDock(px, py) {
    return px > window.innerWidth - DOCK.w && py > window.innerHeight - DOCK.h;
  }

  function startDrag(e, gx, gy) {
    st.drag = { id: e.pointerId, gx, gy };
    tool.classList.add('dragging');
    document.body.classList.add('magnifier-dragging');
  }

  function activate(e) {
    size();
    st.active = true;
    tool.hidden = false;
    const gx = GRAB.x * st.w, gy = GRAB.y * st.h;
    place(e.clientX - gx, e.clientY - gy);
    startDrag(e, gx, gy);
    onChange?.(true);
  }

  function deactivate() {
    if (!st.active) return;
    st.active = false;
    st.drag = null;
    tool.hidden = true;
    tool.classList.remove('dragging');
    document.body.classList.remove('magnifier-dragging', 'magnifier-over-dock');
    onChange?.(false);
  }

  /** 화면 좌표가 돋보기의 잡을 수 있는 부분(렌즈 또는 불투명한 테두리·손잡이) 위인지 */
  function hits(px, py) {
    if (!st.active) return false;
    const u = (px - st.x) / st.w, v = (py - st.y) / st.h;
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return false;
    const dx = (u - LENS.cx) / LENS.rx, dy = (v - LENS.cy) / LENS.ry;
    if (dx * dx + dy * dy <= 1) return true;
    if (!alpha) return true;
    return alpha[(Math.floor(v * ah) * aw + Math.floor(u * aw)) * 4 + 3] > 40;
  }

  icon.addEventListener('pointerdown', (e) => {
    if (st.active || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    e.stopPropagation();
    activate(e);
  });

  // 캔버스(책 넘기기)보다 먼저 받아서, 돋보기를 잡은 경우엔 책으로 전달되지 않게 한다
  document.addEventListener('pointerdown', (e) => {
    if (st.drag || !hits(e.clientX, e.clientY)) return;
    // 돋보기보다 위에 표시되는 화면 UI(세계 버튼, 음악 플레이어 등)를 누른 경우엔 그 UI가 동작하게 둔다
    if (e.target.closest?.('button, input, a, .audio-player')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    startDrag(e, e.clientX - st.x, e.clientY - st.y);
  }, true);

  document.addEventListener('pointermove', (e) => {
    if (!st.drag) {
      // 마우스를 돋보기 위에 올리면 잡을 수 있다는 커서
      if (st.active && e.pointerType === 'mouse') document.body.classList.toggle('magnifier-hover', hits(e.clientX, e.clientY));
      return;
    }
    if (st.drag.id !== e.pointerId) return;
    place(e.clientX - st.drag.gx, e.clientY - st.drag.gy);
    document.body.classList.toggle('magnifier-over-dock', inDock(e.clientX, e.clientY));
  }, true);

  const end = (e) => {
    if (!st.drag || st.drag.id !== e.pointerId) return;
    st.drag = null;
    tool.classList.remove('dragging');
    document.body.classList.remove('magnifier-dragging', 'magnifier-over-dock');
    // 손을 뗀 위치가 오른쪽 아래 구역이면 끈다 (끄는 중이 아닌 '놓았을 때'만)
    if (e.type === 'pointerup' && inDock(e.clientX, e.clientY)) deactivate();
  };
  document.addEventListener('pointerup', end, true);
  document.addEventListener('pointercancel', end, true);

  window.addEventListener('resize', () => { if (st.active) { size(); place(st.x, st.y); } });

  /** 매 프레임, 3D 화면을 그린 직후에 호출 — 렌즈 안을 확대해서 그린다 */
  function render() {
    if (!st.active) return;
    const lw = LENS.rx * 2 * st.w, lh = LENS.ry * 2 * st.h;
    const cx = st.x + LENS.cx * st.w, cy = st.y + LENS.cy * st.h; // 렌즈 중심 (화면 좌표)
    const sw = lw / ZOOM, sh = lh / ZOOM;                          // 확대 전 원본 범위
    const sx = cx - sw / 2, sy = cy - sh / 2;
    const W = lens.width, H = lens.height;

    lg.save();
    lg.clearRect(0, 0, W, H);
    lg.beginPath();
    lg.ellipse(W / 2, H / 2, W / 2, H / 2, 0, 0, Math.PI * 2);
    lg.clip();
    lg.fillStyle = '#0b0e17';
    lg.fillRect(0, 0, W, H);

    // 배경 영상 (object-fit: cover 배치를 그대로 따라 계산)
    if (bgVideo && bgVideo.readyState >= 2 && bgVideo.videoWidth) {
      const vw = window.innerWidth, vh = window.innerHeight;
      const k = Math.max(vw / bgVideo.videoWidth, vh / bgVideo.videoHeight);
      const ox = (vw - bgVideo.videoWidth * k) / 2, oy = (vh - bgVideo.videoHeight * k) / 2;
      lg.drawImage(bgVideo, (sx - ox) / k, (sy - oy) / k, sw / k, sh / k, 0, 0, W, H);
    }
    // 3D 화면
    const r = sceneCanvas.width / sceneCanvas.clientWidth;
    lg.drawImage(sceneCanvas, sx * r, sy * r, sw * r, sh * r, 0, 0, W, H);

    // 유리 느낌: 가장자리를 살짝 어둡게
    const grad = lg.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.52);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(20,12,0,0.28)');
    lg.fillStyle = grad;
    lg.fillRect(0, 0, W, H);
    lg.restore();
  }

  return {
    render,
    deactivate,
    get active() { return st.active; },
  };
}
