"""
Možnost 2B: Veřejný FastAPI server pro generování a servírování mapových PNG obrázků a distribuce.

Nabízí endpointy:
  GET /map/{species}.png          - PNG mapa druhu nebo poddruhu
  GET /map/genus/{genus}.png      - PNG mapa celého rodu
  GET /api/v1/distribution/{sp}  - JSON distribuce taxonu
  GET /api/v1/search?q=...        - fulltextové vyhledávání druhů
  GET /api/v1/citations           - citace původních vědeckých dat

Podporované parametry pro mapy:
  ?proj=equal_earth | plate_carree | mercator  (výchozí: equal_earth)
  ?theme=dark | light                         (výchozí: dark)
  ?lang=en | cs                               (výchozí: en)
"""

import sqlite3
import sys
from functools import lru_cache
from pathlib import Path
from typing import Optional

# Přidání rootu projektu pro import rendereru a databáze
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

try:
    from fastapi import FastAPI, HTTPException, Query, Response
    from fastapi.middleware.cors import CORSMiddleware
    from services.antmaps import (
        get_genus_distribution,
        get_species_distribution,
        render_ant_map,
    )
except ImportError as e:
    print(f"Chyba importu: {e}. Ujistěte se, že máte nainstalován fastapi a uvicorn.")
    sys.exit(1)

DB_PATH = ROOT_DIR / "data" / "ant_distribution.db"

app = FastAPI(
    title="AntsMapped API",
    description=(
        "Public API for ant distribution maps and biogeographical data based on GABI, "
        "Kass et al. (2022) and Wong et al. (2023). Supports Equal Earth, Plate Carrée and Mercator projections, "
        "Dark and Light themes, species and subspecies."
    ),
    version="1.1.0",
)

# Povolení CORS pro všechny domény (aby mohla volat i GitHub Pages stránka)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# In-memory LRU cache pro binární PNG (max 1024 nejčastějších dotazů)
@lru_cache(maxsize=1024)
def _cached_render_species_png(
    species_name: str,
    proj: str,
    theme: str,
    lang: str,
) -> Optional[bytes]:
    dist = get_species_distribution(species_name)
    if not dist:
        return None
    buf = render_ant_map(
        species_name=species_name,
        distribution=dist,
        projection=proj,
        theme=theme,
        lang=lang,
    )
    return buf.getvalue()


@lru_cache(maxsize=512)
def _cached_render_genus_png(
    genus_name: str,
    proj: str,
    theme: str,
    lang: str,
) -> Optional[bytes]:
    dist = get_genus_distribution(genus_name)
    if not dist:
        return None
    buf = render_ant_map(
        species_name=f"{genus_name} spp.",
        distribution=dist,
        projection=proj,
        theme=theme,
        lang=lang,
    )
    return buf.getvalue()


@app.get("/")
def root():
    return {
        "service": "AntsMapped API",
        "version": "1.1.0",
        "status": "online",
        "documentation": "/docs",
        "endpoints": {
            "species_map_png": "/map/{species_name}.png?proj=equal_earth&theme=dark&lang=en",
            "genus_map_png": "/map/genus/{genus_name}.png?proj=equal_earth&theme=dark&lang=en",
            "json_distribution": "/api/v1/distribution/{species_name}",
            "search": "/api/v1/search?q={query}&limit=20",
            "citations": "/api/v1/citations",
        },
        "citation_required": True,
    }


@app.get("/map/{species_name}.png")
def get_map_png(
    species_name: str,
    proj: str = Query("equal_earth", description="Projection: 'equal_earth' (default), 'plate_carree', 'mercator'"),
    theme: str = Query("dark", description="Theme: 'dark' (Discord default) or 'light'"),
    lang: str = Query("en", description="Legend language: 'en' (default) or 'cs'"),
):
    clean_name = species_name.replace("_", " ").replace(".", " ").strip()
    # Normalizace pro správné kapitalizace
    parts = clean_name.split()
    if len(parts) >= 3:
        clean_name = f"{parts[0].capitalize()} {parts[1].lower()} {parts[2].lower()}"
    elif len(parts) >= 2:
        clean_name = f"{parts[0].capitalize()} {parts[1].lower()}"

    png_bytes = _cached_render_species_png(clean_name, proj.lower(), theme.lower(), lang.lower())
    if png_bytes is None:
        raise HTTPException(status_code=404, detail=f"Taxon '{species_name}' was not found in the database.")

    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
    )


@app.get("/map/genus/{genus_name}.png")
def get_genus_map(
    genus_name: str,
    proj: str = Query("equal_earth", description="Projection: 'equal_earth' (default), 'plate_carree', 'mercator'"),
    theme: str = Query("dark", description="Theme: 'dark' (Discord default) or 'light'"),
    lang: str = Query("en", description="Legend language: 'en' (default) or 'cs'"),
):
    clean_genus = genus_name.strip().split()[0].capitalize()
    png_bytes = _cached_render_genus_png(clean_genus, proj.lower(), theme.lower(), lang.lower())
    if png_bytes is None:
        raise HTTPException(status_code=404, detail=f"Genus '{genus_name}' was not found in the database.")

    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
    )


@app.get("/api/v1/distribution/{species_name}")
def get_distribution_json(species_name: str):
    clean_name = species_name.replace("_", " ").replace(".", " ").strip()
    parts = clean_name.split()
    if len(parts) >= 3:
        clean_name = f"{parts[0].capitalize()} {parts[1].lower()} {parts[2].lower()}"
    elif len(parts) >= 2:
        clean_name = f"{parts[0].capitalize()} {parts[1].lower()}"

    dist = get_species_distribution(clean_name)
    if not dist:
        raise HTTPException(status_code=404, detail=f"Taxon '{species_name}' was not found in the database.")

    return {
        "species": clean_name,
        "rank": "subspecies" if len(clean_name.split()) >= 3 else "species",
        "total_regions": len(dist),
        "regions": dist,
        "citation_required": True,
        "sources": [
            "Kass et al. (2022) Science Advances",
            "Wong et al. (2023) Alien Ant Species",
            "GABI Database",
        ],
    }


@app.get("/api/v1/search")
def search_species(
    q: str = Query(..., min_length=2, description="Taxon search query, e.g. 'Formica picea'"),
    limit: int = Query(20, ge=1, le=100),
):
    """Fulltextové vyhledávání a našeptávač druhů a poddruhů."""
    clean_q = q.replace("_", " ").replace(".", " ").strip()
    if not DB_PATH.exists():
        raise HTTPException(status_code=500, detail="Database file is missing.")

    results = []
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT DISTINCT species, rank FROM species_distribution WHERE species LIKE ? ORDER BY species LIMIT ?",
            (f"%{clean_q}%", limit),
        )
        for sp, rank in cursor.fetchall():
            results.append({"name": sp, "rank": rank})

    return {"query": q, "count": len(results), "results": results}


@app.get("/api/v1/citations")
def get_citations():
    """Vrací oficiální citace požadované při použití API."""
    return {
        "licensing": "Data and maps require proper attribution of scientific authors and this API.",
        "citations": [
            {
                "authors": "Kass, J. M., Guénard, B., Dudley, K. L., Jenkins, C. N., Azuma, F., Fisher, B. L., Parr, C. L., Phang, D. E., Schultheiss, P., Shattuck, S. O., Suhr, E. L., & Economo, E. P.",
                "year": 2022,
                "title": "The global distribution of known and undiscovered ant biodiversity",
                "journal": "Science Advances",
                "volume": "8",
                "issue": "31",
                "doi": "10.1126/sciadv.abp9908",
            },
            {
                "authors": "Wong, M. K. L., Economo, E. P., & Guénard, B.",
                "year": 2023,
                "title": "The global spread and drivers of alien ant species",
                "journal": "Nature Communications",
            },
            {
                "authors": "Šavrič, B., Patterson, T., & Jenny, B.",
                "year": 2018,
                "title": "The Equal Earth map projection",
                "journal": "International Journal of Geographical Information Science",
                "doi": "10.1080/13658816.2018.1504949",
            },
        ],
        "suggested_discord_footer": "Data: Kass et al. 2022, Wong et al. 2023 | AntsMappedAPI",
    }


@app.get("/health")
def health_check():
    return {"status": "healthy", "database_available": DB_PATH.exists()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
