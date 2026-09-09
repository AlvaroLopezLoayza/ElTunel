const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const setup = $('#setup');
const game = $('#game');
const overlay = $('#overlay');
const overlayCard = $('#overlayCard');
const supportDialog = $('#supportDialog');
const roomCodeEl = $('#roomCode');
const controllerUrlEl = $('#controllerUrl');
const connectionBadge = $('#connectionBadge');
const startBtn = $('#startBtn');
const demoBtn = $('#demoBtn');
const readyMessage = $('#readyMessage');
const quitBtn = $('#quitBtn');
const pauseBtn = $('#pauseBtn');
const canvas = $('#tunnelCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = $('#score');
const discoveredEl = $('#discovered');
const timeEl = $('#time');
const phaseEl = $('#phase');
const phaseProgress = $('#phaseProgress');
const gameConnection = $('#gameConnection');
const floatScore = $('#floatScore');
const hint = $('#hint strong');
const playerTag = $('#playerTag');
const institutionInput = $('#institutionSupport');
const clearScoreboardBtn = $('#clearScoreboard');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');

const laneX = { left: -0.62, up: 0, right: 0.62 };
const laneY = { left: 0.2, up: -0.5, right: 0.2 };
const phaseNames = ['CAMPO ABIERTO', 'SEÑALES DISTANTES', 'VISIÓN DE TÚNEL', 'INTERRUPCIÓN'];
const alternatives = [
  'Reconocer cómo me siento', 'Escribir lo que siento', 'Respirar y tomar una pausa',
  'Hablar con alguien', 'Acercarme a una persona de confianza', 'Aceptar conversar',
  'Decir: necesito ayuda', 'Hablar con un familiar', 'Hablar con mi tutoría',
  'Acercarme a un docente', 'Pedir que alguien me acompañe', 'Escuchar otra perspectiva',
  'Hablar con psicología', 'Pedir ayuda profesional', 'Decírselo a un adulto',
  'Buscar un lugar seguro', 'Llamar a una línea de ayuda', 'Acompañar sin juzgar'
];

let room = '';
let seq = 0;
let controllerConnected = false;
let gameState = null;
let raf = 0;
let lastFrame = 0;
let lastAction = null;
let paused = false;
let supportWasPaused = false;
let inInterruption = false;
let continueInterruption = null;
let revealMode = false;
let reducedMotion = motionPreference.matches;
let soundEnabled = false;
let audioContext = null;
let ambientGain = null;

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

async function createRoom() {
  try {
    const [roomRes, networkRes] = await Promise.all([
      fetch('/api/rooms', { method: 'POST' }),
      fetch('/api/network', { cache: 'no-store' })
    ]);
    const roomData = await roomRes.json();
    const networkData = await networkRes.json();
    room = roomData.code;
    roomCodeEl.textContent = room;
    const localHost = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
    controllerUrlEl.textContent = localHost && networkData.controllerUrls?.length
      ? networkData.controllerUrls[0]
      : `${location.origin}/control`;
    poll();
  } catch {
    roomCodeEl.textContent = 'ERROR';
    controllerUrlEl.textContent = 'Reinicia el servidor para crear una sala.';
  }
}

async function poll() {
  if (!room) return;
  try {
    const res = await fetch(`/api/rooms/${room}/events?since=${seq}`, { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) {
      seq = data.seq;
      controllerConnected = data.controllerConnected;
      updateConnection();
      data.events.forEach(handleEvent);
    }
  } catch {
    controllerConnected = false;
    updateConnection();
  }
  setTimeout(poll, 260);
}

function updateConnection() {
  const label = controllerConnected ? 'Controlador conectado' : 'Sin controlador';
  connectionBadge.className = `status ${controllerConnected ? 'connected' : 'disconnected'}`;
  connectionBadge.textContent = label;
  gameConnection.className = `status ${controllerConnected ? 'connected' : 'disconnected'}`;
  gameConnection.textContent = label;
  updateReadiness();
}

function updateReadiness() {
  const checked = $$('.safety-check:checked').length;
  const ready = checked === 3 && controllerConnected;
  startBtn.disabled = !ready;
  readyMessage.classList.toggle('ready', ready);
  if (ready) readyMessage.textContent = 'Todo listo. Haz un ensayo breve antes de entrar.';
  else if (checked < 3) readyMessage.textContent = `Completa las comprobaciones de seguridad (${checked}/3).`;
  else readyMessage.textContent = 'Conecta el controlador para continuar.';
}

function handleEvent(event) {
  if (event.type !== 'action' || !gameState || gameState.ended) return;
  if (event.action === 'pause') return togglePause();
  if (['left', 'up', 'right'].includes(event.action)) {
    if (inInterruption) return advanceInterruption();
    registerGesture(event.action);
  }
}

$$('.safety-check').forEach(check => check.addEventListener('change', updateReadiness));

function showPractice(demo = false) {
  if (!demo && startBtn.disabled) return;
  setup.inert = true;
  overlay.classList.remove('hidden');
  overlayCard.innerHTML = `
    <p class="eyebrow">ENSAYO · 20 SEGUNDOS</p>
    <h2>Tres gestos.<br>Una señal clara.</h2>
    <p>El participante elige un paso, una inclinación o un micro-salto. El acompañante toca la misma dirección una sola vez.</p>
    <div class="gesture-preview">
      <div><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M38 24H10M22 12 10 24l12 12"/></svg>IZQUIERDA</div>
      <div><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 38V10M12 22l12-12 12 12"/></svg>ARRIBA</div>
      <div><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 24h28M26 12l12 12-12 12"/></svg>DERECHA</div>
    </div>
    <p>Confirma que el centro y el suelo sean visibles con el visor. Deténganse ante cualquier incomodidad.</p>
    <div class="overlay-actions"><button id="beginExperience" class="primary">ENTRAR AL TÚNEL</button></div>`;
  $('#beginExperience').addEventListener('click', () => startGame(demo));
  $('#beginExperience').focus();
}

function seeded(seed) {
  let value = seed >>> 0;
  return () => ((value = (value * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function buildPlan(duration, difficulty) {
  const rand = seeded(4821 + duration + ({ easy: 1, medium: 7, hard: 13 }[difficulty] || 7));
  const count = Math.round(duration / 2.7);
  const plan = [];
  let id = 0;

  for (let phase = 0; phase < 4; phase++) {
    const phaseCount = Math.floor(count / 4) + (phase < count % 4 ? 1 : 0);
    const start = phase * duration / 4;
    const length = duration / 4;
    for (let index = 0; index < phaseCount; index++) {
      const ratio = index / Math.max(1, phaseCount - 1);
      const chance = rand();
      const centerChance = [.5, .34, .18, .28][phase];
      const lane = chance < centerChance ? 'up' : chance < centerChance + (1 - centerChance) / 2 ? 'left' : 'right';
      plan.push({
        id: ++id,
        phase,
        spawnAt: start + 3 + ratio * Math.max(2, length - 7) + (rand() - .5),
        lane,
        label: alternatives[(id * 5 + phase * 3) % alternatives.length],
        kind: id % 3,
        z: 1,
        active: false,
        collected: false,
        missed: false
      });
    }
  }
  const specialLanes = ['left', 'up', 'right'];
  plan.push({
    id: ++id,
    phase: 3,
    spawnAt: duration * .76,
    lane: specialLanes[Math.floor(rand() * specialLanes.length)],
    label: 'INTERRUPCIÓN',
    kind: 3,
    special: true,
    z: 1,
    active: false,
    collected: false,
    missed: false
  });
  return plan.sort((a, b) => a.spawnAt - b.spawnAt);
}

function currentScore() {
  if (!gameState) return 0;
  return Math.round(gameState.discovered / gameState.total * 1000) + (gameState.specialCaptured ? 250 : 0);
}

function startGame(demo = false) {
  const duration = Number($('#duration').value);
  const difficulty = $('#difficulty').value;
  const backgroundSpeed = Math.min(3, Math.max(1, Number($('#backgroundSpeed').value) || 3));
  const name = $('#playerName').value.trim();
  const institution = institutionInput.value.trim();
  const coins = buildPlan(duration, difficulty);
  gameState = {
    duration,
    difficulty,
    backgroundSpeed,
    name,
    institution,
    discovered: 0,
    total: coins.filter(coin => !coin.special).length,
    specialCaptured: false,
    elapsed: 0,
    ended: false,
    demo,
    coins,
    speed: difficulty === 'easy' ? .23 : difficulty === 'hard' ? .31 : .27,
    interruptionDone: false
  };

  scoreEl.textContent = '0';
  discoveredEl.textContent = '0';
  timeEl.textContent = formatTime(duration);
  phaseEl.textContent = phaseNames[0];
  phaseProgress.style.width = '0%';
  playerTag.textContent = name ? `RECORRIDO DE ${name}` : 'RECORRIDO EN CURSO';
  updateInstitutionHelp(institution);
  overlay.classList.add('hidden');
  setup.inert = false;
  game.inert = false;
  setup.classList.add('hidden');
  game.classList.remove('hidden');
  paused = false;
  inInterruption = false;
  revealMode = false;
  lastFrame = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
  if (soundEnabled) startAmbientAudio();
}

function registerGesture(direction) {
  if (!gameState || gameState.ended || paused || inInterruption) return;
  lastAction = { direction, until: performance.now() + 420 };
  const candidates = gameState.coins
    .filter(coin => {
      if (!coin.active || coin.collected || coin.missed || coin.lane !== direction) return false;
      return coin.special ? coin.z < .38 && coin.z > -.12 : coin.z < .29 && coin.z > -.06;
    })
    .sort((a, b) => a.z - b.z);

  if (!candidates.length) {
    hint.textContent = 'Gesto recibido. Sigue observando.';
    setTimeout(() => {
      if (!paused && gameState && !gameState.ended) hint.textContent = 'Muévete cuando una alternativa diga AHORA.';
    }, 700);
    return;
  }
  collectAlternative(candidates.find(coin => coin.special) || candidates[0]);
}

function collectAlternative(coin) {
  coin.collected = true;
  if (coin.special) {
    gameState.specialCaptured = true;
    scoreEl.textContent = currentScore();
    floatScore.textContent = '+250 · INTERRUPCIÓN';
    floatScore.classList.remove('pop');
    void floatScore.offsetWidth;
    floatScore.classList.add('pop');
    playPing(3);
    triggerInterruption();
    return;
  }
  const previousScore = currentScore();
  gameState.discovered += 1;
  scoreEl.textContent = currentScore();
  discoveredEl.textContent = gameState.discovered;
  floatScore.textContent = `+${currentScore() - previousScore}`;
  floatScore.classList.remove('pop');
  void floatScore.offsetWidth;
  floatScore.classList.add('pop');
  hint.textContent = coin.label;
  playPing(coin.kind);
  setTimeout(() => {
    if (!paused && !inInterruption && gameState && !gameState.ended) hint.textContent = 'Muévete cuando una alternativa diga AHORA.';
  }, 1100);
}

function togglePause() {
  if (!gameState || gameState.ended || inInterruption || supportDialog.open) return;
  paused = !paused;
  pauseBtn.setAttribute('aria-label', paused ? 'Reanudar experiencia' : 'Pausar experiencia');
  hint.textContent = paused ? 'La experiencia está en pausa.' : 'Muévete cuando una alternativa diga AHORA.';
}

function advanceInterruption() {
  if (!continueInterruption) return;
  const advance = continueInterruption;
  continueInterruption = null;
  advance();
}

function waitForContinue() {
  return new Promise(resolve => {
    continueInterruption = resolve;
    $('#continueReflection').addEventListener('click', advanceInterruption, { once: true });
  });
}

async function triggerInterruption() {
  if (!gameState || gameState.interruptionDone || gameState.ended) return;
  gameState.interruptionDone = true;
  inInterruption = true;
  paused = true;
  revealMode = true;
  game.inert = true;
  overlay.classList.remove('hidden');

  const steps = [
    ['INTERRUPCIÓN', 'Detente un momento.', 'Respira. Mira más allá del punto central.'],
    ['OTRA PERSPECTIVA', 'Las alternativas seguían ahí.', 'El campo de visión se había reducido; las posibilidades no habían desaparecido.'],
    ['CAMPO ABIERTO', 'No siempre tenemos que ver la salida a solas.', 'Hablar, acompañar y pedir ayuda pueden ampliar nuestra perspectiva.']
  ];

  for (let index = 0; index < steps.length; index++) {
    if (!gameState || gameState.ended) return;
    const [eyebrow, title, copy] = steps[index];
    overlayCard.innerHTML = `
      <p class="eyebrow">${eyebrow} · ${index + 1}/${steps.length}</p>
      <h2>${title}</h2><p>${copy}</p>
      ${index === 1 ? '<div class="reveal-list"><span>HABLAR</span><span>ACOMPAÑAR</span><span>PEDIR AYUDA</span><span>ESCUCHAR</span></div>' : ''}
      <p class="controller-continue">En el móvil, toca cualquier dirección para continuar.</p>
      <div class="overlay-actions"><button id="continueReflection" class="primary">${index === steps.length - 1 ? 'CONTINUAR EL RECORRIDO' : 'CONTINUAR'}</button></div>`;
    $('#continueReflection').focus();
    await waitForContinue();
  }

  overlay.classList.add('hidden');
  continueInterruption = null;
  paused = false;
  inInterruption = false;
  revealMode = false;
  game.inert = false;
  lastFrame = performance.now();
  hint.textContent = 'Tu perspectiva se amplió. Continúa.';
}

async function finish() {
  if (!gameState || gameState.ended) return;
  gameState.ended = true;
  cancelAnimationFrame(raf);
  stopAmbientAudio();
  game.inert = false;
  game.classList.add('hidden');
  overlay.classList.remove('hidden');
  overlayCard.innerHTML = `
    <p class="eyebrow">RECORRIDO COMPLETADO</p>
    <h2>Guardando<br>tu puntaje…</h2>
    <p role="status">Preparando el scoreboard.</p>`;

  const payload = {
    alias: gameState.name,
    discovered: gameState.discovered,
    total: gameState.total,
    specialCaptured: gameState.specialCaptured,
    duration: gameState.duration,
    difficulty: gameState.difficulty
  };
  let entry;
  let leaderboard = [];
  let saveMessage = '';

  try {
    if (gameState.demo) {
      const data = await fetch('/api/scores', { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error();
        return response.json();
      });
      leaderboard = data.scores;
      entry = { ...payload, alias: gameState.name || 'Participante', score: currentScore() };
      saveMessage = 'El modo de prueba no se guarda en el ranking.';
    } else {
      const response = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar el puntaje.');
      entry = data.entry;
      leaderboard = data.leaderboard;
    }
  } catch (error) {
    entry = { ...payload, alias: gameState.name || 'Participante', score: currentScore() };
    saveMessage = `${error.message || 'No se pudo guardar el puntaje.'} El resultado sigue visible en esta pantalla.`;
  }

  renderScoreboard(entry, leaderboard, saveMessage);
}

function renderScoreboard(entry, leaderboard, saveMessage) {
  const institution = gameState.institution
    ? escapeHtml(gameState.institution)
    : 'Habla ahora con el facilitador o con psicología/tutoría de tu institución.';
  const currentInTop = leaderboard.some(item => item.current);
  const rows = leaderboard.map(item => `
    <tr class="${item.current ? 'current-result' : ''}">
      <td><span class="rank-number">${item.rank}</span></td>
      <th scope="row">${escapeHtml(item.alias)}</th>
      <td>${item.discovered}/${item.total}</td>
      <td><span class="special-badge ${item.specialCaptured ? 'reached' : ''}">${item.specialCaptured ? 'Alcanzada' : 'No alcanzada'}</span></td>
      <td class="score-cell">${item.score}</td>
    </tr>`).join('');
  const currentResult = !currentInTop && entry.rank ? `
    <div class="outside-result"><span>Tu resultado · puesto ${entry.rank}</span><strong>${escapeHtml(entry.alias)} · ${entry.score} puntos</strong></div>` : '';
  const reflection = gameState.specialCaptured ? `
    <details class="final-reflection">
      <summary>Conversación final</summary>
      <div class="debrief">
        <p>NO HACE FALTA CONTAR ALGO PERSONAL</p>
        <ol>
          <li>¿Qué cambió cuando el campo de visión se hizo más estrecho?</li>
          <li>¿Cómo ayudó la perspectiva de la persona que acompañaba?</li>
          <li>¿Qué puede ayudarnos a ampliar la perspectiva fuera del juego?</li>
        </ol>
      </div>
    </details>` : '';

  overlayCard.innerHTML = `
    <p class="eyebrow">SCOREBOARD · RECORRIDO COMPLETADO</p>
    <div class="result-layout">
      <section class="current-score-card" aria-label="Resultado actual">
        <small>TU PUNTAJE</small><strong>${entry.score}</strong><span>de 1250 puntos</span>
        <div class="result-details"><span>${entry.discovered}/${entry.total} alternativas</span><span>${entry.specialCaptured ? 'Interrupción alcanzada' : 'Interrupción no alcanzada'}</span></div>
        ${saveMessage ? `<p class="save-message" role="status">${escapeHtml(saveMessage)}</p>` : ''}
      </section>
      <section class="leaderboard-panel" aria-labelledby="scoreboardTitle">
        <div class="leaderboard-heading"><div><small>CLASIFICACIÓN</small><h2 id="scoreboardTitle">Top 10</h2></div><span>${leaderboard.length} resultados visibles</span></div>
        <div class="score-table-wrap">
          <table class="score-table">
            <thead><tr><th scope="col">#</th><th scope="col">Alias</th><th scope="col">Alternativas</th><th scope="col">Interrupción</th><th scope="col">Puntos</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5">Todavía no hay puntajes guardados.</td></tr>'}</tbody>
          </table>
        </div>
        ${currentResult}
      </section>
    </div>
    ${reflection}
    <div class="support-summary"><strong>AYUDA REAL</strong><p>${institution}</p><p>Línea 113, opción 5 · orientación psicológica gratuita, 24 horas.</p><a class="support-link" href="https://www.gob.pe/saludmental" target="_blank" rel="noreferrer">Ver Centros de Salud Mental Comunitaria</a></div>
    <div class="overlay-actions"><button id="again" class="primary">REPETIR RECORRIDO</button><button id="newPlayer" class="secondary">PREPARAR OTRA PERSONA</button></div>`;

  $('#again').addEventListener('click', () => startGame(gameState.demo));
  $('#newPlayer').addEventListener('click', () => {
    overlay.classList.add('hidden');
    setup.inert = false;
    setup.classList.remove('hidden');
    gameState = null;
  });
  $('#again').focus();
}

function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawTunnel(phase, elapsed) {
  const width = innerWidth;
  const height = innerHeight;
  const centerX = width / 2;
  const centerY = height * .51;
  const opening = revealMode ? 1.12 : 1 - phase * .1;
  const colors = [
    ['#173e3a', '#071416'], ['#173430', '#071416'], ['#202b28', '#071112'], ['#273833', '#081617']
  ][phase];
  const background = ctx.createRadialGradient(centerX, centerY, 18, centerX, centerY, Math.max(width, height) * .78);
  background.addColorStop(0, colors[0]);
  background.addColorStop(.48, '#0d2425');
  background.addColorStop(1, colors[1]);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(centerX, centerY);
  for (let index = 0; index < 13; index++) {
    const travel = reducedMotion ? index / 13 : (index / 13 + elapsed * .035 * gameState.backgroundSpeed) % 1;
    const depth = travel * travel;
    const ringWidth = (66 + depth * width * .95) * opening;
    const ringHeight = (44 + depth * height * .8) * opening;
    ctx.strokeStyle = `rgba(${phase < 2 ? '183,243,74' : '255,143,120'},${.055 + travel * .115})`;
    ctx.lineWidth = 1 + travel;
    ctx.beginPath();
    ctx.roundRect(-ringWidth / 2, -ringHeight / 2, ringWidth, ringHeight, 26 + travel * 42);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(235,246,234,.1)';
  ctx.lineWidth = 1;
  for (const direction of ['left', 'up', 'right']) {
    const targetX = centerX + laneX[direction] * width * .42;
    const targetY = centerY + laneY[direction] * height * .36;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.quadraticCurveTo((centerX + targetX) / 2, centerY + 30, targetX, targetY);
    ctx.stroke();
  }

  const particleCount = 22;
  for (let index = 0; index < particleCount; index++) {
    const drift = reducedMotion ? 0 : elapsed * (2 + index % 3) * gameState.backgroundSpeed;
    const x = (index * 173 + drift) % (width + 80) - 40;
    const y = (index * 97 + Math.sin(index) * 40) % height;
    ctx.fillStyle = `rgba(236,246,232,${.05 + (index % 4) * .018})`;
    ctx.beginPath();
    ctx.arc(x, y, 1 + index % 2, 0, Math.PI * 2);
    ctx.fill();
  }

  const edgeStrength = revealMode ? .12 : .22 + phase * .1;
  const vignette = ctx.createRadialGradient(centerX, centerY, Math.min(width, height) * (.24 * opening), centerX, centerY, Math.max(width, height) * .68);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, `rgba(1,8,9,${edgeStrength})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  if (revealMode) drawRevealedAlternatives(centerX, centerY, width, height);
}

function drawRevealedAlternatives(centerX, centerY, width, height) {
  for (let index = 0; index < 18; index++) {
    const angle = (index / 18) * Math.PI * 2;
    const radius = Math.min(width, height) * (.28 + (index % 4) * .045);
    const x = centerX + Math.cos(angle) * radius * 1.5;
    const y = centerY + Math.sin(angle) * radius;
    ctx.fillStyle = index % 2 ? 'rgba(183,243,74,.34)' : 'rgba(255,143,120,.32)';
    ctx.beginPath();
    ctx.arc(x, y, 4 + index % 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCoin(coin) {
  const width = innerWidth;
  const height = innerHeight;
  const centerX = width / 2;
  const centerY = height * .51;
  const nowThreshold = coin.special ? .38 : .29;
  const approach = coin.z <= nowThreshold ? 'AHORA' : coin.z <= .55 ? 'CERCA' : 'LEJOS';
  let x;
  let y;
  let radius;

  if (reducedMotion) {
    x = centerX + laneX[coin.lane] * width * .3;
    y = centerY + laneY[coin.lane] * height * .28;
    radius = (approach === 'AHORA' ? 34 : approach === 'CERCA' ? 27 : 21) + (coin.special ? 5 : 0);
  } else {
    const depth = 1 - coin.z;
    const scale = .16 + depth * 1.35;
    x = centerX + laneX[coin.lane] * width * .34 * scale;
    y = centerY + laneY[coin.lane] * height * .31 * scale;
    radius = 10 + 24 * scale;
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.shadowBlur = approach === 'AHORA' ? 30 : 16;
  ctx.shadowColor = coin.special ? '#fff8ec' : coin.kind === 0 ? '#b7f34a' : coin.kind === 1 ? '#ff8f78' : '#76ddd2';
  ctx.fillStyle = coin.special ? '#fff8ec' : coin.kind === 0 ? '#b7f34a' : coin.kind === 1 ? '#ff8f78' : '#76ddd2';
  ctx.beginPath();
  if (coin.special) {
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
  } else if (coin.kind === 1) {
    ctx.rotate(Math.PI / 4);
    ctx.roundRect(-radius * .72, -radius * .72, radius * 1.44, radius * 1.44, radius * .28);
  } else {
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.shadowBlur = 0;
  if (coin.special) {
    ctx.strokeStyle = '#ff8f78';
    ctx.lineWidth = Math.max(3, radius * .12);
    ctx.beginPath();
    ctx.arc(0, 0, radius * .68, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = '#10201c';
  ctx.lineWidth = Math.max(2, radius * .09);
  ctx.beginPath();
  if (coin.special) {
    ctx.moveTo(-radius * .18, -radius * .28);
    ctx.lineTo(-radius * .18, radius * .28);
    ctx.moveTo(radius * .18, -radius * .28);
    ctx.lineTo(radius * .18, radius * .28);
  } else {
    ctx.moveTo(-radius * .28, 0);
    ctx.lineTo(radius * .28, 0);
    ctx.moveTo(0, -radius * .28);
    ctx.lineTo(0, radius * .28);
  }
  ctx.stroke();
  ctx.restore();

  if (coin.z <= (coin.special ? .68 : .55)) {
    ctx.save();
    ctx.font = `800 ${approach === 'AHORA' ? 12 : 10}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const approachLabel = coin.special ? `INTERRUPCIÓN · ${approach}` : approach;
    const labelWidth = ctx.measureText(approachLabel).width + 20;
    ctx.fillStyle = approach === 'AHORA' ? 'rgba(255,248,236,.96)' : 'rgba(7,20,22,.82)';
    ctx.beginPath();
    ctx.roundRect(x - labelWidth / 2, y - radius - 29, labelWidth, 21, 11);
    ctx.fill();
    ctx.fillStyle = approach === 'AHORA' ? '#071416' : '#fff8ec';
    ctx.fillText(approachLabel, x, y - radius - 18.5);
    ctx.restore();
  }
}

function frame(now) {
  if (!gameState || gameState.ended) return;
  const delta = Math.min(.04, (now - lastFrame) / 1000 || 0);
  lastFrame = now;
  if (!paused) gameState.elapsed += delta;

  const progress = Math.min(1, gameState.elapsed / gameState.duration);
  const phase = progress < .25 ? 0 : progress < .5 ? 1 : progress < .75 ? 2 : 3;
  phaseEl.textContent = phaseNames[phase];
  phaseProgress.style.width = `${progress * 100}%`;
  timeEl.textContent = formatTime(Math.max(0, gameState.duration - gameState.elapsed));

  if (!paused) {
    for (const coin of gameState.coins) {
      if (!coin.active && !coin.collected && gameState.elapsed >= coin.spawnAt) coin.active = true;
      if (coin.active && !coin.collected && !coin.missed) {
        coin.z -= delta * gameState.speed * (1 + phase * .055) * (coin.special ? .7 : 1);
        if (coin.z < (coin.special ? -.12 : -.08)) coin.missed = true;
      }
    }
    if (gameState.elapsed >= gameState.duration) {
      finish();
      return;
    }
  }

  drawTunnel(phase, gameState.elapsed);
  gameState.coins
    .filter(coin => coin.active && !coin.collected && !coin.missed)
    .sort((a, b) => b.z - a.z)
    .forEach(drawCoin);

  if (lastAction && lastAction.until > now) {
    const centerX = innerWidth / 2;
    const centerY = innerHeight * .51;
    const x = centerX + laneX[lastAction.direction] * innerWidth * .22;
    const y = centerY + laneY[lastAction.direction] * innerHeight * .2;
    ctx.strokeStyle = 'rgba(255,248,236,.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 32, 0, Math.PI * 2);
    ctx.stroke();
  }
  raf = requestAnimationFrame(frame);
}

function formatTime(seconds) {
  const value = Math.ceil(seconds);
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function startAmbientAudio() {
  if (!soundEnabled) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  if (!audioContext) {
    audioContext = new AudioContext();
    ambientGain = audioContext.createGain();
    ambientGain.gain.value = 0;
    ambientGain.connect(audioContext.destination);
    [82, 123].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = index ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      gain.gain.value = index ? .22 : .3;
      oscillator.connect(gain).connect(ambientGain);
      oscillator.start();
    });
  }
  audioContext.resume();
  ambientGain.gain.setTargetAtTime(.022, audioContext.currentTime, .8);
}

function stopAmbientAudio() {
  if (ambientGain && audioContext) ambientGain.gain.setTargetAtTime(0, audioContext.currentTime, .2);
}

function playPing(kind) {
  if (!soundEnabled || !audioContext || !ambientGain) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = [520, 610, 690, 820][kind] || 520;
  gain.gain.setValueAtTime(.045, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .32);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + .34);
}

function updateSoundButtons() {
  $$('.sound-toggle').forEach(button => {
    button.setAttribute('aria-pressed', String(soundEnabled));
    button.setAttribute('aria-label', soundEnabled ? 'Silenciar sonido' : 'Activar sonido');
    const label = button.querySelector('span');
    if (label) label.textContent = soundEnabled ? 'Silenciar sonido' : 'Activar sonido';
  });
}

function updateMotionButtons() {
  document.documentElement.classList.toggle('reduced-motion', reducedMotion);
  $$('.motion-toggle').forEach(button => {
    button.setAttribute('aria-pressed', String(reducedMotion));
    button.setAttribute('aria-label', reducedMotion ? 'Usar movimiento normal' : 'Usar movimiento reducido');
    const label = button.querySelector('span');
    if (label) label.textContent = reducedMotion ? 'Movimiento reducido' : 'Movimiento normal';
  });
}

$$('.sound-toggle').forEach(button => button.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  updateSoundButtons();
  soundEnabled ? startAmbientAudio() : stopAmbientAudio();
}));

$$('.motion-toggle').forEach(button => button.addEventListener('click', () => {
  reducedMotion = !reducedMotion;
  updateMotionButtons();
}));

motionPreference.addEventListener?.('change', event => {
  reducedMotion = event.matches;
  updateMotionButtons();
});

function updateInstitutionHelp(value = institutionInput.value.trim()) {
  $('#institutionHelp').textContent = value
    ? `Apoyo en tu institución: ${value}.`
    : 'Habla ahora con el facilitador o con psicología/tutoría de tu institución.';
}

$$('.support-toggle').forEach(button => button.addEventListener('click', () => {
  updateInstitutionHelp(gameState?.institution);
  supportWasPaused = paused;
  if (gameState && !gameState.ended) paused = true;
  supportDialog.showModal();
}));

supportDialog.addEventListener('close', () => {
  if (gameState && !gameState.ended && !inInterruption) {
    paused = supportWasPaused;
    lastFrame = performance.now();
  }
});

clearScoreboardBtn.addEventListener('click', async () => {
  if (!confirm('¿Borrar todos los puntajes guardados? Esta acción no se puede deshacer.')) return;
  const scoreboardStatus = $('#scoreboardStatus');
  clearScoreboardBtn.disabled = true;
  try {
    const response = await fetch('/api/scores', { method: 'DELETE' });
    if (!response.ok) throw new Error();
    scoreboardStatus.textContent = 'Scoreboard borrado. El próximo recorrido iniciará un ranking nuevo.';
  } catch {
    scoreboardStatus.textContent = 'No se pudo borrar el scoreboard. Intenta de nuevo.';
  } finally {
    clearScoreboardBtn.disabled = false;
  }
});

startBtn.addEventListener('click', () => showPractice(false));
demoBtn.addEventListener('click', () => showPractice(true));
pauseBtn.addEventListener('click', togglePause);
quitBtn.addEventListener('click', finish);
window.addEventListener('resize', resize);
window.addEventListener('keydown', event => {
  if (!gameState || gameState.ended || inInterruption || supportDialog.open) return;
  if (event.key === 'ArrowLeft') registerGesture('left');
  if (event.key === 'ArrowUp') registerGesture('up');
  if (event.key === 'ArrowRight') registerGesture('right');
  if (event.key === ' ') {
    event.preventDefault();
    togglePause();
  }
});

resize();
updateMotionButtons();
updateSoundButtons();
updateReadiness();
createRoom();
