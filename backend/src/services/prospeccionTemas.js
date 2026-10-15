/**
 * Temas de contenido para la prospección automática.
 * Un tema por semana: define a quién se le escribe (keywords sobre empresa +
 * rubro + segmento + notas, sin tildes, en mayúsculas) y qué se le dice.
 * Las imágenes viven en frontend/public/prospeccion/.
 * Las plantillas WhatsApp están aprobadas en la WABA "Comercial Rmg Limitada".
 */
module.exports = {
  plasticos_quimica_alimentos: {
    nombre: 'Plásticos, química y alimentos (semana 1)',
    keywords: ['PLAST', 'POLIM', 'EXTRU', 'ENVASE', 'EMBALAJ', 'PACKAG', 'FILM', 'QUIM', 'RESINA', 'PINTURA',
      'ALIMENT', 'FRIGOR', 'LACTE', 'BEBIDA', 'AGROIND', 'CONSERVAS'],
    rubro_plural: 'plantas de producción',
    falla_wa: 'el desgaste en cajas reductoras de extrusoras',
    asunto: '{nombre}, ¿cuánto le cuesta una hora de línea detenida?',
    asunto_sin_nombre: '{empresa}: ¿cuánto cuesta una hora de línea detenida?',
    cuerpo: [
      'En {empresa}, como en la mayoría de las {rubro_texto}, las detenciones no programadas casi nunca parten en el motor: parten en la lubricación. Las tres que más vemos:',
      'Para cada una hay un lubricante Vistony específico, con su ficha técnica.',
      '¿Le hago llegar la recomendación para sus equipos? Basta con responder este correo.',
    ],
    fallas: [
      'Cajas reductoras de extrusoras con desgaste por carga continua y paradas bruscas.',
      'Rodamientos de bombas de chillers lavados por la humedad.',
      'Grúas horquilla detenidas que dejan la tolva sin materia prima.',
    ],
    imagen_correo_archivo: '01_portada.jpg',
    imagen_wa_archivo: '02_falla_01.jpg',
    alt: 'Una extrusora parada no avisa. Estas 3 fallas sí.',
    wa_plantilla_1: 'rmgparts_seguimiento_correo_v1',
    wa_plantilla_2: 'rmgparts_pregunta_responsable_v1',
    variantes: [
      { keywords: ['PLAST', 'POLIM', 'EXTRU', 'ENVASE', 'EMBALAJ', 'PACKAG', 'FILM'], rubro_plural: 'plantas de plástico' },
      { keywords: ['QUIM', 'RESINA', 'PINTURA'], rubro_plural: 'plantas químicas' },
      { keywords: ['ALIMENT', 'FRIGOR', 'LACTE', 'BEBIDA', 'AGROIND', 'CONSERVAS'], rubro_plural: 'plantas de alimentos',
        falla_wa: 'el lavado de grasa en rodamientos de bombas y chillers', imagen_wa_archivo: '04_falla_02.jpg' },
    ],
  },
}
