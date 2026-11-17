const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => 'Rs ' + Number(n || 0).toLocaleString('en-PK');
let D = { settings: {}, responses: [] };

async function api(path, opts = {}) {
  const r = await fetch('/api/' + path, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    ...opts,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(d.error || 'Kuch masla hua');
    e.status = r.status;
    throw e;
  }
  return d;
}

/* ---------- login ---------- */
async function showLogin() {
  $('#dash').classList.add('hidden');
  $('#logout').classList.add('hidden');
  $('#loginBox').classList.remove('hidden');
  try {
    const s = await api('admin/status');
    $('#firstNote').textContent = s.needsSetup
      ? 'Pehli dafa login: ID likho aur jo password abhi likho ge wahi hamesha ke liye set ho jaye ga.'
      : '';
  } catch {}
}

$('#loginBtn').addEventListener('click', doLogin);
$('#apw').addEventListener('keydown', (e) => e.key === 'Enter' && doLogin());
async function doLogin() {
  $('#loginErr').textContent = '';
  try {
    await api('admin/login', { method: 'POST', body: JSON.stringify({ id: $('#aid').value, password: $('#apw').value }) });
    $('#apw').value = '';
    await loadDash();
  } catch (e) {
    $('#loginErr').textContent = e.message;
  }
}
$('#logout').addEventListener('click', async () => {
  await api('admin/logout', { method: 'POST', body: '{}' }).catch(() => {});
  showLogin();
});

/* ---------- dashboard ---------- */
async function loadDash() {
  try {
    D = await api('admin/data');
  } catch (e) {
    if (e.status === 401) return showLogin();
    return alert(e.message);
  }
  $('#loginBox').classList.add('hidden');
  $('#dash').classList.remove('hidden');
  $('#logout').classList.remove('hidden');
  const s = D.settings;
  $('#price').value = s.price ?? 0;
  $('#stitle').value = s.title || '';
  $('#sdesc').value = s.description || '';
  $('#sopen').checked = s.is_open !== false;
  render();
}

const price = () => Math.max(0, Number($('#price').value) || 0);

function animateTo(el, to) {
  const from = Number(el.dataset.v || 0);
  el.dataset.v = to;
  const t0 = performance.now();
  (function step(now) {
    const p = Math.min((now - t0) / 500, 1);
    el.textContent = Math.round(from + (to - from) * p).toLocaleString('en-PK');
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}

function render() {
  const p = price();
  const all = D.responses;
  const yes = all.filter((r) => r.wants);
  const sam = yes.reduce((a, r) => a + r.qty, 0);
  const stats = { people: all.length, yes: yes.length, no: all.length - yes.length, sam, bill: sam * p };
  document.querySelectorAll('.stat .n').forEach((el) => animateTo(el, stats[el.dataset.k]));

  const q = $('#search').value.trim().toLowerCase();
  const list = all.filter((r) => !q || r.name.toLowerCase().includes(q) || r.roll_no.toLowerCase().includes(q));
  $('#rows').innerHTML =
    list
      .map((r, i) => {
        const icons = r.wants ? '<span class="mini">' + '<svg><use href="#samosa"/></svg>'.repeat(r.qty) + '</span> ' : '';
        return (
          '<tr><td>' + (i + 1) + '</td><td>' + esc(r.roll_no) + '</td><td>' + esc(r.name) + '</td>' +
          '<td><span class="pill ' + (r.wants ? 'y' : 'n') + '">' + (r.wants ? 'Haan' : 'Nahi') + '</span></td>' +
          '<td>' + icons + r.qty + '</td><td>' + (r.wants ? money(r.qty * p) : '-') + '</td>' +
          '<td class="no-print"><button class="btn del" data-id="' + r.id + '">Delete</button></td></tr>'
        );
      })
      .join('') || '<tr><td colspan="7" class="muted">Abhi koi response nahi.</td></tr>';
  $('#tSam').textContent = sam;
  $('#tBill').textContent = money(sam * p);
}

$('#price').addEventListener('input', render);
$('#search').addEventListener('input', render);

$('#rows').addEventListener('click', async (e) => {
  const b = e.target.closest('.del');
  if (!b) return;
  if (!confirm('Is response ko delete karna hai?')) return;
  try {
    await api('admin/delete', { method: 'POST', body: JSON.stringify({ id: +b.dataset.id }) });
    D.responses = D.responses.filter((r) => r.id !== +b.dataset.id);
    render();
  } catch (ex) { alert(ex.message); }
});

$('#saveSettings').addEventListener('click', async () => {
  const m = $('#saveMsg');
  m.style.color = '';
  m.textContent = '';
  try {
    await api('admin/settings', {
      method: 'POST',
      body: JSON.stringify({ price: price(), title: $('#stitle').value, description: $('#sdesc').value, is_open: $('#sopen').checked }),
    });
    m.textContent = 'Save ho gaya ✔';
  } catch (e) {
    m.style.color = 'var(--err)';
    m.textContent = e.message;
  }
});

$('#pwBtn').addEventListener('click', async () => {
  const m = $('#pwMsg');
  m.style.color = '';
  try {
    await api('admin/password', { method: 'POST', body: JSON.stringify({ password: $('#newpw').value }) });
    $('#newpw').value = '';
    m.textContent = 'Password badal gaya ✔';
  } catch (e) {
    m.style.color = 'var(--err)';
    m.textContent = e.message;
  }
});

/* ---------- PDF / print ---------- */
$('#printBtn').addEventListener('click', () => window.print());
$('#pdfBtn').addEventListener('click', () => {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert('PDF library load nahi hui (internet check karo). Print button se "Save as PDF" bhi kar sakte ho.');
    return window.print();
  }
  const p = price();
  const yes = D.responses.filter((r) => r.wants);
  const sam = yes.reduce((a, r) => a + r.qty, 0);
  const doc = new window.jspdf.jsPDF();
  const title = (D.settings.title || 'Samosa Treat') + ' - Bill';
  doc.setFontSize(18);
  doc.text(title, 14, 18);
  doc.setFontSize(10);
  doc.text(
    'Date: ' + new Date().toLocaleDateString('en-GB') + '   |   Price per samosa: Rs ' + p + '   |   Total responses: ' + D.responses.length,
    14, 25
  );
  doc.autoTable({
    startY: 30,
    head: [['#', 'Roll No', 'Name', 'Samosas', 'Bill (Rs)']],
    body: yes.map((r, i) => [i + 1, r.roll_no, r.name, r.qty, r.qty * p]),
    foot: [['', '', 'TOTAL', sam, sam * p]],
    headStyles: { fillColor: [200, 106, 20] },
    footStyles: { fillColor: [255, 240, 210], textColor: 20, fontStyle: 'bold' },
    styles: { fontSize: 10 },
  });
  doc.save('samosa-treat-bill.pdf');
});

/* ---------- start ---------- */
window.addEventListener('DOMContentLoaded', loadDash);
