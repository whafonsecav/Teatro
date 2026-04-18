/* ═══════════════════════════════════════════════════════════
   SOUNDVISION AI — app.js v5
   Arte & Estética · Politécnico Gran Colombiano
   ─────────────────────────────────────────────────────────
   Fixes v5:
     • Auto-detecta imágenes/audios desde /api/media (server.js)
     • Play desde móvil desbloquea audio aunque no haya gesto en desktop
     • Modo standalone en móvil (sin PIN / sin desktop)
     • Reproductor usa SIEMPRE el mismo diseño (sin ar-landscape)
     • Audio context desbloqueado en primer gesto de usuario desktop
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ── Constantes ─────────────────────────────────────────── */
const PROCESSING_STEPS = [
  'Detectando paleta cromática',
  'Analizando textura y composición',
  'Generando melodía base',
  'Componiendo capas armónicas',
  'Renderizando audio instrumental',
];
const PROCESSING_TOTAL_MS = 5000;

/* ── Estado global ──────────────────────────────────────── */
let appState     = 'idle';
let currentTrack = null;
let trackHistory = [];
let isPlaying    = false;
let isMobile     = false;
let mobileMode   = 'remote'; // 'remote' | 'standalone'

/* ── PeerJS ─────────────────────────────────────────────── */
let peer        = null;
let remoteConn  = null;
let desktopConn = null;
let currentPin  = '';

/* ── Audio & animación ──────────────────────────────────── */
const audioEl  = document.getElementById('audio-el');
let waveAnimId = null;
let wavePhase  = 0;
let procTimer  = null;

/* ── Catálogo de tracks (cargado desde API o config) ─────── */
let TRACKS = [];

/* ── Helpers DOM ────────────────────────────────────────── */
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

/* ═══════════════════════════════════════════════════════════
   CARGA DE CATÁLOGO DE MEDIOS
   Lee directamente de media-config.js (window.TRACKS)
   ═══════════════════════════════════════════════════════════ */
function loadMediaCatalog() {
  if (window.TRACKS && Array.isArray(window.TRACKS) && window.TRACKS.length > 0) {
    TRACKS = window.TRACKS;
    console.log(`[SV] Catálogo cargado: ${TRACKS.length} track(s)`);
  } else {
    TRACKS = [];
    console.warn('[SV] No se encontraron medios. Configura media-config.js');
  }
}

function getTracklist() { return TRACKS; }

/* ═══════════════════════════════════════════════════════════
   DETECCIÓN DE DISPOSITIVO
   ═══════════════════════════════════════════════════════════ */
function detectAndInit() {
  const mobileUA    = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const smallScreen = window.innerWidth < 768;
  isMobile = mobileUA || smallScreen;

  if (isMobile) {
    $('app-desktop').classList.add('hidden');
    $('app-mobile').classList.remove('hidden');
    initMobile();
  } else {
    $('app-desktop').classList.remove('hidden');
    $('app-mobile').classList.add('hidden');
    initDesktop();
  }
}

/* ═══════════════════════════════════════════════════════════
   ANIMACIÓN DE BARRAS (pantalla de inicio)
   ═══════════════════════════════════════════════════════════ */
(function buildIdleWave() {
  const container = $('idle-wave');
  if (!container) return;
  const heights = [25,55,80,45,90,65,38,78,50,70,32,85,60,95,42,62,82,48,72,28,88,52,68,40,76,30,92,56,66,35,84,58];
  heights.forEach((h, i) => {
    const bar = document.createElement('div');
    bar.className = 'idle-bar';
    bar.style.setProperty('--i', i);
    bar.style.height = h + '%';
    container.appendChild(bar);
  });
})();

/* ═══════════════════════════════════════════════════════════
   VISTA ESCRITORIO
   ═══════════════════════════════════════════════════════════ */
function initDesktop() {
  setupDesktopEvents();
  unlockAudioOnFirstGesture();
  generatePin();
}

/* ── Desbloqueo de audio en primer gesto del usuario ─────── */
/* El navegador bloquea audioEl.play() hasta que haya un gesto
   del usuario en la página. Esta función lo desbloquea de forma
   silenciosa al primer clic o tecla, para que luego el móvil
   pueda controlar la reproducción sin restricciones. */
function unlockAudioOnFirstGesture() {
  const unlock = () => {
    // Crea un AudioContext vacío y lo cierra: esto "desbloquea"
    // el contexto de audio del navegador para reproducción
    // programática posterior (incluyendo comandos del móvil).
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume().then(() => ctx.close()).catch(() => {});
    // También hace un play+pause silencioso en el propio elemento
    const prevSrc = audioEl.src;
    if (!prevSrc || prevSrc === window.location.href) {
      // Sin audio cargado aún: solo desbloquea el contexto
    } else {
      audioEl.play().then(() => audioEl.pause()).catch(() => {});
    }
    document.removeEventListener('click',   unlock, true);
    document.removeEventListener('keydown', unlock, true);
    document.removeEventListener('touchstart', unlock, true);
  };
  document.addEventListener('click',      unlock, { capture: true, once: true });
  document.addEventListener('keydown',    unlock, { capture: true, once: true });
  document.addEventListener('touchstart', unlock, { capture: true, once: true });
}

/* ── PIN y PeerJS ───────────────────────────────────────── */
function generatePin() {
  currentPin = String(Math.floor(100000 + Math.random() * 900000));
  $('pin-display').textContent = currentPin;
  initDesktopPeer(`sv-${currentPin}`);

  // Generar código QR oculto
  setTimeout(() => {
    if (typeof QRious !== 'undefined') {
      const qrUrl = window.location.origin + window.location.pathname + '?pin=' + currentPin;
      new QRious({
        element: document.getElementById('qr-canvas'),
        value: qrUrl,
        size: 200,
        level: 'H'
      });
      $('qr-pin-display').textContent = currentPin;
    }
  }, 1000);
}

function initDesktopPeer(peerId) {
  try {
    peer = new Peer(peerId, {
      host: '0.peerjs.com',
      port: 443,
      secure: true,
      debug: 1,
    });

    peer.on('open', () => console.log('[SV] Peer listo · ID:', peerId));

    peer.on('connection', (conn) => {
      if (remoteConn) remoteConn.close();
      remoteConn = conn;

      conn.on('open', () => {
        updateBadgeConnected();
        syncStateToMobile();
      });

      conn.on('data', handleCommandFromMobile);
      conn.on('close', () => { remoteConn = null; updateBadgeDisconnected(); });
      conn.on('error', () => { remoteConn = null; updateBadgeDisconnected(); });
    });

    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        peer.destroy();
        currentPin = String(Math.floor(100000 + Math.random() * 900000));
        $('pin-display').textContent = currentPin;
        initDesktopPeer(`sv-${currentPin}`);
      }
    });
  } catch (e) {
    console.warn('[SV] PeerJS no disponible. Modo local activo.');
  }
}

function updateBadgeConnected() {
  $('pairing-badge').innerHTML = `
    <span class="badge-dot connected" id="badge-dot" aria-hidden="true"></span>
    <span>📱&nbsp;Conectado</span>
  `;
}

function updateBadgeDisconnected() {
  $('pairing-badge').innerHTML = `
    <span class="badge-dot" id="badge-dot" aria-hidden="true"></span>
    <span>PIN:&nbsp;<strong id="pin-display">${currentPin}</strong></span>
  `;
}

/* ──────────────────────────────────────────────────────────
   Comunicación Desktop → Móvil
   ────────────────────────────────────────────────────────── */
function notifyMobile(msg) {
  if (!remoteConn || !remoteConn.open) return;
  remoteConn.send(msg);
}

function syncStateToMobile() {
  if (!remoteConn || !remoteConn.open) return;
  remoteConn.send({
    type:      'state-sync',
    state:     appState,
    track:     currentTrack,
    isPlaying,
    volume:    audioEl.volume,
    history:   trackHistory,
    tracklist: getTracklist(),
    modalOpen: !$('modal-files').classList.contains('hidden'),
    currentTime: audioEl.currentTime,
    duration:    audioEl.duration || 0,
  });
}

/* ──────────────────────────────────────────────────────────
   Manejo de comandos del móvil
   ────────────────────────────────────────────────────────── */
function handleCommandFromMobile(msg) {
  if (!msg || !msg.type) return;

  switch (msg.type) {

    /* Play / Pausa — funciona incluso si el player acaba de cargarse
       y aunque el autoplay haya sido bloqueado por el navegador.      */
    case 'cmd-play-pause':
      if (appState === 'player' && currentTrack) {
        if (audioEl.paused) {
          /* Si el track terminó, reiniciar desde el inicio */
          if (audioEl.duration && audioEl.currentTime >= audioEl.duration - 0.1) {
            audioEl.currentTime = 0;
          }
          /* Si el overlay de autoplay está visible, ocultarlo y reproducir */
          audioEl.play().then(() => {
            isPlaying = true;
            const pi = $('play-icon');
            if (pi) pi.textContent = '⏸';
            const ov = $('autoplay-overlay');
            if (ov) ov.classList.add('hidden');
            syncStateToMobile();
          }).catch(err => {
            /* Si sigue bloqueado: mostrar overlay para que el usuario
               del desktop haga el gesto mínimo requerido.            */
            console.warn('[SV] Play remoto bloqueado por política de autoplay:', err);
            const ov = $('autoplay-overlay');
            if (ov) ov.classList.remove('hidden');
          });
        } else {
          audioEl.pause();
        }
      } else if (appState !== 'processing') {
        // Si hay historial, reproduce el último
        if (trackHistory.length > 0) {
          launchPlayer(trackHistory[0]);
        }
      }
      break;

    /* Móvil pide abrir el explorador → desktop abre modal + notifica al móvil */
    case 'cmd-open-browser':
      openFileBrowser();
      break;

    /* Móvil seleccionó un item → reflejar en el grid del desktop */
    case 'cmd-mobile-select': {
      const target = document.querySelector(`.fb-item[data-index="${msg.trackIndex}"]`);
      if (target) {
        selectFileBrowserItem(target);
        const track = getTracklist()[msg.trackIndex];
        notifyMobile({
          type:       'item-highlighted',
          trackIndex: msg.trackIndex,
          title:      track ? track.title : '',
        });
      }
      break;
    }

    /* Móvil confirmó "Abrir" */
    case 'cmd-confirm-load': {
      const tracks = getTracklist();
      const track  = tracks[msg.trackIndex];
      if (track) {
        closeFileBrowser();
        startProcessing(track);
      }
      break;
    }

    /* Móvil canceló */
    case 'cmd-cancel-load':
      closeFileBrowser();
      break;

    /* Reiniciar el track actual desde el inicio */
    case 'cmd-restart':
      if (appState === 'player' && currentTrack) {
        audioEl.currentTime = 0;
        audioEl.play().then(() => {
          isPlaying = true;
          const pi = $('play-icon');
          if (pi) pi.textContent = '⏸';
          const ov = $('autoplay-overlay');
          if (ov) ov.classList.add('hidden');
          syncStateToMobile();
        }).catch(() => {});
      }
      break;

    /* Saltar ±10 segundos */
    case 'cmd-skip':
      if (appState === 'player') {
        const dur = audioEl.duration || 9999;
        audioEl.currentTime = Math.max(0, Math.min(dur, audioEl.currentTime + (msg.seconds || 0)));
        syncStateToMobile();
      }
      break;

    /* Ajustar volumen */
    case 'cmd-set-volume': {
      const v = Math.min(1, Math.max(0, msg.value));
      audioEl.volume = v;
      const slider = $('vol-slider');
      if (slider) slider.value = v;
      break;
    }

    /* Historial */
    case 'cmd-history':
      if (msg.historyIndex !== undefined) loadFromHistory(msg.historyIndex);
      else cycleHistory();
      break;
  }
}

/* ──────────────────────────────────────────────────────────
   Eventos del escritorio
   ────────────────────────────────────────────────────────── */
function setupDesktopEvents() {
  $('btn-upload-idle').addEventListener('click', openFileBrowser);
  $('btn-play').addEventListener('click', togglePlay);
  $('btn-add').addEventListener('click', () => {
    closeHistoryDropdown();
    openFileBrowser();
  });

  // QR Modal
  $('pairing-badge').addEventListener('click', () => {
    const qrModal = $('modal-qr');
    if (qrModal) {
      qrModal.classList.remove('hidden');
      qrModal.querySelector('.qr-browser').style.animation = 'slide-up 0.3s var(--t-slow)';
    }
  });
  const qrCloseBtn = $('qr-close');
  if (qrCloseBtn) {
    qrCloseBtn.addEventListener('click', () => $('modal-qr').classList.add('hidden'));
  }

  /* Skip ±10s */
  $('btn-back10').addEventListener('click', () => {
    if (audioEl.duration) { audioEl.currentTime = Math.max(0, audioEl.currentTime - 10); syncStateToMobile(); }
  });
  $('btn-fwd10').addEventListener('click', () => {
    if (audioEl.duration) { audioEl.currentTime = Math.min(audioEl.duration, audioEl.currentTime + 10); syncStateToMobile(); }
  });

  $('hdd-btn').addEventListener('click', toggleHistoryDropdown);
  document.addEventListener('click', e => {
    const wrap = $('hdd-wrap');
    if (wrap && !wrap.contains(e.target)) closeHistoryDropdown();
  });

  $('vol-slider').addEventListener('input', e => {
    audioEl.volume = parseFloat(e.target.value);
    syncStateToMobile();
  });

  $('seek-track').addEventListener('click', e => {
    if (!audioEl.duration) return;
    const rect = $('seek-track').getBoundingClientRect();
    audioEl.currentTime = ((e.clientX - rect.left) / rect.width) * audioEl.duration;
  });

  /* Overlay de autoplay — click → reproducir */
  const overlay = $('autoplay-overlay');
  if (overlay) {
    const tryPlay = () => {
      audioEl.play().then(() => {
        overlay.classList.add('hidden');
      }).catch(() => {});
    };
    overlay.addEventListener('click', tryPlay);
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tryPlay(); }
    });
  }

  /* Eventos de audio */
  audioEl.addEventListener('timeupdate', onTimeUpdate);
  audioEl.addEventListener('ended', onTrackEnd);
  audioEl.addEventListener('loadedmetadata', () => {
    $('time-total').textContent = formatTime(audioEl.duration);
    startWaveformAnimation();
  });
  audioEl.addEventListener('play', () => {
    isPlaying = true;
    const pi = $('play-icon');
    if (pi) pi.textContent = '⏸';
    if (overlay) overlay.classList.add('hidden');
    syncStateToMobile();
  });
  audioEl.addEventListener('pause', () => {
    isPlaying = false;
    const pi = $('play-icon');
    if (pi) pi.textContent = '▶';
    syncStateToMobile();
  });
  audioEl.addEventListener('error', () => {
    console.warn('[SV] Audio no encontrado:', audioEl.src);
    isPlaying = false;
    const pi = $('play-icon');
    if (pi) pi.textContent = '▶';
    startWaveformAnimation();
  });
}

/* ── Máquina de estados ─────────────────────────────────── */
function transitionTo(newState) {
  appState = newState;
  $$('[data-state]').forEach(el => {
    el.classList.toggle('hidden', el.dataset.state !== newState);
  });
}

/* ──────────────────────────────────────────────────────────
   Explorador de archivos (modal simulado)
   ────────────────────────────────────────────────────────── */
let selectedTrackIndex = -1;

function openFileBrowser() {
  audioEl.pause();
  $('modal-files').classList.remove('hidden');
  selectedTrackIndex = -1;
  $('fb-selected-name').textContent = 'Ningún archivo seleccionado';
  $('fb-open').disabled = true;
  renderFileBrowserGrid();
  /* Notificar al móvil: modal abierto + tracklist actualizado */
  notifyMobile({ type: 'modal-opened', tracklist: getTracklist() });
}

function renderFileBrowserGrid() {
  const grid   = $('fb-grid');
  const tracks = getTracklist();

  if (tracks.length === 0) {
    grid.innerHTML = `
      <div class="fb-empty">
        <div class="fb-empty-icon">📁</div>
        <p>No se encontraron imágenes.</p>
        <p style="margin-top:8px;font-size:0.78rem;opacity:0.7">
          Configura tus archivos en <code style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px">media-config.js</code>
          y coloca las imágenes en /img/ y los audios en /audios/.
        </p>
      </div>`;
    return;
  }

  grid.innerHTML = tracks.map((t, i) => `
    <div class="fb-item" role="option" data-index="${i}" tabindex="0"
         aria-label="${t.title}" aria-selected="false">
      <img class="fb-img"
           src="img/${t.image}"
           alt="${t.title}"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
      <div class="fb-img-fallback" style="display:none">🖼️</div>
      <p class="fb-item-name">${t.title}</p>
    </div>
  `).join('');

  grid.querySelectorAll('.fb-item').forEach(item => {
    item.addEventListener('click',    () => selectFileBrowserItem(item));
    item.addEventListener('dblclick', () => { selectFileBrowserItem(item); confirmAndOpenFile(); });
    item.addEventListener('keydown',  e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectFileBrowserItem(item); }
      if (e.key === 'Enter') confirmAndOpenFile();
    });
  });
}

function selectFileBrowserItem(item) {
  $$('.fb-item').forEach(el => {
    el.classList.remove('selected');
    el.setAttribute('aria-selected', 'false');
  });
  item.classList.add('selected');
  item.setAttribute('aria-selected', 'true');
  selectedTrackIndex = parseInt(item.dataset.index, 10);
  const track = getTracklist()[selectedTrackIndex];
  if (track) {
    $('fb-selected-name').textContent = `${track.title}  ·  ${track.image}`;
    $('fb-open').disabled = false;
  }
}

function confirmAndOpenFile() {
  if (selectedTrackIndex < 0) return;
  const track = getTracklist()[selectedTrackIndex];
  closeFileBrowser();
  startProcessing(track);
}

function closeFileBrowser() {
  $('modal-files').classList.add('hidden');
  notifyMobile({ type: 'modal-closed' });
}

$('fb-open').addEventListener('click', confirmAndOpenFile);
$('fb-cancel').addEventListener('click', closeFileBrowser);
$('fb-close').addEventListener('click', closeFileBrowser);
$('modal-files').addEventListener('click', e => {
  if (e.target === $('modal-files')) closeFileBrowser();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('modal-files').classList.contains('hidden')) closeFileBrowser();
});

/* ──────────────────────────────────────────────────────────
   Procesamiento (simulación IA — 5 segundos)
   ────────────────────────────────────────────────────────── */
function startProcessing(track) {
  if (procTimer) clearInterval(procTimer);
  currentTrack = track;
  transitionTo('processing');
  syncStateToMobile();

  $('process-img').src = `img/${track.image}`;

  $('process-steps').innerHTML = PROCESSING_STEPS.map((text, i) => `
    <div class="step-item" id="pstep-${i}" role="listitem">
      <span class="step-icon" aria-hidden="true">${i + 1}</span>
      <span>${text}</span>
    </div>
  `).join('');

  $('progress-fill').style.width = '0%';

  let elapsed = 0, activeStep = 0;
  const TICK    = 50;
  const STEP_MS = PROCESSING_TOTAL_MS / PROCESSING_STEPS.length;

  markStep(0, 'active');

  procTimer = setInterval(() => {
    elapsed += TICK;
    const pct = Math.min(100, (elapsed / PROCESSING_TOTAL_MS) * 100);
    $('progress-fill').style.width = `${pct}%`;

    const targetStep = Math.min(Math.floor(elapsed / STEP_MS), PROCESSING_STEPS.length - 1);
    if (targetStep > activeStep) {
      markStep(activeStep, 'done');
      activeStep = targetStep;
      if (activeStep < PROCESSING_STEPS.length) markStep(activeStep, 'active');
    }

    if (elapsed >= PROCESSING_TOTAL_MS) {
      clearInterval(procTimer);
      markStep(activeStep, 'done');
      $('progress-fill').style.width = '100%';
      setTimeout(() => launchPlayer(track), 450);
    }
  }, TICK);
}

function markStep(idx, status) {
  const el = $(`pstep-${idx}`);
  if (!el) return;
  el.classList.remove('active', 'done');
  el.classList.add(status);
  if (status === 'done') el.querySelector('.step-icon').textContent = '✓';
}

/* ──────────────────────────────────────────────────────────
   Reproductor
   ────────────────────────────────────────────────────────── */
function launchPlayer(track) {
  currentTrack = track;
  saveCurrentToHistory();
  transitionTo('player');

  const overlay = $('autoplay-overlay');
  if (overlay) overlay.classList.add('hidden');

  /* Portada */
  const artImg = $('artwork-img');
  artImg.src   = `img/${track.image}`;
  artImg.alt   = `Portada: ${track.title}`;
  $('track-title').textContent = track.title;

  /* Layout siempre consistente — sin cambios por aspecto de imagen */
  const wrapper = $('player-wrapper');
  if (wrapper) wrapper.classList.remove('ar-landscape'); // limpia si quedó de sesión anterior

  /* Audio — mismo nombre que la imagen pero .mp3 */
  const audioSrc = track.audio
    ? `audios/${track.audio}`
    : `audios/${track.image.replace(/\.[^.]+$/, '.mp3')}`;

  audioEl.src = audioSrc;
  audioEl.load();

  /* Autoplay — si el navegador lo bloquea mostramos el overlay */
  audioEl.play().then(() => {
    isPlaying = true;
    const pi = $('play-icon');
    if (pi) pi.textContent = '⏸';
    if (overlay) overlay.classList.add('hidden');
  }).catch(() => {
    isPlaying = false;
    const pi = $('play-icon');
    if (pi) pi.textContent = '▶';
    if (overlay) overlay.classList.remove('hidden');
    startWaveformAnimation();
  });

  syncStateToMobile();
}

function togglePlay() {
  if (!audioEl.src || audioEl.src === window.location.href) return;
  if (audioEl.paused) {
    if (audioEl.duration && audioEl.currentTime >= audioEl.duration - 0.1) {
      audioEl.currentTime = 0;
    }
    audioEl.play().catch(() => {});
  } else {
    audioEl.pause();
  }
}

function onTimeUpdate() {
  if (!audioEl.duration) return;
  const pct = (audioEl.currentTime / audioEl.duration) * 100;
  $('seek-fill').style.width = `${pct}%`;
  $('seek-thumb').style.left = `${pct}%`;
  $('seek-track').setAttribute('aria-valuenow', Math.round(pct));
  $('time-current').textContent = formatTime(audioEl.currentTime);

  if (!onTimeUpdate._last || Date.now() - onTimeUpdate._last > 3000) {
    onTimeUpdate._last = Date.now();
    syncStateToMobile();
  }
}

function onTrackEnd() {
  isPlaying = false;
  const pi = $('play-icon');
  if (pi) pi.textContent = '▶';
  syncStateToMobile();
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/* ──────────────────────────────────────────────────────────
   Waveform animado (canvas)
   ────────────────────────────────────────────────────────── */
function startWaveformAnimation() {
  if (waveAnimId) cancelAnimationFrame(waveAnimId);
  const canvas = $('waveform');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function draw() {
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W; canvas.height = H;
    ctx.clearRect(0, 0, W, H);

    const BARS = 52, barW = W / BARS;
    for (let i = 0; i < BARS; i++) {
      const t    = (i / BARS) * Math.PI * 6 + wavePhase;
      const wave = Math.sin(t) * 0.38 + Math.sin(t * 1.9 + 1.2) * 0.22 + Math.sin(t * 3.1) * 0.1;
      const amp  = isPlaying ? (wave + 0.5) : 0.06 + Math.abs(Math.sin(i * 0.4)) * 0.12;
      const barH = Math.max(4, amp * H);
      const x    = i * barW, y = (H - barH) / 2;

      const grad = ctx.createLinearGradient(0, y, 0, y + barH);
      grad.addColorStop(0, '#A78BFA');
      grad.addColorStop(1, '#EC4899');
      ctx.fillStyle   = grad;
      ctx.globalAlpha = isPlaying ? 0.85 : 0.3;
      ctx.beginPath();
      ctx.roundRect(x + 1.5, y, barW - 3, barH, 2);
      ctx.fill();
    }

    if (isPlaying) wavePhase += 0.1;
    waveAnimId = requestAnimationFrame(draw);
  }

  draw();
}

/* ──────────────────────────────────────────────────────────
   Historial — Dropdown en el header
   ────────────────────────────────────────────────────────── */
function saveCurrentToHistory() {
  if (!currentTrack) return;
  if (!trackHistory.find(t => t.title === currentTrack.title)) {
    trackHistory.unshift({ ...currentTrack });
    if (trackHistory.length > 12) trackHistory.pop();
  }
  renderHistoryDropdown();
}

function renderHistoryDropdown() {
  const menu = $('hdd-menu'), btn = $('hdd-btn'), count = $('hdd-count');
  if (!menu || !btn || !count) return;

  count.textContent = trackHistory.length;
  btn.classList.toggle('has-items', trackHistory.length > 0);

  if (trackHistory.length === 0) {
    menu.innerHTML = `<p class="hdd-empty">🎵 Aún no hay creaciones guardadas</p>`;
    return;
  }

  menu.innerHTML = trackHistory.map((t, i) => `
    <button class="hdd-item${currentTrack && t.title === currentTrack.title ? ' current' : ''}" data-idx="${i}">
      <img class="hdd-thumb" src="img/${t.image}" alt="" onerror="this.src=''">
      <div class="hdd-item-info">
        <span class="hdd-item-name">${t.title}</span>
        <span class="hdd-item-label">${currentTrack && t.title === currentTrack.title ? '▶ Reproduciendo ahora' : 'Creación guardada'}</span>
      </div>
      <span class="hdd-item-play">▶</span>
    </button>
  `).join('');

  menu.querySelectorAll('.hdd-item').forEach(item => {
    item.addEventListener('click', () => {
      loadFromHistory(parseInt(item.dataset.idx, 10));
      closeHistoryDropdown();
    });
  });
}

function toggleHistoryDropdown() {
  const menu = $('hdd-menu'), btn = $('hdd-btn');
  if (!menu) return;
  const isOpen = !menu.classList.contains('hidden');
  menu.classList.toggle('hidden', isOpen);
  btn.setAttribute('aria-expanded', String(!isOpen));
  if (!isOpen) renderHistoryDropdown();
}

function closeHistoryDropdown() {
  const menu = $('hdd-menu'), btn = $('hdd-btn');
  if (!menu) return;
  menu.classList.add('hidden');
  btn.setAttribute('aria-expanded', 'false');
}

function loadFromHistory(idx) {
  if (idx < 0 || idx >= trackHistory.length) return;
  launchPlayer(trackHistory[idx]);
}

function cycleHistory() {
  if (trackHistory.length === 0) return;
  const idx = trackHistory.findIndex(t => t.title === currentTrack?.title);
  loadFromHistory((idx + 1) % trackHistory.length);
}

/* ═══════════════════════════════════════════════════════════
   VISTA MÓVIL — Control Remoto + Modo Standalone
   ═══════════════════════════════════════════════════════════ */

let mobilePanel     = 'player';
let mobileTracklist = [];
let mobileHistory   = [];
let mobileSelectIdx = -1;

function initMobile() {
  /* Botón modo standalone */
  const standaloneBtn = $('m-standalone-btn');
  if (standaloneBtn) {
    standaloneBtn.addEventListener('click', activateStandaloneMode);
  }

  /* Conexión */
  $('m-connect-btn').addEventListener('click', mobileConnect);
  $('m-pin-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') mobileConnect();
  });
  $('m-disconnect-btn').addEventListener('click', mobileDisconnect);

  // Auto-llenado por QR
  const urlParams = new URLSearchParams(window.location.search);
  const qrPin = urlParams.get('pin');
  if (qrPin && qrPin.length === 6) {
    $('m-pin-input').value = qrPin;
    setTimeout(() => mobileConnect(), 500);
  }

  /* Play / Pausa */
  $('m-btn-play').addEventListener('click', () => {
    if (mobileMode === 'standalone') {
      // En modo standalone, controla el audio local
      togglePlay();
    } else {
      sendToDesktop({ type: 'cmd-play-pause' });
    }
  });

  /* Reiniciar */
  $('m-btn-restart').addEventListener('click', () => {
    if (mobileMode === 'standalone') {
      audioEl.currentTime = 0;
      audioEl.play().catch(() => {});
    } else {
      sendToDesktop({ type: 'cmd-restart' });
    }
  });

  /* Skip ±10s */
  $('m-btn-back10').addEventListener('click', () => {
    if (mobileMode === 'standalone') {
      audioEl.currentTime = Math.max(0, audioEl.currentTime - 10);
    } else {
      sendToDesktop({ type: 'cmd-skip', seconds: -10 });
    }
  });
  $('m-btn-fwd10').addEventListener('click', () => {
    if (mobileMode === 'standalone') {
      const max = audioEl.duration || 9999;
      audioEl.currentTime = Math.min(max, audioEl.currentTime + 10);
    } else {
      sendToDesktop({ type: 'cmd-skip', seconds: 10 });
    }
  });

  /* Volumen */
  $('m-vol-slider').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    $('m-vol-value').textContent = Math.round(v * 100) + '%';
    if (mobileMode === 'standalone') {
      audioEl.volume = v;
    } else {
      sendToDesktop({ type: 'cmd-set-volume', value: v });
    }
  });

  /* Cargar imagen → abrir tracklist */
  const openTracklist = () => {
    mobileSelectIdx = -1;
    updateMobileSelectionBar();
    audioEl.pause();
    if (mobileMode === 'standalone') {
      // Cargar catálogo local directamente
      mobileTracklist = getTracklist();
      renderMobileTracklist();
      showMobilePanel('tracklist');
    } else {
      showMobilePanel('tracklist');
      sendToDesktop({ type: 'cmd-open-browser' });
    }
  };
  $('m-btn-load').addEventListener('click', openTracklist);
  $('m-btn-new').addEventListener('click',  openTracklist);

  /* Historial */
  $('m-btn-next').addEventListener('click', () => showMobilePanel('history'));

  /* Botones "Volver" en sub-paneles */
  document.querySelectorAll('.m-back-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (mobilePanel === 'tracklist' && mobileMode !== 'standalone') {
        sendToDesktop({ type: 'cmd-cancel-load' });
      }
      showMobilePanel('player');
    });
  });

  /* Footer del tracklist: Cancelar y Abrir */
  $('m-tracklist-cancel').addEventListener('click', () => {
    if (mobileMode !== 'standalone') {
      sendToDesktop({ type: 'cmd-cancel-load' });
    }
    showMobilePanel('player');
  });

  $('m-tracklist-open').addEventListener('click', () => {
    if (mobileSelectIdx < 0) return;
    if (mobileMode === 'standalone') {
      // En modo standalone, lanzar el reproductor directamente
      const track = mobileTracklist[mobileSelectIdx];
      if (track) {
        showMobileControlPanel();
        showMobilePanel('player');
        mobileSelectIdx = -1;
        startMobileStandaloneProcessing(track);
      }
    } else {
      sendToDesktop({ type: 'cmd-confirm-load', trackIndex: mobileSelectIdx });
      showMobilePanel('player');
      mobileSelectIdx = -1;
    }
  });

  /* Eventos de audio en modo standalone */
  audioEl.addEventListener('play', () => {
    isPlaying = true;
    const pi = $('m-play-icon');
    if (pi) pi.textContent = '⏸';
    $('m-track-state').textContent = '▶ Reproduciendo';
  });
  audioEl.addEventListener('pause', () => {
    isPlaying = false;
    const pi = $('m-play-icon');
    if (pi) pi.textContent = '▶';
    $('m-track-state').textContent = '⏸ Pausado';
  });
  audioEl.addEventListener('ended', () => {
    isPlaying = false;
    const pi = $('m-play-icon');
    if (pi) pi.textContent = '▶';
    $('m-track-state').textContent = 'Finalizado';
  });
}

/* ── Modo Standalone (móvil sin computador) ──────────────── */
function activateStandaloneMode() {
  mobileMode = 'standalone';
  // Cargar catálogo de tracks
  mobileTracklist = getTracklist();
  // Mostrar el panel de control directamente
  $('m-pairing').classList.add('hidden');
  $('m-control').classList.remove('hidden');
  // Cambia label de estado
  const statusEl = document.querySelector('.m-ctrl-status');
  if (statusEl) {
    statusEl.innerHTML = `<span class="m-ctrl-status-dot standalone" aria-hidden="true"></span>Modo local`;
  }
  showMobilePanel('player');

  // Si hay tracks, mostrar el tracklist de inmediato
  if (mobileTracklist.length > 0) {
    mobileSelectIdx = -1;
    updateMobileSelectionBar();
    showMobilePanel('tracklist');
  }
}

/* Procesamiento simulado en modo standalone */
function startMobileStandaloneProcessing(track) {
  currentTrack = track;
  // Actualizar mini-info
  $('m-track-name').textContent  = track.title;
  $('m-track-state').textContent = 'Procesando…';

  const thumb = $('m-art-thumb');
  if (thumb) { thumb.src = `img/${track.image}`; }

  // Simular 3 segundos de "procesamiento"
  setTimeout(() => {
    const audioSrc = track.audio
      ? `audios/${track.audio}`
      : `audios/${track.image.replace(/\.[^.]+$/, '.mp3')}`;
    audioEl.src = audioSrc;
    audioEl.load();
    audioEl.play().catch(() => {
      $('m-track-state').textContent = 'Toca ▶ para reproducir';
    });
    saveToMobileHistory(track);
  }, 3000);
}

function saveToMobileHistory(track) {
  if (!mobileHistory.find(t => t.title === track.title)) {
    mobileHistory.unshift({ ...track });
    if (mobileHistory.length > 12) mobileHistory.pop();
  }
  const badge = $('m-history-badge');
  if (badge) {
    badge.textContent = mobileHistory.length;
    badge.classList.toggle('hidden', mobileHistory.length === 0);
  }
}

function showMobilePanel(panel) {
  mobilePanel = panel;
  $('m-panel-player')    && $('m-panel-player').classList.add('hidden');
  $('m-panel-tracklist') && $('m-panel-tracklist').classList.add('hidden');
  $('m-panel-history')   && $('m-panel-history').classList.add('hidden');

  if (panel === 'player') {
    $('m-panel-player').classList.remove('hidden');
  } else if (panel === 'tracklist') {
    renderMobileTracklist();
    $('m-panel-tracklist').classList.remove('hidden');
  } else if (panel === 'history') {
    renderMobileHistory();
    $('m-panel-history').classList.remove('hidden');
  }
}

function renderMobileTracklist() {
  const grid = $('m-tracklist-grid');
  if (!grid) return;

  // En modo standalone, usar catálogo local si el remoto está vacío
  const list = mobileTracklist.length > 0 ? mobileTracklist : getTracklist();

  if (list.length === 0) {
    grid.innerHTML = `
      <div class="m-empty-state">
        <span class="m-empty-icon">🎨</span>
        <p>No hay imágenes disponibles.</p>
        <p style="font-size:0.75rem;opacity:0.6;margin-top:6px;">
          Configura tus archivos en <code>media-config.js</code>
        </p>
      </div>`;
    updateMobileSelectionBar();
    return;
  }

  grid.innerHTML = list.map((t, i) => `
    <button class="m-track-item${mobileSelectIdx === i ? ' selected' : ''}" data-index="${i}" aria-label="Seleccionar ${t.title}">
      <img class="m-track-thumb" src="img/${t.image}" alt="${t.title}" onerror="this.style.opacity='0.3'">
      <span class="m-track-item-name">${t.title}</span>
    </button>
  `).join('');

  grid.querySelectorAll('.m-track-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index, 10);
      mobileSelectIdx = idx;

      grid.querySelectorAll('.m-track-item').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      updateMobileSelectionBar();

      if (mobileMode !== 'standalone') {
        sendToDesktop({ type: 'cmd-mobile-select', trackIndex: idx });
      }
    });
  });

  updateMobileSelectionBar();
}

function updateMobileSelectionBar() {
  const bar     = $('m-tracklist-footer');
  const openBtn = $('m-tracklist-open');
  const label   = $('m-selected-label');
  if (!bar || !openBtn || !label) return;

  const list = mobileTracklist.length > 0 ? mobileTracklist : getTracklist();

  if (mobileSelectIdx >= 0 && list[mobileSelectIdx]) {
    const t = list[mobileSelectIdx];
    label.textContent = t.title;
    openBtn.disabled  = false;
    openBtn.classList.remove('disabled');
  } else {
    label.textContent = 'Ninguna imagen seleccionada';
    openBtn.disabled  = true;
    openBtn.classList.add('disabled');
  }
  bar.classList.remove('hidden');
}

function renderMobileHistory() {
  const list = $('m-history-list');
  if (!list) return;

  const hist = mobileMode === 'standalone' ? mobileHistory : mobileHistory;

  if (hist.length === 0) {
    list.innerHTML = `
      <div class="m-empty-state">
        <span class="m-empty-icon">🎵</span>
        <p>Aún no hay creaciones guardadas.</p>
      </div>`;
    return;
  }

  list.innerHTML = hist.map((t, i) => `
    <button class="m-history-item" data-index="${i}" aria-label="Reproducir ${t.title}">
      <img class="m-history-thumb" src="img/${t.image}" alt="${t.title}" onerror="this.style.display='none'">
      <div class="m-history-info">
        <span class="m-history-name">${t.title}</span>
        <span class="m-history-label">Creación guardada</span>
      </div>
      <span class="m-history-play">▶</span>
    </button>
  `).join('');

  list.querySelectorAll('.m-history-item').forEach(btn => {
    btn.addEventListener('click', () => {
      if (mobileMode === 'standalone') {
        const track = hist[parseInt(btn.dataset.index, 10)];
        if (track) startMobileStandaloneProcessing(track);
      } else {
        sendToDesktop({ type: 'cmd-history', historyIndex: parseInt(btn.dataset.index, 10) });
      }
      showMobilePanel('player');
    });
  });
}

/* ── Conexión del móvil ─────────────────────────────────── */
function mobileConnect() {
  const rawPin = $('m-pin-input').value.replace(/\D/g, '');
  const errEl  = $('m-error');
  errEl.textContent = '';

  if (rawPin.length !== 6) {
    errEl.textContent = 'El PIN debe tener exactamente 6 dígitos.';
    return;
  }

  mobileMode = 'remote';

  const connectBtn = $('m-connect-btn');
  connectBtn.disabled    = true;
  connectBtn.textContent = 'Conectando…';

  try {
    peer = new Peer(undefined, {
      host: '0.peerjs.com',
      port: 443,
      secure: true,
      debug: 1,
    });

    peer.on('open', () => {
      desktopConn = peer.connect(`sv-${rawPin}`);

      const timeout = setTimeout(() => {
        errEl.textContent = 'Tiempo agotado (las redes 4G pueden tardar más). Reintenta.';
        connectBtn.disabled    = false;
        connectBtn.textContent = 'Conectar';
        if (peer) { peer.destroy(); peer = null; }
      }, 30000);

      desktopConn.on('open', () => { clearTimeout(timeout); showMobileControlPanel(); });
      desktopConn.on('data', handleDataFromDesktop);
      desktopConn.on('close', () => { clearTimeout(timeout); mobileDisconnect(); });
      desktopConn.on('error', () => {
        clearTimeout(timeout);
        errEl.textContent = 'Error de conexión. Verifica el PIN.';
        connectBtn.disabled    = false;
        connectBtn.textContent = 'Conectar';
      });
    });

    peer.on('error', () => {
      errEl.textContent = 'No se pudo conectar.';
      connectBtn.disabled    = false;
      connectBtn.textContent = 'Conectar';
    });
  } catch (e) {
    errEl.textContent = 'Error al iniciar conexión.';
    connectBtn.disabled    = false;
    connectBtn.textContent = 'Conectar';
  }
}

/* ── Mensajes recibidos desde el desktop ────────────────── */
function handleDataFromDesktop(msg) {
  if (!msg) return;

  if (msg.type === 'state-sync') {
    const track = msg.track, playing = msg.isPlaying;

    if (msg.tracklist && msg.tracklist.length > 0) mobileTracklist = msg.tracklist;
    if (msg.history)   mobileHistory = msg.history;

    /* Actualizar UI del reproductor */
    $('m-play-icon').textContent   = playing ? '⏸' : '▶';
    $('m-track-state').textContent = playing ? '▶ Reproduciendo' : '⏸ Pausado';

    if (track) {
      $('m-track-name').textContent = track.title;
      const thumb = $('m-art-thumb');
      thumb.src = `img/${track.image}`;
      thumb.onerror = () => { thumb.src = ''; };
    } else {
      $('m-track-name').textContent  = '—';
      $('m-track-state').textContent = 'En espera…';
    }

    if (msg.volume !== undefined) {
      const slider = $('m-vol-slider');
      if (slider && Math.abs(parseFloat(slider.value) - msg.volume) > 0.02) {
        slider.value = msg.volume;
        $('m-vol-value').textContent = Math.round(msg.volume * 100) + '%';
      }
    }

    const histBadge = $('m-history-badge');
    if (histBadge) {
      histBadge.textContent = mobileHistory.length || '';
      histBadge.classList.toggle('hidden', mobileHistory.length === 0);
    }

    if (mobilePanel === 'history')   renderMobileHistory();
    if (mobilePanel === 'tracklist') renderMobileTracklist();

  } else if (msg.type === 'modal-opened') {
    if (msg.tracklist && msg.tracklist.length > 0) mobileTracklist = msg.tracklist;
    mobileSelectIdx = -1;
    showMobilePanel('tracklist');

  } else if (msg.type === 'modal-closed') {
    if (mobilePanel === 'tracklist') {
      showMobilePanel('player');
    }
    mobileSelectIdx = -1;

  } else if (msg.type === 'item-highlighted') {
    mobileSelectIdx = msg.trackIndex;
    updateMobileSelectionBar();
    document.querySelectorAll('.m-track-item').forEach(el => {
      el.classList.toggle('selected', parseInt(el.dataset.index, 10) === mobileSelectIdx);
    });
  }
}

function showMobileControlPanel() {
  $('m-pairing').classList.add('hidden');
  $('m-control').classList.remove('hidden');
  showMobilePanel('player');
}

function mobileDisconnect() {
  if (desktopConn) { desktopConn.close(); desktopConn = null; }
  if (peer)        { peer.destroy();      peer = null; }
  $('m-control').classList.add('hidden');
  $('m-pairing').classList.remove('hidden');
  const btn = $('m-connect-btn');
  btn.disabled    = false;
  btn.textContent = 'Conectar';
  $('m-pin-input').value   = '';
  $('m-error').textContent = '';
  mobileTracklist = [];
  mobileHistory   = [];
  mobileSelectIdx = -1;
  mobileMode = 'remote';
}

function sendToDesktop(msg) {
  if (!desktopConn || !desktopConn.open) return;
  desktopConn.send(msg);
}

/* ═══════════════════════════════════════════════════════════
   ARRANQUE
   ═══════════════════════════════════════════════════════════ */
loadMediaCatalog();
detectAndInit();
