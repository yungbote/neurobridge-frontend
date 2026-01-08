# Neurobridge frontend

React + TypeScript + Vite app.

## Local dev (recommended)
Use Docker Compose from `neurobridge-infra/local/`:
- `docker compose up --build`

Frontend is available at `http://localhost:5174`.

## Local dev (direct)
- `npm install`
- `npm run dev`

## Environment variables
Frontend env vars are `VITE_*` and are listed in `neurobridge-infra/local/.env.example`.

## Commands
- `npm run typecheck`
- `npm run lint`
- `npm run build`
