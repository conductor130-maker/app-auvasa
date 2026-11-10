// Proxy mínimo para Vercel (carpeta api/rt.js). Sirve tus feeds por https y con CORS.
// Rellena las tres direcciones con las URLs reales de tu servidor de tiempo real.
const UP = {
  vehicleposition: 'PON_AQUI_LA_URL_DE_vehicleposition',
  tripupdate: 'PON_AQUI_LA_URL_DE_tripupdate',
  alert: 'PON_AQUI_LA_URL_DE_alert'
};
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = UP[req.query.f];
  if (!url) return res.status(404).send('Usa ?f=vehicleposition, tripupdate o alert');
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    res.setHeader('Cache-Control', 'no-store');
    res.status(r.status).send(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.status(502).send('Error: ' + e.message); }
};
