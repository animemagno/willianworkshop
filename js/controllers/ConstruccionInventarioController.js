/* =================================================================
   CONSTRUCCIÓN Y REPARACIÓN DE INVENTARIO POR MES (CONTROLLER)
   Taller Willian Workshop - 2026
   ================================================================= */

class ConstruccionInventarioController {
    constructor() {
        if (typeof firebase !== 'undefined' && (!firebase.apps || !firebase.apps.length)) {
            const firebaseConfig = window.firebaseConfig || {
                apiKey: "AIzaSyCaZdPPYddeMPTiNm5cCdFL6m9b9swX0-c",
                authDomain: "williantaller-1426b.firebaseapp.com",
                projectId: "williantaller-1426b",
                storageBucket: "williantaller-1426b.firebasestorage.app",
                messagingSenderId: "757966587061",
                appId: "1:757966587061:web:6c700e862317119d64aafc"
            };
            firebase.initializeApp(firebaseConfig);
        }
        this.db = firebase.firestore();
        this.svc = window.InventoryService ? new window.InventoryService() : null;
        
        this.selectedMonth = localStorage.getItem('construccion_selected_month') || '2026-07';
        this.productsCache = [];
        this.salesMap = {};
        this.entriesMap = {};
        this.pendingMap = {};
        this.reconciliationData = [];
        this.activeProviders = [];

        // Local Draft State
        this.draftInventario = JSON.parse(localStorage.getItem('draft_inventario_' + this.selectedMonth) || '[]');
        this.draftEntradas = JSON.parse(localStorage.getItem('draft_entradas_' + this.selectedMonth) || '[]');
        this.draftSalidas = JSON.parse(localStorage.getItem('draft_salidas_' + this.selectedMonth) || '[]');

        // Multi-Sheet Supplier Batch State (Paso 3)
        this.pendingEntradasBatch = [];
        this.pendingSheetsList = [];

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
        this.renderDraftTable();
        this.renderDraftEntradasTable();
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

        // Drag & Drop for Excel Import
        const excelDrop = document.getElementById('construccion-excel-step-1');
        if (excelDrop) {
            excelDrop.addEventListener('dragover', (e) => { e.preventDefault(); excelDrop.style.borderColor = '#10b981'; });
            excelDrop.addEventListener('dragleave', () => { excelDrop.style.borderColor = '#cbd5e1'; });
            excelDrop.addEventListener('drop', (e) => {
                e.preventDefault();
                excelDrop.style.borderColor = '#cbd5e1';
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    this.handleExcelFileUpload(e.dataTransfer.files[0]);
                }
            });
        }

        // Drag & Drop for Sales FEL Report
        const salesDrop = document.getElementById('sales-drop-area');
        if (salesDrop) {
            salesDrop.addEventListener('dragover', (e) => { e.preventDefault(); salesDrop.style.borderColor = '#2563eb'; });
            salesDrop.addEventListener('dragleave', () => { salesDrop.style.borderColor = '#cbd5e1'; });
            salesDrop.addEventListener('drop', (e) => {
                e.preventDefault();
                salesDrop.style.borderColor = '#cbd5e1';
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    this.handleSalesFile(e.dataTransfer.files[0]);
                }
            });
        }

        // Search in reconstruction table
        const searchInput = document.getElementById('search-construccion');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterTable(e.target.value));
        }
    }

    onFileSelected(input) {
        if (!input || !input.files || input.files.length === 0) return;
        const file = input.files[0];
        console.log("📂 Archivo Excel seleccionado:", file.name, file.size, "bytes");

        const label = document.getElementById('construccion-excel-filename');
        if (label) {
            label.innerText = `📄 Archivo Seleccionado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            label.style.display = 'inline-block';
        }

        const sheetsContainer = document.getElementById('construccion-sheets-container');
        if (sheetsContainer) {
            sheetsContainer.style.display = 'block';
            setTimeout(() => {
                sheetsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }

        this.handleExcelFileUpload(file);
    }

    onSalesFileSelected(input) {
        if (!input || !input.files || input.files.length === 0) return;
        const file = input.files[0];
        console.log("📄 Reporte FEL seleccionado:", file.name, file.size, "bytes");

        const label = document.getElementById('sales-filename');
        if (label) {
            label.innerText = `📄 Reporte FEL Seleccionado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            label.style.display = 'inline-block';
        }

        this.handleSalesFile(file);
    }

    // =========================================
    // EXCEL IMPORT ENGINE (CON HOJAS Y MAPEO)
    // =========================================
    handleExcelFileUpload(file) {
        if (!file) return;
        console.log("📂 Archivo Excel a procesar:", file.name, file.size, "bytes");

        const label = document.getElementById('construccion-excel-filename');
        if (label) {
            label.innerText = `📄 Archivo Seleccionado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            label.style.display = 'inline-block';
        }

        const ext = (file.name || '').split('.').pop().toLowerCase();
        const isTextOrMd = ['md', 'markdown', 'txt', 'csv'].includes(ext);

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

                    const sheetSelects = document.querySelectorAll('#construccion-sheet-select, #construccion-entradas-sheet-select');
                    sheetSelects.forEach(select => {
                        select.innerHTML = '';
                        this.workbook.SheetNames.forEach((sheetName) => {
                            const opt = document.createElement('option');
                            opt.value = sheetName;
                            opt.text = sheetName;
                            select.add(opt);
                        });
                    });

                    const sheetsContainer = document.getElementById('construccion-sheets-container');
                    if (sheetsContainer) sheetsContainer.style.display = 'block';

                    this.analyzeSelectedSheet();
                    this.analyzeEntradasSheet();
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

        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        if (!rows || rows.length === 0) return alert("La hoja '" + selectedSheetName + "' no contiene datos.");

        let headerRowIndex = 0;
        let maxColsCount = 0;
        for (let i = 0; i < Math.min(rows.length, 25); i++) {
            const row = rows[i];
            if (row && Array.isArray(row)) {
                const filledCols = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '').length;
                if (filledCols > maxColsCount) {
                    maxColsCount = filledCols;
                    headerRowIndex = i;
                }
            }
        }

        const headerRow = rows[headerRowIndex] || [];
        this.excelHeaders = headerRow.map((h, i) => (h !== null && h !== undefined && String(h).trim() !== '') ? String(h).trim() : `Columna ${i + 1}`);
        this.excelData = rows.slice(headerRowIndex + 1).filter(r => r && r.length > 0 && r.some(c => c !== null && c !== undefined && String(c).trim() !== ''));

        if (this.excelData.length === 0) {
            this.excelData = rows.slice(headerRowIndex);
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

            select.onchange = () => this.renderExcelPreview();
        });

        this.autoMapColumns();
        this.renderExcelPreview();

        const step2 = document.getElementById('construccion-excel-step-2');
        if (step2) {
            step2.style.display = 'block';
            step2.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        const sheetsContainer = document.getElementById('construccion-sheets-container');
        if (sheetsContainer) sheetsContainer.style.display = 'block';

        const modal = document.getElementById('modalMapeoColumnas');
        if (modal) modal.style.display = 'flex';
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

        const getVal = (id) => {
            const el = document.getElementById(id);
            return (el && el.value !== '') ? parseInt(el.value) : -1;
        };

        const mapCodigoIdx = getVal('c-map-codigo');
        const mapDescIdx = getVal('c-map-descripcion');
        const mapCostoIdx = getVal('c-map-costo');
        const mapPrecioIdx = getVal('c-map-precio');
        const mapStockIdx = getVal('c-map-existencia');

        const getColumnBadge = (colIdx) => {
            const badges = [];
            if (colIdx === mapCodigoIdx) badges.push('<span style="background:#dbeafe; color:#1d4ed8; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-weight:800; margin-right:4px;">📌 Código</span>');
            if (colIdx === mapDescIdx) badges.push('<span style="background:#dcfce7; color:#15803d; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-weight:800; margin-right:4px;">📌 Descripción</span>');
            if (colIdx === mapCostoIdx) badges.push('<span style="background:#fef3c7; color:#b45309; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-weight:800; margin-right:4px;">📌 Costo</span>');
            if (colIdx === mapPrecioIdx) badges.push('<span style="background:#f3e8ff; color:#6b21a8; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-weight:800; margin-right:4px;">📌 Precio</span>');
            if (colIdx === mapStockIdx) badges.push('<span style="background:#ffe4e6; color:#be123c; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-weight:800; margin-right:4px;">📌 Stock</span>');
            return badges.join('');
        };

        let trHeader = document.createElement('tr');
        this.excelHeaders.forEach((h, idx) => {
            let th = document.createElement('th');
            const badgeHtml = getColumnBadge(idx);
            th.innerHTML = `${badgeHtml}<div style="margin-top:2px;">${h} <small style="color:#64748b; font-weight:500;">(Col ${idx + 1})</small></div>`;
            th.style.padding = '10px 12px';
            th.style.textAlign = 'left';
            th.style.fontWeight = '700';
            th.style.fontSize = '0.85rem';
            th.style.background = badgeHtml ? '#eff6ff' : '#f8fafc';
            th.style.borderBottom = badgeHtml ? '2px solid #2563eb' : '1px solid #cbd5e1';
            trHeader.appendChild(th);
        });
        thead.appendChild(trHeader);

        this.excelData.slice(0, 5).forEach((row, rIdx) => {
            let tr = document.createElement('tr');
            tr.style.background = rIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
            this.excelHeaders.forEach((_, cIdx) => {
                let td = document.createElement('td');
                td.textContent = row[cIdx] !== undefined ? row[cIdx] : '';
                td.style.padding = '8px 12px';
                td.style.borderTop = '1px solid #e2e8f0';
                td.style.fontSize = '0.85rem';
                if (cIdx === mapCodigoIdx || cIdx === mapDescIdx || cIdx === mapCostoIdx || cIdx === mapPrecioIdx || cIdx === mapStockIdx) {
                    td.style.fontWeight = '700';
                    td.style.background = 'rgba(239, 246, 255, 0.5)';
                }
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

        const filenameLabel = document.getElementById('construccion-excel-filename');
        if (filenameLabel) {
            filenameLabel.innerText = '';
            filenameLabel.style.display = 'none';
        }

        const sheetsContainer = document.getElementById('construccion-sheets-container');
        if (sheetsContainer) sheetsContainer.style.display = 'none';

        const step2 = document.getElementById('construccion-excel-step-2');
        if (step2) step2.style.display = 'none';

        const step1 = document.getElementById('construccion-excel-step-1');
        if (step1) step1.style.display = 'block';
    }

    async clearInventoryProducts() {
        if (!confirm("⚠️ ¿Estás seguro de que deseas ELIMINAR todos los productos cargados en el INVENTARIO?\n\nLas VENTAS FACTURADAS NO se borrarán y se conservarán intactas.")) return;

        try {
            const snapshot = await this.db.collection('INVENTARIO').get();
            if (snapshot.empty) {
                return alert("No hay productos en la base de datos de Inventario para eliminar.");
            }

            let batch = this.db.batch();
            let count = 0;

            for (const doc of snapshot.docs) {
                batch.delete(doc.ref);
                count++;
                if (count % 400 === 0) {
                    await batch.commit();
                    batch = this.db.batch();
                }
            }

            if (count % 400 !== 0) {
                await batch.commit();
            }

            alert(`¡Se eliminaron ${count} productos del Inventario con éxito!\nLas ventas registradas se mantuvieron intactas.`);
            await this.loadMonthData();

        } catch (err) {
            console.error("Error al borrar productos del inventario:", err);
            alert("Error al borrar inventario: " + err.message);
        }
    }

    async clearMonthData(type = 'ventas') {
        if (type === 'inventario') {
            return await this.clearInventoryProducts();
        }

        const monthLabel = this.selectedMonth || '2026-07';
        
        let confirmMsg = type === 'ventas' ?
            `¿Estás seguro de que deseas ELIMINAR todas las VENTAS cargadas para el mes de ${monthLabel}? El inventario base se conservará intacto.` :
            `⚠️ ATENCIÓN: Se ELIMINARÁN las ventas registradas para el período ${monthLabel}.\n\n¿Deseas continuar?`;

        if (!confirm(confirmMsg)) return;

        try {
            let batch = this.db.batch();
            let count = 0;

            if (type === 'ventas' || type === 'todo') {
                const salidasSnapshot = await this.db.collection('INVENTARIO_SALIDAS').get();
                salidasSnapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.periodo === monthLabel || (data.fecha && data.fecha.startsWith(monthLabel))) {
                        batch.delete(doc.ref);
                        count++;
                    }
                });
            }

            if (count > 0) await batch.commit();

            alert(`¡Se eliminaron ${count} registros de ventas del período ${monthLabel}!`);
            await this.loadMonthData();

        } catch (err) {
            console.error("Error borrando datos del mes:", err);
            alert("Error al borrar datos: " + err.message);
        }
    }

    importMappedExcelData() {
        const idxCodigo = document.getElementById('c-map-codigo').value;
        const idxDesc = document.getElementById('c-map-descripcion').value;
        const idxCosto = document.getElementById('c-map-costo').value;
        const idxPrecio = document.getElementById('c-map-precio').value;
        const idxExistencia = document.getElementById('c-map-existencia').value;

        if (idxDesc === '') {
            return alert("Por favor selecciona al menos la columna de Descripción.");
        }

        const draftList = [];
        let totalProcessed = 0;

        for (const row of this.excelData) {
            const codigoRaw = idxCodigo !== '' && row[idxCodigo] ? String(row[idxCodigo]).trim() : '';
            const descRaw = idxDesc !== '' && row[idxDesc] ? String(row[idxDesc]).trim() : '';

            if (!descRaw && !codigoRaw) continue;

            const costoVal = idxCosto !== '' && row[idxCosto] ? parseFloat(String(row[idxCosto]).replace(/[^0-9.]/g, '')) || 0 : 0;
            const precioVal = idxPrecio !== '' && row[idxPrecio] ? parseFloat(String(row[idxPrecio]).replace(/[^0-9.]/g, '')) || 0 : 0;
            const existenciaVal = idxExistencia !== '' && row[idxExistencia] ? parseFloat(String(row[idxExistencia]).replace(/[^0-9.-]/g, '')) || 0 : 0;

            const codigoFinal = codigoRaw || 'PROD-' + Math.floor(100000 + Math.random() * 900000);

            draftList.push({
                codigo: codigoFinal,
                descripcion: descRaw || 'PRODUCTO SIN NOMBRE',
                costo: costoVal,
                costoSinIva: costoVal > 0 ? Number((costoVal / 1.13).toFixed(2)) : 0,
                precioVenta: precioVal,
                stockInicial: existenciaVal,
                existencia: existenciaVal,
                totalCosto: Number((existenciaVal * costoVal).toFixed(2))
            });

            totalProcessed++;
        }

        this.draftInventario = draftList;
        localStorage.setItem('draft_inventario_' + this.selectedMonth, JSON.stringify(draftList));

        const metricProd = document.getElementById('metric-total-prod');
        if (metricProd) metricProd.innerText = draftList.length;

        const draftStatus = document.getElementById('draft-status-badge');
        if (draftStatus) {
            draftStatus.innerHTML = `
                <div style="background: #ecfdf5; border: 1px solid #6ee7b7; padding: 14px 18px; border-radius: 8px; margin-top: 15px; text-align: left;">
                    <div style="font-weight: 800; color: #047857; font-size: 0.95rem; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-check-circle" style="color: #059669; font-size: 1.1rem;"></i> 
                        ✅ PASO 1 COMPLETADO (BORRADOR LOCAL): ${totalProcessed} productos cargados localmente.
                    </div>
                    <p style="margin: 6px 0 0 0; font-size: 0.85rem; color: #065f46;">
                        Avanzando a <strong>Paso 2</strong> para visualizar la tabla del inventario y organizar el orden de las columnas.
                    </p>
                </div>
            `;
            draftStatus.style.display = 'block';
        }

        this.renderDraftTable();

        setTimeout(() => {
            const paso2 = document.getElementById('construccion-paso-2-container');
            if (paso2) paso2.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 200);

        alert(`¡Paso 1 Completado!\n\nSe procesaron ${totalProcessed} productos localmente.\nAvanzando a Paso 2 para revisar la tabla y organizar tus columnas.`);
    }

    async commitLocalDraftToFirebase() {
        const countProd = this.draftInventario ? this.draftInventario.length : 0;
        const countEntradas = this.draftEntradas ? this.draftEntradas.length : 0;
        const countSalidas = this.draftSalidas ? this.draftSalidas.length : 0;
        const totalItems = countProd + countEntradas + countSalidas;

        if (totalItems === 0) {
            return alert("No hay datos cargados en el borrador local para subir a la nube.");
        }

        const confirmMsg = `⚠️ ATENCIÓN: Se subirán a la Nube (Firebase) todos los datos consolidados del mes de ${this.selectedMonth}:\n\n` +
                           `• Inventario Base: ${countProd} productos\n` +
                           `• Entradas / Compras: ${countEntradas} registros\n` +
                           `• Salidas / Ventas FEL: ${countSalidas} registros\n\n` +
                           `¿Confirmas que deseas aplicar y guardar definitivamente estos datos en la Nube?`;

        if (!confirm(confirmMsg)) return;

        try {
            // 1. Guardar Inventario Base
            if (countProd > 0) {
                let batch = this.db.batch();
                let count = 0;
                for (const item of this.draftInventario) {
                    const docRef = this.db.collection('INVENTARIO').doc();
                    batch.set(docRef, {
                        ...item,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    count++;
                    if (count >= 400) {
                        await batch.commit();
                        batch = this.db.batch();
                        count = 0;
                    }
                }
                if (count > 0) await batch.commit();
            }

            // 2. Guardar Entradas
            if (countEntradas > 0) {
                let batch = this.db.batch();
                let count = 0;
                for (const entry of this.draftEntradas) {
                    const docRef = this.db.collection('INVENTARIO_ENTRADAS').doc();
                    batch.set(docRef, {
                        ...entry,
                        periodo: this.selectedMonth,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    count++;
                    if (count >= 400) {
                        await batch.commit();
                        batch = this.db.batch();
                        count = 0;
                    }
                }
                if (count > 0) await batch.commit();
            }

            // 3. Guardar Salidas
            if (countSalidas > 0) {
                let batch = this.db.batch();
                let count = 0;
                for (const sale of this.draftSalidas) {
                    const docRef = this.db.collection('INVENTARIO_SALIDAS').doc();
                    batch.set(docRef, {
                        ...sale,
                        periodo: this.selectedMonth,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    count++;
                    if (count >= 400) {
                        await batch.commit();
                        batch = this.db.batch();
                        count = 0;
                    }
                }
                if (count > 0) await batch.commit();
            }

            alert(`🎉 ¡PROCESO COMPLETADO EXITOSAMENTE!\n\nSe consolidaron y guardaron en la nube todos los datos de ${this.selectedMonth}.`);
            this.clearLocalDraft();
            await this.loadMonthData();

        } catch (err) {
            console.error("Error al subir borrador a Firebase:", err);
            alert("Error durante el guardado en la nube: " + err.message);
        }
    }

    clearLocalDraft() {
        this.draftInventario = [];
        this.draftEntradas = [];
        this.draftSalidas = [];
        localStorage.removeItem('draft_inventario_' + this.selectedMonth);
        localStorage.removeItem('draft_entradas_' + this.selectedMonth);
        localStorage.removeItem('draft_salidas_' + this.selectedMonth);

        const draftStatus = document.getElementById('draft-status-badge');
        if (draftStatus) draftStatus.style.display = 'none';

        const metricProd = document.getElementById('metric-total-prod');
        if (metricProd) metricProd.innerText = '0';

        this.renderDraftTable();
    }

    renderDraftTable() {
        const paso2Container = document.getElementById('construccion-paso-2-container');
        if (!this.draftInventario || this.draftInventario.length === 0) {
            if (paso2Container) paso2Container.style.display = 'none';
            return;
        }

        if (paso2Container) paso2Container.style.display = 'block';

        const countLabel = document.getElementById('paso2-count-label');
        if (countLabel) countLabel.innerText = this.draftInventario.length;

        const showCodigo = document.getElementById('col-toggle-codigo')?.checked ?? true;
        const showDesc = document.getElementById('col-toggle-descripcion')?.checked ?? true;
        const showCosto = document.getElementById('col-toggle-costo')?.checked ?? true;
        const showPrecio = document.getElementById('col-toggle-precio')?.checked ?? true;
        const showExistencia = document.getElementById('col-toggle-existencia')?.checked ?? true;
        const showCostoTotal = document.getElementById('col-toggle-costototal')?.checked ?? true;

        const searchTerm = (document.getElementById('draft-search-input')?.value || '').toLowerCase().trim();

        const filtered = this.draftInventario.filter(p => 
            !searchTerm || 
            (p.codigo && p.codigo.toLowerCase().includes(searchTerm)) ||
            (p.descripcion && p.descripcion.toLowerCase().includes(searchTerm))
        );

        // Encabezado dinamico segun columnas activas
        const thead = document.getElementById('tbl-draft-header');
        if (thead) {
            let html = '<tr>';
            html += '<th style="padding: 10px 14px; text-align: center; border-bottom: 2px solid #cbd5e1; color: #475569;">#</th>';
            if (showCodigo) html += '<th style="padding: 10px 14px; text-align: left; border-bottom: 2px solid #cbd5e1; color: #475569;">Código</th>';
            if (showDesc) html += '<th style="padding: 10px 14px; text-align: left; border-bottom: 2px solid #cbd5e1; color: #475569;">Descripción Taller</th>';
            if (showCosto) html += '<th style="padding: 10px 14px; text-align: right; border-bottom: 2px solid #cbd5e1; color: #475569;">Costo c/IVA</th>';
            if (showPrecio) html += '<th style="padding: 10px 14px; text-align: right; border-bottom: 2px solid #cbd5e1; color: #475569;">Precio Venta</th>';
            if (showExistencia) html += '<th style="padding: 10px 14px; text-align: right; border-bottom: 2px solid #cbd5e1; color: #475569;">Stock Inicial</th>';
            if (showCostoTotal) html += '<th style="padding: 10px 14px; text-align: right; border-bottom: 2px solid #cbd5e1; color: #475569;">Valor Total</th>';
            html += '</tr>';
            thead.innerHTML = html;
        }

        // Cuerpo de la tabla
        const tbody = document.getElementById('tbl-draft-body');
        if (tbody) {
            tbody.innerHTML = '';
            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #64748b;">No se encontraron productos coincidentes en el borrador.</td></tr>';
                return;
            }

            filtered.forEach((p, idx) => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #e2e8f0';

                let rowHtml = `<td style="padding: 8px 12px; text-align: center; color: #64748b;">${idx + 1}</td>`;
                if (showCodigo) rowHtml += `<td style="padding: 8px 12px; font-weight: 700; color: #2563eb;">${p.codigo}</td>`;
                if (showDesc) rowHtml += `<td style="padding: 8px 12px; color: #1e293b;">${p.descripcion}</td>`;
                if (showCosto) rowHtml += `<td style="padding: 8px 12px; text-align: right; color: #475569;">$${(p.costo || 0).toFixed(2)}</td>`;
                if (showPrecio) rowHtml += `<td style="padding: 8px 12px; text-align: right; font-weight: 700; color: #059669;">$${(p.precioVenta || 0).toFixed(2)}</td>`;
                if (showExistencia) rowHtml += `<td style="padding: 8px 12px; text-align: right; font-weight: 800; color: #0f172a;">${p.stockInicial || 0}</td>`;
                if (showCostoTotal) rowHtml += `<td style="padding: 8px 12px; text-align: right; font-weight: 700; color: #6366f1;">$${((p.stockInicial || 0) * (p.costo || 0)).toFixed(2)}</td>`;

                tr.innerHTML = rowHtml;
                tbody.appendChild(tr);
            });
        }
    }

    saveLocalProgress() {
        localStorage.setItem('draft_inventario_' + this.selectedMonth, JSON.stringify(this.draftInventario || []));
        localStorage.setItem('draft_entradas_' + this.selectedMonth, JSON.stringify(this.draftEntradas || []));
        localStorage.setItem('draft_salidas_' + this.selectedMonth, JSON.stringify(this.draftSalidas || []));

        alert(`💾 ¡Avance Guardado Exitosamente!\n\nSe han respaldado tus progresos del mes de ${this.selectedMonth} en la memoria local de tu equipo.`);
    }

    // =========================================
    // PASO 3: ENTRADAS / COMPRAS LOGIC
    // =========================================
    analyzeEntradasSheet() {
        if (!this.workbook || !this.workbook.SheetNames || this.workbook.SheetNames.length === 0) return;
        const sheetSelect = document.getElementById('construccion-entradas-sheet-select');
        const selectedSheetName = (sheetSelect && sheetSelect.value) ? sheetSelect.value : this.workbook.SheetNames[0];
        const worksheet = this.workbook.Sheets[selectedSheetName];

        if (!worksheet) return alert("No se pudo leer la hoja seleccionada.");

        // Autocompletar nombre del proveedor con el nombre de la hoja
        const provInput = document.getElementById('e-input-proveedor-nombre');
        if (provInput) provInput.value = selectedSheetName;

        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        if (!rows || rows.length === 0) return alert("La hoja '" + selectedSheetName + "' no contiene datos.");

        let headerRowIndex = 0;
        let maxColsCount = 0;
        for (let i = 0; i < Math.min(rows.length, 25); i++) {
            const row = rows[i];
            if (row && Array.isArray(row)) {
                const filledCols = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '').length;
                if (filledCols > maxColsCount) {
                    maxColsCount = filledCols;
                    headerRowIndex = i;
                }
            }
        }

        const headerRow = rows[headerRowIndex] || [];
        this.entradasHeaders = headerRow.map((h, i) => (h !== null && h !== undefined && String(h).trim() !== '') ? String(h).trim() : `Columna ${i + 1}`);
        this.entradasData = rows.slice(headerRowIndex + 1).filter(r => r && r.length > 0 && r.some(c => c !== null && c !== undefined && String(c).trim() !== ''));

        if (this.entradasData.length === 0) {
            this.entradasData = rows.slice(headerRowIndex);
        }

        this.setupEntradasColumnMapper();
    }

    setupEntradasColumnMapper() {
        const mappers = ['e-map-codigo', 'e-map-descripcion', 'e-map-cantidad', 'e-map-costo'];
        
        mappers.forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;
            select.innerHTML = '<option value="">-- No incluir / Omitir --</option>';

            (this.entradasHeaders || []).forEach((header, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                opt.text = `${header} (Columna ${idx + 1})`;
                select.add(opt);
            });

            select.onchange = () => this.renderEntradasPreview();
        });

        this.autoMapEntradasColumns();
        this.renderEntradasPreview();

        const step2 = document.getElementById('construccion-entradas-step-2');
        if (step2) step2.style.display = 'block';
    }

    autoMapEntradasColumns() {
        const headersLower = (this.entradasHeaders || []).map(h => h.toLowerCase().trim());

        const mapField = (selectId, keywords) => {
            const select = document.getElementById(selectId);
            if (!select) return;
            for (let i = 0; i < headersLower.length; i++) {
                const h = headersLower[i];
                if (keywords.some(k => h.includes(k))) {
                    select.value = i;
                    break;
                }
            }
        };

        mapField('e-map-codigo', ['código', 'codigo', 'cod', 'sku', 'part']);
        mapField('e-map-descripcion', ['desc', 'producto', 'artículo', 'articulo', 'nombre']);
        mapField('e-map-cantidad', ['cant', 'cantidad', 'entradas', 'entrada', 'unidades', 'compras']);
        mapField('e-map-costo', ['costo', 'precio', 'monto', 'unitario', 'valor']);
    }

    renderEntradasPreview() {
        const thead = document.getElementById('e-preview-header');
        const tbody = document.getElementById('e-preview-body');

        if (!thead || !tbody) return;

        const idxCodigo = document.getElementById('e-map-codigo')?.value;
        const idxDesc = document.getElementById('e-map-descripcion')?.value;
        const idxCant = document.getElementById('e-map-cantidad')?.value;
        const idxCosto = document.getElementById('e-map-costo')?.value;

        const mapCodigoIdx = idxCodigo !== undefined && idxCodigo !== '' ? parseInt(idxCodigo) : -1;
        const mapDescIdx = idxDesc !== undefined && idxDesc !== '' ? parseInt(idxDesc) : -1;
        const mapCantIdx = idxCant !== undefined && idxCant !== '' ? parseInt(idxCant) : -1;
        const mapCostoIdx = idxCosto !== undefined && idxCosto !== '' ? parseInt(idxCosto) : -1;

        thead.innerHTML = '';
        tbody.innerHTML = '';

        if (!this.entradasHeaders || this.entradasHeaders.length === 0) return;

        let trHead = document.createElement('tr');
        this.entradasHeaders.forEach((h, idx) => {
            let th = document.createElement('th');
            th.style.padding = '8px 12px';
            th.style.textAlign = 'left';
            th.style.borderBottom = '2px solid #cbd5e1';
            th.style.color = '#475569';

            let badges = [];
            if (idx === mapCodigoIdx) badges.push('<span class="badge" style="background:#2563eb; color:#fff; font-size:0.68rem; margin-right:4px; padding:2px 6px; border-radius:4px;">📌 Código</span>');
            if (idx === mapDescIdx) badges.push('<span class="badge" style="background:#0284c7; color:#fff; font-size:0.68rem; margin-right:4px; padding:2px 6px; border-radius:4px;">📌 Desc</span>');
            if (idx === mapCantIdx) badges.push('<span class="badge" style="background:#059669; color:#fff; font-size:0.68rem; margin-right:4px; padding:2px 6px; border-radius:4px;">📌 Cant</span>');
            if (idx === mapCostoIdx) badges.push('<span class="badge" style="background:#7c3aed; color:#fff; font-size:0.68rem; margin-right:4px; padding:2px 6px; border-radius:4px;">Costo</span>');

            th.innerHTML = badges.join('') + h;
            trHead.appendChild(th);
        });
        thead.appendChild(trHead);

        const sampleRows = (this.entradasData || []).slice(0, 5);
        sampleRows.forEach(row => {
            let tr = document.createElement('tr');
            this.entradasHeaders.forEach((_, cIdx) => {
                let td = document.createElement('td');
                td.textContent = row[cIdx] !== undefined ? row[cIdx] : '';
                td.style.padding = '6px 12px';
                td.style.borderTop = '1px solid #e2e8f0';
                if (cIdx === mapCodigoIdx || cIdx === mapDescIdx || cIdx === mapCantIdx || cIdx === mapCostoIdx) {
                    td.style.fontWeight = '700';
                    td.style.background = 'rgba(236, 253, 245, 0.5)';
                }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }

    addCurrentEntradasSheetToBatch() {
        const sheetSelect = document.getElementById('construccion-entradas-sheet-select');
        const sheetName = sheetSelect ? sheetSelect.value : 'Hoja';
        const provName = (document.getElementById('e-input-proveedor-nombre')?.value || sheetName).trim();
        const ivaModo = document.getElementById('e-select-iva-modo')?.value || 'INCLUYE_IVA';

        const idxCodigo = document.getElementById('e-map-codigo')?.value;
        const idxDesc = document.getElementById('e-map-descripcion')?.value;
        const idxCant = document.getElementById('e-map-cantidad')?.value;
        const idxCosto = document.getElementById('e-map-costo')?.value;

        if ((!idxCant && idxCant !== 0) || (idxDesc === '' && idxCodigo === '')) {
            return alert("Por favor selecciona al menos la columna de Cantidad Entrante y al menos Código o Descripción.");
        }

        const sheetEntries = [];
        let rowCount = 0;

        for (const row of (this.entradasData || [])) {
            const codigoRaw = idxCodigo !== '' && row[idxCodigo] ? String(row[idxCodigo]).trim() : '';
            const descRaw = idxDesc !== '' && row[idxDesc] ? String(row[idxDesc]).trim() : '';
            const cantVal = idxCant !== '' && row[idxCant] ? parseFloat(String(row[idxCant]).replace(/[^0-9.-]/g, '')) || 0 : 0;
            let costoVal = idxCosto !== '' && row[idxCosto] ? parseFloat(String(row[idxCosto]).replace(/[^0-9.]/g, '')) || 0 : 0;

            if (cantVal <= 0) continue;

            const codigoFinal = codigoRaw || (descRaw ? 'PROD-' + Math.floor(100000 + Math.random() * 900000) : '');
            if (!codigoFinal && !descRaw) continue;

            // Calcular costos segun IVA
            let costoSinIva = costoVal;
            let costoConIva = costoVal;

            if (ivaModo === 'INCLUYE_IVA') {
                costoConIva = costoVal;
                costoSinIva = costoVal > 0 ? Number((costoVal / 1.13).toFixed(2)) : 0;
            } else if (ivaModo === 'MAS_IVA') {
                costoSinIva = costoVal;
                costoConIva = Number((costoVal * 1.13).toFixed(2));
            }

            sheetEntries.push({
                codigo: codigoFinal,
                descripcion: descRaw || 'PRODUCTO ENTRADA',
                cantidad: cantVal,
                costoUnitario: costoConIva,
                costoSinIva: costoSinIva,
                montoTotal: Number((cantVal * costoConIva).toFixed(2)),
                proveedor: provName,
                hojaOrigen: sheetName,
                ivaModoLabel: ivaModo === 'INCLUYE_IVA' ? 'Precios con IVA' : 'Precios + IVA (13%)'
            });

            rowCount++;
        }

        if (rowCount === 0) {
            return alert(`No se encontraron registros de entradas válidos en la hoja '${sheetName}'.`);
        }

        // Agregar al lote pendiente
        this.pendingEntradasBatch.push(...sheetEntries);
        this.pendingSheetsList.push({
            sheetName: sheetName,
            proveedor: provName,
            rowCount: rowCount,
            ivaModoLabel: ivaModo === 'INCLUYE_IVA' ? 'Precios con IVA' : 'Precios + IVA (13%)',
            entries: sheetEntries
        });

        this.renderPendingSheetsTable();

        alert(`✅ Hoja "${sheetName}" (${provName}) agregada al lote.\n\nSe agregaron ${rowCount} entradas de compras.\nPuedes seleccionar otra hoja de proveedor o procesar el lote acumulado.`);
    }

    removeSheetFromEntradasBatch(index) {
        if (index < 0 || index >= this.pendingSheetsList.length) return;
        const removed = this.pendingSheetsList.splice(index, 1)[0];
        if (removed && removed.entries) {
            this.pendingEntradasBatch = this.pendingEntradasBatch.filter(e => e.hojaOrigen !== removed.sheetName || e.proveedor !== removed.proveedor);
        }
        this.renderPendingSheetsTable();
    }

    renderPendingSheetsTable() {
        const container = document.getElementById('lote-entradas-summary-container');
        const tbody = document.getElementById('tbl-lote-sheets-body');

        if (!container || !tbody) return;

        if (!this.pendingSheetsList || this.pendingSheetsList.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';

        tbody.innerHTML = '';
        let totalItems = 0;

        this.pendingSheetsList.forEach((item, idx) => {
            totalItems += item.rowCount;
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #cbd5e1';

            tr.innerHTML = `
                <td style="padding: 8px 12px; font-weight: 700; color: #059669;">${item.sheetName}</td>
                <td style="padding: 8px 12px; font-weight: 700; color: #1e293b;">${item.proveedor}</td>
                <td style="padding: 8px 12px; text-align: center;"><span class="badge" style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:4px; font-weight:700;">${item.ivaModoLabel}</span></td>
                <td style="padding: 8px 12px; text-align: right; font-weight: 800; color: #059669;">+${item.rowCount} artículos</td>
                <td style="padding: 8px 12px; text-align: center;">
                    <button type="button" class="btn btn-sm btn-danger" onclick="appConstruccion.removeSheetFromEntradasBatch(${idx})" style="padding: 4px 10px; font-size: 0.75rem; cursor: pointer;">
                        <i class="fas fa-trash"></i> Quitar
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        const countBadge = document.getElementById('lote-total-items-badge');
        if (countBadge) countBadge.innerText = `${totalItems} entradas acumuladas de ${this.pendingSheetsList.length} proveedor(es)`;
    }

    commitEntradasBatchToDraft() {
        if (!this.pendingEntradasBatch || this.pendingEntradasBatch.length === 0) {
            return alert("No hay hojas de proveedores agregadas al lote.");
        }

        const totalEntries = this.pendingEntradasBatch.length;
        const totalSheets = this.pendingSheetsList.length;

        this.draftEntradas = [...(this.draftEntradas || []), ...this.pendingEntradasBatch];
        localStorage.setItem('draft_entradas_' + this.selectedMonth, JSON.stringify(this.draftEntradas));

        // Limpiar lote pendiente
        this.pendingEntradasBatch = [];
        this.pendingSheetsList = [];
        this.renderPendingSheetsTable();

        // Actualizar tabla y métricas
        this.renderDraftEntradasTable();

        alert(`🎉 ¡LOTE DE COMPRAS CONSOLIDADO EN BORRADOR LOCAL!\n\nSe integraron ${totalEntries} compras de ${totalSheets} proveedor(es) al borrador local.`);
    }

    renderDraftEntradasTable() {
        const tableContainer = document.getElementById('draft-entradas-table-container');
        const countLabel = document.getElementById('paso3-count-label');

        if (countLabel) countLabel.innerText = this.draftEntradas ? this.draftEntradas.length : 0;

        const metricEntradas = document.getElementById('metric-total-entradas');
        if (metricEntradas) metricEntradas.innerText = this.draftEntradas ? this.draftEntradas.length : 0;

        if (!this.draftEntradas || this.draftEntradas.length === 0) {
            if (tableContainer) tableContainer.style.display = 'none';
            return;
        }

        if (tableContainer) tableContainer.style.display = 'block';

        const tbody = document.getElementById('tbl-draft-entradas-body');
        if (tbody) {
            tbody.innerHTML = '';
            this.draftEntradas.forEach((e, idx) => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #e2e8f0';

                tr.innerHTML = `
                    <td style="padding: 8px 12px; text-align: center; color: #64748b;">${idx + 1}</td>
                    <td style="padding: 8px 12px; font-weight: 700; color: #2563eb;">${e.codigo}</td>
                    <td style="padding: 8px 12px; color: #1e293b;">${e.descripcion}</td>
                    <td style="padding: 8px 12px; text-align: right; font-weight: 800; color: #059669;">+${e.cantidad}</td>
                    <td style="padding: 8px 12px; text-align: right; color: #475569;">$${(e.costoUnitario || 0).toFixed(2)}</td>
                    <td style="padding: 8px 12px; text-align: right; font-weight: 700; color: #6366f1;">$${(e.montoTotal || 0).toFixed(2)}</td>
                    <td style="padding: 8px 12px; color: #64748b;">${e.proveedor || '-'}</td>
                `;
                tbody.appendChild(tr);
            });
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
