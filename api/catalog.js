// api/catalog.js — catálogo filtrado por sucursal via tabla pivot office_skus
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const anonKey     = process.env.SUPABASE_KEY;
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Supabase not configured' });

  const base           = `${supabaseUrl}/rest/v1`;
  const serviceHeaders = { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` };
  const selectFields   = 'sku,material,marca,familia,sublinea,linea_ventas,keywords';

  const PRIORITY_FAMILIES  = ['RES','AVES','PESCADOS Y MARISCOS','CERDO','CARNES FRIAS','CORDERO Y OTROS'];
  const SECONDARY_FAMILIES = ['QUESOS','CREMAS','MNTQUILLAS Y MARGARI','PANES Y PASTELES','ABARROTES'];

  try {
    // ── Detect user's office from JWT ─────────────
    let officeId = null;
    const jwt = (req.headers.authorization || '').replace('Bearer ', '');
    if (jwt && jwt.length > 20) {
      const userResp = await fetch(`${base}/users?select=office_id&limit=1`, {
        headers: { 'apikey': anonKey, 'Authorization': `Bearer ${jwt}` }
      });
      if (userResp.ok) {
        const u = await userResp.json();
        officeId = u?.[0]?.office_id || null;
      }
    }

    let products = [];

    if (officeId) {
      // ── Office catalog: get SKUs from pivot, then join with sku_catalog ──
      const pivotResp = await fetch(
        `${base}/office_skus?office_id=eq.${officeId}&select=sku`,
        { headers: serviceHeaders }
      );

      if (pivotResp.ok) {
        const pivotRows = await pivotResp.json();
        const skus = pivotRows.map(r => r.sku).filter(Boolean);

        if (skus.length) {
          // Fetch in batches of 200 (URL length limit)
          const BATCH = 200;
          for (let i = 0; i < skus.length; i += BATCH) {
            const batch = skus.slice(i, i + BATCH);
            const inFilter = batch.map(s => `sku.eq.${s}`).join(',');
            const r = await fetch(
              `${base}/sku_catalog?or=(${encodeURIComponent(inFilter)})&active=eq.true&select=${selectFields}`,
              { headers: serviceHeaders }
            );
            if (r.ok) products.push(...(await r.json()));
          }
          console.log(`[catalog] office:${officeId} skus:${skus.length} found:${products.length}`);
        }
      }
    }

    // ── Fallback: no office assigned → full catalog ────
    if (!officeId || !products.length) {
      const prioFilter = PRIORITY_FAMILIES.map(f => `familia.eq.${f}`).join(',');
      const prioResp   = await fetch(
        `${base}/sku_catalog?or=(${encodeURIComponent(prioFilter)})&active=eq.true&select=${selectFields}&order=familia,sublinea`,
        { headers: serviceHeaders }
      );
      const priority = prioResp.ok ? await prioResp.json() : [];

      const secFilter = SECONDARY_FAMILIES.map(f => `familia.eq.${f}`).join(',');
      const secResp   = await fetch(
        `${base}/sku_catalog?or=(${encodeURIComponent(secFilter)})&active=eq.true&select=${selectFields}&limit=400`,
        { headers: serviceHeaders }
      );
      const secondary = secResp.ok ? await secResp.json() : [];

      products = [...priority, ...secondary];
      console.log(`[catalog] no office → full catalog:${products.length}`);
    }

    const priority = products.filter(p => PRIORITY_FAMILIES.includes((p.familia||'').toUpperCase()));

    return res.status(200).json({
      products,
      total:          products.length,
      priority_count: priority.length,
      office_id:      officeId,
      sublinea_map:   buildSublineaMap(priority)
    });

  } catch(e) {
    console.error('[catalog]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

function buildSublineaMap(products) {
  const map = {};
  [...new Set(products.map(p => p.sublinea).filter(Boolean))].forEach(s => { map[s.toLowerCase()] = s; });
  return map;
}
