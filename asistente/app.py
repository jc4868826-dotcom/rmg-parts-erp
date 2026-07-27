import os
import re
import time
import requests
import pandas as pd
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv
from motor_rmg import deducir_y_buscar_360, enriquecer_df, _load_ing

load_dotenv()

app = Flask(__name__)
_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:5174"
).split(",")
CORS(app, origins=_origins)
client = OpenAI()  # reads OPENAI_API_KEY from environment

_ERP_URL = "https://rmg-parts-erp.onrender.com/api/lista-precios"
_cache = {"df": None, "ts": 0.0}

def _get_df():
    now = time.time()
    if _cache["df"] is not None and (now - _cache["ts"]) < 3600:
        return _cache["df"]
    try:
        resp = requests.get(_ERP_URL, timeout=30)
        resp.raise_for_status()
        rows = resp.json()
        # Deduplicate by lowest precio_venta_neto per SKU — same logic as
        # frontend "Artículos únicos" tab (ListaPreciosPage.jsx line 60-76)
        min_price: dict = {}
        for r in rows:
            sku = r.get("codigo_sku", "")
            precio = r.get("precio_venta_neto", 0) or 0
            if sku not in min_price or precio < min_price[sku]["precio_venta_neto"]:
                min_price[sku] = r
        deduped = list(min_price.values())
        df = pd.DataFrame([{
            "Codigo SKU":                             r.get("codigo_sku", ""),
            "Descripcion Producto Original":          r.get("descripcion", ""),
            "Marca":                                  r.get("marca", ""),
            "Categoria":                              r.get("categoria", ""),
            "Presentacion":                           r.get("presentacion", ""),
            "TIPO DE ENVASE":                         r.get("tipo_envase") or r.get("presentacion", ""),
            "Unidades por Pack":                      r.get("unidades_por_pack") or 1,
            "Costo Pack Neto":                        r.get("costo_pack_neto") or 0,
            "Precio Venta RMG X ENVASE (+30% Neto)": r.get("precio_venta_neto", 0),
        } for r in deduped])
        df = enriquecer_df(df)   # precalcula Descripcion_Enriquecida una vez por cache TTL
        _cache["df"] = df
        _cache["ts"] = now
        print(f"\n---> CEREBRO DINÁMICO RMG: {len(df)} SKUs conectados desde ERP (con cruce de ingeniería) <---\n")
        return df
    except Exception as e:
        print(f"[ERP] Error al cargar datos: {e}")
        return _cache["df"]  # stale cache if available, else None


_FOLLOWUP_PATTERNS = [
    "por qué", "por que", "cómo", "como funciona", "qué significa", "que significa",
    "explica", "explícame", "cuéntame", "qué es ", "que es ", "para qué", "para que",
    "ese producto", "esa marca", "esa tabla", "la tabla", "esos skus", "ese sku",
    "los precios", "el precio", "cuánto", "cuanto", "y si ", "pero ", "entonces",
    "además", "también", "puedes", "puedo", "me puedes", "cuál es mejor", "cual es mejor",
    "qué diferencia", "que diferencia", "cada cuánto", "cada cuanto", "qué incluye",
    "que incluye", "dame más", "más opciones", "por cuánto", "por cuanto",
]

def _is_followup(mensajes):
    """True si el último mensaje parece pregunta de seguimiento sobre la respuesta anterior."""
    if len(mensajes) < 2:
        return False
    if not any(m.get("role") == "assistant" for m in mensajes[:-1]):
        return False
    last = mensajes[-1]["content"].lower().strip()
    # Short messages (≤8 words) after a prior assistant turn are almost always follow-ups
    if len(last.split()) <= 8:
        return True
    return any(p in last for p in _FOLLOWUP_PATTERNS)


def _parsear_skus(texto, df):
    """Extrae SKUs reales del texto de ZARA y devuelve los datos del ERP para cada uno."""
    skus = list(dict.fromkeys(re.findall(r'\b(\d{5,8})\b', texto)))
    col_sku  = 'Codigo SKU'
    col_desc = 'Descripcion Producto Original'
    col_unit = 'Precio Venta RMG X ENVASE (+30% Neto)'
    col_pack = 'Costo Pack Neto'
    col_und  = 'Unidades por Pack'
    productos = []
    for sku in skus:
        rows = df[df[col_sku].astype(str).str.split('.').str[0].str.strip() == sku]
        if rows.empty:
            continue
        r = rows.iloc[0]
        precio_unit = float(r[col_unit]) if pd.notna(r[col_unit]) else 0
        pack_raw    = float(r[col_pack]) if pd.notna(r[col_pack]) else 0
        precio_pack = pack_raw if pack_raw > 0 else precio_unit
        und_raw     = float(r[col_und])  if pd.notna(r[col_und])  else 0
        und_pack    = int(und_raw) if und_raw > 0 else 1
        productos.append({
            "codigo_sku":        sku,
            "descripcion":       str(r[col_desc]),
            "precio_venta_neto": precio_unit,
            "cantidad":          1,
            "precio_pack":       precio_pack,
            "unidades_pack":     und_pack,
        })
    return productos


SYSTEM_PROMPT = """
Eres ZARA, motor de inteligencia comercial de RMG Parts Chile.
Hablas con vendedores de RMG, nunca con el cliente final.

PASO 1 — IDENTIFICA EL TIPO DE NEGOCIO DEL PROSPECTO:
Antes de recomendar nada, clasifica al prospecto en UNO de estos tipos:

A) OPERADOR DE FLOTA (constructora, minera, transportista, agricola):
   Tiene equipos/vehiculos propios que necesitan mantenimiento.
   → Responde con tablas por equipo (aceite, grasa, bateria, etc por maquina)

B) DISTRIBUIDOR / REVENDEDOR (distribuye productos a terceros):
   Compra para revender, no para usar. Le interesa variedad de catalogo,
   margenes y presentaciones.
   → Responde con tablas por CATEGORIA DE PRODUCTO orientadas a su nicho
   (ej: aceites moto sinteticos / semisinteticos / minerales), con todas
   las opciones disponibles en RMG para cada sub-categoria.

C) TALLER / SERVICIO TECNICO (atiende vehiculos de terceros):
   Necesita stock rotativo para los vehiculos que atiende.
   → Responde con tablas por TIPO DE VEHICULO que atiende (autos, motos,
   camiones) y los insumos mas demandados para cada uno.

D) TIENDA DE REPUESTOS (vende al mostrador):
   Similar a distribuidor pero mas orientado a precio unitario y
   presentaciones chicas.
   → Responde con tablas por categoria con enfasis en presentacion
   unitaria y margen sugerido.

PASO 2 — ARMA LA PROPUESTA SEGUN EL TIPO:

Para TIPO B (Distribuidor/Revendedor) el formato es:
"Tu cliente es un distribuidor de [nicho]. Lo que le interesa es ampliar
su catalogo con productos de calidad a precio mayorista."

### [Sub-categoria 1, ej: Aceites sinteticos para moto]
| Producto | SKU | Presentacion | Und x Pack | Precio Pack | Precio Unit. | Margen | Proveedor |
|----------|-----|-------------|-----------|------------|-------------|--------|----------|
[todos los productos RMG reales que aplican a esa sub-categoria]

### [Sub-categoria 2, ej: Aceites semisinteticos para moto]
[misma tabla]

### [Sub-categoria 3]
[misma tabla]

Para TIPO A (Operador de flota) el formato es:
"Para una [tipo empresa] en Chile, la flota tipica incluye:
1. [equipo mencionado]
2. [equipo deducido]
..."
Minimo 5 equipos. Luego una tabla por cada equipo:

### [Nombre del equipo N]
| Insumo | Producto RMG | SKU | Presentacion | Und x Pack | Precio Pack | Precio Unit. | Proveedor | Cambio estimado |
|--------|-------------|-----|-------------|-----------|------------|-------------|----------|----------------|
| Aceite motor | [producto real] | [sku real] | [real] | [und] | [pack] | [unit] | [marca] | Cada X hrs |
| Aceite hidraulico | ... | ... | ... | ... | ... | ... | ... | ... |
| Grasa | ... | ... | ... | ... | ... | ... | ... | ... |
| Bateria | ... | ... | ... | ... | ... | ... | ... | ... |
| Neumatico | ... | ... | ... | ... | ... | ... | ... | ... |
| Refrigerante | ... | ... | ... | ... | ... | ... | ... | ... |

Para TIPO C (Taller) el formato es:
una tabla por tipo de vehiculo que atiende.

PASO 3 — ARGUMENTO DE VENTA (despues de todas las tablas):
Adaptado al tipo de negocio. Para un distribuidor: margenes, exclusividad,
soporte. Para una flota: costo total de operacion, disponibilidad,
credito. Para un taller: rotacion, precio competitivo, entrega.

INSTRUCCION CRITICA SOBRE PRODUCTOS:
Recibirás un bloque "CATALOGO REAL RMG" con filas en formato:
ROL_INSUMO | SKU | MARCA | DESCRIPCION | PRESENTACION | UND_X_PACK | PRECIO_PACK | PRECIO_UNIT

Donde:
- UND_X_PACK = unidades por caja/pack (ej: 12 para CAJ12, 1 para unidades sueltas)
- PRECIO_PACK = precio de la caja completa (costo_pack_neto del ERP)
- PRECIO_UNIT = precio por unidad individual (precio_venta_neto del ERP)
NUNCA calcules ni inventes estos precios. Usa EXCLUSIVAMENTE los valores del catalogo.

Para TIPO A, mapea ROL_INSUMO a la fila de la tabla:
- "Aceite de Motor"       → fila "Aceite motor"
- "Aceite Hidráulico"     → fila "Aceite hidráulico"
- "Grasa Multipropósito"  → fila "Grasa"
- "Batería"               → fila "Bateria"
- "Neumático"             → fila "Neumatico"
- "Refrigerante / DEF"    → fila "Refrigerante"

Para TIPO B, usa los productos del catalogo agrupados por sub-categoria
de producto segun lo que necesita el distribuidor. Muestra TODOS los
productos disponibles en cada sub-categoria, no solo uno.

CONOCIMIENTO TÉCNICO VISTONY 2025 — MARCAS DISTRIBUIDAS POR RMG:
Attom, Sintek, Blindax, Forza, Brikson, Transmec, Draula, Hidraroly,
Draulacat, Trakoil, Veltron, Rayvon, Lotox.

LUBRICANTES GASOLINA:
- ATTOM S310: SAE 5W-30/5W-40/10W-40 | 100% sintético | autos modernos con inyección electrónica y turbo
- ATTOM S320: SAE 5W-30 | 1L-5L
- ATTOM RACING: SAE 10W-60 | alto rendimiento
- SINTEK S210: SAE 10W-30/10W-40 | semisintético
- BLINDAX SUPER: SAE 10W-30/20W-50 | multipropósito gasolina
- BLINDAX HD SAE: SAE 40/50 | convencional

LUBRICANTES DIESEL:
- VOLTEK C300: SAE 10W-40/15W-40 | equipos pesados y móviles | bidón 5G y 55G
- FORZA RAYGOLD: SAE 15W-40 | diesel estándar
- FORZA PLUS: SAE 15W-40 | diesel mejorado
- FORZA TURBO: SAE 15W-40 | motores turboalimentados diesel
- FORZA VIS: SAE 15W-40 | viscosidad controlada
- FORZA ULTRA D: SAE 5W-30/10W-40 | diesel de última generación

TRANSMISIONES AUTOS:
- BRIKSON ATF CVT-F: transmisiones CVT | 100% sintético
- BRIKSON ATF SYNTH: multivehículo sintético | cajas automáticas
- ATF BRIKSON MDIII: DEXRON III | cajas automáticas estándar
- GEAR OIL GL-5: SAE 80W-90/85W-140 | diferencial y caja manual
- TRANSMEC DUAL: SAE 80W-90/90/140/250 | transmisiones manuales pesadas

TRANSMISIONES CAMIONES:
- TRANSMEC CAMIÓN GL-4/GL-5: SAE 80W-90 y 85W-140
- TRANSMEC SYNTHETIC: SAE 75W-90 | sintético para camiones

MOTOCICLETAS:
- ATTOM RAYVON 4T: SAE 15W-50 | 4 tiempos alta performance
- SINTEK RAYVON 4T: SAE 10W-40/15W-50/20W-50 | 4 tiempos
- RAYVON SUPER 4T: SAE 20W-50 | 4 tiempos convencional
- RAYVON SUPER 2T: JASO FB/API TC | 2 tiempos

HIDRÁULICOS (Minería, Construcción, Industria):
- DRAULA HT: ISO 46/68 | alta temperatura | retroexcavadoras, grúas
- DRAULA H: ISO 32/46/68 | estándar industrial
- HIDRAROLY ZF: transmisiones hidráulicas equipos móviles
- HIDRAROLY: hidráulico general
- DRAULACAT: TO-4 | Caterpillar y equipos similares
- TRAKOIL: SAE 10W/30W | transmisiones de equipos móviles

REDUCTORES INDUSTRIALES:
- VELTRON SYNTH: ISO 150/220/320/460 | sintético
- VELTRON EP: ISO 68 a 680 | extrema presión

COMPRESORES:
- COMPRESSOR OIL RSP SYNTH: ISO 32/46/68 | rotativo sintético
- AIR COMPRESSOR OIL: ISO 100/150 | pistón convencional

GRASAS:
- NANOLITHIUM WS2: NLGI 2 | premium con bisulfuro de tungsteno
- SULFONATO DE CALCIO: NLGI 1/2 | extrema presión y alta temperatura
- GRASA EP LITHIUM: NLGI 0/1/2/3 | multipropósito general | hasta 180kg
- MOLIBDENO LITHIUM EP-2: NLGI 2 | con molibdeno | cojinetes y articulaciones
- CHASIS SUPER H: NLGI 00/0/1/2 | chasis camiones | hasta 180kg

REFRIGERANTES:
- ICE FREEZE OAT 50/50: Verde, Rosa, Fuchsia | autos modernos | OAT
- ICE FREEZE HEAVY DUTY: Verde y Rosa | camiones y maquinaria pesada | OAT HD
- CONCENTRADO OAT: diluir según necesidad
- DOT 3 / DOT 4 / DOT 5.1: líquidos de freno para auto y moto

CAR CARE (Lotox):
- LOTOX INFINITE: línea premium detailing interior (protector, limpia vidrios, cuero, lavado ecológico, renovador plásticos)
- LOTOX: brillanta llantas, cera, shampoo, silicona, limpiador tapiz

AUXILIARES Y ADITIVOS:
- AFLOJATODO ZK-90, Limpia inyectores, Brake Cleaner, Limpia radiador
- SPRAY ARRANQUE, Limpia carburador, Limpia contacto, Lube multiusos
- ADITIVOS: Mejorador octanaje, Aditivo Diesel, Aditivo Gasolinero, No Smoke

REGLA VISTONY: Si el vendedor pregunta qué producto Vistony usar para una aplicación
específica, responde con la marca y nombre de producto correcto según esta lista.
Ejemplo: "¿aceite para retroexcavadora?" → DRAULACAT TO-4 o DRAULA HT ISO 46.
Usa este conocimiento para complementar el catálogo del ERP, nunca para inventar SKUs.

INSTRUCCION ANTI-ALUCINACION — DATOS DE COMPOSICION Y APLICACION:
Algunas descripciones de producto incluyen campos "Comp:" y "Aplicación:" que provienen
del cruce con el catálogo de ingeniería del proveedor. Estos datos son provisorios y están
en proceso de validación contra fichas técnicas del fabricante.
- No debes inferir, calcular ni completar especificaciones por tu cuenta: reproduce la
  tabla tal como se te entrega.
- Justifica tu recomendación basándote exclusivamente en los datos de Composición y
  Aplicación de esa tabla.
- Si la tabla indica "No especificada por proveedor", dilo explícitamente al cliente en
  vez de completarlo con tu propio conocimiento.
- Presenta los datos de Composición/Aplicación como "información técnica del proveedor"
  (no como garantía de RMG).

REGLAS ABSOLUTAS:
- SOLO productos reales del catalogo RMG (los datos que recibes del ERP)
- NUNCA inventes SKUs, precios ni productos
- Si falta un dato, asume el mas comun y dilo explicitamente
- Si RMG no tiene un producto para una necesidad, di "No disponible"
- Habla SIEMPRE en tercera persona sobre el prospecto
- Si el vendedor hace pregunta de seguimiento, responde conversando
"""


FOLLOWUP_SYSTEM_PROMPT = """
Eres Zara, asesora comercial experta de RMG Parts. Estás en una conversación activa con el vendedor.

El vendedor acaba de hacer una pregunta de seguimiento sobre la recomendación que ya le diste. Tienes el historial completo de la conversación en los mensajes anteriores.

REGLAS PARA ESTA RESPUESTA:
1. Responde de forma DIRECTA y CONVERSACIONAL. SIN headers (###), SIN bullets numerados, SIN estructura de secciones.
2. PROHIBIDO regenerar, repetir o volver a mostrar la tabla de productos. Ya está en el historial.
3. Responde ÚNICAMENTE lo que preguntó, en 2 a 4 párrafos cortos, con autoridad técnica y conocimiento del mercado chileno.
4. Si pregunta por qué un producto específico, justifícalo técnicamente con contexto de negocio real (desgaste típico, frecuencia de cambio, costo operativo en flotas chilenas similares).
5. ROL INTERNO — NUNCA CLIENTE FINAL: El usuario es el vendedor, no el comprador. Refiérete al prospecto en tercera persona ("su cliente", "la constructora", "su flota"). Si pide avanzar, sugiere el próximo paso que ÉL debería dar con SU cliente.
6. PRODUCTOS FUERA DE CATÁLOGO: Si algo no está en el catálogo visible en el historial, dilo en una línea y sugiere cómo igual cerrar negocio con lo que sí tiene RMG.
"""


@app.route("/catalogo-ingenieria")
def catalogo_ingenieria():
    """Expone el catálogo de ingeniería completo para la pestaña Catálogo del ERP.
    Incluye jerarquía (Familia/Subfamilia/Sub-subfamilia) y datos técnicos."""
    df = _load_ing()
    if df is None:
        return jsonify([])
    # Devolver todos los campos disponibles (el JSON ya tiene la jerarquía completa)
    records = df.where(pd.notna(df), other=None).to_dict(orient='records')
    return jsonify(records)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/chat", methods=["POST"])
def chat():
    try:
        data = request.json
        mensajes = data.get("mensajes", [])
        ultimo_msg = mensajes[-1]["content"] if mensajes else ""

        # Follow-up: skip the pipeline, answer from conversation context
        if _is_followup(mensajes):
            payload = [{"role": "system", "content": FOLLOWUP_SYSTEM_PROMPT}] + mensajes
            completion = client.chat.completions.create(
                model="gpt-4o",
                messages=payload,
                temperature=0.3,
            )
            return jsonify({"respuesta": completion.choices[0].message.content, "productos_recomendados": []})

        # New prospect description: run full classification + product search
        df_precios = _get_df()
        if df_precios is None:
            return jsonify({"error": "Base de datos no disponible. Intenta en unos segundos."}), 503

        tabla_skus, data_ia = deducir_y_buscar_360(ultimo_msg, client, df_precios)

        bloque_datos = (
            f"\n\n=== DATOS DEL PROSPECTO (PROCESADOS POR MOTOR RMG) ===\n"
            f"RUBRO: {data_ia.get('nombre_rubro', '')}\n"
            f"PARQUE: {data_ia.get('parque_deducido', '')}\n"
            f"SEGMENTO MECÁNICO: {data_ia.get('segmento_mecanico', '')}\n"
            f"ESCALA DETECTADA: {data_ia.get('escala_detectada', '')}\n"
            f"JUSTIFICACIÓN ESCALA: {data_ia.get('justificacion_escala', '')}\n"
            f"MODELO_ESPECIFICADO: {data_ia.get('modelo_especificado', True)}\n"
            f"PREGUNTA_MODELO: {data_ia.get('pregunta_modelo', '')}\n\n"
            f"{tabla_skus}\n"
            f"================================================="
        )

        payload = [{"role": "system", "content": SYSTEM_PROMPT + bloque_datos}] + mensajes
        completion = client.chat.completions.create(
            model="gpt-4o",
            messages=payload,
            temperature=0.1,
        )
        respuesta_texto = completion.choices[0].message.content
        productos_rec = _parsear_skus(respuesta_texto, df_precios)
        return jsonify({"respuesta": respuesta_texto, "productos_recomendados": productos_rec})
    except Exception as e:
        return jsonify({"error": f"Error interno: {str(e)}"}), 500


if __name__ == "__main__":
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    app.run(port=5000, debug=debug)
