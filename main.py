import asyncio

from aiogram import Bot, Dispatcher

from bot.config import BOT_TOKEN
from bot.handlers import router


async def main():
    bot = Bot(token=BOT_TOKEN)
    dp = Dispatcher()

    dp.include_router(router)

    print("Music Assistant is running...")

    try:
        await dp.start_polling(bot)
    finally:
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
