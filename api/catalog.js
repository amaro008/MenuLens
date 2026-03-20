// api/catalog.js — obtiene catálogo con pre-matching semántico por sublínea
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

  // Familias proteína — siempre traer TODAS
  const PRIORITY_FAMILIES = [
    'RES','AVES','PESCADOS Y MARISCOS','CERDO',
    'CARNES FRIAS','CORDERO Y OTROS'
  ];

  // Familias secundarias — muestra
  const SECONDARY_FAMILIES = [
    'QUESOS','CREMAS','MNTQUILLAS Y MARGARI',
    'PANES Y PASTELES','FRUTAS Y VERDURAS','ABARROTES'
  ];

  try {
    // Traer TODAS las proteínas (sin límite)
    const prioFilter = PRIORITY_FAMILIES.map(f => `familia.eq.${f}`).join(',');
    const prioResp = await fetch(
      `${base}/sku_catalog?or=(${encodeURIComponent(prioFilter)})&active=eq.true` +
      `&select=sku,material,marca,familia,sublinea,linea_ventas,keywords&order=familia,sublinea`,
      { headers }
    );
    if (!prioResp.ok) throw new Error(`Priority: ${await prioResp.text()}`);
    const priority = await prioResp.json();

    // Traer muestra de secundarios
    const secFilter = SECONDARY_FAMILIES.map(f => `familia.eq.${f}`).join(',');
    const secResp = await fetch(
      `${base}/sku_catalog?or=(${encodeURIComponent(secFilter)})&active=eq.true` +
      `&select=sku,material,marca,familia,sublinea,linea_ventas,keywords&limit=400`,
      { headers }
    );
    const secondary = secResp.ok ? await secResp.json() : [];

    const all = [
      ...(Array.isArray(priority) ? priority : []),
      ...(Array.isArray(secondary) ? secondary : [])
    ];

    return res.status(200).json({
      products: all,
      total: all.length,
      priority_count: Array.isArray(priority) ? priority.length : 0,
      // Mapa de sublíneas disponibles — para que Claude sepa cómo buscar
      sublinea_map: buildSublineaMap(Array.isArray(priority) ? priority : [])
    });

  } catch(e) {
    console.error('Catalog error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

function buildSublineaMap(products) {
  // Mapa: término del menú → sublíneas del catálogo
  const map = {};
  const sublineas = [...new Set(products.map(p => p.sublinea).filter(Boolean))];
  sublineas.forEach(s => { map[s.toLowerCase()] = s; });
  return map;
}
