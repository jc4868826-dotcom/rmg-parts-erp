/**
 * Mensajes iniciales por segmento (prospección automática). Se cargan una sola
 * vez en la migración prospeccion_auto_v2; después se editan desde el panel
 * (pestaña Mensajes) y cada cambio exige volver a validar antes de enviar.
 * Variables: {nombre} primer nombre del contacto, {empresa} razón social.
 * Imágenes en frontend/public/prospeccion/.
 */
module.exports = [
  {
    segmento: 'Industria',
    nombre: 'Fábricas e industria',
    asunto: '{nombre}, ¿cuánto le cuesta una hora de línea detenida?',
    asunto_sin_nombre: '{empresa}: ¿cuánto cuesta una hora de línea detenida?',
    parrafo1: 'En {empresa}, como en la mayoría de las plantas productivas, las detenciones no programadas casi nunca parten en el motor: parten en la lubricación. Las tres que más vemos:',
    fallas: [
      'Reductores y cajas de engranajes con desgaste por carga continua y paradas bruscas.',
      'Rodamientos de motores eléctricos y bombas que pierden la grasa por humedad o temperatura.',
      'Grúas horquilla detenidas que dejan la línea sin abastecimiento.',
    ],
    parrafo2: 'Para cada una hay un lubricante Vistony específico, con su ficha técnica.',
    parrafo3: '¿Le hago llegar la recomendación para sus equipos? Basta con responder este correo.',
    imagen_correo: 'seg_industria_correo.jpg',
    imagen_wa: 'seg_industria_wa.jpg',
    wa_falla: 'el desgaste en reductores y rodamientos de planta',
    wa_rubro: 'plantas productivas',
  },
  {
    segmento: 'Construcción',
    nombre: 'Construcción',
    asunto: '{nombre}, una máquina parada en obra cuesta más que el aceite',
    asunto_sin_nombre: '{empresa}: una máquina parada en obra cuesta más que el aceite',
    parrafo1: 'En {empresa}, como en la mayoría de las constructoras, la maquinaria se detiene menos por fallas mecánicas que por una lubricación mal elegida o a destiempo. Las tres que más vemos:',
    fallas: [
      'Sistemas hidráulicos de retroexcavadoras y excavadoras que pierden presión con aceite contaminado o degradado.',
      'Motores diésel trabajando con polvo y carga, con hollín y desgaste acelerado.',
      'Pasadores y bujes sin la grasa adecuada, que se gastan antes de tiempo.',
    ],
    parrafo2: 'Para cada una hay un lubricante Vistony específico, con su ficha técnica.',
    parrafo3: '¿Le hago llegar la recomendación para su maquinaria? Basta con responder este correo.',
    imagen_correo: 'seg_construccion_correo.jpg',
    imagen_wa: 'seg_construccion_wa.jpg',
    wa_falla: 'las fallas hidráulicas en retroexcavadoras y excavadoras',
    wa_rubro: 'obras de construcción',
  },
  {
    segmento: 'Agrícola',
    nombre: 'Agrícola',
    asunto: '{nombre}, ¿su maquinaria está lista para la temporada?',
    asunto_sin_nombre: '{empresa}: ¿su maquinaria está lista para la temporada?',
    parrafo1: 'En {empresa}, como en la mayoría de los campos y agroindustrias, la máquina que falla en plena temporada cuesta la cosecha, no solo el repuesto. Las tres fallas de lubricación que más vemos:',
    fallas: [
      'Transmisiones e hidráulicos de tractores trabajando con un aceite que no es el especificado.',
      'Motores diésel con cambios de aceite atrasados en plena faena.',
      'Rodamientos y articulaciones expuestos a agua y barro sin la grasa correcta.',
    ],
    parrafo2: 'Para cada una hay un lubricante Vistony específico, con su ficha técnica.',
    parrafo3: '¿Le hago llegar la recomendación para sus equipos? Basta con responder este correo.',
    imagen_correo: 'seg_agricola_correo.jpg',
    imagen_wa: 'seg_agricola_wa.jpg',
    wa_falla: 'las fallas de transmisión e hidráulica en tractores',
    wa_rubro: 'faenas agrícolas',
  },
]
