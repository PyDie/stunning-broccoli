# TGCalendar Bot & Mini App

A Telegram bot paired with a Telegram Mini App calendar for managing personal and family task schedules. The bot handles onboarding, family sharing, and quick actions, while the Mini App provides a calendar-first UI/UX for creating and tracking tasks.

## Features

- **Telegram bot (Aiogram)** for onboarding, household creation, and sharing invite codes.
- **Mini App (Telegram Web App)** served by FastAPI with a responsive calendar UI, task list, and creation form.
- **Personal & family calendars** – switch between private and shared scopes.
- **Role-aware sharing** – invite family members via code to share the same calendar.
- **SQLite persistence** with SQLAlchemy models and simple CRUD layer.

## Project Structure

```
.
├── README.md
├── pyproject.toml
├── .env.example
├── app
│   ├── __init__.py
│   ├── config.py
│   ├── database.py
│   ├── auth.py
│   ├── models.py
│   ├── schemas.py
│   ├── crud.py
│   ├── dependencies.py
│   ├── main.py
│   └── routers
│       ├── __init__.py
│       ├── users.py
│       ├── families.py
│       └── tasks.py
├── bot
│   ├── __init__.py
│   └── main.py
└── webapp
    ├── index.html
    ├── styles.css
    └── app.js
```

## Getting Started

### 1. Install dependencies

```bash
uv sync
```

> If you don't have [`uv`](https://github.com/astral-sh/uv), swap the command for your preferred PEP 621 installer (e.g. `pip install -e .`).

### 2. Configure environment

Copy the example file and fill in values:

```bash
cp .env.example .env
```

| Variable | Description |
| --- | --- |
| `BOT_TOKEN` | Telegram bot token from @BotFather. |
| `WEBAPP_URL` | Public URL that hosts `/miniapp` (e.g. `https://your.domain/miniapp`). |
| `DATABASE_URL` | Default `sqlite:///./data/tgcalendar.db`. |

### 3. Run the FastAPI backend (serves API + Mini App assets)

```bash
uvicorn app.main:app --reload
```

### 4. Run the Telegram bot

```bash
python -m bot.main
```

### 5. Set the Mini App URL in BotFather

In BotFather -> `Menu Button` -> `Web App`, set the same `WEBAPP_URL` you configured.

## Bot Commands

| Command | Description |
| --- | --- |
| `/start` | Registers the user and sends the Mini App button. |
| `/families` | Lists families you belong to and the invite code. |
| `/family_create <name>` | Creates a new family calendar and shares its invite code. |
| `/family_join <code>` | Joins an existing family calendar via invite code. |

## Mini App UX Highlights

- Month grid with quick navigation between months.
- Task drawer filtered by selected date and scope (personal / specific family).
- Inline creation form for new tasks with smart defaults for the selected date.
- Uses Telegram WebApp theme variables for instant dark/light theme support.

## Testing

- **API**: use the built-in Swagger UI at `/docs`.
- **Mini App**: open `WEBAPP_URL` in a browser with `X-Debug-User-Id` header (e.g. via a REST client) when Telegram init data is unavailable.
- **Bot**: run locally and chat with your bot in Telegram.

## Deployment Notes

- Host the FastAPI app on a public HTTPS domain and expose `/miniapp`.
- Use a background worker (e.g. systemd, supervisor, or container) to keep the bot process alive.
- Configure a persistent database (PostgreSQL recommended) for production.
