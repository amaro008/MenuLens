-- ══════════════════════════════════════
-- MenuLens — seed.sql
-- Datos iniciales opcionales
-- Ejecutar DESPUÉS de schema.sql
-- ══════════════════════════════════════

-- Nota: El usuario admin se crea desde Supabase Dashboard:
-- Authentication → Users → Invite user
-- o desde la app en Admin → Usuarios → Agregar usuario
--
-- Alternativamente, crear el primer admin manualmente:
-- 1. Ir a Authentication → Users → "Add user"
-- 2. Email: admin@tuempresa.com, Password: (elige una segura)
-- 3. Luego ejecutar este SQL reemplazando el email:

/*
UPDATE public.users
SET role = 'admin'
WHERE email = 'admin@tuempresa.com';
*/

-- Configuración inicial de la app
INSERT INTO public.app_config (key, value) VALUES
  ('company_name',      'MenuLens'),
  ('allow_implicit',    'true'),
  ('show_confidence',   'true'),
  ('auto_save_history', 'true'),
  ('detect_allergens',  'false')
ON CONFLICT (key) DO NOTHING;
