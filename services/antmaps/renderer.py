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

BASE_DIR = Path(__file__).resolve().parent.parent.parent
GEOMETRY_PATH = BASE_DIR / "data" / "bentities_geometry.json"

# Koeficienty Equal Earth projekce (Šavrič, Jenny, Patterson 2018)
A1 = 1.340264
A2 = -0.081106
A3 = 0.000893
A4 = 0.003796# Barvy podle standardu v souladu s Discord dark theme
COLOR_NATIVE = "#8bc34a"          # Zelená (Původní)
COLOR_EXOTIC = "#e53935"          # Červená (Zavlečený – volná příroda)
COLOR_INDOOR = "#ff9800"          # Oranžová (Zavlečený – budovy a skleníky)
COLOR_INTERCEPT = "#ffee55"       # Zářivá citrónová žlutá (Vyžaduje ověření)
COLOR_DUBIOUS = "#ba68c8"         # Levandulově fialová (Chybné)
COLOR_UNRECORDED = "#36393f"      # Tmavě šedá pevnina (žádný výskyt)
COLOR_OCEAN = "#25272b"           # Tmavý oceán uvnitř mapy
COLOR_DISCORD_BG = "#1e1f22"      # Pozadí vnějšího plátna odpovídající Discordu
COLOR_BORDER = "#202225"          # Hranice mezi bentity
COLOR_OUTLINE = "#4f545c"         # Obrys glóbu Equal Earth

_cached_bentities_coords: Optional[List[Tuple[str, List[Tuple[float, float]]]]] = None
_cached_world_outline_pts: Optional[List[Tuple[float, float]]] = None


def project_equal_earth(lon_deg: float, lat_deg: float) -> Tuple[float, float]:
    """Převede zeměpisné souřadnice (lon, lat) do projekce Equal Earth."""
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


def _get_world_outline_coords() -> List[Tuple[float, float]]:
    """Vrátí zaoblený vnější obrys světa v projekci Equal Earth."""
    global _cached_world_outline_pts
    if _cached_world_outline_pts is not None:
        return _cached_world_outline_pts

    pts = []
    # Východní poledník (od jihu k severu)
    for lat in range(-90, 91, 2):
        pts.append(project_equal_earth(180, lat))
    # Západní poledník (od severu k jihu)
    for lat in range(90, -91, -2):
        pts.append(project_equal_earth(-180, lat))

    _cached_world_outline_pts = pts
    return _cached_world_outline_pts


def _load_geometry() -> List[Tuple[str, List[Tuple[float, float]]]]:
    """Načte geometrie bentities a převede je do Equal Earth souřadnic (s cachováním)."""
    global _cached_bentities_coords
    if _cached_bentities_coords is not None:
        return _cached_bentities_coords

    if not GEOMETRY_PATH.exists():
        raise FileNotFoundError(f"Geometrie bentities nebyla nalezena: {GEOMETRY_PATH}")

    with open(GEOMETRY_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    projected_data = []
    for bentity_name, subpolys in data.items():
        for poly_coords in subpolys:
            if len(poly_coords) >= 3:
                proj_coords = [project_equal_earth(pt[0], pt[1]) for pt in poly_coords]
                projected_data.append((bentity_name, proj_coords))

    _cached_bentities_coords = projected_data
    return _cached_bentities_coords


def get_color_for_status(status: Optional[str]) -> str:
    """Vrátí HEX barvu pro daný biogeografický status."""
    if not status:
        return COLOR_UNRECORDED
    st = status.lower().strip()
    if st == "native":
        return COLOR_NATIVE
    elif st in ("established.outdoors", "exotic"):
        return COLOR_EXOTIC
    elif st in ("established.indoors", "indoor"):
        return COLOR_INDOOR
    elif st in ("border.interception", "need_verification"):
        return COLOR_INTERCEPT
    elif st in ("dubious", "erroneous"):
        return COLOR_DUBIOUS
    return COLOR_UNRECORDED


def render_ant_map(
    species_name: str,
    distribution: Dict[str, str],
    figsize: Tuple[int, int] = (12, 6),
    dpi: int = 140,
) -> io.BytesIO:
    """
    Vykreslí mapu světa v projekci Equal Earth s obarvenými bentities podle výskytu druhu.
    Vrací in-memory BytesIO buffer s PNG obrázkem.
    """
    polygons_data = _load_geometry()

    fig, ax = plt.subplots(figsize=figsize, facecolor=COLOR_DISCORD_BG)
    ax.set_facecolor(COLOR_DISCORD_BG)
    # Souřadnicové meze v projekci Equal Earth
    ax.set_xlim(-2.78, 2.78)
    ax.set_ylim(-1.38, 1.38)
    ax.axis("off")

    # 1. Vnější zaoblený obrys a oceán
    outline_pts = _get_world_outline_coords()
    ax.add_patch(
        Polygon(outline_pts, closed=True, facecolor=COLOR_OCEAN, edgecolor=COLOR_OUTLINE, linewidth=0.8)
    )

    # 2. Polygony jednotlivých regionů
    patches_list = []
    colors_list = []

    for bentity_name, coords in polygons_data:
        status = distribution.get(bentity_name)
        color = get_color_for_status(status)
        patches_list.append(Polygon(coords, closed=True))
        colors_list.append(color)

    collection = PatchCollection(
        patches_list,
        facecolors=colors_list,
        edgecolors=COLOR_BORDER,
        linewidths=0.35,
        antialiased=True,
    )
    ax.add_collection(collection)

    # Nápis vpravo nahoře: Equal Earth projection (70% opacity)
    ax.text(
        2.65,
        1.25,
        "Equal Earth projection",
        color="#ffffff",
        alpha=0.7,
        fontsize=8.5,
        va="top",
        ha="right",
    )

    # Titulek v mapě (kurzíva pro vědecký název)
    ax.text(
        -2.65,
        -1.25,
        species_name,
        color="#ffffff",
        fontsize=14,
        fontstyle="italic",
        fontweight="bold",
        va="bottom",
        ha="left",
    )

    # Legenda vpravo dole (5 položek s novými popisky)
    legend_elements = [
        Patch(facecolor=COLOR_NATIVE, edgecolor=COLOR_BORDER, label="Původní"),
        Patch(facecolor=COLOR_EXOTIC, edgecolor=COLOR_BORDER, label="Zavlečený – volná příroda"),
        Patch(facecolor=COLOR_INDOOR, edgecolor=COLOR_BORDER, label="Zavlečený – budovy a skleníky"),
        Patch(facecolor=COLOR_INTERCEPT, edgecolor=COLOR_BORDER, label="Vyžaduje ověření"),
        Patch(facecolor=COLOR_DUBIOUS, edgecolor=COLOR_BORDER, label="Chybné"),
    ]

    legend = ax.legend(
        handles=legend_elements,
        loc="lower right",
        frameon=True,
        facecolor="#2b2d31",
        edgecolor="#1e1f22",
        fontsize=9,
        labelcolor="#dcddde",
    )
    legend.get_frame().set_alpha(0.88)

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


