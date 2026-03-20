// api/config.js — solo expone keys seguras al frontend
// service_role key NUNCA se expone aquí
export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const config = {
    supabaseUrl:  process.env.SUPABASE_URL  || '',
    supabaseKey:  process.env.SUPABASE_KEY  || '',  // anon key only — safe to expose
    companyName:  process.env.COMPANY_NAME  || 'MenuLens',
    // anthropicKey NOT exposed — used server-side only in /api/analyze
    // supabaseServiceKey NOT exposed — used server-side only in /api/upload-catalog and /api/create-user
  };
  if (!config.supabaseUrl || !config.supabaseKey) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_KEY in Vercel env vars.' });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(config);
}
