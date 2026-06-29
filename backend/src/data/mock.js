/**
 * RMG Auto Parts — Datos mock para desarrollo local
 * Refleja inventario real sin conexión a Supabase
 */

const PRODUCTOS = [
  // ── Baterías YOKO G&B ──────────────────────────────────────
  { codigo: '352410', marca: 'YOKO G&B', descripcion: 'BATERIA YOKO KR 35AMP NS40ZL', categoria: 'bateria', unidad: 'unidad', precio_costo: 31311, precio_b2b_base: 42000, precio_taller: 42000, precio_flota: 40000, stock_actual: 370, stock_minimo: 30 },
  { codigo: '352420', marca: 'YOKO G&B', descripcion: 'BATERIA YOKO KR 55AMP 55559',  categoria: 'bateria', unidad: 'unidad', precio_costo: 48450, precio_b2b_base: 64000, precio_taller: 64000, precio_flota: 61000, stock_actual: 408, stock_minimo: 40 },
  { codigo: '352421', marca: 'YOKO G&B', descripcion: 'BATERIA YOKO KR 44AMP 54459',  categoria: 'bateria', unidad: 'unidad', precio_costo: 44989, precio_b2b_base: 60000, precio_taller: 60000, precio_flota: 57000, stock_actual: 270, stock_minimo: 20 },
  { codigo: '351416', marca: 'YOKO G&B', descripcion: 'BATERIA YOKO KR 40AMP N40L',   categoria: 'bateria', unidad: 'unidad', precio_costo: 35579, precio_b2b_base: 48000, precio_taller: 48000, precio_flota: 45000, stock_actual: 148, stock_minimo: 20 },
  { codigo: '352430', marca: 'YOKO G&B', descripcion: 'BATERIA YOKO KR 70AMP N70',    categoria: 'bateria', unidad: 'unidad', precio_costo: 61769, precio_b2b_base: 82000, precio_taller: 82000, precio_flota: 78000, stock_actual: 42, stock_minimo: 15 },
  { codigo: '352432', marca: 'YOKO G&B', descripcion: 'BATERIA YOKO KR 75AMP N70Z',   categoria: 'bateria', unidad: 'unidad', precio_costo: 67808, precio_b2b_base: 90000, precio_taller: 90000, precio_flota: 86000, stock_actual: 58, stock_minimo: 15 },
  { codigo: '352440', marca: 'YOKO G&B', descripcion: 'BATERIA YOKO KR 100AMP N100L', categoria: 'bateria', unidad: 'unidad', precio_costo: 79501, precio_b2b_base: 106000, precio_taller: 106000, precio_flota: 100000, precio_construccion: 100000, stock_actual: 39, stock_minimo: 10 },
  { codigo: '352445', marca: 'YOKO G&B', descripcion: 'BATERIA YOKO KR 120AMP N120',  categoria: 'bateria', unidad: 'unidad', precio_costo: 100573, precio_b2b_base: 134000, precio_flota: 127000, precio_construccion: 127000, stock_actual: 61, stock_minimo: 10 },
  { codigo: '352450', marca: 'YOKO G&B', descripcion: 'BATERIA YOKO KR 150AMP N150',  categoria: 'bateria', unidad: 'unidad', precio_costo: 129164, precio_b2b_base: 172000, precio_flota: 163000, precio_construccion: 163000, stock_actual: 65, stock_minimo: 8 },
  { codigo: '352453', marca: 'YOKO G&B', descripcion: 'BATERIA YOKO 73011SHD SMF 230AMP (camión)', categoria: 'bateria', unidad: 'unidad', precio_costo: 226551, precio_b2b_base: 300000, precio_flota: 285000, precio_construccion: 285000, stock_actual: 53, stock_minimo: 5 },

  // ── Lubricantes AUSTER ──────────────────────────────────────
  { codigo: '7000001', marca: 'AUSTER', descripcion: 'AUSTER MAXTECH PRO RX 5W30 SP/CJ 1L',       categoria: 'lubricante', unidad: 'litro',      precio_costo: 3116,  precio_b2b_base: 4200,  precio_taller: 4200, precio_concesionario: 4000, stock_actual: 1613, stock_minimo: 100 },
  { codigo: '7000049', marca: 'AUSTER', descripcion: 'AUSTER MAXTECH PRO RX 5W30 SP/CJ 4LT',      categoria: 'lubricante', unidad: 'caja 4u',    precio_costo: 11454, precio_b2b_base: 15500, precio_taller: 15500, precio_concesionario: 14800, stock_actual: 2257, stock_minimo: 200 },
  { codigo: '7000006', marca: 'AUSTER', descripcion: 'AUSTER MAXFORCE 15W40 CK-4 1L',              categoria: 'lubricante', unidad: 'litro',      precio_costo: 3385,  precio_b2b_base: 4600,  precio_flota: 4300, precio_construccion: 4300, stock_actual: 1813, stock_minimo: 150 },
  { codigo: '7000053', marca: 'AUSTER', descripcion: 'AUSTER MAXFORCE 15W40 CK-4 20L (bidón)',     categoria: 'lubricante', unidad: 'bidón 20L',  precio_costo: 55422, precio_b2b_base: 74000, precio_flota: 70000, precio_construccion: 70000, stock_actual: 50, stock_minimo: 10 },
  { codigo: '7000012', marca: 'AUSTER', descripcion: 'AUSTER MAXFORCE 10W40 CK-4 20L (bidón)',     categoria: 'lubricante', unidad: 'bidón 20L',  precio_costo: 36546, precio_b2b_base: 49000, precio_flota: 46000, precio_construccion: 46000, stock_actual: 1560, stock_minimo: 100 },
  { codigo: '7000055', marca: 'AUSTER', descripcion: 'AUSTER HYDRO ISO 46 20LT (aceite hidráulico)', categoria: 'lubricante', unidad: 'bidón 20L', precio_costo: 37638, precio_b2b_base: 50000, precio_construccion: 47000, precio_flota: 47000, stock_actual: 81, stock_minimo: 15 },
  { codigo: '7000003', marca: 'AUSTER', descripcion: 'AUSTER MAXTECH PRO FE 5W30 ACEA C3 DPF 1L', categoria: 'lubricante', unidad: 'litro',      precio_costo: 3143,  precio_b2b_base: 4300,  precio_taller: 4300, precio_concesionario: 4100, stock_actual: 2567, stock_minimo: 200 },
  { codigo: '7000046', marca: 'AUSTER', descripcion: 'AUSTER MAXFORCE 15W40 CK-4 6L',              categoria: 'lubricante', unidad: 'envase 6L', precio_costo: 18330, precio_b2b_base: 24500, precio_flota: 23000, precio_construccion: 23000, stock_actual: 832, stock_minimo: 50 },

  // ── Neumáticos KUMHO ────────────────────────────────────────
  { codigo: '244313', marca: 'KUMHO', descripcion: '215/60 R16 KC53 103T 6PR (camioneta/SUV)', categoria: 'neumatico', unidad: 'unidad', precio_costo: 77035,  precio_b2b_base: 100000, precio_taller: 100000, precio_concesionario: 96000, stock_actual: 50, stock_minimo: 8 },
  { codigo: '244325', marca: 'KUMHO', descripcion: '265/70 R18 KL21 114T (4x4 AT)',            categoria: 'neumatico', unidad: 'unidad', precio_costo: 87101,  precio_b2b_base: 116000, precio_taller: 116000, precio_concesionario: 110000, stock_actual: 44, stock_minimo: 8 },
  { codigo: '244340', marca: 'KUMHO', descripcion: '205/65 R15 KC53 104S (sedan/taxi)',         categoria: 'neumatico', unidad: 'unidad', precio_costo: 73246,  precio_b2b_base: 97000,  precio_taller: 97000, stock_actual: 50, stock_minimo: 8 },
  { codigo: '244374', marca: 'KUMHO', descripcion: '275/60 R20 AT51 102T (pickup/doble cabina)', categoria: 'neumatico', unidad: 'unidad', precio_costo: 157951, precio_b2b_base: 210000, precio_taller: 210000, precio_flota: 200000, precio_construccion: 200000, stock_actual: 145, stock_minimo: 10 },
  { codigo: '244370', marca: 'KUMHO', descripcion: '215/55 R18 KL33 93V (SUV urbano)',          categoria: 'neumatico', unidad: 'unidad', precio_costo: 100116, precio_b2b_base: 133000, precio_taller: 133000, precio_concesionario: 127000, stock_actual: 48, stock_minimo: 8 },
  { codigo: '244009', marca: 'KUMHO', descripcion: '285/50 R20 HP71 116V KR (camioneta premium)', categoria: 'neumatico', unidad: 'unidad', precio_costo: 159383, precio_b2b_base: 212000, precio_taller: 212000, precio_concesionario: 202000, stock_actual: 59, stock_minimo: 4 },
  { codigo: '244726', marca: 'KUMHO', descripcion: '275/65 R18 HT51 123/120R 10PR (camioneta carga)', categoria: 'neumatico', unidad: 'unidad', precio_costo: 139611, precio_b2b_base: 186000, precio_flota: 176000, precio_construccion: 176000, stock_actual: 54, stock_minimo: 6 },
  { codigo: '244635', marca: 'KUMHO', descripcion: '245/75 R16 AT52 111S 10PR (4x4 AT/MT)',    categoria: 'neumatico', unidad: 'unidad', precio_costo: 124949, precio_b2b_base: 166000, precio_taller: 166000, precio_flota: 157000, precio_construccion: 157000, stock_actual: 70, stock_minimo: 8 },

  // ── Neumáticos DOUBLE STAR ──────────────────────────────────
  { codigo: '210016', marca: 'DOUBLE STAR', descripcion: '185/65 R15 DH05 88H (auto/taxi — alta rotación)', categoria: 'neumatico', unidad: 'unidad', precio_costo: 26089,  precio_b2b_base: 35000,  precio_taller: 35000, stock_actual: 192, stock_minimo: 20 },
  { codigo: '210051', marca: 'DOUBLE STAR', descripcion: '205/60 R16 DH05 92H (sedan/station)',              categoria: 'neumatico', unidad: 'unidad', precio_costo: 32553,  precio_b2b_base: 43000,  precio_taller: 43000, stock_actual: 218, stock_minimo: 15 },
  { codigo: '210097', marca: 'DOUBLE STAR', descripcion: '11 R22.5 DSR668 148/145J 16PR (camión)',           categoria: 'neumatico', unidad: 'unidad', precio_costo: 191440, precio_b2b_base: 255000, precio_flota: 242000, precio_construccion: 242000, stock_actual: 253, stock_minimo: 10 },
  { codigo: '210033', marca: 'DOUBLE STAR', descripcion: '11 R22.5 DSR168 148/145L 16PR (camión pesado)',    categoria: 'neumatico', unidad: 'unidad', precio_costo: 172646, precio_b2b_base: 230000, precio_flota: 218000, precio_construccion: 218000, stock_actual: 205, stock_minimo: 10 },
  { codigo: '210034', marca: 'DOUBLE STAR', descripcion: '295/80 R22.5 DSR668 152/149J 18PR (tracción)',     categoria: 'neumatico', unidad: 'unidad', precio_costo: 183597, precio_b2b_base: 245000, precio_flota: 232000, precio_construccion: 232000, stock_actual: 140, stock_minimo: 8 },
  { codigo: '210026', marca: 'DOUBLE STAR', descripcion: '245/75 R16 W01 114/111R 8PR (camioneta carga)',   categoria: 'neumatico', unidad: 'unidad', precio_costo: 69607,  precio_b2b_base: 93000,  precio_taller: 93000, precio_flota: 88000, precio_construccion: 88000, stock_actual: 79, stock_minimo: 8 },
  { codigo: '210108', marca: 'DOUBLE STAR', descripcion: '185/60 R15 DH05 84H (económico, alta rotación)',  categoria: 'neumatico', unidad: 'unidad', precio_costo: 29387,  precio_b2b_base: 39000,  precio_taller: 39000, stock_actual: 160, stock_minimo: 20 },
]

const CLIENTES = [
  { id: 'c001', razon_social: 'Taller Hermanos Díaz', rut: '76.543.210-1', segmento: 'taller', etapa_pipeline: 'cliente', contacto_nombre: 'Carlos Díaz', contacto_cargo: 'Jefe de taller', telefono: '+56 9 8765 4321', whatsapp: '+56 9 8765 4321', email: 'taller.diaz@gmail.com', direccion: 'Av. Matta 1234', comuna: 'Santiago Centro', credito_activo: true, dias_credito: 30, limite_credito: 2000000, saldo_pendiente: 487000, created_at: '2026-01-15T10:00:00Z' },
  { id: 'c002', razon_social: 'Transportes Norte S.A.', rut: '96.100.200-K', segmento: 'flota', etapa_pipeline: 'cliente', contacto_nombre: 'Rodrigo Muñoz', contacto_cargo: 'Jefe de mantención', telefono: '+56 2 2345 6789', whatsapp: '+56 9 7654 3210', email: 'mantención@transnorte.cl', direccion: 'Av. Concón 567', comuna: 'Quilicura', credito_activo: true, dias_credito: 30, limite_credito: 10000000, saldo_pendiente: 1240000, created_at: '2026-01-20T08:00:00Z' },
  { id: 'c003', razon_social: 'Automotora San Antonio', rut: '77.888.999-2', segmento: 'concesionario', etapa_pipeline: 'cotizado', contacto_nombre: 'Marcela Torres', contacto_cargo: 'Gerente de compras', telefono: '+56 2 2890 1234', whatsapp: '+56 9 6543 2109', email: 'compras@automotora-sa.cl', direccion: 'Av. Las Condes 3400', comuna: 'Las Condes', credito_activo: false, dias_credito: 0, limite_credito: 0, saldo_pendiente: 0, created_at: '2026-02-01T14:00:00Z' },
  { id: 'c004', razon_social: 'Constructora Mediterráneo', rut: '78.200.300-5', segmento: 'construccion', etapa_pipeline: 'negociando', contacto_nombre: 'Felipe Soto', contacto_cargo: 'Subgerente operaciones', telefono: '+56 9 5432 1098', whatsapp: '+56 9 5432 1098', email: 'fsoto@mediterráneo.cl', direccion: 'Ruta 68 km 12', comuna: 'Pudahuel', credito_activo: false, dias_credito: 0, limite_credito: 0, saldo_pendiente: 0, created_at: '2026-02-10T09:00:00Z' },
  { id: 'c005', razon_social: 'Taller Mecánico AutoExpress', rut: '15.432.100-9', segmento: 'taller', etapa_pipeline: 'prospecto', contacto_nombre: 'Jorge Ramírez', contacto_cargo: 'Dueño', telefono: '+56 9 4321 0987', whatsapp: '+56 9 4321 0987', email: 'autoexpress@gmail.com', direccion: 'Gran Avenida 8900', comuna: 'Maipú', credito_activo: false, dias_credito: 0, limite_credito: 0, saldo_pendiente: 0, created_at: '2026-03-05T11:00:00Z' },
  { id: 'c006', razon_social: 'MetroMov Buses S.A.', rut: '96.500.600-3', segmento: 'flota', etapa_pipeline: 'cliente', contacto_nombre: 'Andrés Vega', contacto_cargo: 'Jefe de flota', telefono: '+56 2 2678 9012', whatsapp: '+56 9 3210 9876', email: 'avega@metromov.cl', direccion: 'Av. Central 456', comuna: 'Cerrillos', credito_activo: true, dias_credito: 30, limite_credito: 15000000, saldo_pendiente: 2100000, created_at: '2026-01-08T08:00:00Z' },
  { id: 'c007', razon_social: 'AutoCenter Bellavista', rut: '78.700.800-7', segmento: 'concesionario', etapa_pipeline: 'contactado', contacto_nombre: 'Valentina Rojas', contacto_cargo: 'Encargada de compras', telefono: '+56 9 2109 8765', whatsapp: '+56 9 2109 8765', email: 'compras@autocenterb.cl', direccion: 'Pío Nono 340', comuna: 'Providencia', credito_activo: false, dias_credito: 0, limite_credito: 0, saldo_pendiente: 0, created_at: '2026-03-15T10:00:00Z' },
  { id: 'c008', razon_social: 'Lubricentro Express', rut: '14.321.000-8', segmento: 'taller', etapa_pipeline: 'contactado', contacto_nombre: 'Patricia Núñez', contacto_cargo: 'Administradora', telefono: '+56 9 1098 7654', whatsapp: '+56 9 1098 7654', email: 'lubriexpress@hotmail.com', direccion: 'Florida 2345', comuna: 'La Florida', credito_activo: false, dias_credito: 0, limite_credito: 0, saldo_pendiente: 0, created_at: '2026-03-20T15:00:00Z' },
]

const COTIZACIONES = [
  {
    id: 'cot001', numero: 'COT-2026-001', cliente_id: 'c001', cliente: 'Taller Hermanos Díaz', estado: 'aprobada',
    neto: 409244, iva: 77757, total: 487001, condicion_pago: 'Crédito 30 días', canal_origen: 'whatsapp',
    created_at: '2026-06-01T10:00:00Z', aprobada_at: '2026-06-02T14:00:00Z',
    items: [
      { codigo: '352420', descripcion: 'BATERIA YOKO KR 55AMP 55559', cantidad: 4, precio_unitario: 64000, subtotal: 256000 },
      { codigo: '7000049', descripcion: 'AUSTER MAXTECH PRO RX 5W30 4LT', cantidad: 10, precio_unitario: 15500, subtotal: 155000 },
    ],
  },
  {
    id: 'cot002', numero: 'COT-2026-002', cliente_id: 'c002', cliente: 'Transportes Norte S.A.', estado: 'enviada',
    neto: 1042017, iva: 197983, total: 1240000, condicion_pago: 'Crédito 30 días', canal_origen: 'presencial',
    created_at: '2026-06-10T09:00:00Z',
    items: [
      { codigo: '210097', descripcion: '11 R22.5 DSR668 16PR (camión)', cantidad: 4, precio_unitario: 242000, subtotal: 968000 },
      { codigo: '7000053', descripcion: 'AUSTER MAXFORCE 15W40 20L', cantidad: 1, precio_unitario: 70000, subtotal: 70000 },
    ],
  },
  {
    id: 'cot003', numero: 'COT-2026-003', cliente_id: 'c003', cliente: 'Automotora San Antonio', estado: 'borrador',
    neto: 319328, iva: 60672, total: 380000, condicion_pago: 'Contado', canal_origen: 'web',
    created_at: '2026-06-15T16:00:00Z',
    items: [
      { codigo: '244374', descripcion: '275/60 R20 AT51 (pickup)', cantidad: 1, precio_unitario: 210000, subtotal: 210000 },
      { codigo: '7000003', descripcion: 'AUSTER MAXTECH FE 5W30 1L', cantidad: 20, precio_unitario: 4100, subtotal: 82000 },
    ],
  },
  {
    id: 'cot004', numero: 'COT-2026-004', cliente_id: 'c006', cliente: 'MetroMov Buses S.A.', estado: 'aprobada',
    neto: 1764706, iva: 335294, total: 2100000, condicion_pago: 'Crédito 30 días', canal_origen: 'whatsapp',
    created_at: '2026-05-20T08:00:00Z', aprobada_at: '2026-05-22T10:00:00Z',
    items: [
      { codigo: '210033', descripcion: '11 R22.5 DSR168 16PR (pesado)', cantidad: 8, precio_unitario: 218000, subtotal: 1744000 },
    ],
  },
  {
    id: 'cot005', numero: 'COT-2026-005', cliente_id: 'c004', cliente: 'Constructora Mediterráneo', estado: 'enviada',
    neto: 630252, iva: 119748, total: 750000, condicion_pago: 'Contado', canal_origen: 'presencial',
    created_at: '2026-06-18T11:00:00Z',
    items: [
      { codigo: '7000012', descripcion: 'AUSTER MAXFORCE 10W40 20L', cantidad: 10, precio_unitario: 46000, subtotal: 460000 },
      { codigo: '352440', descripcion: 'BATERIA YOKO 100AMP N100L', cantidad: 1, precio_unitario: 100000, subtotal: 100000 },
    ],
  },
]

const PEDIDOS = [
  {
    id: 'ped001', numero: 'PED-2026-001', cliente_id: 'c001', cliente: 'Taller Hermanos Díaz', cotizacion_id: 'cot001',
    estado: 'entregado', neto: 409244, iva: 77757, total: 487001, condicion_pago: 'Crédito 30 días',
    fecha_entrega_programada: '2026-06-03', fecha_entrega_real: '2026-06-03', guia_despacho: 'GD-001',
    created_at: '2026-06-02T14:30:00Z',
  },
  {
    id: 'ped002', numero: 'PED-2026-002', cliente_id: 'c002', cliente: 'Transportes Norte S.A.', cotizacion_id: 'cot002',
    estado: 'en_preparacion', neto: 1042017, iva: 197983, total: 1240000, condicion_pago: 'Crédito 30 días',
    fecha_entrega_programada: '2026-06-27', guia_despacho: null,
    created_at: '2026-06-10T14:00:00Z',
  },
  {
    id: 'ped003', numero: 'PED-2026-003', cliente_id: 'c006', cliente: 'MetroMov Buses S.A.', cotizacion_id: 'cot004',
    estado: 'despachado', neto: 1764706, iva: 335294, total: 2100000, condicion_pago: 'Crédito 30 días',
    fecha_entrega_programada: '2026-06-25', guia_despacho: 'GD-002',
    created_at: '2026-05-22T10:30:00Z',
  },
]

const CONVERSACIONES = [
  {
    id: 'wa001', telefono: '+56987654321', nombre: 'Carlos Díaz (Taller Díaz)',
    ultimo_mensaje: 'CONFIRMAR', ultimo_at: '2026-06-27T09:15:00Z', sin_leer: 0,
    mensajes: [
      { id: 'm1', direccion: 'entrante', contenido: 'hola', created_at: '2026-06-27T09:00:00Z' },
      { id: 'm2', direccion: 'saliente', contenido: '🔩 RMG Auto Parts\n¡Hola! Somos distribuidores mayoristas de repuestos en Santiago RM.\n\n¿Qué tipo de cliente eres?', created_at: '2026-06-27T09:00:05Z' },
      { id: 'm3', direccion: 'entrante', contenido: 'Taller mecánico', created_at: '2026-06-27T09:01:00Z' },
      { id: 'm4', direccion: 'saliente', contenido: '📦 Perfecto. ¿Qué línea necesitas cotizar?\n\n• Baterías\n• Lubricantes\n• Neumáticos', created_at: '2026-06-27T09:01:05Z' },
      { id: 'm5', direccion: 'entrante', contenido: 'Baterías', created_at: '2026-06-27T09:02:00Z' },
      { id: 'm6', direccion: 'saliente', contenido: '📋 COTIZACIÓN RMG AUTO PARTS\n🔢 N° COT-2026-001\n\n• BATERIA YOKO 55AMP (x4) = $256.000\n• AUSTER 5W30 4LT (x10) = $155.000\n\nNeto: $411.000 · IVA: $78.090 · TOTAL: $489.090\n\n✅ Entrega 4–24 hrs RM\n\nResponde CONFIRMAR para generar pedido', created_at: '2026-06-27T09:05:00Z' },
      { id: 'm7', direccion: 'entrante', contenido: 'CONFIRMAR', created_at: '2026-06-27T09:15:00Z' },
    ],
  },
  {
    id: 'wa002', telefono: '+56976543210', nombre: 'Rodrigo Muñoz (Trans Norte)',
    ultimo_mensaje: 'Necesito cotizar neumáticos de camión', ultimo_at: '2026-06-27T08:30:00Z', sin_leer: 1,
    mensajes: [
      { id: 'm8', direccion: 'entrante', contenido: 'Buenos días, Rodrigo de Transportes Norte', created_at: '2026-06-27T08:25:00Z' },
      { id: 'm9', direccion: 'saliente', contenido: '¡Buenos días Rodrigo! ¿En qué te podemos ayudar hoy?', created_at: '2026-06-27T08:26:00Z' },
      { id: 'm10', direccion: 'entrante', contenido: 'Necesito cotizar neumáticos de camión', created_at: '2026-06-27T08:30:00Z' },
    ],
  },
  {
    id: 'wa003', telefono: '+56954321098', nombre: 'Felipe Soto (Constructora Med.)',
    ultimo_mensaje: '¿Tienen el 10W40 en bidón 20L?', ultimo_at: '2026-06-26T17:45:00Z', sin_leer: 1,
    mensajes: [
      { id: 'm11', direccion: 'entrante', contenido: '¿Tienen el 10W40 en bidón 20L?', created_at: '2026-06-26T17:45:00Z' },
    ],
  },
]

const ACTIVIDADES = {
  c001: [
    { id: 'a1', tipo: 'cotizacion', descripcion: 'Cotización COT-2026-001 aprobada por $487.001', resultado: 'positivo', created_at: '2026-06-02T14:00:00Z' },
    { id: 'a2', tipo: 'whatsapp', descripcion: 'Pedido confirmado por WhatsApp', resultado: 'positivo', created_at: '2026-06-02T14:30:00Z' },
    { id: 'a3', tipo: 'visita', descripcion: 'Visita a taller — negociación de volumen mensual', resultado: 'en seguimiento', proxima_accion: 'Enviar propuesta mensual', fecha_proxima: '2026-07-01', created_at: '2026-05-15T10:00:00Z' },
  ],
  c002: [
    { id: 'a4', tipo: 'llamada', descripcion: 'Llamada con jefe de mantención — cotización en proceso', resultado: 'enviada', created_at: '2026-06-10T09:30:00Z' },
  ],
}

const PROVEEDORES = [
  { id: 'prov001', razon_social: 'Distribuidora YOKO Chile S.A.', rut: '96.200.100-8', contacto: 'Marcos Lee', cargo: 'Ejecutivo de ventas', telefono: '+56 2 2345 1111', email: 'mlee@yokochile.cl', categorias: ['bateria'], plazo_pago: 30, condicion: 'Crédito 30 días', banco: 'Banco de Chile', cuenta: '000-1234-56', activo: true, created_at: '2026-01-10T08:00:00Z' },
  { id: 'prov002', razon_social: 'AUSTER Chile Lubricantes S.A.', rut: '96.300.200-3', contacto: 'Sofía Morales', cargo: 'Gerente comercial', telefono: '+56 2 2678 2222', email: 'smorales@auster.cl', categorias: ['lubricante'], plazo_pago: 45, condicion: 'Crédito 45 días', banco: 'Santander', cuenta: '111-2345-67', activo: true, created_at: '2026-01-12T08:00:00Z' },
  { id: 'prov003', razon_social: 'KUMHO Tire Chile S.A.', rut: '96.400.300-9', contacto: 'James Kim', cargo: 'Country Manager', telefono: '+56 2 2890 3333', email: 'jkim@kumho.cl', categorias: ['neumatico'], plazo_pago: 30, condicion: 'Crédito 30 días', banco: 'BCI', cuenta: '222-3456-78', activo: true, created_at: '2026-01-15T08:00:00Z' },
  { id: 'prov004', razon_social: 'Double Star Trading Chile Ltda.', rut: '77.500.400-2', contacto: 'Pedro Castillo', cargo: 'Representante', telefono: '+56 9 8765 4444', email: 'pcastillo@dstar.cl', categorias: ['neumatico'], plazo_pago: 60, condicion: 'Crédito 60 días', banco: 'Banco Estado', cuenta: '333-4567-89', activo: true, created_at: '2026-01-20T08:00:00Z' },
]

const ORDENES_COMPRA = [
  {
    id: 'oc001', numero: 'OC-2026-001', proveedor_id: 'prov001', proveedor: 'Distribuidora YOKO Chile S.A.',
    estado: 'recibida', fecha_emision: '2026-05-15', fecha_entrega: '2026-05-22',
    neto: 3943380, iva: 749242, total: 4692622,
    items: [
      { codigo: '352420', descripcion: 'BATERIA YOKO KR 55AMP 55559', cantidad: 50, precio_unitario: 48450, subtotal: 2422500 },
      { codigo: '352430', descripcion: 'BATERIA YOKO KR 70AMP N70', cantidad: 20, precio_unitario: 61769, subtotal: 1235380 },
      { codigo: '352440', descripcion: 'BATERIA YOKO KR 100AMP N100L', cantidad: 5, precio_unitario: 79501, subtotal: 397505 },
    ],
    pagada: true, factura_proveedor: 'FP-2026-12345',
  },
  {
    id: 'oc002', numero: 'OC-2026-002', proveedor_id: 'prov002', proveedor: 'AUSTER Chile Lubricantes S.A.',
    estado: 'recibida', fecha_emision: '2026-05-20', fecha_entrega: '2026-05-27',
    neto: 4910100, iva: 932919, total: 5843019,
    items: [
      { codigo: '7000049', descripcion: 'AUSTER MAXTECH PRO RX 5W30 4LT', cantidad: 300, precio_unitario: 11454, subtotal: 3436200 },
      { codigo: '7000053', descripcion: 'AUSTER MAXFORCE 15W40 20L', cantidad: 20, precio_unitario: 55422, subtotal: 1108440 },
      { codigo: '7000012', descripcion: 'AUSTER MAXFORCE 10W40 20L', cantidad: 10, precio_unitario: 36546, subtotal: 365460 },
    ],
    pagada: true, factura_proveedor: 'FP-2026-67890',
  },
  {
    id: 'oc003', numero: 'OC-2026-003', proveedor_id: 'prov003', proveedor: 'KUMHO Tire Chile S.A.',
    estado: 'enviada', fecha_emision: '2026-06-20', fecha_entrega: '2026-07-05',
    neto: 3684147, iva: 699988, total: 4384135,
    items: [
      { codigo: '244374', descripcion: '275/60 R20 AT51 102T (pickup)', cantidad: 12, precio_unitario: 157951, subtotal: 1895412 },
      { codigo: '244635', descripcion: '245/75 R16 AT52 111S (4x4)', cantidad: 10, precio_unitario: 124949, subtotal: 1249490 },
      { codigo: '244313', descripcion: '215/60 R16 KC53 103T', cantidad: 7, precio_unitario: 77035, subtotal: 539245 },
    ],
    pagada: false, factura_proveedor: null,
  },
  {
    id: 'oc004', numero: 'OC-2026-004', proveedor_id: 'prov001', proveedor: 'Distribuidora YOKO Chile S.A.',
    estado: 'borrador', fecha_emision: '2026-06-27', fecha_entrega: null,
    neto: 1928156, iva: 366350, total: 2294506,
    items: [
      { codigo: '352420', descripcion: 'BATERIA YOKO KR 55AMP 55559', cantidad: 30, precio_unitario: 48450, subtotal: 1453500 },
      { codigo: '352432', descripcion: 'BATERIA YOKO KR 75AMP N70Z', cantidad: 7, precio_unitario: 67808, subtotal: 474656 },
    ],
    pagada: false, factura_proveedor: null,
  },
]

const FACTURAS_CXC = [
  { id: 'fac001', numero: 'F-2011', pedido_id: null, cliente_id: 'c008', cliente: 'Lubricentro Express', segmento: 'taller', monto: 280000, fecha_emision: '2026-03-21', fecha_vencimiento: '2026-04-21', estado: 'vencida', notas: '' },
  { id: 'fac002', numero: 'F-2019', pedido_id: null, cliente_id: 'c007', cliente: 'AutoCenter Bellavista', segmento: 'concesionario', monto: 825000, fecha_emision: '2026-04-20', fecha_vencimiento: '2026-05-20', estado: 'critica', notas: 'Contactar gerente de compras' },
  { id: 'fac003', numero: 'F-2024', pedido_id: 'ped003', cliente_id: 'c006', cliente: 'MetroMov Buses S.A.', segmento: 'flota', monto: 2100000, fecha_emision: '2026-06-05', fecha_vencimiento: '2026-07-05', estado: 'al_dia', notas: '' },
  { id: 'fac004', numero: 'F-2028', pedido_id: 'ped001', cliente_id: 'c001', cliente: 'Taller Hermanos Díaz', segmento: 'taller', monto: 487001, fecha_emision: '2026-05-15', fecha_vencimiento: '2026-06-15', estado: 'vencida', notas: '' },
  { id: 'fac005', numero: 'F-2031', pedido_id: 'ped002', cliente_id: 'c002', cliente: 'Transportes Norte S.A.', segmento: 'flota', monto: 1240000, fecha_emision: '2026-06-02', fecha_vencimiento: '2026-07-02', estado: 'al_dia', notas: '' },
  { id: 'fac006', numero: 'F-2033', pedido_id: null, cliente_id: 'c004', cliente: 'Constructora Mediterráneo', segmento: 'construccion', monto: 340000, fecha_emision: '2026-05-29', fecha_vencimiento: '2026-06-29', estado: 'al_dia', notas: '' },
]

const FACTURAS_CXP = [
  { id: 'cxp001', numero: 'FP-2026-12345', proveedor_id: 'prov001', proveedor: 'Distribuidora YOKO Chile S.A.', oc_id: 'oc001', oc_numero: 'OC-2026-001', monto: 4692622, fecha_emision: '2026-05-22', fecha_vencimiento: '2026-06-22', estado: 'pagada', fecha_pago: '2026-06-18' },
  { id: 'cxp002', numero: 'FP-2026-67890', proveedor_id: 'prov002', proveedor: 'AUSTER Chile Lubricantes S.A.', oc_id: 'oc002', oc_numero: 'OC-2026-002', monto: 5843019, fecha_emision: '2026-05-27', fecha_vencimiento: '2026-07-11', estado: 'pagada', fecha_pago: '2026-07-10' },
  { id: 'cxp003', numero: 'FP-2026-22222', proveedor_id: 'prov003', proveedor: 'KUMHO Tire Chile S.A.', oc_id: 'oc003', oc_numero: 'OC-2026-003', monto: 4384135, fecha_emision: '2026-07-05', fecha_vencimiento: '2026-08-04', estado: 'pendiente', fecha_pago: null },
]

const MOVIMIENTOS_STOCK = [
  { id: 'mov001', producto_id: '352420', codigo: '352420', descripcion: 'BATERIA YOKO KR 55AMP 55559', tipo: 'entrada', cantidad: 50, stock_anterior: 358, stock_nuevo: 408, motivo: 'Recepción OC-2026-001', referencia: 'oc001', created_at: '2026-05-22T10:00:00Z' },
  { id: 'mov002', producto_id: '352430', codigo: '352430', descripcion: 'BATERIA YOKO KR 70AMP N70', tipo: 'entrada', cantidad: 20, stock_anterior: 22, stock_nuevo: 42, motivo: 'Recepción OC-2026-001', referencia: 'oc001', created_at: '2026-05-22T10:05:00Z' },
  { id: 'mov003', producto_id: '7000049', codigo: '7000049', descripcion: 'AUSTER MAXTECH PRO RX 5W30 4LT', tipo: 'entrada', cantidad: 300, stock_anterior: 1957, stock_nuevo: 2257, motivo: 'Recepción OC-2026-002', referencia: 'oc002', created_at: '2026-05-27T09:00:00Z' },
  { id: 'mov004', producto_id: '352420', codigo: '352420', descripcion: 'BATERIA YOKO KR 55AMP 55559', tipo: 'salida', cantidad: 4, stock_anterior: 408, stock_nuevo: 404, motivo: 'Despacho PED-2026-001', referencia: 'ped001', created_at: '2026-06-03T08:00:00Z' },
  { id: 'mov005', producto_id: '7000049', codigo: '7000049', descripcion: 'AUSTER MAXTECH PRO RX 5W30 4LT', tipo: 'salida', cantidad: 10, stock_anterior: 2257, stock_nuevo: 2247, motivo: 'Despacho PED-2026-001', referencia: 'ped001', created_at: '2026-06-03T08:05:00Z' },
  { id: 'mov006', producto_id: '210097', codigo: '210097', descripcion: '11 R22.5 DSR668 16PR (camión)', tipo: 'salida', cantidad: 4, stock_anterior: 257, stock_nuevo: 253, motivo: 'Despacho PED-2026-003', referencia: 'ped003', created_at: '2026-06-25T07:00:00Z' },
  { id: 'mov007', producto_id: '352432', codigo: '352432', descripcion: 'BATERIA YOKO KR 75AMP N70Z', tipo: 'ajuste', cantidad: -2, stock_anterior: 60, stock_nuevo: 58, motivo: 'Ajuste inventario — 2 unidades dañadas', referencia: null, created_at: '2026-06-10T14:00:00Z' },
]

module.exports = { PRODUCTOS, CLIENTES, COTIZACIONES, PEDIDOS, CONVERSACIONES, ACTIVIDADES, PROVEEDORES, ORDENES_COMPRA, FACTURAS_CXC, FACTURAS_CXP, MOVIMIENTOS_STOCK }
