# Plan wdrożenia Prawdowida

Plan przejścia od działającego prototypu do narzędzia używanego w codziennej pracy instytucji publicznej (docelowo MSZ). Czasy i progi są **propozycjami do uzgodnienia z zamawiającym**, a nie pomiarami. Wartości liczbowe, które pochodzą z testów, są oznaczone odesłaniem do `TESTY.md`.

## 1. Cel i zakres

**Cel:** skrócić czas sprawdzenia podejrzanej informacji z minut ręcznego szukania do kilkunastu sekund, z werdyktem popartym cytatem i linkiem do źródła, a tam, gdzie dowodów brak, z jasnym „nie wiem” i przekazaniem sprawy analitykowi.

**W zakresie:** weryfikacja twierdzeń w języku polskim, kanały WWW i wtyczka przeglądarkowa, kolejka spraw dla analityka FIMI, dziennik audytowy.
**Poza zakresem pierwszego wdrożenia:** weryfikacja autentyczności zdjęć i wideo, automatyczne publikowanie sprostowań, języki inne niż polski.

## 2. Użytkownicy i scenariusze

| Użytkownik | Scenariusz | Co dostaje |
|---|---|---|
| Analityk FIMI / komunikacji MSZ | Szybka wstępna weryfikacja doniesienia przed reakcją | Werdykt, cytaty, rozbicie źródeł, kolejka spraw „brak dowodów” z licznikiem powtórzeń |
| Pracownik instytucji / dziennikarz | Sprawdzenie wpisu lub artykułu podczas przeglądania | Wtyczka: zaznaczenie tekstu lub obszaru ekranu, odpowiedź w kilkanaście sekund |
| Obywatel (etap późniejszy) | Sprawdzenie viralowego przekazu | Strona WWW z odpowiedzią w prostym języku |

## 3. Punkt wyjścia (stan prototypu)

Działa: pipeline weryfikacji z kontrolą cytatów w kodzie, 8 łączników źródeł, lokalny OCR, wykrywanie prompt injection, kolejka moderatora, dziennik audytowy z eksportem, strona WWW i wtyczka Chrome/Firefox. Wyniki testów dymnych: `TESTY.md` (6 z 7 zgodnych, mediana 8,4 s).

Przed jakimkolwiek wdrożeniem trzeba zamknąć znane luki z `RYZYKA.md` (maskowanie w logach, SSRF, uwierzytelnianie i limit zapytań, losowe identyfikatory sesji, eksport logów). To warunek wejścia do Fazy 1.

## 4. Harmonogram

| Faza | Czas (propozycja) | Cel | Wynik |
|---|---|---|---|
| **0. Stabilizacja** | 2 tygodnie | Zamknięcie luk bezpieczeństwa i prywatności, przypięcie modeli, ujednolicenie dat, zestaw testowy rozszerzony do scenariuszy C, G, H, kontener Docker | Wersja 0.9 gotowa do pilotażu |
| **1. Pilotaż zamknięty** | 6–8 tygodni | Praca 5–15 analityków na realnych zgłoszeniach, zbieranie ocen werdyktów | Zbiór wzorcowy (min. 200 ocenionych przypadków), raport jakości, lista brakujących źródeł |
| **2. Wdrożenie ograniczone** | 3 miesiące | Hosting docelowy, baza danych, monitoring, rozszerzenie źródeł, integracja z procesem pracy zespołu | Wersja 1.0 w użyciu jednego zespołu |
| **3. Skalowanie** | po decyzji | Kolejne zespoły i instytucje, kanał publiczny, kolejne języki | Plan rozwoju na podstawie danych z Fazy 2 |

**Bramki przejścia (go / no-go):**
- 0 → 1: wszystkie pozycje „do poprawy” z `RYZYKA.md` zamknięte, test penetracyjny podstawowych scenariuszy (SSRF, injection, nadużycia API) bez poważnych znalezisk, DPIA zatwierdzone.
- 1 → 2: osiągnięte progi jakości z punktu 7 na zbiorze wzorcowym, akceptacja użytkowników pilotażu, brak incydentu prywatności.
- 2 → 3: stabilna praca przez pełny kwartał, koszty zgodne z budżetem, przegląd prawny licencji źródeł.

## 5. Architektura docelowa

| Obszar | Prototyp | Docelowo |
|---|---|---|
| Uruchomienie | `uvicorn` lokalnie, tunel Cloudflare | Kontener Docker, orkiestracja, hosting w UE lub w infrastrukturze zamawiającego |
| Dane | Pliki JSON (korpus, dziennik, kolejka), sesje w pamięci | Baza relacyjna (sprawy, dziennik audytowy, korpus z metadanymi i datą ważności), pamięć podręczna wyników źródeł |
| Dostęp | Publiczne API, CORS `*` | Uwierzytelnianie użytkowników, role (użytkownik, analityk, administrator), limit zapytań, ścisła polityka CORS |
| Modele | Groq (USA), wybór dynamiczny po nazwie | Przypięte wersje modeli, ocena dostawcy pod kątem RODO; opcja modelu otwartego uruchamianego w infrastrukturze własnej dla danych wrażliwych |
| Wyszukiwanie | Słowa kluczowe plus zapytania na żywo | Dodatkowo indeks semantyczny (embeddingi) dla korpusu |
| Obserwowalność | Dziennik w pliku | Metryki (opóźnienie, błędy źródeł, odsetek „brak dowodów”), alerty, osobne logi techniczne i audytowe |

Zasada nadrzędna zostaje bez zmian: werdykt wyłącznie ze źródeł, cytat sprawdzany kodem, brak cytatu oznacza brak rozstrzygnięcia.

## 6. Dane, prawo i dostępność

- **RODO:** ocena skutków dla ochrony danych (DPIA), jawna polityka retencji (propozycja: sesje do 24 h, dziennik audytowy zanonimizowany i ograniczony czasowo), umowa powierzenia z dostawcą modelu, maskowanie danych osobowych przed zapisem i przed wysłaniem do modelu.
- **Licencje źródeł:** przegląd warunków każdego źródła (zob. `ZRODLA.md`), szczególnie serwisów prasowych i fact-checkingowych, oraz ewentualne porozumienia. Dla dane.gov.pl weryfikacja licencji na poziomie zbioru.
- **Dostępność cyfrowa:** interfejs zgodny z WCAG 2.1 zgodnie z wymogami dla podmiotów publicznych, audyt przed Fazą 2.
- **Rozliczalność:** każdy werdykt ma ślad audytowy (sesja, źródła, modele, opóźnienie), który można wyeksportować.

## 7. Jakość i wskaźniki sukcesu

Progi to propozycje do potwierdzenia w pilotażu.

| Wskaźnik | Jak mierzymy | Próg wejścia do Fazy 2 |
|---|---|---|
| Cytaty niepochodzące ze źródła | Kontrola kodu na 100% odpowiedzi | 0 |
| Zgodność werdyktu z oceną analityka | Zbiór wzorcowy min. 200 przypadków | do ustalenia po pierwszym pomiarze, bazowo wyższa niż w teście dymnym |
| Błędne werdykty rozstrzygające (fałszywe „POTWIERDZONE” lub „FAŁSZYWE”) | Zbiór wzorcowy, osobno | najniższy możliwy, raportowany osobno od „brak dowodów” |
| Odporność na prompt injection | Rozszerzony zestaw ataków (PL, EN, zapis zmodyfikowany) | brak werdyktu rozstrzygającego wymuszonego atakiem |
| Opóźnienie | Mediana i p95 z logów technicznych | mediana poniżej 5 s, p95 poniżej 15 s (obecnie mediana 8,4 s, maksimum 47 s) |
| Dostępność usługi | Monitoring | min. 99% w godzinach pracy |
| Przydatność | Ankieta i ocena „pomocne / niepomocne” przy każdej odpowiedzi | do ustalenia z użytkownikami |

## 8. Koszty

Obecnie przyjmujemy **założenie** 0,004 zł za zapytanie (stała w kodzie, nie rozliczenie dostawcy, zob. `TESTY.md`), czyli 4 zł za 1000 zapytań. Faza 1 służy do wyliczenia kosztu rzeczywistego: tokeny modelu, hosting, baza, monitoring, czas analityków na ocenę. Koszty ludzkie (rozwój, opieka merytoryczna nad korpusem, obsługa kolejki spraw) prawdopodobnie przewyższą koszty techniczne i muszą wejść do budżetu.

## 9. Role i odpowiedzialność

| Rola | Zakres |
|---|---|
| Właściciel produktu (zamawiający) | Priorytety, akceptacja bramek, decyzje o zakresie |
| Zespół rozwojowy | Kod, testy, wdrożenia, naprawa luk |
| Opiekun merytoryczny korpusu | Dobór i przegląd źródeł, jakość metadanych |
| Analitycy FIMI (pilotaż) | Ocena werdyktów, obsługa kolejki spraw |
| Inspektor ochrony danych / bezpieczeństwo | DPIA, przegląd bezpieczeństwa, retencja |

## 10. Ryzyka wdrożenia

| Ryzyko | Skutek | Reakcja |
|---|---|---|
| Zależność od jednego dostawcy modelu i jego limitów | Przestoje, wzrost kosztów | Przypięte wersje, model zapasowy, opcja modelu własnego |
| Zmiana lub wyłączenie API źródeł | Spadek pokrycia | Monitoring łączników, rozróżnienie „błąd źródła” od „brak wyniku”, pamięć podręczna |
| Nadmierne zaufanie do werdyktu | Błędne decyzje | Jawne ograniczenia w każdej odpowiedzi, szkolenie użytkowników, werdykt jako wsparcie, nie rozstrzygnięcie |
| Stronniczość korpusu (84% źródeł urzędowych) | Jednostronna ocena spraw spornych | Rozszerzenie źródeł, przegląd na zbiorze wzorcowym, jawne rozbicie źródeł |
| Atak lub nadużycie (injection, spam, SSRF) | Utrata zaufania, koszty | Uwierzytelnianie, limity, testy penetracyjne, rozszerzone testy ataków |
| Brak akceptacji użytkowników | Narzędzie niewykorzystywane | Pilotaż z realnymi zgłoszeniami, krótka pętla zmian, miarą przydatności ocena użytkowników |

## 11. Najbliższe kroki

1. Zamknięcie luk z `RYZYKA.md` i dopisanie testów C, G, H (Faza 0).
2. Uzgodnienie z zamawiającym progów z punktu 7 i składu pilotażu.
3. Przygotowanie DPIA i wyboru dostawcy modelu pod kątem RODO.
4. Uruchomienie pilotażu i zbieranie zbioru wzorcowego.
