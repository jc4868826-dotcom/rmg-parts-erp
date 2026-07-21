// landing.js — Tienda RMG Parts: carrusel, búsqueda estática, 3 niveles familia→subfamilia→producto
(function () {
  'use strict';

  const ERP   = (typeof CONFIG !== 'undefined') ? CONFIG.BASE_URL : 'https://rmg-parts-erp.onrender.com';
  const WA_NR = (typeof CONFIG !== 'undefined') ? CONFIG.WHATSAPP : '';

  // Familias: estructura base para nav y fallback. Las cajas se renderizan desde DB.
  const FAMILIAS = [
    { key: 'NEUMATICOS',  label: 'Neumáticos',  color: '#0071BD' },
    { key: 'BATERIAS',    label: 'Baterías',    color: '#29AAE1' },
    { key: 'LUBRICANTES', label: 'Lubricantes', color: '#435664' },
  ];
  const FAM_META  = Object.fromEntries(FAMILIAS.map(f => [f.key, f]));
  const COLOR_POOL = ['#0071BD', '#29AAE1', '#435664', '#e07b39', '#2a7a3b', '#8e44ad'];

  let _productos   = [];
  let _subfamilias = [];
  let _banners     = [];
  let _catalogo    = [];
  let _familiasDB  = [];

  let _heroIdx   = 0;
  let _heroTimer = null;

  // Estado drill-down
  let _activeFam = null;  // key: 'NEUMATICOS'|'BATERIAS'|'LUBRICANTES'
  let _activeSub = null;  // id numérico de landing_subfamilias
  let _activeProd = null; // id numérico de landing_productos (ficha individual)

  // ─── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    const [prods, subs, bans, cat, fams] = await Promise.allSettled([
      fetch(ERP + '/api/public/landing/productos').then(r => r.ok ? r.json() : []),
      fetch(ERP + '/api/public/landing/subfamilias').then(r => r.ok ? r.json() : []),
      fetch(ERP + '/api/public/landing/banners').then(r => r.ok ? r.json() : []),
      fetch('data/catalogo.json').then(r => r.ok ? r.json() : []),
      fetch(ERP + '/api/public/landing/familias').then(r => r.ok ? r.json() : []),
    ]);
    _productos   = prods.status === 'fulfilled'  ? (Array.isArray(prods.value)  ? prods.value  : []) : [];
    _subfamilias = subs.status === 'fulfilled'   ? (Array.isArray(subs.value)   ? subs.value   : []) : [];
    _banners     = bans.status === 'fulfilled'   ? (Array.isArray(bans.value)   ? bans.value   : []) : [];
    _catalogo    = cat.status === 'fulfilled'    ? (Array.isArray(cat.value)    ? cat.value    : []) : [];
    _familiasDB  = fams.status === 'fulfilled'   ? (Array.isArray(fams.value)   ? fams.value   : []) : [];

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

  function getWhatsAppMessage() {
    if (_activeSub) {
      const sub = _subfamilias.find(s => s.id === _activeSub);
      const subNombre = sub ? sub.nombre : 'esta sección';
      return `Hola RMG Parts, estoy revisando la sección de ${subNombre} y necesito asesoría comercial.`;
    }
    if (_activeFam) {
      const meta = FAM_META[_activeFam] || { label: _activeFam };
      return `Hola RMG Parts, estoy revisando la sección de ${meta.label} y necesito asesoría comercial.`;
    }
    return 'Hola RMG Parts, estoy en su sitio web y me interesa conocer más sobre su catálogo B2B.';
  }

  function getWaUrl() {
    const msg = encodeURIComponent(getWhatsAppMessage());
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
    _heroIdx = 0;
    wrap.innerHTML = `
      <div class="lh-track" id="lhTrack">
        ${_banners.map((b, i) => `
          <div class="lh-slide">
            <img src="${ERP}/api/public/landing/foto/banners/${b.id}" alt="Banner ${i + 1}"
                 loading="${i === 0 ? 'eager' : 'lazy'}"
                 onerror="this.parentElement.style.display='none'">
          </div>
        `).join('')}
      </div>
      <button class="lh-arrow lh-prev" onclick="Landing.heroGo(Landing._heroIdx-1)" aria-label="Anterior">&#8249;</button>
      <button class="lh-arrow lh-next" onclick="Landing.heroGo(Landing._heroIdx+1)" aria-label="Siguiente">&#8250;</button>
      <div class="lh-dots">
        ${_banners.map((_, i) => `<button class="lh-dot${i === 0 ? ' active' : ''}" onclick="Landing.heroGo(${i})" aria-label="Slide ${i + 1}"></button>`).join('')}
      </div>
    `;

    wrap.addEventListener('mouseenter', () => clearInterval(_heroTimer));
    wrap.addEventListener('mouseleave', _startAutoplay);
    _startAutoplay();
  }

  function _startAutoplay() {
    clearInterval(_heroTimer);
    _heroTimer = setInterval(() => heroGo(_heroIdx + 1), 4000);
  }

  function heroGo(i) {
    const track = document.getElementById('lhTrack');
    const dots  = document.querySelectorAll('#landing-hero .lh-dot');
    const n     = _banners.length;
    if (!track || !n) return;
    _heroIdx = ((i % n) + n) % n;
    track.style.transform = `translateX(-${_heroIdx * 100}%)`;
    dots.forEach((d, j) => d.classList.toggle('active', j === _heroIdx));
  }

  // ─── Cajas de categoría (dinámicas desde DB) ──────────────────────────────
  function _renderCatBoxes() {
    const el = document.getElementById('cat-boxes');
    if (!el) return;
    const source = _familiasDB.length
      ? _familiasDB
      : FAMILIAS.map(f => ({ familia: f.key, descripcion: '' }));

    el.innerHTML = source.map((famDB, idx) => {
      const meta      = FAM_META[famDB.familia] || { label: famDB.familia, color: COLOR_POOL[idx % COLOR_POOL.length] };
      const subCount  = _subfamilias.filter(s => s.familia === famDB.familia).length;
      const prodCount = _productos.filter(p => p.familia === famDB.familia).length;
      const countTxt  = subCount > 0
        ? `<span class="catbox-count">${subCount} subfamilias</span>`
        : prodCount > 0 ? `<span class="catbox-count">${prodCount} productos</span>` : '';
      const erpSrc = `${ERP}/api/public/landing/foto/familias/${famDB.familia}`;
      const desc   = famDB.descripcion || '';

      return `
        <div class="catbox" onclick="Landing.selectFamilia('${famDB.familia}')">
          <div class="catbox-img-wrap" style="background:${meta.color}33">
            <img src="${erpSrc}" alt="${_esc(meta.label)}" loading="lazy"
                 onerror="this.style.display='none'">
            <div class="catbox-overlay"></div>
          </div>
          <div class="catbox-info">
            <div>
              <div class="catbox-label">${_esc(meta.label)}</div>
              ${countTxt}
              ${desc ? `<p class="catbox-desc">${_esc(desc)}</p>` : ''}
            </div>
            <svg class="catbox-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </div>
      `;
    }).join('');
  }

  // ─── Drill-down (familia → subfamilias → productos) ────────────────────────
  function selectFamilia(famKey) {
    _activeFam  = famKey;
    _activeSub  = null;
    _activeProd = null;
    if (famKey === 'LUBRICANTES') {
      const subs = _subfamilias.filter(s => s.familia === 'LUBRICANTES')
        .sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.id - b.id);
      if (subs.length) _activeSub = subs[0].id;
    }
    _renderDrillDown();
    const el = document.getElementById('drilldown-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function selectSub(subId, famKey) {
    if (famKey) _activeFam = famKey;
    _activeSub = subId;
    _activeProd = null;
    _renderDrillDown();
    const el = document.getElementById('drilldown-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function selectProducto(prodId) {
    _activeProd = prodId;
    _renderDrillDown();
    const el = document.getElementById('drilldown-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function backToProductos() {
    _activeProd = null;
    _renderDrillDown();
    const el = document.getElementById('drilldown-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function backToFamilias() {
    _activeFam = null;
    _activeSub = null;
    _activeProd = null;
    _renderDrillDown();
  }

  function backToSubs() {
    _activeSub = null;
    _activeProd = null;
    _renderDrillDown();
    const el = document.getElementById('drilldown-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function _wrap(inner) {
    return `<section class="drilldown-section"><div class="container">${inner}</div></section>`;
  }

  function _lubProductCardHTML(p) {
    const fotoSrc = p.foto_mimetype
      ? `${ERP}/api/public/landing/foto/productos/${p.id}`
      : (p.imagen_url && p.imagen_url.trim() ? p.imagen_url : null);
    const desc = p.subtitulo || '';

    const imgContent = fotoSrc
      ? `<img src="${_esc(fotoSrc)}" alt="${_esc(p.nombre)}" loading="lazy"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
         <div class="lub-prod-no-img" style="display:none">${_famIconSvg(p.familia)}</div>`
      : `<div class="lub-prod-no-img">${_famIconSvg(p.familia)}</div>`;

    return `<div class="lub-prod-card" onclick="Landing.selectProducto(${p.id})">
      <div class="lub-prod-card-img">${imgContent}</div>
      <div class="lub-prod-card-body">
        <div class="lub-prod-card-name">${_esc(p.nombre)}</div>
        ${desc ? `<div class="lub-prod-card-desc">${_esc(desc)}</div>` : ''}
      </div>
    </div>`;
  }

  function _renderLubricantesSidebar() {
    const subs = _subfamilias
      .filter(s => s.familia === 'LUBRICANTES')
      .sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.id - b.id);

    const activeSub = subs.find(s => s.id === _activeSub) || subs[0];
    const prods     = activeSub ? _productos.filter(p => p.subfamilia_id === activeSub.id) : [];

    const sidebarItems = subs.map(s => {
      const cnt      = _productos.filter(p => p.subfamilia_id === s.id).length;
      const isActive = activeSub && s.id === activeSub.id;
      return `<li class="lub-sidebar-item${isActive ? ' active' : ''}" onclick="Landing.selectSub(${s.id},'LUBRICANTES')">
        <div class="lub-sidebar-item-name">${_esc(s.nombre)}</div>
        <div class="lub-sidebar-item-count">${cnt > 0 ? cnt + ' producto' + (cnt !== 1 ? 's' : '') : 'Próximamente'}</div>
      </li>`;
    }).join('');

    const prodCards  = prods.length ? prods.map(_lubProductCardHTML).join('') : '<p class="drill-empty">Próximamente</p>';
    const titleText  = activeSub ? _esc(activeSub.nombre) : 'Lubricantes';
    const countText  = prods.length > 0 ? `${prods.length} producto${prods.length !== 1 ? 's' : ''}` : '';
    const breadcrumb = activeSub ? `Lubricantes › ${_esc(activeSub.nombre)}` : 'Lubricantes';

    return `<section class="drilldown-section">
      <div class="container">
        <div class="drilldown-header">
          <button class="drill-back" onclick="Landing.backToFamilias()">← Volver</button>
          <h2 class="drill-title">Lubricantes</h2>
        </div>
        <div class="lub-layout">
          <aside class="lub-sidebar">
            <div class="lub-sidebar-title">Categorías</div>
            <ul class="lub-sidebar-list">${sidebarItems}</ul>
          </aside>
          <div class="lub-grid-area">
            <div class="lub-grid-header">
              <div class="lub-breadcrumb">${breadcrumb}</div>
              <h3 class="lub-grid-title">${titleText}</h3>
              ${countText ? `<div class="lub-grid-count">${countText}</div>` : ''}
            </div>
            <div class="lub-prod-grid">${prodCards}</div>
          </div>
        </div>
      </div>
    </section>`;
  }

  function _renderFichaHTML(b) {
    const fam      = FAMILIAS.find(f => f.key === _activeFam);
    const famLabel = fam ? fam.label : (_activeFam || '');
    const sub      = _subfamilias.find(s => s.id === _activeSub);
    const subLabel = sub ? sub.nombre : '';

    const fotoSrc = b.foto_mimetype
      ? `${ERP}/api/public/landing/foto/productos/${b.id}`
      : (b.imagen_url && b.imagen_url.trim() ? b.imagen_url : null);

    const waMsg = `Hola, necesito información sobre ${b.nombre}${b.sae ? ' ' + b.sae : ''}. Vi su catálogo en rmgautoparts.cl`;
    const waUrl = _waLink(waMsg);

    const presList   = (b.presentaciones || '').split(',').map(p => p.trim()).filter(Boolean);
    const benefLines = (b.beneficios     || '').split('\n').map(l => l.trim()).filter(Boolean);
    const aplicText  = (b.aplicaciones   || '').trim();
    const hasCaract  = benefLines.length > 0 || aplicText.length > 0;

    const relacionados = _productos.filter(p => p.subfamilia_id === _activeSub && p.id !== b.id);

    const imgHTML = fotoSrc
      ? `<img src="${_esc(fotoSrc)}" alt="${_esc(b.nombre)}" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="bcard-img-placeholder" style="display:flex;align-items:center;justify-content:center">${_famIconSvg(b.familia)}</div>`;

    const presHTML = presList.length ? `
      <div style="margin-bottom:24px">
        <div class="ficha-prod-section-label">PRESENTACIONES</div>
        <div class="ficha-prod-pres-row">
          ${presList.map(p => `<div class="ficha-prod-pres-pill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 9h18M9 21V9M15 21V9M3 3h18v6H3z"/></svg>
            ${_esc(p)}
          </div>`).join('')}
        </div>
      </div>` : '';

    const docsHTML = b.ficha_tecnica_url ? `
      <div style="margin-bottom:24px">
        <div class="ficha-prod-section-label">DOCUMENTOS</div>
        <a href="${_esc(b.ficha_tecnica_url)}" target="_blank" rel="noopener" class="ficha-prod-doc-link">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          Ficha Técnica
        </a>
      </div>` : '';

    const waIconSvg = `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12.001 2.003c-5.522 0-10 4.477-10 10 0 1.765.46 3.464 1.334 4.965L2 22l5.164-1.323A9.953 9.953 0 0012 22.003c5.523 0 10-4.477 10-10s-4.477-10-9.999-10zm0 18.166a8.14 8.14 0 01-4.16-1.14l-.298-.177-3.065.785.82-2.988-.194-.307a8.16 8.16 0 01-1.264-4.339c0-4.512 3.672-8.183 8.184-8.183 4.512 0 8.183 3.671 8.183 8.183-.002 4.512-3.672 8.166-8.206 8.166z"/></svg>`;

    const checkSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0071BD" stroke-width="2.5" aria-hidden="true" style="flex-shrink:0;margin-top:4px"><polyline points="20 6 9 17 4 12"/></svg>`;

    const caractSection = hasCaract ? `
      <section class="ficha-caract-section">
        <div class="container">
          <div class="ficha-caract">
            <h2 class="ficha-caract-title">Características</h2>
            <ul class="ficha-caract-list">
              ${benefLines.length
                ? benefLines.map(l => `<li class="ficha-caract-item">${checkSvg}${_esc(l)}</li>`).join('')
                : `<li class="ficha-caract-item">${checkSvg}${_esc(aplicText)}</li>`
              }
            </ul>
          </div>
        </div>
      </section>` : '';

    const relSection = relacionados.length ? `
      <section class="ficha-rel-section">
        <div class="container">
          <div class="ficha-relacionados">
            <h2 class="ficha-relacionados-title">Más productos en ${_esc(subLabel)}</h2>
            <div class="bloques-grid">${relacionados.map(_bloqueCardHTML).join('')}</div>
          </div>
        </div>
      </section>` : '';

    return `
      <section class="drilldown-section" style="padding-bottom:0;border-bottom:none">
        <div class="container">
          <div class="drilldown-header">
            <button class="drill-back" onclick="Landing.backToProductos()">← ${_esc(subLabel || famLabel)}</button>
          </div>
          <div class="ficha-prod-wrap">
            <div class="ficha-prod-img">${imgHTML}</div>
            <div class="ficha-prod-data">
              <div class="ficha-prod-breadcrumb">
                <a onclick="Landing.backToFamilias()">Inicio</a> ›
                <a onclick="${_activeFam === 'LUBRICANTES' ? 'Landing.backToProductos()' : 'Landing.backToSubs()'}">${_esc(famLabel)}</a> ›
                <a onclick="Landing.backToProductos()">${_esc(subLabel)}</a> ›
                <span>${_esc(b.nombre)}</span>
              </div>
              <h1 class="ficha-prod-nombre">${_esc(b.nombre)}</h1>
              ${b.sae  ? `<div class="ficha-prod-sae">${_esc(b.sae)}</div>` : ''}
              ${b.tipo ? `<span class="ficha-prod-tipo-badge">${_esc(b.tipo)}</span>` : ''}
              ${(b.contenido || b.descripcion)
                ? `<p class="ficha-prod-desc">${_esc(b.contenido || b.descripcion || '').replace(/\n/g, '<br>')}</p>`
                : ''}
              ${presHTML}
              ${docsHTML}
              <div class="ficha-prod-ctas">
                <a href="${_esc(waUrl)}" target="_blank" rel="noopener" class="ficha-prod-cta-wa">
                  ${waIconSvg}
                  Cotizar por WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
      ${caractSection}
      ${relSection}`;
  }

  function _renderDrillDown() {
    const el = document.getElementById('drilldown-section');
    if (!el) return;

    if (!_activeFam) { el.innerHTML = ''; return; }

    if (_activeProd) {
      const prod = _productos.find(p => p.id === _activeProd);
      if (!prod) { _activeProd = null; _renderDrillDown(); return; }
      el.innerHTML = _renderFichaHTML(prod);
      return;
    }

    if (_activeFam === 'LUBRICANTES') {
      if (!_activeSub) {
        const subs = _subfamilias.filter(s => s.familia === 'LUBRICANTES')
          .sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.id - b.id);
        if (subs.length) _activeSub = subs[0].id;
      }
      el.innerHTML = _renderLubricantesSidebar();
      return;
    }

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
                <div class="subfam-card-img">
                  <img src="${erpSrc}" alt="${_esc(s.nombre)}" loading="lazy"
                       onerror="this.style.display='none'">
                  <div class="catbox-overlay"></div>
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
    const bloques = _productos.filter(p => p.subfamilia_id === _activeSub);
    el.innerHTML = _wrap(`
      <div class="drilldown-header">
        <button class="drill-back" onclick="Landing.backToSubs()">← ${_esc(famLabel)}</button>
        <h2 class="drill-title">${_esc(subLabel)}</h2>
      </div>
      ${bloques.length
        ? `<div class="bloques-grid">${bloques.map(_bloqueCardHTML).join('')}</div>`
        : '<p class="drill-empty">Información disponible próximamente.</p>'
      }
    `);
  }

  // ── Helpers de tarjeta horizontal ────────────────────────────────────────

  function _extractBrand(nombre) {
    const words = String(nombre || '').trim().split(/\s+/);
    const last = words[words.length - 1] || '';
    return (last.length > 1 && last === last.toUpperCase() && /[A-Z]/.test(last)) ? last : null;
  }

  function _famIconSvg(familia) {
    if (familia === 'BATERIAS') return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#c0c8d0" stroke-width="1.5" aria-hidden="true"><rect x="2" y="8" width="16" height="8" rx="2"/><path d="M22 11v2"/><path d="M6 12h4"/><path d="M12 12h4"/></svg>`;
    if (familia === 'LUBRICANTES') return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#c0c8d0" stroke-width="1.5" aria-hidden="true"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`;
    return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#c0c8d0" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="22"/><line x1="2" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="22" y2="12"/></svg>`;
  }

  function _bloqueCardHTML(b) {
    const fotoSrc = b.foto_mimetype
      ? `${ERP}/api/public/landing/foto/productos/${b.id}`
      : (b.imagen_url && b.imagen_url.trim() ? b.imagen_url : null);

    const isPremium = (b.subtitulo || '').toLowerCase().includes('premium');
    const brand = _extractBrand(b.nombre);

    const lines    = (b.contenido || '').split('\n').filter(l => l.trim() !== '');
    const specs    = lines.filter(l => !l.trim().match(/^[✓✔]/u));
    const benefits = lines.filter(l =>  l.trim().match(/^[✓✔]/u));

    const badgesHTML = brand
      ? `<div class="bcard-badges"><span class="bcard-brand">${_esc(brand)}</span></div>`
      : '';

    const lineaHTML = b.subtitulo
      ? `<div class="bcard-linea${isPremium ? ' bcard-linea--premium' : ''}">${_esc(b.subtitulo)}</div>`
      : '';

    const specsHTML = specs.length
      ? `<div class="bcard-spec-text">${specs.map(l => {
          const cls = l.trim().startsWith('Aplicaciones:') ? ' class="aplicaciones"' : '';
          return `<span${cls}>${_esc(l)}</span>`;
        }).join('')}</div>`
      : '';

    const benefitsHTML = benefits.length
      ? `<div class="bcard-benefits">${benefits.map(l => `<span class="bcard-pill">${_esc(l.trim().replace(/^[✓✔]\s*/u, ''))}</span>`).join('')}</div>`
      : '';

    return `
      <div class="bcard${isPremium ? ' bcard--premium' : ''}" onclick="Landing.selectProducto(${b.id})">
        <div class="bcard-body">
          ${badgesHTML}
          <div class="bcard-title">${_esc(b.nombre)}</div>
          ${lineaHTML}
          ${specsHTML}
          ${benefitsHTML}
        </div>
        <div class="bcard-img">
          ${fotoSrc
            ? `<img src="${_esc(fotoSrc)}" alt="${_esc(b.nombre)}" loading="lazy" onerror="this.style.display='none'">`
            : `<div class="bcard-img-placeholder">${_famIconSvg(b.familia)}</div>`
          }
        </div>
      </div>`;
  }

  function _cardHTML(p) {
    const imgSrc = `${ERP}/api/public/landing/foto/productos/${p.id}`;
    const badge  = p.codigo
      ? `<div class="pcard-badge">${_esc(p.codigo)}${p.marca ? ' · ' + _esc(p.marca) : ''}</div>`
      : (p.marca ? `<div class="pcard-badge">${_esc(p.marca)}</div>` : '');
    const waMsg  = `Hola, quiero cotizar ${p.descripcion}${p.codigo ? ' (' + p.codigo + ')' : ''}`;

    return `
      <div class="pcard">
        <div class="pcard-img">
          <img src="${imgSrc}" alt="${_esc(p.descripcion)}" loading="lazy"
               onerror="this.style.display='none'">
        </div>
        <div class="pcard-body">
          ${badge}
          ${p.nombre ? `<div class="pcard-name">${_esc(p.nombre)}</div>` : ''}
          ${p.descripcion ? `<div class="${p.nombre ? 'pcard-pres' : 'pcard-name'}">${_esc(p.descripcion)}</div>` : ''}
          ${p.presentacion ? `<div class="pcard-pres">${_esc(p.presentacion)}</div>` : ''}
          <div class="pcard-price">${_fmt(p.precio)}</div>
          <a class="pcard-wa" href="#" onclick="event.preventDefault();window.open(Landing.getWaUrl(),'_blank','noopener noreferrer')">
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
    init, heroGo, selectFamilia, selectSub, selectProducto,
    backToFamilias, backToSubs, backToProductos,
    _schInput, _schClear, getWaUrl,
  };
  Object.defineProperty(window.Landing, '_heroIdx', { get: () => _heroIdx });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
