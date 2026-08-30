import { useState } from 'react'
import { useAuth } from '@context/AuthContext'
import { Building2, Users, Plug, Check, Plus, X, Shield, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'

const INTEGRACIONES = [
  { nombre: 'Supabase (PostgreSQL)', estado: 'mock',      descripcion: 'Base de datos — modo desarrollo local' },
  { nombre: 'WhatsApp Business API',  estado: 'pendiente', descripcion: 'Meta Cloud API — requiere WABA activada' },
  { nombre: 'Meta Ads',               estado: 'pendiente', descripcion: 'Pixel + campañas — requiere Meta App' },
  { nombre: 'Google Ads',             estado: 'pendiente', descripcion: 'Campañas — requiere developer token' },
  { nombre: 'SendGrid (Email)',        estado: 'pendiente', descripcion: 'Envío de cotizaciones por email' },
]

const ESTADO_STYLES = {
  activo:    { color: 'var(--rmg-teal)',   bg: 'rgba(45,201,138,0.12)',  label: '● Activo' },
  mock:      { color: 'var(--rmg-gold)',   bg: 'rgba(244,162,60,0.12)',  label: '◌ Mock local' },
  pendiente: { color: 'var(--rmg-muted)',  bg: 'rgba(15, 35, 60,0.05)', label: '○ No configurado' },
}

const ROLES = ['admin', 'vendedor', 'bodeguero']

const ROL_STYLES = {
  admin:      { bg: 'rgba(56,182,255,0.12)',  color: 'var(--rmg-blt)' },
  vendedor:   { bg: 'rgba(45,201,138,0.12)',  color: 'var(--rmg-teal)' },
  bodeguero:  { bg: 'rgba(159,90,253,0.12)',  color: 'var(--rmg-purple)' },
}

const PERMISOS = [
  { modulo: 'Dashboard',         admin: true,  vendedor: true,  bodeguero: false },
  { modulo: 'Catálogo',          admin: true,  vendedor: true,  bodeguero: true  },
  { modulo: 'Clientes',          admin: true,  vendedor: true,  bodeguero: false },
  { modulo: 'Pipeline CRM',      admin: true,  vendedor: true,  bodeguero: false },
  { modulo: 'Cotizaciones',      admin: true,  vendedor: true,  bodeguero: false },
  { modulo: 'Pedidos',           admin: true,  vendedor: true,  bodeguero: true  },
  { modulo: 'Gastos',            admin: true,  vendedor: false, bodeguero: false },
  { modulo: 'Inventario',        admin: true,  vendedor: false, bodeguero: true  },
  { modulo: 'Agenda',            admin: true,  vendedor: true,  bodeguero: false },
  { modulo: 'Bot WhatsApp',      admin: true,  vendedor: true,  bodeguero: false },
  { modulo: 'Reportes',          admin: true,  vendedor: false, bodeguero: false },
  { modulo: 'Configuración',     admin: true,  vendedor: false, bodeguero: false },
]

const USUARIOS_INIT = [
  { id: 'u1', nombre: 'Gerente RMG',    email: 'admin@rmgautoparts.cl',    rol: 'admin',     activo: true  },
  { id: 'u2', nombre: 'Joaquín Pérez',  email: 'jperez@rmgautoparts.cl',   rol: 'vendedor',  activo: true  },
  { id: 'u3', nombre: 'Manuel Rojas',   email: 'mrojas@rmgautoparts.cl',   rol: 'bodeguero', activo: true  },
]

const FORM_INIT = { nombre: '', email: '', rol: 'vendedor', activo: true }

export default function ConfigPage() {
  const [tab, setTab] = useState('empresa')
  const { user } = useAuth()

  const [empresa, setEmpresa] = useState({
    nombre:   'RMG Parts',
    rut:      '76.XXX.XXX-X',
    direccion:'Santiago, RM, Chile',
    telefono: '+56 9 1234 5678',
    email:    'ventas@rmgautoparts.cl',
  })

  const [usuarios, setUsuarios] = useState(USUARIOS_INIT)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(FORM_INIT)

  const handleSave = () => toast.success('Configuración guardada')

  const handleAddUser = () => {
    if (!form.nombre.trim() || !form.email.trim()) {
      toast.error('Nombre y email son obligatorios')
      return
    }
    const nuevo = { ...form, id: `u${Date.now()}` }
    setUsuarios(prev => [...prev, nuevo])
    setForm(FORM_INIT)
    setShowForm(false)
    toast.success(`Usuario ${nuevo.nombre} agregado`)
  }

  const toggleActivo = (id) => {
    setUsuarios(prev => prev.map(u => u.id === id ? { ...u, activo: !u.activo } : u))
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-4xl">

      <div>
        <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Configuración</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Empresa · usuarios · integraciones</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
        {[
          { k: 'empresa',       l: 'Empresa',       Icon: Building2 },
          { k: 'usuarios',      l: 'Usuarios y Roles', Icon: Users   },
          { k: 'integraciones', l: 'Integraciones', Icon: Plug       },
        ].map(({ k, l, Icon }) => (
          <button key={k} onClick={() => setTab(k)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all border-b-2"
            style={tab === k
              ? { borderColor: 'var(--rmg-blue)', color: 'var(--rmg-blt)' }
              : { borderColor: 'transparent', color: 'var(--rmg-muted)' }
            }>
            <Icon size={15} />
            {l}
          </button>
        ))}
      </div>

      {/* ── EMPRESA ─────────────────────────────────────────── */}
      {tab === 'empresa' && (
        <div className="rmg-card p-6 space-y-4">
          <h2 className="font-bold">Datos de la empresa</h2>
          {[
            { label: 'Nombre / Razón social', key: 'nombre'   },
            { label: 'RUT',                   key: 'rut'       },
            { label: 'Dirección',             key: 'direccion' },
            { label: 'Teléfono',              key: 'telefono'  },
            { label: 'Email comercial',       key: 'email'     },
          ].map(({ label, key }) => (
            <div key={key}>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>{label}</label>
              <input
                className="rmg-input"
                value={empresa[key]}
                onChange={e => setEmpresa(prev => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="pt-2">
            <button onClick={handleSave} className="btn-primary flex items-center gap-2">
              <Check size={15} /> Guardar cambios
            </button>
          </div>
        </div>
      )}

      {/* ── USUARIOS Y ROLES ────────────────────────────────── */}
      {tab === 'usuarios' && (
        <div className="space-y-4">

          {/* Tabla de usuarios */}
          <div className="rmg-card overflow-hidden">
            <div className="px-5 py-4 border-b flex justify-between items-center" style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
              <div>
                <span className="font-bold">Usuarios del sistema</span>
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blt)' }}>
                  {usuarios.length}
                </span>
              </div>
              <button
                onClick={() => setShowForm(v => !v)}
                className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
              >
                {showForm ? <X size={13} /> : <Plus size={13} />}
                {showForm ? 'Cancelar' : 'Agregar usuario'}
              </button>
            </div>

            {/* Formulario inline */}
            {showForm && (
              <div className="px-5 py-4 border-b grid grid-cols-2 gap-3" style={{ borderColor: 'rgba(56,182,255,0.1)', background: 'rgba(56,182,255,0.04)' }}>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Nombre</label>
                  <input className="rmg-input" placeholder="Nombre completo" value={form.nombre}
                    onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Email</label>
                  <input className="rmg-input" placeholder="email@rmgautoparts.cl" type="email" value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Rol</label>
                  <select className="rmg-input" value={form.rol} onChange={e => setForm(p => ({ ...p, rol: e.target.value }))}>
                    {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <button onClick={handleAddUser} className="btn-primary w-full flex items-center justify-center gap-2">
                    <Check size={14} /> Crear usuario
                  </button>
                </div>
              </div>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(15, 35, 60,0.02)' }}>
                  {['Nombre', 'Email', 'Rol', 'Estado', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usuarios.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                          style={{ background: ROL_STYLES[u.rol]?.bg || 'var(--rmg-surface)', color: ROL_STYLES[u.rol]?.color || 'var(--rmg-off)' }}>
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
                    <td className="px-4 py-3">
                      <span className="text-xs" style={{ color: u.activo ? 'var(--rmg-teal)' : 'var(--rmg-muted)' }}>
                        {u.activo ? '● Activo' : '○ Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActivo(u.id)}
                        className="text-xs px-2.5 py-1 rounded-lg transition-colors hover:bg-black/5"
                        style={{ color: 'var(--rmg-muted)', border: '1px solid rgba(15, 35, 60,0.08)' }}
                      >
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tabla de permisos por rol */}
          <div className="rmg-card overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
              <Shield size={16} style={{ color: 'var(--rmg-blue)' }} />
              <span className="font-bold">Permisos por rol</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(15, 35, 60,0.02)' }}>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold w-40" style={{ color: 'var(--rmg-muted)' }}>Módulo</th>
                    {ROLES.map(r => (
                      <th key={r} className="px-6 py-3 text-center" style={{ minWidth: 110 }}>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                          style={{ background: ROL_STYLES[r]?.bg, color: ROL_STYLES[r]?.color }}>
                          {r}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISOS.map((p, i) => (
                    <tr key={p.modulo} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(15, 35, 60,0.01)' }}>
                      <td className="px-4 py-2.5 text-sm font-medium" style={{ color: 'var(--rmg-off)' }}>{p.modulo}</td>
                      {ROLES.map(r => (
                        <td key={r} className="px-6 py-2.5 text-center">
                          {p[r]
                            ? <Eye size={15} style={{ color: 'var(--rmg-teal)', display: 'inline' }} />
                            : <EyeOff size={15} style={{ color: 'rgba(15, 35, 60,0.15)', display: 'inline' }} />
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
              <span className="flex items-center gap-1.5"><EyeOff size={13} style={{ color: 'rgba(15, 35, 60,0.2)' }} /> Sin acceso</span>
            </div>
          </div>
        </div>
      )}

      {/* ── INTEGRACIONES ───────────────────────────────────── */}
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
              Para activar integraciones: copia <code className="font-mono text-xs px-1 rounded" style={{ background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blt)' }}>.env.example</code> como <code className="font-mono text-xs px-1 rounded" style={{ background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blt)' }}>.env</code> y completa las credenciales de cada servicio.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
