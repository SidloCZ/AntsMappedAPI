"""
Možnost 2B: Samostatný FastAPI server pro generování a servírování mapových PNG obrázků.

Běží samostatně a nabízí endpoint:
  GET /map/{species}.png
  GET /api/v1/distribution/{species}
"""

import sys
from pathlib import Path

# Přidání rootu projektu pro import rendereru a databáze
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

try:
    from fastapi import FastAPI, HTTPException, Response
    from services.antmaps import render_ant_map, get_species_distribution
except ImportError:
    print("Pro spuštění serveru nainstalujte: pip install fastapi uvicorn")
    sys.exit(1)

app = FastAPI(
    title="Ant Distribution Map API",
    description="Otevřené API pro generování map rozšíření druhů mravenců podle dat GABI, Kass et al. 2022 a Wong et al. 2023.",
    version="1.0.0"
)


@app.get("/")
def root():
    return {
        "status": "online",
        "documentation": "/docs",
        "endpoints": {
            "png_map": "/map/{species}.png",
            "json_distribution": "/api/v1/distribution/{species}"
        }
    }


@app.get("/map/{species_name}.png")
def get_map_png(species_name: str):
    clean_name = species_name.replace("_", " ").replace(".", " ").strip()
    dist = get_species_distribution(clean_name)
    if not dist:
        raise HTTPException(status_code=404, detail=f"Druh '{species_name}' nebyl nalezen v databázi.")

    buffer = render_ant_map(clean_name, dist)
    return Response(content=buffer.getvalue(), media_type="image/png")


@app.get("/api/v1/distribution/{species_name}")
def get_distribution_json(species_name: str):
    clean_name = species_name.replace("_", " ").replace(".", " ").strip()
    dist = get_species_distribution(clean_name)
    if not dist:
        raise HTTPException(status_code=404, detail=f"Druh '{species_name}' nebyl nalezen v databázi.")

    return {
        "species": clean_name,
        "total_regions": len(dist),
        "regions": dist
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
