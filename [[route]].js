// Cloudflare Pages Function: /api/*  (Supabase REST ko service_role key se call karta hai)
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, SESSION_SECRET, (optional) ADMIN_ID

const enc = new TextEncoder();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });

const b64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function sb(env, path, opts = {}) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: r.ok, status: r.status, body };
}

// ---------- session token (HMAC signed cookie) ----------
const hmacKey = (secret) =>
  crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

async function makeToken(env) {
  const payload = b64u(enc.encode(JSON.stringify({ exp: Date.now() + 12 * 3600 * 1000 })));
  const sig = b64u(await crypto.subtle.sign('HMAC', await hmacKey(env.SESSION_SECRET), enc.encode(payload)));
  return `${payload}.${sig}`;
}

async function isAdmin(env, request) {
  const m = (request.headers.get('cookie') || '').match(/(?:^|;\s*)adm=([^;]+)/);
  if (!m) return false;
  const [payload, sig] = m[1].split('.');
  if (!payload || !sig) return false;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(env.SESSION_SECRET), fromB64u(sig), enc.encode(payload));
    if (!ok) return false;
    return JSON.parse(new TextDecoder().decode(fromB64u(payload))).exp > Date.now();
  } catch { return false; }
}

const cookie = (token, maxAge) => `adm=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;

// ---------- password hashing (PBKDF2) ----------
async function hashPw(pw, saltB64) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromB64u(saltB64), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return b64u(bits);
}
const newSalt = () => b64u(crypto.getRandomValues(new Uint8Array(16)));

// ---------- main ----------
export async function onRequest({ request, env, params }) {
  const route = [].concat(params.route || []).join('/');
  const method = request.method;
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY || !env.SESSION_SECRET)
      return json({ error: 'Server config adhoori hai: Cloudflare mein env variables set karo.' }, 500);

    const body = method === 'POST' ? await request.json().catch(() => ({})) : {};

    // ===== PUBLIC =====
    if (route === 'settings' && method === 'GET') {
      const s = (await sb(env, 'settings?id=eq.1&select=title,description,price,is_open')).body?.[0] || {};
      const rs = (await sb(env, 'responses?select=wants,qty')).body;
      const list = Array.isArray(rs) ? rs : [];
      return json({ ...s, stats: { people: list.length, samosas: list.reduce((a, r) => a + (r.qty || 0), 0) } });
    }

    if (route === 'submit' && method === 'POST') {
      const s = (await sb(env, 'settings?id=eq.1&select=is_open')).body?.[0];
      if (!s?.is_open) return json({ error: 'Survey band ho chuka hai.' }, 403);

      const name = String(body.name || '').trim().replace(/\s+/g, ' ');
      const roll = String(body.roll_no || '').trim().toUpperCase();
      const wants = body.wants === true;
      let qty = wants ? parseInt(body.qty, 10) : 0;

      if (name.length < 2 || name.length > 60) return json({ error: 'Naam 2 se 60 huroof ka likho.' }, 400);
      if (!/^26-ARID-\d{4}$/.test(roll)) return json({ error: 'Roll no format: 26-Arid-1234' }, 400);
      if (wants && !(qty >= 1 && qty <= 4)) return json({ error: 'Samosay 1 se 4 tak hi le sakte ho.' }, 400);
      if (!wants) qty = 0;

      const r = await sb(env, 'responses', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ roll_no: roll, name, wants, qty }),
      });
      if (r.status === 409) return json({ error: 'Is roll no se response pehle hi aa chuka hai.' }, 409);
      if (!r.ok) return json({ error: 'Save nahi ho saka, dobara try karo.' }, 500);
      return json({ ok: true });
    }

    // ===== ADMIN =====
    if (route === 'admin/status' && method === 'GET') {
      const cfg = (await sb(env, 'admin_config?id=eq.1&select=pw_hash')).body?.[0];
      return json({ needsSetup: !cfg?.pw_hash });
    }

    if (route === 'admin/login' && method === 'POST') {
      const adminId = (env.ADMIN_ID || 'admin@treat').toLowerCase();
      const id = String(body.id || '').trim().toLowerCase();
      const pw = typeof body.password === 'string' ? body.password : '';
      if (id !== adminId || pw.length < 4) {
        await sleep(700);
        return json({ error: 'ID ya password ghalat hai (password kam az kam 4 characters).' }, 401);
      }
      const cfg = (await sb(env, 'admin_config?id=eq.1&select=pw_hash,pw_salt')).body?.[0];
      let first = false;
      if (!cfg?.pw_hash) {
        // pehli dafa login: jo password likha wahi set ho jata hai
        const salt = newSalt();
        const r = await sb(env, 'admin_config?id=eq.1&pw_hash=is.null', {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ pw_hash: await hashPw(pw, salt), pw_salt: salt }),
        });
        if (!r.ok || !Array.isArray(r.body) || !r.body.length) return json({ error: 'Dobara try karo.' }, 409);
        first = true;
      } else if ((await hashPw(pw, cfg.pw_salt)) !== cfg.pw_hash) {
        await sleep(700);
        return json({ error: 'ID ya password ghalat hai.' }, 401);
      }
      return json({ ok: true, first }, 200, { 'set-cookie': cookie(await makeToken(env), 12 * 3600) });
    }

    if (route === 'admin/logout' && method === 'POST')
      return json({ ok: true }, 200, { 'set-cookie': cookie('', 0) });

    if (route.startsWith('admin/')) {
      if (!(await isAdmin(env, request))) return json({ error: 'Login zaroori hai.' }, 401);

      if (route === 'admin/data' && method === 'GET') {
        const settings = (await sb(env, 'settings?id=eq.1&select=*')).body?.[0] || {};
        const responses = (await sb(env, 'responses?select=*&order=roll_no.asc')).body;
        return json({ settings, responses: Array.isArray(responses) ? responses : [] });
      }

      if (route === 'admin/settings' && method === 'POST') {
        const price = Number(body.price);
        const title = String(body.title || '').trim().slice(0, 80);
        const description = String(body.description || '').trim().slice(0, 400);
        if (!(price >= 0 && price <= 10000)) return json({ error: 'Price 0 se 10000 ke darmiyan likho.' }, 400);
        if (!title) return json({ error: 'Title khali nahi ho sakta.' }, 400);
        const r = await sb(env, 'settings?id=eq.1', {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ price, title, description, is_open: body.is_open !== false }),
        });
        return r.ok ? json({ ok: true }) : json({ error: 'Save nahi hua.' }, 500);
      }

      if (route === 'admin/delete' && method === 'POST') {
        const id = parseInt(body.id, 10);
        if (!id) return json({ error: 'Bad id' }, 400);
        const r = await sb(env, `responses?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
        return r.ok ? json({ ok: true }) : json({ error: 'Delete nahi hua.' }, 500);
      }

      if (route === 'admin/password' && method === 'POST') {
        const pw = typeof body.password === 'string' ? body.password : '';
        if (pw.length < 4) return json({ error: 'Password kam az kam 4 characters.' }, 400);
        const salt = newSalt();
        const r = await sb(env, 'admin_config?id=eq.1', {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ pw_hash: await hashPw(pw, salt), pw_salt: salt }),
        });
        return r.ok ? json({ ok: true }) : json({ error: 'Password change nahi hua.' }, 500);
      }
    }

    return json({ error: 'Not found' }, 404);
  } catch (e) {
    return json({ error: 'Server error' }, 500);
  }
}
