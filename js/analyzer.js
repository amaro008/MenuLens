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

// ── SMART CATALOG FILTER ─────────────
// Strategy: always send ALL protein families first (RES, AVES, PESCADOS, CERDO, CARNES FRIAS)
// then fill remaining slots with other families
// This guarantees protein matches regardless of catalog size
function buildSmartCatalogSummary() {
  if (!catalogData.length) return 'SIN CATÁLOGO CARGADO';

  // Priority families — always include ALL products from these
  const PRIORITY_FAMILIES = [
    'RES', 'AVES', 'PESCADOS Y MARISCOS', 'CERDO',
    'CARNES FRIAS', 'CORDERO Y OTROS', 'COMIDAS PREPARADAS'
  ];

  // Secondary families — include sample
  const SECONDARY_FAMILIES = [
    'QUESOS', 'YOGHURT', 'CREMAS', 'MNTQUILLAS Y MARGARI',
    'PANES Y PASTELES', 'FRUTAS Y VERDURAS', 'VIGAR'
  ];

  const normalize = (str) => (str || '').toString().trim().toUpperCase();

  const priorityProducts = [];
  const secondaryProducts = [];
  const otherProducts = [];

  catalogData.forEach(r => {
    const familia = normalize(r.Familia || r.familia || '');
    const keywords = r.Keywords || r.keywords || r.KEYWORDS || '';
    const line = `SKU:${r.SKU||r.sku||''}|Material:${r.Material||r.material||''}|Marca:${r.Marca||r.marca||''}|Familia:${familia}|Sublinea:${r['Sublínea']||r.sublinea||''}|Línea:${r['Línea de Ventas']||r.linea_ventas||''}${keywords ? '|Keywords:'+keywords : ''}`;

    if (PRIORITY_FAMILIES.includes(familia)) {
      priorityProducts.push(line);
    } else if (SECONDARY_FAMILIES.includes(familia)) {
      secondaryProducts.push(line);
    } else {
      otherProducts.push(line);
    }
  });

  // Build final list: ALL priority + up to 200 secondary + up to 100 other
  const finalList = [
    ...priorityProducts,
    ...secondaryProducts.slice(0, 200),
    ...otherProducts.slice(0, 100)
  ];

  console.log(`Catalog filter: ${catalogData.length} total → ${priorityProducts.length} protein + ${Math.min(secondaryProducts.length,200)} secondary + ${Math.min(otherProducts.length,100)} other = ${finalList.length} sent to Claude`);

  return finalList.join('\n');
}

// ── BUILD SYSTEM PROMPT ───────────────
function buildSystemPrompt() {
  const catalogSummary = buildSmartCatalogSummary();

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

PRIORIDAD COMERCIAL (MUY IMPORTANTE — define el orden de todo):
P1: Proteínas premium (ribeye, new york, filetes, mariscos, costillas, langosta, pulpo, camarón, arrachera)
P2: Proteínas generales (res, pollo, cerdo, pescado, atún)
P3: Carnes frías/embutidos (chorizo, jamón, salchicha, tocino)
P4: Quesos y lácteos
P5: Resto (salsas, condimentos, mieles, bebidas, aceites, etc.)

REGLA CRÍTICA PARA TOP 10: El top10_skus DEBE ordenarse PRIMERO por prioridad (P1 antes que P2, P2 antes que P3, etc.) y SOLO usar menciones como desempate entre productos de la MISMA prioridad. Un producto P1 con 1 mención SIEMPRE va antes que un producto P5 con 10 menciones. Las proteínas premium SIEMPRE lideran el top 10.

TIPOS DE COMIDA — elige el más cercano:
Mexicana, Italiana, Americana, Mariscos, Asiática, Mediterránea,
Panadería/Café, Fast Food, Saludable/Vegana, Internacional, Fusión, Otra

MATCHING — normalización, contexto y estrategia:

REGLA DE CONTEXTO (CRÍTICA para desambiguar):
- Si el platillo es tostada, ceviche, aguachile, ensalada, carpaccio, sashimi, filete, a la parrilla, al ajillo, a la mantequilla, o precio > $100 → preferir Familia:PESCADOS Y MARISCOS o RES (producto FRESCO) sobre ABARROTES (conserva/lata)
- Si el platillo es sándwich, torta, emparedado, pasta, o precio < $80 → puede ser conserva/lata
- "atún" en tostada/ceviche/ensalada → PESCADOS Y MARISCOS (fresco), NO ABARROTES (lata)
- "atún" en sándwich → ABARROTES puede ser válido
- Usar Keywords del catálogo si están disponibles para confirmar el match

ESTRATEGIA DE BÚSQUEDA:
1. Primero verificar si hay Keywords en el catálogo que coincidan con el ingrediente o platillo
2. Para proteínas: buscar en Sublinea y Familia (más confiable que Material)
   - "camarón" → Sublinea:CAMARON, Familia:PESCADOS Y MARISCOS
   - "arrachera" → Sublinea:ARRACHERA, Familia:RES
   - "ribeye/rib eye" → Sublinea:RIBEYE, Familia:RES
   - "pollo/alita/pechuga" → Familia:AVES
   - "costillas" → Sublinea con COSTILL o RIB, Familia:RES o CERDO
   - "chorizo" → Familia:CARNES FRIAS, Sublinea:CHORIZO
   - "pulpo" → Sublinea:PULPO, Familia:PESCADOS Y MARISCOS
   - "langosta" → Sublinea:LANGOSTA, Familia:PESCADOS Y MARISCOS
   - "atún fresco/filete" → Familia:PESCADOS Y MARISCOS (NO ABARROTES)
3. Para otros: buscar en Material usando término núcleo
4. Material está en MAYÚSCULAS: "RIBEYE LIPON 112A CAB SWIFT" — buscar substring
5. Normalizar: sin acentos, mayúsculas, buscar substring no exacto
6. Empates: elegir mejor candidato usando contexto del platillo + hasta 3 alternativas
7. Confianza Alta=match en Sublinea/Familia+contexto, Media=variante Material, Baja=débil

REGLA TOP 10 — ORDEN OBLIGATORIO:
1. Agrupa todos los matches por prioridad
2. Dentro de P1: ordena por menciones desc
3. Luego P2 por menciones, luego P3, P4, P5
4. NUNCA un P5 aparece antes que un P1 en el top10
5. Si hay menos de 10 productos P1+P2, completa con P3, P4, P5
6. El top10 refleja OPORTUNIDAD COMERCIAL, no frecuencia de texto

INSTRUCCIÓN CRÍTICA: Tu respuesta debe comenzar EXACTAMENTE con el carácter { y terminar con }. 
CERO texto antes o después. CERO bloques de código. CERO explicaciones. SOLO el JSON puro:
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
    "top10_skus": [{"sku":"","material":"","brand":"","mentions":0,"priority":"P1","dishes":["platillo donde aparece"]}]
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

// ── CALL CLAUDE API via Vercel proxy ──
async function callClaudeAnalysis(fileBase64, fileType, bizName, bizCity) {
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

  // Llamar a /api/analyze (proxy serverless en Vercel — evita CORS)
  const resp = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8096,
      system: buildSystemPrompt(),
      messages: [{ role: 'user', content: userContent }]
    })
  });

  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.error || 'Error en el análisis (' + resp.status + ')');
  }

  const data = await resp.json();
  const raw = data.content[0].text.trim();

  // Try multiple extraction strategies
  let parsed = null;

  // Strategy 1: direct parse
  try { parsed = JSON.parse(raw); } catch(e) {}

  // Strategy 2: strip markdown code blocks
  if (!parsed) {
    try {
      const stripped = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      parsed = JSON.parse(stripped);
    } catch(e) {}
  }

  // Strategy 3: extract first { ... } block
  if (!parsed) {
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch(e) {}
  }

  // Strategy 4: find JSON after any preamble text
  if (!parsed) {
    try {
      const idx = raw.indexOf('{');
      if (idx > -1) parsed = JSON.parse(raw.substring(idx));
    } catch(e) {}
  }

  if (!parsed) {
    console.error('Raw response:', raw.substring(0, 500));
    throw new Error('La IA devolvió un formato inesperado. Intenta de nuevo con una imagen más clara.');
  }

  return parsed;
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
