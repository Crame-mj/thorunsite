import * as THREE from 'three';

const SEGMENTS = 28;          // 페이지가 휘어질 때 사용하는 가로 분할 수
const LEAF_GAP = 0.004;       // 장 사이의 두께(z 간격)
const CURL = 0.5;             // 넘길 때 휘는 정도 (0이면 평평한 판)
const TEX_W = 1024;           // 페이지 텍스처 가로 해상도
const PAPER = '#f3ecdc';
const INK = '#2b241b';

/**
 * 실제 3D 지오메트리로 만든 책.
 * - 책장(leaf) 하나 = 앞면/뒷면 두 메시가 하나의 지오메트리를 공유
 * - 책등(spine)이 로컬 x=0, 오른쪽 더미는 +x, 넘긴 장은 -x 쪽에 놓인다.
 * - 넘기는 중인 장은 매 프레임 정점을 다시 계산해 종이처럼 휘게 한다.
 */
export class Book {
  static async create(opts) {
    const portraits = await loadPortraits(opts.people);
    return new Book(opts, portraits);
  }

  constructor({ renderer, pageWidth = 1.3, pageHeight = 1.8, people = [], title = '인명록', perPage = 2 }, portraits = new Map()) {
    this.W = pageWidth;
    this.H = pageHeight;
    this.anisotropy = renderer.capabilities.getMaxAnisotropy();

    this.object = new THREE.Group();     // 화면 슬라이드용
    const tilt = new THREE.Group();
    tilt.rotation.x = -0.3;              // 살짝 눕혀서 입체감
    this.object.add(tilt);
    this.inner = new THREE.Group();      // 펼침 상태에 따른 중앙 정렬용
    tilt.add(this.inner);

    this.leaves = [];
    this._buildLeaves(people, title, perPage, portraits);

    this._drag = null;
    this._ray = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this._inv = new THREE.Matrix4();
    this._hit = new THREE.Vector3();
    this._ndc = new THREE.Vector2();

    this.inner.position.x = this._centerOffset();
  }

  // ---------------------------------------------------------------- 구성

  _buildLeaves(people, title, perPage, portraits) {
    const pages = [{ type: 'title', title }];
    for (let i = 0; i < people.length; i += perPage) {
      pages.push({ type: 'people', items: people.slice(i, i + perPage), startIndex: i });
    }
    if (pages.length % 2) pages.push({ type: 'blank' });

    const coverW = this.W + 0.05, coverH = this.H + 0.08;
    const sheets = [{ front: { type: 'cover', title }, back: { type: 'endpaper' }, w: coverW, h: coverH, stiff: true }];
    for (let i = 0; i < pages.length; i += 2) {
      sheets.push({ front: pages[i], back: pages[i + 1], w: this.W, h: this.H, stiff: false });
    }
    sheets.push({ front: { type: 'endpaper' }, back: { type: 'backcover' }, w: coverW, h: coverH, stiff: true });

    let pageNo = 1;
    sheets.forEach((s, i) => {
      const isInner = !s.stiff;
      const frontTex = this._pageTexture(s.front, 'right', s.w / s.h, isInner ? pageNo++ : null, portraits);
      const backTex = this._pageTexture(s.back, 'left', s.w / s.h, isInner ? pageNo++ : null, portraits);
      // 뒷면은 넘긴 뒤 좌우가 반전되어 보이므로 UV를 뒤집어 바르게 보이게 한다.
      backTex.repeat.x = -1;
      backTex.offset.x = 1;

      const geo = new THREE.PlaneGeometry(s.w, s.h, SEGMENTS, 1);
      geo.translate(s.w / 2, 0, 0); // 책등을 x=0에 맞춤
      const frontMat = new THREE.MeshStandardMaterial({ map: frontTex, side: THREE.FrontSide, roughness: 0.92 });
      const backMat = new THREE.MeshStandardMaterial({ map: backTex, side: THREE.BackSide, roughness: 0.92 });
      const group = new THREE.Group();
      group.add(new THREE.Mesh(geo, frontMat), new THREE.Mesh(geo, backMat));
      this.inner.add(group);

      const leaf = { index: i, w: s.w, stiff: s.stiff, geo, angle: 0, target: 0, curlDir: 1, dirty: true };
      this.leaves.push(leaf);
    });
    this.leaves.forEach((l) => this._deform(l));
  }

  _pageTexture(page, side, aspect, pageNo, portraits) {
    const c = document.createElement('canvas');
    c.width = TEX_W;
    c.height = Math.round(TEX_W / aspect);
    drawPage(c.getContext('2d'), c.width, c.height, page, side, pageNo, portraits);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.anisotropy;
    return tex;
  }

  // ---------------------------------------------------------------- 변형

  _zFor(leaf) {
    const n = this.leaves.length;
    const zRight = (n - 1 - leaf.index) * LEAF_GAP; // 오른쪽 더미: 앞 장일수록 위
    const zLeft = leaf.index * LEAF_GAP;            // 왼쪽 더미: 나중에 넘긴 장일수록 위
    return THREE.MathUtils.lerp(zRight, zLeft, leaf.angle / Math.PI);
  }

  /**
   * 책등 기준 회전각 angle(0=오른쪽, π=왼쪽)에 따라 정점 위치를 계산.
   * 책등에서 멀어질수록 회전각이 조금씩 더해져 종이가 휘는 모양이 된다.
   * angle이 0 또는 π일 땐 sin=0이라 평평해진다.
   */
  _deform(leaf) {
    const pos = leaf.geo.attributes.position;
    const n = SEGMENTS;
    const du = leaf.w / n;
    const a = leaf.angle;
    const bend = leaf.stiff ? 0 : CURL * leaf.curlDir * Math.sin(a);
    const z0 = this._zFor(leaf);

    const xs = new Float32Array(n + 1);
    const zs = new Float32Array(n + 1);
    for (let j = 1; j <= n; j++) {
      const phi = a + bend * ((j - 0.5) / n);
      xs[j] = xs[j - 1] + Math.cos(phi) * du;
      zs[j] = zs[j - 1] + Math.sin(phi) * du;
    }
    for (let k = 0; k < pos.count; k++) {
      const j = k % (n + 1);
      pos.setX(k, xs[j]);
      pos.setZ(k, zs[j] + z0);
    }
    pos.needsUpdate = true;
    leaf.geo.computeVertexNormals();
    leaf.geo.computeBoundingSphere();
    leaf.dirty = false;
  }

  // ---------------------------------------------------------------- 상태

  _flippedCount() {
    return this.leaves.reduce((s, l) => s + (l.target > Math.PI / 2 ? 1 : 0), 0);
  }

  /** 닫힌 상태에선 표지가 화면 중앙에, 펼친 상태에선 책등이 중앙에 오도록 */
  _centerOffset() {
    const f = this._flippedCount();
    if (f === 0) return -this.W / 2;
    if (f === this.leaves.length) return this.W / 2;
    return 0;
  }

  _topRight() { return this.leaves.find((l) => l.target === 0 && l !== this._drag?.leaf) ?? null; }
  _topLeft() {
    for (let i = this.leaves.length - 1; i >= 0; i--) {
      const l = this.leaves[i];
      if (l.target === Math.PI && l !== this._drag?.leaf) return l;
    }
    return null;
  }

  /** 버튼 등에서 호출할 수 있는 프로그램 방식 넘기기 */
  next() { const l = this._topRight(); if (l) { l.target = Math.PI; l.curlDir = 1; } }
  prev() { const l = this._topLeft(); if (l) { l.target = 0; l.curlDir = -1; } }

  // ---------------------------------------------------------------- 입력

  /** 포인터 위치를 책 평면(inner 로컬 좌표)으로 투영 */
  _localPoint(e, camera, rect) {
    this._ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this._ray.setFromCamera(this._ndc, camera);
    this._inv.copy(this.inner.matrixWorld).invert();
    const ray = this._ray.ray.clone().applyMatrix4(this._inv);
    return ray.intersectPlane(this._plane, this._hit);
  }

  get isDragging() { return this._drag !== null; }

  pointerDown(e, camera, rect) {
    if (this._drag) return false;
    const p = this._localPoint(e, camera, rect);
    if (!p) return false;
    const margin = 0.08;
    if (Math.abs(p.y) > this.H / 2 + margin || Math.abs(p.x) > this.W + margin) return false;

    const forward = p.x >= 0;
    const leaf = forward ? this._topRight() : this._topLeft();
    if (!leaf) return false;

    this._drag = {
      id: e.pointerId, leaf, forward,
      x0: THREE.MathUtils.clamp(p.x, -this.W, this.W),
      sx: e.clientX, sy: e.clientY, t0: performance.now(),
      lastAngle: leaf.angle, lastT: performance.now(), vel: 0,
    };
    leaf.curlDir = forward ? 1 : -1;
    return true;
  }

  pointerMove(e, camera, rect) {
    const d = this._drag;
    if (!d || d.id !== e.pointerId) return;
    const p = this._localPoint(e, camera, rect);
    if (!p) return;
    const x = THREE.MathUtils.clamp(p.x, -this.W, this.W);
    const W = this.W;
    // 잡은 지점에서 반대편 끝까지 끌면 정확히 다 넘어가도록 선형 매핑
    const prog = d.forward
      ? (d.x0 - x) / Math.max(d.x0 + W, 1e-3)
      : (x - d.x0) / Math.max(W - d.x0, 1e-3);
    const t = THREE.MathUtils.clamp(prog, 0, 1);
    const angle = d.forward ? t * Math.PI : (1 - t) * Math.PI;

    const now = performance.now();
    const dt = Math.max(now - d.lastT, 1);
    d.vel = d.vel * 0.5 + ((angle - d.lastAngle) / dt) * 0.5;
    d.lastAngle = angle; d.lastT = now;

    d.leaf.angle = angle;
    d.leaf.dirty = true;
  }

  pointerUp(e) {
    const d = this._drag;
    if (!d || d.id !== e.pointerId) return;
    this._drag = null;
    const leaf = d.leaf;
    const now = performance.now();
    const moved = Math.hypot(e.clientX - d.sx, e.clientY - d.sy);

    if (moved < 6 && now - d.t0 < 350) {
      // 짧은 탭/클릭은 한 장 넘기기
      leaf.target = d.forward ? Math.PI : 0;
    } else {
      const vel = now - d.lastT > 80 ? 0 : d.vel;
      const projected = leaf.angle + vel * 180; // 빠르게 튕기면 절반을 못 넘겨도 넘어가도록
      leaf.target = projected > Math.PI / 2 ? Math.PI : 0;
    }
    leaf.curlDir = leaf.target > leaf.angle ? 1 : -1;
  }

  // ---------------------------------------------------------------- 프레임

  update(dtMs) {
    const k = 1 - Math.exp(-dtMs * 0.009);
    for (const leaf of this.leaves) {
      if (this._drag?.leaf !== leaf && leaf.angle !== leaf.target) {
        const diff = leaf.target - leaf.angle;
        leaf.angle = Math.abs(diff) < 1e-3 ? leaf.target : leaf.angle + diff * k;
        leaf.dirty = true;
      }
      if (leaf.dirty) this._deform(leaf);
    }
    const target = this._centerOffset();
    this.inner.position.x += (target - this.inner.position.x) * (1 - Math.exp(-dtMs * 0.006));
  }
}

// ==================================================================== 페이지 그리기

const FONT = '"Noto Serif KR", serif';

function drawPage(g, w, h, page, side, pageNo, portraits) {
  if (page.type === 'cover' || page.type === 'backcover') {
    drawCover(g, w, h, page);
    return;
  }

  g.fillStyle = page.type === 'endpaper' ? '#d9cbb0' : PAPER;
  g.fillRect(0, 0, w, h);

  // 책등 쪽 그림자: 오른쪽 페이지는 왼쪽 가장자리, 왼쪽 페이지는 오른쪽 가장자리
  const sw = w * 0.09;
  const grad = side === 'right'
    ? g.createLinearGradient(0, 0, sw, 0)
    : g.createLinearGradient(w, 0, w - sw, 0);
  grad.addColorStop(0, 'rgba(60,40,20,0.28)');
  grad.addColorStop(1, 'rgba(60,40,20,0)');
  g.fillStyle = grad;
  if (side === 'right') g.fillRect(0, 0, sw, h);
  else g.fillRect(w - sw, 0, sw, h);

  if (page.type === 'endpaper' || page.type === 'blank') return;

  const pad = w * 0.11;
  const inner = side === 'right' ? pad * 1.15 : pad; // 책등 쪽 여백을 조금 더
  const left = side === 'right' ? inner : pad;
  const right = w - (side === 'right' ? pad : inner);
  g.fillStyle = INK;
  g.textBaseline = 'alphabetic';

  if (page.type === 'title') {
    g.textAlign = 'center';
    g.font = `700 ${Math.round(w * 0.09)}px ${FONT}`;
    g.fillText(page.title, w / 2, h * 0.42);
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(w * 0.35, h * 0.47); g.lineTo(w * 0.65, h * 0.47); g.stroke();
  } else if (page.type === 'people') {
    const slotH = (h - pad * 2) / 2;
    page.items.forEach((person, i) => {
      drawEntry(g, person, left, pad + slotH * i, right - left, slotH, portraits);
    });
  }

  if (pageNo != null) {
    g.font = `400 ${Math.round(w * 0.028)}px ${FONT}`;
    g.textAlign = side === 'right' ? 'right' : 'left';
    g.fillStyle = 'rgba(43,36,27,0.6)';
    g.fillText(String(pageNo), side === 'right' ? right : left, h - pad * 0.55);
  }
}

function drawEntry(g, person, x, y, w, h, portraits) {
  const ps = Math.min(w * 0.32, h * 0.5); // 초상화 크기
  const img = person.portrait ? portraits.get(person.portrait) : null;
  if (img) {
    // 비율 유지한 채 정사각형에 꽉 채우기
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, x, y, ps, ps);
  } else {
    g.fillStyle = '#e2d6bd';
    g.fillRect(x, y, ps, ps);
    g.fillStyle = 'rgba(43,36,27,0.35)';
    g.font = `700 ${Math.round(ps * 0.4)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText((person.name || '?').trim().charAt(0), x + ps / 2, y + ps / 2);
    g.textBaseline = 'alphabetic';
  }
  g.strokeStyle = 'rgba(43,36,27,0.5)';
  g.lineWidth = 2;
  g.strokeRect(x, y, ps, ps);

  const tx = x + ps + w * 0.06;
  const tw = x + w - tx;
  g.textAlign = 'left';
  g.fillStyle = INK;
  const nameSize = Math.round(w * 0.065);
  g.font = `700 ${nameSize}px ${FONT}`;
  fillWrapped(g, person.name || '', tx, y + nameSize, tw, nameSize * 1.25, 2);

  const subSize = Math.round(w * 0.038);
  g.font = `400 ${subSize}px ${FONT}`;
  g.fillStyle = 'rgba(43,36,27,0.7)';
  fillWrapped(g, person.title || '', tx, y + nameSize * 1.4 + subSize * 1.2, tw, subSize * 1.4, 2);

  const bodySize = Math.round(w * 0.04);
  g.font = `400 ${bodySize}px ${FONT}`;
  g.fillStyle = INK;
  const maxLines = Math.max(1, Math.floor((h - ps - bodySize * 2.5) / (bodySize * 1.6)));
  fillWrapped(g, person.description || '', x, y + ps + bodySize * 1.8, w, bodySize * 1.6, maxLines);
}

/** 글자 단위 줄바꿈 (한글은 띄어쓰기 없이도 줄이 넘어가야 하므로). 넘치면 말줄임. */
function fillWrapped(g, text, x, y, maxW, lineH, maxLines) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const ch of para) {
      if (line && g.measureText(line + ch).width > maxW) {
        lines.push(line);
        line = ch.trimStart();
      } else {
        line += ch;
      }
    }
    lines.push(line);
  }
  const out = lines.slice(0, maxLines);
  if (lines.length > maxLines && out.length) {
    let last = out[out.length - 1];
    while (last && g.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    out[out.length - 1] = last + '…';
  }
  out.forEach((l, i) => g.fillText(l, x, y + i * lineH));
}

function drawCover(g, w, h, page) {
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#4a2a22');
  grad.addColorStop(1, '#2c1813');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  const m = w * 0.06;
  g.strokeStyle = '#c9a964';
  g.lineWidth = 6;
  g.strokeRect(m, m, w - m * 2, h - m * 2);
  g.lineWidth = 2;
  g.strokeRect(m * 1.4, m * 1.4, w - m * 2.8, h - m * 2.8);

  if (page.type === 'cover') {
    g.fillStyle = '#d9bc78';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${Math.round(w * 0.1)}px ${FONT}`;
    g.fillText(page.title, w / 2, h * 0.4);
  }
}

async function loadPortraits(people) {
  const map = new Map();
  const urls = [...new Set(people.map((p) => p.portrait).filter(Boolean))];
  await Promise.all(urls.map((url) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { map.set(url, img); resolve(); };
    img.onerror = () => { console.warn('[Book] 초상화 로드 실패:', url); resolve(); };
    img.src = url;
  })));
  return map;
}
