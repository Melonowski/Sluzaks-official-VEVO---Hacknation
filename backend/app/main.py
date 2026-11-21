import os
import json
from datetime import datetime
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from app.pipeline import run_verification_pipeline

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
    input_text: str
    channel: str = "web"

def save_audit_log(session_data: dict, channel: str, query_preview: str):
    """Zapisuje log przebiegu sprawdzenia zgodnie z wymogiem MVP MSZ."""
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
    if not req.input_text or len(req.input_text.strip()) < 5:
        raise HTTPException(
            status_code=400,
            detail="Pytanie jest zbyt krótkie lub niejasne – doprecyzuj treść do weryfikacji."
        )
    try:
        result = await run_verification_pipeline(req.input_text, req.channel)
        sid = result["session_id"]
        SESSIONS_STORE[sid] = result
        save_audit_log(result, req.channel, req.input_text)
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Błąd komunikacji z usługą AI: {str(e)}")

@app.get("/api/session/{session_id}")
def get_session(session_id: str):
    """Pobiera wynik konkretnej sesji (np. po kliknięciu 'Pełna analiza' we wtyczce)."""
    if session_id not in SESSIONS_STORE:
        raise HTTPException(status_code=404, detail="Nie znaleziono sesji lub została usunięta.")
    return SESSIONS_STORE[session_id]

@app.delete("/api/session/{session_id}")
def delete_session(session_id: str):
    """Usuwa sesję demonstracyjną (wymóg prywatności MSZ)."""
    SESSIONS_STORE.pop(session_id, None)
    return {"status": "deleted", "session_id": session_id}