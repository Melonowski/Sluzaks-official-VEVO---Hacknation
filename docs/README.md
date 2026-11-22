# Prawdowid

Asystent weryfikacji informacji dla MSZ (HackNation). Użytkownik wkleja tekst lub link albo zaznacza fragment strony, a system zwraca werdykt poparty cytatami z źródeł urzędowych i fact-checkingowych albo uczciwie odpowiada, że dowodów brakuje.

**Pięć werdyktów:** `POTWIERDZONE`, `FAŁSZYWE`, `WPROWADZAJĄCE W BŁĄD`, `BRAK WYSTARCZAJĄCYCH DOWODÓW`, `NIE PODLEGA WERYFIKACJI`.

**Kanały:** strona WWW (`frontend/web`), wtyczka Chrome/Firefox (`extension/`, tekst i zrzut ekranu), API REST.

## Zasady, na których stoi system

- Werdykt powstaje wyłącznie na podstawie pobranych dokumentów. Model nie ma prawa używać własnej wiedzy jako dowodu.
- Każdy cytat jest sprawdzany kodem: musi być dosłownym fragmentem pobranego źródła, inaczej jest odrzucany.
- Werdykt rozstrzygający bez żadnego zweryfikowanego cytatu zamienia się w `BRAK WYSTARCZAJĄCYCH DOWODÓW`.
- Gdy nie znaleziono żadnych źródeł, model oceniający nie jest nawet wywoływany.
- Zrzuty ekranu przetwarza lokalny OCR, obraz nie trafia do zewnętrznych usług.

## Szybki start

Wymagania: Python 3.10+, klucz API Groq ([console.groq.com](https://console.groq.com)), dostęp do internetu (źródła są pobierane na żywo).

```bash
git clone <URL-REPOZYTORIUM>
cd <katalog-repozytorium>

python -m venv .venv
# Linux/macOS:  source .venv/bin/activate
# Windows:      .venv\Scripts\activate

pip install -r backend/requirements.txt

# Linux/macOS:  cp .env.example .env
# Windows:      copy .env.example .env
# Wpisz GROQ_API_KEY w pliku .env (w katalogu głównym repozytorium)

cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Interfejs WWW: <http://localhost:8000/>
Dokumentacja API (Swagger): <http://localhost:8000/docs>, specyfikacja OpenAPI: <http://localhost:8000/openapi.json>

Test działania:

```bash
curl -X POST http://localhost:8000/api/verify \
  -H "Content-Type: application/json" \
  -d '{"input_text": "W Polsce uchwalono ustawę o ochronie ludności i obronie cywilnej w grudniu 2024 roku.", "channel": "web"}'
```

Bez poprawnego `GROQ_API_KEY` API zwraca `503` z czytelnym komunikatem.

## Konfiguracja (`.env`)

| Zmienna | Wymagana | Opis |
|---|---|---|
| `GROQ_API_KEY` | tak | Klucz Groq. Napędza ekstrakcję twierdzeń i werdykt. |
| `GOOGLE_FACTCHECK_API_KEY` | nie | Włącza dodatkowe źródło Google Fact Check Tools. Bez niego system działa na pozostałych źródłach. |

Plik `.env` jest w `.gitignore`. Nie commituj kluczy.

## Wtyczka przeglądarkowa

1. Uruchom backend (patrz wyżej). Jeśli wtyczka ma łączyć się z innej maszyny, wystaw backend tunelem, np. `cloudflared tunnel --url http://localhost:8000` (binarkę pobierz z oficjalnej strony Cloudflare, nie jest częścią repozytorium).
2. Chrome: `chrome://extensions` → tryb programisty → „Załaduj rozpakowane" → wskaż katalog `extension/`. Firefox: skrypt `extension/select_manifest.py` przygotowuje manifest dla Firefoksa.
3. Adres backendu: [DO UZUPEŁNIENIA po przejrzeniu kodu wtyczki].

## Testy i ewaluacja

```bash
cd backend
python tests/run_eval.py
```

Skrypt uruchamia zestaw scenariuszy, wypisuje metryki i zapisuje `backend/tests/eval_report.json`. Wyniki, definicje metryk i znane źródła niedeterminizmu: [docs/TESTY.md](docs/TESTY.md).

## API

| Metoda i ścieżka | Opis |
|---|---|
| `POST /api/verify` | Weryfikacja. Pola: `input_text`, `image_base64`, `page_url`, `selection_rect`, `channel`. |
| `GET /api/session/{id}` | Pełny wynik sesji. |
| `DELETE /api/session/{id}` | Usunięcie sesji z pamięci. |
| `POST /api/chat` | Pytania uzupełniające o konkretny wynik (`session_id`, `question`). |
| `GET /api/export/logs?format=json\|csv` | Eksport dziennika audytowego. |
| `GET /health` | Sprawdzenie stanu usługi. |

Odpowiedź `/api/verify` zawiera: `verdict`, `confidence_score`, `summary`, `claims[]` (z `sources[]` i dosłownym `quote`), `limitations`, `premises`, `source_breakdown`, `incident_context`, `moderator_case`, `security_alert`, `metrics` (opóźnienie, szacowany koszt, użyte modele).

## Struktura repozytorium

```
backend/
  app/            main.py (API), pipeline.py (logika weryfikacji), sources.py (źródła),
                  security.py (prompt injection, maskowanie PII)
  data/           corpus.json (korpus), moderator_cases.json (kolejka analityka)
  tests/          run_eval.py, eval_report.json
  build_corpus.py skrypt budujący korpus startowy
extension/        wtyczka Chrome/Firefox
frontend/web/     interfejs WWW serwowany przez backend
docs/             ARCHITEKTURA.md, ZRODLA.md, TESTY.md, RYZYKA.md
```

## Dokumentacja

- [Architektura, przepływ danych, modele i dostawcy](docs/ARCHITEKTURA.md)
- [Źródła, licencje, kwalifikacja i aktualizacja](docs/ZRODLA.md)
- [Wyniki testów i odtwarzanie](docs/TESTY.md)
- [Najważniejsze ryzyka](docs/RYZYKA.md)

## Ograniczenia

Werdykt jest pomocą w ocenie, nie rozstrzygnięciem. System widzi tylko podłączone źródła, nie wykrywa zmanipulowanych obrazów (OCR czyta tekst, nie ocenia autentyczności zdjęcia) i zależy od dostępności zewnętrznych API oraz limitów dostawcy modelu. Szczegóły w [docs/RYZYKA.md](docs/RYZYKA.md).
