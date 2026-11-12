// Proxy mínimo para Vercel: guárdalo como api/rt.js en tu repositorio de GitHub.
// Sirve tus feeds por https y con CORS, con una pequeña caché compartida (3 s) para
// que varios usuarios a la vez no multipliquen las peticiones a tu servidor.
const BASE = 'http://212.170.201.204:50080/GTFSRTapi/api/';
const UP = {
  vehicleposition: [BASE + 'vehicleposition', 3],
  tripupdate: [BASE + 'tripupdate', 3],
  alert: [BASE + 'alert', 30],
  gtfs: [BASE + 'GTFSFile', 3600]
};
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const e = UP[req.query.f];
  if (!e) return res.status(404).send('Usa ?f=vehicleposition, tripupdate, alert o gtfs');
  try {
    const r = await fetch(e[0], { signal: AbortSignal.timeout(20000) });
    res.setHeader('Cache-Control', `public, s-maxage=${e[1]}, stale-while-revalidate=${e[1]}`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.status(r.status).send(Buffer.from(await r.arrayBuffer()));
  } catch (err) { res.status(502).send('Error: ' + err.message); }
};
