// Compatibilidad: exporta la instancia db de SQLite
// Este archivo se mantiene solo por si algún import externo lo referencia
const { db } = require('./database')
module.exports = db
