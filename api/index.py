
import os

from fastapi import FastAPI, HTTPException, Query, Request
from aiogram import Bot, Dispatcher
from aiogram.types import Update

from bot.config import BOT_TOKEN
from bot.handlers import router
from bot.youtube import search_youtube

app = FastAPI()

# Telegram bot setup
if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN environment variable is missing")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()
dp.include_router(router)

WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "")


# Mini App YouTube search
@app.get("/search")
async def search(
    q: str = Query(..., min_length=2, max_length=100)
):
    try:
        results = await search_youtube(q, limit=5)

        return {
            "success": True,
            "query": q,
            "count": len(results),
            "results": results
        }

    except Exception as error:
        print("Search API error:", error)
        raise HTTPException(
            status_code=500,
            detail="YouTube search failed"
        )


# Telegram webhook
@app.post("/webhook")
async def telegram_webhook(request: Request):
    if not WEBHOOK_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Webhook secret is not configured"
        )

    received_secret = request.headers.get(
        "X-Telegram-Bot-Api-Secret-Token"
    )

    if received_secret != WEBHOOK_SECRET:
        raise HTTPException(
            status_code=403,
            detail="Invalid webhook secret"
        )

    try:
        data = await request.json()
        update = Update.model_validate(
            data,
            context={"bot": bot}
        )
        await dp.feed_update(bot, update)

        return {"ok": True}

    except Exception as error:
        print("Telegram webhook error:", error)
        raise HTTPException(
            status_code=500,
            detail="Webhook processing failed"
        )
