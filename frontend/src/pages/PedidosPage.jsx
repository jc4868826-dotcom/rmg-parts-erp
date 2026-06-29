import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP, formatFecha } from '@utils/format'
import { ShoppingCart } from 'lucide-react'

const ESTADOS = [
  { key: '', label: 'Todos' },
  { key: 'pendiente', label: 'Pendiente' },
  { key: 'confirmado', label: 'Confirmado' },
  { key: 'en_preparacion', label: 'En preparación' },
  { key: 'despachado', label: 'Despachado' },
  { key: 'entregado', label: 'Entregado' },
]

const ESTADO_STYLES = {
  pendiente:       { bg: 'rgba(90,143,168,0.12)',  color: 'rgba(90,143,168,0.9)' },
  confirmado:      { bg: 'rgba(56,182,255,0.12)',  color: 'var(--rmg-blt)' },
  en_preparacion:  { bg: 'rgba(244,162,60,0.12)',  color: 'var(--rmg-gold)' },
  despachado:      { bg: 'rgba(123,97,196,0.12)',  color: 'var(--rmg-purple)' },
  entregado:       { bg: 'rgba(45,201,138,0.12)',  color: 'var(--rmg-teal)' },
  anulado:         { bg: 'rgba(224,90,78,0.12)',   color: 'var(--rmg-red)' },
}

export default function PedidosPage() {
  const [estadoFiltro, setFiltro] = useState('')

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ['pedidos', estadoFiltro],
    queryFn: () => api.get('/pedidos', { params: { estado: estadoFiltro || undefined } }).then(r => r.data),
  })

  const totalPedidos = pedidos.reduce((s, p) => s + p.total, 0)

  return (
    <div className="space-y-5 animate-fade-in">

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Pedidos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>ERP · seguimiento de despachos</p>
        </div>
        <div className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: 'rgba(56,182,255,0.08)', color: 'var(--rmg-blt)', border: '1px solid rgba(56,182,255,0.2)' }}>
          {formatCLP(totalPedidos)} en curso
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-1 flex-wrap">
        {ESTADOS.map(e => (
          <button key={e.key} onClick={() => setFiltro(e.key)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={estadoFiltro === e.key
              ? { background: 'var(--rmg-blue)', color: '#fff' }
              : { background: 'rgba(255,255,255,0.04)', color: 'var(--rmg-muted)', border: '1px solid rgba(255,255,255,0.08)' }
            }>
            {e.label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="rmg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
              {['N° Pedido', 'Cliente', 'Estado', 'Total', 'Condición pago', 'Entrega programada', 'Guía despacho'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} /></td>
                    ))}
                  </tr>
                ))
              : pedidos.map((p, i) => {
                  const est = ESTADO_STYLES[p.estado] || ESTADO_STYLES.pendiente
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                      className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-bold" style={{ color: 'var(--rmg-blt)' }}>{p.numero}</td>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--rmg-off)' }}>{p.cliente}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full capitalize" style={{ background: est.bg, color: est.color }}>
                          {p.estado.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold precio-clp" style={{ color: 'var(--rmg-off)' }}>{formatCLP(p.total)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{p.condicion_pago}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: p.fecha_entrega_programada ? 'var(--rmg-off)' : 'var(--rmg-muted)' }}>
                        {p.fecha_entrega_programada ? formatFecha(p.fecha_entrega_programada) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: p.guia_despacho ? 'var(--rmg-teal)' : 'var(--rmg-muted)' }}>
                        {p.guia_despacho || '—'}
                      </td>
                    </tr>
                  )
                })
            }
          </tbody>
        </table>
        {!isLoading && pedidos.length === 0 && (
          <div className="py-16 text-center" style={{ color: 'var(--rmg-muted)' }}>
            <ShoppingCart size={32} className="mx-auto mb-3 opacity-30" />
            <p>No hay pedidos en este estado</p>
          </div>
        )}
      </div>
    </div>
  )
}
