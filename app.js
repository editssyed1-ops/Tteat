const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const PREFIX = '26-ARID-';
let S = { price: 0, is_open: true };
let wants = null;
let qty = 1;

const money = (n) => 'Rs ' + Number(n).toLocaleString('en-PK');
const plural = (n) => (n === 1 ? '1 samosa' : n + ' samosay');

/* ---------- settings ---------- */
async function loadSettings() {
  try {
    const r = await fetch('/api/settings');
    const d = await r.json();
    if (!r.ok) throw new Error();
    S = d;
    $('#title').textContent = d.title;
    document.title = d.title;
    $('#desc').textContent = d.description;
    $('#priceChip').innerHTML = d.price > 0 ? '&#128176; ' + money(d.price) + ' / samosa' : '&#128176; Price jald set hogi';
    $('#countChip').textContent = d.stats.people + ' response · ' + d.stats.samosas + ' samosay';
    if (!d.is_open) {
      $('#form').classList.add('hidden');
      $('#closed').classList.remove('hidden');
    }
  } catch {
    $('#desc').textContent = 'Server se connect nahi ho paya, page refresh karo.';
  }
  updateBill();
}

/* ---------- 3D tilt ---------- */
const scene = $('#scene');
function setTilt(x, y) {
  scene.style.setProperty('--rx', (-y * 14).toFixed(2) + 'deg');
  scene.style.setProperty('--ry', (x * 18).toFixed(2) + 'deg');
  scene.style.setProperty('--px', (x * 22).toFixed(1));
  scene.style.setProperty('--py', (y * 22).toFixed(1));
}
scene.addEventListener('pointermove', (e) => {
  const r = scene.getBoundingClientRect();
  setTilt(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
});
scene.addEventListener('pointerleave', () => setTilt(0, 0));
window.addEventListener('deviceorientation', (e) => {
  if (e.gamma == null) return;
  const c = (v) => Math.max(-1, Math.min(1, v));
  setTilt(c(e.gamma / 30), c((e.beta - 45) / 30));
});

/* ---------- 0.5 sec samosa animation ---------- */
const stage = $('#makeStage');
const clock = $('#clock');
function playRecord() {
  stage.classList.remove('play');
  clock.classList.remove('done');
  void stage.getBoundingClientRect();
  stage.classList.add('play');
  const t0 = performance.now();
  (function tick(now) {
    const t = Math.min((now - t0) / 1000, 0.5);
    clock.textContent = t.toFixed(2) + ' s';
    if (t < 0.5) requestAnimationFrame(tick);
    else clock.classList.add('done');
  })(t0);
}
$('#replay').addEventListener('click', playRecord);
new IntersectionObserver((en, ob) => {
  if (en[0].isIntersecting) { playRecord(); ob.disconnect(); }
}, { threshold: 0.4 }).observe($('#record'));

/* ---------- hidden admin door: logo 5 baar tap ---------- */
let taps = 0, tapTimer;
$('#logo').addEventListener('click', () => {
  taps++;
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => (taps = 0), 1500);
  if (taps >= 5) location.href = '/manage.html';
});

/* ---------- form ---------- */
const picker = $('#picker');
for (let i = 1; i <= 4; i++) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'sam';
  b.dataset.n = i;
  b.setAttribute('aria-label', plural(i));
  b.innerHTML = '<svg><use href="#samosa"/></svg><i>' + i + '</i>';
  picker.appendChild(b);
}
function paintQty() {
  $$('.sam', picker).forEach((b) => b.classList.toggle('on', +b.dataset.n <= qty));
  $('#qtyText').textContent = plural(qty);
  updateBill();
}
picker.addEventListener('click', (e) => {
  const b = e.target.closest('.sam');
  if (!b) return;
  qty = +b.dataset.n;
  paintQty();
});

function updateBill() {
  const box = $('#billBox');
  if (!wants) { box.innerHTML = ''; return; }
  box.innerHTML = S.price > 0
    ? 'Aapka bill: <b>' + money(qty * S.price) + '</b> <small>(' + plural(qty) + ' x ' + money(S.price) + ')</small>'
    : '<small>Bill ki raqam admin price set karne ke baad pata chalegi.</small>';
}

$$('.opt').forEach((b) =>
  b.addEventListener('click', () => {
    wants = b.dataset.v === '1';
    $$('.opt').forEach((x) => x.classList.toggle('sel', x === b));
    $('#details').classList.remove('hidden');
    $('#qtyBlock').classList.toggle('hidden', !wants);
    $('#err').textContent = '';
    paintQty();
  })
);

$('#roll').addEventListener('input', (e) => (e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4)));

$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#err');
  err.textContent = '';
  const name = $('#name').value.trim().replace(/\s+/g, ' ');
  const digits = $('#roll').value;
  if (wants === null) return (err.textContent = 'Pehle Haan ya Nahi chuno.');
  if (name.length < 2) return (err.textContent = 'Apna naam likho.');
  if (!/^\d{4}$/.test(digits)) return (err.textContent = 'Roll no ke 4 digits likho (26-Arid-1234).');

  const btn = $('#submitBtn');
  btn.disabled = true;
  btn.textContent = 'Bhej raha hoon...';
  try {
    const r = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, roll_no: PREFIX + digits, wants, qty: wants ? qty : 0 }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Kuch masla hua, dobara try karo.');
    const rec = { name, roll: PREFIX + digits, wants, qty: wants ? qty : 0 };
    try { localStorage.setItem('treat_done', JSON.stringify(rec)); } catch {}
    showDone(rec, true);
  } catch (ex) {
    err.textContent = ex.message;
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Submit karo &#128640;';
  }
});

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showDone(rec, fresh) {
  $('#form').classList.add('hidden');
  $('#done').classList.remove('hidden');
  $('#doneTitle').textContent = fresh ? 'Shukriya! Response mil gaya' : 'Aap pehle hi response de chuke hain';
  const icons = rec.wants ? Array.from({ length: rec.qty }, () => '<svg class="ico lg"><use href="#samosa"/></svg>').join('') : '<span class="big-emoji">&#128591;</span>';
  const bill = rec.wants && S.price > 0 ? '<div class="row"><span>Bill</span><b>' + money(rec.qty * S.price) + '</b></div>' : '';
  $('#ticket').innerHTML =
    '<div class="icons">' + icons + '</div>' +
    '<div class="row"><span>Naam</span><b>' + esc(rec.name) + '</b></div>' +
    '<div class="row"><span>Roll no</span><b>' + esc(rec.roll) + '</b></div>' +
    '<div class="row"><span>Treat</span><b>' + (rec.wants ? plural(rec.qty) : 'Nahi chahiye') + '</b></div>' + bill;
  if (fresh && rec.wants) confetti();
  $('#formWrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('#another').addEventListener('click', () => {
  try { localStorage.removeItem('treat_done'); } catch {}
  location.reload();
});

function confetti() {
  const box = $('#confetti');
  for (let i = 0; i < 26; i++) {
    const s = document.createElement('span');
    s.textContent = ['🥟', '🎉', '✨'][i % 3];
    s.style.left = Math.random() * 100 + 'vw';
    s.style.animationDuration = 2.2 + Math.random() * 2 + 's';
    s.style.animationDelay = Math.random() * 0.6 + 's';
    s.style.fontSize = 18 + Math.random() * 22 + 'px';
    box.appendChild(s);
    setTimeout(() => s.remove(), 5000);
  }
}

/* ---------- start ---------- */
(async () => {
  await loadSettings();
  try {
    const saved = JSON.parse(localStorage.getItem('treat_done') || 'null');
    if (saved && saved.roll) showDone(saved, false);
  } catch {}
})();
