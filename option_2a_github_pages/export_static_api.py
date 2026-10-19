"""
Možnost 2A: Generátor statického Flat-File JSON API pro GitHub Pages / jsDelivr CDN.

Tento skript vezme data ze SQLite databáze (nebo testovacího JSON)
a vytvoří adresářovou strukturu:
  dist_api/
    api/v1/
      bentities.json
      species/
        Lasius_niger.json
        Linepithema_humile.json
        ...

Po nahrání složky do GitHub repozitáře lze data volat přes:
https://cdn.jsdelivr.net/gh/<USER>/<REPO>@main/api/v1/species/Lasius_niger.json
"""

import json
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "ant_distribution.db"
TEST_JSON = DATA_DIR / "test_species_distribution.json"
BENTITIES_PATH = DATA_DIR / "bentities_geometry.json"

DIST_DIR = BASE_DIR / "tools" / "antmaps_tools" / "option_2a_github_pages" / "dist_api" / "api" / "v1"
SPECIES_DIR = DIST_DIR / "species"


def export_api():
    print("Zahajuji export statického JSON API...")
    SPECIES_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Export seznamu bentities
    if BENTITIES_PATH.exists():
        with open(BENTITIES_PATH, "r", encoding="utf-8") as f:
            bents_geo = json.load(f)
        bents_list = sorted(list(bents_geo.keys()))
        with open(DIST_DIR / "bentities.json", "w", encoding="utf-8") as f:
            json.dump(bents_list, f, indent=2, ensure_ascii=False)
        print(f"Uložen seznam {len(bents_list)} bentities do bentities.json")

    # 2. Export jednotlivých druhů
    count = 0
    if DB_PATH.exists():
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT species FROM species_distribution")
        species_list = [r[0] for r in cursor.fetchall()]

        for sp in species_list:
            cursor.execute("SELECT bentity, status FROM species_distribution WHERE species = ?", (sp,))
            dist = {r[0]: r[1] for r in cursor.fetchall()}
            file_name = sp.replace(" ", "_") + ".json"
            with open(SPECIES_DIR / file_name, "w", encoding="utf-8") as f:
                json.dump({"species": sp, "regions": dist}, f, indent=2, ensure_ascii=False)
            count += 1
        conn.close()
    elif TEST_JSON.exists():
        with open(TEST_JSON, "r", encoding="utf-8") as f:
            test_data = json.load(f)
        for sp, dist in test_data.items():
            file_name = sp.replace(" ", "_") + ".json"
            with open(SPECIES_DIR / file_name, "w", encoding="utf-8") as f:
                json.dump({"species": sp, "regions": dist}, f, indent=2, ensure_ascii=False)
            count += 1

    print(f"Hotovo! Vygenerováno {count} JSON souborů v {SPECIES_DIR}")


if __name__ == "__main__":
    export_api()
