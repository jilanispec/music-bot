
import asyncio

from storage.manager import (
    add_song,
    get_queue,
    remove_song,
    skip_song
)

__all__ = [
    "add_song",
    "get_queue",
    "remove_song",
    "skip_song"
]

from bot.rooms import ROOMS_FILE, read_json, write_json, room_lock


async def add_song(chat_id, song, requested_by, media_type="music"):
    async with room_lock:
        rooms = read_json(ROOMS_FILE, {})
        room = rooms.get(str(chat_id))

        if not room:
            return None

        song_data = {
            "video_id": song["id"],
            "title": song["title"],
            "channel": song["channel"],
            "thumbnail": song["thumbnail"],
            "duration": song["duration"],
            "url": song["url"],
            "requested_by": requested_by,
            "media_type": media_type
        }

        room.setdefault("queue", []).append(song_data)

        position = len(room["queue"])
        write_json(ROOMS_FILE, rooms)

        return position


async def get_queue(chat_id):
    async with room_lock:
        rooms = read_json(ROOMS_FILE, {})
        room = rooms.get(str(chat_id))

        if not room:
            return None

        return list(room.get("queue", []))


async def remove_song(chat_id, position):
    async with room_lock:
        rooms = read_json(ROOMS_FILE, {})
        room = rooms.get(str(chat_id))

        if not room:
            return None

        queue = room.get("queue", [])

        if position < 1 or position > len(queue):
            return None

        removed = queue.pop(position - 1)

        write_json(ROOMS_FILE, rooms)
        return removed


async def skip_song(chat_id):
    async with room_lock:
        rooms = read_json(ROOMS_FILE, {})
        room = rooms.get(str(chat_id))

        if not room:
            return None

        queue = room.get("queue", [])

        if not queue:
            return None

        skipped = queue.pop(0)

        write_json(ROOMS_FILE, rooms)
        return skipped
