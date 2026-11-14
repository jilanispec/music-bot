
import os
import hmac
import json
import hashlib
from urllib.parse import parse_qsl
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query, Request
from pydantic import BaseModel
from aiogram import Bot, Dispatcher
from aiogram.types import Update

from bot.config import BOT_TOKEN
from bot.handlers import router
from bot.youtube import search_youtube

from storage.github_json import read_json
from storage.manager import (
    create_playlist,
    get_playlists,
    add_playlist_song,
    delete_playlist
)

app = FastAPI()

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()
dp.include_router(router)

WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "")
WEBHOOK_SETUP_KEY = os.getenv("WEBHOOK_SETUP_KEY", "")

WEBHOOK_URL = "https://music-bot-dusky.vercel.app/webhook"


class PlaylistRequest(BaseModel):
    name: str


class SongRequest(BaseModel):
    song: dict


# -------------------------
# TELEGRAM AUTHENTICATION
# -------------------------

def authenticate_telegram(init_data):
    if not BOT_TOKEN or not init_data:
        raise HTTPException(
            status_code=401,
            detail="Telegram authentication required"
        )

    try:
        parsed = dict(parse_qsl(init_data, keep_blank_values=True))
        received_hash = parsed.pop("hash", None)

        if not received_hash:
            raise ValueError("Missing hash")

        auth_date = int(parsed.get("auth_date", "0"))
        now = int(datetime.now(timezone.utc).timestamp())

        if now - auth_date > 86400 or auth_date > now + 60:
            raise ValueError("Expired authentication")

        data_check_string = "\n".join(
            f"{key}={value}"
            for key, value in sorted(parsed.items())
        )

        secret_key = hmac.new(
            b"WebAppData",
            BOT_TOKEN.encode(),
            hashlib.sha256
        ).digest()

        calculated_hash = hmac.new(
            secret_key,
            data_check_string.encode(),
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(calculated_hash, received_hash):
            raise ValueError("Invalid signature")

        user = json.loads(parsed["user"])
        return str(user["id"])

    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired Telegram session"
        )


def get_user_id(request):
    return authenticate_telegram(
        request.headers.get("X-Telegram-Init-Data", "")
    )


# -------------------------
# ROOM ACCESS
# -------------------------

async def find_room_by_number(room_id):
    rooms = await read_json("database/rooms.json", {})

    for room in rooms.values():
        if (
            str(room.get("room_id")) == str(room_id)
            and room.get("status") == "active"
        ):
            return room

    return None


async def verify_room_access(room, user_id):
    chat_id = str(room.get("chat_id", ""))

    # A private-chat room belongs to that Telegram user.
    if chat_id == str(user_id):
        return True

    # For group rooms, verify that the authenticated user
    # is actually a member of the Telegram group.
    try:
        member = await bot.get_chat_member(
            chat_id=int(chat_id),
            user_id=int(user_id)
        )

        if member.status in ("left", "kicked"):
            return False

        return True

    except Exception as error:
        print("ROOM ACCESS CHECK ERROR:", repr(error))
        return False


# -------------------------
# YOUTUBE SEARCH
# -------------------------

@app.get("/search")
async def search(
    q: str = Query(..., min_length=2, max_length=100),
    limit: int = Query(10, ge=1, le=10)
):
    try:
        results = await search_youtube(q, limit=limit)

        return {
            "success": True,
            "query": q,
            "count": len(results),
            "results": results
        }

    except Exception as error:
        print("Search error:", repr(error))
        raise HTTPException(
            status_code=500,
            detail="YouTube search failed"
        )


# -------------------------
# MINI APP ROOM QUEUE
# -------------------------

@app.get("/rooms/{room_id}")
async def get_miniapp_room(room_id: str, request: Request):
    user_id = get_user_id(request)

    room = await find_room_by_number(room_id)

    if not room:
        raise HTTPException(
            status_code=404,
            detail="Active room not found"
        )

    allowed = await verify_room_access(room, user_id)

    if not allowed:
        raise HTTPException(
            status_code=403,
            detail="You are not a member of this room"
        )

    queue = room.get("queue", [])

    return {
        "success": True,
        "room": {
            "room_id": str(room["room_id"]),
            "queue": queue,
            "current_song": room.get("current_song"),
            "queue_count": len(queue),
            "playback": room.get("playback", {})
        }
    }


# -------------------------
# PLAYLISTS
# -------------------------

@app.get("/playlists")
async def list_playlists(request: Request):
    user_id = get_user_id(request)
    playlists = await get_playlists(user_id)

    return {
        "success": True,
        "playlists": playlists
    }


@app.post("/playlists")
async def make_playlist(data: PlaylistRequest, request: Request):
    user_id = get_user_id(request)

    name = data.name.strip()

    if not name or len(name) > 80:
        raise HTTPException(
            status_code=400,
            detail="Invalid playlist name"
        )

    playlist = await create_playlist(user_id, name)

    return {
        "success": True,
        "playlist": playlist
    }


@app.post("/playlists/{playlist_id}/songs")
async def save_playlist_song(
    playlist_id: str,
    data: SongRequest,
    request: Request
):
    user_id = get_user_id(request)

    song = data.song

    if not song.get("id") or not song.get("title"):
        raise HTTPException(
            status_code=400,
            detail="Invalid song"
        )

    playlist = await add_playlist_song(
        playlist_id,
        user_id,
        song
    )

    if not playlist:
        raise HTTPException(
            status_code=404,
            detail="Playlist not found"
        )

    return {
        "success": True,
        "playlist": playlist
    }


@app.delete("/playlists/{playlist_id}")
async def remove_playlist(playlist_id: str, request: Request):
    user_id = get_user_id(request)

    deleted = await delete_playlist(playlist_id, user_id)

    if not deleted:
        raise HTTPException(
            status_code=404,
            detail="Playlist not found"
        )

    return {"success": True}


# -------------------------
# WEBHOOK SETUP
# -------------------------

@app.post("/setup-webhook")
async def setup_webhook(request: Request):
    if not WEBHOOK_SETUP_KEY or not WEBHOOK_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Webhook secrets missing"
        )

    supplied = request.headers.get("X-Setup-Key", "")

    if not hmac.compare_digest(supplied, WEBHOOK_SETUP_KEY):
        raise HTTPException(
            status_code=403,
            detail="Invalid setup key"
        )

    try:
        await bot.set_webhook(
            url=WEBHOOK_URL,
            secret_token=WEBHOOK_SECRET,
            drop_pending_updates=True
        )

        return {
            "success": True,
            "message": "Telegram webhook registered"
        }

    except Exception as error:
        print("Webhook setup error:", repr(error))
        raise HTTPException(
            status_code=500,
            detail="Webhook registration failed"
        )


# -------------------------
# TELEGRAM WEBHOOK
# -------------------------

@app.post("/webhook")
async def telegram_webhook(request: Request):
    if not WEBHOOK_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Webhook secret missing"
        )

    received = request.headers.get(
        "X-Telegram-Bot-Api-Secret-Token", ""
    )

    if not hmac.compare_digest(received, WEBHOOK_SECRET):
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
        print("Telegram webhook error:", repr(error))
        raise HTTPException(
            status_code=500,
            detail="Webhook processing failed"
        )
