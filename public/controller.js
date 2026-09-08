const $ = (s) => document.querySelector(s);
const codeInput = $('#codeInput');
const joinBtn = $('#joinBtn');
const joinError = $('#joinError');
const joinPanel = $('#joinPanel');
const controls = $('#controls');
const validateBtn = $('#validateBtn');
const pauseBtn = $('#pauseBtn');
const actionStatus = $('#actionStatus');
const meter = $('#validationMeter i');
const status = $('#controllerStatus');
const roomLabel = $('#controllerRoom');
const jumpBtns = [...document.querySelectorAll('.jump-btn')];

let room = '';
let armedAction = null;
let armedAt = 0;
let raf = 0;
const VALID_MS = 1000;

async function post(path, body = {}) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No fue posible conectar');
  return data;
}

joinBtn.addEventListener('click', async () => {
  room = codeInput.value.replace(/\D/g, '').slice(0,4);
  joinError.textContent = '';
  if (room.length !== 4) { joinError.textContent = 'Ingresa un código de 4 dígitos.'; return; }
  try {
    await post(`/api/rooms/${room}/join`);
    roomLabel.textContent = `Sala ${room}`;
    joinPanel.classList.add('hidden');
    controls.classList.remove('hidden');
    heartbeat();
  } catch (e) { joinError.textContent = e.message; }
});

codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.replace(/\D/g, '').slice(0,4); });

function clearArm(message = 'Esperando salto…') {
  armedAction = null;
  validateBtn.disabled = true;
  jumpBtns.forEach(b => b.classList.remove('armed'));
  cancelAnimationFrame(raf);
  meter.style.width = '0%';
  actionStatus.textContent = message;
}

function animateMeter() {
  if (!armedAction) return;
  const elapsed = performance.now() - armedAt;
  const pct = Math.max(0, 100 - (elapsed / VALID_MS) * 100);
  meter.style.width = `${pct}%`;
  if (elapsed >= VALID_MS) {
    clearArm('Salto no validado: acción descartada.');
    return;
  }
  raf = requestAnimationFrame(animateMeter);
}

jumpBtns.forEach(btn => btn.addEventListener('click', () => {
  if (!room) return;
  clearArm('');
  armedAction = btn.dataset.action;
  armedAt = performance.now();
  btn.classList.add('armed');
  validateBtn.disabled = false;
  actionStatus.textContent = 'Valida el salto ahora.';
  animateMeter();
}));

validateBtn.addEventListener('click', async () => {
  if (!armedAction) return;
  const elapsed = performance.now() - armedAt;
  if (elapsed > VALID_MS) { clearArm('Salto fuera de ventana: acción descartada.'); return; }
  const action = armedAction;
  try {
    await post(`/api/rooms/${room}/actions`, { action });
    await post(`/api/rooms/${room}/actions`, { action: 'validate' });
    navigator.vibrate?.(35);
    clearArm(`Salto ${action === 'left' ? 'izquierda' : action === 'right' ? 'derecha' : 'arriba'} registrado.`);
  } catch {
    status.className = 'status disconnected';
    status.textContent = 'Desconectado';
    clearArm('No se pudo registrar la acción.');
  }
});

pauseBtn.addEventListener('click', async () => {
  try { await post(`/api/rooms/${room}/actions`, { action: 'pause' }); }
  catch {}
});

async function heartbeat() {
  if (!room) return;
  try {
    await post(`/api/rooms/${room}/join`);
    status.className = 'status connected';
    status.textContent = 'Conectado';
  } catch {
    status.className = 'status disconnected';
    status.textContent = 'Desconectado';
  }
  setTimeout(heartbeat, 2200);
}
