import { useQuery } from '@tanstack/react-query'
import { api } from '@utils/api'

const DEFAULTS = {
  meta_venta_total: 20000000,
  meta_talleres: 8000000,
  meta_flotas: 6000000,
  meta_concesionarios: 4000000,
  meta_construccion: 2000000,
  pct_crecimiento_m1: 15,
  pct_crecimiento_m2: 15,
  pct_crecimiento_m3: 15,
  margen_objetivo_pct: 26,
  dias_credito_promedio: 30,
  presupuesto_gastos_operacionales: 2500000,
  stock_minimo_bateria: 5,
  stock_minimo_lubricante: 10,
  stock_minimo_neumatico: 8,
  dias_inactivo_cliente: 30,
  dias_alerta_cxc: 30,
}

// Aliases for backward-compat with Dashboard/Reportes
const withAliases = (data) => ({
  ...DEFAULTS,
  ...data,
  meta_total:         data?.meta_venta_total            ?? DEFAULTS.meta_venta_total,
  presupuesto_gastos: data?.presupuesto_gastos_operacionales ?? DEFAULTS.presupuesto_gastos_operacionales,
  forecast_mes1:      data?.pct_crecimiento_m1          ?? DEFAULTS.pct_crecimiento_m1,
  forecast_mes2:      data?.pct_crecimiento_m2          ?? DEFAULTS.pct_crecimiento_m2,
  forecast_mes3:      data?.pct_crecimiento_m3          ?? DEFAULTS.pct_crecimiento_m3,
  margen_objetivo:    data?.margen_objetivo_pct         ?? DEFAULTS.margen_objetivo_pct,
  dias_credito:       data?.dias_credito_promedio       ?? DEFAULTS.dias_credito_promedio,
  stock_min_bateria:  data?.stock_minimo_bateria        ?? DEFAULTS.stock_minimo_bateria,
  stock_min_lubricante: data?.stock_minimo_lubricante   ?? DEFAULTS.stock_minimo_lubricante,
  stock_min_neumatico: data?.stock_minimo_neumatico     ?? DEFAULTS.stock_minimo_neumatico,
  dias_inactivo:      data?.dias_inactivo_cliente       ?? DEFAULTS.dias_inactivo_cliente,
  dias_cxc_alerta:    data?.dias_alerta_cxc             ?? DEFAULTS.dias_alerta_cxc,
})

export function useConfig(mes) {
  const { data, isLoading } = useQuery({
    queryKey: mes ? ['config', mes] : ['config-actual'],
    queryFn: () => mes
      ? api.get('/configuracion', { params: { mes } }).then(r => r.data)
      : api.get('/configuracion/actual').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })
  return { cfg: withAliases(data), isLoading }
}
