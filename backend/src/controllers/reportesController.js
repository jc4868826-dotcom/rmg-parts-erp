const getVentas = (_req, res) => res.json({
  por_mes: [
    { mes: 'Ene', venta: 8200000, meta: 15000000 },
    { mes: 'Feb', venta: 9100000, meta: 15000000 },
    { mes: 'Mar', venta: 11500000, meta: 17000000 },
    { mes: 'Abr', venta: 10800000, meta: 17000000 },
    { mes: 'May', venta: 13200000, meta: 18000000 },
    { mes: 'Jun', venta: 12400000, meta: 20000000 },
  ],
})

const getInventario = (_req, res) => res.json({ ok: true, message: 'Reporte inventario (mock)' })

const getPipeline = (_req, res) => res.json({ ok: true, message: 'Reporte pipeline (mock)' })

const exportar = (_req, res) => res.json({ ok: true, url: '/mock-exports/reporte.xlsx' })

module.exports = { getVentas, getInventario, getPipeline, exportar }
