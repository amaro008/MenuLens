// ══════════════════════════════════════
// export.js — Excel y copiado
// ══════════════════════════════════════

function exportExcel(data) {
  if (!data) { toast('Sin análisis para exportar', 'error'); return; }
  const s = data.summary || {};
  const wb = XLSX.utils.book_new();

  // ── HOJA 1: Resumen Ejecutivo ──────
  const summaryRows = [
    ['MenuLens — Análisis de Menú'],
    [''],
    ['Restaurante', data.restaurant_name || data.bizName || ''],
    ['Tipo de comida', data.food_type || ''],
    ['Ciudad', data.bizCity || ''],
    ['Fecha del análisis', new Date(data.timestamp || Date.now()).toLocaleString('es')],
    ['Asesor', data.userName || ''],
    [''],
    ['── RESUMEN EJECUTIVO ──'],
    ['Total platillos analizados', s.total_dishes || 0],
    ['Ingredientes vendibles extraídos', s.sellable_ingredients || 0],
    ['Matches exactos', s.exact_matches || 0],
    ['Matches aproximados', s.approx_matches || 0],
    ['No encontrados', s.not_found || 0],
    ['Precio promedio de platillo', data.avg_price ? '$' + data.avg_price : '—'],
    [''],
    ['── HALLAZGOS CLAVE ──'],
    ...(s.key_findings || []).map(f => ['• ' + f]),
    [''],
    ['── NOTA DE CALIDAD DEL MENÚ ──'],
    [s.menu_quality_note || ''],
    [''],
    ['── TOP 10 SKUs ──'],
    ['#', 'SKU', 'Material', 'Marca', 'Menciones'],
    ...(s.top10_skus || []).map((r, i) => [
      i + 1, r.sku || '', r.material || '', r.brand || '', r.mentions || 0
    ]),
    [''],
    ['── GAPS DEL CATÁLOGO ──'],
    ...(data.gaps || []).map(g => ['⚠ ' + g]),
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
  ws1['!cols'] = [{ wch: 32 }, { wch: 55 }];
  // Bold first row
  if (ws1['A1']) ws1['A1'].s = { font: { bold: true, sz: 14 } };
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumen Ejecutivo');

  // ── HOJA 2: SKUs Detectados ────────
  const skuRows = [
    ['#', 'SKU', 'Material', 'Marca', 'Tipo', 'Prioridad', 'Menciones']
  ];
  (data.sku_table || []).forEach(r => {
    skuRows.push([r.rank, r.sku || '', r.material || '', r.brand || '', r.type || '', r.priority || '', r.mentions || 0]);
  });
  const ws2 = XLSX.utils.aoa_to_sheet(skuRows);
  ws2['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 42 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'SKUs Detectados');

  // ── Nombre del archivo ─────────────
  const restName = (data.restaurant_name || data.bizName || 'Restaurante')
    .replace(/[^a-zA-Z0-9\u00C0-\u017E\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 30);
  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `MenuLens_${restName}_${dateStr}.xlsx`);
  toast('✅ Excel exportado', 'success');
}

function exportTableAsExcel(tableId, sheetName) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.table_to_sheet(table);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `MenuLens_${sheetName}_${new Date().toISOString().split('T')[0]}.xlsx`);
  toast('✅ Excel exportado', 'success');
}

function shareWhatsapp(data) {
  if (!data) return;
  const s = data.summary || {};
  const top3 = (s.top10_skus || []).slice(0, 3).map(x => x.material).join(', ');
  const msg =
    `*MenuLens — Análisis de Menú*\n\n` +
    `🍽 *${data.restaurant_name || data.bizName}*\n` +
    `Tipo: ${data.food_type || '—'} | ${data.bizCity || ''}\n\n` +
    `📊 *Resumen:*\n` +
    `• ${s.total_dishes || 0} platillos analizados\n` +
    `• ${s.sellable_ingredients || 0} ingredientes vendibles\n` +
    `• ${s.exact_matches || 0} matches exactos\n\n` +
    `🏆 *Top SKUs:*\n${top3 || '—'}\n\n` +
    `_Generado con MenuLens_`;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

function downloadCatalogTemplate() {
  const wb = XLSX.utils.book_new();
  const data = [
    ['Familia', 'Sublínea', 'Línea de Ventas', 'Marca', 'SKU', 'Material'],
    ['Lácteos', 'Quesos', 'Quesos maduros', 'Marca X', 'QSO001', 'Queso manchego 400g'],
    ['Proteínas', 'Carnes frías', 'Embutidos', 'Marca Y', 'CRF001', 'Jamón serrano 200g'],
    ['Aceites', 'Aceites vegetales', 'Aceite de oliva', 'Marca Z', 'ACE001', 'Aceite de oliva extra virgen 1L'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 10 }, { wch: 42 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Catálogo');
  XLSX.writeFile(wb, 'MenuLens_Plantilla_Catalogo.xlsx');
}

function uploadCatalog(input, onSuccess) {
  const file = input.files[0];
  if (!file) return;
  showLoading('Cargando catálogo…', '');
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      // Validate required columns
      const cols = Object.keys(rows[0] || {});
      const hasSku = cols.some(c => c.toLowerCase() === 'sku');
      const hasMaterial = cols.some(c => c.toLowerCase() === 'material');
      if (!hasSku || !hasMaterial) {
        hideLoading();
        toast('El archivo debe tener columnas SKU y Material', 'error');
        return;
      }
      // Save to localStorage (first 500 rows for prompt, full for reference)
      localStorage.setItem('ml_catalog', JSON.stringify(rows.slice(0, 500)));
      localStorage.setItem('ml_catalog_total', rows.length);
      localStorage.setItem('ml_catalog_name', file.name);
      localStorage.setItem('ml_catalog_date', new Date().toLocaleDateString('es'));
      hideLoading();
      toast(`✅ Catálogo cargado: ${rows.length} productos`, 'success');
      if (onSuccess) onSuccess(rows, file.name);
    } catch(err) {
      hideLoading();
      toast('Error al leer el archivo: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}
