import { useState } from 'react'
import { useAuth } from '@context/AuthContext'
import { useConfigStore } from '@stores/configStore'
import {
  Building2, Users, Plug, Check, Plus, X,
  Shield, Eye, EyeOff, SlidersHorizontal
} from 'lucide-react'
import toast from 'react-hot-toast'

// ─── Datos estáticos ─────────────────────────────────────
const INTEGRACIONES = [
  { nombre: 'Supabase (PostgreSQL)', estado: 'mock',      descripcion: 'Base de datos — modo desarrollo local' },
  { nombre: 'WhatsApp Business API', estado: 'pendiente', descripcion: 'Meta Cloud API — requiere WABA activada' },
  { nombre: 'Meta Ads',              estado: 'pendiente', descripcion: 'Pixel + campañas — requiere Meta App' },
  { nombre: 'Google Ads',            estado: 'pendiente', descripcion: 'Campañas — requiere developer token' },
  { nombre: 'SendGrid (Email)',       estado: 'pendiente', descripcion: 'Envío de cotizaciones por email' },
]
const ESTADO_STYLES = {
  activo:    { color: 'var(--rmg-teal)',  bg: 'rgba(45,201,138,0.12)',  label: '● Activo'         },
  mock:      { color: 'var(--rmg-gold)',  bg: 'rgba(244,162,60,0.12)',  label: '◌ Mock local'     },
  pendiente: { color: 'rgba(90,143,168,0.9)', bg: 'rgba(255,255,255,0.08)', label: '○ No configurado' },
}
const ROLES = ['admin', 'vendedor', 'bodeguero']
const ROL_STYLES = {
  admin:     { bg: 'rgba(56,182,255,0.12)', color: 'var(--rmg-blt)'    },
  vendedor:  { bg: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)'   },
  bodeguero: { bg: 'rgba(159,90,253,0.12)', color: 'var(--rmg-purple)' },
}
const PERMISOS = [
  { modulo: 'Dashboard',     admin: true,  vendedor: true,  bodeguero: false },
  { modulo: 'Catálogo',      admin: true,  vendedor: true,  bodeguero: true  },
  { modulo: 'Clientes',      admin: true,  vendedor: true,  bodeguero: false },
  { modulo: 'Pipeline CRM',  admin: true,  vendedor: true,  bodeguero: false },
  { modulo: 'Cotizaciones',  admin: true,  vendedor: true,  bodeguero: false },
  { modulo: 'Pedidos',       admin: true,  vendedor: true,  bodeguero: true  },
  { modulo: 'Gastos',        admin: true,  vendedor: false, bodeguero: false },
  { modulo: 'Inventario',    admin: true,  vendedor: false, bodeguero: true  },
  { modulo: 'Agenda',        admin: true,  vendedor: true,  bodeguero: false },
  { modulo: 'Bot WhatsApp',  admin: true,  vendedor: true,  bodeguero: false },
  { modulo: 'Reportes',      admin: true,  vendedor: false, bodeguero: false },
  { modulo: 'Configuración', admin: true,  vendedor: false, bodeguero: false },
]
const USUARIOS_INIT = [
  { id: 'u1', nombre: 'Gerente RMG',   email: 'admin@rmgautoparts.cl',  rol: 'admin',     activo: true },
  { id: 'u2', nombre: 'Joaquín Pérez', email: 'jperez@rmgautoparts.cl', rol: 'vendedor',  activo: true },
  { id: 'u3', nombre: 'Manuel Rojas',  email: 'mrojas@rmgautoparts.cl', rol: 'bodeguero', activo: true },
]
const FORM_INIT = { nombre: '', email: '', rol: 'vendedor', activo: true }

// ─── Componentes auxiliares ───────────────────────────────
const Field = ({ label, children }) => (
  <div>
    <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>{label}</label>
    {children}
  </div>
)

const NumInput = ({ value, onChange, min, max, step = 1, prefix = '', suffix = '' }) => (
  <div className="flex items-center gap-1">
    {prefix && <span className="text-sm font-semibold" style={{ color: 'var(--rmg-muted)' }}>{prefix}</span>}
    <input
      type="number"
      className="rmg-input"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={e => onChange(Number(e.target.value))}
    />
    {suffix && <span className="text-sm font-semibold" style={{ color: 'var(--rmg-muted)' }}>{suffix}</span>}
  </div>
)

// ─── Página principal ────────────────────────────────────
export default function ConfiguracionPage() {
  const [tab, setTab] = useState('empresa')
  const { user } = useAuth()

  // ── Empresa ──────────────────────────────────────────────
  const [empresa, setEmpresa] = useState({
    nombre:    'RMG Auto Parts',
    rut:       '76.XXX.XXX-X',
    direccion: 'Santiago, RM, Chile',
    telefono:  '+56 9 1234 5678',
    email:     'ventas@rmgautoparts.cl',
  })
  const handleSaveEmpresa = () => toast.success('Datos de empresa guardados')

  // ── Usuarios ─────────────────────────────────────────────
  const [usuarios, setUsuarios]   = useState(USUARIOS_INIT)
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState(FORM_INIT)

  const handleAddUser = () => {
    if (!form.nombre.trim() || !form.email.trim()) { toast.error('Nombre y email son obligatorios'); return }
    setUsuarios(prev => [...prev, { ...form, id: `u${Date.now()}` }])
    setForm(FORM_INIT)
    setShowForm(false)
    toast.success(`Usuario ${form.nombre} agregado`)
  }
  const toggleActivo = (id) => setUsuarios(prev => prev.map(u => u.id === id ? { ...u, activo: !u.activo } : u))

  // ── Parámetros del negocio (Zustand + localStorage) ──────
  const cfg    = useConfigStore()
  const saveCfg = useConfigStore(s => s.save)

  const [params, setParams] = useState({
    meta_total:           cfg.meta_total,
    meta_talleres:        cfg.meta_talleres,
    meta_flotas:          cfg.meta_flotas,
    meta_concesionarios:  cfg.meta_concesionarios,
    meta_construccion:    cfg.meta_construccion,
    forecast_mes1:        cfg.forecast_mes1,
    forecast_mes2:        cfg.forecast_mes2,
    forecast_mes3:        cfg.forecast_mes3,
    margen_objetivo:      cfg.margen_objetivo,
    dias_credito:         cfg.dias_credito,
    presupuesto_gastos:   cfg.presupuesto_gastos,
    stock_min_bateria:    cfg.stock_min_bateria,
    stock_min_lubricante: cfg.stock_min_lubricante,
    stock_min_neumatico:  cfg.stock_min_neumatico,
    dias_inactivo:        cfg.dias_inactivo,
    dias_cxc_alerta:      cfg.dias_cxc_alerta,
  })

  const handleSaveParams = () => {
    saveCfg(params)
    toast.success('Parámetros guardados — dashboard y reportes actualizados')
  }

  const setP = (key) => (val) => setParams(p => ({ ...p, [key]: val }))

  const TABS = [
    { k: 'empresa',    l: 'Empresa',            Icon: Building2        },
    { k: 'usuarios',   l: 'Usuarios y Roles',   Icon: Users            },
    { k: 'parametros', l: 'Parámetros negocio', Icon: SlidersHorizontal },
    { k: 'integraciones', l: 'Integraciones',   Icon: Plug             },
  ]

  return (
    <div className="space-y-5 animate-fade-in max-w-4xl">

      <div>
        <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Configuración</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Empresa · Usuarios · Parámetros · Integraciones</p>
      </div>

      {/* ── Tabs ──────────────────────────────────────────── */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
        {TABS.map(({ k, l, Icon }) => (
          <button key={k} onClick={() => setTab(k)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all border-b-2"
            style={tab === k
              ? { borderColor: 'var(--rmg-blue)', color: 'var(--rmg-blt)' }
              : { borderColor: 'transparent', color: 'var(--rmg-muted)' }
            }>
            <Icon size={15} />{l}
          </button>
        ))}
      </div>

      {/* ══ EMPRESA ═══════════════════════════════════════════ */}
      {tab === 'empresa' && (
        <div className="rmg-card p-6 space-y-4">
          <h2 className="font-bold">Datos de la empresa</h2>
          {[
            { label: 'Nombre / Razón social', key: 'nombre'    },
            { label: 'RUT',                   key: 'rut'        },
            { label: 'Dirección',             key: 'direccion'  },
            { label: 'Teléfono',              key: 'telefono'   },
            { label: 'Email comercial',       key: 'email'      },
          ].map(({ label, key }) => (
            <Field key={key} label={label}>
              <input className="rmg-input" value={empresa[key]}
                onChange={e => setEmpresa(p => ({ ...p, [key]: e.target.value }))} />
            </Field>
          ))}
          <div className="pt-2">
            <button onClick={handleSaveEmpresa} className="btn-primary flex items-center gap-2">
              <Check size={15} /> Guardar cambios
            </button>
          </div>
        </div>
      )}

      {/* ══ USUARIOS Y ROLES ══════════════════════════════════ */}
      {tab === 'usuarios' && (
        <div className="space-y-4">
          <div className="rmg-card overflow-hidden">
            <div className="px-5 py-4 border-b flex justify-between items-center" style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
              <div>
                <span className="font-bold">Usuarios del sistema</span>
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blt)' }}>
                  {usuarios.length}
                </span>
              </div>
              <button onClick={() => setShowForm(v => !v)} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
                {showForm ? <X size={13} /> : <Plus size={13} />}
                {showForm ? 'Cancelar' : 'Agregar usuario'}
              </button>
            </div>

            {showForm && (
              <div className="px-5 py-4 border-b grid grid-cols-2 gap-3"
                style={{ borderColor: 'rgba(56,182,255,0.1)', background: 'rgba(56,182,255,0.04)' }}>
                <Field label="Nombre">
                  <input className="rmg-input" placeholder="Nombre completo" value={form.nombre}
                    onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} />
                </Field>
                <Field label="Email">
                  <input className="rmg-input" placeholder="email@rmgautoparts.cl" type="email" value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                </Field>
                <Field label="Rol">
                  <select className="rmg-input" value={form.rol} onChange={e => setForm(p => ({ ...p, rol: e.target.value }))}>
                    {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                </Field>
                <div className="flex items-end">
                  <button onClick={handleAddUser} className="btn-primary w-full flex items-center justify-center gap-2">
                    <Check size={14} /> Crear usuario
                  </button>
                </div>
              </div>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                  {['Nombre', 'Email', 'Rol', 'Estado', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usuarios.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                          style={{ background: ROL_STYLES[u.rol]?.bg, color: ROL_STYLES[u.rol]?.color }}>
                          {u.nombre[0]}
                        </div>
                        <span className="font-medium" style={{ color: 'var(--rmg-off)' }}>{u.nombre}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: ROL_STYLES[u.rol]?.bg, color: ROL_STYLES[u.rol]?.color }}>
                        {u.rol}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: u.activo ? 'var(--rmg-teal)' : 'var(--rmg-muted)' }}>
                      {u.activo ? '● Activo' : '○ Inactivo'}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleActivo(u.id)}
                        className="text-xs px-2.5 py-1 rounded-lg transition-colors hover:bg-white/5"
                        style={{ color: 'var(--rmg-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rmg-card overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
              <Shield size={16} style={{ color: 'var(--rmg-blue)' }} />
              <span className="font-bold">Permisos por rol</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold w-40" style={{ color: 'var(--rmg-muted)' }}>Módulo</th>
                    {ROLES.map(r => (
                      <th key={r} className="px-6 py-3 text-center" style={{ minWidth: 110 }}>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                          style={{ background: ROL_STYLES[r]?.bg, color: ROL_STYLES[r]?.color }}>{r}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISOS.map((p, i) => (
                    <tr key={p.modulo} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                      <td className="px-4 py-2.5 text-sm font-medium" style={{ color: 'var(--rmg-off)' }}>{p.modulo}</td>
                      {ROLES.map(r => (
                        <td key={r} className="px-6 py-2.5 text-center">
                          {p[r]
                            ? <Eye size={15} style={{ color: 'var(--rmg-teal)', display: 'inline' }} />
                            : <EyeOff size={15} style={{ color: 'rgba(255,255,255,0.15)', display: 'inline' }} />
                          }
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 flex gap-5 text-xs" style={{ color: 'var(--rmg-muted)', borderTop: '1px solid rgba(56,182,255,0.08)' }}>
              <span className="flex items-center gap-1.5"><Eye size={13} style={{ color: 'var(--rmg-teal)' }} /> Puede acceder</span>
              <span className="flex items-center gap-1.5"><EyeOff size={13} style={{ color: 'rgba(255,255,255,0.2)' }} /> Sin acceso</span>
            </div>
          </div>
        </div>
      )}

      {/* ══ PARÁMETROS DEL NEGOCIO ════════════════════════════ */}
      {tab === 'parametros' && (
        <div className="space-y-5">

          {/* ─── Metas mensuales ─────────────────────────────── */}
          <div className="rmg-card p-6">
            <h2 className="font-bold mb-1">Metas mensuales</h2>
            <p className="text-xs mb-5" style={{ color: 'var(--rmg-muted)' }}>
              Los valores se reflejan automáticamente en el Dashboard y en Reportes.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Meta total mensual">
                <NumInput value={params.meta_total} min={0} step={500000} prefix="$"
                  onChange={setP('meta_total')} />
              </Field>
              <Field label="Meta Talleres">
                <NumInput value={params.meta_talleres} min={0} step={500000} prefix="$"
                  onChange={setP('meta_talleres')} />
              </Field>
              <Field label="Meta Flotas">
                <NumInput value={params.meta_flotas} min={0} step={500000} prefix="$"
                  onChange={setP('meta_flotas')} />
              </Field>
              <Field label="Meta Concesionarios">
                <NumInput value={params.meta_concesionarios} min={0} step={500000} prefix="$"
                  onChange={setP('meta_concesionarios')} />
              </Field>
              <Field label="Meta Construcción">
                <NumInput value={params.meta_construccion} min={0} step={500000} prefix="$"
                  onChange={setP('meta_construccion')} />
              </Field>
            </div>
            <p className="text-xs mt-4 pt-3" style={{ borderTop: '1px solid rgba(56,182,255,0.08)', color: 'var(--rmg-muted)' }}>
              La suma de segmentos ({(
                (params.meta_talleres + params.meta_flotas + params.meta_concesionarios + params.meta_construccion) / 1_000_000
              ).toFixed(1)}M) idealmente iguala la meta total ({(params.meta_total / 1_000_000).toFixed(0)}M).
            </p>
          </div>

          {/* ─── Base de forecast ────────────────────────────── */}
          <div className="rmg-card p-6">
            <h2 className="font-bold mb-1">Base de forecast</h2>
            <p className="text-xs mb-5" style={{ color: 'var(--rmg-muted)' }}>
              Supuestos iniciales para la proyección de los próximos 3 meses.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Crecimiento mes 1">
                <NumInput value={params.forecast_mes1} min={-50} max={100} suffix="%"
                  onChange={setP('forecast_mes1')} />
              </Field>
              <Field label="Crecimiento mes 2">
                <NumInput value={params.forecast_mes2} min={-50} max={100} suffix="%"
                  onChange={setP('forecast_mes2')} />
              </Field>
              <Field label="Crecimiento mes 3">
                <NumInput value={params.forecast_mes3} min={-50} max={100} suffix="%"
                  onChange={setP('forecast_mes3')} />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <Field label="Margen bruto objetivo">
                <NumInput value={params.margen_objetivo} min={0} max={100} step={0.5} suffix="%"
                  onChange={setP('margen_objetivo')} />
              </Field>
              <Field label="Días de crédito promedio">
                <NumInput value={params.dias_credito} min={0} max={180} suffix="días"
                  onChange={setP('dias_credito')} />
              </Field>
              <Field label="Presupuesto mensual gastos">
                <NumInput value={params.presupuesto_gastos} min={0} step={100000} prefix="$"
                  onChange={setP('presupuesto_gastos')} />
              </Field>
            </div>
          </div>

          {/* ─── Parámetros de alerta ────────────────────────── */}
          <div className="rmg-card p-6">
            <h2 className="font-bold mb-1">Parámetros de alerta</h2>
            <p className="text-xs mb-5" style={{ color: 'var(--rmg-muted)' }}>
              Umbrales que disparan alertas en el Dashboard y en Bodegas.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Stock mínimo — Baterías">
                <NumInput value={params.stock_min_bateria} min={0} suffix="u"
                  onChange={setP('stock_min_bateria')} />
              </Field>
              <Field label="Stock mínimo — Lubricantes">
                <NumInput value={params.stock_min_lubricante} min={0} suffix="u"
                  onChange={setP('stock_min_lubricante')} />
              </Field>
              <Field label="Stock mínimo — Neumáticos">
                <NumInput value={params.stock_min_neumatico} min={0} suffix="u"
                  onChange={setP('stock_min_neumatico')} />
              </Field>
              <Field label="Días sin compra → cliente inactivo">
                <NumInput value={params.dias_inactivo} min={1} suffix="días"
                  onChange={setP('dias_inactivo')} />
              </Field>
              <Field label="Días vencimiento CxC → alerta">
                <NumInput value={params.dias_cxc_alerta} min={1} suffix="días"
                  onChange={setP('dias_cxc_alerta')} />
              </Field>
            </div>
          </div>

          {/* Guardar */}
          <div className="flex justify-end">
            <button onClick={handleSaveParams} className="btn-primary flex items-center gap-2 px-6">
              <Check size={15} /> Guardar parámetros
            </button>
          </div>
        </div>
      )}

      {/* ══ INTEGRACIONES ═════════════════════════════════════ */}
      {tab === 'integraciones' && (
        <div className="space-y-3">
          {INTEGRACIONES.map(integ => {
            const est = ESTADO_STYLES[integ.estado]
            return (
              <div key={integ.nombre} className="rmg-card p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium" style={{ color: 'var(--rmg-off)' }}>{integ.nombre}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{integ.descripcion}</div>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
                  style={{ background: est.bg, color: est.color }}>
                  {est.label}
                </span>
              </div>
            )
          })}
          <div className="rmg-card p-4 mt-2" style={{ borderColor: 'rgba(56,182,255,0.2)' }}>
            <p className="text-xs" style={{ color: 'var(--rmg-muted)' }}>
              Para activar integraciones: copia{' '}
              <code className="font-mono text-xs px-1 rounded" style={{ background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blt)' }}>.env.example</code>
              {' '}como{' '}
              <code className="font-mono text-xs px-1 rounded" style={{ background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blt)' }}>.env</code>
              {' '}y completa las credenciales de cada servicio.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
