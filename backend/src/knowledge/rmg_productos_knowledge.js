const RMG_KNOWLEDGE = {
  empresa: `RMG Auto Parts es un distribuidor B2B de insumos automotrices e industriales en Santiago, Chile.
Opera bajo tres líneas de proveedor: Cristian Hughes (Platin, Shell), Vistony (Attom, Sintek, Forza, Blindax, Draula, Lotox), SalfaSur (Auster, Kumho, Yoko G&B).
Segmentos: Talleres, Concesionarios, Flotas, Agrícola, Minería, Construcción, Industria.`,

  por_segmento: {
    "Talleres": {
      necesidades: "Cambio de aceite frecuente, lubricantes para motor gasolina y diesel, líquidos de freno, refrigerantes, filtros. Ciclo de compra semanal o quincenal.",
      productos_clave: ["ATTOM S310 5W-30/5W-40", "SINTEK S210 10W-40", "FORZA PLUS 15W-40", "DOT 4", "ICE FREEZE OAT 50/50", "Grasa EP Lithium"],
      argumento: "Precio mayorista, entrega rápida, stock garantizado, variedad de marcas."
    },
    "Flotas": {
      necesidades: "Diesel multigrado, transmisiones, refrigerante HD, grasas para chasis. Volumen alto, contrato mensual.",
      productos_clave: ["VOLTEK C300 15W-40", "FORZA RAYGOLD 15W-40", "FORZA TURBO 25W-60", "TRANSMEC DUAL", "GRASA CHASIS SUPER H", "ICE FREEZE HEAVY DUTY"],
      argumento: "Precio por volumen, crédito a 30 días, entrega programada en sus instalaciones."
    },
    "Construcción": {
      necesidades: "Hidráulicos para retroexcavadoras y grúas, diesel para generadores, grasas para maquinaria pesada, transmisiones.",
      productos_clave: ["DRAULA HT ISO 46/68", "DRAULA H ISO 32/46/68", "DRAULACAT TO-4", "FORZA PLUS 15W-40", "GRASA NANOLITHIUM WS2", "SULFONATO DE CALCIO"],
      argumento: "Disponibilidad en bidones 5G y 55G, despacho a obra, productos certificados."
    },
    "Industria": {
      necesidades: "Reductores, compresores, turbinas, guías, herramientas neumáticas. Consumo técnico especializado.",
      productos_clave: ["VELTRON SYNTH ISO 150-460", "VELTRON EP ISO 68-680", "COMPRESSOR OIL RSP SYNTH", "AIR COMPRESSOR OIL", "HIDRAROLY ZF", "WAY OIL"],
      argumento: "Catálogo industrial completo, ficha técnica disponible, asesoría técnica incluida."
    },
    "Minería": {
      necesidades: "Lubricantes para equipos móviles pesados, hidráulicos de alta performance, transmisiones Caterpillar.",
      productos_clave: ["VOLTEK C300 15W-40 (55G)", "FORZA RAYGOLD 15W-40 (55G)", "DRAULACAT TO-4", "TRAKOIL 10W-30", "GRASA NANOLITHIUM WS2"],
      argumento: "Presentaciones de tambor 55G, cumplimiento de specs OEM, entrega en faena."
    },
    "Agrícola": {
      necesidades: "Diesel para tractores, transmisiones, hidráulicos de implementos, refrigerante, grasas.",
      productos_clave: ["FORZA RAYGOLD 15W-40", "TRANSMEC DUAL GL-4", "DRAULA H ISO 46", "GRASA EP LITHIUM NLGI 2", "ICE FREEZE OAT 50/50"],
      argumento: "Stock disponible en temporada, crédito estacional, asesoría según tipo de maquinaria."
    },
    "Concesionarios": {
      necesidades: "Aceites sintéticos premium para servicio oficial, refrigerantes OAT, líquidos de freno DOT 4/5.1.",
      productos_clave: ["ATTOM S310 5W-30", "ATTOM S320 5W-30", "BRIKSON ATF CVT-F", "DOT 4", "DOT 5.1", "ICE FREEZE OAT 50/50"],
      argumento: "Calidad certificada para garantías, precios competitivos vs distribuidor oficial."
    }
  },

  guiones_por_rubro: {
    "CONSTRUCCION": `Estimado jefe de mantención, en RMG Auto Parts trabajamos con constructoras como la suya.\nPara sus retroexcavadoras y grúas tenemos DRAULA HT (hidráulico ISO 46/68) y DRAULACAT TO-4 para equipos Caterpillar.\nPara los grupos generadores y camiones de obra: FORZA PLUS 15W-40 en bidones de 5 y 55 galones.\nDespacho directo a obra, precio mayorista. ¿Le interesa una cotización?`,
    "FABRICACION E INDUSTRIA": `Estimado, en RMG Auto Parts tenemos la línea industrial completa de Vistony:\nVELTRON SYNTH para reductores (ISO 150 a 680), COMPRESSOR OIL RSP SYNTH para compresores de tornillo,\nDRAULA H para sistemas hidráulicos. Somos distribuidores B2B con entrega en Santiago.\n¿Qué equipos necesitan lubricar?`,
    "MINERA": `En RMG Auto Parts distribuimos lubricantes para minería: VOLTEK C300 15W-40 sintético para motores de equipos pesados,\nDRAULACAT TO-4 y TRAKOIL para transmisiones y sistemas hidráulicos de equipos móviles.\nTodo disponible en tambores de 55 galones con despacho coordinado. ¿Qué equipos tienen en faena?`,
    "AGRICOLA": `Estimado, para la temporada agrícola RMG Auto Parts tiene lo que sus tractores y maquinaria necesitan:\nFORZA RAYGOLD 15W-40 para motores diesel, TRANSMEC DUAL GL-4 para cajas manuales,\nDRAULA H para sistemas hidráulicos de implementos. Precio mayorista, crédito estacional disponible.`,
    "TRANSPORTE": `Para su flota de camiones, RMG Auto Parts tiene VOLTEK C300 y FORZA TURBO para motores diesel exigentes,\nBRIKSON HD SYNTH ATF A8 para transmisiones Allison, GRASA CHASIS SUPER H para engrases de chasis.\nPrecios por volumen y entrega programada según sus rutas.`,
    "FLOTA BUSES": `Para flotas de buses RMG Auto Parts ofrece FORZA PLUS 15W-40 y FORZA VIS 5W-40 para motores diesel,\nTRANSMEC DUAL para cajas manuales, DOT 4 para frenos.\nPrecios mayoristas, contrato mensual con entrega en terminal.`
  }
}

module.exports = { RMG_KNOWLEDGE }
