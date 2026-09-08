const $ = selector => document.querySelector(selector);
const codeInput = $('#codeInput');
const joinBtn = $('#joinBtn');
const joinError = $('#joinError');
const joinPanel = $('#joinPanel');
const controls = $('#controls');
const pauseBtn = $('#pauseBtn');
const actionStatus = $('#actionStatus');
const status = $('#controllerStatus');
const roomLabel = $('#controllerRoom');
const jumpBtns = [...document.querySelectorAll('.jump-btn')];

let room = '';
let busy = false;
let paused = false;

async function request(path, options = {}) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No fue posible conectar.');
  return data;
}

function post(path, body = {}) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function setConnected(connected) {
  status.className = `status ${connected ? 'connected' : 'disconnected'}`;
  status.textContent = connected ? 'Conectado' : 'Reconectando';
}

async function join() {
  room = codeInput.value.replace(/\D/g, '').slice(0, 4);
  joinError.textContent = '';
  if (room.length !== 4) {
    joinError.textContent = 'Escribe los cuatro dígitos de la sala.';
    codeInput.focus();
    return;
  }

  joinBtn.disabled = true;
  joinBtn.textContent = 'CONECTANDO…';
  try {
    await post(`/api/rooms/${room}/join`);
    roomLabel.textContent = `Sala ${room}`;
    joinPanel.classList.add('hidden');
    controls.classList.remove('hidden');
    setConnected(true);
    heartbeat();
  } catch (error) {
    joinError.textContent = error.message;
  } finally {
    joinBtn.disabled = false;
    joinBtn.textContent = 'CONECTAR';
  }
}

joinBtn.addEventListener('click', join);
codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 4);
  joinError.textContent = '';
});
codeInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') join();
});

async function sendDirection(button) {
  if (!room || busy) return;
  busy = true;
  jumpBtns.forEach(item => { item.disabled = true; });
  const action = button.dataset.action;
  const direction = action === 'left' ? 'Izquierda' : action === 'right' ? 'Derecha' : 'Arriba';

  try {
    await post(`/api/rooms/${room}/actions`, { action });
    navigator.vibrate?.(22);
    button.classList.add('sent');
    actionStatus.textContent = `${direction} registrada.`;
    setTimeout(() => button.classList.remove('sent'), 260);
  } catch {
    setConnected(false);
    actionStatus.textContent = 'No se registró. Comprueba la conexión.';
  } finally {
    busy = false;
    jumpBtns.forEach(item => { item.disabled = false; });
  }
}

jumpBtns.forEach(button => button.addEventListener('click', () => sendDirection(button)));

pauseBtn.addEventListener('click', async () => {
  try {
    await post(`/api/rooms/${room}/actions`, { action: 'pause' });
    paused = !paused;
    pauseBtn.querySelector('span').textContent = paused ? 'REANUDAR EXPERIENCIA' : 'PAUSAR EXPERIENCIA';
    actionStatus.textContent = paused ? 'Experiencia en pausa.' : 'Experiencia reanudada.';
    navigator.vibrate?.(35);
  } catch {
    setConnected(false);
    actionStatus.textContent = 'No se pudo cambiar la pausa.';
  }
});

async function heartbeat() {
  if (!room) return;
  try {
    await request(`/api/rooms/${room}/status`, { cache: 'no-store' });
    setConnected(true);
  } catch {
    setConnected(false);
  }
  setTimeout(heartbeat, 2200);
}
