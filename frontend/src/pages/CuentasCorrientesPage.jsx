/**
 * RMG Parts — Cuentas Corrientes de Clientes
 * Vista consolidada por cliente de sus compras reales (tabla `ventas`, la
 * única fuente de verdad transaccional — no `facturas_cxc`, que se llena
 * solo manualmente y en la práctica queda casi vacía). Solo lista clientes
 * activos que tienen al menos un movimiento, filtrable por nombre/RUT,
 * segmento y rango de fechas, con detalle de compras, productos y pagos.
 */
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP, formatFecha, labelSegmento, colorSegmento } from '@utils/format'
import {
  Search, X, Wallet, Users, ChevronDown, ChevronRight, Calendar,
  Package, Clock, Check, AlertCircle,
} from 'lucide-react'

const SEGMENTOS = ['taller', 'flota', 'concesionario', 'construccion']

const ESTADO_VENTA_STYLE = {
  Pagado:    { label: 'Pagado',    color: 'var(--rmg-teal)', bg: 'rgba(45,201,138,0.12)', icon: Check },
  Pendiente: { label: 'Pendiente', color: 'var(--rmg-gold)', bg: 'rgba(244,162,60,0.12)', icon: Clock },
  Anulado:   { label: 'Anulado',   color: 'var(--rmg-red)',  bg: 'rgba(224,90,78,0.12)',  icon: AlertCircle },
}

function formatFechaHora(createdAt, fechaFallback) {
  if (!createdAt) return formatFecha(fechaFallback)
  const d = new Date(createdAt.replace(' ', 'T'))
  if (isNaN(d.getTime())) return formatFecha(fechaFallback)
  const fecha = d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
  const hora  = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  return `${fecha} · ${hora}`
}

// ─── Detalle de un cliente: historial completo de ventas + productos ──────────

function VentaRow({ v }) {
  const [open, setOpen] = useState(false)
  const est = ESTADO_VENTA_STYLE[v.estado] || ESTADO_VENTA_STYLE.Pendiente
  const EstIcon = est.icon

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(15, 35, 60,0.07)' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/[0.02]"
        style={{ background: 'rgba(15, 35, 60,0.015)' }}>
        {open ? <ChevronDown size={14} style={{ color: 'var(--rmg-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--rmg-muted)' }} />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold" style={{ color: 'var(--rmg-blt)' }}>{v.numero_documento}</span>
            <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{v.tipo_documento}</span>
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>
            {formatFechaHora(v.created_at, v.fecha)}{v.vendedor_nombre ? ` · emitido por ${v.vendedor_nombre}` : ''}
          </div>
        </div>
        <span className="text-xs font-medium" style={{ color: 'var(--rmg-off)' }}>{v.forma_pago}</span>
        <span className="flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
          style={{ background: est.bg, color: est.color }}>
          <EstIcon size={11} />{est.label}
        </span>
        <span className="font-bold text-sm precio-clp w-28 text-right" style={{ color: 'var(--rmg-off)' }}>{formatCLP(v.total)}</span>
      </button>
      {open && (
        <div className="px-4 py-3" style={{ borderTop: '1px solid rgba(15, 35, 60,0.06)' }}>
          {v.items?.length ? (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: 'var(--rmg-muted)' }}>
                  <th className="text-left font-semibold uppercase tracking-wider pb-2">SKU</th>
                  <th className="text-left font-semibold uppercase tracking-wider pb-2">Producto</th>
                  <th className="text-right font-semibold uppercase tracking-wider pb-2">Cant.</th>
                  <th className="text-right font-semibold uppercase tracking-wider pb-2">P. Unit.</th>
                  <th className="text-right font-semibold uppercase tracking-wider pb-2">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {v.items.map((i, idx) => (
                  <tr key={i.id || idx} style={{ borderTop: '1px solid rgba(15, 35, 60,0.05)' }}>
                    <td className="py-1.5 font-mono" style={{ color: 'var(--rmg-blt)' }}>{i.sku || '—'}</td>
                    <td className="py-1.5" style={{ color: 'var(--rmg-off)' }}>{i.descripcion}</td>
                    <td className="py-1.5 text-right precio-clp" style={{ color: 'var(--rmg-muted)' }}>{i.cantidad}</td>
                    <td className="py-1.5 text-right precio-clp" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(i.precio_unitario)}</td>
                    <td className="py-1.5 text-right precio-clp font-semibold" style={{ color: 'var(--rmg-off)' }}>{formatCLP(i.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Sin productos registrados</p>
          )}
          {v.fecha_pago && (
            <p className="text-xs mt-2" style={{ color: 'var(--rmg-teal)' }}>Pagado el {formatFecha(v.fecha_pago)}</p>
          )}
        </div>
      )}
    </div>
  )
}

function ClienteDetalleModal({ cliente, onClose }) {
  const { data: ventas = [], isLoading } = useQuery({
    queryKey: ['ventas-cliente-cc', cliente.cliente_id],
    queryFn: () => api.get('/ventas', { params: { cliente_id: cliente.cliente_id } }).then(r => r.data),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="rmg-card w-full max-w-3xl mx-4 max-h-[88vh] flex flex-col animate-fade-in"
        style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>

        <div className="flex items-start justify-between p-5 border-b" style={{ borderColor: 'rgba(15, 35, 60,0.07)' }}>
          <div>
            <h2 className="font-black text-lg" style={{ fontFamily: 'Inter Tight, sans-serif' }}>{cliente.nombre}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {cliente.rut_formateado && <span className="text-xs font-mono" style={{ color: 'var(--rmg-muted)' }}>{cliente.rut_formateado}</span>}
              {cliente.segmento && (
                <span className="text-xs font-semibold" style={{ color: colorSegmento(cliente.segmento) }}>{labelSegmento(cliente.segmento)}</span>
              )}
              {(cliente.telefono || cliente.celular) && (
                <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{cliente.celular || cliente.telefono}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors" style={{ color: 'var(--rmg-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Resumen cuenta corriente */}
        <div className="grid grid-cols-4 gap-3 p-5 pb-0">
          {[
            { label: 'Compras', value: cliente.num_compras, color: 'var(--rmg-blt)', isCurrency: false },
            { label: 'Total comprado', value: cliente.total_comprado, color: 'var(--rmg-off)' },
            { label: 'Total pagado', value: cliente.total_pagado, color: 'var(--rmg-teal)' },
            { label: 'Saldo pendiente', value: cliente.saldo_pendiente, color: cliente.saldo_pendiente > 0 ? 'var(--rmg-gold)' : 'var(--rmg-muted)' },
          ].map(k => (
            <div key={k.label} className="rounded-lg p-3" style={{ background: 'rgba(15, 35, 60,0.03)', border: '1px solid rgba(15, 35, 60,0.06)' }}>
              <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>{k.label}</div>
              <div className="font-black text-base precio-clp" style={{ color: k.color }}>
                {k.isCurrency === false ? k.value : formatCLP(k.value)}
              </div>
            </div>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-2">
          <p className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Historial de compras</p>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: 'rgba(15, 35, 60,0.05)' }} />)}
            </div>
          ) : ventas.length === 0 ? (
            <div className="py-10 text-center" style={{ color: 'var(--rmg-muted)' }}>
              <Package size={26} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin compras registradas</p>
            </div>
          ) : (
            ventas.map(v => <VentaRow key={v.id} v={v} />)
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ───────────────────────────────────────────────────────

export default function CuentasCorrientesPage() {
  const [search, setSearch]     = useState('')
  const [debouncedQ, setDQ]     = useState('')
  const [segmento, setSegmento] = useState('')
  const [desde, setDesde]       = useState('')
  const [hasta, setHasta]       = useState('')
  const [clienteSel, setClienteSel] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => setDQ(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ['cxc-clientes', debouncedQ, segmento, desde, hasta],
    queryFn: () => api.get('/cxc/clientes', {
      params: {
        q: debouncedQ || undefined,
        segmento: segmento || undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
      },
    }).then(r => r.data),
  })

  const totales = clientes.reduce((acc, c) => ({
    total_comprado: acc.total_comprado + (c.total_comprado || 0),
    total_pagado:   acc.total_pagado + (c.total_pagado || 0),
    saldo_pendiente: acc.saldo_pendiente + (c.saldo_pendiente || 0),
  }), { total_comprado: 0, total_pagado: 0, saldo_pendiente: 0 })

  const hayFiltros = search || segmento || desde || hasta

  return (
    <div className="space-y-5 animate-fade-in">

      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(56,182,255,0.12)' }}>
          <Wallet size={17} style={{ color: 'var(--rmg-blt)' }} />
        </div>
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Cuentas Corrientes</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Clientes activos con movimientos — compras, productos y pagos</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Clientes con movimientos', value: clientes.length, color: 'var(--rmg-blt)', isCurrency: false },
          { label: 'Total comprado',  value: totales.total_comprado,  color: 'var(--rmg-off)' },
          { label: 'Total pagado',    value: totales.total_pagado,    color: 'var(--rmg-teal)' },
          { label: 'Saldo pendiente', value: totales.saldo_pendiente, color: totales.saldo_pendiente > 0 ? 'var(--rmg-gold)' : 'var(--rmg-muted)' },
        ].map(k => (
          <div key={k.label} className="rmg-card p-4">
            <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>{k.label}</div>
            <div className="font-black text-2xl precio-clp" style={{ fontFamily: 'Inter Tight, sans-serif', color: k.color }}>
              {isLoading ? '—' : (k.isCurrency === false ? k.value : formatCLP(k.value))}
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="rmg-card p-4 flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-52">
          <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Buscar</label>
          <Search size={14} className="absolute left-3 top-[calc(50%+9px)] -translate-y-1/2 pointer-events-none" style={{ color: 'var(--rmg-muted)' }} />
          <input className="rmg-input pl-9 w-full" placeholder="Nombre o RUT del cliente..."
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-[calc(50%+9px)] -translate-y-1/2" style={{ color: 'var(--rmg-muted)' }}>
              <X size={13} />
            </button>
          )}
        </div>
        <div style={{ minWidth: 170 }}>
          <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Segmento</label>
          <select className="rmg-input w-full" value={segmento} onChange={e => setSegmento(e.target.value)}>
            <option value="">Todos los segmentos</option>
            {SEGMENTOS.map(s => <option key={s} value={s}>{labelSegmento(s)}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 150 }}>
          <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Desde</label>
          <input type="date" className="rmg-input w-full" value={desde} onChange={e => setDesde(e.target.value)} />
        </div>
        <div style={{ minWidth: 150 }}>
          <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Hasta</label>
          <input type="date" className="rmg-input w-full" value={hasta} onChange={e => setHasta(e.target.value)} />
        </div>
        {hayFiltros && (
          <button onClick={() => { setSearch(''); setSegmento(''); setDesde(''); setHasta('') }}
            className="text-xs underline px-1 pb-2.5" style={{ color: 'var(--rmg-blt)' }}>
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Tabla clientes */}
      <div className="rmg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(15, 35, 60,0.02)' }}>
                {['Cliente', 'Segmento', 'N° Compras', 'Total Comprado', 'Total Pagado', 'Saldo Pendiente', 'Última Compra', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold whitespace-nowrap" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(15, 35, 60,0.06)' }} /></td>
                      ))}
                    </tr>
                  ))
                : clientes.map((c, i) => (
                    <tr key={c.cliente_id} onClick={() => setClienteSel(c)}
                      className="cursor-pointer transition-colors hover:bg-black/[0.02]"
                      style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)', background: i % 2 ? 'transparent' : 'rgba(15, 35, 60,0.01)' }}>
                      <td className="px-4 py-3">
                        <div className="font-semibold" style={{ color: 'var(--rmg-off)' }}>{c.nombre}</div>
                        {c.rut_formateado && <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{c.rut_formateado}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {c.segmento && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: `${colorSegmento(c.segmento)}18`, color: colorSegmento(c.segmento) }}>
                            {labelSegmento(c.segmento)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold precio-clp" style={{ color: 'var(--rmg-off)' }}>{c.num_compras}</td>
                      <td className="px-4 py-3 font-bold precio-clp" style={{ color: 'var(--rmg-off)' }}>{formatCLP(c.total_comprado)}</td>
                      <td className="px-4 py-3 precio-clp" style={{ color: 'var(--rmg-teal)' }}>{formatCLP(c.total_pagado)}</td>
                      <td className="px-4 py-3 precio-clp font-semibold" style={{ color: c.saldo_pendiente > 0 ? 'var(--rmg-gold)' : 'var(--rmg-muted)' }}>
                        {formatCLP(c.saldo_pendiente)}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--rmg-muted)' }}>
                        <span className="flex items-center gap-1"><Calendar size={11} />{formatFecha(c.ultima_compra)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight size={15} style={{ color: 'var(--rmg-muted)' }} />
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>

        {!isLoading && clientes.length === 0 && (
          <div className="py-16 text-center" style={{ color: 'var(--rmg-muted)' }}>
            <Users size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Ningún cliente activo tiene movimientos {hayFiltros ? 'con estos filtros' : 'todavía'}</p>
            {hayFiltros && (
              <button onClick={() => { setSearch(''); setSegmento(''); setDesde(''); setHasta('') }}
                className="mt-3 text-xs underline" style={{ color: 'var(--rmg-blt)' }}>
                Limpiar filtros
              </button>
            )}
          </div>
        )}

        {!isLoading && clientes.length > 0 && (
          <div className="px-5 py-3 border-t text-xs" style={{ borderColor: 'rgba(15, 35, 60,0.05)', color: 'var(--rmg-muted)' }}>
            Mostrando {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} con movimientos
          </div>
        )}
      </div>

      {clienteSel && (
        <ClienteDetalleModal cliente={clienteSel} onClose={() => setClienteSel(null)} />
      )}
    </div>
  )
}
