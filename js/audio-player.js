// 배경음악 플레이어.
// 곡 목록 순서 = 기본 재생 순서. 마지막 곡이 끝나면 처음 곡으로 돌아간다.
export const TRACKS = [
  { title: 'Thorun', theme: 'Main Theme', src: 'assets/audio/main-theme.mp3' },
  { title: 'The Beginning of the Adventure', theme: 'Laniel Theme', src: 'assets/audio/laniel-theme.mp3' },
  { title: 'Radiant Darkness', theme: 'Saintra Theme', src: 'assets/audio/saintra-theme.mp3' },
  { title: 'Currents in the lake', theme: 'Bernights Theme', src: 'assets/audio/bernights-theme.mp3' },
  { title: 'A Spark of Hope', theme: 'Eremos Theme', src: 'assets/audio/eremos-theme.mp3' },
  { title: 'Twisted Court Melody', theme: 'Goguk Theme', src: 'assets/audio/goguk-theme.mp3' },
];

const VOLUME_KEY = 'thorun.volume';
const DEFAULT_VOLUME = 0.5;

/**
 * root 안의 버튼/슬라이더를 연결한다. 마크업은 index.html의 #audio-player.
 * 상태: 'stopped'(처음 위치) / 'playing' / 'paused'(그 위치 유지)
 */
export function setupAudioPlayer(root, tracks = TRACKS) {
  const audio = new Audio();
  audio.preload = 'none'; // 재생을 누르기 전에는 내려받지 않는다
  const btnPlay = root.querySelector('[data-action="play"]');
  const btnPause = root.querySelector('[data-action="pause"]');
  const btnStop = root.querySelector('[data-action="stop"]');
  const btnTrack = root.querySelector('.ap-track');
  const trackName = root.querySelector('.ap-track-name');
  const list = root.querySelector('.ap-list');
  const volume = root.querySelector('.ap-volume');

  let index = 0;
  let status = 'stopped';

  // ---------------------------------------------------------------- 볼륨
  // iOS Safari는 audio.volume을 무시하므로 Web Audio의 GainNode로 볼륨을 조절한다 (첫 재생 때 생성).
  let ctx = null;
  let gain = null;
  let vol = DEFAULT_VOLUME;
  try {
    const saved = parseFloat(localStorage.getItem(VOLUME_KEY));
    if (Number.isFinite(saved)) vol = Math.min(1, Math.max(0, saved));
  } catch { /* 저장소를 쓸 수 없는 환경이면 기본값 */ }
  volume.value = String(vol);

  function applyVolume() {
    if (gain) gain.gain.value = vol;
    else audio.volume = vol;
    volume.style.setProperty('--fill', `${vol * 100}%`);
  }
  applyVolume();

  function ensureAudioGraph() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      gain = ctx.createGain();
      ctx.createMediaElementSource(audio).connect(gain).connect(ctx.destination);
      audio.volume = 1;
      applyVolume();
    } catch {
      ctx = null; gain = null; // 실패하면 audio.volume으로 계속
    }
  }

  volume.addEventListener('input', () => {
    vol = parseFloat(volume.value);
    applyVolume();
    try { localStorage.setItem(VOLUME_KEY, String(vol)); } catch { /* 무시 */ }
  });

  // ---------------------------------------------------------------- 재생 제어

  function load(i) {
    index = (i + tracks.length) % tracks.length;
    audio.src = tracks[index].src;
    trackName.textContent = tracks[index].title;
    btnTrack.title = `${tracks[index].theme} · ${tracks[index].title}`;
    for (const li of list.children) {
      const cur = Number(li.dataset.index) === index;
      li.classList.toggle('current', cur);
      li.setAttribute('aria-selected', String(cur));
    }
  }

  function setStatus(s) {
    status = s;
    root.dataset.status = s;
    btnPlay.setAttribute('aria-pressed', String(s === 'playing'));
    btnPause.setAttribute('aria-pressed', String(s === 'paused'));
  }

  function play() {
    autoStart.disarm(); // 사용자가 직접 재생을 다루면 자동 시작은 더 이상 하지 않는다
    return startPlayback();
  }

  /** 실제 재생. 브라우저가 자동재생을 막으면 false로 끝나는 Promise를 돌려준다. */
  function startPlayback() {
    ensureAudioGraph();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (!audio.src) load(index);
    const before = status;
    setStatus('playing');
    return Promise.resolve(audio.play()).then(() => true, (err) => {
      if (err.name === 'AbortError') return true; // 곧바로 일시정지 등으로 중단된 경우
      if (err.name === 'NotAllowedError') { setStatus(before); return false; }
      console.warn('[Audio] 재생 실패:', err);
      setStatus('paused');
      return false;
    });
  }

  // 페이지에 들어온 뒤 첫 조작(클릭·터치·키 입력)에서 자동으로 재생을 시작한다.
  // 브라우저는 사용자 조작 없이 소리를 내는 것을 막기 때문에 이 방식이 가장 이르다.
  // 첫 조작이 플레이어 자체(정지·곡 목록 등)라면 그 조작을 존중하고 자동 시작은 하지 않는다.
  const autoStart = (() => {
    const events = ['pointerdown', 'pointerup', 'click', 'keydown', 'touchend'];
    let armed = true;
    let trying = false;
    const onInteract = (e) => {
      if (!armed || trying) return;
      if (root.contains(e.target)) { disarm(); return; }
      trying = true;
      startPlayback().then((ok) => {
        trying = false;
        if (ok) disarm(); // 막혔으면(일부 브라우저는 pointerdown을 조작으로 안 침) 다음 조작에서 다시 시도
      });
    };
    function disarm() {
      if (!armed) return;
      armed = false;
      for (const ev of events) document.removeEventListener(ev, onInteract, true);
    }
    for (const ev of events) document.addEventListener(ev, onInteract, true);
    return { disarm };
  })();

  function pause() {
    autoStart.disarm();
    if (status !== 'playing') return;
    audio.pause();
    setStatus('paused');
  }

  function stop() {
    autoStart.disarm();
    audio.pause();
    if (audio.src) audio.currentTime = 0; // 다시 재생하면 지금 곡의 처음부터
    setStatus('stopped');
  }

  /** 목록에서 고른 곡은 이전 상태와 상관없이 처음부터 재생 */
  function playTrack(i) {
    load(i);
    play();
  }

  audio.addEventListener('ended', () => playTrack(index + 1));

  btnPlay.addEventListener('click', () => { if (status !== 'playing') play(); });
  btnPause.addEventListener('click', pause);
  btnStop.addEventListener('click', stop);

  // ---------------------------------------------------------------- 곡 목록

  tracks.forEach((t, i) => {
    const li = document.createElement('li');
    li.dataset.index = String(i);
    li.setAttribute('role', 'option');
    li.tabIndex = -1;
    const title = document.createElement('span');
    title.className = 'ap-list-title';
    title.textContent = t.title;
    const theme = document.createElement('span');
    theme.className = 'ap-list-theme';
    theme.textContent = t.theme;
    li.append(title, theme);
    li.addEventListener('click', () => { playTrack(i); closeList(); });
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playTrack(i); closeList(); btnTrack.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); (li.nextElementSibling ?? list.firstElementChild).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (li.previousElementSibling ?? list.lastElementChild).focus(); }
    });
    list.append(li);
  });

  function openList() {
    list.hidden = false;
    btnTrack.setAttribute('aria-expanded', 'true');
    list.children[index]?.focus({ preventScroll: true });
  }
  function closeList() {
    list.hidden = true;
    btnTrack.setAttribute('aria-expanded', 'false');
  }
  btnTrack.addEventListener('click', () => (list.hidden ? openList() : closeList()));
  document.addEventListener('pointerdown', (e) => { if (!list.hidden && !root.contains(e.target)) closeList(); });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !list.hidden) { e.stopPropagation(); closeList(); btnTrack.focus(); }
  });

  load(0);
  setStatus('stopped');
  return { play, pause, stop, playTrack };
}
