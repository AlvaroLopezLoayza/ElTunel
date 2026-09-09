const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { after, before, test } = require('node:test');
const scoresFile = path.join(os.tmpdir(), `el-tunel-scores-${process.pid}.json`);
process.env.SCORES_FILE = scoresFile;
const { server } = require('./server');

let baseUrl;

before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(scoresFile, { force: true });
});

function postScore(body) {
  return fetch(`${baseUrl}/api/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function reloadScores(file) {
  return spawnSync(process.execPath, ['-e', "process.stdout.write(JSON.stringify(require('./server').rankedScores()))"], {
    cwd: __dirname,
    env: { ...process.env, SCORES_FILE: file },
    encoding: 'utf8'
  });
}

const validScore = {
  alias: 'Sol',
  discovered: 5,
  total: 10,
  specialCaptured: true,
  duration: 180,
  difficulty: 'medium'
};

test('crea una sala y registra cada dirección con un solo evento', async () => {
  const created = await fetch(`${baseUrl}/api/rooms`, { method: 'POST' });
  assert.equal(created.status, 201);
  const { code } = await created.json();
  assert.match(code, /^\d{4}$/);

  const joined = await fetch(`${baseUrl}/api/rooms/${code}/join`, { method: 'POST' });
  assert.equal(joined.status, 200);

  const action = await fetch(`${baseUrl}/api/rooms/${code}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'left' })
  });
  assert.equal(action.status, 200);

  const events = await fetch(`${baseUrl}/api/rooms/${code}/events?since=0`).then(res => res.json());
  assert.equal(events.events.filter(event => event.action === 'left').length, 1);

  const oldValidation = await fetch(`${baseUrl}/api/rooms/${code}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'validate' })
  });
  assert.equal(oldValidation.status, 400);
});

test('publica la interfaz y la información de red', async () => {
  const host = await fetch(`${baseUrl}/host`);
  assert.equal(host.status, 200);
  assert.match(await host.text(), /id="score"/);

  const network = await fetch(`${baseUrl}/api/network`).then(res => res.json());
  assert.ok(Array.isArray(network.controllerUrls));
});

test('la moneda especial es el único disparador y el fondo usa la velocidad elegida', () => {
  const script = fs.readFileSync(path.join(__dirname, 'public', 'host.js'), 'utf8');
  const markup = fs.readFileSync(path.join(__dirname, 'public', 'host.html'), 'utf8');
  assert.match(script, /spawnAt: duration \* \.76/);
  assert.match(script, /coin\.special \? coin\.z < \.38 && coin\.z > -\.12/);
  assert.match(script, /coin\.special \? \.7 : 1/);
  assert.equal((script.match(/triggerInterruption\(\);/g) || []).length, 1);
  assert.doesNotMatch(script, /progress >= \.76/);
  assert.match(markup, /id="backgroundSpeed"/);
  assert.match(script, /elapsed \* \.035 \* gameState\.backgroundSpeed/);
  assert.match(script, /reducedMotion \? 0 : elapsed \* \(2 \+ index % 3\) \* gameState\.backgroundSpeed/);
});

test('las direcciones del móvil avanzan cada diálogo de interrupción', () => {
  const script = fs.readFileSync(path.join(__dirname, 'public', 'host.js'), 'utf8');
  const controller = fs.readFileSync(path.join(__dirname, 'public', 'controller.html'), 'utf8');
  assert.match(script, /if \(inInterruption\) return advanceInterruption\(\)/);
  assert.match(script, /continueInterruption = resolve/);
  assert.match(script, /toca cualquier dirección para continuar/);
  assert.match(controller, /En los diálogos, cualquier dirección avanza/);
});

test('calcula, persiste y ordena puntajes sin confiar en el cliente', async () => {
  await fetch(`${baseUrl}/api/scores`, { method: 'DELETE' });

  const first = await postScore(validScore);
  assert.equal(first.status, 201);
  const firstData = await first.json();
  assert.equal(firstData.entry.score, 750);
  assert.equal(firstData.entry.rank, 1);

  const manipulated = await postScore({ ...validScore, score: 1250 });
  assert.equal(manipulated.status, 400);
  const invalid = await Promise.all([
    postScore({ ...validScore, discovered: 11 }),
    postScore({ ...validScore, total: 0 }),
    postScore({ ...validScore, duration: 60 }),
    postScore({ ...validScore, specialCaptured: 'sí' })
  ]);
  assert.deepEqual(invalid.map(response => response.status), [400, 400, 400, 400]);

  await postScore({ ...validScore, alias: 'Luz' });
  await postScore({ ...validScore, alias: 'Mar', discovered: 10, specialCaptured: false });
  const minimum = await postScore({ ...validScore, alias: '', discovered: 0, specialCaptured: false });
  assert.equal((await minimum.json()).entry.score, 0);
  const maximum = await postScore({ ...validScore, alias: 'Max', discovered: 10 });
  assert.equal((await maximum.json()).entry.score, 1250);

  const ranking = await fetch(`${baseUrl}/api/scores`).then(response => response.json());
  assert.deepEqual(ranking.scores.map(entry => entry.rank), [1, 2, 3, 3, 4]);
  assert.equal(ranking.scores[0].score, 1250);
  assert.deepEqual(ranking.scores.slice(2, 4).map(entry => entry.alias), ['Luz', 'Sol']);
  assert.equal(ranking.scores.at(-1).alias, 'Participante');
  const stored = JSON.parse(fs.readFileSync(scoresFile, 'utf8'));
  assert.equal(stored.length, 5);
  assert.deepEqual(Object.keys(stored[0]).sort(), [
    'alias', 'createdAt', 'difficulty', 'discovered', 'duration', 'specialCaptured', 'total'
  ]);
  const reload = reloadScores(scoresFile);
  assert.equal(reload.status, 0);
  assert.equal(JSON.parse(reload.stdout)[0].score, 1250);
});

test('preserva un archivo corrupto y arranca con un ranking vacío', () => {
  const corruptFile = path.join(os.tmpdir(), `el-tunel-corrupt-${process.pid}.json`);
  fs.writeFileSync(corruptFile, '{no es json', 'utf8');
  const reload = reloadScores(corruptFile);
  assert.equal(reload.status, 0);
  assert.deepEqual(JSON.parse(reload.stdout), []);
  const backup = fs.readdirSync(os.tmpdir()).find(name => name.startsWith(`${path.basename(corruptFile)}.corrupt-`));
  assert.ok(backup);
  fs.rmSync(corruptFile, { force: true });
  fs.rmSync(path.join(os.tmpdir(), backup), { force: true });
});

test('conserva solo los 100 resultados más recientes y permite borrarlos', async () => {
  await fetch(`${baseUrl}/api/scores`, { method: 'DELETE' });
  for (let index = 0; index < 101; index++) {
    const response = await postScore({ ...validScore, alias: `P${index}`, discovered: index % 11, specialCaptured: false });
    assert.equal(response.status, 201);
  }
  const ranking = await fetch(`${baseUrl}/api/scores`).then(response => response.json());
  assert.equal(ranking.totalCount, 100);
  assert.equal(ranking.scores.length, 10);

  const cleared = await fetch(`${baseUrl}/api/scores`, { method: 'DELETE' });
  assert.equal(cleared.status, 200);
  assert.deepEqual(JSON.parse(fs.readFileSync(scoresFile, 'utf8')), []);
});
