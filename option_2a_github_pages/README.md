# Možnost 2A: Veřejné statické API na GitHubu (GitHub Pages & jsDelivr CDN)

Tato složka slouží k vytvoření statického API pro komunitu bez nutnosti platit a spravovat jakýkoliv server.

## Jak to funguje

1. Spusťte `python export_static_api.py`.
2. Do složky `dist_api/api/v1/` se vygenerují strukturované JSON soubory pro jednotlivé druhy.
3. Obsah složky `dist_api/` (nebo celý samostatný repozitář) nahrajte na GitHub do nové repository, např. `ant-distribution-api`.

## Jak k datům přistupovat z jakéhokoliv bota

Díky bezplatné síti **jsDelivr CDN** (nebo GitHub Pages) má každý soubor v repozitáři své přímé, bleskově rychlé globální URL:

```text
https://cdn.jsdelivr.net/gh/<VaseUzivatelskeJmeno>/<NazevRepo>@main/api/v1/species/Lasius_niger.json
```

Příklad odpovědi:
```json
{
  "species": "Lasius niger",
  "regions": {
    "Czech Republic": "native",
    "Slovakia": "native",
    "Alabama": "established.outdoors"
  }
}
```

Tento endpoint neklade žádné rate-limity a nepoužívá žádný Cloudflare bot challenge.
