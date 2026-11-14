
from storage.manager import (
    get_or_create_room as manager_get_or_create_room,
    get_room as manager_get_room,
    close_room as manager_close_room
)


async def get_or_create_room(chat_id, host_id, create=True):
    """
    Get an existing active room or create one.
    Uses GitHub-backed storage.
    """
    if not create:
        return await manager_get_room(chat_id)

    return await manager_get_or_create_room(
        chat_id,
        host_id
    )


async def get_room(chat_id):
    """Get an active room by Telegram chat ID."""
    return await manager_get_room(chat_id)


async def close_room(chat_id):
    """Close a room using GitHub-backed storage."""
    return await manager_close_room(chat_id)


__all__ = [
    "get_or_create_room",
    "get_room",
    "close_room"
]
