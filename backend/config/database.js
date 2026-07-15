const initSqlJs = require('sql.js')
const path = require('path')
const fs = require('fs')
const { v4: uuidv4 } = require('uuid')
const bcrypt = require('bcryptjs')

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../database/rmg_parts.db')

const dbDir = path.dirname(DB_PATH)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

// ─────────────────────────────────────────────────────────────────────────────
// Wrapper de compatibilidad: expone la misma API síncrona que better-sqlite3
// usando sql.js (WASM, in-memory) con persistencia manual en disco.
// ─────────────────────────────────────────────────────────────────────────────
class SQLiteWrapper {
  constructor() {
    this._db = null
    this._inTx = false
  }

  _save() {
    if (this._inTx) return
    fs.writeFileSync(DB_PATH, Buffer.from(this._db.export()))
  }

  pragma(str) {
    if (/journal_mode/i.test(str)) return
    this._db.run(`PRAGMA ${str}`)
  }

  exec(sql) {
    this._db.run(sql)
    this._save()
  }

  prepare(sql) {
    const w = this
    return {
      all(...params) {
        const stmt = w._db.prepare(sql)
        try {
          if (params.length) stmt.bind(params)
          const rows = []
          while (stmt.step()) rows.push(stmt.getAsObject())
          return rows
        } finally { stmt.free() }
      },
      get(...params) {
        const stmt = w._db.prepare(sql)
        try {
          if (params.length) stmt.bind(params)
          return stmt.step() ? stmt.getAsObject() : undefined
        } finally { stmt.free() }
      },
      run(...params) {
        const stmt = w._db.prepare(sql)
        try {
          if (params.length) stmt.bind(params)
          stmt.step()
        } finally { stmt.free() }
        w._save()
        return { changes: w._db.getRowsModified() }
      },
    }
  }

  transaction(fn) {
    const w = this
    return function (...args) {
      w._inTx = true
      w._db.run('BEGIN TRANSACTION')
      try {
        const result = fn(...args)
        w._db.run('COMMIT')
        w._inTx = false
        w._save()
        return result
      } catch (e) {
        try { w._db.run('ROLLBACK') } catch (_) {}
        w._inTx = false
        throw e
      }
    }
  }
}

const db = new SQLiteWrapper()

// ─── Schema ───────────────────────────────────────────────────────────────────
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
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      ran_at TEXT DEFAULT (datetime('now'))
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

// ─── Catálogo real: 223 SKUs (Neumáticos 138 · Baterías 43 · Lubricantes 42) ─
// [codigo, marca, descripcion, categoria, unidad, precio_costo, precio_b2b, stock_actual, margen_objetivo]
const CATALOG_223 = [
  ["240272","KUMHO","31X10.5 R15 KL71 109Q K","neumatico","unidad",115417,143117,2,24],
  ["240276","KUMHO","215/75 R15 KL71 106Q 8PR K","neumatico","unidad",114425,141887,6,24],
  ["240079","KUMHO","30X9.5 R15 KL71 104Q 6PR K","neumatico","unidad",96087,119147,61,24],
  ["240331","KUMHO","27X8.5 R14 KL71 6PR K","neumatico","unidad",80656,100013,7,24],
  ["244243","KUMHO","225/60 R16 KR26 98H K","neumatico","unidad",59516,73800,8,24],
  ["244248","KUMHO","215/70 R16 KC53 108T 6PR K","neumatico","unidad",83348,103352,66,24],
  ["240497","KUMHO","235/60 R17 KL33 102V 4PR K","neumatico","unidad",93905,116443,13,24],
  ["240450","KUMHO","155/70 R13 KR26 75H 4PR K","neumatico","unidad",30583,37923,2,24],
  ["244256","KUMHO","235/60 R16 PA31 100V 4PR","neumatico","unidad",70343,87225,2,24],
  ["241237","KUMHO","195/60 R16 KC53 99H K","neumatico","unidad",61415,76154,3,24],
  ["244306","KUMHO","245/75 R16 AT51 109T","neumatico","unidad",86609,107395,2,24],
  ["244395","KUMHO","225/60 R16 KH27 98V VT","neumatico","unidad",59581,73881,15,24],
  ["244402","KUMHO","265/75 R16 AT51 123R TL VT","neumatico","unidad",124050,153822,2,24],
  ["244411","KUMHO","295/80 R22.5 RS15 152M","neumatico","unidad",319577,396275,20,24],
  ["244412","KUMHO","195/75 R16 KC53 110R 10PR K","neumatico","unidad",82903,102799,2,24],
  ["244420","KUMHO","195/60 R16 PA31 89V 4PR","neumatico","unidad",53126,65876,3,24],
  ["244313","KUMHO","215/60 R16 KC53 103T 6PR VT","neumatico","unidad",77035,95523,50,24],
  ["244325","KUMHO","265/70 R18 KL21 114T KUMHO VT","neumatico","unidad",87101,108005,44,24],
  ["244340","KUMHO","205/65 R15 KC53 104S K","neumatico","unidad",73246,90825,50,24],
  ["244345","KUMHO","265/50 R20 KL21 107V VT","neumatico","unidad",123199,152767,14,24],
  ["244348","KUMHO","225/70 R16 KH27 103H CH","neumatico","unidad",66669,82669,2,24],
  ["244359","KUMHO","155/65 R14 ES31 75T 4PR TL","neumatico","unidad",25091,31113,21,24],
  ["244361","KUMHO","195/65 R15 ES31 4PR TL CH","neumatico","unidad",48292,59882,11,24],
  ["244363","KUMHO","245/75 R16 MT51 120/116Q 10PR VT TL","neumatico","unidad",120884,149896,47,24],
  ["244365","KUMHO","245/75 R16 AT52 111T","neumatico","unidad",97312,120667,2,24],
  ["244370","KUMHO","215/55 R18 KL33 93V K","neumatico","unidad",100116,124144,48,24],
  ["244374","KUMHO","275/60 R20 AT51 102T VT","neumatico","unidad",157951,195859,145,24],
  ["244383","KUMHO","175/70 R14 ES31 84T","neumatico","unidad",37818,46894,15,24],
  ["244387","KUMHO","165/65 R14 ES31 79T","neumatico","unidad",34937,43322,8,24],
  ["244388","KUMHO","205/45 ZR17 HS51 88W","neumatico","unidad",51467,63819,3,24],
  ["244426","KUMHO","185/55 R14 KH27 80H K","neumatico","unidad",33638,41711,26,24],
  ["244380","KUMHO","265/65 R18 AT51 114T","neumatico","unidad",115535,143263,2,24],
  ["244009","KUMHO","285/50 R20 HP71 116V KR","neumatico","unidad",159383,197634,59,24],
  ["244503","KUMHO","195/50 R15 KH27","neumatico","unidad",40888,50701,4,24],
  ["244650","KUMHO","255/60 R18 AT52 112T","neumatico","unidad",110104,136529,3,24],
  ["244600","KUMHO","215/70 R16 HP71 104H 4PR","neumatico","unidad",76683,95087,15,24],
  ["244607","KUMHO","255/50 R20 HP71 105H","neumatico","unidad",136961,169832,14,24],
  ["244642","KUMHO","215/55 R18 PA31 95V","neumatico","unidad",73175,90737,4,24],
  ["244646","KUMHO","27X8.50 R14 AT51 101R 8PR","neumatico","unidad",74560,92454,2,24],
  ["244625","KUMHO","225/55 R17 PS71 97Y 4PR","neumatico","unidad",117252,145393,8,24],
  ["244626","KUMHO","295/80 R22.5 MA03 152/148M 16PR","neumatico","unidad",339384,420836,36,24],
  ["244627","KUMHO","195/75 R14 KC53 106R 8PR","neumatico","unidad",62559,77573,9,24],
  ["244628","KUMHO","215/45 R16 HS51 90V 4PR","neumatico","unidad",56028,69474,20,24],
  ["244631","KUMHO","195/45 R16 PS31 84V","neumatico","unidad",48521,60166,26,24],
  ["244610","KUMHO","295/80 R22.5 MD41 16PR 152/148K","neumatico","unidad",306045,379495,3,24],
  ["244614","KUMHO","225/55 R16 PA31 99V","neumatico","unidad",68821,85338,15,24],
  ["242056X","KUMHO","205/65 R16 KH17 95H 4PR K","neumatico","unidad",111537,138306,2,24],
  ["244679","KUMHO","285/45 R22 HP71","neumatico","unidad",141769,175794,5,24],
  ["244635","KUMHO","245/75 R16 AT52 111S 10PR","neumatico","unidad",124949,154937,70,24],
  ["244726","KUMHO","275/65 R18 HT51 123/120R 10PR","neumatico","unidad",139611,173117,54,24],
  ["244736","KUMHO","155/55 R14 HS51 69V 4PR","neumatico","unidad",28068,34804,30,24],
  ["244738","KUMHO","255/55 R18 PS71 100Y","neumatico","unidad",95629,118580,10,24],
  ["244664","KUMHO","195/55 R16 KH27 87H","neumatico","unidad",47891,59384,3,24],
  ["244743","KUMHO","225/60 R16 HS52 98W","neumatico","unidad",58704,72793,28,24],
  ["244761","KUMHO","185/60 R14 KH27 82H","neumatico","unidad",33176,41138,3,24],
  ["244762","KUMHO","275/60 R20 AT52 115T","neumatico","unidad",144180,178783,3,24],
  ["244775","KUMHO","225/50 R17 TA21 94V","neumatico","unidad",62342,77305,8,24],
  ["244779","KUMHO","285/60 R20 AT52 125S","neumatico","unidad",146031,181079,3,24],
  ["244781","KUMHO","265/75 R16 HT51 114T","neumatico","unidad",119471,148144,28,24],
  ["244783","KUMHO","275/70 R18 AT52","neumatico","unidad",164468,203940,30,24],
  ["244448","KUMHO","225/40 R18 PS71 92Y","neumatico","unidad",85925,106547,42,24],
  ["244784","KUMHO","165/70 R14 KC53 89/87R","neumatico","unidad",50872,63081,42,24],
  ["244451","KUMHO","235/55 R20 HP71 102H","neumatico","unidad",125572,155709,10,24],
  ["244788","KUMHO","265/60 R18 HP71 110V","neumatico","unidad",140363,174050,2,24],
  ["270016","KENDA SD","195/75 R14 KR06 106/104R 6PR CH","neumatico","unidad",57983,71900,4,24],
  ["270005","KENDA SD","265/65 R18 KR15 114T TL CH","neumatico","unidad",48724,60418,4,24],
  ["270048","KENDA SD","265/70 R17 KR28 115S TL TW","neumatico","unidad",120082,148901,2,24],
  ["270069","KENDA SD","30X9.5 R15 KR28 104Q TW","neumatico","unidad",109170,135371,7,24],
  ["270078","KENDA SD","31X10.5 R15 KR29 109Q 6PR CH","neumatico","unidad",115116,142744,22,24],
  ["270221","KENDA SD","205/45 R17 KR32 88V TL","neumatico","unidad",55810,69205,6,24],
  ["270823","KENDA SD","225/55 R16 KR10 95V TL","neumatico","unidad",60909,75528,6,24],
  ["270221X","KENDA SD","205/45 R17 KR32 88V TL","neumatico","unidad",62011,76893,4,24],
  ["210101","DOUBLE STAR","225/60 R17 W01 99T","neumatico","unidad",56238,69735,3,24],
  ["210114","DOUBLE STAR","215/75 R15 W01 100/97R","neumatico","unidad",51735,64152,23,24],
  ["210115","DOUBLE STAR","255/70 R16 W01 108/104R","neumatico","unidad",80560,99894,3,24],
  ["210119","DOUBLE STAR","215/75 R17.5 DSRS01 126/124L 16PR","neumatico","unidad",81233,100729,20,24],
  ["210103","DOUBLE STAR","245/70 R16 W01 113/110Q","neumatico","unidad",65589,81331,29,24],
  ["210111","DOUBLE STAR","265/70 R17 DS01 115H","neumatico","unidad",77268,95812,42,24],
  ["210105","DOUBLE STAR","175/70 R13 DH05 82T","neumatico","unidad",22139,27452,68,24],
  ["210104","DOUBLE STAR","265/70 R16 DS01 112H","neumatico","unidad",66053,81906,79,24],
  ["210118","DOUBLE STAR","1200 R24 DSR168 160/157L 20PR","neumatico","unidad",271616,336804,2,24],
  ["210108","DOUBLE STAR","185/60 R15 DH05 84H","neumatico","unidad",29387,36440,160,24],
  ["210016","DOUBLE STAR","185/65 R15 DH05 88H","neumatico","unidad",26089,32351,192,24],
  ["210017","DOUBLE STAR","155 R12 DS805 88N","neumatico","unidad",27190,33716,34,24],
  ["210018","DOUBLE STAR","185/65 R14 DH05 86H","neumatico","unidad",25586,31727,170,24],
  ["210019","DOUBLE STAR","175/70 R14 DH05 84T","neumatico","unidad",23644,29319,35,24],
  ["210020","DOUBLE STAR","175/65 R14 DH05 82H","neumatico","unidad",23060,28594,14,24],
  ["210021","DOUBLE STAR","235/65 R16 DLA02 115/113R","neumatico","unidad",59507,73789,2,24],
  ["210022","DOUBLE STAR","235/75 R15 T01 110N","neumatico","unidad",95752,118732,7,24],
  ["210023","DOUBLE STAR","195 R15 DL01 106/104Q","neumatico","unidad",49950,61937,7,24],
  ["210025","DOUBLE STAR","265/65 R18 DSS02 114T","neumatico","unidad",71004,88045,33,24],
  ["210026","DOUBLE STAR","245/75 R16 W01 114/111R 8PR","neumatico","unidad",69607,86313,79,24],
  ["210126","DOUBLE STAR","315/80 R22.5 DSR668 156/150L 20PR","neumatico","unidad",217717,269969,5,24],
  ["210024","DOUBLE STAR","265/70 R17 DS01 115H","neumatico","unidad",74194,92000,9,24],
  ["210027","DOUBLE STAR","225/75 R16 W01 103/100Q 6PR","neumatico","unidad",59732,74068,13,24],
  ["210028","DOUBLE STAR","235/60 R17 DS01 102H","neumatico","unidad",52483,65079,16,24],
  ["210029","DOUBLE STAR","235/60 R16 DS01 100H","neumatico","unidad",42826,53104,21,24],
  ["210031","DOUBLE STAR","215/75 R17.5 DSR116 126/124L 16PR","neumatico","unidad",82453,102242,21,24],
  ["210032","DOUBLE STAR","12 R22.5 DSR168 152/149L 18PR","neumatico","unidad",148075,183613,16,24],
  ["210033","DOUBLE STAR","11 R22.5 DSR168 148/145L 16PR","neumatico","unidad",172646,214081,205,24],
  ["210034","DOUBLE STAR","295/80 R22.5 DSR668 152/149J 18PR","neumatico","unidad",183597,227661,140,24],
  ["210035","DOUBLE STAR","295/80 R22.5 DSR328 154/152M 18PR","neumatico","unidad",160739,199316,44,24],
  ["210037","DOUBLE STAR","215/70 R15C DL01 109/107R","neumatico","unidad",54279,67306,6,24],
  ["210039","DOUBLE STAR","275/65 R18 DSS02 116T","neumatico","unidad",83357,103363,20,24],
  ["210042","DOUBLE STAR","195/60 R15 DH05 88V","neumatico","unidad",29125,36115,32,24],
  ["210044","DOUBLE STAR","265/65 R17 W01 120/117R 10PR","neumatico","unidad",76269,94574,50,24],
  ["210045","DOUBLE STAR","235/75 R15 W01 110/107R 8PR","neumatico","unidad",69700,86428,4,24],
  ["210046","DOUBLE STAR","265/70 R16 W01 110/107R 6PR","neumatico","unidad",83091,103033,3,24],
  ["210050","DOUBLE STAR","235/60 R18 W01 103Q","neumatico","unidad",57004,70685,17,24],
  ["210051","DOUBLE STAR","205/60 R16 DH05 92H","neumatico","unidad",32553,40366,218,24],
  ["210052","DOUBLE STAR","12 R22.5 DSR668 152/149K 18PR","neumatico","unidad",209994,260393,16,24],
  ["210054","DOUBLE STAR","11 R22.5 DSR116 146/143L 16PR","neumatico","unidad",159203,197411,12,24],
  ["210059","DOUBLE STAR","31/10.5 R15 T01 109N","neumatico","unidad",101071,125328,4,24],
  ["210061","DOUBLE STAR","195/55 R16 DH05 87V","neumatico","unidad",29682,36805,51,24],
  ["210062","DOUBLE STAR","275/65 R18 DLA01 116T","neumatico","unidad",67740,83998,6,24],
  ["210063","DOUBLE STAR","265/60 R18 W01 110T","neumatico","unidad",71129,88200,24,24],
  ["210064","DOUBLE STAR","205/65 R16 DH09 95H","neumatico","unidad",34900,43276,24,24],
  ["210065","DOUBLE STAR","265/50 R20 DSU02 111W","neumatico","unidad",57610,71436,12,24],
  ["210067","DOUBLE STAR","295/80 R22.5 DSR266 154/152M 18PR","neumatico","unidad",147103,182408,17,24],
  ["210068","DOUBLE STAR","215/65 R16 DH08 98H","neumatico","unidad",40538,50267,3,24],
  ["210069","DOUBLE STAR","205/55 R16 DH05 91V","neumatico","unidad",29248,36268,83,24],
  ["210072","DOUBLE STAR","215/55 R18 DS01 98H","neumatico","unidad",45413,56312,4,24],
  ["210074","DOUBLE STAR","255/55 R18 DSU02 105V","neumatico","unidad",44286,54914,4,24],
  ["210076","DOUBLE STAR","165/65 R14 DH05 79T","neumatico","unidad",24410,30269,9,24],
  ["210078","DOUBLE STAR","235/55 R19 DSU02 105V","neumatico","unidad",49643,61557,20,24],
  ["210079","DOUBLE STAR","285/50 R20 DS01 112H","neumatico","unidad",67433,83617,49,24],
  ["210082","DOUBLE STAR","13 R22.5 DSR168 154/150K 18PR","neumatico","unidad",194456,241125,9,24],
  ["210084","DOUBLE STAR","215/70 R16 DS01 108/106R","neumatico","unidad",51450,63798,86,24],
  ["210085","DOUBLE STAR","235/55 R18 DS01 100V","neumatico","unidad",47387,58759,10,24],
  ["210088","DOUBLE STAR","295/80 R22.5 DSRT26 154/152M 18PR","neumatico","unidad",170185,211029,3,24],
  ["210097","DOUBLE STAR","11 R22.5 DSR668 148/145J 16PR","neumatico","unidad",191440,237386,253,24],
  ["210098","DOUBLE STAR","215/75 R17.5 DSRD01 126/124L 16PR","neumatico","unidad",82739,102596,15,24],
  ["210113","DOUBLE STAR","12 R22.5 HD636Z 152/149L 18PR","neumatico","unidad",201376,249706,18,24],
  ["210122","DOUBLE STAR","155/65 R13 DH05","neumatico","unidad",16999,21078,6,24],
  ["210123","DOUBLE STAR","245/75 R16 T01 114/111N 8PR","neumatico","unidad",92228,114363,74,24],
  ["210124","DOUBLE STAR","165/65 R13 DH05 77T","neumatico","unidad",23133,28685,11,24],
  ["210125","DOUBLE STAR","155/65 R14 DH08 75T","neumatico","unidad",22377,27748,36,24],
  ["210127","DOUBLE STAR","215/65 R16 DH03 98H","neumatico","unidad",35352,43836,24,24],
  ["351416","YOKO G&B","BATERIA YOKO KR 40AMP N40L","bateria","unidad",35579,46964,148,32],
  ["351442","YOKO G&B","BATERIA YOKO KR 90AMP 30H730 (30-H90)","bateria","unidad",74583,98450,32,32],
  ["351435","YOKO G&B","N70Z MF","bateria","unidad",66957,88383,164,32],
  ["351433","YOKO G&B","BATERIA YOKO KR 75AMP 75DT660","bateria","unidad",62899,83026,52,32],
  ["351404","YOKO G&B","BATERIA YOKO KR 12N24-4 26AMP","bateria","unidad",30216,39885,213,32],
  ["352425","YOKO G&B","BATERIA YOKO KR 60AMP N50Z","bateria","unidad",51459,67926,15,32],
  ["352430","YOKO G&B","BATERIA YOKO KR 70AMP N70","bateria","unidad",61769,81535,42,32],
  ["352432","YOKO G&B","BATERIA YOKO KR 75AMP N70Z","bateria","unidad",67808,89507,58,32],
  ["352440","YOKO G&B","BATERIA YOKO KR 100AMP N100L","bateria","unidad",79501,104942,39,32],
  ["352445","YOKO G&B","BATERIA YOKO KR 120AMP N120","bateria","unidad",100573,132757,61,32],
  ["352450","YOKO G&B","BATERIA YOKO KR 150AMP N150","bateria","unidad",129164,170497,65,32],
  ["352414","YOKO G&B","BATERIA KOREA KR 40AMP N40","bateria","unidad",37314,49255,173,32],
  ["352410","YOKO G&B","BATERIA YOKO KR 35AMP NS40ZL","bateria","unidad",31311,41330,370,32],
  ["352417","YOKO G&B","BATERIA YOKO KR 45AMP NS60L","bateria","unidad",43907,57957,132,32],
  ["352465","YOKO G&B","BATERIA YOKO KR 200AMP N200","bateria","unidad",170704,225329,94,32],
  ["352420","YOKO G&B","BATERIA YOKO KR 55AMP 55559","bateria","unidad",48450,63955,408,32],
  ["352421","YOKO G&B","BATERIA YOKO KR 44AMP 54459","bateria","unidad",44989,59385,270,32],
  ["352466","YOKO G&B","BATERIA YOKO KR 55AMP 55565","bateria","unidad",44272,58439,74,32],
  ["352437","YOKO G&B","BATERIA YOKO KR 88AMP 58827","bateria","unidad",77449,102232,20,32],
  ["352435","YOKO G&B","BATERIA YOKO KR 70AMP NX110-5","bateria","unidad",60856,80329,61,32],
  ["352438","YOKO G&B","BATERIA YOKO KR 90AMP NX120-7","bateria","unidad",69715,92024,111,32],
  ["352443","YOKO G&B","BATERIA YOKO KR 100AMP 30H102","bateria","unidad",77672,102528,130,32],
  ["352422","YOKO G&B","BATERIA YOKO KR 54AMP 55457A","bateria","unidad",45561,60140,113,32],
  ["352416","YOKO G&B","BATERIA YOKO KR 43AMP 54316","bateria","unidad",40975,54087,3,32],
  ["352434","YOKO G&B","BATERIA YOKO KR 71AMP 57113","bateria","unidad",66666,87999,87,32],
  ["352439","YOKO G&B","BATERIA YOKO KR 90AMP NX120-7L","bateria","unidad",70842,93511,162,32],
  ["352436","YOKO G&B","BATERIA YOKO KR 70AMP NX110-5L","bateria","unidad",59235,78190,176,32],
  ["352449","YOKO G&B","BATERIA YOKO KR 75AMP N70ZL","bateria","unidad",66358,87592,19,32],
  ["352433","YOKO G&B","BATERIA YOKO KR 78DT-760 760CCA 12V","bateria","unidad",73109,96504,27,32],
  ["352444","YOKO G&B","BATERIA YOKO KR 150AMP N150LSMF","bateria","unidad",131282,173293,55,32],
  ["352446","YOKO G&B","BATERIA YOKO KR 75DT-710 710CCA 12V","bateria","unidad",64534,85184,55,32],
  ["352424","YOKO G&B","BATERIA YOKO KR 60AMP 55D23R","bateria","unidad",55034,72644,67,32],
  ["352426","YOKO G&B","BATERIA YOKO KR 55D23L 60AMP/H 12V","bateria","unidad",53440,70541,76,32],
  ["352447","YOKO G&B","BATERIA YOKO KR 45AMP NX100-S6LS","bateria","unidad",41703,55048,21,32],
  ["352455","YOKO G&B","BATERIA YOKO KR 80 AMP 58014","bateria","unidad",76600,101113,44,32],
  ["352451","YOKO G&B","N100 100AMP 12VOLT","bateria","unidad",84460,111488,120,32],
  ["352452","YOKO G&B","BATERÍA YOKO KR SMF 60044 100AH 12V","bateria","unidad",93677,123654,79,32],
  ["352453","YOKO G&B","73011SHD SMF 230AMP","bateria","unidad",226551,299047,53,32],
  ["352454","YOKO G&B","68032 SMF 12V 180 A/H","bateria","unidad",165757,218799,12,32],
  ["352456","YOKO G&B","BATERIA YOKO KR 100AMP 31-930S","bateria","unidad",94609,124884,3,32],
  ["352467","YOKO G&B","BATERIA YOKO KR 55AMP 55559 SMF","bateria","unidad",45310,59809,55,32],
  ["352469","YOKO G&B","BATERIA YOKO SMF 53529","bateria","unidad",41553,54850,11,32],
  ["352460","YOKO G&B","SMF 56219 62AMP CCA510","bateria","unidad",47168,62261,21,32],
  ["7000001","AUSTER","AUSTER MAXTECH PRO RX 5W30 SP/CJ 1 LT","lubricante","unidad",3116,4176,1613,34],
  ["7000002","AUSTER","AUSTER MAXTECH PRO FE 5W30 SP/CF C3 DPF 1L","lubricante","unidad",2994,4011,18,34],
  ["7000006","AUSTER","AUSTER MAXFORCE 15W40 CK-4 1L","lubricante","unidad",3385,4536,1813,34],
  ["7000007","AUSTER","AUSTER MAXFORCE 15W40 CK-4 3L","lubricante","unidad",3576,4792,99,34],
  ["7000011","AUSTER","AUSTER MAXFORCE 10W40 CK-4 3L","lubricante","unidad",4085,5474,374,34],
  ["7000012","AUSTER","AUSTER MAXFORCE 10W40 CK-4 20L","lubricante","unidad",3655,4897,1560,34],
  ["7000003","AUSTER","AUSTER MAXTECH PRO FE 5W30 ACEA C3 DPF 1L","lubricante","unidad",3143,4211,2567,34],
  ["7000010","AUSTER","AUSTER MAXFORCE 10W40 CK-4 1L","lubricante","unidad",3746,5020,1241,34],
  ["7000019","AUSTER","AUSTER 75W90 GL-4 1L","lubricante","unidad",2878,3856,174,34],
  ["7000022","AUSTER","AUSTER 75W90 GL-5 1L","lubricante","unidad",3108,4165,270,34],
  ["7000026","AUSTER","AUSTER 80W90 GL-4 1L","lubricante","unidad",2529,3388,600,34],
  ["7000028","AUSTER","AUSTER TRANSMISSION 80W90 GL-5 1L","lubricante","unidad",2759,3697,1407,34],
  ["7000029","AUSTER","AUSTER 80W90 GL-5 20L","lubricante","unidad",43088,57738,73,34],
  ["7000030","AUSTER","AUSTER 80W90 GL-5 200L","lubricante","unidad",425726,570472,3,34],
  ["7000034","AUSTER","AUSTER ATF VI 1L","lubricante","unidad",5223,6999,20,34],
  ["7000035","AUSTER","AUSTER 4T 10W40 1L","lubricante","unidad",2603,3488,386,34],
  ["7000036","AUSTER","AUSTER LONG LIFE ANTIFREEZE 1L","lubricante","unidad",2811,3767,387,34],
  ["7000038","AUSTER","AUSTER LONG LIFE ANTIFREEZE 200L","lubricante","unidad",393544,527349,5,34],
  ["7000039","AUSTER","AUSTER MAXTECHG PRO FE 0W30 SN/CF 1L","lubricante","unidad",3986,5341,164,34],
  ["7000040","AUSTER","AUSTER MAXTECH PRO FE 0W30 SN/CF 4L","lubricante","unidad",12189,16334,121,34],
  ["7000044","AUSTER","AUSTER 20W50 SL/CF 4L","lubricante","unidad",9354,12534,273,34],
  ["7000046","AUSTER","AUSTER MAXFORCE 15W40 CK-4 6L","lubricante","unidad",18330,24562,832,34],
  ["7000047","AUSTER","AUSTER MAXFORCE 10W40 CK-4 6L","lubricante","unidad",19625,26298,173,34],
  ["7000048","AUSTER","AUSTER MAXTECH PRO 10W40 SP- 1 LT","lubricante","unidad",2935,3933,302,34],
  ["7000049","AUSTER","AUSTER MAXTECH PRO RX 5W30 SP/CJ 4LT","lubricante","unidad",11454,15348,2257,34],
  ["7000050","AUSTER","AUSTER MAXTECH PRO FE 5W30 ACEA C3 DPF 200L","lubricante","unidad",503477,674659,19,34],
  ["7000052","AUSTER","AUSTER MAXFORCE 15W40 CK-4 200L","lubricante","unidad",540831,724714,20,34],
  ["7000053","AUSTER","AUSTER MAXFORCE 15W40 CK-4 20L","lubricante","unidad",55422,74265,50,34],
  ["7000054","AUSTER","AUSTER MAXFORCE 10W40 CK-4 200L","lubricante","unidad",620509,831481,1,34],
  ["7000055","AUSTER","AUSTER HYDRO ISO 46 20LT","lubricante","unidad",37638,50435,81,34],
  ["7000056","AUSTER","AUSTER HYDRO ISO 46 200LT","lubricante","unidad",366691,491365,10,34],
  ["7000058","AUSTER","AUSTER HYDRO ISO 68 200LT","lubricante","unidad",369128,494631,9,34],
  ["7000059","AUSTER","AUSTER MAXTECH PRO 10W40 SP 4LT","lubricante","unidad",10882,14583,1078,34],
  ["7000045","AUSTER","AUSTER MAXTECH PRO FE 5W30 SP/CF C3 DPF 6L","lubricante","unidad",17592,23573,1094,34],
  ["7000057","AUSTER","AUSTER HYDRO ISO 68 20LT","lubricante","unidad",38011,50935,7,34],
  ["7000062","AUSTER","AUSTER LITHIUM EP GREASE (RED) 180KG","lubricante","unidad",594384,796475,2,34],
  ["7000063","AUSTER","AUSTER LITHIUM COMPLEX GREASE 180KG","lubricante","unidad",1229953,1648137,2,34],
  ["7000064","AUSTER","AUSTER ATF III 1L","lubricante","unidad",2959,3965,864,34],
  ["7000065","AUSTER","AUSTER 80W-90 LSD 1LT","lubricante","unidad",3255,4362,347,34],
  ["7000067","AUSTER","AUSTER LITHIUM COMPLEX GREASE (BALDE) 15KG","lubricante","unidad",110450,148003,4,34],
  ["7000068","AUSTER","AUSTER 75W80 GL-4 1LT","lubricante","unidad",3047,4083,165,34],
  ["7000069","AUSTER","AUSTER 75W80 GL-5 1LT","lubricante","unidad",3199,4286,228,34],
]

// ─── Extractor de cluster_key por categoría ───────────────────────────────────
function extractClusterKey(categoria, descripcion) {
  const d = descripcion.toUpperCase()

  if (categoria === 'neumatico') {
    // Formato ratio estándar: 215/70R16, 295/80 R22.5
    let m = d.match(/\b(\d{3}\/\d{2,3}\s*R\d{1,2}(?:\.\d+)?)\b/)
    if (m) return m[1].replace(/\s+/g, '')
    // Formato cross: 31X10.5R15, 30X9.5 R15
    m = d.match(/\b(\d{2}[X×]\d{1,2}(?:\.\d+)?\s*R\d{2})\b/)
    if (m) return m[1].replace(/\s+/g, '')
    // Formato camión/bus nominal: 1200 R24, 12 R22.5, 195 R15
    m = d.match(/^(\d{2,4}(?:\.\d+)?\s*R\d{1,2}(?:\.\d+)?)/)
    if (m) return m[1].replace(/\s+/g, '')
    return d.split(' ').slice(0, 2).join(' ')
  }

  if (categoria === 'bateria') {
    // NX: NX110-5, NX120-7L, NX100-S6LS
    let m = d.match(/\b(NX\d{2,3}\S*)\b/)
    if (m) return m[1]
    // NS: NS40ZL, NS60L
    m = d.match(/\b(NS\d{2}[A-Z]*)\b/)
    if (m) return m[1]
    // N estándar: N70Z, N100L, N150LSMF
    m = d.match(/\b(N\d{2,3}[A-Z]*)\b/)
    if (m) return m[1]
    // JIS: 55D23R, 55D23L
    m = d.match(/\b(\d{2}[A-Z]\d{2}[LR])\b/)
    if (m) return m[1]
    // Código DIN 5 dígitos: 55559, 73011SHD, 60044
    m = d.match(/\b(\d{5}[A-Z]*)\b/)
    if (m) return m[1]
    // DT: 78DT-760, 75DT-710
    m = d.match(/\b(\d{2}DT-\d+)\b/)
    if (m) return m[1]
    // H series: 30H730, 30H102
    m = d.match(/\b(\d{2}H\d+)\b/)
    if (m) return m[1]
    // Moto: 12N24-4
    m = d.match(/\b(\d{2}N\d+-\d+)\b/)
    if (m) return m[1]
    // 31-930S
    m = d.match(/\b(\d{2}-\d{3}[A-Z])\b/)
    if (m) return m[1]
    // Fallback: amperaje
    m = d.match(/(\d+)\s*AMP/)
    if (m) return m[1] + 'AMP'
    return d.split(' ').slice(0, 2).join(' ')
  }

  if (categoria === 'lubricante') {
    const mV = d.match(/\b(\d+W-?\d+)\b/)
    if (!mV) {
      if (d.includes('ATF')) return d.includes(' VI') ? 'ATF-VI' : 'ATF-III'
      if (d.includes('ANTIFREEZE')) return 'ANTIFREEZE'
      const mISO = d.match(/ISO[\s-]?(\d+)/)
      if (mISO) return 'HYDRO-ISO' + mISO[1]
      if (d.includes('GREASE') || d.includes('GRASA')) return d.includes(' EP') ? 'GREASE-LITHIUM-EP' : 'GREASE-LITHIUM-COMPLEX'
      return d.split(' ').slice(1, 4).join(' ').trim()
    }
    const visc = mV[1].replace('-', '')
    if ((d.includes('ACEA') && d.includes('C3')) || /\bC3\b/.test(d)) return visc + '-ACEA-C3'
    if (d.includes('CK-4') || d.includes('CK4')) return visc + '-CK4'
    if (/ SN/.test(d)) return visc + '-SN'
    if (/ SP/.test(d)) return visc + '-SP'
    if (/ SL/.test(d)) return visc + '-SL'
    if (d.includes('LSD')) return visc + '-LSD'
    if (d.includes('GL-5') || d.includes('GL5')) return visc + '-GL5'
    if (d.includes('GL-4') || d.includes('GL4')) return visc + '-GL4'
    if (d.includes('4T')) return '4T-' + visc
    return visc
  }

  return d.split(' ').slice(0, 3).join(' ')
}

// ─── Parser de volumen en litros (lubricantes) ───────────────────────────────
function parseVolumenLitros(descripcion) {
  const d = descripcion.toUpperCase()
  // Gallons: digits directly adjacent to GL (no space), GL not followed by - or digit
  // e.g. "1GL" → 3.785L. "GL-4" / "GL5" spec codes are excluded by (?![-\d]).
  const galMatch = d.match(/(\d+(?:[.,]\d+)?)GL\b(?![-\d])/)
  if (galMatch) {
    const gal = parseFloat(galMatch[1].replace(',', '.'))
    if (!isNaN(gal) && gal > 0) return Math.round(gal * 3785) / 1000
  }
  // Liters: 1L, 1LT, 3L, 4L, 4LT, 6L, 20L, 200L, 200LT — use last match to avoid
  // viscosity-grade digits (e.g. "80W90" → "90" would not be followed by L)
  const matches = [...d.matchAll(/(\d+(?:[.,]\d+)?)\s*LT?\b/g)]
  if (matches.length === 0) return null
  const vol = parseFloat(matches[matches.length - 1][1].replace(',', '.'))
  return (isNaN(vol) || vol <= 0) ? null : vol
}

// ─── Migraciones idempotentes ─────────────────────────────────────────────────
function runMigrations() {
  // Migration 1: eliminar todos los datos de prueba
  const m1 = db.prepare('SELECT id FROM _migrations WHERE id = ?').get('clean_test_data_v1')
  if (!m1) {
    const counts = {}
    const TEST_TABLES = [
      'mensajes_whatsapp',
      'conversaciones_whatsapp',
      'facturas_cxp',
      'facturas_cxc',
      'oc_items',
      'ordenes_compra',
      'proveedores',
      'actividades_pipeline',
      'movimientos_stock',
      'cotizacion_items',
      'cotizaciones',
      'pedidos',
      'clientes',
    ]
    const clean = db.transaction(() => {
      for (const t of TEST_TABLES) {
        counts[t] = db.prepare(`SELECT COUNT(*) as n FROM ${t}`).get().n
        db.prepare(`DELETE FROM ${t}`).run()
      }
      counts['usuarios (no-admin)'] = db.prepare(
        "SELECT COUNT(*) as n FROM usuarios WHERE email != 'admin@rmgautoparts.cl'"
      ).get().n
      db.prepare("DELETE FROM usuarios WHERE email != 'admin@rmgautoparts.cl'").run()
      db.prepare('INSERT INTO _migrations (id) VALUES (?)').run('clean_test_data_v1')
    })
    clean()
    console.log('✅ Migración clean_test_data_v1 — registros eliminados:')
    for (const [tabla, n] of Object.entries(counts)) {
      if (n > 0) console.log(`   ${tabla}: ${n}`)
    }
  }

  // Migration 2: sembrar los 223 SKUs reales (INSERT OR IGNORE — no sobreescribe existentes)
  const m2 = db.prepare('SELECT id FROM _migrations WHERE id = ?').get('catalog_223_v1')
  if (!m2) {
    const ins = db.prepare(`
      INSERT OR IGNORE INTO productos
        (id, codigo, marca, descripcion, categoria, unidad,
         precio_costo, precio_b2b_base, margen_objetivo, stock_actual, stock_minimo)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `)
    const seed223 = db.transaction(() => {
      let inserted = 0
      for (const [codigo, marca, desc, cat, und, costo, b2b, stock, margen] of CATALOG_223) {
        const r = ins.run(uuidv4(), codigo, marca, desc, cat, und, costo, b2b, margen, stock, 5)
        inserted += r.changes
      }
      db.prepare('INSERT INTO _migrations (id) VALUES (?)').run('catalog_223_v1')
      return inserted
    })
    const inserted = seed223()
    const skipped = CATALOG_223.length - inserted
    console.log(`✅ Migración catalog_223_v1 — ${inserted} SKUs nuevos insertados, ${skipped} ya existían`)
  }

  // Migration 3: pricing_v2 — multi-proveedor + benchmarks de mercado
  const m3 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('pricing_v2')
  if (!m3) {
    // DDL: columna cluster_key en productos (idempotente)
    const cols = db.prepare('PRAGMA table_info(productos)').all()
    if (!cols.some(c => c.name === 'cluster_key')) {
      db.exec('ALTER TABLE productos ADD COLUMN cluster_key TEXT')
    }

    // DDL: nuevas tablas
    db.exec(`
      CREATE TABLE IF NOT EXISTS proveedores_sku (
        id TEXT PRIMARY KEY,
        sku_codigo TEXT NOT NULL REFERENCES productos(codigo),
        proveedor_nombre TEXT NOT NULL,
        costo_neto REAL NOT NULL,
        condicion_pago TEXT DEFAULT 'credito' CHECK(condicion_pago IN ('contado','credito')),
        es_activo INTEGER DEFAULT 0,
        fecha_actualizacion TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_psku_codigo ON proveedores_sku(sku_codigo);

      CREATE TABLE IF NOT EXISTS cluster_referencia_mercado (
        id TEXT PRIMARY KEY,
        linea TEXT NOT NULL CHECK(linea IN ('neumaticos','baterias','lubricantes')),
        cluster_key TEXT NOT NULL UNIQUE,
        precio_mercado_min REAL,
        precio_mercado_max REAL,
        fuente TEXT,
        fecha_actualizacion TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_crm_key ON cluster_referencia_mercado(cluster_key);
    `)

    // DML: datos dentro de una transacción
    const seedPricingV2 = db.transaction(() => {
      // Migrar proveedor inicial desde cada producto existente
      const prods = db.prepare('SELECT id, codigo, marca, descripcion, categoria, precio_costo FROM productos WHERE activo = 1').all()
      const insProveedor = db.prepare(`
        INSERT OR IGNORE INTO proveedores_sku (id, sku_codigo, proveedor_nombre, costo_neto, condicion_pago, es_activo)
        VALUES (?,?,?,?,?,1)
      `)
      for (const p of prods) {
        insProveedor.run(uuidv4(), p.codigo, p.marca, p.precio_costo, 'credito')
        const ck = extractClusterKey(p.categoria, p.descripcion)
        db.prepare('UPDATE productos SET cluster_key = ? WHERE id = ?').run(ck, p.id)
      }

      // Sembrar precios de mercado validados (jun-2026)
      const insCluster = db.prepare(`
        INSERT OR IGNORE INTO cluster_referencia_mercado
          (id, linea, cluster_key, precio_mercado_min, precio_mercado_max, fuente)
        VALUES (?,?,?,?,?,?)
      `)
      const SEED_CLUSTERS = [
        ['neumaticos', '215/70R16',    121500, 162000, 'Autoplanet/Neumafast jun-2026'],
        ['neumaticos', '205/60R16',     44990,  62990, 'Fullneumaticos (tier económico) jun-2026'],
        ['baterias',   'NS40ZL',        67287,  70271, 'Covepa/Razazi jun-2026'],
        ['baterias',   '90AMP',         89900, 129000, 'Tienda Salfa/AutoPlanet/Razazi jun-2026'],
        ['lubricantes','5W30-ACEA-C3',  10900,  27500, 'KIXX/Just Oil (tier económico) jun-2026'],
      ]
      for (const [linea, key, min, max, fuente] of SEED_CLUSTERS) {
        insCluster.run(uuidv4(), linea, key, min, max, fuente)
      }

      db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('pricing_v2')
      return prods.length
    })
    const total = seedPricingV2()
    console.log(`✅ Migración pricing_v2 — ${total} SKUs con proveedor+cluster_key, 5 clusters sembrados`)
  }

  // Migration 4: prospection_v1 — tabla pipeline_contactos + 45 prospectos reales
  const m4 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('prospection_v1')
  if (!m4) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pipeline_contactos (
        id TEXT PRIMARY KEY,
        empresa TEXT NOT NULL,
        segmento TEXT NOT NULL,
        rubro_especialidad TEXT,
        nombre_contacto TEXT,
        cargo TEXT,
        telefono_empresa TEXT,
        telefono_contacto TEXT,
        email TEXT,
        direccion TEXT,
        comuna TEXT,
        region TEXT DEFAULT 'RM',
        prioridad TEXT DEFAULT 'media' CHECK(prioridad IN ('alta','media','baja')),
        notas TEXT,
        etapa TEXT DEFAULT 'prospecto' CHECK(etapa IN ('prospecto','contacto','visita','propuesta','cliente')),
        estado TEXT DEFAULT 'activo' CHECK(estado IN ('activo','descartado')),
        fuente TEXT DEFAULT 'Prospección jun-2026',
        fecha_creacion TEXT DEFAULT (datetime('now')),
        fecha_ultima_actualizacion TEXT DEFAULT (datetime('now')),
        responsable TEXT DEFAULT 'admin'
      );
      CREATE INDEX IF NOT EXISTS idx_pc_etapa ON pipeline_contactos(etapa);
      CREATE INDEX IF NOT EXISTS idx_pc_segmento ON pipeline_contactos(segmento);
      CREATE INDEX IF NOT EXISTS idx_pc_estado ON pipeline_contactos(estado);
    `)

    const PROSPECTOS_45 = [
      // 15 Talleres
      ['Taller Mecánico KENO','taller','Mecánica general y preventiva','Dueño / Encargado','Propietario','+56 9 9519 5135','+56 9 9519 5135','contacto@tallerkeno.cl','Miguel León Prado 379','Santiago','Metropolitana','alta','Rating 4.9★. Cambio de aceite recurrente. Potencial volumen mensual de lubricantes.'],
      ['Europa Mechanical','taller','Mecánica automotriz multimarca','Encargado Comercial','Jefe de Taller','+56 9 2208 4992','+56 9 5446 3588','contacto@europamechanical.cl','Nataniel Cox 949','Santiago Centro','Metropolitana','alta','Multimarca, 25+ años. Abierto 7 días. Alta rotación de lubricantes y filtros.'],
      ['Mekano Autos Taller','taller','Reparación y mantención','Por confirmar','Administrador','+56 2 2555 1814','+56 2 2555 1814','info@mekanoautos.cl','Portugal 1536','Santiago','Metropolitana','media','Rating 4.6★. Amplio volumen de vehículos diarios. Requiere lubricantes y baterías.'],
      ['Medelauto Servicio Automotriz','taller','Mecánica, frenos, mantención km','Por confirmar','Gerente / Dueño','+56 2 2699 0117','+56 2 2699 0117','info@medelauto.cl','Mapocho 2199','Santiago','Metropolitana','alta','En mercado desde 1968. Clientela fidelizada. Alta demanda de lubricantes.'],
      ['AutoGálvez Lubricentro','taller','Lubricantes y mecánica general','Por confirmar','Jefe Lubricentro','+56 9 0000 0001','+56 9 0000 0001','contacto@autogalvez.cl','Av. Lo Blanco 5521','La Pintana','Metropolitana','alta','Especializado en lubricantes. Fit perfecto con propuesta RMG. Zona sur Santiago.'],
      ['Ameva Works Servicio Automotriz','taller','Scanner, lubricantes, mantención','Por confirmar','Administrador','+56 2 0000 0002','+56 2 0000 0002','contacto@amevaworks.cl','Av. Mapocho 3075','Santiago','Metropolitana','media','Servicio adhesivos, scanner, lubricantes. Compra frecuente de insumos.'],
      ['Taller RMH Alineación y Balanceo','taller','Lubricentro, alineación, neumáticos','Dueño','Propietario','+56 9 9694 0930','+56 9 9694 0930','contacto@tallerrmh.cl','Av. Uruguay 126','Rancagua',"O'Higgins",'alta','Lubricentro propio + venta neumáticos. Fit inmediato. 2 sucursales.'],
      ['Scanner Automotriz Rancagua','taller','Diagnóstico, reparación, mantención','Por confirmar','Encargado','+56 9 8445 1834','+56 9 8445 1834','contacto@scannerauto.cl','Kennedy 1427','Rancagua',"O'Higgins",'media','Rating 4.6★. Especialidad en diagnóstico multimarca. Clientela fija.'],
      ['Taller Automotriz JC Graneros','taller','Mecánica general, servicio a domicilio','Por confirmar','Propietario','+56 9 3525 3400','+56 9 3525 3400','info@automotrizjc.cl','Graneros (cobertura Rancagua)','Graneros',"O'Higgins",'media',"Servicio a domicilio en R.Metropolitana de O'Higgins. Oportunidad para baterías."],
      ['Vegaartus Taller Oficial','taller','Reparación oficial multimarca','Diego Astorga / Rodrigo Vivero','Ejecutivos de Taller','+56 72 0000 001','+56 72 0000 001','contacto@vegaartus.cl','Av. Miguel Ramírez 199','Rancagua',"O'Higgins",'alta','Taller oficial con ejecutivos identificados. Compras periódicas de lubricantes.'],
      ['SCAuto Servicio Técnico','taller','Mecánica general, GPS, electricidad','Por confirmar','Jefe de Taller','+56 9 0000 0003','+56 9 0000 0003','contacto@scauto.cl','Koke 398','Rancagua',"O'Higgins",'media','Servicio completo. Instalación alarmas/GPS. Buen candidato para baterías.'],
      ['Taller Automotriz Torres','taller','Mecánica general y reparaciones','Por confirmar','Propietario','+56 9 7978 7269','+56 9 7978 7269','contacto@tallerestorres.cl','Gral. Carreño 2580996','Viña del Mar','Valparaíso','alta','Rating 4.5★. Lun-Sáb. Rotación de lubricantes y filtros.'],
      ['Iconotecno Taller Automotriz','taller','Reparación y mantención vehículos','Por confirmar','Encargado','+56 9 6322 2368','+56 9 6322 2368','contacto@iconotecno.cl','22 Nte. 1290','Viña del Mar','Valparaíso','media','Rating 4.4★. Horario amplio. Potencial en lubricantes y neumáticos.'],
      ['Central Embragues y Frenos','taller','Frenos, scanner, desabolladura','Por confirmar','Administrador','+56 32 0000 001','+56 32 0000 001','contacto@centralembraguesfrenos.cl','Alemparte 290','Quilpué','Valparaíso','media','Especialidad frenos. Requiere lubricantes de freno y kits. Doble cobertura Quilpué-Antofagasta.'],
      ['Taller Villa Alemana Automotriz','taller','Mecánica integral, análisis de gases','Por confirmar','Dueño','+56 32 295 3300','+56 32 295 3300','info@villalemanaautomotriz.cl','Av. Valparaíso 1380','Villa Alemana','Valparaíso','media','Rating 5.0★. Mecánica integral. Zona con crecimiento automotriz.'],
      // 10 Flotas
      ['SOTRASER S.A.','flota','Transporte de carga, +600 camiones','Gerente de Operaciones','Gerente Operaciones','+56 2 2000 0016','+56 9 0000 0016','operaciones@sotraser.cl','Av. El Salto (casa matriz)','Huechuraba','Metropolitana','alta','Flota 600+ camiones. Demanda masiva lubricantes y neumáticos. Negociación a nivel corporativo.'],
      ['Transportes Leonardo Avello','flota','Transporte carga nacional','Leonardo Avello','Propietario / Gerente','+56 9 7766 4266','+56 2 7766 4266','contacto@transportesavello.cl','Regina Gálvez 170','San Bernardo','Metropolitana','alta','15 años en rubro. Flota propia. Monitoreo 24H. Interés en lubricantes y baterías.'],
      ['Transportes Nazar','flota','Logística cadena frío, +1.000 vehículos','Gerente Flota','Gerente de Flota','+56 2 2000 0018','+56 2 2000 0018','flota@nazar.cl','Av. Industrial (casa matriz)','Pudahuel','Metropolitana','alta','Desde 1976. Flota 1.000+ vehículos. Contrato marco para lubricantes de alto volumen.'],
      ['Grandleasing Chile Ltda.','flota','Leasing operativo flotas corporativas','Eduardo Kraule Ayala','Gerente Control Gestión','+56 2 2000 0019','+56 9 0000 0019','ekraule@grandleasing.cl','Av. El Bosque Norte (Grupo Tur Bus)','Las Condes','Metropolitana','alta','Contacto identificado. Flota corporativa. Oportunidad para neumáticos y lubricantes en convenio.'],
      ['LogísticaChile.com','flota','Transporte y coordinación de cargas','Gerente Comercial','Gerente Comercial','+56 9 838 55255','+56 9 838 55255','info@logisticachile.com','Santiago','Santiago','Metropolitana','media','Flota diversa. Camiones, furgones, grúas. Potencial en lubricantes y neumáticos.'],
      ['Transportes Casablanca','flota','Distribución combustibles y carga','Gerente de Flota','Gerente Flota','+56 32 0000 002','+56 9 0000 0021','flota@tcasablanca.cl','Casablanca (Región Valparaíso)','Casablanca','Valparaíso','alta','Transporte de combustibles/lubricantes. Flota moderna. Eje estratégico V Región.'],
      ['Jorquera Transporte S.A.','flota','Transporte carretero nacional, carga pesada','Gerente de Flota','Gerente Flota','+56 41 2857 153','+56 9 0000 0022','operaciones@jtsa.cl','Watt 4819 Parque Industrial','Santiago (sucursal)','Metropolitana','alta','Fundada 1972. Múltiples sucursales. Flota pesada. Alto consumo lubricantes y neumáticos.'],
      ['Transportes Patagonia Express','flota','Mudanzas y carga consolidada','Por confirmar','Gerente','+56 9 4256 6033','+56 9 4256 6033','info@transportespatagoniaexpress.cl','Santiago','Santiago','Metropolitana','media','Operación nacional. Flota de camiones. Demanda periódica lubricantes y neumáticos.'],
      ['Empresa Transporte Carga V Región','flota','Traslados V Región a nivel nacional','Por confirmar','Propietario','+56 9 4087 8550','+56 9 4087 8550','info@cargavregion.cl','Valparaíso','Valparaíso','Valparaíso','media','Flota equipada V Región. Traslados norte-sur. Potencial en neumáticos de camión.'],
      ['Agroganadería y Transporte San (Colina)','flota','Transporte agrícola y carga','Por confirmar','Gerente Operativo','+56 2 0000 0025','+56 9 0000 0025','contacto@agtransporte.cl','Autopista Los Libertadores (Colina)','Colina','Metropolitana','media','Flota mixta agrícola-carga. Oportunidad lubricantes y baterías para temporada alta.'],
      // 10 Construcción
      ['Constructora Gardilcic','construccion','Obras civiles, minería, infraestructura','Rodrigo González','Gerente General','+56 72 0000 026','+56 9 0000 0026','rgnzalez@gardilcic.cl','Casa Matriz Rancagua (obras El Teniente)','Rancagua',"O'Higgins",'alta','Gran constructora. Flota maquinaria pesada. Contacto GG identificado. Alto consumo lubricantes.'],
      ['DLP Constructora','construccion','Construcción e inmobiliario, 40+ años','Gerente de Operaciones','Gerente Operaciones','+56 2 2000 0027','+56 9 0000 0027','operaciones@dlp.cl','Santiago (casa matriz)','Las Condes','Metropolitana','alta','40+ años de trayectoria. Proyectos activos Santiago y regiones. Flota camiones y maquinaria.'],
      ['S y S Ingeniería y Construcción','construccion','Construcción civil','Por confirmar','Gerente','+56 2 0000 0028','+56 9 0000 0028','contacto@ssingenieria.cl','Av. Senador Jaime Guzmán 365','Providencia','Metropolitana','media','Empresa activa en RM. Flota propia o subcontratada. Oportunidad lubricantes y baterías.'],
      ['Constructora Loncoñanco SPA','construccion','Gestión y administración de construcción','Por confirmar','Gerente General','+56 72 0000 029','+56 9 0000 0029','contacto@constructoralonconanco.cl','Rancagua','Rancagua',"O'Higgins",'media','Presencia Santiago, Valparaíso, Rancagua. Flota mixta. Potencial multi-zona.'],
      ['Constructora Rafer Ltda.','construccion','Obras civiles y construcción','Por confirmar','Gerente','+56 72 2221 258','+56 72 2221 258','contacto@rafer.cl','Calle Florencia 141','Rancagua',"O'Higgins",'media','Empresa radicada Rancagua. Camiones y maquinaria propios. Demanda lubricantes.'],
      ['Constructora Camino del Monte','construccion','Construcción residencial','Por confirmar','Gerente Obras','+56 2 0000 0031','+56 9 0000 0031','contacto@caminodelmonte.cl','Camino del Monte 5937 Alto Macul','La Florida','Metropolitana','baja','Constructora zona sur Santiago. Flota vehículos de obra. Inicio prospección.'],
      ['Constructora VCM','construccion','Movimiento tierras, arriendo maquinaria, caminos','Por confirmar','Propietario','+56 72 0000 032','+56 9 0000 0032','contacto@vcmconstructora.cl','Rancagua','Rancagua',"O'Higgins",'alta','Arriendo maquinaria + construcción. Alta demanda lubricantes para maquinaria pesada.'],
      ['Constructora Olivar (Longitudinal Sur)','construccion','Obras viales e infraestructura','Por confirmar','Jefe de Obras','+56 72 0000 033','+56 9 0000 0033','contacto@constructoraolivar.cl','Longitudinal Sur Km 89, Olivar','Olivar',"O'Higgins",'media',"Zona rural O'Higgins. Obras viales. Maquinaria pesada requiere lubricantes especiales."],
      ['Constructora Isabel La Católica','construccion','Edificación y obras civiles','Por confirmar','Gerente','+56 2 0000 0034','+56 9 0000 0034','contacto@constructorailc.cl','Av. Isabel La Católica 4175','Las Condes','Metropolitana','media','Constructora RM. Proyectos activos. Flota camionetas y camiones de obra.'],
      ['Constructora Valparaíso (CChC Socia)','construccion','Construcción regional V Región','Por confirmar','Gerente General','+56 32 0000 035','+56 9 0000 0035','contacto@constructoravina.cl','Valparaíso','Valparaíso','Valparaíso','media','Socia CChC. Flota de obra. Requiere lubricantes y neumáticos para maquinaria.'],
      // 10 Rentacar
      ['MITTA Rent-a-Car (Grupo Mitsui)','rentacar','Arriendo autos, leasing operativo, +30.000 veh.','Gerente de Flota / Mantención','Gerente Flota','+56 22 941 8950','+56 22 941 8950','flota@mitta.cl','Av. Américo Vespucio (múltiples sucursales)','Huechuraba','Metropolitana','alta','30.000+ vehículos. Mantenimiento preventivo permanente. Contrato corporativo lubricantes/baterías.'],
      ['Econorent Car Rental','rentacar','Arriendo autos y camionetas, leasing','Gerente Comercial Empresas','Gerente Comercial','+56 2 0000 0037','+56 9 0000 0037','empresas@econorent.cl','Av. Américo Vespucio 115','Huechuraba','Metropolitana','alta','Flota diversa. Convenios corporativos. Mantención frecuente. Demanda lubricantes y baterías.'],
      ['Chilean Rent-A-Car','rentacar','Arriendo autos, flota nacional','Gerente de Operaciones','Gerente Operaciones','+56 2 0000 0038','+56 9 0000 0038','operaciones@chileanrentacar.cl','Curicó 360','Santiago Centro','Metropolitana','alta','Desde 1986. Sucursales aeropuerto y ciudad. Alta rotación de flota. Potencial lubricantes.'],
      ['Avis Chile','rentacar','Arriendo autos, flota nacional, convenios empresa','Gerente Cuenta Empresas','Key Account Manager','+56 2 2000 0039','+56 9 0000 0039','empresas@avis.cl','Aeropuerto AMB / Isidora Goyenechea 2897','Las Condes','Metropolitana','alta','Multinacional. Flota masiva. Contrato lubricantes y neumáticos a nivel corporativo.'],
      ['Hertz Chile','rentacar','Arriendo premium, flota nacional','Gerente de Flota Chile','Gerente Flota','+56 2 0000 0040','+56 9 0000 0040','flota@hertz.cl','Santiago (múltiples oficinas)','Santiago','Metropolitana','alta','Marca global. Flota premium. Mantención exigente. Oportunidad lubricantes de alta gama.'],
      ['Santiago Rent-a-Car','rentacar','Arriendo camionetas, lujo, flotas','Por confirmar','Gerente','+56 2 0000 0041','+56 9 0000 0041','contacto@santiagorentacar.com','Bellavista 0183','Providencia','Metropolitana','media','Flota diversa incluyendo camionetas. Requiere baterías y lubricantes periódicamente.'],
      ['Sixt Chile','rentacar','Arriendo autos premium, cobertura nacional','Gerente Comercial','Gerente Comercial','+56 2 0000 0042','+56 9 0000 0042','chile@sixt.com','Santiago (aeropuerto y ciudad)','Pudahuel','Metropolitana','media','Marca europea. Flota premium. Mantención preventiva estricta. Buena oportunidad.'],
      ["Rent-a-Car Rancagua (local)",'rentacar',"Arriendo vehículos zona O'Higgins",'Por confirmar','Propietario','+56 72 0000 043','+56 9 0000 0043','contacto@rentacarrancagua.cl','Rancagua','Rancagua',"O'Higgins",'media','Nicho regional. Flota media. Primera línea de abastecimiento local lubricantes/baterías.'],
      ['Rent-a-Car Viña del Mar','rentacar','Arriendo vehículos turismo y empresas','Por confirmar','Administrador','+56 32 0000 044','+56 9 0000 0044','contacto@rentacarvina.cl','Viña del Mar','Viña del Mar','Valparaíso','media','Turismo y empresas. Alta rotación temporada alta. Neumáticos y lubricantes frecuentes.'],
      ['MITTA Sucursal Rancagua / Valparaíso','rentacar','Sucursales regionales Grupo Mitsui','Encargado de Sucursal','Jefe de Sucursal','+56 72 941 8950','+56 32 941 8950','sucursal.rancagua@mitta.cl','Múltiples sucursales','Rancagua / Viña del Mar',"O'Higgins / Valparaíso",'alta','Parte del grupo MITTA. Misma decisión de compra corporativa. 80+ puntos en Chile.'],
    ]

    const seedProspeccion = db.transaction(() => {
      const ins = db.prepare(`
        INSERT INTO pipeline_contactos
          (id, empresa, segmento, rubro_especialidad, nombre_contacto, cargo,
           telefono_empresa, telefono_contacto, email, direccion, comuna, region,
           prioridad, notas, etapa, estado, fuente, responsable)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'prospecto','activo','Prospección jun-2026','admin')
      `)
      for (const [empresa, seg, rubro, contacto, cargo, telEmp, telCont, email, dir, comuna, region, prio, notas] of PROSPECTOS_45) {
        ins.run(uuidv4(), empresa, seg, rubro, contacto, cargo, telEmp, telCont, email || null, dir, comuna, region, prio, notas || null)
      }
      db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('prospection_v1')
      return PROSPECTOS_45.length
    })
    const total45 = seedProspeccion()
    console.log(`✅ Migración prospection_v1 — tabla pipeline_contactos creada, ${total45} prospectos insertados`)
  }

  // Migration 5: pricing_v2b — 3 clusters de batería faltantes
  const m5 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('pricing_v2b')
  if (!m5) {
    const seedClusters = db.transaction(() => {
      const ins = db.prepare(`
        INSERT OR IGNORE INTO cluster_referencia_mercado
          (id, linea, cluster_key, precio_mercado_min, precio_mercado_max, fuente)
        VALUES (?,?,?,?,?,?)
      `)
      const CLUSTERS_V2B = [
        ['baterias', '55D23L',   99990, 124305, 'Hankook/Hyundai/ACDelco/Femsaco jun-2026'],
        ['baterias', '55559',    99990, 109990, 'Hankook jun-2026'],
        ['baterias', 'NX120-7L', 79000, 107375, 'LOA/MSRepuestos/Beste/Easy jun-2026'],
      ]
      let inserted = 0
      for (const [linea, key, min, max, fuente] of CLUSTERS_V2B) {
        const r = ins.run(uuidv4(), linea, key, min, max, fuente)
        inserted += r.changes
      }
      db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('pricing_v2b')
      return inserted
    })
    const n = seedClusters()
    console.log(`✅ Migración pricing_v2b — ${n} nuevos clusters de batería sembrados`)
  }

  // Migration 6: pricing_v3 — volumen_litros en productos + corrección cluster 5W30-ACEA-C3 + NX120-7 + limpia 90AMP
  const m6 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('pricing_v3')
  if (!m6) {
    // Añadir columna volumen_litros si no existe
    const colsProd = db.prepare('PRAGMA table_info(productos)').all()
    if (!colsProd.some(c => c.name === 'volumen_litros')) {
      db.exec('ALTER TABLE productos ADD COLUMN volumen_litros REAL')
    }

    const migV3 = db.transaction(() => {
      // Poblar volumen_litros para todos los lubricantes
      const lubricantes = db.prepare(
        "SELECT id, descripcion FROM productos WHERE categoria = 'lubricante'"
      ).all()
      for (const p of lubricantes) {
        db.prepare('UPDATE productos SET volumen_litros = ? WHERE id = ?')
          .run(parseVolumenLitros(p.descripcion), p.id)
      }

      // Paso 3: corregir datos semilla 5W30-ACEA-C3 (ahora en $/L normalizados)
      db.prepare(`
        UPDATE cluster_referencia_mercado
        SET precio_mercado_min = ?, precio_mercado_max = ?, fuente = ?,
            fecha_actualizacion = datetime('now')
        WHERE cluster_key = ?
      `).run(7275, 10900, 'KIXX 1L / Just Oil 1gal jun-2026 (normalizado a $/L)', '5W30-ACEA-C3')

      // Paso 4: insertar cluster NX120-7 (sin sufijo L) si no existe
      db.prepare(`
        INSERT OR IGNORE INTO cluster_referencia_mercado
          (id, linea, cluster_key, precio_mercado_min, precio_mercado_max, fuente)
        VALUES (?,?,?,?,?,?)
      `).run(uuidv4(), 'baterias', 'NX120-7', 79000, 107375, 'LOA/MSRepuestos/Beste/Easy jun-2026')

      // Paso 5: eliminar cluster 90AMP si ningún producto lo referencia
      const uso90 = db.prepare(
        "SELECT COUNT(*) as n FROM productos WHERE cluster_key = '90AMP'"
      ).get()
      if (!uso90 || uso90.n === 0) {
        db.prepare("DELETE FROM cluster_referencia_mercado WHERE cluster_key = '90AMP'").run()
      }

      db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('pricing_v3')
      return lubricantes.length
    })
    const nLub = migV3()
    console.log(`✅ Migración pricing_v3 — volumen_litros calculado para ${nLub} lubricantes, cluster 5W30-ACEA-C3 corregido, NX120-7 insertado, 90AMP eliminado`)
  }

  // Migration 7: lista_precios_v1 — tabla maestra de precios RMG
  const m7 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('lista_precios_v1')
  if (!m7) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS lista_precios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        segmento_negocio TEXT, prioridad_consumo INTEGER, categoria TEXT,
        producto_generico TEXT, proveedor TEXT, marca TEXT, ranking_compra INTEGER,
        codigo_sku TEXT, descripcion TEXT, presentacion TEXT, tipo_envase TEXT,
        unidades_por_pack INTEGER, costo_pack_neto INTEGER, costo_unidad_neto INTEGER,
        precio_venta_neto INTEGER, margen_clp INTEGER, margen_pct REAL,
        mercado_min REAL, mercado_max REAL, holgura_mercado REAL,
        pct_min_mercado REAL, pct_max_mercado REAL
      );
      CREATE INDEX IF NOT EXISTS idx_lp_sku ON lista_precios(codigo_sku);
      CREATE INDEX IF NOT EXISTS idx_lp_proveedor ON lista_precios(proveedor);
    `)
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('lista_precios_v1')
    console.log('✅ Migración lista_precios_v1 — tabla lista_precios creada con índices')
  }

  // Migration 8: lista_precios_seed_v1 — carga inicial del CSV de precios
  const m8 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('lista_precios_seed_v1')
  if (!m8) {
    const csvPath = path.join(__dirname, '../../data/lista_precios.csv')
    if (fs.existsSync(csvPath)) {
      const lines = fs.readFileSync(csvPath, 'utf8').split('\n').filter(l => l.trim())
      const headers = lines[0].split(',').map(h => h.trim())
      const toInt = v => { const n = parseInt(v, 10); return isNaN(n) ? null : n }
      const toFloat = v => { const n = parseFloat(v); return isNaN(n) ? null : n }
      const toStr = v => (v && v.trim()) ? v.trim() : null

      const seedLP = db.transaction(() => {
        db.prepare('DELETE FROM lista_precios').run()
        const ins = db.prepare(`
          INSERT INTO lista_precios (
            segmento_negocio, prioridad_consumo, categoria, producto_generico,
            proveedor, marca, ranking_compra, codigo_sku, descripcion, presentacion,
            tipo_envase, unidades_por_pack, costo_pack_neto, costo_unidad_neto,
            precio_venta_neto, margen_clp, margen_pct,
            mercado_min, mercado_max, holgura_mercado, pct_min_mercado, pct_max_mercado
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `)
        let count = 0
        for (const line of lines.slice(1)) {
          const v = line.split(',')
          const r = {}
          headers.forEach((h, i) => { r[h] = (v[i] || '').trim() })
          ins.run(
            toStr(r.segmento_negocio), toInt(r.prioridad_consumo), toStr(r.categoria), toStr(r.producto_generico),
            toStr(r.proveedor), toStr(r.marca), toInt(r.ranking_compra), toStr(r.codigo_sku),
            toStr(r.descripcion), toStr(r.presentacion), toStr(r.tipo_envase), toInt(r.unidades_por_pack),
            toInt(r.costo_pack_neto), toInt(r.costo_unidad_neto), toInt(r.precio_venta_neto),
            toInt(r.margen_clp), toFloat(r.margen_pct),
            toFloat(r.mercado_min), toFloat(r.mercado_max), toFloat(r.holgura_mercado),
            toFloat(r.pct_min_mercado), toFloat(r.pct_max_mercado)
          )
          count++
        }
        db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('lista_precios_seed_v1')
        return count
      })
      const n = seedLP()
      console.log(`✅ Migración lista_precios_seed_v1 — ${n} filas importadas desde CSV`)
    } else {
      console.warn('⚠️  lista_precios_seed_v1: CSV no encontrado en', csvPath, '— importa manualmente con import_lista_precios.js')
    }
  }

  // Migration 9: gastos_v1 — tabla de gastos operacionales + flujo de caja
  const m9 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('gastos_v1')
  if (!m9) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS gastos (
        id TEXT PRIMARY KEY,
        fecha TEXT NOT NULL,
        categoria TEXT NOT NULL CHECK(categoria IN ('combustible','bodega','logistica','marketing','administrativo','otros')),
        descripcion TEXT NOT NULL,
        monto INTEGER NOT NULL,
        comprobante TEXT,
        fecha_pago TEXT,
        estado TEXT DEFAULT 'pagado' CHECK(estado IN ('pagado','pendiente')),
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS caja_movimientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL CHECK(tipo IN ('ingreso','egreso')),
        categoria TEXT,
        descripcion TEXT NOT NULL,
        monto INTEGER NOT NULL,
        fecha_registro TEXT,
        fecha_pago TEXT,
        estado TEXT DEFAULT 'proyectado' CHECK(estado IN ('proyectado','confirmado')),
        origen_tabla TEXT,
        origen_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_caja_tipo ON caja_movimientos(tipo);
      CREATE INDEX IF NOT EXISTS idx_caja_estado ON caja_movimientos(estado);
      CREATE INDEX IF NOT EXISTS idx_caja_origen ON caja_movimientos(origen_tabla, origen_id);
    `)
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('gastos_v1')
    console.log('✅ Migración gastos_v1 — tablas gastos y caja_movimientos creadas')
  }

  // Migration 10: erp_v1 — configuracion_mensual, pedido_items, notas_venta, nota_venta_items, cuenta_bancaria
  const m10 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('erp_v1')
  if (!m10) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS configuracion_mensual (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mes TEXT UNIQUE NOT NULL,
        meta_venta_total INTEGER DEFAULT 20000000,
        meta_talleres INTEGER DEFAULT 8000000,
        meta_flotas INTEGER DEFAULT 6000000,
        meta_concesionarios INTEGER DEFAULT 4000000,
        meta_construccion INTEGER DEFAULT 2000000,
        pct_crecimiento_m1 REAL DEFAULT 15,
        pct_crecimiento_m2 REAL DEFAULT 15,
        pct_crecimiento_m3 REAL DEFAULT 15,
        margen_objetivo_pct REAL DEFAULT 26,
        dias_credito_promedio INTEGER DEFAULT 30,
        presupuesto_gastos_operacionales INTEGER DEFAULT 2500000,
        stock_minimo_bateria INTEGER DEFAULT 5,
        stock_minimo_lubricante INTEGER DEFAULT 10,
        stock_minimo_neumatico INTEGER DEFAULT 8,
        dias_inactivo_cliente INTEGER DEFAULT 30,
        dias_alerta_cxc INTEGER DEFAULT 30,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS pedido_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pedido_id TEXT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
        codigo_sku TEXT,
        descripcion TEXT NOT NULL,
        cantidad INTEGER NOT NULL DEFAULT 1,
        precio_unitario INTEGER NOT NULL DEFAULT 0,
        descuento_pct REAL DEFAULT 0,
        subtotal INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS notas_venta (
        id TEXT PRIMARY KEY,
        numero TEXT UNIQUE NOT NULL,
        pedido_id TEXT REFERENCES pedidos(id),
        cliente_id TEXT REFERENCES clientes(id),
        cliente TEXT,
        neto INTEGER DEFAULT 0,
        iva INTEGER DEFAULT 0,
        total INTEGER DEFAULT 0,
        condicion_pago TEXT DEFAULT 'Contado',
        metodo_pago TEXT CHECK(metodo_pago IN ('efectivo','transferencia','credito')),
        cuenta_bancaria TEXT DEFAULT '1781310106 Banco de Chile',
        estado_pago TEXT DEFAULT 'pendiente' CHECK(estado_pago IN ('pendiente','pagado')),
        fecha_pago TEXT,
        notas TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS nota_venta_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nota_id TEXT NOT NULL REFERENCES notas_venta(id) ON DELETE CASCADE,
        codigo_sku TEXT,
        descripcion TEXT NOT NULL,
        cantidad INTEGER NOT NULL DEFAULT 1,
        precio_unitario INTEGER NOT NULL DEFAULT 0,
        descuento_pct REAL DEFAULT 0,
        subtotal INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido ON pedido_items(pedido_id);
      CREATE INDEX IF NOT EXISTS idx_notas_venta_pedido ON notas_venta(pedido_id);
      CREATE INDEX IF NOT EXISTS idx_nota_items_nota ON nota_venta_items(nota_id);
    `)
    // Add cuenta_bancaria to caja_movimientos if not present
    const cajaCols = db.prepare('PRAGMA table_info(caja_movimientos)').all().map(c => c.name)
    if (!cajaCols.includes('cuenta_bancaria')) {
      db.exec("ALTER TABLE caja_movimientos ADD COLUMN cuenta_bancaria TEXT DEFAULT '1781310106 Banco de Chile'")
    }
    // Seed current month config with Zustand defaults
    const mesActual = new Date().toISOString().slice(0, 7)
    db.prepare(`
      INSERT OR IGNORE INTO configuracion_mensual (mes) VALUES (?)
    `).run(mesActual)
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('erp_v1')
    console.log('✅ Migración erp_v1 — configuracion_mensual, pedido_items, notas_venta, nota_venta_items, caja cuenta_bancaria')
  }

  // Migration 11: stock_seed_v1 — set stock_actual = 10 on all productos
  const m11 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('stock_seed_v1')
  if (!m11) {
    db.prepare("UPDATE productos SET stock_actual = 10").run()
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('stock_seed_v1')
    console.log('✅ Migración stock_seed_v1 — stock_actual = 10 en todos los productos')
  }

  // Migration 12: catalogo_campos_v1 — rubro + aplicacion en lista_precios
  const m12 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('catalogo_campos_v1')
  if (!m12) {
    const cols12 = db.prepare('PRAGMA table_info(lista_precios)').all()
    if (!cols12.some(c => c.name === 'rubro')) db.exec('ALTER TABLE lista_precios ADD COLUMN rubro TEXT')
    if (!cols12.some(c => c.name === 'aplicacion')) db.exec('ALTER TABLE lista_precios ADD COLUMN aplicacion TEXT')
    // Populate rubro from segmento_negocio
    db.prepare(`UPDATE lista_precios SET rubro = CASE
      WHEN segmento_negocio = 'Talleres' THEN 'Talleres'
      WHEN segmento_negocio = 'Concesionarios' THEN 'Concesionarios'
      WHEN segmento_negocio = 'Flotas' THEN 'Flotas'
      WHEN segmento_negocio = 'Construccion (agro)' THEN 'Agricola'
      WHEN segmento_negocio = 'Construccion' THEN 'Construccion'
      WHEN segmento_negocio = 'Industria' THEN 'Industria'
      WHEN segmento_negocio = 'Venta Libre (No Especifico)' AND marca = 'AUSTER' THEN 'Flotas,Talleres'
      ELSE 'Talleres,Concesionarios'
    END WHERE rubro IS NULL`).run()
    // Populate aplicacion from categoria + descripcion
    db.prepare(`UPDATE lista_precios SET aplicacion = CASE
      WHEN categoria = 'neumatico' AND (descripcion LIKE '%R22.5%' OR descripcion LIKE '%17.5R%' OR descripcion LIKE '%295/80%' OR descripcion LIKE '%315/80%' OR descripcion LIKE '%1200 R%' OR descripcion LIKE '%11 R22%' OR descripcion LIKE '%12 R22%' OR descripcion LIKE '%13 R22%') THEN 'camion_flota'
      WHEN categoria = 'neumatico' AND (descripcion LIKE '30X%' OR descripcion LIKE '31X%' OR descripcion LIKE '27X%') THEN 'maquinaria_agricola'
      WHEN categoria = 'neumatico' THEN 'liviano'
      WHEN categoria = 'lubricante' AND (descripcion LIKE '%HYDRO%' OR descripcion LIKE '%ISO 46%' OR descripcion LIKE '%ISO 68%' OR descripcion LIKE '%GREASE%' OR descripcion LIKE '%LITHIUM%') THEN 'industrial'
      WHEN categoria = 'lubricante' AND (descripcion LIKE '%15W40%' OR descripcion LIKE '%15W-40%' OR descripcion LIKE '%CK-4%' OR descripcion LIKE '%CK4%' OR descripcion LIKE '%80W90%' OR descripcion LIKE '%80W-90%' OR descripcion LIKE '%75W90%' OR descripcion LIKE '%75W-90%') THEN 'camion_flota'
      WHEN categoria = 'lubricante' THEN 'liviano'
      WHEN categoria = 'bateria' AND (descripcion LIKE '%N100%' OR descripcion LIKE '%N120%' OR descripcion LIKE '%N150%' OR descripcion LIKE '%N200%' OR descripcion LIKE '%180 A%') THEN 'camion_flota'
      WHEN categoria = 'bateria' THEN CASE
        WHEN CAST(SUBSTR(descripcion, INSTR(descripcion, ' ') + 1, 3) AS INTEGER) >= 70 THEN 'camion_flota'
        ELSE 'liviano'
      END
      ELSE 'liviano'
    END WHERE aplicacion IS NULL`).run()
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('catalogo_campos_v1')
    console.log('✅ Migración catalogo_campos_v1 — rubro y aplicacion añadidos a lista_precios')
  }

  // Migration 13: landing_tables_v1 — tablas propias para landing (desacopladas del ERP)
  const m13 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('landing_tables_v1')
  if (!m13) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS landing_productos (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        familia       TEXT,
        subfamilia    TEXT,
        descripcion   TEXT,
        um            TEXT,
        presentacion  TEXT,
        precio        REAL,
        detalles_tecnicos TEXT,
        foto_path     TEXT,
        activo        INTEGER DEFAULT 1,
        orden         INTEGER DEFAULT 0,
        created_at    TEXT DEFAULT (datetime('now')),
        updated_at    TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS landing_banners (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        foto_path TEXT,
        orden     INTEGER DEFAULT 0,
        activo    INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `)
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('landing_tables_v1')
    console.log('✅ Migración landing_tables_v1 — tablas landing_productos y landing_banners creadas')
  }

  // Migration 14: landing_codigo_v1 — codigo y marca en landing_productos
  const m14 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('landing_codigo_v1')
  if (!m14) {
    const cols14 = db.prepare('PRAGMA table_info(landing_productos)').all().map(c => c.name)
    if (!cols14.includes('codigo')) db.exec('ALTER TABLE landing_productos ADD COLUMN codigo TEXT')
    if (!cols14.includes('marca'))  db.exec('ALTER TABLE landing_productos ADD COLUMN marca TEXT')
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('landing_codigo_v1')
    console.log('✅ Migración landing_codigo_v1 — codigo y marca añadidos a landing_productos')
  }

  // Migration 15: landing_subfamilias_v1
  const m15 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('landing_subfamilias_v1')
  if (!m15) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS landing_subfamilias (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        familia     TEXT NOT NULL,
        nombre      TEXT NOT NULL,
        foto_path   TEXT,
        descripcion TEXT,
        orden       INTEGER DEFAULT 0,
        activo      INTEGER DEFAULT 1,
        created_at  TEXT DEFAULT (datetime('now')),
        updated_at  TEXT DEFAULT (datetime('now'))
      );
    `)
    const cols15 = db.prepare('PRAGMA table_info(landing_productos)').all().map(c => c.name)
    if (!cols15.includes('subfamilia_id')) {
      db.exec('ALTER TABLE landing_productos ADD COLUMN subfamilia_id INTEGER')
    }
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('landing_subfamilias_v1')
    console.log('✅ Migración landing_subfamilias_v1 — tabla landing_subfamilias + subfamilia_id en landing_productos')
  }
}

// ─── Seed inicial (solo para bases de datos nuevas) ───────────────────────────
function seedData() {
  const row = db.prepare('SELECT COUNT(*) as n FROM usuarios').get()
  if (row && row.n > 0) return

  db.transaction(() => {
    db.prepare(`
      INSERT INTO usuarios (id, email, password_hash, nombre, telefono, rol)
      VALUES (?,?,?,?,?,?)
    `).run(
      'a1b2c3d4-0000-0000-0000-000000000001',
      'admin@rmgautoparts.cl',
      bcrypt.hashSync('rmg2026', 10),
      'Gerente RMG',
      '+56 9 1234 5678',
      'admin'
    )
  })()
  console.log('✅ Usuario admin creado (base de datos nueva)')
}

// ─── Init async (sql.js requiere carga WASM) ──────────────────────────────────
async function initDB() {
  const SQL = await initSqlJs({
    locateFile: file => path.join(path.dirname(require.resolve('sql.js')), file),
  })

  let sqlJsDb
  if (fs.existsSync(DB_PATH)) {
    sqlJsDb = new SQL.Database(fs.readFileSync(DB_PATH))
  } else {
    sqlJsDb = new SQL.Database()
  }

  db._db = sqlJsDb
  db.pragma('foreign_keys = ON')
  initSchema()
  runMigrations()
  seedData()
}

module.exports = { db, initDB, uuidv4, extractClusterKey, parseVolumenLitros }
