/**
 * Prospección automática — panel (2026-10-13, pedido de JC)
 * Correo D0 (casilla de Abril) → WhatsApp D1 → WhatsApp D2 → dormido.
 * Abril trabaja la pestaña "Para llamar"; gerencia configura y ve el embudo.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { useAuth } from '@context/AuthContext'
import toast from 'react-hot-toast'
import { Send, Play, Eye, PhoneCall, MessageCircle, Power, RefreshCw, AlertTriangle, CheckCircle2, X } from 'lucide-react'

const SEQ = [
  ['correo_enviado', 'Correo enviado'], ['wsp1_enviado', 'WhatsApp 1'], ['wsp2_enviado', 'WhatsApp 2'],
  ['dormido', 'Dormido'], ['baja', 'Baja'], ['dato_erroneo', 'Dato erróneo'],
]
const COM = {
  respondio_correo: 'Respondió correo', respondio_wsp: 'Respondió WhatsApp', abril_llamo: 'Abril llamó',
  coordinando_reunion: 'Coordinando reunión', visita_agendada: 'Visita agendada', visita_realizada: 'Visita realizada',
  pedido_tomado: 'Pedido tomado', cotizacion_enviada: 'Cotización enviada', no_interesa: 'No le interesa',
}
const MOTIVOS = { tiene_proveedor: 'Tiene proveedor', no_consume: 'No consume', no_es_momento: 'No es el momento', otro: 'Otro' }
const ACCIONES = ['abril_llamo', 'coordinando_reunion', 'visita_agendada', 'visita_realizada', 'pedido_tomado', 'cotizacion_enviada', 'no_interesa']

const fmt = (s) => s ? new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z')).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const horasDesde = (s) => s ? (Date.now() - new Date(s.replace(' ', 'T') + 'Z').getTime()) / 3600000 : null

function Kpi({ label, value, tone }) {
  const color = tone === 'bad' ? '#b4402a' : tone === 'good' ? '#0b6b66' : 'var(--rmg-text)'
  return (
    <div className="rmg-card p-3" style={{ minWidth: 120 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--rmg-muted)' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color, fontFamily: 'Inter Tight, sans-serif' }}>{value ?? '—'}</div>
    </div>
  )
}

function Estado({ ok, si, no }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: ok ? '#0b6b66' : '#b4402a' }}>
      {ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} {ok ? si : no}
    </span>
  )
}

function ModalAccion({ p, onClose, onSave }) {
  const [com_estado, setEstado] = useState('abril_llamo')
  const [com_motivo, setMotivo] = useState('tiene_proveedor')
  const [visita_fecha, setFecha] = useState('')
  const [nota, setNota] = useState('')
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,35,60,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div className="rmg-card p-5" style={{ width: 'min(460px, 92vw)' }}>
        <div className="flex items-center justify-between mb-3">
          <div style={{ fontWeight: 800 }}>{p.empresa}</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <label className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Resultado</label>
        <select className="rmg-input mb-3" value={com_estado} onChange={e => setEstado(e.target.value)}>
          {ACCIONES.map(a => <option key={a} value={a}>{COM[a]}</option>)}
        </select>
        {com_estado === 'no_interesa' && (<>
          <label className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Motivo</label>
          <select className="rmg-input mb-3" value={com_motivo} onChange={e => setMotivo(e.target.value)}>
            {Object.entries(MOTIVOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </>)}
        {com_estado === 'visita_agendada' && (<>
          <label className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Fecha y hora de la visita</label>
          <input type="datetime-local" className="rmg-input mb-3" value={visita_fecha} onChange={e => setFecha(e.target.value)} />
        </>)}
        <label className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Nota</label>
        <textarea className="rmg-input mb-4" rows={3} value={nota} onChange={e => setNota(e.target.value)} placeholder="Qué equipos tienen, quién compra, a quién le compran…" />
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={() => onSave({ com_estado, com_motivo: com_estado === 'no_interesa' ? com_motivo : undefined, visita_fecha: visita_fecha ? visita_fecha.replace('T', ' ') : undefined, nota })}>Guardar</button>
        </div>
      </div>
    </div>
  )
}

export default function ProspeccionAutoPage() {
  const { user } = useAuth()
  const gestion = ['gerente', 'administrador'].includes(user?.rol)
  const qc = useQueryClient()
  const [tab, setTab] = useState('llamar')
  const [accion, setAccion] = useState(null)
  const [verCorreo, setVerCorreo] = useState(null)

  const stats = useQuery({ queryKey: ['pauto-stats'], queryFn: () => api.get('/prospeccion-auto/stats').then(r => r.data), refetchInterval: 60000 })
  const llamar = useQuery({ queryKey: ['pauto-llamar'], queryFn: () => api.get('/prospeccion-auto/para-llamar').then(r => r.data), refetchInterval: 60000 })
  const enSeq = useQuery({ queryKey: ['pauto-seq'], queryFn: () => api.get('/prospeccion-auto/en-secuencia').then(r => r.data), enabled: tab === 'secuencia' })
  const preview = useQuery({ queryKey: ['pauto-preview'], queryFn: () => api.get('/prospeccion-auto/preview').then(r => r.data), enabled: gestion && tab === 'config' })

  const refrescar = () => ['pauto-stats', 'pauto-llamar', 'pauto-seq', 'pauto-preview'].forEach(k => qc.invalidateQueries({ queryKey: [k] }))
  const err = (e) => toast.error(e.response?.data?.error || e.message)

  const guardarConfig = useMutation({ mutationFn: (b) => api.put('/prospeccion-auto/config', b).then(r => r.data), onSuccess: () => { toast.success('Guardado'); refrescar() }, onError: err })
  const prueba = useMutation({
    mutationFn: () => api.post('/prospeccion-auto/enviar-prueba').then(r => r.data),
    onSuccess: (r) => {
      toast[r.correo?.ok ? 'success' : 'error'](`Correo: ${r.correo?.ok ? `enviado a ${r.correo.a}` : r.correo?.motivo}`, { duration: 8000 })
      toast[r.whatsapp?.ok ? 'success' : 'error'](`WhatsApp: ${r.whatsapp?.ok ? `enviado a +${r.whatsapp.a}` : r.whatsapp?.motivo}`, { duration: 8000 })
    }, onError: err,
  })
  const ejecutar = useMutation({
    mutationFn: (paso) => api.post(`/prospeccion-auto/ejecutar/${paso}`).then(r => r.data),
    onSuccess: (r) => { toast.success(r.en_segundo_plano ? 'Envío de correos iniciado (tarda unos minutos)' : JSON.stringify(r)); setTimeout(refrescar, 1500) }, onError: err,
  })
  const cambiar = useMutation({
    mutationFn: ({ id, body }) => api.put(`/prospeccion-auto/prospecto/${id}/estado`, body).then(r => r.data),
    onSuccess: () => { toast.success('Registrado'); setAccion(null); refrescar() }, onError: err,
  })
  const abrirCorreo = async () => {
    try { setVerCorreo((await api.get('/prospeccion-auto/preview-correo')).data) } catch (e) { err(e) }
  }

  const s = stats.data
  const c = s?.config || {}
  const seq = s?.secuencia || {}
  const com = s?.comercial || {}
  const respondieron = Object.entries(com).reduce((a, [k, n]) => a + (k === 'no_interesa' ? 0 : n), 0)
  const pendientes = (llamar.data || []).filter(p => ['respondio_wsp', 'respondio_correo'].includes(p.com_estado))

  const tabs = [['llamar', `Para llamar${pendientes.length ? ` (${pendientes.length})` : ''}`], ['secuencia', 'En secuencia'], ['embudo', 'Embudo'], ...(gestion ? [['config', 'Configuración']] : [])]

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Prospección automática</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Correo → WhatsApp día 1 → WhatsApp día 2 → dormido. Quien responde pasa a Abril.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Estado ok={!!c.activo} si="Sistema activo" no="Sistema apagado" />
          <Estado ok={!!c.wsp_activo && s?.wa_configurado} si="WhatsApp activo" no="WhatsApp apagado" />
          <Estado ok={!!s?.remitente?.ok} si={`Casilla: ${s?.remitente?.usuario?.email || ''}`} no="Casilla sin configurar" />
          <button className="btn-secondary flex items-center gap-1.5" onClick={refrescar}><RefreshCw size={13} /> Actualizar</button>
        </div>
      </div>

      {c.pausa_motivo && (
        <div className="rmg-card p-3" style={{ borderColor: '#b4402a', color: '#b4402a', fontWeight: 600 }}>
          <AlertTriangle size={15} style={{ display: 'inline', marginRight: 6 }} /> Pausa automática: {c.pausa_motivo}. Revisa el lote antes de volver a activar.
        </div>
      )}
      {!s?.remitente?.ok && s && (
        <div className="rmg-card p-3" style={{ color: '#8a5607', fontWeight: 600 }}>{s.remitente.motivo}</div>
      )}

      <div className="flex gap-3 flex-wrap">
        <Kpi label="Disponibles (tema)" value={s?.disponibles} />
        {SEQ.map(([k, l]) => <Kpi key={k} label={l} value={seq[k] || 0} tone={(k === 'baja' || k === 'dato_erroneo') && seq[k] ? 'bad' : undefined} />)}
        <Kpi label="Respondieron" value={respondieron} tone={respondieron ? 'good' : undefined} />
        <Kpi label="Visitas agendadas" value={(com.visita_agendada || 0) + (com.visita_realizada || 0)} tone="good" />
        <Kpi label="Pedidos tomados" value={(com.pedido_tomado || 0) + (com.cotizacion_enviada || 0)} tone="good" />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {tabs.map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} style={{
            fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
            border: tab === v ? '1px solid rgba(27,143,212,0.4)' : '1px solid rgba(15,35,60,0.08)',
            background: tab === v ? 'rgba(27,143,212,0.15)' : 'transparent', color: tab === v ? 'var(--rmg-blue)' : 'var(--rmg-muted)',
          }}>{l}</button>
        ))}
      </div>

      {tab === 'llamar' && (
        <div className="rmg-card overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900, fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--rmg-muted)', fontSize: 11, textTransform: 'uppercase' }}>
              {['Empresa', 'Contacto', 'Celular', 'Respondió', 'Mensaje', 'Estado', ''].map(h => <th key={h} style={{ padding: '10px 12px' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {(llamar.data || []).map(p => {
                const h = horasDesde(p.seq_respuesta_at)
                const urgente = ['respondio_wsp', 'respondio_correo'].includes(p.com_estado) && h > 2
                return (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--rmg-border)', background: urgente ? 'rgba(180,64,42,.06)' : undefined }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>{p.empresa}</td>
                    <td style={{ padding: '10px 12px' }}>{p.nombre_contacto || '—'}{p.cargo ? <div style={{ color: 'var(--rmg-muted)', fontSize: 12 }}>{p.cargo}</div> : null}</td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      {p.seq_wa_numero ? <>
                        <a href={`tel:+${p.seq_wa_numero}`} style={{ color: 'var(--rmg-blue)', marginRight: 8 }}><PhoneCall size={14} style={{ display: 'inline' }} /> +{p.seq_wa_numero}</a>
                        <a href={`https://wa.me/${p.seq_wa_numero}`} target="_blank" rel="noreferrer" style={{ color: '#1f9d55' }}><MessageCircle size={14} style={{ display: 'inline' }} /></a>
                      </> : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: urgente ? '#b4402a' : undefined, fontWeight: urgente ? 700 : 400 }}>{fmt(p.seq_respuesta_at)}</td>
                    <td style={{ padding: '10px 12px', maxWidth: 240 }}>{p.seq_ultimo_mensaje || (p.seq_canal_respuesta === 'correo' ? 'Respondió por correo' : '—')}</td>
                    <td style={{ padding: '10px 12px' }}>{COM[p.com_estado]}{p.com_motivo ? ` · ${MOTIVOS[p.com_motivo]}` : ''}{p.visita_fecha ? <div style={{ fontSize: 12, color: 'var(--rmg-muted)' }}>{p.visita_fecha}</div> : null}</td>
                    <td style={{ padding: '10px 12px' }}><button className="btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setAccion(p)}>Registrar</button></td>
                  </tr>
                )
              })}
              {!llamar.data?.length && <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--rmg-muted)' }}>Nadie ha respondido todavía.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'secuencia' && (
        <div className="rmg-card overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900, fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--rmg-muted)', fontSize: 11, textTransform: 'uppercase' }}>
              {['Empresa', 'Contacto', 'Paso', 'Correo', 'WSP 1', 'WSP 2', ''].map(h => <th key={h} style={{ padding: '10px 12px' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {(enSeq.data || []).map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--rmg-border)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>{p.empresa}</td>
                  <td style={{ padding: '10px 12px' }}>{p.nombre_contacto || '—'}<div style={{ fontSize: 12, color: 'var(--rmg-muted)' }}>{p.email}</div></td>
                  <td style={{ padding: '10px 12px' }}>{SEQ.find(x => x[0] === p.seq_estado)?.[1]}</td>
                  <td style={{ padding: '10px 12px' }}>{fmt(p.seq_correo_at)}</td>
                  <td style={{ padding: '10px 12px' }}>{fmt(p.seq_wsp1_at)}</td>
                  <td style={{ padding: '10px 12px' }}>{fmt(p.seq_wsp2_at)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <button className="btn-secondary" style={{ padding: '4px 10px' }}
                      onClick={() => cambiar.mutate({ id: p.id, body: { com_estado: 'respondio_correo' } })}>Respondió por correo</button>
                  </td>
                </tr>
              ))}
              {!enSeq.data?.length && <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--rmg-muted)' }}>No hay prospectos en secuencia.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'embudo' && (
        <div className="space-y-4">
          <div className="rmg-card overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900, fontSize: 13 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--rmg-muted)', fontSize: 11, textTransform: 'uppercase' }}>
                {['Lote', 'Enviados', 'WSP 1', 'WSP 2', 'Respondieron', 'No interesa', 'Visitas', 'Pedidos', 'Dormidos', 'Bajas', 'Erróneos'].map(h => <th key={h} style={{ padding: '10px 12px' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {(s?.lotes || []).map(l => (
                  <tr key={l.lote + l.tema} style={{ borderTop: '1px solid var(--rmg-border)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>{l.lote}</td>
                    {['total', 'wsp1', 'wsp2', 'respondieron', 'no_interesa', 'visitas', 'pedidos', 'dormidos', 'bajas', 'erroneos'].map(k => (
                      <td key={k} style={{ padding: '10px 12px' }}>{l[k] || 0}{k === 'respondieron' && l.total ? <span style={{ color: 'var(--rmg-muted)' }}> · {Math.round(100 * l[k] / l.total)}%</span> : null}</td>
                    ))}
                  </tr>
                ))}
                {!s?.lotes?.length && <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center', color: 'var(--rmg-muted)' }}>Todavía no sale ningún lote.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>
            Aperturas de correo: {s?.aperturas || 0} (referencial: muchos clientes de correo bloquean el pixel) · Clicks: {s?.clicks || 0}
            {s?.atrasados ? ` · ${s.atrasados} prospectos con correo enviado hace más de 4 días sin WhatsApp (revisar número del bot)` : ''}
          </div>
          <div className="rmg-card p-4">
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Últimos eventos</div>
            {(s?.ultimos || []).map((e, i) => (
              <div key={i} style={{ fontSize: 12, padding: '4px 0', borderTop: i ? '1px solid var(--rmg-border)' : 'none' }}>
                <span style={{ color: 'var(--rmg-muted)' }}>{fmt(e.created_at)}</span> · <b>{e.tipo}</b> {e.empresa ? `· ${e.empresa}` : ''} {e.detalle ? <span style={{ color: 'var(--rmg-muted)' }}>· {String(e.detalle).slice(0, 140)}</span> : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'config' && gestion && (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          <div className="rmg-card p-4 space-y-3">
            <div style={{ fontWeight: 800 }}>Operación</div>
            <div className="flex gap-2 flex-wrap">
              <button className={c.activo ? 'btn-secondary' : 'btn-primary'} onClick={() => guardarConfig.mutate({ activo: !c.activo })}>
                <Power size={13} style={{ display: 'inline', marginRight: 6 }} />{c.activo ? 'Apagar sistema' : 'Activar sistema'}
              </button>
              <button className="btn-secondary" onClick={() => guardarConfig.mutate({ wsp_activo: !c.wsp_activo })}>
                {c.wsp_activo ? 'Apagar WhatsApp' : 'Activar WhatsApp'}
              </button>
            </div>
            {!s?.wa_configurado && <div className="text-xs" style={{ color: '#8a5607' }}>Faltan PROSPECCION_WA_PHONE_ID y PROSPECCION_WA_TOKEN en Render: mientras tanto los prospectos esperan con el correo enviado.</div>}
            <ConfigForm c={c} temas={s?.temas || []} onSave={(b) => guardarConfig.mutate(b)} />
          </div>
          <div className="rmg-card p-4 space-y-3">
            <div style={{ fontWeight: 800 }}>Pruebas y ejecución manual</div>
            <div className="flex gap-2 flex-wrap">
              <button className="btn-secondary flex items-center gap-1.5" onClick={abrirCorreo}><Eye size={13} /> Ver correo</button>
              <button className="btn-secondary flex items-center gap-1.5" onClick={() => prueba.mutate()} disabled={prueba.isPending}><Send size={13} /> {prueba.isPending ? 'Enviando…' : 'Enviar prueba'}</button>
            </div>
            <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>La prueba va solo al correo y celular de prueba; no toca prospectos.</div>
            <div className="flex gap-2 flex-wrap pt-2">
              {[['correo', 'Enviar lote de correos ahora'], ['wsp1', 'WhatsApp 1 ahora'], ['wsp2', 'WhatsApp 2 ahora'], ['dormido', 'Pasar a dormido']].map(([k, l]) => (
                <button key={k} className="btn-secondary flex items-center gap-1.5" disabled={ejecutar.isPending}
                  onClick={() => window.confirm(`¿Ejecutar "${l}"? Esto escribe a prospectos reales.`) && ejecutar.mutate(k)}><Play size={13} /> {l}</button>
              ))}
            </div>
            {s?.envio_en_curso && <div className="text-xs" style={{ color: 'var(--rmg-blue)', fontWeight: 600 }}>Envío de correos en curso…</div>}
          </div>
          <div className="rmg-card p-4" style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Lote que saldría hoy ({preview.data?.lote?.length ?? '…'} de {preview.data?.disponibles ?? '…'} disponibles)</div>
            {preview.data?.descartes && <div className="text-xs mb-2" style={{ color: 'var(--rmg-muted)' }}>
              Revisados {preview.data.revisados}. Descartados: {Object.entries(preview.data.descartes).map(([k, v]) => `${k} ${v}`).join(' · ')}
            </div>}
            <div className="overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 800 }}>
                <tbody>
                  {(preview.data?.lote || []).map(p => (
                    <tr key={p.id} style={{ borderTop: '1px solid var(--rmg-border)' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700 }}>{p.empresa}{p.reintento ? ' (reintento)' : ''}</td>
                      <td style={{ padding: '8px 10px' }}>{p.nombre_contacto || '—'}</td>
                      <td style={{ padding: '8px 10px' }}>{p.email}</td>
                      <td style={{ padding: '8px 10px' }}>+{p.celular}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--rmg-muted)' }}>{p.rubro}</td>
                      <td style={{ padding: '8px 10px' }}>{p.prioridad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {accion && <ModalAccion p={accion} onClose={() => setAccion(null)} onSave={(body) => cambiar.mutate({ id: accion.id, body })} />}
      {verCorreo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,35,60,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="rmg-card p-4" style={{ width: 'min(680px, 94vw)', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="flex items-center justify-between mb-2">
              <div><div style={{ fontWeight: 800 }}>{verCorreo.asunto}</div><div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Ejemplo con {verCorreo.empresa}</div></div>
              <button onClick={() => setVerCorreo(null)}><X size={18} /></button>
            </div>
            <iframe title="correo" srcDoc={verCorreo.html} style={{ width: '100%', height: '70vh', border: '1px solid var(--rmg-border)', borderRadius: 8 }} />
          </div>
        </div>
      )}
    </div>
  )
}

function ConfigForm({ c, temas, onSave }) {
  const [f, setF] = useState(null)
  const v = f || c
  const set = (k) => (e) => setF({ ...v, [k]: e.target.value })
  const campo = (k, l, props = {}) => (
    <div>
      <label className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{l}</label>
      <input className="rmg-input" value={v[k] ?? ''} onChange={set(k)} {...props} />
    </div>
  )
  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Tema de la semana</label>
        <select className="rmg-input" value={v.tema_activo || ''} onChange={set('tema_activo')}>
          {temas.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {campo('lote_diario', 'Correos por día', { type: 'number', min: 1, max: 100 })}
        {campo('hora_correo', 'Hora correo (HH:MM)')}
        {campo('hora_wsp1', 'Hora WhatsApp 1')}
        {campo('hora_wsp2', 'Hora WhatsApp 2')}
      </div>
      {campo('wa_numero_bot', 'Número del bot (para el botón del correo)', { placeholder: '+56 9 …' })}
      {campo('notificar_emails', 'Avisar respuestas a (correos separados por coma)')}
      <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {campo('test_email', 'Correo de prueba')}
        {campo('test_celular', 'Celular de prueba')}
      </div>
      <button className="btn-primary" disabled={!f} onClick={() => { onSave({
        tema_activo: v.tema_activo, lote_diario: Number(v.lote_diario), hora_correo: v.hora_correo, hora_wsp1: v.hora_wsp1,
        hora_wsp2: v.hora_wsp2, wa_numero_bot: v.wa_numero_bot || null, notificar_emails: v.notificar_emails,
        test_email: v.test_email || null, test_celular: v.test_celular || null,
      }); setF(null) }}>Guardar configuración</button>
    </div>
  )
}
