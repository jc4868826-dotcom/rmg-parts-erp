'use strict';
const express = require('express');
const router  = express.Router();
const { db }  = require('../../config/database');
const { CATALOGO_VISTONY, SYSTEM_PROMPT } = require('../data/catalogoVistony');

// Statements preparados al cargar el módulo (una sola vez)
const stmtPrecios2 = db.prepare(`
  SELECT descripcion, precio_venta_neto
  FROM lista_precios
  WHERE LOWER(descripcion) LIKE LOWER(?)
    AND precio_venta_neto IS NOT NULL
    AND precio_venta_neto > 0
  ORDER BY precio_venta_neto ASC
`);

const stmtPrecios1 = db.prepare(`
  SELECT descripcion, precio_venta_neto
  FROM lista_precios
  WHERE LOWER(descripcion) LIKE LOWER(?)
    AND precio_venta_neto IS NOT NULL
    AND precio_venta_neto > 0
  ORDER BY precio_venta_neto ASC
  LIMIT 6
`);

// ─── POST /api/asesor/recomendar ─────────────────────────────────────────────
router.post('/recomendar', async (req, res) => {
  const { query } = req.body;
  if (!query || query.trim().length < 2) {
    return res.status(400).json({ error: 'Query muy corta' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY no configurada' });

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 800,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: `Giro de negocio: "${query.trim()}"` },
        ],
      }),
    });

    const data = await openaiRes.json();
    if (!openaiRes.ok) {
      console.error('[asesor] OpenAI error:', data);
      return res.status(500).json({ error: 'Error OpenAI', detail: data.error?.message });
    }

    const text  = data.choices?.[0]?.message?.content || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    const seen = new Set();
    const productos = (parsed.productos || [])
      .map(p => {
        const found = CATALOGO_VISTONY.find(c =>
          c.n.toLowerCase() === p.nombre.toLowerCase() ||
          c.n.toLowerCase().startsWith(p.nombre.toLowerCase().split(' ')[0].toLowerCase())
        );
        return found ? { aplicacion: p.aplicacion, catalog: found } : null;
      })
      .filter(p => {
        if (!p) return false;
        if (seen.has(p.catalog.n)) return false;
        seen.add(p.catalog.n);
        return true;
      });

    return res.json({
      giro_detectado: parsed.giro_detectado || query.trim(),
      analisis:       parsed.analisis || '',
      productos,
    });

  } catch (err) {
    console.error('[asesor] recomendar error:', err.message);
    return res.status(500).json({ error: 'Error interno', detail: err.message });
  }
});

// ─── POST /api/asesor/precios ─────────────────────────────────────────────────
// Devuelve TODAS las presentaciones con precio por cada producto
router.post('/precios', (req, res) => {
  const { nombres } = req.body;
  if (!Array.isArray(nombres) || nombres.length === 0) {
    return res.status(400).json({ error: 'nombres requerido' });
  }

  try {
    const resultados = {};

    for (const nombre of nombres) {
      const palabras = nombre.trim().split(/\s+/);
      const kw2 = `%${palabras.slice(0, 2).join(' ')}%`; // ej: "%ATTOM S310%"
      const kw1 = `%${palabras[0]}%`;                    // ej: "%ATTOM%"

      let rows = stmtPrecios2.all(kw2);

      // Fallback: solo primera palabra si no encontramos nada con 2 palabras
      if (rows.length === 0) {
        rows = stmtPrecios1.all(kw1);
      }

      resultados[nombre] = rows.map(r => ({
        descripcion:  r.descripcion,
        precio_venta: parseFloat(r.precio_venta_neto),
      }));
    }

    return res.json({ precios: resultados });

  } catch (err) {
    console.error('[asesor] precios error:', err.message);
    return res.status(500).json({ error: 'Error consultando precios', detail: err.message });
  }
});

module.exports = router;
