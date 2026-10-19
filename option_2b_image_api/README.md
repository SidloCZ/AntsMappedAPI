# Option 2B: Dynamic Image & Data API (FastAPI)

Tento mikroserver postavený na **FastAPI** dynamicky generuje a servíruje PNG mapy rozšíření mravenců pro Discord boty, webové aplikace a výzkumníky.

---

## 1. Hlavní parametry a možnosti vykreslování

Všechny mapové endpointy podporují volitelné parametry v URL dotazu:

### Projekce (`proj`)
* `equal_earth` (**výchozí**) – moderní stejnoplochá oválná projekce (Šavrič et&nbsp;al. 2018), která nedeformuje relativní velikosti kontinentů.
* `plate_carree` (nebo `cylindrical`) – klasická obdélníková válcová projekce 2:1 (standardní formát AntMaps a GBIF).
* `mercator` – konformní Mercatorova projekce.

### Barevný motiv (`theme`)
* `dark` (**výchozí**) – optimalizovaný tmavý kontrastní motiv navržený přímo pro Discord tmavý režim (pozadí `#1e1f22`, oceán `#25272b`).
* `light` – čistý světlý motiv s jemným oceánem a vysokým kontrastem pevniny, ideální pro světlé weby, tisk a vědecké publikace.

### Jazyk popisků a legendy (`lang`)
* `en` (**výchozí**) – kompletní popisky a legenda v angličtině (*Native*, *Introduced (outdoors)*, *Introduced (indoors)*, *Need verification*, *Dubious*).
* `cs` – české popisky.

---

## 2. Přehled endpointů

### Generování PNG map
* **Druh nebo poddruh:**
  ```text
  GET /map/{species_name}.png
  GET /map/{species_name}.png?proj=plate_carree&theme=light&lang=en
  ```
  *Příklad:* `/map/Formica_picea.png` nebo `/map/Formica_picea_formosae.png`

* **Celý rod:**
  ```text
  GET /map/genus/{genus_name}.png
  ```
  *Příklad:* `/map/genus/Formica.png`

### JSON data a vyhledávání
* **Distribuce taxonu:** `GET /api/v1/distribution/{species_name}`
* **Fulltextové vyhledávání / našeptávač:** `GET /api/v1/search?q=formica&limit=20`
* **Citační požadavky a formáty:** `GET /api/v1/citations`
* **Stav služby:** `GET /health`

---

## 3. Použití v Discord botu (discord.py)

```python
import discord
from discord.ext import commands

bot = commands.Bot(command_prefix="!", intents=discord.Intents.default())

@bot.command()
async def map(ctx, *, species: str):
    clean_sp = species.strip().replace(" ", "_")
    map_url = f"https://api.vasedomena.com/map/{clean_sp}.png?proj=equal_earth&theme=dark"
    
    embed = discord.Embed(
        title=f"Distribution: {species}",
        color=0x8bc34a
    )
    embed.set_image(url=map_url)
    embed.set_footer(text="Data: GABI (Kass et al. 2022, Wong et al. 2023) | AntsMapped API")
    
    await ctx.send(embed=embed)
```

---

## 4. Lokální spuštění a testování

```bash
pip install fastapi uvicorn matplotlib
python api_server.py
```
Interaktivní dokumentace Swagger UI je okamžitě dostupná na: `http://localhost:8000/docs`.

---

## 5. Bezplatné nasazení

* **Hugging Face Spaces (Doporučeno):** Trvalý běh zdarma, 16&nbsp;GB RAM, 2&nbsp;vCPU, veřejná HTTPS adresa, žádné usínání (Discord embedy nikdy nevyprší na timeout).
* **Render.com:** Bezplatný Web Service.
