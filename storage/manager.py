
from datetime import datetime, timezone
import uuid

from storage.github_json import read_json, update_json
from storage.schemas import new_user, new_playlist, new_room


def timestamp():
    return datetime.now(timezone.utc).isoformat()


# -------------------------
# USERS
# -------------------------

async def get_user(user_id, username=None):
    def mutate(users):
        key = str(user_id)

        if key not in users:
            users[key] = new_user(user_id, username)

        return users[key]

    return await update_json("database/users.json", {}, mutate)


# -------------------------
# PLAYLISTS
# -------------------------

async def create_playlist(user_id, name):
    playlist_id = uuid.uuid4().hex[:12]
    playlist = new_playlist(playlist_id, user_id, name)

    def mutate(playlists):
        playlists[playlist_id] = playlist
        return playlist

    return await update_json("database/playlists.json", {}, mutate)


async def get_playlists(user_id):
    playlists = await read_json("database/playlists.json", {})

    return [
        item for item in playlists.values()
        if item.get("user_id") == str(user_id)
    ]


async def add_playlist_song(playlist_id, user_id, song):
    def mutate(playlists):
        playlist = playlists.get(str(playlist_id))

        if not playlist or playlist.get("user_id") != str(user_id):
            return None

        playlist.setdefault("songs", []).append(song)
        playlist["updated_at"] = timestamp()
        return playlist

    return await update_json("database/playlists.json", {}, mutate)


async def delete_playlist(playlist_id, user_id):
    def mutate(playlists):
        playlist = playlists.get(str(playlist_id))

        if not playlist or playlist.get("user_id") != str(user_id):
            return False

        del playlists[str(playlist_id)]
        return True

    return await update_json("database/playlists.json", {}, mutate)


# -------------------------
# ROOMS
# One independent room per Telegram chat_id
# -------------------------

async def get_room(chat_id):
    rooms = await read_json("database/rooms.json", {})
    room = rooms.get(str(chat_id))

    if not room or room.get("status") != "active":
        return None

    return room


async def create_room(chat_id, host_id):
    # Reuse the active room if this chat already has one.
    existing = await get_room(chat_id)

    if existing:
        return existing

    def next_counter(counter):
        counter["last_room_number"] = (
            int(counter.get("last_room_number", 0)) + 1
        )
        return counter["last_room_number"]

    number = await update_json(
        "database/counter.json",
        {"last_room_number": 0},
        next_counter
    )

    room = new_room(f"{number:04d}", chat_id, host_id)

    def save_room(rooms):
        existing_room = rooms.get(str(chat_id))

        if existing_room and existing_room.get("status") == "active":
            return existing_room

        rooms[str(chat_id)] = room
        return room

    return await update_json("database/rooms.json", {}, save_room)


async def get_or_create_room(chat_id, host_id=None, create=True):
    room = await get_room(chat_id)

    if room or not create:
        return room

    if host_id is None:
        return None

    return await create_room(chat_id, host_id)


async def add_room_song(chat_id, song, requested_by, media_type="music"):
    def mutate(rooms):
        room = rooms.get(str(chat_id))

        if not room or room.get("status") != "active":
            return None

        song_data = {
            **song,
            "requested_by": str(requested_by),
            "media_type": media_type
        }

        queue = room.setdefault("queue", [])
        queue.append(song_data)

        if room.get("current_song") is None:
            room["current_song"] = song_data

        return len(queue)

    return await update_json("database/rooms.json", {}, mutate)


async def get_room_queue(chat_id):
    room = await get_room(chat_id)

    if not room:
        return None

    return room.get("queue", [])


async def skip_room_song(chat_id):
    def mutate(rooms):
        room = rooms.get(str(chat_id))

        if not room or room.get("status") != "active":
            return None

        queue = room.setdefault("queue", [])

        if not queue:
            room["current_song"] = None
            return None

        skipped = queue.pop(0)
        room["current_song"] = queue[0] if queue else None

        return skipped

    return await update_json("database/rooms.json", {}, mutate)


async def remove_room_song(chat_id, position):
    def mutate(rooms):
        room = rooms.get(str(chat_id))

        if not room or room.get("status") != "active":
            return None

        queue = room.setdefault("queue", [])

        if position < 1 or position > len(queue):
            return None

        removed = queue.pop(position - 1)

        room["current_song"] = queue[0] if queue else None

        return removed

    return await update_json("database/rooms.json", {}, mutate)


async def close_room(chat_id):
    def mutate(rooms):
        room = rooms.get(str(chat_id))

        if not room or room.get("status") != "active":
            return False

        room["status"] = "closed"
        room["closed_at"] = timestamp()
        room["current_song"] = None
        room["queue"] = []

        return True

    return await update_json("database/rooms.json", {}, mutate)


# -------------------------
# COMPATIBILITY FUNCTIONS
# Used by Telegram handlers
# -------------------------

async def add_song(chat_id, song, requested_by, media_type="music"):
    return await add_room_song(
        chat_id, song, requested_by, media_type
    )


async def get_queue(chat_id):
    return await get_room_queue(chat_id)


async def skip_song(chat_id):
    return await skip_room_song(chat_id)


async def remove_song(chat_id, position):
    return await remove_room_song(chat_id, position)
