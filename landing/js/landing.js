// landing.js — Renderiza la landing principal con productos y banners del ERP propio
(function () {
  'use strict';

  // ─── Config ──────────────────────────────────────────────────────────────────
  const ERP   = (typeof CONFIG !== 'undefined') ? CONFIG.BASE_URL : 'https://rmg-parts-erp.onrender.com';
  const WA_NR = (typeof CONFIG !== 'undefined') ? CONFIG.WHATSAPP : '';

  const FAMILIAS = [
    { key: 'NEUMATICOS',  label: 'Neumáticos',  icon: '🛞', color: '#0071BD', hero: 'assets/img/hero/hero-neumaticos.png'  },
    { key: 'BATERIAS',    label: 'Baterías',    icon: '🔋', color: '#29AAE1', hero: 'assets/img/hero/hero-baterias.png'    },
    { key: 'LUBRICANTES', label: 'Lubricantes', icon: '🛢️', color: '#435664', hero: 'assets/img/hero/hero-lubricantes.png' },
  ];

  let _productos  = [];
  let _banners    = [];
  let _heroIdx    = 0;
  let _heroTimer  = null;

  // ─── Init ─────────────────────────────────────────────────────────────────────
  async function init() {
    try { _productos = await fetch(ERP + '/api/public/landing/productos').then(r => r.json()); } catch (_) {}
    try { _banners   = await fetch(ERP + '/api/public/landing/banners'  ).then(r => r.json()); } catch (_) {}

    _buildNavDropdowns();
    _renderHero();
    _renderCatBoxes();
    _renderFamilias();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  function _slug(s) { return String(s||'').toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,''); }
  function _esc(s)  { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function _fmt(n)  { return n != null ? '$' + Math.round(n).toLocaleString('es-CL') : 'Consultar'; }

  function _waLink(texto) {
    const msg = encodeURIComponent(texto);
    return WA_NR ? `https://wa.me/${WA_NR}?text=${msg}` : `https://wa.me/?text=${msg}`;
  }

  // ─── Nav mega-menu ────────────────────────────────────────────────────────────
  function _buildNavDropdowns() {
    FAMILIAS.forEach(fam => {
      const el = document.getElementById('dd-' + fam.key);
      if (!el) return;
      const subs = [...new Set(_productos.filter(p => p.familia === fam.key && p.subfamilia).map(p => p.subfamilia))];
      if (!subs.length) {
        el.innerHTML = `<span class="mega-empty">Sin subfamilias cargadas</span>`;
        return;
      }
      el.innerHTML = subs.map(sub =>
        `<a class="mega-link" onclick="Landing.scrollToSub('${fam.key}','${sub.replace(/'/g,"\\'")}')">${_esc(sub)}</a>`
      ).join('');
    });
  }

  function scrollToSub(famKey, sub) {
    // Close all dropdowns
    document.querySelectorAll('.nav-mega-menu').forEach(m => m.classList.remove('open'));
    const anchorId = 'sub-' + _slug(famKey) + '-' + _slug(sub);
    const el = document.getElementById(anchorId) || document.getElementById('sec-' + famKey);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ─── Hero carrusel ─────────────────────────────────────────────────────────────
  function _renderHero() {
    const wrap = document.getElementById('landing-hero');
    if (!wrap) return;

    // No banners → keep existing static carousel (leave DOM untouched)
    if (!_banners.length) return;

    wrap.innerHTML = `
      <div class="lh-track" id="lhTrack">
        ${_banners.map((b, i) => `
          <div class="lh-slide${i === 0 ? ' active' : ''}">
            <img src="${ERP}/uploads/landing/${_esc(b.foto_path)}" alt="Banner ${b.id}" loading="${i === 0 ? 'eager' : 'lazy'}"
                 onerror="this.parentElement.style.background='#0c1523'">
          </div>
        `).join('')}
      </div>
      <button class="lh-arrow lh-prev" onclick="Landing.heroGo(_heroIdx-1)" aria-label="Anterior">&#8249;</button>
      <button class="lh-arrow lh-next" onclick="Landing.heroGo(_heroIdx+1)" aria-label="Siguiente">&#8250;</button>
      <div class="lh-dots">
        ${_banners.map((_,i) => `<button class="lh-dot${i===0?' active':''}" onclick="Landing.heroGo(${i})" aria-label="Slide ${i+1}"></button>`).join('')}
      </div>
    `;

    wrap.addEventListener('mouseenter', () => clearInterval(_heroTimer));
    wrap.addEventListener('mouseleave', _startAutoplay);
    _startAutoplay();
  }

  function _startAutoplay() {
    clearInterval(_heroTimer);
    _heroTimer = setInterval(() => heroGo(_heroIdx + 1), 5000);
  }

  function heroGo(i) {
    const slides = document.querySelectorAll('#landing-hero .lh-slide');
    const dots   = document.querySelectorAll('#landing-hero .lh-dot');
    if (!slides.length) return;
    _heroIdx = ((i % slides.length) + slides.length) % slides.length;
    slides.forEach((s, j) => s.classList.toggle('active', j === _heroIdx));
    dots.forEach((d, j) => d.classList.toggle('active', j === _heroIdx));
  }

  // ─── 3 cajas de categoría ─────────────────────────────────────────────────────
  function _renderCatBoxes() {
    const el = document.getElementById('cat-boxes');
    if (!el) return;
    el.innerHTML = FAMILIAS.map(fam => {
      const first  = _productos.find(p => p.familia === fam.key && p.foto_path);
      const imgSrc = first ? `${ERP}/uploads/landing/${first.foto_path}` : fam.hero;
      const count  = _productos.filter(p => p.familia === fam.key).length;
      const countTxt = count > 0 ? `<span class="catbox-count">${count} productos</span>` : '';
      return `
        <div class="catbox" onclick="document.getElementById('sec-${fam.key}').scrollIntoView({behavior:'smooth'})">
          <div class="catbox-img-wrap" style="background:${fam.color}33">
            <img src="${imgSrc}" alt="${_esc(fam.label)}" loading="lazy"
                 onerror="this.style.display='none'">
            <div class="catbox-overlay"></div>
          </div>
          <div class="catbox-info">
            <span class="catbox-icon">${fam.icon}</span>
            <div>
              <div class="catbox-label">${_esc(fam.label)}</div>
              ${countTxt}
            </div>
            <svg class="catbox-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </div>
      `;
    }).join('');
  }

  // ─── Secciones por familia ────────────────────────────────────────────────────
  function _renderFamilias() {
    const el = document.getElementById('landing-familias');
    if (!el) return;
    if (!_productos.length) { el.innerHTML = ''; return; }

    el.innerHTML = FAMILIAS.map(fam => {
      const prods = _productos.filter(p => p.familia === fam.key);
      if (!prods.length) return '';

      // Group by subfamilia
      const bySub = {};
      prods.forEach(p => {
        const k = p.subfamilia || '';
        if (!bySub[k]) bySub[k] = [];
        bySub[k].push(p);
      });

      return `
        <section id="sec-${fam.key}" class="familia-sec">
          <div class="container">
            <div class="familia-head">
              <span class="familia-icon">${fam.icon}</span>
              <h2 class="familia-title">${_esc(fam.label)}</h2>
            </div>
            ${Object.entries(bySub).map(([sub, ps]) => `
              <div class="subfam-group">
                ${sub ? `<div class="subfam-label" id="sub-${_slug(fam.key)}-${_slug(sub)}">${_esc(sub)}</div>` : `<div id="sub-${_slug(fam.key)}-"></div>`}
                <div class="prod-row-scroll">
                  ${ps.map(p => _cardHTML(p)).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </section>
      `;
    }).join('');
  }

  function _cardHTML(p) {
    const imgSrc = p.foto_path ? `${ERP}/uploads/landing/${_esc(p.foto_path)}` : null;
    const icon   = p.familia === 'NEUMATICOS' ? '🛞' : p.familia === 'BATERIAS' ? '🔋' : '🛢️';
    const badge  = p.codigo
      ? `<div class="pcard-badge">${_esc(p.codigo)}${p.marca ? ' · ' + _esc(p.marca) : ''}</div>`
      : (p.marca ? `<div class="pcard-badge">${_esc(p.marca)}</div>` : '');
    const waMsg  = `Hola, quiero cotizar ${p.descripcion}${p.codigo ? ' (' + p.codigo + ')' : ''}`;

    return `
      <div class="pcard">
        <div class="pcard-img${!imgSrc ? ' pcard-img--placeholder' : ''}">
          ${imgSrc
            ? `<img src="${imgSrc}" alt="${_esc(p.descripcion)}" loading="lazy" onerror="this.parentElement.classList.add('pcard-img--placeholder');this.remove()">`
            : `<span class="pcard-icon">${icon}</span>`
          }
        </div>
        <div class="pcard-body">
          ${badge}
          <div class="pcard-name">${_esc(p.descripcion)}</div>
          ${p.presentacion ? `<div class="pcard-pres">${_esc(p.presentacion)}</div>` : ''}
          <div class="pcard-price">${_fmt(p.precio)}</div>
          <a class="pcard-wa" href="${_waLink(waMsg)}" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12.001 2.003c-5.522 0-10 4.477-10 10 0 1.765.46 3.464 1.334 4.965L2 22l5.164-1.323A9.953 9.953 0 0012 22.003c5.523 0 10-4.477 10-10s-4.477-10-9.999-10zm0 18.166a8.14 8.14 0 01-4.16-1.14l-.298-.177-3.065.785.82-2.988-.194-.307a8.16 8.16 0 01-1.264-4.339c0-4.512 3.672-8.183 8.184-8.183 4.512 0 8.183 3.671 8.183 8.183-.002 4.512-3.672 8.166-8.206 8.166z"/></svg>
            Cotizar por WhatsApp
          </a>
        </div>
      </div>
    `;
  }

  // ─── Expose ───────────────────────────────────────────────────────────────────
  window.Landing = { init, heroGo, scrollToSub };
  // _heroIdx is module-level; expose getter for onclick attrs
  Object.defineProperty(window.Landing, '_heroIdx', { get: () => _heroIdx });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
