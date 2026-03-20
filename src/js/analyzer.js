// ══════════════════════════════════════
// analyzer.js — análisis con Claude API
// ══════════════════════════════════════

// ── CATALOG ───────────────────────────
let catalogData = [];

function loadCatalogFromStorage() {
  try {
    const saved = localStorage.getItem('ml_catalog');
    if (saved) catalogData = JSON.parse(saved);
  } catch(e) {}
  return catalogData;
}

// ── BUILD SYSTEM PROMPT ───────────────
function buildSystemPrompt() {
  const catalogSummary = catalogData.slice(0, 400).map(r =>
    `SKU:${r.SKU||r.sku||''}|Material:${r.Material||r.material||''}|Marca:${r.Marca||r.marca||''}|Familia:${r.Familia||r.familia||''}|Línea:${r['Línea de Ventas']||r.linea_ventas||''}`
  ).join('\n');

  return `Eres un experto analizador de menús de restaurantes para distribuidoras de alimentos. Sigues reglas estrictas.

CATÁLOGO DE PRODUCTOS DISPONIBLE:
${catalogSummary || 'SIN CATÁLOGO — debes avisar que no puedes hacer matching'}

REGLAS ESTRICTAS (NO NEGOCIABLES):
- NO inventar ingredientes, SKUs, marcas o productos
- SOLO extraer ingredientes explícitos en el menú
- NO asumir toppings o recetas implícitas (ej: lechuga, pepinillos)
- Si algo es ambiguo: conservar texto original, marcar como AMBIGUO
- Si el menú no es legible: indicar en menu_quality_note
- Si no hay catálogo: clasificar todo como No encontrado y avisar en hallazgos
- NO forzar matches

ASUNCIONES CONTROLADAS (marcar implicit: true):
- Hamburguesa/Burger → "carne para hamburguesa (patty)"
- Hot dog/Perro → "salchicha"
- Alitas/Wings → "alitas de pollo"
- Tacos sin especificar → "proteína para tacos (AMBIGUA)"  
- Panadería (croissant, brioche, muffin, concha) → "mantequilla"
- NO aplicar en pan de sándwich, hamburguesa, torta o tortillas

INGREDIENTE VENDIBLE — SÍ incluir:
proteínas, carnes frías/embutidos, quesos/lácteos, panes/masas,
vegetales o frutas identificables, salsas explícitas, condimentos relevantes

NO incluir: adjetivos, técnicas de cocción, sensaciones, "salsa de la casa"

PRIORIDAD COMERCIAL:
P1: Proteínas premium (ribeye, new york, filetes, mariscos, costillas)
P2: Proteínas generales (res, pollo, cerdo, pescado)
P3: Carnes frías/embutidos
P4: Quesos y lácteos
P5: Resto

TIPOS DE COMIDA — elige el más cercano:
Mexicana, Italiana, Americana, Mariscos, Asiática, Mediterránea,
Panadería/Café, Fast Food, Saludable/Vegana, Internacional, Fusión, Otra

MATCHING — normalización:
- Minúsculas, sin acentos, singular/plural
- Buscar en campo Material usando término núcleo
- "queso manchego" → buscar "manchego" en Material
- Empates: elegir mejor candidato + hasta 3 alternativas
- Confianza Alta=match casi exacto, Media=variante, Baja=débil

RESPONDE SOLO con este JSON válido, sin texto adicional ni bloques de código:
{
  "restaurant_name": "string",
  "food_type": "string",
  "summary": {
    "total_dishes": 0,
    "sellable_ingredients": 0,
    "exact_matches": 0,
    "approx_matches": 0,
    "not_found": 0,
    "key_findings": ["max 3 hallazgos"],
    "menu_quality_note": "string",
    "top10_skus": [{"sku":"","material":"","brand":"","mentions":0}]
  },
  "dishes": [{"name":"","category":"","price":"","ingredients":[{"name":"","implicit":false,"ambiguous":false}]}],
  "sku_table": [{"rank":1,"sku":"","material":"","brand":"","type":"","priority":"P1","mentions":0}],
  "matching_table": [{
    "ingredient":"","sku":"","material":"","brand":"","family":"","sales_line":"",
    "match_type":"Exacto","confidence":"Alta","confidence_reason":"",
    "priority":"P1","alternatives":[{"sku":"","material":""}]
  }],
  "gaps": ["ingredientes frecuentes no cubiertos por el catálogo"],
  "avg_price": 0
}`;
}

// ── CALL CLAUDE API ───────────────────
async function callClaudeAnalysis(fileBase64, fileType, bizName, bizCity) {
  const apiKey = Config.anthropicKey();
  if (!apiKey) throw new Error('Configura el Anthropic API Key en el panel de admin');

  const mediaType = fileType === 'application/pdf' ? 'application/pdf' : (fileType || 'image/jpeg');
  const isPdf = fileType === 'application/pdf';

  const userContent = [
    {
      type: isPdf ? 'document' : 'image',
      source: { type: 'base64', media_type: mediaType, data: fileBase64 }
    },
    {
      type: 'text',
      text: `Restaurante: "${bizName}"${bizCity ? `, ubicado en ${bizCity}` : ''}.\nAnaliza este menú siguiendo todas las reglas del sistema. Responde SOLO con JSON válido.`
    }
  ];

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8096,
      system: buildSystemPrompt(),
      messages: [{ role: 'user', content: userContent }]
    })
  });

  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.error?.message || 'Error en Claude API (' + resp.status + ')');
  }

  const data = await resp.json();
  const text = data.content[0].text.trim().replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(text);
  } catch(e) {
    throw new Error('La IA devolvió un formato inesperado. Intenta de nuevo.');
  }
}

// ── SAVE TO DB ────────────────────────
async function saveAnalysisToDB(analysisData, user) {
  const sb = getSupabase();
  if (!sb || !user) return null;

  const biz = analysisData.restaurant_name || analysisData.bizName;

  // Upsert restaurant
  const { data: rest, error: restErr } = await sb.from('restaurants').upsert({
    name: biz,
    city: analysisData.bizCity || null,
    food_type: analysisData.food_type || null,
    maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(biz)}`
  }, { onConflict: 'name,city' }).select().single();

  if (restErr) console.warn('Restaurant upsert:', restErr.message);

  // Insert analysis
  const { data: analysis, error: anaErr } = await sb.from('analyses').insert({
    user_id: user.id,
    restaurant_id: rest?.id || null,
    status: 'complete',
    duration_ms: analysisData.duration || 0,
    dish_count: analysisData.summary?.total_dishes || 0,
    sku_count: (analysisData.sku_table || []).length,
    avg_price: analysisData.avg_price || 0,
    raw_json: analysisData
  }).select().single();

  if (anaErr) { console.error('Analysis insert:', anaErr.message); return null; }

  // Ingredients
  const ings = (analysisData.matching_table || []).map(r => ({
    analysis_id: analysis.id,
    ingredient_name: r.ingredient,
    priority: r.priority || 'P5',
    match_type: r.match_type,
    mentions: 1,
    implicit: false,
    ambiguous: (r.ingredient || '').includes('AMBIGUA')
  }));
  if (ings.length) await sb.from('ingredients').insert(ings);

  // SKU matches
  const matches = (analysisData.sku_table || []).map(r => ({
    analysis_id: analysis.id,
    sku: r.sku, material: r.material, brand: r.brand || null,
    priority: r.priority || 'P5', mentions: r.mentions || 1, rank: r.rank
  }));
  if (matches.length) await sb.from('sku_matches').insert(matches);

  // Menu items
  const items = (analysisData.dishes || []).map(d => ({
    analysis_id: analysis.id,
    name: d.name, category: d.category || null,
    price: parseFloat(d.price) || null, description: d.description || null
  }));
  if (items.length) await sb.from('menu_items').insert(items);

  return analysis.id;
}

// ── STORE CURRENT RESULT ──────────────
function storeCurrentAnalysis(data) {
  sessionStorage.setItem('ml_current_analysis', JSON.stringify(data));
}

function getCurrentAnalysis() {
  try {
    const raw = sessionStorage.getItem('ml_current_analysis');
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}
