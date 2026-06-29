import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useConfigStore = create(
  persist(
    (set) => ({
      meta_total:           20_000_000,
      meta_talleres:         8_000_000,
      meta_flotas:           6_000_000,
      meta_concesionarios:   4_000_000,
      meta_construccion:     2_000_000,
      forecast_mes1:         15,
      forecast_mes2:         15,
      forecast_mes3:         15,
      margen_objetivo:       26,
      dias_credito:          30,
      presupuesto_gastos:    2_500_000,
      stock_min_bateria:      5,
      stock_min_lubricante:  10,
      stock_min_neumatico:    8,
      dias_inactivo:          30,
      dias_cxc_alerta:        30,
      save: (patch) => set(patch),
    }),
    { name: 'rmg-config' }
  )
)
