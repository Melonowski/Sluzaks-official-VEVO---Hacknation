import os
import re
import json
import httpx
import asyncio
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from bs4 import BeautifulSoup
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import quote_plus, unquote, parse_qs, urlparse

CORPUS_PATH = Path(__file__).resolve().parent.parent / "data" / "corpus.json"

LIVE_RSS_FEEDS = [
    {"url": "https://demagog.org.pl/feed/", "publisher": "Stowarzyszenie Demagog (IFCN/EFCSN)", "domain": "demagog.org.pl", "type": "wiarygodne wtórne"},
    {"url": "https://fakenews.pl/feed/", "publisher": "FakeNews.pl (IFCN)", "domain": "fakenews.pl", "type": "wiarygodne wtórne"},
    {"url": "https://konkret24.tvn24.pl/najnowsze.xml", "publisher": "Konkret24 TVN24 (IFCN)", "domain": "konkret24.tvn24.pl", "type": "wiarygodne wtórne"},
    {"url": "https://cert.pl/feed/", "publisher": "CERT Polska / NASK", "domain": "cert.pl", "type": "urzędowe"},
    {"url": "https://www.pap.pl/rss.xml", "publisher": "Polska Agencja Prasowa (PAP)", "domain": "pap.pl", "type": "wiarygodne wtórne"},
]

PL_STOPWORDS = {
    "oraz", "który", "która", "które", "którzy", "których", "którym", "której",
    "jest", "są", "był", "była", "było", "byli", "były", "będzie", "będą",
    "dla", "przy", "przez", "przed", "ponad", "pod", "nad", "jako", "jak",
    "czy", "że", "się", "nie", "tak", "tylko", "bardzo", "może", "mogą",
    "miał", "miała", "miało", "mieli", "miały", "wobec", "według", "temat",
    "sprawie", "nowy", "nowa", "nowe", "polsce", "polski", "polska", "roku",
    "ten", "ta", "to", "te", "tym", "tej", "tych", "na", "do", "od", "po", "za", "we"
}


def _clean_html(raw_html: str) -> str:
    if not raw_html:
        return ""
    soup = BeautifulSoup(raw_html, "html.parser")
    return " ".join(soup.get_text(" ").split())


def _normalize_date(raw_date: str | None) -> str:
    if not raw_date:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")
    s = str(raw_date).strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        return s[:10]
    try:
        dt = parsedate_to_datetime(s)
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%d")
    except Exception:
        pass
    m = re.search(r"(20\d{2})", s)
    if m:
        return f"{m.group(1)}-01-01"
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _extract_search_tokens(text: str) -> list[str]:
    words = re.findall(r"[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9]{2,}", text.lower())
    tokens = [w for w in words if w not in PL_STOPWORDS]
    return tokens or words


def _append_to_live_corpus(new_docs: list[dict]):
    if not new_docs:
        return
    CORPUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    existing = []
    if CORPUS_PATH.exists():
        try:
            with open(CORPUS_PATH, "r", encoding="utf-8") as f:
                existing = json.load(f)
        except Exception:
            existing = []

    seen_urls = {d.get("url") for d in existing if d.get("url")}
    now_iso = datetime.now(timezone.utc).isoformat()
    added = 0

    for doc in new_docs:
        u = doc.get("url")
        if u and u not in seen_urls:
            seen_urls.add(u)
            doc_copy = dict(doc)
            doc_copy["fetched_at"] = now_iso
            existing.append(doc_copy)
            added += 1

    if added > 0:
        with open(CORPUS_PATH, "w", encoding="utf-8") as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)


def search_local_corpus(keywords: str, limit: int = 5) -> list[dict]:
    if not CORPUS_PATH.exists():
        return []
    try:
        with open(CORPUS_PATH, "r", encoding="utf-8") as f:
            docs = json.load(f)
        tokens = _extract_search_tokens(keywords)
        stems = [t[:4] if len(t) >= 4 else t for t in tokens if len(t) >= 2]
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


async def fetch_live_rss_factchecks(query: str) -> list[dict]:
    tokens = _extract_search_tokens(query)
    stems = [t[:4] if len(t) >= 4 else t for t in tokens if len(t) >= 2]
    results = []
    all_fetched = []

    async with httpx.AsyncClient(timeout=7.0, follow_redirects=True) as client:
        tasks = [client.get(feed["url"], headers={"User-Agent": "PrawdowidBot/1.2"}) for feed in LIVE_RSS_FEEDS]
        responses = await asyncio.gather(*tasks, return_exceptions=True)

        for feed, resp in zip(LIVE_RSS_FEEDS, responses):
            if isinstance(resp, Exception) or resp.status_code != 200:
                continue
            try:
                root = ET.fromstring(resp.text)
                for item in root.findall(".//item")[:35]:
                    title = _clean_html(item.findtext("title") or "")
                    link = (item.findtext("link") or "").strip()
                    desc = _clean_html(item.findtext("description") or "")
                    pub_date = _normalize_date(item.findtext("pubDate"))

                    doc = {
                        "title": title,
                        "publisher": feed["publisher"],
                        "domain": feed["domain"],
                        "type": feed["type"],
                        "date": pub_date,
                        "url": link,
                        "content": f"{title}. {desc}"[:1600]
                    }
                    all_fetched.append(doc)

                    haystack = f"{title} {desc}".lower()
                    if stems and any(s in haystack for s in stems):
                        results.append(doc)
            except Exception:
                continue

    _append_to_live_corpus(all_fetched)
    return results[:6]


async def fetch_demagog_live_search(query: str) -> list[dict]:
    tokens = _extract_search_tokens(query)
    search_q = " ".join(tokens[:4]) if tokens else query[:60]
    url = f"https://demagog.org.pl/?s={quote_plus(search_q)}"
    try:
        async with httpx.AsyncClient(timeout=7.0, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "PrawdowidBot/1.2"})
            if r.status_code != 200:
                return []
            soup = BeautifulSoup(r.text, "html.parser")
            results = []
            for article in soup.select("article")[:5]:
                a_tag = article.select_one("h2 a, h3 a")
                if not a_tag:
                    continue
                title = _clean_html(a_tag.get_text())
                link = a_tag.get("href", "")
                excerpt_el = article.select_one("p")
                excerpt = _clean_html(excerpt_el.get_text()) if excerpt_el else ""
                time_el = article.select_one("time")
                date_str = _normalize_date(time_el.get("datetime") if time_el else None)

                results.append({
                    "title": title,
                    "publisher": "Stowarzyszenie Demagog (IFCN/EFCSN)",
                    "domain": "demagog.org.pl",
                    "type": "wiarygodne wtórne",
                    "date": date_str,
                    "url": link,
                    "content": f"{title}. {excerpt}"[:1600]
                })
            return results
    except Exception:
        return []


async def fetch_dane_gov(query: str) -> list[dict]:
    tokens = _extract_search_tokens(query)
    search_q = " ".join(tokens[:4]) if tokens else query[:60]
    url = "https://api.dane.gov.pl/1.4/search"
    params = {"q": search_q, "per_page": 4}
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
                clean_notes = _clean_html(attrs.get("notes") or attrs.get("description") or "")
                results.append({
                    "title": title,
                    "publisher": "Portal Otwartych Danych dane.gov.pl (Źródło urzędowe)",
                    "domain": "dane.gov.pl",
                    "type": "urzędowe",
                    "date": _normalize_date(attrs.get("created")),
                    "url": f"https://dane.gov.pl/pl/{item_type}/{item.get('id', '')}",
                    "content": f"{title}. {clean_notes}"[:1600]
                })
            return results
    except Exception:
        return []


async def fetch_sejm_acts(query: str) -> list[dict]:
    tokens = [t for t in _extract_search_tokens(query) if t not in {"ustawa", "ustawę", "ustawy", "kodeks", "rozporządzenie"}]
    clean_q = " ".join(tokens[:4])[:60]
    if len(clean_q) < 2:
        return []

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
                promulgation = _normalize_date(item.get("promulgation") or str(item.get("year", "")))
                results.append({
                    "title": title,
                    "publisher": "ISAP / Kancelaria Sejmu RP (Źródło pierwotne)",
                    "domain": "isap.sejm.gov.pl",
                    "type": "urzędowe",
                    "date": promulgation,
                    "url": f"https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id={eli}",
                    "content": f"Akt prawny: {title}. Status aktu: {status}. Data ogłoszenia: {promulgation}. Oznaczenie ELI: {eli}."
                })
            return results
    except Exception:
        return []


async def fetch_sejm_interpellations(query: str) -> list[dict]:
    tokens = _extract_search_tokens(query)
    search_q = " ".join(tokens[:3]) if tokens else query[:50]
    url = "https://api.sejm.gov.pl/sejm/term10/interpellations"
    params = {"title": search_q, "limit": 3}
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
                sent_date = _normalize_date(item.get("sentDate"))
                results.append({
                    "title": f"Interpelacja poselska nr {num}: {title}",
                    "publisher": "Sejm RP X kadencji (Źródło urzędowe)",
                    "domain": "sejm.gov.pl",
                    "type": "urzędowe",
                    "date": sent_date,
                    "url": f"https://www.sejm.gov.pl/sejm10.nsf/interpelacja.xsp?typ=INT&nr={num}",
                    "content": f"Interpelacja nr {num} w sprawie: {title}. Data wpływu: {sent_date}."
                })
            return results
    except Exception:
        return []


async def fetch_google_factcheck(query: str, lang: str = "pl") -> list[dict]:
    api_key = os.getenv("GOOGLE_FACTCHECK_API_KEY")
    if not api_key or "twoj_klucz" in api_key:
        return []
    tokens = _extract_search_tokens(query)
    search_q = " ".join(tokens[:5]) if tokens else query[:80]
    url = "https://factchecktools.googleapis.com/v1alpha1/claims:search"
    params = {"query": search_q, "languageCode": lang, "pageSize": 5, "key": api_key}
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
                    "domain": "factchecktools.googleapis.com",
                    "type": "wiarygodne wtórne",
                    "date": _normalize_date(review.get("reviewDate")),
                    "url": review.get("url", ""),
                    "content": f"Sprawdzane twierdzenie: \"{c.get('text', '')}\". Werdykt organizacji {publisher}: {rating}. Podsumowanie: {review_title}."
                })
            return results
    except Exception:
        return []


async def fetch_wikipedia_pl(query: str) -> list[dict]:
    tokens = _extract_search_tokens(query)
    search_q = " ".join(tokens[:5]) if tokens else query[:80]
    url = "https://pl.wikipedia.org/w/api.php"
    params = {
        "action": "query",
        "list": "search",
        "srsearch": search_q,
        "format": "json",
        "srlimit": 4
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(url, params=params, headers={"User-Agent": "PrawdowidBot/1.2"})
            if r.status_code != 200:
                return []
            items = r.json().get("query", {}).get("search", [])
            results = []
            for item in items:
                title = item.get("title", "")
                snippet = _clean_html(item.get("snippet", ""))
                results.append({
                    "title": f"Wikipedia: {title}",
                    "publisher": "Wikipedia (Źródło encyklopedyczne pomocnicze)",
                    "domain": "pl.wikipedia.org",
                    "type": "wiarygodne wtórne",
                    "date": _normalize_date(item.get("timestamp")),
                    "url": f"https://pl.wikipedia.org/wiki/{quote_plus(title.replace(' ', '_'))}",
                    "content": f"Hasło encyklopedyczne {title}: {snippet}"
                })
            return results
    except Exception:
        return []


async def fetch_web_search_fallback(query: str) -> list[dict]:
    """Dodatkowe wyszukiwanie sieciowe (DuckDuckGo HTML) przy krótkich wycinkach i nietypowych tematach."""
    tokens = _extract_search_tokens(query)
    search_q = " ".join(tokens[:5]) if tokens else query[:80]
    if not search_q:
        return []
    url = f"https://html.duckduckgo.com/html/?q={quote_plus(search_q)}"
    try:
        async with httpx.AsyncClient(timeout=6.0, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
            if r.status_code != 200:
                return []
            soup = BeautifulSoup(r.text, "html.parser")
            results = []
            for res in soup.select(".result")[:4]:
                a_tag = res.select_one("a.result__a")
                snip_el = res.select_one(".result__snippet")
                if not a_tag:
                    continue
                raw_href = a_tag.get("href", "")
                clean_href = raw_href
                if "uddg=" in raw_href:
                    parsed = urlparse(raw_href)
                    qs = parse_qs(parsed.query)
                    if qs.get("uddg"):
                        clean_href = unquote(qs["uddg"][0])
                if not clean_href.startswith("http"):
                    continue
                domain = urlparse(clean_href).netloc.replace("www.", "")
                title = _clean_html(a_tag.get_text())
                snippet = _clean_html(snip_el.get_text()) if snip_el else ""
                results.append({
                    "title": title or domain,
                    "publisher": f"Źródło sieciowe ({domain})",
                    "domain": domain,
                    "type": "wiarygodne wtórne",
                    "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                    "url": clean_href,
                    "content": f"{title}. {snippet}"[:1500]
                })
            return results
    except Exception:
        return []


async def gather_all_sources(keywords: str) -> list[dict]:
    local_docs = search_local_corpus(keywords)
    api_results = await asyncio.gather(
        fetch_live_rss_factchecks(keywords),
        fetch_demagog_live_search(keywords),
        fetch_sejm_acts(keywords),
        fetch_dane_gov(keywords),
        fetch_sejm_interpellations(keywords),
        fetch_google_factcheck(keywords, lang="pl"),
        fetch_google_factcheck(keywords, lang="en"),
        fetch_wikipedia_pl(keywords),
        fetch_web_search_fallback(keywords),
    )
    live_docs = [doc for sublist in api_results for doc in sublist]

    _append_to_live_corpus(live_docs)

    combined = live_docs + local_docs
    seen_urls = set()
    unique_sources = []
    for doc in combined:
        u = doc.get("url", "")
        if u and u not in seen_urls:
            seen_urls.add(u)
            unique_sources.append(doc)
    return unique_sources[:12]