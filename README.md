# API VPS

API Node.js simples com Express para rodar em uma Windows VPS.

## Rodar localmente

```powershell
npm install
npm start
```

## Rotas

- `GET /`
- `GET /health`
- `GET /users/123`
- `POST /echo`

## Exemplo de teste

```powershell
Invoke-RestMethod -Method Get http://localhost:3000/health
Invoke-RestMethod -Method Post http://localhost:3000/echo -ContentType 'application/json' -Body '{"nome":"Jetta"}'
```
