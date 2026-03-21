// api/upload-office-skus.js
// Recibe Excel con columnas: Sucursal (code) | SKU
// Crea las sucursales si no existen, luego inserta los pares office_id + sku
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Supabase not configured' });

  const headers = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal'
  };
  const base = `${supabaseUrl}/rest/v1`;

  try {
    const { rows } = req.body; // [{ sucursal: 'CDMX-NORTE', sku: '70011249' }, ...]

    if (!rows?.length) return res.status(400).json({ error: 'Sin filas para procesar' });

    // 1. Get unique office codes from the file
    const codes = [...new Set(rows.map(r => (r.sucursal || r.Sucursal || r.SUCURSAL || '').trim().toUpperCase()).filter(Boolean))];

    if (!codes.length) return res.status(400).json({ error: 'Sin códigos de sucursal en el archivo' });

    // 2. Fetch existing offices
    const offResp = await fetch(`${base}/offices?select=id,code`, { headers });
    const existing = offResp.ok ? await offResp.json() : [];
    const officeMap = {}; // code → id
    existing.forEach(o => { officeMap[o.code] = o.id; });

    // 3. Create missing offices
    for (const code of codes) {
      if (!officeMap[code]) {
        const r = await fetch(`${base}/offices`, {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'return=representation' },
          body: JSON.stringify({ name: code, code, active: true })
        });
        if (r.ok) {
          const created = await r.json();
          officeMap[code] = created[0]?.id;
        }
      }
    }

    // 4. Build office_skus rows
    const pivotRows = rows
      .map(r => {
        const code = (r.sucursal || r.Sucursal || r.SUCURSAL || '').trim().toUpperCase();
        const sku  = String(r.sku || r.SKU || r.Sku || '').trim();
        const officeId = officeMap[code];
        if (!code || !sku || !officeId) return null;
        return { office_id: officeId, sku };
      })
      .filter(Boolean);

    if (!pivotRows.length) return res.status(400).json({ error: 'Sin pares válidos sucursal/SKU' });

    // 5. Delete existing rows for these offices and re-insert (clean slate per office)
    const officeIds = [...new Set(pivotRows.map(r => r.office_id))];
    for (const oid of officeIds) {
      await fetch(`${base}/office_skus?office_id=eq.${oid}`, { method: 'DELETE', headers });
    }

    // 6. Insert in batches of 500
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < pivotRows.length; i += BATCH) {
      const batch = pivotRows.slice(i, i + BATCH);
      const r = await fetch(`${base}/office_skus`, {
        method: 'POST',
        headers,
        body: JSON.stringify(batch)
      });
      if (r.ok) inserted += batch.length;
    }

    return res.status(200).json({
      success: true,
      offices_created: codes.filter(c => !existing.find(o => o.code === c)).length,
      total_rows: pivotRows.length,
      inserted,
      offices: Object.entries(officeMap).map(([code, id]) => ({ code, id }))
    });

  } catch(e) {
    console.error('[upload-office-skus]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
