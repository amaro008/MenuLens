// ══════════════════════════════════════
// supabase.js — cliente + config desde API
// ══════════════════════════════════════

let _config = null;
let _supabase = null;

// Carga la config desde /api/config (variables de entorno de Vercel)
async function loadConfig() {
  if (_config) return _config;
  try {
    const resp = await fetch('/api/config');
    if (resp.ok) {
      _config = await resp.json();
      if (_config.supabaseUrl) localStorage.setItem('ml_supabase_url', _config.supabaseUrl);
      if (_config.supabaseKey) localStorage.setItem('ml_supabase_key', _config.supabaseKey);
      if (_config.companyName) localStorage.setItem('ml_company_name', _config.companyName);
      if (_config.anthropicKey) localStorage.setItem('ml_anthropic_key', _config.anthropicKey);
      return _config;
    }
  } catch(e) {
    console.log('API config not available, using localStorage fallback');
  }
  // Fallback localStorage
  _config = {
    supabaseUrl:  localStorage.getItem('ml_supabase_url')  || '',
    supabaseKey:  localStorage.getItem('ml_supabase_key')  || '',
    companyName:  localStorage.getItem('ml_company_name')  || 'MenuLens',
    anthropicKey: localStorage.getItem('ml_anthropic_key') || '',
  };
  return _config;
}

async function getSupabaseAsync() {
  if (_supabase) return _supabase;
  const cfg = await loadConfig();
  if (cfg.supabaseUrl && cfg.supabaseKey) {
    _supabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  }
  return _supabase;
}

function getSupabase() {
  if (_supabase) return _supabase;
  const url = _config?.supabaseUrl || localStorage.getItem('ml_supabase_url') || '';
  const key = _config?.supabaseKey || localStorage.getItem('ml_supabase_key') || '';
  if (url && key) {
    _supabase = window.supabase.createClient(url, key);
  }
  return _supabase;
}

function reinitSupabase() {
  _supabase = null;
  _config = null;
  return getSupabaseAsync();
}

const Config = {
  get: (key) => _config?.[key] || localStorage.getItem('ml_' + key) || '',
  set: (key, val) => { localStorage.setItem('ml_' + key, val); if (_config) _config[key] = val; },
  companyName: () => _config?.companyName || localStorage.getItem('ml_company_name') || 'MenuLens',
  anthropicKey: () => _config?.anthropicKey || localStorage.getItem('ml_anthropic_key') || '',
};

let _currentUser = null;

async function getCurrentUser() {
  if (_currentUser) return _currentUser;
  const sb = await getSupabaseAsync();
  if (!sb) {
    const demo = sessionStorage.getItem('ml_demo_user');
    return demo ? JSON.parse(demo) : null;
  }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data } = await sb.from('users').select('*').eq('id', session.user.id).single();
  _currentUser = data;
  return _currentUser;
}

function clearUserCache() { _currentUser = null; }

// Cargar config al arrancar
loadConfig();
