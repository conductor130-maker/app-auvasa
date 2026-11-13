(function () {
const $ = s => document.querySelector(s);
const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const G = () => (window.gx && window.gx.G) || null;

/* ============ Mis paradas: almacén compartido con «Buses en directo» ============ */
const KEY = 'auvasa_stops2', OLD = 'auvasa_stops_fav', TONES = 12;
const save = a => localStorage.setItem(KEY, JSON.stringify(a));
function load() {
  let a = null; try { a = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) {}
  if (!Array.isArray(a)) {                                   // migrate the first version (plain list of ids)
    let old = []; try { old = JSON.parse(localStorage.getItem(OLD) || '[]'); } catch (_) {}
    a = old.map((id, i) => ({ id: String(id), name: '', c: i % TONES })); save(a);
  }
  return a;
}
const store = {
  list: load, has: id => load().some(s => s.id == id), raw: load,
  toggle(id) {
    const a = load(), i = a.findIndex(s => s.id == id);
    if (i >= 0) a.splice(i, 1);
    else { const used = new Set(a.map(s => s.c)); let c = 0; while (used.has(c) && c < TONES) c++; a.push({ id, name: '', c: c >= TONES ? a.length % TONES : c }); }
    save(a); return i < 0;
  },
  rename(id, name) { const a = load(), s = a.find(x => x.id == id); if (s) { s.name = String(name || '').trim(); save(a); } },
  label(id) { const s = load().find(x => x.id == id), g = G(), st = g && g.stops.get(id); return (s && s.name) || (st && st.n) || id; },
  setRaw(a) { if (Array.isArray(a)) save(a.map((x, i) => typeof x === 'string' ? { id: x, name: '', c: i % TONES } : x)); }
};
window.stopsStore = store;
const tone = c => `hsl(${(210 + c * 30) % 360} 55% 38%)`;

let panelOpen = false, expanded = null;
function renderPanel() {
  const n = load().length, cnt = $('#mp-count'), el = $('#panel-misparadas');
  if (cnt) cnt.textContent = n ? n + (n == 1 ? ' guardada' : ' guardadas') : 'ninguna aún';
  if (!el) return;
  const g = G(), list = load().slice().sort((a, b) => store.label(a.id).localeCompare(store.label(b.id), 'es', { sensitivity: 'base' }));
  if (!list.length) { el.innerHTML = '<p class="mu">Aún no tienes paradas guardadas. En «Buses en directo → Paradas» busca una y pulsa ☆ Guardar parada.</p>'; return; }
  el.innerHTML = list.map(s => {
    const real = g && g.stops.get(s.id), sub = s.name && real ? real.n : '';
    let arr = '';
    if (expanded == s.id) { try { arr = g && window.bx ? window.bx.arrHTML(s.id, 5) : '<p class="mu">Cargando datos…</p>'; } catch (_) { arr = '<p class="mu">Cargando datos…</p>'; } }
    return `<div class="mp-item" style="--t:${tone(s.c)}"><div class="mp-row"><button class="mp-main" data-id="${esc(s.id)}"><b>${esc(store.label(s.id))}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</button><button class="mp-ico" data-ren="${esc(s.id)}" aria-label="Cambiar nombre">✏️</button><button class="mp-ico" data-del="${esc(s.id)}" aria-label="Quitar">🗑️</button></div>${expanded == s.id ? `<div class="mp-arr">${arr}</div>` : ''}</div>`;
  }).join('');
}
window.togglePanelParadas = function () {
  panelOpen = !panelOpen;
  $('#panel-misparadas').classList.toggle('oculto', !panelOpen); $('#btn-misparadas').classList.toggle('abierto', panelOpen);
  if (panelOpen) { if (window.gxInit) window.gxInit(); renderPanel(); }
  if (window.bx) window.bx.live(panelOpen);
  if (window.navActivo) window.navActivo('pantalla-tipos');
};

/* ============ Horarios de hoy ============ */
const dtf = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', weekday: 'short', month: 'numeric' });
function todayInfo() {
  const p = {}; dtf.formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
  return { wd: p.weekday, month: +p.month, text: new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()) };
}
// GTFS service ids look like L1A11_L1A3: line 1, group A, 11 coches (→ «11 coches A» in the book), shift 3
const parseSvc = svc => { const m = /^L([A-Z]\d*|\d+)([A-Z])(\d+)([A-Z]?)_/.exec(svc); return m ? { line: m[1], letter: m[2], n: +m[3] } : null; };
const pair = (a, b) => (a == '18' && b == '19') || (a == '19' && b == '18');   // lines 18 and 19 share one timetable
function pickGroup(c, ti) {
  if (c.length <= 1) return c;
  const sc = x => {
    const t = (x.h.tipoDia || '').toLowerCase(); let s = 0;
    if (t.includes('julio')) s += ti.month == 7 ? 3 : -3; if (t.includes('agosto')) s += ti.month == 8 ? 3 : -3;
    if (t.includes('sábado')) s += ti.wd == 'Sat' ? 2 : -1; if (t.includes('festivo') || t.includes('domingo')) s += ti.wd == 'Sun' ? 2 : -1;
    if (t.includes('laborable')) s += ti.wd != 'Sat' && ti.wd != 'Sun' ? 2 : -1; return s;
  };
  const best = Math.max(...c.map(sc)); return c.filter(x => sc(x) == best);
}
function hoyCompute(lineas, g, svcToday, ti) {
  const byShort = new Map(); g.routes.forEach(r => byShort.set(r.s, r));
  const res = [], sin = [];
  lineas.filter(l => l && l.tipo === 'ordinaria').forEach(l => {
    const r = byShort.get(l.id); if (!r) return;
    const keys = new Map(); let any = false;
    (g.trips.get(r.id) || []).forEach(t => {
      if (!svcToday(t.svc)) return; any = true;
      const p = parseSvc(t.svc); if (p && (p.line == l.id || pair(l.id, p.line))) keys.set(p.n + p.letter, p);
    });
    if (!any) { sin.push(l.id); return; }
    const hs = (l.horarios || []).map((h, i) => ({ h, i })), libre = hs.filter(x => x.h.nombre === 'Horarios');   // lines 13, 17, 23, 26: loose times
    const groups = [], seen = new Set(), add = (name, x) => { if (!seen.has(x.i)) { seen.add(x.i); groups.push({ name, idx: x.i, tipoDia: x.h.tipoDia || '' }); } };
    keys.forEach(p => {
      const name = p.n + (p.n == 1 ? ' coche ' : ' coches ') + p.letter; let c = hs.filter(x => x.h.nombre === name);
      if (!c.length) c = libre;
      if (!c.length) groups.push({ name, idx: -1, tipoDia: '' }); else pickGroup(c, ti).forEach(x => add(x.h.nombre, x));
    });
    if (!groups.length && libre.length) pickGroup(libre, ti).forEach(x => add(x.h.nombre, x));
    if (!groups.length) groups.push({ name: 'Horario sin identificar', idx: -1, tipoDia: '' });
    res.push({ l, groups });
  });
  return { res, sin };
}
// First and last day the loaded GTFS has service for (YYYYMMDD)
function gtfsRange(g) {
  let lo = '99999999', hi = '00000000';
  g.exc.forEach(m => m.forEach((_, d) => { if (d < lo) lo = d; if (d > hi) hi = d; }));
  g.cal.forEach(c => { if (c.s < lo) lo = c.s; if (c.e > hi) hi = c.e; });
  return hi >= lo ? [lo, hi] : null;
}
const fmtD = d => d.slice(6, 8) + '/' + d.slice(4, 6) + '/' + d.slice(0, 4);
function renderHoy() {
  const box = $('#hoy-lista'); if (!box) return;
  $('#hoy-fecha').textContent = todayInfo().text;
  if (!G() || !window.bx) { box.innerHTML = '<p class="mu">Cargando el GTFS…</p>'; return; }
  const rg = gtfsRange(G()), p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date()).replace(/-/g, '');
  if (rg && (p < rg[0] || p > rg[1])) { box.innerHTML = `<p class="arch-nota">El GTFS cargado solo cubre del <b>${fmtD(rg[0])}</b> al <b>${fmtD(rg[1])}</b>, así que no puedo saber qué horario toca hoy. Sube un GTFS nuevo (<code>gtfs.zip</code>) al repositorio.</p>`; return; }
  const { res, sin } = hoyCompute(DATOS.lineas, G(), window.bx.svcToday, todayInfo());
  box.innerHTML = (res.map(x => `<div class="hoy-linea"><span class="hoy-num">${esc(x.l.id)}</span><div class="hoy-det"><div class="hoy-nom">${esc(x.l.nombre)}</div><div class="hoy-chips">${x.groups.map(g => g.idx >= 0 ? `<button class="hoy-chip" data-l="${esc(x.l.id)}" data-i="${g.idx}">${esc(g.name)}<small>${esc(g.tipoDia)}</small></button>` : `<span class="hoy-chip off">${esc(g.name)}<small>no está en el libro</small></span>`).join('')}</div></div></div>`).join('') || '<p class="mu">Hoy no hay líneas con servicio según el GTFS cargado.</p>')
    + (sin.length ? `<p class="mu hoy-sin">Sin servicio hoy: ${sin.map(esc).join(', ')}</p>` : '');
}
window.hoyInit = () => { if (window.gxInit) window.gxInit(); renderHoy(); };
window.abrirHoy = (lid, i) => { const l = DATOS.lineas.find(x => x.id === lid); if (!l) return; lineaActual = l; listaGruposFiltrada = l.horarios; abrirGrupo(+i); };

/* ============ Archivos ============ */
const FILES = [
  ['horarios_ordinarias.json', 'Líneas ordinarias'], ['horarios_madrugada.json', 'Madrugada y polígonos'], ['horarios_buho.json', 'Búhos'],
  ['horarios_futbol.json', 'Fútbol'], ['horarios_lanzaderas.json', 'Lanzaderas y universidad'], ['horarios_personal.json', 'Coches de personal'],
  ['libro_horarios.pdf', 'Libro de horarios (PDF)'], ['gtfs.zip', 'GTFS: paradas, trazados y viajes'], ['manual.md', 'Texto de Manuales y Normativa'],
  ['index.html', 'Estructura de la app'], ['styles.css', 'Estilos originales'], ['app.css', 'Diseño nuevo'], ['gtfs.css', 'Estilos de horarios públicos'], ['buses.css', 'Estilos de buses en directo'],
  ['main.js', 'Lógica principal'], ['gtfs.js', 'Horarios públicos (GTFS)'], ['buses.js', 'Buses en directo'], ['extras.js', 'Mis paradas, hoy, archivos y manual'],
  ['sw.js', 'Funcionamiento sin conexión'], ['manifest.json', 'Instalación como app'], ['icon-192.png', 'Icono'], ['icon-512.png', 'Icono grande']
];
const dbp = () => new Promise((ok, ko) => { const r = indexedDB.open('auvasa-files', 1); r.onupgradeneeded = () => r.result.createObjectStore('f', { keyPath: 'name' }); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
const tx = async (mode, fn) => { const db = await dbp(); return new Promise((ok, ko) => { const t = db.transaction('f', mode), rq = fn(t.objectStore('f')); t.oncomplete = () => ok(rq && rq.result); t.onerror = () => ko(t.error); }); };
const kb = n => n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
async function renderMis() {
  const el = $('#arch-mis'); if (!el) return;
  let list = []; try { list = (await tx('readonly', s => s.getAll())) || []; } catch (_) { el.innerHTML = '<p class="mu">Este navegador no permite guardar archivos aquí.</p>'; return; }
  el.innerHTML = list.length ? list.sort((a, b) => a.name.localeCompare(b.name, 'es')).map(f => `<div class="arch-item"><div><b>${esc(f.name)}</b><small>${kb(f.size)} · ${new Date(f.date).toLocaleDateString('es')}</small></div><button data-dl="${esc(f.name)}">⬇</button><button data-rm="${esc(f.name)}">🗑️</button></div>`).join('') : '<p class="mu">Todavía no has guardado ningún archivo.</p>';
}
function renderArch() {
  const el = $('#arch-app'); if (!el) return;
  el.innerHTML = FILES.map(([f, d]) => `<div class="arch-item"><div><b>${esc(f)}</b><small>${esc(d)}</small></div><a href="${esc(f)}" target="_blank" rel="noopener">Abrir</a><a href="${esc(f)}" download>⬇</a></div>`).join('');
  renderMis();
}
window.archInit = renderArch;

/* ============ Manuales y normativa: texto con formato ============ */
function inline(s) {
  return String(s).split('`').map((seg, i) => {
    if (i % 2) return '<code>' + esc(seg) + '</code>';
    let t = esc(seg);
    t = t.replace(/\{(rojo|azul|verde|naranja|morado|gris)\}([\s\S]*?)\{\/\}/g, '<span class="c-$1">$2</span>');
    t = t.replace(/\{fondo-(amarillo|rojo|verde|azul|gris)\}([\s\S]*?)\{\/\}/g, '<span class="f-$1">$2</span>');
    t = t.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
    t = t.replace(/__([^_]+?)__/g, '<u>$1</u>').replace(/==([^=]+?)==/g, '<mark>$1</mark>');
    return t.replace(/\[([^\]]+)\]\((https?:[^)\s]+|[\w./#-]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }).join('');
}
function mdTable(rows) {
  const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  let body = rows.slice(1); if (body.length && /^[\s|:-]+$/.test(body[0])) body = body.slice(1);
  return '<div class="md-tbl"><table><thead><tr>' + cells(rows[0]).map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' +
    body.map(r => '<tr>' + cells(r).map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
}
function md2html(md) {
  const L = String(md).replace(/\r/g, '').split('\n'); let h = '', i = 0, list = null, para = [], quote = [];
  const flush = () => { if (para.length) { h += '<p>' + inline(para.join(' ')) + '</p>'; para = []; } if (quote.length) { h += '<div class="md-nota">' + quote.map(inline).join('<br>') + '</div>'; quote = []; } };
  const endList = () => { if (list) { h += '</' + list + '>'; list = null; } };
  while (i < L.length) {
    const t = L[i++].trim(); let m;
    if (!t) { flush(); endList(); continue; }
    if (/^\|.*\|$/.test(t)) { flush(); endList(); const rows = [t]; while (i < L.length && /^\|.*\|$/.test(L[i].trim())) rows.push(L[i++].trim()); h += mdTable(rows); continue; }
    if ((m = /^(#{1,4})\s+(.*)$/.exec(t))) { flush(); endList(); h += `<h${m[1].length} class="md-h${m[1].length}">${inline(m[2])}</h${m[1].length}>`; continue; }
    if (/^-{3,}$/.test(t)) { flush(); endList(); h += '<hr>'; continue; }
    if ((m = /^>\s?(.*)$/.exec(t))) { if (para.length) flush(); endList(); quote.push(m[1]); continue; }
    if ((m = /^[-*•]\s+(.*)$/.exec(t))) { flush(); if (list !== 'ul') { endList(); h += '<ul>'; list = 'ul'; } h += '<li>' + inline(m[1]) + '</li>'; continue; }
    if ((m = /^\d+[.)]\s+(.*)$/.exec(t))) { flush(); if (list !== 'ol') { endList(); h += '<ol>'; list = 'ol'; } h += '<li>' + inline(m[1]) + '</li>'; continue; }
    if (quote.length) flush(); endList(); para.push(t);
  }
  flush(); endList(); return h;
}
function sections(md) {
  const out = []; let cur = { title: 'Introducción', lines: [], intro: true };
  String(md).replace(/\r/g, '').split('\n').forEach(l => { const m = /^#\s+(.*)$/.exec(l); if (m) { out.push(cur); cur = { title: m[1].trim(), lines: [] }; } else cur.lines.push(l); });
  out.push(cur); return out.filter(s => !(s.intro && !s.lines.join('').trim()));
}
let manualSecs = [];
async function manualText() {
  const ov = localStorage.getItem('auvasa_manual_md'); if (ov != null) return ov;
  try { const r = await fetch('manual.md', { cache: 'no-cache' }); if (r.ok) return await r.text(); } catch (_) {}
  return '# Manual\n\nNo se ha podido cargar manual.md. Comprueba que está subido al repositorio.';
}
window.manualAbrir = async function () {
  irA('pantalla-manual'); $('#manual-editor').classList.add('oculto');
  manualSecs = sections(await manualText());
  $('#lista-manual').innerHTML = manualSecs.map((s, i) => `<button class="btn-manual" data-i="${i}">📄 ${esc(s.title)}</button>`).join('') || '<p class="mu">El manual está vacío.</p>';
  $('#contenido-manual').innerHTML = '<p class="mu">Selecciona una sección.</p>';
};
const ACT = {   // toolbar: text before / after the selection, or a prefix for the line
  b: ['**', '**'], i: ['*', '*'], u: ['__', '__'], mark: ['==', '=='], 'c-rojo': ['{rojo}', '{/}'], 'c-azul': ['{azul}', '{/}'], 'c-verde': ['{verde}', '{/}'],
  'c-naranja': ['{naranja}', '{/}'], 'c-morado': ['{morado}', '{/}'], 'c-gris': ['{gris}', '{/}'], 'f-amarillo': ['{fondo-amarillo}', '{/}']
};
const PREFIX = { h1: '# ', h2: '## ', h3: '### ', ul: '- ', ol: '1. ', nota: '> ' };
function toolbar(a) {
  const t = $('#me-txt'), s = t.selectionStart, e = t.selectionEnd, v = t.value, sel = v.slice(s, e);
  let ins, ns, ne;
  if (ACT[a]) { const x = sel || 'texto'; ins = ACT[a][0] + x + ACT[a][1]; ns = s + ACT[a][0].length; ne = ns + x.length; }
  else if (PREFIX[a]) { const ls = v.lastIndexOf('\n', s - 1) + 1; t.value = v.slice(0, ls) + PREFIX[a] + v.slice(ls); t.selectionStart = t.selectionEnd = s + PREFIX[a].length; t.focus(); prev(); return; }
  else if (a === 'hr') { ins = '\n---\n'; ns = ne = s + ins.length; }
  else if (a === 'tabla') { ins = '\n| Columna 1 | Columna 2 |\n|---|---|\n| dato | dato |\n'; ns = ne = s + ins.length; }
  else return;
  t.value = v.slice(0, s) + ins + v.slice(e); t.selectionStart = ns; t.selectionEnd = ne; t.focus(); prev();
}
const prev = () => { $('#me-prev').innerHTML = md2html($('#me-txt').value); };
window.manualEditar = async function () {
  const ed = $('#manual-editor'); ed.classList.remove('oculto'); $('#me-txt').value = await manualText(); prev(); ed.scrollIntoView({ behavior: 'smooth' });
};
window.__md = { md2html, sections, inline };

/* ============ Navegación inferior y pantalla de inicio ============ */
window.navActivo = id => {
  document.querySelectorAll('#navbar button').forEach(b => b.classList.toggle('activo', b.dataset.go === id || (b.dataset.go === 'mis-paradas' && id === 'pantalla-tipos' && panelOpen)));
  if (window.bx) window.bx.live(id === 'pantalla-tipos' && panelOpen);
};
function init() {
  const f = $('#hero-fecha'); if (f) f.textContent = todayInfo().text;
  renderPanel();
  const mp = $('#panel-misparadas');
  if (mp) mp.addEventListener('click', e => {
    const m = e.target.closest('.mp-main'), r = e.target.closest('[data-ren]'), d = e.target.closest('[data-del]');
    if (m) { expanded = expanded == m.dataset.id ? null : m.dataset.id; renderPanel(); }
    else if (r) { const id = r.dataset.ren, n = prompt('Nombre para esta parada (déjalo vacío para usar el original):', (load().find(s => s.id == id) || {}).name || ''); if (n !== null) { store.rename(id, n); renderPanel(); } }
    else if (d) { if (confirm('¿Quitar esta parada de Mis paradas?')) { store.toggle(d.dataset.del); if (expanded == d.dataset.del) expanded = null; renderPanel(); } }
  });
  document.querySelectorAll('#navbar button').forEach(b => b.onclick = () => {
    const go = b.dataset.go;
    if (go === 'mis-paradas') { irA('pantalla-tipos'); if (!panelOpen) window.togglePanelParadas(); const bt = $('#btn-misparadas'); if (bt) bt.scrollIntoView({ block: 'start' }); }
    else if (go === 'pantalla-favoritos') { renderFavoritos(); irA(go); } else irA(go);
  });
  const hl = $('#hoy-lista'); if (hl) hl.addEventListener('click', e => { const c = e.target.closest('.hoy-chip[data-l]'); if (c) window.abrirHoy(c.dataset.l, c.dataset.i); });
  const am = $('#arch-mis'); if (am) am.addEventListener('click', async e => {
    const dl = e.target.closest('[data-dl]'), rm = e.target.closest('[data-rm]');
    if (dl) { const f = await tx('readonly', s => s.get(dl.dataset.dl)); if (f) { const a = document.createElement('a'); a.href = URL.createObjectURL(f.blob); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); } }
    if (rm && confirm('¿Eliminar «' + rm.dataset.rm + '» de este dispositivo?')) { await tx('readwrite', s => s.delete(rm.dataset.rm)); renderMis(); }
  });
  const af = $('#arch-add'); if (af) af.onchange = async e => { for (const f of e.target.files) await tx('readwrite', s => s.put({ name: f.name, type: f.type, size: f.size, date: Date.now(), blob: f })); e.target.value = ''; renderMis(); };
  const lm = $('#lista-manual'); if (lm) lm.addEventListener('click', e => {
    const b = e.target.closest('.btn-manual'); if (!b) return; const s = manualSecs[+b.dataset.i]; if (!s) return;
    lm.querySelectorAll('.btn-manual').forEach(x => x.classList.toggle('sel', x === b));
    const c = $('#contenido-manual'); c.innerHTML = `<h2 class="md-h1">${inline(s.title)}</h2>` + md2html(s.lines.join('\n')); c.scrollIntoView({ behavior: 'smooth' });
  });
  const bar = $('#me-barra'); if (bar) bar.addEventListener('click', e => { const b = e.target.closest('button[data-a]'); if (b) toolbar(b.dataset.a); });
  const tx2 = $('#me-txt'); if (tx2) tx2.addEventListener('input', prev);
  const q = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  q('#me-guardar', () => { localStorage.setItem('auvasa_manual_md', $('#me-txt').value); alert('Guardado en este dispositivo.'); window.manualAbrir(); });
  q('#me-bajar', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([$('#me-txt').value], { type: 'text/markdown' })); a.download = 'manual.md'; document.body.appendChild(a); a.click(); a.remove(); });
  q('#me-reset', () => { if (confirm('¿Descartar lo guardado en este dispositivo y usar el manual.md del repositorio?')) { localStorage.removeItem('auvasa_manual_md'); window.manualAbrir(); } });
  q('#me-cerrar', () => $('#manual-editor').classList.add('oculto'));
  if (window.gx) window.gx.sub(k => {
    if (k === 'static' || k === 'rt') {
      if (panelOpen) renderPanel();
      const h = document.getElementById('pantalla-hoy'); if (k === 'static' && h && h.classList.contains('activa')) renderHoy();
    }
  });
}
window.__extras = { hoyCompute, parseSvc, pickGroup, store, gtfsRange };
if (typeof document !== 'undefined' && document.getElementById('pantalla-tipos')) init();
})();
