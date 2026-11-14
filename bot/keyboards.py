
from aiogram.types import (
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    WebAppInfo
)

MINI_APP_URL = "https://jilanispec.github.io/attendance-tracker/"

def main_keyboard():
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🎵 Open Music Player",
                    web_app=WebAppInfo(url=MINI_APP_URL)
                )
            ]
        ]
    )
