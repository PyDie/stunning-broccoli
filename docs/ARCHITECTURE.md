# TGCalendar Architecture

## Overview

TGCalendar combines three layers:

1. **Telegram Bot (Aiogram)** – does account onboarding, family management, and deep links users into the Mini App via the WebApp keyboard button. It also provides fallback task creation commands when the Mini App is not available.
2. **FastAPI Backend** – central API for the Mini App and bot. Handles authentication of Telegram WebApp init data, CRUD for users/families/tasks, and serves the static Mini App bundle.
3. **Telegram Mini App (Web App)** – a responsive calendar UI built with vanilla JS + CSS. It consumes the FastAPI API, renders monthly grids, and lets users add tasks to personal or family calendars.

```
Telegram Client ──> Bot (Aiogram) ─┐
                                   ├── FastAPI Backend ──> SQLite / PostgreSQL
Telegram Mini App ────────────────> ┘
```

## Data Model

- **User** – Telegram user id, name, and default settings.
- **Family** – Named shared calendar with unique invite code and owner id.
- **FamilyMembership** – association table multi-tenant access.
- **Task** – Title, description, date, time range, status, scope (`personal` vs `family_id`).

## API Endpoints (FastAPI)

- `POST /auth/verify` – validate Telegram WebApp init data and return JWT session.
- `GET /users/me` – fetch profile and membership.
- `POST /families` / `GET /families` / `POST /families/{id}/join` – manage family calendars.
- `GET /tasks` – filter by date range + scope.
- `POST /tasks` – create task bound to personal or family scope.
- `PATCH /tasks/{id}` / `DELETE /tasks/{id}` – maintenace actions.

## Bot Conversation Flow

- `/start` → register user and send the Mini App button.
- `/families` → list memberships + invite codes.
- `/family_create <name>` → create new family calendar.
- `/family_join <code>` → join via invite code.
- Inline button "Open Calendar" uses `web_app=WebAppInfo(url=WEBAPP_URL)`.

## Mini App UX

- Kalender grid (month view) with top navigation.
- Day sidebar listing tasks for selected date.
- Quick filter chips for "Personal" and each family membership.
- Task creation drawer containing title, optional description, time, and scope toggle.
- Uses Telegram WebApp theme colors and font sizing for consistent look.

## Deployment

- Single FastAPI process can serve both API and static assets. Use `uvicorn app.main:app`.
- Bot runs separately: `python -m bot.main`. Share `.env` config for DB URL and `WEBAPP_URL`.
- Storage: default to SQLite file; upgrade to Postgres by changing `DATABASE_URL`.
- For production, front FastAPI with reverse proxy (nginx, fly.io, etc.).
