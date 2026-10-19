# Dokumentace distribuční databáze mravenců, generátoru map a plánů pro veřejné API

Tento dokument slouží jako centrální záznam o původu dat, jejich zpracování, použité kartografické projekci a architektuře publikování otevřeného API pro myrmekologickou komunitu.

---

## 1. Kontext a důvod vzniku

V minulosti existovaly Discord boty (např. AntCheck), které dokázaly na vyžádání odeslat mapu rozšíření libovolného rodu nebo druhu mravence. Tyto boty spoléhaly na službu `antapi.org`, což byl neoficiální komunitní renderovací wrapper nad daty AntMaps.

### Proč staré řešení selhalo:
1. **Konec služby AntApi.org:** Server i doména `antapi.org` přestaly být provozovány, což vedlo k trvalému selhání načítání obrázků v Discord embedech.
2. **Nasazení Client Challenge na AntMaps.org:** Server `antmaps.org` zavedl přísnou ochranu proti botům (Client Challenge vyžadující vykonání JavaScriptu). Běžné HTTP požadavky z Pythonu nebo serverových skriptů vrací HTML s výzvou prohlížeči, nikoliv JSON data.
3. **Nedostupnost AntWeb a AntWiki:** Oba weby jsou chráněny Cloudflare Bot Managementem a nenabízejí veřejné API pro dynamické mapové dlaždice.
4. **Omezení GBIF:** GBIF poskytuje surová bodová data (GPS nálezy), postrádá však literárně revidovaný biogeografický kontext (rozlišení, zda je druh v regionu původní, invazní či skleníkový). Základní mapové dlaždice GBIF jsou navíc kartograficky nevhodné a málo přehledné.

Řešením bylo vytvořit **vlastní, zcela nezávislý a lokální systém**, který staví na oficiálních vědeckých datasetech.

---

## 2. Použité datové zdroje

Data byla převzata z nejvýznamnějších recenzovaných studií současné myrmekologie:

| Zdroj | Publikace / Původ | Využití v projektu |
| :--- | :--- | :--- |
| **Kass et&nbsp;al. (2022)** | *Science Advances* (DOI: [10.1126/sciadv.abp9908](https://doi.org/10.1126/sciadv.abp9908)) | Kompletní revidovaný celosvětový výskyt druhů z databáze GABI (Global Ant Biodiversity Informatics). |
| **Wong et&nbsp;al. (2023)** | Dataset nepůvodních druhů (*Dataset_1_alien_ant_species_records.csv*) | Zlatý standard pro kategorizaci invazních a exotických mravenců. |
| **Bentities (Bentity2)** | Polygony biogeografických entit z GABI | Hranice 546 světových sub-národních celků (státy USA, provincie Kanady a Číny, ostrovy, státy). |

> **Důležité upozornění k datům:** Složka staršího vydání `GABI_Data_Release1.0` (z roku 2018) se pro výskyt druhů **nepoužívá**. Z jejího shapefile byla pouze jednorázově extrahována geometrie polygonů, která byla zjednodušena Ramerovým–Douglasovým–Peuckerovým algoritmem z 22&nbsp;MB na lehkých **1,15&nbsp;MB** do souboru `data/bentities_geometry.json`. Všechna věcná data o výskytu pocházejí výhradně z Kass (2022) a Wong (2023).

---

## 3. Mapová projekce Equal Earth

Místo běžné válcové projekce (Plate Carrée), která extrémně deformuje polární a severské šířky (Grónsko a severní Eurasie jsou nepřirozeně obrovské na úkor tropů), byla zvolena moderní **Equal Earth projekce** (Šavrič, Jenny & Patterson, 2018).

### Proč Equal Earth:
* **Stejnoplochost (Equal-area):** Relativní velikosti států a kontinentů přesně odpovídají skutečnosti, což je pro mapování biodiverzity a areálů výskytu zásadní.
* **Estetika glóbu:** Elegantně zaoblené krajní poledníky a ploché póly vytvářejí reprezentativní oválný rám.
* **Čistá implementace bez externích GIS závislostí:** Převodní rovnice byly implementovány přímo v jazyce Python v souboru `services/antmaps/renderer.py`.

### Matematický model projekce:
Pro zeměpisnou délku $\lambda$ a šířku $\phi$ (v radiánech) se nejprve určí parametrická šířka $\theta$:
$$\sin \theta = \frac{\sqrt{3}}{2} \sin \phi$$

Následně se vypočtou kartézské souřadnice $(x, y)$ pomocí empirických koeficientů:
* $A_1 = 1{,}340264$
* $A_2 = -0{,}081106$
* $A_3 = 0{,}000893$
* $A_4 = 0{,}003796$

$$x = \frac{2 \sqrt{3} \cdot \lambda \cdot \cos \theta}{3 \cdot (A_1 + 3 A_2 \theta^2 + 7 A_3 \theta^6 + 9 A_4 \theta^8)}$$
$$y = \theta \cdot (A_1 + A_2 \theta^2 + A_3 \theta^6 + A_4 \theta^8)$$

---

## 4. Architektura implementace

Projekt je rozdělen do modulů tak, aby bylo možné jádro používat ve FormiBotovi a exportní nástroje kdykoliv vyčlenit do samostatného veřejného repozitáře.

### Přehled adresářů a souborů:

```text
FormiBotV2/
├── data/
│   ├── bentities_geometry.json        # 546 polygonů v optimalizovaném JSON formátu (1,15 MB)
│   ├── test_species_distribution.json # Rychlý JSON index pro testované druhy
│   └── ant_distribution.db            # SQLite databáze (vytváří build_full_database.py)
├── services/antmaps/
│   ├── __init__.py                    # Export rozhraní pro bota
│   ├── database.py                    # Dotazování SQLite / testovacího JSON
│   └── renderer.py                    # Equal Earth renderér do paměťového PNG bufferu
├── commands/
│   └── map_commands.py                # Discord slash command /map
└── tools/antmaps_tools/
    ├── DOKUMENTACE_DATABAZE_A_PUBLIKACE.md # Tento dokument
    ├── build_full_database.py         # Sestavení kompletní SQLite databáze z CSV
    ├── option_2a_github_pages/        # Podklady pro Možnost 2A (Statické JSON API)
    │   ├── export_static_api.py       # Generátor stromu JSON souborů pro GitHub Pages
    │   └── README.md                  # Návod na zprovoznění CDN
    └── option_2b_image_api/           # Podklady pro Možnost 2B (FastAPI mikroserver)
        ├── api_server.py              # Samostatný HTTP server pro servírování PNG
        └── README.md                  # Návod k nasazení na Render / VPS
```

---

## 5. Barevné standardy výskytu a legenda

Mapy využívají optimalizovanou paletu s vysokým kontrastem přizpůsobenou tmavému režimu Discordu:

* **Původní:** `#8bc34a` (zelená)
* **Zavlečený – volná příroda:** `#e53935` (červená)
* **Zavlečený – budovy a skleníky:** `#ff9800` (sytá teplá oranžová)
* **Vyžaduje ověření:** `#ffee55` (zářivá citrónová žlutá – eliminuje splývání s oranžovou)
* **Chybné:** `#ba68c8` (světle fialová / levandulová – eliminuje splývání hnědé s tmavě šedým podkladem pevniny)
* **Pevnina bez záznamu:** `#36393f` (tmavě šedá)
* **Vnitřní oceán Equal Earth:** `#25272b` (tmavě modrošedá)
* **Vnější plátno:** `#1e1f22` (Discord pozadí)
* **Označení projekce:** Vpravo nahoře text `Equal Earth projection` (bílá, 70 % průhlednost)

---

## 6. Budoucí plány: Publikování a veřejné API pro komunitu

Pro zpřístupnění dat ostatním vývojářům botů a myrmekologům jsou připraveny dva publikační modely:

### Plán A: Statické Flat-File JSON API (GitHub Pages + jsDelivr CDN)
* **Princip:** Spuštěním `export_static_api.py` se vygeneruje složka `dist_api/api/v1/species/*.json`.
* **Nasazení:** Složka se nahraje do nového otevřeného GitHub repozitáře (např. `ant-distribution-api`).
* **Přístup pro ostatní vývojáře:** Boti po celém světě mohou volat:
  ```text
  https://cdn.jsdelivr.net/gh/<uzivatel>/ant-distribution-api@main/api/v1/species/Lasius_niger.json
  ```
* **Výhody:** Nulové provozní náklady, nulová správa serveru, globální CDN s latencí pod 20&nbsp;ms, žádné rate-limity a žádná blokace botů.

### Plán B: Veřejná mikroslužba generující obrázky (Image API)
* **Princip:** Samostatný FastAPI server `api_server.py`.
* **Endpoint:** `GET /map/{species}.png` přímo vrací vygenerovaný PNG obrázek v Equal Earth projekci.
* **Nasazení:** Bezplatný kontejner na Render.com, Fly.io, Koyeb nebo vlastní VPS.
* **Použití v Discordu:** Ostatním botům stačí do embedu vložit:
  ```python
  embed.set_image(url="https://ant-api.example.com/map/Lasius_niger.png")
  ```

---

## 7. Licenční požadavky a citace

Při jakémkoliv veřejném výstupu, v Discord embedech i v repozitáři je nutné uvádět řádnou citaci primárních autorů:

1. **Kass, J. M., Guénard, B., Dudley, K. L., Jenkins, C. N., Azuma, F., Fisher, B. L., Parr, C. L., Phang, D. E., Schultheiss, P., Shattuck, S. O., Suhr, E. L., & Economo, E. P. (2022).** *The global distribution of known and undiscovered ant biodiversity.* Science Advances, 8(31), eabp9908.
2. **Wong, M. K. L., Economo, E. P., & Guénard, B. (2023).** *The global spread and drivers of alien ant species.*
3. **Guénard, B., Weiser, M. D., Gomez, K., Narula, N., & Economo, E. P. (2017).** *The Global Ant Biodiversity Informatics (GABI) database.* Myrmecological News, 24, 83–89.
4. **Equal Earth Projection:** Šavrič, B., Patterson, T., & Jenny, B. (2018). *The Equal Earth map projection.* International Journal of Geographical Information Science.
