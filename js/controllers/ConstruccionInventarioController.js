/* =================================================================
   CONSTRUCCIÓN Y REPARACIÓN DE INVENTARIO POR MES (CONTROLLER)
   Taller Willian Workshop - 2026
   ================================================================= */

class ConstruccionInventarioController {
    constructor() {
        this.db = firebase.firestore();
        this.svc = window.InventoryService ? new window.InventoryService() : null;
        
        this.selectedMonth = localStorage.getItem('construccion_selected_month') || '2026-07';
        this.productsCache = [];
        this.salesMap = {};
        this.entriesMap = {};
        this.pendingMap = {};
        this.reconciliationData = [];
        this.activeProviders = [];

        // Excel Engine State
        this.workbook = null;
        this.excelHeaders = [];
        this.excelData = [];

        this.init();
    }

    async init() {
        console.log("🔨 CONSTRUCCIÓN INVENTARIO CONTROLLER STARTED - Mes: " + this.selectedMonth);
        this.exposeGlobal();
        this.bindEvents();
        this.syncMonthUI();
        await this.loadMonthData();
    }

    exposeGlobal() {
        window.appConstruccion = this;
        window.setWorkingMonthConstruccion = (m) => this.changeMonth(m);
    }

    syncMonthUI() {
        const select = document.getElementById('select-mes-construccion');
        if (select) select.value = this.selectedMonth;

        const [y, m] = this.selectedMonth.split('-');
        const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const mesNombre = nombresMeses[parseInt(m) - 1] || m;
        const formattedLabel = `${mesNombre} ${y}`;

        document.querySelectorAll('.label-mes-actual').forEach(el => {
            el.innerText = formattedLabel;
        });
    }

    async changeMonth(monthStr) {
        if (!monthStr || monthStr.length < 7) return;
        this.selectedMonth = monthStr;
        localStorage.setItem('construccion_selected_month', monthStr);
        this.syncMonthUI();
        await this.loadMonthData();
    }

    bindEvents() {
        // Mobile Menu Toggle
        const mobileBtn = document.getElementById('mobileMenuBtn');
        const mobileMenu = document.getElementById('mobileMenu');
        if (mobileBtn && mobileMenu) {
            mobileBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                mobileMenu.classList.toggle('show');
            });
            document.addEventListener('click', (e) => {
                if (!mobileMenu.contains(e.target) && !mobileBtn.contains(e.target)) {
                    mobileMenu.classList.remove('show');
                }
            });
        }

        // Drop Area for Excel / Inventory Import
        const excelDrop = document.getElementById('construccion-excel-drop-area');
        const excelFileInput = document.getElementById('construccion-excel-file-input');

        if (excelDrop && excelFileInput) {
            excelDrop.addEventListener('click', (e) => {
                if (e.target !== excelFileInput) {
                    excelFileInput.click();
                }
            });
            excelDrop.addEventListener('dragover', (e) => { e.preventDefault(); excelDrop.style.borderColor = '#10b981'; });
            excelDrop.addEventListener('dragleave', () => { excelDrop.style.borderColor = '#cbd5e1'; });
            excelDrop.addEventListener('drop', (e) => {
                e.preventDefault();
                excelDrop.style.borderColor = '#cbd5e1';
                if (e.dataTransfer.files.length > 0) this.handleExcelFileUpload(e.dataTransfer.files[0]);
            });

            excelFileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) this.handleExcelFileUpload(e.target.files[0]);
            });
        }

        // Drop Area for Sales FEL Report
        const salesDrop = document.getElementById('sales-drop-area');
        const salesFileInput = document.getElementById('sales-file-input');

        if (salesDrop && salesFileInput) {
            salesDrop.addEventListener('click', (e) => {
                if (e.target !== salesFileInput) {
                    salesFileInput.click();
                }
            });
            salesDrop.addEventListener('dragover', (e) => { e.preventDefault(); salesDrop.style.borderColor = '#2563eb'; });
            salesDrop.addEventListener('dragleave', () => { salesDrop.style.borderColor = '#cbd5e1'; });
            salesDrop.addEventListener('drop', (e) => {
                e.preventDefault();
                salesDrop.style.borderColor = '#cbd5e1';
                if (e.dataTransfer.files.length > 0) this.handleSalesFile(e.dataTransfer.files[0]);
            });

            salesFileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) this.handleSalesFile(e.target.files[0]);
            });
        }

        // Search in reconstruction table
        const searchInput = document.getElementById('search-construccion');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterTable(e.target.value));
        }
    }

    handleFileInputChange(input) {
        if (input && input.files && input.files.length > 0) {
            this.handleExcelFileUpload(input.files[0]);
        }
    }

    handleSalesInputChange(input) {
        if (input && input.files && input.files.length > 0) {
            this.handleSalesFile(input.files[0]);
        }
    }

    // =========================================
    // EXCEL IMPORT ENGINE (CON HOJAS Y MAPEO)
    // =========================================
    handleExcelFileUpload(file) {
        if (!file) return;
        console.log("📂 Archivo Excel seleccionado:", file.name, file.size, "bytes");

        const fileName = file.name.toLowerCase();
        const isTextOrMd = fileName.endsWith('.md') || fileName.endsWith('.markdown') || fileName.endsWith('.txt') || fileName.endsWith('.csv');

        const label = document.getElementById('construccion-excel-filename');
        if (label) label.innerText = `📄 ${file.name}`;

        if (isTextOrMd) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const rawText = e.target.result || '';
                    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
                    const parsedRows = [];

                    for (let line of lines) {
                        if (/^\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+$/i.test(line)) continue;
                        let cols = [];
                        if (line.includes('|')) {
                            cols = line.split('|').map(c => c.trim());
                            if (cols.length > 0 && cols[0] === '') cols.shift();
                            if (cols.length > 0 && cols[cols.length - 1] === '') cols.pop();
                        } else if (line.includes('\t')) {
                            cols = line.split('\t').map(c => c.trim());
                        } else if (line.includes(',')) {
                            cols = line.split(',').map(c => c.trim());
                        } else {
                            cols = [line];
                        }
                        if (cols.length > 0) parsedRows.push(cols);
                    }

                    if (parsedRows.length < 2) throw new Error("No se encontró una estructura de datos válida.");

                    this.excelHeaders = parsedRows[0].map((h, i) => (h !== null && h !== undefined && String(h).trim() !== '') ? String(h).trim() : `Columna ${i + 1}`);
                    this.excelData = parsedRows.slice(1);

                    const sheetsContainer = document.getElementById('construccion-sheets-container');
                    if (sheetsContainer) sheetsContainer.style.display = 'none';
                    this.setupColumnMapper();
                } catch (err) {
                    console.error("Error leyendo archivo de texto/csv:", err);
                    alert("Error al leer archivo de texto/csv: " + err.message);
                }
            };
            reader.readAsText(file);
        } else {
            if (typeof XLSX === 'undefined') {
                return alert("La librería para procesar Excel (XLSX) aún no se ha cargado. Por favor espera 3 segundos e intenta nuevamente.");
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    this.workbook = XLSX.read(data, { type: 'array' });

                    const sheetSelect = document.getElementById('construccion-sheet-select');
                    if (sheetSelect) {
                        sheetSelect.innerHTML = '';
                        this.workbook.SheetNames.forEach((sheetName) => {
                            const opt = document.createElement('option');
                            opt.value = sheetName;
                            opt.text = sheetName;
                            sheetSelect.add(opt);
                        });
                    }

                    const sheetsContainer = document.getElementById('construccion-sheets-container');
                    if (sheetsContainer) sheetsContainer.style.display = 'block';

                    this.analyzeSelectedSheet();
                } catch (err) {
                    console.error("Error al leer archivo Excel:", err);
                    alert("Error al leer archivo Excel: " + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
        }
    }

    analyzeSelectedSheet() {
        if (!this.workbook || !this.workbook.SheetNames || this.workbook.SheetNames.length === 0) return;
        const sheetSelect = document.getElementById('construccion-sheet-select');
        const selectedSheetName = (sheetSelect && sheetSelect.value) ? sheetSelect.value : this.workbook.SheetNames[0];
        const worksheet = this.workbook.Sheets[selectedSheetName];

        if (!worksheet) return alert("No se pudo leer la hoja seleccionada.");

        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (!rows || rows.length === 0) return alert("La hoja '" + selectedSheetName + "' no contiene datos.");

        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(rows.length, 20); i++) {
            const row = rows[i];
            if (row && row.filter(c => c !== null && c !== undefined && String(c).trim() !== '').length >= 1) {
                headerRowIndex = i;
                break;
            }
        }

        this.excelHeaders = (rows[headerRowIndex] || []).map((h, i) => (h !== null && h !== undefined && String(h).trim() !== '') ? String(h).trim() : `Columna ${i + 1}`);
        this.excelData = rows.slice(headerRowIndex + 1).filter(r => r && r.length > 0 && r.some(c => c !== null && c !== undefined && String(c).trim() !== ''));

        if (this.excelData.length === 0) {
            return alert("No se encontraron filas con datos después de la cabecera en la hoja '" + selectedSheetName + "'.");
        }

        this.setupColumnMapper();
    }

    setupColumnMapper() {
        const mappers = ['c-map-codigo', 'c-map-descripcion', 'c-map-costo', 'c-map-precio', 'c-map-existencia'];
        
        mappers.forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;
            select.innerHTML = '<option value="">-- No incluir / Generar --</option>';

            this.excelHeaders.forEach((header, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                opt.text = `${header} (Columna ${idx + 1})`;
                select.add(opt);
            });
        });

        this.autoMapColumns();
        this.renderExcelPreview();

        const step1 = document.getElementById('construccion-excel-step-1');
        const step2 = document.getElementById('construccion-excel-step-2');
        if (step1) step1.style.display = 'none';
        if (step2) step2.style.display = 'block';
    }

    autoMapColumns() {
        const findMatch = (keywords) => {
            for (let i = 0; i < this.excelHeaders.length; i++) {
                const h = this.excelHeaders[i].toLowerCase().replace(/[^a-z0-9]/g, '');
                if (keywords.some(k => h.includes(k))) return i;
            }
            return '';
        };

        const mapConfig = {
            'c-map-codigo': ['codigo', 'código', 'id', 'ref', 'sku', 'part number'],
            'c-map-descripcion': ['descripcion', 'descripción', 'producto', 'nombre', 'detalle', 'item'],
            'c-map-costo': ['costo', 'compra', 'precio costo', 'valor compra'],
            'c-map-precio': ['precio', 'venta', 'publico', 'pvp', 'salida'],
            'c-map-existencia': ['existencia', 'stock', 'cantidad', 'cant', 'saldo', 'total', 'inicial']
        };

        for (const [id, keywords] of Object.entries(mapConfig)) {
            const match = findMatch(keywords);
            const select = document.getElementById(id);
            if (select && match !== '') select.value = match;
        }
    }

    renderExcelPreview() {
        const thead = document.getElementById('c-preview-header');
        const tbody = document.getElementById('c-preview-body');
        if (!thead || !tbody) return;

        thead.innerHTML = '';
        tbody.innerHTML = '';

        let trHeader = document.createElement('tr');
        this.excelHeaders.forEach(h => {
            let th = document.createElement('th');
            th.textContent = h;
            th.style.padding = '8px';
            th.style.textAlign = 'left';
            th.style.fontWeight = '600';
            trHeader.appendChild(th);
        });
        thead.appendChild(trHeader);

        this.excelData.slice(0, 5).forEach(row => {
            let tr = document.createElement('tr');
            this.excelHeaders.forEach((_, i) => {
                let td = document.createElement('td');
                td.textContent = row[i] !== undefined ? row[i] : '';
                td.style.padding = '8px';
                td.style.borderTop = '1px solid #eee';
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }

    resetExcelInterface() {
        this.workbook = null;
        this.excelHeaders = [];
        this.excelData = [];

        const fileInput = document.getElementById('construccion-excel-file-input');
        if (fileInput) fileInput.value = '';

        document.getElementById('construccion-sheets-container').style.display = 'none';
        document.getElementById('construccion-excel-step-2').style.display = 'none';
        document.getElementById('construccion-excel-step-1').style.display = 'block';
    }

    async importMappedExcelData() {
        const idxCodigo = document.getElementById('c-map-codigo').value;
        const idxDesc = document.getElementById('c-map-descripcion').value;
        const idxCosto = document.getElementById('c-map-costo').value;
        const idxPrecio = document.getElementById('c-map-precio').value;
        const idxExistencia = document.getElementById('c-map-existencia').value;

        if (idxDesc === '') {
            return alert("Por favor selecciona al menos la columna de Descripción.");
        }

        const confirmMsg = `¿Deseas procesar e importar ${this.excelData.length} productos a la base de datos para el mes de ${this.selectedMonth}?`;
        if (!confirm(confirmMsg)) return;

        try {
            let batch = this.db.batch();
            let count = 0;
            let totalProcessed = 0;

            for (const row of this.excelData) {
                const codigoRaw = idxCodigo !== '' && row[idxCodigo] ? String(row[idxCodigo]).trim() : '';
                const descRaw = idxDesc !== '' && row[idxDesc] ? String(row[idxDesc]).trim() : '';

                if (!descRaw && !codigoRaw) continue;

                const costoVal = idxCosto !== '' && row[idxCosto] ? parseFloat(String(row[idxCosto]).replace(/[^0-9.]/g, '')) || 0 : 0;
                const precioVal = idxPrecio !== '' && row[idxPrecio] ? parseFloat(String(row[idxPrecio]).replace(/[^0-9.]/g, '')) || 0 : 0;
                const existenciaVal = idxExistencia !== '' && row[idxExistencia] ? parseFloat(String(row[idxExistencia]).replace(/[^0-9.-]/g, '')) || 0 : 0;

                const codigoFinal = codigoRaw || 'PROD-' + Math.floor(100000 + Math.random() * 900000);

                // Buscar si existe en cache por código o descripción
                const existing = this.productsCache.find(p => 
                    (p.codigo && p.codigo.toLowerCase() === codigoFinal.toLowerCase()) ||
                    (p.descripcion && p.descripcion.toLowerCase().trim() === descRaw.toLowerCase())
                );

                if (existing) {
                    const ref = this.db.collection('INVENTARIO').doc(existing.id);
                    batch.update(ref, {
                        descripcion: descRaw || existing.descripcion,
                        costo: costoVal > 0 ? costoVal : (existing.costo || 0),
                        precioVenta: precioVal > 0 ? precioVal : (existing.precioVenta || 0),
                        stockInicial: existenciaVal >= 0 ? existenciaVal : (existing.stockInicial || 0),
                        existencia: existenciaVal >= 0 ? existenciaVal : (existing.existencia || 0)
                    });
                } else {
                    const newRef = this.db.collection('INVENTARIO').doc();
                    batch.set(newRef, {
                        codigo: codigoFinal,
                        descripcion: descRaw || 'PRODUCTO SIN NOMBRE',
                        costo: costoVal,
                        costoSinIva: costoVal > 0 ? costoVal / 1.13 : 0,
                        precioVenta: precioVal,
                        stockInicial: existenciaVal,
                        existencia: existenciaVal,
                        stockMinimo: 5,
                        creditoFiscal: true,
                        aliases: [],
                        timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }

                count++;
                totalProcessed++;

                if (count >= 400) {
                    await batch.commit();
                    batch = this.db.batch();
                    count = 0;
                }
            }

            if (count > 0) await batch.commit();

            alert(`¡Importación masiva completada! Se procesaron ${totalProcessed} productos.`);
            this.resetExcelInterface();
            await this.loadMonthData();

        } catch (err) {
            console.error("Error importando Excel:", err);
            alert("Error durante la importación: " + err.message);
        }
    }

    // =========================================
    // LOAD & RECONCILIATION LOGIC
    // =========================================
    async loadMonthData() {
        const tbody = document.getElementById('tabla-construccion-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Cargando datos e inconsistencias de ' + this.selectedMonth + '...</td></tr>';

        try {
            const [yearStr, monthStr] = this.selectedMonth.split('-');
            const year = parseInt(yearStr);
            const monthIndex = parseInt(monthStr) - 1;

            const startOfMonthDate = new Date(year, monthIndex, 1, 0, 0, 0, 0);
            const endOfMonthDate = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
            const startMillis = startOfMonthDate.getTime();
            const endMillis = endOfMonthDate.getTime();

            const isSelectedMonth = (data) => {
                if (data.fecha && typeof data.fecha === 'string' && data.fecha.length >= 7) {
                    return data.fecha.startsWith(this.selectedMonth);
                }
                if (data.timestamp) {
                    const millis = data.timestamp.toMillis ? data.timestamp.toMillis() : (data.timestamp.seconds * 1000);
                    return millis >= startMillis && millis <= endMillis;
                }
                return true;
            };

            // 1. Cargar Ventas de INVENTARIO_SALIDAS
            const salidasSnapshot = await this.db.collection('INVENTARIO_SALIDAS').get();
            this.salesMap = {};
            let countVentasTotal = 0;

            salidasSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.anulada || data.revertida) return;
                if (!isSelectedMonth(data)) return;

                if (data.items && Array.isArray(data.items)) {
                    data.items.forEach(item => {
                        if (item.isManoDeObra || item.productId === 'SERVICIO') return;
                        const name = item.descripcionPapel || item.producto || item.descripcion || "";
                        const stableKey = window.RegistrosApp ? window.RegistrosApp.getGroupingKey(name, item.productId) : (item.codigoOficial || name).replace(/\//g, '-').trim();
                        const cant = parseFloat(item.cantidad) || 0;
                        this.salesMap[stableKey] = (this.salesMap[stableKey] || 0) + cant;
                        countVentasTotal += cant;
                    });
                }
            });

            // 2. Cargar Entradas de INVENTARIO_ENTRADAS
            const entradasSnapshot = await this.db.collection('INVENTARIO_ENTRADAS').get();
            this.entriesMap = {};
            const activeProvSet = new Set();
            let countEntradasTotal = 0;

            entradasSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.revertida || data.tipo === 'AJUSTE') return;
                if (!isSelectedMonth(data)) return;

                const provName = (data.providerName || "SIN PROVEEDOR").toUpperCase().trim();
                activeProvSet.add(provName);

                if (data.items) {
                    data.items.forEach(item => {
                        const stableKey = window.RegistrosApp ? window.RegistrosApp.getGroupingKey(item.productName, item.productId) : (item.productCode || item.productName).replace(/\//g, '-').trim();
                        const cant = parseFloat(item.cantidad) || 0;
                        if (!this.entriesMap[stableKey]) this.entriesMap[stableKey] = { total: 0, byProv: {} };
                        this.entriesMap[stableKey].total += cant;
                        this.entriesMap[stableKey].byProv[provName] = (this.entriesMap[stableKey].byProv[provName] || 0) + cant;
                        countEntradasTotal += cant;
                    });
                }
            });

            this.activeProviders = Array.from(activeProvSet).sort();

            // 3. Cargar Registros Temporales
            const regSnapshot = await this.db.collection('REGISTROS').get();
            this.pendingMap = {};
            regSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.archivado || !isSelectedMonth(data)) return;
                const cant = parseFloat(data.cantidad) || 0;
                if (cant > 0 && (data.productId || data.producto)) {
                    const stableKey = window.RegistrosApp ? window.RegistrosApp.getGroupingKey(data.producto, data.productId) : (data.codigoOficial || data.producto).replace(/\//g, '-').trim();
                    this.pendingMap[stableKey] = (this.pendingMap[stableKey] || 0) + cant;
                }
            });

            // 4. Cargar productos base
            const rawProducts = await this.db.collection('INVENTARIO').orderBy('codigo').get();
            this.productsCache = rawProducts.docs.map(d => ({ id: d.id, ...d.data() }));

            // 5. Generar reconciliación
            let countInconsistencias = 0;
            this.reconciliationData = this.productsCache.map(p => {
                const stableKey = window.RegistrosApp ? window.RegistrosApp.getGroupingKey(p.descripcion, p.id) : (p.codigo || p.descripcion).replace(/\//g, '-').trim();
                
                const ventas = this.salesMap[stableKey] || 0;
                const entryData = this.entriesMap[stableKey] || { total: 0, byProv: {} };
                const entradas = entryData.total;
                const pendientes = Math.max(0, (this.pendingMap[stableKey] || 0) - ventas);

                const stockInicial = parseFloat(p.stockInicial || p.existencia || 0);
                const stockResultante = stockInicial + entradas - ventas - pendientes;
                const tieneInconsistencia = stockResultante < 0 || (ventas > 0 && stockInicial === 0 && entradas === 0);

                if (tieneInconsistencia) countInconsistencias++;

                return {
                    id: p.id,
                    codigo: p.codigo,
                    descripcion: p.descripcion,
                    costo: p.costo || 0,
                    precioVenta: p.precioVenta || 0,
                    stockInicial: stockInicial,
                    entradas: entradas,
                    ventas: ventas,
                    pendientes: pendientes,
                    stockResultante: stockResultante,
                    inconsistencia: tieneInconsistencia,
                    providers: entryData.byProv
                };
            });

            // Actualizar métricas
            document.getElementById('metric-total-prod').innerText = this.productsCache.length;
            document.getElementById('metric-total-entradas').innerText = countEntradasTotal;
            document.getElementById('metric-total-ventas').innerText = countVentasTotal;
            document.getElementById('metric-inconsistencias').innerText = countInconsistencias;

            this.renderReconstructionTable(this.reconciliationData);

        } catch (error) {
            console.error("Error al cargar datos de construcción de inventario:", error);
            if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="color:red; text-align:center;">Error: ${error.message}</td></tr>`;
        }
    }

    renderReconstructionTable(list) {
        const tbody = document.getElementById('tabla-construccion-body');
        if (!tbody) return;

        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 20px;">No se encontraron productos.</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(item => {
            const statusBadge = item.stockResultante < 0 ?
                '<span class="badge" style="background:#fee2e2; color:#dc2626; padding: 4px 8px; border-radius: 12px; font-weight:700;"><i class="fas fa-exclamation-triangle"></i> Negativo</span>' :
                item.inconsistencia ?
                '<span class="badge" style="background:#fef3c7; color:#d97706; padding: 4px 8px; border-radius: 12px; font-weight:700;"><i class="fas fa-exclamation-circle"></i> Revisar</span>' :
                '<span class="badge" style="background:#dcfce7; color:#166534; padding: 4px 8px; border-radius: 12px; font-weight:700;"><i class="fas fa-check-circle"></i> OK</span>';

            return `
                <tr data-id="${item.id}">
                    <td><strong>${item.codigo}</strong></td>
                    <td>${item.descripcion}</td>
                    <td style="text-align:right;">$${parseFloat(item.costo).toFixed(2)}</td>
                    <td style="text-align:right;">$${parseFloat(item.precioVenta).toFixed(2)}</td>
                    <td style="text-align:center; font-weight:bold; background:#f8fafc;">
                        <input type="number" value="${item.stockInicial}" style="width: 70px; text-align:center; padding:4px; border:1px solid #cbd5e1; border-radius:4px;" onchange="appConstruccion.updateStockInicialDirect('${item.id}', this.value)">
                    </td>
                    <td style="text-align:center; color:#2563eb; font-weight:bold;">+${item.entradas}</td>
                    <td style="text-align:center; color:#dc2626; font-weight:bold;">-${item.ventas}</td>
                    <td style="text-align:center; font-weight:bold; font-size:1.05rem; color:${item.stockResultante < 0 ? '#dc2626' : '#1e293b'};">
                        ${item.stockResultante}
                    </td>
                    <td style="text-align:center;">${statusBadge}</td>
                    <td style="text-align:center;">
                        <button class="btn btn-sm" style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; font-size:0.75rem; padding:4px 8px;" onclick="appConstruccion.autoFixSingleItem('${item.id}')" title="Corregir Stock Inicial para nivelar a 0 o positivo">
                            <i class="fas fa-wrench"></i> Nivelar
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    filterTable(query) {
        if (!query) {
            this.renderReconstructionTable(this.reconciliationData);
            return;
        }
        const q = query.toLowerCase().trim();
        const filtered = this.reconciliationData.filter(p => 
            (p.codigo && p.codigo.toLowerCase().includes(q)) || 
            (p.descripcion && p.descripcion.toLowerCase().includes(q))
        );
        this.renderReconstructionTable(filtered);
    }

    async updateStockInicialDirect(productId, newValue) {
        const val = parseFloat(newValue) || 0;
        try {
            await this.db.collection('INVENTARIO').doc(productId).update({
                stockInicial: val,
                existencia: val
            });
            const item = this.reconciliationData.find(x => x.id === productId);
            if (item) {
                item.stockInicial = val;
                item.stockResultante = val + item.entradas - item.ventas - item.pendientes;
                item.inconsistencia = item.stockResultante < 0;
            }
            this.renderReconstructionTable(this.reconciliationData);
        } catch (e) {
            console.error(e);
            alert("Error actualizando stock inicial: " + e.message);
        }
    }

    async autoFixSingleItem(productId) {
        const item = this.reconciliationData.find(x => x.id === productId);
        if (!item) return;

        const neededInitial = Math.max(0, item.ventas + item.pendientes - item.entradas);
        await this.updateStockInicialDirect(productId, neededInitial);
    }

    async autoFixAllNegativeStocks() {
        const negatives = this.reconciliationData.filter(x => x.stockResultante < 0);
        if (negatives.length === 0) {
            return alert("¡No hay productos con stock negativo en " + this.selectedMonth + "!");
        }

        if (!confirm(`Se corregirá automáticamente el Stock Inicial de ${negatives.length} productos con saldo negativo para dejarlos nivelados a cero. ¿Deseas continuar?`)) {
            return;
        }

        try {
            let batch = this.db.batch();
            let count = 0;

            for (const item of negatives) {
                const neededInitial = Math.max(0, item.ventas + item.pendientes - item.entradas);
                const ref = this.db.collection('INVENTARIO').doc(item.id);
                batch.update(ref, {
                    stockInicial: neededInitial,
                    existencia: neededInitial
                });
                count++;
                if (count % 400 === 0) {
                    await batch.commit();
                    batch = this.db.batch();
                }
            }
            if (count % 400 !== 0) await batch.commit();

            alert(`¡Se corrigieron con éxito ${negatives.length} productos!`);
            await this.loadMonthData();
        } catch (e) {
            console.error(e);
            alert("Error durante la corrección masiva: " + e.message);
        }
    }

    async handleSalesFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const content = e.target.result;
            if (window.RegistroController && window.RegistroController.detectFELReport && window.RegistroController.detectFELReport(content)) {
                await this.importFELSales(content, file.name);
            } else {
                alert("El archivo subido no contiene el formato esperado de reporte de ventas FEL o CSV. Verifica la estructura del archivo.");
            }
        };
        reader.readAsText(file);
    }

    async importFELSales(content, fileName) {
        try {
            const felData = window.RegistroController.parseFELReport(content);
            if (!felData || !felData.sec2 || felData.sec2.length === 0) {
                return alert("No se encontraron registros de ventas legibles en el archivo FEL.");
            }

            const confirmMsg = `Se detectó el reporte FEL "${fileName}".\n` +
                               `- Productos extraídos: ${felData.sec2.length}\n` +
                               `- Período de inserción: ${this.selectedMonth}\n\n` +
                               `¿Deseas registrar estas ventas para el inventario de ${this.selectedMonth}?`;

            if (!confirm(confirmMsg)) return;

            let batch = this.db.batch();
            let count = 0;
            const fechaAUsar = this.selectedMonth + '-31';

            for (const row of felData.sec2) {
                const docRef = this.db.collection('INVENTARIO_SALIDAS').doc();
                batch.set(docRef, {
                    fecha: fechaAUsar,
                    tipo: 'VENTA_FEL',
                    origenFile: fileName,
                    periodo: this.selectedMonth,
                    items: [{
                        producto: row.producto,
                        cantidad: row.cantidad,
                        monto: row.montoTotal
                    }],
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                count++;
                if (count % 400 === 0) {
                    await batch.commit();
                    batch = this.db.batch();
                }
            }
            if (count % 400 !== 0) await batch.commit();

            alert(`¡Importación exitosa! Se registraron ${felData.sec2.length} ventas para el período ${this.selectedMonth}.`);
            await this.loadMonthData();

        } catch (e) {
            console.error("Error importando ventas FEL:", e);
            alert("Ocurrió un error procesando las ventas FEL: " + e.message);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ConstruccionInventarioController();
});
