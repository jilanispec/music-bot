
from fastapi import FastAPI, HTTPException, Query
from bot.youtube import search_youtube

app = FastAPI()

@app.get("/search")
async def search(
    q: str = Query(..., min_length=2, max_length=100)
):
    try:
        results = await search_youtube(q, limit=5)

        return {
            "success": True,
            "query": q,
            "count": len(results),
            "results": results
        }

    except Exception as error:
        print("Search API error:", error)
        raise HTTPException(
            status_code=500,
            detail="YouTube search failed"
        )
