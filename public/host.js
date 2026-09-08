const $ = (s) => document.querySelector(s);
const setup = $('#setup'), game = $('#game'), overlay = $('#overlay'), overlayCard = $('#overlayCard');
const roomCodeEl = $('#roomCode'), connectionBadge = $('#connectionBadge');
const startBtn = $('#startBtn'), demoBtn = $('#demoBtn'), quitBtn = $('#quitBtn');
const canvas = $('#tunnelCanvas'), ctx = canvas.getContext('2d');
const scoreEl = $('#score'), timeEl = $('#time'), phaseEl = $('#phase'), gameConnection = $('#gameConnection');
const floatScore = $('#floatScore'), hint = $('#hint'), playerTag = $('#playerTag');

let room = '';
let seq = 0;
let controllerConnected = false;
let gameState = null;
let raf = 0;
let lastFrame = 0;
let lastAction = null;
let pendingDirection = null;
let paused = false;
let inInterruption = false;

const laneX = { left: -0.58, up: 0, right: 0.58 };
const laneY = { left: 0.22, up: -0.52, right: 0.22 };
const labels = {
  5: ['Reconocer cómo me siento','Escribir lo que siento','Hablar con alguien','Acercarme a una persona de confianza','Aceptar conversar'],
  10: ['Decir: necesito ayuda','Hablar con un familiar','Hablar con mi tutor','Acercarme a un docente','Pedir que alguien me acompañe'],
  15: ['Hablar con psicología','Pedir ayuda profesional','Decírselo a un adulto','Aceptar acompañamiento','Pedir ayuda para buscar apoyo']
};

async function createRoom() {
  const res = await fetch('/api/rooms', { method: 'POST' });
  const data = await res.json();
  room = data.code;
  roomCodeEl.textContent = room;
  poll();
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
      for (const evt of data.events) handleEvent(evt);
    }
  } catch {}
  setTimeout(poll, 220);
}

function updateConnection() {
  connectionBadge.className = `status ${controllerConnected ? 'connected' : 'disconnected'}`;
  connectionBadge.textContent = controllerConnected ? 'Controlador conectado' : 'Sin controlador';
  gameConnection.textContent = controllerConnected ? 'CONECTADO' : 'SIN CONTROLADOR';
}

function handleEvent(evt) {
  if (evt.type !== 'action' || !gameState || gameState.ended) return;
  if (evt.action === 'pause') { paused = !paused; hint.textContent = paused ? 'PAUSA' : 'SALTA cuando una alternativa llegue a tu zona.'; return; }
  if (['left','up','right'].includes(evt.action)) {
    pendingDirection = { dir: evt.action, at: evt.at };
    return;
  }
  if (evt.action === 'validate' && pendingDirection && Math.abs(evt.at - pendingDirection.at) <= 1200) {
    registerJump(pendingDirection.dir);
    pendingDirection = null;
  }
}

function phaseFor(progress) {
  if (progress < .25) return 0;
  if (progress < .50) return 1;
  if (progress < .75) return 2;
  return 3;
}

const phaseNames = ['MUCHAS ALTERNATIVAS','MENOS ALTERNATIVAS PERCIBIDAS','VISIÓN DE TÚNEL','INTERRUPCIÓN'];

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function buildStandardPlan(duration, difficulty) {
  // 70 oportunidades pedagógicas. Algunas contienen varias monedas en la misma trayectoria.
  // Balance estándar: F1=150, F2=160, F3=125, F4=290; total=725 puntos.
  // Distribución global: 44x5, 31x10, 13x15 = 88 monedas.
  const rand = seeded(4821 + duration + ({easy:1,medium:7,hard:13}[difficulty] || 7));
  const opportunityCounts = [23,18,14,15];
  const phaseDistributions = [
    { 5:18, 10:6,  15:0 },  // 24 monedas, 150 puntos
    { 5:9,  10:10, 15:1 },  // 20 monedas, 160 puntos
    { 5:11, 10:4,  15:2 },  // 17 monedas, 125 puntos
    { 5:6,  10:11, 15:10 }  // 27 monedas, 290 puntos
  ];
  const plan = [];
  let id = 0;

  for (let p = 0; p < 4; p++) {
    const values = [];
    for (const value of [5,10,15]) values.push(...Array(phaseDistributions[p][value]).fill(value));
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }

    const opp = opportunityCounts[p];
    const bundles = Array(opp).fill(1);
    for (let e = 0; e < values.length - opp; e++) bundles[(e * 3 + p) % opp]++;

    let valueIdx = 0;
    for (let i = 0; i < opp; i++) {
      const phaseStart = p * duration / 4;
      const phaseLen = duration / 4;
      const t = phaseStart + 5 + (i / Math.max(1, opp - 1)) * (phaseLen - 9) + (rand() - .5) * 1.6;
      let lane;
      const r = rand();
      if (p === 0) lane = r < .42 ? 'up' : r < .71 ? 'left' : 'right';
      else if (p === 1) lane = r < .28 ? 'up' : r < .64 ? 'left' : 'right';
      else lane = r < .18 ? 'up' : r < .59 ? 'left' : 'right';

      for (let b = 0; b < bundles[i]; b++) {
        const value = values[valueIdx++];
        // En fases 2–4 las monedas de mayor valor tienden a laterales.
        let coinLane = lane;
        if (p > 0 && value === 15 && lane === 'up') coinLane = (i % 2 === 0 ? 'left' : 'right');
        plan.push({
          id: ++id, phase: p, spawnAt: t + b * .06, lane: coinLane, value,
          label: labels[value][Math.floor(rand() * labels[value].length)],
          z: 1.0 + b * .035, active: false, collected: false, missed: false,
          peripheral: p > 0 && coinLane !== 'up' && (i % (p === 1 ? 3 : 2) === 0)
        });
      }
    }
  }

  // INTERRUPCIÓN: no da puntos y aparece en la cuarta fase.
  plan.push({ id: ++id, phase: 3, spawnAt: duration * .80, lane: 'up', value: 0, label: 'INTERRUPCIÓN', z: 1, active: false, collected: false, missed: false, special: true });
  return plan.sort((a,b) => a.spawnAt - b.spawnAt);
}

function startGame(demo = false) {
  const duration = Number($('#duration').value);
  const difficulty = $('#difficulty').value;
  const name = $('#playerName').value.trim() || 'Jugador';
  gameState = {
    duration, difficulty, name, score: 0, elapsed: 0, ended: false, demo,
    coins: buildStandardPlan(duration, difficulty),
    speed: difficulty === 'easy' ? .24 : difficulty === 'hard' ? .32 : .28,
    interruptionDone: false
  };
  scoreEl.textContent = '0';
  timeEl.textContent = formatTime(duration);
  phaseEl.textContent = phaseNames[0];
  playerTag.textContent = name;
  setup.classList.add('hidden');
  overlay.classList.add('hidden');
  game.classList.remove('hidden');
  paused = false; inInterruption = false; pendingDirection = null;
  lastFrame = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
}

function registerJump(dir) {
  if (!gameState || gameState.ended || paused || inInterruption) return;
  lastAction = { dir, until: performance.now() + 320 };
  const candidates = gameState.coins.filter(c => c.active && !c.collected && !c.missed && c.lane === dir && c.z < .24 && c.z > -.03);
  if (!candidates.length) { hint.textContent = 'Salto registrado. Sigue observando las alternativas.'; setTimeout(() => { if (!paused) hint.textContent='SALTA cuando una alternativa llegue a tu zona.'; }, 650); return; }
  const targetGroupZ = candidates[0].z;
  const caught = candidates.filter(c => Math.abs(c.z - targetGroupZ) < .07);
  for (const coin of caught) collectCoin(coin);
}

function collectCoin(coin) {
  coin.collected = true;
  if (coin.special) { triggerInterruption(); return; }
  gameState.score += coin.value;
  scoreEl.textContent = gameState.score;
  floatScore.textContent = `+${coin.value}`;
  floatScore.classList.remove('pop'); void floatScore.offsetWidth; floatScore.classList.add('pop');
  hint.textContent = coin.label;
  setTimeout(() => { if (!paused && !inInterruption) hint.textContent='SALTA cuando una alternativa llegue a tu zona.'; }, 900);
  if (gameState.score >= 500) finish(true);
}

function triggerInterruption() {
  if (gameState.interruptionDone || gameState.ended) return;
  gameState.interruptionDone = true;
  inInterruption = true;
  paused = true;
  showInterruptionSequence();
}

async function showInterruptionSequence() {
  const steps = [
    ['MIRA TODO LO QUE HABÍA.','Había alternativas fuera del campo de visión frontal.'],
    ['LAS ALTERNATIVAS NO HABÍAN DESAPARECIDO.','La perspectiva limitada hacía más difícil percibirlas.'],
    ['TU CAMPO DE VISIÓN SE HABÍA REDUCIDO.','Una visión más amplia permite notar más posibilidades.'],
    ['A VECES NECESITAMOS INTERRUMPIR EL TÚNEL PARA VOLVER A VER LAS ALTERNATIVAS.','La ayuda externa puede ampliar nuestra perspectiva.']
  ];
  overlay.classList.remove('hidden');
  for (let i = 0; i < steps.length; i++) {
    overlayCard.innerHTML = `<div class="eyebrow">INTERRUPCIÓN</div><h2>${steps[i][0]}</h2><p>${steps[i][1]}</p>${i === 3 ? '<div class="overlay-actions"><span class="option-chip">HABLAR</span><span class="option-chip">ACOMPAÑAR</span><span class="option-chip">PEDIR AYUDA</span></div><p>Pedir ayuda también es una forma de interrumpir el túnel.</p>' : ''}`;
    await sleep(i === 3 ? 3300 : 2100);
    if (!gameState || gameState.ended) return;
  }
  overlay.classList.add('hidden');
  paused = false;
  inInterruption = false;
  hint.textContent = 'La perspectiva se amplió. Continúa.';
}

function finish(success) {
  if (!gameState || gameState.ended) return;
  gameState.ended = true;
  cancelAnimationFrame(raf);
  game.classList.add('hidden');
  overlay.classList.remove('hidden');
  const title = success ? 'SALIDA ENCONTRADA' : 'TIEMPO TERMINADO';
  const intro = success
    ? '<p class="big-line">No siempre tenemos que encontrarla solos.</p><p>A veces necesitamos que alguien nos ayude a verla.</p>'
    : '<p class="big-line">¿Notaste que cada vez era más difícil encontrar las monedas?</p><p>Eso no significa necesariamente que hubiera menos alternativas. Significa que tu campo de visión era más limitado.</p><p>Cuando no podemos ver todas las opciones, pedir ayuda puede ayudarnos a ampliar la perspectiva.</p>';
  overlayCard.innerHTML = `
    <div class="eyebrow">RESULTADO</div><h2>${title}</h2>${intro}
    <div class="debrief">
      <strong>¿Qué ocurrió?</strong>
      <ol>
        <li>¿En qué momento te resultó más difícil encontrar monedas?</li>
        <li>¿Qué sentías cuando tus compañeros te decían una dirección que tú no podías ver?</li>
        <li>¿Qué ocurrió cuando apareció la perspectiva amplia?</li>
        <li>¿Había realmente pocas monedas?</li>
        <li>¿Qué cambió: las alternativas o tu capacidad para percibirlas?</li>
        <li>¿Qué importancia tuvo escuchar a otras personas?</li>
      </ol>
    </div>
    <p class="big-line">NO SIEMPRE TENEMOS QUE VER LA SALIDA SOLOS.</p>
    <p>Hablar puede ayudar. Acompañar puede ayudar. Pedir ayuda puede ayudar.</p>
    <p><strong>SI NO PUEDES VER TODAS LAS ALTERNATIVAS, NO TIENES QUE ENCONTRARLAS SOLO.</strong></p>
    <div class="overlay-actions"><button id="again" class="primary">JUGAR DE NUEVO</button><button id="newPlayer" class="secondary">NUEVO JUGADOR</button></div>`;
  $('#again').onclick = () => startGame(gameState.demo);
  $('#newPlayer').onclick = () => { overlay.classList.add('hidden'); setup.classList.remove('hidden'); gameState = null; };
}

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(innerWidth * dpr); canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = innerWidth+'px'; canvas.style.height = innerHeight+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener('resize', resize); resize();

function drawTunnel(phase, elapsed) {
  const w = innerWidth, h = innerHeight;
  const g = ctx.createRadialGradient(w/2,h/2,30,w/2,h/2,Math.max(w,h)*.75);
  const outer = ['#0d2a46','#132342','#171d3e','#16234d'][phase];
  g.addColorStop(0,'#0d2038'); g.addColorStop(.55,outer); g.addColorStop(1,'#030810');
  ctx.fillStyle = g; ctx.fillRect(0,0,w,h);

  const cx=w/2, cy=h*.52;
  const rings = 14;
  for(let i=0;i<rings;i++){
    const t=(i/rings + (elapsed*.06)% (1/rings))%1;
    const ease=t*t;
    const rw=60 + ease*w*.86, rh=40 + ease*h*.72;
    ctx.strokeStyle=`rgba(${phase<2?'92,186,255':'145,122,255'},${.08 + t*.15})`;
    ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.roundRect(cx-rw/2,cy-rh/2,rw,rh,24+t*30); ctx.stroke();
  }
  // Carriles discretos, visibles para el público.
  ctx.strokeStyle='rgba(180,230,255,.08)'; ctx.lineWidth=1;
  for (const dir of ['left','up','right']) {
    const tx=cx + laneX[dir]*w*.38, ty=cy + laneY[dir]*h*.34;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(tx,ty); ctx.stroke();
  }
  // Vignette moderada: nunca horror/negro total.
  const vignette = ctx.createRadialGradient(cx,cy,Math.min(w,h)*(.22 - phase*.02),cx,cy,Math.max(w,h)*(.72 - phase*.03));
  vignette.addColorStop(0,'rgba(0,0,0,0)'); vignette.addColorStop(1,`rgba(0,5,15,${.18+phase*.05})`);
  ctx.fillStyle=vignette; ctx.fillRect(0,0,w,h);
}

function drawCoin(c) {
  const w=innerWidth,h=innerHeight,cx=w/2,cy=h*.52;
  const depth = 1 - c.z;
  const scale = .18 + depth*1.35;
  const x = cx + laneX[c.lane] * w * .34 * scale;
  const y = cy + laneY[c.lane] * h * .31 * scale;
  const r = 9 + 27*scale;
  ctx.save();
  ctx.translate(x,y);
  const pulse = 1 + Math.sin(performance.now()/180 + c.id)*.05;
  ctx.scale(pulse,pulse);
  ctx.shadowBlur = c.special ? 34 : 20;
  ctx.shadowColor = c.special ? '#ffffff' : c.value===15 ? '#b493ff' : c.value===10 ? '#55e5dc' : '#65b6ff';
  ctx.fillStyle = c.special ? 'rgba(245,251,255,.96)' : c.value===15 ? '#9b7bff' : c.value===10 ? '#53e5dc' : '#4e9cff';
  ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
  ctx.shadowBlur=0;
  ctx.fillStyle = c.special ? '#13233b' : '#041522';
  ctx.font = `900 ${Math.max(10,r*.55)}px system-ui`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(c.special ? 'I' : `+${c.value}`,0,0);
  ctx.restore();
}

function frame(now) {
  if (!gameState || gameState.ended) return;
  const dt = Math.min(.04, (now-lastFrame)/1000 || 0); lastFrame=now;
  if (!paused) gameState.elapsed += dt;
  const progress = Math.min(1, gameState.elapsed/gameState.duration);
  const phase = phaseFor(progress);
  phaseEl.textContent = phaseNames[phase];
  timeEl.textContent = formatTime(Math.max(0, gameState.duration - gameState.elapsed));

  if (!paused) {
    for (const c of gameState.coins) {
      if (!c.active && !c.collected && gameState.elapsed >= c.spawnAt) c.active = true;
      if (c.active && !c.collected && !c.missed) {
        const phaseSpeed = gameState.speed * (1 + phase*.07);
        c.z -= dt*phaseSpeed;
        if (c.z < -.08) c.missed = true;
      }
    }
    if (gameState.elapsed >= gameState.duration) { finish(gameState.score >= 500); return; }
  }

  drawTunnel(phase, gameState.elapsed);
  const visible = gameState.coins.filter(c=>c.active&&!c.collected&&!c.missed).sort((a,b)=>b.z-a.z);
  for (const c of visible) drawCoin(c);

  if (lastAction && lastAction.until > now) {
    ctx.save(); ctx.globalAlpha=.45; ctx.strokeStyle='#d9ffff'; ctx.lineWidth=4;
    const w=innerWidth,h=innerHeight,cx=w/2,cy=h*.52;
    const x=cx+laneX[lastAction.dir]*w*.25, y=cy+laneY[lastAction.dir]*h*.24;
    ctx.beginPath(); ctx.arc(x,y,34,0,Math.PI*2); ctx.stroke(); ctx.restore();
  }
  raf=requestAnimationFrame(frame);
}

function formatTime(sec) { sec=Math.ceil(sec); return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

startBtn.addEventListener('click',()=>startGame(false));
demoBtn.addEventListener('click',()=>startGame(true));
quitBtn.addEventListener('click',()=>finish(gameState?.score>=500));

// Demo local: flechas + espacio permiten probar sin teléfono.
window.addEventListener('keydown',e=>{
  if (!gameState || gameState.ended) return;
  if (e.key==='ArrowLeft') registerJump('left');
  if (e.key==='ArrowUp') registerJump('up');
  if (e.key==='ArrowRight') registerJump('right');
  if (e.key===' ') { paused=!paused; e.preventDefault(); }
  if ((e.key==='i'||e.key==='I') && gameState.demo) triggerInterruption();
});

createRoom();
