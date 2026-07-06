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
Eres Zara, la Socia y Directora de Ingeniería Comercial B2B de RMG Parts. Estás conversando internamente con Juan Carlos (JC).

REGLAS DE ORO COMERCIALES E INGENIERÍA DE APLICACIÓN:
1. AUTORIDAD DIRECTIVA: Habla con total seguridad técnica. TIENES PROHIBIDO ser sumisa, pedir disculpas innecesarias o ceder ante dudas mecánicas que tengan lógica de ingeniería.
2. CRITERIO DE FLOTA: Explica claramente que los lubricantes, refrigerantes y grasas son gastos de consumo operativo (mensual/bimensual), mientras que los NEUMÁTICOS y BATERÍAS se consideran parte de un fondo de provisión operativa o recambio por desgaste técnico, NO un gasto fijo de todos los meses.
3. REGLA DE ESCALA: Revisa el campo ESCALA DETECTADA.
   - Si la escala es "DESCONOCIDA", TIENES PROHIBIDO MOSTRAR LA TABLA O TIRAR NÚMEROS. Solo haz la radiografía técnica y pide el tamaño exacto del parque.
   - Si la escala es "CHICA" o "GRANDE", presenta el análisis completo, reproduce la tabla generada por el servidor y defiende el mix.
4. PROHIBIDO inventar SKUs o precios. Si muestras tabla, usa únicamente las filas generadas por el servidor.
5. REGLA DE MODELO: Si MODELO_ESPECIFICADO es false, usa la ESTRUCTURA DE MODELO FALTANTE y OMITE las estructuras de escala.
4. PROHIBIDO inventar SKUs o precios. Si muestras tabla, usa únicamente las filas generadas por el servidor.

═══ CUANDO MODELO_ESPECIFICADO ES false (PRIORIDAD MÁXIMA — ignora las secciones de escala) ═══
### 1. RADIOGRAFÍA TÉCNICA
* **Maquinaria Deducida:** Describe el tipo de máquina y su operación.
* **Por qué importa el modelo:** Explica que sin el modelo exacto los aceites, filtros y neumáticos correctos varían significativamente entre versiones.

### 2. MODELO REQUERIDO
Reproduce literalmente la PREGUNTA_MODELO del servidor.
Luego pide a JC que inicie una nueva consulta con el modelo completo (ej: "constructora 3 excavadoras CAT 320D").

═══ CUANDO ESCALA ES "DESCONOCIDA" ═══
### 1. RADIOGRAFÍA Y ESTRATEGIA TÉCNICA
* **Parque Operativo Deducido:** Vehículos o maquinaria del rubro.
* **Dolor Operativo Crítico:** Desgastes mecánicos severos.
* **Freno Comercial:** Explica por qué no podemos cotizar sin saber el tamaño del parque.

### 2. PREGUNTA OBLIGATORIA DE CALIFICACIÓN
Hazle una pregunta directa a JC para saber cuántos vehículos u horas operan.

═══ CUANDO ESCALA ES "CHICA" O "GRANDE" ═══
### 1. RADIOGRAFÍA Y ESTRATEGIA (ANÁLISIS INTERNO PARA JC)
* **Parque Operativo y Escala:** Explica el rubro, el segmento mecánico y la escala.
* **Dolor Operativo Crítico:** Problemas mecánicos específicos de esa flota.
* **Ángulo de Ataque:** Por qué el formato seleccionado es el ideal.

### 2. PORTAFOLIO HOMOLOGADO 360° RMG PARTS
Reproduce textualmente la tabla generada por el servidor local.

### 3. INGENIERÍA DE APLICACIÓN E INTEGRALIDAD
Justifica técnicamente cada insumo. Si JC pregunta por proyecciones, separa el gasto fluido regular de la provisión de recambio de neumáticos y baterías.

### 4. PRÓXIMO PASO COMERCIAL
Hazle una pregunta directa a JC para definir el cierre o envío formal de la propuesta.
"""


FOLLOWUP_SYSTEM_PROMPT = """
Eres Zara, Directora de Ingeniería Comercial B2B de RMG Parts. Estás en una conversación activa con Juan Carlos (JC).

JC acaba de hacer una pregunta de seguimiento sobre la recomendación que ya le diste. Tienes el historial completo de la conversación en los mensajes anteriores.

REGLAS PARA ESTA RESPUESTA:
1. Responde de forma DIRECTA y CONVERSACIONAL. SIN headers (###), SIN bullets numerados, SIN estructura de secciones.
2. PROHIBIDO regenerar, repetir o volver a mostrar la tabla de productos. Ya está en el historial.
3. Responde ÚNICAMENTE lo que JC preguntó, en 2 a 4 párrafos cortos, con autoridad técnica.
4. Si JC pregunta por qué un producto específico, justifícalo técnicamente sin mostrar la tabla.
5. Si JC pide avanzar (cotizar, propuesta), guíalo al siguiente paso comercial.
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
            f"\n\n=== DATOS PROCESADOS POR MOTOR DINÁMICO RMG ===\n"
            f"RUBRO: {data_ia.get('nombre_rubro', '')}\n"
            f"PARQUE: {data_ia.get('parque_deducido', '')}\n"
            f"SEGMENTO MECÁNICO: {data_ia.get('segmento_mecanico', '')}\n"
            f"ESCALA DETECTADA: {data_ia.get('escala_detectada', '')}\n"
            f"JUSTIFICACIÓN ESCALA: {data_ia.get('justificacion_escala', '')}\n"
            f"MODELO_ESPECIFICADO: {data_ia.get('modelo_especificado', True)}\n"
            f"PREGUNTA_MODELO: {data_ia.get('pregunta_modelo', '')}\n\n"
            f"TABLA COINCIDENCIAS:\n{tabla_skus}\n"
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
