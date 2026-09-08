const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { server } = require('./server');

let baseUrl;

before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
});

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
  assert.match(await host.text(), /ALTERNATIVAS DESCUBIERTAS/);

  const network = await fetch(`${baseUrl}/api/network`).then(res => res.json());
  assert.ok(Array.isArray(network.controllerUrls));
});
