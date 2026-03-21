// api/analyze.js — proxy multi-modelo: Claude, Gemini, OpenAI
export const config = { api: { bodyParser: { sizeLimit: '25mb' } } };

const rateLimiter = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  const entry = rateLimiter.get(key) || { count: 0, reset: now + 60000 };
  if (now > entry.reset) { rateLimiter.set(key, { count: 1, reset: now + 60000 }); return true; }
  if (entry.count >= 20) return false;
  entry.count++;
  rateLimiter.set(key, entry);
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress;
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Demasiadas solicitudes. Espera un minuto.' });
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Autenticación requerida' });

  const { model, max_tokens, system, messages } = req.body;
  if (!model) return res.status(400).json({ error: 'model requerido' });

  const provider = model.startsWith('gemini') ? 'gemini'
    : (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) ? 'openai'
    : 'claude';

  try {
    if (provider === 'claude')  return await callClaude(req, res, { model, max_tokens, system, messages });
    if (provider === 'gemini')  return await callGemini(req, res, { model, max_tokens, system, messages });
    if (provider === 'openai')  return await callOpenAI(req, res, { model, max_tokens, system, messages });
    return res.status(400).json({ error: 'Proveedor no soportado: ' + model });
  } catch(e) {
    console.error('[analyze]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

async function callClaude(req, res, { model, max_tokens, system, messages }) {
  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_KEY no configurada en Vercel' });
  const approxTokens = Math.round((system||'').length / 4);
  if (approxTokens > 180000) return res.status(400).json({ error: `Prompt demasiado grande (~${approxTokens} tokens)` });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens, system, messages })
  });
  const data = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: data.error?.message || 'Anthropic error' });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(data);
}

async function callGemini(req, res, { model, max_tokens, system, messages }) {
  const apiKey = process.env.GEMINI_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_KEY no configurada en Vercel' });

  const geminiContents = [];
  for (const msg of messages) {
    const parts = [];
    const content = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content }];
    for (const part of content) {
      if (part.type === 'text') parts.push({ text: part.text });
      else if (part.type === 'image') parts.push({ inlineData: { mimeType: part.source.media_type, data: part.source.data } });
      else if (part.type === 'document') parts.push({ inlineData: { mimeType: 'application/pdf', data: part.source.data } });
    }
    geminiContents.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts });
  }

  // Gemini model name: use as-is if it already has 'models/' prefix, otherwise add it
  const geminiModel = model.startsWith('models/') ? model : `models/${model}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${geminiModel}:generateContent?key=${apiKey}`;
  console.log('[analyze] Gemini URL model:', geminiModel);
  const body = {
    contents: geminiContents,
    generationConfig: {
      maxOutputTokens: 65536,
      temperature: 0.1,
      thinkingConfig: { thinkingBudget: 0 }  // disable thinking tokens to maximize output
    }
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: data.error?.message || 'Gemini error: ' + JSON.stringify(data).substring(0,200) });

  const part = data.candidates?.[0]?.content?.parts?.[0];
  let text = '';
  if (typeof part?.text === 'string') text = part.text;
  else if (part?.text) text = JSON.stringify(part.text);
  else if (part) text = JSON.stringify(part);

  const finishReason = data.candidates?.[0]?.finishReason;
  const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
  console.log(`[gemini] finish:${finishReason} tokens:${outputTokens} textLen:${text.length}`);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    content: [{ type: 'text', text }],
    stop_reason: finishReason === 'STOP' ? 'end_turn' : (finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn'),
    usage: { output_tokens: outputTokens }
  });
}

async function callOpenAI(req, res, { model, max_tokens, system, messages }) {
  const apiKey = process.env.OPENAI_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_KEY no configurada en Vercel' });

  const oaiMessages = [];
  if (system) oaiMessages.push({ role: 'system', content: system });
  for (const msg of messages) {
    const content = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content }];
    const parts = content.map(p => {
      if (p.type === 'text') return { type: 'text', text: p.text };
      if (p.type === 'image') return { type: 'image_url', image_url: { url: `data:${p.source.media_type};base64,${p.source.data}` } };
      return { type: 'text', text: '[documento PDF]' };
    });
    oaiMessages.push({ role: msg.role, content: parts });
  }

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, max_tokens, messages: oaiMessages, response_format: { type: 'json_object' } })
  });
  const data = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: data.error?.message || 'OpenAI error' });

  const text = data.choices?.[0]?.message?.content || '';
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    content: [{ type: 'text', text }],
    stop_reason: data.choices?.[0]?.finish_reason === 'stop' ? 'end_turn' : 'max_tokens',
    usage: { output_tokens: data.usage?.completion_tokens || 0 }
  });
}
