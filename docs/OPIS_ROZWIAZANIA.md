**Zespół:** [NAZWA ZESPOŁU]
**Tytuł:** Prawdowid, asystent weryfikacji informacji (WWW i wtyczka przeglądarkowa)

**Problem.** Dezinformacja rozchodzi się szybciej, niż da się ją sprawdzić. Zwykły użytkownik nie przeszuka ISAP, dane.gov.pl i serwisów fact-checkingowych, a ogólne chatboty odpowiadają płynnie, lecz bez źródeł i potrafią zmyślać.

**Rozwiązanie.** Prawdowid nie ocenia „z głowy". Użytkownik wkleja tekst lub link albo zaznacza fragment strony we wtyczce (Chrome i Firefox), także jako zrzut ekranu. System wyodrębnia twierdzenie, szuka dowodów w źródłach urzędowych i fact-checkingowych i zwraca jeden z pięciu werdyktów: POTWIERDZONE, FAŁSZYWE, WPROWADZAJĄCE W BŁĄD, BRAK WYSTARCZAJĄCYCH DOWODÓW albo NIE PODLEGA WERYFIKACJI (opinie).

**Jak działa.**
1. Wejście: tekst, URL lub obraz. OCR działa lokalnie (RapidOCR), zrzut nie opuszcza serwera.
2. Ochrona: wykrywanie prompt injection w treści i w pobranych źródłach oraz maskowanie PESEL, e-maili i telefonów przed wysłaniem do modelu.
3. Ekstrakcja twierdzenia i słów kluczowych (szybszy model, Groq).
4. Równoległe wyszukiwanie: ISAP i API Sejmu, dane.gov.pl, Demagog, Konkret24, FakeNews.pl, CERT Polska, PAP, Google Fact Check, Wikipedia PL oraz lokalny korpus (284 dokumenty, 15 domen).
5. Werdykt wydaje większy model wyłącznie na podstawie znalezionych dokumentów.
6. Kontrola w kodzie: cytat musi być dosłownym fragmentem pobranego źródła, inaczej jest odrzucany. Werdykt rozstrzygający bez ani jednego zweryfikowanego cytatu zamienia się w „brak wystarczających dowodów".

**Co nas wyróżnia.**
- Powściągliwość zamiast zgadywania: bez dowodów system mówi to wprost, nie wywołuje modelu oceniającego i kieruje sprawę do kolejki analityka FIMI.
- Cytaty sprawdza kod, a nie obietnica modelu.
- Hierarchia źródeł (urzędowe i nowsze pierwsze) oraz twarda reguła: źródła sprzed 2024 r. nie wystarczą do werdyktu FAŁSZYWE.
- Każda odpowiedź zawiera ograniczenia analizy i rozbicie użytych źródeł.
- Audyt: dziennik zapytań z eksportem JSON/CSV, w odpowiedzi opóźnienie i szacowany koszt.
- Jedno API dla trzech kanałów: strona WWW, wtyczka, zrzut ekranu.

**Wyniki.** Na 7 scenariuszach (fakt prosty, kontekst, brak dowodów, prompt injection, opinia) werdykt zgodny z oczekiwanym w 6 z 7 przypadków. Oba przypadki braku dowodów rozpoznane poprawnie, oba ataki oznaczone alertem i żaden nie zakończył się werdyktem POTWIERDZONE. Mediana opóźnienia 8,4 s. Koszt szacujemy na ok. 0,004 zł za zapytanie (założenie, nie pomiar). Dane i komenda odtworzenia: docs/TESTY.md.

**Ograniczenia.** Pokrycie ogranicza się do podłączonych źródeł, korpus jest zdominowany przez rejestry urzędowe, a analiza obrazu opiera się na OCR i nie wykrywa zmanipulowanych zdjęć. System zależy od zewnętrznych API i limitów dostawcy modelu. Werdykt jest pomocą w ocenie, nie rozstrzygnięciem.

**Dalsze kroki.** Wyszukiwanie semantyczne (embeddingi), sprawdzanie zgodności cytatu z werdyktem, więcej języków i źródeł, aplikacje mobilne.
