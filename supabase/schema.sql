-- ============================================================================
-- Santa Towing App - Supabase PostgreSQL Schema & Row Level Security (RLS)
-- Project ID: vfvufyzdvlpxfnqwtyuh
-- Run this script once in your Supabase Dashboard -> SQL Editor.
-- ============================================================================

-- 1. Site Content, Theme, Inventory & Settings Overrides
create table if not exists public.site_content (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.site_content enable row level security;

drop policy if exists "Public can read site content" on public.site_content;
create policy "Public can read site content"
  on public.site_content for select
  using (true);

drop policy if exists "Authenticated admins can manage site content" on public.site_content;
create policy "Authenticated admins can manage site content"
  on public.site_content for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 2. Customers Directory
create table if not exists public.customers (
  id text primary key,
  name text not null,
  company text,
  phone text not null,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customers enable row level security;

drop policy if exists "Authenticated users can manage customers" on public.customers;
create policy "Authenticated users can manage customers"
  on public.customers for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 3. Pro Forma Invoices
create table if not exists public.invoices (
  id text primary key,
  doc_number text not null unique,
  issue_date text not null,
  valid_until text not null,
  customer_id text,
  customer_name text not null,
  customer_company text,
  customer_phone text not null,
  customer_email text,
  customer_address text,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  discount_type text not null default 'percentage',
  discount_value numeric not null default 0,
  discount_amount numeric not null default 0,
  tax_rate numeric not null default 15,
  tax_amount numeric not null default 0,
  grand_total numeric not null default 0,
  amount_paid numeric not null default 0,
  balance_due numeric not null default 0,
  payment_instructions text not null default '',
  terms_and_conditions text not null default '',
  notes text,
  status text not null default 'Draft',
  custom_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invoices enable row level security;

drop policy if exists "Authenticated users can manage invoices" on public.invoices;
create policy "Authenticated users can manage invoices"
  on public.invoices for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 4. Official Receipts
create table if not exists public.receipts (
  id text primary key,
  receipt_number text not null unique,
  receipt_date text not null,
  customer_id text,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  customer_address text,
  invoice_id text,
  invoice_number text,
  amount_received numeric not null default 0,
  payment_method text not null,
  payment_reference text not null default '',
  invoice_total numeric,
  remaining_balance numeric,
  notes text,
  status text not null default 'Issued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.receipts enable row level security;

drop policy if exists "Authenticated users can manage receipts" on public.receipts;
create policy "Authenticated users can manage receipts"
  on public.receipts for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 5. Document & Billing Settings
create table if not exists public.document_settings (
  id text primary key default 'default',
  settings jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.document_settings enable row level security;

drop policy if exists "Authenticated users can manage document settings" on public.document_settings;
create policy "Authenticated users can manage document settings"
  on public.document_settings for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 6. Activity & Audit Logs
create table if not exists public.activity_logs (
  id text primary key,
  timestamp timestamptz not null default now(),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  entity_title text not null,
  user_name text not null,
  details text not null
);

alter table public.activity_logs enable row level security;

drop policy if exists "Authenticated users can manage activity logs" on public.activity_logs;
create policy "Authenticated users can manage activity logs"
  on public.activity_logs for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 7. Image Studio Media Library
create table if not exists public.studio_images (
  id text primary key,
  name text not null,
  data_url text not null,
  width integer not null,
  height integer not null,
  format text not null,
  size integer not null,
  category text not null,
  is_edited boolean not null default false,
  original_id text,
  original_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.studio_images enable row level security;

drop policy if exists "Public can read studio images" on public.studio_images;
create policy "Public can read studio images"
  on public.studio_images for select
  using (true);

drop policy if exists "Authenticated users can manage studio images" on public.studio_images;
create policy "Authenticated users can manage studio images"
  on public.studio_images for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 8. Public Customer Service Requests, Quotes, Reservations & Applications
create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null,
  customer_name text not null,
  phone text,
  email text,
  subject text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.service_requests enable row level security;

drop policy if exists "Public can submit service requests" on public.service_requests;
create policy "Public can submit service requests"
  on public.service_requests for insert
  to anon, authenticated
  with check (char_length(customer_name) between 1 and 150);

drop policy if exists "Authenticated users can view and manage service requests" on public.service_requests;
create policy "Authenticated users can view and manage service requests"
  on public.service_requests for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update service requests" on public.service_requests;
create policy "Authenticated users can update service requests"
  on public.service_requests for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete service requests" on public.service_requests;
create policy "Authenticated users can delete service requests"
  on public.service_requests for delete
  using (auth.role() = 'authenticated');

-- 9. Newsletter Subscribers
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text not null default 'footer',
  created_at timestamptz not null default now()
);

alter table public.newsletter_subscribers enable row level security;

drop policy if exists "Public can subscribe to newsletter" on public.newsletter_subscribers;
create policy "Public can subscribe to newsletter"
  on public.newsletter_subscribers for insert
  to anon, authenticated
  with check (char_length(email) between 3 and 160);

drop policy if exists "Authenticated users can view subscribers" on public.newsletter_subscribers;
create policy "Authenticated users can view subscribers"
  on public.newsletter_subscribers for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete subscribers" on public.newsletter_subscribers;
create policy "Authenticated users can delete subscribers"
  on public.newsletter_subscribers for delete
  using (auth.role() = 'authenticated');

-- 10. Enable Realtime for live content updates
do $$
begin
  alter publication supabase_realtime add table public.site_content;
exception when others then
  null;
end $$;
