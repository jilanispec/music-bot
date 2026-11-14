
from storage.github_json import read_json, write_json
from storage.schemas import new_user, new_playlist, new_room
from datetime import datetime, timezone
import uuid


def timestamp():
    return datetime.now(timezone.utc).isoformat()


# ---------------- USERS ----------------

async def get_user(user_id, username=None):
    users = await read_json("database/users.json", {})

    key = str(user_id)

    if key not in users:
        users[key] = new_user(user_id, username)
        await write_json("database/users.json", users)

    return users[key]


# ---------------- PLAYLISTS ----------------

async def create_playlist(user_id, name):
    playlists = await read_json("database/playlists.json", {})

    playlist_id = uuid.uuid4().hex[:12]

    playlist = new_playlist(
        playlist_id,
        user_id,
        name
    )

    playlists[playlist_id] = playlist

    await write_json("database/playlists.json", playlists)

    return playlist


async def get_playlists(user_id):
    playlists = await read_json("database/playlists.json", {})

    return [
        playlist
        for playlist in playlists.values()
        if playlist["user_id"] == str(user_id)
    ]


async def add_playlist_song(playlist_id, user_id, song):
    playlists = await read_json("database/playlists.json", {})

    playlist = playlists.get(str(playlist_id))

    if not playlist or playlist["user_id"] != str(user_id):
        return None

    playlist["songs"].append(song)
    playlist["updated_at"] = timestamp()

    await write_json("database/playlists.json", playlists)

    return playlist


async def delete_playlist(playlist_id, user_id):
    playlists = await read_json("database/playlists.json", {})

    playlist = playlists.get(str(playlist_id))

    if not playlist or playlist["user_id"] != str(user_id):
        return False

    del playlists[str(playlist_id)]

    await write_json("database/playlists.json", playlists)

    return True


# ---------------- ROOMS ----------------

async def create_room(chat_id, host_id):
    rooms = await read_json("database/rooms.json", {})
    counter = await read_json(
        "database/counter.json",
        {"last_room_number": 0}
    )

    chat_key = str(chat_id)

    existing = rooms.get(chat_key)

    if existing and existing.get("status") == "active":
        return existing

    number = int(counter.get("last_room_number", 0)) + 1
    counter["last_room_number"] = number

    room_id = f"{number:04d}"

    room = new_room(room_id, chat_id, host_id)

    rooms[chat_key] = room

    await write_json("database/counter.json", counter)
    await write_json("database/rooms.json", rooms)

    return room


async def get_room(chat_id):
    rooms = await read_json("database/rooms.json", {})
    room = rooms.get(str(chat_id))

    if not room or room.get("status") != "active":
        return None

    return room


async def add_room_song(chat_id, song, requested_by):
    rooms = await read_json("database/rooms.json", {})
    room = rooms.get(str(chat_id))

    if not room or room.get("status") != "active":
        return None

    song_data = {
        **song,
        "requested_by": str(requested_by)
    }

    room.setdefault("queue", []).append(song_data)

    await write_json("database/rooms.json", rooms)

    return len(room["queue"])


async def skip_room_song(chat_id):
    rooms = await read_json("database/rooms.json", {})
    room = rooms.get(str(chat_id))

    if not room or not room.get("queue"):
        return None

    skipped = room["queue"].pop(0)
    room["current_song"] = (
        room["queue"][0] if room["queue"] else None
    )

    await write_json("database/rooms.json", rooms)

    return skipped


async def close_room(chat_id):
    rooms = await read_json("database/rooms.json", {})
    room = rooms.get(str(chat_id))

    if not room:
        return False

    room["status"] = "closed"
    room["closed_at"] = timestamp()

    await write_json("database/rooms.json", rooms)

    return True
