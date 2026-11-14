
from html import escape

from aiogram import Router
from aiogram.filters import CommandStart, Command
from aiogram.types import Message

from bot.youtube import search_youtube
from bot.rooms import get_or_create_room, close_room
from bot.queue import (
    add_song,
    get_queue,
    remove_song,
    skip_song
)

router = Router()


async def can_manage_room(message: Message, room):
    user = message.from_user

    if not user:
        return False

    # Room host always has management permission
    if user.id == room["host_id"]:
        return True

    # Private chat: only host
    if message.chat.type == "private":
        return False

    # Check actual Telegram administrator permissions
    try:
        member = await message.bot.get_chat_member(
            chat_id=message.chat.id,
            user_id=user.id
        )

        if member.status == "creator":
            return True

        if member.status == "administrator":
            return getattr(
                member,
                "can_manage_video_chats",
                False
            )

    except Exception as error:
        print("Permission check failed:", error)

    return False


@router.message(CommandStart())
async def start(message: Message):
    await message.answer(
        "<b>🎧 MUSIC ASSISTANT</b>\n"
        "<i>Your music. Your room. Your vibe.</i>\n\n"
        "━━━━━━━━━━━━━━━━━━\n"
        "<b>🎵 MUSIC</b>\n"
        "• <code>/play song name</code>\n"
        "• <code>/vplay video name</code>\n\n"
        "<b>📚 ROOM</b>\n"
        "• <code>/room</code>\n"
        "• <code>/queue</code>\n"
        "• <code>/skip</code>\n"
        "• <code>/remove 2</code>\n"
        "• <code>/endroom</code>\n\n"
        "<i>✨ Enjoy your music!</i>",
        parse_mode="HTML"
    )


async def process_request(message: Message, query: str, media_type: str):
    if not query:
        command = "/play" if media_type == "music" else "/vplay"

        await message.answer(
            f"Usage: <code>{command} song name</code>",
            parse_mode="HTML"
        )
        return

    status = await message.answer(
        "🔎 <b>SEARCHING YOUTUBE...</b>",
        parse_mode="HTML"
    )

    try:
        results = await search_youtube(query, limit=1)

        if not results:
            await status.edit_text(
                "❌ <b>No matching result found.</b>",
                parse_mode="HTML"
            )
            return

        song = results[0]

        room = await get_or_create_room(
            chat_id=message.chat.id,
            host_id=message.from_user.id
        )

        position = await add_song(
            chat_id=message.chat.id,
            song=song,
            requested_by=message.from_user.id,
            media_type=media_type
        )

        if position is None:
            await status.edit_text(
                "❌ Could not add the song to the room.",
                parse_mode="HTML"
            )
            return

        title = escape(song["title"])
        channel = escape(song["channel"])

        await status.edit_text(
            f"🎧 <b>ADDED TO QUEUE</b>\n\n"
            f"🎵 <b>{title}</b>\n"
            f"📺 <i>{channel}</i>\n"
            f"⏱️ <code>{escape(song['duration'])}</code>\n\n"
            f"🏠 <b>Room:</b> <code>#{room['room_id']}</code>\n"
            f"📋 <b>Queue position:</b> <code>{position}</code>\n\n"
            f"▶️ <a href=\"{song['url']}\">Watch on YouTube</a>\n\n"
            "<i>Open the Mini App for playback.</i>",
            parse_mode="HTML"
        )

    except Exception as error:
        print("Request error:", error)

        await status.edit_text(
            "⚠️ <b>Something went wrong.</b>\n"
            "<i>Please try again.</i>",
            parse_mode="HTML"
        )


@router.message(Command("play"))
async def play(message: Message):
    query = (message.text or "").partition(" ")[2].strip()
    await process_request(message, query, "music")


@router.message(Command("vplay"))
async def vplay(message: Message):
    query = (message.text or "").partition(" ")[2].strip()
    await process_request(message, query, "video")


@router.message(Command("room"))
async def room_info(message: Message):
    room = await get_or_create_room(
        message.chat.id,
        message.from_user.id,
        create=False
    )

    if not room:
        await message.answer("❌ No active room.")
        return

    await message.answer(
        f"🏠 <b>ROOM INFORMATION</b>\n\n"
        f"🆔 <code>#{room['room_id']}</code>\n"
        f"👑 Host ID: <code>{room['host_id']}</code>\n"
        f"🎵 Queue: <code>{len(room['queue'])}</code>",
        parse_mode="HTML"
    )


@router.message(Command("queue"))
async def queue_command(message: Message):
    queue = await get_queue(message.chat.id)

    if queue is None:
        await message.answer("❌ No active room.")
        return

    if not queue:
        await message.answer("📋 <b>The queue is empty.</b>", parse_mode="HTML")
        return

    lines = ["🎧 <b>MUSIC QUEUE</b>\n"]

    for index, song in enumerate(queue, start=1):
        title = escape(song["title"])
        duration = escape(song["duration"])

        lines.append(
            f"<b>{index}.</b> {title}\n"
            f"⏱️ <code>{duration}</code>"
        )

    await message.answer(
        "\n\n".join(lines),
        parse_mode="HTML"
    )


@router.message(Command("skip"))
async def skip_command(message: Message):
    room = await get_or_create_room(
        message.chat.id,
        message.from_user.id,
        create=False
    )

    if not room:
        await message.answer("❌ No active room.")
        return

    if not await can_manage_room(message, room):
        await message.answer("⛔ You cannot manage this room.")
        return

    skipped = await skip_song(message.chat.id)

    if not skipped:
        await message.answer("📋 Queue is empty.")
        return

    await message.answer(
        f"⏭️ <b>Removed from queue:</b>\n"
        f"{escape(skipped['title'])}\n\n"
        "<i>Playback integration is coming next.</i>",
        parse_mode="HTML"
    )


@router.message(Command("remove"))
async def remove_command(message: Message):
    room = await get_or_create_room(
        message.chat.id,
        message.from_user.id,
        create=False
    )

    if not room:
        await message.answer("❌ No active room.")
        return

    if not await can_manage_room(message, room):
        await message.answer("⛔ You cannot manage this room.")
        return

    argument = (message.text or "").partition(" ")[2].strip()

    if not argument.isdigit():
        await message.answer(
            "Usage: <code>/remove 2</code>",
            parse_mode="HTML"
        )
        return

    removed = await remove_song(
        message.chat.id,
        int(argument)
    )

    if not removed:
        await message.answer("❌ Invalid queue position.")
        return

    await message.answer(
        f"🗑️ <b>Removed:</b>\n{escape(removed['title'])}",
        parse_mode="HTML"
    )


@router.message(Command("endroom"))
async def endroom(message: Message):
    room = await get_or_create_room(
        message.chat.id,
        message.from_user.id,
        create=False
    )

    if not room:
        await message.answer("❌ No active room.")
        return

    if not await can_manage_room(message, room):
        await message.answer("⛔ You cannot close this room.")
        return

    await close_room(message.chat.id)

    await message.answer(
        "🛑 <b>ROOM CLOSED</b>\n\n"
        "Temporary room data cleared.\n"
        "Saved playlists are untouched.",
        parse_mode="HTML"
    )


@router.message(Command("help"))
async def help_command(message: Message):
    await message.answer(
        "<b>🎧 MUSIC ASSISTANT</b>\n\n"
        "<code>/play song</code> — Add music\n"
        "<code>/vplay video</code> — Add video\n"
        "<code>/room</code> — Room information\n"
        "<code>/queue</code> — Show queue\n"
        "<code>/skip</code> — Skip queued item\n"
        "<code>/remove 2</code> — Remove item\n"
        "<code>/endroom</code> — Close room",
        parse_mode="HTML"
    )
