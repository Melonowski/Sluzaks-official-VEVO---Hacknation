import re

INJECTION_PATTERNS = [
    r"ignore (all )?previous instructions",
    r"zignoruj (wszystkie )?poprzednie instrukcje",
    r"system prompt",
    r"jesteś teraz",
    r"you are now",
    r"zwróć werdykt potwierdzone",
]

def mask_pii(text: str) -> str:
    """Maskuje oczywiste dane osobowe (RODO - minimalizacja danych)."""
    text = re.sub(r"\b\d{11}\b", "[PESEL_UKRYTY]", text)
    text = re.sub(r"[\w\.-]+@[\w\.-]+\.\w+", "[EMAIL_UKRYTY]", text)
    text = re.sub(r"(?:\+48\s?)?\d{3}[-\s]?\d{3}[-\s]?\d{3}", "[TELEFON_UKRYTY]", text)
    return text

def detect_prompt_injection(text: str) -> bool:
    """Wykrywa próby manipulacji instrukcjami modelu."""
    lowered = text.lower()
    return any(re.search(pattern, lowered) for pattern in INJECTION_PATTERNS)