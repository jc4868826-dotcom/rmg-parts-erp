const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')
const { v4: uuidv4 } = require('uuid')
const bcrypt = require('bcryptjs')

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../database/rmg_parts.db')

const dbDir = path.dirname(DB_PATH)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nombre TEXT NOT NULL,
      telefono TEXT,
      rol TEXT DEFAULT 'ventas' CHECK(rol IN ('admin','ventas','bodega','cliente')),
      activo INTEGER DEFAULT 1,
      ultimo_acceso TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clientes (
      id TEXT PRIMARY KEY,
      razon_social TEXT NOT NULL,
      rut TEXT UNIQUE,
      segmento TEXT NOT NULL CHECK(segmento IN ('taller','flota','concesionario','construccion')),
      etapa_pipeline TEXT DEFAULT 'prospecto' CHECK(etapa_pipeline IN ('prospecto','contactado','cotizado','negociando','cliente')),
      contacto_nombre TEXT,
      contacto_cargo TEXT,
      telefono TEXT,
      whatsapp TEXT,
      email TEXT,
      direccion TEXT,
      comuna TEXT,
      giro TEXT,
      credito_activo INTEGER DEFAULT 0,
      dias_credito INTEGER DEFAULT 0,
      limite_credito REAL DEFAULT 0,
      saldo_pendiente REAL DEFAULT 0,
      vendedor_id TEXT REFERENCES usuarios(id),
      notas TEXT,
      activo INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS productos (
      id TEXT PRIMARY KEY,
      codigo TEXT UNIQUE NOT NULL,
      marca TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      categoria TEXT NOT NULL CHECK(categoria IN ('bateria','lubricante','neumatico','grasa','filtro','refrigerante','otro')),
      unidad TEXT DEFAULT 'unidad',
      precio_costo REAL NOT NULL,
      precio_b2b_base REAL NOT NULL,
      precio_taller REAL,
      precio_flota REAL,
      precio_concesionario REAL,
      precio_construccion REAL,
      margen_objetivo REAL DEFAULT 30.00,
      stock_actual INTEGER DEFAULT 0,
      stock_minimo INTEGER DEFAULT 5,
      activo INTEGER DEFAULT 1,
      notas TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cotizaciones (
      id TEXT PRIMARY KEY,
      numero TEXT UNIQUE NOT NULL,
      cliente_id TEXT REFERENCES clientes(id),
      cliente TEXT,
      estado TEXT DEFAULT 'borrador' CHECK(estado IN ('borrador','enviada','aprobada','rechazada','vencida')),
      vendedor_id TEXT REFERENCES usuarios(id),
      neto REAL DEFAULT 0,
      iva REAL DEFAULT 0,
      total REAL DEFAULT 0,
      condicion_pago TEXT DEFAULT 'Contado',
      plazo_entrega TEXT DEFAULT '4-24 horas RM',
      validez_dias INTEGER DEFAULT 7,
      canal_origen TEXT,
      notas TEXT,
      pdf_url TEXT,
      enviada_at TEXT,
      aprobada_at TEXT,
      vence_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cotizacion_items (
      id TEXT PRIMARY KEY,
      cotizacion_id TEXT REFERENCES cotizaciones(id) ON DELETE CASCADE,
      codigo TEXT,
      descripcion TEXT,
      cantidad INTEGER NOT NULL,
      precio_unitario REAL NOT NULL,
      descuento_pct REAL DEFAULT 0,
      subtotal REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pedidos (
      id TEXT PRIMARY KEY,
      numero TEXT UNIQUE NOT NULL,
      cotizacion_id TEXT REFERENCES cotizaciones(id),
      cliente_id TEXT REFERENCES clientes(id),
      cliente TEXT,
      estado TEXT DEFAULT 'pendiente' CHECK(estado IN ('pendiente','confirmado','en_preparacion','despachado','entregado','anulado')),
      vendedor_id TEXT REFERENCES usuarios(id),
      neto REAL NOT NULL,
      iva REAL NOT NULL,
      total REAL NOT NULL,
      condicion_pago TEXT,
      direccion_entrega TEXT,
      fecha_entrega_programada TEXT,
      fecha_entrega_real TEXT,
      guia_despacho TEXT,
      factura_numero TEXT,
      notas TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS actividades_pipeline (
      id TEXT PRIMARY KEY,
      cliente_id TEXT REFERENCES clientes(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL,
      descripcion TEXT,
      resultado TEXT,
      proxima_accion TEXT,
      fecha_proxima TEXT,
      usuario_id TEXT REFERENCES usuarios(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS movimientos_stock (
      id TEXT PRIMARY KEY,
      producto_id TEXT,
      codigo TEXT NOT NULL,
      descripcion TEXT,
      tipo TEXT NOT NULL CHECK(tipo IN ('entrada','salida','ajuste')),
      cantidad INTEGER NOT NULL,
      stock_anterior INTEGER NOT NULL,
      stock_nuevo INTEGER NOT NULL,
      motivo TEXT,
      referencia TEXT,
      usuario_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversaciones_whatsapp (
      id TEXT PRIMARY KEY,
      telefono TEXT UNIQUE NOT NULL,
      nombre TEXT,
      ultimo_mensaje TEXT,
      ultimo_at TEXT,
      sin_leer INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mensajes_whatsapp (
      id TEXT PRIMARY KEY,
      wa_message_id TEXT UNIQUE,
      conversacion_id TEXT REFERENCES conversaciones_whatsapp(id),
      telefono TEXT NOT NULL,
      cliente_id TEXT,
      direccion TEXT NOT NULL CHECK(direccion IN ('entrante','saliente')),
      tipo TEXT DEFAULT 'text',
      contenido TEXT,
      estado TEXT DEFAULT 'enviado',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS proveedores (
      id TEXT PRIMARY KEY,
      razon_social TEXT NOT NULL,
      rut TEXT UNIQUE,
      contacto TEXT,
      cargo TEXT,
      telefono TEXT,
      email TEXT,
      categorias TEXT,
      plazo_pago INTEGER DEFAULT 30,
      condicion TEXT,
      banco TEXT,
      cuenta TEXT,
      activo INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ordenes_compra (
      id TEXT PRIMARY KEY,
      numero TEXT UNIQUE NOT NULL,
      proveedor_id TEXT REFERENCES proveedores(id),
      proveedor TEXT,
      estado TEXT DEFAULT 'borrador' CHECK(estado IN ('borrador','enviada','confirmada','recibida','anulada')),
      fecha_emision TEXT,
      fecha_entrega TEXT,
      neto REAL DEFAULT 0,
      iva REAL DEFAULT 0,
      total REAL DEFAULT 0,
      pagada INTEGER DEFAULT 0,
      factura_proveedor TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS oc_items (
      id TEXT PRIMARY KEY,
      oc_id TEXT REFERENCES ordenes_compra(id) ON DELETE CASCADE,
      codigo TEXT NOT NULL,
      descripcion TEXT,
      cantidad INTEGER NOT NULL,
      precio_unitario REAL NOT NULL,
      subtotal REAL
    );

    CREATE TABLE IF NOT EXISTS facturas_cxc (
      id TEXT PRIMARY KEY,
      numero TEXT UNIQUE NOT NULL,
      pedido_id TEXT,
      cliente_id TEXT REFERENCES clientes(id),
      cliente TEXT,
      segmento TEXT,
      monto REAL NOT NULL,
      fecha_emision TEXT,
      fecha_vencimiento TEXT,
      estado TEXT DEFAULT 'al_dia' CHECK(estado IN ('al_dia','vencida','critica','cobrada')),
      fecha_cobro TEXT,
      notas TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS facturas_cxp (
      id TEXT PRIMARY KEY,
      numero TEXT UNIQUE NOT NULL,
      proveedor_id TEXT REFERENCES proveedores(id),
      proveedor TEXT,
      oc_id TEXT REFERENCES ordenes_compra(id),
      oc_numero TEXT,
      monto REAL NOT NULL,
      fecha_emision TEXT,
      fecha_vencimiento TEXT,
      estado TEXT DEFAULT 'pendiente' CHECK(estado IN ('pendiente','pagada','vencida')),
      fecha_pago TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_clientes_segmento ON clientes(segmento);
    CREATE INDEX IF NOT EXISTS idx_clientes_etapa ON clientes(etapa_pipeline);
    CREATE INDEX IF NOT EXISTS idx_productos_codigo ON productos(codigo);
    CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria);
    CREATE INDEX IF NOT EXISTS idx_cotizaciones_cliente ON cotizaciones(cliente_id);
    CREATE INDEX IF NOT EXISTS idx_cotizaciones_estado ON cotizaciones(estado);
    CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON pedidos(cliente_id);
    CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado);
    CREATE INDEX IF NOT EXISTS idx_mensajes_telefono ON mensajes_whatsapp(telefono);
    CREATE INDEX IF NOT EXISTS idx_movimientos_codigo ON movimientos_stock(codigo);
  `)
}

function seedData() {
  const { n } = db.prepare('SELECT COUNT(*) as n FROM productos').get()
  if (n > 0) return

  const seed = db.transaction(() => {
    // ── Usuario admin ──────────────────────────────────────────
    db.prepare(`INSERT INTO usuarios (id,email,password_hash,nombre,telefono,rol) VALUES (?,?,?,?,?,?)`).run(
      'a1b2c3d4-0000-0000-0000-000000000001',
      'admin@rmgautoparts.cl',
      bcrypt.hashSync('rmg2026', 10),
      'Gerente RMG',
      '+56 9 1234 5678',
      'admin'
    )

    // ── Clientes ───────────────────────────────────────────────
    const insCliente = db.prepare(`INSERT INTO clientes
      (id,razon_social,rut,segmento,etapa_pipeline,contacto_nombre,contacto_cargo,
       telefono,whatsapp,email,direccion,comuna,credito_activo,dias_credito,
       limite_credito,saldo_pendiente,created_at) VALUES
      (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)

    const clientes = [
      ['c001','Taller Hermanos Díaz','76.543.210-1','taller','cliente','Carlos Díaz','Jefe de taller','+56 9 8765 4321','+56 9 8765 4321','taller.diaz@gmail.com','Av. Matta 1234','Santiago Centro',1,30,2000000,487000,'2026-01-15T10:00:00Z'],
      ['c002','Transportes Norte S.A.','96.100.200-K','flota','cliente','Rodrigo Muñoz','Jefe de mantención','+56 2 2345 6789','+56 9 7654 3210','mantención@transnorte.cl','Av. Concón 567','Quilicura',1,30,10000000,1240000,'2026-01-20T08:00:00Z'],
      ['c003','Automotora San Antonio','77.888.999-2','concesionario','cotizado','Marcela Torres','Gerente de compras','+56 2 2890 1234','+56 9 6543 2109','compras@automotora-sa.cl','Av. Las Condes 3400','Las Condes',0,0,0,0,'2026-02-01T14:00:00Z'],
      ['c004','Constructora Mediterráneo','78.200.300-5','construccion','negociando','Felipe Soto','Subgerente operaciones','+56 9 5432 1098','+56 9 5432 1098','fsoto@mediterráneo.cl','Ruta 68 km 12','Pudahuel',0,0,0,0,'2026-02-10T09:00:00Z'],
      ['c005','Taller Mecánico AutoExpress','15.432.100-9','taller','prospecto','Jorge Ramírez','Dueño','+56 9 4321 0987','+56 9 4321 0987','autoexpress@gmail.com','Gran Avenida 8900','Maipú',0,0,0,0,'2026-03-05T11:00:00Z'],
      ['c006','MetroMov Buses S.A.','96.500.600-3','flota','cliente','Andrés Vega','Jefe de flota','+56 2 2678 9012','+56 9 3210 9876','avega@metromov.cl','Av. Central 456','Cerrillos',1,30,15000000,2100000,'2026-01-08T08:00:00Z'],
      ['c007','AutoCenter Bellavista','78.700.800-7','concesionario','contactado','Valentina Rojas','Encargada de compras','+56 9 2109 8765','+56 9 2109 8765','compras@autocenterb.cl','Pío Nono 340','Providencia',0,0,0,0,'2026-03-15T10:00:00Z'],
      ['c008','Lubricentro Express','14.321.000-8','taller','contactado','Patricia Núñez','Administradora','+56 9 1098 7654','+56 9 1098 7654','lubriexpress@hotmail.com','Florida 2345','La Florida',0,0,0,0,'2026-03-20T15:00:00Z'],
    ]
    for (const c of clientes) insCliente.run(...c)

    // ── Productos ──────────────────────────────────────────────
    const insProducto = db.prepare(`INSERT INTO productos
      (id,codigo,marca,descripcion,categoria,unidad,precio_costo,precio_b2b_base,
       precio_taller,precio_flota,precio_concesionario,precio_construccion,stock_actual,stock_minimo) VALUES
      (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)

    const productos = [
      [uuidv4(),'352410','YOKO G&B','BATERIA YOKO KR 35AMP NS40ZL','bateria','unidad',31311,42000,42000,40000,null,null,370,30],
      [uuidv4(),'352420','YOKO G&B','BATERIA YOKO KR 55AMP 55559','bateria','unidad',48450,64000,64000,61000,null,null,408,40],
      [uuidv4(),'352421','YOKO G&B','BATERIA YOKO KR 44AMP 54459','bateria','unidad',44989,60000,60000,57000,null,null,270,20],
      [uuidv4(),'351416','YOKO G&B','BATERIA YOKO KR 40AMP N40L','bateria','unidad',35579,48000,48000,45000,null,null,148,20],
      [uuidv4(),'352430','YOKO G&B','BATERIA YOKO KR 70AMP N70','bateria','unidad',61769,82000,82000,78000,null,null,42,15],
      [uuidv4(),'352432','YOKO G&B','BATERIA YOKO KR 75AMP N70Z','bateria','unidad',67808,90000,90000,86000,null,null,58,15],
      [uuidv4(),'352440','YOKO G&B','BATERIA YOKO KR 100AMP N100L','bateria','unidad',79501,106000,106000,100000,null,100000,39,10],
      [uuidv4(),'352445','YOKO G&B','BATERIA YOKO KR 120AMP N120','bateria','unidad',100573,134000,null,127000,null,127000,61,10],
      [uuidv4(),'352450','YOKO G&B','BATERIA YOKO KR 150AMP N150','bateria','unidad',129164,172000,null,163000,null,163000,65,8],
      [uuidv4(),'352453','YOKO G&B','BATERIA YOKO 73011SHD SMF 230AMP (camión)','bateria','unidad',226551,300000,null,285000,null,285000,53,5],
      [uuidv4(),'7000001','AUSTER','AUSTER MAXTECH PRO RX 5W30 SP/CJ 1L','lubricante','litro',3116,4200,4200,null,4000,null,1613,100],
      [uuidv4(),'7000049','AUSTER','AUSTER MAXTECH PRO RX 5W30 SP/CJ 4LT','lubricante','caja 4u',11454,15500,15500,null,14800,null,2257,200],
      [uuidv4(),'7000006','AUSTER','AUSTER MAXFORCE 15W40 CK-4 1L','lubricante','litro',3385,4600,null,4300,null,4300,1813,150],
      [uuidv4(),'7000053','AUSTER','AUSTER MAXFORCE 15W40 CK-4 20L (bidón)','lubricante','bidón 20L',55422,74000,null,70000,null,70000,50,10],
      [uuidv4(),'7000012','AUSTER','AUSTER MAXFORCE 10W40 CK-4 20L (bidón)','lubricante','bidón 20L',36546,49000,null,46000,null,46000,1560,100],
      [uuidv4(),'7000055','AUSTER','AUSTER HYDRO ISO 46 20LT (aceite hidráulico)','lubricante','bidón 20L',37638,50000,null,47000,null,47000,81,15],
      [uuidv4(),'7000003','AUSTER','AUSTER MAXTECH PRO FE 5W30 ACEA C3 DPF 1L','lubricante','litro',3143,4300,4300,null,4100,null,2567,200],
      [uuidv4(),'7000046','AUSTER','AUSTER MAXFORCE 15W40 CK-4 6L','lubricante','envase 6L',18330,24500,null,23000,null,23000,832,50],
      [uuidv4(),'244313','KUMHO','215/60 R16 KC53 103T 6PR (camioneta/SUV)','neumatico','unidad',77035,100000,100000,null,96000,null,50,8],
      [uuidv4(),'244325','KUMHO','265/70 R18 KL21 114T (4x4 AT)','neumatico','unidad',87101,116000,116000,null,110000,null,44,8],
      [uuidv4(),'244340','KUMHO','205/65 R15 KC53 104S (sedan/taxi)','neumatico','unidad',73246,97000,97000,null,null,null,50,8],
      [uuidv4(),'244374','KUMHO','275/60 R20 AT51 102T (pickup/doble cabina)','neumatico','unidad',157951,210000,210000,200000,null,200000,145,10],
      [uuidv4(),'244370','KUMHO','215/55 R18 KL33 93V (SUV urbano)','neumatico','unidad',100116,133000,133000,null,127000,null,48,8],
      [uuidv4(),'244009','KUMHO','285/50 R20 HP71 116V KR (camioneta premium)','neumatico','unidad',159383,212000,212000,null,202000,null,59,4],
      [uuidv4(),'244726','KUMHO','275/65 R18 HT51 123/120R 10PR (camioneta carga)','neumatico','unidad',139611,186000,null,176000,null,176000,54,6],
      [uuidv4(),'244635','KUMHO','245/75 R16 AT52 111S 10PR (4x4 AT/MT)','neumatico','unidad',124949,166000,166000,157000,null,157000,70,8],
      [uuidv4(),'210016','DOUBLE STAR','185/65 R15 DH05 88H (auto/taxi — alta rotación)','neumatico','unidad',26089,35000,35000,null,null,null,192,20],
      [uuidv4(),'210051','DOUBLE STAR','205/60 R16 DH05 92H (sedan/station)','neumatico','unidad',32553,43000,43000,null,null,null,218,15],
      [uuidv4(),'210097','DOUBLE STAR','11 R22.5 DSR668 148/145J 16PR (camión)','neumatico','unidad',191440,255000,null,242000,null,242000,253,10],
      [uuidv4(),'210033','DOUBLE STAR','11 R22.5 DSR168 148/145L 16PR (camión pesado)','neumatico','unidad',172646,230000,null,218000,null,218000,205,10],
      [uuidv4(),'210034','DOUBLE STAR','295/80 R22.5 DSR668 152/149J 18PR (tracción)','neumatico','unidad',183597,245000,null,232000,null,232000,140,8],
      [uuidv4(),'210026','DOUBLE STAR','245/75 R16 W01 114/111R 8PR (camioneta carga)','neumatico','unidad',69607,93000,93000,88000,null,88000,79,8],
      [uuidv4(),'210108','DOUBLE STAR','185/60 R15 DH05 84H (económico, alta rotación)','neumatico','unidad',29387,39000,39000,null,null,null,160,20],
    ]
    for (const p of productos) insProducto.run(...p)

    // ── Cotizaciones ───────────────────────────────────────────
    const insCot = db.prepare(`INSERT INTO cotizaciones
      (id,numero,cliente_id,cliente,estado,neto,iva,total,condicion_pago,canal_origen,created_at,aprobada_at) VALUES
      (?,?,?,?,?,?,?,?,?,?,?,?)`)
    const insItem = db.prepare(`INSERT INTO cotizacion_items
      (id,cotizacion_id,codigo,descripcion,cantidad,precio_unitario,subtotal) VALUES (?,?,?,?,?,?,?)`)

    const cots = [
      ['cot001','COT-2026-001','c001','Taller Hermanos Díaz','aprobada',409244,77757,487001,'Crédito 30 días','whatsapp','2026-06-01T10:00:00Z','2026-06-02T14:00:00Z'],
      ['cot002','COT-2026-002','c002','Transportes Norte S.A.','enviada',1042017,197983,1240000,'Crédito 30 días','presencial','2026-06-10T09:00:00Z',null],
      ['cot003','COT-2026-003','c003','Automotora San Antonio','borrador',319328,60672,380000,'Contado','web','2026-06-15T16:00:00Z',null],
      ['cot004','COT-2026-004','c006','MetroMov Buses S.A.','aprobada',1764706,335294,2100000,'Crédito 30 días','whatsapp','2026-05-20T08:00:00Z','2026-05-22T10:00:00Z'],
      ['cot005','COT-2026-005','c004','Constructora Mediterráneo','enviada',630252,119748,750000,'Contado','presencial','2026-06-18T11:00:00Z',null],
    ]
    for (const c of cots) insCot.run(...c)

    const cotItems = [
      ['cot001','352420','BATERIA YOKO KR 55AMP 55559',4,64000,256000],
      ['cot001','7000049','AUSTER MAXTECH PRO RX 5W30 4LT',10,15500,155000],
      ['cot002','210097','11 R22.5 DSR668 16PR (camión)',4,242000,968000],
      ['cot002','7000053','AUSTER MAXFORCE 15W40 20L',1,70000,70000],
      ['cot003','244374','275/60 R20 AT51 (pickup)',1,210000,210000],
      ['cot003','7000003','AUSTER MAXTECH FE 5W30 1L',20,4100,82000],
      ['cot004','210033','11 R22.5 DSR168 16PR (pesado)',8,218000,1744000],
      ['cot005','7000012','AUSTER MAXFORCE 10W40 20L',10,46000,460000],
      ['cot005','352440','BATERIA YOKO 100AMP N100L',1,100000,100000],
    ]
    for (const [cid, codigo, desc, cant, pu, sub] of cotItems) {
      insItem.run(uuidv4(), cid, codigo, desc, cant, pu, sub)
    }

    // ── Pedidos ────────────────────────────────────────────────
    const insPed = db.prepare(`INSERT INTO pedidos
      (id,numero,cotizacion_id,cliente_id,cliente,estado,neto,iva,total,condicion_pago,
       fecha_entrega_programada,fecha_entrega_real,guia_despacho,created_at) VALUES
      (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    insPed.run('ped001','PED-2026-001','cot001','c001','Taller Hermanos Díaz','entregado',409244,77757,487001,'Crédito 30 días','2026-06-03','2026-06-03','GD-001','2026-06-02T14:30:00Z')
    insPed.run('ped002','PED-2026-002','cot002','c002','Transportes Norte S.A.','en_preparacion',1042017,197983,1240000,'Crédito 30 días','2026-06-27',null,null,'2026-06-10T14:00:00Z')
    insPed.run('ped003','PED-2026-003','cot004','c006','MetroMov Buses S.A.','despachado',1764706,335294,2100000,'Crédito 30 días','2026-06-25',null,'GD-002','2026-05-22T10:30:00Z')

    // ── Movimientos de stock ───────────────────────────────────
    const insMov = db.prepare(`INSERT INTO movimientos_stock
      (id,producto_id,codigo,descripcion,tipo,cantidad,stock_anterior,stock_nuevo,motivo,referencia,created_at) VALUES
      (?,?,?,?,?,?,?,?,?,?,?)`)
    const movs = [
      ['mov001','352420','352420','BATERIA YOKO KR 55AMP 55559','entrada',50,358,408,'Recepción OC-2026-001','oc001','2026-05-22T10:00:00Z'],
      ['mov002','352430','352430','BATERIA YOKO KR 70AMP N70','entrada',20,22,42,'Recepción OC-2026-001','oc001','2026-05-22T10:05:00Z'],
      ['mov003','7000049','7000049','AUSTER MAXTECH PRO RX 5W30 4LT','entrada',300,1957,2257,'Recepción OC-2026-002','oc002','2026-05-27T09:00:00Z'],
      ['mov004','352420','352420','BATERIA YOKO KR 55AMP 55559','salida',4,408,404,'Despacho PED-2026-001','ped001','2026-06-03T08:00:00Z'],
      ['mov005','7000049','7000049','AUSTER MAXTECH PRO RX 5W30 4LT','salida',10,2257,2247,'Despacho PED-2026-001','ped001','2026-06-03T08:05:00Z'],
      ['mov006','210097','210097','11 R22.5 DSR668 16PR (camión)','salida',4,257,253,'Despacho PED-2026-003','ped003','2026-06-25T07:00:00Z'],
      ['mov007','352432','352432','BATERIA YOKO KR 75AMP N70Z','ajuste',-2,60,58,'Ajuste inventario — 2 unidades dañadas',null,'2026-06-10T14:00:00Z'],
    ]
    for (const m of movs) insMov.run(...m)

    // ── Actividades pipeline ───────────────────────────────────
    const insAct = db.prepare(`INSERT INTO actividades_pipeline
      (id,cliente_id,tipo,descripcion,resultado,proxima_accion,fecha_proxima,created_at) VALUES
      (?,?,?,?,?,?,?,?)`)
    insAct.run('a1','c001','cotizacion','Cotización COT-2026-001 aprobada por $487.001','positivo',null,null,'2026-06-02T14:00:00Z')
    insAct.run('a2','c001','whatsapp','Pedido confirmado por WhatsApp','positivo',null,null,'2026-06-02T14:30:00Z')
    insAct.run('a3','c001','visita','Visita a taller — negociación de volumen mensual','en seguimiento','Enviar propuesta mensual','2026-07-01','2026-05-15T10:00:00Z')
    insAct.run('a4','c002','llamada','Llamada con jefe de mantención — cotización en proceso','enviada',null,null,'2026-06-10T09:30:00Z')

    // ── Proveedores ────────────────────────────────────────────
    const insProv = db.prepare(`INSERT INTO proveedores
      (id,razon_social,rut,contacto,cargo,telefono,email,categorias,plazo_pago,condicion,banco,cuenta,created_at) VALUES
      (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    insProv.run('prov001','Distribuidora YOKO Chile S.A.','96.200.100-8','Marcos Lee','Ejecutivo de ventas','+56 2 2345 1111','mlee@yokochile.cl','["bateria"]',30,'Crédito 30 días','Banco de Chile','000-1234-56','2026-01-10T08:00:00Z')
    insProv.run('prov002','AUSTER Chile Lubricantes S.A.','96.300.200-3','Sofía Morales','Gerente comercial','+56 2 2678 2222','smorales@auster.cl','["lubricante"]',45,'Crédito 45 días','Santander','111-2345-67','2026-01-12T08:00:00Z')
    insProv.run('prov003','KUMHO Tire Chile S.A.','96.400.300-9','James Kim','Country Manager','+56 2 2890 3333','jkim@kumho.cl','["neumatico"]',30,'Crédito 30 días','BCI','222-3456-78','2026-01-15T08:00:00Z')
    insProv.run('prov004','Double Star Trading Chile Ltda.','77.500.400-2','Pedro Castillo','Representante','+56 9 8765 4444','pcastillo@dstar.cl','["neumatico"]',60,'Crédito 60 días','Banco Estado','333-4567-89','2026-01-20T08:00:00Z')

    // ── Órdenes de compra ──────────────────────────────────────
    const insOC = db.prepare(`INSERT INTO ordenes_compra
      (id,numero,proveedor_id,proveedor,estado,fecha_emision,fecha_entrega,neto,iva,total,pagada,factura_proveedor) VALUES
      (?,?,?,?,?,?,?,?,?,?,?,?)`)
    const insOCItem = db.prepare(`INSERT INTO oc_items (id,oc_id,codigo,descripcion,cantidad,precio_unitario,subtotal) VALUES (?,?,?,?,?,?,?)`)

    insOC.run('oc001','OC-2026-001','prov001','Distribuidora YOKO Chile S.A.','recibida','2026-05-15','2026-05-22',3943380,749242,4692622,1,'FP-2026-12345')
    insOC.run('oc002','OC-2026-002','prov002','AUSTER Chile Lubricantes S.A.','recibida','2026-05-20','2026-05-27',4910100,932919,5843019,1,'FP-2026-67890')
    insOC.run('oc003','OC-2026-003','prov003','KUMHO Tire Chile S.A.','enviada','2026-06-20','2026-07-05',3684147,699988,4384135,0,null)
    insOC.run('oc004','OC-2026-004','prov001','Distribuidora YOKO Chile S.A.','borrador','2026-06-27',null,1928156,366350,2294506,0,null)

    const ocItems = [
      ['oc001','352420','BATERIA YOKO KR 55AMP 55559',50,48450,2422500],
      ['oc001','352430','BATERIA YOKO KR 70AMP N70',20,61769,1235380],
      ['oc001','352440','BATERIA YOKO KR 100AMP N100L',5,79501,397505],
      ['oc002','7000049','AUSTER MAXTECH PRO RX 5W30 4LT',300,11454,3436200],
      ['oc002','7000053','AUSTER MAXFORCE 15W40 20L',20,55422,1108440],
      ['oc002','7000012','AUSTER MAXFORCE 10W40 20L',10,36546,365460],
      ['oc003','244374','275/60 R20 AT51 102T (pickup)',12,157951,1895412],
      ['oc003','244635','245/75 R16 AT52 111S (4x4)',10,124949,1249490],
      ['oc003','244313','215/60 R16 KC53 103T',7,77035,539245],
      ['oc004','352420','BATERIA YOKO KR 55AMP 55559',30,48450,1453500],
      ['oc004','352432','BATERIA YOKO KR 75AMP N70Z',7,67808,474656],
    ]
    for (const [oid, codigo, desc, cant, pu, sub] of ocItems) {
      insOCItem.run(uuidv4(), oid, codigo, desc, cant, pu, sub)
    }

    // ── Facturas CxC ───────────────────────────────────────────
    const insCxC = db.prepare(`INSERT INTO facturas_cxc
      (id,numero,pedido_id,cliente_id,cliente,segmento,monto,fecha_emision,fecha_vencimiento,estado,notas) VALUES
      (?,?,?,?,?,?,?,?,?,?,?)`)
    insCxC.run('fac001','F-2011',null,'c008','Lubricentro Express','taller',280000,'2026-03-21','2026-04-21','vencida','')
    insCxC.run('fac002','F-2019',null,'c007','AutoCenter Bellavista','concesionario',825000,'2026-04-20','2026-05-20','critica','Contactar gerente de compras')
    insCxC.run('fac003','F-2024','ped003','c006','MetroMov Buses S.A.','flota',2100000,'2026-06-05','2026-07-05','al_dia','')
    insCxC.run('fac004','F-2028','ped001','c001','Taller Hermanos Díaz','taller',487001,'2026-05-15','2026-06-15','vencida','')
    insCxC.run('fac005','F-2031','ped002','c002','Transportes Norte S.A.','flota',1240000,'2026-06-02','2026-07-02','al_dia','')
    insCxC.run('fac006','F-2033',null,'c004','Constructora Mediterráneo','construccion',340000,'2026-05-29','2026-06-29','al_dia','')

    // ── Facturas CxP ───────────────────────────────────────────
    const insCxP = db.prepare(`INSERT INTO facturas_cxp
      (id,numero,proveedor_id,proveedor,oc_id,oc_numero,monto,fecha_emision,fecha_vencimiento,estado,fecha_pago) VALUES
      (?,?,?,?,?,?,?,?,?,?,?)`)
    insCxP.run('cxp001','FP-2026-12345','prov001','Distribuidora YOKO Chile S.A.','oc001','OC-2026-001',4692622,'2026-05-22','2026-06-22','pagada','2026-06-18')
    insCxP.run('cxp002','FP-2026-67890','prov002','AUSTER Chile Lubricantes S.A.','oc002','OC-2026-002',5843019,'2026-05-27','2026-07-11','pagada','2026-07-10')
    insCxP.run('cxp003','FP-2026-22222','prov003','KUMHO Tire Chile S.A.','oc003','OC-2026-003',4384135,'2026-07-05','2026-08-04','pendiente',null)

    // ── Conversaciones WhatsApp ────────────────────────────────
    const insConv = db.prepare(`INSERT INTO conversaciones_whatsapp
      (id,telefono,nombre,ultimo_mensaje,ultimo_at,sin_leer) VALUES (?,?,?,?,?,?)`)
    const insMsgWA = db.prepare(`INSERT INTO mensajes_whatsapp
      (id,conversacion_id,telefono,direccion,contenido,created_at) VALUES (?,?,?,?,?,?)`)

    insConv.run('wa001','+56987654321','Carlos Díaz (Taller Díaz)','CONFIRMAR','2026-06-27T09:15:00Z',0)
    insConv.run('wa002','+56976543210','Rodrigo Muñoz (Trans Norte)','Necesito cotizar neumáticos de camión','2026-06-27T08:30:00Z',1)
    insConv.run('wa003','+56954321098','Felipe Soto (Constructora Med.)','¿Tienen el 10W40 en bidón 20L?','2026-06-26T17:45:00Z',1)

    const msgs = [
      ['m1','wa001','+56987654321','entrante','hola','2026-06-27T09:00:00Z'],
      ['m2','wa001','+56987654321','saliente','🔩 RMG Auto Parts\n¡Hola! Somos distribuidores mayoristas de repuestos en Santiago RM.\n\n¿Qué tipo de cliente eres?','2026-06-27T09:00:05Z'],
      ['m3','wa001','+56987654321','entrante','Taller mecánico','2026-06-27T09:01:00Z'],
      ['m4','wa001','+56987654321','saliente','📦 Perfecto. ¿Qué línea necesitas cotizar?\n\n• Baterías\n• Lubricantes\n• Neumáticos','2026-06-27T09:01:05Z'],
      ['m5','wa001','+56987654321','entrante','Baterías','2026-06-27T09:02:00Z'],
      ['m6','wa001','+56987654321','saliente','📋 COTIZACIÓN RMG AUTO PARTS\n🔢 N° COT-2026-001\n\n• BATERIA YOKO 55AMP (x4) = $256.000\n• AUSTER 5W30 4LT (x10) = $155.000\n\nNeto: $411.000 · IVA: $78.090 · TOTAL: $489.090\n\n✅ Entrega 4–24 hrs RM\n\nResponde CONFIRMAR para generar pedido','2026-06-27T09:05:00Z'],
      ['m7','wa001','+56987654321','entrante','CONFIRMAR','2026-06-27T09:15:00Z'],
      ['m8','wa002','+56976543210','entrante','Buenos días, Rodrigo de Transportes Norte','2026-06-27T08:25:00Z'],
      ['m9','wa002','+56976543210','saliente','¡Buenos días Rodrigo! ¿En qué te podemos ayudar hoy?','2026-06-27T08:26:00Z'],
      ['m10','wa002','+56976543210','entrante','Necesito cotizar neumáticos de camión','2026-06-27T08:30:00Z'],
      ['m11','wa003','+56954321098','entrante','¿Tienen el 10W40 en bidón 20L?','2026-06-26T17:45:00Z'],
    ]
    for (const m of msgs) insMsgWA.run(...m)
  })

  seed()
  console.log('✅ Base de datos SQLite inicializada con datos semilla')
}

function initDB() {
  initSchema()
  seedData()
}

module.exports = { db, initDB, uuidv4 }
