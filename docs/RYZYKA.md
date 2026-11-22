# Najważniejsze ryzyka

Dla każdego ryzyka podajemy, co system robi **już dziś** (z miejscem w kodzie), jakie ryzyko zostaje oraz co planujemy. Statusy: **wdrożone**, **częściowo**, **do poprawy**.

## 1. Halucynacje

| | |
|---|---|
| **Mitygacje (wdrożone)** | Model dostaje wyłącznie pobrane źródła i zakaz używania własnej wiedzy jako dowodu. Temperatura 0 i wymuszony JSON. Każdy cytat musi być dosłownym fragmentem pobranego źródła, inaczej jest usuwany (`pipeline.py`). Werdykt rozstrzygający bez żadnego zweryfikowanego cytatu zamienia się w „brak dowodów”. Gdy nie ma źródeł, model oceniający nie jest wywoływany. Każda odpowiedź ma pole `limitations`. |
| **Ryzyko szczątkowe** | Kontrola cytatu sprawdza istnienie fragmentu w pobranych źródłach, ale nie to, czy wspiera on werdykt, ani czy pochodzi z cytowanego źródła (porównanie z połączonym tekstem wszystkich źródeł). Ekstraktor może zniekształcić twierdzenie przy parafrazie. Odpowiedzi `/api/chat` są ograniczone tylko instrukcją, bez kontroli cytatów. |
| **Plan** | Dopasowanie cytatu do konkretnego źródła, kontrola zgodności cytatu z werdyktem, pokazywanie użytkownikowi wyodrębnionego twierdzenia. |

## 2. Stronniczość źródeł

| | |
|---|---|
| **Mitygacje** | Zamknięta, jawna lista źródeł. Dwa typy (urzędowe i wtórne) i rozbicie użytych źródeł pokazywane użytkownikowi (`source_breakdown`). Kilku niezależnych fact-checkerów zamiast jednego. Przy sprzeczności źródeł model ma obowiązek jawnie opisać rozbieżność lub wstrzymać się. Źródła sprzed 2024 r. nie wystarczą do werdyktu `FAŁSZYWE`. Wikipedia ma status pomocniczy (wdrożone). |
| **Ryzyko szczątkowe** | 84% korpusu to rejestry urzędowe, a 49% to samo dane.gov.pl. Autorytet źródła nie jest tożsamy z prawdą, zwłaszcza w sprawach politycznych. Wszystkie źródła są polskie lub unijne, więc system nie ma niezależnego spojrzenia spoza tego kręgu. Dopasowanie słów kluczowych faworyzuje dokumenty o podobnym słownictwie. Wskaźniki w `premises` to heurystyki. |
| **Plan** | Rozszerzenie o źródła spoza administracji (np. organizacje międzynarodowe), ujednolicenie dat, wyszukiwanie semantyczne. |

## 3. Prywatność

| | |
|---|---|
| **Mitygacje** | PESEL, e-maile i telefony są maskowane przed wysłaniem do modelu (`security.mask_pii`). OCR działa lokalnie, obraz nie trafia do zewnętrznych usług. Brak kont, cookies i profilowania. Dziennik zawiera ucięty podgląd (200 znaków) i przechowuje tylko 200 ostatnich wpisów. Sesję można usunąć (`DELETE /api/session/{id}`). |
| **Ryzyko szczątkowe / do poprawy** | **Do poprawy:** pole `query_masked` w dzienniku zawiera obecnie ucięty tekst zapytania *bez* maskowania, a przy zrzutach ekranu adres strony. Imiona i nazwiska nie są maskowane. Maskowanie PESEL obejmuje dowolny ciąg 11 cyfr. Sesje (z obrazem) trzymane są w pamięci do usunięcia lub restartu, bez polityki retencji. Tekst po maskowaniu trafia do dostawcy modelu (Groq, USA) na jego warunkach. |
| **Plan** | Maskowanie przed zapisem do dziennika, niezapisywanie adresów URL w dzienniku, limit czasu życia sesji. |

## 4. Prompt injection

| | |
|---|---|
| **Mitygacje (wdrożone)** | Warstwy: (1) wykrywanie wzorców PL i EN w treści użytkownika i w pobranych źródłach, z alertem w odpowiedzi; (2) znaczniki `<user_input>` i `<source>` oraz instrukcje „dane, nie polecenia”; (3) wymuszony format JSON i lista pięciu dozwolonych werdyktów; (4) **kontrola strukturalna w kodzie**: wstrzyknięte „POTWIERDZONE” bez zweryfikowanego cytatu ze źródła jest automatycznie obniżane. Przetestowane przypadkami E1 i E2 (`TESTY.md`). |
| **Ryzyko szczątkowe** | Wykrywanie oparte na regexach łatwo obejść (parafraza, inne języki, zapis zmodyfikowany). Wykrycie tylko ostrzega, nie blokuje. Instrukcja ukryta w pobranym źródle może skłonić model do zacytowania tego źródła. W E2 wynik różnił się od oczekiwanej etykiety (patrz `TESTY.md`). |
| **Plan** | Szersze zestawy testowe ataków, klasyfikator zamiast samych regexów, wyróżnianie w interfejsie wyniku z alertem. |

## 5. Dostępność

| | |
|---|---|
| **Mitygacje** | Każdy łącznik źródeł ma limit czasu 5–7 s i niepowodzenie jednego nie zatrzymuje reszty (`asyncio.gather`). Brak klucza API daje czytelny komunikat `503`. Brak klucza Google Fact Check wyłącza tylko to źródło. Odpowiedzi w prostym języku polskim. |
| **Ryzyko szczątkowe** | Awaria źródeł lub limit dostawcy modelu wyglądają dla użytkownika jak „brak dowodów” albo błąd `502`, bez rozróżnienia „nie znaleziono” od „nie udało się sprawdzić”. Brak modelu zapasowego. Opóźnienie (mediana 8,4 s, maksimum 47 s w teście) pogarsza użyteczność. Dostępność interfejsu (WCAG) nie była audytowana. |
| **Plan** | Rozróżnienie błędu źródła od braku wyniku, pamięć podręczna, audyt dostępności interfejsu. |

## 6. Nadużycia

| | |
|---|---|
| **Mitygacje** | Każdy werdykt jest opatrzony ograniczeniami analizy i linkami do źródeł, a nie samą oceną. Sprawy „brak dowodów” trafiają do analityka (kolejka moderatora) zamiast być rozstrzygane automatycznie. Dziennik audytowy z eksportem. Serwer nie obchodzi paywalli ani zabezpieczeń stron. |
| **Ryzyko szczątkowe / do poprawy** | **Do poprawy:** brak uwierzytelniania i limitu zapytań (ryzyko kosztów i przeciążenia dostawcy modelu); `GET /api/export/logs` i `GET /api/session/{id}` są publiczne, a identyfikator sesji wynika z czasu, więc jest przewidywalny; CORS ustawiony na `*`; serwer pobiera dowolny adres URL podany przez użytkownika, bez blokady adresów wewnętrznych (ryzyko SSRF); kolejkę moderatora można zapełniać. Wynik systemu może być cytowany jako „autorytet” poza kontekstem. |
| **Plan** | Limit zapytań i klucz dostępu, losowe identyfikatory sesji, zabezpieczenie eksportu, walidacja adresów URL, zawężenie CORS. |
