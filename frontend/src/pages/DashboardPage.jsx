import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatCLP } from '@utils/format'
import { api } from '@utils/api'
import {
  TrendingUp, Users, FileText, Package, Bell,
  ChevronDown, Zap, RefreshCw, ArrowUpRight, ArrowDownRight,
  DollarSign, Activity, Filter
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, ReferenceLine
} from 'recharts'

const SEG_COLOR  = { talleres:'var(--rmg-blt)',    flotas:'var(--rmg-teal)', concesionarios:'var(--rmg-purple)', construccion:'var(--rmg-gold)' }
const SEG_ICON   = { talleres:'🔧', flotas:'🚛', concesionarios:'🏢', construccion:'🏗️' }
const SEG_NAME   = { todos:'Todos', talleres:'Talleres', flotas:'Flotas', concesionarios:'Concesionarios', construccion:'Construcción' }

const CXC_EST = {
  al_dia:  { label:'Al día',  color:'var(--rmg-teal)',  bg:'rgba(45,201,138,0.12)' },
  vencido: { label:'Vencido', color:'var(--rmg-gold)',  bg:'rgba(244,162,60,0.12)' },
  critico: { label:'Crítico', color:'var(--rmg-red)',   bg:'rgba(224,90,78,0.12)'  },
}

// ─── Sub-componentes ──────────────────────────────────────
const KPICard = ({ label, value, sub, color='var(--rmg-blt)', icon:Icon, trend }) => (
  <div className="rmg-card p-4 flex flex-col gap-2">
    <div className="flex items-start justify-between">
      <div className="text-xs uppercase tracking-widest font-semibold" style={{ color:'var(--rmg-muted)' }}>{label}</div>
      {Icon && <div className="p-2 rounded-xl" style={{ background:`${color}15` }}><Icon size={16} style={{ color }} /></div>}
    </div>
    <div className="font-black text-3xl" style={{ fontFamily:'Inter Tight, sans-serif', color }}>{value}</div>
    {sub && (
      <div className="flex items-center gap-1 text-xs" style={{ color:'var(--rmg-muted)' }}>
        {trend != null && (trend >= 0
          ? <ArrowUpRight size={12} style={{ color:'var(--rmg-teal)' }}/>
          : <ArrowDownRight size={12} style={{ color:'var(--rmg-red)' }}/>
        )}
        {sub}
      </div>
    )}
  </div>
)

const Section = ({ id, title, badge, icon:Icon, iconColor='var(--rmg-blt)', open, onToggle, children }) => (
  <div className="rmg-card overflow-hidden">
    <button onClick={onToggle}
      className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors text-left"
      style={{ borderBottom: open ? '1px solid rgba(56,182,255,0.1)' : 'none' }}>
      <div className="flex items-center gap-3">
        <ChevronDown size={16} style={{ color:'var(--rmg-blt)', transform:open?'rotate(0deg)':'rotate(-90deg)', transition:'transform 0.25s ease' }} />
        {Icon && <Icon size={17} style={{ color:iconColor }} />}
        <span className="font-bold">{title}</span>
        {badge != null && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background:`${iconColor}20`, color:iconColor }}>{badge}</span>
        )}
      </div>
      <span className="text-xs" style={{ color:'var(--rmg-muted)' }}>{open ? '▲ colapsar' : '▼ expandir'}</span>
    </button>
    <div style={{ maxHeight:open?'3000px':'0', overflow:'hidden', transition:'max-height 0.35s cubic-bezier(0.4,0,0.2,1)' }}>
      <div className="px-5 pb-5 pt-4">{children}</div>
    </div>
  </div>
)

const SegBar = ({ nombre, icono, actual, meta, color }) => {
  const pct = meta > 0 ? Math.min((actual/meta)*100, 100) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span style={{ color:'var(--rmg-off)' }}>{icono} {nombre}</span>
        <span className="font-semibold precio-clp" style={{ color }}>{formatCLP(actual)}</span>
      </div>
      <div className="h-2 rounded-full" style={{ background:'rgba(15, 35, 60,0.06)' }}>
        <div className="h-2 rounded-full transition-all duration-700" style={{ width:`${pct}%`, background:color }} />
      </div>
      <div className="flex justify-between text-xs" style={{ color:'var(--rmg-muted)' }}>
        <span>meta {formatCLP(meta)}</span><span>{pct.toFixed(0)}%</span>
      </div>
    </div>
  )
}

const ALL_SECS = ['segmentos','edr','forecast','cxc','flujo','alertas']

export default function DashboardPage() {
  const [filtro,  setFiltro]  = useState({ periodo:'mes', segmento:'todos', desde:'', hasta:'' })
  const [activo,  setActivo]  = useState({ periodo:'mes', segmento:'todos', desde:'', hasta:'' })
  const pendiente = JSON.stringify(filtro) !== JSON.stringify(activo)

  const [open,       setOpen]       = useState(new Set(ALL_SECS))
  const [filtroCxC,  setFiltroCxC]  = useState('todas')
  const [supuestos,  setSupuestos]  = useState({ talleres:15, flotas:15, concesionarios:15, construccion:15 })

  const toggle = id => setOpen(prev => { const n = new Set(prev); n.has(id)?n.delete(id):n.add(id); return n })

  const { data: raw, isLoading } = useQuery({
    queryKey: ['dashboard-resumen', activo],
    queryFn: () => api.get('/dashboard/resumen', {
      params: {
        periodo: activo.periodo,
        segmento: activo.segmento,
        desde: activo.desde || undefined,
        hasta: activo.hasta || undefined,
      }
    }).then(r => r.data),
    staleTime: 60_000,
  })

  // ── Transformar respuesta API → shape que usa el JSX ─────────────────────
  const datos = useMemo(() => {
    const d = raw || {}
    const venta   = d.venta_total          ?? 0
    const meta    = d.meta                 ?? 0
    const pctMeta = d.pct_meta             ?? 0
    const margenB   = d.margen_bruto_monto ?? 0
    const margenPct = d.margen_bruto_pct   ?? 0
    const costoMerc = d.costo_mercaderia   ?? 0
    const totalGastos = d.total_gastos     ?? 0
    const utilNeta  = d.utilidad_neta      ?? 0
    const utilPct   = venta > 0 ? parseFloat(((utilNeta / venta) * 100).toFixed(1)) : 0

    const segs = (d.ventas_por_segmento || []).map(s => ({
      nombre: SEG_NAME[s.segmento] || s.segmento,
      icono:  SEG_ICON[s.segmento] || '',
      color:  SEG_COLOR[s.segmento] || 'var(--rmg-blt)',
      seg:    s.segmento,
      actual: s.actual,
      meta:   s.meta,
    }))

    const clientesFiltro = (d.clientes_list || []).map(c => ({
      nombre: c.nombre,
      seg:    c.segmento,
      ultima: c.ultima || '—',
      monto:  c.monto,
    }))

    const ventasChart = (d.ventas_semana || []).map(r => ({
      label:  r.semana,
      venta:  r.Ingresos,
    }))

    const flujoCaja = (d.ventas_semana || []).map(r => ({
      semana:   r.semana,
      ingresos: r.Ingresos,
      egresos:  r.Egresos,
    }))

    const cxcRows = (d.cxc_rows || []).map(r => ({
      id:        r.numero,
      cliente:   r.nombre,
      factura:   r.numero,
      monto:     r.monto,
      diasVence: r.dias_desde,
      estado:    r.dias_desde > 30 ? 'critico' : r.dias_desde > 0 ? 'vencido' : 'al_dia',
    }))
    const cxcRiesgo = cxcRows.filter(c => c.estado !== 'al_dia').reduce((s,c) => s + c.monto, 0)

    const alertas = []
    if (cxcRows.filter(c => c.estado === 'critico').length > 0)
      alertas.push({ urgencia:'alta', msg:`${cxcRows.filter(c=>c.estado==='critico').length} nota(s) de venta vencidas hace más de 30 días` })
    if ((d.cotizaciones_pendientes ?? 0) > 0)
      alertas.push({ urgencia:'media', msg:`${d.cotizaciones_pendientes} cotización(es) en estado borrador o enviada pendientes de respuesta` })
    if ((d.pipeline_activo ?? 0) > 0)
      alertas.push({ urgencia:'media', msg:`${d.pipeline_activo} prospectos activos en pipeline sin cerrar` })

    return {
      venta, meta, pctMeta,
      clientes: d.clientes_activos          ?? 0,
      pipeline: d.pipeline_activo           ?? 0,
      cots:     d.cotizaciones_pendientes   ?? 0,
      margenPct, margenB, costoMerc, totalGastos, utilNeta, utilPct,
      saldoFin: d.saldo_proyectado          ?? 0,
      segs, clientesFiltro, ventasChart, flujoCaja, cxcRows, cxcRiesgo, alertas,
    }
  }, [raw])

  const forecast = useMemo(() => {
    const baseVenta = datos.venta || 0
    let gpct
    if (activo.segmento === 'todos') {
      const total = supuestos.talleres + supuestos.flotas + supuestos.concesionarios + supuestos.construccion
      gpct = total / 4
    } else {
      gpct = supuestos[activo.segmento] ?? 15
    }
    const g = gpct / 100
    return ['Julio','Agosto','Septiembre'].map((mes,i) => ({
      mes,
      proyeccion: Math.round(baseVenta * Math.pow(1+g, i+1)),
      meta: datos.meta,
    }))
  }, [activo.segmento, supuestos, datos.venta, datos.meta])

  const cxcVisible = useMemo(() => {
    let rows = datos.cxcRows
    if (filtroCxC === 'vencidas') rows = rows.filter(c => c.diasVence > 0)
    if (filtroCxC === 'criticas') rows = rows.filter(c => c.diasVence > 30)
    return rows
  }, [datos.cxcRows, filtroCxC])

  const TT  = { background:'#ffffff', border:'1px solid rgba(15,35,60,0.12)', borderRadius:8, color:'#16233a', boxShadow:'0 2px 12px rgba(15,35,60,0.12)' }
  const AX  = { fill:'#64748b', fontSize:11 }

  const periodoLabel = () => {
    const p = activo.periodo
    if (p === 'hoy') return 'Hoy'
    if (p === 'semana') return 'Esta semana'
    if (p === 'mes') return 'Este mes'
    if (p === 'mes_anterior') return 'Mes anterior'
    if (p === 'personalizado' && activo.desde && activo.hasta) return `${activo.desde} – ${activo.hasta}`
    return 'Rango personalizado'
  }

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Filtros ─────────────────────────────────────── */}
      <div className="rmg-card p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold shrink-0" style={{ color:'var(--rmg-muted)' }}>
            <Filter size={13}/> Período
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[['hoy','Hoy'],['semana','Esta semana'],['mes','Este mes'],['mes_anterior','Mes anterior'],['personalizado','Rango ↗']].map(([k,l])=>(
              <button key={k} onClick={()=>setFiltro(f=>({...f,periodo:k}))}
                className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                style={filtro.periodo===k
                  ? {background:'var(--rmg-blue)',color:'#fff'}
                  : {background:'rgba(15, 35, 60,0.05)',color:'var(--rmg-muted)',border:'1px solid rgba(15, 35, 60,0.08)'}
                }>{l}</button>
            ))}
          </div>
        </div>

        {filtro.periodo==='personalizado' && (
          <div className="flex items-center gap-3 pl-5 flex-wrap">
            <span className="text-xs" style={{ color:'var(--rmg-muted)' }}>Desde</span>
            <input type="date" className="rmg-input w-36 text-xs py-1.5"
              value={filtro.desde} onChange={e=>setFiltro(f=>({...f,desde:e.target.value}))}/>
            <span className="text-xs" style={{ color:'var(--rmg-muted)' }}>Hasta</span>
            <input type="date" className="rmg-input w-36 text-xs py-1.5"
              value={filtro.hasta} onChange={e=>setFiltro(f=>({...f,hasta:e.target.value}))}/>
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t" style={{ borderColor:'rgba(56,182,255,0.08)' }}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold mr-0.5 shrink-0" style={{ color:'var(--rmg-muted)' }}>Segmento:</span>
            {['todos','talleres','flotas','concesionarios','construccion'].map(s=>(
              <button key={s} onClick={()=>setFiltro(f=>({...f,segmento:s}))}
                className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                style={filtro.segmento===s
                  ? { background:s==='todos'?'var(--rmg-blue)':`${SEG_COLOR[s]}22`, color:s==='todos'?'#fff':SEG_COLOR[s], border:`1px solid ${s==='todos'?'var(--rmg-blue)':SEG_COLOR[s]}55` }
                  : { background:'rgba(15, 35, 60,0.04)', color:'var(--rmg-muted)', border:'1px solid rgba(15, 35, 60,0.08)' }
                }>{SEG_NAME[s]}</button>
            ))}
          </div>
          <button onClick={()=>setActivo({...filtro})}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all"
            style={{
              background: pendiente?'var(--rmg-blue)':'rgba(56,182,255,0.1)',
              color: pendiente?'#fff':'var(--rmg-blt)',
              border:`1px solid ${pendiente?'var(--rmg-blue)':'rgba(56,182,255,0.2)'}`,
              boxShadow: pendiente?'0 0 14px rgba(27,143,212,0.4)':'none',
            }}>
            <RefreshCw size={14}/> Actualizar
          </button>
        </div>
      </div>

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily:'Inter Tight, sans-serif' }}>Dashboard Gerencial</h1>
          <p className="text-sm mt-0.5" style={{ color:'var(--rmg-muted)' }}>
            {periodoLabel()} · {SEG_NAME[activo.segmento]} · RMG Parts
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
          style={{ background:'rgba(56,182,255,0.08)', border:'1px solid rgba(56,182,255,0.2)' }}>
          <Zap size={14} style={{ color:'var(--rmg-blt)'}}/>
          <span className="text-xs font-semibold" style={{ color:pendiente?'var(--rmg-gold)':isLoading?'var(--rmg-muted)':'var(--rmg-blt)' }}>
            {pendiente ? 'Filtro pendiente de aplicar' : isLoading ? 'Cargando datos…' : 'Datos actualizados'}
          </span>
        </div>
      </div>

      {/* ── Meta + barra ────────────────────────────────── */}
      <div className="rmg-card p-5">
        <div className="flex justify-between items-start mb-3 gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest font-semibold" style={{ color:'var(--rmg-muted)' }}>Venta del período</div>
            <div className="font-black text-4xl mt-0.5" style={{ fontFamily:'Inter Tight, sans-serif' }}>
              {isLoading ? '—' : formatCLP(datos.venta)}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-black text-4xl" style={{ fontFamily:'Inter Tight, sans-serif',
              color:datos.pctMeta>=80?'var(--rmg-teal)':datos.pctMeta>=50?'var(--rmg-gold)':'var(--rmg-red)' }}>
              {isLoading ? '—' : `${datos.pctMeta}%`}
            </div>
            <div className="text-xs" style={{ color:'var(--rmg-muted)' }}>de meta {formatCLP(datos.meta)}</div>
          </div>
        </div>
        <div className="h-3 rounded-full" style={{ background:'rgba(15, 35, 60,0.05)' }}>
          <div className="h-3 rounded-full transition-all duration-700"
            style={{ width:`${Math.min(datos.pctMeta,100)}%`, background:'linear-gradient(90deg, var(--rmg-blue), var(--rmg-blt))' }}/>
        </div>
      </div>

      {/* ── KPIs ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard label="Clientes activos" value={isLoading?'—':datos.clientes} sub={`en ${SEG_NAME[activo.segmento].toLowerCase()}`}
          color="var(--rmg-blt)" icon={Users} />
        <KPICard label="Pipeline activo" value={isLoading?'—':datos.pipeline} sub="prospectos abiertos"
          color="var(--rmg-purple)" icon={TrendingUp} />
        <KPICard label="Cotizaciones" value={isLoading?'—':datos.cots} sub="borrador o enviadas"
          color="var(--rmg-gold)" icon={FileText} />
        <KPICard label="Margen bruto" value={isLoading?'—':`${datos.margenPct}%`} sub={formatCLP(datos.margenB)}
          color="var(--rmg-teal)" icon={Package} />
      </div>

      {/* ══ ACORDEONES ═══════════════════════════════════ */}

      {/* ▼ Ventas por segmento */}
      <Section id="segmentos" title="Ventas por segmento" icon={Activity} iconColor="var(--rmg-blt)"
        badge={`${datos.segs.length} seg.`} open={open.has('segmentos')} onToggle={()=>toggle('segmentos')}>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            {datos.segs.length > 0
              ? datos.segs.map(s=><SegBar key={s.seg} {...s}/>)
              : <p className="text-sm py-4" style={{ color:'var(--rmg-muted)' }}>Sin datos de ventas para este período</p>
            }
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-3" style={{ color:'var(--rmg-muted)' }}>
              Ingresos vs Egresos por semana
            </div>
            {datos.ventasChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={datos.ventasChart} barCategoryGap="40%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 35, 60,0.05)"/>
                  <XAxis dataKey="label" tick={AX} axisLine={false} tickLine={false}/>
                  <YAxis tick={AX} axisLine={false} tickLine={false} tickFormatter={v=>`$${(v/1e6).toFixed(1)}M`}/>
                  <Tooltip contentStyle={TT} formatter={v=>[formatCLP(v),'Ingresos']}/>
                  <Bar dataKey="venta" fill="var(--rmg-blue)" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-40 text-sm" style={{ color:'var(--rmg-muted)' }}>
                Sin datos de movimientos en este período
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <div className="text-xs uppercase tracking-wider font-semibold mb-3" style={{ color:'var(--rmg-muted)' }}>Detalle por cliente</div>
          {datos.clientesFiltro.length === 0 ? (
            <p className="text-sm py-4" style={{ color:'var(--rmg-muted)' }}>Sin ventas registradas para este período</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom:'1px solid rgba(56,182,255,0.1)', background:'rgba(15, 35, 60,0.02)' }}>
                  {['Cliente','Segmento','Última compra','Monto período'].map(h=>(
                    <th key={h} className="text-left px-3 py-2.5 text-xs uppercase tracking-wider font-semibold" style={{ color:'var(--rmg-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {datos.clientesFiltro.map((c,i)=>(
                  <tr key={i} style={{ borderBottom:'1px solid rgba(15, 35, 60,0.04)' }}>
                    <td className="px-3 py-2.5 font-medium" style={{ color:'var(--rmg-off)' }}>{c.nombre}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ background:`${SEG_COLOR[c.seg]||'var(--rmg-blt)'}18`, color:SEG_COLOR[c.seg]||'var(--rmg-blt)' }}>
                        {SEG_NAME[c.seg] || c.seg}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs" style={{ color:'var(--rmg-muted)' }}>{c.ultima}</td>
                    <td className="px-3 py-2.5 font-bold precio-clp" style={{ color:'var(--rmg-off)' }}>{formatCLP(c.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Section>

      {/* ▼ EDR */}
      <Section id="edr" title="Estado de Resultados (EDR)" icon={DollarSign} iconColor="var(--rmg-teal)"
        open={open.has('edr')} onToggle={()=>toggle('edr')}>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-2 text-sm space-y-0">

            {[
              { label:'Venta bruta',        monto:datos.venta,      pct:'100%' },
              { label:'− Costo mercadería', monto:datos.costoMerc,  pct: datos.venta > 0 ? `${(100 - datos.margenPct).toFixed(1)}%` : '0%' },
            ].map(r=>(
              <div key={r.label} className="flex justify-between py-2" style={{ borderBottom:'1px solid rgba(15, 35, 60,0.05)' }}>
                <span style={{ color:'var(--rmg-muted)' }}>{r.label}</span>
                <div className="flex items-center gap-6">
                  <span className="text-xs w-12 text-right" style={{ color:'var(--rmg-muted)' }}>{r.pct}</span>
                  <span className="font-semibold w-32 text-right precio-clp" style={{ color:'var(--rmg-off)' }}>{formatCLP(r.monto)}</span>
                </div>
              </div>
            ))}

            <div className="flex justify-between py-2 px-3 rounded-lg my-1"
              style={{ background:'rgba(45,201,138,0.07)', border:'1px solid rgba(45,201,138,0.18)' }}>
              <span className="font-semibold" style={{ color:'var(--rmg-teal)' }}>= Margen bruto</span>
              <div className="flex items-center gap-6">
                <span className="text-xs w-12 text-right font-bold" style={{ color:'var(--rmg-teal)' }}>{datos.margenPct}%</span>
                <span className="font-bold w-32 text-right precio-clp" style={{ color:'var(--rmg-teal)' }}>{formatCLP(datos.margenB)}</span>
              </div>
            </div>

            <div className="pt-3 pb-1 text-xs uppercase tracking-wider font-semibold" style={{ color:'rgba(90,143,168,0.55)' }}>
              Gastos operacionales confirmados
            </div>

            <div className="flex justify-between py-2" style={{ borderBottom:'1px solid rgba(15, 35, 60,0.05)' }}>
              <span style={{ color:'var(--rmg-muted)' }}>Total gastos (caja confirmada)</span>
              <span className="font-semibold w-32 text-right precio-clp" style={{ color:'var(--rmg-off)' }}>{formatCLP(datos.totalGastos)}</span>
            </div>

            <div className="flex justify-between py-2.5 px-3 rounded-lg mt-1"
              style={{ background:'rgba(27,143,212,0.08)', border:'1px solid rgba(27,143,212,0.22)' }}>
              <span className="font-bold" style={{ color:'var(--rmg-blt)' }}>= Utilidad neta (aprox.)</span>
              <div className="flex items-center gap-6">
                <span className="text-xs font-bold" style={{ color:'var(--rmg-blt)' }}>{datos.utilPct}%</span>
                <span className="font-black text-base precio-clp w-32 text-right"
                  style={{ color:'var(--rmg-blt)', fontFamily:'Inter Tight, sans-serif' }}>{formatCLP(datos.utilNeta)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {[
              { label:'Margen bruto',  value:`${datos.margenPct}%`, sub:formatCLP(datos.margenB),    color:'var(--rmg-teal)' },
              { label:'Gastos op.',    value: datos.venta > 0 ? `${((datos.totalGastos/datos.venta)*100).toFixed(1)}%` : '0%', sub:formatCLP(datos.totalGastos), color:'var(--rmg-gold)' },
              { label:'Utilidad neta', value:`${datos.utilPct}%`,   sub:formatCLP(datos.utilNeta),   color:'var(--rmg-blt)' },
            ].map(r=>(
              <div key={r.label} className="rounded-xl p-4 flex flex-col gap-1 flex-1"
                style={{ background:`${r.color}0d`, border:`1px solid ${r.color}25` }}>
                <span className="text-xs uppercase tracking-widest font-semibold" style={{ color:'var(--rmg-muted)' }}>{r.label}</span>
                <span className="font-black text-3xl" style={{ color:r.color, fontFamily:'Inter Tight, sans-serif' }}>{r.value}</span>
                <span className="text-xs precio-clp" style={{ color:'var(--rmg-muted)' }}>{r.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ▼ Forecast */}
      <Section id="forecast" title="Forecast próximos 3 meses" icon={TrendingUp} iconColor="var(--rmg-purple)"
        open={open.has('forecast')} onToggle={()=>toggle('forecast')}>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={forecast} barCategoryGap="40%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 35, 60,0.05)"/>
                <XAxis dataKey="mes" tick={{...AX,fontSize:13}} axisLine={false} tickLine={false}/>
                <YAxis tick={AX} axisLine={false} tickLine={false}
                  tickFormatter={v=>`$${(v/1e6).toFixed(0)}M`}
                  domain={[0, Math.max(datos.meta*1.1, ...forecast.map(f=>f.proyeccion), 1)*1.05]}/>
                <Tooltip contentStyle={TT} formatter={v=>[formatCLP(v),'Proyección']}/>
                {datos.meta > 0 && (
                  <ReferenceLine y={datos.meta} stroke="var(--rmg-gold)" strokeDasharray="6 3" strokeWidth={1.5}
                    label={{ value:`Meta $${(datos.meta/1e6).toFixed(0)}M`, position:'insideTopRight',
                             fill:'var(--rmg-gold)', fontSize:11, fontWeight:700 }}/>
                )}
                <Bar dataKey="proyeccion" fill="var(--rmg-purple)" radius={[6,6,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-4" style={{ color:'var(--rmg-muted)' }}>
              Supuestos de crecimiento mensual
            </div>
            <div className="space-y-4">
              {(activo.segmento==='todos'
                ? ['talleres','flotas','concesionarios','construccion']
                : [activo.segmento]
              ).map(s=>(
                <div key={s}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span style={{ color:SEG_COLOR[s] }}>{SEG_ICON[s]} {SEG_NAME[s]}</span>
                    <span className="font-bold" style={{ color:supuestos[s]>=0?'var(--rmg-teal)':'var(--rmg-red)' }}>
                      {supuestos[s]>0?'+':''}{supuestos[s]}%
                    </span>
                  </div>
                  <input type="range" min={-20} max={50} step={1}
                    value={supuestos[s]}
                    onChange={e=>setSupuestos(p=>({...p,[s]:Number(e.target.value)}))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ accentColor:SEG_COLOR[s] }}/>
                  <div className="flex justify-between text-xs mt-0.5" style={{ color:'rgba(90,143,168,0.4)' }}>
                    <span>−20%</span><span>+50%</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs mt-4 pt-3" style={{ borderTop:'1px solid rgba(56,182,255,0.1)', color:'var(--rmg-muted)' }}>
              Base: venta real del período · Los sliders actualizan en tiempo real
            </p>
          </div>
        </div>
      </Section>

      {/* ▼ CxC */}
      <Section id="cxc" title="Cuentas por cobrar" icon={FileText} iconColor="var(--rmg-gold)"
        badge={datos.cxcRiesgo>0?`${formatCLP(datos.cxcRiesgo)} en riesgo`:null}
        open={open.has('cxc')} onToggle={()=>toggle('cxc')}>

        <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
          <div className="flex gap-6">
            <div>
              <div className="text-xs" style={{ color:'var(--rmg-muted)' }}>Total CxC</div>
              <div className="font-black text-xl precio-clp" style={{ color:'var(--rmg-gold)', fontFamily:'Inter Tight, sans-serif' }}>
                {formatCLP(datos.cxcRows.reduce((s,c)=>s+c.monto,0))}
              </div>
            </div>
            {datos.cxcRiesgo>0&&(
              <div>
                <div className="text-xs" style={{ color:'var(--rmg-muted)' }}>En riesgo (+30d)</div>
                <div className="font-black text-xl precio-clp" style={{ color:'var(--rmg-red)', fontFamily:'Inter Tight, sans-serif' }}>
                  {formatCLP(datos.cxcRiesgo)}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-1.5">
            {[['todas','Todas'],['vencidas','Vencidas'],['criticas','Críticas +30d']].map(([k,l])=>(
              <button key={k} onClick={()=>setFiltroCxC(k)}
                className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                style={filtroCxC===k
                  ? { background:k==='criticas'?'rgba(224,90,78,0.2)':k==='vencidas'?'rgba(244,162,60,0.2)':'rgba(56,182,255,0.15)',
                      color:k==='criticas'?'var(--rmg-red)':k==='vencidas'?'var(--rmg-gold)':'var(--rmg-blt)',
                      border:`1px solid ${k==='criticas'?'rgba(224,90,78,0.4)':k==='vencidas'?'rgba(244,162,60,0.4)':'rgba(56,182,255,0.4)'}` }
                  : { background:'rgba(15, 35, 60,0.04)', color:'var(--rmg-muted)', border:'1px solid rgba(15, 35, 60,0.08)' }
                }>{l}</button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(56,182,255,0.1)', background:'rgba(15, 35, 60,0.02)' }}>
                {['Cliente','N° NV','Monto','Días','Estado'].map(h=>(
                  <th key={h} className="text-left px-3 py-2.5 text-xs uppercase tracking-wider font-semibold" style={{ color:'var(--rmg-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cxcVisible.length===0
                ? <tr><td colSpan={5} className="px-3 py-6 text-center text-sm" style={{ color:'var(--rmg-muted)' }}>Sin registros pendientes de pago</td></tr>
                : cxcVisible.map((c,i)=>{
                  const est = CXC_EST[c.estado] || CXC_EST.al_dia
                  return (
                    <tr key={i} style={{ borderBottom:'1px solid rgba(15, 35, 60,0.04)' }}>
                      <td className="px-3 py-3 font-medium" style={{ color:'var(--rmg-off)' }}>{c.cliente}</td>
                      <td className="px-3 py-3 text-xs font-mono" style={{ color:'var(--rmg-muted)' }}>{c.factura}</td>
                      <td className="px-3 py-3 font-bold precio-clp" style={{ color:'var(--rmg-off)' }}>{formatCLP(c.monto)}</td>
                      <td className="px-3 py-3 text-xs font-semibold"
                        style={{ color:c.diasVence>30?'var(--rmg-red)':c.diasVence>0?'var(--rmg-gold)':'var(--rmg-teal)' }}>
                        {c.diasVence>0?`+${c.diasVence}d`:'Nuevo'}
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background:est.bg, color:est.color }}>{est.label}</span>
                      </td>
                    </tr>
                  )
                })
              }
            </tbody>
          </table>
        </div>
      </Section>

      {/* ▼ Flujo de caja */}
      <Section id="flujo" title="Flujo de caja del período" icon={Activity} iconColor="var(--rmg-teal)"
        open={open.has('flujo')} onToggle={()=>toggle('flujo')}>

        <div className="flex justify-between items-start mb-4 flex-wrap gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color:'var(--rmg-muted)' }}>
              Saldo proyectado
            </div>
            <div className="font-black text-2xl mt-0.5 precio-clp"
              style={{ fontFamily:'Inter Tight, sans-serif', color:datos.saldoFin>=0?'var(--rmg-teal)':'var(--rmg-red)' }}>
              {formatCLP(datos.saldoFin)}
            </div>
          </div>
          <div className="flex gap-4 text-xs items-center" style={{ color:'var(--rmg-muted)' }}>
            <span className="flex items-center gap-1.5"><div className="w-5 h-2 rounded" style={{ background:'var(--rmg-teal)' }}/>Ingresos</span>
            <span className="flex items-center gap-1.5"><div className="w-5 h-2 rounded" style={{ background:'var(--rmg-red)' }}/>Egresos</span>
          </div>
        </div>

        {datos.flujoCaja.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={datos.flujoCaja} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 35, 60,0.05)"/>
              <XAxis dataKey="semana" tick={AX} axisLine={false} tickLine={false}/>
              <YAxis tick={AX} axisLine={false} tickLine={false} tickFormatter={v=>`$${(v/1e6).toFixed(1)}M`}/>
              <Tooltip contentStyle={TT} formatter={(v,n)=>[formatCLP(v),n==='ingresos'?'Ingresos':'Egresos']}/>
              <Bar dataKey="ingresos" name="ingresos" fill="var(--rmg-teal)" radius={[4,4,0,0]}/>
              <Bar dataKey="egresos"  name="egresos"  fill="var(--rmg-red)"  radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-40 text-sm" style={{ color:'var(--rmg-muted)' }}>
            Sin movimientos de caja en este período
          </div>
        )}
      </Section>

      {/* ▼ Alertas */}
      <Section id="alertas" title="Alertas operacionales" icon={Bell} iconColor="var(--rmg-red)"
        badge={datos.alertas.filter(a=>a.urgencia==='alta').length||null}
        open={open.has('alertas')} onToggle={()=>toggle('alertas')}>

        {datos.alertas.length===0
          ? <p className="text-sm text-center py-4" style={{ color:'var(--rmg-muted)' }}>Sin alertas para este período</p>
          : <div className="space-y-2">
              {datos.alertas.map((a,i)=>(
                <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-lg"
                  style={{
                    background:a.urgencia==='alta'?'rgba(224,90,78,0.08)':'rgba(244,162,60,0.08)',
                    border:`1px solid ${a.urgencia==='alta'?'rgba(224,90,78,0.2)':'rgba(244,162,60,0.2)'}`,
                  }}>
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ background:a.urgencia==='alta'?'var(--rmg-red)':'var(--rmg-gold)' }}/>
                  <div>
                    <span className="text-xs uppercase font-semibold mr-2"
                      style={{ color:a.urgencia==='alta'?'var(--rmg-red)':'var(--rmg-gold)' }}>
                      {a.urgencia==='alta'?'● ALTA':'◎ MEDIA'}
                    </span>
                    <span className="text-sm" style={{ color:'var(--rmg-off)' }}>{a.msg}</span>
                  </div>
                </div>
              ))}
            </div>
        }
      </Section>

    </div>
  )
}
