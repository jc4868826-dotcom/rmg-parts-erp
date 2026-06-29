# RMG Auto Parts — Modelo de Negocio Detallado

## Inventario real disponible (Existencia actual)

### Baterías — Marca YOKO G&B

| Código | Descripción | Stock | P. Costo | P. Venta B2B | Margen |
|--------|-------------|-------|----------|-------------|--------|
| 352410 | KR 35AMP NS40ZL | 370 u | $31.311 | $42.000 | 25.5% |
| 352420 | KR 55AMP 55559  | 408 u | $48.450 | $64.000 | 24.3% |
| 352421 | KR 44AMP 54459  | 270 u | $44.989 | $60.000 | 25.0% |
| 351416 | KR 40AMP N40L   | 148 u | $35.579 | $48.000 | 25.9% |
| 352430 | KR 70AMP N70    | 42 u  | $61.769 | $82.000 | 24.7% |
| 352432 | KR 75AMP N70Z   | 58 u  | $67.808 | $90.000 | 24.7% |
| 352440 | KR 100AMP N100L | 39 u  | $79.501 | $106.000 | 25.0% |
| 352445 | KR 120AMP N120  | 61 u  | $100.573 | $134.000 | 25.0% |
| 352450 | KR 150AMP N150  | 65 u  | $129.164 | $172.000 | 24.9% |
| 352453 | 73011SHD 230AMP | 53 u  | $226.551 | $300.000 | 24.5% |

**Observación:** Stock de baterías muy sólido. Las referencias 352410 y 352420 con +400 unidades son ideales para la rotación rápida en talleres (35Ah para autos de ciudad, 55Ah para flota).

---

### Lubricantes — Marca AUSTER

| Código | Descripción | Stock | P. Costo | P. Venta B2B |
|--------|-------------|-------|----------|-------------|
| 7000001 | MAXTECH PRO RX 5W30 1L | 1.613 u | $3.116 | $4.200 |
| 7000049 | MAXTECH PRO RX 5W30 4L | 2.257 u | $11.454 | $15.500 |
| 7000003 | MAXTECH PRO FE 5W30 ACEA C3 1L | 2.567 u | $3.143 | $4.300 |
| 7000006 | MAXFORCE 15W40 CK-4 1L | 1.813 u | $3.385 | $4.600 |
| 7000046 | MAXFORCE 15W40 CK-4 6L | 832 u | $18.330 | $24.500 |
| 7000053 | MAXFORCE 15W40 CK-4 20L | 50 u | $55.422 | $74.000 |
| 7000012 | MAXFORCE 10W40 CK-4 20L | 1.560 u | $36.546 | $49.000 |
| 7000055 | HYDRO ISO 46 20LT | 81 u | $37.638 | $50.000 |

**Observación:** Stock AUSTER es el punto más fuerte del inventario. +2.000 unidades de 5W30 (el lubricante más vendido en RM para autos modernos). El Hydro ISO 46 en bidón 20L es el diferenciador para el segmento construcción.

---

### Neumáticos — KUMHO y DOUBLE STAR

**Alta rotación (talleres/taxi):**
| Código | Descripción | Stock | P. Costo | P. Venta B2B |
|--------|-------------|-------|----------|-------------|
| 210016 | 185/65 R15 DH05 88H | 192 u | $26.089 | $35.000 |
| 210051 | 205/60 R16 DH05 92H | 218 u | $32.553 | $43.000 |
| 210108 | 185/60 R15 DH05 84H | 160 u | $29.387 | $39.000 |

**Camioneta/SUV (talleres+concesionarios):**
| Código | Descripción | Stock | P. Costo | P. Venta B2B |
|--------|-------------|-------|----------|-------------|
| 244374 | 275/60 R20 AT51 (pickup) | 145 u | $157.951 | $210.000 |
| 244635 | 245/75 R16 AT52 (4x4 AT) | 70 u | $124.949 | $166.000 |
| 244325 | 265/70 R18 KL21 (4x4 AT) | 44 u | $87.101 | $116.000 |

**Camión/pesado (flotas):**
| Código | Descripción | Stock | P. Costo | P. Venta B2B |
|--------|-------------|-------|----------|-------------|
| 210097 | 11 R22.5 DSR668 | 253 u | $191.440 | $255.000 |
| 210033 | 11 R22.5 DSR168 | 205 u | $172.646 | $230.000 |
| 210034 | 295/80 R22.5 DSR668 | 140 u | $183.597 | $245.000 |

---

## Análisis del inventario disponible

### Fortalezas del stock actual

1. **Baterías YOKO G&B:** Cobertura completa de 35Ah a 230Ah. Precio competitivo vs Bosch y Optima. El NS40ZL (370 u) es el más vendido en autos japoneses (Toyota, Nissan) que dominan el parque RM.

2. **Lubricantes AUSTER:** Stock profundo en las referencias de mayor salida. El 5W30 (línea MAXTECH) es el requerido por motores modernos Euro 6. El 15W40 CK-4 cubre flotas diesel.

3. **Neumáticos Double Star camiones:** Con 253 unidades del 11 R22.5, hay stock para abastecer varias flotas de transporte 6–12 meses sin reposición urgente.

### Gaps a resolver antes de vender

- **Filtros de aceite:** No aparecen en el inventario. Críticos para cerrar la venta completa al taller (el taller compra filtro + aceite juntos). Cotizar urgente.
- **Refrigerante concentrado:** Solo hay datos en el plan SKU pero no en el Excel de existencias. Verificar stock real.
- **Grasas EP2 a granel (tarro 18kg):** Mencionadas en el plan pero sin código visible en existencias.

---

## Proyección de ingresos basada en inventario disponible

### Escenario mes 1 — Con stock actual

Con 22 talleres activos y el inventario disponible:

| SKU (representativo) | Qty/taller/mes | Talleres | Q total | Venta |
|----------------------|---------------|----------|---------|-------|
| YOKO 35–55 Ah        | 2–3 u/taller  | 22       | 55 u    | $3.3M |
| AUSTER 5W30 4L       | 3 cajas       | 22       | 66 u    | $1.0M |
| AUSTER 15W40 6L      | 4 envases     | 22       | 88 u    | $2.2M |
| DS 185/65 R15        | 4 u           | 22       | 88 u    | $3.1M |
| **Subtotal talleres** |              |          |         | **~$9.6M** |

El stock disponible soporta perfectamente la operación del mes 1 sin ninguna compra adicional urgente.

---

*RMG Auto Parts · Análisis de inventario y modelo de negocio · Junio 2026*
