import * as THREE from 'three';

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);

/**
 * 드래그로 회전시키는 구체.
 * object(Group)는 화면 위치(슬라이드)용, mesh는 회전용으로 분리되어 있다.
 */
export class Globe {
  constructor({ radius = 1, textureUrl = null } = {}) {
    this.radius = radius;
    this.object = new THREE.Group();

    this.material = new THREE.MeshStandardMaterial({
      map: createPlaceholderTexture(),
      roughness: 0.85,
      metalness: 0,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), this.material);
    // 처음 보이는 각도를 약간 기울여 입체감을 준다.
    this.mesh.quaternion.setFromAxisAngle(AXIS_X, 0.35);
    this.object.add(this.mesh);

    this._drag = null;          // { id, x, y, t }
    this._vel = { x: 0, y: 0 }; // rad/ms
    this._qa = new THREE.Quaternion();
    this._qb = new THREE.Quaternion();

    if (textureUrl) this.setTexture(textureUrl);
  }

  /** 등장방형(equirectangular, 2:1) 이미지 경로를 넣으면 텍스처를 교체한다. */
  setTexture(url, renderer) {
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        if (renderer) tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        const old = this.material.map;
        this.material.map = tex;
        this.material.needsUpdate = true;
        if (old) old.dispose();
      },
      undefined,
      (err) => console.error('[Globe] 텍스처 로드 실패:', url, err),
    );
  }

  get isDragging() { return this._drag !== null; }

  pointerDown(e) {
    if (this._drag) return false;
    this._drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    this._vel.x = this._vel.y = 0;
    return true;
  }

  pointerMove(e, viewportHeight) {
    const d = this._drag;
    if (!d || d.id !== e.pointerId) return;
    const now = performance.now();
    const dt = Math.max(now - d.t, 1);
    // 화면 높이 기준으로 감도를 정해 기기 해상도와 무관하게 비슷한 느낌이 나도록
    const k = 3.2 / Math.max(viewportHeight, 1);
    const ax = (e.clientX - d.x) * k;
    const ay = (e.clientY - d.y) * k;
    this._rotate(ax, ay);
    // 관성용 속도 (지수 평활)
    this._vel.x = this._vel.x * 0.5 + (ax / dt) * 0.5;
    this._vel.y = this._vel.y * 0.5 + (ay / dt) * 0.5;
    d.x = e.clientX; d.y = e.clientY; d.t = now;
  }

  pointerUp(e) {
    const d = this._drag;
    if (!d || d.id !== e.pointerId) return;
    // 손을 멈춘 뒤 놓았으면 관성 없음
    if (performance.now() - d.t > 80) this._vel.x = this._vel.y = 0;
    this._drag = null;
  }

  update(dtMs) {
    if (this._drag) return;
    const v = this._vel;
    if (Math.abs(v.x) < 1e-6 && Math.abs(v.y) < 1e-6) return;
    this._rotate(v.x * dtMs, v.y * dtMs);
    const decay = Math.exp(-dtMs * 0.004);
    v.x *= decay; v.y *= decay;
  }

  /** 화면(카메라) 기준 축으로 회전시켜서 드래그 방향과 회전 방향이 항상 일치하게 한다. */
  _rotate(ax, ay) {
    this._qa.setFromAxisAngle(AXIS_Y, ax);
    this._qb.setFromAxisAngle(AXIS_X, ay);
    this.mesh.quaternion.premultiply(this._qa).premultiply(this._qb).normalize();
  }
}

/** 텍스처가 준비되기 전까지 회전이 눈에 보이도록 하는 임시 텍스처 (위경도 격자 + 임의 대륙). */
function createPlaceholderTexture() {
  const w = 2048, h = 1024;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');

  const ocean = g.createLinearGradient(0, 0, 0, h);
  ocean.addColorStop(0, '#1c3550');
  ocean.addColorStop(0.5, '#24507a');
  ocean.addColorStop(1, '#1c3550');
  g.fillStyle = ocean;
  g.fillRect(0, 0, w, h);

  // 시드 고정 난수 → 새로고침해도 같은 모양
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  g.fillStyle = '#6b7f4e';
  for (let i = 0; i < 9; i++) {
    const cx = rand() * w, cy = h * (0.2 + rand() * 0.6);
    const r = 60 + rand() * 140;
    for (let j = 0; j < 14; j++) {
      const bx = cx + (rand() - 0.5) * r * 2.2;
      const by = cy + (rand() - 0.5) * r * 1.2;
      const br = r * (0.3 + rand() * 0.5);
      // 경도 이음새(0/360°)를 넘는 부분도 이어지도록 좌우로 한 번 더 그린다
      for (const off of [-w, 0, w]) {
        g.beginPath();
        g.ellipse(bx + off, by, br, br * 0.7, rand() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  g.strokeStyle = 'rgba(255,255,255,0.22)';
  g.lineWidth = 2;
  for (let lon = 0; lon <= 360; lon += 15) {
    const x = (lon / 360) * w;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const y = ((90 - lat) / 180) * h;
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
  }
  g.strokeStyle = 'rgba(255,220,150,0.6)';
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
