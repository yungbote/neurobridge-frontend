# Neurobridge frontend

React + TypeScript + Vite app.

## Docs
- Frontend docs index: `docs/frontend/README.md`
- Abstracted overview: `docs/frontend/abstracted-overview.md`
- Developer guide: `docs/frontend/developer.md`
- Module walkthrough: `docs/frontend/module-walkthrough.md`

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
