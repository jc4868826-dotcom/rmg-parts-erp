#!/usr/bin/env python3
"""
Importa LISTA DE PRECIOS.xlsx al backend RMG vía POST /api/lista-precios/import
"""
import sys, json, math
import urllib.request, urllib.error
import pandas as pd

EXCEL_PATH = "/Users/juancarloscontreras/Desktop/RMG_Parts_Project/LISTA DE PRECIOS.xlsx"
API_BASE   = "https://rmg-parts-erp.onrender.com"
EMAIL      = "admin@rmgautoparts.cl"
PASSWORD   = "rmg2026"

# ─── 1. Login ────────────────────────────────────────────────────────────────
def login():
    payload = json.dumps({"email": EMAIL, "password": PASSWORD}).encode()
    req = urllib.request.Request(
        f"{API_BASE}/api/auth/login",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())["token"]

# ─── 2. Leer y transformar Excel ─────────────────────────────────────────────
def read_excel():
    df = pd.read_excel(EXCEL_PATH, sheet_name=0)
    # Quitar filas sin SKU
    df = df[df["Codigo SKU"].notna()].copy()
    df["Codigo SKU"] = df["Codigo SKU"].astype(str).str.strip()
    df = df[df["Codigo SKU"] != ""]

    items = []
    for _, row in df.iterrows():
        def v(col):
            val = row.get(col)
            return None if (val is None or (isinstance(val, float) and math.isnan(val))) else val

        items.append({
            "segmento_negocio":  v("Segmento Negocio"),
            "prioridad_consumo": v("Prioridad de Consumo"),
            "categoria":         v("Categoria"),
            "producto_generico": v("Producto Generico RMG"),
            "proveedor":         v("Proveedor"),
            "marca":             v("Marca"),
            "ranking_compra":    v("Ranking Compra (1 = Mejor Costo)"),
            "codigo_sku":        str(row["Codigo SKU"]),
            "descripcion":       v("Descripcion Producto Original"),
            "presentacion":      v("Presentacion (Volumen/Peso)"),
            "tipo_envase":       v("TIPO DE ENVASE"),
            "unidades_por_pack": v("Unidades por Caja/Pack"),
            "costo_compra":      v("COSTO COMPRA"),
            "precio_venta":      v("PRECIO VTA"),
            "margen_clp":        v("Margen RMG ($)"),
        })

    print(f"Filas leídas del Excel: {len(items)}")
    skus_unicos = len({i["codigo_sku"] for i in items})
    print(f"SKUs únicos: {skus_unicos}")
    return items

# ─── 3. Llamar endpoint ───────────────────────────────────────────────────────
def do_import(token, items):
    payload = json.dumps({"items": items}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{API_BASE}/api/lista-precios/import",
        data=payload,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"HTTP {e.code}: {body}")
        sys.exit(1)

# ─── Main ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("1. Login...")
    token = login()
    print(f"   Token OK ({token[:20]}...)")

    print("2. Leyendo Excel...")
    items = read_excel()

    print("3. Enviando al backend...")
    result = do_import(token, items)
    print(f"   Resultado: {result}")
    print()
    if result.get("ok"):
        print(f"✅ Import exitoso — {result['inserted']} filas insertadas")
        print(f"   Stock preservado para {result['stockPreserved']} SKUs")
    else:
        print("❌ Error en import:", result)
