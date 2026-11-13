# CampusBite — working notes for Claude Code

## Priorities
1. The capstone problem statement (requirements for roles, lifecycle, payments, refunds, AI, middleware,
   reminders, Docker, README) is authoritative. Never drop or simplify a required feature without approval.
2. All frontend work must follow [DESIGN.md](DESIGN.md). Use the tokens in `frontend/src/styles/tokens.css`;
   never hard-code colors, spacing or font sizes. Where DESIGN.md conflicts with the requirements,
   the requirements win (see "Deviations" at the end of DESIGN.md).

## Rules
- Business rules and authorization live in the FastAPI backend. The frontend never decides permissions;
  it renders the `allowed_actions` the API returns.
- No fake data: no hardcoded stats, ETAs, prices or simulated responses.
- Never commit `.env` files or secrets.

## Commands
- Backend tests: `cd backend && source .venv/bin/activate && pytest -q`
- Backend (Docker): `docker compose up -d --build` → http://localhost:8000/docs
- Frontend: `cd frontend && npm run dev` → http://localhost:5173 · `npm run build`
- End-to-end UI test (backend + dev server running): `cd frontend && npm run e2e`
- Component styleguide (dev only): http://localhost:5173/styleguide
