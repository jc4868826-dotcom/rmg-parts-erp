const getResumen = (_req, res) => res.json({
  venta_mes: 12400000,
  meta_mes: 20000000,
  pct_meta: 62,
  clientes_activos: 8,
  pipeline_activo: 3,
  cotizaciones_pendientes: 2,
  margen_bruto: 26.1,
  ticket_promedio: 428000,
})

const getVentas = (_req, res) => res.json({
  por_segmento: [
    { segmento: 'taller',        actual: 5200000, meta: 8000000 },
    { segmento: 'flota',         actual: 4100000, meta: 6000000 },
    { segmento: 'concesionario', actual: 2200000, meta: 4000000 },
    { segmento: 'construccion',  actual: 900000,  meta: 2000000 },
  ],
  por_semana: [
    { dia: 'Lun', venta: 1800000 },
    { dia: 'Mar', venta: 2100000 },
    { dia: 'Mié', venta: 1650000 },
    { dia: 'Jue', venta: 2400000 },
    { dia: 'Vie', venta: 2800000 },
    { dia: 'Sáb', venta: 1200000 },
  ],
})

const getProductos = (_req, res) => res.json([
  { codigo: '7000049', descripcion: 'AUSTER 5W30 4LT', ventas: 42, ingresos: 651000, margen: 25.8 },
  { codigo: '210016', descripcion: 'DOUBLE STAR 185/65 R15', ventas: 38, ingresos: 1330000, margen: 25.5 },
  { codigo: '352420', descripcion: 'YOKO 55AMP 55559', ventas: 31, ingresos: 1984000, margen: 24.3 },
  { codigo: '7000003', descripcion: 'AUSTER FE 5W30 1L', ventas: 28, ingresos: 117600, margen: 26.1 },
  { codigo: '244374', descripcion: 'KUMHO 275/60 R20 AT51', ventas: 22, ingresos: 4620000, margen: 24.7 },
])

const getClientes = (_req, res) => res.json({
  total: 8,
  activos: 4,
  pipeline: [
    { etapa: 'prospecto', count: 1 },
    { etapa: 'contactado', count: 2 },
    { etapa: 'cotizado', count: 1 },
    { etapa: 'negociando', count: 1 },
    { etapa: 'cliente', count: 3 },
  ],
})

const getCaja = (_req, res) => res.json({
  ingresos_mes: 12400000,
  cxc_pendiente: 3827001,
  cxc_vencida: 2000000,
  proyeccion_mes: 16000000,
})

const getAlertas = (_req, res) => res.json([
  { tipo: 'stock', msg: '3 SKUs bajo mínimo: 15W40 20L · N70Z · AT51', urgencia: 'alta' },
  { tipo: 'cxc',   msg: '2 facturas vencidas: $1.2M Taller Díaz · $800K Flota Norte', urgencia: 'alta' },
  { tipo: 'pipeline', msg: '4 prospectos sin actividad +7 días', urgencia: 'media' },
  { tipo: 'bot',   msg: '3 cotizaciones WhatsApp sin respuesta', urgencia: 'media' },
])

const exportExcel = (_req, res) => res.json({ ok: true, url: '/mock-exports/dashboard-junio-2026.xlsx' })

module.exports = { getResumen, getVentas, getProductos, getClientes, getCaja, getAlertas, exportExcel }
