// api/config.js — Vercel serverless function
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const config = {
    supabaseUrl:        process.env.SUPABASE_URL         || '',
    supabaseKey:        process.env.SUPABASE_KEY         || '',
    supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',
    companyName:        process.env.COMPANY_NAME         || 'MenuLens',
    anthropicKey:       process.env.ANTHROPIC_KEY        || '',
  };

  if (!config.supabaseUrl || !config.supabaseKey) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_KEY in Vercel environment variables.' });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(config);
}
