// api/analyze.js — Proxy serverless para Claude API
export const config = {
  api: { bodyParser: { sizeLimit: '25mb' } }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_KEY not configured in Vercel' });
  }

  try {
    const { model: reqModel, max_tokens, system, messages } = req.body;
    const model = reqModel || process.env.ACTIVE_MODEL || 'claude-sonnet-4-6';

    // Log prompt size for debugging
    const systemSize = system ? system.length : 0;
    const approxTokens = Math.round(systemSize / 4);
    console.log(`[analyze] model:${model} system:~${approxTokens}tok max_tokens:${max_tokens}`);

    if (approxTokens > 180000) {
      return res.status(400).json({ 
        error: `System prompt demasiado grande (~${approxTokens} tokens). Reduce el catálogo.` 
      });
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
      return res.status(response.status).json({ 
        error: data.error?.message || 'Anthropic API error',
        type: data.error?.type || 'unknown'
      });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(data);

  } catch (e) {
    console.error('[analyze] Exception:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
