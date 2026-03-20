// ══════════════════════════════════════
// ui.js — helpers de interfaz
// ══════════════════════════════════════

// ── TOAST ─────────────────────────────
let _toastTimer;
function toast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = (type ? type + ' ' : '') + 'show';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ── LOADING ───────────────────────────
function showLoading(title = 'Cargando…', step = '') {
  const el = document.getElementById('loadingOverlay');
  if (!el) return;
  document.getElementById('loadingTitle').textContent = title;
  document.getElementById('loadingStep').textContent = step;
  el.classList.add('show');
}
function setLoadingStep(step) {
  const el = document.getElementById('loadingStep');
  if (el) el.textContent = step;
}
function hideLoading() {
  const el = document.getElementById('loadingOverlay');
  if (el) el.classList.remove('show');
}

// ── MODAL ─────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

// ── TOGGLE ────────────────────────────
function initToggles() {
  document.querySelectorAll('.toggle').forEach(t => {
    t.addEventListener('click', () => t.classList.toggle('on'));
  });
}

// ── FORMATTERS ────────────────────────
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000)  return 'Hoy, ' + d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  if (diff < 172800000) return 'Ayer';
  return d.toLocaleDateString('es', { day: '2-digit', month: 'short' });
}

function formatCurrency(n) {
  if (!n) return '—';
  return '$' + Number(n).toLocaleString('es', { minimumFractionDigits: 0 });
}

function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() || 'U';
}

// ── COPY TABLE ────────────────────────
function copyTable(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const rows = Array.from(table.querySelectorAll('tr'));
  const text = rows.map(r =>
    Array.from(r.querySelectorAll('th,td')).map(c => c.textContent.trim()).join('\t')
  ).join('\n');
  navigator.clipboard.writeText(text)
    .then(() => toast('✅ Copiado al portapapeles', 'success'))
    .catch(() => toast('Error al copiar', 'error'));
}

// ── KPI BAR CHART ─────────────────────
function renderBarChart(containerId, data, maxItems = 10) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const entries = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxItems);
  const max = Math.max(...entries.map(e => e[1]), 1);
  el.innerHTML = entries.map(([k, v]) => `
    <div class="kpi-bar-row">
      <div class="kpi-bar-label" title="${k}">${k}</div>
      <div class="kpi-bar-track">
        <div class="kpi-bar-fill" style="width:${Math.round(v / max * 100)}%"></div>
      </div>
      <div class="kpi-bar-val">${v}</div>
    </div>`).join('');
}

// ── DAILY CHART ───────────────────────
function renderDailyChart(analyses, days = 14) {
  const el  = document.getElementById('kpiDailyChart');
  const elL = document.getElementById('kpiDailyLabels');
  if (!el) return;
  const counts = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    counts[d.toISOString().split('T')[0]] = 0;
  }
  (analyses || []).forEach(a => {
    const k = (a.created_at || '').split('T')[0];
    if (counts[k] !== undefined) counts[k]++;
  });
  const entries = Object.entries(counts);
  const max = Math.max(...entries.map(e => e[1]), 1);
  el.innerHTML = entries.map(([d, v]) => `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">
      <div style="font-size:10px;color:var(--text-l)">${v > 0 ? v : ''}</div>
      <div style="width:100%;background:${v > 0 ? 'var(--red)' : 'var(--gray-m)'};border-radius:3px 3px 0 0;height:${Math.max(4, Math.round(v / max * 60))}px"></div>
    </div>`).join('');
  if (elL) {
    elL.innerHTML = entries.map(([d]) =>
      `<div style="flex:1;font-size:9px;color:var(--text-l);text-align:center">${d.split('-').slice(1).join('/')}</div>`
    ).join('');
  }
}

// ── LOGO PREVIEW ─────────────────────
function previewLogo(inputEl, previewId, configKey) {
  const file = inputEl.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const b64 = e.target.result;
    const preview = document.getElementById(previewId);
    if (preview) preview.innerHTML = `<img src="${b64}" style="width:100%;height:100%;object-fit:contain">`;
    if (configKey) Config.set(configKey, b64);
  };
  reader.readAsDataURL(file);
}
