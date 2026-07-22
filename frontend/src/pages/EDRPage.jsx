import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP } from '@utils/format'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

const MES_ACTUAL = new Date().toISOString().slice(0, 7)

function FilaEDR({ label, value, indent = 0, bold = false, tipo = 'neutral', separator = false }) {
  const color = tipo === 'positivo' ? 'var(--rmg-teal)' : tipo === 'negativo' ? 'var(--rmg-red)' : tipo === 'costo' ? 'var(--rmg-gold)' : 'var(--rmg-off)'
  return (
    <>
      {separator && <tr><td colSpan={2} style={{ borderTop: '1px solid rgba(56,182,255,0.1)', paddingTop: 4 }} /></tr>}
      <tr className="hover:bg-white/[0.01]">
        <td className="px-6 py-2 text-sm" style={{ paddingLeft: `${24 + indent * 20}px`, color: bold ? 'var(--rmg-off)' : 'var(--rmg-muted)', fontWeight: bold ? 700 : 400 }}>
          {label}
        </td>
        <td className="px-6 py-2 text-right font-mono" style={{ color, fontWeight: bold ? 800 : 500, fontFamily: bold ? 'Inter Tight, sans-serif' : undefined }}>
          {formatCLP(value)}
        </td>
      </tr>
    </>
  )
}

export default function EDRPage() {
  const [mes, setMes] = useState(MES_ACTUAL)

  const { data: edr, isLoading, error } = useQuery({
    queryKey: ['edr', mes],
    queryFn: () => api.get('/edr', { params: { mes } }).then(r => r.data),
    enabled: !!mes,
  })

  const pctMargen = edr?.ingresos ? ((edr.margen_bruto / edr.ingresos) * 100).toFixed(1) : '0.0'
  const pctResultado = edr?.ingresos ? ((edr.resultado_operacional / edr.ingresos) * 100).toFixed(1) : '0.0'

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Estado de Resultados</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>EDR · Ingresos · Costos · Resultado Operacional</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Período</label>
          <input type="month" className="rmg-input text-xs py-1.5 w-36" value={mes} onChange={e => setMes(e.target.value)} />
        </div>
      </div>

      {isLoading && (
        <div className="rmg-card p-8 text-center" style={{ color: 'var(--rmg-muted)' }}>
          <div className="animate-pulse text-sm">Calculando EDR...</div>
        </div>
      )}

      {error && (
        <div className="rmg-card p-4" style={{ borderColor: 'rgba(224,90,78,0.3)' }}>
          <p className="text-sm" style={{ color: 'var(--rmg-red)' }}>Error al cargar el EDR: {error.message}</p>
        </div>
      )}

      {edr && !isLoading && (
        <>
          {/* Cards resumen */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rmg-card p-4">
              <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Ingresos</div>
              <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-blt)' }}>{formatCLP(edr.ingresos)}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>ventas del período</div>
            </div>
            <div className="rmg-card p-4">
              <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Margen Bruto</div>
              <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: edr.margen_bruto >= 0 ? 'var(--rmg-teal)' : 'var(--rmg-red)' }}>{formatCLP(edr.margen_bruto)}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{pctMargen}% sobre ingresos</div>
            </div>
            <div className="rmg-card p-4">
              <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Total Gastos</div>
              <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-red)' }}>{formatCLP(edr.total_gastos)}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>fijos + variables + ext.</div>
            </div>
            <div className="rmg-card p-4" style={edr.resultado_operacional >= 0 ? { borderColor: 'rgba(45,201,138,0.3)' } : { borderColor: 'rgba(224,90,78,0.3)' }}>
              <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Resultado Operacional</div>
              <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: edr.resultado_operacional >= 0 ? 'var(--rmg-teal)' : 'var(--rmg-red)' }}>
                {edr.resultado_operacional >= 0 ? <TrendingUp size={18} className="inline mr-1 mb-0.5" /> : <TrendingDown size={18} className="inline mr-1 mb-0.5" />}
                {formatCLP(edr.resultado_operacional)}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{pctResultado}% sobre ingresos</div>
            </div>
          </div>

          {/* Estado de Resultados detallado */}
          <div className="rmg-card overflow-hidden">
            <div className="px-6 py-4 border-b" style={{ borderColor: 'rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
              <div className="font-bold">Estado de Resultados — {mes}</div>
            </div>
            <table className="w-full">
              <tbody>
                <FilaEDR label="INGRESOS" value={edr.ingresos} bold tipo="positivo" />
                <FilaEDR label="Costo de Mercadería Vendida (CMV)" value={-edr.costo_mercaderia} indent={1} tipo="costo" />
                <FilaEDR label="MARGEN BRUTO" value={edr.margen_bruto} bold tipo={edr.margen_bruto >= 0 ? 'positivo' : 'negativo'} separator />

                <FilaEDR label="GASTOS OPERACIONALES" value={-edr.total_gastos} bold tipo="negativo" separator />
                <FilaEDR label="Gastos Fijos" value={-edr.gastos_fijos} indent={1} tipo="negativo" />
                <FilaEDR label="Gastos Variables" value={-edr.gastos_variables} indent={1} tipo="negativo" />
                <FilaEDR label="Gastos Extraordinarios" value={-edr.gastos_extraordinarios} indent={1} tipo="negativo" />

                <FilaEDR label="RESULTADO OPERACIONAL" value={edr.resultado_operacional} bold tipo={edr.resultado_operacional >= 0 ? 'positivo' : 'negativo'} separator />
              </tbody>
            </table>
          </div>

          {/* Bloque informativo CxC / CxP */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rmg-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full" style={{ background: 'var(--rmg-blt)' }} />
                <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>CxC Pendiente — Cuentas por Cobrar</div>
              </div>
              <div className="font-black text-3xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-blt)' }}>{formatCLP(edr.cxc_pendiente)}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--rmg-muted)' }}>Ventas en estado Pendiente · {mes}</div>
            </div>
            <div className="rmg-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full" style={{ background: 'var(--rmg-gold)' }} />
                <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>CxP Pendiente — Cuentas por Pagar</div>
              </div>
              <div className="font-black text-3xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-gold)' }}>{formatCLP(edr.cxp_pendiente)}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--rmg-muted)' }}>Compras Pendiente + Recibido · {mes}</div>
            </div>
          </div>

          {edr.ingresos === 0 && edr.total_gastos === 0 && (
            <div className="rmg-card p-6 text-center" style={{ color: 'var(--rmg-muted)' }}>
              <Minus size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin datos para {mes}. Registra ventas y gastos para ver el EDR.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
