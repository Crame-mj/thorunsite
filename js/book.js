import * as THREE from 'three';

// ---------------------------------------------------------------- 설정값
const SEG = 32;              // 페이지 곡면 가로 분할 수
const LIFT = 0.0015;         // 표시 페이지를 표지 면 위로 살짝 띄우는 값 (z-fighting 방지)
const GUTTER_U = 0.22;       // 책등에서 종이가 솟아오르는 구간 (페이지 폭 대비 비율)
const CURL = 0.5;            // 넘길 때 종이가 휘는 정도
const COVER_T = 0.03;        // 표지 보드 두께
const EDGE_PERIOD = 0.03;    // 종이 단면 줄무늬 텍스처 한 주기의 실제 두께
const TEX_W = 1024;          // 페이지 텍스처 가로 해상도
const TEX_CACHE = 10;        // 메모리에 유지할 페이지 텍스처 수
const PAPER = '#f3ecdc';
const INK = '#2b241b';
const CLOTH = '#3b2119';

/**
 * 두께 있는 책.
 *
 * 구성
 *  - 앞표지(경첩 회전) / 뒤표지 / 책등 : 고정 형태의 박스
 *  - 좌우 종이 더미(side) : 단면이 책등 쪽으로 휘어 내려가는 덩어리. 두께는 고정(펼치면 좌우 절반씩).
 *  - 좌우 표시 페이지 : 종이 더미의 윗면. 현재 펼친 위치(spread)에 맞춰 텍스처만 교체한다.
 *  - 넘김 페이지(leaf) : 한 장만 존재. 넘기는 동안에만 보이며 앞/뒷면 텍스처를 그때그때 지정한다.
 *
 * 페이지 번호 규칙
 *  pages[0..2S-1] 내용 페이지. spread k(0..S)에서
 *  왼쪽 = pages[2k-1] (k=0이면 면지), 오른쪽 = pages[2k] (k=S이면 면지)
 *  짝수 인덱스는 항상 오른쪽 페이지, 홀수는 항상 왼쪽 페이지다.
 */
export class Book {
  static async create(opts) {
    const portraits = await loadPortraits(opts.people ?? []);
    return new Book(opts, portraits);
  }

  constructor({ renderer, pageWidth = 1.3, pageHeight = 1.8, people = [], title = '인명록', perPage = 2 }, portraits = new Map()) {
    this.W = pageWidth;
    this.H = pageHeight;
    this.Wc = pageWidth + 0.06;   // 표지는 종이보다 약간 크게
    this.Hc = pageHeight + 0.1;
    this.anisotropy = renderer.capabilities.getMaxAnisotropy();
    this.portraits = portraits;
    this.title = title;

    const pages = [{ type: 'title', title }];
    for (let i = 0; i < people.length; i += perPage) {
      pages.push({ type: 'people', items: people.slice(i, i + perPage) });
    }
    if (pages.length % 2) pages.push({ type: 'blank' });
    this.pages = pages;
    this.S = pages.length / 2;                                     // 넘길 수 있는 장 수
    this.T = 0.22;                                                 // 종이 전체 두께(시각용, 장 수와 무관)

    // 상태
    this.k = 0;               // 현재 spread
    this.coverOpen = false;
    this.coverP = 0;          // 앞표지 열림 정도 0~1
    this.flip = null;         // { kind: 'page'|'cover', forward, p, target, dragging, dir }
    this.tL = 0;              // 좌우 종이 더미 두께 (_updateSides에서 계산)
    this.tR = this.T;
    this._lastG = -1;
    this._texCache = new Map();

    // 씬 그래프
    this.object = new THREE.Group();     // 화면 슬라이드용 (main.js가 제어)
    const tilt = new THREE.Group();
    tilt.rotation.x = -0.7;              // 비스듬히 내려다보는 각도 → 아래쪽 단면(두께)이 보이게
    this.object.add(tilt);
    this.inner = new THREE.Group();      // 닫힘/펼침에 따른 중앙 정렬용
    tilt.add(this.inner);

    this._buildMaterials();
    this._buildCovers();
    this.right = this._buildSide(false);
    this.left = this._buildSide(true);
    this._buildLeaf();

    this._updateSides(true);
    this._updateCovers();
    this._refreshTextures();
    this.inner.position.x = this._centerTarget();

    // 입력용
    this._drag = null;
    this._ray = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this._inv = new THREE.Matrix4();
    this._hit = new THREE.Vector3();
    this._ndc = new THREE.Vector2();
  }

  // ================================================================ 구성

  _buildMaterials() {
    this.clothMat = new THREE.MeshStandardMaterial({ color: CLOTH, roughness: 0.75 });
    this.endpaperMat = new THREE.MeshStandardMaterial({
      map: this._canvasTex(this.Wc / this.Hc, (g, w, h) => drawEndpaper(g, w, h)),
      roughness: 0.9,
    });
    this.coverArtMat = new THREE.MeshStandardMaterial({
      map: this._canvasTex(this.Wc / this.Hc, (g, w, h) => drawCover(g, w, h, this.title)),
      roughness: 0.7,
    });
    const edgeTex = createEdgeTexture();
    edgeTex.anisotropy = this.anisotropy;
    // 단면은 조명 반대쪽을 향하는 경우가 많아 너무 어두워지지 않도록 약하게 자체 발광
    this.edgeMat = new THREE.MeshStandardMaterial({
      map: edgeTex, emissiveMap: edgeTex, emissive: 0x777777, roughness: 1, side: THREE.DoubleSide,
    });
  }

  _buildCovers() {
    const { Wc, Hc } = this;
    const c = this.clothMat;

    // 앞표지: 경첩(hinge) 그룹을 y축 회전. 로컬 z∈[0,ct], +z면 = 표지 그림, -z면 = 면지
    const frontGeo = new THREE.BoxGeometry(Wc, Hc, COVER_T);
    frontGeo.translate(Wc / 2, 0, COVER_T / 2);
    this.hinge = new THREE.Group();
    this.hinge.add(new THREE.Mesh(frontGeo, [c, c, c, c, this.coverArtMat, this.endpaperMat]));
    this.inner.add(this.hinge);

    // 뒤표지: 오른쪽에 고정. 윗면(+z) = 면지
    const backGeo = new THREE.BoxGeometry(Wc, Hc, COVER_T);
    backGeo.translate(Wc / 2, 0, -COVER_T / 2);
    this.inner.add(new THREE.Mesh(backGeo, [c, c, c, c, this.endpaperMat, c]));

    // 책등: 닫혔을 때 왼쪽 옆면. 높이는 매 프레임 scale.z로 조절
    const spineGeo = new THREE.BoxGeometry(COVER_T, Hc, 1);
    spineGeo.translate(-COVER_T / 2, 0, 0.5);
    this.spine = new THREE.Mesh(spineGeo, c);
    this.spine.position.z = -COVER_T;
    this.inner.add(this.spine);
  }

  /** 종이 더미 한쪽. mirror=true면 x를 뒤집어 왼쪽에 놓는다. */
  _buildSide(mirror) {
    const group = new THREE.Group();
    if (mirror) group.scale.x = -1;
    this.inner.add(group);

    const pageGeo = new THREE.PlaneGeometry(this.W, this.H, SEG, 1);
    const pageMat = new THREE.MeshStandardMaterial({ roughness: 0.92 });
    const page = new THREE.Mesh(pageGeo, pageMat);

    // 단면: 위/아래 벽(각 SEG개 사각형) + 바깥쪽 벽 + 책등쪽 벽, 사각형당 정점 6개
    const vcount = (SEG * 2 + 2) * 6;
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vcount * 3), 3));
    edgeGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vcount * 3), 3));
    edgeGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(vcount * 2), 2));
    const edge = new THREE.Mesh(edgeGeo, this.edgeMat);

    group.add(page, edge);
    return {
      group, page, pageGeo, pageMat, edge, edgeGeo,
      prof: { x: new Float32Array(SEG + 1), z: new Float32Array(SEG + 1), a: new Float32Array(SEG) },
    };
  }

  _buildLeaf() {
    const geo = new THREE.PlaneGeometry(this.W, this.H, SEG, 1);
    // 넘김 페이지가 아래 표시 페이지와 겹칠 때 항상 위에 그려지도록
    const common = { roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 };
    this.leafFrontMat = new THREE.MeshStandardMaterial({ ...common, side: THREE.FrontSide });
    this.leafBackMat = new THREE.MeshStandardMaterial({ ...common, side: THREE.BackSide });
    this.leafGeo = geo;
    this.leaf = new THREE.Group();
    this.leaf.add(new THREE.Mesh(geo, this.leafFrontMat), new THREE.Mesh(geo, this.leafBackMat));
    this.leaf.visible = false;
    this.inner.add(this.leaf);
  }

  // ================================================================ 형상 계산

  /**
   * 종이 윗면 단면. 두께 T, 책등 휨 정도 g(0=평평, 1=책등에서 바닥까지 내려감).
   * 각 구간의 길이를 W/SEG로 고정해서 계산하므로, 넘김 페이지가 같은 각도 배열을 쓰면 정확히 겹친다.
   */
  _profile(T, g, out) {
    const n = SEG, du = this.W / n;
    const r = (u) => (u >= GUTTER_U ? 1 : 1 - g * (1 - Math.sin((u / GUTTER_U) * Math.PI / 2)));
    out.x[0] = 0;
    out.z[0] = LIFT + T * r(0);
    for (let j = 1; j <= n; j++) {
      const dz = THREE.MathUtils.clamp(T * (r(j / n) - r((j - 1) / n)), -du * 0.95, du * 0.95);
      const a = Math.asin(dz / du);
      out.a[j - 1] = a;
      out.x[j] = out.x[j - 1] + Math.cos(a) * du;
      out.z[j] = out.z[j - 1] + dz;
    }
  }

  _updateSide(side, T, g) {
    const prof = side.prof;
    this._profile(T, g, prof);
    const n = SEG;

    // 윗면 = 표시 페이지
    const pp = side.pageGeo.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const j = i % (n + 1);
      pp.setX(i, prof.x[j]);
      pp.setZ(i, prof.z[j]);
    }
    pp.needsUpdate = true;
    side.pageGeo.computeVertexNormals();
    side.pageGeo.computeBoundingSphere();

    // 단면 벽. v는 각 x 위치의 높이로 정규화 → 줄무늬가 종이 곡선을 따라간다.
    const P = side.edgeGeo.attributes.position.array;
    const UV = side.edgeGeo.attributes.uv.array;
    const K = Math.max(T / EDGE_PERIOD, 0.01);
    const h = this.H / 2;
    let pi = 0, ui = 0;
    const v = (x, y, z, u, vv) => { P[pi++] = x; P[pi++] = y; P[pi++] = z; UV[ui++] = u; UV[ui++] = vv; };
    const quad = (a, b, c, d) => { v(...a); v(...b); v(...c); v(...a); v(...c); v(...d); };

    for (const y of [h, -h]) {
      for (let j = 0; j < n; j++) {
        const x0 = prof.x[j], x1 = prof.x[j + 1];
        quad([x0, y, 0, x0, 0], [x1, y, 0, x1, 0], [x1, y, prof.z[j + 1], x1, K], [x0, y, prof.z[j], x0, K]);
      }
    }
    const xe = prof.x[n], ze = prof.z[n];
    quad([xe, -h, 0, 0, 0], [xe, h, 0, 1, 0], [xe, h, ze, 1, K], [xe, -h, ze, 0, K]);
    const zs = prof.z[0];
    quad([0, -h, 0, 0, 0], [0, h, 0, 1, 0], [0, h, zs, 1, K * zs / ze], [0, -h, zs, 0, K * zs / ze]);

    side.edgeGeo.attributes.position.needsUpdate = true;
    side.edgeGeo.attributes.uv.needsUpdate = true;
    side.edgeGeo.computeVertexNormals();
    side.edgeGeo.computeBoundingSphere();
    side.edge.visible = T > 1e-4;
  }

  /**
   * 종이 더미 두께는 넘긴 장 수와 무관하게 고정한다.
   * 닫힘: 오른쪽에 전부 / 펼침: 좌우 절반씩. 그 사이는 앞표지 열림 정도로 보간.
   */
  _updateSides(force = false) {
    const g = easeInOut(this.coverP); // 표지가 열릴수록 책등 쪽이 휘어 내려간다
    if (!force && g === this._lastG) return;
    this._lastG = g;
    this.tL = this.T * 0.5 * g;
    this.tR = this.T - this.tL;
    this._updateSide(this.right, this.tR, g);
    this._updateSide(this.left, this.tL, g);
    this.left.page.visible = this.tL > 1e-4;
  }

  _updateCovers() {
    const p = this.coverP;
    // 닫힘: 경첩이 오른쪽 종이 더미 위. 열림: 바닥까지 내려와 왼쪽에 평평하게.
    const hz = (this.tR + LIFT + 0.001) * (1 - easeInOut(p));
    this.hinge.position.z = hz;
    this.hinge.rotation.y = -p * Math.PI;
    const top = hz + COVER_T * (1 - p) - 0.002;
    this.spine.scale.z = Math.max(top + COVER_T, 1e-4);
  }

  /** 넘김 페이지 변형: 오른쪽 단면 각도 → 왼쪽(거울) 단면 각도로 보간 + 진행 중엔 휘어짐 추가 */
  _updateLeaf() {
    const f = this.flip;
    if (!f || f.kind !== 'page') return;
    const n = SEG, du = this.W / n;
    const p = f.p;
    const aR = this.right.prof.a, aL = this.left.prof.a;
    const bend = CURL * f.dir * Math.sin(p * Math.PI);
    const xs = this._lx ??= new Float32Array(n + 1);
    const zs = this._lz ??= new Float32Array(n + 1);
    xs[0] = 0;
    zs[0] = THREE.MathUtils.lerp(this.right.prof.z[0], this.left.prof.z[0], p);
    for (let j = 0; j < n; j++) {
      const phi = (1 - p) * aR[j] + p * (Math.PI - aL[j]) + bend * ((j + 0.5) / n);
      xs[j + 1] = xs[j] + Math.cos(phi) * du;
      zs[j + 1] = zs[j] + Math.sin(phi) * du;
    }
    const pos = this.leafGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const j = i % (n + 1);
      pos.setX(i, xs[j]);
      pos.setZ(i, zs[j]);
    }
    pos.needsUpdate = true;
    this.leafGeo.computeVertexNormals();
    this.leafGeo.computeBoundingSphere();
  }

  // ================================================================ 텍스처

  _canvasTex(aspect, draw) {
    const c = document.createElement('canvas');
    c.width = TEX_W;
    c.height = Math.round(TEX_W / aspect);
    draw(c.getContext('2d'), c.width, c.height);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.anisotropy;
    return tex;
  }

  /** key: 페이지 인덱스(number), 'endL'/'end'(앞/뒤 면지). 필요할 때 그리고 LRU로 보관. */
  _pageTex(key) {
    const cache = this._texCache;
    if (cache.has(key)) {
      const t = cache.get(key);
      cache.delete(key); cache.set(key, t); // 최근 사용으로 갱신
      return t;
    }
    const isEnd = typeof key !== 'number';
    const isLeft = isEnd ? key === 'endL' : key % 2 === 1;
    const page = isEnd ? { type: 'endpaper' } : this.pages[key];
    const tex = this._canvasTex(this.W / this.H, (g, w, h) =>
      drawPage(g, w, h, page, isLeft ? 'left' : 'right', isEnd ? null : key + 1, this.portraits));
    if (isLeft) {
      // 왼쪽 페이지는 거울 배치(또는 뒷면)로 보이므로 UV를 뒤집어 바르게 보이게 한다.
      tex.repeat.x = -1;
      tex.offset.x = 1;
    }
    cache.set(key, tex);
    return tex;
  }

  _trimCache(inUse) {
    for (const [key, tex] of this._texCache) {
      if (this._texCache.size <= TEX_CACHE) break;
      if (inUse.has(key)) continue;
      tex.dispose();
      this._texCache.delete(key);
    }
  }

  /** 현재 spread와 넘김 상태에 맞춰 표시 페이지 / 넘김 페이지 텍스처를 지정 */
  _refreshTextures() {
    const f = this.flip?.kind === 'page' ? this.flip : null;
    const k = this.k, S = this.S;
    const Ls = f && !f.forward ? k - 1 : k;   // 왼쪽에 보일 spread
    const Rs = f && f.forward ? k + 1 : k;    // 오른쪽에 보일 spread (넘김 페이지 아래에서 드러나는 쪽)
    const used = new Set();

    // spread 0의 왼쪽 / 마지막 spread의 오른쪽은 면지
    const lKey = Ls > 0 ? 2 * Ls - 1 : 'endL';
    this.left.pageMat.map = this._pageTex(lKey); used.add(lKey);
    const rKey = Rs < S ? 2 * Rs : 'end';
    this.right.pageMat.map = this._pageTex(rKey); used.add(rKey);

    this.leaf.visible = !!f;
    if (f) {
      const s = f.forward ? k : k - 1;
      this.leafFrontMat.map = this._pageTex(2 * s); used.add(2 * s);
      this.leafBackMat.map = this._pageTex(2 * s + 1); used.add(2 * s + 1);
    }
    for (const m of [this.left.pageMat, this.right.pageMat, this.leafFrontMat, this.leafBackMat]) {
      if (m.map && !m.userData.hasMap) { m.needsUpdate = true; m.userData.hasMap = true; }
    }
    this._trimCache(used);
  }

  // ================================================================ 넘김 상태

  /** forward: 오른쪽→왼쪽. 가능한 넘김 종류를 판정 */
  _flipKind(forward) {
    if (forward) {
      if (!this.coverOpen) return 'cover';
      return this.k < this.S ? 'page' : null;
    }
    if (!this.coverOpen) return null;
    return this.k > 0 ? 'page' : 'cover';
  }

  _startFlip(forward, dragging) {
    if (this.flip) this._finishFlip(true);
    const kind = this._flipKind(forward);
    if (!kind) return null;
    this.flip = {
      kind, forward, dragging,
      p: forward ? 0 : 1,
      target: forward ? 0 : 1,  // 기본값은 '제자리' (드래그 놓을 때 결정)
      dir: forward ? 1 : -1,
    };
    this._refreshTextures();
    return this.flip;
  }

  /** 애니메이션이 끝났을 때(또는 강제로 끝낼 때) 결과를 확정 */
  _finishFlip(snap = false) {
    const f = this.flip;
    if (!f) return;
    if (snap) f.p = f.target;
    if (f.kind === 'page') {
      if (f.forward && f.p === 1) this.k++;
      else if (!f.forward && f.p === 0) this.k--;
    } else {
      this.coverOpen = f.p === 1;
      this.coverP = f.p;
    }
    this.flip = null;
    this._refreshTextures();
  }

  next() { const f = this._startFlip(true, false); if (f) f.target = 1; }
  prev() { const f = this._startFlip(false, false); if (f) f.target = 0; }

  _centerTarget() {
    const f = this.flip;
    const open = f?.kind === 'cover' && !f.dragging ? f.target === 1 : this.coverOpen;
    return open ? 0 : -this.Wc / 2; // 닫혀 있으면 표지를, 펼치면 책등을 화면 중앙에
  }

  // ================================================================ 입력

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
    const pt = this._localPoint(e, camera, rect);
    if (!pt) return false;
    const m = 0.08;
    if (Math.abs(pt.y) > this.Hc / 2 + m || Math.abs(pt.x) > this.Wc + m) return false;

    const forward = pt.x >= 0;
    const f = this._startFlip(forward, true);
    if (!f) return false;
    const w = f.kind === 'cover' ? this.Wc : this.W;
    const now = performance.now();
    this._drag = {
      id: e.pointerId, w,
      x0: THREE.MathUtils.clamp(pt.x, -w, w),
      sx: e.clientX, sy: e.clientY, t0: now,
      lastP: f.p, lastT: now, vel: 0,
    };
    return true;
  }

  pointerMove(e, camera, rect) {
    const d = this._drag, f = this.flip;
    if (!d || d.id !== e.pointerId || !f) return;
    const pt = this._localPoint(e, camera, rect);
    if (!pt) return;
    const w = d.w;
    const x = THREE.MathUtils.clamp(pt.x, -w, w);
    // 잡은 지점에서 반대쪽 끝까지 끌면 정확히 다 넘어가도록 선형 매핑
    const prog = f.forward ? (d.x0 - x) / Math.max(d.x0 + w, 1e-3) : (x - d.x0) / Math.max(w - d.x0, 1e-3);
    const t = THREE.MathUtils.clamp(prog, 0, 1);
    f.p = f.forward ? t : 1 - t;

    const now = performance.now();
    d.vel = d.vel * 0.5 + ((f.p - d.lastP) / Math.max(now - d.lastT, 1)) * 0.5;
    d.lastP = f.p; d.lastT = now;
  }

  pointerUp(e) {
    const d = this._drag, f = this.flip;
    if (!d || d.id !== e.pointerId) return;
    this._drag = null;
    if (!f) return;
    const now = performance.now();
    const moved = Math.hypot(e.clientX - d.sx, e.clientY - d.sy);
    if (moved < 6 && now - d.t0 < 350) {
      f.target = f.forward ? 1 : 0; // 짧은 탭/클릭 = 한 장 넘기기
    } else {
      const vel = now - d.lastT > 80 ? 0 : d.vel;
      f.target = f.p + vel * 180 > 0.5 ? 1 : 0; // 빠르게 튕기면 절반을 못 넘겨도 넘어감
    }
    f.dir = f.target > f.p ? 1 : -1;
    f.dragging = false;
  }

  // ================================================================ 프레임

  update(dtMs) {
    const f = this.flip;
    if (f && !f.dragging) {
      const diff = f.target - f.p;
      if (Math.abs(diff) < 1e-3) { f.p = f.target; this._finishFlip(); }
      else f.p += diff * (1 - Math.exp(-dtMs * 0.009));
    }

    if (this.flip?.kind === 'cover') this.coverP = this.flip.p;

    this._updateSides();
    this._updateCovers();
    this._updateLeaf();

    this.inner.position.x += (this._centerTarget() - this.inner.position.x) * (1 - Math.exp(-dtMs * 0.006));
  }
}

function easeInOut(x) { return x * x * (3 - 2 * x); }

// ==================================================================== 텍스처 그리기

const FONT = '"Noto Serif KR", serif';

function createEdgeTexture() {
  const w = 16, h = 64;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#e6d5b0';
  g.fillRect(0, 0, w, h);
  let seed = 3;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < h; y += 4) {
    g.fillStyle = `rgba(120, 90, 50, ${0.12 + rand() * 0.18})`;
    g.fillRect(0, y, w, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function drawEndpaper(g, w, h) {
  g.fillStyle = '#cdb994';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(90, 60, 30, 0.12)';
  g.lineWidth = 2;
  const s = w / 16;
  for (let x = -h; x < w + h; x += s) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke();
    g.beginPath(); g.moveTo(x, h); g.lineTo(x + h, 0); g.stroke();
  }
}

function drawCover(g, w, h, title) {
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#4a2a22');
  grad.addColorStop(1, '#2c1813');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const m = w * 0.07;
  g.strokeStyle = '#c9a964';
  g.lineWidth = 6;
  g.strokeRect(m, m, w - m * 2, h - m * 2);
  g.lineWidth = 2;
  g.strokeRect(m * 1.4, m * 1.4, w - m * 2.8, h - m * 2.8);
  g.fillStyle = '#d9bc78';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${Math.round(w * 0.1)}px ${FONT}`;
  g.fillText(title, w / 2, h * 0.4);
}

function drawPage(g, w, h, page, side, pageNo, portraits) {
  g.fillStyle = page.type === 'endpaper' ? '#cdb994' : PAPER;
  g.fillRect(0, 0, w, h);
  if (page.type === 'endpaper') return;

  // 책등 쪽 그림자: 오른쪽 페이지는 왼쪽 가장자리, 왼쪽 페이지는 오른쪽 가장자리
  const sw = w * 0.12;
  const grad = side === 'right' ? g.createLinearGradient(0, 0, sw, 0) : g.createLinearGradient(w, 0, w - sw, 0);
  grad.addColorStop(0, 'rgba(60,40,20,0.32)');
  grad.addColorStop(1, 'rgba(60,40,20,0)');
  g.fillStyle = grad;
  if (side === 'right') g.fillRect(0, 0, sw, h); else g.fillRect(w - sw, 0, sw, h);
  // 바깥쪽 가장자리의 약한 바램
  const eg = side === 'right' ? g.createLinearGradient(w, 0, w - w * 0.05, 0) : g.createLinearGradient(0, 0, w * 0.05, 0);
  eg.addColorStop(0, 'rgba(150,110,60,0.18)');
  eg.addColorStop(1, 'rgba(150,110,60,0)');
  g.fillStyle = eg;
  if (side === 'right') g.fillRect(w - w * 0.05, 0, w * 0.05, h); else g.fillRect(0, 0, w * 0.05, h);

  if (page.type === 'blank') return;

  const pad = w * 0.11;
  const gutter = pad * 1.25; // 책등 쪽은 종이가 휘어 들어가므로 여백을 더
  const left = side === 'right' ? gutter : pad;
  const right = w - (side === 'right' ? pad : gutter);
  g.fillStyle = INK;
  g.textBaseline = 'alphabetic';

  if (page.type === 'title') {
    g.textAlign = 'center';
    g.font = `700 ${Math.round(w * 0.09)}px ${FONT}`;
    const cx = (left + right) / 2;
    g.fillText(page.title, cx, h * 0.42);
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx - w * 0.15, h * 0.47); g.lineTo(cx + w * 0.15, h * 0.47); g.stroke();
  } else if (page.type === 'people') {
    const slotH = (h - pad * 2) / 2;
    page.items.forEach((person, i) => drawEntry(g, person, left, pad + slotH * i, right - left, slotH, portraits));
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
