/**
 * Prospección automática — panel (2026-10-14, pedido de JC)
 * Correo D0 (casilla fija aquiroga@rmgautos.cl) → WhatsApp 1 (D1) → WhatsApp 2 (D2) → dormido.
 * Orden tipo "Campañas" de Cruzeiro: tarjetas clicables → detalle; abajo la tabla de lotes.
 * Mensajes por segmento editables con vista previa; activar / pausar solo el dueño.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { useAuth } from '@context/AuthContext'
import toast from 'react-hot-toast'
import { Send, Play, Pause, Eye, PhoneCall, RefreshCw, AlertTriangle, CheckCircle2, X, Save, ShieldCheck, Mail, MessageCircle, FlaskConical } from 'lucide-react'

const SEGMENTOS = ['Industria', 'Construcción', 'Agrícola']
const COM = {
  respondio_correo: 'Respondió correo', respondio_wsp: 'Respondió WhatsApp', abril_llamo: 'Abril llamó',
  coordinando_reunion: 'Coordinando reunión', visita_agendada: 'Visita agendada', visita_realizada: 'Visita realizada',
  pedido_tomado: 'Pedido tomado', cotizacion_enviada: 'Cotización enviada', no_interesa: 'No le interesa',
}
const SEQ = {
  frio: 'Frío', correo_enviado: 'Correo enviado', wsp1_enviado: 'WhatsApp 1', wsp2_enviado: 'WhatsApp 2',
  dormido: 'Dormido', baja: 'Baja', dato_erroneo: 'Dato erróneo',
}
const WA_EST = { enviado: 'Enviado', entregado: 'Entregado', leido: 'Leído', fallido: 'Fallido' }
const MOTIVOS = { tiene_proveedor: 'Tiene proveedor', no_consume: 'No consume', no_es_momento: 'No es el momento', otro: 'Otro' }
const ACCIONES = ['abril_llamo', 'coordinando_reunion', 'visita_agendada', 'visita_realizada', 'pedido_tomado', 'cotizacion_enviada', 'no_interesa']

// Tarjetas en el orden del embudo: correo → wsp1 → wsp2 → llamado → cierre.
const ETAPAS = [
  { titulo: 'Base', tarjetas: [['base', 'Base disponible', null], ['todos', 'En campaña', null]] },
  { titulo: 'Correo', tarjetas: [['correo', 'Correos enviados', null], ['rebote', 'Rebotados', 'bad'], ['pendientes', 'Esperando WSP 1', null]] },
  { titulo: 'WhatsApp 1', tarjetas: [['wsp1', 'Enviados', null], ['wsp1_entregado', 'Recibidos', null], ['wsp1_leido', 'Leídos', null]] },
  { titulo: 'WhatsApp 2', tarjetas: [['wsp2', 'Enviados', null]] },
  { titulo: 'Llamado', tarjetas: [['contestados', 'Contestados', 'good'], ['llamar', 'Por llamar', 'good'], ['no_interesa', 'No le interesa', null]] },
  { titulo: 'Cierre', tarjetas: [['sin_respuesta', 'Sin respuesta (dormido)', null], ['bajas', 'Pidieron baja', 'bad'], ['fallidos', 'Fallidos', 'bad']] },
]

const fmt = (s) => s ? new Date(s.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'))
  .toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const pct = (a, b) => b ? `${Math.round((a / b) * 100)}%` : '—'
const errMsg = (e) => toast.error(e?.response?.data?.error || e.message)

function Chip({ ok, si, no }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: ok ? '#0b6b66' : '#b4402a' }}>
      {ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} {ok ? si : no}
    </span>
  )
}

function Tarjeta({ label, value, tone, activa, onClick }) {
  const color = tone === 'bad' ? '#b4402a' : tone === 'good' ? '#0b6b66' : 'var(--rmg-text)'
  return (
    <button onClick={onClick} className="rmg-card p-3 text-left"
      style={{ minWidth: 128, flex: '1 1 128px', outline: activa ? '2px solid #1d4ed8' : 'none', cursor: 'pointer' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--rmg-muted)' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color, fontFamily: 'Inter Tight, sans-serif' }}>{value ?? '—'}</div>
    </button>
  )
}

function Burbuja({ rol, texto, hora, autor }) {
  const cliente = rol === 'cliente'
  const fondo = cliente ? '#fff' : rol === 'abril' ? '#cfe6ff' : '#d9fdd3'
  const quien = rol === 'bot' ? 'Bot' : rol === 'abril' ? (autor || 'Abril') : ''
  return (
    <div style={{ display: 'flex', justifyContent: cliente ? 'flex-start' : 'flex-end', margin: '4px 0' }}>
      <div style={{ maxWidth: '85%', background: fondo, borderRadius: 8, padding: '6px 9px', fontSize: 13, whiteSpace: 'pre-wrap', boxShadow: '0 1px 1px rgba(0,0,0,.08)' }}>
        {texto}
        {hora && <div style={{ fontSize: 10, color: '#667', textAlign: 'right' }}>{quien ? `${quien} · ` : ''}{fmt(hora)}</div>}
      </div>
    </div>
  )
}

function Conversacion({ id }) {
  const q = useQuery({ queryKey: ['pauto-conv', id], queryFn: () => api.get(`/prospeccion-auto/prospecto/${id}/conversacion`).then(r => r.data), refetchInterval: 15000 })
  const msgs = q.data?.mensajes || []
  if (!msgs.length) return null
  return (
    <div className="mb-3 p-2" style={{ background: '#efeae2', borderRadius: 8, maxHeight: 260, overflowY: 'auto' }}>
      {msgs.map((m, i) => <Burbuja key={i} rol={m.rol} texto={m.texto} hora={m.created_at} autor={m.autor} />)}
    </div>
  )
}

// ─── Pestaña Conversaciones: bandeja del número de prospección ───────────────
function Bandeja({ onAccion }) {
  const qc = useQueryClient()
  const [sel, setSel] = useState(null)
  const [txt, setTxt] = useState('')
  const lista = useQuery({ queryKey: ['pauto-bandeja'], queryFn: () => api.get('/prospeccion-auto/conversaciones').then(r => r.data), refetchInterval: 10000 })
  const chat = useQuery({
    queryKey: ['pauto-conv', sel?.id], enabled: !!sel,
    queryFn: () => api.get(`/prospeccion-auto/prospecto/${encodeURIComponent(sel.id)}/conversacion`).then(r => r.data), refetchInterval: 5000,
  })
  useEffect(() => { const el = document.getElementById('pauto-chat'); if (el) el.scrollTop = el.scrollHeight }, [chat.data?.mensajes?.length, sel?.id])
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['pauto-conv', sel?.id] }); qc.invalidateQueries({ queryKey: ['pauto-bandeja'] }) }
  const responder = useMutation({
    mutationFn: () => api.post(`/prospeccion-auto/prospecto/${encodeURIComponent(sel.id)}/responder`, { texto: txt }).then(r => r.data),
    onSuccess: () => { setTxt(''); toast.success('Enviado. El bot quedó en pausa en este chat.'); refrescar() }, onError: errMsg,
  })
  const pausa = useMutation({
    mutationFn: (pausado) => api.post(`/prospeccion-auto/prospecto/${encodeURIComponent(sel.id)}/bot`, { pausado }).then(r => r.data),
    onSuccess: (r) => { toast.success(r.pausado ? 'Bot en pausa en este chat' : 'El bot vuelve a responder este chat'); refrescar() }, onError: errMsg,
  })
  const c = chat.data
  const actual = lista.data?.find(x => x.id === sel?.id) || sel
  return (
    <div className="rmg-card" style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 340px) 1fr', minHeight: 560 }}>
      <div style={{ borderRight: '1px solid var(--rmg-border, #e5e7eb)', overflowY: 'auto', maxHeight: 640 }}>
        <div className="p-3" style={{ fontWeight: 800, borderBottom: '1px solid var(--rmg-border, #e5e7eb)' }}>Chats · +56 9 7286 4315</div>
        {lista.isLoading && <div className="p-3 text-sm">Cargando…</div>}
        {!lista.isLoading && !lista.data?.length && <div className="p-3 text-sm" style={{ color: 'var(--rmg-muted)' }}>Todavía nadie ha escrito.</div>}
        {(lista.data || []).map(x => (
          <button key={x.id} onClick={() => setSel(x)} className="w-full text-left p-3"
            style={{ borderBottom: '1px solid var(--rmg-border, #eee)', background: sel?.id === x.id ? 'rgba(29,78,216,.07)' : 'transparent' }}>
            <div className="flex justify-between gap-2">
              <div style={{ fontWeight: 700, fontSize: 14 }}>{x.empresa || `+${x.seq_wa_numero}`}</div>
              <div style={{ fontSize: 11, color: 'var(--rmg-muted)', whiteSpace: 'nowrap' }}>{fmt(x.ultimo_at)}</div>
            </div>
            <div className="flex justify-between gap-2 items-center">
              <div style={{ fontSize: 12, color: 'var(--rmg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {x.ultimo_rol === 'bot' ? 'Bot: ' : x.ultimo_rol === 'abril' ? 'Tú: ' : ''}{x.ultimo_texto}
              </div>
              {x.sin_leer > 0 && <span style={{ background: '#16a34a', color: '#fff', borderRadius: 999, fontSize: 11, padding: '0 7px', fontWeight: 700 }}>{x.sin_leer}</span>}
            </div>
            <div style={{ fontSize: 11, marginTop: 2 }}>
              {x.prueba && <span style={{ color: '#7c3aed' }}>prueba · </span>}
              {x.seq_bot_pidio_cotizacion ? <span style={{ color: '#0b6b66', fontWeight: 700 }}>pidió cotización · </span> : null}
              {x.bot_pausado ? <span style={{ color: '#b45309' }}>bot en pausa</span> : <span style={{ color: 'var(--rmg-muted)' }}>bot activo</span>}
            </div>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {!sel ? <div className="p-6 text-sm" style={{ color: 'var(--rmg-muted)' }}>Elige un chat de la lista.</div> : <>
          <div className="p-3 flex items-center justify-between gap-2" style={{ borderBottom: '1px solid var(--rmg-border, #e5e7eb)' }}>
            <div>
              <div style={{ fontWeight: 800 }}>{actual?.empresa}</div>
              <div style={{ fontSize: 12, color: 'var(--rmg-muted)' }}>{actual?.nombre_contacto || ''}{actual?.seq_wa_numero ? ` · +${actual.seq_wa_numero}` : ''}{actual?.seq_segmento ? ` · ${actual.seq_segmento}` : ''}</div>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary" disabled={pausa.isPending} onClick={() => pausa.mutate(!c?.bot_pausado)}>
                {c?.bot_pausado ? <><Play size={14} /> Reactivar bot</> : <><Pause size={14} /> Pausar bot</>}
              </button>
              {!actual?.prueba && onAccion && <button className="btn-secondary" onClick={() => onAccion({ id: sel.id, ...actual })}><PhoneCall size={14} /> Registrar llamada</button>}
            </div>
          </div>
          {actual?.seq_resumen_bot && <div className="px-3 py-2 text-sm" style={{ background: '#eef6ff' }}><strong>Resumen del bot:</strong> {actual.seq_resumen_bot}</div>}
          <div id="pauto-chat" className="p-3" style={{ background: '#efeae2', flex: 1, overflowY: 'auto', maxHeight: 460 }}>
            {(c?.mensajes || []).map((m, i) => <Burbuja key={i} rol={m.rol} texto={m.texto} hora={m.created_at} autor={m.autor} />)}
          </div>
          <div className="p-3" style={{ borderTop: '1px solid var(--rmg-border, #e5e7eb)' }}>
            {c && !c.ventana_abierta
              ? <div className="text-sm" style={{ color: '#b45309' }}>Pasaron más de 24 h desde el último mensaje del cliente: WhatsApp no deja escribirle texto libre. Llámalo o espera a que escriba.</div>
              : <div className="flex gap-2">
                  <input className="rmg-input w-full" value={txt} placeholder="Responder como Abril… (el bot se pausa en este chat)" onChange={e => setTxt(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && txt.trim() && !responder.isPending && responder.mutate()} />
                  <button className="btn-primary" disabled={!txt.trim() || responder.isPending} onClick={() => responder.mutate()}><Send size={14} /></button>
                </div>}
            {c?.ventana_abierta && <div style={{ fontSize: 11, color: 'var(--rmg-muted)', marginTop: 4 }}>Ventana de WhatsApp abierta por {c.horas_restantes} h más.</div>}
          </div>
        </>}
      </div>
    </div>
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
        <div className="text-sm mb-3" style={{ color: 'var(--rmg-muted)' }}>
          {p.nombre_contacto || '—'} · +{p.seq_wa_numero} · {p.email}
        </div>
        {p.seq_resumen_bot && (
          <div className="text-sm mb-3 p-2" style={{ background: '#eef6ff', borderRadius: 6 }}>
            <strong>Resumen del bot:</strong> {p.seq_resumen_bot}
          </div>
        )}
        <Conversacion id={p.id} />
        <label className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Resultado</label>
        <select className="rmg-input mb-3 w-full" value={com_estado} onChange={e => setEstado(e.target.value)}>
          {ACCIONES.map(a => <option key={a} value={a}>{COM[a]}</option>)}
        </select>
        {com_estado === 'no_interesa' && (
          <select className="rmg-input mb-3 w-full" value={com_motivo} onChange={e => setMotivo(e.target.value)}>
            {Object.entries(MOTIVOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
        {['visita_agendada', 'visita_realizada'].includes(com_estado) && (
          <input type="datetime-local" className="rmg-input mb-3 w-full" value={visita_fecha} onChange={e => setFecha(e.target.value)} />
        )}
        <textarea className="rmg-input w-full mb-4" rows={3} placeholder="Nota (opcional)" value={nota} onChange={e => setNota(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={() => onSave({ com_estado, com_motivo, visita_fecha, nota })}>Guardar</button>
        </div>
      </div>
    </div>
  )
}

function TablaDetalle({ filas, onAccion, cargando }) {
  if (cargando) return <div className="p-4 text-sm" style={{ color: 'var(--rmg-muted)' }}>Cargando…</div>
  if (!filas?.length) return <div className="p-4 text-sm" style={{ color: 'var(--rmg-muted)' }}>Sin registros.</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="w-full text-sm">
        <thead><tr style={{ textAlign: 'left', color: 'var(--rmg-muted)', fontSize: 11, textTransform: 'uppercase' }}>
          <th className="p-2">Empresa</th><th className="p-2">Contacto</th><th className="p-2">Segmento</th><th className="p-2">Lote</th>
          <th className="p-2">Correo</th><th className="p-2">WSP 1</th><th className="p-2">WSP 2</th><th className="p-2">Estado</th><th className="p-2"></th>
        </tr></thead>
        <tbody>
          {filas.map(p => (
            <tr key={p.id} style={{ borderTop: '1px solid var(--rmg-border, #e5e7eb)' }}>
              <td className="p-2" style={{ fontWeight: 600 }}>{p.empresa}</td>
              <td className="p-2">{p.nombre_contacto || '—'}<div style={{ fontSize: 11, color: 'var(--rmg-muted)' }}>{p.email}{p.seq_wa_numero ? ` · +${p.seq_wa_numero}` : ''}</div></td>
              <td className="p-2">{p.seq_segmento}</td>
              <td className="p-2">{p.seq_lote}</td>
              <td className="p-2">{p.seq_correo_error ? <span style={{ color: '#b4402a' }} title={p.seq_correo_error}>Rebote</span> : fmt(p.seq_correo_at)}</td>
              <td className="p-2">{p.seq_wsp1_at ? <>{fmt(p.seq_wsp1_at)}<div style={{ fontSize: 11, color: 'var(--rmg-muted)' }}>{WA_EST[p.seq_wsp1_estado] || ''}</div></> : '—'}</td>
              <td className="p-2">{p.seq_wsp2_at ? <>{fmt(p.seq_wsp2_at)}<div style={{ fontSize: 11, color: 'var(--rmg-muted)' }}>{WA_EST[p.seq_wsp2_estado] || ''}</div></> : '—'}</td>
              <td className="p-2">{p.com_estado ? <strong>{COM[p.com_estado]}{p.com_motivo ? ` (${MOTIVOS[p.com_motivo] || p.com_motivo})` : ''}</strong> : SEQ[p.seq_estado] || p.seq_estado}
                {(p.seq_bot_pidio_cotizacion || p.seq_bot_quiere_llamada) ? (
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0b6b66' }}>
                    {p.seq_bot_pidio_cotizacion ? 'Pidió cotización' : ''}{p.seq_bot_pidio_cotizacion && p.seq_bot_quiere_llamada ? ' · ' : ''}{p.seq_bot_quiere_llamada ? 'Quiere llamado' : ''}
                  </div>) : null}
                {(p.seq_resumen_bot || p.seq_ultimo_mensaje) && <div style={{ fontSize: 11, color: 'var(--rmg-muted)', maxWidth: 300 }}>{p.seq_resumen_bot || `“${p.seq_ultimo_mensaje}”`}</div>}</td>
              <td className="p-2">{onAccion && <button className="btn-secondary" style={{ padding: '4px 10px' }} onClick={() => onAccion(p)}><PhoneCall size={14} /></button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Pestaña Pipeline ─────────────────────────────────────────────────────────
function Pipeline({ s, dueno, onAccion }) {
  const [filtro, setFiltro] = useState('todos')
  const [lote, setLote] = useState(null)
  const [verLote, setVerLote] = useState(false)
  const qc = useQueryClient()
  const det = useQuery({
    queryKey: ['pauto-detalle', filtro, lote],
    queryFn: () => api.get('/prospeccion-auto/detalle', { params: { filtro, lote: lote || undefined } }).then(r => r.data),
    enabled: filtro !== 'base',
  })
  const prev = useQuery({ queryKey: ['pauto-preview'], queryFn: () => api.get('/prospeccion-auto/preview').then(r => r.data), enabled: verLote || filtro === 'base' })
  const ejecutar = useMutation({
    mutationFn: (paso) => api.post(`/prospeccion-auto/ejecutar/${paso}`).then(r => r.data),
    onSuccess: (r, paso) => { toast.success(r.en_segundo_plano ? 'Envío de correos iniciado (corre en segundo plano)' : `${paso}: ${JSON.stringify(r)}`); qc.invalidateQueries({ queryKey: ['pauto-stats'] }) },
    onError: errMsg,
  })
  const t = s.tarjetas || {}
  const etiqueta = ETAPAS.flatMap(e => e.tarjetas).find(x => x[0] === filtro)?.[1]
  return (
    <>
      <div className="flex flex-wrap gap-4 mb-4">
        {ETAPAS.map(e => (
          <div key={e.titulo} style={{ flex: '1 1 auto' }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--rmg-muted)', marginBottom: 6 }}>{e.titulo}</div>
            <div className="flex flex-wrap gap-2">
              {e.tarjetas.map(([k, label, tone]) => (
                <Tarjeta key={k} label={label} value={t[k]} tone={tone} activa={filtro === k} onClick={() => { setFiltro(k); setLote(null) }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rmg-card mb-4">
        <div className="flex items-center justify-between p-3" style={{ borderBottom: '1px solid var(--rmg-border, #e5e7eb)' }}>
          <div style={{ fontWeight: 800 }}>{filtro === 'base' ? `Próximo lote (${prev.data?.lote?.length ?? '…'} de ${s.config?.lote_diario})` : `${etiqueta}${lote ? ` · lote ${lote}` : ''}`}</div>
          {lote && <button className="btn-secondary" onClick={() => setLote(null)}>Quitar filtro de lote</button>}
        </div>
        {filtro === 'base'
          ? <LotePreview data={prev.data} cargando={prev.isLoading} />
          : <TablaDetalle filas={det.data} cargando={det.isLoading} onAccion={onAccion} />}
      </div>

      <div className="rmg-card mb-4">
        <div className="flex items-center justify-between p-3" style={{ borderBottom: '1px solid var(--rmg-border, #e5e7eb)' }}>
          <div style={{ fontWeight: 800 }}>Lotes</div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => { setFiltro('base'); setVerLote(true) }}><Eye size={14} /> Ver próximo lote</button>
            {dueno && ['correo', 'wsp1', 'wsp2', 'dormido'].map(p => (
              <button key={p} className="btn-secondary" disabled={ejecutar.isPending}
                onClick={() => window.confirm(`¿Ejecutar ahora el paso "${p}"? Envía de verdad.`) && ejecutar.mutate(p)}>
                <Play size={14} /> {p}
              </button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full text-sm">
            <thead><tr style={{ textAlign: 'left', color: 'var(--rmg-muted)', fontSize: 11, textTransform: 'uppercase' }}>
              <th className="p-2">Lote</th><th className="p-2">Segmentos</th><th className="p-2">Base</th><th className="p-2">Correos</th>
              <th className="p-2">WSP 1</th><th className="p-2">Recibidos</th><th className="p-2">Leídos</th><th className="p-2">WSP 2</th>
              <th className="p-2">Contestados (bajas)</th><th className="p-2">% resp</th><th className="p-2">Pendientes</th><th className="p-2">Visitas</th><th className="p-2">Pedidos</th>
            </tr></thead>
            <tbody>
              {(s.lotes || []).map(l => (
                <tr key={l.lote} onClick={() => { setLote(l.lote); setFiltro('todos') }} style={{ borderTop: '1px solid var(--rmg-border, #e5e7eb)', cursor: 'pointer', background: lote === l.lote ? 'rgba(29,78,216,.06)' : undefined }}>
                  <td className="p-2" style={{ fontWeight: 700 }}>{l.lote}</td>
                  <td className="p-2">{l.segmentos}</td>
                  <td className="p-2">{l.total}</td>
                  <td className="p-2">{l.correos}{l.fallidos ? <span style={{ color: '#b4402a' }}> · {l.fallidos} fall.</span> : ''}</td>
                  <td className="p-2">{l.wsp1}</td><td className="p-2">{l.wsp1_entregados}</td><td className="p-2">{l.wsp1_leidos}</td>
                  <td className="p-2">{l.wsp2}</td>
                  <td className="p-2">{l.contestados} ({l.bajas})</td>
                  <td className="p-2">{pct(l.contestados, l.total)}</td>
                  <td className="p-2">{l.pendientes_wsp}</td><td className="p-2">{l.visitas}</td><td className="p-2">{l.pedidos}</td>
                </tr>
              ))}
              {!s.lotes?.length && <tr><td className="p-4" colSpan={13} style={{ color: 'var(--rmg-muted)' }}>Todavía no sale ningún lote.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <div className="rmg-card p-3">
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Base por segmento (correo + celular)</div>
          {SEGMENTOS.map(seg => <div key={seg} className="flex justify-between text-sm py-1"><span>{seg}</span><strong>{s.disponibles?.[seg] ?? 0}</strong></div>)}
          <div style={{ fontWeight: 700, marginTop: 10, fontSize: 12, color: 'var(--rmg-muted)' }}>Fuera de la base ({s.revisados} revisados)</div>
          {Object.entries(s.descartes || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => <div key={k} className="flex justify-between text-xs py-0.5" style={{ color: 'var(--rmg-muted)' }}><span>{k}</span><span>{v}</span></div>)}
        </div>
        <div className="rmg-card p-3">
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Últimos eventos</div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {(s.ultimos || []).map((e, i) => (
              <div key={i} className="text-xs py-1" style={{ borderTop: i ? '1px solid var(--rmg-border, #eee)' : 'none' }}>
                <span style={{ color: 'var(--rmg-muted)' }}>{fmt(e.created_at)}</span> · <strong>{e.tipo}</strong>{e.empresa ? ` · ${e.empresa}` : ''}
                {e.detalle && <div style={{ color: 'var(--rmg-muted)', wordBreak: 'break-word' }}>{String(e.detalle).slice(0, 160)}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function LotePreview({ data, cargando }) {
  if (cargando || !data) return <div className="p-4 text-sm" style={{ color: 'var(--rmg-muted)' }}>Calculando…</div>
  return (
    <>
      {data.segmentos_sin_validar?.length > 0 && (
        <div className="p-3 text-sm" style={{ color: '#b4402a' }}>Sin validar (no entran al lote): {data.segmentos_sin_validar.join(', ')}</div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table className="w-full text-sm">
          <thead><tr style={{ textAlign: 'left', color: 'var(--rmg-muted)', fontSize: 11, textTransform: 'uppercase' }}>
            <th className="p-2">Empresa</th><th className="p-2">Contacto</th><th className="p-2">Segmento</th><th className="p-2">Correo</th><th className="p-2">Celular</th><th className="p-2">Prioridad</th>
          </tr></thead>
          <tbody>{data.lote.map(p => (
            <tr key={p.id} style={{ borderTop: '1px solid var(--rmg-border, #e5e7eb)' }}>
              <td className="p-2" style={{ fontWeight: 600 }}>{p.empresa}{p.reintento && <span style={{ fontSize: 11, color: 'var(--rmg-muted)' }}> (reintento)</span>}</td>
              <td className="p-2">{p.nombre_contacto || '—'}</td><td className="p-2">{p.segmento}</td>
              <td className="p-2">{p.email}</td><td className="p-2">+{p.celular}</td><td className="p-2">{p.prioridad || '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  )
}

// ─── Pestaña Mensajes ─────────────────────────────────────────────────────────
function Mensajes({ dueno, puedeEditar }) {
  const qc = useQueryClient()
  const [seg, setSeg] = useState('Industria')
  const lista = useQuery({ queryKey: ['pauto-mensajes'], queryFn: () => api.get('/prospeccion-auto/mensajes').then(r => r.data) })
  const original = useMemo(() => lista.data?.find(m => m.segmento === seg), [lista.data, seg])
  const [b, setB] = useState(null)
  useEffect(() => { if (original) setB({ ...original, fallas: original.fallas.join('\n') }) }, [original])
  const sucio = b && original && ['asunto', 'asunto_sin_nombre', 'parrafo1', 'parrafo2', 'parrafo3', 'wa_falla', 'wa_rubro', 'imagen_correo', 'imagen_wa']
    .some(k => (b[k] || '') !== (original[k] || '')) || (b && original && b.fallas !== original.fallas.join('\n'))

  // Vista previa en vivo (con lo que se está escribiendo, sin guardar).
  const [prev, setPrev] = useState(null)
  useEffect(() => {
    if (!b) return
    const t = setTimeout(() => {
      api.post(`/prospeccion-auto/mensajes/${encodeURIComponent(seg)}/preview`, b).then(r => setPrev(r.data)).catch(() => {})
    }, 400)
    return () => clearTimeout(t)
  }, [b, seg])

  const guardar = useMutation({
    mutationFn: () => api.put(`/prospeccion-auto/mensajes/${encodeURIComponent(seg)}`, b).then(r => r.data),
    onSuccess: () => { toast.success('Guardado. Queda pendiente de validar.'); qc.invalidateQueries({ queryKey: ['pauto-mensajes'] }); qc.invalidateQueries({ queryKey: ['pauto-stats'] }) },
    onError: errMsg,
  })
  const validar = useMutation({
    mutationFn: () => api.post(`/prospeccion-auto/mensajes/${encodeURIComponent(seg)}/validar`).then(r => r.data),
    onSuccess: () => { toast.success(`Mensaje de ${seg} validado`); qc.invalidateQueries({ queryKey: ['pauto-mensajes'] }); qc.invalidateQueries({ queryKey: ['pauto-stats'] }) },
    onError: errMsg,
  })
  const prueba = useMutation({
    mutationFn: () => api.post(`/prospeccion-auto/mensajes/${encodeURIComponent(seg)}/prueba`).then(r => r.data),
    onSuccess: (r) => {
      toast[r.correo?.ok ? 'success' : 'error'](r.correo?.ok ? `Correo de prueba a ${r.correo.a}` : `Correo: ${r.correo?.motivo}`)
      if (r.whatsapp) toast[r.whatsapp.ok ? 'success' : 'error'](r.whatsapp.ok ? `WhatsApp de prueba a +${r.whatsapp.a}` : `WhatsApp: ${r.whatsapp.motivo}`)
    },
    onError: errMsg,
  })

  if (!b) return <div className="p-4">Cargando…</div>
  const campo = (k, label, rows = 1, ayuda) => (
    <div className="mb-3">
      <label className="text-xs" style={{ color: 'var(--rmg-muted)', fontWeight: 700 }}>{label}</label>
      {rows === 1
        ? <input className="rmg-input w-full" value={b[k] || ''} disabled={!puedeEditar} onChange={e => setB({ ...b, [k]: e.target.value })} />
        : <textarea className="rmg-input w-full" rows={rows} value={b[k] || ''} disabled={!puedeEditar} onChange={e => setB({ ...b, [k]: e.target.value })} />}
      {ayuda && <div style={{ fontSize: 11, color: 'var(--rmg-muted)' }}>{ayuda}</div>}
    </div>
  )
  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4">
        {(lista.data || []).map(m => (
          <button key={m.segmento} onClick={() => setSeg(m.segmento)} className={seg === m.segmento ? 'btn-primary' : 'btn-secondary'}>
            {m.nombre} {m.validado_at ? '✓' : '•'}
          </button>
        ))}
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
        <div className="rmg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div style={{ fontWeight: 800 }}>Correo · {original.nombre}</div>
            <Chip ok={!!original.validado_at && !sucio}
              si={`Validado ${fmt(original.validado_at)}`}
              no={sucio ? 'Cambios sin guardar' : 'Sin validar: este segmento no envía'} />
          </div>
          {campo('asunto', 'Asunto (con nombre)', 1, 'Variables: {nombre} primer nombre, {empresa} razón social')}
          {campo('asunto_sin_nombre', 'Asunto (si no hay nombre)')}
          {campo('parrafo1', 'Párrafo de apertura', 3)}
          {campo('fallas', 'Fallas (una por línea)', 4)}
          {campo('parrafo2', 'Párrafo bajo la imagen', 2)}
          {campo('parrafo3', 'Cierre / llamado a la acción', 2)}
          <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {campo('imagen_correo', 'Imagen correo')}
            {campo('imagen_wa', 'Imagen WhatsApp')}
          </div>
          <div style={{ fontWeight: 800, margin: '10px 0 8px' }}>WhatsApp (variables de la plantilla aprobada)</div>
          {campo('wa_falla', 'Falla que se menciona', 1, '“Ayer le enviamos un correo sobre …”')}
          {campo('wa_rubro', 'Rubro', 1, '“…detenciones no programadas en …”')}
          <div className="flex flex-wrap gap-2 mt-3">
            {puedeEditar && <button className="btn-primary" disabled={!sucio || guardar.isPending} onClick={() => guardar.mutate()}><Save size={14} /> Guardar</button>}
            {dueno && <button className="btn-primary" disabled={sucio || !!original.validado_at || validar.isPending} onClick={() => validar.mutate()} style={{ background: '#0b6b66' }}><ShieldCheck size={14} /> Validar</button>}
            {puedeEditar && <button className="btn-secondary" disabled={sucio || prueba.isPending} onClick={() => prueba.mutate()}><FlaskConical size={14} /> Enviarme una prueba</button>}
          </div>
          {sucio && <div className="text-xs mt-2" style={{ color: 'var(--rmg-muted)' }}>Guarda los cambios para validar o enviar una prueba. Todo cambio guardado obliga a validar de nuevo.</div>}
        </div>

        <div>
          <div className="rmg-card p-3 mb-4">
            <div className="flex items-center gap-2 mb-2" style={{ fontWeight: 800 }}><Mail size={16} /> Vista previa del correo</div>
            {prev ? <>
              <div className="text-sm mb-2"><span style={{ color: 'var(--rmg-muted)' }}>De:</span> casilla de prospección · <span style={{ color: 'var(--rmg-muted)' }}>Ejemplo con:</span> {prev.empresa}</div>
              <div className="text-sm mb-2"><span style={{ color: 'var(--rmg-muted)' }}>Asunto:</span> <strong>{prev.asunto}</strong></div>
              <iframe title="correo" srcDoc={prev.html} style={{ width: '100%', height: 640, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff' }} />
            </> : <div className="text-sm">Cargando…</div>}
          </div>
          {prev?.whatsapp && (
            <div className="rmg-card p-3" style={{ background: '#efeae2' }}>
              <div className="flex items-center gap-2 mb-2" style={{ fontWeight: 800 }}><MessageCircle size={16} /> WhatsApp 1 (día siguiente) y 2 (si no responde)</div>
              {[[prev.whatsapp.imagen, prev.whatsapp.texto, prev.whatsapp.botones], [null, prev.whatsapp.texto2, prev.whatsapp.botones2]].map(([img, txt, bts], i) => (
                <div key={i} style={{ maxWidth: 340, background: '#fff', borderRadius: 8, padding: 6, marginBottom: 12, boxShadow: '0 1px 1px rgba(0,0,0,.1)' }}>
                  {img && <img src={img} alt="" style={{ width: '100%', borderRadius: 6, display: 'block' }} />}
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, padding: '6px 4px', color: '#111' }}>{txt}</div>
                  {bts.map(x => <div key={x} style={{ borderTop: '1px solid #eee', textAlign: 'center', color: '#0a7cff', fontSize: 14, padding: '7px 0' }}>{x}</div>)}
                </div>
              ))}
              <div className="text-xs" style={{ color: '#555' }}>El texto fijo es el de las plantillas aprobadas por Meta; solo cambian nombre, falla, rubro e imagen.</div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Pestaña Bot: simulador (no envía nada) ──────────────────────────────────
function SimuladorBot({ s }) {
  const [seg, setSeg] = useState('Industria')
  const [msgs, setMsgs] = useState([])
  const [txt, setTxt] = useState('')
  const [info, setInfo] = useState(null)
  const enviar = useMutation({
    mutationFn: (lista) => api.post('/prospeccion-auto/bot/simular', { segmento: seg, mensajes: lista }).then(r => r.data),
    onSuccess: (r) => { setMsgs(m => [...m, { rol: 'bot', texto: r.respuesta }]); setInfo(r) },
    onError: errMsg,
  })
  const mandar = (t) => {
    const v = String(t || '').trim(); if (!v || enviar.isPending) return
    const lista = [...msgs, { rol: 'cliente', texto: v }]
    setMsgs(lista); setTxt(''); enviar.mutate(lista)
  }
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
      <div className="rmg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <div style={{ fontWeight: 800 }}>Probar el bot</div>
          <div className="flex gap-2">
            <select className="rmg-input" value={seg} onChange={e => { setSeg(e.target.value); setMsgs([]); setInfo(null) }}>
              {SEGMENTOS.map(x => <option key={x}>{x}</option>)}
            </select>
            <button className="btn-secondary" onClick={() => { setMsgs([]); setInfo(null) }}>Reiniciar</button>
          </div>
        </div>
        <div className="text-xs mb-2" style={{ color: 'var(--rmg-muted)' }}>Escribe como si fueras el prospecto. Aquí no se envía nada a WhatsApp.</div>
        <div className="p-2 mb-2" style={{ background: '#efeae2', borderRadius: 8, height: 380, overflowY: 'auto' }}>
          {!msgs.length && <div className="text-xs p-2" style={{ color: '#555' }}>Prueba con: "Sí, envíenmela" · "¿Qué aceite usan para una caja reductora con carga pesada?" · "¿Cuánto vale el tambor?" · "Tenemos 4 retroexcavadoras CAT 420"</div>}
          {msgs.map((m, i) => <Burbuja key={i} rol={m.rol} texto={m.texto} />)}
          {enviar.isPending && <Burbuja rol="bot" texto="escribiendo…" />}
        </div>
        <div className="flex gap-2">
          {['Sí, envíenmela', 'Ahora no'].map(b => <button key={b} className="btn-secondary" style={{ padding: '4px 10px' }} onClick={() => mandar(b)}>{b}</button>)}
          <input className="rmg-input w-full" value={txt} placeholder="Mensaje del prospecto…" onChange={e => setTxt(e.target.value)} onKeyDown={e => e.key === 'Enter' && mandar(txt)} />
          <button className="btn-primary" onClick={() => mandar(txt)}><Send size={14} /></button>
        </div>
      </div>
      <div className="rmg-card p-4">
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Lo que vería Abril</div>
        {info ? <>
          <div className="text-sm mb-2"><strong>Resumen:</strong> {info.resumen || '—'}</div>
          <div className="text-sm mb-1">Pidió cotización: <strong>{info.pidio_cotizacion ? 'Sí' : 'No'}</strong></div>
          <div className="text-sm mb-1">Quiere llamado: <strong>{info.quiere_llamada ? 'Sí' : 'No'}</strong></div>
          <div className="text-sm mb-1">Horario: <strong>{info.horario || '—'}</strong></div>
          <div className="text-sm mb-1">Otro contacto: <strong>{info.contacto_alternativo || '—'}</strong></div>
          <div className="text-xs mt-3" style={{ color: 'var(--rmg-muted)' }}>Ejemplo con {info.empresa}{info.contacto ? ` · ${info.contacto}` : ''}.</div>
        </> : <div className="text-sm" style={{ color: 'var(--rmg-muted)' }}>Aparece después del primer mensaje.</div>}
        <div className="text-xs mt-4" style={{ color: 'var(--rmg-muted)', lineHeight: 1.5 }}>
          Conocimiento: {s.bot?.fichas} fichas técnicas verificadas + {s.bot?.productos} productos del sitio Vistony + catálogo. Sin precios ni stock.
          Estado: <strong>{s.bot?.activo ? 'respondiendo a prospectos' : 'apagado (solo simulador y celular de pruebas)'}</strong>.
          Con tu celular de pruebas también puedes conversar con el bot real por WhatsApp escribiéndole al número de prospección.
        </div>
      </div>
    </div>
  )
}

// ─── Pestaña Configuración (dueño) ───────────────────────────────────────────
function Configuracion({ s }) {
  const qc = useQueryClient()
  const [c, setC] = useState(() => ({ ...s.config, smtp_pass: '' }))
  const [verClave, setVerClave] = useState(false)
  const [editClave, setEditClave] = useState(false)
  const segs = String(c.segmentos_activos || '').split(',').filter(Boolean)
  const guardar = useMutation({
    mutationFn: () => {
      const body = Object.fromEntries(['smtp_email', 'smtp_nombre', 'smtp_host', 'smtp_port', 'lote_diario', 'hora_correo', 'hora_wsp1', 'hora_wsp2', 'hora_dormido',
        'segmentos_activos', 'wa_numero_bot', 'test_email', 'test_celular', 'notificar_emails', 'wsp_activo', 'bot_activo'].map(k => [k, c[k] ?? '']))
      if (c.smtp_pass) body.smtp_pass = c.smtp_pass
      return api.put('/prospeccion-auto/config', body).then(r => r.data)
    },
    onSuccess: async (r) => {
      const conClave = !!c.smtp_pass
      toast.success('Configuración guardada'); setC({ ...r, smtp_pass: '' }); qc.invalidateQueries({ queryKey: ['pauto-stats'] })
      if (conClave) probar.mutate()   // con clave nueva, se prueba sola al guardar
    },
    onError: errMsg,
  })
  const probar = useMutation({
    mutationFn: () => api.post('/prospeccion-auto/probar-casilla').then(r => r.data),
    onSuccess: (r) => { r.ok ? toast.success('Casilla OK: conecta y autentica') : toast.error(r.motivo, { duration: 9000 }); qc.invalidateQueries({ queryKey: ['pauto-stats'] }) },
    onError: errMsg,
  })
  const inp = (k, label, props = {}) => (
    <div className="mb-3">
      <label className="text-xs" style={{ color: 'var(--rmg-muted)', fontWeight: 700 }}>{label}</label>
      <input className="rmg-input w-full" value={c[k] ?? ''} onChange={e => setC({ ...c, [k]: e.target.value })} {...props} />
    </div>
  )
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
      <div className="rmg-card p-4">
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Casilla de envío (fija, para todos)</div>
        <div className="mb-3"><Chip ok={s.casilla?.ok && s.casilla?.verificada} si={`${s.casilla.email} verificada`} no={s.casilla?.motivo || 'Falta probar la casilla'} /></div>
        {inp('smtp_email', 'Correo')}
        {inp('smtp_nombre', 'Nombre visible')}
        <div className="mb-3">
          <label className="text-xs" style={{ color: 'var(--rmg-muted)', fontWeight: 700 }}>
            {s.config.smtp_clave_cargada ? 'Clave (ya cargada — escribe solo para cambiarla)' : 'Clave de la casilla'}
          </label>
          <div className="flex gap-2">
            {/* type=text + máscara CSS y readOnly hasta el foco: Chrome no autocompleta aquí su clave guardada. */}
            <input className="rmg-input w-full" name="prospeccion-smtp-clave" autoComplete="off" data-lpignore="true" data-1p-ignore="true"
              readOnly={!editClave} onFocus={() => setEditClave(true)}
              type="text" style={verClave ? {} : { WebkitTextSecurity: 'disc' }}
              placeholder={s.config.smtp_clave_cargada ? '(guardada)' : 'Escribe la clave a mano'}
              value={c.smtp_pass || ''} onChange={e => setC({ ...c, smtp_pass: e.target.value })} />
            <button type="button" className="btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setVerClave(!verClave)}><Eye size={14} /></button>
          </div>
          {c.smtp_pass && <div style={{ fontSize: 11, color: 'var(--rmg-muted)' }}>{c.smtp_pass.length} caracteres. Guarda y luego prueba.</div>}
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: '2fr 1fr' }}>{inp('smtp_host', 'Servidor SMTP')}{inp('smtp_port', 'Puerto')}</div>
        <button className="btn-secondary" disabled={probar.isPending} onClick={() => probar.mutate()}><RefreshCw size={14} /> Probar casilla</button>
        <div className="text-xs mt-2" style={{ color: 'var(--rmg-muted)' }}>Guarda primero si cambiaste la clave.</div>
      </div>
      <div className="rmg-card p-4">
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Ritmo y horarios (días hábiles, hora Chile)</div>
        {inp('lote_diario', 'Correos por día (máx. 100)', { type: 'number', min: 1, max: 100 })}
        <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {inp('hora_correo', 'Correo', { type: 'time' })}{inp('hora_wsp1', 'WhatsApp 1 (día siguiente)', { type: 'time' })}
          {inp('hora_wsp2', 'WhatsApp 2 (día siguiente)', { type: 'time' })}{inp('hora_dormido', 'Pasa a dormido', { type: 'time' })}
        </div>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--rmg-muted)', margin: '6px 0' }}>Segmentos activos</div>
        <div className="flex gap-3 mb-3">
          {SEGMENTOS.map(x => (
            <label key={x} className="text-sm flex items-center gap-1">
              <input type="checkbox" checked={segs.includes(x)} onChange={e => setC({ ...c, segmentos_activos: (e.target.checked ? [...segs, x] : segs.filter(y => y !== x)).join(',') })} /> {x}
            </label>
          ))}
        </div>
      </div>
      <div className="rmg-card p-4">
        <div style={{ fontWeight: 800, marginBottom: 8 }}>WhatsApp y avisos</div>
        <div className="mb-3"><Chip ok={s.wa_configurado} si="Número de WhatsApp conectado (Render)" no="Faltan PROSPECCION_WA_PHONE_ID / PROSPECCION_WA_TOKEN en Render" /></div>
        <label className="text-sm flex items-center gap-2 mb-3">
          <input type="checkbox" checked={!!c.wsp_activo} onChange={e => setC({ ...c, wsp_activo: e.target.checked ? 1 : 0 })} /> Enviar WhatsApp 1 y 2
        </label>
        <label className="text-sm flex items-center gap-2 mb-1">
          <input type="checkbox" checked={!!c.bot_activo} onChange={e => setC({ ...c, bot_activo: e.target.checked ? 1 : 0 })} /> El bot responde a los prospectos
        </label>
        <div className="mb-3"><Chip ok={!!s.bot?.openai} si={`IA lista (${s.bot?.modelo}) · ${s.bot?.fichas} fichas · ${s.bot?.productos} productos`} no="Falta OPENAI_API_KEY en Render" /></div>
        {inp('wa_numero_bot', 'Número del bot (botón del correo)', { placeholder: '569XXXXXXXX' })}
        {inp('test_email', 'Correo para pruebas')}
        {inp('test_celular', 'Celular para pruebas', { placeholder: '569XXXXXXXX' })}
        {inp('notificar_emails', 'Avisar respuestas a (correos separados por coma)')}
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <button className="btn-primary" disabled={guardar.isPending} onClick={() => guardar.mutate()}><Save size={14} /> Guardar configuración</button>
      </div>
    </div>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────────
export default function ProspeccionAutoPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState('pipeline')
  const [accion, setAccion] = useState(null)
  const stats = useQuery({ queryKey: ['pauto-stats'], queryFn: () => api.get('/prospeccion-auto/stats').then(r => r.data), refetchInterval: 60000 })
  const s = stats.data
  const dueno = !!s && String(user?.email || '').toLowerCase() === s.config?.owner_email
  const puedeEditar = dueno || ['gerente', 'administrador'].includes(user?.rol)
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['pauto-stats'] }); qc.invalidateQueries({ queryKey: ['pauto-detalle'] }) }

  const activar = useMutation({ mutationFn: () => api.post('/prospeccion-auto/activar').then(r => r.data), onSuccess: () => { toast.success('Campaña activada'); refrescar() }, onError: errMsg })
  const pausar = useMutation({ mutationFn: () => api.post('/prospeccion-auto/pausar').then(r => r.data), onSuccess: () => { toast.success('Campaña pausada'); refrescar() }, onError: errMsg })
  const cambiar = useMutation({
    mutationFn: ({ id, body }) => api.put(`/prospeccion-auto/prospecto/${id}/estado`, body).then(r => r.data),
    onSuccess: () => { toast.success('Registrado'); setAccion(null); refrescar() }, onError: errMsg,
  })
  const llamar = useQuery({
    queryKey: ['pauto-detalle', 'llamar-tab'],
    queryFn: () => api.get('/prospeccion-auto/detalle', { params: { filtro: 'contestados' } }).then(r => r.data),
    enabled: tab === 'llamar', refetchInterval: 60000,
  })

  if (stats.isLoading) return <div className="p-6">Cargando…</div>
  if (stats.error) return <div className="p-6" style={{ color: '#b4402a' }}>{stats.error?.response?.data?.error || stats.error.message}</div>

  const activo = !!s.config.activo
  const sinValidar = s.mensajes.filter(m => String(s.config.segmentos_activos || '').split(',').includes(m.segmento) && !m.validado_at)
  const TABS = [['pipeline', 'Pipeline'], ['conversaciones', 'Conversaciones'], ['llamar', `Para llamar (${s.tarjetas?.llamar ?? 0})`], ['mensajes', 'Mensajes'], ['bot', 'Bot'], ...(dueno ? [['config', 'Configuración']] : [])]

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, fontFamily: 'Inter Tight, sans-serif' }} className="flex items-center gap-2"><Send size={22} /> Prospección automática</h1>
          <div className="text-sm" style={{ color: 'var(--rmg-muted)' }}>
            Correo {s.config.hora_correo} → WhatsApp 1 {s.config.hora_wsp1} (D+1) → WhatsApp 2 {s.config.hora_wsp2} (D+2) → dormido · {s.config.lote_diario} por día · desde {s.casilla.email}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ padding: '6px 12px', borderRadius: 999, fontWeight: 800, fontSize: 13, background: activo ? '#dcfce7' : '#fee2e2', color: activo ? '#166534' : '#991b1b' }}>
            {activo ? `ACTIVA${s.envio_en_curso ? ' · enviando…' : ''}` : 'PAUSADA'}
          </span>
          {dueno && (activo
            ? <button className="btn-secondary" disabled={pausar.isPending} onClick={() => pausar.mutate()}><Pause size={14} /> Pausar</button>
            : <button className="btn-primary" disabled={activar.isPending} onClick={() => window.confirm(`¿Activar? Desde hoy salen ${s.config.lote_diario} correos diarios a las ${s.config.hora_correo}.`) && activar.mutate()}><Play size={14} /> Activar</button>)}
          <button className="btn-secondary" onClick={refrescar}><RefreshCw size={14} /></button>
        </div>
      </div>

      {!activo && s.config.pausa_motivo && <div className="rmg-card p-3 mb-3 text-sm" style={{ color: '#b4402a' }}>{s.config.pausa_motivo}</div>}

      <div className="rmg-card p-3 mb-4 flex flex-wrap gap-x-6 gap-y-2">
        <Chip ok={s.casilla.ok && s.casilla.verificada} si="Casilla verificada" no={s.casilla.ok ? 'Falta probar la casilla' : s.casilla.motivo} />
        <Chip ok={!sinValidar.length} si="Mensajes validados" no={`Validar: ${sinValidar.map(m => m.segmento).join(', ')}`} />
        <Chip ok={s.wa_configurado && !!s.config.wsp_activo} si="WhatsApp listo" no={s.wa_configurado ? 'WhatsApp apagado' : 'WhatsApp sin número'} />
        <Chip ok={(s.tarjetas?.base || 0) > 0} si={`${s.tarjetas?.base} en la base`} no="Base vacía" />
        {s.atrasados > 0 && <Chip ok={false} no={`${s.atrasados} correos de hace más de 4 días sin WhatsApp`} />}
      </div>

      <div className="flex gap-2 mb-4" style={{ borderBottom: '1px solid var(--rmg-border, #e5e7eb)' }}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '8px 14px', fontWeight: 700, borderBottom: tab === k ? '3px solid #1d4ed8' : '3px solid transparent', color: tab === k ? 'var(--rmg-text)' : 'var(--rmg-muted)' }}>{l}</button>
        ))}
      </div>

      {tab === 'pipeline' && <Pipeline s={s} dueno={dueno} onAccion={setAccion} />}
      {tab === 'llamar' && (
        <div className="rmg-card">
          <div className="p-3 text-sm" style={{ color: 'var(--rmg-muted)', borderBottom: '1px solid var(--rmg-border, #e5e7eb)' }}>
            Respondieron por correo o WhatsApp. Llamar el mismo día y registrar el resultado (botón del teléfono).
          </div>
          <TablaDetalle filas={llamar.data} cargando={llamar.isLoading} onAccion={setAccion} />
        </div>
      )}
      {tab === 'mensajes' && <Mensajes dueno={dueno} puedeEditar={puedeEditar} />}
      {tab === 'conversaciones' && <Bandeja onAccion={setAccion} />}
      {tab === 'bot' && <SimuladorBot s={s} />}
      {tab === 'config' && dueno && <Configuracion s={s} />}

      {accion && <ModalAccion p={accion} onClose={() => setAccion(null)} onSave={(body) => cambiar.mutate({ id: accion.id, body })} />}
    </div>
  )
}
