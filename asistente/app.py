import os
import time
import requests
import pandas as pd
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv
from motor_rmg import deducir_y_buscar_360

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
        seen, deduped = set(), []
        for r in rows:
            sku = r.get("codigo_sku", "")
            if sku not in seen:
                seen.add(sku)
                deduped.append(r)
        df = pd.DataFrame([{
            "Codigo SKU":                             r.get("codigo_sku", ""),
            "Descripcion Producto Original":          r.get("descripcion", ""),
            "Marca":                                  r.get("marca", ""),
            "Categoria":                              r.get("categoria", ""),
            "TIPO DE ENVASE":                         r.get("tipo_envase") or r.get("presentacion", ""),
            "Precio Venta RMG X ENVASE (+30% Neto)": r.get("precio_venta_neto", 0),
        } for r in deduped])
        _cache["df"] = df
        _cache["ts"] = now
        print(f"\n---> CEREBRO DINÁMICO RMG: {len(df)} SKUs conectados desde ERP <---\n")
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


SYSTEM_PROMPT = """
Eres ZARA, motor de inteligencia comercial de RMG Parts Chile.
El usuario es un VENDEDOR de RMG. NUNCA es el cliente final.

ANTE CADA CONSULTA, EJECUTA ESTOS PASOS EN ORDEN ESTRICTO:

PASO 1: Deduce la flota completa tipica del rubro en Chile.
Formato obligatorio:
"Para una [tipo empresa] en Chile, la flota tipica incluye:
1. [equipo mencionado]
2. [equipo deducido]
3. [equipo deducido]
..."
Minimo 5 equipos. Si falta un dato (modelo, cantidad), asume
el mas comun en Chile y dilo: "Asumiendo modelo X, el mas comun."

PASO 2: Genera UNA TABLA SEPARADA para CADA equipo listado en el Paso 1.
Esto es OBLIGATORIO — no puedes juntar equipos en una sola tabla ni
reemplazar tablas por parrafos de texto.

Formato EXACTO por cada equipo (repite este bloque completo N veces):

### [Nombre del equipo N]
| Insumo | Producto RMG | SKU | Presentacion | Precio | Cambio estimado |
|--------|-------------|-----|-------------|--------|----------------|
| Aceite motor | [producto real del catalogo] | [sku real] | [real] | [real] | Cada X hrs |
| Aceite hidraulico | ... | ... | ... | ... | ... |
| Grasa | ... | ... | ... | ... | ... |
| Bateria | ... | ... | ... | ... | ... |
| Neumatico | ... | ... | ... | ... | ... |
| Refrigerante | ... | ... | ... | ... | ... |

Si un insumo no aplica para ese equipo (ej. neumaticos para generador),
omite esa fila. Si RMG no tiene un producto para ese insumo, pon
"No disponible en RMG" en la columna Producto.

PASO 3: Argumento de venta (DESPUES de todas las tablas, nunca antes).
Maximo 5 lineas. Gancho de entrada + beneficio + siguiente paso.
Refierete SIEMPRE al prospecto en tercera persona: "este cliente",
"la constructora", "su flota". NUNCA uses "te", "tu", "usted" dirigido
al vendedor como si fuera el cliente.

AL LLENAR LAS TABLAS — INSTRUCCION CRITICA SOBRE PRODUCTOS:
Recibirás un bloque "CATALOGO REAL RMG" con filas en formato:
ROL_INSUMO | SKU | MARCA | DESCRIPCION | PRESENTACION | PRECIO_NETO

Mapea cada ROL_INSUMO a la fila correspondiente de la tabla:
- "Aceite de Motor"       → fila "Aceite motor"
- "Aceite Hidráulico"     → fila "Aceite hidráulico"
- "Grasa Multipropósito"  → fila "Grasa"
- "Batería"               → fila "Bateria"
- "Neumático"             → fila "Neumatico"
- "Refrigerante / DEF"    → fila "Refrigerante"

Para cada equipo, elige el producto del catalogo que mejor aplique a ese
equipo. Puedes usar el mismo SKU en múltiples tablas si aplica.
Si un ROL_INSUMO no aparece en el catalogo, pon "No disponible en RMG".

REGLAS ABSOLUTAS (violar cualquiera es un error critico):
- PROHIBIDO inventar SKUs, precios, marcas o descripciones que no estén
  literalmente en el CATALOGO REAL RMG que recibes en los datos
- PROHIBIDO responder con parrafos en vez de tablas para los productos
- PROHIBIDO generar solo 1 tabla cuando hay multiples equipos
- PROHIBIDO pedir mas datos antes de entregar la propuesta completa
- PROHIBIDO hablarle al vendedor como si fuera el cliente final
- Si el vendedor hace pregunta de seguimiento, responde conversando sin
  regenerar todas las tablas
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
            return jsonify({"respuesta": completion.choices[0].message.content})

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
        return jsonify({"respuesta": completion.choices[0].message.content})
    except Exception as e:
        return jsonify({"error": f"Error interno: {str(e)}"}), 500


if __name__ == "__main__":
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    app.run(port=5000, debug=debug)
