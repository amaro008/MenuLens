// api/upload-catalog.js — DELETE then INSERT via RPC
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
  const authHeaders = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  };

  try {
    // STEP 1: Truncate via RPC (most reliable way)
    const rpcResp = await fetch(`${base}/rpc/truncate_sku_catalog`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ p_company: company })
    });
    // If RPC doesn't exist, try direct DELETE with all rows
    if (!rpcResp.ok) {
      // Delete using a filter that matches all rows for this company
      await fetch(`${base}/sku_catalog?company=eq.${company}&id=gte.0`, {
        method: 'DELETE',
        headers: { ...authHeaders, 'Prefer': 'return=minimal' }
      });
      // Also try without id filter
      await fetch(`${base}/sku_catalog?company=eq.${company}`, {
        method: 'DELETE',
        headers: { ...authHeaders, 'Prefer': 'return=minimal' }
      });
    }

    console.log('Delete step completed');
    await new Promise(r => setTimeout(r, 1000)); // wait for delete

    // STEP 2: Prepare rows
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

    // STEP 3: Insert with ON CONFLICT DO UPDATE via Prefer header
    const BATCH = 200;
    let inserted = 0;

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const resp = await fetch(`${base}/sku_catalog`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(batch)
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Batch ${Math.floor(i/BATCH)+1}: ${err.substring(0, 300)}`);
      }
      inserted += batch.length;
    }

    return res.status(200).json({ success: true, inserted, total: products.length });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
