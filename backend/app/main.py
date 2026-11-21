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
async def verify(req: VerifyRequest):
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or api_key == "tutaj_wklej_klucz_groq":
        raise HTTPException(
            status_code=503,
            detail="Brak skonfigurowanego klucza API – sprawdzenie niemożliwe."
        )
    try:
        return await run_verification_pipeline(req.input_text, req.channel)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Błąd komunikacji z usługą AI: {str(e)}")