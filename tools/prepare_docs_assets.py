"""
Příprava podkladů a dat pro GitHub Pages dokumentační portál (docs/).

Tento skript:
1. Vytvoří minifikovaný index všech taxonů a rodů (docs/data/taxa_index.json)
2. Vygeneruje reprezentativní sadu ukázkových PNG map do docs/demo_maps/
"""

import json
import sqlite3
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from services.antmaps.database import get_species_distribution, get_genus_distribution
from services.antmaps.renderer import render_ant_map

DOCS_DIR = ROOT_DIR / "docs"
DATA_DIR = DOCS_DIR / "data"
DEMO_MAPS_DIR = DOCS_DIR / "demo_maps"
DB_PATH = ROOT_DIR / "data" / "ant_distribution.db"

def prepare_taxa_index():
    print("Vytvářím taxa_index.json pro našeptávač...")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 1. Druhy a poddruhy
    cursor.execute("""
        SELECT species, rank, count(bentity) as cnt 
        FROM species_distribution 
        GROUP BY species 
        ORDER BY species
    """)
    species_rows = cursor.fetchall()
    
    taxa = []
    genera_set = set()
    
    for name, rank, cnt in species_rows:
        taxa.append({
            "n": name,
            "r": "sp" if rank == "species" else "sub",
            "c": cnt
        })
        genus = name.split()[0]
        genera_set.add(genus)
    
    # 2. Rody
    genera_list = sorted(list(genera_set))
    genera_items = []
    for g in genera_list:
        cursor.execute("SELECT count(DISTINCT bentity) FROM species_distribution WHERE species LIKE ?", (f"{g} %",))
        g_cnt = cursor.fetchone()[0]
        genera_items.append({
            "n": g,
            "r": "gen",
            "c": g_cnt
        })
        
    conn.close()
    
    output = {
        "total_taxa": len(taxa),
        "total_genera": len(genera_items),
        "genera": genera_items,
        "taxa": taxa
    }
    
    output_path = DATA_DIR / "taxa_index.json"
    with open(output_path, "w", encoding="utf-8") as f:
        # Kompaktní JSON bez zbytečných mezer pro minimální velikost
        json.dump(output, f, separators=(",", ":"), ensure_ascii=False)
        
    size_kb = output_path.stat().st_size / 1024
    print(f"Uloženo {len(taxa)} taxonů a {len(genera_items)} rodů do {output_path} ({size_kb:.1f} KB)")


def generate_demo_maps():
    print("Generuji vzorové demo mapy pro GitHub Pages...")
    DEMO_MAPS_DIR.mkdir(parents=True, exist_ok=True)
    
    demos = [
        ("Lasius niger", "equal_earth", "dark", "en", False),
        ("Lasius niger", "plate_carree", "dark", "en", False),
        ("Lasius niger", "mercator", "light", "cs", False),
        ("Formica rufa", "equal_earth", "dark", "en", False),
        ("Linepithema humile", "equal_earth", "dark", "en", False),
        ("Solenopsis invicta", "equal_earth", "dark", "en", False),
        ("Oecophylla smaragdina", "equal_earth", "dark", "en", False),
        ("Camponotus ligniperda", "equal_earth", "dark", "cs", False),
        ("Camponotus", "equal_earth", "dark", "en", True),
    ]
    
    for name, proj, theme, lang, is_genus in demos:
        safe_name = name.replace(" ", "_")
        prefix = "genus_" if is_genus else ""
        filename = f"{prefix}{safe_name}_{proj}_{theme}_{lang}.png"
        filepath = DEMO_MAPS_DIR / filename
        
        if filepath.exists():
            print(f"  Přeskakuji již existující: {filename}")
            continue
            
        print(f"  Vykresluji: {filename}...")
        if is_genus:
            dist = get_genus_distribution(name)
            title = f"{name} spp."
        else:
            dist = get_species_distribution(name)
            title = name
            
        if not dist:
            print(f"  Varování: distribuce pro {name} nebyla nalezena!")
            continue
            
        buf = render_ant_map(
            species_name=title,
            distribution=dist,
            projection=proj,
            theme=theme,
            lang=lang
        )
        
        with open(filepath, "wb") as f:
            f.write(buf.getvalue())
            
    print(f"Demo mapy úspěšně připraveny v {DEMO_MAPS_DIR}")


if __name__ == "__main__":
    prepare_taxa_index()
    generate_demo_maps()
