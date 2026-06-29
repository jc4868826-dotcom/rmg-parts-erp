import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP, formatFecha } from '@utils/format'
import { FileText, Printer, Download } from 'lucide-react'

function VistaFactura({ pedido, cotizacion }) {
  const numero = pedido?.factura_numero || pedido?.numero?.replace('PED-', 'F-') || 'F-2026-001'
  const fecha  = formatFecha(pedido?.created_at || new Date().toISOString())
  const items  = cotizacion?.items || []

  return (
    <div id="factura-print" style={{
      background: '#fff', color: '#000', padding: '40px',
      maxWidth: 680, margin: '0 auto', fontFamily: 'Arial, sans-serif',
    }}>
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 32, borderBottom: '2px solid #1b8fd4', paddingBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#050f1c', letterSpacing: 1 }}>RMG AUTO PARTS</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>Distribuidora mayorista automotriz · Santiago RM</div>
          <div style={{ fontSize: 11, color: '#555' }}>contacto@rmgautoparts.cl · +56 9 XXXX XXXX</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1b8fd4' }}>NOTA DE VENTA</div>
          <div style={{ fontSize: 20, fontWeight: 900, fontFamily: 'monospace', color: '#050f1c' }}>{numero}</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>Fecha: {fecha}</div>
          <div style={{ fontSize: 11, color: '#555' }}>Válida como pre-factura</div>
        </div>
      </div>

      {/* Cliente */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        <div style={{ background: '#f8faff', padding: 16, borderRadius: 8, border: '1px solid #e0ecff' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#1b8fd4', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Cliente</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{pedido?.cliente || '—'}</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>Condición: {pedido?.condicion_pago || 'Contado'}</div>
          {pedido?.direccion_entrega && <div style={{ fontSize: 11, color: '#555' }}>Entrega: {pedido.direccion_entrega}</div>}
        </div>
        <div style={{ background: '#f8faff', padding: 16, borderRadius: 8, border: '1px solid #e0ecff' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#1b8fd4', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Pedido</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{pedido?.numero || '—'}</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>Estado: {pedido?.estado || '—'}</div>
          {pedido?.fecha_entrega_programada && <div style={{ fontSize: 11, color: '#555' }}>Entrega programada: {formatFecha(pedido.fecha_entrega_programada)}</div>}
        </div>
      </div>

      {/* Tabla productos */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
        <thead>
          <tr style={{ background: '#1b8fd4', color: '#fff' }}>
            {['Código','Descripción','Cant.','Precio neto','Dto %','Subtotal neto'].map(h => (
              <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Descripción' ? 'left' : 'right', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8faff', borderBottom: '1px solid #e8eff8' }}>
              <td style={{ padding: '7px 10px', fontSize: 11, fontFamily: 'monospace', color: '#1b8fd4', textAlign: 'right' }}>{item.codigo}</td>
              <td style={{ padding: '7px 10px', fontSize: 11 }}>{item.descripcion}</td>
              <td style={{ padding: '7px 10px', fontSize: 11, textAlign: 'right' }}>{item.cantidad}</td>
              <td style={{ padding: '7px 10px', fontSize: 11, textAlign: 'right' }}>{formatCLP(item.precio_unitario)}</td>
              <td style={{ padding: '7px 10px', fontSize: 11, textAlign: 'right' }}>{item.descuento_pct || 0}%</td>
              <td style={{ padding: '7px 10px', fontSize: 11, textAlign: 'right', fontWeight: 700 }}>{formatCLP(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totales */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
        <div style={{ width: 260 }}>
          {[
            { label: 'Neto', value: pedido?.neto },
            { label: 'IVA (19%)', value: pedido?.iva },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #eee', fontSize: 12 }}>
              <span style={{ color: '#555' }}>{r.label}</span>
              <span style={{ fontWeight: 600 }}>{formatCLP(r.value)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', marginTop: 4, background: '#1b8fd4', borderRadius: 6, color: '#fff' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>TOTAL</span>
            <span style={{ fontWeight: 900, fontSize: 16, fontFamily: 'monospace' }}>{formatCLP(pedido?.total)}</span>
          </div>
        </div>
      </div>

      {/* Pie */}
      <div style={{ borderTop: '1px solid #e0ecff', paddingTop: 16, fontSize: 10, color: '#888', display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>RMG Auto Parts — Distribuidora Mayorista Automotriz</div>
          <div>Esta nota de venta no tiene valor tributario. Documento de referencia comercial.</div>
          <div>La factura oficial se emite mediante SII una vez confirmado el pago.</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700 }}>Entrega: 4–24 hrs RM</div>
          <div>KUMHO · AUSTER · YOKO G&B · Double Star</div>
        </div>
      </div>
    </div>
  )
}

export default function FacturaPage() {
  const [pedidoId, setPedidoId] = useState('')

  const { data: pedidos = [] } = useQuery({
    queryKey: ['pedidos'],
    queryFn: () => api.get('/pedidos').then(r => r.data),
  })

  const pedidoSel = pedidos.find(p => p.id === pedidoId || p.numero === pedidoId)

  const { data: cotizacion } = useQuery({
    queryKey: ['cotizacion', pedidoSel?.cotizacion_id],
    queryFn: () => api.get(`/cotizaciones/${pedidoSel.cotizacion_id}`).then(r => r.data),
    enabled: Boolean(pedidoSel?.cotizacion_id),
  })

  const handlePrint = () => {
    const content = document.getElementById('factura-print')
    if (!content) return
    const win = window.open('', '_blank')
    win.document.write(`
      <html><head><title>Nota de Venta ${pedidoSel?.numero || ''}</title>
      <style>body{margin:0;padding:0;}</style></head>
      <body>${content.outerHTML}</body></html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  return (
    <div className="space-y-5 animate-fade-in">

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Notas de Venta / Factura</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Genera documentos de venta desde un pedido</p>
        </div>
        {pedidoSel && (
          <button onClick={handlePrint} className="btn-primary flex items-center gap-2">
            <Printer size={15}/> Imprimir / PDF
          </button>
        )}
      </div>

      {/* Selector pedido */}
      <div className="rmg-card p-5">
        <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Seleccionar pedido</label>
        <select className="rmg-input max-w-md" value={pedidoId} onChange={e => setPedidoId(e.target.value)}>
          <option value="">Seleccionar pedido...</option>
          {pedidos.map(p => (
            <option key={p.id} value={p.id}>{p.numero} — {p.cliente} — {formatCLP(p.total)}</option>
          ))}
        </select>
        <p className="text-xs mt-2" style={{ color: 'var(--rmg-muted)' }}>
          Solo pedidos con cotización asociada generan detalle de productos completo.
        </p>
      </div>

      {/* Vista previa */}
      {!pedidoId ? (
        <div className="rmg-card flex flex-col items-center justify-center py-24" style={{ color: 'var(--rmg-muted)' }}>
          <FileText size={48} className="mb-4 opacity-15"/>
          <p className="text-sm">Selecciona un pedido para generar la nota de venta</p>
        </div>
      ) : (
        <div className="rmg-card p-4 overflow-auto">
          <VistaFactura pedido={pedidoSel} cotizacion={cotizacion}/>
        </div>
      )}
    </div>
  )
}
