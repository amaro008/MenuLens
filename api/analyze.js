// api/analyze.js — streaming proxy: Claude + Gemini
// Streaming evita el timeout de Vercel Hobby (10s)
export const config = {
  api: {
    bodyParser: { sizeLimit: '20mb' },
    responseLimit: false
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { model: reqModel, max_tokens, system, messages } = req.body;
  const model = reqModel || process.env.ACTIVE_MODEL || 'claude-sonnet-4-6';

  const provider = model.startsWith('gemini') ? 'gemini' : 'claude';

  try {
    if (provider === 'gemini') return await callGemini(req, res, { model, max_tokens, system, messages });
    return await callClaude(req, res, { model, max_tokens, system, messages });
  } catch(e) {
    console.error('[analyze]', e.message);
    if (!res.headersSent) return res.status(500).json({ error: e.message });
  }
}

// ── CLAUDE ────────────────────────────
async function callClaude(req, res, { model, max_tokens, system, messages }) {
  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_KEY no configurada' });

  const approxTokens = Math.round((system||'').length / 4);
  if (approxTokens > 180000) return res.status(400).json({ error: `Prompt demasiado grande (~${approxTokens} tokens)` });

  console.log(`[claude] model:${model} ~${approxTokens}tok max_tokens:${max_tokens}`);

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
  if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'Claude error' });

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(data);
}

// ── GEMINI ────────────────────────────
async function callGemini(req, res, { model, max_tokens, system, messages }) {
  const apiKey = process.env.GEMINI_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_KEY no configurada en Vercel' });

  // Convert Anthropic format → Gemini
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

  const geminiModel = model.startsWith('models/') ? model : `models/${model}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${geminiModel}:generateContent?key=${apiKey}`;

  const body = {
    contents: geminiContents,
    generationConfig: {
      maxOutputTokens: 65536,
      temperature: 0.1,
      thinkingConfig: { thinkingBudget: 0 }
    }
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  console.log(`[gemini] model:${geminiModel} max_out:65536`);

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: data.error?.message || 'Gemini error: ' + JSON.stringify(data).substring(0,200) });

  const part = data.candidates?.[0]?.content?.parts?.[0];
  let text = typeof part?.text === 'string' ? part.text : JSON.stringify(part || {});
  const finishReason = data.candidates?.[0]?.finishReason || '';
  console.log(`[gemini] finish:${finishReason} textLen:${text.length}`);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    content: [{ type: 'text', text }],
    stop_reason: finishReason === 'STOP' ? 'end_turn' : 'max_tokens',
    usage: { output_tokens: data.usageMetadata?.candidatesTokenCount || 0 }
  });
}
