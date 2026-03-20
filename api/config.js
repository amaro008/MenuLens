// api/config.js
// Vercel serverless function — lee variables de entorno y las devuelve al frontend
// Las variables NUNCA se exponen en el código fuente

export default function handler(req, res) {
  // Solo permitir GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Leer variables de entorno de Vercel
  const config = {
    supabaseUrl:  process.env.SUPABASE_URL  || '',
    supabaseKey:  process.env.SUPABASE_KEY  || '',
    companyName:  process.env.COMPANY_NAME  || 'MenuLens',
    anthropicKey: process.env.ANTHROPIC_KEY || '',
  };

  // Verificar que las variables críticas existen
  if (!config.supabaseUrl || !config.supabaseKey) {
    return res.status(500).json({ 
      error: 'Missing environment variables. Configure SUPABASE_URL and SUPABASE_KEY in Vercel.' 
    });
  }

  // Headers de seguridad — no cachear, solo desde el mismo origen
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  return res.status(200).json(config);
}
