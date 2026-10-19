# Možnost 2B: Dynamické Image API (FastAPI)

Tato složka obsahuje mikroserver postavený na FastAPI, který na požádání generuje a servíruje PNG mapy.

## Jak to funguje

Ostatní boti v Discordu mohou přímo do embedu vložit odkaz na váš server:
```python
embed.set_image(url="https://vase-api.com/map/Lasius_niger.png")
```
Discord si obrázek stáhne a uloží do své interní cache.

## Lokální spuštění

```bash
pip install fastapi uvicorn
python api_server.py
```

Dokumentace Swagger UI bude k dispozici na: `http://localhost:8000/docs`

## Bezplatné nasazení do cloudu

Tento kód lze nasadit na:
- **Render.com** (zdarma web service)
- **Fly.io** nebo **Koyeb**
- **Vlastní VPS** (např. Hetzner, kde již možná běží váš bot)
