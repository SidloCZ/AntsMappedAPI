import json
import sqlite3
from pathlib import Path
from typing import Dict, Optional

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
SQLITE_DB_PATH = DATA_DIR / "ant_distribution.db"
TEST_JSON_PATH = DATA_DIR / "test_species_distribution.json"

_cached_test_data: Optional[Dict[str, Dict[str, str]]] = None


def _normalize_name(name: str) -> str:
    """Normalizuje název taxonu na formát 'Genus species' nebo 'Genus species subspecies'."""
    clean = name.strip().replace(".", " ").replace("_", " ")
    parts = clean.split()
    if len(parts) >= 3:
        return f"{parts[0].capitalize()} {parts[1].lower()} {parts[2].lower()}"
    elif len(parts) == 2:
        return f"{parts[0].capitalize()} {parts[1].lower()}"
    elif len(parts) == 1:
        return parts[0].capitalize()
    return name.strip()


STATUS_PRIORITY: Dict[str, int] = {
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


def get_species_distribution(species_name: str) -> Optional[Dict[str, str]]:
    """
    Vrátí slovník {bentity_name: status} pro daný druh.
    Pokud data nejsou k dispozici, vrátí None.
    """
    global _cached_test_data
    normalized = _normalize_name(species_name)

    # 1. Zkusit SQLite databázi, pokud existuje
    if SQLITE_DB_PATH.exists():
        try:
            with sqlite3.connect(SQLITE_DB_PATH) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT bentity, status FROM species_distribution WHERE species = ?",
                    (normalized,),
                )
                rows = cursor.fetchall()
                if rows:
                    return {row[0]: row[1] for row in rows}
        except Exception as e:
            print(f"[AntMaps DB] Chyba při čtení SQLite: {e}")

    # 2. Zkusit testovací JSON fallback
    if _cached_test_data is None and TEST_JSON_PATH.exists():
        try:
            with open(TEST_JSON_PATH, "r", encoding="utf-8") as f:
                _cached_test_data = json.load(f)
        except Exception as e:
            print(f"[AntMaps DB] Chyba při načítání testovacího JSON: {e}")
            _cached_test_data = {}

    if _cached_test_data and normalized in _cached_test_data:
        return _cached_test_data[normalized]

    return None


def get_genus_distribution(genus_name: str) -> Optional[Dict[str, str]]:
    """
    Vrátí agregovaný slovník {bentity_name: status} pro daný rod mravenců.
    Při výskytu více záznamů pro tentýž region je vybrán status s nejvyšší prioritou:
    native > established.outdoors > established.indoors > border.interception > dubious.
    """
    global _cached_test_data
    normalized_genus = genus_name.strip().split()[0].capitalize()

    # 1. Zkusit SQLite databázi
    if SQLITE_DB_PATH.exists():
        try:
            with sqlite3.connect(SQLITE_DB_PATH) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT bentity, status FROM species_distribution WHERE species >= ? AND species <= ?",
                    (f"{normalized_genus} ", f"{normalized_genus} \uffff"),
                )
                rows = cursor.fetchall()
                if rows:
                    distribution: Dict[str, str] = {}
                    for bentity, status in rows:
                        p = STATUS_PRIORITY.get(status, 0)
                        current_status = distribution.get(bentity)
                        current_p = STATUS_PRIORITY.get(current_status, 0) if current_status else 0
                        if bentity not in distribution or p > current_p:
                            distribution[bentity] = status
                    return distribution
        except Exception as e:
            print(f"[AntMaps DB] Chyba při čtení SQLite pro rod: {e}")

    # 2. Zkusit testovací JSON fallback
    if _cached_test_data is None and TEST_JSON_PATH.exists():
        try:
            with open(TEST_JSON_PATH, "r", encoding="utf-8") as f:
                _cached_test_data = json.load(f)
        except Exception as e:
            print(f"[AntMaps DB] Chyba při načítání testovacího JSON: {e}")
            _cached_test_data = {}

    if _cached_test_data:
        prefix = f"{normalized_genus} "
        distribution = {}
        for sp_name, bentities in _cached_test_data.items():
            if sp_name.startswith(prefix):
                for bentity, status in bentities.items():
                    p = STATUS_PRIORITY.get(status, 0)
                    current_status = distribution.get(bentity)
                    current_p = STATUS_PRIORITY.get(current_status, 0) if current_status else 0
                    if bentity not in distribution or p > current_p:
                        distribution[bentity] = status
        if distribution:
            return distribution

    return None


def is_distribution_available(species_name: str) -> bool:
    """Ověří, zda existují distribuční data pro daný druh."""
    return get_species_distribution(species_name) is not None


def is_genus_distribution_available(genus_name: str) -> bool:
    """Ověří, zda existují distribuční data pro daný rod."""
    return get_genus_distribution(genus_name) is not None
