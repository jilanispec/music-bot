
import json
import os
import asyncio
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASE_DIR = os.path.join(BASE_DIR, "database")

COUNTER_FILE = os.path.join(DATABASE_DIR, "counter.json")
ROOMS_FILE = os.path.join(DATABASE_DIR, "rooms.json")

room_lock = asyncio.Lock()


def read_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as file:
            return json.load(file)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write_json(path, data):
    temp_path = path + ".tmp"

    with open(temp_path, "w", encoding="utf-8") as file:
        json.dump(data, file, indent=4, ensure_ascii=False)

    os.replace(temp_path, path)


async def get_or_create_room(chat_id, host_id, create=True):
    async with room_lock:
        rooms = read_json(ROOMS_FILE, {})

        chat_key = str(chat_id)

        if chat_key in rooms:
            return rooms[chat_key]

        if not create:
            return None

        counter = read_json(
            COUNTER_FILE,
            {"last_room_number": 0}
        )

        next_number = counter["last_room_number"] + 1

        room_id = f"{next_number:04d}"

        room = {
            "room_id": room_id,
            "chat_id": chat_id,
            "host_id": host_id,
            "created_at": datetime.now(
                timezone.utc
            ).isoformat(),
            "status": "active",
            "current_song": None,
            "queue": [],
            "participants": [],
            "approved_admins": []
        }

        rooms[chat_key] = room

        write_json(COUNTER_FILE, {
            "last_room_number": next_number
        })

        write_json(ROOMS_FILE, rooms)

        return room


async def close_room(chat_id):
    async with room_lock:
        rooms = read_json(ROOMS_FILE, {})
        chat_key = str(chat_id)

        if chat_key not in rooms:
            return False

        del rooms[chat_key]

        write_json(ROOMS_FILE, rooms)

        return True
