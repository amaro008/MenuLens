// api/upload-catalog.js — usa UPSERT para evitar duplicados
export const config = {
  api: { bodyParser: { sizeLimit: '15mb' } }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const { products, company = 'default' } = req.body;
  if (!products || !Array.isArray(products)) {
    return res.status(400).json({ error: 'products array required' });
  }

  const base = `${supabaseUrl}/rest/v1`;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Prefer': 'resolution=merge-duplicates,return=minimal'
  };

  try {
    const rows = products
      .map(p => ({
        company,
        familia:      (p.Familia      || p.familia      || '').toString().trim().toUpperCase(),
        sublinea:     (p['Sublínea']  || p.sublinea     || '').toString().trim(),
        linea_ventas: (p['Línea de Ventas'] || p.linea_ventas || '').toString().trim(),
        marca:        (p.Marca        || p.marca        || '').toString().trim(),
        sku:          (p.SKU          || p.sku          || '').toString().trim(),
        material:     (p.Material     || p.material     || '').toString().trim(),
        keywords:     (p.Keywords     || p.keywords     || '').toString().trim(),
        active:       true
      }))
      .filter(p => p.sku && p.material);

    // Upsert in batches of 300
    const BATCH = 300;
    let upserted = 0;

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const resp = await fetch(`${base}/sku_catalog`, {
        method: 'POST',
        headers,
        body: JSON.stringify(batch)
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Batch ${Math.floor(i/BATCH)+1}: ${err.substring(0, 300)}`);
      }
      upserted += batch.length;
      console.log(`Upserted ${upserted}/${rows.length}`);
    }

    return res.status(200).json({ success: true, inserted: upserted, total: products.length });

  } catch(e) {
    console.error('Upload error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
