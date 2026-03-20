// ══════════════════════════════════════
// supabase.js — cliente singleton
// ══════════════════════════════════════

const SUPABASE_URL = localStorage.getItem('ml_supabase_url') || '';
const SUPABASE_KEY = localStorage.getItem('ml_supabase_key') || '';

let _supabase = null;

function getSupabase() {
  if (!_supabase && SUPABASE_URL && SUPABASE_KEY) {
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return _supabase;
}

function reinitSupabase() {
  const url = localStorage.getItem('ml_supabase_url') || '';
  const key = localStorage.getItem('ml_supabase_key') || '';
  if (url && key) {
    _supabase = window.supabase.createClient(url, key);
  }
  return _supabase;
}

// ── CONFIG HELPERS ────────────────────
const Config = {
  get: (key) => localStorage.getItem('ml_' + key) || '',
  set: (key, val) => { localStorage.setItem('ml_' + key, val); },
  companyName: () => localStorage.getItem('ml_company_name') || 'MenuLens',
  anthropicKey: () => localStorage.getItem('ml_anthropic_key') || '',
};

// ── SESSION CACHE ─────────────────────
let _currentUser = null;

async function getCurrentUser() {
  if (_currentUser) return _currentUser;
  const sb = getSupabase();
  if (!sb) {
    // Demo mode
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
