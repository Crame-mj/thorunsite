import * as THREE from 'three';

// ---------------------------------------------------------------- 설정값
const SEG = 40;              // 페이지 곡면 가로 분할 수
const LIFT = 0.0015;         // 표시 페이지를 종이 더미 윗면 위로 살짝 띄우는 값 (z-fighting 방지)
const GUTTER_U = 0.2;        // 책등에서 종이가 솟아오르는 구간 (페이지 폭 대비 비율)
const FORE_SLOPE = 0.12;     // 바깥쪽 종이 더미 경사면의 가로 폭 (펼쳤을 때 좌우 더미로 보이는 부분)
const PAGE_LAG = 0.42;       // 넘길 때 책등 쪽이 바깥쪽보다 늦게 따라오는 정도 (클수록 많이 휨)
const COVER_T = 0.03;        // 표지 보드 두께
const EDGE_PERIOD = 0.03;    // 종이 단면 줄무늬 텍스처 한 주기의 실제 두께
const TEX_W = 1024;          // 페이지 텍스처 가로 해상도
const TEX_CACHE = 10;        // 메모리에 유지할 페이지 텍스처 수
const PAPER = '#f3ecdc';
const INK = '#2b241b';
const CLOTH = '#3b2119';

/**
 * 가운데를 펼친 두꺼운 책.
 *
 * 구성
 *  - 뒤쪽 반쪽(back half) : 뒤표지 + 오른쪽 종이 더미. 고정.
 *  - 앞쪽 반쪽(front half): 앞표지 + 왼쪽 종이 더미. 책등 축으로 통째로 회전해서 책을 열고 닫는다.
 *  - 종이 더미 단면 : 책등 쪽은 펼칠수록 휘어 내려가고, 바깥쪽은 비스듬히 깎여 있다.
 *                     닫으면 바깥쪽에 V자 홈이 생기고, 펼치면 경사면이 좌우 종이 더미로 보인다.
 *  - 책등 : 두 표지의 안쪽 끝을 잇는 곡면. 닫히면 C자로 감싸고 펼치면 접혀서 사라진다.
 *  - 좌우 표시 페이지 : 종이 더미의 윗면. 펼친 위치(spread)에 맞춰 텍스처만 교체한다.
 *  - 넘김 페이지(leaf) : 한 장만 존재. 넘기는 동안에만 보이며 앞/뒷면 텍스처를 그때그때 지정한다.
 *
 * 페이지 번호 규칙
 *  pages[0..2S-1] 내용 페이지. spread k(0..S)에서
 *  왼쪽 = pages[2k-1] (k=0이면 빈 페이지), 오른쪽 = pages[2k] (k=S이면 빈 페이지)
 *  짝수 인덱스는 항상 오른쪽 페이지, 홀수는 항상 왼쪽 페이지다.
 */
export class Book {
  /**
   * opts.textures: { cover, paper } 이미지 경로 (선택).
   *  - cover: 표지·책등 가죽 질감. 표지 비율(약 5:7)에 맞춰 가운데 기준으로 채운다.
   *  - paper: 내용 페이지 배경. 페이지 비율(약 2:3)에 맞춰 가운데 기준으로 채운다.
   *  - edge : 종이 더미 단면(옆·아래). 가로 = 단면 길이 방향, 세로 = 두께(위쪽이 페이지 면, 아래쪽이 표지 쪽).
   */
  static async create(opts) {
    const t = opts.textures ?? {};
    const [portraits, cover, paper, edge] = await Promise.all([
      loadPortraits(opts.people ?? []),
      t.cover ? loadImage(t.cover) : null,
      t.paper ? loadImage(t.paper) : null,
      t.edge ? loadImage(t.edge) : null,
    ]);
    return new Book(opts, portraits, { cover, paper, edge });
  }

  constructor({ renderer, pageWidth = 1.3, pageHeight = 1.8, people = [], title = '개념서', coverTitle = title, perPage = 2 }, portraits = new Map(), images = {}) {
    this.W = pageWidth;                    // 종이 더미 전체 폭 (경사면 포함)
    this.Wp = pageWidth - FORE_SLOPE;      // 윗면(내용이 보이는 페이지) 폭
    this.H = pageHeight;
    this.Wc = pageWidth + 0.05;            // 표지는 종이보다 약간 크게
    this.Hc = pageHeight + 0.1;
    this.h = 0.11;                         // 반쪽 종이 더미 두께 (고정)
    this.anisotropy = renderer.capabilities.getMaxAnisotropy();
    this.portraits = portraits;
    this.images = images;
    this.title = title;
    this.coverTitle = coverTitle; // 표지에 금박으로 찍히는 글자 (첫 장 제목과 별도)

    const pages = [{ type: 'title', title }];
    for (let i = 0; i < people.length; i += perPage) {
      pages.push({ type: 'people', items: people.slice(i, i + perPage) });
    }
    if (pages.length % 2) pages.push({ type: 'blank' });
    this.pages = pages;
    this.S = pages.length / 2; // 넘길 수 있는 장 수

    // 상태
    this.k = 0;               // 현재 spread
    this.coverOpen = false;
    this.coverP = 0;          // 앞쪽 반쪽 열림 정도 0(닫힘)~1(펼침)
    this.flip = null;         // { kind: 'page'|'cover', forward, p, target, dragging }
    this._lastCoverP = -1;
    this._texCache = new Map();

    // 씬 그래프
    this.object = new THREE.Group();     // 화면 슬라이드용 (main.js가 제어)
    const tilt = new THREE.Group();
    tilt.rotation.x = -0.7;              // 비스듬히 내려다보는 각도 → 단면(두께)이 보이게
    this.object.add(tilt);
    this.inner = new THREE.Group();      // 닫힘/펼침에 따른 중앙 정렬용
    tilt.add(this.inner);

    this._buildMaterials();
    this._buildHalves();
    this._buildSpine();
    this._buildLeaf();

    this._applyCover(true);
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
    let leather = null;
    if (this.images.cover) {
      // 표지 안쪽 면·옆면·책등·뒤표지 바깥면에 쓰는 가죽 질감
      leather = new THREE.Texture(this.images.cover);
      leather.colorSpace = THREE.SRGBColorSpace;
      leather.anisotropy = this.anisotropy;
      leather.needsUpdate = true;
    }
    this.clothMat = new THREE.MeshStandardMaterial({
      color: leather ? 0xffffff : CLOTH, map: leather, roughness: 0.75, side: THREE.DoubleSide,
    });
    // 앞표지는 거울 배치 후 뒤집혀서 보이므로 UV를 좌우 반전
    const coverTex = this._canvasTex(this.Wc / this.Hc, (g, w, h) => drawCover(g, w, h, this.coverTitle, this.images.cover));
    coverTex.repeat.x = -1;
    coverTex.offset.x = 1;
    this.coverArtMat = new THREE.MeshStandardMaterial({ map: coverTex, roughness: 0.7 });
    let edgeTex;
    if (this.images.edge) {
      // 이미지 한 장이 단면 전체를 덮는다 (두께 방향은 반복 없음)
      edgeTex = new THREE.Texture(this.images.edge);
      edgeTex.colorSpace = THREE.SRGBColorSpace;
      edgeTex.wrapS = THREE.RepeatWrapping;
      edgeTex.needsUpdate = true;
      this.edgeK = 1;
    } else {
      edgeTex = createEdgeTexture();
      this.edgeK = this.h / EDGE_PERIOD; // 줄무늬 텍스처를 두께 방향으로 반복
    }
    edgeTex.anisotropy = this.anisotropy;
    // 단면은 조명 반대쪽을 향하는 경우가 많아 너무 어두워지지 않도록 약하게 자체 발광
    this.edgeMat = new THREE.MeshStandardMaterial({
      map: edgeTex, emissiveMap: edgeTex, emissive: 0x8c8478, roughness: 1, side: THREE.DoubleSide,
    });
  }

  /** 반쪽 책(표지 보드 + 종이 더미). 로컬: 책등 x=0, 바깥쪽 +x, 표지 z∈[-ct,0], 종이 z∈[0,h] */
  _makeHalf(isFront) {
    const group = new THREE.Group();
    const { Wc, Hc } = this;
    const c = this.clothMat;

    const boardGeo = new THREE.BoxGeometry(Wc, Hc, COVER_T);
    boardGeo.translate(Wc / 2, 0, -COVER_T / 2);
    // 면 순서: +x, -x, +y, -y, +z(안쪽), -z(바깥 표지)
    group.add(new THREE.Mesh(boardGeo, [c, c, c, c, c, isFront ? this.coverArtMat : c]));

    const pageGeo = new THREE.PlaneGeometry(this.Wp, this.H, SEG, 1);
    const pageMat = new THREE.MeshStandardMaterial({ roughness: 0.92 });
    const page = new THREE.Mesh(pageGeo, pageMat);

    // 단면: 위/아래 벽(각 SEG개 + 경사 1개) + 바깥 경사면 + 책등쪽 벽. 사각형당 정점 6개
    const vcount = (SEG * 2 + 4) * 6;
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

  _buildHalves() {
    this.right = this._makeHalf(false);
    this.inner.add(this.right.group);

    // 앞쪽 반쪽: 두 페이지 윗면이 책등에서 만나는 점을 축으로 회전. 내용물은 x 거울 배치.
    // 축 높이는 책등 쪽 휨에 따라 _applyCover에서 갱신한다.
    this.pivotZ = LIFT + this.h;
    this.frontPivot = new THREE.Group();
    this.left = this._makeHalf(true);
    this.left.group.scale.x = -1;
    this.frontPivot.add(this.left.group);
    this.inner.add(this.frontPivot);
  }

  _buildSpine() {
    const n = 16;
    const geo = new THREE.PlaneGeometry(1, this.Hc, n, 1);
    this.spineGeo = geo;
    this.spineN = n;
    this.spine = new THREE.Mesh(geo, this.clothMat);
    this.inner.add(this.spine);
    this._bz = [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];

    // 여닫는 도중 두 종이 더미의 책등 쪽 면 사이에 생기는 쐐기 모양 공간을
    // 위/아래 끝에서 막는 단면 (종이 단면 텍스처). 두 페이지 윗면은 축에서 항상 맞닿아 있다.
    this.capGeo = new THREE.BufferGeometry();
    this.capGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3 * 3), 3));
    this.capGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(2 * 3 * 3), 3));
    this.capGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(2 * 3 * 2), 2));
    this.caps = new THREE.Mesh(this.capGeo, this.edgeMat);
    this.inner.add(this.caps);
  }

  _buildLeaf() {
    const geo = new THREE.PlaneGeometry(this.Wp, this.H, SEG, 1);
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
   * 종이 윗면 단면 (책등 → 경사면 시작점). g: 책등 쪽 휨 정도(0=평평, 1=책등에서 바닥까지).
   * 각 구간 길이를 Wp/SEG로 고정해서 계산하므로, 넘김 페이지가 같은 각도 배열을 쓰면 정확히 겹친다.
   */
  _profile(g, out) {
    const n = SEG, du = this.Wp / n, h = this.h;
    const r = (u) => (u >= GUTTER_U ? 1 : 1 - g * (1 - Math.sin((u / GUTTER_U) * Math.PI / 2)));
    out.x[0] = 0;
    out.z[0] = LIFT + h * r(0);
    for (let j = 1; j <= n; j++) {
      const dz = THREE.MathUtils.clamp(h * (r(j / n) - r((j - 1) / n)), -du * 0.95, du * 0.95);
      const a = Math.asin(dz / du);
      out.a[j - 1] = a;
      out.x[j] = out.x[j - 1] + Math.cos(a) * du;
      out.z[j] = out.z[j - 1] + dz;
    }
  }

  _updateHalf(half, g) {
    const prof = half.prof;
    this._profile(g, prof);
    const n = SEG;

    // 윗면 = 표시 페이지
    const pp = half.pageGeo.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const j = i % (n + 1);
      pp.setX(i, prof.x[j]);
      pp.setZ(i, prof.z[j]);
    }
    pp.needsUpdate = true;
    half.pageGeo.computeVertexNormals();
    half.pageGeo.computeBoundingSphere();

    // 단면 벽. v는 각 x 위치의 윗면 높이로 정규화 → 줄무늬가 종이 곡선을 따라간다.
    const P = half.edgeGeo.attributes.position.array;
    const UV = half.edgeGeo.attributes.uv.array;
    const K = this.edgeK;
    const uW = 1 / this.W; // 위/아래 벽의 u: 단면 길이에 맞춰 0~1
    const hy = this.H / 2;
    const xt = prof.x[n], zt = prof.z[n];      // 경사면 위쪽 끝
    const xb = xt + FORE_SLOPE;                // 경사면 아래쪽 끝
    let pi = 0, ui = 0;
    const v = (x, y, z, u, vv) => { P[pi++] = x; P[pi++] = y; P[pi++] = z; UV[ui++] = u; UV[ui++] = vv; };
    const quad = (a, b, c, d) => { v(...a); v(...b); v(...c); v(...a); v(...c); v(...d); };

    for (const y of [hy, -hy]) {
      for (let j = 0; j < n; j++) {
        const x0 = prof.x[j], x1 = prof.x[j + 1];
        quad([x0, y, 0, x0 * uW, 0], [x1, y, 0, x1 * uW, 0], [x1, y, prof.z[j + 1], x1 * uW, K], [x0, y, prof.z[j], x0 * uW, K]);
      }
      // 경사 구간 (삼각형을 사각형 하나로)
      quad([xt, y, 0, xt * uW, 0], [xb, y, 0, xb * uW, 0], [xb, y, 0, xb * uW, 0], [xt, y, zt, xt * uW, K]);
    }
    // 바깥 경사면: 펼쳤을 때 좌우 종이 더미로 보이는 면
    quad([xb, -hy, 0, 0, 0], [xb, hy, 0, 1, 0], [xt, hy, zt, 1, K], [xt, -hy, zt, 0, K]);
    // 책등 쪽 벽
    const zs = prof.z[0];
    quad([0, -hy, 0, 0, 0], [0, hy, 0, 1, 0], [0, hy, zs, 1, K * zs / zt], [0, -hy, zs, 0, K * zs / zt]);

    half.edgeGeo.attributes.position.needsUpdate = true;
    half.edgeGeo.attributes.uv.needsUpdate = true;
    half.edgeGeo.computeVertexNormals();
    half.edgeGeo.computeBoundingSphere();
  }

  /** 앞쪽 반쪽 회전, 책등 곡면, 종이 휨을 coverP에 맞춰 갱신 */
  _applyCover(force = false) {
    const p = this.coverP;
    if (!force && p === this._lastCoverP) return;
    this._lastCoverP = p;

    const g = easeInOut(p); // 펼칠수록 책등 쪽이 휘어 내려간다
    this._updateHalf(this.right, g);
    this._updateHalf(this.left, g);

    // 축 = 두 페이지 윗면이 책등에서 만나는 점. 휨(g)에 따라 내려가므로 여닫는 내내 가운데가 붙어 있다.
    // (닫힘 g=0이면 종이 윗면 높이, 펼침 g=1이면 바닥 근처)
    this.pivotZ = this.right.prof.z[0];
    this.frontPivot.position.z = this.pivotZ;
    this.left.group.position.z = -this.pivotZ;

    // α=π: 닫힘(오른쪽 위에 포개짐), α=0: 펼침. π/2에서 위로 세워진 상태를 지난다.
    const alpha = Math.PI * (1 - p);
    this.frontPivot.rotation.y = alpha;
    this._updateSpine(alpha);
    this._updateGutter(alpha);
  }

  /** 여닫는 중 두 종이 더미의 책등 쪽 면 사이 쐐기 공간을 위/아래 끝에서 막는다. */
  _updateGutter(alpha) {
    const p = this.coverP;
    const show = p > 1e-3 && p < 1 - 1e-3;
    this.caps.visible = show;
    if (!show) return;
    // 꼭짓점: 축(두 페이지가 만나는 점), 왼쪽 더미의 책등 쪽 아래 모서리, 오른쪽 더미의 책등 쪽 아래 모서리
    const pZ = this.pivotZ;
    const lbx = -pZ * Math.sin(alpha), lbz = pZ - pZ * Math.cos(alpha);
    const P = this.capGeo.attributes.position.array, UV = this.capGeo.attributes.uv.array;
    let pi = 0, ui = 0;
    const vtx = (x, y, z, u, v) => { P[pi++] = x; P[pi++] = y; P[pi++] = z; UV[ui++] = u; UV[ui++] = v; };
    for (const y of [this.H / 2, -this.H / 2]) {
      vtx(0, y, pZ, 0.5, 1);
      vtx(lbx, y, lbz, 0.4, 0);
      vtx(0, y, 0, 0.6, 0);
    }
    this.capGeo.attributes.position.needsUpdate = true;
    this.capGeo.attributes.uv.needsUpdate = true;
    this.capGeo.computeVertexNormals();
    this.capGeo.computeBoundingSphere();
  }

  /** 두 표지의 책등 쪽 끝을 3차 베지어로 잇는다. 펼친 상태에선 길이가 0이 되어 사라진다. */
  _updateSpine(alpha) {
    const ct2 = COVER_T / 2;
    const [b0, b1, b2, b3] = this._bz;
    // 뒤표지 책등 끝, 바깥 방향 (-1, 0)
    b0.set(0, -ct2);
    // 앞표지 책등 끝: 내용물 좌표 (0, -ct/2 - pivotZ)를 α만큼 회전 + pivot
    const zr = -ct2 - this.pivotZ;
    b3.set(zr * Math.sin(alpha), this.pivotZ + zr * Math.cos(alpha));
    const dist = b0.distanceTo(b3);
    this.spine.visible = dist > 1e-3;
    if (!this.spine.visible) return;
    const k = dist * 0.55;
    b1.set(b0.x - k, b0.y);
    b2.set(b3.x + Math.cos(alpha) * k, b3.y - Math.sin(alpha) * k);

    const pos = this.spineGeo.attributes.position;
    const n = this.spineN;
    for (let i = 0; i < pos.count; i++) {
      const t = (i % (n + 1)) / n, s = 1 - t;
      const w0 = s * s * s, w1 = 3 * s * s * t, w2 = 3 * s * t * t, w3 = t * t * t;
      pos.setX(i, w0 * b0.x + w1 * b1.x + w2 * b2.x + w3 * b3.x);
      pos.setZ(i, w0 * b0.y + w1 * b1.y + w2 * b2.y + w3 * b3.y);
    }
    pos.needsUpdate = true;
    this.spineGeo.computeVertexNormals();
    this.spineGeo.computeBoundingSphere();
  }

  /**
   * 넘김 페이지 변형.
   * 페이지의 각 지점마다 진행도를 다르게 줘서(바깥쪽이 먼저, 책등 쪽이 나중에) 종이처럼 크게 휘게 한다.
   * 진행도 0/1에서는 각각 오른쪽/왼쪽 표시 페이지의 단면과 정확히 일치한다.
   */
  _updateLeaf() {
    const f = this.flip;
    if (!f || f.kind !== 'page') return;
    const n = SEG, du = this.Wp / n;
    const aR = this.right.prof.a, aL = this.left.prof.a;
    const q = f.forward ? f.p : 1 - f.p; // 들어올린 쪽 기준 진행도
    const xs = this._lx ??= new Float32Array(n + 1);
    const zs = this._lz ??= new Float32Array(n + 1);
    xs[0] = 0;
    zs[0] = THREE.MathUtils.lerp(this.right.prof.z[0], this.left.prof.z[0], f.p);
    for (let j = 0; j < n; j++) {
      const u = (j + 0.5) / n;
      const qu = easeInOut(THREE.MathUtils.clamp((q - PAGE_LAG * (1 - u)) / (1 - PAGE_LAG), 0, 1));
      const pu = f.forward ? qu : 1 - qu;
      const phi = (1 - pu) * aR[j] + pu * (Math.PI - aL[j]);
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

  /** key: 페이지 인덱스(number), 'blankL'/'blankR'(앞뒤 끝의 빈 페이지). 필요할 때 그리고 LRU로 보관. */
  _pageTex(key) {
    const cache = this._texCache;
    if (cache.has(key)) {
      const t = cache.get(key);
      cache.delete(key); cache.set(key, t); // 최근 사용으로 갱신
      return t;
    }
    const isBlank = typeof key !== 'number';
    const isLeft = isBlank ? key === 'blankL' : key % 2 === 1;
    const page = isBlank ? { type: 'blank' } : this.pages[key];
    const tex = this._canvasTex(this.Wp / this.H, (g, w, h) =>
      drawPage(g, w, h, page, isLeft ? 'left' : 'right', isBlank ? null : key + 1, this.portraits, this.images.paper));
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

    const lKey = Ls > 0 ? 2 * Ls - 1 : 'blankL';
    this.left.pageMat.map = this._pageTex(lKey); used.add(lKey);
    const rKey = Rs < S ? 2 * Rs : 'blankR';
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
      this._applyCover();
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
    const w = f.kind === 'cover' ? this.Wc : this.Wp;
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
    f.dragging = false;
  }

  // ================================================================ 프레임

  update(dtMs) {
    const f = this.flip;
    if (f && !f.dragging) {
      const diff = f.target - f.p;
      if (Math.abs(diff) < 1e-3) { f.p = f.target; this._finishFlip(); }
      else f.p += diff * (1 - Math.exp(-dtMs * 0.006));
    }
    if (this.flip?.kind === 'cover') this.coverP = this.flip.p;

    this._applyCover();
    this._updateLeaf();

    this.inner.position.x += (this._centerTarget() - this.inner.position.x) * (1 - Math.exp(-dtMs * 0.006));
  }
}

function easeInOut(x) { return x * x * (3 - 2 * x); }

// ==================================================================== 텍스처 그리기

const FONT = '"Noto Serif KR", serif';
const COVER_FONT = '"Lobster Two", "Noto Serif KR", serif'; // 표지 제목 전용

function createEdgeTexture() {
  const w = 16, h = 64;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#cbbb9c';
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


/** 이미지를 비율 유지한 채 (x,y,w,h) 영역을 꽉 채우도록 가운데 기준으로 잘라 그린다. */
function drawImageCover(g, img, x, y, w, h) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const s = Math.max(w / iw, h / ih);
  const sw = w / s, sh = h / s;
  g.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

function drawCover(g, w, h, title, leather) {
  if (leather) {
    drawImageCover(g, leather, 0, 0, w, h);
  } else {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#4a2a22');
    grad.addColorStop(1, '#2c1813');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }
  // 금박(테두리 + 제목)은 별도 레이어에 그린 뒤 가죽 결을 입혀서 표지에 눌러 찍은 것처럼 합성한다.
  const layer = document.createElement('canvas');
  layer.width = w; layer.height = h;
  const L = layer.getContext('2d');
  const gold = L.createLinearGradient(0, 0, w, h);
  gold.addColorStop(0, '#e2c47e');
  gold.addColorStop(0.5, '#c9a35a');
  gold.addColorStop(1, '#b8914c');
  L.strokeStyle = gold;
  L.fillStyle = gold;
  const m = w * 0.07;
  L.lineWidth = 6;
  L.strokeRect(m, m, w - m * 2, h - m * 2);
  L.lineWidth = 2;
  L.strokeRect(m * 1.4, m * 1.4, w - m * 2.8, h - m * 2.8);
  L.textAlign = 'center';
  L.textBaseline = 'middle';
  L.font = `700 ${Math.round(w * 0.3)}px ${COVER_FONT}`;
  L.fillText(title, w / 2, h * 0.4);

  if (leather) {
    // 금박 모양만 남겨 두고(mask), 그 위에 가죽 결을 곱하기로 얹은 뒤 다시 금박 모양으로 잘라낸다
    const mask = document.createElement('canvas');
    mask.width = w; mask.height = h;
    mask.getContext('2d').drawImage(layer, 0, 0);
    L.globalCompositeOperation = 'multiply';
    L.globalAlpha = 0.22;
    drawImageCover(L, leather, 0, 0, w, h);
    L.globalCompositeOperation = 'destination-in';
    L.globalAlpha = 1;
    L.drawImage(mask, 0, 0);
  }

  // 약간 반투명하게 + 아래쪽에 옅은 그림자를 줘서 가죽에 눌러 찍힌 느낌
  g.save();
  g.globalAlpha = 0.93;
  g.shadowColor = 'rgba(0, 0, 0, 0.45)';
  g.shadowOffsetX = 1.5;
  g.shadowOffsetY = 2;
  g.shadowBlur = 3;
  g.drawImage(layer, 0, 0);
  g.restore();
}

function drawPage(g, w, h, page, side, pageNo, portraits, paper) {
  if (paper) {
    drawImageCover(g, paper, 0, 0, w, h);
  } else {
    g.fillStyle = PAPER;
    g.fillRect(0, 0, w, h);
  }

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

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { console.warn('[Book] 이미지 로드 실패:', url); resolve(null); };
    img.src = url;
  });
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
