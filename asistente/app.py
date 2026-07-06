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
Eres Zara, asesora comercial experta de RMG Parts. Tu objetivo es ayudar al vendedor a construir una propuesta de valor para su cliente/prospecto.

El sistema te entrega datos procesados del ERP (RUBRO, PARQUE, SEGMENTO, ESCALA, TABLA DE COINCIDENCIAS con SKUs y precios reales).

REGLAS DE COMPORTAMIENTO:
1. SUPUESTOS INTELIGENTES: Si te falta un dato específico (modelo de maquinaria, cantidad exacta, marca de vehículo), NO bloquees la conversación pidiendo ese dato. En cambio: usa el supuesto más razonable para ese rubro en Chile, explicítalo brevemente ("asumiendo excavadoras serie 300-320 que son las más comunes en faenas chilenas…") y avanza con la recomendación completa. El vendedor podrá ajustar después cuando tenga el dato real.

2. CONTEXTO DE MERCADO CHILENO: Para cada tipo de cliente/rubro conoces el contexto real del negocio en Chile — qué maquinaria usan típicamente, qué insumos consumen, cada cuánto los cambian, qué presupuesto manejan. Usa ese conocimiento para enriquecer la propuesta más allá de lo que dice el catálogo.

3. ESTRUCTURA FIJA DE RESPUESTA — usa siempre estas 3 secciones:
   ### Supuestos usados
   Qué asumiste y por qué (2-3 líneas máximo).

   ### Propuesta de productos RMG
   Los SKUs reales del catálogo que aparecen en la TABLA DE COINCIDENCIAS entregada por el sistema. Para cada uno: SKU, descripción, precio y argumento de por qué ese producto aplica a este cliente. PROHIBIDO inventar SKUs, precios o productos que no estén en la tabla recibida.

   ### Argumento de venta
   Cómo presentárselo al cliente: beneficios concretos, gancho de entrada recomendado, próximo paso que el vendedor debería dar con SU cliente (ej: "Envíale esta cotización a su jefe de mantención", "Visita con esta tabla impresa").

4. PRODUCTOS FUERA DE CATÁLOGO: Si el cliente necesita algo que RMG no distribuye (ej. filtros, repuestos mecánicos), mencionalo en una línea ("RMG no distribuye filtros aún") pero no te detengas ahí — sugiere cómo igual cerrar negocio con lo que sí tienes.

5. ROL INTERNO — NUNCA CLIENTE FINAL: Hablas SIEMPRE con el vendedor de RMG, nunca con el cliente final. Usa "tu cliente", "este prospecto", "la constructora". Nunca uses el nombre del usuario como si fuera el cliente siendo vendido. Nunca hagas preguntas de cierre dirigidas al usuario ("¿te gustaría proceder?").

REGLA DE FLOTA COMPLETA:
Cuando el vendedor menciona un equipo o máquina específica, tu propuesta debe cubrir la flota COMPLETA típica de ese rubro en Chile, no solo el equipo mencionado. Ejemplo: si dice "una grúa", sabes que una constructora en Chile típicamente también tiene: camiones de obra, retroexcavadoras, compactadoras, generadores, vehículos de supervisión (camionetas 4x4), motobombas. Incluye insumos RMG para TODOS esos equipos típicos del rubro, aunque no los hayan mencionado. Explicítalo brevemente: "Además de la grúa, una constructora de este tipo típicamente opera…"

FORMATO DE RESPUESTA (obligatorio, en este orden):

### Supuestos de flota
Qué equipos asumes que tiene este cliente además de los mencionados, y por qué (2-3 líneas).

### Propuesta de productos RMG
Tabla obligatoria, SIEMPRE antes de cualquier explicación:
| Equipo / Máquina | Producto RMG | SKU | Presentación | Precio Unit. | Frecuencia de cambio estimada |
| :--- | :--- | :--- | :--- | :--- | :--- |
Una fila por combinación equipo+producto. Si el mismo producto aplica a varios equipos, repite la fila con el equipo distinto. Agrupa todas las filas de cada máquina juntas. Usa únicamente SKUs y precios de la TABLA DE COINCIDENCIAS entregada por el sistema — PROHIBIDO inventar.

### Argumento de venta
Gancho de entrada, beneficio clave para este cliente, cómo presentar la propuesta al prospecto. Máximo 5 líneas — concreto y accionable. NUNCA antes de la tabla.
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
