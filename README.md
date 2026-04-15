# 2SA Fulfillment Portal

Client-facing portal for ASL / CCEP to query orders and inventory.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (React) |
| Database | Supabase (PostgreSQL + Auth + RLS) |
| Hosting | Vercel (free tier, `.vercel.app` URL) |
| Warehouse 1 | JDL — REST + OAuth2 + MD5 sign |
| Warehouse 2 | ECCANG AUSYD — SOAP/XML + static token |

---

## Setup

### 1. Clone and install

```bash
git clone <your-repo>
cd 2sa-fulfillment-portal
npm install
```

### 2. Set up Supabase

1. Go to https://supabase.com → New project
2. SQL Editor → paste contents of `supabase_schema.sql` → Run
3. Copy your project URL and anon key from Settings → API

### 3. Create `.env.local`

Copy `.env.local.example` to `.env.local` and fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # from Supabase Settings → API

# ECCANG (ready to use)
ECCANG_APP_TOKEN=your_token
ECCANG_APP_KEY=your_key
ECCANG_BASE_URL=http://2star.yunwms.com/default/svc/web-service
ECCANG_WAREHOUSE_CODE=AUSYD

# JDL (fill in after OAuth)
JDL_APP_KEY=your_app_key
JDL_APP_SECRET=your_app_secret
JDL_ACCESS_TOKEN=     ← leave blank until OAuth done
```

### 4. JDL OAuth (one-time)

Open this URL in a browser (replace YOUR_APP_KEY):
```
https://us-oauth.jdl.com/oauth/authorize?client_id=YOUR_APP_KEY&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code
```

Log in with JDL account → copy the `access_token` → paste into `.env.local`

Token is valid for **365 days**. Set a calendar reminder to refresh before expiry.

### 5. Run locally

```bash
npm run dev
# Open http://localhost:3000
```

### 6. Deploy to Vercel

```bash
npm install -g vercel
vercel
# Follow prompts → add env vars in Vercel dashboard
```

Your test URL will be: `https://2sa-portal-xxx.vercel.app`

---

## Create Users (Supabase)

1. Supabase → Authentication → Users → Invite user
2. After they accept, add their role in SQL Editor:

```sql
-- For 2SA admin
INSERT INTO user_profiles (id, email, full_name, role, company)
VALUES ('uuid-from-auth-users', 'admin@2sa.com.au', 'Jenny Liu', '2sa_admin', '2SA');

-- For ASL viewer
INSERT INTO user_profiles (id, email, full_name, role, company)
VALUES ('uuid-from-auth-users', 'contact@asl.com', 'ASL User', 'asl_viewer', 'ASL');

-- For CCEP viewer
INSERT INTO user_profiles (id, email, full_name, role, company)
VALUES ('uuid-from-auth-users', 'contact@ccep.com', 'CCEP User', 'ccep_viewer', 'CCEP');
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/orders` | GET | Search orders (q, type, status, page) |
| `/api/orders` | POST | Create order (2SA admin) |
| `/api/orders/[id]` | GET | Single order detail |
| `/api/orders/[id]` | PATCH | Update status / tracking |
| `/api/warehouse/inventory` | GET | Both warehouses combined |
| `/api/warehouse/eccang/inventory` | GET | ECCANG only |
| `/api/warehouse/jdl/inventory` | GET | JDL only |

---

## File Structure

```
pages/
  index.js                          ← Main portal UI
  api/
    orders/
      index.js                      ← List + create orders
      [id].js                       ← Get + update single order
    warehouse/
      inventory.js                  ← Combined (both warehouses)
      eccang/inventory.js           ← ECCANG AUSYD proxy
      jdl/inventory.js              ← JDL proxy
supabase_schema.sql                 ← Run in Supabase SQL Editor
.env.local.example                  ← Copy to .env.local
```
