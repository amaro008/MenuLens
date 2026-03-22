// ══════════════════════════════════════
// analyzer.js — análisis con Claude API
// ══════════════════════════════════════

// ── DEBUG LOGGER ─────────────────────
function dbg(msg, type = 'info') {
  const colors = { info: '#00ff88', warn: '#ffcc00', error: '#ff4444' };
  console.log(`[ML:${type}]`, msg);

  // Save to sessionStorage so log persists across pages
  try {
    const logs = JSON.parse(sessionStorage.getItem('ml_debug_log') || '[]');
    logs.push({ msg, type, ts: new Date().toLocaleTimeString('es') });
    if (logs.length > 50) logs.shift(); // keep last 50
    sessionStorage.setItem('ml_debug_log', JSON.stringify(logs));
  } catch(e) {}

  // Show in panel if it exists on this page
  const panel = document.getElementById('debugPanel');
  if (panel) {
    panel.style.display = 'block';
    const line = document.createElement('div');
    line.style.color = colors[type] || '#00ff88';
    line.textContent = `[${new Date().toLocaleTimeString('es')}] ► ${msg}`;
    panel.appendChild(line);
    panel.scrollTop = panel.scrollHeight;
  }
}

// ── CATALOG ───────────────────────────
let catalogData = [];
let _catalogLoaded = false;

function loadCatalogFromStorage() {
  // Fallback: load from localStorage if Supabase not available
  try {
    const saved = localStorage.getItem('ml_catalog');
    if (saved) catalogData = JSON.parse(saved);
  } catch(e) {}
  return catalogData;
}

async function loadCatalogFromSupabase() {
  if (_catalogLoaded && catalogData.length > 0) return catalogData;
  try {
    dbg('Cargando catálogo desde Supabase...');
    // Send JWT so server can filter catalog by user's office
    let catHeaders = {};
    try {
      const sb = window._mlSupabase;
      if (sb) {
        const { data: { session } } = await sb.auth.getSession();
        if (session?.access_token) catHeaders = { 'Authorization': `Bearer ${session.access_token}` };
      }
    } catch(e) {}
    const resp = await fetch('/api/catalog', { headers: catHeaders });
    if (resp.ok) {
      const data = await resp.json();
      if (data.products && data.products.length > 0) {
        // Normalize field names to match expected format
        catalogData = data.products.map(p => ({
          SKU: p.sku, Material: p.material, Marca: p.marca,
          Familia: (p.familia || '').toUpperCase(),
          'Sublínea': p.sublinea,
          'Línea de Ventas': p.linea_ventas,
          Keywords: p.keywords || ''
        }));
        _catalogLoaded = true;
        dbg(`✅ Catálogo cargado: ${data.priority_count} proteínas + ${data.total - data.priority_count} otros = ${data.total} total`);
        return catalogData;
      }
    }
  } catch(e) {
    dbg(`⚠️ Error cargando desde Supabase: ${e.message} — usando localStorage`, 'warn');
  }
  // Fallback to localStorage
  loadCatalogFromStorage();
  dbg(`📦 Catálogo desde localStorage: ${catalogData.length} productos`);
  return catalogData;
}

// ── SUBLINEA SYNONYM MAP ─────────────
// Built dynamically from the actual catalog sublíneas
// Maps menu terms → catalog sublínea names
// This is the permanent solution — no keywords needed for standard cuts
function buildSublineaSynonymMap() {
  const sublineas = [...new Set(
    catalogData
      .filter(r => r.Familia && ['RES','AVES','PESCADOS Y MARISCOS','CERDO','CARNES FRIAS','CORDERO Y OTROS']
        .includes((r.Familia||'').toUpperCase()))
      .map(r => (r['Sublínea'] || r.sublinea || '').toString().trim().toUpperCase())
      .filter(Boolean)
  )];

  // Static synonym map — common menu terms → catalog sublínea names
  const SYNONYMS = {
    // Res
    'arrachera': ['ARRACHERA','OUTSIDE SKIRT','INSIDE SKIRT'],
    'skirt steak': ['ARRACHERA','OUTSIDE SKIRT','INSIDE SKIRT'],
    'ribeye': ['RIBEYE','RIB STEAK','EXPORT RIB'],
    'rib eye': ['RIBEYE','RIB STEAK','EXPORT RIB'],
    'new york': ['NEW YORK','TOP SIRLOIN'],
    't-bone': ['T-BONE'],
    'tbone': ['T-BONE'],
    'cowboy': ['COWBOY'],
    'cowboy steak': ['COWBOY'],
    'tomahawk': ['TOMAHAWK'],
    'picaña': ['PICAÑA'],
    'picana': ['PICAÑA'],
    'short rib': ['SHORT RIBS','RIBS'],
    'shortrib': ['SHORT RIBS'],
    'costilla de res': ['SHORT RIBS','RIBS'],
    'brisket': ['BRISKET'],
    'sirloin': ['SIRLOIN','TOP SIRLOIN'],
    'filete de res': ['FILETE'],
    'flat iron': ['FLAT IRON'],
    'tri tip': ['TRI TIP'],
    'porterhouse': ['PORTERHOUSE','T-BONE'],
    // Cerdo
    'costilla de cerdo': ['BACK RIB','SPARE RIB','COSTILLAS'],
    'back rib': ['BACK RIB'],
    'spare rib': ['SPARE RIB'],
    'pork belly': ['PORK BELLY'],
    'chamorro': ['CHAMORRO'],
    'lomo de cerdo': ['LOMO'],
    'chuleta': ['CHULETA NATURAL','CHULETA AHUMADA'],
    // Aves
    'pechuga': ['PECHUGA'],
    'alita': ['ALAS'],
    'alitas': ['ALAS'],
    'wings': ['ALAS'],
    'pollo entero': ['ENTERO'],
    'boneless': ['BONELESS'],
    'nuggets': ['NUGGETS'],
    'pierna': ['PIERNA Y MUSLO'],
    // Mariscos
    'camarón': ['CAMARON'],
    'camaron': ['CAMARON'],
    'shrimp': ['CAMARON'],
    'pulpo': ['PULPO'],
    'langosta': ['LANGOSTA'],
    'salmón': ['SALMON'],
    'salmon': ['SALMON'],
    'atún fresco': ['ATUN'],
    'atun fresco': ['ATUN'],
    'tilapia': ['TILAPIA'],
    'basa': ['BASA'],
    // Carnes frías
    'chorizo': ['CHORIZOS','CHORIZOS FRESCOS'],
    'jamón': ['JAMON COCIDO','JAMON PIERNA','JAMON VIRGINIA'],
    'tocino': ['TOCINO REBANADO'],
    'salchicha': ['SALCHICHA TRADICIONA','SALCHICHA ASAR'],
    'pepperoni': ['PEPPERONI','PEPPERONI COCIDO'],
    'pastrami': ['PASTRAMI'],
    'salami': ['SALAMI COCIDO','SALAMI MADURADO'],
  };

  // Build active map — only include sublíneas that exist in loaded catalog
  const activeMap = {};
  Object.entries(SYNONYMS).forEach(([term, subs]) => {
    const activeSubs = subs.filter(s => sublineas.includes(s));
    if (activeSubs.length > 0) {
      activeMap[term] = activeSubs;
    }
  });

  return activeMap;
}

// ── SMART CATALOG FILTER ─────────────
function buildSmartCatalogSummary() {
  if (!catalogData.length) return 'SIN CATÁLOGO CARGADO';

  // Priority families — always include ALL products from these
  // Nivel 1 — Siempre incluidos completos sin límite
  const PRIORITY_FAMILIES = [
    'RES', 'AVES', 'PESCADOS Y MARISCOS', 'CERDO',
    'CARNES FRIAS', 'CORDERO Y OTROS', 'COMIDAS PREPARADAS',
    'QUESOS'  // Alta demanda en todo tipo de restaurante
  ];

  // Nivel 2 — Incluidos hasta llenar presupuesto de chars
  const SECONDARY_FAMILIES = [
    'CREMAS', 'MNTQUILLAS Y MARGARI', 'YOGHURT',
    'PANES Y PASTELES', 'VIGAR', 'ABARROTES'
  ];

  // Sublíneas especiales — siempre incluidas aunque familia sea secundaria
  const PRIORITY_SUBLINEAS = [
    'AVELLANA',    // Nutella
    'QUESO CREMA', // Philadelphia (por si aparece fuera de QUESOS)
    'UNTABLES',    // Untables premium
    'CLARAS',      // Claras de huevo
    'CHOCOLATE',   // Syrup de chocolate
  ];

  const normalize = (str) => (str || '').toString().trim().toUpperCase();

  const priorityProducts = [];
  const secondaryProducts = [];
  const otherProducts = [];

  catalogData.forEach(r => {
    const familia   = normalize(r.Familia || r.familia || '');
    const keywords  = r.Keywords || r.keywords || r.KEYWORDS || '';
    const mat       = (r.Material||r.material||'').substring(0,35);
    const sub       = r['Sublínea']||r.sublinea||'';
    const line      = keywords
      ? `${r.SKU||r.sku}|${mat}|${familia}|${sub}|${keywords}`
      : `${r.SKU||r.sku}|${mat}|${familia}|${sub}`;

    // Priority sublineas → always included regardless of family
    const sublinea = (r['Sublínea']||r.sublinea||'').toUpperCase();
    const isPrioritySublinea = PRIORITY_SUBLINEAS.some(s => sublinea.includes(s));
    const isPremiumAbarrotes = keywords.toLowerCase().includes('premium_abarrotes');

    if (PRIORITY_FAMILIES.includes(familia) || isPrioritySublinea || isPremiumAbarrotes) {
      priorityProducts.push(line);
    } else if (SECONDARY_FAMILIES.includes(familia)) {
      secondaryProducts.push(line);
    } else {
      otherProducts.push(line);
    }
  });

  // Scale catalog size based on number of pages being analyzed
  // More pages = bigger request body = need smaller catalog
  const pageCount = window._currentFileCount || 1;
  const maxCatalogChars = pageCount >= 4 ? 35000
    : pageCount === 3 ? 45000
    : pageCount === 2 ? 55000
    : 70000;

  const combined = [
    ...priorityProducts,
    ...secondaryProducts.slice(0, 150),
    ...otherProducts.slice(0, 50)
  ];

  // Trim to char budget
  let finalList = [];
  let charCount = 0;
  for (const line of combined) {
    if (charCount + line.length > maxCatalogChars) break;
    finalList.push(line);
    charCount += line.length + 1;
  }

  dbg(`Catálogo: ${catalogData.length} total → ${priorityProducts.length} proteína → ${finalList.length} enviados (~${Math.round(charCount/1000)}k chars, ${pageCount} páginas)`);

  return finalList.join('\n');
}

// ── BUILD SYSTEM PROMPT ───────────────
function buildSystemPrompt() {
  const catalogSummary = buildSmartCatalogSummary();
  const synonymMap = buildSublineaSynonymMap();

  // Format synonym map for the prompt
  const synonymMapText = Object.entries(synonymMap)
    .map(([term, subs]) => `  "${term}" → Sublínea: ${subs.join(' o ')}`)
    .join('\n');

  return buildSystemPromptWithCatalog(catalogSummary, synonymMapText);
}

function buildSystemPromptWithCatalog(catalogSummary, synonymMapText = "") {
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
- Crepa dulce con Nutella → extraer "nutella" como ingrediente explícito
- Omelette/Crepa de claras → extraer "claras de huevo" como ingrediente explícito
- Cualquier platillo con "queso crema" en descripción → extraer "queso crema"
- Cualquier platillo con "Oreo" → extraer "galleta Oreo"
- NO aplicar en pan de sándwich, hamburguesa, torta o tortillas

INGREDIENTE VENDIBLE — SÍ incluir:
proteínas, carnes frías/embutidos, quesos/lácteos, panes/masas,
salsas explícitas, condimentos relevantes

PRODUCTOS DE MARCA — SIEMPRE incluir y buscar en catálogo:
- Nutella → buscar "CREMA AVELLANA" o "NUTELLA" en catálogo
- Biscoff/Speculoos → buscar "SPECULOOS" o "GALLETA SPECULOOS"
- Oreo → buscar "GALLETA OREO" o "OREO"
- Cajeta → buscar "CAJETA" en catálogo
- Crema de cacahuate → buscar "CREMA CACAHUATE"
- Queso crema → buscar "QUESO CREMA" en familia QUESOS
- Clara de huevo → buscar "CLARA" o "CLARAS" en catálogo
- Crema batida/chantilly → buscar "CREMA BATIDA" o "CHANTILLY"
- Maple/mermelada → buscar en UNTABLES o ABARROTES

NO incluir: adjetivos, técnicas de cocción, sensaciones, "salsa de la casa"
NO incluir como ingrediente vendible: frutas frescas (fresa, mango, plátano, naranja, etc.)
  verduras frescas (espinaca, lechuga, tomate, pepino, etc.), hierbas frescas (cilantro, etc.)

PRIORIDAD COMERCIAL (MUY IMPORTANTE — define el orden de todo):
P1: Proteínas premium (ribeye, new york, filetes, mariscos, costillas, langosta, pulpo, camarón, arrachera)
P2: Proteínas generales (res, pollo, cerdo, pescado, atún)
P3: Carnes frías/embutidos (chorizo, jamón, salchicha, tocino)
P4: Quesos y lácteos
P5: Resto (salsas, condimentos, mieles, bebidas, aceites, etc.)



TIPOS DE COMIDA — elige el más cercano:
Mexicana, Italiana, Americana, Steakhouse, Marisquería, Pizzería,
Asiática, Mediterránea, Panadería/Café, Saludable/Vegana, Internacional, Fusión, Otra

ANÁLISIS DE PRECIOS (OBLIGATORIO):
- Clasificar cada platillo en: entrada, platillo, postre, bebida, otro
- NO incluir bebidas en los promedios de precio
- Calcular precio promedio SOLO para: entrada, platillo, postre (por separado)
- price_tier: economico (platillos avg < $100), medio ($100-$250), premium (> $250)
- dominant_protein: la proteína más frecuente en el menú (res/pollo/mariscos/cerdo/vegetal/mixto)
- menu_diversity: score 1-10 de variedad de opciones (1=muy limitado, 10=muy variado)
- Para cada platillo extraer:
  - category_type: entrada|platillo|postre|bebida|otro
  - price_num: precio como número (0 si no hay precio)
  - protein_type: res|pollo|mariscos|cerdo|vegetal|ninguna
  - cooking_method: parrilla|frito|vapor|crudo|horneado|otro
  - is_premium: true si price_num > avg_platillos del menú

MATCHING — normalización, contexto y estrategia:

REGLA DE CONTEXTO (CRÍTICA para desambiguar):
- Si el platillo es tostada, ceviche, aguachile, ensalada, carpaccio, sashimi, filete, a la parrilla, al ajillo, a la mantequilla, o precio > $100 → preferir Familia:PESCADOS Y MARISCOS o RES (producto FRESCO) sobre ABARROTES (conserva/lata)
- Si el platillo es sándwich, torta, emparedado, pasta, o precio < $80 → puede ser conserva/lata
- "atún" en tostada/ceviche/ensalada → PESCADOS Y MARISCOS (fresco), NO ABARROTES (lata)
- "atún" en sándwich → ABARROTES puede ser válido
- Usar Keywords del catálogo si están disponibles para confirmar el match

MAPA DE SUBLÍNEAS — PUNTO DE PARTIDA PARA MATCHING:
${synonymMapText || "(mapa no disponible)"}

ESTRATEGIA DE MATCHING EN 3 PASOS:

PASO 1 — IDENTIFICAR FAMILIA/SUBLÍNEA:
- Usar el mapa de arriba como punto de partida
- Términos genéricos o en plural → mapear a la Familia:
  "quesos" → QUESOS | "mariscos" → PESCADOS Y MARISCOS | "embutidos" → CARNES FRIAS

PASO 2 — ELEGIR SKU ESPECÍFICO POR CONTEXTO DEL PLATILLO:
Dentro de la familia, elegir el producto más lógico según nombre y precio del platillo:
- "queso fundido/derretido" → MANCHEGO, GOUDA, OAXACA
- "ensalada con queso" → PANELA, COTIJA, FETA
- "pizza/pasta" → MOZZARELLA, PARMESANO, MANCHEGO
- "costillas BBQ" → BACK RIB o SPARE RIB cerdo
- "costillas res" → SHORT RIBS
- "camarón al ajillo/mantequilla" → camarón fresco grande (31/40+)
- "ceviche/aguachile" → camarón fresco mediano
- Precio > $300 → preferir premium (CAB, PRIME, VIGAR BLACK)
- Precio $100-300 → estándar (CAB, COMNOR CHOICE)
- Precio < $100 → económico o nacional

PASO 3 — REPORTAR:
- Match por Sublínea → Confianza Alta
- Match por Material → Confianza Media
RECOMENDACIONES — OBLIGATORIO SIEMPRE 5 PUNTOS:
Genera exactamente 5 recomendaciones estratégicas para el asesor de ventas:
1. (type:"producto") Ingrediente/línea principal: mayor volumen, producto específico a ofrecer
2. (type:"pitch") Tier del restaurante: qué línea recomendar (premium vs estándar) basado en precios
3. (type:"pitch") Táctica de entrada: cómo iniciar la conversación, qué producto usar como gancho
4. (type:"oportunidad") Gap o área de oportunidad: algo que usan pero podría mejorarse o ampliarse
5. (type:"oportunidad") Potencial de la cuenta: volumen estimado mensual, productos ancla, frecuencia
Cada punto: title (título corto 4-6 palabras), body (2-3 oraciones concretas y accionables), type

ALTERNATIVAS — OBLIGATORIO SIEMPRE:
- TODOS los ingredientes deben tener al menos 2 alternativas en el array alternatives
- Alternativas = otros SKUs de la MISMA sublínea o familia que podrían sustituir al principal
- Ejemplo ribeye: alternatives = [{sku:"70011253", material:"RIBEYE LIPON DE RES 16 OZ CAB"}, {sku:"70011279", material:"RIBEYE LIPON DE RES 8 OZ CAB"}]
- Ejemplo camarón: alternatives = [{sku:"70070094", material:"CAMARON COLOSAL U12"}, {sku:"70070123", material:"CAMARON 16-20 SIN CABEZA"}]
- Si solo hay 1 SKU en la sublínea, busca en sublíneas similares de la misma familia
- NUNCA dejar alternatives: [] vacío si hay más de 1 producto en el catálogo para esa familia

CAMPO dishes EN matching_table — OBLIGATORIO:
- Para CADA ingrediente en matching_table, listar los platillos del menú donde aparece
- Ejemplo: ingrediente "ribeye" → dishes: ["Bife Ancho (Rib-eye) 460gr.", "Parrillada Premium"]
- Máximo 5 platillos por ingrediente
- NUNCA dejar dishes: [] vacío — siempre hay al menos 1 platillo donde aparece

ORDEN DEL ARRAY matching_table — OBLIGATORIO:
- Ordenar TODO el array matching_table de mayor a menor prioridad comercial
- Primero todos los P1 (por menciones desc), luego P2, P3, P4, P5
- Un P1 con 1 mención SIEMPRE va antes que un P5 con 10 menciones
- EXCLUIR del matching_table: frutas frescas (fresa, mango, plátano, manzana, naranja, limón,
  arándano, coco, piña, uva, etc.), verduras frescas (espinaca, lechuga, tomate cherry, pepino,
  arúgula, etc.), hierbas frescas (cilantro, perejil, albahaca, etc.)
  Estos productos NO se venden por una distribuidora de alimentos — no los incluyas


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
  "price_analysis": {
    "avg_entradas": 0,
    "avg_platillos": 0,
    "avg_postres": 0,
    "price_tier": "economico|medio|premium",
    "dominant_protein": "res|pollo|mariscos|cerdo|vegetal|mixto",
    "menu_diversity": 0
  },
  "dishes": [{"name":"","category":"","category_type":"entrada|platillo|postre|bebida|otro","price":"","price_num":0,"description":"","ingredients":[{"name":"","implicit":false,"ambiguous":false}],"protein_type":"","cooking_method":"","is_premium":false}],
  "sku_table": [{"rank":1,"sku":"","material":"","brand":"","type":"","priority":"P1","mentions":0}],
  "matching_table": [{
    "ingredient":"","sku":"","material":"","brand":"","familia":"","sublinea":"",
    "match_type":"Exacto","confidence":"Alta",
    "priority":"P1",
    "dishes":["nombre del platillo donde aparece"],
    "mentions":1,
    "alternatives":[{"sku":"","material":""}]
  }],
  "avg_price": 0,
  "recommendations":[{"title":"","body":"","type":"pitch"}]
}`;
}

// ── REDUCED PROMPT (fallback when catalog is too large) ──
function buildReducedPrompt() {
  // Send only top 200 protein products + 100 others
  const PRIORITY = ['RES','AVES','PESCADOS Y MARISCOS','CERDO','CARNES FRIAS','CORDERO Y OTROS'];
  const priority = catalogData
    .filter(r => PRIORITY.includes((r.Familia||r.familia||'').toUpperCase()))
    .slice(0, 200);
  const others = catalogData
    .filter(r => !PRIORITY.includes((r.Familia||r.familia||'').toUpperCase()))
    .slice(0, 100);
  const reduced = [...priority, ...others];
  console.log(`Reduced catalog: ${reduced.length} products`);

  const catalogSummary = reduced.map(r =>
    `SKU:${r.SKU||r.sku||''}|Material:${r.Material||r.material||''}|Marca:${r.Marca||r.marca||''}|Familia:${(r.Familia||r.familia||'').toUpperCase()}|Sublinea:${r['Sublínea']||r.sublinea||''}`
  ).join('\n');

  return buildSystemPromptWithCatalog(catalogSummary);
}

// ── CALL CLAUDE API via Vercel proxy ──
async function callClaudeAnalysis(files, bizName, bizCity) {
  // Support both old single-file call and new multi-file array
  if (!Array.isArray(files)) {
    files = [{ base64: files, type: arguments[1] }];
    bizName = arguments[2];
    bizCity = arguments[3];
  }

  // Build multi-page content — all files sent as pages of the same menu
  const userContent = [];

  files.forEach((f, i) => {
    const mediaType = f.type === 'application/pdf' ? 'application/pdf' : (f.type || 'image/jpeg');
    const isPdf = f.type === 'application/pdf';
    if (files.length > 1) {
      userContent.push({ type: 'text', text: `Página ${i+1} de ${files.length}:` });
    }
    userContent.push({
      type: isPdf ? 'document' : 'image',
      source: { type: 'base64', media_type: mediaType, data: f.base64 }
    });
  });

  userContent.push({
    type: 'text',
    text: `Restaurante: "${bizName}"${bizCity ? `, ubicado en ${bizCity}` : ''}.\n${files.length > 1 ? `Este menú tiene ${files.length} páginas, analízalas TODAS como un solo menú completo.\n` : ''}Analiza este menú siguiendo todas las reglas del sistema. Responde SOLO con JSON válido.`
  });

  // Build prompt and check size
  const systemPrompt = buildSystemPrompt();
  const approxTokens = Math.round(systemPrompt.length / 4);
  dbg(`Prompt: ~${approxTokens} tokens (${systemPrompt.length} chars)`);

  // If prompt is too large, use a smaller catalog sample
  let finalPrompt = systemPrompt;
  if (approxTokens > 60000) {
    dbg('⚠️ Prompt demasiado grande, usando catálogo reducido...', 'warn');
    finalPrompt = buildReducedPrompt();
  }

  // Llamar a /api/analyze (proxy serverless en Vercel — evita CORS)
  // Auth header for Supabase session
  let authHeader = {};
  try {
    const sb = window._mlSupabase;
    if (sb) {
      const { data: { session } } = await sb.auth.getSession();
      if (session?.access_token) authHeader = { 'Authorization': `Bearer ${session.access_token}` };
    }
  } catch(e) {}

  const activeModel = localStorage.getItem('ml_active_model') || 'claude-sonnet-4-6';
  window._currentFileCount = files.length; // used by catalog builder
  dbg(`Modelo activo: ${activeModel} | Páginas: ${files.length}`);

  const resp = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify({
      model: activeModel,
      max_tokens: 64000,
      system: finalPrompt,
      messages: [{ role: 'user', content: userContent }]
    })
  });

  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.error || 'Error en el análisis (' + resp.status + ')');
  }

  const data = await resp.json();
  const raw = data.content[0].text.trim();
  dbg(`Respuesta Claude (inicio): ${raw.substring(0, 150)}`); dbg(`Stop reason: ${data.stop_reason} | tokens usados: ${data.usage?.output_tokens}`);

  let parsed = null;

  // Strategy 1: direct parse
  try { parsed = JSON.parse(raw); } catch(e) {}

  // Strategy 2: strip ALL markdown fences (handles ```json, ``` json, ~~~, etc)
  if (!parsed) {
    try {
      const stripped = raw
        .replace(/^```[\w ]*[\r\n]*/im, '')
        .replace(/```[\s]*$/im, '')
        .replace(/^~~~[\w ]*[\r\n]*/im, '')
        .replace(/~~~[\s]*$/im, '')
        .trim();
      parsed = JSON.parse(stripped);
    } catch(e) {}
  }

  // Strategy 3: find the LAST complete {...} block (handles trailing text)
  if (!parsed) {
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start > -1 && end > start) {
        parsed = JSON.parse(raw.substring(start, end + 1));
      }
    } catch(e) {}
  }

  // Strategy 4: find JSON after preamble line by line
  if (!parsed) {
    try {
      const lines = raw.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('{')) {
          const attempt = lines.slice(i).join('\n');
          try { parsed = JSON.parse(attempt); break; } catch(e) {}
        }
      }
    } catch(e) {}
  }

  // Strategy 5: aggressive — remove everything before first { and after last }
  if (!parsed) {
    try {
      const cleaned = raw.replace(/^[^{]*/s, '').replace(/[^}]*$/s, '');
      if (cleaned) parsed = JSON.parse(cleaned);
    } catch(e) {}
  }

  if (!parsed) {
    dbg('❌ Todas las estrategias de parsing fallaron', 'error'); dbg(`Respuesta completa: ${raw.substring(0, 500)}`, 'error');
    // Return minimal valid structure so app doesn't crash
    parsed = {
      restaurant_name: '',
      food_type: 'Otra',
      summary: {
        total_dishes: 0, sellable_ingredients: 0,
        exact_matches: 0, approx_matches: 0, not_found: 0,
        key_findings: ['El menú no pudo ser procesado correctamente. Intenta con una imagen más clara o en mejor resolución.'],
        menu_quality_note: 'No se pudo analizar el menú. Verifica que la imagen sea legible.',
        top10_skus: []
      },
      price_analysis: {},
      dishes: [], sku_table: [], matching_table: [], gaps: [], avg_price: 0
    };
  }

  return parsed;
}

// ── SAVE TO DB ────────────────────────
async function saveAnalysisToDB(analysisData, user) {
  const sb = getSupabase();
  if (!sb || !user) return null;

  const biz = analysisData.restaurant_name || analysisData.bizName;
  const pa = analysisData.price_analysis || {};

  // Upsert restaurant with intelligence fields
  const { data: rest, error: restErr } = await sb.from('restaurants').upsert({
    name: biz,
    city: analysisData.bizCity || null,
    zone: analysisData.bizZone || null,
    food_type: analysisData.food_type || null,
    maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(biz)}`,
    price_tier: pa.price_tier || null,
    avg_price_entradas: pa.avg_entradas || null,
    avg_price_platillos: pa.avg_platillos || null,
    avg_price_postres: pa.avg_postres || null,
    last_analyzed_at: new Date().toISOString(),
  }, { onConflict: 'name,city' }).select().single();

  if (restErr) console.warn('Restaurant upsert:', restErr.message);

  // Insert analysis with full intelligence
  const { data: analysis, error: anaErr } = await sb.from('analyses').insert({
    user_id: user.id,
    restaurant_id: rest?.id || null,
    client_number: analysisData.bizClientNum || null,
    status: 'complete',
    duration_ms: analysisData.duration || 0,
    model_used: analysisData.model_used || null,
    dish_count: analysisData.summary?.total_dishes || 0,
    sku_count: (analysisData.sku_table || []).length + (analysisData.matching_table || []).reduce((acc,r) => acc + (r.alternatives||[]).length, 0),
    avg_price: analysisData.avg_price || 0,
    avg_price_entradas: pa.avg_entradas || 0,
    avg_price_platillos: pa.avg_platillos || 0,
    avg_price_postres: pa.avg_postres || 0,
    price_tier: pa.price_tier || null,
    dominant_protein: pa.dominant_protein || null,
    menu_diversity: pa.menu_diversity || 0,
    raw_json: analysisData
  }).select().single();

  if (anaErr) { console.error('Analysis insert:', anaErr.message); return null; }

  // Ingredients with dish intelligence
  const ingMap = {};
  (analysisData.dishes || []).forEach(d => {
    (d.ingredients || []).forEach(ing => {
      const key = (ing.name || '').toLowerCase();
      if (!ingMap[key]) ingMap[key] = { dishes: [], prices: [], category: d.category_type };
      ingMap[key].dishes.push(d.name);
      if (d.price_num > 0) ingMap[key].prices.push(d.price_num);
    });
  });

  const ings = (analysisData.matching_table || []).map((r, idx) => {
    const key = (r.ingredient || '').toLowerCase();
    const info = ingMap[key] || {};
    const avgDishPrice = info.prices?.length
      ? info.prices.reduce((s,p) => s+p, 0) / info.prices.length : 0;
    return {
      analysis_id: analysis.id,
      ingredient_name: r.ingredient,
      priority: r.priority || 'P5',
      match_type: r.match_type,
      mentions: 1,
      implicit: false,
      ambiguous: (r.ingredient || '').includes('AMBIGUA'),
      dish_names: info.dishes || [],
      avg_dish_price: avgDishPrice || null,
      dish_category: info.category || null,
      frequency_rank: idx + 1
    };
  });
  if (ings.length) await sb.from('ingredients').insert(ings);

  // SKU matches
  const matches = (analysisData.sku_table || []).map(r => ({
    analysis_id: analysis.id,
    sku: r.sku, material: r.material, brand: r.brand || null,
    priority: r.priority || 'P5', mentions: r.mentions || 1, rank: r.rank
  }));
  if (matches.length) await sb.from('sku_matches').insert(matches);

  // Menu items with full intelligence
  const items = (analysisData.dishes || []).map(d => ({
    analysis_id: analysis.id,
    name: d.name,
    category: d.category || null,
    category_type: d.category_type || 'otro',
    price: d.price_num || null,
    price_num: d.price_num || null,
    description: d.description || null,
    protein_type: d.protein_type || null,
    cooking_method: d.cooking_method || null,
    is_premium: d.is_premium || false
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
