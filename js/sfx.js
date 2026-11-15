// 개념서 효과음.
//  - 표지: 책이 완전히 열리거나 완전히 닫히는 순간 bookdrop을 한 번 재생
//  - 페이지: paperturn의 재생 위치를 '페이지가 넘어간 정도'에 묶어서 재생한다.
//      드래그를 멈추면 소리도 멈추고, 다시 끌면 이어서 재생. 빨리 넘기면 빨리, 천천히 넘기면 천천히.
//      손을 놓아 페이지가 넘어가면 남은 소리를 마저, 제자리로 돌아가면 그 자리에서 끊는다.
const SRC = {
  drop: 'assets/audio/bookdrop.mp3',
  page: 'assets/audio/paperturn.mp3',
};
const VOLUME = { drop: 0.3, page: 0.3 };  // 고정 볼륨 (0~1)

const RATE_MIN = 0.4;     // 페이지 소리 재생 속도 범위 (1 = 원래 속도)
const RATE_MAX = 2.4;
const CATCH_UP = 0.07;    // 소리가 넘김 진행을 따라잡는 데 걸리는 시간(초). 작을수록 즉각적
const IDLE_PAUSE = 90;    // 진행이 이만큼(ms) 멈춰 있으면 소리도 멈춤
const FADE = 0.02;        // 끊거나 다시 시작할 때 '틱' 소리가 나지 않도록 하는 페이드(초)
const PAGE_END = 0.95;    // 넘김 진행 100%가 효과음의 몇 % 지점에 해당하는지 (끝의 잔향은 손을 놓은 뒤 자연히)

export function createBookSfx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return { update() {} };
  const ctx = new AC();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const buffers = {};
  for (const [k, url] of Object.entries(SRC)) {
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => new Promise((ok, fail) => ctx.decodeAudioData(b, ok, fail)))
      .then((buf) => { buffers[k] = buf; })
      .catch((err) => console.warn('[SFX] 로드 실패:', url, err));
  }

  // 브라우저는 사용자 조작 전에는 소리를 막으므로 첫 조작에서 깨운다
  const wake = () => { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); };
  for (const ev of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(ev, wake, { capture: true });

  function playOnce(kind) {
    const buf = buffers[kind];
    if (!buf || ctx.state !== 'running') return;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    g.gain.value = VOLUME[kind];
    src.buffer = buf;
    src.connect(g).connect(master);
    src.start();
  }

  // ---------------------------------------------------------------- 페이지 넘김 '스크럽' 재생
  /** 한 번의 넘김마다 하나씩 생기는 목소리 */
  class Voice {
    constructor(buf) {
      this.buf = buf;
      this.pos = 0;        // 지금까지 재생된 위치(초) 추정값
      this.rate = 1;
      this.src = null;
      this.gain = null;
      this.idle = 0;
      this.clock = ctx.currentTime; // 위치 추정은 오디오 시계 기준 (화면 프레임이 느려도 어긋나지 않게)
    }
    get playing() { return this.src !== null; }
    start() {
      const t = ctx.currentTime;
      this.gain = ctx.createGain();
      this.gain.gain.setValueAtTime(0, t);
      this.gain.gain.linearRampToValueAtTime(VOLUME.page, t + FADE);
      this.src = ctx.createBufferSource();
      this.src.buffer = this.buf;
      this.src.playbackRate.value = this.rate;
      this.src.connect(this.gain).connect(master);
      this.src.start(t, Math.min(this.pos, this.buf.duration - 0.01));
      const me = this.src;
      // 끝까지 재생되어 멈춘 경우: 위치를 끝으로 (다시 시작하지 않도록)
      me.onended = () => { if (this.src === me) { this.src = null; this.gain = null; this.pos = this.buf.duration; } };
    }
    stop() {
      if (!this.src) return;
      const t = ctx.currentTime;
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.setValueAtTime(this.gain.gain.value, t);
      this.gain.gain.linearRampToValueAtTime(0, t + FADE);
      this.src.stop(t + FADE + 0.005);
      this.src = null;
      this.gain = null;
    }
    setRate(r) {
      this.rate = r;
      if (this.src) this.src.playbackRate.setTargetAtTime(r, ctx.currentTime, 0.015);
    }
    /** 남은 부분을 원래 속도로 끝까지 재생 (손을 놓아 페이지가 넘어간 경우) */
    finish() {
      this.setRate(1);
      if (!this.src && this.pos < this.buf.duration - 0.02) this.start();
    }
    /** desired: 넘김 진행에 해당하는 재생 위치(초) */
    /** committed: 손을 놓아 넘어가기로 확정된 상태 → 멈추지 않고 자연스럽게 끝까지 */
    follow(desired, committed = false) {
      const now = ctx.currentTime;
      const dt = now - this.clock;
      this.clock = now;
      if (this.src) this.pos = Math.min(this.buf.duration, this.pos + this.rate * dt);
      const ahead = desired - this.pos;
      if (ahead < -0.04 && !committed) {
        // 페이지를 도로 되돌리는 중: 소리 없이 위치만 따라간다
        this.stop();
        this.pos = Math.max(0, desired);
        this.idle = 0;
        return;
      }
      if (ahead > 0.003) {
        this.idle = 0;
        this.setRate(Math.min(RATE_MAX, Math.max(committed ? 1 : RATE_MIN, ahead / CATCH_UP)));
        if (!this.src) this.start();
      } else if (committed) {
        this.setRate(1);
        if (!this.src && this.pos < this.buf.duration - 0.02) this.start();
      } else {
        // 따라잡았다: 잠깐은 느리게 이어가고, 계속 멈춰 있으면 소리도 멈춘다
        this.idle += dt * 1000;
        this.setRate(RATE_MIN);
        if (this.idle > IDLE_PAUSE) this.stop();
      }
    }
  }

  let current = null;   // { flip, voice, canceled }
  let lastCoverOpen = null;

  /** 매 프레임 호출. book: Book 인스턴스 */
  function update(book) {
    // 표지: 완전히 열림/닫힘이 바뀐 순간에만
    if (lastCoverOpen !== null && book.coverOpen !== lastCoverOpen) playOnce('drop');
    lastCoverOpen = book.coverOpen;

    const f = book.flip && book.flip.kind === 'page' ? book.flip : null;
    if (current && current.flip !== f) {
      // 넘김이 끝났다: 넘어갔으면 남은 소리를 마저, 아니면 이미 끊긴 상태
      if (!current.canceled) current.voice.finish();
      else current.voice.stop();
      current = null;
    }
    if (!f || !buffers.page || ctx.state !== 'running') return;
    if (!current) current = { flip: f, voice: new Voice(buffers.page), canceled: false };

    // 손을 놓았는데 제자리로 돌아가는 중이면 그 자리에서 끊는다
    const rest = f.forward ? 0 : 1;
    const canceled = !f.dragging && !f.auto && f.target === rest;
    if (canceled) {
      if (!current.canceled) current.voice.stop();
      current.canceled = true;
      return;
    }
    current.canceled = false;
    const q = f.forward ? f.p : 1 - f.p; // 넘어간 정도 0~1
    const committed = !f.dragging; // 손을 놓았고(또는 자동 넘김) 제자리로 돌아가는 중이 아니면 넘어가는 중
    current.voice.follow(q * PAGE_END * buffers.page.duration, committed);
  }

  return { update };
}
