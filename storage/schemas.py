
from datetime import datetime, timezone


def now_utc():
    return datetime.now(timezone.utc).isoformat()


def new_user(user_id, username=None):
    return {
        "user_id": str(user_id),
        "username": username,
        "playlists": [],
        "created_at": now_utc()
    }


def new_playlist(playlist_id, user_id, name):
    return {
        "playlist_id": str(playlist_id),
        "user_id": str(user_id),
        "name": name,
        "songs": [],
        "created_at": now_utc(),
        "updated_at": now_utc()
    }


def new_room(room_id, chat_id, host_id):
    return {
        "room_id": str(room_id),
        "chat_id": str(chat_id),
        "host_id": str(host_id),
        "created_at": now_utc(),
        "status": "active",
        "current_song": None,
        "queue": [],
        "participants": [],
        "approved_admins": [],
        "playback": {
            "state": "paused",
            "position": 0,
            "updated_at": now_utc()
        }
    }
