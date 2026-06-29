import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP } from '@utils/format'
import { Plus, X, Truck, Phone, Mail, CreditCard, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'

const CAT_LABEL = { bateria: '🔋 Baterías', lubricante: '🛢 Lubricantes', neumatico: '🔵 Neumáticos' }
const CAT_COLOR = { bateria: 'var(--rmg-gold)', lubricante: 'var(--rmg-teal)', neumatico: 'var(--rmg-blt)' }

const FORM_INIT = {
  razon_social: '', rut: '', contacto: '', cargo: '',
  telefono: '', email: '', categorias: [],
  plazo_pago: 30, condicion: 'Crédito 30 días',
  banco: '', cuenta: '',
}

export default function ProveedoresPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(FORM_INIT)
  const [seleccionado, setSeleccionado] = useState(null)

  const { data: proveedores = [], isLoading } = useQuery({
    queryKey: ['proveedores'],
    queryFn: () => api.get('/compras/proveedores').then(r => r.data),
  })

  const { data: detalle } = useQuery({
    queryKey: ['proveedor', seleccionado],
    queryFn: () => api.get(`/compras/proveedores/${seleccionado}`).then(r => r.data),
    enabled: Boolean(seleccionado),
  })

  const crearMut = useMutation({
    mutationFn: (data) => api.post('/compras/proveedores', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['proveedores'])
      toast.success('Proveedor creado')
      setShowForm(false)
      setForm(FORM_INIT)
    },
    onError: () => toast.error('Error al crear proveedor'),
  })

  const toggleCat = (cat) => setForm(f => ({
    ...f,
    categorias: f.categorias.includes(cat)
      ? f.categorias.filter(c => c !== cat)
      : [...f.categorias, cat],
  }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.razon_social || !form.rut) { toast.error('Razón social y RUT son requeridos'); return }
    if (!form.categorias.length) { toast.error('Selecciona al menos una categoría'); return }
    crearMut.mutate(form)
  }

  const ESTADO_OC = {
    borrador: { label: 'Borrador', color: 'rgba(90,143,168,0.8)' },
    enviada:  { label: 'Enviada',  color: 'var(--rmg-blt)' },
    recibida: { label: 'Recibida', color: 'var(--rmg-teal)' },
  }

  return (
    <div className="space-y-5 animate-fade-in">

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Proveedores</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Gestión de proveedores · YOKO · AUSTER · KUMHO · Double Star</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary flex items-center gap-2">
          {showForm ? <><X size={15}/> Cerrar</> : <><Plus size={15}/> Nuevo proveedor</>}
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="rmg-card p-5 animate-fade-in">
          <h2 className="font-bold mb-4">Registrar proveedor</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Razón social *</label>
              <input className="rmg-input" value={form.razon_social} onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))} required/>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>RUT *</label>
              <input className="rmg-input" placeholder="96.200.100-8" value={form.rut} onChange={e => setForm(f => ({ ...f, rut: e.target.value }))} required/>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Contacto</label>
              <input className="rmg-input" value={form.contacto} onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))}/>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Cargo</label>
              <input className="rmg-input" value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))}/>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Teléfono</label>
              <input className="rmg-input" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}/>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Email</label>
              <input type="email" className="rmg-input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}/>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Plazo pago (días)</label>
              <input type="number" className="rmg-input" value={form.plazo_pago} onChange={e => setForm(f => ({ ...f, plazo_pago: Number(e.target.value) }))}/>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Categorías *</label>
              <div className="flex gap-2">
                {['bateria','lubricante','neumatico'].map(cat => (
                  <button key={cat} type="button" onClick={() => toggleCat(cat)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                    style={form.categorias.includes(cat)
                      ? { background: `${CAT_COLOR[cat]}22`, color: CAT_COLOR[cat], border: `1px solid ${CAT_COLOR[cat]}55` }
                      : { background: 'rgba(255,255,255,0.04)', color: 'var(--rmg-muted)', border: '1px solid rgba(255,255,255,0.08)' }
                    }>
                    {CAT_LABEL[cat]}
                  </button>
                ))}
              </div>
            </div>
            <div className="md:col-span-3 flex gap-3 justify-end pt-1">
              <button type="button" onClick={() => { setShowForm(false); setForm(FORM_INIT) }} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={crearMut.isPending} className="btn-primary disabled:opacity-50">
                {crearMut.isPending ? 'Guardando...' : 'Guardar proveedor'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Lista proveedores */}
        <div className="lg:col-span-1 space-y-2">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rmg-card p-4 animate-pulse">
                  <div className="h-4 rounded mb-2" style={{ background: 'rgba(255,255,255,0.06)' }}/>
                  <div className="h-3 rounded w-2/3" style={{ background: 'rgba(255,255,255,0.04)' }}/>
                </div>
              ))
            : proveedores.map(p => (
                <button key={p.id} onClick={() => setSeleccionado(p.id === seleccionado ? null : p.id)}
                  className="w-full rmg-card p-4 text-left transition-all hover:border-blue-500/30"
                  style={seleccionado === p.id ? { borderColor: 'var(--rmg-blue)', background: 'rgba(27,143,212,0.06)' } : {}}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate" style={{ color: 'var(--rmg-off)' }}>{p.razon_social}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{p.rut}</div>
                    </div>
                    <ChevronRight size={14} style={{ color: 'var(--rmg-muted)', flexShrink: 0, marginTop: 2 }}/>
                  </div>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {(p.categorias || []).map(cat => (
                      <span key={cat} className="text-xs px-1.5 py-0.5 rounded font-medium"
                        style={{ background: `${CAT_COLOR[cat]}15`, color: CAT_COLOR[cat] }}>
                        {CAT_LABEL[cat]}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs mt-2" style={{ color: 'var(--rmg-muted)' }}>
                    {p.condicion} · {p.contacto}
                  </div>
                </button>
              ))
          }
        </div>

        {/* Detalle proveedor */}
        <div className="lg:col-span-2">
          {!seleccionado ? (
            <div className="rmg-card flex flex-col items-center justify-center py-20" style={{ color: 'var(--rmg-muted)' }}>
              <Truck size={40} className="mb-3 opacity-20"/>
              <p className="text-sm">Selecciona un proveedor para ver su detalle</p>
            </div>
          ) : !detalle ? (
            <div className="rmg-card p-6 animate-pulse">
              <div className="h-6 rounded mb-4" style={{ background: 'rgba(255,255,255,0.06)' }}/>
              <div className="h-4 rounded w-3/4 mb-2" style={{ background: 'rgba(255,255,255,0.04)' }}/>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header */}
              <div className="rmg-card p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="font-black text-xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-off)' }}>{detalle.razon_social}</h2>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>RUT: {detalle.rut}</div>
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {(detalle.categorias || []).map(cat => (
                      <span key={cat} className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: `${CAT_COLOR[cat]}18`, color: CAT_COLOR[cat] }}>
                        {CAT_LABEL[cat]}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  {[
                    { icon: Phone, label: 'Teléfono', value: detalle.telefono },
                    { icon: Mail,  label: 'Email', value: detalle.email },
                    { icon: CreditCard, label: 'Plazo pago', value: detalle.condicion },
                  ].map(({ icon: Icon, label, value }) => value && (
                    <div key={label} className="flex items-start gap-2">
                      <Icon size={13} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--rmg-muted)' }}/>
                      <div>
                        <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{label}</div>
                        <div style={{ color: 'var(--rmg-off)' }}>{value}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t text-sm" style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
                  <span style={{ color: 'var(--rmg-muted)' }}>Contacto: </span>
                  <span style={{ color: 'var(--rmg-off)' }}>{detalle.contacto}</span>
                  {detalle.cargo && <span style={{ color: 'var(--rmg-muted)' }}> · {detalle.cargo}</span>}
                </div>
              </div>

              {/* Órdenes de compra del proveedor */}
              <div className="rmg-card overflow-hidden">
                <div className="px-5 py-3 border-b text-sm font-bold" style={{ borderColor: 'rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                  Órdenes de compra
                </div>
                {(!detalle.ordenes_compra || detalle.ordenes_compra.length === 0) ? (
                  <div className="py-8 text-center text-sm" style={{ color: 'var(--rmg-muted)' }}>Sin órdenes de compra</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                        {['N° OC','Estado','Total','Fecha','Pago'].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.ordenes_compra.map(oc => {
                        const est = ESTADO_OC[oc.estado] || { label: oc.estado, color: 'var(--rmg-muted)' }
                        return (
                          <tr key={oc.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td className="px-4 py-2.5 font-mono text-xs font-bold" style={{ color: 'var(--rmg-blt)' }}>{oc.numero}</td>
                            <td className="px-4 py-2.5">
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                style={{ background: `${est.color}18`, color: est.color }}>{est.label}</span>
                            </td>
                            <td className="px-4 py-2.5 font-bold" style={{ color: 'var(--rmg-off)' }}>{formatCLP(oc.total)}</td>
                            <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--rmg-muted)' }}>{oc.fecha_emision}</td>
                            <td className="px-4 py-2.5">
                              {oc.pagada
                                ? <span className="text-xs font-semibold" style={{ color: 'var(--rmg-teal)' }}>✓ Pagada</span>
                                : <span className="text-xs font-semibold" style={{ color: 'var(--rmg-gold)' }}>Pendiente</span>
                              }
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
