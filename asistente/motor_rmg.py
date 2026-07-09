import json
import os
import pandas as pd

# ─── Catálogo de ingeniería: cargado UNA sola vez al importar el módulo ────────
_DF_ING = None

def _load_ing():
    """Carga y cachea el catálogo de ingeniería al startup.

    Lee catalogo_ingenieria.json (archivo comprometido en git → presente en Render).
    Si no existe el JSON, intenta RMG_Catalogo_Ingenieria.xlsx como fallback local.
    El JSON ya viene pre-ordenado por longitud de Artículo desc (match más
    específico gana: 'AUSTER MAXFORCE 15W40 CK-4' antes que 'AUSTER')."""
    global _DF_ING
    if _DF_ING is not None:
        return _DF_ING

    base = os.path.dirname(os.path.abspath(__file__))

    # ── Opción 1: JSON comprometido en git (producción) ──────────────────────
    json_path = os.path.join(base, 'catalogo_ingenieria.json')
    if os.path.exists(json_path):
        try:
            with open(json_path, encoding='utf-8') as f:
                records = json.load(f)
            df = pd.DataFrame(records)
            # Ordenar por longitud desc para que el match más específico gane
            df = df.sort_values(by='Artículo', key=lambda s: s.str.len(), ascending=False).reset_index(drop=True)
            _DF_ING = df
            print(f'[motor_rmg] Catálogo de ingeniería (JSON): {len(_DF_ING)} artículos cargados')
            return _DF_ING
        except Exception as e:
            print(f'[motor_rmg] Error leyendo JSON: {e}')

    # ── Opción 2: xlsx local (desarrollo) ────────────────────────────────────
    xlsx_path = os.path.join(base, 'RMG_Catalogo_Ingenieria.xlsx')
    if not os.path.exists(xlsx_path):
        print('[motor_rmg] Catálogo de ingeniería no encontrado — enriquecimiento deshabilitado')
        return None
    try:
        df = pd.read_excel(xlsx_path)
        df = df[df['Artículo'].notna()].copy()
        df['Artículo'] = df['Artículo'].astype(str).str.upper().str.strip()
        df = df.sort_values(by='Artículo', key=lambda s: s.str.len(), ascending=False).reset_index(drop=True)
        _DF_ING = df
        print(f'[motor_rmg] Catálogo de ingeniería (xlsx): {len(_DF_ING)} artículos cargados')
    except Exception as e:
        print(f'[motor_rmg] Error cargando xlsx: {e}')
    return _DF_ING


def enriquecer_descripcion(desc_original, df_ing=None):
    """Match parcial: busca si algún Artículo del catálogo de ingeniería aparece
    como subcadena de la descripción del producto. Devuelve HTML enriquecido si
    hay match, o la descripción original intacta si no hay.

    Los campos vacíos o nan se reemplazan por 'No especificada por proveedor'
    en lugar de dejarse en blanco o delegarse al LLM."""
    if df_ing is None:
        df_ing = _load_ing()
    if df_ing is None:
        return str(desc_original)
    desc_upper = str(desc_original).upper()
    # df_ing ya está ordenado por longitud desc → primer hit es el más específico
    mask = df_ing['Artículo'].apply(lambda x: len(x) > 3 and x in desc_upper)
    match = df_ing[mask]
    if match.empty:
        return str(desc_original)
    row = match.iloc[0]
    comp_raw = str(row.get('Composición (Ingeniería)', ''))
    res_raw  = str(row.get('Resistencia Técnica / Aplicación', ''))
    comp  = comp_raw if comp_raw and comp_raw != 'nan' else 'No especificada por proveedor'
    aplic = res_raw  if res_raw  and res_raw  != 'nan' else 'No especificada por proveedor'
    return f"{desc_original}<br>• <b>Comp:</b> {comp}<br>• <b>Aplicación:</b> {aplic}"


def enriquecer_df(df_precios):
    """Precalcula 'Descripcion_Enriquecida' sobre todo el DF de precios.
    Debe llamarse UNA vez al construir/refrescar el cache, no por consulta."""
    df_ing = _load_ing()
    col_desc = (
        'Descripcion Producto Original'
        if 'Descripcion Producto Original' in df_precios.columns
        else df_precios.columns[1]
    )
    df = df_precios.copy()
    df['Descripcion_Enriquecida'] = df[col_desc].apply(
        lambda d: enriquecer_descripcion(d, df_ing)
    )
    return df


# Cargar al importar el módulo (startup del servidor)
_load_ing()


def deducir_y_buscar_360(query, client, df_precios):
    prompt_ia = f"""
    Eres un ingeniero mecánico automotriz e industrial y director comercial B2B. Analiza el input: "{query}"

    Devuelve ÚNICAMENTE un objeto JSON estrictamente válido con esta estructura:
    {{
        "nombre_rubro": "Nombre formal del cliente o flota",
        "parque_deducido": "Vehículos o maquinaria exacta que operan",
        "dolor_critico": "Dolor operativo y mecánico principal",
        "segmento_mecanico": "LIVIANO" | "COMERCIAL_LIVIANO" | "REPARTO_MEDIO_PESADO" | "MAQUINARIA_MINERIA",
        "escala_detectada": "CHICA" | "GRANDE" | "DESCONOCIDA",
        "justificacion_escala": "Explicación de la escala y formato de envase",
        "envases_validos": ["Galon", "Balde", "Tambor", "Unidad"],
        "insumos_necesarios": [
            {{"rol": "Aceite de Motor / Transmisión", "pilar": "🛢️ LUBRICANTES", "keywords": ["15W40", "5W30", "10W40", "FORZA", "ATTOM", "AUSTER"]}},
            {{"rol": "Grasa Chasis / Rodamientos", "pilar": "⚙️ GRASAS", "keywords": ["EP-2", "LITHIUM", "MOLIBDENO", "COMPLEX"]}},
            {{"rol": "Batería Cabina / Arranque", "pilar": "🔋 BATERÍAS", "keywords": ["100AMP", "120AMP", "N100", "75AMP", "90AMP", "85D26L", "YOKO", "PLATIN"]}},
            {{"rol": "Neumático Comercial / Carga", "pilar": "🔘 NEUMÁTICOS", "keywords": ["R17.5", "R22.5", "R16", "R15", "DOUBLE STAR", "KUMHO"]}},
            {{"rol": "Refrigerante Radiador / OAT", "pilar": "🧪 QUÍMICOS", "keywords": ["COOLANT", "ICE FREEZE", "ORGANIC", "NOAT"]}}
        ]
    }}
    REGLAS DE CLASIFICACIÓN DE SEGMENTO MECÁNICO:
    1. LIVIANO: Autos particulares, sedanes, city cars.
    2. COMERCIAL_LIVIANO: Furgones escolares, camionetas 4x4, Sprinter, H1, utilitarios livianos.
    3. REPARTO_MEDIO_PESADO: Camiones repartidores de gas, camiones 3/4, camiones rígidos urbanos/interurbanos, flotas de camiones.
    4. MAQUINARIA_MINERIA: Grúas telescópicas, excavadoras, cargadores frontales, camiones tolva pesados, áridos.

    REGLAS DE ESCALA:
    - Si no menciona cantidades ni tamaño del negocio, pon "escala_detectada": "DESCONOCIDA".
    - Si menciona 1 a 5 unidades, pon "CHICA". Si menciona 6 o más, pon "GRANDE".
    """

    try:
        resp = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt_ia}],
            temperature=0.1,
            response_format={"type": "json_object"}
        )
        data_ia = json.loads(resp.choices[0].message.content)
    except Exception:
        data_ia = {
            "nombre_rubro": "Flota Comercial B2B",
            "parque_deducido": "Vehículos o maquinaria comercial.",
            "dolor_critico": "Mantenimiento preventivo continuo.",
            "segmento_mecanico": "REPARTO_MEDIO_PESADO",
            "escala_detectada": "CHICA",
            "justificacion_escala": "Escala estándar.",
            "envases_validos": ["Galon", "Balde", "Unidad"],
            "insumos_necesarios": []
        }

    df_w = df_precios.copy()
    col_sku  = 'Codigo SKU' if 'Codigo SKU' in df_w.columns else df_w.columns[7]
    col_desc = 'Descripcion Producto Original' if 'Descripcion Producto Original' in df_w.columns else df_w.columns[8]
    col_env  = 'TIPO DE ENVASE' if 'TIPO DE ENVASE' in df_w.columns else df_w.columns[10]
    col_cat  = 'Categoria' if 'Categoria' in df_w.columns else df_w.columns[2]
    col_marca = 'Marca' if 'Marca' in df_w.columns else df_w.columns[5]
    col_precio = 'Precio Venta RMG X ENVASE (+30% Neto)' if 'Precio Venta RMG X ENVASE (+30% Neto)' in df_w.columns else df_w.columns[14]
    # Usa descripción enriquecida si ya fue precalculada por enriquecer_df()
    col_desc_enr = 'Descripcion_Enriquecida' if 'Descripcion_Enriquecida' in df_w.columns else col_desc

    df_w['_p_num'] = pd.to_numeric(df_w[col_precio], errors='coerce').fillna(0)
    df_w = df_w[df_w['_p_num'] > 1000].copy()

    seg = data_ia.get("segmento_mecanico", "REPARTO_MEDIO_PESADO")
    tabla_out = "| ¿Qué insumo necesita? | Pilar 360° RMG | Marca | SKU Real | Descripción Original RMG | Envase / UM | Precio (+30% Neto) |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n"
    skus_vistos = set()

    for item in data_ia.get("insumos_necesarios", []):
        sub = df_w.copy()

        if "NEUMÁTICOS" in item["pilar"]:
            sub = sub[sub[col_cat].astype(str).str.contains("Neuma", case=False, na=False)]
            if seg == "LIVIANO":
                sub = sub[sub[col_desc].astype(str).str.contains("R13|R14|R15", case=False, na=False) & (sub['_p_num'] < 65000)]
            elif seg == "COMERCIAL_LIVIANO":
                sub = sub[sub[col_desc].astype(str).str.contains("R16|R15C", case=False, na=False) & (sub['_p_num'] >= 38000) & (sub['_p_num'] < 120000)]
            elif seg == "REPARTO_MEDIO_PESADO":
                sub = sub[sub[col_desc].astype(str).str.contains("R17.5|R19.5|R22.5", case=False, na=False) & (sub['_p_num'] >= 90000)]
            elif seg == "MAQUINARIA_MINERIA":
                sub = sub[sub[col_desc].astype(str).str.contains("1200 R24|R22.5|OTR", case=False, na=False) & (sub['_p_num'] >= 180000)]
        elif "BATERÍAS" in item["pilar"]:
            sub = sub[sub[col_cat].astype(str).str.contains("Bateria", case=False, na=False)]
            if seg == "LIVIANO":
                sub = sub[(sub['_p_num'] >= 35000) & (sub['_p_num'] < 60000)]
            elif seg == "COMERCIAL_LIVIANO":
                sub = sub[(sub['_p_num'] >= 55000) & (sub['_p_num'] <= 98000)]
            elif seg == "REPARTO_MEDIO_PESADO":
                sub = sub[(sub['_p_num'] >= 95000) & (sub['_p_num'] <= 150000)]
            elif seg == "MAQUINARIA_MINERIA":
                sub = sub[(sub['_p_num'] >= 130000)]
        else:
            mask_spec = pd.Series(False, index=sub.index)
            for kw in item["keywords"]:
                if len(str(kw)) >= 2:
                    mask_spec = mask_spec | sub[col_desc].astype(str).str.upper().str.contains(str(kw).upper(), na=False)
            sub = sub[mask_spec]

            mask_env = pd.Series(False, index=sub.index)
            for env in data_ia.get("envases_validos", ["Galon", "Balde", "Unidad"]):
                mask_env = mask_env | sub[col_env].astype(str).str.upper().str.contains(str(env).upper(), na=False)
            if not sub[mask_env].empty:
                sub = sub[mask_env]

        sub = sub.sort_values('_p_num')
        for _, row in sub.iterrows():
            sku = str(row[col_sku]).split('.')[0]
            if sku in skus_vistos:
                continue
            skus_vistos.add(sku)
            marca = str(row[col_marca]) if pd.notna(row[col_marca]) else "Vistony"
            p_fmt = f"${row['_p_num']:,.0f} CLP".replace(',', '.')
            # Descripción ya enriquecida por enriquecer_df() al cargar el cache
            desc_final = str(row[col_desc_enr])
            tabla_out += f"| **{item['rol']}** | {item['pilar']} | **{marca}** | `{sku}` | {desc_final} | {row[col_env]} | **{p_fmt}** |\n"
            break

    return tabla_out, data_ia
