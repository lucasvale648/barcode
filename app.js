// ── State ──────────────────────────────────────────────────
const state = {
  scanning: false,
  stream: null,
  barcodeDetector: null,
  rafId: null,
  zxingControls: null,
  lastScanned: '',
  cooldown: false,
  history: JSON.parse(localStorage.getItem('scan_history') || '[]'),
};

// ── DOM refs ───────────────────────────────────────────────
const $ = id => document.getElementById(id);
const dom = {
  video:              $('video'),
  canvas:             $('scan-canvas'),
  cameraWrap:         $('camera-wrap'),
  cameraPlaceholder:  $('camera-placeholder'),
  scanOverlay:        $('scan-overlay'),
  camStatus:          $('cam-status'),
  btnStart:           $('btn-start'),
  btnStop:            $('btn-stop'),
  manualInput:        $('manual-input'),
  btnSearch:          $('btn-search'),
  resultWrap:         $('result-wrap'),
  pageScan:           $('page-scan'),
  pageHistory:        $('page-history'),
  historyList:        $('history-list'),
  historyEmpty:       $('history-empty'),
  btnClearHistory:    $('btn-clear-history'),
  navScan:            $('nav-scan'),
  navHistory:         $('nav-history'),
  installBanner:      $('install-banner'),
  installBtn:         $('install-btn'),
  closeBanner:        $('close-banner'),
};

// ── Navigation ─────────────────────────────────────────────
function showPage(page) {
  ['pageScan','pageHistory'].forEach(p => dom[p].classList.remove('active'));
  ['navScan','navHistory'].forEach(n => dom[n].classList.remove('active'));
  if (page === 'scan') {
    dom.pageScan.classList.add('active');
    dom.navScan.classList.add('active');
  } else {
    dom.pageHistory.classList.add('active');
    dom.navHistory.classList.add('active');
    renderHistory();
  }
}
dom.navScan.addEventListener('click', () => showPage('scan'));
dom.navHistory.addEventListener('click', () => showPage('history'));

// ── Câmera ─────────────────────────────────────────────────
async function openCamera() {
  const attempts = [
    { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    { video: { facingMode: 'environment' }, audio: false },
    { video: true, audio: false },
  ];

  let lastErr;
  for (const constraints of attempts) {
    try {
      state.stream = await navigator.mediaDevices.getUserMedia(constraints);
      break;
    } catch (e) {
      lastErr = e;
    }
  }

  if (!state.stream) throw lastErr || new Error('Câmera não acessível.');

  dom.video.srcObject   = state.stream;
  dom.video.playsinline = true;
  dom.video.muted       = true;
  dom.video.setAttribute('playsinline', '');
  dom.video.setAttribute('muted', '');

  if (dom.video.readyState >= 1) {
    await dom.video.play();
  } else {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout ao abrir câmera.')), 8000);
      dom.video.onloadedmetadata = () => {
        clearTimeout(timeout);
        dom.video.play().then(resolve).catch(reject);
      };
      dom.video.onerror = (e) => { clearTimeout(timeout); reject(e); };
    });
  }
}

// ── ZXing (fallback Safari iOS e Firefox) ─────────────────
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

const ZXING_CDN = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.4/umd/index.min.js';

// Pré-carrega em background para o Safari não esperar ao clicar em escanear
if (!('BarcodeDetector' in window)) {
  loadScript(ZXING_CDN).catch(() => {});
}

async function startZxingLoop() {
  if (!window.ZXingBrowser) {
    dom.camStatus.textContent = 'Carregando leitor…';
    await loadScript(ZXING_CDN);
  }
  dom.camStatus.textContent = 'Buscando código de barras…';
  const reader = new ZXingBrowser.BrowserMultiFormatReader();
  state.zxingControls = await reader.decodeFromConstraints(
    { video: { facingMode: { ideal: 'environment' } } },
    dom.video,
    (result) => { if (result && !state.cooldown) handleBarcode(result.getText()); }
  );
}

// ── BarcodeDetector ────────────────────────────────────────
async function startBarcodeDetectorLoop() {
  const wanted    = ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf','qr_code'];
  const supported = await BarcodeDetector.getSupportedFormats().catch(() => wanted);
  const formats   = wanted.filter(f => supported.includes(f));

  state.barcodeDetector = new BarcodeDetector({ formats: formats.length ? formats : wanted });

  const ctx = dom.canvas.getContext('2d', { willReadFrequently: true });

  const detect = async () => {
    if (!state.scanning) return;
    const w = dom.video.videoWidth;
    const h = dom.video.videoHeight;
    if (w && h) {
      dom.canvas.width  = w;
      dom.canvas.height = h;
      ctx.drawImage(dom.video, 0, 0, w, h);
      try {
        const codes = await state.barcodeDetector.detect(dom.canvas);
        if (codes.length && !state.cooldown) handleBarcode(codes[0].rawValue);
      } catch (_) {}
    }
    state.rafId = requestAnimationFrame(detect);
  };
  state.rafId = requestAnimationFrame(detect);
}

// ── Handle: código detectado ───────────────────────────────
function handleBarcode(code) {
  if (!code || state.cooldown) return;
  state.cooldown    = true;
  state.lastScanned = code;

  const flash = document.createElement('div');
  flash.className = 'flash-success';
  dom.cameraWrap.appendChild(flash);
  setTimeout(() => flash.remove(), 500);

  dom.manualInput.value = code;
  fetchProduct(code);

  setTimeout(() => { state.cooldown = false; state.lastScanned = ''; }, 4000);
}

// ── Start / Stop ───────────────────────────────────────────
async function startScanner() {
  if (!('BarcodeDetector' in window)) {
    showError('Seu Safari não suporta leitura automática.<br>Atualize para iOS 17.4+ ou digite o código manualmente.');
    return;
  }

  if (!navigator.mediaDevices) navigator.mediaDevices = {};
  if (typeof navigator.mediaDevices.getUserMedia !== 'function') {
    const legacy = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
    if (legacy) {
      navigator.mediaDevices.getUserMedia = function(c) {
        return new Promise(function(res, rej) { legacy.call(navigator, c, res, rej); });
      };
    } else {
      showError('Câmera não acessível. Verifique as permissões nas configurações do Safari.');
      return;
    }
  }

  dom.cameraPlaceholder.style.display = 'none';
  dom.scanOverlay.classList.add('active');
  dom.camStatus.style.display  = 'block';
  dom.camStatus.textContent    = 'Abrindo câmera…';
  dom.btnStart.style.display   = 'none';
  dom.btnStop.style.display    = '';
  showHint('Aponte para o código de barras do produto.');

  try {
    if ('BarcodeDetector' in window) {
      await openCamera();
      state.scanning = true;
      dom.camStatus.textContent = 'Buscando código de barras…';
      await startBarcodeDetectorLoop();
    } else {
      state.scanning = true;
      await startZxingLoop();
    }
  } catch (err) {
    state.scanning = false;
    const msg = err?.message || '';
    if (/denied|negad|ermission|not allowed/i.test(msg)) {
      showError('Permissão de câmera negada.<br>No Safari: Ajustes › Safari › Câmera › Permitir.');
    } else {
      showError('Erro ao abrir câmera: ' + (msg || 'Tente novamente.'));
    }
    resetCamera();
  }
}

function stopScanner() {
  state.scanning = false;
  state.cooldown = false;
  if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
  if (state.zxingControls) { state.zxingControls.stop(); state.zxingControls = null; }
  if (state.stream) { state.stream.getTracks().forEach(t => t.stop()); state.stream = null; }
  dom.video.srcObject   = null;
  state.barcodeDetector = null;
  resetCamera();
}

function resetCamera() {
  dom.cameraPlaceholder.style.display = 'flex';
  dom.scanOverlay.classList.remove('active');
  dom.camStatus.style.display  = 'none';
  dom.btnStart.style.display   = '';
  dom.btnStop.style.display    = 'none';
}

dom.btnStart.addEventListener('click', startScanner);
dom.btnStop.addEventListener('click', stopScanner);

// ── Manual search ──────────────────────────────────────────
dom.btnSearch.addEventListener('click', () => {
  const code = dom.manualInput.value.trim().replace(/\D/g, '');
  if (code.length >= 8) fetchProduct(code);
  else showError('Digite um código de barras válido (mínimo 8 dígitos).');
});
dom.manualInput.addEventListener('keydown', e => { if (e.key === 'Enter') dom.btnSearch.click(); });

// ── API ────────────────────────────────────────────────────
const COSMOS_TOKEN = 'J7v-D-nvXMukVc1ZXlMVRg';

async function fetchProduct(barcode) {
  showLoading(barcode);
  if (!navigator.onLine) { showError('Sem conexão com a internet.'); return; }

  // 1. Cosmos — melhor cobertura de produtos brasileiros
  try {
    const res = await fetch(`https://api.cosmos.bluesoft.com.br/gtins/${barcode}.json`, {
      headers: { 'X-Cosmos-Token': COSMOS_TOKEN },
    });
    if (res.ok) {
      const d = await res.json();
      const product = {
        product_name:    d.description || '',
        brands:          d.brand?.name || '',
        quantity:        d.quantity || '',
        categories:      d.category?.description || '',
        image_front_url: d.thumbnail || '',
      };
      showProduct(product, barcode, 'Cosmos');
      saveHistory(barcode, product);
      return;
    }
  } catch (_) {}

  // 2. Open Products Facts — base aberta de não-alimentos
  try {
    const res  = await fetch(`https://world.openproductsfacts.org/api/v2/product/${barcode}.json`);
    const data = await res.json();
    if (data.status === 1 && data.product) {
      showProduct(data.product, barcode, 'Open Products Facts');
      saveHistory(barcode, data.product);
      return;
    }
  } catch (_) {}

  // 3. Open Food Facts — base aberta de alimentos
  try {
    const res  = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
    const data = await res.json();
    if (data.status === 1 && data.product) {
      showProduct(data.product, barcode, 'Open Food Facts');
      saveHistory(barcode, data.product);
      return;
    }
  } catch (_) {}

  showNotFound(barcode);
}

// ── Render ─────────────────────────────────────────────────
function showLoading(barcode) {
  dom.resultWrap.innerHTML = `
    <div class="loading-card">
      <div class="spinner"></div>
      <span>Consultando <code style="font-family:monospace;font-size:13px">${barcode}</code>…</span>
    </div>`;
}

function showHint(msg) {
  dom.resultWrap.innerHTML = `
    <div class="loading-card" style="border-style:dashed">
      <span style="color:var(--text3);font-size:14px">${msg}</span>
    </div>`;
}

function showProduct(p, barcode, source) {
  const name        = p.product_name || p.product_name_pt || p.product_name_en || 'Nome não disponível';
  const brand       = p.brands || '';
  const qty         = p.quantity || '';
  const category    = (p.categories || '').split(',')[0].trim();
  const img         = p.image_front_url || p.image_url || '';
  const ingredients = p.ingredients_text || p.ingredients_text_pt || '';

  const imgHtml = img ? `<img src="${img}" alt="produto" onerror="this.parentElement.innerHTML='🧴'" />` : '🧴';
  const cells   = [
    qty      && { label: 'Quantidade', value: qty },
    brand    && { label: 'Marca',      value: brand },
    category && { label: 'Categoria',  value: category },
  ].filter(Boolean);

  dom.resultWrap.innerHTML = `
    <div class="product-card">
      <div class="product-header">
        <div class="product-img-wrap">${imgHtml}</div>
        <div class="product-info">
          <div class="product-name">${name}</div>
          ${brand ? `<div class="product-brand">${brand}</div>` : ''}
          <span class="barcode-pill">${barcode}</span>
        </div>
      </div>
      <div class="product-body">
        ${cells.length ? `<div class="info-grid">${cells.map(c => `
          <div class="info-cell">
            <div class="info-cell-label">${c.label}</div>
            <div class="info-cell-value">${c.value}</div>
          </div>`).join('')}</div>` : ''}
        ${ingredients ? `
          <div class="ingredients-block">
            <div class="label">Composição / Ingredientes</div>
            <p>${ingredients.length > 400 ? ingredients.slice(0,400)+'…' : ingredients}</p>
          </div>` : ''}
        <div class="source-line">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Fonte: ${source}
        </div>
      </div>
    </div>`;
}

function showNotFound(barcode) {
  dom.resultWrap.innerHTML = `
    <div class="not-found-card">
      <div class="icon">🔍</div>
      <div class="title">Produto não encontrado</div>
      <div class="code">${barcode}</div>
      <div class="desc">Produto não encontrado nas bases consultadas (Cosmos, Open Products Facts, Open Food Facts).</div>
    </div>`;
}

function showError(msg) {
  dom.resultWrap.innerHTML = `<div class="error-card">${msg}</div>`;
}

// ── History ────────────────────────────────────────────────
function saveHistory(barcode, product) {
  const entry = {
    barcode,
    name:      product.product_name || product.product_name_pt || 'Produto sem nome',
    brand:     product.brands || '',
    img:       product.image_front_url || product.image_url || '',
    scannedAt: Date.now(),
  };
  state.history = state.history.filter(h => h.barcode !== barcode);
  state.history.unshift(entry);
  if (state.history.length > 50) state.history.pop();
  localStorage.setItem('scan_history', JSON.stringify(state.history));
}

function renderHistory() {
  if (!state.history.length) {
    dom.historyList.innerHTML = '';
    dom.historyEmpty.style.display    = 'block';
    dom.btnClearHistory.style.display = 'none';
    return;
  }
  dom.historyEmpty.style.display    = 'none';
  dom.btnClearHistory.style.display = 'block';
  dom.historyList.innerHTML = state.history.map(h => {
    const thumb = h.img ? `<img src="${h.img}" alt="" onerror="this.parentElement.innerHTML='🧴'" />` : '🧴';
    const date  = new Date(h.scannedAt).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' });
    return `
      <div class="history-item" data-barcode="${h.barcode}">
        <div class="history-thumb">${thumb}</div>
        <div class="history-meta">
          <div class="history-name">${h.name}</div>
          <div class="history-code">${h.barcode} · ${date}</div>
        </div>
        <div class="history-arrow">›</div>
      </div>`;
  }).join('');
  dom.historyList.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => {
      showPage('scan');
      dom.manualInput.value = el.dataset.barcode;
      fetchProduct(el.dataset.barcode);
    });
  });
}

dom.btnClearHistory.addEventListener('click', () => {
  if (confirm('Limpar todo o histórico?')) {
    state.history = [];
    localStorage.removeItem('scan_history');
    renderHistory();
  }
});

// ── PWA Install ────────────────────────────────────────────
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredInstall = e;
  dom.installBanner.classList.add('show');
});
dom.installBtn.addEventListener('click', async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  const { outcome } = await deferredInstall.userChoice;
  if (outcome === 'accepted') dom.installBanner.classList.remove('show');
  deferredInstall = null;
});
dom.closeBanner.addEventListener('click', () => dom.installBanner.classList.remove('show'));
window.addEventListener('appinstalled', () => dom.installBanner.classList.remove('show'));

// ── Service Worker ─────────────────────────────────────────
// Remove qualquer service worker registrado anteriormente
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister());
  });
}

// ── Init ───────────────────────────────────────────────────
showPage('scan');
