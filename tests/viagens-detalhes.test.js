/**
 * Testes para o endpoint POST /api/viagens-detalhes
 * Run: node --test tests/viagens-detalhes.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Importa o módulo de serviço (a implementar)
const {
  fetchDetalhesLote,
  createDefaultClient,
} = require(path.join(__dirname, '..', 'src', 'greenmile-detalhes.js'));
const { createGreenmileLocalClient } = require(path.join(__dirname, '..', 'src', 'greenmile-client.js'));

// Importa o builder do endpoint para testes de integração com express
const { createViagensDetalhesRouter } = require(path.join(__dirname, '..', 'src', 'routes', 'viagens-detalhes.js'));

// ─── Testes do módulo de serviço ────────────────────────────────────────────

test('fetchDetalhesLote retorna bundles para cada routeKey', async () => {
  const mockClient = {
    getRouteBundleByKey: async (routeKey) => ({
      routeKey,
      routeId: 123,
      summary: [{ route: { key: routeKey, id: 123 } }],
      stops: [],
    }),
  };

  const result = await fetchDetalhesLote(['6103000001', '6103000002'], { client: mockClient });

  assert.ok(typeof result === 'object', 'deve retornar objeto');
  assert.ok(result['6103000001'], 'deve ter bundle para primeira key');
  assert.ok(result['6103000002'], 'deve ter bundle para segunda key');
});

test('fetchDetalhesLote deduplica routeKeys repetidas', async () => {
  const called = [];
  const mockClient = {
    getRouteBundleByKey: async (routeKey) => {
      called.push(routeKey);
      return { routeKey, stops: [] };
    },
  };

  await fetchDetalhesLote(['6103000001', '6103000001', '6103000001'], { client: mockClient });

  assert.equal(called.length, 1, 'deve chamar GreenMile apenas uma vez por key única');
});

test('fetchDetalhesLote retorna vazio quando routeKeys estiver vazio', async () => {
  const mockClient = { getRouteBundleByKey: async () => ({}) };

  const result = await fetchDetalhesLote([], { client: mockClient });

  assert.deepEqual(result, {});
});

test('fetchDetalhesLote propaga erro parcial sem interromper as demais keys', async () => {
  let callCount = 0;
  const mockClient = {
    getRouteBundleByKey: async (routeKey) => {
      callCount++;
      if (routeKey === '6103000002') throw new Error('GreenMile timeout');
      return { routeKey, stops: [] };
    },
  };

  const result = await fetchDetalhesLote(['6103000001', '6103000002'], { client: mockClient });

  assert.ok(result['6103000001'], 'key válida deve ter bundle');
  assert.equal(callCount, 2, 'deve tentar todas as keys');
  // key com erro deve ter error flag, não bundle
  assert.ok(result['6103000002'] && result['6103000002'].error,
    'key com erro deve ter campo error');
});

test('fetchDetalhesLote inclui routeKey no bundle retornado', async () => {
  const mockClient = {
    getRouteBundleByKey: async (routeKey) => ({
      routeId: 42,
      stops: [],
      // nota: routeKey não está aqui — fetchDetalhesLote deve injetar
    }),
  };

  const result = await fetchDetalhesLote(['6103000001'], { client: mockClient });

  assert.equal(result['6103000001'].routeKey, '6103000001',
    'deve injetar routeKey no bundle mesmo se o cliente não retornar');
});

test('createDefaultClient usa factory injetada sem depender de arquivos fora da API', () => {
  const calls = [];
  const fakeClient = { getRouteBundleByKey: async () => ({}) };

  const out = createDefaultClient({
    username: 'user@test',
    password: 'secret',
    baseUrl: 'http://127.0.0.1:3000',
    clientFactory: (options) => {
      calls.push(options);
      return fakeClient;
    },
  });

  assert.equal(out, fakeClient);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].username, 'user@test');
  assert.equal(calls[0].password, 'secret');
  assert.equal(calls[0].config.baseUrl, 'http://127.0.0.1:3000');
});

test('createGreenmileLocalClient.login envia form-urlencoded e captura analytics token', async () => {
  const calls = [];
  const client = createGreenmileLocalClient({
    username: 'operacao',
    password: 'segredo',
    config: {
      baseUrl: 'https://3coracoes.greenmile.com',
      module: 'LIVE',
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        status: 200,
        ok: true,
        headers: {
          get: (name) => (String(name).toLowerCase() === 'set-cookie' ? 'JSESSIONID=abc123; Path=/' : null),
        },
        text: async () => JSON.stringify({
          analyticsToken: { access_token: 'token-123', expires_in: 180 },
          jsessionid: 'abc123',
        }),
      };
    },
  });

  const auth = await client.login();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://3coracoes.greenmile.com/login');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(calls[0].options.headers['Greenmile-Module'], 'LIVE');
  assert.match(calls[0].options.body, /j_username=operacao/);
  assert.match(calls[0].options.body, /j_password=segredo/);
  assert.equal(auth.token, 'token-123');
  assert.equal(auth.cookie, 'JSESSIONID=abc123');
});

test('createGreenmileLocalClient.getRouteBundleByKey usa fallback de routeDetails quando StopView falha com 500', async () => {
  const calls = [];
  const client = createGreenmileLocalClient({
    username: 'operacao',
    password: 'segredo',
    config: {
      baseUrl: 'https://3coracoes.greenmile.com',
      module: 'LIVE',
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });

      if (url.endsWith('/login')) {
        return {
          status: 200,
          ok: true,
          headers: {
            get: (name) => (String(name).toLowerCase() === 'set-cookie' ? 'JSESSIONID=abc123; Path=/' : null),
          },
          text: async () => JSON.stringify({
            analyticsToken: { access_token: 'token-123', expires_in: 180 },
            jsessionid: 'abc123',
          }),
        };
      }

      if (url.includes('/RouteView/Summary?criteria=')) {
        return {
          status: 200,
          ok: true,
          headers: { get: () => null },
          text: async () => JSON.stringify({
            content: [{
              route: { id: 987, key: '6103048379' },
            }],
          }),
        };
      }

      if (url.includes('/Route/restrictions?criteria=')) {
        return {
          status: 200,
          ok: true,
          headers: { get: () => null },
          text: async () => JSON.stringify({
            stopView: [
              {
                stop: {
                  id: 'STOP-1',
                  key: 'STOPKEY-1',
                  description: 'Cliente fallback',
                  actualArrival: '2026-04-08T10:00:00Z',
                },
                location: {
                  key: 'CLI-1',
                  description: 'Cliente fallback',
                },
              },
            ],
          }),
        };
      }

      if (url.includes('/StopView/restrictions?criteria=')) {
        return {
          status: 500,
          ok: false,
          headers: { get: () => null },
          text: async () => JSON.stringify({
            errorMessages: [{ resource: { value: 'Restrição violada' } }],
          }),
        };
      }

      if (url.includes('/Order/restrictions?criteria=')) {
        return {
          status: 200,
          ok: true,
          headers: { get: () => null },
          text: async () => JSON.stringify({
            content: [{ number: 'NF-1' }],
          }),
        };
      }

      throw new Error('URL inesperada no teste: ' + url);
    },
  });

  const bundle = await client.getRouteBundleByKey('6103048379', {
    includeOrders: true,
    includeSignatures: false,
    maxResults: 1,
  });

  assert.equal(bundle.routeKey, '6103048379');
  assert.equal(bundle.routeId, 987);
  assert.equal(Array.isArray(bundle.stops), true);
  assert.equal(bundle.stops.length, 1);
  assert.equal(bundle.stops[0].stopId, 'STOP-1');
  assert.equal(bundle.stops[0].stopKey, 'STOPKEY-1');
  assert.equal(bundle.stops[0].locationKey, 'CLI-1');
  assert.equal(bundle.stops[0].locationName, 'Cliente fallback');
  assert.deepEqual(bundle.stops[0].orders.content[0], { number: 'NF-1' });
  assert.ok(calls.some((entry) => entry.url.includes('/StopView/restrictions?criteria=')),
    'deve tentar StopView antes do fallback');
});

test('createGreenmileLocalClient.getRouteBundleByKey preserva bundle quando Order/restrictions falha com 500', async () => {
  const client = createGreenmileLocalClient({
    username: 'operacao',
    password: 'segredo',
    config: {
      baseUrl: 'https://3coracoes.greenmile.com',
      module: 'LIVE',
    },
    fetchImpl: async (url) => {
      if (url.endsWith('/login')) {
        return {
          status: 200,
          ok: true,
          headers: {
            get: (name) => (String(name).toLowerCase() === 'set-cookie' ? 'JSESSIONID=abc123; Path=/' : null),
          },
          text: async () => JSON.stringify({
            analyticsToken: { access_token: 'token-123', expires_in: 180 },
            jsessionid: 'abc123',
          }),
        };
      }

      if (url.includes('/RouteView/Summary?criteria=')) {
        return {
          status: 200,
          ok: true,
          headers: { get: () => null },
          text: async () => JSON.stringify({
            content: [{
              route: { id: 555, key: '6103048379' },
            }],
          }),
        };
      }

      if (url.includes('/Route/restrictions?criteria=')) {
        return {
          status: 200,
          ok: true,
          headers: { get: () => null },
          text: async () => JSON.stringify({
            stopView: [
              {
                stop: { id: 'STOP-1', key: 'STOPKEY-1', description: 'Cliente 1' },
                location: { key: 'CLI-1', description: 'Cliente 1' },
              },
            ],
          }),
        };
      }

      if (url.includes('/StopView/restrictions?criteria=')) {
        return {
          status: 200,
          ok: true,
          headers: { get: () => null },
          text: async () => JSON.stringify({
            content: [{
              stop: { id: 'STOP-1', key: 'STOPKEY-1', description: 'Cliente 1' },
              location: { key: 'CLI-1', description: 'Cliente 1' },
            }],
          }),
        };
      }

      if (url.includes('/Order/restrictions?criteria=')) {
        return {
          status: 500,
          ok: false,
          headers: { get: () => null },
          text: async () => JSON.stringify({
            errorMessages: [{ resource: { value: 'Restrição violada em orders' } }],
          }),
        };
      }

      throw new Error('URL inesperada no teste: ' + url);
    },
  });

  const bundle = await client.getRouteBundleByKey('6103048379', {
    includeOrders: true,
    includeSignatures: false,
    maxResults: 1,
  });

  assert.equal(bundle.routeKey, '6103048379');
  assert.equal(bundle.stops.length, 1);
  assert.deepEqual(bundle.stops[0].orders, { content: [] });
  assert.match(bundle.stops[0].orderError || '', /Order\/restrictions/i);
});

// ─── Testes do router Express (integração com request/response stubs) ────────

function makeRes() {
  const res = {
    _status: 200,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
  return res;
}

test('POST /api/viagens-detalhes retorna 400 para payload sem routeKeys', async () => {
  const router = createViagensDetalhesRouter({ fetchDetalhes: async () => ({}) });

  // Simula a handler diretamente
  const handler = router._handler;
  const req = { body: {} };
  const res = makeRes();

  await handler(req, res);

  assert.equal(res._status, 400);
  assert.ok(res._body && !res._body.ok, 'ok deve ser false');
  assert.ok(res._body.error, 'deve ter campo error');
});

test('POST /api/viagens-detalhes retorna 400 para routeKeys não-array', async () => {
  const router = createViagensDetalhesRouter({ fetchDetalhes: async () => ({}) });

  const req = { body: { routeKeys: 'nao-e-array' } };
  const res = makeRes();

  await router._handler(req, res);

  assert.equal(res._status, 400);
});

test('POST /api/viagens-detalhes retorna 400 para routeKeys vazio', async () => {
  const router = createViagensDetalhesRouter({ fetchDetalhes: async () => ({}) });

  const req = { body: { routeKeys: [] } };
  const res = makeRes();

  await router._handler(req, res);

  assert.equal(res._status, 400);
});

test('POST /api/viagens-detalhes retorna 200 com bundles em caso de sucesso', async () => {
  const fakeBundles = { '6103000001': { routeKey: '6103000001', stops: [] } };
  const router = createViagensDetalhesRouter({
    fetchDetalhes: async () => fakeBundles,
  });

  const req = { body: { routeKeys: ['6103000001'] } };
  const res = makeRes();

  await router._handler(req, res);

  assert.equal(res._status, 200);
  assert.ok(res._body && res._body.ok, 'ok deve ser true');
  assert.deepEqual(res._body.bundles, fakeBundles);
});

test('POST /api/viagens-detalhes retorna 500 quando fetchDetalhes lança exceção', async () => {
  const router = createViagensDetalhesRouter({
    fetchDetalhes: async () => { throw new Error('GreenMile unreachable'); },
  });

  const req = { body: { routeKeys: ['6103000001'] } };
  const res = makeRes();

  await router._handler(req, res);

  assert.equal(res._status, 500);
  assert.ok(res._body && !res._body.ok);
});

test('POST /api/viagens-detalhes valida que cada routeKey tem 10 dígitos', async () => {
  const router = createViagensDetalhesRouter({ fetchDetalhes: async () => ({}) });

  const req = { body: { routeKeys: ['123', 'abc', '6103000001'] } };
  const res = makeRes();

  await router._handler(req, res);

  // Deve rejeitar keys inválidas com 400
  assert.equal(res._status, 400);
  assert.match(res._body.error, /route.key/i);
});
