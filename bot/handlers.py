
from html import escape

from aiogram import Router
from aiogram.filters import CommandStart, Command
from aiogram.types import Message

from bot.youtube import search_youtube
from storage.manager import (
    get_or_create_room,
    get_room,
    close_room,
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

    if str(user.id) == str(room.get("host_id")):
        return True

    if message.chat.type == "private":
        return False

    try:
        member = await message.bot.get_chat_member(
            chat_id=message.chat.id,
            user_id=user.id
        )

        if member.status == "creator":
            return True

        if member.status == "administrator":
            return getattr(member, "can_manage_video_chats", False)

    except Exception as error:
        print("Permission check failed:", repr(error))

    return False


@router.message(CommandStart())
async def start(message: Message):
    await message.answer(
        "<b>TANANG MUSIC</b>\n"
        "<i>Your music. Your room.</i>\n\n"
        "<b>MUSIC</b>\n"
        "• <code>/play song name</code>\n"
        "• <code>/vplay video name</code>\n\n"
        "<b>ROOM</b>\n"
        "• <code>/room</code>\n"
        "• <code>/queue</code>\n"
        "• <code>/skip</code>\n"
        "• <code>/remove 2</code>\n"
        "• <code>/endroom</code>",
        parse_mode="HTML"
    )


async def process_request(message: Message, query: str, media_type: str):
    if not message.from_user:
        await message.answer("Could not identify the requesting user.")
        return

    if not query:
        command = "/play" if media_type == "music" else "/vplay"
        await message.answer(
            f"Usage: <code>{command} song name</code>",
            parse_mode="HTML"
        )
        return

    status = await message.answer("Searching YouTube...")

    try:
        # Search one result for the Telegram command.
        results = await search_youtube(query, limit=1)

        if not results:
            await status.edit_text("No matching result found.")
            return

        song = results[0]

        # Create the room automatically if it does not exist.
        room = await get_or_create_room(
            chat_id=message.chat.id,
            host_id=message.from_user.id,
            create=True
        )

        if not room:
            await status.edit_text("Could not create or load this chat's room.")
            return

        position = await add_song(
            chat_id=message.chat.id,
            song=song,
            requested_by=message.from_user.id,
            media_type=media_type
        )

        if position is None:
            await status.edit_text(
                "Could not add the song. Please try again."
            )
            return

        title = escape(str(song.get("title", "Unknown title")))
        channel = escape(str(song.get("channel", "Unknown channel")))
        duration = escape(str(song.get("duration", "Unknown")))
        url = escape(str(song.get("url", "")), quote=True)

        await status.edit_text(
            f"<b>ADDED TO QUEUE</b>\n\n"
            f"<b>{title}</b>\n"
            f"<i>{channel}</i>\n"
            f"<code>{duration}</code>\n\n"
            f"Room: <code>#{escape(str(room['room_id']))}</code>\n"
            f"Queue position: <code>{position}</code>\n\n"
            f'<a href="{url}">Open on YouTube</a>\n\n'
            "<i>Open the Mini App for playback.</i>",
            parse_mode="HTML",
            disable_web_page_preview=True
        )

    except Exception as error:
        print("PLAY REQUEST ERROR:", repr(error))
        await status.edit_text(
            "Something went wrong while processing your request. "
            "Please try again."
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
    if not message.from_user:
        await message.answer("Could not identify the user.")
        return

    try:
        # IMPORTANT: create=True. /room must create a room.
        room = await get_or_create_room(
            chat_id=message.chat.id,
            host_id=message.from_user.id,
            create=True
        )

        if not room:
            await message.answer("Could not create the room.")
            return

        queue = room.get("queue", [])

        await message.answer(
            "<b>ROOM READY</b>\n\n"
            f"Room ID: <code>#{escape(str(room['room_id']))}</code>\n"
            f"Host ID: <code>{escape(str(room['host_id']))}</code>\n"
            f"Queue: <code>{len(queue)}</code>\n\n"
            "Use <code>/play song name</code> to add music.",
            parse_mode="HTML"
        )

    except Exception as error:
        print("ROOM CREATE ERROR:", repr(error))
        await message.answer(
            "Could not create the room. Check the server logs."
        )


@router.message(Command("queue"))
async def queue_command(message: Message):
    try:
        queue = await get_queue(message.chat.id)

        if queue is None:
            await message.answer(
                "No active room. Send /room to create one."
            )
            return

        if not queue:
            await message.answer(
                "<b>The queue is empty.</b>",
                parse_mode="HTML"
            )
            return

        lines = ["<b>MUSIC QUEUE</b>\n"]

        for index, song in enumerate(queue, start=1):
            title = escape(str(song.get("title", "Unknown title")))
            duration = escape(str(song.get("duration", "Unknown")))

            lines.append(
                f"<b>{index}.</b> {title}\n"
                f"<code>{duration}</code>"
            )

        await message.answer(
            "\n\n".join(lines),
            parse_mode="HTML"
        )

    except Exception as error:
        print("QUEUE ERROR:", repr(error))
        await message.answer("Could not load the queue.")


@router.message(Command("skip"))
async def skip_command(message: Message):
    room = await get_room(message.chat.id)

    if not room:
        await message.answer("No active room. Send /room first.")
        return

    if not await can_manage_room(message, room):
        await message.answer("You cannot manage this room.")
        return

    try:
        skipped = await skip_song(message.chat.id)

        if not skipped:
            await message.answer("The queue is empty.")
            return

        await message.answer(
            f"<b>Skipped:</b> {escape(str(skipped.get('title', 'Unknown')))}",
            parse_mode="HTML"
        )

    except Exception as error:
        print("SKIP ERROR:", repr(error))
        await message.answer("Could not skip the song.")


@router.message(Command("remove"))
async def remove_command(message: Message):
    room = await get_room(message.chat.id)

    if not room:
        await message.answer("No active room. Send /room first.")
        return

    if not await can_manage_room(message, room):
        await message.answer("You cannot manage this room.")
        return

    argument = (message.text or "").partition(" ")[2].strip()

    if not argument.isdigit() or int(argument) < 1:
        await message.answer(
            "Usage: <code>/remove 2</code>",
            parse_mode="HTML"
        )
        return

    try:
        removed = await remove_song(
            message.chat.id,
            int(argument)
        )

        if not removed:
            await message.answer("Invalid queue position.")
            return

        await message.answer(
            f"<b>Removed:</b> {escape(str(removed.get('title', 'Unknown')))}",
            parse_mode="HTML"
        )

    except Exception as error:
        print("REMOVE ERROR:", repr(error))
        await message.answer("Could not remove that song.")


@router.message(Command("endroom"))
async def endroom(message: Message):
    room = await get_room(message.chat.id)

    if not room:
        await message.answer("No active room.")
        return

    if not await can_manage_room(message, room):
        await message.answer("You cannot close this room.")
        return

    try:
        await close_room(message.chat.id)

        await message.answer(
            "<b>ROOM CLOSED</b>\n\n"
            "The room queue has been cleared. "
            "Saved playlists are untouched.",
            parse_mode="HTML"
        )

    except Exception as error:
        print("END ROOM ERROR:", repr(error))
        await message.answer("Could not close the room.")


@router.message(Command("help"))
async def help_command(message: Message):
    await message.answer(
        "<b>TANANG MUSIC COMMANDS</b>\n\n"
        "<code>/room</code> — Create or show room\n"
        "<code>/play song</code> — Add music\n"
        "<code>/vplay video</code> — Add video\n"
        "<code>/queue</code> — Show queue\n"
        "<code>/skip</code> — Skip first item\n"
        "<code>/remove 2</code> — Remove queue item\n"
        "<code>/endroom</code> — Close room",
        parse_mode="HTML"
    )
