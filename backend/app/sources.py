import os
import httpx
import asyncio

async def fetch_dane_gov(query: str) -> list[dict]:
    url = "https://api.dane.gov.pl/1.4/search"
    params = {"q": query, "per_page": 3}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(url, params=params)
            if r.status_code != 200:
                return []
            items = r.json().get("data", [])
            results = []
            for item in items:
                attrs = item.get("attributes", {})
                results.append({
                    "title": attrs.get("title", "Zasób dane.gov.pl"),
                    "publisher": "dane.gov.pl (Źródło urzędowe)",
                    "date": str(attrs.get("created", ""))[:10] or "brak daty",
                    "url": f"https://dane.gov.pl/pl/dataset/{item.get('id', '')}",
                    "content": f"{attrs.get('title', '')}. {attrs.get('notes', '')}"[:1200]
                })
            return results
    except Exception:
        return []

async def fetch_sejm_acts(query: str) -> list[dict]:
    url = "https://api.sejm.gov.pl/eli/acts/search"
    params = {"title": query, "limit": 3}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(url, params=params)
            if r.status_code != 200:
                return []
            items = r.json().get("items", [])
            results = []
            for item in items:
                eli = item.get("ELI", "")
                results.append({
                    "title": item.get("title", "Akt prawny ELI"),
                    "publisher": "ISAP / Sejm RP (Źródło pierwotne)",
                    "date": item.get("promulgation", "brak daty"),
                    "url": f"https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id={eli}",
                    "content": f"Akt prawny: {item.get('title', '')}. Status: {item.get('status', '')}. Data ogłoszenia: {item.get('promulgation', '')}."
                })
            return results
    except Exception:
        return []

async def fetch_google_factcheck(query: str) -> list[dict]:
    api_key = os.getenv("GOOGLE_FACTCHECK_API_KEY")
    if not api_key:
        return []
    url = "https://factchecktools.googleapis.com/v1alpha1/claims:search"
    params = {"query": query, "languageCode": "pl", "key": api_key}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(url, params=params)
            if r.status_code != 200:
                return []
            claims = r.json().get("claims", [])
            results = []
            for c in claims[:3]:
                review = (c.get("claimReview") or [{}])[0]
                publisher = review.get("publisher", {}).get("name", "Organizacja fact-checkingowa")
                results.append({
                    "title": review.get("title") or c.get("text", "Weryfikacja fact-checkingowa"),
                    "publisher": f"{publisher} (Wiarygodne źródło wtórne)",
                    "date": str(review.get("reviewDate", ""))[:10] or "brak daty",
                    "url": review.get("url", ""),
                    "content": f"Twierdzenie: {c.get('text', '')}. Ocena: {review.get('textualRating', '')}. Tytuł analizy: {review.get('title', '')}."
                })
            return results
    except Exception:
        return []

async def gather_all_sources(keywords: str) -> list[dict]:
    res = await asyncio.gather(
        fetch_dane_gov(keywords),
        fetch_sejm_acts(keywords),
        fetch_google_factcheck(keywords)
    )
    # Spłaszczenie listy wyników
    return [doc for sublist in res for doc in sublist]