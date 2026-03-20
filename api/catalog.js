// api/catalog.js — obtiene catálogo de Supabase via REST API (sin npm imports)
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  };

  const base = `${supabaseUrl}/rest/v1`;

  const PRIORITY_FAMILIES = [
    'RES','AVES','PESCADOS Y MARISCOS','CERDO','CARNES FRIAS',
    'CORDERO Y OTROS','QUESOS','CREMAS','MNTQUILLAS Y MARGARI',
    'PANES Y PASTELES','FRUTAS Y VERDURAS'
  ];

  try {
    // Fetch priority products (all)
    const prioFilter = PRIORITY_FAMILIES.map(f => `familia.eq.${f}`).join(',');
    const prioResp = await fetch(
      `${base}/sku_catalog?or=(${encodeURIComponent(prioFilter)})&active=eq.true&select=sku,material,marca,familia,sublinea,linea_ventas,keywords&order=familia`,
      { headers }
    );
    if (!prioResp.ok) throw new Error(`Priority fetch: ${prioResp.status}`);
    const priority = await prioResp.json();

    // Fetch other products (limit 300)
    const otherResp = await fetch(
      `${base}/sku_catalog?not.or=(${encodeURIComponent(prioFilter)})&active=eq.true&select=sku,material,marca,familia,sublinea,linea_ventas,keywords&limit=300`,
      { headers }
    );
    if (!otherResp.ok) throw new Error(`Others fetch: ${otherResp.status}`);
    const others = await otherResp.json();

    const all = [...(Array.isArray(priority) ? priority : []), ...(Array.isArray(others) ? others : [])];

    return res.status(200).json({
      products: all,
      total: all.length,
      priority_count: Array.isArray(priority) ? priority.length : 0
    });

  } catch(e) {
    console.error('Catalog fetch error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
