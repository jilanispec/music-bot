
import os
import secrets

from fastapi import FastAPI, HTTPException, Query, Request
from aiogram import Bot, Dispatcher
from aiogram.types import Update

from bot.config import BOT_TOKEN
from bot.handlers import router
from bot.youtube import search_youtube

app = FastAPI()

if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is missing")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()
dp.include_router(router)

WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "")
WEBHOOK_SETUP_KEY = os.getenv("WEBHOOK_SETUP_KEY", "")

WEBHOOK_URL = "https://music-bot-dusky.vercel.app/webhook"


@app.get("/search")
async def search(q: str = Query(..., min_length=2, max_length=100)):
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
        raise HTTPException(status_code=500, detail="YouTube search failed")


@app.post("/setup-webhook")
async def setup_webhook(request: Request):
    if not WEBHOOK_SETUP_KEY or not WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Webhook secrets missing")

    supplied_key = request.headers.get("X-Setup-Key", "")

    if not secrets.compare_digest(supplied_key, WEBHOOK_SETUP_KEY):
        raise HTTPException(status_code=403, detail="Invalid setup key")

    try:
        await bot.set_webhook(
            url=WEBHOOK_URL,
            secret_token=WEBHOOK_SECRET,
            drop_pending_updates=True
        )
        return {"success": True, "message": "Telegram webhook registered"}
    except Exception as error:
        print("Webhook setup error:", error)
        raise HTTPException(status_code=500, detail="Webhook registration failed")


@app.post("/webhook")
async def telegram_webhook(request: Request):
    if not WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Webhook secret missing")

    received_secret = request.headers.get(
        "X-Telegram-Bot-Api-Secret-Token", ""
    )

    if not secrets.compare_digest(received_secret, WEBHOOK_SECRET):
        raise HTTPException(status_code=403, detail="Invalid webhook secret")

    try:
        data = await request.json()
        update = Update.model_validate(data, context={"bot": bot})
        await dp.feed_update(bot, update)
        return {"ok": True}
    except Exception as error:
        print("Webhook processing error:", error)
        raise HTTPException(status_code=500, detail="Webhook processing failed")
