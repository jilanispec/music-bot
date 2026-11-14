
import os
import json
import base64
import asyncio
from urllib.parse import quote

import aiohttp


GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_REPO = os.getenv("GITHUB_REPO", "jilanispec/music-bot")
GITHUB_BRANCH = os.getenv("GITHUB_BRANCH", "main")

BASE_URL = "https://api.github.com/repos"
LOCKS = {}


def get_lock(path):
    if path not in LOCKS:
        LOCKS[path] = asyncio.Lock()
    return LOCKS[path]


async def read_json(path, default=None):
    if default is None:
        default = {}

    if not GITHUB_TOKEN:
        raise RuntimeError("GITHUB_TOKEN is missing")

    url = f"{BASE_URL}/{GITHUB_REPO}/contents/{quote(path)}"

    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }

    params = {"ref": GITHUB_BRANCH}

    async with aiohttp.ClientSession() as session:
        async with session.get(
            url, headers=headers, params=params
        ) as response:

            if response.status == 404:
                return default

            if response.status != 200:
                raise RuntimeError(
                    f"GitHub read failed: {response.status}"
                )

            data = await response.json()
            content = base64.b64decode(
                data["content"]
            ).decode("utf-8")

            return json.loads(content)


async def write_json(path, data):
    if not GITHUB_TOKEN:
        raise RuntimeError("GITHUB_TOKEN is missing")

    async with get_lock(path):
        url = f"{BASE_URL}/{GITHUB_REPO}/contents/{quote(path)}"

        headers = {
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
        }

        async with aiohttp.ClientSession() as session:

            # Get the current file SHA.
            async with session.get(
                url,
                headers=headers,
                params={"ref": GITHUB_BRANCH}
            ) as response:

                if response.status == 200:
                    existing = await response.json()
                    sha = existing["sha"]
                elif response.status == 404:
                    sha = None
                else:
                    raise RuntimeError(
                        f"GitHub SHA lookup failed: {response.status}"
                    )

            content = json.dumps(
                data,
                indent=2,
                ensure_ascii=False
            )

            encoded = base64.b64encode(
                content.encode("utf-8")
            ).decode("ascii")

            payload = {
                "message": f"Update {path}",
                "content": encoded,
                "branch": GITHUB_BRANCH
            }

            if sha:
                payload["sha"] = sha

            async with session.put(
                url,
                headers=headers,
                json=payload
            ) as response:

                if response.status not in (200, 201):
                    error = await response.text()
                    raise RuntimeError(
                        f"GitHub write failed: {error}"
                    )

                return await response.json()
