'use strict';

/**
 * Módulo de serviço: busca bundles do GreenMile em lote para o endpoint de detalhes.
 *
 * Reutiliza createGreenmileLocalClient de tools/greenmile-local.js como base,
 * adicionando: deduplicação de routeKeys, paralelismo com tolerância a falha parcial,
 * e injeção do routeKey em cada bundle retornado.
 */

const { createGreenmileLocalClient } = require('./greenmile-client.js');

/**
 * Cria e retorna um cliente GreenMile autenticado via createGreenmileLocalClient.
 * Carrega credenciais de process.env ou de um .env explicitado.
 */
function createDefaultClient(options = {}) {
  const clientFactory = typeof options.clientFactory === 'function'
    ? options.clientFactory
    : createGreenmileLocalClient;
  return clientFactory({
    username: options.username || process.env.GREENMILE_USERNAME,
    password: options.password || process.env.GREENMILE_PASSWORD,
    config: {
      baseUrl: options.baseUrl || process.env.GREENMILE_BASE_URL || 'https://3coracoes.greenmile.com',
    },
  });
}

/**
 * Busca bundles do GreenMile para um lote de routeKeys.
 *
 * @param {string[]} routeKeys - array de route.keys (10 dígitos)
 * @param {object}  options
 * @param {object}  [options.client]  - cliente GreenMile já instanciado (para testes/injeção)
 * @param {number}  [options.concurrency=5] - máximo de requisições paralelas
 * @returns {Promise<Record<string, object>>} mapa routeKey → bundle (ou { routeKey, error })
 */
async function fetchDetalhesLote(routeKeys, options = {}) {
  if (!Array.isArray(routeKeys) || routeKeys.length === 0) return {};

  // Deduplicação
  const unique = [...new Set(routeKeys.map(String))];

  const client = options.client || createDefaultClient(options);
  const concurrency = Math.max(1, Number(options.concurrency) || 5);

  const result = {};

  // Processa em chunks para respeitar o limite de concorrência
  for (let i = 0; i < unique.length; i += concurrency) {
    const chunk = unique.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      chunk.map((routeKey) =>
        client.getRouteBundleByKey(routeKey, {
          includeOrders: true,
          includeSignatures: true,
          includeStopDetails: false,
          maxResults: 1,
        })
      )
    );

    chunk.forEach((routeKey, idx) => {
      const outcome = settled[idx];
      if (outcome.status === 'fulfilled') {
        const bundle = outcome.value || {};
        // Garante que routeKey esteja presente no bundle
        result[routeKey] = Object.assign({}, bundle, { routeKey });
      } else {
        result[routeKey] = {
          routeKey,
          error: outcome.reason && outcome.reason.message ? outcome.reason.message : String(outcome.reason),
        };
      }
    });
  }

  return result;
}

module.exports = { fetchDetalhesLote, createDefaultClient };
