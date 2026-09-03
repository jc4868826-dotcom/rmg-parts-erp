const initSqlJs = require('sql.js')
const path = require('path')
const fs = require('fs')
const { v4: uuidv4 } = require('uuid')
const bcrypt = require('bcryptjs')

const DB_PATH = process.env.DB_PATH || '/var/data/rmg_parts.db'

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
    const data = this._db.export()   // Uint8Array — fs.writeFileSync lo acepta directamente
    if (data.length < 100) {
      console.error('⚠️ DB export inválido (buffer < 100 bytes), guardado cancelado')
      return
    }
    const tmp = DB_PATH + '.tmp'
    try {
      fs.writeFileSync(tmp, data)
      fs.renameSync(tmp, DB_PATH)
    } catch (e) {
      console.error('⚠️ Error guardando DB:', e.message)
      try { fs.unlinkSync(tmp) } catch (_) {}
    }
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
      rol TEXT DEFAULT 'ventas' CHECK(rol IN ('admin','ventas','bodega','cliente','gerente')),
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

  // Migration 16: landing_familias_v1 — fotos de las 3 familias padre
  const m16 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('landing_familias_v1')
  if (!m16) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS landing_familias (
        familia    TEXT PRIMARY KEY,
        foto_path  TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `)
    const stmt = db.prepare("INSERT OR IGNORE INTO landing_familias (familia) VALUES (?)")
    stmt.run('NEUMATICOS')
    stmt.run('BATERIAS')
    stmt.run('LUBRICANTES')
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('landing_familias_v1')
    console.log('✅ Migración landing_familias_v1 — tabla landing_familias con 3 filas iniciales')
  }

  // Migration 17: landing_base64_v1 — foto_base64 y foto_mimetype en las 4 tablas
  const m17 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('landing_base64_v1')
  if (!m17) {
    const LT = ['landing_familias', 'landing_subfamilias', 'landing_productos', 'landing_banners']
    for (const t of LT) {
      const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name)
      if (!cols.includes('foto_base64'))   db.exec(`ALTER TABLE ${t} ADD COLUMN foto_base64 TEXT`)
      if (!cols.includes('foto_mimetype')) db.exec(`ALTER TABLE ${t} ADD COLUMN foto_mimetype TEXT`)
    }
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('landing_base64_v1')
    console.log('✅ Migración landing_base64_v1 — foto_base64 y foto_mimetype añadidos a tablas landing')
  }

  // Migration 18: landing_familias_descripcion_v1 — campo descripcion en familias padre
  const m18 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('landing_familias_descripcion_v1')
  if (!m18) {
    const cols = db.prepare('PRAGMA table_info(landing_familias)').all().map(c => c.name)
    if (!cols.includes('descripcion')) db.exec('ALTER TABLE landing_familias ADD COLUMN descripcion TEXT')
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('landing_familias_descripcion_v1')
    console.log('✅ Migración landing_familias_descripcion_v1 — columna descripcion añadida a landing_familias')
  }

  // Migration 19: landing_productos_nombre_v1 — campo nombre en landing_productos
  const m19 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('landing_productos_nombre_v1')
  if (!m19) {
    const cols = db.prepare('PRAGMA table_info(landing_productos)').all().map(c => c.name)
    if (!cols.includes('nombre')) db.exec('ALTER TABLE landing_productos ADD COLUMN nombre TEXT')
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('landing_productos_nombre_v1')
    console.log('✅ Migración landing_productos_nombre_v1 — columna nombre añadida a landing_productos')
  }

  // Migration 20: landing_productos_contenido_v1 — campo contenido (texto largo) en landing_productos
  const m20 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('landing_productos_contenido_v1')
  if (!m20) {
    const cols = db.prepare('PRAGMA table_info(landing_productos)').all().map(c => c.name)
    if (!cols.includes('contenido')) db.exec('ALTER TABLE landing_productos ADD COLUMN contenido TEXT')
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('landing_productos_contenido_v1')
    console.log('✅ Migración landing_productos_contenido_v1 — columna contenido añadida a landing_productos')
  }

  // Migration 21: landing_productos_imagen_subtitulo_v1 — imagen_url y subtitulo para tarjetas visuales
  const m21 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('landing_productos_imagen_subtitulo_v1')
  if (!m21) {
    const cols = db.prepare('PRAGMA table_info(landing_productos)').all().map(c => c.name)
    if (!cols.includes('imagen_url')) db.exec('ALTER TABLE landing_productos ADD COLUMN imagen_url TEXT')
    if (!cols.includes('subtitulo'))  db.exec('ALTER TABLE landing_productos ADD COLUMN subtitulo TEXT')
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('landing_productos_imagen_subtitulo_v1')
    console.log('✅ Migración landing_productos_imagen_subtitulo_v1 — imagen_url y subtitulo añadidos a landing_productos')
  }

  // Migration 22: landing_productos_ficha_v1 — campos de ficha técnica individual
  const m22 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('landing_productos_ficha_v1')
  if (!m22) {
    const cols = db.prepare('PRAGMA table_info(landing_productos)').all().map(c => c.name)
    if (!cols.includes('sae'))               db.exec('ALTER TABLE landing_productos ADD COLUMN sae TEXT')
    if (!cols.includes('tipo'))              db.exec('ALTER TABLE landing_productos ADD COLUMN tipo TEXT')
    if (!cols.includes('aplicaciones'))      db.exec('ALTER TABLE landing_productos ADD COLUMN aplicaciones TEXT')
    if (!cols.includes('beneficios'))        db.exec('ALTER TABLE landing_productos ADD COLUMN beneficios TEXT')
    if (!cols.includes('presentaciones'))    db.exec('ALTER TABLE landing_productos ADD COLUMN presentaciones TEXT')
    if (!cols.includes('ficha_tecnica_url')) db.exec('ALTER TABLE landing_productos ADD COLUMN ficha_tecnica_url TEXT')
    if (!cols.includes('compatibilidad'))    db.exec('ALTER TABLE landing_productos ADD COLUMN compatibilidad TEXT')
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('landing_productos_ficha_v1')
    console.log('✅ Migración landing_productos_ficha_v1 — sae, tipo, aplicaciones, beneficios, presentaciones, ficha_tecnica_url, compatibilidad añadidos a landing_productos')
  }

  // Migration 23: erp_financiero_v1 — ventas, compras, compra_items + extend gastos
  const m23 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('erp_financiero_v1')
  if (!m23) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ventas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL,
        cliente_nombre TEXT,
        numero_documento TEXT,
        tipo_documento TEXT DEFAULT 'Nota de Venta',
        total REAL NOT NULL DEFAULT 0,
        costo_total REAL DEFAULT 0,
        estado TEXT DEFAULT 'Pendiente',
        forma_pago TEXT DEFAULT 'Contado',
        notas TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS venta_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venta_id INTEGER REFERENCES ventas(id) ON DELETE CASCADE,
        sku TEXT,
        descripcion TEXT,
        cantidad REAL,
        precio_unitario REAL,
        costo_unitario REAL DEFAULT 0,
        subtotal REAL
      );
      CREATE TABLE IF NOT EXISTS compras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL,
        proveedor TEXT NOT NULL,
        numero_oc TEXT,
        numero_factura TEXT,
        total REAL NOT NULL DEFAULT 0,
        estado TEXT DEFAULT 'Pendiente',
        fecha_vencimiento TEXT,
        notas TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS compra_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        compra_id INTEGER REFERENCES compras(id) ON DELETE CASCADE,
        sku TEXT,
        descripcion TEXT,
        cantidad REAL,
        costo_unitario REAL,
        subtotal REAL
      );
      CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);
      CREATE INDEX IF NOT EXISTS idx_compras_fecha ON compras(fecha);
    `)

    // Extend gastos with ERP columns (safe ALTER IF NOT EXISTS via pragma check)
    const gastosColsErp = db.prepare('PRAGMA table_info(gastos)').all().map(c => c.name)
    if (!gastosColsErp.includes('subcategoria'))  db.exec('ALTER TABLE gastos ADD COLUMN subcategoria TEXT')
    if (!gastosColsErp.includes('forma_pago'))    db.exec("ALTER TABLE gastos ADD COLUMN forma_pago TEXT DEFAULT 'Efectivo'")
    if (!gastosColsErp.includes('proveedor'))     db.exec('ALTER TABLE gastos ADD COLUMN proveedor TEXT')
    if (!gastosColsErp.includes('notas'))         db.exec('ALTER TABLE gastos ADD COLUMN notas TEXT')
    if (!gastosColsErp.includes('categoria_erp')) db.exec("ALTER TABLE gastos ADD COLUMN categoria_erp TEXT DEFAULT 'Variable'")

    // Seed datos de prueba julio 2026 si las tablas están vacías
    const nVentas = db.prepare('SELECT COUNT(*) as n FROM ventas').get().n
    if (nVentas === 0) {
      db.exec(`
        INSERT INTO ventas (fecha, cliente_nombre, numero_documento, tipo_documento, total, costo_total, estado, forma_pago, notas)
        VALUES
          ('2026-07-05', 'Taller Mecánico KENO', 'NV-001', 'Nota de Venta', 450000, 310000, 'Pagado', 'Transferencia', 'Venta lubricantes 5W30'),
          ('2026-07-12', 'SOTRASER S.A.', 'NV-002', 'Nota de Venta', 1200000, 850000, 'Pagado', 'Transferencia', 'Lote neumáticos camión'),
          ('2026-07-20', 'Constructora Gardilcic', 'NV-003', 'Factura', 680000, 480000, 'Pendiente', 'Crédito 30 días', 'Baterías y lubricantes')
      `)
      db.exec(`
        INSERT INTO venta_items (venta_id, sku, descripcion, cantidad, precio_unitario, costo_unitario, subtotal)
        VALUES
          (1, '240079', 'Lubricante KUMHO 5W30 1L', 10, 45000, 31000, 450000),
          (2, '240272', 'Neumático KUMHO 31X10.5 R15', 8, 150000, 106250, 1200000),
          (3, '244243', 'Batería NS40ZL', 4, 85000, 60000, 340000),
          (3, '240331', 'Lubricante 15W40 5L', 2, 170000, 120000, 340000)
      `)
    }

    const nCompras = db.prepare('SELECT COUNT(*) as n FROM compras').get().n
    if (nCompras === 0) {
      db.exec(`
        INSERT INTO compras (fecha, proveedor, numero_oc, numero_factura, total, estado, fecha_vencimiento, notas)
        VALUES
          ('2026-07-03', 'Cristian Hughes', 'OC-001', 'F-12345', 850000, 'Pagado', '2026-07-20', 'Lubricantes y filtros'),
          ('2026-07-10', 'Vistony', 'OC-002', 'F-56789', 1500000, 'Pendiente', '2026-08-09', 'Lote neumáticos KUMHO'),
          ('2026-07-18', 'SalfaSur', 'OC-003', null, 320000, 'Recibido', '2026-08-17', 'Baterías NS40ZL')
      `)
      db.exec(`
        INSERT INTO compra_items (compra_id, sku, descripcion, cantidad, costo_unitario, subtotal)
        VALUES
          (1, '240079', 'Lubricante 5W30 1L', 25, 31000, 775000),
          (1, '244248', 'Lubricante 15W40', 5, 15000, 75000),
          (2, '240272', 'Neumático 31X10.5 R15', 10, 115417, 1154170),
          (3, '244243', 'Batería NS40ZL', 4, 80000, 320000)
      `)
    }

    // Seed gastos ERP julio 2026 si no hay registros del mes
    const nGastosJul = db.prepare("SELECT COUNT(*) as n FROM gastos WHERE fecha LIKE '2026-07%'").get().n
    if (nGastosJul === 0) {
      db.prepare("INSERT INTO gastos (id, fecha, categoria, descripcion, monto, categoria_erp, subcategoria) VALUES (?,?,?,?,?,?,?)").run('erp-g1', '2026-07-01', 'administrativo', 'Arriendo bodega mensual', 350000, 'Fijo', 'Arriendo')
      db.prepare("INSERT INTO gastos (id, fecha, categoria, descripcion, monto, categoria_erp, subcategoria) VALUES (?,?,?,?,?,?,?)").run('erp-g2', '2026-07-05', 'marketing', 'Publicidad Facebook Ads julio', 120000, 'Variable', 'Marketing Digital')
      db.prepare("INSERT INTO gastos (id, fecha, categoria, descripcion, monto, categoria_erp, subcategoria) VALUES (?,?,?,?,?,?,?)").run('erp-g3', '2026-07-10', 'combustible', 'Combustible vehículo reparto', 85000, 'Variable', 'Transporte')
    }

    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('erp_financiero_v1')
    console.log('✅ Migración erp_financiero_v1 — ventas, venta_items, compras, compra_items + gastos extended')
  }

  // Migration 24: stock_reset_v1 — reset stock_actual = 0 en todos los productos
  const m24 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('stock_reset_v1')
  if (!m24) {
    db.prepare('UPDATE productos SET stock_actual = 0').run()
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('stock_reset_v1')
    console.log('✅ Migración stock_reset_v1 — stock_actual = 0 en todos los productos')
  }

  // Migration 25: gastos_reset_v1 — borrar todos los registros de gastos
  const m25 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('gastos_reset_v1')
  if (!m25) {
    db.prepare('DELETE FROM gastos').run()
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('gastos_reset_v1')
    console.log('✅ Migración gastos_reset_v1 — todos los registros de gastos eliminados')
  }

  // Migration 26: flujo_reset_v1 — borrar caja_movimientos (tabla real del flujo de caja)
  const m26 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('flujo_reset_v1')
  if (!m26) {
    db.prepare('DELETE FROM caja_movimientos').run()
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('flujo_reset_v1')
    console.log('✅ Migración flujo_reset_v1 — todos los movimientos de caja eliminados')
  }

  // Migration 27: prospeccion_origen_v1 — columna origen en pipeline_contactos
  const m27 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('prospeccion_origen_v1')
  if (!m27) {
    const pcCols = db.prepare('PRAGMA table_info(pipeline_contactos)').all().map(c => c.name)
    if (!pcCols.includes('origen')) {
      db.exec("ALTER TABLE pipeline_contactos ADD COLUMN origen TEXT DEFAULT 'Manual'")
    }
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('prospeccion_origen_v1')
    console.log('✅ Migración prospeccion_origen_v1 — columna origen en pipeline_contactos')
  }

  // Migration 28: oc_extra_cols_v1 — add missing columns to ordenes_compra
  const m28 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('oc_extra_cols_v1')
  if (!m28) {
    const ocCols = db.prepare('PRAGMA table_info(ordenes_compra)').all().map(c => c.name)
    if (!ocCols.includes('medio_pago'))        db.exec("ALTER TABLE ordenes_compra ADD COLUMN medio_pago TEXT DEFAULT 'Contado'")
    if (!ocCols.includes('numero_factura'))    db.exec('ALTER TABLE ordenes_compra ADD COLUMN numero_factura TEXT')
    if (!ocCols.includes('fecha_vencimiento')) db.exec('ALTER TABLE ordenes_compra ADD COLUMN fecha_vencimiento TEXT')
    if (!ocCols.includes('notas'))             db.exec('ALTER TABLE ordenes_compra ADD COLUMN notas TEXT')
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('oc_extra_cols_v1')
    console.log('✅ Migración oc_extra_cols_v1 — medio_pago, numero_factura, fecha_vencimiento, notas añadidos a ordenes_compra')
  }

  // Migration 29: compras_pago_v1 — oc_id, forma_pago, cuenta_bancaria, fecha_pago en compras
  const m29 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('compras_pago_v1')
  if (!m29) {
    const comprasCols = db.prepare('PRAGMA table_info(compras)').all().map(c => c.name)
    if (!comprasCols.includes('oc_id'))           db.exec('ALTER TABLE compras ADD COLUMN oc_id INTEGER')
    if (!comprasCols.includes('forma_pago'))      db.exec("ALTER TABLE compras ADD COLUMN forma_pago TEXT DEFAULT 'Transferencia'")
    if (!comprasCols.includes('cuenta_bancaria')) db.exec('ALTER TABLE compras ADD COLUMN cuenta_bancaria TEXT')
    if (!comprasCols.includes('fecha_pago'))      db.exec('ALTER TABLE compras ADD COLUMN fecha_pago TEXT')
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('compras_pago_v1')
    console.log('✅ Migración compras_pago_v1 — oc_id, forma_pago, cuenta_bancaria, fecha_pago añadidos a compras')
  }

  // Migration 30: oc_workflow_v1 — ampliar estados + columnas de flujo de autorización
  const m30 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('oc_workflow_v1')
  if (!m30) {
    // Recrear ordenes_compra con CHECK extendido y nuevas columnas (preservando datos)
    db.exec(`
      CREATE TABLE IF NOT EXISTS ordenes_compra_new (
        id TEXT PRIMARY KEY,
        numero TEXT UNIQUE NOT NULL,
        proveedor_id TEXT REFERENCES proveedores(id),
        proveedor TEXT,
        estado TEXT DEFAULT 'borrador',
        fecha_emision TEXT,
        fecha_entrega TEXT,
        neto REAL DEFAULT 0,
        iva REAL DEFAULT 0,
        total REAL DEFAULT 0,
        pagada INTEGER DEFAULT 0,
        factura_proveedor TEXT,
        medio_pago TEXT DEFAULT 'Contado',
        numero_factura TEXT,
        fecha_vencimiento TEXT,
        notas TEXT,
        fecha_autorizacion TEXT,
        autorizado_por TEXT,
        fecha_rechazo TEXT,
        motivo_rechazo TEXT,
        fecha_pago TEXT,
        forma_pago_oc TEXT,
        fecha_factura TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO ordenes_compra_new
        (id, numero, proveedor_id, proveedor, estado, fecha_emision, fecha_entrega,
         neto, iva, total, pagada, factura_proveedor, medio_pago, numero_factura,
         fecha_vencimiento, notas, created_at, updated_at)
        SELECT id, numero, proveedor_id, proveedor, estado, fecha_emision, fecha_entrega,
               neto, iva, total, pagada, factura_proveedor, medio_pago, numero_factura,
               fecha_vencimiento, notas, created_at, updated_at
        FROM ordenes_compra;
      DROP TABLE ordenes_compra;
      ALTER TABLE ordenes_compra_new RENAME TO ordenes_compra;
    `)
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('oc_workflow_v1')
    console.log('✅ Migración oc_workflow_v1 — ordenes_compra reconstruida con estados extendidos y columnas workflow')
  }

  // Migration 31: gerente_user_v1 — extender CHECK rol + crear usuario gerente
  const m31 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('gerente_user_v1')
  if (!m31) {
    // Recrear tabla usuarios con CHECK extendido (SQLite no soporta ALTER CHECK)
    db.exec(`
      CREATE TABLE IF NOT EXISTS usuarios_new (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        nombre TEXT NOT NULL,
        telefono TEXT,
        rol TEXT DEFAULT 'ventas' CHECK(rol IN ('admin','ventas','bodega','cliente','gerente')),
        activo INTEGER DEFAULT 1,
        ultimo_acceso TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO usuarios_new SELECT * FROM usuarios;
      DROP TABLE usuarios;
      ALTER TABLE usuarios_new RENAME TO usuarios;
    `)
    // Crear usuario gerente si no existe ninguno
    const hasGerente = db.prepare("SELECT COUNT(*) as n FROM usuarios WHERE rol = 'gerente'").get().n
    if (!hasGerente) {
      db.prepare(`INSERT INTO usuarios (id, email, password_hash, nombre, telefono, rol) VALUES (?,?,?,?,?,?)`)
        .run(uuidv4(), 'gerente@rmgautoparts.cl', bcrypt.hashSync('gerente2026', 10), 'Gerente RMG', '+56 9 0000 0002', 'gerente')
      console.log('✅ Migración gerente_user_v1 — usuario gerente creado (gerente@rmgautoparts.cl / gerente2026)')
    }
    // Safety net: columnas workflow en ordenes_compra
    try { db.exec('ALTER TABLE ordenes_compra ADD COLUMN forma_pago TEXT') } catch (_) {}
    try { db.exec('ALTER TABLE ordenes_compra ADD COLUMN fecha_autorizacion TEXT') } catch (_) {}
    try { db.exec('ALTER TABLE ordenes_compra ADD COLUMN autorizado_por TEXT') } catch (_) {}
    try { db.exec('ALTER TABLE ordenes_compra ADD COLUMN motivo_rechazo TEXT') } catch (_) {}
    try { db.exec('ALTER TABLE ordenes_compra ADD COLUMN fecha_pago TEXT') } catch (_) {}
    try { db.exec('ALTER TABLE ordenes_compra ADD COLUMN numero_factura TEXT') } catch (_) {}
    try { db.exec('ALTER TABLE ordenes_compra ADD COLUMN fecha_factura TEXT') } catch (_) {}
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('gerente_user_v1')
    console.log('✅ Migración gerente_user_v1 — tabla usuarios con rol gerente habilitado')
  }

  // Migration 32: clientes_v2 — nuevos campos + bitácora + seed 80 clientes
  const m32 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('clientes_v2')
  if (!m32) {
    const clientesCols = db.prepare('PRAGMA table_info(clientes)').all().map(c => c.name)
    if (!clientesCols.includes('dv'))      try { db.exec("ALTER TABLE clientes ADD COLUMN dv TEXT") } catch(_) {}
    if (!clientesCols.includes('ciudad'))  try { db.exec("ALTER TABLE clientes ADD COLUMN ciudad TEXT") } catch(_) {}
    if (!clientesCols.includes('celular')) try { db.exec("ALTER TABLE clientes ADD COLUMN celular TEXT") } catch(_) {}
    if (!clientesCols.includes('region'))  try { db.exec("ALTER TABLE clientes ADD COLUMN region TEXT") } catch(_) {}
    if (!clientesCols.includes('rubro'))   try { db.exec("ALTER TABLE clientes ADD COLUMN rubro TEXT") } catch(_) {}

    db.exec(`CREATE TABLE IF NOT EXISTS clientes_bitacora (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id TEXT NOT NULL,
      fecha TEXT DEFAULT (datetime('now','localtime')),
      tipo TEXT DEFAULT 'nota',
      contenido TEXT NOT NULL,
      usuario TEXT
    )`)

    const nClientes = db.prepare("SELECT COUNT(*) as n FROM clientes WHERE activo = 1").get().n
    if (nClientes < 5) {
      db.exec("DELETE FROM clientes")
      const insCliente = db.prepare(
        "INSERT OR IGNORE INTO clientes (id,rut,dv,razon_social,direccion,comuna,ciudad,telefono,email,celular,region,rubro,segmento,etapa_pipeline,activo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)"
      )
      const mapSeg = (rubro) => {
        if (!rubro) return 'flota'
        const r = rubro.toUpperCase()
        if (r.includes('CONSTRUCCION')) return 'construccion'
        return 'flota'
      }
      const clientes80 = [
        {rut:"76461668",dv:"5",nombre:"SOLUCIONES INDUSTRIALES",direccion:"LAS ESTERAS NORTE 2610",comuna:"QUILICURA",ciudad:"SANTIAGO",telefono:"976596238",email:"contacto@solustriales.cl",celular:"976596238",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"77752030",dv:"K",nombre:"COMERCIALIZADORA DE PRODUCTOS PARA LA MINERIA E INDUSTRIA LIMITADA",direccion:"14 de la Fama 2521",comuna:"CONCHALÍ",ciudad:"SANTIAGO",telefono:"",email:"wvilches@supplyrs.cl",celular:"56990995882",region:"METROPOLITANA",rubro:"IMPORTADORES DE MANGUERAS"},
        {rut:"76898830",dv:"7",nombre:"CONSTRUCTORA PETRA CIA",direccion:"El Pajal Esq Los Eucaliptus ote 12345 Sector lo Aguila",comuna:"CURACAVÍ",ciudad:"SANTIAGO",telefono:"",email:"mperez@constructotapetra.cl",celular:"958791242",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"76067865",dv:"1",nombre:"COMERCIALIZADORA DE PRODUCTOS INDUSTRIALES IPROTEC LTDA.",direccion:"GASPAR DE ORENSE Nº181",comuna:"ESTACIÓN CENTRAL",ciudad:"SANTIAGO",telefono:"22 5228300",email:"ventas@iprotec.cl",celular:"",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"81140300",dv:"8",nombre:"WILLIAMSON INDUSTRIAL S.A.",direccion:"SANTA MARTA Nº1501",comuna:"MAIPÚ",ciudad:"SANTIAGO",telefono:"223866200",email:"ehuerta@williamsonindustrial.cl",celular:"",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"96691680",dv:"K",nombre:"EMPRESA CONSTRUCTORA MENA Y OVALLE S.A.",direccion:"AV. APOQUINDO Nº3500 PISO 3",comuna:"LAS CONDES",ciudad:"SANTIAGO",telefono:"998756585",email:"juan.meza@menayovalle.cl",celular:"",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"76197308",dv:"8",nombre:"AGRICOLA BALLERINA CHILE LTDA",direccion:"CAMINO A LONQUEN 16240, SAN BERNARDO",comuna:"SAN BERNARDO",ciudad:"SANTIAGO",telefono:"+56 2 2925 3087",email:"paola.sanchez@ballerina.cl",celular:"+56 9 5959 1302",region:"METROPOLITANA",rubro:"AGRICOLA ALMENDRAS"},
        {rut:"76665858",dv:"K",nombre:"COMERCIALIZ. DE MATERIALES Y EQUIPOS INDUSTRIALES ANDES SPA",direccion:"EL CANELO 270",comuna:"QUILICURA",ciudad:"SANTIAGO",telefono:"",email:"contactos@maquinasandes.cl",celular:"932305240",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"77086730",dv:"4",nombre:"CVP CONSTRUCTORA E INMOBILIARIA LTDA.",direccion:"ALONSO DE CORDOVA N°2860 OF. 503",comuna:"VITACURA",ciudad:"SANTIAGO",telefono:"+56-2-22332831",email:"caguilar@cvp.cl",celular:"",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"76552670",dv:"1",nombre:"CONSTRUCTORA AUSTRAL S.A",direccion:"AV. DEL VALLE N°961 OF. 2710",comuna:"HUECHURABA",ciudad:"SANTIAGO",telefono:"",email:"rguerra@austral.la",celular:"",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"76722632",dv:"2",nombre:"ALGORITMO INDUSTRIAL SPA",direccion:"A Zanrtu 2546",comuna:"RENCA",ciudad:"SANTIAGO",telefono:"945875554",email:"gestion@algoritmoindustrial.cl",celular:"",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"99598420",dv:"2",nombre:"INDUSTRIAS PERFECT SA",direccion:"LOS LIBERTADORES 131",comuna:"COLINA",ciudad:"SANTIAGO",telefono:"56 932250457",email:"fherrera@elmasud.com",celular:"",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"76351987",dv:"2",nombre:"SERVICIOS SERVIBUS LTDA",direccion:"Americo vespucio 1367",comuna:"HUECHURABA",ciudad:"SANTIAGO",telefono:"",email:"paulina.flores@epysa.cl",celular:"958350334",region:"METROPOLITANA",rubro:"FLOTA BUSES"},
        {rut:"76006020",dv:"8",nombre:"COTRANS LIMITADA",direccion:"Los yacimientos 550",comuna:"MAIPÚ",ciudad:"SANTIAGO",telefono:"942876450",email:"omoreno@cotrans.cl",celular:"",region:"METROPOLITANA",rubro:"TRANSPORTE"},
        {rut:"84542800",dv:"K",nombre:"COMPAÑIA MINERA LA PATAGUA S.A.",direccion:"AV LAS CONDES 9460 OF 806",comuna:"LAS CONDES",ciudad:"SANTIAGO",telefono:"9 9539 4906",email:"raulvargas@lapatagua.cl",celular:"9 9539 4906",region:"METROPOLITANA",rubro:"MINERA"},
        {rut:"96503050",dv:"6",nombre:"AGRICOLA Y FRUTERA CURACAVI S.A",direccion:"RUTA 68, KM 42,5",comuna:"CURACAVÍ",ciudad:"SANTIAGO",telefono:"228352020",email:"sandra.ramirez@westfaliafruit.com",celular:"",region:"METROPOLITANA",rubro:"AGRICOLA Y FRUTERA"},
        {rut:"76033004",dv:"3",nombre:"CONSTRUCTORA SUKSA S.A",direccion:"ANDRES BELLO 2777 OF 2302",comuna:"SANTIAGO",ciudad:"SANTIAGO",telefono:"",email:"rperez@sukza.cl",celular:"56 9 4296 1103",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"77028217",dv:"9",nombre:"CHM CONSTRUCTORA SPA.",direccion:"CALLE SAN MARTIN N°3290 2°PISO",comuna:"MAIPÚ",ciudad:"SANTIAGO",telefono:"989094228",email:"chmconstructoraspa@gmail.com",celular:"",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"77972583",dv:"9",nombre:"V&J FABRICACION Y MONTAJE INDUSTRIAL SPA",direccion:"Antonio Bellet 193 1210",comuna:"PROVIDENCIA",ciudad:"SANTIAGO",telefono:"961111768",email:"j.clavero@vjingeneria.com",celular:"",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"76308449",dv:"3",nombre:"MAQUINARIAS Y EQUIPOS MGA LTDA",direccion:"Baron de juras reales 5290",comuna:"CONCHALÍ",ciudad:"SANTIAGO",telefono:"942980989",email:"r.jofre@maquinariasmga.cl",celular:"226242370",region:"METROPOLITANA",rubro:"RENTAL EQUIPOS PERFORACION"},
        {rut:"77119765",dv:"5",nombre:"CONSTRUCTORA FURA SPA",direccion:"GENERAL DEL CANTO N°50 OF. 301",comuna:"PROVIDENCIA",ciudad:"SANTIAGO",telefono:"",email:"sac@fura.cl",celular:"940030443",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"76879310",dv:"7",nombre:"COMERCIALIZADORA Y TRANSFORMADORA DE METALES SPA",direccion:"Santa Catalina de Chena 751",comuna:"SAN BERNARDO",ciudad:"SANTIAGO",telefono:"952249352",email:"victor.henriquez@ctmaceros.cl",celular:"",region:"METROPOLITANA",rubro:"TRANSPORTE"},
        {rut:"76983563",dv:"6",nombre:"PANZER INDUSTRIAL SPA",direccion:"PASAJE LAS BRISAS PONIENTE 2672 C17",comuna:"LAMPA",ciudad:"SANTIAGO",telefono:"932252768",email:"jeanpierre@panzerindustrial.cl",celular:"932252768",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"79840820",dv:"8",nombre:"CONSTRUCTORA POCURO SPA.",direccion:"NUEVA DE LYON 0145 PISO 13",comuna:"PROVIDENCIA",ciudad:"SANTIAGO",telefono:"963926304",email:"pbadilla@pocuro.cl",celular:"995831878",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"99582170",dv:"2",nombre:"EMPRESA CONSTRUCTORA CEMENTA S.A",direccion:"AV. VITACURA N°3568 OF. 213",comuna:"VITACURA",ciudad:"SANTIAGO",telefono:"999911465",email:"nsoto@cementa.cl",celular:"999911465",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"77465560",dv:"3",nombre:"FERRETERIA INDUSTRIAL GALIANO LTDA.",direccion:"BUZETA #4285",comuna:"CERRILLOS",ciudad:"SANTIAGO",telefono:"56 9 84098478",email:"ivann.galiano@gmail.com",celular:"",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"78779450",dv:"5",nombre:"SOCIEDAD TECNICA MINERA LTDA",direccion:"ANTONIO MACEO 2960",comuna:"RENCA",ciudad:"SANTIAGO",telefono:"+56990780878",email:"mcsoto@mysspa.com",celular:"",region:"METROPOLITANA",rubro:"MAQUINAS PARA MINERIA"},
        {rut:"76510226",dv:"K",nombre:"GTC ELECTRICIDAD INDUSTRIAL LTDA",direccion:"INDEPENDENCIA N°1443 OFICINA 206D",comuna:"INDEPENDENCIA",ciudad:"SANTIAGO",telefono:"",email:"gtc@gtc.tie.cl",celular:"",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"78198420",dv:"5",nombre:"ELASTOMEROS INDUSTRIALES LIMITADA",direccion:"HOEVEL # 4768",comuna:"QUINTA NORMAL",ciudad:"SANTIAGO",telefono:"3278400",email:"carlos@elastomeros.cl",celular:"",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"77959216",dv:"2",nombre:"Transervic SpA",direccion:"PJ. EMILIANO FIGUEROA 221 BARRIO MODELO",comuna:"TALAGANTE",ciudad:"SANTIAGO",telefono:"984553554",email:"transervic.rcalderon@gmail.com",celular:"984553554",region:"METROPOLITANA",rubro:"TRANSPORTE"},
        {rut:"77526800",dv:"K",nombre:"EMPRESA CONSTRUCTORA ECR LTDA",direccion:"RIQUELME 441",comuna:"EL BOSQUE",ciudad:"SANTIAGO",telefono:"56 947742675",email:"leonbm12@gmail.com",celular:"",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"77046730",dv:"6",nombre:"INMOBILIARIA Y CONSTRUCTORA NUEVA PACIFICO SUR S.A",direccion:"Petrohue 2790",comuna:"PEDRO AGUIRRE CERDA",ciudad:"SANTIAGO",telefono:"",email:"compras1@npasur.cl",celular:"977746067",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"77710017",dv:"3",nombre:"LEAN SOLUTIONS SUR INDUSTRIA Y COMERCIO SPA",direccion:"AMERICO VESPUCIO 1001 BODEGA 28",comuna:"QUILICURA",ciudad:"SANTIAGO",telefono:"56931423188",email:"adm@lsmodulares.cl",celular:"",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"76956435",dv:"7",nombre:"Constructora Daniel Molina Caceres EiRL",direccion:"Doctor sotero del rio 290 Casa t7 La Florida",comuna:"LA FLORIDA",ciudad:"SANTIAGO",telefono:"961077300",email:"danielmolina18@gmail.com",celular:"961077300",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"96755110",dv:"4",nombre:"TRANSWORLD POWER & TELCOM SPA.",direccion:"Calle nueva 1890",comuna:"HUECHURABA",ciudad:"SANTIAGO",telefono:"56992217420",email:"cpino@transworld.cl",celular:"56992217420",region:"METROPOLITANA",rubro:"TRANSPORTE"},
        {rut:"79885340",dv:"6",nombre:"EMPRESA CONSTRUCTORA GERARDO INFANTE Y CIA LTDA",direccion:"Los Militares 5885 of 401/402",comuna:"LAS CONDES",ciudad:"SANTIAGO",telefono:"56 9 4637 0310",email:"pvergara@altiplanochile.cl",celular:"56 9 4637 0310",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"76405479",dv:"2",nombre:"Sociedad Industrial y Comercial en Tecnologia de Alta Resistencia Ltda",direccion:"Agustinas 1022 Oficina 705",comuna:"SANTIAGO",ciudad:"SANTIAGO",telefono:"996360188",email:"claudia.carvajal@high-res.cl",celular:"996360188",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"96905450",dv:"7",nombre:"AGRICOLA ALIANZA S A",direccion:"Av. Nueva Providencia 1860 Of. 92",comuna:"PROVIDENCIA",ciudad:"SANTIAGO",telefono:"228169210",email:"jsoto@agricolasutil.cl",celular:"932409614",region:"METROPOLITANA",rubro:"AGRICOLA Y VITIVINICOLA"},
        {rut:"77075577",dv:"8",nombre:"INDUSTRIA METALMECANICA FLORES SPA.",direccion:"DOCTOR AMADOR NEGHME N°3639",comuna:"LA PINTANA",ciudad:"SANTIAGO",telefono:"227592412",email:"administracion@pjflores.cl",celular:"",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"76508064",dv:"9",nombre:"TRANSPORTES PLUSS CHILE GASPAR CIKUTOVIC MADARIAGA E.I.R.L",direccion:"SAN DE BORJA 18469",comuna:"ESTACIÓN CENTRAL",ciudad:"SANTIAGO",telefono:"940063600",email:"a.compras@plusschile.cl",celular:"",region:"METROPOLITANA",rubro:"TRANSPORTE"},
        {rut:"76265352",dv:"4",nombre:"CONSTRUCTORA EL LINGUE LIMITADA",direccion:"Luis carrera 1321, vitacura",comuna:"VITACURA",ciudad:"SANTIAGO",telefono:"56998290186",email:"jaimelorc@gmail.com",celular:"56998290186",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"86811700",dv:"1",nombre:"CONSTRUCTORA PEREZ Y GOMEZ LTDA",direccion:"EDUARDO FREY MONTALVA 3348",comuna:"RENCA",ciudad:"SANTIAGO",telefono:"",email:"jvera@copergo.cl",celular:"9491926212",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"76432224",dv:"K",nombre:"AST INDUSTRIAL LIMITADA.",direccion:"EL ALFALFA 471 BODEGA 95",comuna:"LAMPA",ciudad:"SANTIAGO",telefono:"",email:"marketing@ast-industrial.com",celular:"931120084",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"76012648",dv:"9",nombre:"FERRETERIA INDUSTRIAL Y MATERIALES DE CONSTRUCCION LTDA.",direccion:"PADRE VICENTE IRARRAZABAL Nº1011",comuna:"ESTACIÓN CENTRAL",ciudad:"SANTIAGO",telefono:"225920186",email:"ventas@ferrymat.cl",celular:"",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"96833820",dv:"K",nombre:"SERVICIOS LOGISTICOS DE ALMACENAJE TRANSPORTE Y DISTRIBUCION EN FRIO",direccion:"AV. CLAUDIO ARRAU Nº7000",comuna:"PUDAHUEL",ciudad:"SANTIAGO",telefono:"77062475",email:"eosorio@topfrio.cl",celular:"",region:"METROPOLITANA",rubro:"TRANSPORTE"},
        {rut:"76159284",dv:"K",nombre:"Hornos Industriales Ltda",direccion:"Volcan Lascar Oriente 720, Pudahuel",comuna:"PUDAHUEL",ciudad:"SANTIAGO",telefono:"56 2 3210 1362",email:"hornos@hornosindustriales.cl",celular:"56 2 3210 1362",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"96590000",dv:"4",nombre:"AGROINDUSTRIAL EL PAICO S.A.",direccion:"AVDA LOS LIBERTADORES 1714",comuna:"EL MONTE",ciudad:"SANTIAGO",telefono:"",email:"mirocuamt@ariztia.com",celular:"",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"83547100",dv:"4",nombre:"AUTORENTAS DEL PACIFICO SPA",direccion:"Av. Americo Vespucio 1601",comuna:"QUILICURA",ciudad:"SANTIAGO",telefono:"",email:"scabreral@mitta.cl",celular:"971349480",region:"METROPOLITANA",rubro:"FLOTAS"},
        {rut:"77845959",dv:"0",nombre:"Constructora Fercat-A spa",direccion:"Los suspiros 3071",comuna:"QUINTA NORMAL",ciudad:"SANTIAGO",telefono:"978979820",email:"mvidela.m@gmail.com",celular:"978979820",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"76013587",dv:"9",nombre:"MARIA TERESA GAETE CHRISTINY REPUESTOS INDUSTRIALES SPA",direccion:"COQUIMBO 1637",comuna:"PUENTE ALTO",ciudad:"SANTIAGO",telefono:"939284228",email:"jaraya@repuestosmt.cl",celular:"939284228",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"78056272",dv:"2",nombre:"CONSTRUCTORA SAN GENNARO SPA",direccion:"PEDRO JORQUERA 853",comuna:"PUDAHUEL",ciudad:"SANTIAGO",telefono:"9923896013",email:"contactanos.csg@gmail.com",celular:"",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"77216850",dv:"0",nombre:"AGRICOLA SAN JOSE LTDA",direccion:"NUEVO SENDERO PARCELA 23",comuna:"PAINE",ciudad:"SANTIAGO",telefono:"974794862",email:"asistentecontabilidad@agricolasanjose.cl",celular:"974794862",region:"METROPOLITANA",rubro:"AGRICOLA UVA"},
        {rut:"86856700",dv:"7",nombre:"CONSTRUCTORA NOVATEC S.A",direccion:"AVDA. PRESIDENTE RIESCO Nº5335 PISO 11",comuna:"LAS CONDES",ciudad:"SANTIAGO",telefono:"987101115",email:"cmarifilo@novatec.cl",celular:"22 9020885",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"79694220",dv:"7",nombre:"soc agricola lo campino ltda",direccion:"fundo lo campino s/n",comuna:"QUILICURA",ciudad:"SANTIAGO",telefono:"981296936",email:"tguzman@locampino.cl",celular:"981296936",region:"METROPOLITANA",rubro:"AGROINDUSTRIA GANADERO"},
        {rut:"76916552",dv:"5",nombre:"TRANSPORTES Y SERVICIOS VALTRI SPA",direccion:"AV. NUEVA PROVIDENCIA #1881 OF 1201",comuna:"PROVIDENCIA",ciudad:"SANTIAGO",telefono:"",email:"ignacio@tranportesvaltri.cl",celular:"963947503",region:"METROPOLITANA",rubro:"TRANSPORTE"},
        {rut:"78928030",dv:"4",nombre:"EECOL INDUSTRIAL ELECTRIC LTDA.",direccion:"14 DE LA FAMA 2761",comuna:"CONCHALÍ",ciudad:"SANTIAGO",telefono:"6204200",email:"ma.rivera@eecol.cl",celular:"",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"76425685",dv:"9",nombre:"constructora hermanos henriquez limitada",direccion:"brisas de chacabuco parcela c2 el colorado colina",comuna:"COLINA",ciudad:"SANTIAGO",telefono:"56985955264",email:"ahenriquez@savicop.cl",celular:"56985955264",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"76124254",dv:"7",nombre:"H&S EQUIPOS INDUSTRIALES SPA.",direccion:"LO INFANTE Nº1681",comuna:"SAN BERNARDO",ciudad:"SANTIAGO",telefono:"(562) 2 706 53 40",email:"cpozo@hys.cl",celular:"985297391",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"76896784",dv:"9",nombre:"EMPRESA CONSTRUCTORA OROLEC SPA",direccion:"ALFREDO BARROS ERRAZURIZ 1953 OFIC 605",comuna:"PROVIDENCIA",ciudad:"SANTIAGO",telefono:"956492095",email:"rromero@emcor.cl",celular:"",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"76329072",dv:"7",nombre:"RESITER INDUSTRIAL S.A.",direccion:"LOS CONQUISTADORES Nº2752 B",comuna:"PROVIDENCIA",ciudad:"SANTIAGO",telefono:"226567575",email:"amedina@resiter.cl",celular:"57889025",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"78802550",dv:"5",nombre:"CONSTRUCTORA LAGO RIÑIHUE",direccion:"J.M. INFANTE #805",comuna:"PROVIDENCIA",ciudad:"SANTIAGO",telefono:"",email:"autosrrp@gmail.com",celular:"963527618",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"77051670",dv:"6",nombre:"CONSTRUCTORA FAJARDO LTDA",direccion:"BRASIL 8476",comuna:"LA FLORIDA",ciudad:"SANTIAGO",telefono:"",email:"j.sepulveda@cfajardo.cl",celular:"56966089524",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"78245085",dv:"9",nombre:"TRANSPORTE S G SPA",direccion:"EULOGIA SANCHEZ 065",comuna:"PROVIDENCIA",ciudad:"SANTIAGO",telefono:"941697784",email:"transsg2025@gmail.com",celular:"",region:"METROPOLITANA",rubro:"TRANSPORTE"},
        {rut:"87717500",dv:"6",nombre:"EMPRESA CONSTRUCTORA DLP",direccion:"APOQUINDO 4775 PISO 9",comuna:"LAS CONDES",ciudad:"SANTIAGO",telefono:"",email:"bortiz@dlp.cl",celular:"+569 95858107",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"77492758",dv:"1",nombre:"TRANSPORTE JOSE MIGUEL CARRERA",direccion:"JOSE MIGUEL CARRERA 1418",comuna:"MACUL",ciudad:"SANTIAGO",telefono:"952163692",email:"evelynkaterine82@hotmail.com",celular:"",region:"METROPOLITANA",rubro:"TRANSPORTE"},
        {rut:"77644905",dv:"9",nombre:"RT MONTAJES INDUSTRIALES",direccion:"EDUARDO FREI MONTALVA 1495",comuna:"INDEPENDENCIA",ciudad:"SANTIAGO",telefono:"56934515339",email:"rtmontajespa@gmail.com",celular:"",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"84343900",dv:"4",nombre:"SOC AGRICOLA LOS MAITENES DE LIPANGUE LIMITADA",direccion:"SAN PABLO 1910",comuna:"SANTIAGO",ciudad:"SANTIAGO",telefono:"979719980",email:"fdoelmaiten@gmail.com",celular:"",region:"METROPOLITANA",rubro:"AGROINDUSTRIA"},
        {rut:"76501989",dv:"3",nombre:"INMOBILIARIA Y CONSTRUCTORA ADVISORY SPA.",direccion:"Av. Presidente Kennedy 5118 OF73",comuna:"VITACURA",ciudad:"SANTIAGO",telefono:"56 9 9325 2509",email:"contacto@advisory.cl",celular:"222190608",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"76368171",dv:"8",nombre:"CONSTRUCTORA ESSCON SPA",direccion:"LOS GLADIOLOS 3336",comuna:"RECOLETA",ciudad:"SANTIAGO",telefono:"961407122",email:"rorellana@esscon.cl",celular:"",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"77835800",dv:"K",nombre:"INDUSTRIAL OCHAGAVIA LTDA.",direccion:"JOSE JOAQUIN PRIETO #8020",comuna:"LA CISTERNA",ciudad:"SANTIAGO",telefono:"2 2637 8139",email:"mirocuant@ariztia.com",celular:"9435 6229",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"96709420",dv:"K",nombre:"MONTAJES INDUSTRIALES MONTEC S.A.",direccion:"San Pio X 2460 Oficina 910",comuna:"PROVIDENCIA",ciudad:"SANTIAGO",telefono:"227130300",email:"mbriones@montec.cl",celular:"+569 84394212",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"78771600",dv:"8",nombre:"SOCIEDAD CONSTRUCTORA ATENAS Y CIA LTDA.",direccion:"AVDA DEL VALLE SUR Nº576 OFICINA 402",comuna:"HUECHURABA",ciudad:"SANTIAGO",telefono:"22646616",email:"asandoval@scatenas.cl",celular:"",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"77266285",dv:"8",nombre:"SOCIEDAD COMERCIALIZADORA DE FRUTAS Y VERDURAS SJ-IC SPA",direccion:"EL ROBLE 215 BODEGA C Y D",comuna:"LAMPA",ciudad:"SANTIAGO",telefono:"940546827",email:"mariafernanda.barra@vivaldigroup.cl",celular:"",region:"METROPOLITANA",rubro:"AGRO FRUTAS"},
        {rut:"76342129",dv:"5",nombre:"SOCIEDAD COMERCIAL AGROMINERALS LIMITADA",direccion:"San Antonio 19 ofic #907",comuna:"SANTIAGO",ciudad:"SANTIAGO",telefono:"",email:"agrominerals.lt@gmail.com",celular:"9 9303 3168",region:"METROPOLITANA",rubro:"MAQUINAS AGRICOLAS"},
        {rut:"77575085",dv:"5",nombre:"CONSTRUCTORA E INGENIERIA Y SERVICIOS H&D LIMITADA",direccion:"morande 835 518 santiago",comuna:"SANTIAGO",ciudad:"SANTIAGO",telefono:"994877373",email:"consultoriopingenieriahd@gmail.com",celular:"",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"76329258",dv:"4",nombre:"CONSTRUCTORA TORINA SPA.",direccion:"Balmoral 309 oficina 705",comuna:"LAS CONDES",ciudad:"SANTIAGO",telefono:"",email:"",celular:"9 8442 1353",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"78546290",dv:"4",nombre:"CONSTRUCTORA PJP LTDA.",direccion:"CURICO N°338",comuna:"SANTIAGO",ciudad:"SANTIAGO",telefono:"2354275",email:"paulo.villouta@pjp.cl",celular:"",region:"METROPOLITANA",rubro:"CONSTRUCCION"},
        {rut:"77124120",dv:"4",nombre:"COMERCIAL ELECTRICA INDUSTRIAL Y SERVICIOS SPA",direccion:"CAMINO A MELIPILLA 1076",comuna:"PEÑALOLEN",ciudad:"SANTIAGO",telefono:"934382774",email:"borybor@boorybor.cl",celular:"",region:"METROPOLITANA",rubro:"FABRICACION E INDUSTRIA"},
        {rut:"77788558",dv:"8",nombre:"TRANSPORTES E INVERSIONES MUÑOZ BRICEÑO SPA",direccion:"PROVIDENCIA 1208 OF 1607 16P",comuna:"PROVIDENCIA",ciudad:"SANTIAGO",telefono:"937353982",email:"sebastian.munoz6640@gmail.com",celular:"",region:"METROPOLITANA",rubro:"TRANSPORTE"},
        {rut:"76026358",dv:"3",nombre:"TRANSPORTES SANTOLAYA LIMITADA",direccion:"padre mariano 181 piso 5, providencia",comuna:"PROVIDENCIA",ciudad:"SANTIAGO",telefono:"",email:"transportes@santolaya.cl",celular:"942990053",region:"METROPOLITANA",rubro:"TRANSPORTE"}
      ]
      for (const c of clientes80) {
        insCliente.run(
          uuidv4(), c.rut, c.dv, c.nombre, c.direccion || null, c.comuna || null, c.ciudad || null,
          c.telefono || null, c.email || null, c.celular || null, c.region || null, c.rubro || null,
          mapSeg(c.rubro), 'prospecto'
        )
      }
      console.log(`✅ Migración clientes_v2 — ${clientes80.length} clientes sembrados`)
    }
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('clientes_v2')
    console.log('✅ Migración clientes_v2 — dv,ciudad,celular,region,rubro + bitácora creada')
  }

  // Migration 33: campanas_v1 — tabla campanas + campana_id/campana_nombre en pipeline_contactos
  const m33 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('campanas_v1')
  if (!m33) {
    db.exec(`CREATE TABLE IF NOT EXISTS campanas (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      tipo TEXT DEFAULT 'prospección',
      segmento TEXT,
      rubro TEXT,
      canal TEXT DEFAULT 'whatsapp',
      mensaje_generado TEXT,
      mensaje_editado TEXT,
      estado TEXT DEFAULT 'borrador',
      fecha_creacion TEXT DEFAULT (datetime('now','localtime')),
      creado_por TEXT,
      total_prospectos INTEGER DEFAULT 0
    )`)
    const pcCols = db.prepare('PRAGMA table_info(pipeline_contactos)').all().map(c => c.name)
    if (!pcCols.includes('campana_id'))     try { db.exec("ALTER TABLE pipeline_contactos ADD COLUMN campana_id TEXT") } catch(_) {}
    if (!pcCols.includes('campana_nombre')) try { db.exec("ALTER TABLE pipeline_contactos ADD COLUMN campana_nombre TEXT") } catch(_) {}
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('campanas_v1')
    console.log('✅ Migración campanas_v1 — tabla campanas creada + campana_id/campana_nombre en pipeline_contactos')
  }

  // Migration 34: pipeline_excel_fields — nuevas columnas para importación Excel
  const m34 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('pipeline_excel_fields')
  if (!m34) {
    const pcCols34 = db.prepare('PRAGMA table_info(pipeline_contactos)').all().map(c => c.name)
    if (!pcCols34.includes('rut'))    try { db.exec("ALTER TABLE pipeline_contactos ADD COLUMN rut TEXT") } catch(_) {}
    if (!pcCols34.includes('dv'))     try { db.exec("ALTER TABLE pipeline_contactos ADD COLUMN dv TEXT") } catch(_) {}
    if (!pcCols34.includes('celular'))try { db.exec("ALTER TABLE pipeline_contactos ADD COLUMN celular TEXT") } catch(_) {}
    if (!pcCols34.includes('ciudad')) try { db.exec("ALTER TABLE pipeline_contactos ADD COLUMN ciudad TEXT") } catch(_) {}
    if (!pcCols34.includes('rubro'))  try { db.exec("ALTER TABLE pipeline_contactos ADD COLUMN rubro TEXT") } catch(_) {}
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('pipeline_excel_fields')
    console.log('✅ Migración pipeline_excel_fields — rut, dv, celular, ciudad, rubro en pipeline_contactos')
  }

  // Migration 35: limpiar_prospectos_demo — eliminar data de prueba
  const m35 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('limpiar_prospectos_demo')
  if (!m35) {
    const antes = db.prepare('SELECT COUNT(*) as n FROM pipeline_contactos').get().n
    db.exec('DELETE FROM pipeline_contactos')
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('limpiar_prospectos_demo')
    console.log(`✅ Migración limpiar_prospectos_demo — ${antes} prospectos eliminados`)
  }

  // Migration 36: clientes_campana — campaña en tabla clientes
  const m36 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('clientes_campana')
  if (!m36) {
    const clCols = db.prepare('PRAGMA table_info(clientes)').all().map(c => c.name)
    if (!clCols.includes('campana_id'))     try { db.exec("ALTER TABLE clientes ADD COLUMN campana_id TEXT") } catch(_) {}
    if (!clCols.includes('campana_nombre')) try { db.exec("ALTER TABLE clientes ADD COLUMN campana_nombre TEXT") } catch(_) {}
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('clientes_campana')
    console.log('✅ Migración clientes_campana — campana_id/campana_nombre en clientes')
  }

  // Migration 37: campana_estado_v1 — estado de envío por prospecto + contadores en campanas
  const m37 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('campana_estado_v1')
  if (!m37) {
    const pcCols37 = db.prepare('PRAGMA table_info(pipeline_contactos)').all().map(c => c.name)
    if (!pcCols37.includes('campana_estado'))     try { db.exec("ALTER TABLE pipeline_contactos ADD COLUMN campana_estado TEXT DEFAULT 'Sin enviar'") } catch(_) {}
    if (!pcCols37.includes('campana_enviado_at')) try { db.exec("ALTER TABLE pipeline_contactos ADD COLUMN campana_enviado_at TEXT") } catch(_) {}
    const cCols37 = db.prepare('PRAGMA table_info(campanas)').all().map(c => c.name)
    if (!cCols37.includes('enviados'))    try { db.exec("ALTER TABLE campanas ADD COLUMN enviados INTEGER DEFAULT 0") } catch(_) {}
    if (!cCols37.includes('abiertos'))   try { db.exec("ALTER TABLE campanas ADD COLUMN abiertos INTEGER DEFAULT 0") } catch(_) {}
    if (!cCols37.includes('respondidos'))try { db.exec("ALTER TABLE campanas ADD COLUMN respondidos INTEGER DEFAULT 0") } catch(_) {}
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('campana_estado_v1')
    console.log('✅ Migración campana_estado_v1 — campana_estado/campana_enviado_at en pipeline_contactos + enviados/abiertos/respondidos en campanas')
  }

  // Migration 38: campanas_asunto_firma — asunto del email y firma en campanas
  const m38 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('campanas_asunto_firma')
  if (!m38) {
    const cCols38 = db.prepare('PRAGMA table_info(campanas)').all().map(c => c.name)
    if (!cCols38.includes('asunto')) try { db.exec("ALTER TABLE campanas ADD COLUMN asunto TEXT") } catch(_) {}
    if (!cCols38.includes('firma'))  try { db.exec("ALTER TABLE campanas ADD COLUMN firma TEXT") } catch(_) {}
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('campanas_asunto_firma')
    console.log('✅ Migración campanas_asunto_firma — asunto y firma agregados a campanas')
  }

  // Migration 39: oc_recepcion_parcial_v1 — recepción parcial por línea + facturas_proveedor
  const m39 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('oc_recepcion_parcial_v1')
  if (!m39) {
    // cantidad_recibida_total en oc_items
    const ocItemsCols = db.prepare('PRAGMA table_info(oc_items)').all().map(c => c.name)
    if (!ocItemsCols.includes('cantidad_recibida_total')) {
      db.exec('ALTER TABLE oc_items ADD COLUMN cantidad_recibida_total REAL DEFAULT 0')
    }
    // fecha_requerida en ordenes_compra (para el spec)
    const ocCols39 = db.prepare('PRAGMA table_info(ordenes_compra)').all().map(c => c.name)
    if (!ocCols39.includes('fecha_requerida')) db.exec('ALTER TABLE ordenes_compra ADD COLUMN fecha_requerida TEXT')
    if (!ocCols39.includes('usuario_creador_id')) db.exec('ALTER TABLE ordenes_compra ADD COLUMN usuario_creador_id TEXT')
    // Tablas nuevas
    db.exec(`
      CREATE TABLE IF NOT EXISTS recepciones_oc (
        id TEXT PRIMARY KEY,
        oc_id TEXT REFERENCES ordenes_compra(id) ON DELETE CASCADE,
        fecha_recepcion TEXT DEFAULT (date('now')),
        usuario_receptor_id TEXT,
        observacion TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS recepciones_oc_lineas (
        id TEXT PRIMARY KEY,
        recepcion_id TEXT REFERENCES recepciones_oc(id) ON DELETE CASCADE,
        linea_oc_id TEXT REFERENCES oc_items(id),
        cantidad_recibida REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS facturas_proveedor (
        id TEXT PRIMARY KEY,
        oc_id TEXT REFERENCES ordenes_compra(id),
        numero_factura TEXT,
        fecha_factura TEXT,
        fecha_vencimiento_pago TEXT,
        monto_total REAL,
        modo_pago TEXT DEFAULT 'transferencia',
        estado_pago TEXT DEFAULT 'pendiente',
        fecha_pago_real TEXT,
        usuario_registro_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `)
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('oc_recepcion_parcial_v1')
    console.log('✅ Migración oc_recepcion_parcial_v1 — recepciones_oc, recepciones_oc_lineas, facturas_proveedor creadas')
  }

  // Migration 40: finanzas_rol_v1 — agregar rol finanzas a usuarios + usuario finanzas
  const m40 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('finanzas_rol_v1')
  if (!m40) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS usuarios_tmp40 (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        nombre TEXT NOT NULL,
        telefono TEXT,
        rol TEXT DEFAULT 'ventas' CHECK(rol IN ('admin','ventas','bodega','cliente','gerente','finanzas')),
        activo INTEGER DEFAULT 1,
        ultimo_acceso TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO usuarios_tmp40 SELECT * FROM usuarios;
      DROP TABLE usuarios;
      ALTER TABLE usuarios_tmp40 RENAME TO usuarios;
    `)
    const hasFinanzas = db.prepare("SELECT COUNT(*) as n FROM usuarios WHERE rol = 'finanzas'").get().n
    if (!hasFinanzas) {
      db.prepare(`INSERT INTO usuarios (id, email, password_hash, nombre, telefono, rol) VALUES (?,?,?,?,?,?)`)
        .run(uuidv4(), 'finanzas@rmgautoparts.cl', bcrypt.hashSync('finanzas2026', 10), 'Finanzas RMG', '+56 9 0000 0003', 'finanzas')
      console.log('✅ Migración finanzas_rol_v1 — usuario finanzas creado (finanzas@rmgautoparts.cl / finanzas2026)')
    }
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('finanzas_rol_v1')
    console.log('✅ Migración finanzas_rol_v1 — rol finanzas habilitado en usuarios')
  }

  // Migration 41: lista_precios_stock_v1 — añadir stock_actual + stock_minimo a lista_precios
  const m41 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('lista_precios_stock_v1')
  if (!m41) {
    const lpCols = db.prepare('PRAGMA table_info(lista_precios)').all().map(c => c.name)
    if (!lpCols.includes('stock_actual')) db.exec('ALTER TABLE lista_precios ADD COLUMN stock_actual INTEGER DEFAULT 0')
    if (!lpCols.includes('stock_minimo')) db.exec('ALTER TABLE lista_precios ADD COLUMN stock_minimo INTEGER DEFAULT 5')
    // Migrar stock desde productos donde el codigo coincida con codigo_sku
    try {
      db.exec(`
        UPDATE lista_precios
        SET stock_actual = COALESCE((SELECT p.stock_actual FROM productos p WHERE p.codigo = lista_precios.codigo_sku), 0),
            stock_minimo = COALESCE((SELECT p.stock_minimo FROM productos p WHERE p.codigo = lista_precios.codigo_sku), 5)
        WHERE codigo_sku IS NOT NULL
      `)
    } catch (_) {}
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('lista_precios_stock_v1')
    console.log('✅ Migración lista_precios_stock_v1 — stock_actual y stock_minimo añadidos a lista_precios, datos migrados desde productos')
  }

  // Migration 42: oc_architecture_v1 — oc_historial + compra_id en OC + origen/proveedor_id en compras
  const m42 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('oc_architecture_v1')
  if (!m42) {
    db.exec(`CREATE TABLE IF NOT EXISTS oc_historial (
      id TEXT PRIMARY KEY,
      oc_id TEXT REFERENCES ordenes_compra(id) ON DELETE CASCADE,
      fecha_evento TEXT DEFAULT (datetime('now')),
      usuario_id TEXT,
      usuario_nombre TEXT,
      estado_anterior TEXT,
      estado_nuevo TEXT,
      tipo_evento TEXT,
      detalle TEXT
    )`)
    const ocCols42 = db.prepare('PRAGMA table_info(ordenes_compra)').all().map(c => c.name)
    if (!ocCols42.includes('compra_id')) db.exec('ALTER TABLE ordenes_compra ADD COLUMN compra_id INTEGER')
    if (!ocCols42.includes('observaciones')) db.exec('ALTER TABLE ordenes_compra ADD COLUMN observaciones TEXT')
    const comprasCols42 = db.prepare('PRAGMA table_info(compras)').all().map(c => c.name)
    if (!comprasCols42.includes('origen'))       db.exec("ALTER TABLE compras ADD COLUMN origen TEXT DEFAULT 'directa'")
    if (!comprasCols42.includes('proveedor_id')) db.exec('ALTER TABLE compras ADD COLUMN proveedor_id TEXT')
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('oc_architecture_v1')
    console.log('✅ Migración oc_architecture_v1 — oc_historial, compra_id en OC, origen+proveedor_id en compras')
  }

  // Migration 43: oc_orphan_stock_correction_v1 — revertir stock de OCs eliminadas sin reversión
  const m43 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('oc_orphan_stock_correction_v1')
  if (!m43) {
    try {
      const orphaned = db.prepare(`
        SELECT ms.* FROM movimientos_stock ms
        WHERE ms.motivo = 'recepcion_oc' AND ms.tipo = 'entrada'
          AND ms.referencia NOT IN (SELECT numero FROM ordenes_compra WHERE numero IS NOT NULL)
      `).all()

      let corrected = 0
      for (const mov of orphaned) {
        const prod = db.prepare(
          'SELECT codigo_sku, MAX(COALESCE(stock_actual,0)) AS stock_actual FROM lista_precios WHERE codigo_sku = ? GROUP BY codigo_sku'
        ).get(mov.codigo)
        if (prod) {
          const stockAnterior = prod.stock_actual
          const stockNuevo    = Math.max(0, stockAnterior - mov.cantidad)
          db.prepare('UPDATE lista_precios SET stock_actual = ? WHERE codigo_sku = ?').run(stockNuevo, mov.codigo)
          try {
            db.prepare(`INSERT INTO movimientos_stock
              (id, producto_id, codigo, descripcion, tipo, cantidad, stock_anterior, stock_nuevo, motivo, referencia)
              VALUES (?,?,?,?,?,?,?,?,?,?)`)
              .run(uuidv4(), mov.codigo, mov.codigo, mov.descripcion, 'ajuste', -mov.cantidad,
                stockAnterior, stockNuevo, 'Corrección: OC eliminada sin reversión de stock', mov.referencia)
          } catch (_) {}
          corrected++
          console.log(`✅ Corregido: SKU ${mov.codigo} — revertidas ${mov.cantidad} unids (OC: ${mov.referencia})`)
        }
      }
      console.log(`✅ Migración oc_orphan_stock_correction_v1 — ${corrected} movimientos huérfanos corregidos de ${orphaned.length} detectados`)
    } catch (e) {
      console.warn('⚠️ oc_orphan_stock_correction_v1 error:', e.message)
    }
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('oc_orphan_stock_correction_v1')
  }

  // Migration 44: cxp_orphan_cleanup_v1 — eliminar CxP huérfanos de OC-2026-003 (OC no existe)
  const m44 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('cxp_orphan_cleanup_v1')
  if (!m44) {
    try {
      const orphans = db.prepare(`
        SELECT id, numero, proveedor, oc_numero, monto FROM facturas_cxp
        WHERE oc_numero = 'OC-2026-003'
          AND oc_id NOT IN (SELECT id FROM ordenes_compra)
      `).all()
      for (const f of orphans) {
        db.prepare('DELETE FROM caja_movimientos WHERE origen_tabla = ? AND origen_id = ?')
          .run('facturas_cxp', f.id)
        db.prepare('DELETE FROM facturas_cxp WHERE id = ?').run(f.id)
        console.log(`✅ CxP huérfano eliminado: ${f.numero} — ${f.proveedor} $${f.monto}`)
      }
      console.log(`✅ Migración cxp_orphan_cleanup_v1 — ${orphans.length} CxP huérfanos eliminados`)
    } catch (e) {
      console.warn('⚠️ cxp_orphan_cleanup_v1 error:', e.message)
    }
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('cxp_orphan_cleanup_v1')
  }

  // Migration 45: lista_precios_iva_cols_v1 — añadir costo_compra y precio_venta (con IVA) a lista_precios
  const m45 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('lista_precios_iva_cols_v1')
  if (!m45) {
    const lpCols = db.prepare('PRAGMA table_info(lista_precios)').all().map(c => c.name)
    if (!lpCols.includes('costo_compra')) db.exec('ALTER TABLE lista_precios ADD COLUMN costo_compra REAL')
    if (!lpCols.includes('precio_venta')) db.exec('ALTER TABLE lista_precios ADD COLUMN precio_venta REAL')
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('lista_precios_iva_cols_v1')
    console.log('✅ Migración lista_precios_iva_cols_v1 — columnas costo_compra y precio_venta añadidas')
  }

  // Migration 46: lista_precios_neto_cols_v1 — añadir precio_neto/costo_neto y corregir netos
  // El Excel ya trae valores neto; la migración anterior dividió erróneamente por 1.19
  const m46 = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('lista_precios_neto_cols_v1')
  if (!m46) {
    try {
      const lpCols = db.prepare('PRAGMA table_info(lista_precios)').all().map(c => c.name)
      if (!lpCols.includes('precio_neto')) db.exec('ALTER TABLE lista_precios ADD COLUMN precio_neto REAL')
      if (!lpCols.includes('costo_neto'))  db.exec('ALTER TABLE lista_precios ADD COLUMN costo_neto REAL')
      // costo_compra y precio_venta ya tienen el neto correcto (raw del Excel)
      db.exec('UPDATE lista_precios SET precio_neto = precio_venta, costo_neto = costo_compra')
      // costo_unidad_neto y precio_venta_neto fueron divididos por 1.19 erróneamente — corregir
      db.exec('UPDATE lista_precios SET costo_unidad_neto = costo_compra, precio_venta_neto = precio_venta')
    } catch (e) {
      console.warn('⚠️ lista_precios_neto_cols_v1 error:', e.message)
    }
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('lista_precios_neto_cols_v1')
    console.log('✅ Migración lista_precios_neto_cols_v1 — precio_neto/costo_neto añadidos, netos corregidos')
  }

  // Migration campana_tracking_v1 — apertura de emails en pipeline_contactos
  const mCampanaTrack = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('campana_tracking_v1')
  if (!mCampanaTrack) {
    const pcColsT = db.prepare('PRAGMA table_info(pipeline_contactos)').all().map(c => c.name)
    try { if (!pcColsT.includes('email_abierto'))  db.exec("ALTER TABLE pipeline_contactos ADD COLUMN email_abierto INTEGER DEFAULT 0") } catch(_) {}
    try { if (!pcColsT.includes('fecha_apertura')) db.exec("ALTER TABLE pipeline_contactos ADD COLUMN fecha_apertura TEXT") } catch(_) {}
    try { if (!pcColsT.includes('veces_abierto'))  db.exec("ALTER TABLE pipeline_contactos ADD COLUMN veces_abierto INTEGER DEFAULT 0") } catch(_) {}
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('campana_tracking_v1')
    console.log('✅ Migración campana_tracking_v1 — email_abierto/fecha_apertura/veces_abierto en pipeline_contactos')
  }

  // Migration 42: perfiles_v1 — modelo de 3 perfiles (gerente / administrador / vendedor)
  // Reemplaza el set anterior (admin, ventas, bodega, cliente, gerente, finanzas):
  //   admin, finanzas  -> administrador (acceso total, sin autorizaciones)
  //   gerente          -> gerente       (acceso total + autorizaciones)
  //   ventas, bodega, cliente, y cualquier otro valor -> vendedor (resto)
  const mPerfiles = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('perfiles_v1')
  if (!mPerfiles) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS usuarios_perfiles_v1 (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        nombre TEXT NOT NULL,
        telefono TEXT,
        rol TEXT DEFAULT 'vendedor' CHECK(rol IN ('gerente','administrador','vendedor')),
        activo INTEGER DEFAULT 1,
        ultimo_acceso TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO usuarios_perfiles_v1
        (id, email, password_hash, nombre, telefono, rol, activo, ultimo_acceso, created_at, updated_at)
      SELECT
        id, email, password_hash, nombre, telefono,
        CASE rol
          WHEN 'gerente' THEN 'gerente'
          WHEN 'admin'   THEN 'administrador'
          WHEN 'finanzas' THEN 'administrador'
          ELSE 'vendedor'
        END,
        activo, ultimo_acceso, created_at, updated_at
      FROM usuarios;
      DROP TABLE usuarios;
      ALTER TABLE usuarios_perfiles_v1 RENAME TO usuarios;
    `)
    // Red de seguridad: asegura al menos un gerente y un administrador activos
    const hasGerentePerfiles = db.prepare("SELECT COUNT(*) as n FROM usuarios WHERE rol = 'gerente'").get().n
    if (!hasGerentePerfiles) {
      db.prepare(`INSERT INTO usuarios (id, email, password_hash, nombre, telefono, rol) VALUES (?,?,?,?,?,?)`)
        .run(uuidv4(), 'gerente@rmgautoparts.cl', bcrypt.hashSync('gerente2026', 10), 'Gerente RMG', '+56 9 0000 0002', 'gerente')
    }
    const hasAdminPerfiles = db.prepare("SELECT COUNT(*) as n FROM usuarios WHERE rol = 'administrador'").get().n
    if (!hasAdminPerfiles) {
      db.prepare(`INSERT INTO usuarios (id, email, password_hash, nombre, telefono, rol) VALUES (?,?,?,?,?,?)`)
        .run(uuidv4(), 'admin@rmgautoparts.cl', bcrypt.hashSync('rmg2026', 10), 'Administrador RMG', '+56 9 1234 5678', 'administrador')
    }
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('perfiles_v1')
    console.log('✅ Migración perfiles_v1 — usuarios migrados a 3 perfiles: gerente / administrador / vendedor')
  }

  // Migration 47: ventas_unificadas_v1 — Venta como destino único del flujo comercial
  // (cotización → venta directa | cotización → pedido → venta | venta directa),
  // con estado logístico editable, trazabilidad de origen y tabla de documentos adjuntos.
  const mVentasUnif = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('ventas_unificadas_v1')
  if (!mVentasUnif) {
    const vCols = db.prepare('PRAGMA table_info(ventas)').all().map(c => c.name)
    if (!vCols.includes('cliente_id'))       db.exec('ALTER TABLE ventas ADD COLUMN cliente_id TEXT REFERENCES clientes(id)')
    if (!vCols.includes('cotizacion_id'))    db.exec('ALTER TABLE ventas ADD COLUMN cotizacion_id TEXT REFERENCES cotizaciones(id)')
    if (!vCols.includes('pedido_id'))        db.exec('ALTER TABLE ventas ADD COLUMN pedido_id TEXT REFERENCES pedidos(id)')
    if (!vCols.includes('estado_logistico')) db.exec("ALTER TABLE ventas ADD COLUMN estado_logistico TEXT DEFAULT 'en_proceso'")
    if (!vCols.includes('fecha_pago'))       db.exec('ALTER TABLE ventas ADD COLUMN fecha_pago TEXT')
    if (!vCols.includes('direccion_entrega'))db.exec('ALTER TABLE ventas ADD COLUMN direccion_entrega TEXT')
    if (!vCols.includes('vendedor_id'))      db.exec('ALTER TABLE ventas ADD COLUMN vendedor_id TEXT REFERENCES usuarios(id)')
    // Ventas ya existentes (previas a este cambio): se asumen despachadas/entregadas —
    // quedan en el estado logístico terminal en vez de reabrirse en "en_proceso".
    try { db.exec("UPDATE ventas SET estado_logistico = 'recibida_cliente' WHERE estado_logistico IS NULL") } catch (_) {}

    db.exec(`
      CREATE TABLE IF NOT EXISTS documentos_adjuntos (
        id              TEXT PRIMARY KEY,
        entidad         TEXT NOT NULL CHECK(entidad IN ('cotizacion','pedido','venta','orden_compra')),
        entidad_id      TEXT NOT NULL,
        tipo            TEXT NOT NULL CHECK(tipo IN ('pdf','excel','imagen')),
        nombre_archivo  TEXT,
        mime_type       TEXT,
        contenido_base64 TEXT NOT NULL,
        subido_por      TEXT REFERENCES usuarios(id),
        created_at      TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_documentos_entidad ON documentos_adjuntos(entidad, entidad_id);
    `)

    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('ventas_unificadas_v1')
    console.log('✅ Migración ventas_unificadas_v1 — venta como destino único (cliente_id/cotizacion_id/pedido_id/estado_logistico) + documentos_adjuntos')
  }

  // Migration 48: oc_estados_snake_case_v1 — unifica nomenclatura de estados de ordenes_compra.
  // comprasController.js y ocController.js escribían casing distinto sobre la misma tabla
  // (p.ej. 'Pendiente_Autorizacion' vs 'CREADA'/'AUTORIZADA'). Se normaliza a snake_case
  // y ocController.js pasa a ser la única implementación de OC.
  const mOcSnake = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('oc_estados_snake_case_v1')
  if (!mOcSnake) {
    const ESTADO_MAP = {
      CREADA: 'borrador',
      Pendiente_Autorizacion: 'pendiente_autorizacion',
      AUTORIZADA: 'autorizada', Autorizada: 'autorizada',
      RECHAZADA: 'rechazada', Rechazada: 'rechazada',
      ENVIADA_PROVEEDOR: 'enviada_proveedor', Enviada_Proveedor: 'enviada_proveedor', enviada: 'enviada_proveedor', confirmada: 'enviada_proveedor',
      RECIBIDA_PARCIAL: 'recibida_parcial', Recibida_Parcial: 'recibida_parcial',
      RECIBIDA: 'recibida_total', Recibida_Bodega: 'recibida_total', recibida: 'recibida_total',
      Facturada: 'facturada',
      Pagada: 'pagada',
    }
    try {
      const rows = db.prepare('SELECT id, estado FROM ordenes_compra').all()
      const upd = db.prepare('UPDATE ordenes_compra SET estado = ? WHERE id = ?')
      let cambiadas = 0
      for (const r of rows) {
        const nuevo = ESTADO_MAP[r.estado]
        if (nuevo && nuevo !== r.estado) { upd.run(nuevo, r.id); cambiadas++ }
      }
      console.log(`✅ Migración oc_estados_snake_case_v1 — ${cambiadas}/${rows.length} OC normalizadas a snake_case`)
    } catch (e) {
      console.warn('⚠️ oc_estados_snake_case_v1 error:', e.message)
    }
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('oc_estados_snake_case_v1')
  }

  const mOcCuenta = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('oc_cuenta_bancaria_v1')
  if (!mOcCuenta) {
    const ocColsCuenta = db.prepare('PRAGMA table_info(ordenes_compra)').all().map(c => c.name)
    if (!ocColsCuenta.includes('cuenta_bancaria')) {
      db.exec("ALTER TABLE ordenes_compra ADD COLUMN cuenta_bancaria TEXT")
    }
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('oc_cuenta_bancaria_v1')
  }

  // Migration venta_validacion_pago_v1 — agrega el estado intermedio "en_validacion_pago"
  // al flujo de Ventas: al subir el comprobante de depósito/transferencia, la venta
  // pasa a este estado (no a "Pagado" directo) y recién cuando un gerente confirma
  // que el depósito realmente entró a la cuenta corriente se marca "Pagado" y se
  // genera el ingreso en caja_movimientos — igual que ya ocurre con OC → factura →
  // pago_autorizado. `ventas.estado` no tiene CHECK, así que el nuevo valor no
  // requiere alterar la columna, pero sí se agregan:
  //  - documentos_adjuntos.categoria: para poder distinguir el comprobante de pago
  //    de cualquier otro documento adjunto a la venta (antes todos eran genéricos).
  //  - ventas.motivo_rechazo_pago: motivo que deja el gerente si rechaza el pago
  //    (el depósito no llegó, comprobante inválido, etc.), igual que
  //    ordenes_compra.motivo_rechazo.
  const mVentaValidacion = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('venta_validacion_pago_v1')
  if (!mVentaValidacion) {
    const docCols = db.prepare('PRAGMA table_info(documentos_adjuntos)').all().map(c => c.name)
    if (!docCols.includes('categoria')) db.exec('ALTER TABLE documentos_adjuntos ADD COLUMN categoria TEXT')
    const vColsValidacion = db.prepare('PRAGMA table_info(ventas)').all().map(c => c.name)
    if (!vColsValidacion.includes('motivo_rechazo_pago')) db.exec('ALTER TABLE ventas ADD COLUMN motivo_rechazo_pago TEXT')
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('venta_validacion_pago_v1')
    console.log('✅ Migración venta_validacion_pago_v1 — estado en_validacion_pago + documentos_adjuntos.categoria + ventas.motivo_rechazo_pago')
  }

  // Migration caja_movimientos_venta_iva_v1 — corrige los ingresos de venta ya
  // registrados en caja_movimientos. ventas.total se guarda NETO en todo el
  // sistema, pero registrarPago()/validarPago() (ventasController.js) insertaban
  // ese neto directo como el monto del ingreso en caja — cuando el dinero que
  // realmente entra a la cuenta corriente al pagarse una venta es el total CON
  // IVA (19%). Eso hacía que el Flujo de Caja (y el "Saldo Actual") subestimara
  // cada ingreso de venta en un 19%. Se corrige cada fila ya insertada, y solo
  // si su monto todavía coincide con el neto (venta.total) — así no se toca dos
  // veces si esta migración ya corrió, ni se pisa un monto editado a mano después.
  const mCajaVentaIva = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('caja_movimientos_venta_iva_v1')
  if (!mCajaVentaIva) {
    try {
      const rows = db.prepare(`
        SELECT cm.id AS cm_id, cm.monto AS cm_monto, v.total AS venta_total
        FROM caja_movimientos cm
        JOIN ventas v ON v.id = CAST(cm.origen_id AS INTEGER)
        WHERE cm.origen_tabla = 'ventas'
      `).all()
      const upd = db.prepare('UPDATE caja_movimientos SET monto = ? WHERE id = ?')
      let corregidos = 0
      for (const r of rows) {
        if (Math.round(r.cm_monto) === Math.round(r.venta_total)) {
          const totalConIva = r.venta_total + Math.round(r.venta_total * 0.19)
          upd.run(totalConIva, r.cm_id)
          corregidos++
        }
      }
      console.log(`✅ Migración caja_movimientos_venta_iva_v1 — ${corregidos}/${rows.length} ingresos de venta corregidos a total con IVA`)
    } catch (e) {
      console.warn('⚠️ caja_movimientos_venta_iva_v1 error:', e.message)
    }
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('caja_movimientos_venta_iva_v1')
  }

  // Migration stock_pack_correction_v1 — corrige stock_actual de SKU con presentación
  // en pack (unidades_por_pack > 1) que quedó cargado en CAJAS antes de que existiera
  // la conversión caja→unidad (CantidadPresentacion). Ej: un SKU de caja de 12 con
  // stock_actual = 2 en realidad tenía 2 cajas cargadas = 24 unidades reales.
  // Se corre UNA sola vez (guardada en _migrations) y deja registro auditable en
  // movimientos_stock para cada SKU corregido, con el motivo explícito.
  const mStockPack = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('stock_pack_correction_v1')
  if (!mStockPack) {
    try {
      const rows = db.prepare(`
        SELECT codigo_sku, MAX(descripcion) AS descripcion, MAX(unidades_por_pack) AS unidades_por_pack,
               MAX(COALESCE(stock_actual, 0)) AS stock_actual
        FROM lista_precios
        WHERE codigo_sku IS NOT NULL AND codigo_sku != ''
        GROUP BY codigo_sku
        HAVING MAX(unidades_por_pack) > 1 AND MAX(COALESCE(stock_actual, 0)) > 0
      `).all()
      const updStock = db.prepare('UPDATE lista_precios SET stock_actual = ? WHERE codigo_sku = ?')
      const insMov = db.prepare(`INSERT INTO movimientos_stock
        (id, producto_id, codigo, descripcion, tipo, cantidad, stock_anterior, stock_nuevo, motivo)
        VALUES (?,?,?,?,?,?,?,?,?)`)
      let corregidos = 0
      for (const r of rows) {
        const pack = r.unidades_por_pack
        const stockAnterior = r.stock_actual
        const stockNuevo = stockAnterior * pack
        updStock.run(stockNuevo, r.codigo_sku)
        insMov.run(
          uuidv4(), r.codigo_sku, r.codigo_sku, r.descripcion, 'ajuste',
          stockNuevo - stockAnterior, stockAnterior, stockNuevo,
          `Corrección automática: stock cargado en cajas antes de existir conversión caja→unidad (×${pack})`
        )
        corregidos++
      }
      console.log(`✅ Migración stock_pack_correction_v1 — ${corregidos} SKU corregidos (stock_actual × unidades_por_pack)`)
    } catch (e) {
      console.warn('⚠️ stock_pack_correction_v1 error:', e.message)
    }
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('stock_pack_correction_v1')
  }

  // Migration venta_items_descuento_v1 — agrega descuento_pct a venta_items,
  // que hasta ahora no existía (a diferencia de cotizacion_items, que sí lo
  // tenía) — el % de descuento por línea no se podía ni capturar ni mostrar
  // al vender.
  const mVentaDesc = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('venta_items_descuento_v1')
  if (!mVentaDesc) {
    const viCols = db.prepare('PRAGMA table_info(venta_items)').all().map(c => c.name)
    if (!viCols.includes('descuento_pct')) {
      db.exec('ALTER TABLE venta_items ADD COLUMN descuento_pct REAL DEFAULT 0')
    }
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('venta_items_descuento_v1')
    console.log('✅ Migración venta_items_descuento_v1 — descuento_pct añadido a venta_items')
  }

  // Migration venta_items_costo_pack_v1 — corrige venta_items.costo_unitario
  // para líneas de SKU en caja/pack: ventasController.getLp() usaba el costo
  // de lista_precios tal cual, que para un pack es el precio de LA CAJA
  // completa (mismo origen que stock_pack_correction_v1, pero del lado del
  // costo, no del stock) — cada venta creada desde una Cotización o Pedido con
  // un ítem en pack quedó con costo_unitario inflado ×unidades_por_pack, lo
  // que disparaba el costo de mercadería muy por sobre el total de la venta.
  // Se corrige solo cuando el costo guardado calza (con tolerancia de
  // redondeo) con el costo de caja ACTUAL del SKU en lista_precios — la firma
  // exacta del bug — y se recalcula costo_total de cada venta afectada.
  const mVentaCostoPack = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('venta_items_costo_pack_v1')
  if (!mVentaCostoPack) {
    try {
      const items = db.prepare(`
        SELECT id, venta_id, sku, cantidad, costo_unitario
        FROM venta_items
        WHERE sku IS NOT NULL AND sku != '' AND COALESCE(costo_unitario,0) > 0
      `).all()
      const lpStmt = db.prepare(`
        SELECT MAX(costo_unidad_neto) AS costo_caja, MAX(unidades_por_pack) AS unidades_por_pack
        FROM lista_precios WHERE codigo_sku = ? GROUP BY codigo_sku
      `)
      const updItem = db.prepare('UPDATE venta_items SET costo_unitario = ? WHERE id = ?')
      let corregidos = 0
      const ventasAfectadas = new Set()
      for (const it of items) {
        const lp = lpStmt.get(it.sku)
        if (!lp || !(lp.unidades_por_pack > 1) || !lp.costo_caja) continue
        if (Math.abs(it.costo_unitario - lp.costo_caja) <= 1) {
          updItem.run(lp.costo_caja / lp.unidades_por_pack, it.id)
          ventasAfectadas.add(it.venta_id)
          corregidos++
        }
      }
      const sumStmt = db.prepare('SELECT COALESCE(SUM(costo_unitario * cantidad),0) AS total FROM venta_items WHERE venta_id = ?')
      const updVenta = db.prepare('UPDATE ventas SET costo_total = ? WHERE id = ?')
      for (const ventaId of ventasAfectadas) {
        updVenta.run(sumStmt.get(ventaId).total, ventaId)
      }
      console.log(`✅ Migración venta_items_costo_pack_v1 — ${corregidos} ítems corregidos en ${ventasAfectadas.size} ventas (costo de caja usado como costo unitario)`)
    } catch (e) {
      console.warn('⚠️ venta_items_costo_pack_v1 error:', e.message)
    }
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('venta_items_costo_pack_v1')
  }

  // Migration chilecompra_v1 — Asistente de oportunidades ChileCompra/Mercado Público.
  // Pipeline: detectada → analizando → descartada | preparando_postulacion →
  // publicada → adjudicada | no_adjudicada. Los anexos (PDF/Excel) se guardan
  // reutilizando el módulo genérico documentos_adjuntos (entidad
  // 'oportunidad_chilecompra'), no una tabla propia.
  const mChileCompra = db.prepare("SELECT id FROM _migrations WHERE id = ?").get('chilecompra_v1')
  if (!mChileCompra) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS oportunidades_chilecompra (
        id TEXT PRIMARY KEY,
        fuente TEXT NOT NULL,                 -- 'compra_agil' | 'licitacion'
        codigo_externo TEXT NOT NULL,         -- ID del proceso en Mercado Público
        nombre TEXT,
        descripcion TEXT,
        organismo_nombre TEXT,
        organismo_rut TEXT,
        region TEXT,
        comuna TEXT,
        direccion_entrega TEXT,
        fecha_publicacion TEXT,
        fecha_cierre TEXT,
        presupuesto_estimado INTEGER,
        url_portal TEXT,
        estado TEXT NOT NULL DEFAULT 'detectada',
        motivo_descarte TEXT,
        resumen_ia TEXT,                      -- resumen en texto libre generado al leer los anexos
        plazo_entrega TEXT,
        tiene_exigencia_garantia INTEGER,      -- 0/1/NULL — NULL = aún no se leyeron los anexos
        tiene_exigencia_sds INTEGER,
        tiene_demandas INTEGER,
        cobertura_catalogo_pct REAL,          -- % de ítems solicitados que RMG puede cubrir
        score_rentabilidad REAL,
        score_seguridad REAL,
        score_total REAL,
        adjudicado_a TEXT,
        adjudicado_monto INTEGER,
        detalle_raw_json TEXT,                -- payload crudo de la API al momento de la ingesta (auditoría/futuro)
        detectada_por TEXT DEFAULT 'cron',    -- 'cron' | 'manual'
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(fuente, codigo_externo)
      );
      CREATE INDEX IF NOT EXISTS idx_chc_estado ON oportunidades_chilecompra(estado);
      CREATE INDEX IF NOT EXISTS idx_chc_fecha_cierre ON oportunidades_chilecompra(fecha_cierre);
      CREATE INDEX IF NOT EXISTS idx_chc_region ON oportunidades_chilecompra(region);

      CREATE TABLE IF NOT EXISTS oportunidad_chilecompra_items (
        id TEXT PRIMARY KEY,
        oportunidad_id TEXT NOT NULL REFERENCES oportunidades_chilecompra(id) ON DELETE CASCADE,
        descripcion_solicitada TEXT,
        cantidad REAL,
        unidad TEXT,
        especificacion_tecnica TEXT,
        precio_unitario_referencial INTEGER,
        sku_match TEXT,                       -- codigo_sku de lista_precios, si hubo match
        match_confianza REAL,                 -- 0-1, qué tan segura fue la IA del match
        costo_unitario_rmg INTEGER,
        precio_venta_sugerido INTEGER,
        margen_pct_estimado REAL,
        cubierto INTEGER DEFAULT 0            -- 0/1 — ¿RMG tiene SKU para este ítem?
      );
      CREATE INDEX IF NOT EXISTS idx_chc_items_oportunidad ON oportunidad_chilecompra_items(oportunidad_id);

      CREATE TABLE IF NOT EXISTS oportunidad_chilecompra_historial (
        id TEXT PRIMARY KEY,
        oportunidad_id TEXT NOT NULL REFERENCES oportunidades_chilecompra(id) ON DELETE CASCADE,
        tipo_evento TEXT NOT NULL,
        usuario_id TEXT,
        usuario_nombre TEXT,
        estado_anterior TEXT,
        estado_nuevo TEXT,
        detalle TEXT,
        fecha_evento TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_chc_historial_oportunidad ON oportunidad_chilecompra_historial(oportunidad_id);
    `)
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run('chilecompra_v1')
    console.log('✅ Migración chilecompra_v1 — tablas del asistente de oportunidades ChileCompra creadas')
  }
}

// ─── Seed inicial (solo para bases de datos nuevas) ───────────────────────────
function seedData() {
  const row = db.prepare('SELECT COUNT(*) as n FROM usuarios').get()
  if (row && row.n > 0) return

  db.transaction(() => {
    db.prepare(`INSERT INTO usuarios (id, email, password_hash, nombre, telefono, rol) VALUES (?,?,?,?,?,?)`)
      .run('a1b2c3d4-0000-0000-0000-000000000001', 'admin@rmgautoparts.cl', bcrypt.hashSync('rmg2026', 10), 'Administrador RMG', '+56 9 1234 5678', 'administrador')
    db.prepare(`INSERT INTO usuarios (id, email, password_hash, nombre, telefono, rol) VALUES (?,?,?,?,?,?)`)
      .run('a1b2c3d4-0000-0000-0000-000000000002', 'gerente@rmgautoparts.cl', bcrypt.hashSync('gerente2026', 10), 'Gerente RMG', '+56 9 0000 0002', 'gerente')
  })()
  console.log('✅ Usuarios iniciales creados: admin@rmgautoparts.cl / gerente@rmgautoparts.cl')
}

// ─── Init async (sql.js requiere carga WASM) ──────────────────────────────────
async function initDB() {
  const SQL = await initSqlJs({
    locateFile: file => path.join(path.dirname(require.resolve('sql.js')), file),
  })

  // One-time: si el disco persistente no tiene la DB pero la ruta efímera sí, copiar
  const OLD_DB_PATH = path.join(__dirname, '../../database/rmg_parts.db')
  if (!fs.existsSync(DB_PATH) && fs.existsSync(OLD_DB_PATH)) {
    try {
      fs.copyFileSync(OLD_DB_PATH, DB_PATH)
      console.log(`✅ DB migrada a disco persistente: ${DB_PATH}`)
    } catch (e) {
      console.warn(`⚠️  No se pudo migrar DB antigua: ${e.message}`)
    }
  }

  const backupSvc = require('../src/services/backupService')

  let sqlJsDb
  if (fs.existsSync(DB_PATH)) {
    try {
      sqlJsDb = new SQL.Database(fs.readFileSync(DB_PATH))
    } catch(e) {
      console.warn('⚠️ DB corrupta, intentando restaurar desde backup...', e.message)
      sqlJsDb = tryRestoreFromBackup(backupSvc, SQL)
    }
  } else {
    sqlJsDb = new SQL.Database()
  }

  db._db = sqlJsDb
  db.pragma('foreign_keys = ON')
  try {
    initSchema()
  } catch(schemaErr) {
    if (schemaErr.message && schemaErr.message.includes('malformed')) {
      console.warn('⚠️ DB corrupta en initSchema, restaurando desde backup...', schemaErr.message)
      sqlJsDb = tryRestoreFromBackup(backupSvc, SQL)
      db._db = sqlJsDb
      initSchema()
    } else { throw schemaErr }
  }
  runMigrations()
  seedData()

  // Inicializar servicio de backup con acceso a la DB y al constructor SQL
  backupSvc.init(db, SQL)
}

function tryRestoreFromBackup(backupSvc, SQL) {
  const backups = backupSvc.listBackups()
  for (const bk of backups) {
    try {
      const db = new SQL.Database(fs.readFileSync(bk.path))
      console.log(`✅ DB restaurada desde backup: ${bk.filename}`)
      return db
    } catch { console.warn(`❌ Backup ${bk.filename} también corrupto, probando siguiente...`) }
  }
  console.warn('❌ Sin backups válidos, creando DB nueva')
  return new SQL.Database()
}

module.exports = { db, initDB, uuidv4, extractClusterKey, parseVolumenLitros }
