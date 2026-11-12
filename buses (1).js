(function () {
const K = Math.PI / 180, KX = Math.cos(41.65 * K) * 111320, KY = 110540;
const xy = (la, lo) => [lo * KX, la * KY];
const gx = () => window.gx;
const $ = s => document.querySelector(s);
const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const S = { tab: 'm', route: '', map: null, mk: new Map(), lines: null, layer: null, cache: new Map(), last: new Map(), posR: null, pos: null, ns: null, init: 0, shellFor: null, tg: null, tidx: null };
const OCC = { 0: ['Vacío', 5], 1: ['Muchos asientos libres', 25], 2: ['Pocos asientos libres', 50], 3: ['Solo de pie', 75], 4: ['Muy lleno', 90], 5: ['Completo', 100], 6: ['No admite viajeros', 100] };
const occ = o => {
  const v = OCC[o]; if (!v) return '<span class="mu">Sin datos</span>';
  const c = v[1] < 40 ? '#2e9e3e' : v[1] < 70 ? '#e6a100' : '#d33';
  return `<span class="bx-occ" title="${v[0]}"><i style="width:${v[1]}%;background:${c}"></i></span> <small>${v[0]}</small>`;
};

/* ---------- geometry ---------- */
function prep(poly) {
  const P = poly.map(p => xy(p[0], p[1])), cd = [0];
  for (let i = 1; i < P.length; i++) cd[i] = cd[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  return { P, cd };
}
// Position (metres along the polyline) of the point nearest to (la,lo). mode 'first': first pass among near-equal candidates; 'near': the nearest one
function along(sh, la, lo, mn, mx, mode) {
  if (sh.P.length < 2) return { off: 0, d: 0 };
  const q = xy(la, lo), all = [];
  for (let i = 0; i < sh.P.length - 1; i++) {
    const a = sh.P[i], b = sh.P[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    let t = l2 ? ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    all.push({ off: Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy), d: sh.cd[i] + t * Math.sqrt(l2) });
  }
  let c = all.filter(x => x.d >= mn && x.d <= mx); if (!c.length) c = all;
  let m = Infinity; c.forEach(x => { if (x.off < m) m = x.off; });
  if (mode === 'near') return c.find(x => x.off === m);
  return c.filter(x => x.off <= m + 25).reduce((p, x) => (x.d < p.d ? x : p));
}

/* ---------- static data: one representative pattern per direction ---------- */
function tripOf(id) {
  const G = gx().G;
  if (!S.tidx || S.tg !== G) { S.tg = G; S.tidx = new Map(); G.trips.forEach(a => a.forEach(t => S.tidx.set(t.id, t))); }
  return S.tidx.get(id);
}
function reps(rid) {
  if (S.cache.has(rid)) return S.cache.get(rid);
  const G = gx().G, gr = new Map();
  (G.trips.get(rid) || []).forEach(t => { const k = t.dir !== '' ? t.dir : t.h; if (!gr.has(k)) gr.set(k, []); gr.get(k).push(t); });
  const out = [...gr.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 2).map(([k, ts]) => {
    let best = null, n = -1; ts.forEach(t => { const l = (G.st.get(t.id) || []).length; if (l > n) { n = l; best = t; } });
    const st = (G.st.get(best.id) || []).map(x => { const s = G.stops.get(x[0]) || {}; return { id: x[0], n: s.n || x[0], lat: s.lat, lon: s.lon }; }).filter(s => isFinite(s.lat) && isFinite(s.lon));
    if (st.length < 2) return null;
    const poly = (best.shp && G.shp && G.shp.get(best.shp)) || st.map(s => [s.lat, s.lon]);
    const sh = prep(poly); let prev = -Infinity;
    const sd = st.map(s => { const a = along(sh, s.lat, s.lon, prev - 30, Infinity, 'first'); prev = Math.max(prev, a.d); return prev; });
    const cnt = {}; ts.forEach(t => { cnt[t.h] = (cnt[t.h] || 0) + 1; });
    const head = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
    return { k, head, st, sh, sd, poly };
  }).filter(Boolean).sort((a, b) => String(a.k).localeCompare(String(b.k)));
  S.cache.set(rid, out); return out;
}

/* ---------- live data: where is each bus ---------- */
const routeOf = v => v.route || (tripOf(v.trip) || {}).rt || '';
function nextSeq() { const m = new Map(), R = gx().R; ((R && R.tu) || []).forEach(t => { if (t.sts[0] && t.sts[0].seq != null) m.set(t.trip, t.sts[0].seq); }); return m; }
// The feed lists predictions for SOME upcoming stops, so its first one is only an upper bound for the bus' progress
function hint(v, rp, ns) {
  const sq = ns.get(v.trip); if (sq == null) return -1;
  const arr = gx().G.st.get(v.trip) || [], j = arr.findIndex(y => y[3] == sq); if (j < 0) return -1;
  if (arr.length == rp.st.length && arr[j][0] == rp.st[j].id) return j;
  return rp.st.findIndex(s => s.id == arr[j][0]);
}
const dAt = (rp, i) => { const a = Math.max(0, Math.min(rp.sd.length - 2, Math.floor(i))); return rp.sd[a] + (i - a) * (rp.sd[a + 1] - rp.sd[a]); };
function place(v, rp, ns, prevIdx) {
  let mn = -Infinity, mx = Infinity;
  if (prevIdx >= 0) { const d = dAt(rp, prevIdx); mn = d - 80; mx = d + 1500; }   // continuity with the previous update (loops, U-turns)
  else { const k = hint(v, rp, ns); if (k >= 0) mx = rp.sd[k] + 40; }
  // use the window only when it agrees with the real position (otherwise stale hints or big jumps would mislead)
  const g = along(rp.sh, v.lat, v.lon, -Infinity, Infinity, 'near');
  const w = (mn > -Infinity || mx < Infinity) ? along(rp.sh, v.lat, v.lon, mn, mx, 'near') : g, a = w.off <= g.off + 30 ? w : g; let i = 0;
  while (i < rp.sd.length - 2 && rp.sd[i + 1] <= a.d) i++;
  const sp = Math.max(1, rp.sd[i + 1] - rp.sd[i]);
  return { idx: Math.max(0, Math.min(rp.sd.length - 1, i + (a.d - rp.sd[i]) / sp)), off: a.off };
}
// Position of a bus on its line, computed once per update
function track(v) {
  const R = gx().R;
  if (S.posR !== R) { S.posR = R; S.pos = new Map(); S.ns = nextSeq(); }
  const key = v.num || v.plate || v.trip; if (S.pos.has(key)) return S.pos.get(key);
  const rps = reps(routeOf(v)); let res = null;
  if (rps.length) {
    let cand = rps; const T = tripOf(v.trip);
    if (T) { const k = T.dir !== '' ? T.dir : T.h, m = rps.filter(r => r.k == k); if (m.length) cand = m; }
    const pv = S.last.get(key); let best = null;
    cand.forEach(rp => {
      const p = place(v, rp, S.ns, pv && pv.trip == v.trip && pv.k == rp.k ? pv.idx : -1);
      if (!best || p.off < best.off) best = { rp, idx: p.idx, off: p.off, k: rp.k };
    });
    res = best; if (best) S.last.set(key, { trip: v.trip, k: best.k, idx: best.idx });
  }
  S.pos.set(key, res); return res;
}
function busesOf(rid) {
  const R = gx().R; if (!R) return [];
  return R.veh.filter(v => routeOf(v) == rid && isFinite(v.lat)).map(v => { const t = track(v); return t ? { v, k: t.k, idx: t.idx, off: t.off } : null; }).filter(Boolean);
}

/* ---------- next stop ---------- */
const hhmm = t => new Date(t * 1000).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
function nextStop(v) {
  const G = gx().G, R = gx().R, t = track(v); if (!t) return null;
  const rp = t.rp, j = Math.min(rp.st.length - 1, Math.floor(t.idx) + 1);
  const arr = G.st.get(v.trip) || [], tu = ((R && R.tu) || []).find(x => x.trip == v.trip);
  let eta = 0, prev = null;
  if (tu) {
    if (arr.length == rp.st.length && arr[j] && arr[j][0] == rp.st[j].id) { const e = tu.sts.find(s => s.seq == arr[j][3]); if (e) eta = e.t; }
    const f = tu.sts[0];
    if (!eta && f && f.t) { const x = arr.find(y => y[3] == f.seq), st = x && G.stops.get(x[0]); prev = { name: (st && st.n) || '', t: f.t }; }
  }
  return { name: rp.st[j].n, t: eta, prev };
}
function eta(t, v) {
  if (!t) return '';
  const m = Math.round((t - Date.now() / 1000) / 60);
  if (Date.now() / 1000 - (v.ts || 0) > 120) return ` (${hhmm(t)})`;
  return m <= 0 ? ` (llegando, ${hhmm(t)})` : ` (en ${m} min, ${hhmm(t)})`;
}

/* ---------- popups ---------- */
function pop(v) {
  const G = gx().G, r = G.routes.find(x => x.id == routeOf(v)), T = tripOf(v.trip) || {};
  const ns = nextStop(v), s = Math.max(0, Math.round(Date.now() / 1000 - (v.ts || 0)));
  const ago = !v.ts ? '–' : s < 10 ? 'ahora mismo' : s < 90 ? `hace ${s} s` : s < 5400 ? `hace ${Math.round(s / 60)} min` : `hace ${Math.round(s / 3600)} h`;
  return `<div class="bx-pi"><div>${r ? gx().badge(r) : ''} <b>${esc(T.h || '')}</b></div><div><b>Bus ${esc(v.num || '?')}</b>: ${esc(v.plate || '')}</div><div><b>Actualizado</b>: ${ago}</div><div><b>Ocupación</b>: ${occ(v.occ)}</div>${ns ? `<div><b>Próxima parada</b>: ${esc(ns.name)}${eta(ns.t, v)}</div>${ns.prev && !ns.t ? `<div class="mu"><small>Previsión en ${esc(ns.prev.name)}: ${hhmm(ns.prev.t)}</small></div>` : ''}` : ''}</div>`;
}

/* ---------- map ---------- */
function loadLeaflet() {
  return window.L ? Promise.resolve() : new Promise((ok, ko) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.crossOrigin = 'anonymous';
    l.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(l);
    const s = document.createElement('script'); s.crossOrigin = 'anonymous';
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload = ok;
    s.onerror = () => ko(new Error('No se pudo cargar el mapa (¿sin conexión?)')); document.head.appendChild(s);
  });
}
const rcolor = r => (r.bg ? '#' + r.bg : '#0a6e5c');
async function mountMap() {
  const box = $('#bx-map'); if (!box) return;
  try { await loadLeaflet(); } catch (e) { box.innerHTML = '<p>' + esc(e.message) + '</p>'; return; }
  if (S.map) { S.map.remove(); S.map = null; }
  S.map = L.map(box, { preferCanvas: true }).setView([41.652, -4.724], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(S.map);
  S.lines = L.layerGroup().addTo(S.map); S.layer = L.layerGroup().addTo(S.map); S.mk = new Map();
  drawLines(); updateMap();
}
function drawLines() {
  const G = gx().G, seen = new Set(); S.lines.clearLayers();
  G.routes.forEach(r => {
    if (S.route && S.route != r.id) return;
    let any = false;
    (G.trips.get(r.id) || []).forEach(t => {
      if (!t.shp || seen.has(t.shp)) return; const p = G.shp && G.shp.get(t.shp); if (!p) return;
      seen.add(t.shp); any = true; L.polyline(p, { color: rcolor(r), weight: 3, opacity: 0.7 }).addTo(S.lines);
    });
    if (!any) reps(r.id).forEach(rp => L.polyline(rp.poly, { color: rcolor(r), weight: 3, opacity: 0.7 }).addTo(S.lines));
  });
}
function updateMap() {
  if (!S.map) return; const G = gx().G, R = gx().R, keep = new Set();
  ((R && R.veh) || []).forEach(v => {
    const rid = routeOf(v); if ((S.route && S.route != rid) || !isFinite(v.lat)) return;
    const r = G.routes.find(x => x.id == rid), key = v.num || v.plate || v.trip; keep.add(key);
    const mkIcon = () => L.divIcon({ className: 'bx-ico', iconSize: [0, 0], html: `<div class="bx-b">${r ? gx().badge(r) : '<span class="badge">?</span>'}</div>` });
    let m = S.mk.get(key);
    if (m) { m.setLatLng([v.lat, v.lon]); if (m._rid !== rid) { m.setIcon(mkIcon()); m._rid = rid; } m.setPopupContent(pop(v)); }
    else { m = L.marker([v.lat, v.lon], { icon: mkIcon() }).bindPopup(pop(v)).addTo(S.layer); m._rid = rid; S.mk.set(key, m); }
  });
  S.mk.forEach((m, k) => { if (!keep.has(k)) { S.layer.removeLayer(m); S.mk.delete(k); } });
}

/* ---------- vertical diagrams ---------- */
const H = 34;
function lineal() {
  const G = gx().G, box = $('#bx-view'); if (!box) return;
  const r = G.routes.find(x => x.id == S.route);
  if (!r) { box.innerHTML = '<p class="mu">Elige una línea.</p>'; return; }
  const rps = reps(r.id), bs = busesOf(r.id);
  if (!rps.length) { box.innerHTML = '<p>No se han podido construir los recorridos de esta línea con el GTFS cargado.</p>'; return; }
  box.innerHTML = `<div class="bx-lin">${rps.map(rp => `<div class="bx-col"><h3>${esc(rp.head ? 'Hacia ' + rp.head : 'Sentido ' + rp.k)}</h3>
    <div class="bx-rail" style="height:${rp.st.length * H}px;--c:${rcolor(r)}">
    ${rp.st.map((s, i) => `<div class="bx-st" style="top:${i * H}px"><i></i><span>${esc(s.n)}</span></div>`).join('')}
    ${bs.filter(b => b.k == rp.k).map(b => `<button class="bx-bus" data-n="${esc(b.v.num || b.v.plate)}" style="top:${H / 2 + b.idx * H}px" aria-label="Bus ${esc(b.v.num)}">${gx().badge(r)}</button>`).join('')}
    </div></div>`).join('')}</div><div id="bx-pop" class="bx-pop oculto"></div>`;
  const open = n => {
    const v = bs.map(x => x.v).find(x => (x.num || x.plate) == n), p = $('#bx-pop'); if (!v) { S.sel = null; return; }
    S.sel = n; p.innerHTML = pop(v) + '<button class="ghost" id="bx-x">Cerrar</button>'; p.classList.remove('oculto');
    $('#bx-x').onclick = () => { S.sel = null; p.classList.add('oculto'); };
  };
  box.querySelectorAll('.bx-bus').forEach(b => b.onclick = () => open(b.dataset.n));
  if (S.sel) open(S.sel);
}

/* ---------- screen ---------- */
const autoOn = () => localStorage.getItem('auvasa_rt_auto') !== '0';
const active = () => { const e = document.getElementById('pantalla-buses'); return e && e.classList.contains('activa'); };
function stat() {
  const R = gx().R, el = $('#bx-st'); if (!el) return;
  el.textContent = R && R.veh ? `Datos de las ${R.ts ? new Date(R.ts * 1000).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '–'} · ${R.veh.length} buses${autoOn() && (localStorage.getItem('auvasa_rt_base') || '').trim() ? ' · se actualiza cada ' + secs() + ' s' : ''}${S.fetched ? ' · consultado a las ' + new Date(S.fetched).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}` : 'Datos en directo: aún sin cargar';
}
const secs = () => Math.max(2, +(localStorage.getItem('auvasa_rt_secs') || 5));
async function live() {
  const b = (localStorage.getItem('auvasa_rt_base') || '').trim(); if (!b || S.busy) return;
  const get = n => fetch(b + (b.includes('?') ? '&' : '?') + 'f=' + n + '&t=' + Date.now(), { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); });
  S.busy = 1; S.n = (S.n || 0) + 1;
  const withAl = S.n % Math.max(1, Math.round(60 / secs())) === 1;     // alerts change rarely: about once a minute
  try {
    const bs = await Promise.all([get('vehicleposition'), get('tripupdate')]); let al = null;
    if (withAl) { try { al = await get('alert'); } catch (_) {} }
    if (al) bs.push(al);
    S.fetched = Date.now(); gx().rt(bs, !al);
  } catch (e) { const el = $('#bx-st'); if (el) el.textContent = 'No se pudo actualizar: ' + e.message; }
  finally { S.busy = 0; }
}
function shell() {
  const el = $('#bx-app'), G = gx() && gx().G;
  if (!G) { el.innerHTML = '<p>Primero carga el GTFS estático en «Red pública y tiempo real».</p>'; return false; }
  if (S.shellFor === G) return true; S.shellFor = G;
  const saved = localStorage.getItem('auvasa_rt_base') || '';
  el.innerHTML = `<div class="bx-bar"><div class="tabs"><button data-t="m">Mapa</button><button data-t="l">Líneas</button></div>
    <select id="bx-r" aria-label="Línea"><option value="">Todas las líneas</option>${G.routes.map(r => `<option value="${esc(r.id)}">${esc(r.s || r.l)} · ${esc(r.l)}</option>`).join('')}</select></div>
    <details class="bx-live"><summary id="bx-st">Datos en directo</summary><div>
    <input id="bx-url" type="text" placeholder="Dirección de tu proxy (…/api/rt)" value="${esc(saved)}">
    <label><input id="bx-auto" type="checkbox" ${autoOn() ? 'checked' : ''}> actualizar solo cada <select id="bx-secs">${[5, 10, 15, 30].map(n => `<option value="${n}"${n == secs() ? ' selected' : ''}>${n}</option>`).join('')}</select> s</label>
    <button id="bx-now">Actualizar</button>
    <label class="btn">Cargar archivos<input id="bx-f" type="file" multiple hidden></label></div></details><div id="bx-view"></div>`;
  const tabs = () => el.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.t == S.tab));
  el.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { S.tab = b.dataset.t; if (S.tab == 'l' && !S.route) pickRoute(); tabs(); view(); });
  $('#bx-r').onchange = e => { S.route = e.target.value; if (S.tab == 'm') { if (S.map) { drawLines(); updateMap(); } } else lineal(); };
  $('#bx-url').onchange = e => localStorage.setItem('auvasa_rt_base', e.target.value.trim());
  $('#bx-secs').onchange = e => { localStorage.setItem('auvasa_rt_secs', e.target.value); stat(); };
  $('#bx-auto').onchange = e => localStorage.setItem('auvasa_rt_auto', e.target.checked ? '1' : '0');
  $('#bx-now').onclick = live;
  $('#bx-f').onchange = async e => { const fs = [...e.target.files]; if (fs.length) gx().rt(await Promise.all(fs.map(f => f.arrayBuffer()))); e.target.value = ''; };
  tabs(); return true;
}
function pickRoute() {
  const G = gx().G, R = gx().R, withBus = R && R.veh ? new Set(R.veh.map(routeOf)) : new Set();
  const r = G.routes.find(x => withBus.has(x.id)) || G.routes[0]; S.route = r ? r.id : ''; const sel = $('#bx-r'); if (sel) sel.value = S.route;
}
function view() {
  const v = $('#bx-view'); if (!v) return;
  if (S.tab == 'm') { v.innerHTML = '<div id="bx-map"></div>'; S.map = null; mountMap(); } else lineal();
}
function refresh(k) {
  if (!shell()) return; stat();
  if (k == 'rt') { S.tab == 'm' ? updateMap() : lineal(); } else view();
}
window.bxInit = () => {
  if (!window.gx) return;
  if (!S.init) {
    S.init = 1;
    gx().sub(k => { if (k == 'static') { S.cache.clear(); S.last.clear(); S.posR = null; S.shellFor = null; S.tg = null; S.map = null; } if (active()) refresh(k); });
    const tick = () => { if (active() && autoOn() && !document.hidden) live(); setTimeout(tick, secs() * 1000); };
    setTimeout(tick, secs() * 1000);
  }
  if (window.gxInit) window.gxInit();
  refresh('open');
  if (autoOn()) live();
};
if (typeof module !== 'undefined') module.exports = { prep, along, reps, busesOf, place, nextStop };
})();
