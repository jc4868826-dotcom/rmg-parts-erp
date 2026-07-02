/**
 * RMG Auto Parts — API Backend
 * Express + Supabase · Santiago RM · 2026
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { initDB } = require('../config/database');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware de seguridad ────────────────────────────────
app.use(helmet());
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://rmg-parts-frontend.onrender.com',
  'https://rmgautoparts.cl',
  'https://www.rmgautoparts.cl',
]
if (process.env.APP_URL && !ALLOWED_ORIGINS.includes(process.env.APP_URL)) {
  ALLOWED_ORIGINS.push(process.env.APP_URL)
}

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}));

// Rate limiting general
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200,
  message: { error: 'Demasiadas solicitudes. Intenta en 15 minutos.' },
});
app.use('/api/', limiter);

// Rate limiting estricto para auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de login.' },
});

// ─── Parsing ────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// ─── Rutas ─────────────────────────────────────────────────
app.use('/api/auth',       authLimiter, require('./routes/auth'));
app.use('/api/clientes',               require('./routes/clientes'));
app.use('/api/productos',              require('./routes/productos'));
app.use('/api/cotizaciones',           require('./routes/cotizaciones'));
app.use('/api/pedidos',                require('./routes/pedidos'));
app.use('/api/inventario',             require('./routes/inventario'));
app.use('/api/pipeline',               require('./routes/pipeline'));
app.use('/api/dashboard',              require('./routes/dashboard'));
app.use('/api/whatsapp',               require('./routes/whatsapp'));   // Bot RMG
app.use('/api/meta',                   require('./routes/meta'));        // Meta Ads webhook
app.use('/api/reportes',               require('./routes/reportes'));
app.use('/api/compras',                require('./routes/compras'));   // Compras/Proveedores/CxP
app.use('/api/cxc',                    require('./routes/cxc'));       // Cuentas por cobrar
app.use('/api/bodega',                 require('./routes/bodega'));    // Bodegas
app.use('/api/admin',                  require('./routes/admin'));     // TEMP: reset-db
app.use('/api/pricing',                require('./routes/pricing'));   // Pricing multi-proveedor + benchmarks
app.use('/api/prospeccion',            require('./routes/prospeccion')); // Pipeline Prospección
app.use('/api/lista-precios',          require('./routes/listaPrecios')); // Lista de Precios
app.use('/api/gastos',                 require('./routes/gastos'));        // Gastos operacionales
app.use('/api/flujo-caja',             require('./routes/flujoCaja'));     // Flujo de caja
app.use('/api/configuracion',          require('./routes/configuracion')); // Configuración mensual
app.use('/api/notas-venta',            require('./routes/notasVenta'));    // Notas de venta

// ─── Health check ───────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    empresa: 'RMG Auto Parts',
    timestamp: new Date().toISOString(),
  });
});

// ─── 404 ────────────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.originalUrl}` });
});

// ─── Error handler global ───────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(err.statusCode || 500).json({
    error: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ─── Start ──────────────────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`
  ╔══════════════════════════════════════╗
  ║  RMG Auto Parts — API               ║
  ║  Puerto: ${PORT}                        ║
  ║  Entorno: ${process.env.NODE_ENV || 'development'}             ║
  ║  DB: SQLite (sql.js)                 ║
  ╚══════════════════════════════════════╝
      `);
    });
  })
  .catch(err => {
    console.error('Error iniciando DB:', err);
    process.exit(1);
  });

module.exports = app;
