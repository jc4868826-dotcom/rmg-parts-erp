#!/usr/bin/env python3
"""CAMBIO 1 — Crear subfamilias de transmisión y reasignar productos."""
import requests
import time

BASE     = "https://rmg-parts-erp.onrender.com"
EMAIL    = "admin@rmgautoparts.cl"
PASSWORD = "rmg2026"

def req(method, url, **kwargs):
    """Request with 502 retry logic."""
    for attempt in range(5):
        r = requests.request(method, url, timeout=60, **kwargs)
        if r.status_code != 502:
            return r
        print(f"    502 → esperando 5s y reintentando (intento {attempt+1}/5)...")
        time.sleep(5)
    return r

# ── Wake server ─────────────────────────────────────────────────────────────
print("Despertando servidor (puede tardar ~30s)...")
for _ in range(3):
    try:
        r = requests.get(f"{BASE}/api/public/landing/subfamilias", timeout=90)
        print(f"  {r.status_code}")
        if r.status_code == 200:
            break
    except Exception as e:
        print(f"  {e}")
    time.sleep(3)

print("Esperando que el servidor esté completamente listo...")
time.sleep(8)

# ── Login ────────────────────────────────────────────────────────────────────
print("Autenticando...")
r = req("POST", f"{BASE}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD})
r.raise_for_status()
token = r.json()["token"]
HDR   = {"Authorization": f"Bearer {token}"}
print("  OK")

# ── Actualizar orden de subfamilias existentes ───────────────────────────────
print("\nActualizando orden de subfamilias existentes...")
for sf_id, orden in [(12, "1"), (13, "3")]:
    r = req("PUT", f"{BASE}/api/admin/landing/subfamilias/{sf_id}",
            data={"orden": orden}, headers=HDR)
    print(f"  id={sf_id} → orden={orden}: {r.status_code}")
    time.sleep(0.5)

# ── Crear subfamilia "Autos y SUV · Transmisión" ─────────────────────────────
print("\nCreando 'Autos y SUV · Transmisión'...")
r = req("POST", f"{BASE}/api/admin/landing/subfamilias",
        data={
            "familia":     "LUBRICANTES",
            "nombre":      "Autos y SUV · Transmisión",
            "descripcion": "Fluidos de transmisión para autos y SUV",
            "orden":       "2",
            "activo":      "1",
        }, headers=HDR)
print(f"  {r.status_code}: {r.text[:200]}")
data = r.json()
sub_auto_trans_id = data.get("id") or (data.get("subfamilia") or {}).get("id")
print(f"  → id={sub_auto_trans_id}")
time.sleep(1)

# ── Crear subfamilia "Buses y Camiones · Transmisión" ────────────────────────
print("\nCreando 'Buses y Camiones · Transmisión'...")
r = req("POST", f"{BASE}/api/admin/landing/subfamilias",
        data={
            "familia":     "LUBRICANTES",
            "nombre":      "Buses y Camiones · Transmisión",
            "descripcion": "Fluidos de transmisión para buses y camiones",
            "orden":       "4",
            "activo":      "1",
        }, headers=HDR)
print(f"  {r.status_code}: {r.text[:200]}")
data = r.json()
sub_bus_trans_id = data.get("id") or (data.get("subfamilia") or {}).get("id")
print(f"  → id={sub_bus_trans_id}")
time.sleep(1)

# ── Reasignar productos a "Autos y SUV · Transmisión" ────────────────────────
print(f"\nReasignando prods 34,35 → subfamilia {sub_auto_trans_id}...")
for prod_id in [34, 35]:
    r = req("PUT", f"{BASE}/api/admin/landing/productos/{prod_id}",
            data={"subfamilia_id": str(sub_auto_trans_id)}, headers=HDR)
    print(f"  prod {prod_id}: {r.status_code}")
    time.sleep(0.5)

# ── Reasignar productos a "Buses y Camiones · Transmisión" ───────────────────
print(f"\nReasignando prods 36,37,38,39 → subfamilia {sub_bus_trans_id}...")
for prod_id in [36, 37, 38, 39]:
    r = req("PUT", f"{BASE}/api/admin/landing/productos/{prod_id}",
            data={"subfamilia_id": str(sub_bus_trans_id)}, headers=HDR)
    print(f"  prod {prod_id}: {r.status_code}")
    time.sleep(0.5)

# ── Verificar resultado final ────────────────────────────────────────────────
print("\nVerificando subfamilias finales de LUBRICANTES...")
r = req("GET", f"{BASE}/api/public/landing/subfamilias")
subs = r.json()
lub_subs = [s for s in subs if s.get("familia") == "LUBRICANTES"]
lub_subs.sort(key=lambda s: (s.get("orden") or 0, s.get("id", 0)))
for s in lub_subs:
    cnt = sum(1 for _ in [])  # placeholder
    print(f"  id={s['id']} orden={s.get('orden')} → {s['nombre']}")

print("\n✓ CAMBIO 1 completado.")
