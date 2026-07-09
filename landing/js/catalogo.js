// ─── Catálogo Industrial B2B ───────────────────────────────────────────────────

const Catalogo = (() => {
  let _data        = [];
  let _filtered    = [];
  let _filtros     = { categoria: '', rubro: '', marca: '', aplicacion: '' };
  let _rubros_activo = null;
  let _modalSku    = null;
  let _sending     = false;
  let _initialized = false;

  // accordion state
  let _openCat   = null;          // nivel 1: categoria abierta
  let _openAplic = null;          // nivel 2: "cat:aplic" abierta

  // search
  let _searchTokens = [];
  let _debounceTimer = null;

  // ─── Constantes ──────────────────────────────────────────────────────────────
  const RUBROS = ['Talleres','Concesionarios','Flotas','Agricola','Mineria','Construccion','Industria','RentACar'];
  const RUBRO_ICON = {
    Talleres:'🔧', Concesionarios:'🏢', Flotas:'🚛', Agricola:'🌾',
    Mineria:'⛏️', Construccion:'🏗️', Industria:'⚙️', RentACar:'🚗',
  };
  const APLICACION_LABEL = {
    liviano:           'Vehículo liviano',
    camion_flota:      'Camión / Flota',
    maquinaria_agricola: 'Maquinaria agrícola',
    industrial:        'Industrial',
  };
  const CAT_ICON = {
    neumatico:'🛞', lubricante:'🛢️', bateria:'🔋', grasa:'⚙️',
    refrigerante:'❄️', filtro:'🔍', otro:'📦',
  };
  const CAT_ORDER = ['neumatico','bateria','lubricante','grasa','refrigerante','filtro','otro'];

  // ─── Lifecycle ───────────────────────────────────────────────────────────────
  async function init() {
    const container = document.getElementById('view-catalogo');
    if (!container) return;
    if (_initialized && _data.length > 0) { _render(container); return; }
    container.innerHTML = _loadingHTML();
    try {
      const res = await fetch(CONFIG.BASE_URL + '/api/public/catalogo');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      _data = await res.json();
      _filtered = [..._data];
      _initialized = true;
      _render(container);
    } catch (e) {
      container.innerHTML = `<div class="ci-error"><p>Error cargando catálogo: ${e.message}</p><button onclick="Catalogo.reinit()">Reintentar</button></div>`;
    }
  }

  function reinit() { _initialized = false; _data = []; _filtered = []; init(); }

  function _loadingHTML() {
    return '<div class="ci-loading"><div class="ci-spinner"></div><p>Cargando catálogo…</p></div>';
  }

  // ─── Render principal ────────────────────────────────────────────────────────
  function _render(container) {
    const categorias   = [...new Set(_data.map(p => p.categoria).filter(Boolean))].sort();
    const marcas       = [...new Set(_data.map(p => p.marca).filter(Boolean))].sort();
    const aplicaciones = [...new Set(_data.map(p => p.aplicacion).filter(Boolean))].sort();

    container.innerHTML = `
      <!-- ── HERO INDUSTRIAL ─────────────────────────────────────── -->
      <div class="ci-hero-wrap">
        <img src="assets/img/hero/hero-industrial.png"
             alt="Catálogo Industrial RMG Parts — neumáticos, lubricantes, baterías"
             class="ci-hero-img" loading="eager">
        <div class="ci-hero-overlay">
          <div class="container">
            <div class="ci-hero-body">
              <div class="ci-hero-badge">Catálogo Industrial B2B</div>
              <h1 class="ci-hero-title">Soluciones para cada industria</h1>
              <p class="ci-hero-sub">Neumáticos, lubricantes y baterías para talleres, flotas, construcción, minería y más.<br>Sin precios en línea — solicita tu cotización personalizada.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- ── CHIPS DE RUBRO ──────────────────────────────────────── -->
      <section class="ci-rubros-section">
        <div class="container">
          <div class="ci-rubro-chips" id="ci-rubro-chips">
            ${RUBROS.map(r => `
              <button class="ci-chip" data-rubro="${r}" onclick="Catalogo.filterRubro('${r}')">
                ${RUBRO_ICON[r]} ${r}
              </button>`).join('')}
          </div>
        </div>
      </section>

      <!-- ── BARRA DE FILTROS ────────────────────────────────────── -->
      <section class="ci-filters-bar">
        <div class="container">
          <div class="ci-filters-row">
            <div class="ci-filter-group">
              <label>Categoría</label>
              <select id="ci-f-cat" onchange="Catalogo.applyFilter('categoria',this.value)">
                <option value="">Todas</option>
                ${categorias.map(c => `<option value="${c}">${_capitalize(c)}</option>`).join('')}
              </select>
            </div>
            <div class="ci-filter-group">
              <label>Rubro</label>
              <select id="ci-f-rubro" onchange="Catalogo.applyFilter('rubro',this.value)">
                <option value="">Todos</option>
                ${RUBROS.map(r => `<option value="${r}">${r}</option>`).join('')}
              </select>
            </div>
            <div class="ci-filter-group">
              <label>Marca</label>
              <select id="ci-f-marca" onchange="Catalogo.applyFilter('marca',this.value)">
                <option value="">Todas</option>
                ${marcas.map(m => `<option value="${m}">${m}</option>`).join('')}
              </select>
            </div>
            <div class="ci-filter-group">
              <label>Aplicación</label>
              <select id="ci-f-aplic" onchange="Catalogo.applyFilter('aplicacion',this.value)">
                <option value="">Todas</option>
                ${aplicaciones.map(a => `<option value="${a}">${APLICACION_LABEL[a] || a}</option>`).join('')}
              </select>
            </div>
            <div class="ci-filter-group ci-filter-search">
              <label>Buscar</label>
              <div class="ci-search-wrap">
                <input type="text" id="ci-f-q"
                       placeholder="SKU, descripción, marca…"
                       autocomplete="off"
                       oninput="Catalogo.handleSearchInput(this.value)"
                       onblur="Catalogo.hideSuggestions()"
                       onfocus="Catalogo.handleSearchInput(this.value)">
                <div class="ci-suggestions" id="ci-suggestions" style="display:none"></div>
              </div>
            </div>
            <button class="ci-clear-btn" onclick="Catalogo.clearFilters()">Limpiar</button>
          </div>
          <div class="ci-count" id="ci-count">${_data.length} productos</div>
        </div>
      </section>

      <!-- ── CONTENIDO (acordeón o búsqueda) ────────────────────── -->
      <section class="ci-grid-section">
        <div class="container">
          <div id="ci-grid"></div>
          <div class="ci-empty" id="ci-empty" style="display:none">
            <p>No se encontraron productos con esos filtros.</p>
            <button onclick="Catalogo.clearFilters()">Ver todos</button>
          </div>
        </div>
      </section>

      <!-- ── MODAL ───────────────────────────────────────────────── -->
      <div class="ci-modal-overlay" id="ci-modal-overlay" onclick="Catalogo.closeModal()">
        <div class="ci-modal" onclick="event.stopPropagation()">
          <button class="ci-modal-close" onclick="Catalogo.closeModal()">×</button>
          <div id="ci-modal-content"></div>
        </div>
      </div>
    `;

    _renderGrid();
  }

  // ─── Render grilla / acordeón ─────────────────────────────────────────────
  function _renderGrid() {
    const grid  = document.getElementById('ci-grid');
    const empty = document.getElementById('ci-empty');
    const count = document.getElementById('ci-count');
    if (!grid) return;

    const unique = _dedup(_filtered);
    if (count) count.textContent = unique.length + ' productos';

    if (unique.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';

    // En modo búsqueda → resultados planos, rankeados
    if (_searchTokens.length > 0) {
      const ranked = _rankItems(unique);
      grid.innerHTML = `
        <div class="ci-search-results-label">
          ${ranked.length} resultado${ranked.length !== 1 ? 's' : ''} para
          "<strong>${_esc(_searchTokens.join(' '))}</strong>"
        </div>
        <div class="ci-grid-inner">
          ${ranked.slice(0, 50).map(p => _cardHTML(p)).join('')}
        </div>`;
      return;
    }

    // Modo acordeón 3 niveles
    grid.innerHTML = _accordionHTML(unique);
  }

  // ─── Acordeón ─────────────────────────────────────────────────────────────
  function _accordionHTML(items) {
    // Agrupar por categoria → aplicacion
    const bycat = {};
    items.forEach(p => {
      const cat   = p.categoria || 'otro';
      const aplic = p.aplicacion || 'otro';
      if (!bycat[cat]) bycat[cat] = {};
      if (!bycat[cat][aplic]) bycat[cat][aplic] = [];
      bycat[cat][aplic].push(p);
    });

    const cats = CAT_ORDER.filter(c => bycat[c]).concat(
      Object.keys(bycat).filter(c => !CAT_ORDER.includes(c)).sort()
    );

    return `<div class="ci-accordion">${cats.map(cat => _catHTML(cat, bycat[cat])).join('')}</div>`;
  }

  function _catHTML(cat, byaplic) {
    const total  = Object.values(byaplic).reduce((s, arr) => s + arr.length, 0);
    const isOpen = _openCat === cat;
    const aplics = Object.keys(byaplic).sort((a, b) => {
      const ord = ['liviano','camion_flota','maquinaria_agricola','industrial','otro'];
      return (ord.indexOf(a) + 1 || 99) - (ord.indexOf(b) + 1 || 99);
    });

    return `
      <div class="ci-acc-cat" data-cat="${cat}">
        <button class="ci-acc-cat-btn ${isOpen ? 'open' : ''}"
                onclick="Catalogo.toggleCat('${cat}')">
          <span class="ci-acc-cat-icon">${CAT_ICON[cat] || '📦'}</span>
          <span class="ci-acc-cat-name">${_capitalize(cat)}</span>
          <span class="ci-acc-cat-count">${total} SKU${total !== 1 ? 's' : ''}</span>
          <svg class="ci-acc-chevron ${isOpen ? 'open' : ''}" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <div class="ci-acc-cat-body" ${isOpen ? '' : 'style="display:none"'}>
          ${aplics.map(aplic => _aplicHTML(cat, aplic, byaplic[aplic])).join('')}
        </div>
      </div>`;
  }

  function _aplicHTML(cat, aplic, items) {
    const key    = cat + ':' + aplic;
    const isOpen = _openAplic === key;
    const label  = APLICACION_LABEL[aplic] || _capitalize(aplic.replace(/_/g, ' '));

    return `
      <div class="ci-acc-aplic" data-key="${key}">
        <button class="ci-acc-aplic-btn ${isOpen ? 'open' : ''}"
                onclick="Catalogo.toggleAplic('${cat}','${aplic}')">
          <span class="ci-acc-aplic-dot"></span>
          <span class="ci-acc-aplic-name">${label}</span>
          <span class="ci-acc-aplic-count">${items.length} producto${items.length !== 1 ? 's' : ''}</span>
          <svg class="ci-acc-chevron sm ${isOpen ? 'open' : ''}" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <div class="ci-acc-aplic-body" ${isOpen ? '' : 'style="display:none"'}>
          <div class="ci-grid-inner">
            ${items.map(p => _cardHTML(p)).join('')}
          </div>
        </div>
      </div>`;
  }

  function toggleCat(cat) {
    const prev   = _openCat;
    _openCat     = prev === cat ? null : cat;
    _openAplic   = null;                         // reset nivel 2

    // DOM: cerrar anterior
    if (prev && prev !== cat) {
      const prevEl = document.querySelector(`.ci-acc-cat[data-cat="${prev}"]`);
      if (prevEl) {
        prevEl.querySelector('.ci-acc-cat-btn').classList.remove('open');
        prevEl.querySelector('.ci-acc-cat-body').style.display = 'none';
        prevEl.querySelector('.ci-acc-chevron').classList.remove('open');
      }
    }
    // DOM: toggle actual
    const el = document.querySelector(`.ci-acc-cat[data-cat="${cat}"]`);
    if (el) {
      const btn  = el.querySelector('.ci-acc-cat-btn');
      const body = el.querySelector('.ci-acc-cat-body');
      const chev = el.querySelector('.ci-acc-chevron');
      if (_openCat === cat) {
        btn.classList.add('open'); body.style.display = ''; chev.classList.add('open');
      } else {
        btn.classList.remove('open'); body.style.display = 'none'; chev.classList.remove('open');
      }
    }
    // Cerrar todos los nivel-2
    document.querySelectorAll('.ci-acc-aplic-btn').forEach(b => b.classList.remove('open'));
    document.querySelectorAll('.ci-acc-chevron.sm').forEach(c => c.classList.remove('open'));
    document.querySelectorAll('.ci-acc-aplic-body').forEach(b => { b.style.display = 'none'; });
  }

  function toggleAplic(cat, aplic) {
    const key  = cat + ':' + aplic;
    const prev = _openAplic;
    _openAplic = prev === key ? null : key;

    // Cerrar anterior del mismo nivel
    if (prev && prev !== key) {
      const prevEl = document.querySelector(`.ci-acc-aplic[data-key="${prev}"]`);
      if (prevEl) {
        prevEl.querySelector('.ci-acc-aplic-btn').classList.remove('open');
        prevEl.querySelector('.ci-acc-aplic-body').style.display = 'none';
        prevEl.querySelector('.ci-acc-chevron').classList.remove('open');
      }
    }
    // Toggle actual
    const el = document.querySelector(`.ci-acc-aplic[data-key="${key}"]`);
    if (el) {
      const btn  = el.querySelector('.ci-acc-aplic-btn');
      const body = el.querySelector('.ci-acc-aplic-body');
      const chev = el.querySelector('.ci-acc-chevron');
      if (_openAplic === key) {
        btn.classList.add('open'); body.style.display = ''; chev.classList.add('open');
      } else {
        btn.classList.remove('open'); body.style.display = 'none'; chev.classList.remove('open');
      }
    }
  }

  // ─── Buscador tokenizado ──────────────────────────────────────────────────
  function _norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function _tokenize(q) {
    return _norm(q).split(/\s+/).filter(t => t.length >= 2);
  }

  function _score(p, tokens) {
    const hay = _norm([p.codigo_sku, p.descripcion, p.marca, p.producto_generico, p.rubro, p.aplicacion].join(' '));
    let s = 0;
    for (const t of tokens) if (hay.includes(t)) s++;
    return s;
  }

  function _rankItems(items) {
    if (_searchTokens.length === 0) return items;
    return items
      .map(p => ({ p, s: _score(p, _searchTokens) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map(x => x.p);
  }

  function handleSearchInput(raw) {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      const tokens = _tokenize(raw);
      _searchTokens = tokens;
      _applyAll();
      _showSuggestions(raw, tokens);
    }, 250);
  }

  function _showSuggestions(raw, tokens) {
    const box = document.getElementById('ci-suggestions');
    if (!box) return;
    if (!raw || !raw.trim() || tokens.length === 0) { box.style.display = 'none'; return; }

    const unique  = _dedup(_filtered.length > 0 ? _filtered : _data);
    const ranked  = _rankItems(unique).slice(0, 6);
    if (ranked.length === 0) { box.style.display = 'none'; return; }

    box.innerHTML = ranked.map(p => `
      <div class="ci-sugg-item" onmousedown="Catalogo.pickSuggestion('${_esc(p.codigo_sku)}','${_esc(p.descripcion.replace(/'/g,"\\'"))}')">
        <span class="ci-sugg-icon">${CAT_ICON[p.categoria] || '📦'}</span>
        <span class="ci-sugg-text">
          <span class="ci-sugg-desc">${_esc(p.descripcion)}</span>
          <span class="ci-sugg-meta">${_esc(p.marca)} · SKU ${_esc(p.codigo_sku)}</span>
        </span>
      </div>`).join('');
    box.style.display = '';
  }

  function hideSuggestions() {
    setTimeout(() => {
      const box = document.getElementById('ci-suggestions');
      if (box) box.style.display = 'none';
    }, 150);
  }

  function pickSuggestion(sku, desc) {
    const input = document.getElementById('ci-f-q');
    if (input) input.value = desc;
    const box = document.getElementById('ci-suggestions');
    if (box) box.style.display = 'none';
    _searchTokens = _tokenize(desc);
    _applyAll();
    // abrir directamente la ficha técnica del producto
    openModal(sku);
  }

  // ─── Filtros ──────────────────────────────────────────────────────────────
  function filterRubro(rubro) {
    _rubros_activo     = _rubros_activo === rubro ? null : rubro;
    _filtros.rubro     = _rubros_activo || '';
    document.querySelectorAll('#ci-rubro-chips .ci-chip').forEach(c =>
      c.classList.toggle('active', c.dataset.rubro === _rubros_activo));
    const sel = document.getElementById('ci-f-rubro');
    if (sel) sel.value = _rubros_activo || '';
    _openCat   = null;
    _openAplic = null;
    _applyAll();
  }

  function applyFilter(key, val) {
    _filtros[key] = val;
    if (key === 'rubro') {
      _rubros_activo = val || null;
      document.querySelectorAll('#ci-rubro-chips .ci-chip').forEach(c =>
        c.classList.toggle('active', c.dataset.rubro === _rubros_activo));
    }
    _openCat   = null;
    _openAplic = null;
    _applyAll();
  }

  function _applyAll() {
    const tokens = _searchTokens;
    _filtered = _data.filter(p => {
      if (_filtros.categoria  && p.categoria  !== _filtros.categoria)  return false;
      if (_filtros.marca      && p.marca      !== _filtros.marca)       return false;
      if (_filtros.aplicacion && p.aplicacion !== _filtros.aplicacion)  return false;
      if (_filtros.rubro) {
        const rubros = (p.rubro || '').split(',').map(r => r.trim());
        if (!rubros.includes(_filtros.rubro)) return false;
      }
      if (tokens.length > 0) {
        if (_score(p, tokens) === 0) return false;
      }
      return true;
    });
    _renderGrid();
  }

  function clearFilters() {
    _filtros       = { categoria: '', rubro: '', marca: '', aplicacion: '' };
    _searchTokens  = [];
    _rubros_activo = null;
    _openCat       = null;
    _openAplic     = null;
    ['ci-f-cat','ci-f-rubro','ci-f-marca','ci-f-aplic'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const q = document.getElementById('ci-f-q');
    if (q) q.value = '';
    const box = document.getElementById('ci-suggestions');
    if (box) box.style.display = 'none';
    document.querySelectorAll('#ci-rubro-chips .ci-chip').forEach(c => c.classList.remove('active'));
    _filtered = [..._data];
    _renderGrid();
  }

  // ─── Cards ────────────────────────────────────────────────────────────────
  function _dedup(rows) {
    const seen = new Set();
    return rows.filter(r => {
      const key = r.codigo_sku + '|' + r.descripcion;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function _cardHTML(p) {
    const rubros = (p.rubro || 'Talleres,Concesionarios').split(',').map(r => r.trim());
    const aplic  = APLICACION_LABEL[p.aplicacion] || p.aplicacion || '';
    const sku    = _esc(p.codigo_sku || '');
    return `
      <div class="ci-card" onclick="Catalogo.openModal('${sku}')">
        <div class="ci-card-head">
          <span class="ci-sku mono">${sku}</span>
          <span class="ci-card-marca">${_esc(p.marca || '')}</span>
        </div>
        <div class="ci-card-name">${_esc(p.descripcion || '')}</div>
        ${p.presentacion ? `<div class="ci-card-pres">${_esc(p.presentacion)}</div>` : ''}
        <div class="ci-card-foot">
          <div class="ci-rubros">${rubros.map(r => `<span class="ci-rubro-tag">${r}</span>`).join('')}</div>
          ${aplic ? `<span class="ci-aplic">${aplic}</span>` : ''}
        </div>
        <div class="ci-card-cta">Ver ficha técnica →</div>
      </div>`;
  }

  // ─── Modal ────────────────────────────────────────────────────────────────
  function openModal(sku) {
    _modalSku = sku;
    const p = _data.find(d => d.codigo_sku === sku || String(d.codigo_sku) === String(sku));
    const overlay = document.getElementById('ci-modal-overlay');
    const content = document.getElementById('ci-modal-content');
    if (!overlay || !content || !p) return;

    const rubros  = (p.rubro || '').split(',').map(r => r.trim()).filter(Boolean);
    const aplic   = APLICACION_LABEL[p.aplicacion] || p.aplicacion || '';
    const WA      = (typeof CONFIG !== 'undefined') ? CONFIG.WHATSAPP : '';
    const waLink  = WA
      ? `https://wa.me/${WA}?text=${encodeURIComponent('Hola, quiero información sobre ' + p.descripcion + ' (SKU: ' + p.codigo_sku + ')')}`
      : null;

    content.innerHTML = `
      <div class="ci-ficha">
        <div class="ci-ficha-head">
          <div>
            <div class="ci-ficha-marca">${_esc(p.marca || '')}</div>
            <h2 class="ci-ficha-name">${_esc(p.descripcion || '')}</h2>
            <div class="ci-ficha-sku">SKU: ${_esc(p.codigo_sku || '')}</div>
          </div>
          <span class="ci-cat-badge big">${CAT_ICON[p.categoria] || '📦'} ${_capitalize(p.categoria || '')}</span>
        </div>

        <div class="ci-ficha-specs">
          ${p.presentacion     ? `<div class="ci-spec"><span>Presentación</span><span>${_esc(p.presentacion)}</span></div>` : ''}
          ${p.tipo_envase      ? `<div class="ci-spec"><span>Envase</span><span>${_esc(p.tipo_envase)}</span></div>` : ''}
          ${p.producto_generico? `<div class="ci-spec"><span>Tipo</span><span>${_esc(p.producto_generico)}</span></div>` : ''}
          ${aplic              ? `<div class="ci-spec"><span>Aplicación</span><span>${_esc(aplic)}</span></div>` : ''}
          ${p.proveedor        ? `<div class="ci-spec"><span>Proveedor</span><span>${_esc(p.proveedor)}</span></div>` : ''}
        </div>

        ${rubros.length ? `
          <div class="ci-ficha-rubros">
            <div class="ci-ficha-label">Rubros recomendados</div>
            <div class="ci-rubros-big">
              ${rubros.map(r => `<span class="ci-rubro-tag big">${RUBRO_ICON[r] || ''} ${r}</span>`).join('')}
            </div>
          </div>` : ''}

        <div class="ci-ficha-form">
          <h3>Solicitar cotización</h3>
          <p class="ci-form-sub">Completa el formulario y un ejecutivo te contactará hoy.</p>
          <form id="ci-prospecto-form" onsubmit="Catalogo.submitForm(event)">
            <input type="hidden" name="producto_interes"
                   value="${_esc(p.descripcion || '')} (${_esc(p.codigo_sku || '')})">
            <div class="ci-form-row">
              <div class="ci-form-group">
                <label>Nombre *</label>
                <input type="text" name="nombre" placeholder="Tu nombre" required>
              </div>
              <div class="ci-form-group">
                <label>Empresa *</label>
                <input type="text" name="empresa" placeholder="Nombre de la empresa" required>
              </div>
            </div>
            <div class="ci-form-row">
              <div class="ci-form-group">
                <label>Rubro</label>
                <select name="rubro">
                  <option value="">Seleccionar…</option>
                  ${RUBROS.map(r => `<option value="${r}">${r}</option>`).join('')}
                </select>
              </div>
              <div class="ci-form-group">
                <label>Teléfono *</label>
                <input type="tel" name="telefono" placeholder="+56 9 1234 5678" required>
              </div>
            </div>
            <div class="ci-form-group">
              <label>Email</label>
              <input type="email" name="email" placeholder="correo@empresa.cl">
            </div>
            <div class="ci-form-actions">
              <button type="submit" class="ci-btn-primary" id="ci-submit-btn">Enviar solicitud</button>
              ${waLink ? `
                <a href="${waLink}" target="_blank" rel="noopener" class="ci-btn-wa">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12.001 2.003c-5.522 0-10 4.477-10 10 0 1.765.46 3.464 1.334 4.965L2 22l5.164-1.323A9.953 9.953 0 0012 22.003c5.523 0 10-4.477 10-10s-4.477-10-9.999-10zm0 18.166a8.14 8.14 0 01-4.16-1.14l-.298-.177-3.065.785.82-2.988-.194-.307a8.16 8.16 0 01-1.264-4.339c0-4.512 3.672-8.183 8.184-8.183 4.512 0 8.183 3.671 8.183 8.183-.002 4.512-3.672 8.166-8.206 8.166z"/>
                  </svg>
                  Consultar por WhatsApp
                </a>` : ''}
            </div>
            <div id="ci-form-msg"
                 style="display:none;margin-top:12px;padding:12px;border-radius:8px;font-size:14px;font-weight:600;text-align:center;"></div>
          </form>
        </div>
      </div>`;

    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    const overlay = document.getElementById('ci-modal-overlay');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
    _modalSku = null;
  }

  async function submitForm(e) {
    e.preventDefault();
    if (_sending) return;
    const form = e.target;
    const btn  = document.getElementById('ci-submit-btn');
    const msg  = document.getElementById('ci-form-msg');
    const data = Object.fromEntries(new FormData(form));
    _sending = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
    try {
      const res = await fetch(CONFIG.BASE_URL + '/api/public/prospectos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.ok) {
        if (msg) {
          msg.style.display = ''; msg.style.background = '#dcfce7'; msg.style.color = '#166534';
          msg.textContent = '¡Solicitud enviada! Un ejecutivo te contactará pronto.';
        }
        form.reset();
      } else { throw new Error(json.error || 'Error desconocido'); }
    } catch (err) {
      if (msg) {
        msg.style.display = ''; msg.style.background = '#fee2e2'; msg.style.color = '#991b1b';
        msg.textContent = 'Error al enviar: ' + err.message;
      }
    } finally {
      _sending = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar solicitud'; }
    }
  }

  // ─── Utils ────────────────────────────────────────────────────────────────
  function _capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function _esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return {
    init, reinit,
    toggleCat, toggleAplic,
    openModal, closeModal, submitForm,
    filterRubro, applyFilter,
    handleSearchInput, hideSuggestions, pickSuggestion,
    clearFilters,
  };
})();
