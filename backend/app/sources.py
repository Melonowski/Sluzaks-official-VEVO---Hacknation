import os
import json
import httpx
import asyncio
from pathlib import Path

CORPUS_PATH = Path(__file__).resolve().parent.parent / "data" / "corpus.json"

def search_local_corpus(keywords: str, limit: int = 4) -> list[dict]:
    """Przeszukuje lokalny korpus z prostym stemmingiem (pierwsze 6 liter słowa)."""
    if not CORPUS_PATH.exists():
        return []
    try:
        with open(CORPUS_PATH, "r", encoding="utf-8") as f:
            docs = json.load(f)
        stems = [t.lower()[:6] for t in keywords.split() if len(t) > 3]
        if not stems:
            return []
        scored = []
        for doc in docs:
            haystack = f"{doc.get('title', '')} {doc.get('content', '')}".lower()
            score = sum(1 for s in stems if s in haystack)
            if score > 0:
                scored.append((score, str(doc.get("date", "")), doc))
        scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
        return [item[2] for item in scored[:limit]]
    except Exception:
        return []

async def fetch_dane_gov(query: str) -> list[dict]:
    url = "https://api.dane.gov.pl/1.4/search"
    params = {"q": query, "per_page": 4}
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            r = await client.get(url, params=params, headers={"Accept": "application/json"})
            if r.status_code != 200:
                return []
            items = r.json().get("data", [])
            results = []
            for item in items:
                attrs = item.get("attributes", {})
                item_type = item.get("type", "dataset")
                title = attrs.get("title", "Zasób dane.gov.pl")
                notes = attrs.get("notes") or attrs.get("description") or ""
                clean_notes = notes.replace("<p>", "").replace("</p>", " ").strip()
                results.append({
                    "title": title,
                    "publisher": "Portal Otwartych Danych dane.gov.pl (Źródło urzędowe)",
                    "date": str(attrs.get("created", ""))[:10] or "brak daty",
                    "url": f"https://dane.gov.pl/pl/{item_type}/{item.get('id', '')}",
                    "content": f"{title}. {clean_notes}"[:1500]
                })
            return results
    except Exception:
        return []

async def fetch_sejm_acts(query: str) -> list[dict]:
    clean_q = query.lower()
    for stop in ["ustawa", "ustawę", "ustawy", "w polsce", "wprowadzono", "uchwalono", "z dnia"]:
        clean_q = clean_q.replace(stop, "")
    clean_q = " ".join(clean_q.split())[:60]

    url = "https://api.sejm.gov.pl/eli/acts/search"
    params = {"title": clean_q, "limit": 5}
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            r = await client.get(url, params=params, headers={"Accept": "application/json"})
            if r.status_code != 200:
                return []
            items = r.json().get("items", [])
            items.sort(key=lambda x: str(x.get("promulgation", "")), reverse=True)
            results = []
            for item in items[:4]:
                eli = item.get("ELI", "")
                title = item.get("title", "Akt prawny")
                status = item.get("status", "nieznany")
                promulgation = item.get("promulgation") or str(item.get("year", ""))
                results.append({
                    "title": title,
                    "publisher": "ISAP / Kancelaria Sejmu RP (Źródło pierwotne)",
                    "date": promulgation,
                    "url": f"https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id={eli}",
                    "content": f"Akt prawny: {title}. Status aktu: {status}. Data ogłoszenia: {promulgation}. Oznaczenie ELI: {eli}."
                })
            return results
    except Exception:
        return []

async def fetch_sejm_interpellations(query: str) -> list[dict]:
    url = "https://api.sejm.gov.pl/sejm/term10/interpellations"
    params = {"title": query, "limit": 3}
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            r = await client.get(url, params=params, headers={"Accept": "application/json"})
            if r.status_code != 200:
                return []
            items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
            results = []
            for item in items[:3]:
                num = item.get("num", "")
                title = item.get("title", f"Interpelacja nr {num}")
                sent_date = item.get("sentDate", "brak daty")
                to_whom = ", ".join(item.get("to", [])) if isinstance(item.get("to"), list) else str(item.get("to", ""))
                results.append({
                    "title": f"Interpelacja poselska nr {num}: {title}",
                    "publisher": "Sejm RP X kadencji (Źródło urzędowe)",
                    "date": sent_date,
                    "url": f"https://www.sejm.gov.pl/sejm10.nsf/interpelacja.xsp?typ=INT&nr={num}",
                    "content": f"Interpelacja nr {num} w sprawie: {title}. Adresat: {to_whom}. Data wpływu: {sent_date}."
                })
            return results
    except Exception:
        return []

async def fetch_google_factcheck(query: str, lang: str = "pl") -> list[dict]:
    api_key = os.getenv("GOOGLE_FACTCHECK_API_KEY")
    if not api_key or "twoj_klucz" in api_key:
        return []
    url = "https://factchecktools.googleapis.com/v1alpha1/claims:search"
    params = {"query": query, "languageCode": lang, "pageSize": 4, "key": api_key}
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            r = await client.get(url, params=params)
            if r.status_code != 200:
                return []
            claims = r.json().get("claims", [])
            results = []
            for c in claims:
                review = (c.get("claimReview") or [{}])[0]
                publisher = review.get("publisher", {}).get("name", "Organizacja fact-checkingowa")
                rating = review.get("textualRating", "brak oceny")
                review_title = review.get("title") or c.get("text", "Weryfikacja")
                results.append({
                    "title": review_title,
                    "publisher": f"{publisher} (Wiarygodne źródło wtórne - IFCN/EFCSN)",
                    "date": str(review.get("reviewDate", ""))[:10] or "brak daty",
                    "url": review.get("url", ""),
                    "content": f"Sprawdzane twierdzenie: \"{c.get('text', '')}\". Werdykt organizacji {publisher}: {rating}. Podsumowanie: {review_title}."
                })
            return results
    except Exception:
        return []

async def gather_all_sources(keywords: str) -> list[dict]:
    local_docs = search_local_corpus(keywords)
    api_results = await asyncio.gather(
        fetch_sejm_acts(keywords),
        fetch_dane_gov(keywords),
        fetch_sejm_interpellations(keywords),
        fetch_google_factcheck(keywords, lang="pl"),
        fetch_google_factcheck(keywords, lang="en")
    )
    combined = local_docs + [doc for sublist in api_results for doc in sublist]
    
    seen_urls = set()
    unique_sources = []
    for doc in combined:
        u = doc.get("url", "")
        if u and u not in seen_urls:
            seen_urls.add(u)
            unique_sources.append(doc)
    return unique_sources[:8]