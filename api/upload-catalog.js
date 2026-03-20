// api/upload-catalog.js — recibe el catálogo Excel parseado y lo guarda en Supabase
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase service key not configured' });
  }

  const { products, company } = req.body;
  if (!products || !Array.isArray(products)) {
    return res.status(400).json({ error: 'products array required' });
  }

  const sb = createClient(supabaseUrl, supabaseKey);

  try {
    // Delete existing catalog for this company
    await sb.from('sku_catalog').delete().eq('company', company || 'default');

    // Insert in batches of 500
    const BATCH = 500;
    let inserted = 0;

    for (let i = 0; i < products.length; i += BATCH) {
      const batch = products.slice(i, i + BATCH).map(p => ({
        company:      company || 'default',
        familia:      (p.Familia      || p.familia      || '').toString().trim().toUpperCase(),
        sublinea:     (p['Sublínea']  || p.sublinea     || '').toString().trim(),
        linea_ventas: (p['Línea de Ventas'] || p.linea_ventas || '').toString().trim(),
        marca:        (p.Marca        || p.marca        || '').toString().trim(),
        sku:          (p.SKU          || p.sku          || '').toString().trim(),
        material:     (p.Material     || p.material     || '').toString().trim(),
        keywords:     (p.Keywords     || p.keywords     || '').toString().trim(),
        active:       true
      })).filter(p => p.sku && p.material); // require sku and material

      const { error } = await sb.from('sku_catalog').insert(batch);
      if (error) throw new Error(`Batch ${i/BATCH + 1}: ${error.message}`);
      inserted += batch.length;
    }

    return res.status(200).json({
      success: true,
      inserted,
      total: products.length
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
