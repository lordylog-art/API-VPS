'use strict';

const express = require('express');
const path = require('path');

const { mountViagensDetalhesRoutes } = require('./routes/viagens-detalhes.js');

const app = express();
const port = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, '..', 'public');

// CORS — permite origem do HTML Service do Google Apps Script e localhost para dev.
// O HTML Service serve de *.googleusercontent.com; em produção restringir conforme necessário.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  const isGasOrigin = /\.googleusercontent\.com$/i.test(origin) || /script\.google\.com$/i.test(origin);
  const isExplicitlyAllowed = ALLOWED_ORIGINS.includes(origin);
  const isDev = process.env.NODE_ENV !== 'production';

  if (isGasOrigin || isExplicitlyAllowed || isDev) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());
app.use(express.static(publicDir));

// ── Rotas de diagnóstico ──────────────────────────────────────────────────────

app.get('/api', (req, res) => {
  res.json({
    ok: true,
    mensagem: 'API no ar',
    servidor: process.env.COMPUTERNAME || 'windows-vps',
    data: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
  });
});

// ── Rotas de negócio ──────────────────────────────────────────────────────────

mountViagensDetalhesRoutes(app);

// ── Fallback 404 ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ erro: 'Rota nao encontrada' });
});

if (require.main === module) {
  app.listen(port, '0.0.0.0', () => {
    console.log('API rodando em http://0.0.0.0:' + port);
  });
}

module.exports = app;
