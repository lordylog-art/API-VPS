'use strict';

/**
 * Router Express para POST /api/viagens-detalhes
 *
 * Contrato:
 *   Request:  POST /api/viagens-detalhes
 *             { routeKeys: string[] }    — array de route.keys de 10 dígitos
 *
 *   Response 200: { ok: true, bundles: { [routeKey]: bundle } }
 *   Response 400: { ok: false, error: string }
 *   Response 500: { ok: false, error: string }
 */

const { fetchDetalhesLote } = require('../greenmile-detalhes.js');

const ROUTE_KEY_RE = /^\d{10}$/;

/**
 * Cria o router com injeção de dependências para facilitar testes.
 *
 * @param {object} [deps]
 * @param {Function} [deps.fetchDetalhes] - substituição de fetchDetalhesLote (para testes)
 */
function createViagensDetalhesRouter(deps = {}) {
  const fetchDetalhes = deps.fetchDetalhes || fetchDetalhesLote;

  async function handler(req, res) {
    const body = req.body || {};
    const routeKeys = body.routeKeys;

    if (!Array.isArray(routeKeys)) {
      return res.status(400).json({ ok: false, error: 'routeKeys deve ser um array.' });
    }
    if (routeKeys.length === 0) {
      return res.status(400).json({ ok: false, error: 'routeKeys nao pode ser vazio.' });
    }

    const invalid = routeKeys.filter((k) => !ROUTE_KEY_RE.test(String(k)));
    if (invalid.length > 0) {
      return res.status(400).json({
        ok: false,
        error: 'route.key invalida: ' + invalid.join(', ') + '. Cada route.key deve ter exatamente 10 digitos.',
      });
    }

    try {
      const bundles = await fetchDetalhes(routeKeys);
      return res.status(200).json({ ok: true, bundles });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err && err.message ? err.message : String(err),
      });
    }
  }

  // Expõe _handler para testes diretos sem precisar do Express
  return { _handler: handler };
}

/**
 * Registra as rotas no app Express.
 * Uso: mountViagensDetalhesRoutes(app)
 */
function mountViagensDetalhesRoutes(app, deps = {}) {
  const { _handler } = createViagensDetalhesRouter(deps);
  app.post('/api/viagens-detalhes', _handler);
}

module.exports = { createViagensDetalhesRouter, mountViagensDetalhesRoutes };
