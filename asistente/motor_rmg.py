import json
import pandas as pd

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
        "modelo_especificado": true,
        "pregunta_modelo": null,
        "envases_validos": ["Galon", "Balde", "Tambor", "Unidad"],
        "insumos_necesarios": [
            {{"rol": "Aceite de Motor / Transmisión", "pilar": "🛢️ LUBRICANTES", "keywords": ["15W40", "5W30", "10W40"]}},
            {{"rol": "Grasa Chasis / Rodamientos", "pilar": "⚙️ GRASAS", "keywords": ["EP-2 LITHIUM MULTIPROPOSITO"]}},
            {{"rol": "Batería Cabina / Arranque", "pilar": "🔋 BATERÍAS", "keywords": ["100AMP", "120AMP", "N100", "75AMP"]}},
            {{"rol": "Neumático Comercial / Carga", "pilar": "🔘 NEUMÁTICOS", "keywords": ["R17.5", "R22.5", "R16", "1200 R24"]}},
            {{"rol": "Refrigerante Radiador / OAT", "pilar": "🧪 QUÍMICOS", "keywords": ["COOLANT ICE FREEZE"]}}
        ]
    }}
    REGLAS DE CLASIFICACIÓN DE SEGMENTO MECÁNICO:
    1. LIVIANO: Autos particulares, sedanes, city cars.
    2. COMERCIAL_LIVIANO: Furgones escolares, camionetas 4x4, Sprinter, H1, utilitarios livianos.
    3. REPARTO_MEDIO_PESADO: Camiones repartidores de gas, camiones 3/4, camiones rígidos urbanos/interurbanos, flotas de camiones medianos o grandes.
    4. MAQUINARIA_MINERIA: Grúas telescópicas, excavadoras, cargadores frontales, camiones tolva pesados, áridos.

    REGLAS DE ESCALA:
    - Si no menciona cantidades ni tamaño del negocio, pon "escala_detectada": "DESCONOCIDA".
    - Si menciona 1 a 5 unidades, pon "CHICA". Si menciona 6 o más, pon "GRANDE".

    REGLAS DE MODELO ESPECÍFICO:
    - Si el segmento es MAQUINARIA_MINERIA Y el usuario NO mencionó el modelo concreto de la máquina
      (ej: dijo "excavadoras CAT" pero no "CAT 320D", "CAT 336", "Komatsu PC200", etc.):
      • pon "modelo_especificado": false
      • en "pregunta_modelo" genera una pregunta técnica corta y directa (ej: "¿Qué modelo de excavadora CAT operan? (320D, 326, 336, 390F...)")
    - Para camiones de reparto, furgones y vehículos de vía pública el modelo no es crítico. Pon modelo_especificado: true.
    - Si el modelo YA está en el input (ej: "CAT 320D", "Volvo FH16", "Komatsu PC200"), pon modelo_especificado: true.
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
            "dolor_critico": "Mantenimiento preventivo continuo y desgaste operativo.",
            "segmento_mecanico": "REPARTO_MEDIO_PESADO",
            "escala_detectada": "GRANDE",
            "justificacion_escala": "Flota operativa comercial.",
            "modelo_especificado": True,
            "pregunta_modelo": None,
            "envases_validos": ["Balde", "Tambor", "Unidad"],
            "insumos_necesarios": [
                {"rol": "Aceite Motor Diésel", "pilar": "🛢️ LUBRICANTES", "keywords": ["15W40"]},
                {"rol": "Grasa Multipropósito", "pilar": "⚙️ GRASAS", "keywords": ["EP-2 LITHIUM"]},
                {"rol": "Batería Heavy Duty", "pilar": "🔋 BATERÍAS", "keywords": ["100AMP", "120AMP"]},
                {"rol": "Neumático Tracción Carga", "pilar": "🔘 NEUMÁTICOS", "keywords": ["R17.5", "R22.5"]},
                {"rol": "Refrigerante Larga Vida", "pilar": "🧪 QUÍMICOS", "keywords": ["COOLANT"]}
            ]
        }
        
    df_w = df_precios.copy()
    col_sku = 'Codigo SKU' if 'Codigo SKU' in df_w.columns else df_w.columns[7]
    col_desc = 'Descripcion Producto Original' if 'Descripcion Producto Original' in df_w.columns else df_w.columns[8]
    col_env = 'TIPO DE ENVASE' if 'TIPO DE ENVASE' in df_w.columns else df_w.columns[10]
    col_cat = 'Categoria' if 'Categoria' in df_w.columns else df_w.columns[2]
    col_marca = 'Marca' if 'Marca' in df_w.columns else df_w.columns[5]
    col_precio = 'Precio Venta RMG X ENVASE (+30% Neto)' if 'Precio Venta RMG X ENVASE (+30% Neto)' in df_w.columns else df_w.columns[14]
    
    df_w['_p_num'] = pd.to_numeric(df_w[col_precio], errors='coerce').fillna(0)
    df_w = df_w[df_w['_p_num'] > 1000].copy()
    
    seg = data_ia.get("segmento_mecanico", "REPARTO_MEDIO_PESADO")
    tabla_out = "| ¿Qué insumo necesita? | Pilar 360° RMG | Marca | SKU Real | Descripción Original RMG | Envase / UM | Precio (+30% Neto) |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n"
    skus_vistos = set()
    
    for item in data_ia.get("insumos_necesarios", []):
        sub = df_w.copy()
        
        # Aduana Mecánica por Segmentos Estrictos
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
                sub = sub[(sub['_p_num'] >= 100000) & (sub['_p_num'] <= 150000)]
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
            tabla_out += f"| **{item['rol']}** | {item['pilar']} | **{marca}** | `{sku}` | {row[col_desc]} | {row[col_env]} | **{p_fmt}** |\n"
            break
            
    return tabla_out, data_ia
