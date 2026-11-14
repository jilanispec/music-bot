
import json
import getpass
import urllib.request

token = getpass.getpass("Enter your Telegram bot token: ")
secret = getpass.getpass("Enter your Vercel WEBHOOK_SECRET: ")

url = f"https://api.telegram.org/bot{token}/setWebhook"

payload = {
    "url": "https://music-bot-dusky.vercel.app/webhook",
    "secret_token": secret,
    "drop_pending_updates": True
}

request = urllib.request.Request(
    url,
    data=json.dumps(payload).encode(),
    headers={"Content-Type": "application/json"},
    method="POST"
)

try:
    with urllib.request.urlopen(request) as response:
        print(response.read().decode())
except Exception as error:
    print("Webhook registration failed:", error)
