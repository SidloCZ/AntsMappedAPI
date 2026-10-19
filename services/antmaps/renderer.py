"""
Renderovací modul pro generování map rozšíření mravenců.

Podporuje:
  Projekce:
    - 'equal_earth' (výchozí, stejnoplochá oválná projekce Šavrič et al. 2018)
    - 'plate_carree' / 'cylindrical' (klasická obdélníková válcová 2:1)
    - 'mercator' (konformní Mercatorova projekce)
  Motivy:
    - 'dark' (výchozí, přizpůsobený tmavému režimu Discordu)
    - 'light' (čistý světlý motiv pro publikace a weby)
  Jazyky legendy a popisků:
    - 'en' (výchozí angličtina)
    - 'cs' (čeština)
"""

import io
import json
import math
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, Patch
from matplotlib.collections import PatchCollection

CURRENT_DIR = Path(__file__).resolve().parent
GEOMETRY_PATH = CURRENT_DIR.parent.parent / "data" / "bentities_geometry.json"

# Koeficienty Equal Earth projekce (Šavrič, Jenny, Patterson 2018)
A1 = 1.340264
A2 = -0.081106
A3 = 0.000893
A4 = 0.003796

# ==========================================
# PALETY BAREV (DARK A LIGHT)
# ==========================================
THEMES = {
    "dark": {
        "canvas_bg": "#1e1f22",
        "ocean": "#25272b",
        "unrecorded": "#36393f",
        "border": "#202225",
        "outline": "#4f545c",
        "text": "#ffffff",
        "legend_bg": "#2b2d31",
        "legend_border": "#1e1f22",
        "legend_text": "#dcddde",
        "status": {
            "native": "#8bc34a",
            "established.outdoors": "#e53935",
            "exotic": "#e53935",
            "established.indoors": "#ff9800",
            "indoor": "#ff9800",
            "border.interception": "#ffee55",
            "need_verification": "#ffee55",
            "dubious": "#ba68c8",
            "erroneous": "#ba68c8",
        },
    },
    "light": {
        "canvas_bg": "#ffffff",
        "ocean": "#dcecf7",
        "unrecorded": "#e2e6ea",
        "border": "#bcc2c8",
        "outline": "#8a929a",
        "text": "#1a1d20",
        "legend_bg": "#ffffff",
        "legend_border": "#cfd5db",
        "legend_text": "#2c3035",
        "status": {
            "native": "#43a047",
            "established.outdoors": "#e53935",
            "exotic": "#e53935",
            "established.indoors": "#fb8c00",
            "indoor": "#fb8c00",
            "border.interception": "#fdd835",
            "need_verification": "#fdd835",
            "dubious": "#8e24aa",
            "erroneous": "#8e24aa",
        },
    },
}

# ==========================================
# JAZYKOVÉ VERZE POPISKŮ
# ==========================================
TRANSLATIONS = {
    "en": {
        "equal_earth": "Equal Earth projection",
        "plate_carree": "Plate Carrée projection",
        "mercator": "Mercator projection",
        "status_labels": [
            ("native", "Native"),
            ("established.outdoors", "Introduced (outdoors)"),
            ("established.indoors", "Introduced (indoors)"),
            ("border.interception", "Need verification"),
            ("dubious", "Dubious / erroneous"),
        ],
    },
    "cs": {
        "equal_earth": "Equal Earth projekce",
        "plate_carree": "Plate Carrée projekce",
        "mercator": "Mercatorova projekce",
        "status_labels": [
            ("native", "Původní"),
            ("established.outdoors", "Zavlečený – volná příroda"),
            ("established.indoors", "Zavlečený – budovy a skleníky"),
            ("border.interception", "Vyžaduje ověření"),
            ("dubious", "Chybné / pochybné"),
        ],
    },
}

# In-memory cache pro geometrie v jednotlivých projekcích
_CACHED_GEOMETRIES: Dict[str, List[Tuple[str, List[Tuple[float, float]]]]] = {}
_CACHED_OUTLINES: Dict[str, List[Tuple[float, float]]] = {}
_RAW_GEOMETRY: Optional[dict] = None


# ==========================================
# PROJEKČNÍ ROVNICE
# ==========================================
def project_equal_earth(lon_deg: float, lat_deg: float) -> Tuple[float, float]:
    """Převede (lon, lat) do projekce Equal Earth."""
    lam = math.radians(lon_deg)
    phi = math.radians(lat_deg)
    sin_theta = max(-1.0, min(1.0, (math.sqrt(3.0) / 2.0) * math.sin(phi)))
    theta = math.asin(sin_theta)
    theta2 = theta * theta
    theta6 = theta2 * theta2 * theta2

    denom = 3.0 * (A1 + 3.0 * A2 * theta2 + 7.0 * A3 * theta6 + 9.0 * A4 * theta6 * theta2)
    x = (2.0 * math.sqrt(3.0) * lam * math.cos(theta)) / denom
    y = theta * (A1 + A2 * theta2 + A3 * theta6 + A4 * theta6 * theta2)
    return x, y


def project_plate_carree(lon_deg: float, lat_deg: float) -> Tuple[float, float]:
    """Převede (lon, lat) do válcové projekce Plate Carrée (Equirectangular)."""
    return math.radians(lon_deg), math.radians(lat_deg)


def project_mercator(lon_deg: float, lat_deg: float) -> Tuple[float, float]:
    """Převede (lon, lat) do konformní Mercatorovy projekce (s ořezem pólů)."""
    lat_clamped = max(-84.0, min(84.0, lat_deg))
    x = math.radians(lon_deg)
    y = math.log(math.tan(math.pi / 4.0 + math.radians(lat_clamped) / 2.0))
    return x, y


def _get_projected_geometry(projection_name: str) -> List[Tuple[str, List[Tuple[float, float]]]]:
    """Vrátí předpočítané polygonové souřadnice pro danou projekci s cachováním."""
    global _CACHED_GEOMETRIES, _RAW_GEOMETRY

    proj_key = projection_name.lower().strip()
    if proj_key in ("cylindrical", "equirectangular"):
        proj_key = "plate_carree"

    if proj_key in _CACHED_GEOMETRIES:
        return _CACHED_GEOMETRIES[proj_key]

    if _RAW_GEOMETRY is None:
        if not GEOMETRY_PATH.exists():
            raise FileNotFoundError(f"Geometrie bentities nebyla nalezena: {GEOMETRY_PATH}")
        with open(GEOMETRY_PATH, "r", encoding="utf-8") as f:
            _RAW_GEOMETRY = json.load(f)

    if proj_key == "plate_carree":
        proj_fn = project_plate_carree
    elif proj_key == "mercator":
        proj_fn = project_mercator
    else:
        proj_fn = project_equal_earth

    projected_data = []
    for bentity_name, subpolys in _RAW_GEOMETRY.items():
        for poly_coords in subpolys:
            if len(poly_coords) >= 3:
                proj_coords = [proj_fn(pt[0], pt[1]) for pt in poly_coords]
                projected_data.append((bentity_name, proj_coords))

    _CACHED_GEOMETRIES[proj_key] = projected_data
    return projected_data


def _get_outline_coords(projection_name: str) -> List[Tuple[float, float]]:
    """Vrátí vnější obrys oceánu pro danou projekci."""
    global _CACHED_OUTLINES
    proj_key = projection_name.lower().strip()
    if proj_key in ("cylindrical", "equirectangular"):
        proj_key = "plate_carree"

    if proj_key in _CACHED_OUTLINES:
        return _CACHED_OUTLINES[proj_key]

    if proj_key == "plate_carree":
        pi = math.pi
        pts = [(-pi, -pi / 2), (pi, -pi / 2), (pi, pi / 2), (-pi, pi / 2)]
    elif proj_key == "mercator":
        pi = math.pi
        max_y = math.log(math.tan(math.pi / 4.0 + math.radians(84.0) / 2.0))
        pts = [(-pi, -max_y), (pi, -max_y), (pi, max_y), (-pi, max_y)]
    else:  # equal_earth
        pts = []
        for lat in range(-90, 91, 2):
            pts.append(project_equal_earth(180, lat))
        for lat in range(90, -91, -2):
            pts.append(project_equal_earth(-180, lat))

    _CACHED_OUTLINES[proj_key] = pts
    return pts


# ==========================================
# HLAVNÍ RENDEROVACÍ FUNKCE
# ==========================================
def render_ant_map(
    species_name: str,
    distribution: Dict[str, str],
    projection: str = "equal_earth",
    theme: str = "dark",
    lang: str = "en",
    figsize: Tuple[int, int] = (12, 6),
    dpi: int = 140,
) -> io.BytesIO:
    """
    Vykreslí mapu světa rozšíření taxonu s podporou více projekcí, motivů a jazyků.

    Parametry:
      species_name: Vědecký název druhu / poddruhu / rodu
      distribution: Slovník {bentity_name: status}
      projection: 'equal_earth' (výchozí), 'plate_carree' (válcová), 'mercator'
      theme: 'dark' (výchozí pro Discord), 'light' (světlý)
      lang: 'en' (výchozí angličtina), 'cs' (čeština)
      figsize: Rozměr plátna v palcích
      dpi: Rozlišení výstupního PNG
    """
    proj_key = projection.lower().strip()
    if proj_key in ("cylindrical", "equirectangular"):
        proj_key = "plate_carree"
    if proj_key not in ("equal_earth", "plate_carree", "mercator"):
        proj_key = "equal_earth"

    theme_data = THEMES.get(theme.lower().strip(), THEMES["dark"])
    lang_data = TRANSLATIONS.get(lang.lower().strip(), TRANSLATIONS["en"])

    polygons_data = _get_projected_geometry(proj_key)

    fig, ax = plt.subplots(figsize=figsize, facecolor=theme_data["canvas_bg"])
    ax.set_facecolor(theme_data["canvas_bg"])

    # Nastavení souřadnicových limitů
    if proj_key == "plate_carree":
        pi = math.pi
        ax.set_xlim(-pi - 0.05, pi + 0.05)
        ax.set_ylim(-pi / 2 - 0.05, pi / 2 + 0.05)
        text_x_proj, text_y_proj = pi - 0.1, pi / 2 - 0.15
        text_x_title, text_y_title = -pi + 0.1, -pi / 2 + 0.15
    elif proj_key == "mercator":
        pi = math.pi
        max_y = math.log(math.tan(math.pi / 4.0 + math.radians(84.0) / 2.0))
        ax.set_xlim(-pi - 0.05, pi + 0.05)
        ax.set_ylim(-max_y - 0.05, max_y + 0.05)
        text_x_proj, text_y_proj = pi - 0.1, max_y - 0.2
        text_x_title, text_y_title = -pi + 0.1, -max_y + 0.2
    else:  # equal_earth
        ax.set_xlim(-2.78, 2.78)
        ax.set_ylim(-1.38, 1.38)
        text_x_proj, text_y_proj = 2.65, 1.25
        text_x_title, text_y_title = -2.65, -1.25

    ax.axis("off")

    # 1. Oceán a obrys mapy
    outline_pts = _get_outline_coords(proj_key)
    ax.add_patch(
        Polygon(
            outline_pts,
            closed=True,
            facecolor=theme_data["ocean"],
            edgecolor=theme_data["outline"],
            linewidth=0.8,
        )
    )

    # 2. Polygony jednotlivých regionů
    patches_list = []
    colors_list = []
    status_palette = theme_data["status"]
    unrecorded_color = theme_data["unrecorded"]

    for bentity_name, coords in polygons_data:
        raw_status = distribution.get(bentity_name)
        color = status_palette.get(raw_status.lower().strip(), unrecorded_color) if raw_status else unrecorded_color
        patches_list.append(Polygon(coords, closed=True))
        colors_list.append(color)

    collection = PatchCollection(
        patches_list,
        facecolors=colors_list,
        edgecolors=theme_data["border"],
        linewidths=0.35,
        antialiased=True,
    )
    ax.add_collection(collection)

    # 3. Označení projekce vpravo nahoře
    proj_title = lang_data.get(proj_key, "Equal Earth projection")
    ax.text(
        text_x_proj,
        text_y_proj,
        proj_title,
        color=theme_data["text"],
        alpha=0.68,
        fontsize=8.5,
        va="top",
        ha="right",
    )

    # 4. Vědecký název vlevo dole (kurzíva)
    ax.text(
        text_x_title,
        text_y_title,
        species_name,
        color=theme_data["text"],
        fontsize=14,
        fontstyle="italic",
        fontweight="bold",
        va="bottom",
        ha="left",
    )

    # 5. Legenda vpravo dole
    legend_elements = [
        Patch(
            facecolor=status_palette[st_key],
            edgecolor=theme_data["border"],
            label=label_text,
        )
        for st_key, label_text in lang_data["status_labels"]
    ]

    legend = ax.legend(
        handles=legend_elements,
        loc="lower right",
        frameon=True,
        facecolor=theme_data["legend_bg"],
        edgecolor=theme_data["legend_border"],
        fontsize=9,
        labelcolor=theme_data["legend_text"],
    )
    legend.get_frame().set_alpha(0.90)

    plt.subplots_adjust(left=0, right=1, top=1, bottom=0)

    buffer = io.BytesIO()
    plt.savefig(
        buffer,
        format="png",
        dpi=dpi,
        facecolor=fig.get_facecolor(),
        edgecolor="none",
        bbox_inches="tight",
        pad_inches=0.03,
    )
    plt.close(fig)
    buffer.seek(0)
    return buffer
