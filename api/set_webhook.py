
import os
import urllib.request
import urllib.parse
import json

def register_webhook():
    token = os.environ["BOT_TOKEN"]
    secret = os.environ["WEBHOOK_SECRET"]

    url = f"https://api.telegram.org/bot{token}/setWebhook"

    payload = {
        "url": "https://music-bot-dusky.vercel.app/webhook",
        "secret_token": secret,
        "drop_pending_updates": True
    }

    request = urllib.request.Request(
        url,
        data=urllib.parse.urlencode(payload).encode(),
        method="POST"
    )

    with urllib.request.urlopen(request) as response:
        return json.loads(response.read())

