// api/catalog.js — obtiene catálogo de SKUs desde Supabase
// Llamado por el analyzer antes de cada análisis
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const sb = createClient(supabaseUrl, supabaseKey);

  // Priority families — always fetch ALL of these
  const PRIORITY_FAMILIES = [
    'RES', 'AVES', 'PESCADOS Y MARISCOS', 'CERDO', 'CARNES FRIAS',
    'CORDERO Y OTROS', 'QUESOS', 'CREMAS', 'MNTQUILLAS Y MARGARI',
    'PANES Y PASTELES', 'FRUTAS Y VERDURAS'
  ];

  try {
    // Fetch priority products (all of them)
    const { data: priority, error: e1 } = await sb
      .from('sku_catalog')
      .select('sku, material, marca, familia, sublinea, linea_ventas, keywords')
      .in('familia', PRIORITY_FAMILIES)
      .eq('active', true)
      .order('familia');

    if (e1) throw new Error(e1.message);

    // Fetch other products (limit 300)
    const { data: others, error: e2 } = await sb
      .from('sku_catalog')
      .select('sku, material, marca, familia, sublinea, linea_ventas, keywords')
      .not('familia', 'in', `(${PRIORITY_FAMILIES.map(f => `"${f}"`).join(',')})`)
      .eq('active', true)
      .limit(300);

    if (e2) throw new Error(e2.message);

    const all = [...(priority || []), ...(others || [])];

    return res.status(200).json({
      products: all,
      total: all.length,
      priority_count: (priority || []).length
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
