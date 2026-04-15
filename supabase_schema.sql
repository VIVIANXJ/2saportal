-- ============================================================
-- 2SA Fulfillment Portal — Supabase Database Schema
-- Run this in Supabase → SQL Editor
-- ============================================================

-- ── 1. USERS / ROLES ─────────────────────────────────────────
-- Uses Supabase Auth for login; this table stores role info
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  full_name     TEXT,
  role          TEXT NOT NULL CHECK (role IN ('2sa_admin', 'asl_viewer', 'ccep_viewer')),
  company       TEXT NOT NULL CHECK (company IN ('2SA', 'ASL', 'CCEP')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. PRODUCTS / SKUs ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku           TEXT NOT NULL UNIQUE,
  product_name  TEXT NOT NULL,
  description   TEXT,
  client        TEXT NOT NULL CHECK (client IN ('ASL', 'CCEP', 'BOTH')),
  barcode       TEXT,
  weight_kg     NUMERIC(8,3),
  dimensions    JSONB,          -- {l, w, h} in cm
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. INVENTORY CACHE ───────────────────────────────────────
-- Cached from warehouse API calls; refreshed on demand
CREATE TABLE IF NOT EXISTS public.inventory_cache (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku             TEXT NOT NULL REFERENCES public.products(sku) ON DELETE CASCADE,
  warehouse       TEXT NOT NULL CHECK (warehouse IN ('JDL', 'ECCANG')),
  warehouse_code  TEXT NOT NULL,   -- e.g. AUSYD
  sellable        INT DEFAULT 0,
  reserved        INT DEFAULT 0,
  onway           INT DEFAULT 0,
  pending         INT DEFAULT 0,
  unsellable      INT DEFAULT 0,
  hold_qty        INT DEFAULT 0,
  last_synced_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sku, warehouse)
);

-- ── 4. ORDERS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number    TEXT NOT NULL UNIQUE,      -- 2SA internal order number
  reference_no    TEXT,                       -- client reference number (fuzzy searchable)
  order_type      TEXT NOT NULL CHECK (order_type IN ('kitting', 'standard')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                    'pending', 'processing', 'packed', 'shipped', 'delivered', 'cancelled'
                  )),
  client          TEXT NOT NULL CHECK (client IN ('ASL', 'CCEP')),
  warehouse       TEXT NOT NULL CHECK (warehouse IN ('JDL', 'ECCANG', 'BOTH')),
  tracking_number TEXT,
  carrier         TEXT,
  ship_to_name    TEXT,
  ship_to_address JSONB,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  shipped_at      TIMESTAMPTZ
);

-- ── 5. ORDER LINE ITEMS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sku         TEXT NOT NULL,
  product_name TEXT,
  quantity    INT NOT NULL CHECK (quantity > 0),
  notes       TEXT
);

-- ── 6. KITTING JOBS ──────────────────────────────────────────
-- For kitting orders: records what was kitted into what
CREATE TABLE IF NOT EXISTS public.kitting_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  kit_sku         TEXT NOT NULL,   -- the finished kit SKU
  kit_name        TEXT,
  quantity        INT NOT NULL,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed')),
  completed_at    TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Kitting components (what goes INTO each kit)
CREATE TABLE IF NOT EXISTS public.kitting_components (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kitting_job_id  UUID NOT NULL REFERENCES public.kitting_jobs(id) ON DELETE CASCADE,
  component_sku   TEXT NOT NULL,
  component_name  TEXT,
  qty_per_kit     INT NOT NULL,
  total_qty       INT NOT NULL    -- qty_per_kit × kitting_jobs.quantity
);

-- ── 7. ORDER TRACKING HISTORY ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_tracking (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  description TEXT,
  location    TEXT,
  updated_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────
ALTER TABLE public.user_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_cache  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitting_jobs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitting_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_tracking   ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper: get current user's client
CREATE OR REPLACE FUNCTION public.get_my_company()
RETURNS TEXT AS $$
  SELECT company FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- user_profiles: users can only read their own profile; admins read all
CREATE POLICY "users read own profile"
  ON public.user_profiles FOR SELECT
  USING (id = auth.uid() OR public.get_my_role() = '2sa_admin');

CREATE POLICY "admins manage profiles"
  ON public.user_profiles FOR ALL
  USING (public.get_my_role() = '2sa_admin');

-- products: all authenticated users can read
CREATE POLICY "authenticated read products"
  ON public.products FOR SELECT
  TO authenticated USING (TRUE);

CREATE POLICY "admins manage products"
  ON public.products FOR ALL
  USING (public.get_my_role() = '2sa_admin');

-- inventory_cache: all authenticated can read
CREATE POLICY "authenticated read inventory"
  ON public.inventory_cache FOR SELECT
  TO authenticated USING (TRUE);

CREATE POLICY "admins manage inventory cache"
  ON public.inventory_cache FOR ALL
  USING (public.get_my_role() = '2sa_admin');

-- orders: clients can only see THEIR orders
CREATE POLICY "clients read own orders"
  ON public.orders FOR SELECT
  USING (
    public.get_my_role() = '2sa_admin'
    OR client = public.get_my_company()
  );

CREATE POLICY "admins manage orders"
  ON public.orders FOR ALL
  USING (public.get_my_role() = '2sa_admin');

-- order_items: follow parent order access
CREATE POLICY "read order items"
  ON public.order_items FOR SELECT
  USING (
    public.get_my_role() = '2sa_admin'
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND (o.client = public.get_my_company() OR public.get_my_role() = '2sa_admin')
    )
  );

-- kitting: same as orders
CREATE POLICY "read kitting jobs"
  ON public.kitting_jobs FOR SELECT
  USING (
    public.get_my_role() = '2sa_admin'
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND o.client = public.get_my_company()
    )
  );

CREATE POLICY "read kitting components"
  ON public.kitting_components FOR SELECT
  USING (
    public.get_my_role() = '2sa_admin'
    OR EXISTS (
      SELECT 1 FROM public.kitting_jobs kj
      JOIN public.orders o ON o.id = kj.order_id
      WHERE kj.id = kitting_job_id AND o.client = public.get_my_company()
    )
  );

-- tracking: same as orders
CREATE POLICY "read order tracking"
  ON public.order_tracking FOR SELECT
  USING (
    public.get_my_role() = '2sa_admin'
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND o.client = public.get_my_company()
    )
  );

-- ── INDEXES ─────────────────────────────────────────────────
CREATE INDEX idx_orders_order_number ON public.orders (order_number);
CREATE INDEX idx_orders_reference_no ON public.orders (reference_no);
CREATE INDEX idx_orders_client       ON public.orders (client);
CREATE INDEX idx_orders_order_type   ON public.orders (order_type);
CREATE INDEX idx_orders_status       ON public.orders (status);
CREATE INDEX idx_products_sku        ON public.products (sku);
CREATE INDEX idx_inventory_sku       ON public.inventory_cache (sku);

-- ── TRIGGERS: auto update updated_at ────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_orders
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_products
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
