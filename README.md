# MenuLens

Plataforma de análisis inteligente de menús para distribuidoras de alimentos.

## Estructura del proyecto

```
menulens/
├── public/                  # Logos y assets estáticos
├── src/
│   ├── pages/               # Una página HTML por módulo
│   │   ├── login.html
│   │   ├── dashboard.html
│   │   ├── analyzer.html
│   │   ├── results.html
│   │   ├── history.html
│   │   ├── admin-kpi.html
│   │   ├── admin-users.html
│   │   └── admin-config.html
│   ├── js/
│   │   ├── supabase.js      # Cliente Supabase + helpers de config
│   │   ├── auth.js          # Guard de acceso + topbar/sidebar
│   │   ├── ui.js            # Toast, loading, charts, formatters
│   │   ├── analyzer.js      # Claude API + guardado en BD
│   │   └── export.js        # Excel, copiar, WhatsApp, catálogo
│   └── css/
│       ├── main.css         # Variables, layout, topbar, sidebar
│       └── components.css   # Botones, cards, tablas, badges
├── supabase/
│   └── schema.sql           # Tablas + RLS + trigger de usuarios
├── vercel.json              # Rutas limpias + headers de seguridad
├── .gitignore
└── README.md
```

## Setup paso a paso

### 1. Clonar y subir a GitHub

```bash
git init
git add .
git commit -m "feat: MenuLens initial commit"
git remote add origin https://github.com/TU_USUARIO/menulens.git
git push -u origin main
```

### 2. Supabase

1. Crear proyecto en [supabase.com](https://supabase.com)
2. Ir a **SQL Editor** → pegar el contenido de `supabase/schema.sql` → ejecutar
3. Ir a **Project Settings → API** → copiar:
   - **Project URL** (forma: `https://xxxx.supabase.co`)
   - **anon public** key

### 3. Vercel

1. Ir a [vercel.com](https://vercel.com) → New Project
2. Importar el repositorio de GitHub
3. Framework Preset: **Other**
4. Sin variables de entorno requeridas (las keys se configuran desde la app)
5. Deploy

### 4. Primer acceso

**Modo demo (sin Supabase configurado):**
- Admin: `admin@demo.com` / `admin123`
- Asesor: cualquier email / mínimo 6 caracteres

**Pasos de configuración inicial (como admin):**
1. Login → ir a **Configuración**
2. Ingresar nombre de la empresa
3. Subir logos (empresa y app)
4. Ingresar Anthropic API Key (`sk-ant-...`)
5. Ingresar Supabase URL y Key → guardar → recargar página
6. Cargar catálogo de SKUs (Excel)
7. Ir a **Usuarios** → crear asesores

---

## Roles y acceso

| Rol | Páginas accesibles |
|-----|--------------------|
| **Admin** | Todo |
| **Supervisor** | KPIs, historial global, vista asesor |
| **Asesor** | Dashboard, analizador, resultados, historial propio |

El guard de acceso (`auth.js`) redirige automáticamente a login si no hay sesión, y a dashboard si un asesor intenta acceder a páginas de admin.

---

## Catálogo de SKUs — formato Excel

| Columna | Requerido |
|---------|-----------|
| SKU | ✅ |
| Material | ✅ |
| Familia | Recomendado |
| Sublínea | Opcional |
| Línea de Ventas | Opcional |
| Marca | Opcional |

Descarga la plantilla desde **Admin → Configuración → Descargar plantilla**.

---

## Costos estimados de operación

| Servicio | Plan | Costo |
|----------|------|-------|
| Vercel | Free | $0/mes |
| Supabase | Free (500MB DB) | $0/mes |
| Claude API | Pay-per-use | ~$0.01–0.05 / análisis |
| Google Maps | Sin API (link directo) | $0 |
| **Total arranque** | | **~$10–50/mes** |

---

## Credenciales demo

Para probar sin Supabase (modo demo):
- **Admin:** `admin@demo.com` / `admin123`
- **Asesor:** cualquier email válido / contraseña de 6+ caracteres
