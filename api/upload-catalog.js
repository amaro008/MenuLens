// api/upload-catalog.js — sube catálogo a Supabase via REST API
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

  const headers = {
    'Content-Type': 'application/json',
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Prefer': 'return=minimal'
  };

  const base = `${supabaseUrl}/rest/v1`;

  try {
    // Step 1: Delete ALL existing records for this company
    // Use neq filter trick to delete all rows matching company
    const delResp = await fetch(
      `${base}/sku_catalog?company=eq.${encodeURIComponent(company)}&sku=neq.___NONE___`,
      { method: 'DELETE', headers }
    );
    console.log('Delete status:', delResp.status);

    // Wait a moment for delete to complete
    await new Promise(r => setTimeout(r, 500));

    // Step 2: Insert in batches of 300 (smaller to avoid timeouts)
    const BATCH = 300;
    let inserted = 0;
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

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);

      const insertResp = await fetch(`${base}/sku_catalog`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=minimal,resolution=ignore-duplicates' },
        body: JSON.stringify(batch)
      });

      if (!insertResp.ok) {
        const errText = await insertResp.text();
        throw new Error(`Batch ${Math.floor(i/BATCH)+1}: ${errText.substring(0, 300)}`);
      }

      inserted += batch.length;
      console.log(`Batch ${Math.floor(i/BATCH)+1} OK: ${inserted}/${rows.length}`);
    }

    return res.status(200).json({ success: true, inserted, total: products.length });

  } catch(e) {
    console.error('Upload error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
