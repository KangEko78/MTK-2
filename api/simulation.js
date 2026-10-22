export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Metode tidak didukung.' });
  }

  const endpoint = process.env.APPS_SCRIPT_URL;
  const sharedSecret = process.env.TKA_SHARED_SECRET;
  if (!endpoint || !sharedSecret) {
    return res.status(503).json({ ok: false, error: 'Backend belum dikonfigurasi oleh pengelola.' });
  }

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...req.body, sharedSecret }),
      redirect: 'follow',
    });
    const payload = await upstream.json();
    return res.status(upstream.ok ? 200 : upstream.status).json(payload);
  } catch {
    return res.status(502).json({ ok: false, error: 'Layanan penyimpanan belum dapat dihubungi. Coba lagi.' });
  }
}
