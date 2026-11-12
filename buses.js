(function () {
const K = Math.PI / 180, KX = Math.cos(41.65 * K) * 111320, KY = 110540;
const xy = (la, lo) => [lo * KX, la * KY];
const gx = () => window.gx;
const $ = s => document.querySelector(s);
const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const S = { tab: 'm', route: '', map: null, mk: new Map(), lines: null, layer: null, cache: new Map(), vm: new Map(), follow: null, q: '', stop: null, sid: null, dR: null, dl: null, sg: null, si: null, last: new Map(), posR: null, pos: null, ns: null, init: 0, shellFor: null, tg: null, tidx: null };
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
const hhmm = t => new Date(t * 1000).toLocaleTimeString('es', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
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

/* ---------- punctuality, stops, alerts ---------- */
const TZ = 'Europe/Madrid';
const tzFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const tzParts = t => { const p = {}; tzFmt.formatToParts(new Date(t)).forEach(x => { p[x.type] = +x.value; }); return p; };
const tzOff = t => { const p = tzParts(t); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000; };
const midnight = d => {   // epoch seconds of 00:00 in Madrid for 'YYYYMMDD' (or today)
  let y, m, dd;
  if (d && d.length == 8) { y = +d.slice(0, 4); m = +d.slice(4, 6); dd = +d.slice(6, 8); } else { const p = tzParts(Date.now()); y = p.year; m = p.month; dd = p.day; }
  const utc = Date.UTC(y, m - 1, dd); return (utc - tzOff(utc - tzOff(utc))) / 1000;
};
function delayOf(v) {   // minutes (+ late / - early) or null
  const R = gx().R, G = gx().G;
  if (S.dR !== R) { S.dR = R; S.dl = new Map(); }
  if (S.dl.has(v.trip)) return S.dl.get(v.trip);
  let r = null; const tu = ((R && R.tu) || []).find(t => t.trip == v.trip), s0 = tu && tu.sts && tu.sts.find(s => s.t);
  if (s0) {
    if (s0.dl != null && Math.abs(s0.dl) < 7200) r = s0.dl / 60;
    else { const x = (G.st.get(v.trip) || []).find(y => y[3] == s0.seq), m = x && (x[1] != null ? x[1] : x[2]); if (m != null) r = (s0.t - (midnight(tu.date || v.date) + m * 60)) / 60; }
  }
  if (r != null && Math.abs(r) > 120) r = null;
  S.dl.set(v.trip, r); return r;
}
function dInfo(d) {
  if (d == null) return { c: '#fff', l: 'sin datos' };
  const r = Math.round(d);
  return r <= -2 ? { c: '#2a7de1', l: r + ' min (adelantado)' } : r < 2 ? { c: '#2e9e3e', l: 'puntual' } : r < 5 ? { c: '#e6a100', l: '+' + r + ' min' } : { c: '#d33', l: '+' + r + ' min (retraso)' };
}
function stopIdx() {
  const G = gx().G;
  if (S.sg !== G) { S.sg = G; S.si = new Map(); G.st.forEach((arr, trip) => arr.forEach(x => { let l = S.si.get(x[0]); if (!l) S.si.set(x[0], l = []); l.push([trip, x[1] != null ? x[1] : x[2], x[3]]); })); }
  return S.si;
}
function svcToday(svc) {
  const G = gx().G, p = tzParts(Date.now()), d = '' + p.year + String(p.month).padStart(2, '0') + String(p.day).padStart(2, '0'), w = (new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() + 6) % 7;
  const e = G.exc.get(svc) && G.exc.get(svc).get(d); if (e == '1') return true; if (e == '2') return false;
  const c = G.cal.get(svc); return !!c && d >= c.s && d <= c.e && !!c.d[w];
}
// Upcoming buses at a stop: live trips (schedule + current delay) and, for the rest, today's timetable
function arrivals(stopId, max) {
  const R = gx().R, now = Date.now() / 1000, m0 = midnight(''), live = new Map(), out = [];
  ((R && R.veh) || []).forEach(v => live.set(v.trip, v));
  (stopIdx().get(stopId) || []).forEach(([trip, min]) => {
    if (min == null) return; const T = tripOf(trip); if (!T) return; const v = live.get(trip);
    if (v) { const d = delayOf(v), est = midnight(v.date) + min * 60 + (d || 0) * 60; if (est >= now - 45 && est <= now + 5400) out.push({ T, est, live: true, d, v }); }
    else if (svcToday(T.svc)) { const est = m0 + min * 60; if (est >= now && est <= now + 2700) out.push({ T, est, live: false }); }
  });
  return out.sort((a, b) => a.est - b.est).slice(0, max || 8);
}
function arrHTML(stopId, max) {
  const G = gx().G, a = arrivals(stopId, max), now = Date.now() / 1000;
  if (!a.length) return '<p class="mu">Sin llegadas previstas en los próximos minutos.</p>';
  return '<ul class="bx-arr">' + a.map(x => {
    const r = G.routes.find(z => z.id == x.T.rt), m = Math.round((x.est - now) / 60), di = x.live ? dInfo(x.d) : null;
    return `<li>${r ? gx().badge(r) : ''}<span class="bx-h">${esc(x.T.h || '')}</span><b>${m <= 0 ? 'llegando' : 'en ' + m + ' min'}</b> <small>${hhmm(x.est)}</small> ${x.live ? `<small class="bx-tag" style="--c:${di.c}">en directo${x.d != null ? ' · ' + di.l : ''}</small>` : '<small class="bx-tag" style="--c:#888">horario</small>'}</li>`;
  }).join('') + '</ul>';
}
const favStops = () => { try { return JSON.parse(localStorage.getItem('auvasa_stops_fav') || '[]'); } catch (_) { return []; } };
function toggleFav(id) { const f = favStops(), i = f.indexOf(id); if (i < 0) f.push(id); else f.splice(i, 1); localStorage.setItem('auvasa_stops_fav', JSON.stringify(f)); }
const alertsOf = rid => ((gx().R && gx().R.al) || []).filter(a => a.en.some(e => e.r == rid));

/* ---------- popups ---------- */
function pop(v) {
  const G = gx().G, r = G.routes.find(x => x.id == routeOf(v)), T = tripOf(v.trip) || {}, ns = nextStop(v), d = delayOf(v), di = dInfo(d);
  const s = Math.max(0, Math.round(Date.now() / 1000 - (v.ts || 0)));
  const ago = !v.ts ? '–' : s < 10 ? 'ahora mismo' : s < 90 ? `hace ${s} s` : s < 5400 ? `hace ${Math.round(s / 60)} min` : `hace ${Math.round(s / 3600)} h`;
  return `<div class="bx-pi"><div>${r ? gx().badge(r) : ''} <b>${esc(T.h || '')}</b></div><div><b>Bus ${esc(v.num || '?')}</b>: ${esc(v.plate || '')}</div><div><b>Actualizado</b>: ${ago}</div><div><b>Ocupación</b>: ${occ(v.occ)}</div>${d != null ? `<div><b>Puntualidad</b>: <b style="color:${di.c}">${di.l}</b></div>` : ''}${ns ? `<div><b>Próxima parada</b>: ${esc(ns.name)}${eta(ns.t, v)}</div>${ns.prev && !ns.t ? `<div class="mu"><small>Previsión en ${esc(ns.prev.name)}: ${hhmm(ns.prev.t)}</small></div>` : ''}` : ''}</div>`;
}
function popEl(key) {
  const v = S.vm.get(key), el = document.createElement('div'); if (!v) return el;
  el.innerHTML = pop(v);
  const b = document.createElement('button'); b.className = 'ghost'; b.textContent = S.follow == key ? 'Dejar de seguir' : 'Seguir este bus';
  b.onclick = () => { S.follow = S.follow == key ? null : key; b.textContent = S.follow == key ? 'Dejar de seguir' : 'Seguir este bus'; };
  el.appendChild(b); return el;
}
function stopEl(id) {
  const G = gx().G, s = G.stops.get(id) || {}, el = document.createElement('div'); el.className = 'bx-pi';
  el.innerHTML = `<div><b>${esc(s.n || id)}</b> <small class="mu">${esc(s.c || id)}</small></div>${arrHTML(id, 4)}`;
  const b = document.createElement('button'); b.className = 'ghost';
  const set = () => { b.textContent = favStops().includes(id) ? '★ Quitar de mis paradas' : '☆ Guardar parada'; }; set();
  b.onclick = () => { toggleFav(id); set(); if (S.tab == 'p') parRender(); };
  el.appendChild(b); return el;
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
  S.lines = L.layerGroup().addTo(S.map); S.stopL = L.layerGroup().addTo(S.map); S.alertL = L.layerGroup().addTo(S.map); S.layer = L.layerGroup().addTo(S.map); S.mk = new Map();
  S.map.on('moveend', drawStops); S.map.on('dragstart', () => { S.follow = null; });
  S.map.on('popupopen', e => { S.sid = (e.popup._source && e.popup._source._sid) || null; }); S.map.on('popupclose', () => { S.sid = null; });
  drawLines(); updateMap();
  if (S.goto) { S.map.setView(S.goto, 16); L.circleMarker(S.goto, { radius: 8, color: '#2a7de1', fillColor: '#2a7de1', fillOpacity: 0.6 }).addTo(S.map); S.goto = null; }
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
function drawStops() {
  if (!S.map || !S.stopL) return; S.stopL.clearLayers(); if (S.map.getZoom() < 16) return;
  const G = gx().G, bd = S.map.getBounds(); let n = 0;
  for (const [id, s] of G.stops) {
    if (!isFinite(s.lat) || !bd.contains([s.lat, s.lon])) continue; if (++n > 400) break;
    const m = L.circleMarker([s.lat, s.lon], { radius: 6, color: '#333', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(S.stopL); m._sid = id; m.bindPopup(() => stopEl(id));
  }
}
function drawAlerts() {
  if (!S.alertL) return; S.alertL.clearLayers(); const G = gx().G, R = gx().R;
  ((R && R.al) || []).forEach(a => a.en.filter(e => e.s && G.stops.get(e.s) && isFinite(G.stops.get(e.s).lat)).forEach(e => {
    const s = G.stops.get(e.s);
    L.marker([s.lat, s.lon], { icon: L.divIcon({ className: 'bx-ico', iconSize: [0, 0], html: '<div class="bx-b bx-warn">⚠️</div>' }) }).addTo(S.alertL).bindPopup(`<b>${esc(a.h || 'Aviso')}</b><br>${esc(a.d)}<br><small>${esc(s.n)}</small>`);
  }));
}
function updateMap() {
  if (!S.map) return; const G = gx().G, R = gx().R, keep = new Set(), now = Date.now() / 1000;
  ((R && R.veh) || []).forEach(v => {
    const rid = routeOf(v); if ((S.route && S.route != rid) || !isFinite(v.lat)) return;
    const r = G.routes.find(x => x.id == rid), key = v.num || v.plate || v.trip; keep.add(key); S.vm.set(key, v);
    const mkIcon = () => L.divIcon({ className: 'bx-ico', iconSize: [0, 0], html: `<div class="bx-b">${r ? gx().badge(r) : '<span class="badge">?</span>'}</div>` });
    let m = S.mk.get(key);
    if (m) { m.setLatLng([v.lat, v.lon]); if (m._rid !== rid) { m.setIcon(mkIcon()); m._rid = rid; } if (m.isPopupOpen && m.isPopupOpen()) m.getPopup().setContent(popEl(key)); }
    else { m = L.marker([v.lat, v.lon], { icon: mkIcon() }).addTo(S.layer); m._rid = rid; m.bindPopup(() => popEl(key)); S.mk.set(key, m); }
    m.setOpacity(now - (v.ts || 0) > 60 ? 0.45 : 1);                      // grey out buses without recent data
    const el = m.getElement(); if (el && el.firstChild) el.firstChild.style.setProperty('--ring', dInfo(delayOf(v)).c);   // ring colour = punctuality
  });
  S.mk.forEach((m, k) => { if (!keep.has(k)) { S.layer.removeLayer(m); S.mk.delete(k); } });
  if (S.follow && S.vm.get(S.follow)) { const v = S.vm.get(S.follow); S.map.panTo([v.lat, v.lon]); }
  if (S.sid && S.map._popup && S.map._popup.isOpen && S.map._popup.isOpen()) S.map._popup.setContent(stopEl(S.sid));
  drawAlerts();
}

/* ---------- vertical diagrams ---------- */
const H = 34;
function lineal() {
  const G = gx().G, box = $('#bx-view'); if (!box) return;
  const r = G.routes.find(x => x.id == S.route);
  if (!r) { box.innerHTML = '<p class="mu">Elige una línea.</p>'; return; }
  const rps = reps(r.id), bs = busesOf(r.id);
  if (!rps.length) { box.innerHTML = '<p>No se han podido construir los recorridos de esta línea con el GTFS cargado.</p>'; return; }
  const ds = bs.map(b => delayOf(b.v)).filter(d => d != null), late = ds.filter(d => d >= 3).length, avg = ds.length ? Math.round(ds.reduce((a, c) => a + c, 0) / ds.length) : null;
  box.innerHTML = `<div class="bx-sum">${bs.length} buses${ds.length ? ` · ${late} con retraso de 3 min o más · retraso medio ${avg > 0 ? '+' : ''}${avg} min` : ''}</div>
    ${alertsOf(r.id).map(a => `<div class="bx-al">⚠️ <b>${esc(a.h || 'Aviso')}</b> ${esc(a.d)}</div>`).join('')}
    <div class="bx-lin">${rps.map(rp => `<div class="bx-col"><h3>${esc(rp.head ? 'Hacia ' + rp.head : 'Sentido ' + rp.k)}</h3>
    <div class="bx-rail" style="height:${rp.st.length * H}px;--c:${rcolor(r)}">
    ${rp.st.map((s, i) => `<div class="bx-st" style="top:${i * H}px"><i></i><span>${esc(s.n)}</span></div>`).join('')}
    ${bs.filter(b => b.k == rp.k).map(b => `<button class="bx-bus" data-n="${esc(b.v.num || b.v.plate)}" style="top:${H / 2 + b.idx * H}px;--ring:${dInfo(delayOf(b.v)).c}" aria-label="Bus ${esc(b.v.num)}">${gx().badge(r)}</button>`).join('')}
    </div></div>`).join('')}</div><div id="bx-pop" class="bx-pop oculto"></div>`;
  const open = n => {
    const v = bs.map(x => x.v).find(x => (x.num || x.plate) == n), p = $('#bx-pop'); if (!v) { S.sel = null; return; }
    S.sel = n; p.innerHTML = pop(v) + '<button class="ghost" id="bx-x">Cerrar</button>'; p.classList.remove('oculto');
    $('#bx-x').onclick = () => { S.sel = null; p.classList.add('oculto'); };
  };
  box.querySelectorAll('.bx-bus').forEach(b => b.onclick = () => open(b.dataset.n));
  if (S.sel) open(S.sel);
}

/* ---------- stops and alerts tabs ---------- */
function paradas() {
  const box = $('#bx-view'); if (!box) return;
  box.innerHTML = `<input id="bx-q" type="search" placeholder="Buscar parada por nombre o número" value="${esc(S.q)}"><div id="bx-res"></div><div id="bx-sel"></div><h3 class="bx-h3">⭐ Mis paradas</h3><div id="bx-fav"></div>`;
  $('#bx-q').oninput = e => { S.q = e.target.value; parRes(); };
  parRes(); parRender();
}
function parRes() {
  const G = gx().G, el = $('#bx-res'), q = S.q.toLowerCase().trim(); if (!el) return; if (!q) { el.innerHTML = ''; return; }
  const out = []; for (const [id, s] of G.stops) { if ((s.n + ' ' + (s.c || '') + ' ' + id).toLowerCase().includes(q)) { out.push(id); if (out.length >= 25) break; } }
  el.innerHTML = out.map((id, i) => `<button class="it" data-i="${i}"><span>${esc(G.stops.get(id).n)}<small>${esc(G.stops.get(id).c || id)}</small></span></button>`).join('') || '<p class="mu">Sin resultados.</p>';
  el.querySelectorAll('.it').forEach(b => b.onclick = () => { S.stop = out[+b.dataset.i]; parRender(); });
}
function parRender() {
  const G = gx().G, sel = $('#bx-sel'), fv = $('#bx-fav'); if (!sel || !fv) return;
  sel.innerHTML = S.stop ? `<div class="bx-card"><h3>${esc((G.stops.get(S.stop) || {}).n || S.stop)}</h3>${arrHTML(S.stop, 8)}</div>` : '';
  if (S.stop) { const b = document.createElement('button'); b.className = 'ghost'; const set = () => { b.textContent = favStops().includes(S.stop) ? '★ Quitar de mis paradas' : '☆ Guardar parada'; }; set(); const id = S.stop; b.onclick = () => { toggleFav(id); parRender(); }; sel.firstChild.appendChild(b); }
  const f = favStops();
  fv.innerHTML = f.length ? f.map(id => `<div class="bx-card"><h3>${esc((G.stops.get(id) || {}).n || id)}</h3>${arrHTML(id, 3)}</div>`).join('') : '<p class="mu">Guarda paradas con ☆ para ver aquí sus llegadas en directo.</p>';
}
function avisos() {
  const G = gx().G, R = gx().R, box = $('#bx-view'); if (!box) return;
  const al = (R && R.al) || [];
  box.innerHTML = al.length ? al.map(a => `<div class="bx-al"><b>${esc(a.h || 'Aviso')}</b><div>${esc(a.d)}</div><div class="bx-ent">${a.en.filter(e => e.r || e.s).map(e => e.r ? (G.routes.find(x => x.id == e.r) ? gx().badge(G.routes.find(x => x.id == e.r)) : 'Línea ' + esc(e.r)) : '🚏 ' + esc((G.stops.get(e.s) || {}).n || e.s)).join(' ')}</div></div>`).join('') : '<p class="mu">No hay avisos activos.</p>';
}

/* ---------- screen ---------- */
const autoOn = () => localStorage.getItem('auvasa_rt_auto') !== '0';
const base = () => (localStorage.getItem('auvasa_rt_base') || '').trim();
const secs = () => Math.max(2, +(localStorage.getItem('auvasa_rt_secs') || 5));
const active = () => { const e = document.getElementById('pantalla-buses'); return e && e.classList.contains('activa'); };
function stat() {
  const R = gx().R, el = $('#bx-st'); if (!el) return;
  el.textContent = R && R.veh ? `Datos de las ${R.ts ? new Date(R.ts * 1000).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '–'} · ${R.veh.length} buses${autoOn() && base() ? ' · se actualiza cada ' + secs() + ' s' : ''}${S.fetched ? ' · consultado a las ' + new Date(S.fetched).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}` : 'Datos en directo: aún sin cargar';
}
const fetchProxy = (n, bucket) => fetch(base() + (base().includes('?') ? '&' : '?') + 'f=' + n + '&t=' + bucket, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); });
async function live() {
  if (!base() || S.busy) return;
  S.busy = 1; S.n = (S.n || 0) + 1;
  const withAl = S.n % Math.max(1, Math.round(60 / secs())) === 1, bk = Math.floor(Date.now() / 3000);   // same bucket for everyone: the proxy can cache 3 s
  try {
    const bs = await Promise.all([fetchProxy('vehicleposition', bk), fetchProxy('tripupdate', bk)]); let al = null;
    if (withAl) { try { al = await fetchProxy('alert', bk); } catch (_) {} }
    if (al) bs.push(al);
    S.fetched = Date.now(); gx().rt(bs, !al);
  } catch (e) { const el = $('#bx-st'); if (el) el.textContent = 'No se pudo actualizar: ' + e.message; }
  finally { S.busy = 0; }
}
async function updateGtfs(auto) {
  if (!base()) return; const say = t => { const el = $('#bx-gt'); if (el) el.textContent = t; };
  try {
    say('Buscando GTFS…');
    const buf = await fetchProxy('gtfs', Math.floor(Date.now() / 3600000)), u = new Uint8Array(buf); let sum = 0;
    for (let i = 0; i < u.length; i += 997) sum = (sum + u[i] * (i % 251 + 1)) % 1000003;
    const sig = buf.byteLength + ':' + sum; localStorage.setItem('auvasa_gtfs_check', String(Date.now()));
    if (sig === localStorage.getItem('auvasa_gtfs_sig')) { say('GTFS al día'); return; }
    if (await gx().loadZip(buf, 'GTFS de AUVASA')) { localStorage.setItem('auvasa_gtfs_sig', sig); say('GTFS actualizado'); } else say('El archivo descargado no es un GTFS válido');
  } catch (e) { say('No se pudo actualizar el GTFS: ' + e.message + (auto ? '' : ' (si pesa más de 4,5 MB, el proxy gratuito no puede servirlo: cárgalo a mano)')); }
}
function shell() {
  const el = $('#bx-app'), G = gx() && gx().G;
  if (!G) { el.innerHTML = '<p>Primero carga el GTFS estático en «Horarios públicos (GTFS)».</p>'; return false; }
  if (S.shellFor === G) return true; S.shellFor = G;
  el.innerHTML = `<div class="bx-bar"><div class="tabs"><button data-t="m">Mapa</button><button data-t="l">Líneas</button><button data-t="p">Paradas</button><button data-t="a">Avisos</button></div>
    <select id="bx-r" aria-label="Línea"><option value="">Todas las líneas</option>${G.routes.map(r => `<option value="${esc(r.id)}">${esc(r.s || r.l)} · ${esc(r.l)}</option>`).join('')}</select><button id="bx-gps" class="ghost" title="Cerca de mí">📍</button></div>
    <details class="bx-live"><summary id="bx-st">Datos en directo</summary><div>
    <input id="bx-url" type="text" placeholder="Dirección de tu proxy (…/api/rt)" value="${esc(base())}">
    <label><input id="bx-auto" type="checkbox" ${autoOn() ? 'checked' : ''}> actualizar solo cada <select id="bx-secs">${[5, 10, 15, 30].map(n => `<option value="${n}"${n == secs() ? ' selected' : ''}>${n}</option>`).join('')}</select> s</label>
    <button id="bx-now">Actualizar</button><label class="btn">Cargar archivos<input id="bx-f" type="file" multiple hidden></label>
    <button id="bx-gtfs" class="ghost">Buscar GTFS nuevo</button><span id="bx-gt" class="mu"></span></div></details><div id="bx-view"></div>`;
  const tabs = () => { el.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.t == S.tab)); $('#bx-r').style.display = S.tab == 'm' || S.tab == 'l' ? '' : 'none'; };
  el.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { S.tab = b.dataset.t; if (S.tab == 'l' && !S.route) pickRoute(); tabs(); view(); });
  $('#bx-r').onchange = e => { S.route = e.target.value; if (S.tab == 'm') { if (S.map) { drawLines(); updateMap(); } } else lineal(); };
  $('#bx-url').onchange = e => localStorage.setItem('auvasa_rt_base', e.target.value.trim());
  $('#bx-secs').onchange = e => { localStorage.setItem('auvasa_rt_secs', e.target.value); stat(); };
  $('#bx-auto').onchange = e => localStorage.setItem('auvasa_rt_auto', e.target.checked ? '1' : '0');
  $('#bx-now').onclick = live; $('#bx-gtfs').onclick = () => updateGtfs(false);
  $('#bx-gps').onclick = () => {
    if (!navigator.geolocation) return alert('Este navegador no permite la localización.');
    navigator.geolocation.getCurrentPosition(p => { S.goto = [p.coords.latitude, p.coords.longitude]; S.tab = 'm'; tabs(); view(); }, () => alert('No se pudo obtener tu posición: revisa el permiso de ubicación.'), { enableHighAccuracy: true, timeout: 10000 });
  };
  $('#bx-f').onchange = async e => { const fs = [...e.target.files]; if (fs.length) gx().rt(await Promise.all(fs.map(f => f.arrayBuffer()))); e.target.value = ''; };
  tabs(); return true;
}
function pickRoute() {
  const G = gx().G, R = gx().R, withBus = R && R.veh ? new Set(R.veh.map(routeOf)) : new Set();
  const r = G.routes.find(x => withBus.has(x.id)) || G.routes[0]; S.route = r ? r.id : ''; const sel = $('#bx-r'); if (sel) sel.value = S.route;
}
function view() {
  const v = $('#bx-view'); if (!v) return;
  if (S.tab == 'm') { v.innerHTML = '<div id="bx-map"></div>'; S.map = null; mountMap(); } else if (S.tab == 'l') lineal(); else if (S.tab == 'p') paradas(); else avisos();
}
function refresh(k) {
  if (!shell()) return; stat();
  if (k == 'rt') ({ m: updateMap, l: lineal, p: parRender, a: avisos })[S.tab](); else view();
}
window.bxInit = () => {
  if (!window.gx) return;
  if (!S.init) {
    S.init = 1;
    gx().sub(k => { if (k == 'static') { S.cache.clear(); S.last.clear(); S.posR = null; S.shellFor = null; S.tg = null; S.map = null; S.sg = null; } if (active()) refresh(k); });
    const tick = () => { if (active() && autoOn() && !document.hidden) live(); setTimeout(tick, secs() * 1000); };
    setTimeout(tick, secs() * 1000);
  }
  if (window.gxInit) window.gxInit();
  refresh('open');
  if (autoOn()) live();
  if (base() && Date.now() - (+localStorage.getItem('auvasa_gtfs_check') || 0) > 864e5) updateGtfs(true);   // once a day
};
if (typeof module !== 'undefined') module.exports = { prep, along, reps, busesOf, place, nextStop, delayOf, arrivals, dInfo, svcToday, S, lineal, paradas, parRender, avisos, pop, shell, stat, view, refresh };
})();
