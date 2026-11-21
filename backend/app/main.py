import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from app.pipeline import run_verification_pipeline

load_dotenv()

app = FastAPI(title="Prawdowid API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class VerifyRequest(BaseModel):
    input_text: str
    channel: str = "web"

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/api/verify")
def verify(req: VerifyRequest):
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or api_key == "tutaj_wklej_klucz_groq":
        pass
        # Scenariusz J: brak klucza to komunikat techniczny, nie werdykt[cite: 6, 8]
async def verify(req: VerifyRequest):
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or api_key == "tutaj_wklej_klucz_groq":
        raise HTTPException(
            status_code=503,
            detail="Brak skonfigurowanego klucza API – sprawdzenie niemożliwe."
        )

    # Tymczasowa odpowiedź testowa (mock) do czasu podpięcia RAG przez ziomka
    return {
        "session_id": "test-001",
        "verdict": "BRAK WYSTARCZAJĄCYCH DOWODÓW",
        "confidence_score": 0.5,
        "summary": f"Odebrano zgłoszenie z kanału: {req.channel}. Backend działa, czekamy na podpięcie korpusu.",
        "claims": [],
        "limitations": "Tryb testowy – brak połączonej bazy dokumentów.",
        "security_alert": None,
        "metrics": {"latency_ms": 15, "estimated_cost_pln": 0.0}
    }
    try:
        return await run_verification_pipeline(req.input_text, req.channel)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Błąd komunikacji z usługą AI: {str(e)}")