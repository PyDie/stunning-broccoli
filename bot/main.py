import asyncio
import logging
from contextlib import contextmanager
from pathlib import Path

from aiogram import Bot, Dispatcher, Router
from aiogram.filters import Command, CommandStart
from aiogram.filters.command import CommandObject
from aiogram.types import (
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
    WebAppInfo,
)
from dotenv import load_dotenv

from app import crud, schemas
from app.config import get_settings
from app.database import SessionLocal

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")
logging.basicConfig(level=logging.INFO)

settings = get_settings()
bot = Bot(settings.bot_token)
dp = Dispatcher()
router = Router()


@contextmanager
def session_scope():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def upsert_user(message: Message):
    user = message.from_user
    payload = schemas.UserCreate(
        id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        username=user.username,
    )
    with session_scope() as db:
        return crud.create_or_update_user(db, payload)


@router.message(CommandStart())
async def cmd_start(message: Message):
    upsert_user(message)
    keyboard = ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(
                    text="Открыть календарь",
                    web_app=WebAppInfo(url=str(settings.webapp_url)),
                )
            ]
        ],
        resize_keyboard=True,
    )
    await message.answer(
        "Привет! Я помогу вести личные и семейные планы. "
        "Открой мини-приложение, чтобы увидеть календарь.",
        reply_markup=keyboard,
    )


@router.message(Command("families"))
async def cmd_families(message: Message):
    with session_scope() as db:
        memberships = crud.list_user_families(db, message.from_user.id)

    if not memberships:
        await message.answer("Ты пока не в семейных календарях. Создай или присоединись!")
        return

    lines = ["Твои семьи:"]
    for membership in memberships:
        lines.append(
            f"• {membership.family.name} — код: `{membership.family.invite_code}`"
        )
    lines.append("Поделись кодом, чтобы пригласить близких.")
    await message.answer("\n".join(lines), parse_mode="Markdown")


@router.message(Command("family_create"))
async def cmd_family_create(message: Message, command: CommandObject):
    name = (command.args or "").strip()
    if not name:
        await message.answer("Укажи название: `/family_create Дом`", parse_mode="Markdown")
        return

    with session_scope() as db:
        family = crud.create_family(db, owner_id=message.from_user.id, name=name)
    await message.answer(
        f"Семейный календарь *{family.name}* создан! Поделись кодом `{family.invite_code}`",
        parse_mode="Markdown",
    )


@router.message(Command("family_join"))
async def cmd_family_join(message: Message, command: CommandObject):
    code = (command.args or "").strip().upper()
    if not code:
        await message.answer("Укажи код: `/family_join ABC123`", parse_mode="Markdown")
        return

    with session_scope() as db:
        try:
            family = crud.add_user_to_family(db, message.from_user.id, code)
        except ValueError:
            await message.answer("Не нашёл такой код. Проверь и попробуй снова.")
            return

    await message.answer(
        f"Ура! Ты присоединился к календарю *{family.name}*.",
        parse_mode="Markdown",
    )


def register_handlers():
    dp.include_router(router)


async def main():
    register_handlers()
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
