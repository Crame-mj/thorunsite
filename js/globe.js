import * as THREE from 'three';

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const FOCUS_MS = 1200;       // 핀을 정면으로 돌리는 시간

/** 위도/경도(도) → 구 로컬 좌표의 단위 벡터 (three.js SphereGeometry의 UV 배치 기준) */
export function latLonToVector(lat, lon, out = new THREE.Vector3()) {
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const theta = ((90 - lat) / 180) * Math.PI;
  return out.set(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
}

function easeInOutCubic(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

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
    // 지도 가운데(경도 0°)가 정면에 오도록 돌리고, 위쪽을 살짝 앞으로 기울인다.
    this.mesh.quaternion.setFromAxisAngle(AXIS_Y, -Math.PI / 2)
      .premultiply(new THREE.Quaternion().setFromAxisAngle(AXIS_X, 0.35));
    this.object.add(this.mesh);

    this._drag = null;          // { id, x, y, t }
    this._vel = { x: 0, y: 0 }; // rad/ms
    this._qa = new THREE.Quaternion();
    this._qb = new THREE.Quaternion();

    this.pins = [];             // { id, dir, group, head, hit }
    this.selectedId = null;
    this._focus = null;         // { from, to, t, onDone }
    this._time = 0;
    this._ray = new THREE.Raycaster();

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
  get isFocusing() { return this._focus !== null; }

  /** 대륙마다 핀을 꽂는다. items: [{ id, lat, lon }] */
  addPins(items) {
    const stickGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.07, 8);
    stickGeo.translate(0, 0.035, 0);
    const headGeo = new THREE.SphereGeometry(0.026, 20, 14);
    const hitGeo = new THREE.SphereGeometry(0.085, 10, 8); // 손가락으로도 누르기 쉽게 넉넉한 판정 범위
    const stickMat = new THREE.MeshStandardMaterial({ color: 0xd9c8a0, roughness: 0.5, metalness: 0.3 });
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });

    for (const item of items) {
      const dir = latLonToVector(item.lat, item.lon);
      const group = new THREE.Group();
      group.position.copy(dir).multiplyScalar(this.radius);
      group.quaternion.setFromUnitVectors(AXIS_Y, dir); // 핀이 지표면에서 바깥쪽으로 서도록
      const headMat = new THREE.MeshStandardMaterial({
        color: 0xe8c46a, emissive: 0x7a5410, emissiveIntensity: 0.6, roughness: 0.35, metalness: 0.4,
      });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = 0.07;
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.position.y = 0.05;
      hit.userData.pinId = item.id;
      group.add(new THREE.Mesh(stickGeo, stickMat), head, hit);
      this.mesh.add(group);
      this.pins.push({ id: item.id, dir, group, head, hit });
    }
  }

  /** 화면 좌표(ndc)에서 보이는 핀의 id를 찾는다. 지구 뒤쪽에 가려진 핀은 고르지 않는다. */
  pick(ndc, camera) {
    if (!this.pins.length) return null;
    this._ray.setFromCamera(ndc, camera);
    const hits = this._ray.intersectObjects([this.mesh, ...this.pins.map((p) => p.hit)], false);
    if (!hits.length) return null;
    // 지구 표면보다 앞에 있는 핀 판정만 인정 (지구 표면과 거의 같은 거리면 핀이 앞에 있는 것으로 본다)
    const globeHit = hits.find((h) => h.object === this.mesh);
    const pinHit = hits.find((h) => h.object.userData.pinId);
    if (!pinHit) return null;
    if (globeHit && globeHit.distance < pinHit.distance - 0.12) return null;
    return pinHit.object.userData.pinId;
  }

  select(id) { this.selectedId = id; }

  /** 해당 핀이 화면 정면(카메라 쪽)에, 북쪽이 위로 오도록 회전한다. */
  focusOn(id, onDone) {
    const pin = this.pins.find((p) => p.id === id);
    if (!pin) return;
    const p = pin.dir;
    const north = AXIS_Y.clone().addScaledVector(p, -AXIS_Y.dot(p));
    if (north.lengthSq() < 1e-6) {
      // 극점: 현재 화면 위쪽 방향을 그대로 유지
      north.copy(AXIS_Y).applyQuaternion(this.mesh.quaternion.clone().invert());
      north.addScaledVector(p, -north.dot(p));
    }
    north.normalize();
    const east = new THREE.Vector3().crossVectors(north, p).normalize();
    // 행 = east, north, p 인 회전행렬 → east→x, north→y, p→z(카메라 쪽)
    const m = new THREE.Matrix4().set(
      east.x, east.y, east.z, 0,
      north.x, north.y, north.z, 0,
      p.x, p.y, p.z, 0,
      0, 0, 0, 1,
    );
    const to = new THREE.Quaternion().setFromRotationMatrix(m);
    this._vel.x = this._vel.y = 0;
    this._drag = null;
    this._focus = { from: this.mesh.quaternion.clone(), to, t: 0, onDone };
    this.selectedId = id;
  }

  pointerDown(e) {
    if (this._drag || this._focus) return false;
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
    this._time += dtMs;
    // 핀 머리가 은은하게 숨 쉬듯 커졌다 작아지고, 선택된 핀은 더 크고 밝게
    for (const pin of this.pins) {
      const sel = pin.id === this.selectedId;
      const s = (sel ? 1.35 : 1) * (1 + 0.12 * Math.sin(this._time * 0.004 + pin.dir.x * 5));
      pin.head.scale.setScalar(s);
      pin.head.material.emissiveIntensity = sel ? 1.2 : 0.6;
    }

    const f = this._focus;
    if (f) {
      f.t = Math.min(f.t + dtMs / FOCUS_MS, 1);
      this.mesh.quaternion.slerpQuaternions(f.from, f.to, easeInOutCubic(f.t));
      if (f.t >= 1) {
        this._focus = null;
        f.onDone?.();
      }
      return;
    }

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
