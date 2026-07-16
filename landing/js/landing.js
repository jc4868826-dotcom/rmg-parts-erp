// landing.js — Tienda RMG Parts: carrusel, búsqueda estática, 3 niveles familia→subfamilia→producto
(function () {
  'use strict';

  const ERP   = (typeof CONFIG !== 'undefined') ? CONFIG.BASE_URL : 'https://rmg-parts-erp.onrender.com';
  const WA_NR = (typeof CONFIG !== 'undefined') ? CONFIG.WHATSAPP : '';

  // Familias: solo estructura (label, color). Sin fotos hardcodeadas.
  const FAMILIAS = [
    { key: 'NEUMATICOS',  label: 'Neumáticos',  color: '#0071BD' },
    { key: 'BATERIAS',    label: 'Baterías',    color: '#29AAE1' },
    { key: 'LUBRICANTES', label: 'Lubricantes', color: '#435664' },
  ];

  let _productos   = [];
  let _subfamilias = [];
  let _banners     = [];
  let _catalogo    = [];

  let _heroIdx   = 0;
  let _heroTimer = null;

  // Estado drill-down
  let _activeFam = null;  // key: 'NEUMATICOS'|'BATERIAS'|'LUBRICANTES'
  let _activeSub = null;  // id numérico de landing_subfamilias

  // ─── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    const [prods, subs, bans, cat] = await Promise.allSettled([
      fetch(ERP + '/api/public/landing/productos').then(r => r.ok ? r.json() : []),
      fetch(ERP + '/api/public/landing/subfamilias').then(r => r.ok ? r.json() : []),
      fetch(ERP + '/api/public/landing/banners').then(r => r.ok ? r.json() : []),
      fetch('data/catalogo.json').then(r => r.ok ? r.json() : []),
    ]);
    _productos   = prods.status === 'fulfilled'  ? (Array.isArray(prods.value)  ? prods.value  : []) : [];
    _subfamilias = subs.status === 'fulfilled'   ? (Array.isArray(subs.value)   ? subs.value   : []) : [];
    _banners     = bans.status === 'fulfilled'   ? (Array.isArray(bans.value)   ? bans.value   : []) : [];
    _catalogo    = cat.status === 'fulfilled'    ? (Array.isArray(cat.value)    ? cat.value    : []) : [];

    _buildNavDropdowns();
    _renderHero();
    _renderCatBoxes();
    _renderDrillDown();
    _initSearch();
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function _slug(s) { return String(s||'').toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,''); }
  function _esc(s)  { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function _fmt(n)  { return n != null ? '$' + Math.round(n).toLocaleString('es-CL') : 'Consultar'; }
  function _norm(s) { return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''); }

  function _waLink(texto) {
    const msg = encodeURIComponent(texto);
    return WA_NR ? `https://wa.me/${WA_NR}?text=${msg}` : `https://wa.me/?text=${msg}`;
  }

  // ─── Nav mega-menu ─────────────────────────────────────────────────────────
  function _buildNavDropdowns() {
    FAMILIAS.forEach(fam => {
      const el = document.getElementById('dd-' + fam.key);
      if (!el) return;
      const subs = _subfamilias.filter(s => s.familia === fam.key);
      if (!subs.length) {
        el.innerHTML = `<a class="mega-link" onclick="Landing.selectFamilia('${fam.key}')">${_esc(fam.label)}</a>`;
        return;
      }
      el.innerHTML = subs.map(s =>
        `<a class="mega-link" onclick="Landing.selectSub(${s.id},'${fam.key}')">${_esc(s.nombre)}</a>`
      ).join('');
    });
  }

  // ─── Hero carrusel ─────────────────────────────────────────────────────────
  function _renderHero() {
    const wrap = document.getElementById('landing-hero');
    if (!wrap) return;

    if (!_banners.length) {
      wrap.style.display = 'none';
      return;
    }

    wrap.style.display = '';
    wrap.innerHTML = `
      <div class="lh-track" id="lhTrack">
        ${_banners.map((b, i) => `
          <div class="lh-slide${i === 0 ? ' active' : ''}">
            <img src="${ERP}/api/public/landing/foto/banners/${b.id}" alt="Banner ${i + 1}"
                 loading="${i === 0 ? 'eager' : 'lazy'}"
                 onerror="this.style.display='none'">
          </div>
        `).join('')}
      </div>
      <button class="lh-arrow lh-prev" onclick="Landing.heroGo(Landing._heroIdx-1)" aria-label="Anterior">&#8249;</button>
      <button class="lh-arrow lh-next" onclick="Landing.heroGo(Landing._heroIdx+1)" aria-label="Siguiente">&#8250;</button>
      <div class="lh-dots">
        ${_banners.map((_, i) => `<button class="lh-dot${i === 0 ? ' active' : ''}" onclick="Landing.heroGo(${i})" aria-label="Slide ${i + 1}"></button>`).join('')}
      </div>
    `;

    // Forzar estado visible del primer slide sin transición en el primer paint
    const firstSlide = wrap.querySelector('.lh-slide.active');
    if (firstSlide) {
      firstSlide.style.transition = 'none';
      firstSlide.style.opacity = '1';
      firstSlide.style.display = 'block';
      requestAnimationFrame(() => { firstSlide.style.transition = ''; });
    }

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

  // ─── 3 cajas de categoría ──────────────────────────────────────────────────
  function _renderCatBoxes() {
    const el = document.getElementById('cat-boxes');
    if (!el) return;
    el.innerHTML = FAMILIAS.map(fam => {
      const subCount  = _subfamilias.filter(s => s.familia === fam.key).length;
      const prodCount = _productos.filter(p => p.familia === fam.key).length;
      const countTxt  = subCount > 0
        ? `<span class="catbox-count">${subCount} subfamilias</span>`
        : prodCount > 0 ? `<span class="catbox-count">${prodCount} productos</span>` : '';
      const erpSrc = `${ERP}/api/public/landing/foto/familias/${fam.key}`;

      return `
        <div class="catbox" onclick="Landing.selectFamilia('${fam.key}')">
          <div class="catbox-img-wrap" style="background:${fam.color}33">
            <img src="${erpSrc}" alt="${_esc(fam.label)}" loading="lazy"
                 onerror="this.style.display='none'">
            <div class="catbox-overlay"></div>
          </div>
          <div class="catbox-info">
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

  // ─── Drill-down (familia → subfamilias → productos) ────────────────────────
  function selectFamilia(famKey) {
    _activeFam = famKey;
    _activeSub = null;
    _renderDrillDown();
    const el = document.getElementById('drilldown-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function selectSub(subId, famKey) {
    if (famKey) _activeFam = famKey;
    _activeSub = subId;
    _renderDrillDown();
    const el = document.getElementById('drilldown-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function backToFamilias() {
    _activeFam = null;
    _activeSub = null;
    _renderDrillDown();
  }

  function backToSubs() {
    _activeSub = null;
    _renderDrillDown();
    const el = document.getElementById('drilldown-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function _wrap(inner) {
    return `<section class="drilldown-section"><div class="container">${inner}</div></section>`;
  }

  function _renderDrillDown() {
    const el = document.getElementById('drilldown-section');
    if (!el) return;

    if (!_activeFam) { el.innerHTML = ''; return; }

    const fam = FAMILIAS.find(f => f.key === _activeFam);
    const famLabel = fam ? fam.label : _activeFam;

    if (!_activeSub) {
      const subs = _subfamilias.filter(s => s.familia === _activeFam);

      if (!subs.length) {
        const prods = _productos.filter(p => p.familia === _activeFam);
        el.innerHTML = _wrap(`
          <div class="drilldown-header">
            <button class="drill-back" onclick="Landing.backToFamilias()">← Volver</button>
            <h2 class="drill-title">${_esc(famLabel)}</h2>
          </div>
          ${prods.length
            ? `<div class="prod-grid">${prods.map(_cardHTML).join('')}</div>`
            : '<p class="drill-empty">Próximamente</p>'
          }
        `);
        return;
      }

      el.innerHTML = _wrap(`
        <div class="drilldown-header">
          <button class="drill-back" onclick="Landing.backToFamilias()">← Volver</button>
          <h2 class="drill-title">${_esc(famLabel)}</h2>
        </div>
        <div class="subfam-grid">
          ${subs.map(s => {
            const erpSrc = `${ERP}/api/public/landing/foto/subfamilias/${s.id}`;
            return `
              <div class="subfam-card" onclick="Landing.selectSub(${s.id})">
                <div class="subfam-card-img" style="background:${fam ? fam.color + '22' : '#0071BD22'}">
                  <img src="${erpSrc}" alt="${_esc(s.nombre)}" loading="lazy"
                       onerror="this.style.display='none'">
                </div>
                <div class="subfam-card-body">
                  <div class="subfam-card-name">${_esc(s.nombre)}</div>
                  ${s.descripcion ? `<div class="subfam-card-desc">${_esc(s.descripcion)}</div>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `);
      return;
    }

    const sub = _subfamilias.find(s => s.id === _activeSub);
    const subLabel = sub ? sub.nombre : '';
    const prods = _productos.filter(p => p.subfamilia_id === _activeSub);

    el.innerHTML = _wrap(`
      <div class="drilldown-header">
        <button class="drill-back" onclick="Landing.backToSubs()">← ${_esc(famLabel)}</button>
        <h2 class="drill-title">${_esc(subLabel)}</h2>
      </div>
      ${prods.length
        ? `<div class="prod-grid">${prods.map(_cardHTML).join('')}</div>`
        : '<p class="drill-empty">Próximamente</p>'
      }
    `);
  }

  function _cardHTML(p) {
    const imgSrc = `${ERP}/api/public/landing/foto/productos/${p.id}`;
    const badge  = p.codigo
      ? `<div class="pcard-badge">${_esc(p.codigo)}${p.marca ? ' · ' + _esc(p.marca) : ''}</div>`
      : (p.marca ? `<div class="pcard-badge">${_esc(p.marca)}</div>` : '');
    const waMsg  = `Hola, quiero cotizar ${p.descripcion}${p.codigo ? ' (' + p.codigo + ')' : ''}`;

    return `
      <div class="pcard">
        <div class="pcard-img pcard-img--placeholder">
          <img src="${imgSrc}" alt="${_esc(p.descripcion)}" loading="lazy"
               onerror="this.style.display='none'">
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

  // ─── Búsqueda estática (PASO 4) ────────────────────────────────────────────
  function _initSearch() {
    const wrap = document.getElementById('search-static');
    if (!wrap) return;

    // Opciones únicas para filtros
    const familias  = [...new Set(_catalogo.map(r => r.Familia).filter(Boolean))].sort();
    const marcas    = [...new Set(_catalogo.map(r => r['Marca(s)']).filter(Boolean))].sort();

    wrap.innerHTML = `
      <div class="search-bar-inner container">
        <span class="search-label">¿Buscas algo en específico?</span>
        <div class="search-controls">
          <input id="sch-q" class="sch-input" type="text" placeholder="Buscar por línea, marca, tipo…" autocomplete="off"
                 oninput="Landing._schInput()" onfocus="Landing._schInput()">
          <select id="sch-fam" class="sch-select" onchange="Landing._schInput()">
            <option value="">Todas las familias</option>
            ${familias.map(f => `<option value="${_esc(f)}">${_esc(f)}</option>`).join('')}
          </select>
          <select id="sch-marca" class="sch-select" onchange="Landing._schInput()">
            <option value="">Todas las marcas</option>
            ${marcas.map(m => `<option value="${_esc(m)}">${_esc(m)}</option>`).join('')}
          </select>
          <button class="sch-clear" onclick="Landing._schClear()">✕</button>
        </div>
        <div id="sch-results" class="sch-results" style="display:none"></div>
      </div>
    `;

    document.addEventListener('click', e => {
      if (!wrap.contains(e.target)) _hideResults();
    });
  }

  function _schInput() {
    const q     = (document.getElementById('sch-q')?.value || '').trim();
    const fam   = document.getElementById('sch-fam')?.value  || '';
    const marca = document.getElementById('sch-marca')?.value || '';
    const resEl = document.getElementById('sch-results');
    if (!resEl) return;

    if (!q && !fam && !marca) { resEl.style.display = 'none'; return; }

    const qn = _norm(q);
    const results = _catalogo.filter(r => {
      if (fam   && r.Familia      !== fam)   return false;
      if (marca && r['Marca(s)']  !== marca) return false;
      if (!qn) return true;
      const hay = _norm([r['Línea'], r['Marca(s)'], r.Tipo, r.Subfamilia, r['Sub-subfamilia']].join(' '));
      return hay.includes(qn);
    }).slice(0, 40);

    if (!results.length) {
      resEl.innerHTML = '<div class="sch-empty">Sin resultados</div>';
    } else {
      resEl.innerHTML = results.map(r => `
        <div class="sch-item">
          <div class="sch-item-name">${_esc(r['Línea'] || r.Tipo || '—')}</div>
          <div class="sch-item-meta">
            ${r.Familia ? `<span class="sch-tag">${_esc(r.Familia)}</span>` : ''}
            ${r['Marca(s)'] ? `<span class="sch-tag">${_esc(r['Marca(s)'])}</span>` : ''}
            ${r.Subfamilia ? `<span class="sch-tag sch-tag--sub">${_esc(r.Subfamilia)}</span>` : ''}
          </div>
        </div>
      `).join('');
    }
    resEl.style.display = 'block';
  }

  function _schClear() {
    const q = document.getElementById('sch-q');
    const f = document.getElementById('sch-fam');
    const m = document.getElementById('sch-marca');
    if (q) q.value = '';
    if (f) f.value = '';
    if (m) m.value = '';
    _hideResults();
  }

  function _hideResults() {
    const el = document.getElementById('sch-results');
    if (el) el.style.display = 'none';
  }

  // ─── Expose ────────────────────────────────────────────────────────────────
  window.Landing = {
    init, heroGo, selectFamilia, selectSub, backToFamilias, backToSubs,
    _schInput, _schClear,
  };
  Object.defineProperty(window.Landing, '_heroIdx', { get: () => _heroIdx });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
