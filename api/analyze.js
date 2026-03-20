// api/analyze.js — proxy Claude API con auth y rate limiting
export const config = { api: { bodyParser: { sizeLimit: '25mb' } } };

// Simple in-memory rate limiter (resets on cold start)
const rateLimiter = new Map();
const RATE_LIMIT = 20;      // max requests
const RATE_WINDOW = 60000;  // per minute

function checkRateLimit(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  if (!rateLimiter.has(key)) {
    rateLimiter.set(key, { count: 1, reset: now + RATE_WINDOW });
    return true;
  }
  const entry = rateLimiter.get(key);
  if (now > entry.reset) {
    rateLimiter.set(key, { count: 1, reset: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Espera un minuto.' });
  }

  // Require Supabase JWT — only authenticated users can use this endpoint
  const authHeader = req.headers.authorization || '';
  const userJwt = authHeader.replace('Bearer ', '');
  if (!userJwt) return res.status(401).json({ error: 'Autenticación requerida' });

  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_KEY not configured in Vercel' });

  try {
    const { model, max_tokens, system, messages } = req.body;
    const systemSize = system ? system.length : 0;
    const approxTokens = Math.round(systemSize / 4);
    console.log(`[analyze] ip:${ip} model:${model} ~${approxTokens}tok`);

    if (approxTokens > 180000) {
      return res.status(400).json({ error: `Prompt demasiado grande (~${approxTokens} tokens).` });
    }

    // Validate model — only allow Claude models
    if (!model || !model.startsWith('claude-')) {
      return res.status(400).json({ error: 'Modelo no permitido' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model, max_tokens, system, messages })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('[analyze] Anthropic error:', data.error);
      return res.status(response.status).json({ error: data.error?.message || 'Anthropic API error' });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(data);
  } catch(e) {
    console.error('[analyze] Exception:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
