"""
Skript pro vytvoření hierarchické SQLite databáze distribuce mravenců
ze zdrojových souborů Kass et al. 2022 a Wong et al. 2023.

Podporuje hierarchii:
  1. Subspecies (např. 'Formica picea formosae') s přesnou distribucí
  2. Species (např. 'Formica picea') s celkovou agregovanou distribucí včetně všech svých poddruhů
  3. Genus (např. 'Formica') dynamicky agregovaný s prioritním rozlišením statusu

Výsledný soubor: data/ant_distribution.db
"""

import csv
import sqlite3
import time
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent

# Vyhledání cesty k CSV souborům (lokální složka nebo nadřazený repozitář Work)
CANDIDATE_DIRS = [
    CURRENT_DIR / "AntMaps",
    CURRENT_DIR.parent.parent.parent / "Work" / "AntMaps",
    CURRENT_DIR.parent.parent / "Work" / "AntMaps",
]

KASS_CSV = None
WONG_CSV = None

for d in CANDIDATE_DIRS:
    k_path = d / "Kass 2022" / "main_analysis_data" / "processing_data" / "1_GABI_raw_all_records.csv"
    w_path = d / "Wong 2023" / "Dataset_1_alien_ant_species_records.csv"
    if k_path.exists() and w_path.exists():
        KASS_CSV = k_path
        WONG_CSV = w_path
        break

DATA_DIR = CURRENT_DIR / "data"
DB_PATH = DATA_DIR / "ant_distribution.db"

STATUS_PRIORITY = {
    "native": 5,
    "established.outdoors": 4,
    "exotic": 4,
    "established.indoors": 3,
    "indoor": 3,
    "border.interception": 2,
    "need_verification": 2,
    "dubious": 1,
    "erroneous": 1,
}


def parse_names(raw_name: str):
    """
    Rozdělí surový název na poddruh (pokud existuje) a mateřský druh.
    Vrací: (subspecies_name, species_name)
    Např.:
      'Formica.picea formosae' -> ('Formica picea formosae', 'Formica picea')
      'Formica.picea'         -> (None, 'Formica picea')
    """
    clean = raw_name.strip().replace(".", " ").replace("_", " ")
    parts = clean.split()
    if len(parts) >= 3:
        subspecies = f"{parts[0].capitalize()} {parts[1].lower()} {parts[2].lower()}"
        species = f"{parts[0].capitalize()} {parts[1].lower()}"
        return subspecies, species
    elif len(parts) == 2:
        species = f"{parts[0].capitalize()} {parts[1].lower()}"
        return None, species
    return None, raw_name.strip()


def build_database():
    t0 = time.time()
    print("Zahajuji stavbu hierarchické SQLite databáze distribuce...")

    if not KASS_CSV or not WONG_CSV:
        print(f"Chyba: Nenalezeny zdrojové soubory Kass 2022 a Wong 2023. Prohledáno v: {CANDIDATE_DIRS}")
        return

    print(f"Zdroj dat Kass 2022: {KASS_CSV}")
    print(f"Zdroj dat Wong 2023: {WONG_CSV}")

    # Datové struktury pro druhy a poddruhy: {taxon_name: {bentity: status}}
    species_records = {}
    subspecies_records = {}

    print("1/3 Načítám data z Kass et al. 2022 (GABI)...")
    with open(KASS_CSV, "r", encoding="utf-8", errors="ignore") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_sp = row.get("valid_species_name")
            bent = row.get("bentity2_name")
            if not raw_sp or not bent:
                continue

            sub_name, sp_name = parse_names(raw_sp)
            is_dubious = bool(row.get("note_dubious", "").strip())
            st = "dubious" if is_dubious else "native"
            p = STATUS_PRIORITY.get(st, 0)

            # Agregace do mateřského druhu
            if sp_name not in species_records:
                species_records[sp_name] = {}
            current_st = species_records[sp_name].get(bent)
            current_p = STATUS_PRIORITY.get(current_st, 0) if current_st else 0
            if not current_st or p > current_p:
                species_records[sp_name][bent] = st

            # Záznam pro konkrétní poddruh
            if sub_name:
                if sub_name not in subspecies_records:
                    subspecies_records[sub_name] = {}
                sub_st = subspecies_records[sub_name].get(bent)
                sub_p = STATUS_PRIORITY.get(sub_st, 0) if sub_st else 0
                if not sub_st or p > sub_p:
                    subspecies_records[sub_name][bent] = st

    print(f"   Načteno {len(species_records)} druhů a {len(subspecies_records)} poddruhů z Kass 2022.")

    print("2/3 Překrývám revidované invazní statusy z Wong et al. 2023...")
    with open(WONG_CSV, "r", encoding="utf-8", errors="ignore") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_sp = row.get("species")
            bent = row.get("region")
            st = row.get("status")
            if not raw_sp or not bent or not st:
                continue

            if st not in ("established.outdoors", "established.indoors", "native", "border.interception"):
                continue

            sub_name, sp_name = parse_names(raw_sp)
            p = STATUS_PRIORITY.get(st, 0)

            # Překrytí pro mateřský druh
            if sp_name not in species_records:
                species_records[sp_name] = {}
            current_st = species_records[sp_name].get(bent)
            current_p = STATUS_PRIORITY.get(current_st, 0) if current_st else 0
            if not current_st or p > current_p:
                species_records[sp_name][bent] = st

            # Překrytí pro poddruh
            if sub_name:
                if sub_name not in subspecies_records:
                    subspecies_records[sub_name] = {}
                sub_st = subspecies_records[sub_name].get(bent)
                sub_p = STATUS_PRIORITY.get(sub_st, 0) if sub_st else 0
                if not sub_st or p > sub_p:
                    subspecies_records[sub_name][bent] = st

    print("3/3 Ukládám do SQLite databáze...")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE species_distribution (
            species TEXT NOT NULL,
            bentity TEXT NOT NULL,
            status TEXT NOT NULL,
            rank TEXT NOT NULL,
            PRIMARY KEY (species, bentity)
        )
    """)
    cursor.execute("CREATE INDEX idx_species ON species_distribution (species)")
    cursor.execute("CREATE INDEX idx_rank ON species_distribution (rank)")

    batch = []
    total_rows = 0

    # Uložení mateřských druhů
    for sp, bents in species_records.items():
        for bent, st in bents.items():
            batch.append((sp, bent, st, "species"))
            if len(batch) >= 10000:
                cursor.executemany("INSERT OR REPLACE INTO species_distribution VALUES (?, ?, ?, ?)", batch)
                total_rows += len(batch)
                batch = []

    # Uložení poddruhů
    for sub, bents in subspecies_records.items():
        for bent, st in bents.items():
            batch.append((sub, bent, st, "subspecies"))
            if len(batch) >= 10000:
                cursor.executemany("INSERT OR REPLACE INTO species_distribution VALUES (?, ?, ?, ?)", batch)
                total_rows += len(batch)
                batch = []

    if batch:
        cursor.executemany("INSERT OR REPLACE INTO species_distribution VALUES (?, ?, ?, ?)", batch)
        total_rows += len(batch)

    conn.commit()
    conn.close()

    t1 = time.time()
    size_mb = DB_PATH.stat().st_size / (1024 * 1024)
    print(f"Hotovo za {t1 - t0:.1f} s. Uloženo celkem {total_rows} záznamů.")
    print(f" - Druhů: {len(species_records)}")
    print(f" - Poddruhů: {len(subspecies_records)}")
    print(f"Velikost SQLite databáze: {size_mb:.2f} MB ({DB_PATH})")


if __name__ == "__main__":
    build_database()
