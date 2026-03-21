// api/config.js — expone config segura al frontend
export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const config = {
    supabaseUrl:  process.env.SUPABASE_URL  || '',
    supabaseKey:  process.env.SUPABASE_KEY  || '',
    companyName:  process.env.COMPANY_NAME  || 'MenuLens',
    activeModel:  process.env.ACTIVE_MODEL  || 'claude-sonnet-4-6',
    // Solo indica si las keys están presentes — nunca las expone
    providers: {
      claude: !!process.env.ANTHROPIC_KEY,
      gemini: !!process.env.GEMINI_KEY,
      openai: !!process.env.OPENAI_KEY,
    }
  };

  if (!config.supabaseUrl || !config.supabaseKey) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_KEY' });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(config);
}
