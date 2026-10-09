/**
 * RMG Parts — Envío de correo con la casilla del usuario conectado.
 *
 * 2026-10-09 (pedido de JC). Antes todo salía por una cuenta SMTP única y la
 * dirección del vendedor iba solo en Reply-To: el destinatario veía un
 * remitente genérico y el vendedor no tenía el correo en su carpeta de
 * Enviados. Con las casillas @rmgautos.cl del hosting (cPanel), cada usuario
 * puede autenticarse con su propia clave y el correo sale genuinamente desde
 * su dirección.
 *
 * Sobre guardar la clave: no hay alternativa a almacenarla. SMTP de cPanel no
 * ofrece OAuth, así que para autenticarse como el usuario hay que tener su
 * contraseña. Se guarda cifrada con AES-256-GCM —no en claro, y no con hash,
 * porque hay que poder recuperarla— con una llave que vive solo en el entorno.
 * Quien lea el archivo .db no puede usar las claves sin esa llave.
 *
 * Recomendación operativa: crear en cPanel una contraseña distinta a la del
 * webmail, o una casilla dedicada al envío, para que esta credencial no sea la
 * misma que usa la persona para entrar a su correo.
 */
const crypto = require('crypto')
const nodemailer = require('nodemailer')
const { db } = require('../../config/database')

const ALGORITMO = 'aes-256-gcm'
const SAL = 'rmg-smtp-v1'

// Puerto 465 implica TLS directo; 587 es STARTTLS. cPanel ofrece los dos.
const HOST_DEFECTO = process.env.SMTP_HOST || 'mail.rmgautos.cl'
const PUERTO_DEFECTO = Number(process.env.SMTP_PORT || 465)

function _llave() {
  const secreto = process.env.SMTP_ENC_KEY || process.env.JWT_SECRET
  if (!secreto) {
    throw new Error('Falta SMTP_ENC_KEY (o JWT_SECRET) para cifrar las claves de correo')
  }
  return crypto.scryptSync(secreto, SAL, 32)
}

/** Cifra una clave para guardarla. Formato: iv.tag.datos, todo en base64. */
function cifrar(texto) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITMO, _llave(), iv)
  const datos = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()])
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), datos.toString('base64')].join('.')
}

/** Devuelve la clave en claro, o null si el blob está corrupto o la llave cambió. */
function descifrar(blob) {
  try {
    const [iv, tag, datos] = String(blob).split('.')
    if (!iv || !tag || !datos) return null
    const decipher = crypto.createDecipheriv(ALGORITMO, _llave(), Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(datos, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** Credenciales SMTP propias del usuario, o null si no las configuró. */
function credencialesDe(usuarioId) {
  if (!usuarioId) return null
  let fila
  try {
    fila = db.prepare(
      'SELECT email, nombre, smtp_email, smtp_pass_enc, smtp_host, smtp_port FROM usuarios WHERE id = ?'
    ).get(usuarioId)
  } catch {
    return null   // la migración todavía no corrió
  }
  if (!fila || !fila.smtp_pass_enc) return null

  const pass = descifrar(fila.smtp_pass_enc)
  if (!pass) return null

  return {
    nombre: fila.nombre,
    email:  fila.smtp_email || fila.email,
    pass,
    host:   fila.smtp_host || HOST_DEFECTO,
    port:   Number(fila.smtp_port || PUERTO_DEFECTO),
  }
}

function _transporter({ host, port, email, pass }) {
  return nodemailer.createTransport({
    host,
    port,
    secure: Number(port) === 465,
    auth: { user: email, pass },
  })
}

/**
 * Cómo enviar un correo en nombre de este usuario.
 *
 * Devuelve siempre un objeto utilizable: si el usuario configuró su casilla, se
 * usa la suya; si no, se cae a la cuenta compartida con Reply-To, que es el
 * comportamiento anterior. `propio` dice cuál de los dos ocurrió, para que la
 * interfaz pueda avisar sin que el envío falle.
 */
function remitenteDe(usuario) {
  const cred = credencialesDe(usuario?.id)
  if (cred) {
    return {
      propio: true,
      transporter: _transporter(cred),
      from: `"${cred.nombre || 'RMG Auto Parts'}" <${cred.email}>`,
      replyTo: cred.email,
      direccion: cred.email,
    }
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null

  const nombre = usuario?.nombre ? `${usuario.nombre} · RMG Auto Parts` : 'RMG Auto Parts'
  return {
    propio: false,
    transporter: nodemailer.createTransport({
      host:   process.env.SMTP_HOST || 'smtp.gmail.com',
      port:   Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    }),
    from: `"${nombre}" <${process.env.SMTP_USER}>`,
    replyTo: usuario?.email || undefined,
    direccion: process.env.SMTP_USER,
  }
}

/** Prueba la conexión y el login sin mandar ningún correo. */
async function probar({ email, pass, host, port }) {
  const t = _transporter({
    email,
    pass,
    host: host || HOST_DEFECTO,
    port: Number(port || PUERTO_DEFECTO),
  })
  await t.verify()
  return true
}

module.exports = {
  cifrar, descifrar, credencialesDe, remitenteDe, probar,
  HOST_DEFECTO, PUERTO_DEFECTO,
}
