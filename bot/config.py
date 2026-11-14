
import os

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "").strip()

# Validate only when starting the Telegram bot.
# The Mini App search API only needs the YouTube API key.
def validate_bot_config():
    if not BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN environment variable is missing")

    if not YOUTUBE_API_KEY:
        raise RuntimeError("YOUTUBE_API_KEY environment variable is missing")

def validate_youtube_config():
    if not YOUTUBE_API_KEY:
        raise RuntimeError("YOUTUBE_API_KEY environment variable is missing")
