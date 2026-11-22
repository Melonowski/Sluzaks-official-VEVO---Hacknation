import os
import csv
import io
import json
from datetime import datetime
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv
from groq import AsyncGroq
from app.pipeline import run_verification_pipeline, get_available_models

load_dotenv()

app = FastAPI(title="Prawdowid API - MSZ HackNation")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

LOGS_PATH = Path(__file__).resolve().parent.parent / "data" / "logs.json"
SESSIONS_STORE: dict[str, dict] = {}


class VerifyRequest(BaseModel):
    input_text: str | None = None
    image_base64: str | None = None
    page_url: str | None = None
    selection_rect: dict | None = None
    channel: str = "web"


class ChatRequest(BaseModel):
    session_id: str | None = None
    question: str


def save_audit_log(session_data: dict, channel: str, query_preview: str):
    LOGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    logs = []
    if LOGS_PATH.exists():
        try:
            with open(LOGS_PATH, "r", encoding="utf-8") as f:
                logs = json.load(f)
        except Exception:
            logs = []

    sources_used = [
        src.get("url")
        for c in session_data.get("claims", [])
        for src in c.get("sources", [])
    ]
    logs.append({
        "session_id": session_data.get("session_id"),
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "channel": channel,
        "query_masked": query_preview[:200],
        "verdict": session_data.get("verdict"),
        "sources": sources_used,
        "latency_ms": session_data.get("metrics", {}).get("latency_ms"),
        "security_alert": session_data.get("security_alert")
    })
    with open(LOGS_PATH, "w", encoding="utf-8") as f:
        json.dump(logs[-200:], f, ensure_ascii=False, indent=2)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/verify")
async def verify(req: VerifyRequest):
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or api_key == "tutaj_wklej_klucz_groq":
        raise HTTPException(
            status_code=503,
            detail="Brak skonfigurowanego klucza API – sprawdzenie niemożliwe."
        )

    # Swagger (/docs) wstawia domyślnie "string" w polach – to nie jest prawdziwy obraz.
    # Prawdziwy zrzut ekranu ma zawsze tysiące znaków.
    if req.image_base64 is not None and len(req.image_base64.strip()) < 100:
        req.image_base64 = None
    if req.input_text is not None and req.input_text.strip().lower() == "string":
        req.input_text = None

    if (not req.input_text or len(req.input_text.strip()) < 5) and not req.image_base64:
        raise HTTPException(
            status_code=400,
            detail="Brak treści do weryfikacji – wpisz tekst, podaj URL lub zaznacz fragment ekranu."
        )
    try:
        result = await run_verification_pipeline(
            raw_text=req.input_text or "",
            channel=req.channel,
            image_base64=req.image_base64,
            page_url=req.page_url
        )
        sid = result["session_id"]
        session_full = dict(result)
        if req.image_base64:
            session_full["image_base64"] = req.image_base64
        SESSIONS_STORE[sid] = session_full

        save_audit_log(
            result,
            req.channel,
            req.input_text or f"[OCR zrzutu z {req.page_url or 'strony'}]"
        )
        return result
    except ValueError as e:
        # błąd danych wejściowych (np. uszkodzony obraz), nie awaria AI
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Błąd usługi weryfikacji: {str(e)}")


@app.get("/api/session/{session_id}")
def get_session(session_id: str):
    if session_id not in SESSIONS_STORE:
        raise HTTPException(status_code=404, detail="Nie znaleziono sesji lub została usunięta.")
    return SESSIONS_STORE[session_id]


@app.delete("/api/session/{session_id}")
def delete_session(session_id: str):
    SESSIONS_STORE.pop(session_id, None)
    return {"status": "deleted", "session_id": session_id}


@app.post("/api/chat")
async def chat_about_session(req: ChatRequest):
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Brak klucza API.")

    session_ctx = SESSIONS_STORE.get(req.session_id or "", {})
    safe_ctx = {k: v for k, v in session_ctx.items() if k != "image_base64"}

    client = AsyncGroq(api_key=api_key)
    fast_model, _ = await get_available_models(client)

    resp = await client.chat.completions.create(
        model=fast_model,
        messages=[
            {
                "role": "system",
                "content": (
                    "Jesteś asystentem Profesorek Prawdowid (MSZ). Odpowiadasz prostym językiem polskim "
                    "na pytania użytkownika dotyczące konkretnego wyniku weryfikacji. Nie zmyślaj nowych faktów spoza kontekstu sesji."
                )
            },
            {
                "role": "user",
                "content": f"KONTEKST SESJI:\n{json.dumps(safe_ctx, ensure_ascii=False)}\n\nPYTANIE UŻYTKOWNIKA: {req.question}"
            }
        ],
        temperature=0.2,
        max_tokens=450
    )
    return {"answer": resp.choices[0].message.content}


@app.get("/api/export/logs")
def export_logs(format: str = "json"):
    logs = []
    if LOGS_PATH.exists():
        with open(LOGS_PATH, "r", encoding="utf-8") as f:
            logs = json.load(f)

    if format.lower() == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(
            output,
            fieldnames=[
                "session_id",
                "timestamp",
                "channel",
                "query_masked",
                "verdict",
                "latency_ms",
                "security_alert"
            ]
        )
        writer.writeheader()
        for row in logs:
            writer.writerow({k: row.get(k, "") for k in writer.fieldnames})
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=prawdowid_audit_logs.csv"}
        )
    return logs


BASE_PROJECT_DIR = Path(__file__).resolve().parent.parent.parent

STATIC_ASSETS_DIR = BASE_PROJECT_DIR / "frontend" / "static"
if STATIC_ASSETS_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_ASSETS_DIR)), name="static_assets")

FRONTEND_DIR = next(
    (
        candidate for candidate in [
            BASE_PROJECT_DIR / "frontend" / "web",
            BASE_PROJECT_DIR / "frontend" / "static",
            BASE_PROJECT_DIR / "frontend" / "public",
            BASE_PROJECT_DIR / "frontend",
            BASE_PROJECT_DIR / "web",
            BASE_PROJECT_DIR,
        ]
        if (candidate / "index.html").exists()
    ),
    None
)

if FRONTEND_DIR:
    print(f"[INFO] Serwowanie frontendu z: {FRONTEND_DIR}")
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
else:
    print(f"[UWAGA] Nie znaleziono pliku index.html w {BASE_PROJECT_DIR}")