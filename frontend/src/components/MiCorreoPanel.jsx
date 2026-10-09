import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { Mail, Check, AlertTriangle, Eye, EyeOff, Trash2, Zap } from 'lucide-react'
import toast from 'react-hot-toast'

/**
 * Casilla de correo propia del usuario conectado.
 *
 * 2026-10-09 (pedido de JC): los correos a prospectos deben salir desde la
 * dirección @rmgautos.cl del vendedor, no desde una cuenta compartida. Cada
 * quien configura la suya acá; el backend guarda la clave cifrada y nunca la
 * devuelve, por eso el campo siempre aparece vacío aunque ya esté configurada.
 */
export default function MiCorreoPanel() {
  const qc = useQueryClient()
  const [pass, setPass]       = useState('')
  const [verPass, setVerPass] = useState(false)
  const [email, setEmail]     = useState(null)   // null = todavía no se tocó
  const [host, setHost]       = useState(null)
  const [port, setPort]       = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['mi-correo'],
    queryFn: () => api.get('/usuarios/me/correo').then(r => r.data),
  })

  const guardar = useMutation({
    mutationFn: (d) => api.put('/usuarios/me/correo', d).then(r => r.data),
    onSuccess: (d) => {
      toast.success(`Casilla ${d.smtp_email} verificada y guardada`)
      setPass('')
      qc.invalidateQueries({ queryKey: ['mi-correo'] })
    },
    onError: (e) => toast.error(e.response?.data?.error || 'No se pudo guardar'),
  })

  const probar = useMutation({
    mutationFn: () => api.post('/usuarios/me/correo/probar').then(r => r.data),
    onSuccess: (d) => toast.success(`Conexión correcta con ${d.smtp_email}`),
    onError: (e) => toast.error(e.response?.data?.error || 'La conexión falló'),
  })

  const borrar = useMutation({
    mutationFn: () => api.delete('/usuarios/me/correo').then(r => r.data),
    onSuccess: () => {
      toast.success('Casilla desvinculada')
      setPass('')
      qc.invalidateQueries({ queryKey: ['mi-correo'] })
    },
    onError: (e) => toast.error(e.response?.data?.error || 'No se pudo desvincular'),
  })

  if (isLoading) return <div className="text-sm" style={{ color: 'var(--rmg-muted)' }}>Cargando…</div>

  const vEmail = email ?? data?.smtp_email ?? ''
  const vHost  = host  ?? data?.smtp_host  ?? ''
  const vPort  = port  ?? data?.smtp_port  ?? 465

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-start gap-3">
        <Mail size={18} style={{ color: 'var(--rmg-blue)', marginTop: 2 }} />
        <div>
          <h3 className="text-sm font-bold">Mi casilla de correo</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>
            Los correos a prospectos saldrán desde tu dirección y quedarán en tu carpeta
            de Enviados. Sin esto, salen desde la cuenta común de la empresa.
          </p>
        </div>
      </div>

      {data?.configurado ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
          style={{ background: 'rgba(45,201,138,0.1)', border: '1px solid rgba(45,201,138,0.25)', color: '#2dc98a' }}>
          <Check size={14} />
          <span>
            Configurada: <strong>{data.smtp_email}</strong>
            {data.verificado_at && ` · verificada el ${String(data.verificado_at).slice(0, 10)}`}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
          style={{ background: 'rgba(244,162,60,0.1)', border: '1px solid rgba(244,162,60,0.25)', color: '#f4a23c' }}>
          <AlertTriangle size={14} />
          <span>Todavía no configurada — tus correos salen desde la cuenta común.</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs font-medium" style={{ color: 'var(--rmg-muted)' }}>Dirección de correo</label>
          <input className="input w-full mt-1" type="email" placeholder="tunombre@rmgautos.cl"
            value={vEmail} onChange={e => setEmail(e.target.value)} />
        </div>

        <div className="col-span-2">
          <label className="text-xs font-medium" style={{ color: 'var(--rmg-muted)' }}>
            Contraseña de la casilla
          </label>
          <div className="relative mt-1">
            <input className="input w-full pr-9" type={verPass ? 'text' : 'password'}
              placeholder={data?.configurado ? '•••••••• (guardada)' : 'La clave del correo'}
              value={pass} onChange={e => setPass(e.target.value)} />
            <button type="button" onClick={() => setVerPass(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--rmg-muted)' }}>
              {verPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <p className="text-[11px] mt-1" style={{ color: 'var(--rmg-muted)' }}>
            Se guarda cifrada en el servidor. Conviene usar una clave distinta a la del
            webmail, para que esta credencial no sea la misma con que entras a tu correo.
          </p>
        </div>

        <div>
          <label className="text-xs font-medium" style={{ color: 'var(--rmg-muted)' }}>Servidor SMTP</label>
          <input className="input w-full mt-1" placeholder="mail.rmgautos.cl"
            value={vHost} onChange={e => setHost(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium" style={{ color: 'var(--rmg-muted)' }}>Puerto</label>
          <select className="input w-full mt-1" value={vPort} onChange={e => setPort(Number(e.target.value))}>
            <option value={465}>465 — SSL/TLS</option>
            <option value={587}>587 — STARTTLS</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary text-sm flex items-center gap-1.5"
          disabled={guardar.isPending || !vEmail || !pass}
          onClick={() => guardar.mutate({ smtp_email: vEmail, smtp_pass: pass, smtp_host: vHost, smtp_port: vPort })}>
          <Check size={14} />
          {guardar.isPending ? 'Verificando…' : 'Verificar y guardar'}
        </button>

        {data?.configurado && (
          <>
            <button className="btn-secondary text-sm flex items-center gap-1.5"
              disabled={probar.isPending} onClick={() => probar.mutate()}>
              <Zap size={14} />
              {probar.isPending ? 'Probando…' : 'Probar conexión'}
            </button>
            <button className="btn-secondary text-sm flex items-center gap-1.5"
              style={{ color: '#e05a4e' }}
              disabled={borrar.isPending}
              onClick={() => { if (confirm('¿Desvincular tu casilla? Tus correos volverán a salir desde la cuenta común.')) borrar.mutate() }}>
              <Trash2 size={14} /> Desvincular
            </button>
          </>
        )}
      </div>

      <p className="text-[11px]" style={{ color: 'var(--rmg-muted)' }}>
        La clave se comprueba contra el servidor antes de guardarse: si no conecta, no se
        guarda. Así no te enteras del problema recién al intentar mandar un correo.
      </p>
    </div>
  )
}
