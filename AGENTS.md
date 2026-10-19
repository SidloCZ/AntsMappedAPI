# AGENTS.md – Pravidla projektu a instrukce pro AI asistenta

Tento soubor slouží jako centrální a závazná sada instrukcí pro AI asistenta v prostředí IDE (Antigravity, Cursor, Windsurf, VS Code, Gemini). 

---

# ČÁST I: PRAVIDLA TOHOTO PROJEKTU (Project-Specific)

## 1. Specifikace a technologický stack
- **Název projektu / repozitáře:** AntsMappedAPI (`SidloCZ/AntsMappedAPI`)
- **Hlavní účel:** 
  - Otevřené a bezplatné komunitní API a generátor map výskytu mravenců pro Discord boty, výzkumníky a webové vývojáře (přímá, modernizovaná náhrada za zaniklou službu `antapi.org`).
  - Podpora dynamického generování PNG map na vyžádání v různých projekcích a motivech s vysokou rychlostí odbavení (< 5&nbsp;ms pro nacachované mapy).
  - Poskytování hierarchických distribučních JSON dat (poddruhy &rarr; druhy &rarr; rody).
  - Statické Flat-File JSON API distribuované přes globální CDN (jsDelivr / GitHub Pages).
  - Indexovatelný dokumentační a prezentační web pro GitHub Pages s interaktivním náhledem a licenčními informacemi.
- **Tech stack:**
  - **Backend API & rendering:** Python 3.12+ (FastAPI, Uvicorn, Matplotlib/Agg, SQLite3).
  - **Dokumentační portál:** HTML5, moderní Vanilla CSS, Vanilla JavaScript (bez zbytečných těžkých frameworků).
  - **Databáze:** SQLite (`data/ant_distribution.db`, ~12,7&nbsp;MB, 89&nbsp;458 záznamů, 13&nbsp;700 druhů, 1&nbsp;762 poddruhů).
  - **Kartografie:** Zjednodušená vektorová geometrie 546 sub-národních biogeografických entit GABI (`data/bentities_geometry.json`, 1,15&nbsp;MB).
- **Spouštěcí a testovací příkazy:**
  - Vývojový API server: `python -m uvicorn option_2b_image_api.api_server:app --reload --port 8000`
  - Sestavení hierarchické SQLite databáze: `python build_full_database.py`
  - Export statického JSON API: `python option_2a_github_pages/export_static_api.py`

## 2. Architektura a specifické konvence projektu
- **Klíčové složky a soubory:**
  - `services/antmaps/renderer.py`: Kartografické renderovací jádro. Podporuje:
    - Projekce: `equal_earth` (výchozí oválná stejnoplochá), `plate_carree` (obdélníková 2:1), `mercator`.
    - Barevné motivy: `dark` (Discord dark `#1e1f22`), `light` (čistý publikační bílý).
    - Jazyky: `en` (výchozí angličtina), `cs` (čeština).
    - In-memory cache pro předpočítané polygonové souřadnice jednotlivých projekcí.
  - `services/antmaps/database.py`: Dotazování SQLite databáze s normalizací trinomiálních názvů a prioritním řešením biogeografických statusů.
  - `option_2b_image_api/api_server.py`: Produkční FastAPI mikroserver s `@lru_cache`, CORS middleware, endpointy pro druhy i rody, fulltextem a citacemi.
  - `option_2a_github_pages/`: Nástroje pro statický export stromu JSON souborů na GitHub Pages / jsDelivr CDN.
  - `data/`:
    - `ant_distribution.db`: Kompilovaná odlehčená SQLite databáze (sledována v Gitu).
    - `bentities_geometry.json`: Zjednodušené polygony (sledováno v Gitu).
  - `docs/`: Indexovatelná GitHub Pages dokumentace pro veřejnost a vývojáře.
- **Specifická pravidla pro data, stav a Git:**
  - **Striktní zákaz commitování surových dat:** Složka `/AntMaps/` obsahuje obří vědecké CSV a GIS datasety (> 1,4&nbsp;GB, jednotlivé soubory přes 600&nbsp;MB). Je přísně zakázáno ji nahrávat do Gitu (ošetřeno v `.gitignore`).
  - **Zabezpečení:** Soubory `.env` a případné API klíče se nikdy nesmí dostat do commitu.
  - **Hierarchická integrita:**
    - Dotaz na poddruh (např. *Formica picea formosae*) vrací striktně specifickou distribuci daného poddruhu.
    - Dotaz na mateřský druh (např. *Formica picea*) vrací celosvětový areál druhu VČETNĚ všech jeho poddruhů.
    - Dotaz na rod (např. *Formica*) vrací agregovaný výskyt všech taxonů v rodu.
  - **Podmínka citace:** Všechny veřejné výstupy (Discord bot embedy, web, API odpovědi) musí jasně uvádět a vyžadovat citaci původních vědeckých studií:
    1. Kass et&nbsp;al. (2022) *Science Advances* (GABI)
    2. Wong et&nbsp;al. (2023) (Alien ant species)
    3. Šavrič et&nbsp;al. (2018) (Equal Earth projection)

---

# ČÁST II: UNIVERZÁLNÍ GLOBÁLNÍ STANDARDY (Global Core)

## 1. Komunikace, minimalismus a kontrola nad změnami

- **Méně je někdy více:**
  - Preferuj jednoduchá, čistá, funkční a věcná řešení.
  - Vyvaruj se překombinovaných návrhů a zbytečného kódu navíc.
- **Audit a transparentnost nepožádaných změn kódu:**
  - Pokud v kódu provedeš jakoukoliv změnu, refaktoring nebo optimalizaci, **o kterou uživatel v zadání výslovně nežádal**, VŽDY tuto změnu v odpovědi zřetelně zdůrazni a vysvětli její důvod.
  - Nápady a návrhy nad rámec původního zadání neimplementuj svévolně – popiš je v chatu jako dotaz či doporučení.
- **Striktní zákaz emoji:**
  - V celém projektu (uživatelské rozhraní, dialogy, toast zprávy, kód, komentáře, commit zprávy, texty i odpovědi asistenta) je **přísně zakázáno používat emoji**.
  - Místo emotikonů používej výhradně **pěkné, minimalistické, jednobarevné inline SVG**.
  - Zákaz Unicode vlaječek států (na Windows se vykreslují jako textová písmena) – vždy nahradit inline SVG vlajkou.
- **Faktická přesnost bez domýšlení:**
  - Nikdy si nevymýšlej neověřené parametry, čísla nebo fakta. Pokud chybí přesný zdroj či data, zeptej se uživatele nebo nastav prvek do stavu konceptu.

---

## 2. Nástroje IDE, Git a verzování

- **Nativní IDE nástroje:**
  - K vyhledávání, čtení a inspekci souborů používej nativní workspace nástroje (file search, read_file, grep).
  - Nepoužívej terminálové zkratky typu `node -e` ani ad-hoc bash skripty pro inspekci souborů.
- **Commit message (Conventional Commits):**
  - Na konci každé zprávy v chatu připrav výstižný návrh commit zprávy v angličtině podle konvence (`feat(...)`, `fix(...)`, `chore(...)`, `docs(...)`, `refactor(...)`, `style(...)`).
  - Vypiš **pouze čistý text zprávy** bez balení do `git commit -m` a bez uvozovek.
  - Asistent **nikdy nespouští commit ani push automaticky**, pouze navrhne zprávu a čeká na potvrzení uživatelem.
- **Sémantické verzování (SemVer):**
  - Při aktualizaci verzí (`manifest.json`, `package.json` apod.) dodržuj:
    - **PATCH (`x.y.Z+1`):** Opravy chyb, drobný refaktoring, styly, textové úpravy.
    - **MINOR (`x.Y+1.0`):** Nové funkce, nové UI komponenty, rozšíření API.
    - **MAJOR (`X+1.0.0`):** Zlomové změny architektury, nekompatibilní přepracování.
- **Udržování dokumentace:**
  - Při zásadní změně struktury kódu nebo novém prvku adekvátně aktualizuj soubory dokumentace (`README.md`, `DOKUMENTACE_DATABAZE_A_PUBLIKACE.md`).

---

## 3. UI, UX a frontendový design

- **Jednoduchost UI prvků:**
  - Tlačítka, položky navigace a nadpisy formuluj stručně a výstižně (ideálně 1–2 slova).
  - Do UI nepřidávej svévolné dekorativní štítky a odznaky, pokud nebyly vyžádány.
- **Parita světlého a tmavého režimu (Dark / Light mode):**
  - Při jakékoliv úpravě barev nebo motivů zajisti adekvátní kontrast a funkčnost v obou režimech současně.
- **Responzivita a přístupnost:**
  - Webová dokumentace musí být plně responzivní (mobil, tablet, desktop) a čitelná pro vyhledávací roboty (SEO optimalizovaná s kompletními meta tagy a OpenGraph).

---

## 4. Jazyková pravidla a česká mikrotypografie

- **Výchozí jazyk:** Řiď se jazykem promptu (typicky čeština; API endpointy a kód jsou v angličtině).
- **Zásady české mikrotypografie:**
  - **Pevné mezery (`&nbsp;` / `\u00A0`):** Neslabičné a jednopísmenné předložky a spojky (*k, s, v, z, o, u, a, i*) nesmí zůstávat na konci řádku. Vždy je navaž pevnou mezerou k následujícímu slovu.
  - **České uvozovky:** V českých textech používej výhradně uvozovky 99–66: dole `„` (U+201E) a nahoře `“` (U+201C). Zákaz rovných `""` i anglických `“...”`.
  - **Pomlčka vs. spojovník:**
    - Půlčtverčíková pomlčka (`–`, en-dash): Pro číselné rozsahy bez mezer (*10–15 mm*, *20–25 °C*) a jako větná pomlčka oddělená mezerami po obou stranách.
    - Spojovník (`-`, hyphen): Pouze pro těsně vázaná složená slova (*česko-slovenský*) nebo dělení slov.
  - **Jednotky a procenta:** Mezi číslem a jednotkou je vždy pevná mezera (`12&nbsp;mm`, `24&nbsp;°C`). U procent: `10 %` = deset procent (podstatné jméno), `10%` = desetiprocentní (přídavné jméno).
  - **Desetinná čísla a řády:** V českém textu piš desetinnou čárku (*1,5 mm*), v anglickém tečku (*1.5 mm*). Tisíce a vyšší řády odděluj mezerou (*10 000*).

---

# ČÁST III: SPECIALIZOVANÝ MODUL – BIOLOGIE A MYRMEKOLOGIE

## 1. Binomická a trinomiální nomenklatura (Vědecké názvosloví)
- **Rod (Genus):** První písmeno velké, formátováno kurzívou (*Camponotus*, *Odontomachus*, *Lasius*, *Formica*).
- **Druhový přívlastek:** Všechna písmena malá, formátováno kurzívou (*ligniperda*, *tyrannicus*, *niger*, *picea*).
- **Poddruhový přívlastek (Subspecies):** Všechna písmena malá, formátováno kurzívou (*Formica picea formosae*, *Acromyrmex hispidus formosus*).
- **Skupina druhů (Species group):** Pouze druhové jméno kurzívou, slovo „group“ nebo „skupina druhů“ normálním písmem bez kurzívy (*tyrannicus* group, skupina druhů *rufa*).
- **Vyšší taxony (Tribus, Podčeleď, Čeleď):** Velké počáteční písmeno, **normální písmo bez kurzívy** (Camponotini, Formicinae, Formicidae).
- **Zákaz CSS capitalize:** Nikdy nepoužívat CSS vlastnost `capitalize` ani automatické kapitálky na druhy (nepřípustné: *Camponotus Ligniperda* nebo *Formica Picea Formosae*).

## 2. Odborná terminologie a biogeografie
- **Biogeografické statusy:**
  - *Native* (Původní)
  - *Introduced / Established outdoors* (Zavlečený – volná příroda)
  - *Introduced / Established indoors* (Zavlečený – budovy a skleníky)
  - *Need verification / Border interception* (Vyžaduje ověření / záchyt)
  - *Dubious / Erroneous* (Chybné či pochybné literární záznamy)
- **Zákaz překládání molekulárních a genetických termínů:** Termíny jako *COI*, *DNA barcoding*, *Barcoding*, *Barcodes*, *PCR*, *mtDNA* apod. se **NIKDY NEPŘEKLÁDAJÍ** do češtiny.