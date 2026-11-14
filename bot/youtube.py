
import aiohttp
import re

from bot.config import YOUTUBE_API_KEY

BASE_URL = "https://www.googleapis.com/youtube/v3"


def parse_duration(value):
    match = re.fullmatch(
        r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?",
        value
    )

    if not match:
        return 0, "Unknown"

    hours, minutes, seconds = [
        int(x or 0) for x in match.groups()
    ]

    total = hours * 3600 + minutes * 60 + seconds

    if hours:
        formatted = f"{hours}:{minutes:02}:{seconds:02}"
    else:
        formatted = f"{minutes}:{seconds:02}"

    return total, formatted


async def search_youtube(query, limit=5):
    timeout = aiohttp.ClientTimeout(total=25)

    async with aiohttp.ClientSession(timeout=timeout) as session:

        params = {
            "part": "snippet",
            "q": query,
            "type": "video",
            "maxResults": 10,
            "order": "relevance",
            "regionCode": "IN",
            "key": YOUTUBE_API_KEY
        }

        async with session.get(
            f"{BASE_URL}/search",
            params=params
        ) as response:

            data = await response.json()

            if response.status != 200:
                raise RuntimeError(
                    data.get("error", {}).get(
                        "message", "YouTube search failed"
                    )
                )

        items = data.get("items", [])

        if not items:
            return []

        video_ids = [
            item["id"]["videoId"]
            for item in items
        ]

        details_params = {
            "part": "contentDetails,status",
            "id": ",".join(video_ids),
            "key": YOUTUBE_API_KEY
        }

        async with session.get(
            f"{BASE_URL}/videos",
            params=details_params
        ) as response:

            details = await response.json()

            if response.status != 200:
                raise RuntimeError(
                    details.get("error", {}).get(
                        "message", "Video details failed"
                    )
                )

        detail_map = {
            item["id"]: item
            for item in details.get("items", [])
        }

        results = []

        for item in items:
            video_id = item["id"]["videoId"]
            detail = detail_map.get(video_id)

            if not detail:
                continue

            # Skip private or unavailable videos
            if detail.get("status", {}).get("privacyStatus") != "public":
                continue

            total, duration = parse_duration(
                detail["contentDetails"]["duration"]
            )

            # Exclude videos of 3 minutes or less
            # This helps exclude YouTube Shorts.
            if total <= 180:
                continue

            snippet = item["snippet"]

            results.append({
                "id": video_id,
                "title": snippet["title"],
                "channel": snippet["channelTitle"],
                "thumbnail": snippet["thumbnails"]
                    .get("high",
                         snippet["thumbnails"].get("medium", {}))
                    .get("url"),
                "duration": duration,
                "duration_seconds": total,
                "url": (
                    "https://www.youtube.com/watch?v="
                    + video_id
                )
            })

            if len(results) >= limit:
                break

        return results
