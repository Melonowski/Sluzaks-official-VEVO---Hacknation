# Źródła

## Zasada ogólna

Prawdowid korzysta wyłącznie z **zamkniętej listy źródeł** zapisanej w kodzie (`backend/app/sources.py`, `backend/build_corpus.py`). Nie przeszukuje otwartego internetu, nie omija paywalli ani zabezpieczeń serwisów. Każdy dokument ma ten sam komplet pól: `title`, `publisher`, `domain`, `type`, `date`, `url`, `content`, a w korpusie także `fetched_at`. Oryginalny adres URL jest zawsze zachowany i pokazywany użytkownikowi.

## Typy źródeł

| Typ | Co obejmuje | Rola w ocenie |
|---|---|---|
| `urzędowe` | Rejestry i organy państwa oraz UE: ISAP / API Sejmu, dane.gov.pl, CERT Polska / NASK, gov.pl (MSZ), NBP, GUS, EUR-Lex | Źródła pierwotne. W instrukcji dla modelu mają pierwszeństwo przed wtórnymi. |
| `wiarygodne wtórne` | Serwisy fact-checkingowe (Demagog, Konkret24, FakeNews.pl, wyniki Google Fact Check), PAP, EUvsDisinfo, Wikipedia PL (pomocniczo) | Potwierdzają lub obalają konkretne doniesienia, dostarczają kontekstu. |

## Wykaz źródeł

| Źródło | Typ | Dostęp | Co przechowujemy | Podstawa korzystania |
|---|---|---|---|---|
| ISAP / Kancelaria Sejmu (API ELI) | urzędowe | API, na żywo i hurtowo | Tytuł, status, data ogłoszenia, ELI, link | Akty normatywne nie są przedmiotem prawa autorskiego (art. 4 pkt 1 ustawy o prawie autorskim). |
| Sejm RP X kadencji, interpelacje | urzędowe | API, na żywo | Numer, tytuł, data wpływu, link | Informacja publiczna. |
| dane.gov.pl | urzędowe | API, na żywo i hurtowo | Tytuł, opis (do 1000–1500 znaków), data, link | Licencja zależy od zbioru (portal wskazuje ją przy każdym zasobie). Przechowujemy wyłącznie metadane i opis, nie same dane, i zawsze linkujemy do oryginału. |
| CERT Polska / NASK | urzędowe | RSS, na żywo | Tytuł, opis z kanału, link | Kanał RSS udostępniany przez wydawcę. Bez pełnych treści. |
| Demagog | wtórne | RSS i wyszukiwarka serwisu, na żywo | Tytuł, zajawka, link | Tytuł i zajawka z kanału wydawcy, z odnośnikiem do oryginału. Bez pełnych artykułów. |
| Konkret24 (TVN24) | wtórne | RSS, na żywo | Tytuł, opis z kanału, link | Jak wyżej. |
| FakeNews.pl | wtórne | RSS, na żywo | Tytuł, opis z kanału, link | Jak wyżej. |
| PAP | wtórne | RSS, na żywo | Tytuł, opis z kanału, link | Jak wyżej. |
| Google Fact Check Tools | wtórne | API (opcjonalny klucz), na żywo | Sprawdzane twierdzenie, ocena organizacji, link do recenzji | Warunki korzystania z API Google. Bez klucza źródło jest wyłączone. |
| Wikipedia PL | wtórne, pomocnicze | API, na żywo | Tytuł hasła, fragment wyniku wyszukiwania, link | CC BY-SA 4.0, z atrybucją przez link do hasła. |
| EUvsDisinfo, EUR-Lex, NBP, GUS, NASK, gov.pl (MSZ) | mieszane | tylko dokumenty startowe | 1 wpis opisowy na serwis | Patrz „Dokumenty startowe”. |

Treści tekstowe przechowywane w korpusie są **krótkimi fragmentami do celów wyszukiwania i cytowania** (limit 1000–1500 znaków), nie kopiami całych artykułów. Użytkownik dostaje zawsze link do źródła.

## Stan korpusu (`backend/data/corpus.json`)

- **284 dokumenty z 15 domen.** Zrzut używany w opisie: SHA-256 `4c2492683ff8f5d97026efa5e6282acd65ed137830398d98fcf44b4f66e16c71`.
- Typy: 239 urzędowych (84%) i 45 wtórnych (16%).
- Największe domeny: dane.gov.pl (140), isap.sejm.gov.pl (65), cert.pl (26), konkret24.tvn24.pl (26), fakenews.pl (11), factchecktools.googleapis.com (5), sejm.gov.pl (3); po jednym dokumencie: gov.pl, nask.pl, demagog.org.pl, pap.pl, euvsdisinfo.eu, eur-lex.europa.eu, nbp.pl, stat.gov.pl.
- Daty: 224 dokumenty mają datę w formacie ISO (`RRRR-MM-DD`), 60 (z kanałów RSS) datę w formacie RSS, np. `Wed, 28 Oct 2026`.

### Dokumenty startowe (seed)

`build_corpus.py` zawiera 12 dokumentów startowych (`SEED_DOCS`). Ich pole `content` to krótkie opisy przygotowane przez zespół, a nie wycinki z oryginalnych dokumentów. Pokrywają one domeny, które nie mają własnego łącznika API (MSZ, NASK, NBP, GUS, EUR-Lex, EUvsDisinfo i inne).

## Kwalifikacja źródeł

Źródło trafia do systemu, jeśli spełnia wszystkie warunki:

1. Ma jednoznacznie identyfikowalnego wydawcę (organ państwa, organizacja fact-checkingowa, agencja prasowa).
2. Udostępnia treść w sposób maszynowy i jawny (API lub kanał RSS), więc nie trzeba omijać zabezpieczeń.
3. Każdy rekord ma stabilny adres URL do oryginału.
4. Jest sklasyfikowane do jednego z dwóch typów (`urzędowe`, `wiarygodne wtórne`), a typ jest zapisany przy każdym dokumencie.

Serwisy fact-checkingowe są w konfiguracji oznaczone jako sygnatariusze IFCN/EFCSN. Wikipedia ma status pomocniczy i nie jest traktowana jako źródło rozstrzygające. Nowe źródło dodaje się, dopisując wpis do `LIVE_RSS_FEEDS` lub nowy łącznik w `sources.py`.

## Aktualizacja

| Mechanizm | Kiedy | Opis |
|---|---|---|
| Zapytania na żywo | Przy każdej weryfikacji | Osiem łączników odpytuje źródła równolegle, więc werdykt opiera się na aktualnym stanie źródeł, nie na kopii. |
| Dopisywanie do korpusu | Przy każdej weryfikacji | Nowe trafienia i najnowsze wpisy z kanałów RSS są dopisywane do `corpus.json` z `fetched_at`. Deduplikacja po URL. |
| Przebudowa hurtowa | Ręcznie: `python backend/build_corpus.py` | Pobiera dokumenty startowe, do 30 najnowszych aktów z Dziennika Ustaw z 2025 i 2024 r. oraz 60 zbiorów z dane.gov.pl. Nadpisuje korpus. |

Reguła aktualności w werdykcie: `FAŁSZYWE` poparte wyłącznie źródłami sprzed 2024 r. jest obniżane do „brak dowodów”.

## Znane ograniczenia źródeł

- Korpus nie ma polityki wygaszania: dokumenty są dopisywane, ale nie usuwane ani odświeżane.
- Formaty dat nie są ujednolicone (patrz wyżej). Reguła świeżości i wskaźnik `data_freshness` porównują początek tekstu daty z latami 2024–2026, więc daty w formacie RSS nie są w nich rozpoznawane jako świeże. Skutek jest zachowawczy: system częściej wstrzymuje się od werdyktu, niż go wydaje.
- Przewaga rejestrów urzędowych (84%) oznacza, że autorytet źródła nie jest tożsamy z prawdą. System pokazuje użytkownikowi rozbicie źródeł i nie ukrywa, skąd pochodzi dowód.
