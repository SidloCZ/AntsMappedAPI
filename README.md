# AntsMapped API

> Free, community-driven ant distribution map generator and Flat-File JSON API for Discord bots, myrmecologists, and web developers.

[![GitHub Pages](https://img.shields.io/badge/docs-GitHub_Pages-blue.svg)](https://sidlocz.github.io/AntsMappedAPI/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.12+](https://img.shields.io/badge/python-3.12+-blue.svg)](https://www.python.org/downloads/)
[![Coverage](https://img.shields.io/badge/taxa-15%2C462-green.svg)](#features)
[![Bentities](https://img.shields.io/badge/regions-546_GABI-orange.svg)](#data-sources)

---

## Overview

**AntsMapped API** is an open-source replacement for the discontinued `antapi.org` service. It provides high-speed, on-demand ant distribution map rendering and biogeographical occurrence querying without relying on third-party bot-protected endpoints or complex GIS infrastructure.

* **Live Interactive Documentation & Explorer:** [https://sidlocz.github.io/AntsMappedAPI/](https://sidlocz.github.io/AntsMappedAPI/)
* **Repository:** [https://github.com/SidloCZ/AntsMappedAPI](https://github.com/SidloCZ/AntsMappedAPI)

---

## Features

* **15,462 Ant Taxa Covered:** Complete scientific coverage of 13,700 species and 1,762 subspecies, plus aggregate global distributions for all 338 genera.
* **Hierarchical Taxon Precision:**
  * Subspecies query (e.g. *Formica picea formosae*) returns strictly the specific subspecies distribution.
  * Parent species query (e.g. *Formica picea*) returns the global range encompassing all its subspecies.
  * Genus query (e.g. *Formica*) returns aggregated distribution of all taxa in the genus.
* **Three Cartographic Projections:**
  * `equal_earth` *(Default)*: Mathematically balanced equal-area pseudocylindrical projection (Šavrič et al., 2018).
  * `plate_carree`: Classic 2:1 rectangular cylindrical projection.
  * `mercator`: Standard conformal navigation projection.
* **Themes & Languages:**
  * Dark mode (optimized for Discord embeds `#1e1f22`) and publication Light mode.
  * Multilingual map legend (`en` English, `cs` Czech).
* **High Performance:** In-memory pre-projected geometry cache and LRU rendering buffer deliver response times under 5&nbsp;ms for hot queries.
* **Zero Heavy GIS Dependencies:** Projection formulas run purely in Python and Matplotlib Agg.

---

## Quick Start

### 1. Requirements

* Python 3.12 or newer
* Dependencies: `fastapi`, `uvicorn`, `matplotlib`

```bash
git clone https://github.com/SidloCZ/AntsMappedAPI.git
cd AntsMappedAPI
pip install fastapi uvicorn matplotlib
```

### 2. Run API Server Locally

```bash
python -m uvicorn option_2b_image_api.api_server:app --reload --port 8000
```

The API will be available at `http://localhost:8000`. Test it in your browser:
* PNG map: `http://localhost:8000/map/Lasius_niger.png`
* Interactive OpenAPI Swagger: `http://localhost:8000/docs`

---

## API Endpoints

### 1. Species Distribution Map (PNG)

```http
GET /map/{species_name}.png
```

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `species_name` | path string | *(required)* | Scientific name (e.g. `Lasius_niger`, `Formica_rufa`). |
| `proj` | query string | `equal_earth` | Projection: `equal_earth`, `plate_carree`, `mercator`. |
| `theme` | query string | `dark` | Theme: `dark` (Discord default), `light`. |
| `lang` | query string | `en` | Legend language: `en` (English), `cs` (Czech). |

**Example:**
```text
https://sidlocz-antsmappedapi.hf.space/map/Lasius_niger.png?proj=equal_earth&theme=dark&lang=en
```

### 2. Genus Aggregate Map (PNG)

```http
GET /map/genus/{genus_name}.png
```

Aggregates all known records for every species within the specified genus.

**Example:**
```text
https://sidlocz-antsmappedapi.hf.space/map/genus/Camponotus.png?proj=equal_earth&theme=dark
```

### 3. Distribution JSON

```http
GET /api/v1/distribution/{species_name}
```

Returns structured JSON with all sub-national biogeographical entities (GABI bentities) and their native or introduced status.

### 4. Search & Autocomplete

```http
GET /api/v1/search?q={query}&limit=20
```

Fulltext search across all 15,462 species and subspecies.

### 5. Scientific Citations Metadata

```http
GET /api/v1/citations
```

Returns required attribution metadata for academic research and bot embeds.

---

## Discord Bot Integration

### discord.py (Python)

```python
import discord
from discord import app_commands

@bot.tree.command(name="antmap", description="Display ant distribution map")
@app_commands.describe(taxon="Scientific name of ant species or genus")
async def antmap(interaction: discord.Interaction, taxon: str):
    clean_taxon = taxon.replace(" ", "_")
    map_url = f"https://sidlocz-antsmappedapi.hf.space/map/{clean_taxon}.png?proj=equal_earth&theme=dark&lang=en"

    embed = discord.Embed(
        title=f"Distribution: {taxon}",
        color=0x5865F2
    )
    embed.set_image(url=map_url)
    embed.set_footer(text="Data: GABI (Kass et al. 2022, Wong et al. 2023) | API: AntsMappedAPI")

    await interaction.response.send_message(embed=embed)
```

### discord.js v14 (JavaScript)

```javascript
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('antmap')
    .setDescription('Display ant species distribution map')
    .addStringOption(option =>
      option.setName('taxon')
        .setDescription('Scientific species or genus name')
        .setRequired(true)),

  async execute(interaction) {
    const taxon = interaction.options.getString('taxon');
    const safeTaxon = taxon.replace(/ /g, '_');
    const mapUrl = `https://sidlocz-antsmappedapi.hf.space/map/${safeTaxon}.png?proj=equal_earth&theme=dark&lang=en`;

    const embed = new EmbedBuilder()
      .setTitle(`Distribution: ${taxon}`)
      .setImage(mapUrl)
      .setColor(0x5865F2)
      .setFooter({ text: 'Data: GABI (Kass et al. 2022) | API: AntsMappedAPI' });

    await interaction.reply({ embeds: [embed] });
  },
};
```

---

## Biogeographical Status Color Legend

Maps use high-contrast color coding optimized for dark and light backgrounds:

| Status | Color Code | Description |
| :--- | :--- | :--- |
| **Native** | `#8bc34a` (green) | Endemic or indigenous occurrence. |
| **Established Outdoors** | `#e53935` (red) | Introduced alien species persisting in natural outdoor habitats. |
| **Established Indoors** | `#ff9800` (warm orange) | Introduced exotic species surviving only in heated greenhouses and buildings. |
| **Need Verification / Interception** | `#ffee55` (lemon yellow) | Border interception or unverified regional records. |
| **Dubious / Erroneous** | `#ba68c8` (lavender) | Literature records considered erroneous or dubious by myrmecological authorities. |
| **Unrecorded Land** | `#36393f` (dark gray) | Biogeographical entities without recorded occurrences. |

---

## Project Structure

```text
AntsMappedAPI/
├── data/
│   ├── ant_distribution.db            # Compiled SQLite database (12.7 MB, 89,458 records)
│   └── bentities_geometry.json        # 546 GABI polygons optimized with Ramer-Douglas-Peucker (1.15 MB)
├── docs/                              # Indexable GitHub Pages public web portal
│   ├── index.html                     # Interactive Explorer, API docs & SEO metadata
│   ├── styles.css                     # Vanilla CSS design system (Dark & Light mode)
│   ├── app.js                         # Autocomplete client & code generator
│   ├── data/taxa_index.json           # Compact index for browser-side autocomplete
│   └── demo_maps/                     # Pre-rendered PNG map samples
├── services/
│   └── antmaps/
│       ├── database.py                # Normalized SQLite queries and hierarchy resolver
│       └── renderer.py                # Pure Python cartographic rendering engine (Equal Earth, Plate Carrée, Mercator)
├── option_2a_github_pages/            # Static JSON Flat-File API exporter for CDN hosting
│   └── export_static_api.py
├── option_2b_image_api/               # Standalone FastAPI microserver
│   └── api_server.py
├── tools/
│   └── prepare_docs_assets.py         # Build pipeline for docs assets and demo maps
├── AGENTS.md                          # Mandatory project rules and development standards
├── DOKUMENTACE_DATABAZE_A_PUBLIKACE.md # Comprehensive database documentation (in Czech)
└── README.md
```

---

## Scientific Attribution & Mandatory Citation

All users, bots, and applications utilizing AntsMapped API are required to give proper credit to the primary scientific researchers who compiled the underlying biodiversity datasets:

1. **Global Ant Distribution (GABI):**  
   Kass, J. M., Guénard, B., Dudley, K. L., Jenkins, C. N., Azuma, F., Fisher, B. L., Parr, C. L., Phang, D. E., Schultheiss, P., Shattuck, S. O., Suhr, E. L., & Economo, E. P. (2022). The global distribution of known and undiscovered ant biodiversity. *Science Advances*, 8(31), eabp9908. [https://doi.org/10.1126/sciadv.abp9908](https://doi.org/10.1126/sciadv.abp9908)

2. **Alien Ant Species Dataset:**  
   Wong, M. K. L., Economo, E. P., & Guénard, B. (2023). The global spread and drivers of alien ant species. *Nature Communications*, 14, 8398. [https://doi.org/10.1038/s41467-023-43861-9](https://doi.org/10.1038/s41467-023-43861-9)

3. **Equal Earth Projection:**  
   Šavrič, B., Patterson, T., & Jenny, B. (2018). The Equal Earth map projection. *International Journal of Geographical Information Science*, 33(3), 454–465. [https://doi.org/10.1080/13658816.2018.1504949](https://doi.org/10.1080/13658816.2018.1504949)

### Mandatory Discord Footer Attribution:
```text
Data: GABI (Kass et al. 2022, Wong et al. 2023) | API: AntsMappedAPI
```

---

## License

* **Source Code:** [MIT License](LICENSE)
* **Biodiversity Data:** Compiled from GABI under scientific fair-use attribution.
