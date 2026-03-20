// ══════════════════════════════════════
// auth.js — guard de acceso
// ══════════════════════════════════════

const ADMIN_PAGES = ['admin-kpi.html', 'admin-users.html', 'admin-config.html'];
const currentPage = window.location.pathname.split('/').pop() || 'index.html';

async function requireAuth(requiredRole = null) {

  // ── DEMO MODE ────────────────────────
  const demo = sessionStorage.getItem('ml_demo_user');
  if (demo) {
    const user = JSON.parse(demo);
    const isAdminPage = ADMIN_PAGES.some(p => currentPage.includes(p));
    if (isAdminPage && !['admin','supervisor'].includes(user.role)) {
      window.location.href = '/dashboard.html';
      return null;
    }
    return user;
  }

  // ── SUPABASE MODE ────────────────────
  // Esperar a que el cliente esté listo (usa singleton de supabase.js)
  const sb = await getSupabaseAsync();
  if (!sb) {
    window.location.href = '/login.html';
    return null;
  }

  // Obtener sesión — Supabase la lee de localStorage automáticamente
  let session = null;
  try {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    session = data?.session;
  } catch(e) {
    console.warn('getSession error:', e.message);
    window.location.href = '/login.html';
    return null;
  }

  if (!session) {
    window.location.href = '/login.html';
    return null;
  }

  // Usar caché de perfil si es el mismo usuario
  if (_currentUser && _currentUser.id === session.user.id) {
    const isAdminPage = ADMIN_PAGES.some(p => currentPage.includes(p));
    if (isAdminPage && !['admin','supervisor'].includes(_currentUser.role)) {
      window.location.href = '/dashboard.html';
      return null;
    }
    return _currentUser;
  }

  // Obtener perfil de BD
  const { data: profile, error: profileErr } = await sb
    .from('users')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (profileErr || !profile) {
    console.warn('Profile not found:', profileErr?.message);
    window.location.href = '/login.html';
    return null;
  }

  const isAdminPage = ADMIN_PAGES.some(p => currentPage.includes(p));
  if (isAdminPage && !['admin','supervisor'].includes(profile.role)) {
    window.location.href = '/dashboard.html';
    return null;
  }

  _currentUser = profile;
  return profile;
}

async function doLogout() {
  const sb = await getSupabaseAsync();
  if (sb) await sb.auth.signOut();
  sessionStorage.removeItem('ml_demo_user');
  clearUserCache();
  window.location.href = '/login.html';
}

// ── TOPBAR ────────────────────────────
function renderTopbar(user, isAdmin = false) {
  const el = document.getElementById('topbar');
  if (!el) return;
  const initials = (user.name || 'U').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  const companyName = Config.companyName();
  const companyLogo = Config.get('company_logo_b64');
  el.innerHTML = `
    <div class="logo">
      <div class="logo-icon">
        ${Config.get('app_logo_b64')
          ? `<img src="${Config.get('app_logo_b64')}" alt="Logo">`
          : 'M'}
      </div>
      <div class="logo-name">Menu<span>Lens</span></div>
      <div class="company-tag">
        ${companyLogo
          ? `<img src="${companyLogo}" alt="${companyName}" style="height:18px;vertical-align:middle">`
          : companyName}
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      ${isAdmin ? '<span class="badge badge-red" style="font-size:10px">ADMIN</span>' : ''}
      <div class="user-pill" onclick="doLogout()">
        <div class="avatar">${initials}</div>
        <div class="user-name">${(user.name || '').split(' ')[0]}</div>
      </div>
    </div>`;
}

// ── SIDEBAR ───────────────────────────
function renderSidebar(activePage, role = 'advisor') {
  const el = document.getElementById('sidebar');
  if (!el) return;
  const advisorItems = [
    { icon: '⊞', label: 'Dashboard',      href: 'dashboard.html' },
    { icon: '⊕', label: 'Nuevo análisis', href: 'analyzer.html'  },
    { icon: '☰', label: 'Historial',      href: 'history.html'   },
  ];
  const adminItems = [
    { icon: '📊', label: 'KPIs',           href: 'admin-kpi.html'    },
    { icon: '👥', label: 'Usuarios',       href: 'admin-users.html'  },
    { icon: '⚙️', label: 'Configuración', href: 'admin-config.html' },
  ];
  const isAdmin = ['admin', 'supervisor'].includes(role);
  const mainItems = isAdmin ? adminItems : advisorItems;
  let html = `<div class="nav-section">${isAdmin ? 'Administración' : 'Principal'}</div>`;
  mainItems.forEach(item => {
    const active = currentPage === item.href ? 'active' : '';
    html += `<a href="${item.href}" class="nav-item ${active}">
      <span class="nav-icon">${item.icon}</span>${item.label}
    </a>`;
  });
  if (isAdmin) {
    html += `<div class="nav-divider"></div>
      <a href="dashboard.html" class="nav-item">
        <span class="nav-icon">⊞</span>Vista asesor
      </a>`;
  }
  html += `<div style="flex:1"></div>
    <div class="nav-section">Cuenta</div>
    <div class="nav-item" onclick="doLogout()">
      <span class="nav-icon">→</span>Cerrar sesión
    </div>`;
  el.innerHTML = html;
}
