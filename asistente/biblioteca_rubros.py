def obtener_perfil_rubro(query):
    q = query.lower()
    
    if any(k in q for k in ["grua", "grúa", "arrienda", "arriendo", "izaje", "montacarga", "forklift", "telescopica", "tractor"]):
        return {
            "nombre": "Flota de Arriendo de Grúas e Izaje / Maquinaria Agrícola",
            "perfil": "Parque mixto operando grúas horquilla, grúas móviles telescópicas y tractores de faena/agrícolas.",
            "dolor": "Cizallamiento térmico en plumas hidráulicas (caída de pluma), desgaste abrasivo en tornamesas/cables de giro, cristalización en frenos húmedos de tractores, fallas de voltaje en sensores LMI y cortes de neumático en terreno agreste.",
            "ataque": "Oferta mayorista integral 360 por máquina (Fluidos + Grasas + Baterías + Neumáticos) para blindar la continuidad operativa.",
            "grupos_maquinas": [
                {
                    "maquina": "🏗️ BLOQUE 1: GRÚAS TELESCÓPICAS E IZAJE INDUSTRIAL",
                    "necesidades": [
                        {"rol": "Sistema Hidráulico Central", "kw": "DRAULA H 68", "envase": "Tambor/Cilindro", "que_es": "Fluido Hidráulico Anti-Cizallamiento ISO 68"},
                        {"rol": "Tornamesa y Cables de Izaje", "kw": "EP-2 LITHIUM MULTIPROPOSITO ROJO", "envase": "Balde", "que_es": "Grasa de Litio Extrema Presión EP-2 Anti-Agua"},
                        {"rol": "Electrónica Crítica / LMI 24V", "kw": "N150", "envase": "Unidad", "que_es": "Batería Heavy Duty 150Ah (1000 CCA) Anti-Vibración"},
                        {"rol": "Rodaje y Tracción Ejes Pesados", "kw": "295/80 R22.5", "envase": "Unidad", "que_es": "Neumático OTR Tracción/Direccional 18 Telas"}
                    ]
                },
                {
                    "maquina": "🚜 BLOQUE 2: TRACTORES DE FAENA Y AGRÍCOLAS",
                    "necesidades": [
                        {"rol": "Transmisión y Frenos Húmedos", "kw": "TRAKOIL", "envase": "Balde", "que_es": "Fluido Agrícola Multifuncional UTTO 10W-30"},
                        {"rol": "Motor Diésel Trabajo Severo", "kw": "RAYGOLD", "envase": "Balde", "que_es": "Lubricante Motor Diésel 15W-40 CK-4 Low SAPS"},
                        {"rol": "Articulaciones e Implementos", "kw": "EP-2 LITHIUM MULTIPROPOSITO ROJO", "envase": "Balde", "que_es": "Grasa de Litio Extrema Presión EP-2"},
                        {"rol": "Arranque Eléctrico en Frío", "kw": "N100L", "envase": "Unidad", "que_es": "Batería Heavy Duty 100Ah Rejilla Reforzada"},
                        {"rol": "Tracción Terreno Blando / Barro", "kw": "1200 R24", "envase": "Unidad", "que_es": "Neumático Tracción Agrícola/Implemento 20 Telas"}
                    ]
                }
            ]
        }
        
    if any(k in q for k in ["arido", "playa", "pozo", "cantera", "excavadora", "mineria", "tolva", "arena", "costa"]):
        return {
            "nombre": "Extracción de Áridos / Movimiento de Tierras en Terreno Severo",
            "perfil": "Operación pesada con excavadoras sobre orugas, cargadores frontales y camiones tolva pesados.",
            "dolor": "Corrosión salina acelerada, abrasión por arena/sílice, cizallamiento térmico hidráulico, vibración destructiva en baterías y desgarros de neumáticos en roca angular.",
            "ataque": "Blindaje industrial 360 en volumen agrupado por máquina (Aceites + Grasas + Baterías + Neumáticos Mineros).",
            "grupos_maquinas": [
                {
                    "maquina": "⛏️ BLOQUE 1: EXCAVADORAS Y CARGADORES FRONTALES",
                    "necesidades": [
                        {"rol": "Sistema Hidráulico Severo", "kw": "DRAULA H 68", "envase": "Tambor/Cilindro", "que_es": "Fluido Hidráulico Anti-Cizallamiento ISO 68"},
                        {"rol": "Pasadores y Chumaceras", "kw": "EP-2 LITHIUM MULTIPROPOSITO ROJO", "envase": "Balde", "que_es": "Grasa de Litio Extrema Presión EP-2 Anti-Agua"},
                        {"rol": "Motor Diésel Trabajo Pesado", "kw": "FORZA PLUS SAE 15W40", "envase": "Tambor/Cilindro", "que_es": "Lubricante Motor Diésel 15W-40 CI-4 Alto TBN"},
                        {"rol": "Arranque en Frío / Faena", "kw": "N150", "envase": "Unidad", "que_es": "Batería Heavy Duty 150Ah Rejilla Reforzada"},
                        {"rol": "Tracción Ejes Pala Cargadora", "kw": "1200 R24", "envase": "Unidad", "que_es": "Neumático Minero/Implemento 20 Telas (20PR)"}
                    ]
                },
                {
                    "maquina": "🚛 BLOQUE 2: CAMIONES TOLVA Y TRANSPORTE PESADO",
                    "necesidades": [
                        {"rol": "Motor Diésel Euro V/VI", "kw": "RAYGOLD", "envase": "Tambor/Cilindro", "que_es": "Lubricante Motor Diésel 15W-40 CK-4 Low SAPS"},
                        {"rol": "Diferenciales y Mandos", "kw": "GEAR OIL GL-5 SAE 85W90", "envase": "Balde", "que_es": "Aceite de Engranajes Extrema Presión GL-5"},
                        {"rol": "Chasis y Crucetas", "kw": "EP-2 LITHIUM MULTIPROPOSITO ROJO", "envase": "Balde", "que_es": "Grasa de Litio Extrema Presión EP-2"},
                        {"rol": "Bancada Eléctrica 24V", "kw": "N100L", "envase": "Unidad", "que_es": "Batería Heavy Duty 100Ah Rejilla Reforzada"},
                        {"rol": "Tracción Ejes Pesados", "kw": "295/80 R22.5", "envase": "Unidad", "que_es": "Neumático OTR Tracción 18 Telas"}
                    ]
                }
            ]
        }
        
    return {
        "nombre": "Auditoría Integral de Mantenimiento 360° B2B - RMG Parts",
        "perfil": "Cliente industrial o faenero con parque electromecánico diverso.",
        "dolor": "Paradas no programadas, desgaste prematuro por lubricación incorrecta, fallas eléctricas y sobrecostos en rodaje.",
        "ataque": "Desplegar la matriz integral 360 de RMG Parts en formatos de volumen B2B.",
        "grupos_maquinas": [
            {
                "maquina": "🏭 BLOQUE OPERATIVO GENERAL INDUSTRIAL (360°)",
                "necesidades": [
                    {"rol": "Sistema Hidráulico Central", "kw": "DRAULA H 68", "envase": "Balde", "que_es": "Fluido Hidráulico Anti-Cizallamiento ISO 68"},
                    {"rol": "Motores Diésel Flota", "kw": "RAYGOLD", "envase": "Tambor/Cilindro", "que_es": "Lubricante Motor Diésel 15W-40 CK-4"},
                    {"rol": "Rodamientos y Chasis", "kw": "EP-2 LITHIUM MULTIPROPOSITO ROJO", "envase": "Balde", "que_es": "Grasa de Litio Extrema Presión EP-2"},
                    {"rol": "Arranque Maquinaria Pesada", "kw": "N100L", "envase": "Unidad", "que_es": "Batería Heavy Duty 100Ah Rejilla Reforzada"},
                    {"rol": "Rodaje Flota Logística/Carga", "kw": "295/80 R22.5", "envase": "Unidad", "que_es": "Neumático Tracción/Direccional 18 Telas"}
                ]
            }
        ]
    }
