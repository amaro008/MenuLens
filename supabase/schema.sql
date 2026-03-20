-- ══════════════════════════════════════
-- MenuLens — Supabase Schema v1.1
-- Ejecutar en el SQL Editor de Supabase
-- ══════════════════════════════════════

-- USERS
create table public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  name text not null,
  role text not null default 'advisor' check (role in ('admin','supervisor','advisor')),
  company text,
  active boolean default true,
  created_at timestamptz default now()
);

-- RESTAURANTS
create table public.restaurants (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  address text,
  city text,
  food_type text,
  maps_url text,
  rating numeric(3,1),
  reviews_count int,
  phone text,
  website text,
  created_at timestamptz default now(),
  unique(name, city)
);

-- ANALYSES
create table public.analyses (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id),
  restaurant_id uuid references public.restaurants(id),
  file_url text,
  file_type text,
  status text default 'complete' check (status in ('processing','complete','error')),
  duration_ms int default 0,
  dish_count int default 0,
  sku_count int default 0,
  avg_price numeric(10,2) default 0,
  raw_json jsonb,
  created_at timestamptz default now()
);

-- MENU_ITEMS
create table public.menu_items (
  id uuid default gen_random_uuid() primary key,
  analysis_id uuid references public.analyses(id) on delete cascade,
  name text not null,
  category text,
  price numeric(10,2),
  description text,
  created_at timestamptz default now()
);

-- INGREDIENTS
create table public.ingredients (
  id uuid default gen_random_uuid() primary key,
  analysis_id uuid references public.analyses(id) on delete cascade,
  ingredient_name text not null,
  normalized text,
  priority text check (priority in ('P1','P2','P3','P4','P5')),
  match_type text check (match_type in ('Exacto','Aproximado','No encontrado')),
  mentions int default 1,
  implicit boolean default false,
  ambiguous boolean default false,
  created_at timestamptz default now()
);

-- SKU_MATCHES
create table public.sku_matches (
  id uuid default gen_random_uuid() primary key,
  analysis_id uuid references public.analyses(id) on delete cascade,
  sku text,
  material text,
  brand text,
  family text,
  sales_line text,
  match_type text,
  confidence text,
  priority text,
  mentions int default 1,
  rank int,
  alternatives jsonb,
  created_at timestamptz default now()
);

-- SKU_CATALOG
create table public.sku_catalog (
  id uuid default gen_random_uuid() primary key,
  company text,
  familia text,
  sublinea text,
  linea_ventas text,
  marca text,
  sku text not null,
  material text not null,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(sku, company)
);

-- APP_CONFIG
create table public.app_config (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

-- ══════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════
alter table public.users enable row level security;
alter table public.analyses enable row level security;
alter table public.restaurants enable row level security;
alter table public.menu_items enable row level security;
alter table public.ingredients enable row level security;
alter table public.sku_matches enable row level security;
alter table public.sku_catalog enable row level security;

-- ── USERS ──────────────────────────────
create policy "users_select" on public.users
  for select using (
    auth.uid() = id or
    exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role = 'admin')
  );

create policy "users_insert" on public.users
  for insert with check (
    auth.uid() = id or
    exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role = 'admin')
  );

create policy "users_update" on public.users
  for update using (
    auth.uid() = id or
    exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role = 'admin')
  );

create policy "users_delete" on public.users
  for delete using (
    exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role = 'admin')
  );

-- ── RESTAURANTS ────────────────────────
create policy "restaurants_select" on public.restaurants
  for select using (auth.uid() is not null);

create policy "restaurants_insert" on public.restaurants
  for insert with check (auth.uid() is not null);

create policy "restaurants_update" on public.restaurants
  for update using (auth.uid() is not null);

-- ── ANALYSES ───────────────────────────
create policy "analyses_select" on public.analyses
  for select using (
    user_id = auth.uid() or
    exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role in ('admin','supervisor'))
  );

create policy "analyses_insert" on public.analyses
  for insert with check (
    user_id = auth.uid() or
    exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role in ('admin','supervisor'))
  );

create policy "analyses_update" on public.analyses
  for update using (
    user_id = auth.uid() or
    exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role in ('admin','supervisor'))
  );

create policy "analyses_delete" on public.analyses
  for delete using (
    exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role = 'admin')
  );

-- ── MENU_ITEMS ─────────────────────────
create policy "menu_items_select" on public.menu_items
  for select using (
    exists (
      select 1 from public.analyses a
      where a.id = analysis_id and (
        a.user_id = auth.uid() or
        exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role in ('admin','supervisor'))
      )
    )
  );

create policy "menu_items_insert" on public.menu_items
  for insert with check (
    exists (
      select 1 from public.analyses a
      where a.id = analysis_id and (
        a.user_id = auth.uid() or
        exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role in ('admin','supervisor'))
      )
    )
  );

create policy "menu_items_delete" on public.menu_items
  for delete using (
    exists (
      select 1 from public.analyses a where a.id = analysis_id and
        exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role = 'admin')
    )
  );

-- ── INGREDIENTS ────────────────────────
create policy "ingredients_select" on public.ingredients
  for select using (
    exists (
      select 1 from public.analyses a
      where a.id = analysis_id and (
        a.user_id = auth.uid() or
        exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role in ('admin','supervisor'))
      )
    )
  );

create policy "ingredients_insert" on public.ingredients
  for insert with check (
    exists (
      select 1 from public.analyses a
      where a.id = analysis_id and (
        a.user_id = auth.uid() or
        exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role in ('admin','supervisor'))
      )
    )
  );

create policy "ingredients_delete" on public.ingredients
  for delete using (
    exists (
      select 1 from public.analyses a where a.id = analysis_id and
        exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role = 'admin')
    )
  );

-- ── SKU_MATCHES ────────────────────────
create policy "sku_matches_select" on public.sku_matches
  for select using (
    exists (
      select 1 from public.analyses a
      where a.id = analysis_id and (
        a.user_id = auth.uid() or
        exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role in ('admin','supervisor'))
      )
    )
  );

create policy "sku_matches_insert" on public.sku_matches
  for insert with check (
    exists (
      select 1 from public.analyses a
      where a.id = analysis_id and (
        a.user_id = auth.uid() or
        exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role in ('admin','supervisor'))
      )
    )
  );

create policy "sku_matches_delete" on public.sku_matches
  for delete using (
    exists (
      select 1 from public.analyses a where a.id = analysis_id and
        exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role = 'admin')
    )
  );

-- ── SKU_CATALOG ────────────────────────
create policy "catalog_select" on public.sku_catalog
  for select using (auth.uid() is not null);

create policy "catalog_insert" on public.sku_catalog
  for insert with check (
    exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role = 'admin')
  );

create policy "catalog_update" on public.sku_catalog
  for update using (
    exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role = 'admin')
  );

create policy "catalog_delete" on public.sku_catalog
  for delete using (
    exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role = 'admin')
  );

-- ══════════════════════════════════════
-- ÍNDICES
-- ══════════════════════════════════════
create index idx_analyses_user on public.analyses(user_id);
create index idx_analyses_restaurant on public.analyses(restaurant_id);
create index idx_analyses_created on public.analyses(created_at desc);
create index idx_ingredients_analysis on public.ingredients(analysis_id);
create index idx_ingredients_priority on public.ingredients(priority);
create index idx_sku_matches_analysis on public.sku_matches(analysis_id);
create index idx_sku_catalog_sku on public.sku_catalog(sku);
create index idx_restaurants_food_type on public.restaurants(food_type);

-- ══════════════════════════════════════
-- FUNCIÓN: auto-insert perfil al registrarse
-- ══════════════════════════════════════
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'advisor')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
