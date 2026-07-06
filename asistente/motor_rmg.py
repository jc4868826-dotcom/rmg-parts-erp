import json
import pandas as pd

def deducir_y_buscar_360(query, client, df_precios):
    prompt_ia = f"""
    Eres un clasificador B2B experto para RMG Parts Chile. Analiza: "{query}"

    Devuelve ÚNICAMENTE un objeto JSON estrictamente válido con esta estructura:
    {{
        "nombre_rubro": "Nombre formal del cliente o flota",
        "parque_deducido": "Descripción de lo que opera o distribuye",
        "dolor_critico": "Dolor operativo o comercial principal",
        "tipo_cliente": "FLOTA" | "DISTRIBUIDOR" | "TALLER" | "TIENDA",
        "segmento_mecanico": "LIVIANO" | "COMERCIAL_LIVIANO" | "REPARTO_MEDIO_PESADO" | "MAQUINARIA_MINERIA",
        "escala_detectada": "CHICA" | "GRANDE" | "DESCONOCIDA",
        "justificacion_escala": "Explicación de la escala",
        "modelo_especificado": true,
        "pregunta_modelo": null,
        "envases_validos": ["Galon", "Balde", "Tambor", "Unidad"],
        "insumos_necesarios": [...]
    }}

    REGLA PARA tipo_cliente:
    - FLOTA: constructora, minera, transportista, agrícola — tiene equipos propios
    - DISTRIBUIDOR: distribuye/revende productos a terceros, mayorista, catalogo
    - TALLER: repara o hace mantenimiento a vehículos de terceros
    - TIENDA: vende al mostrador, retail de repuestos

    REGLA PARA insumos_necesarios SEGÚN tipo_cliente:

    Si tipo_cliente = FLOTA:
    Lista los insumos de mantenimiento de sus equipos. Ejemplo:
    [
        {{"rol": "Aceite de Motor", "pilar": "🛢️ LUBRICANTES:MOTOR", "keywords": ["15W40","10W40","5W30","CK-4","MAXFORCE","MAXTECH"]}},
        {{"rol": "Aceite Hidráulico", "pilar": "🛢️ LUBRICANTES:HIDRAULICO", "keywords": ["HYDRO","HIDRAUL","ISO 46","ISO 68","AW 46","AW 68"]}},
        {{"rol": "Grasa Multipropósito", "pilar": "⚙️ GRASAS", "keywords": ["EP-2 LITHIUM","MULTIPROPOSITO","MULTIPURPOSE","LITIO"]}},
        {{"rol": "Batería", "pilar": "🔋 BATERÍAS", "keywords": ["100AMP","120AMP","N100","75AMP"]}},
        {{"rol": "Neumático", "pilar": "🔘 NEUMÁTICOS", "keywords": ["R17.5","R22.5","R16","1200 R24"]}},
        {{"rol": "Refrigerante / DEF", "pilar": "🧪 REFRIGERANTES", "keywords": ["COOLANT","ANTIFREEZE","AIRBLUE","DEF","UREA","ICE"]}}
    ]
    Para maquinaria pesada (MAQUINARIA_MINERIA) incluye siempre Aceite Hidráulico.

    Si tipo_cliente = DISTRIBUIDOR o TALLER o TIENDA:
    Lista las CATEGORÍAS DE PRODUCTO de su nicho (no equipos). Ejemplo para
    distribuidor de aceites de moto:
    [
        {{"rol": "Aceite Moto 4T Sintético", "pilar": "🛢️ LUBRICANTES:MOTO", "keywords": ["SINTEK","SYNTHETIC","AGROX","4T"]}},
        {{"rol": "Aceite Moto 4T Semisintético", "pilar": "🛢️ LUBRICANTES:MOTO", "keywords": ["ATTOM RAYVON","J6000","J8000","4T"]}},
        {{"rol": "Aceite Moto 4T Mineral", "pilar": "🛢️ LUBRICANTES:MOTO", "keywords": ["RAYVON SUPER 4T","AQUAOIL 4T","SCOOTER","4T"]}},
        {{"rol": "Aceite Moto 2T", "pilar": "🛢️ LUBRICANTES:MOTO", "keywords": ["2T","RAYVON 2T","AQUAOIL 2T"]}}
    ]
    Adapta los keywords exactamente al nicho del cliente. Para talleres o tiendas de
    auto incluye aceite motor, filtros de aceite, líquidos de frenos, etc.

    REGLAS DE CLASIFICACIÓN DE SEGMENTO MECÁNICO:
    1. LIVIANO: Autos particulares, sedanes, city cars.
    2. COMERCIAL_LIVIANO: Furgones, camionetas 4x4, Sprinter, H1.
    3. REPARTO_MEDIO_PESADO: Camiones repartidores, flotas medianas/grandes.
    4. MAQUINARIA_MINERIA: Grúas, excavadoras, cargadores, constructoras, mineras.

    REGLA: Para DISTRIBUIDOR/TALLER/TIENDA usa segmento_mecanico del producto
    que venden (ej: distribuidor motos → LIVIANO; taller camiones → REPARTO_MEDIO_PESADO).
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
            "nombre_rubro": "Flota Comercial / Industrial B2B",
            "parque_deducido": "Vehículos comerciales pesados o livianos.",
            "dolor_critico": "Mantenimiento preventivo continuo.",
            "tipo_cliente": "FLOTA",
            "segmento_mecanico": "REPARTO_MEDIO_PESADO",
            "escala_detectada": "GRANDE",
            "justificacion_escala": "Flota operativa comercial.",
            "modelo_especificado": True,
            "pregunta_modelo": None,
            "envases_validos": ["Balde", "Tambor", "Unidad"],
            "insumos_necesarios": [
                {"rol": "Aceite de Motor", "pilar": "🛢️ LUBRICANTES:MOTOR", "keywords": ["15W40"]},
                {"rol": "Aceite Hidráulico", "pilar": "🛢️ LUBRICANTES:HIDRAULICO", "keywords": ["HYDRO", "ISO 46"]},
                {"rol": "Grasa Multipropósito", "pilar": "⚙️ GRASAS", "keywords": ["EP-2 LITHIUM"]},
                {"rol": "Batería", "pilar": "🔋 BATERÍAS", "keywords": ["100AMP", "120AMP"]},
                {"rol": "Neumático", "pilar": "🔘 NEUMÁTICOS", "keywords": ["R17.5", "R22.5"]},
                {"rol": "Refrigerante / DEF", "pilar": "🧪 REFRIGERANTES", "keywords": ["COOLANT", "AIRBLUE"]}
            ]
        }

    df_w = df_precios.copy()
    col_sku    = 'Codigo SKU' if 'Codigo SKU' in df_w.columns else df_w.columns[7]
    col_desc   = 'Descripcion Producto Original' if 'Descripcion Producto Original' in df_w.columns else df_w.columns[8]
    col_env    = 'TIPO DE ENVASE' if 'TIPO DE ENVASE' in df_w.columns else df_w.columns[10]
    col_cat    = 'Categoria' if 'Categoria' in df_w.columns else df_w.columns[2]
    col_marca  = 'Marca' if 'Marca' in df_w.columns else df_w.columns[5]
    col_precio = 'Precio Venta RMG X ENVASE (+30% Neto)' if 'Precio Venta RMG X ENVASE (+30% Neto)' in df_w.columns else df_w.columns[14]

    df_w['_p_num'] = pd.to_numeric(df_w[col_precio], errors='coerce').fillna(0)
    df_w = df_w[df_w['_p_num'] > 0].copy()

    seg         = data_ia.get("segmento_mecanico", "REPARTO_MEDIO_PESADO")
    tipo_cliente = data_ia.get("tipo_cliente", "FLOTA")

    # Distributors/talleres/tiendas get more options and no envase restriction
    is_distribuidor = tipo_cliente in ("DISTRIBUIDOR", "TALLER", "TIENDA")
    MAX_POR_CATEGORIA = 8 if is_distribuidor else 3

    catalogo_lines = []
    skus_vistos = set()

    for item in data_ia.get("insumos_necesarios", []):
        sub = df_w.copy()
        pilar = item["pilar"]

        if "NEUMÁTICOS" in pilar:
            sub = sub[sub[col_cat].astype(str).str.contains("Neuma", case=False, na=False)]
            if not is_distribuidor:
                if seg == "LIVIANO":
                    sub = sub[sub[col_desc].astype(str).str.contains("R13|R14|R15", case=False, na=False) & (sub['_p_num'] < 65000)]
                elif seg == "COMERCIAL_LIVIANO":
                    sub = sub[sub[col_desc].astype(str).str.contains("R16|R15C", case=False, na=False) & (sub['_p_num'] >= 38000) & (sub['_p_num'] < 120000)]
                elif seg == "REPARTO_MEDIO_PESADO":
                    sub = sub[sub[col_desc].astype(str).str.contains("R17.5|R19.5|R22.5", case=False, na=False) & (sub['_p_num'] >= 90000)]
                elif seg == "MAQUINARIA_MINERIA":
                    sub = sub[sub[col_desc].astype(str).str.contains("1200 R24|R22.5|OTR", case=False, na=False) & (sub['_p_num'] >= 180000)]

        elif "BATERÍAS" in pilar:
            sub = sub[sub[col_cat].astype(str).str.contains("Bateria", case=False, na=False)]
            if not is_distribuidor:
                if seg == "LIVIANO":
                    sub = sub[(sub['_p_num'] >= 35000) & (sub['_p_num'] < 60000)]
                elif seg == "COMERCIAL_LIVIANO":
                    sub = sub[(sub['_p_num'] >= 55000) & (sub['_p_num'] <= 98000)]
                elif seg == "REPARTO_MEDIO_PESADO":
                    sub = sub[(sub['_p_num'] >= 100000) & (sub['_p_num'] <= 150000)]
                elif seg == "MAQUINARIA_MINERIA":
                    sub = sub[(sub['_p_num'] >= 130000)]

        elif "LUBRICANTES:MOTOR" in pilar and not is_distribuidor:
            # Heavy/diesel motor oils for fleet — exclude motorcycle-specific oils
            sub = sub[sub[col_cat].astype(str).str.contains("Lubricante", case=False, na=False)]
            moto_excl = sub[col_desc].astype(str).str.upper().str.contains(r"4T |2T |MOTO|RAYVON|SCOOTER|JASO", na=False)
            sub = sub[~moto_excl]
            mask = pd.Series(False, index=sub.index)
            for kw in item["keywords"]:
                if len(str(kw)) >= 2:
                    mask = mask | sub[col_desc].astype(str).str.upper().str.contains(str(kw).upper(), na=False)
            sub = sub[mask]
            mask_env = pd.Series(False, index=sub.index)
            for env in data_ia.get("envases_validos", ["Galon", "Balde", "Unidad"]):
                mask_env = mask_env | sub[col_env].astype(str).str.upper().str.contains(str(env).upper(), na=False)
            if not sub[mask_env].empty:
                sub = sub[mask_env]

        elif "LUBRICANTES:HIDRAULICO" in pilar:
            sub = sub[sub[col_cat].astype(str).str.contains("Lubricante", case=False, na=False)]
            mask = pd.Series(False, index=sub.index)
            for kw in item["keywords"]:
                mask = mask | sub[col_desc].astype(str).str.upper().str.contains(str(kw).upper(), na=False)
            sub = sub[mask]
            if not is_distribuidor:
                mask_env = pd.Series(False, index=sub.index)
                for env in data_ia.get("envases_validos", ["Galon", "Balde", "Unidad"]):
                    mask_env = mask_env | sub[col_env].astype(str).str.upper().str.contains(str(env).upper(), na=False)
                if not sub[mask_env].empty:
                    sub = sub[mask_env]

        elif "LUBRICANTES:MOTO" in pilar:
            sub = sub[sub[col_cat].astype(str).str.contains("Lubricante", case=False, na=False)]
            mask = pd.Series(False, index=sub.index)
            for kw in item["keywords"]:
                mask = mask | sub[col_desc].astype(str).str.upper().str.contains(str(kw).upper(), na=False)
            # Must also contain a moto indicator to avoid mixing with car oils
            moto_mask = sub[col_desc].astype(str).str.upper().str.contains("MOTO|4T |2T |SCOOTER|RAYVON|AQUAOIL", na=False)
            sub = sub[mask & moto_mask]

        elif "REFRIGERANTES" in pilar:
            sub = sub[sub[col_cat].astype(str).str.contains("Refrigerante|Quimico|Aditivo", case=False, na=False)]
            mask = pd.Series(False, index=sub.index)
            for kw in item["keywords"]:
                mask = mask | sub[col_desc].astype(str).str.upper().str.contains(str(kw).upper(), na=False)
            sub = sub[mask]

        else:
            mask_spec = pd.Series(False, index=sub.index)
            for kw in item["keywords"]:
                if len(str(kw)) >= 2:
                    mask_spec = mask_spec | sub[col_desc].astype(str).str.upper().str.contains(str(kw).upper(), na=False)
            sub = sub[mask_spec]
            if not is_distribuidor:
                mask_env = pd.Series(False, index=sub.index)
                for env in data_ia.get("envases_validos", ["Galon", "Balde", "Unidad"]):
                    mask_env = mask_env | sub[col_env].astype(str).str.upper().str.contains(str(env).upper(), na=False)
                if not sub[mask_env].empty:
                    sub = sub[mask_env]

        sub = sub.sort_values('_p_num')
        conteo = 0
        for _, row in sub.iterrows():
            if conteo >= MAX_POR_CATEGORIA:
                break
            sku = str(row[col_sku]).split('.')[0]
            if sku in skus_vistos:
                continue
            skus_vistos.add(sku)
            marca = str(row[col_marca]) if pd.notna(row[col_marca]) else "Vistony"
            p_fmt = f"${row['_p_num']:,.0f}".replace(',', '.')
            catalogo_lines.append(
                f"{item['rol']} | {sku} | {marca} | {row[col_desc]} | {row[col_env]} | {p_fmt}"
            )
            conteo += 1

    if catalogo_lines:
        catalogo_str = (
            "CATALOGO REAL RMG — UNICOS PRODUCTOS VALIDOS (NUNCA INVENTES FUERA DE ESTA LISTA):\n"
            "ROL_INSUMO | SKU | MARCA | DESCRIPCION | PRESENTACION | PRECIO_NETO\n"
            + "\n".join(catalogo_lines)
        )
    else:
        catalogo_str = "CATALOGO REAL RMG: Sin coincidencias para este segmento."

    return catalogo_str, data_ia
