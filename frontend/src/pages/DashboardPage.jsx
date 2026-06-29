import { useState, useMemo } from 'react'
import { formatCLP } from '@utils/format'
import { useConfigStore } from '@stores/configStore'
import {
  TrendingUp, Users, FileText, Package, Bell,
  ChevronDown, Zap, RefreshCw, ArrowUpRight, ArrowDownRight,
  DollarSign, Activity, Filter
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, ReferenceLine
} from 'recharts'

// ─── Datos base mensuales por segmento ───────────────────
const BASE = {
  todos:          { venta:12_400_000, meta:20_000_000, clientes:29, pipeline:14, cots:8, margen:26.1 },
  talleres:       { venta: 5_200_000, meta: 8_000_000, clientes:12, pipeline: 6, cots:3, margen:28.5 },
  flotas:         { venta: 4_100_000, meta: 6_000_000, clientes: 8, pipeline: 4, cots:2, margen:24.2 },
  concesionarios: { venta: 2_200_000, meta: 4_000_000, clientes: 5, pipeline: 3, cots:2, margen:27.8 },
  construccion:   { venta:   900_000, meta: 2_000_000, clientes: 4, pipeline: 1, cots:1, margen:22.5 },
}
const MULT = { hoy:1/30, semana:7/30, mes:27/30, mes_anterior:1.0 }
const MANT = 0.90 // mayo fue 90% del ritmo de junio

const SEG_COLOR  = { talleres:'var(--rmg-blt)',    flotas:'var(--rmg-teal)', concesionarios:'var(--rmg-purple)', construccion:'var(--rmg-gold)' }
const SEG_ICON   = { talleres:'🔧', flotas:'🚛', concesionarios:'🏢', construccion:'🏗️' }
const SEG_NAME   = { todos:'Todos', talleres:'Talleres', flotas:'Flotas', concesionarios:'Concesionarios', construccion:'Construcción' }

const CXC_ROWS = [
  { id:1, cliente:'MetroMov Buses S.A.',     factura:'F-2024', segmento:'flotas',         monto:2_100_000, fechaVence:'05/07/26', diasVence:-8,  estado:'al_dia'  },
  { id:2, cliente:'Transportes Norte S.A.',  factura:'F-2031', segmento:'flotas',         monto:1_240_000, fechaVence:'02/07/26', diasVence:-5,  estado:'al_dia'  },
  { id:3, cliente:'Taller Hermanos Díaz',    factura:'F-2028', segmento:'talleres',       monto:  487_000, fechaVence:'15/06/26', diasVence:+12, estado:'vencido' },
  { id:4, cliente:'AutoCenter Bellavista',   factura:'F-2019', segmento:'concesionarios', monto:  825_000, fechaVence:'20/05/26', diasVence:+38, estado:'critico' },
  { id:5, cliente:'Lubricentro Express',     factura:'F-2011', segmento:'talleres',       monto:  280_000, fechaVence:'21/04/26', diasVence:+67, estado:'critico' },
  { id:6, cliente:'ConstRMG Equipos',        factura:'F-2033', segmento:'construccion',   monto:  340_000, fechaVence:'29/06/26', diasVence:-2,  estado:'al_dia'  },
]
const CXC_EST = {
  al_dia:  { label:'Al día',  color:'var(--rmg-teal)',  bg:'rgba(45,201,138,0.12)' },
  vencido: { label:'Vencido', color:'var(--rmg-gold)',  bg:'rgba(244,162,60,0.12)' },
  critico: { label:'Crítico', color:'var(--rmg-red)',   bg:'rgba(224,90,78,0.12)'  },
}
const CLI_ROWS = [
  { nombre:'MetroMov Buses S.A.',     seg:'flotas',         ultima:'25/06/26', monto:2_100_000, var:+12 },
  { nombre:'Transportes Norte S.A.',  seg:'flotas',         ultima:'22/06/26', monto:1_240_000, var: +5 },
  { nombre:'Taller Hermanos Díaz',    seg:'talleres',       ultima:'20/06/26', monto:  820_000, var: -3 },
  { nombre:'AutoCenter Bellavista',   seg:'concesionarios', ultima:'18/06/26', monto:  650_000, var:+22 },
  { nombre:'Lubricentro Express',     seg:'talleres',       ultima:'15/06/26', monto:  430_000, var: -8 },
  { nombre:'ConstRMG Equipos',        seg:'construccion',   ultima:'12/06/26', monto:  340_000, var:  0 },
  { nombre:'Taller Martínez e Hijos', seg:'talleres',       ultima:'10/06/26', monto:  290_000, var:+15 },
  { nombre:'Flota Municipal SCL',     seg:'flotas',         ultima:'08/06/26', monto:  760_000, var: +8 },
]
const ALERTAS = [
  { tipo:'stock',    segs:['todos','talleres','flotas'],           urgencia:'alta',  msg:'3 SKUs bajo mínimo: 15W40 20L · N70Z · AT51' },
  { tipo:'cxc',     segs:['todos','flotas','concesionarios'],     urgencia:'alta',  msg:'2 facturas vencidas: $825K AutoCenter · $280K Lubricentro' },
  { tipo:'bot',     segs:['todos','flotas','concesionarios'],     urgencia:'alta',  msg:'3 cotizaciones WhatsApp sin respuesta +48hrs' },
  { tipo:'pipeline',segs:['todos','talleres','construccion'],     urgencia:'media', msg:'4 prospectos sin actividad en los últimos 7 días' },
  { tipo:'clientes',segs:['todos','talleres','construccion'],     urgencia:'media', msg:'2 clientes sin compra +30 días: Taller Díaz · ConstRMG' },
]

// ─── Helpers ─────────────────────────────────────────────
const getMult = (periodo, desde, hasta) => {
  if (periodo === 'personalizado') {
    if (!desde || !hasta) return 1
    const dias = Math.max(1, Math.round((new Date(hasta) - new Date(desde)) / 86400000) + 1)
    return Math.min(dias / 30, 1)
  }
  return MULT[periodo] ?? 1
}
const periodoLabel = (p, desde, hasta) => ({
  hoy: 'Hoy · 27 jun 2026', semana: 'Semana 23–27 jun 2026',
  mes: 'Junio 2026', mes_anterior: 'Mayo 2026',
  personalizado: desde && hasta ? `${desde} – ${hasta}` : 'Rango personalizado',
}[p])

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
  const pct = Math.min((actual/meta)*100, 100)
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span style={{ color:'var(--rmg-off)' }}>{icono} {nombre}</span>
        <span className="font-semibold precio-clp" style={{ color }}>{formatCLP(actual)}</span>
      </div>
      <div className="h-2 rounded-full" style={{ background:'rgba(255,255,255,0.06)' }}>
        <div className="h-2 rounded-full transition-all duration-700" style={{ width:`${pct}%`, background:color }} />
      </div>
      <div className="flex justify-between text-xs" style={{ color:'var(--rmg-muted)' }}>
        <span>meta {formatCLP(meta)}</span><span>{pct.toFixed(0)}%</span>
      </div>
    </div>
  )
}

// ─── Dashboard ───────────────────────────────────────────
const ALL_SECS = ['segmentos','edr','forecast','cxc','flujo','alertas']

export default function DashboardPage() {
  const cfg = useConfigStore()

  const [filtro,  setFiltro]  = useState({ periodo:'mes', segmento:'todos', desde:'', hasta:'' })
  const [activo,  setActivo]  = useState({ periodo:'mes', segmento:'todos', desde:'', hasta:'' })
  const pendiente = JSON.stringify(filtro) !== JSON.stringify(activo)

  const [open,       setOpen]       = useState(new Set(ALL_SECS))
  const [filtroCxC,  setFiltroCxC]  = useState('todas')
  const [supuestos,  setSupuestos]  = useState({
    talleres:       cfg.forecast_mes1,
    flotas:         cfg.forecast_mes1,
    concesionarios: cfg.forecast_mes1,
    construccion:   cfg.forecast_mes1,
  })

  const toggle = id => setOpen(prev => { const n = new Set(prev); n.has(id)?n.delete(id):n.add(id); return n })

  // ── Datos computados ─────────────────────────────────
  const datos = useMemo(() => {
    const { periodo, segmento, desde, hasta } = activo
    const base     = BASE[segmento]
    const mult     = getMult(periodo, desde, hasta)
    const isMesAnt = periodo === 'mes_anterior'
    const bf       = isMesAnt ? MANT : 1

    const metaMap = {
      todos:          cfg.meta_total,
      talleres:       cfg.meta_talleres,
      flotas:         cfg.meta_flotas,
      concesionarios: cfg.meta_concesionarios,
      construccion:   cfg.meta_construccion,
    }

    const venta     = Math.round(base.venta * mult * bf)
    const ventaAnt  = Math.round(venta * 0.878)
    const varVenta  = +((venta - ventaAnt) / ventaAnt * 100).toFixed(1)
    const pctMeta   = +((venta / metaMap[segmento]) * 100).toFixed(1)

    // EDR
    const costoMerc   = Math.round(venta * (1 - base.margen/100))
    const margenB     = venta - costoMerc
    const gScale      = mult * bf * (segmento==='todos' ? 1 : metaMap[segmento] / metaMap.todos)
    const pg          = cfg.presupuesto_gastos
    const gastos      = {
      sueldos:    Math.round(pg * 0.649 * gScale),
      arriendo:   Math.round(pg * 0.189 * gScale),
      transporte: Math.round(pg * 0.097 * gScale),
      generales:  Math.round(pg * 0.065 * gScale),
    }
    const totalGastos = Object.values(gastos).reduce((s,v)=>s+v, 0)
    const utilNeta    = margenB - totalGastos
    const utilPct     = venta > 0 ? +((utilNeta/venta)*100).toFixed(1) : 0

    // Barras de segmento
    const segs = ['talleres','flotas','concesionarios','construccion']
      .filter(s => segmento === 'todos' || s === segmento)
      .map(s => ({
        nombre: SEG_NAME[s], icono: SEG_ICON[s], color: SEG_COLOR[s], seg: s,
        actual: Math.round(BASE[s].venta * mult * bf),
        meta:   Math.round(metaMap[s] * mult),
      }))

    // Tabla clientes
    const clientesFiltro = CLI_ROWS
      .filter(c => segmento === 'todos' || c.seg === segmento)
      .map(c => ({ ...c, monto: Math.round(c.monto * mult * bf) }))

    // Gráfico ventas del período
    const mb = base.venta * bf
    let ventasChart
    if (periodo === 'hoy') {
      ventasChart = [{ label:'Hoy', venta:Math.round(mb/30) }]
    } else if (periodo === 'semana') {
      const d = mb/30
      ventasChart = ['Lun','Mar','Mié','Jue','Vie','Sáb']
        .map((l,i) => ({ label:l, venta:Math.round(d*[0.95,1.15,0.85,1.25,1.40,0.52][i]) }))
    } else {
      const labs = isMesAnt
        ? ['1–7 may','8–14 may','15–21','22–31']
        : ['1–7 jun','8–14 jun','15–21','22–27']
      const w = mb/4
      ventasChart = labs.map((l,i) => ({ label:l, venta:Math.round(w*[0.85,1.05,0.92,1.18][i]) }))
    }

    // Flujo de caja
    let flujoCaja
    if (periodo === 'hoy') {
      flujoCaja = [{ semana:'Hoy', ingresos:Math.round(mb/30), egresos:Math.round(mb/30*0.78) }]
    } else if (periodo === 'semana') {
      const d = mb/30
      flujoCaja = ['Lun','Mar','Mié','Jue','Vie','Sáb'].map((l,i) => ({
        semana:l,
        ingresos:Math.round(d*[0.95,1.15,0.85,1.25,1.40,0.52][i]),
        egresos: Math.round(d*[0.80,0.90,0.70,0.95,0.88,0.40][i]),
      }))
    } else {
      const labs = isMesAnt
        ? ['1–7 may','8–14 may','15–21','22–31']
        : ['1–7 jun','8–14 jun','15–21','22–27']
      const w = mb/4
      flujoCaja = labs.map((l,i) => ({
        semana:l,
        ingresos:Math.round(w*[0.85,1.05,0.92,1.18][i]),
        egresos: Math.round(w*[0.72,0.88,0.78,0.82][i]),
      }))
    }
    const saldoFin = flujoCaja.reduce((s,w)=>s+(w.ingresos-w.egresos), 0)

    // CxC
    const cxcRows    = CXC_ROWS.filter(c => segmento==='todos' || c.segmento===segmento)
    const cxcRiesgo  = cxcRows.filter(c=>c.estado!=='al_dia').reduce((s,c)=>s+c.monto, 0)

    // Alertas
    const alertas = ALERTAS.filter(a => a.segs.includes(segmento))

    return {
      venta, ventaAnt, varVenta, pctMeta, meta: metaMap[segmento],
      clientes:base.clientes, pipeline:base.pipeline, cots:base.cots, margenPct:base.margen,
      costoMerc, margenB, gastos, totalGastos, utilNeta, utilPct,
      segs, clientesFiltro, ventasChart, flujoCaja, saldoFin,
      cxcRows, cxcRiesgo, alertas,
    }
  }, [activo,
      cfg.meta_total, cfg.meta_talleres, cfg.meta_flotas,
      cfg.meta_concesionarios, cfg.meta_construccion, cfg.presupuesto_gastos])

  // Forecast (reactivo a supuestos en tiempo real)
  const forecast = useMemo(() => {
    const { segmento } = activo
    const isMesAnt = activo.periodo === 'mes_anterior'
    const baseVenta = BASE[segmento].venta * (isMesAnt ? MANT : 1)
    const metaMap = {
      todos:          cfg.meta_total,
      talleres:       cfg.meta_talleres,
      flotas:         cfg.meta_flotas,
      concesionarios: cfg.meta_concesionarios,
      construccion:   cfg.meta_construccion,
    }
    let gpct
    if (segmento === 'todos') {
      gpct = (supuestos.talleres*5_200_000 + supuestos.flotas*4_100_000
            + supuestos.concesionarios*2_200_000 + supuestos.construccion*900_000)
           / 12_400_000
    } else {
      gpct = supuestos[segmento] ?? cfg.forecast_mes1
    }
    const g = gpct / 100
    return ['Julio','Agosto','Septiembre'].map((mes,i) => ({
      mes,
      proyeccion: Math.round(baseVenta * Math.pow(1+g, i+1)),
      meta: metaMap[activo.segmento],
    }))
  }, [activo, supuestos,
      cfg.meta_total, cfg.meta_talleres, cfg.meta_flotas,
      cfg.meta_concesionarios, cfg.meta_construccion, cfg.forecast_mes1])

  const cxcVisible = useMemo(() => {
    let rows = datos.cxcRows
    if (filtroCxC === 'vencidas') rows = rows.filter(c=>c.diasVence>0)
    if (filtroCxC === 'criticas') rows = rows.filter(c=>c.diasVence>30)
    return rows
  }, [datos.cxcRows, filtroCxC])

  const TT  = { background:'#0a1a2e', border:'1px solid rgba(56,182,255,0.2)', borderRadius:8, color:'#fff' }
  const AX  = { fill:'rgba(90,143,168,0.7)', fontSize:11 }
  const lbl = periodoLabel(activo.periodo, activo.desde, activo.hasta)

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Filtros ─────────────────────────────────────── */}
      <div className="rmg-card p-4 space-y-3">
        {/* Período */}
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
                  : {background:'rgba(255,255,255,0.05)',color:'var(--rmg-muted)',border:'1px solid rgba(255,255,255,0.08)'}
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

        {/* Segmento + Actualizar */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t" style={{ borderColor:'rgba(56,182,255,0.08)' }}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold mr-0.5 shrink-0" style={{ color:'var(--rmg-muted)' }}>Segmento:</span>
            {['todos','talleres','flotas','concesionarios','construccion'].map(s=>(
              <button key={s} onClick={()=>setFiltro(f=>({...f,segmento:s}))}
                className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                style={filtro.segmento===s
                  ? { background:s==='todos'?'var(--rmg-blue)':`${SEG_COLOR[s]}22`, color:s==='todos'?'#fff':SEG_COLOR[s], border:`1px solid ${s==='todos'?'var(--rmg-blue)':SEG_COLOR[s]}55` }
                  : { background:'rgba(255,255,255,0.04)', color:'var(--rmg-muted)', border:'1px solid rgba(255,255,255,0.08)' }
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
            {lbl} · {SEG_NAME[activo.segmento]} · RMG Auto Parts
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
          style={{ background:'rgba(56,182,255,0.08)', border:'1px solid rgba(56,182,255,0.2)' }}>
          <Zap size={14} style={{ color:'var(--rmg-blt)'}}/>
          <span className="text-xs font-semibold" style={{ color:pendiente?'var(--rmg-gold)':'var(--rmg-blt)' }}>
            {pendiente ? 'Filtro pendiente de aplicar' : 'Datos actualizados'}
          </span>
        </div>
      </div>

      {/* ── Meta + barra ────────────────────────────────── */}
      <div className="rmg-card p-5">
        <div className="flex justify-between items-start mb-3 gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest font-semibold" style={{ color:'var(--rmg-muted)' }}>Venta del período</div>
            <div className="font-black text-4xl mt-0.5" style={{ fontFamily:'Inter Tight, sans-serif' }}>{formatCLP(datos.venta)}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-black text-4xl" style={{ fontFamily:'Inter Tight, sans-serif',
              color:datos.pctMeta>=80?'var(--rmg-teal)':datos.pctMeta>=50?'var(--rmg-gold)':'var(--rmg-red)' }}>
              {datos.pctMeta}%
            </div>
            <div className="text-xs" style={{ color:'var(--rmg-muted)' }}>de meta {formatCLP(datos.meta)}</div>
            <div className="flex items-center justify-end gap-1 text-xs mt-0.5"
              style={{ color:datos.varVenta>=0?'var(--rmg-teal)':'var(--rmg-red)' }}>
              {datos.varVenta>=0?<ArrowUpRight size={12}/>:<ArrowDownRight size={12}/>}
              {Math.abs(datos.varVenta)}% vs período anterior
            </div>
          </div>
        </div>
        <div className="h-3 rounded-full" style={{ background:'rgba(255,255,255,0.05)' }}>
          <div className="h-3 rounded-full transition-all duration-700"
            style={{ width:`${Math.min(datos.pctMeta,100)}%`, background:'linear-gradient(90deg, var(--rmg-blue), var(--rmg-blt))' }}/>
        </div>
      </div>

      {/* ── KPIs ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard label="Clientes activos" value={datos.clientes} sub={`en ${SEG_NAME[activo.segmento].toLowerCase()}`}
          color="var(--rmg-blt)" icon={Users} />
        <KPICard label="Pipeline activo"  value={datos.pipeline} sub="prospectos abiertos"
          color="var(--rmg-purple)" icon={TrendingUp} trend={datos.varVenta} />
        <KPICard label="Cotizaciones"     value={datos.cots}     sub="pendientes de respuesta"
          color="var(--rmg-gold)" icon={FileText} />
        <KPICard label="Margen bruto"     value={`${datos.margenPct}%`} sub={formatCLP(datos.margenB)}
          color="var(--rmg-teal)" icon={Package} />
      </div>

      {/* ══ ACORDEONES ═══════════════════════════════════ */}

      {/* ▼ Ventas por segmento */}
      <Section id="segmentos" title="Ventas por segmento" icon={Activity} iconColor="var(--rmg-blt)"
        badge={`${datos.segs.length} seg.`} open={open.has('segmentos')} onToggle={()=>toggle('segmentos')}>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            {datos.segs.map(s=><SegBar key={s.seg} {...s}/>)}
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-3" style={{ color:'var(--rmg-muted)' }}>
              Evolución del período
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={datos.ventasChart} barCategoryGap="40%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                <XAxis dataKey="label" tick={AX} axisLine={false} tickLine={false}/>
                <YAxis tick={AX} axisLine={false} tickLine={false} tickFormatter={v=>`$${(v/1e6).toFixed(1)}M`}/>
                <Tooltip contentStyle={TT} formatter={v=>[formatCLP(v),'Venta']}/>
                <Bar dataKey="venta" fill="var(--rmg-blue)" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <div className="text-xs uppercase tracking-wider font-semibold mb-3" style={{ color:'var(--rmg-muted)' }}>Detalle por cliente</div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(56,182,255,0.1)', background:'rgba(255,255,255,0.02)' }}>
                {['Cliente','Segmento','Última compra','Monto período','Variación'].map(h=>(
                  <th key={h} className="text-left px-3 py-2.5 text-xs uppercase tracking-wider font-semibold" style={{ color:'var(--rmg-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.clientesFiltro.map((c,i)=>(
                <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                  <td className="px-3 py-2.5 font-medium" style={{ color:'var(--rmg-off)' }}>{c.nombre}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ background:`${SEG_COLOR[c.seg]}18`, color:SEG_COLOR[c.seg] }}>
                      {SEG_NAME[c.seg]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs" style={{ color:'var(--rmg-muted)' }}>{c.ultima}</td>
                  <td className="px-3 py-2.5 font-bold precio-clp" style={{ color:'var(--rmg-off)' }}>{formatCLP(c.monto)}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1 text-xs font-semibold"
                      style={{ color:c.var>0?'var(--rmg-teal)':c.var<0?'var(--rmg-red)':'var(--rmg-muted)' }}>
                      {c.var>0?<ArrowUpRight size={12}/>:c.var<0?<ArrowDownRight size={12}/>:null}
                      {c.var!==0?`${c.var>0?'+':''}${c.var}%`:'—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ▼ EDR */}
      <Section id="edr" title="Estado de Resultados (EDR)" icon={DollarSign} iconColor="var(--rmg-teal)"
        open={open.has('edr')} onToggle={()=>toggle('edr')}>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-2 text-sm space-y-0">

            {/* Venta bruta / Costo */}
            {[
              { label:'Venta bruta',        monto:datos.venta,    pct:'100%',                          var:null },
              { label:'− Costo mercadería', monto:datos.costoMerc, pct:`${(100-datos.margenPct).toFixed(1)}%`, var:null },
            ].map(r=>(
              <div key={r.label} className="flex justify-between py-2" style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color:'var(--rmg-muted)' }}>{r.label}</span>
                <div className="flex items-center gap-6">
                  <span className="text-xs w-12 text-right" style={{ color:'var(--rmg-muted)' }}>{r.pct}</span>
                  <span className="font-semibold w-32 text-right precio-clp" style={{ color:'var(--rmg-off)' }}>{formatCLP(r.monto)}</span>
                </div>
              </div>
            ))}

            <div className="flex justify-between py-2 px-3 rounded-lg my-1"
              style={{ background:'rgba(45,201,138,0.07)', border:'1px solid rgba(45,201,138,0.18)' }}>
              <div className="flex items-center gap-2">
                <span className="font-semibold" style={{ color:'var(--rmg-teal)' }}>= Margen bruto</span>
                <span className="text-xs" style={{ color:'var(--rmg-teal)' }}>↑ +2.3% vs ant.</span>
              </div>
              <div className="flex items-center gap-6">
                <span className="text-xs w-12 text-right font-bold" style={{ color:'var(--rmg-teal)' }}>{datos.margenPct}%</span>
                <span className="font-bold w-32 text-right precio-clp" style={{ color:'var(--rmg-teal)' }}>{formatCLP(datos.margenB)}</span>
              </div>
            </div>

            <div className="pt-3 pb-1 text-xs uppercase tracking-wider font-semibold" style={{ color:'rgba(90,143,168,0.55)' }}>
              Gastos operacionales
            </div>

            {[
              { label:'Sueldos y comisiones', monto:datos.gastos.sueldos,    dir:'+', varN:3.2 },
              { label:'Arriendo bodega',       monto:datos.gastos.arriendo,   dir:' ', varN:0.0 },
              { label:'Transporte / fletes',   monto:datos.gastos.transporte, dir:'-', varN:1.5 },
              { label:'Gastos generales',       monto:datos.gastos.generales,  dir:'+', varN:8.1 },
            ].map(g=>(
              <div key={g.label} className="flex justify-between py-1.5 pl-4" style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-2">
                  <span style={{ color:'var(--rmg-muted)' }}>{g.label}</span>
                  {g.varN > 0 && (
                    <span className="text-xs" style={{ color:g.dir==='+'?'var(--rmg-red)':'var(--rmg-teal)' }}>
                      {g.dir}{g.varN}%
                    </span>
                  )}
                </div>
                <span className="font-medium precio-clp w-32 text-right" style={{ color:'var(--rmg-off)' }}>{formatCLP(g.monto)}</span>
              </div>
            ))}

            <div className="flex justify-between py-2 mt-0.5" style={{ borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
              <span className="font-semibold" style={{ color:'var(--rmg-off)' }}>= Total gastos op.</span>
              <span className="font-bold precio-clp w-32 text-right" style={{ color:'var(--rmg-off)' }}>{formatCLP(datos.totalGastos)}</span>
            </div>

            <div className="flex justify-between py-2.5 px-3 rounded-lg mt-1"
              style={{ background:'rgba(27,143,212,0.08)', border:'1px solid rgba(27,143,212,0.22)' }}>
              <div className="flex items-center gap-2">
                <span className="font-bold" style={{ color:'var(--rmg-blt)' }}>= Utilidad neta</span>
                <span className="text-xs flex items-center gap-0.5" style={{ color:'var(--rmg-teal)' }}>
                  <ArrowUpRight size={11}/> +1.2% vs ant.
                </span>
              </div>
              <div className="flex items-center gap-6">
                <span className="text-xs font-bold" style={{ color:'var(--rmg-blt)' }}>{datos.utilPct}%</span>
                <span className="font-black text-base precio-clp w-32 text-right"
                  style={{ color:'var(--rmg-blt)', fontFamily:'Inter Tight, sans-serif' }}>{formatCLP(datos.utilNeta)}</span>
              </div>
            </div>
          </div>

          {/* Ratios */}
          <div className="flex flex-col gap-3">
            {[
              { label:'Margen bruto',  value:`${datos.margenPct}%`, sub:formatCLP(datos.margenB),    color:'var(--rmg-teal)', var:'+2.3%' },
              { label:'Gastos op.',    value:`${datos.venta>0?((datos.totalGastos/datos.venta)*100).toFixed(1):0}%`, sub:formatCLP(datos.totalGastos), color:'var(--rmg-gold)', var:'+1.1%' },
              { label:'Utilidad neta', value:`${datos.utilPct}%`,   sub:formatCLP(datos.utilNeta),   color:'var(--rmg-blt)',  var:'+1.2%' },
            ].map(r=>(
              <div key={r.label} className="rounded-xl p-4 flex flex-col gap-1 flex-1"
                style={{ background:`${r.color}0d`, border:`1px solid ${r.color}25` }}>
                <div className="flex justify-between items-center">
                  <span className="text-xs uppercase tracking-widest font-semibold" style={{ color:'var(--rmg-muted)' }}>{r.label}</span>
                  <span className="text-xs font-semibold" style={{ color:'var(--rmg-teal)' }}>↑ {r.var}</span>
                </div>
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
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                <XAxis dataKey="mes" tick={{...AX,fontSize:13}} axisLine={false} tickLine={false}/>
                <YAxis tick={AX} axisLine={false} tickLine={false}
                  tickFormatter={v=>`$${(v/1e6).toFixed(0)}M`}
                  domain={[0, Math.max(datos.meta*1.1, ...forecast.map(f=>f.proyeccion))*1.05]}/>
                <Tooltip contentStyle={TT} formatter={v=>[formatCLP(v),'Proyección']}/>
                <ReferenceLine y={datos.meta} stroke="var(--rmg-gold)" strokeDasharray="6 3" strokeWidth={1.5}
                  label={{ value:`Meta $${(datos.meta/1e6).toFixed(0)}M`, position:'insideTopRight',
                           fill:'var(--rmg-gold)', fontSize:11, fontWeight:700 }}/>
                <Bar dataKey="proyeccion" fill="var(--rmg-purple)" radius={[6,6,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Supuestos editables */}
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
              Los sliders actualizan el gráfico en tiempo real sin necesitar "Actualizar".
            </p>
          </div>
        </div>
      </Section>

      {/* ▼ CxC */}
      <Section id="cxc" title="Cuentas por cobrar" icon={FileText} iconColor="var(--rmg-gold)"
        badge={datos.cxcRiesgo>0?`$${(datos.cxcRiesgo/1e6).toFixed(1)}M en riesgo`:null}
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
                  : { background:'rgba(255,255,255,0.04)', color:'var(--rmg-muted)', border:'1px solid rgba(255,255,255,0.08)' }
                }>{l}</button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(56,182,255,0.1)', background:'rgba(255,255,255,0.02)' }}>
                {['Cliente','Factura','Monto','Vence','Días','Estado'].map(h=>(
                  <th key={h} className="text-left px-3 py-2.5 text-xs uppercase tracking-wider font-semibold" style={{ color:'var(--rmg-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cxcVisible.length===0
                ? <tr><td colSpan={6} className="px-3 py-6 text-center text-sm" style={{ color:'var(--rmg-muted)' }}>Sin registros para este filtro</td></tr>
                : cxcVisible.map(c=>{
                  const est = CXC_EST[c.estado]
                  return (
                    <tr key={c.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                      <td className="px-3 py-3 font-medium" style={{ color:'var(--rmg-off)' }}>{c.cliente}</td>
                      <td className="px-3 py-3 text-xs font-mono" style={{ color:'var(--rmg-muted)' }}>{c.factura}</td>
                      <td className="px-3 py-3 font-bold precio-clp" style={{ color:'var(--rmg-off)' }}>{formatCLP(c.monto)}</td>
                      <td className="px-3 py-3 text-xs" style={{ color:'var(--rmg-muted)' }}>{c.fechaVence}</td>
                      <td className="px-3 py-3 text-xs font-semibold"
                        style={{ color:c.diasVence>30?'var(--rmg-red)':c.diasVence>0?'var(--rmg-gold)':'var(--rmg-teal)' }}>
                        {c.diasVence>0?`+${c.diasVence}d`:`${Math.abs(c.diasVence)}d`}
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
      <Section id="flujo" title="Flujo de caja" icon={Activity} iconColor="var(--rmg-teal)"
        open={open.has('flujo')} onToggle={()=>toggle('flujo')}>

        <div className="flex justify-between items-start mb-4 flex-wrap gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color:'var(--rmg-muted)' }}>
              Saldo proyectado fin de mes
            </div>
            <div className="font-black text-2xl mt-0.5 precio-clp"
              style={{ fontFamily:'Inter Tight, sans-serif', color:datos.saldoFin>=0?'var(--rmg-teal)':'var(--rmg-red)' }}>
              {datos.saldoFin>=0?'+':''}{formatCLP(datos.saldoFin)}
            </div>
          </div>
          <div className="flex gap-4 text-xs items-center" style={{ color:'var(--rmg-muted)' }}>
            <span className="flex items-center gap-1.5">
              <div className="w-5 h-0.5 rounded-full" style={{ background:'var(--rmg-teal)' }}/>Ingresos
            </span>
            <span className="flex items-center gap-1.5">
              <div className="w-5 h-0" style={{ borderTop:'2px dashed var(--rmg-red)' }}/>Egresos
            </span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={datos.flujoCaja}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
            <XAxis dataKey="semana" tick={AX} axisLine={false} tickLine={false}/>
            <YAxis tick={AX} axisLine={false} tickLine={false} tickFormatter={v=>`$${(v/1e6).toFixed(1)}M`}/>
            <Tooltip contentStyle={TT} formatter={(v,n)=>[formatCLP(v),n==='ingresos'?'Ingresos':'Egresos']}/>
            <Line type="monotone" dataKey="ingresos" name="ingresos"
              stroke="var(--rmg-teal)" strokeWidth={2.5}
              dot={{ fill:'var(--rmg-teal)', r:4, strokeWidth:0 }} activeDot={{ r:6 }}/>
            <Line type="monotone" dataKey="egresos" name="egresos"
              stroke="var(--rmg-red)" strokeWidth={2} strokeDasharray="5 3"
              dot={{ fill:'var(--rmg-red)', r:4, strokeWidth:0 }} activeDot={{ r:6 }}/>
          </LineChart>
        </ResponsiveContainer>
      </Section>

      {/* ▼ Alertas */}
      <Section id="alertas" title="Alertas operacionales" icon={Bell} iconColor="var(--rmg-red)"
        badge={datos.alertas.filter(a=>a.urgencia==='alta').length||null}
        open={open.has('alertas')} onToggle={()=>toggle('alertas')}>

        {datos.alertas.length===0
          ? <p className="text-sm text-center py-4" style={{ color:'var(--rmg-muted)' }}>Sin alertas para este segmento</p>
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
