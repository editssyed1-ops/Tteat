# Samosa Treat Portal - Setup Guide (Roman Urdu)

Folder structure:

```
treat-portal/
  supabase/schema.sql          <- Supabase mein run karni hai
  functions/api/[[route]].js   <- Cloudflare backend (API)
  public/                      <- website (index.html, manage.html, css, js, cr.jpg)
  wrangler.toml
  .dev.vars.example
```

## 1) Supabase

1. supabase.com par naya project banao.
2. Left menu mein **SQL Editor** > New query > `supabase/schema.sql` ka poora text paste karo > **Run**.
3. **Project Settings > API** se do cheezein copy karo:
   - **Project URL** (https://xxxx.supabase.co)
   - **service_role** key (secret hai, kisi ko mat dikhana, sirf Cloudflare mein lagani hai)

Tables ban jayen gi: `settings`, `responses`, `admin_config`. RLS on hai aur koi public policy nahi,
yani browser se koi seedha database touch nahi kar sakta, sab kuch sirf Cloudflare function se hota hai.

## 2) Cloudflare Pages deploy

Functions folder deploy karne ke liye Wrangler (ya GitHub connect) chahiye. Dashboard ki drag-and-drop upload mein `functions` nahi chalte.

**Option A: Wrangler (aasan)**

```bash
npm i -g wrangler
wrangler login
cd treat-portal
wrangler pages deploy public --project-name treat-portal
```

**Option B: GitHub**: folder ko GitHub repo mein daalo, Cloudflare > Workers & Pages > Create > Pages > Connect to Git.
Build command khali, **Build output directory = `public`**. (`.dev.vars` upload mat karna.)

## 3) Environment variables (zaroori)

Cloudflare dashboard > Workers & Pages > apna project > **Settings > Variables and Secrets** > Production mein add karo:

| Name | Value | Type |
|---|---|---|
| `SUPABASE_URL` | Supabase Project URL | Text |
| `SUPABASE_SERVICE_KEY` | service_role key | **Secret** |
| `SESSION_SECRET` | koi lamba random string (`openssl rand -hex 32`) | **Secret** |
| `ADMIN_ID` | (optional) default `admin@treat` hai | Text |

Wrangler se bhi ho sakta hai:

```bash
wrangler pages secret put SUPABASE_SERVICE_KEY --project-name treat-portal
wrangler pages secret put SESSION_SECRET --project-name treat-portal
```

Variables add karne ke baad **dobara deploy** karo (warna purana version chalta rahe ga).

## 4) Admin login (hidden)

- Website par admin ka koi button/link nahi hai.
- Admin tak jane ka raasta: **logo (🥟 TreatTime) ko 5 baar jaldi jaldi tap karo**, ya seedha `https://tumhari-site.pages.dev/manage.html` kholo.
- **ID:** `admin@treat`
- **Password:** code mein koi password nahi hai. Pehli dafa login par jo password likhoge wahi set ho jaye ga (database mein sirf hash save hota hai).
  Site class mein share karne se PEHLE khud ek baar login kar lo, taake koi aur pehle password set na kar de.
- Baad mein dashboard ke neeche "Password badlo" se change kar sakte ho.

## 5) Admin kya kar sakta hai

- Ek samosa ki price (fee) likho, har bande ka bill aur total bill foran calculate.
- Title/description badlo, survey band/khula karo.
- Responses dekho/search/delete karo.
- **PDF download**: sirf wo log jinhon ne treat li, unke samosay aur bill, aakhir mein total.

## Rules jo lagu hain

- Roll no format: `26-ARID-1234` (server aur database dono check karte hain).
- Ek roll no sirf ek dafa (database `UNIQUE`).
- Samosay max 4 (form, server aur database teeno jagah limit).
