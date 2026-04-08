const express = require("express");

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    ok: true,
    mensagem: "API no ar",
    servidor: process.env.COMPUTERNAME || "windows-vps",
    data: new Date().toISOString(),
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
  });
});

app.get("/users/:id", (req, res) => {
  res.json({
    id: req.params.id,
    nome: `Usuario ${req.params.id}`,
    ativo: true,
  });
});

app.post("/echo", (req, res) => {
  res.status(201).json({
    recebido: req.body,
  });
});

app.use((req, res) => {
  res.status(404).json({
    erro: "Rota nao encontrada",
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`API rodando em http://0.0.0.0:${port}`);
});
