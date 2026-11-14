
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


def headers():
    if not GITHUB_TOKEN:
        raise RuntimeError("GITHUB_TOKEN is missing")

    return {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }


async def fetch_file(session, path):
    url = (
        f"{BASE_URL}/{GITHUB_REPO}/contents/"
        f"{quote(path, safe='/')}"
    )

    async with session.get(
        url,
        headers=headers(),
        params={"ref": GITHUB_BRANCH}
    ) as response:

        if response.status == 404:
            return {}, None

        if response.status != 200:
            raise RuntimeError(
                f"GitHub read failed: {response.status}"
            )

        result = await response.json()
        raw = base64.b64decode(
            result["content"]
        ).decode("utf-8")

        return json.loads(raw), result["sha"]


async def read_json(path, default=None):
    if default is None:
        default = {}

    timeout = aiohttp.ClientTimeout(total=20)

    async with aiohttp.ClientSession(timeout=timeout) as session:
        data, sha = await fetch_file(session, path)

    return data if sha else default


async def write_json(path, data):
    async with get_lock(path):
        timeout = aiohttp.ClientTimeout(total=25)

        async with aiohttp.ClientSession(timeout=timeout) as session:
            url = (
                f"{BASE_URL}/{GITHUB_REPO}/contents/"
                f"{quote(path, safe='/')}"
            )

            for attempt in range(4):
                current, sha = await fetch_file(session, path)

                encoded = base64.b64encode(
                    json.dumps(
                        data,
                        indent=2,
                        ensure_ascii=False
                    ).encode("utf-8")
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
                    headers=headers(),
                    json=payload
                ) as response:

                    if response.status in (200, 201):
                        return await response.json()

                    error = await response.text()

                    if response.status in (409, 422) and attempt < 3:
                        await asyncio.sleep(0.5 * (attempt + 1))
                        continue

                    raise RuntimeError(
                        f"GitHub write failed: {response.status}: {error}"
                    )

            raise RuntimeError("GitHub write conflict. Try again.")


async def update_json(path, default, mutator):
    """
    Read, modify and save one JSON file.
    Retries if another GitHub commit changes the file first.
    """
    async with get_lock(path):
        timeout = aiohttp.ClientTimeout(total=25)

        async with aiohttp.ClientSession(timeout=timeout) as session:
            url = (
                f"{BASE_URL}/{GITHUB_REPO}/contents/"
                f"{quote(path, safe='/')}"
            )

            for attempt in range(4):
                data, sha = await fetch_file(session, path)

                if sha is None:
                    data = json.loads(json.dumps(default))

                result = mutator(data)

                encoded = base64.b64encode(
                    json.dumps(
                        data,
                        indent=2,
                        ensure_ascii=False
                    ).encode("utf-8")
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
                    headers=headers(),
                    json=payload
                ) as response:

                    if response.status in (200, 201):
                        return result

                    error = await response.text()

                    if response.status in (409, 422) and attempt < 3:
                        await asyncio.sleep(0.5 * (attempt + 1))
                        continue

                    raise RuntimeError(
                        f"GitHub update failed: {response.status}: {error}"
                    )

            raise RuntimeError("GitHub update conflict. Try again.")
