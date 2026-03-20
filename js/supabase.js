// ══════════════════════════════════════
// supabase.js — Singleton estricto
// UN solo cliente Supabase en toda la app
// ══════════════════════════════════════

// Singleton global — una sola instancia en todo el browser
if (!window._mlSupabase) {
  window._mlSupabase = null;
}
if (!window._mlConfig) {
  window._mlConfig = null;
}

// ── CONFIG ────────────────────────────
async function loadConfig() {
  if (window._mlConfig) return window._mlConfig;

  // Usar localStorage inmediatamente si hay datos (sin esperar API)
  const cachedUrl = localStorage.getItem('ml_supabase_url');
  const cachedKey = localStorage.getItem('ml_supabase_key');

  if (cachedUrl && cachedKey) {
    window._mlConfig = {
      supabaseUrl:  cachedUrl,
      supabaseKey:  cachedKey,
      companyName:  localStorage.getItem('ml_company_name')  || 'MenuLens',
      anthropicKey: localStorage.getItem('ml_anthropic_key') || '',
    };
    // Inicializar cliente con datos de caché
    _initSupabaseClient(window._mlConfig);
    // Refrescar en background
    setTimeout(_refreshConfigBg, 100);
    return window._mlConfig;
  }

  // Sin caché — llamar API con timeout 3s
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const resp = await fetch('/api/config', { signal: ctrl.signal });
    clearTimeout(t);
    if (resp.ok) {
      const data = await resp.json();
      _applyConfig(data);
      return window._mlConfig;
    }
  } catch(e) {
    console.log('Config API unavailable, using localStorage');
  }

  // Fallback vacío
  window._mlConfig = {
    supabaseUrl:  localStorage.getItem('ml_supabase_url')  || '',
    supabaseKey:  localStorage.getItem('ml_supabase_key')  || '',
    companyName:  localStorage.getItem('ml_company_name')  || 'MenuLens',
    anthropicKey: localStorage.getItem('ml_anthropic_key') || '',
  };
  if (window._mlConfig.supabaseUrl) {
    _initSupabaseClient(window._mlConfig);
  }
  return window._mlConfig;
}

function _applyConfig(data) {
  window._mlConfig = data;
  if (data.supabaseUrl) localStorage.setItem('ml_supabase_url', data.supabaseUrl);
  if (data.supabaseKey) localStorage.setItem('ml_supabase_key', data.supabaseKey);
  if (data.companyName) localStorage.setItem('ml_company_name', data.companyName);
  // anthropicKey NOT cached in localStorage — stays server-side only
  _initSupabaseClient(data);
}

function _initSupabaseClient(cfg) {
  // SINGLETON: solo crear si no existe aún
  if (!window._mlSupabase && cfg.supabaseUrl && cfg.supabaseKey) {
    window._mlSupabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth: {
        persistSession: true,
        storageKey: 'ml-auth',
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }
}

async function _refreshConfigBg() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch('/api/config', { signal: ctrl.signal });
    clearTimeout(t);
    if (resp.ok) {
      const data = await resp.json();
      // Update config values but DON'T recreate supabase client
      window._mlConfig = data;
      if (data.supabaseUrl) localStorage.setItem('ml_supabase_url', data.supabaseUrl);
      if (data.supabaseKey) localStorage.setItem('ml_supabase_key', data.supabaseKey);
      if (data.companyName) localStorage.setItem('ml_company_name', data.companyName);
      // anthropicKey NOT cached in localStorage — stays server-side only
    }
  } catch(e) { /* silent */ }
}

// ── PUBLIC ACCESSORS ──────────────────
function getSupabase() {
  return window._mlSupabase;
}

async function getSupabaseAsync() {
  if (window._mlSupabase) return window._mlSupabase;
  await loadConfig();
  return window._mlSupabase;
}

function reinitSupabase() {
  // Only call this when keys change in admin config
  window._mlSupabase = null;
  window._mlConfig = null;
  return loadConfig();
}

// ── CONFIG HELPERS ────────────────────
const Config = {
  get: (key) => window._mlConfig?.[key] || localStorage.getItem('ml_' + key) || '',
  set: (key, val) => {
    localStorage.setItem('ml_' + key, val);
    if (window._mlConfig) window._mlConfig[key] = val;
  },
  companyName: () => window._mlConfig?.companyName || localStorage.getItem('ml_company_name') || 'MenuLens',
  anthropicKey: () => '', // Anthropic key is server-side only — never exposed to frontend
};

// ── SESSION CACHE ─────────────────────
let _currentUser = null;

async function getCurrentUser() {
  if (_currentUser) return _currentUser;
  const demo = sessionStorage.getItem('ml_demo_user');
  if (demo) return JSON.parse(demo);
  const sb = await getSupabaseAsync();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data } = await sb.from('users').select('*').eq('id', session.user.id).single();
  _currentUser = data;
  return _currentUser;
}

function clearUserCache() {
  _currentUser = null;
}

// Arrancar carga de config al cargar el script
loadConfig();
