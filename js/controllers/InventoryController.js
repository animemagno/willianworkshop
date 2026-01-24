// NO IMPORTS -> Usamos window.InventoryService y window.InventoryUI

class InventoryController {
    constructor() {
        // Fallback checks
        if (!window.InventoryService) { console.error("InventoryService no cargado"); return; }
        if (!window.InventoryUI) { console.error("InventoryUI no cargado"); return; }

        this.svc = new window.InventoryService();
        this.ui = new window.InventoryUI(); // Instancia Global

        this.cache = [];
        this.filtered = [];
        this.sortState = { key: 'descripcion', dir: 'asc' };

        // Entradas Cache
        this.entryCart = [];
        this.excelData = [];

        // Providers Cache
        this.providersCache = [];

        // History Linking Cache
        this.historyUnlinked = [];

        this.init();
    }

    async init() {
        console.log("INVENTORY CONTROLLER (GLOBAL) STARTED");
        this.bindEvents();
        this.exposeGlobalFunctions();
        await this.loadData();

        // Check for tools in URL
        const params = new URLSearchParams(window.location.search);
        if (params.get('tool') === 'link-history') {
            // Remove param clean
            window.history.replaceState({}, document.title, window.location.pathname);
            this.ui.activateTab('salidas');
            this.openLinkHistoryTool();
        }
    }

    // ... [resto del código sin cambios hasta el final]

    // =========================================
    // HERRAMIENTA DE APRENDIZAJE DE ALIAS (HISTORIAL)
    // =========================================

    async openLinkHistoryTool() {
        const modal = document.getElementById('modalLinkHistory');
        const listBody = document.getElementById('link-history-body');
        const loading = document.getElementById('link-history-loading');

        if (!modal) return;
        modal.style.display = 'flex';
        listBody.innerHTML = '';
        loading.style.display = 'block';

        // 1. Obtener Historial (Profundo, más de 50)
        // Usaremos acceso directo a Firestore aquí para no modificar el service standard 'obtenerSalidas' que tiene limite 50
        try {
            // Traemos ultimas 500 salidas para analizar
            const snapshot = await db.collection('INVENTARIO_SALIDAS')
                .orderBy('timestamp', 'desc')
                .limit(500)
                .get();

            const allExits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // 2. Analizar Items
            const stats = {}; // Map: "Nombre Raro" -> { count: 0, examples: [] }

            allExits.forEach(exit => {
                if (!exit.items) return;
                exit.items.forEach(item => {
                    // Si NO tiene productId, es candidato
                    if (!item.productId) {
                        const rawName = (item.descripcionPapel || item.name || item.itemExcel || "").trim();
                        if (rawName.length > 1) { // Ignorar vacios
                            if (!stats[rawName]) stats[rawName] = { count: 0, ids: [] };
                            stats[rawName].count++;
                        }
                    }
                });
            });

            // Convertir a Array y Ordenar
            this.historyUnlinked = Object.keys(stats).map(key => ({
                name: key,
                count: stats[key].count
            })).sort((a, b) => b.count - a.count);

            loading.style.display = 'none';
            this.renderLinkHistoryList();

        } catch (e) {
            console.error("Error analizando historial:", e);
            loading.innerText = "Error: " + e.message;
        }
    }

    renderLinkHistoryList() {
        const tbody = document.getElementById('link-history-body');
        tbody.innerHTML = '';

        if (this.historyUnlinked.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:30px; color:green;"><i class="fas fa-check-circle" style="font-size:2rem"></i><br>¡Excelente! Todo el historial reciente está vinculado.</td></tr>';
            return;
        }

        this.historyUnlinked.forEach((item, index) => {
            // Verificar si YA lo tenemos en caché de productos (por si el usuario vinculó uno y recargamos la lista)
            // Si el nombre YA existe como alias en algun producto, deberiamos ocultarlo o marcarlo como "Listo"
            const alreadyLinked = this.cache.some(p => (p.aliases || []).includes(item.name.toLowerCase()));

            if (alreadyLinked) return; // Ya se aprendió en esta sesión

            tbody.innerHTML += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="font-weight:bold; color:#444;">${item.name}</td>
                    <td style="text-align:center;">${item.count}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="app.prepareLinkFromHistory('${item.name.replace(/'/g, "\\'")}')">
                            <i class="fas fa-link"></i> Vincular
                        </button>
                    </td>
                </tr>
             `;
        });
    }

    prepareLinkFromHistory(name) {
        // Reutilizamos el modal de Excel
        // Ponemos un flag para saber que venimos de historial
        this.isHistoryLinking = true;
        this.currentHistoryName = name;

        const modal = document.getElementById('modalLinkProduct');
        document.getElementById('link-excel-name').innerText = name;
        document.getElementById('link-search-input').value = "";

        modal.style.display = 'flex';
        document.getElementById('link-search-input').focus();

        // Setup search logic (misma que excel)
        document.getElementById('link-search-input').onkeyup = (e) => this.searchLinkProduct(e.target.value);
        this.searchLinkProduct("");
    }

    // Sobreescribir o adaptar selectLinkProduct para manejar el flag isHistoryLinking
    // Modificaremos selectLinkProduct abajo...

    // ...
    // Modificaremos selectLinkProduct abajo...

    // ...


    exposeGlobalFunctions() {
        // Funciones para onclick="" del HTML
        window.editarProducto = (id) => this.openEditModal(id);
        window.eliminarProducto = (id) => this.deleteProduct(id);
        window.app = this;
    }

    bindEvents() {
        // TABS
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.target;
                this.ui.activateTab(target);
                if (target === 'entradas') this.loadEntries();
                if (target === 'salidas') this.loadExitsLog();
                if (target === 'reportes') this.loadReports();
            });
        });

        // SEARCH
        const searchInput = document.getElementById('buscar-producto');
        if (searchInput) searchInput.addEventListener('input', (e) => this.filterData(e.target.value));

        const refreshBtn = document.getElementById('btn-refresh');
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.loadData());

        // BACKUP Y ALIAS EVENTS
        const btnCreateBackup = document.getElementById('btn-create-backup');
        if (btnCreateBackup) btnCreateBackup.addEventListener('click', () => this.createBackup());

        const btnOpenBackups = document.getElementById('btn-open-backups');
        if (btnOpenBackups) btnOpenBackups.addEventListener('click', () => this.openBackupHistory());

        const btnOpenAliasManager = document.getElementById('btn-open-alias-manager');
        if (btnOpenAliasManager) btnOpenAliasManager.addEventListener('click', () => this.openAliasManager());

        // SORT
        document.querySelectorAll('th[data-sort]').forEach(th => {
            th.addEventListener('click', () => this.handleSort(th.dataset.sort));
        });

        // SAVE NEW
        const btnSaveNew = document.getElementById('btn-save-new');
        if (btnSaveNew) btnSaveNew.addEventListener('click', () => this.saveNewProduct());

        // UPDATE EXISTING (Modal)
        const btnUpdate = document.getElementById('btn-update-product');
        if (btnUpdate) btnUpdate.addEventListener('click', () => this.updateProduct());

        // EXCEL
        const dropArea = document.getElementById('excel-drop-area');
        const fileInput = document.getElementById('excel-file');

        // Validar que existan, por si acaso
        if (dropArea && fileInput) {
            dropArea.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => this.handleExcelFile(e.target.files[0]));

            dropArea.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.classList.add('dragover'); });
            dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
            dropArea.addEventListener('drop', (e) => {
                e.preventDefault(); dropArea.classList.remove('dragover');
                if (e.dataTransfer.files.length) this.handleExcelFile(e.dataTransfer.files[0]);
            });
        }

        const btnConfirmExcel = document.getElementById('btn-confirm-excel');
        if (btnConfirmExcel) btnConfirmExcel.addEventListener('click', () => this.uploadExcelData());

        const btnCancelExcel = document.getElementById('btn-cancel-excel');
        if (btnCancelExcel) btnCancelExcel.addEventListener('click', () => {
            document.getElementById('excel-preview').style.display = 'none';
            if (dropArea) dropArea.style.display = 'block';
            this.excelData = [];
        });

        // ENTRADAS EVENTS
        const btnOpenEntry = document.getElementById('btn-open-entry-modal');
        if (btnOpenEntry) btnOpenEntry.addEventListener('click', () => this.openEntryModal());

        const btnCloseEntry = document.getElementById('btn-close-entry-modal');
        if (btnCloseEntry) btnCloseEntry.addEventListener('click', () => this.closeEntryModal());

        const btnCancelEntry = document.getElementById('btn-cancel-entry');
        if (btnCancelEntry) btnCancelEntry.addEventListener('click', () => this.closeEntryModal());

        const btnProcessEntry = document.getElementById('btn-process-entry');
        if (btnProcessEntry) btnProcessEntry.addEventListener('click', () => this.processEntry());

        // SALIDAS EVENTS (NUEVO REFACTOR)
        const btnOpenExit = document.getElementById('btn-open-exit-modal');
        if (btnOpenExit) btnOpenExit.addEventListener('click', () => this.openExitModal());

        const btnCloseExit = document.getElementById('btn-close-exit-modal');
        if (btnCloseExit) btnCloseExit.addEventListener('click', () => this.closeExitModal());

        const btnCancelExit = document.getElementById('btn-cancel-exit');
        if (btnCancelExit) btnCancelExit.addEventListener('click', () => this.closeExitModal());

        const btnSaveExit = document.getElementById('btn-save-exit');
        if (btnSaveExit) btnSaveExit.addEventListener('click', () => this.saveExit());

        const btnPrintExit = document.getElementById('btn-print-exit');
        if (btnPrintExit) btnPrintExit.addEventListener('click', () => alert("Funcion Imprimir en desarrollo..."));

        // Lógica de Inputs Salida (Enter Navigation)
        const exitQty = document.getElementById('exit-temp-qty');
        if (exitQty) {
            exitQty.addEventListener('keydown', (e) => this.handleExitInputKey(e, 'qty'));
            // Seleccionar texto al enfocar para sobreescribir facil
            exitQty.addEventListener('focus', () => exitQty.select());
        }

        const exitSearch = document.getElementById('exit-temp-search');
        if (exitSearch) {
            exitSearch.addEventListener('input', (e) => this.searchProductExit(e.target.value));
            exitSearch.addEventListener('keydown', (e) => this.handleExitInputKey(e, 'search'));
            // Close suggestion logic
            document.addEventListener('click', (e) => {
                if (e.target !== exitSearch && !e.target.closest('#exit-search-results')) {
                    const res = document.getElementById('exit-search-results');
                    if (res) res.style.display = 'none';
                }
            });
        }

        const exitPrice = document.getElementById('exit-temp-price');
        if (exitPrice) {
            exitPrice.addEventListener('keydown', (e) => this.handleExitInputKey(e, 'price'));
            exitPrice.addEventListener('focus', () => exitPrice.select());
        }

        // Salidas Excel Import Events
        const btnOpenExitExcel = document.getElementById('btn-open-exit-excel-modal');
        if (btnOpenExitExcel) btnOpenExitExcel.addEventListener('click', () => {
            document.getElementById('modalImportarSalidas').style.display = 'flex';
            document.getElementById('exit-excel-preview-container').style.display = 'none';
            document.getElementById('exit-excel-drop-area').style.display = 'block';
        });

        const dropAreaExit = document.getElementById('exit-excel-drop-area');
        const fileInputExit = document.getElementById('exit-excel-file');

        if (dropAreaExit && fileInputExit) {
            dropAreaExit.addEventListener('click', () => fileInputExit.click());

            fileInputExit.addEventListener('change', (e) => this.handleExitExcelFile(e.target.files[0]));

            dropAreaExit.addEventListener('dragover', (e) => { e.preventDefault(); dropAreaExit.classList.add('dragover'); });
            dropAreaExit.addEventListener('dragleave', () => dropAreaExit.classList.remove('dragover'));
            dropAreaExit.addEventListener('drop', (e) => {
                e.preventDefault(); dropAreaExit.classList.remove('dragover');
                if (e.dataTransfer.files.length) this.handleExitExcelFile(e.dataTransfer.files[0]);
            });
        }

        const btnProcessExitExcel = document.getElementById('btn-process-exit-excel');
        if (btnProcessExitExcel) btnProcessExitExcel.addEventListener('click', () => this.saveBatchExits());

        const btnViewBatches = document.getElementById('btn-view-batches');
        if (btnViewBatches) btnViewBatches.addEventListener('click', () => this.openBatchHistory());

        // Validacion Factura en tiempo real
        const invNumInput = document.getElementById('exit-invoice-number');
        if (invNumInput) {
            invNumInput.addEventListener('blur', async () => {
                const val = parseInt(invNumInput.value) || 0;
                if (val > 0) {
                    const last = await this.svc.getLastInvoiceNumber(); // Podriamos optimizar esto cacheando el lastNum
                    this.checkInvoiceJump(val, last);
                }
            });
        }




        // ENTRADA: Navegación Reforzada (Tab y Enter)
        const entryQty = document.getElementById('entry-temp-qty');
        const entryName = document.getElementById('entry-temp-name');
        const entryCost = document.getElementById('entry-temp-cost');

        if (entryQty) {
            entryQty.addEventListener('keydown', (e) => {
                if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); if (entryName) entryName.focus(); }
                if (e.key === 'Enter') { e.preventDefault(); if (entryName) entryName.focus(); }
            });
        }
        if (entryName) {
            entryName.addEventListener('keydown', (e) => {
                if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); if (entryCost) entryCost.focus(); }
                if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); if (entryQty) entryQty.focus(); }
                if (e.key === 'Enter') { e.preventDefault(); if (entryCost) entryCost.focus(); }
            });
            entryName.addEventListener('input', (e) => this.handleEntryProductSearch(e.target.value));
        }
        if (entryCost) {
            entryCost.addEventListener('keydown', (e) => {
                if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); if (entryQty) entryQty.focus(); }
                if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); if (entryName) entryName.focus(); }
                if (e.key === 'Enter') { e.preventDefault(); this.addEntryItem(); }
            });
        }

        // Close search results when clicking outside
        document.addEventListener('click', (e) => {
            if (entryName && e.target !== entryName && !e.target.closest('#entry-search-results')) {
                const res = document.getElementById('entry-search-results');
                if (res) res.style.display = 'none';
            }
        });

        // Extra Actions Injection (Borrar todo)
        this.injectExtraActions();
    }

    // =========================================
    // DATA HANDLING
    // =========================================
    async loadData() {
        const tbody = document.getElementById('inventario-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="text-align:center">Cargando datos...</td></tr>';

        try {
            this.cache = await this.svc.obtenerTodos();
            this.filtered = [...this.cache];
            this.applySort();
        } catch (error) {
            console.error(error);
            if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="color:red; text-align:center">Error: ${error.message}</td></tr>`;
        }
    }

    filterData(query) {
        if (!query) {
            this.filtered = [...this.cache];
        } else {
            const q = query.toLowerCase();
            this.filtered = this.cache.filter(p =>
                (p.codigo || "").toLowerCase().includes(q) ||
                (p.descripcion || "").toLowerCase().includes(q) ||
                (p.proveedor || "").toLowerCase().includes(q)
            );
        }
        this.applySort();
    }

    handleSort(key) {
        if (this.sortState.key === key) {
            this.sortState.dir = this.sortState.dir === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortState.key = key;
            this.sortState.dir = 'asc';
        }
        this.applySort();
    }

    applySort() {
        const { key, dir } = this.sortState;

        this.filtered.sort((a, b) => {
            let valA = a[key] || "";
            let valB = b[key] || "";

            // Si es numérico
            if (typeof valA === 'number' && typeof valB === 'number') {
                return dir === 'asc' ? valA - valB : valB - valA;
            }
            // Strings
            valA = String(valA).toLowerCase();
            valB = String(valB).toLowerCase();
            if (valA < valB) return dir === 'asc' ? -1 : 1;
            if (valA > valB) return dir === 'asc' ? 1 : -1;
            return 0;
        });

        this.render();
    }

    render() {
        // Adapter: Convert Service Data to UI Data
        const uiData = this.filtered.slice(0, 200).map(p => ({
            id: p.id,
            codigo: p.codigo,
            codigosProveedor: [],
            descInventario: p.descripcion,
            descFactura: p.descripcionFactura,
            precioCosto: p.costo || 0,
            precioVenta: p.precio || 0,
            existencia: p.existencia || 0,
            stockMinimo: p.stockMinimo || 5,
            creditoFiscal: p.creditoFiscal,
            proveedor: p.proveedor
        }));

        this.ui.renderTable(uiData);
    }

    // =========================================
    // CRUD
    // =========================================

    async saveNewProduct() {
        const formData = this.ui.getNewFormData();

        const serviceData = {
            codigo: formData.codigo,
            descripcion: formData.descInventario,
            descripcionFactura: formData.descFactura,
            costo: formData.precioCosto,
            precio: formData.precioVenta,
            existencia: formData.existencia,
            stockMinimo: formData.stockMinimo,
            creditoFiscal: formData.creditoFiscal,
            proveedor: formData.proveedor
            // categoria...
        };

        if (!serviceData.codigo || !serviceData.descripcion) {
            alert("Código y Descripción son obligatorios");
            return;
        }

        if (confirm("¿Guardar nuevo producto?")) {
            try {
                await this.svc.guardarProducto(serviceData);
                alert("Guardado!");
                this.ui.clearNewForm();
                this.loadData();
            } catch (e) {
                alert("Error: " + e.message);
            }
        }
    }

    openEditModal(id) {
        const p = this.cache.find(item => item.id === id);
        if (!p) return;

        // Adapter
        const uiProduct = {
            id: p.id,
            codigo: p.codigo,
            codigosProveedor: [],
            descInventario: p.descripcion,
            descFactura: p.descripcionFactura,
            precioCosto: p.costo,
            precioVenta: p.precio,
            existencia: p.existencia,
            stockMinimo: p.stockMinimo,
            creditoFiscal: p.creditoFiscal,
            proveedor: p.proveedor
        };

        this.ui.showEditModal(uiProduct);
    }

    async updateProduct() {
        const formData = this.ui.getEditFormData();

        const serviceData = {
            codigo: formData.codigo,
            descripcion: formData.descInventario,
            descripcionFactura: formData.descFactura,
            costo: formData.precioCosto,
            precio: formData.precioVenta,
            existencia: formData.existencia,
            stockMinimo: formData.stockMinimo,
            creditoFiscal: formData.creditoFiscal,
            proveedor: formData.proveedor
        };

        try {
            await this.svc.actualizarProducto(formData.id, serviceData);
            alert("Actualizado correctamente");
            this.ui.hideEditModal();
            this.loadData();
        } catch (e) {
            alert("Error al actualizar: " + e.message);
        }
    }

    async deleteProduct(id) {
        const p = this.cache.find(x => x.id === id);
        let msg = "¿Eliminar producto permanentemente?";

        if (p && p.existencia > 0) {
            msg = `⚠️ CUIDADO: Este producto tiene EXISTENCIA (${p.existencia}).\n\nEliminarlo borrará el registro de inventario sin generar una salida.\n¿Está SEGURO de eliminarlo?`;
        }

        if (confirm(msg)) {
            try {
                await this.svc.eliminarProducto(id);
                // Remove from cache instantly
                this.cache = this.cache.filter(p => p.id !== id);
                // Re-apply filter to update view without network call
                const searchVal = document.getElementById('buscar-producto').value;
                this.filterData(searchVal);
            } catch (e) {
                alert("Error: " + e.message);
            }
        }
    }

    // =========================================
    // EXCEL
    // =========================================
    handleExcelFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            console.log('Hojas encontradas:', workbook.SheetNames);

            // Buscar hoja con datos de inventario (más flexible)
            const keywords = ['codigo', 'cod', 'descrip', 'desc', 'venta', 'precio', 'stock', 'exist', 'producto'];
            let bestSheet = null;
            let bestSheetName = '';

            for (const name of workbook.SheetNames) {
                const sheet = workbook.Sheets[name];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                console.log(`Analizando hoja "${name}":`, rows.slice(0, 5));

                let matches = 0;
                // Revisar las primeras 30 filas
                rows.slice(0, 30).forEach(row => {
                    const txt = JSON.stringify(row).toLowerCase();
                    keywords.forEach(k => {
                        if (txt.includes(k)) matches++;
                    });
                });

                console.log(`Hoja "${name}" tiene ${matches} coincidencias de palabras clave`);

                // Si tiene al menos 1 coincidencia, considerarla válida
                if (matches > 0) {
                    bestSheet = rows;
                    bestSheetName = name;
                    break;
                }
            }

            if (!bestSheet) {
                alert(`No se detectó hoja válida.\n\nHojas encontradas: ${workbook.SheetNames.join(', ')}\n\nAsegúrate de que tu Excel tenga encabezados con palabras como:\nCodigo, Descripcion, Precio, Venta, Stock, Existencia`);
                return;
            }

            console.log(`Procesando hoja: "${bestSheetName}"`);
            this.processExcelRows(bestSheet);
        };
        reader.readAsArrayBuffer(file);
    }

    processExcelRows(rows) {
        let headerIdx = -1;
        const keywords = ['codigo', 'descrip', 'venta', 'precio', 'stock'];
        for (let i = 0; i < Math.min(rows.length, 50); i++) {
            const rowStr = JSON.stringify(rows[i]).toLowerCase();
            if (keywords.some(k => rowStr.includes(k))) { headerIdx = i; break; }
        }

        if (headerIdx === -1) { alert("No se encontraron encabezados."); return; }

        // LIMPIAR ESPACIOS EN BLANCO DE HEADERS
        const rawHeaders = rows[headerIdx];
        const headers = rawHeaders.map(h => String(h).toLowerCase().trim());
        const dataRows = rows.slice(headerIdx + 1);

        console.log('Headers detectados (limpios):', headers);

        const colMap = {
            codigo: headers.findIndex(h => h.includes('cod') || h === 'id'),
            desc: headers.findIndex(h => h.includes('descrip') || h.includes('prod') || h.includes('inventario')),
            costo: headers.findIndex(h => h.includes('precio') && h.includes('costo')),
            precio: headers.findIndex(h => h.includes('precio') && h.includes('venta')),
            exist: headers.findIndex(h => h.includes('exist') || h.includes('cant') || h.includes('stock')),
            prov: headers.findIndex(h => h.includes('prov'))
        };

        console.log('Mapeo de columnas:', colMap);

        this.excelData = dataRows.map(row => {
            if (!row[colMap.codigo] && !row[colMap.desc]) return null;
            const cleanNum = (val) => {
                if (!val) return 0;
                if (typeof val === 'number') return val;
                return parseFloat(String(val).replace(/[^0-9.]/g, '')) || 0;
            };
            return {
                codigo: row[colMap.codigo] ? String(row[colMap.codigo]) : "",
                descripcion: row[colMap.desc] || "Sin Descripción",
                descripcionFactura: "",
                costo: cleanNum(row[colMap.costo]),
                precio: cleanNum(row[colMap.precio]),
                existencia: cleanNum(row[colMap.exist]),
                stockMinimo: 3,
                creditoFiscal: true,
                proveedor: row[colMap.prov] || ""
            };
        }).filter(item => item !== null);

        this.ui.renderExcelPreview(this.excelData);
    }

    async uploadExcelData() {
        if (this.excelData.length === 0) return;
        const btn = document.getElementById('btn-confirm-excel');
        btn.disabled = true; btn.innerText = "Subiendo...";
        try {
            const batchSize = 400;
            for (let i = 0; i < this.excelData.length; i += batchSize) {
                const chunk = this.excelData.slice(i, i + batchSize);
                const batch = db.batch(); // window.db provided by html
                chunk.forEach(data => {
                    const ref = db.collection('INVENTARIO').doc();
                    batch.set(ref, data);
                });
                await batch.commit();
            }
            alert(`Importados ${this.excelData.length} productos.`);
            this.ui.activateTab('lista');
            this.loadData();
        } catch (e) { alert("Error: " + e.message); }
        finally { btn.disabled = false; btn.innerText = "Confirmar Importación"; }
    }


    // =========================================
    // ENTRADAS (CLASS-ADAPTED)
    // =========================================
    async loadEntries() {
        const tbody = document.getElementById('entries-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center">Cargando...</td></tr>';
        try {
            const entries = await this.svc.obtenerEntradas();
            this.renderEntriesTable(entries);
        } catch (e) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="8">Error: ${e}</td></tr>`;
        }
    }

    renderEntriesTable(entries) {
        const tbody = document.getElementById('entries-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Sin entradas.</td></tr>';
            return;
        }

        entries.forEach(e => {
            const dateStr = e.timestamp ? new Date(e.timestamp.seconds * 1000).toLocaleString() : "Reciente";
            const isReverted = e.revertida ? '<span class="badge-no" style="background:#fee;color:red;padding:2px 5px;">REVERTIDA</span>' : '<span class="badge-si" style="background:#efe;color:green;padding:2px 5px;">OK</span>';

            // Items count or fallback for legacy
            const itemsCount = e.items ? e.items.length : 1;
            const totalVal = e.total || (parseFloat(e.cantidad) * parseFloat(e.costoUnitario)) || 0;

            let actionBtn = !e.revertida ?
                `<button class="btn btn-warning" onclick="event.stopPropagation(); app.revertEntry('${e.id}')" title="Revertir"><i class="fas fa-undo"></i></button>` :
                `<button class="btn btn-danger" onclick="event.stopPropagation(); app.deleteEntry('${e.id}')" title="Borrar Historial"><i class="fas fa-trash"></i></button>`;

            const row = document.createElement('tr');
            row.style.cursor = 'pointer';
            row.innerHTML = `
                <td>${dateStr}</td>
                <td>${e.providerName || '-'}<br><small>${e.esCredito ? 'CREDITO' : 'CONTADO'}</small></td>
                <td style="text-align:center">${itemsCount} item(s)</td>
                <td style="text-align:right">$${parseFloat(totalVal).toFixed(2)}</td>
                <td style="text-align:center">${isReverted}</td>
                <td style="text-align:center">${actionBtn}</td>
            `;
            row.onclick = () => this.showEntryHistoryDetails(e.id);
            tbody.appendChild(row);
        });
    }

    async showEntryHistoryDetails(id) {
        try {
            const doc = await db.collection('INVENTARIO_ENTRADAS').doc(id).get();
            if (!doc.exists) return;
            const data = doc.data();

            document.getElementById('detail-entry-title').innerText = "Detalles Entrada";
            document.getElementById('detail-entry-date').innerText = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleString() : (data.fecha || "Reciente");
            document.getElementById('detail-entry-provider').innerText = data.providerName || "Sin Proveedor";
            document.getElementById('detail-entry-total').innerText = "$" + (data.total || 0).toFixed(2);

            const tbody = document.getElementById('detail-entry-body');
            tbody.innerHTML = "";

            const items = data.items || [{
                productCode: data.productId?.substring(0, 8) || 'LEGACY',
                productName: data.productName,
                cantidad: data.cantidad,
                costoUnitario: data.costoUnitario,
                total: (parseFloat(data.cantidad) * parseFloat(data.costoUnitario))
            }];

            items.forEach(item => {
                tbody.innerHTML += `
                    <tr>
                        <td>${item.productCode || '---'}</td>
                        <td>${item.productName}</td>
                        <td style="text-align:center">${item.cantidad}</td>
                        <td style="text-align:right">$${parseFloat(item.costoUnitario).toFixed(2)}</td>
                        <td style="text-align:right">$${parseFloat(item.total || (item.cantidad * item.costoUnitario)).toFixed(2)}</td>
                    </tr>
                `;
            });

            document.getElementById('modalEntryDetails').style.display = 'flex';
        } catch (e) {
            console.error(e);
            alert("Error cargando detalles: " + e);
        }
    }

    async openEntryModal() {
        this.closeEntryModal(); // Resetea campos e ID
        this.entryCart = [];
        this.renderEntryCart();
        // ... (resto del código)
        const dl = document.getElementById('provider-list');
        if (dl) {
            dl.innerHTML = '';
            try {
                // If not cached or reload necessary
                const provs = await this.svc.obtenerProveedores();
                this.providersCache = provs;
                provs.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.nombre || "";
                    dl.appendChild(opt);
                });
            } catch (e) { }
        }
        document.getElementById('entry-modal').style.display = 'flex';
        // Focus provider
        const provInput = document.getElementById('entry-provider-input');
        if (provInput) provInput.focus();
    }

    closeEntryModal() {
        document.getElementById('entry-modal').style.display = 'none';
        // Reset fields
        const inputs = ['entry-provider-input', 'entry-temp-qty', 'entry-temp-name', 'entry-temp-id', 'entry-temp-cost'];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = (id === 'entry-temp-qty') ? 1 : '';
        });

    }

    handleEntryProductSearch(query) {
        // Limpiar ID residual si el usuario empieza a escribir algo nuevo
        document.getElementById('entry-temp-id').value = '';

        const resDiv = document.getElementById('entry-search-results');
        if (!resDiv) return;
        resDiv.innerHTML = '';
        if (!query) { resDiv.style.display = 'none'; return; }

        const q = query.toLowerCase();
        const matches = this.cache.filter(p => matchedProduct(p, q)).slice(0, 8);

        function matchedProduct(p, q) {
            return (p.codigo || "").toLowerCase().includes(q) || (p.descripcion || "").toLowerCase().includes(q);
        }

        if (matches.length > 0) {
            resDiv.style.display = 'block';
            matches.forEach(p => {
                const div = document.createElement('div');
                div.style.padding = '8px'; div.style.cursor = 'pointer'; div.style.borderBottom = '1px solid #eee';
                div.innerHTML = `<strong>${p.codigo}</strong> - ${p.descripcion}`;
                div.onmouseover = () => { div.style.background = "#f0f0f0"; };
                div.onmouseout = () => { div.style.background = "white"; };
                div.onclick = () => {
                    document.getElementById('entry-temp-name').value = p.codigo + " - " + p.descripcion;
                    document.getElementById('entry-temp-id').value = p.id;
                    document.getElementById('entry-temp-cost').value = p.costo;
                    resDiv.style.display = 'none';
                    // Focus next
                    const costIn = document.getElementById('entry-temp-cost');
                    if (costIn && (!p.costo || p.costo === 0)) costIn.focus();
                };
                resDiv.appendChild(div);
            });
        } else { resDiv.style.display = 'none'; }
    }

    addEntryItem() {
        const qty = parseFloat(document.getElementById('entry-temp-qty').value);
        const name = document.getElementById('entry-temp-name').value;
        const id = document.getElementById('entry-temp-id').value;
        let cost = parseFloat(document.getElementById('entry-temp-cost').value);

        if (!name) { alert("Nombre requerido"); return; }
        if (isNaN(cost)) { alert("Costo requerido"); return; }

        // Extract Code from Name (format "CODE - Desc")
        let displayCode = "";
        let displayName = name;

        // Validamos si realmente es un producto existente en nuestra cache
        const isExisting = id && this.cache.some(p => p.id === id);

        if (!isExisting) {
            // EL SISTEMA LE PREGUNTA PROACTIVAMENTE PORQUE EL PRODUCTO ES NUEVO
            console.log("Producto detectado como NUEVO, iniciando secuencia de preguntas...");
            const tieneCodigo = confirm(`El producto "${name}" es nuevo.\n\n¿Posee usted el CÓDIGO de este producto?`);

            if (tieneCodigo) {
                const userCode = prompt("Ingrese el CÓDIGO del producto:", "");
                displayCode = userCode ? userCode.trim().toUpperCase() : "";
            } else {
                const autoGen = confirm("¿Desea que el sistema le GENERE un código automático?\n\n(Aceptar = Generar / Cancelar = Dejar en blanco)");
                if (autoGen) {
                    displayCode = "GEN-" + Math.floor(1000 + Math.random() * 9000);
                } else {
                    displayCode = "";
                }
            }

            if (displayCode) {
                displayName = `[${displayCode}] ${name}`;
            }
        } else {
            // Producto Existente seleccionado de la lista
            const parts = name.split(" - ");
            displayCode = parts[0];
            displayName = parts.slice(1).join(" - ");
        }

        // IVA Logic
        const taxEl = document.querySelector('input[name="entry-tax-included"]:checked');
        const taxIncluded = taxEl ? taxEl.value === 'yes' : false;

        if (!taxIncluded) cost = cost * 1.13;

        this.entryCart.push({
            tempId: Date.now(),
            productId: id || null,
            displayCode: displayCode, // Store Code
            name: displayName,        // Store Clean Name
            qty,
            cost,
            subtotal: qty * cost
        });

        // Clear temp
        document.getElementById('entry-temp-name').value = '';
        document.getElementById('entry-temp-id').value = '';
        document.getElementById('entry-temp-cost').value = '';
        document.getElementById('entry-temp-qty').value = 1;

        document.getElementById('entry-temp-qty').focus();
        this.renderEntryCart();
    }

    renderEntryCart() {
        const tbody = document.getElementById('entry-cart-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        let total = 0;
        this.entryCart.forEach(item => {
            total += item.subtotal;
            tbody.innerHTML += `<tr>
                <td><small>${item.displayCode || 'NUEVO'}</small></td>
                <td>${item.name}</td>
                <td style="text-align:center">${item.qty}</td>
                <td style="text-align:right">$${item.subtotal.toFixed(2)}</td>
                <td style="text-align:center"><button onclick="app.removeEntryItem(${item.tempId})" style="color:red;border:none;background:none;cursor:pointer;"><i class="fas fa-times"></i></button></td>
            </tr>`;
        });
        document.getElementById('entry-total-value').innerText = total.toFixed(2);
    }

    removeEntryItem(tid) {
        this.entryCart = this.entryCart.filter(i => i.tempId !== tid);
        this.renderEntryCart();
    }

    async processEntry() {
        if (this.entryCart.length === 0) return alert("Carrito vacío");
        const provName = document.getElementById('entry-provider-input').value;
        if (!provName) return alert("Ingrese Proveedor");

        // Provider Match Logic
        let provId = null;
        if (this.providersCache) {
            const m = this.providersCache.find(p => p.nombre === provName);
            if (m) provId = m.id;
        }

        const payRadio = document.querySelector('input[name="entry-payment-status"]:checked');
        const isCredit = payRadio ? payRadio.value === 'credito' : false;

        if (confirm(`¿Procesar Entrada de ${this.entryCart.length} items?`)) {
            const btn = document.getElementById('btn-process-entry');
            if (btn) { btn.disabled = true; btn.innerText = "Procesando..."; }
            try {
                await this.svc.registrarEntradaMasiva(this.entryCart, provId, provName, isCredit);
                alert("Entrada registrada!");
                this.closeEntryModal();
                this.loadData();
                this.loadEntries();
            } catch (e) { alert("Error: " + e.message); }
            finally { if (btn) { btn.disabled = false; btn.innerText = "Procesar"; } }
        }
    }

    async revertEntry(id) {
        if (confirm("¿Revertir entrada? Se descontará stock.")) {
            try {
                await this.svc.revertirEntrada(id);
                alert("Revertida correctamente.");
                this.loadEntries();
                this.loadData();
            } catch (e) { alert(e); }
        }
    }

    async deleteEntry(id) {
        if (confirm("¿Eliminar registro historial?")) {
            await this.svc.eliminarEntrada(id);
            this.loadEntries();
        }
    }

    injectExtraActions() {
        const c = document.getElementById('extra-actions');
        if (!c) return;
        c.innerHTML = `
            <button class="btn btn-danger" style="padding:5px 10px; font-size:0.8rem;" onclick="app.borrarTodo()"><i class="fas fa-bomb"></i> Reset</button>
        `;
    }

    async borrarTodo() {
        if (confirm("⚠️ PELIGRO: ¿Borrar TODO el inventario? Esta acción no se puede deshacer.\n\nSe recomienda crear un BACKUP antes.")) {
            await this.svc.borrarTodo();
            this.loadData();
        }
    }

    // =========================================
    // SISTEMA DE BACKUP Y RESTAURACIÓN
    // =========================================
    async createBackup() {
        const btn = document.getElementById('btn-create-backup');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...'; }
        try {
            await this.svc.crearBackup();
            alert("✅ Backup creado con éxito.");
        } catch (e) {
            alert("Error al crear backup: " + e);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-history"></i> Crear Backup'; }
        }
    }

    async openBackupHistory() {
        try {
            const backups = await this.svc.obtenerBackups();
            const tbody = document.getElementById('backup-history-body');
            if (!tbody) return;

            tbody.innerHTML = '';
            if (backups.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" style="text-align:center">No hay backups registrados.</td></tr>';
            } else {
                backups.forEach(b => {
                    const date = b.fecha ? new Date(b.fecha.seconds * 1000).toLocaleString() : 'Reciente';
                    tbody.innerHTML += `
                        <tr>
                            <td>${date}</td>
                            <td style="text-align:center">${b.totalProductos} productos</td>
                            <td style="text-align:right">
                                <button class="btn btn-sm btn-warning" onclick="app.restoreBackup('${b.id}')">Restaurar</button>
                            </td>
                        </tr>
                    `;
                });
            }
            document.getElementById('modalBackupHistory').style.display = 'flex';
        } catch (e) { console.error(e); }
    }

    async restoreBackup(id) {
        if (confirm("⚠️ ATENCIÓN: Esta acción reemplazará TODO el inventario actual con los datos del backup.\n\n¿Deseas continuar?")) {
            try {
                await this.svc.restaurarDesdeBackup(id);
                alert("✅ Inventario restaurado correctamente.");
                location.reload(); // Recarga para asegurar limpieza de cache
            } catch (e) {
                alert("Error al restaurar: " + e);
            }
        }
    }

    // =========================================
    // GESTIÓN DE ALIAS (CORRECCIÓN DE VINCULOS)
    // =========================================
    async openAliasManager() {
        try {
            const list = await this.svc.obtenerTodosLosAlias();
            this.renderAliasList(list);
            document.getElementById('modalAliasManager').style.display = 'flex';
        } catch (e) { console.error(e); }
    }

    renderAliasList(list) {
        const tbody = document.getElementById('alias-list-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">No hay alias (vinculaciones) aprendidas aún.</td></tr>';
            return;
        }

        list.forEach(item => {
            item.aliases.forEach(alias => {
                tbody.innerHTML += `
                    <tr>
                        <td><strong>${item.codigo}</strong></td>
                        <td>${item.descripcion}</td>
                        <td style="color: #2980b9;">"${alias}"</td>
                        <td style="text-align:right">
                            <button class="btn btn-sm btn-danger" onclick="app.removeAlias('${item.productId}', '${alias.replace(/'/g, "\\'")}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
        });
    }

    async removeAlias(productId, alias) {
        if (confirm(`¿Eliminar el alias "${alias}" de este producto?\n\nEl sistema dejará de reconocerlo automáticamente.`)) {
            try {
                await this.svc.eliminarAlias(productId, alias);
                // Actualizar cache local para que el cambio sea instantaneo
                const p = this.cache.find(x => x.id === productId);
                if (p && p.aliases) {
                    p.aliases = p.aliases.filter(a => a !== alias);
                }
                this.openAliasManager(); // Refrescar lista
            } catch (e) { alert("Error: " + e); }
        }
    }

    // =========================================
    // MODULO SALIDAS / FACTURAS FISICAS
    // =========================================

    async openExitModal() {
        this.exitCart = [];
        document.getElementById('exit-modal').style.display = 'flex';

        // Reset Inputs
        document.getElementById('exit-date').valueAsDate = new Date();
        const invoiceInput = document.getElementById('exit-invoice-number');
        invoiceInput.value = 'Cargando...';

        // Cargar ultimo numero
        const lastNum = await this.svc.getLastInvoiceNumber();
        const nextNum = lastNum + 1;

        invoiceInput.value = nextNum;
        this.checkInvoiceJump(nextNum, lastNum); // Check visual

        this.clearExitInputs();
        this.renderExitCart();

        // Focus first logical input (after date/invoice setup) -> Cantidad
        setTimeout(() => document.getElementById('exit-temp-qty').focus(), 100);
    }

    clearExitInputs() {
        document.getElementById('exit-temp-qty').value = 1;
        document.getElementById('exit-temp-search').value = '';
        document.getElementById('exit-temp-id').value = '';
        document.getElementById('exit-temp-paper').value = '';
        document.getElementById('exit-temp-price').value = ''; // Empty so placeholder shows
    }

    closeExitModal() {
        document.getElementById('exit-modal').style.display = 'none';
        this.exitCart = [];
    }

    // --- LOGICA DE FACTURA ----
    async checkInvoiceJump(current, last) {
        const warningParams = document.getElementById('invoice-warning');
        if (!warningParams) return;

        warningParams.style.display = 'none';
        warningParams.innerText = '';

        if (current > (last + 1) && last > 0) {
            const jump = current - last - 1;
            warningParams.innerText = `⚠️ Salto de ${jump} facturas (Ultima: ${last})`;
            warningParams.style.display = 'block';
        }

        // Validar si existe (duplicada)
        const exists = await this.svc.checkInvoiceExists(current);
        if (exists) {
            warningParams.innerText = `⛔ LA FACTURA ${current} YA EXISTE`;
            warningParams.style.color = 'red';
            warningParams.style.display = 'block';
            document.getElementById('btn-save-exit').disabled = true;
        } else {
            document.getElementById('btn-save-exit').disabled = false;
            if (warningParams.style.color === 'red') warningParams.style.display = 'none'; // Clear error
        }
    }

    // --- LOGICA DE INPUTS (ENTER NAVIGATION) ----
    handleExitInputKey(e, field) {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (field === 'qty') document.getElementById('exit-temp-search').focus();
            if (field === 'search') {
                // Si selecciono algo del dropdown, eso ya maneja el foco. 
                // Si escribio texto libre y dio enter, pasa a precio.
                document.getElementById('exit-temp-price').focus();
            }
            if (field === 'price') this.addExitItem();
        }
    }

    // --- BUSQUEDA UNIFICADA ----
    searchProductExit(term) {
        const resDiv = document.getElementById('exit-search-results');
        const hiddenId = document.getElementById('exit-temp-id');
        const hiddenPaper = document.getElementById('exit-temp-paper');

        // Siempre actualizar "Paper Description" con lo que escribe el usuario (fallback)
        if (hiddenPaper) hiddenPaper.value = term;

        if (!resDiv) return;
        resDiv.innerHTML = '';
        if (!term) { resDiv.style.display = 'none'; return; }

        const q = term.toLowerCase();
        // Exclude generic items or ensure they don't clog
        const matches = this.cache.filter(p =>
            (p.codigo || "").toLowerCase().includes(q) ||
            (p.descripcion || "").toLowerCase().includes(q)
        ).slice(0, 10);

        if (matches.length > 0) {
            resDiv.style.display = 'block';
            matches.forEach(p => {
                const div = document.createElement('div');
                div.style.padding = '8px'; div.style.cursor = 'pointer'; div.style.borderBottom = '1px solid #eee';
                div.innerHTML = `<strong>${p.codigo}</strong> - ${p.descripcion} <span style="float:right;color:green">$${p.precio}</span>`;
                div.onmouseover = () => div.style.background = "#f0f0f0";
                div.onmouseout = () => div.style.background = "white";
                div.onclick = () => {
                    this.selectExitProduct(p);
                    resDiv.style.display = 'none';
                };
                resDiv.appendChild(div);
            });
        } else { resDiv.style.display = 'none'; }
    }

    selectExitProduct(p) {
        // Al seleccionar, llenamos con datos oficiales
        document.getElementById('exit-temp-search').value = p.descripcion;
        document.getElementById('exit-temp-id').value = p.id;
        document.getElementById('exit-temp-paper').value = p.descripcion;

        // Auto fill price
        document.getElementById('exit-temp-price').value = p.precio || 0;

        // Focus Price directly
        document.getElementById('exit-temp-price').focus();
    }

    // --- AGREGAR ITEMS ----
    addExitItem() {
        const qty = parseFloat(document.getElementById('exit-temp-qty').value) || 0;
        const sysId = document.getElementById('exit-temp-id').value;
        const paperDesc = document.getElementById('exit-temp-paper').value; // Lo que escribio o selecciono
        const price = parseFloat(document.getElementById('exit-temp-price').value) || 0;

        if (qty <= 0) { alert("Cantidad inválida"); return; }
        if (!paperDesc && !sysId) { alert("Debe ingresar una descripción."); return; }
        if (price < 0) { alert("Precio inválido"); return; }

        this.exitCart.push({
            tempId: Date.now(),
            cantidad: qty,
            descripcionPapel: paperDesc,
            productId: sysId || null,
            precioUnitario: price,
            total: qty * price
        });

        this.clearExitInputs();
        document.getElementById('exit-temp-qty').focus(); // Vuelta al inicio (Ciclo Rapido)
        this.renderExitCart();
    }

    renderExitCart() {
        const tbody = document.getElementById('exit-cart-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        let totalVal = 0;

        this.exitCart.forEach(item => {
            totalVal += item.total;

            // Render Description Column
            let desc = item.descripcionPapel;
            let code = item.productId ? '<i class="fas fa-check" style="color:green"></i>' : '<i class="fas fa-pen" style="color:orange"></i>';
            // Try to find code from cache for display if linked
            if (item.productId) {
                const p = this.cache.find(x => x.id === item.productId);
                if (p) { code = p.codigo || "LINK"; }
            }

            tbody.innerHTML += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td>${code}</td>
                    <td>${desc}</td>
                    <td style="text-align:center;">${item.cantidad}</td>
                    <td style="text-align:right;">$${item.total.toFixed(2)}</td>
                    <td style="width:30px;">
                        <button onclick="app.removeExitItem(${item.tempId})" style="color:red;border:none;background:none;cursor:pointer;">
                            &times;
                        </button>
                    </td>
                </tr>
            `;
        });

        document.getElementById('exit-total-display').innerText = "$ " + totalVal.toFixed(2);
    }

    removeExitItem(tid) {
        this.exitCart = this.exitCart.filter(i => i.tempId !== tid);
        this.renderExitCart();
    }

    async saveExit() {
        const date = document.getElementById('exit-date').value;
        const invoice = document.getElementById('exit-invoice-number').value;
        // Get Fiscal Credit Status
        const fiscalRadio = document.querySelector('input[name="exit-fiscal"]:checked');
        const isFiscal = fiscalRadio ? fiscalRadio.value : "NO";

        if (!date || !invoice) { alert("Falta Fecha o Número de Factura"); return; }
        if (this.exitCart.length === 0) { alert("La lista está vacía"); return; }

        if (confirm(`¿Guardar Factura #${invoice}?`)) {
            try {
                const btn = document.getElementById('btn-save-exit');
                if (btn) { btn.disabled = true; btn.innerText = "Guardando..."; }

                // Add header info
                const clientName = document.getElementById('exit-client-name').value || "CLIENTES VARIOS";
                const header = {
                    fecha: date,
                    numeroFactura: invoice,
                    cliente: clientName,
                    creditoFiscal: isFiscal === "SI"
                };

                await this.svc.registrarSalida(header, this.exitCart);

                alert("Guardada Correctamente!");
                this.closeExitModal();
                this.loadData();
                this.ui.activateTab('salidas');
                this.loadExitsLog();

            } catch (e) {
                alert("Error: " + e);
            } finally {
                const btn = document.getElementById('btn-save-exit');
                if (btn) { btn.disabled = false; btn.innerText = "Guardar"; }
            }
        }
    }

    async loadExitsLog() {
        const tbody = document.getElementById('exits-body');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">Cargando...</td></tr>';

        const exits = await this.svc.obtenerSalidas();

        tbody.innerHTML = '';
        if (exits.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No hay registros</td></tr>';
            return;
        }

        exits.forEach(e => {
            // Formato de fecha completo
            let dateStr = e.fecha || "Sin Fecha";
            if (e.timestamp) {
                const d = new Date(e.timestamp.seconds * 1000);
                dateStr = d.toLocaleString(); // Muestra fecha y hora local
            } else if (e.fecha) {
                // Si solo hay fecha STRING YYYY-MM-DD
                const parts = e.fecha.split('-');
                if (parts.length === 3) dateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
            }

            // Generate Items Summary
            const itemsList = e.items ? e.items.map(i => {
                const productUsed = i.productId ? "" : "<span style='color:red'>(Sin Match)</span>";
                return `<div>${i.name || i.descripcionPapel} ${productUsed} <small style="color:#888">(${i.qty || i.cantidad})</small></div>`;
            }).join('') : 'Sin Items';

            // Status Badge
            const statusBadge = e.revertida
                ? '<span style="background: #ffebee; color: #c62828; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 0.8rem;">ANULADA</span>'
                : '<span style="background: #e0f2f1; color: #00695c; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 0.8rem;">ACTIVA</span>';

            // Actions Buttons
            let actionBtns = '';

            if (!e.revertida) {
                actionBtns += `<button class="btn btn-sm btn-warning icon-btn" onclick="app.revertExit('${e.id}')" title="Revertir Stock"><i class="fas fa-undo"></i></button> `;
            } else {
                actionBtns += `<button class="btn btn-sm btn-danger icon-btn" onclick="app.deleteExit('${e.id}')" title="Eliminar Registro"><i class="fas fa-trash"></i></button>`;
            }

            tbody.innerHTML += `
                <tr style="vertical-align:middle; border-bottom:1px solid #eee; cursor:pointer;" onclick="app.showExitHistoryDetails('${e.id}')">
                    <td style="font-size:0.9rem;">${dateStr}</td>
                    <td style="text-align:center;">
                        <strong>${e.numeroFactura || 'S/N'}</strong><br>
                        ${statusBadge}
                    </td>
                    <td>
                        <div style="font-weight:bold; margin-bottom:5px; color:#555;">${e.clientName || e.cliente || 'CLIENTES VARIOS'}</div>
                        <div style="max-height:100px; overflow-y:auto; font-size:0.85rem;">
                             <i class="fas fa-eye"></i> Ver ${itemsList.length > 0 ? 'Detalles' : 'Items'}
                        </div>
                    </td>
                    <td style="text-align:right; font-weight:bold;">$${(e.totalValue || e.total || 0).toFixed(2)}</td>
                    <td style="text-align:center;" onclick="event.stopPropagation()">
                        ${actionBtns}
                    </td>
                </tr>
            `;
        });
    }

    async revertExit(id) {
        if (confirm("¿Seguro que desea REVERTIR esta salida? El stock será devuelto al inventario.")) {
            try {
                await this.svc.revertirSalida(id);
                alert("Salida revertida y stock restaurado.");
                this.loadExitsLog();
                this.loadData();
            } catch (e) { alert("Error: " + e); }
        }
    }

    async deleteExit(id) {
        if (confirm("¿Eliminar este registro del historial permanentemente?")) {
            try {
                await this.svc.eliminarSalida(id);
                this.loadExitsLog();
            } catch (e) { alert("Error: " + e); }
        }
    }

    // =========================================
    // SALIDAS MASIVAS (EXCEL)
    // =========================================

    handleExitExcelFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            // Asumimos primera hoja
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

            this.parseExitExcel(rows);
        };
        reader.readAsArrayBuffer(file);
    }

    parseExitExcel(rows) {
        this.batchExitsData = [];
        let currentFecha = null;
        let currentFactura = null;
        let currentClient = "Cliente General";

        // Indices
        const IDX_FECHA = 0;
        const IDX_FACTURA = 1;
        const IDX_CANT = 2;
        const IDX_DESC = 3;
        const IDX_PRECIO = 4;

        rows.forEach((row, index) => {
            if (index < 1) return; // Skip header

            // 1. Detectar Nueva Factura o Bloque (Por Fecha en Col A)
            if (row[IDX_FECHA]) {
                let val = row[IDX_FECHA];
                // Excel dates are numbers (~45000), Strings are "DD/MM/YYYY"
                if ((typeof val === 'number' && val > 20000) || (typeof val === 'string' && val.includes('/'))) {
                    // Es un nuevo bloque
                    if (typeof val === 'number') {
                        const jsDate = new Date(Math.round((val - 25569) * 86400 * 1000));
                        jsDate.setMinutes(jsDate.getMinutes() + jsDate.getTimezoneOffset());
                        currentFecha = jsDate;
                    } else {
                        currentFecha = new Date(val);
                    }

                    // Asumimos que la factura está en la misma fila que la fecha
                    if (row[IDX_FACTURA]) {
                        currentFactura = String(row[IDX_FACTURA]);
                    }
                }
            }

            // CRITICO: Ignorar filas vacias o filas de TOTALES
            // Si Col A vacia, Factura Col tiene algo? Verifiquemos si es un monto.
            if (!row[IDX_FECHA] && row[IDX_FACTURA]) {
                const valStr = String(row[IDX_FACTURA]);
                // Si parece dinero ($ o ,), lo ignoramos, es el total visual del excel
                if (valStr.includes('$') || valStr.includes(',')) {
                    // Es fila de total, saltar
                    return;
                }
            }

            // 2. Detectar Item (Tiene Descripcion y Cantidad)
            const desc = row[IDX_DESC];
            const cant = row[IDX_CANT];

            // Validar que tengamos una factura activa y datos de item
            if (desc && cant && currentFactura) {
                // MATCHING
                const match = this.findBestMatch(desc);

                this.batchExitsData.push({
                    fecha: currentFecha || new Date(),
                    factura: currentFactura,
                    cliente: currentClient,
                    itemExcel: desc,
                    cant: parseFloat(cant),
                    precio: parseFloat(row[IDX_PRECIO] || 0),
                    match: match,
                    status: match ? 'OK' : 'NEW' // 'NEW' means we will create it
                });
            }
        });

        this.renderExitExcelPreview();
    }

    findBestMatch(desc) {
        if (!desc) return null;
        const cleanDesc = String(desc).toLowerCase().trim();

        // 1. Check Aliases (Saved connections)
        let aliasMatch = this.cache.find(p => (p.aliases || []).some(a => a.toLowerCase() === cleanDesc));
        if (aliasMatch) return aliasMatch;

        // 2. Exact Name Match
        let exact = this.cache.find(p => p.descripcion.toLowerCase() === cleanDesc || p.codigo.toLowerCase() === cleanDesc);
        if (exact) return exact;

        // 3. Contains Match (Product contains Excel desc)
        let partial = this.cache.find(p => p.descripcion.toLowerCase().includes(cleanDesc));
        if (partial) return partial;

        return null;
    }

    renderExitExcelPreview() {
        document.getElementById('exit-excel-drop-area').style.display = 'none';
        document.getElementById('exit-excel-preview-container').style.display = 'block';

        const tbody = document.getElementById('exit-excel-preview-body');
        tbody.innerHTML = '';

        let readyCount = 0;

        this.batchExitsData.forEach((row, i) => {
            const fechaStr = row.fecha instanceof Date && !isNaN(row.fecha) ? row.fecha.toLocaleDateString() : '???';

            let matchInfo, statusIcon, rowStyle;

            if (row.match) {
                readyCount++;
                matchInfo = `<span style="color:green; font-weight:bold;">${row.match.descripcion}</span>`;
                statusIcon = '<i class="fas fa-check-circle" style="color:green"></i>';
                rowStyle = '';
            } else if (row.skipped) {
                readyCount++;
                matchInfo = `<span style="color:#7f8c8d; font-style:italic;">(Omitido: No es producto)</span>`;
                statusIcon = '<i class="fas fa-forward" style="color:#7f8c8d"></i>';
                rowStyle = 'background:#f2f2f2; color:#777;';
            } else {
                // Action Link
                matchInfo = `<button class="btn btn-sm btn-outline-primary" onclick="app.promptLinkItem(${i})">🔗 Vincular Producto</button> <span style="font-size:0.8rem; color:#666;">"${row.itemExcel}"</span>`;
                statusIcon = '<i class="fas fa-link" style="color:orange"></i>';
                rowStyle = 'background:#fffbf0';
            }

            tbody.innerHTML += `
                 <tr style="${rowStyle}">
                    <td>${fechaStr}</td>
                    <td>${row.factura}</td>
                    <td>${row.itemExcel}</td>
                    <td>${row.cant}</td>
                    <td>${matchInfo}</td>
                    <td>${statusIcon}</td>
                 </tr>
             `;
        });

        const btn = document.getElementById('btn-process-exit-excel');
        btn.disabled = false;
        const total = this.batchExitsData.length;
        btn.innerText = `Procesar (${readyCount}/${total} Listos)`;
    }

    // --- LINKING MODAL LOGIC ---

    promptLinkItem(index) {
        this.currentLinkIndex = index;
        const item = this.batchExitsData[index];

        // Open Modal (Flex for centering)
        const modal = document.getElementById('modalLinkProduct');
        document.getElementById('link-excel-name').innerText = item.itemExcel;
        document.getElementById('link-search-input').value = "";

        modal.style.display = 'flex'; // Changed from block to flex for CSS centering
        document.getElementById('link-search-input').focus();

        // Setup live search and trigger initial load
        document.getElementById('link-search-input').onkeyup = (e) => this.searchLinkProduct(e.target.value);
        this.searchLinkProduct(""); // Load all (capped)
    }

    searchLinkProduct(term) {
        const tbody = document.getElementById('link-results-body');
        const cleanTerm = term ? term.toLowerCase().trim() : "";

        let matches;
        if (!cleanTerm) {
            matches = this.cache.slice(0, 50);
        } else {
            matches = this.cache.filter(p =>
                p.codigo.toLowerCase().includes(cleanTerm) ||
                p.descripcion.toLowerCase().includes(cleanTerm)
            ).slice(0, 50);
        }

        tbody.innerHTML = '';
        if (matches.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No se encontraron coincidencias.</td></tr>';
            return;
        }

        matches.forEach(p => {
            const row = `
                <tr>
                    <td><strong>${p.codigo}</strong></td>
                    <td>${p.descripcion}</td>
                    <td>${p.existencia}</td>
                    <td>$${p.precio}</td>
                    <td>
                        <button class="btn btn-sm btn-success" onclick="app.selectLinkProduct('${p.id}')">
                            <i class="fas fa-check"></i> Seleccionar
                        </button>
                    </td>
                </tr>
             `;
            tbody.innerHTML += row;
        });
    }

    async selectLinkProduct(productId) {
        const product = this.cache.find(p => p.id === productId);

        // 1. SCENARIO: HISTORY LINKING
        if (this.isHistoryLinking) {
            if (!this.currentHistoryName || !product) return;

            if (!confirm(`¿Vincular permanentemente "${this.currentHistoryName}" con el producto "${product.descripcion}"?\n\nEl sistema aprenderá este alias y actualizará futuras búsquedas.`)) return;

            await this.linkProductAlias(this.currentHistoryName, product);

            alert("✅ Vinculado correctamente. El sistema ahora reconoce este nombre.");

            // Close standard modal
            document.getElementById('modalLinkProduct').style.display = 'none';
            // Refresh history list to remove the linked item
            this.openLinkHistoryTool();
            return;
        }

        // 2. SCENARIO: EXCEL IMPORT
        if (!product || this.currentLinkIndex === null) return;

        const itemExcel = this.batchExitsData[this.currentLinkIndex].itemExcel;

        if (!confirm(`¿Vincular "${itemExcel}" con "${product.descripcion}"?`)) return;

        await this.linkProductAlias(itemExcel, product);

        // Update ALL local items with this name
        this.batchExitsData.forEach(d => {
            if (d.itemExcel === itemExcel) {
                d.match = product;
                d.status = 'OK';
            }
        });

        // Close Modal and Refresh
        document.getElementById('modalLinkProduct').style.display = 'none';
        this.renderExitExcelPreview();
    }

    async linkProductAlias(excelName, product) {
        try {
            const ref = db.collection('INVENTARIO').doc(product.id);
            await ref.update({
                aliases: firebase.firestore.FieldValue.arrayUnion(excelName)
            });

            if (!product.aliases) product.aliases = [];
            product.aliases.push(excelName);

            // Optional: nice toast
        } catch (e) {
            console.error(e);
            alert("Error al guardar vinculación: " + e.message);
        }
    }

    async skipLinkItem() {
        // 1. HISTORY SCENARIO
        if (this.isHistoryLinking) {
            document.getElementById('modalLinkProduct').style.display = 'none';
            return;
        }

        // 2. EXCEL SCENARIO
        if (this.currentLinkIndex === null) return;

        const currentItem = this.batchExitsData[this.currentLinkIndex];
        const targetName = currentItem.itemExcel; // El nombre a omitir masivamente

        // PREGUNTA CLAVE: ¿Es BASURA/NO ES STOCK o es SERVICIO (Mano de Obra)?
        // BASURA -> OMITIR DEL REPORTE FINAL (Omitir)
        // SERVICIO -> INCLUIR EN FACTURA PERO NO DESCUENTA STOCK (Servicio)

        // Creamos un modal o usamos confirm simple con opciones?
        // JS nativo no tiene confirm con 3 botones. Usaremos un hack de Confirm secuencial o asumiremos por defecto.
        // MEJOR: Implementar UI en el modalLinkProduct para estos botones.
        // Pero dado que esta función se llama desde un botón generico "Omitir" ya existente,
        // lo transformaremos aquí.

        // * NOTA: Para UX fluida, usaremos confirm() simple para preguntar si es servicio.

        let isService = false;
        let isSkip = false;

        if (confirm(`¿Este ítem "${targetName}" es un SERVICIO (Mano de Obra)?\n\n[ACEPTAR] = SI, es Servicio (Aparecerá en Factura, No descuenta stock)\n[CANCELAR] = NO, es Basura/Error (Omitir completamente)`)) {
            isService = true;
        } else {
            isSkip = true;
        }

        // Aplicar cambio masivo
        this.batchExitsData.forEach(item => {
            if (item.itemExcel === targetName) {
                item.match = null; // No hay ID de producto
                if (isService) {
                    item.skipped = true; // Flag technical
                    item.isService = true; // Flag logic
                    item.status = 'SERVICIO';
                } else {
                    item.skipped = true;
                    item.isService = false;
                    item.status = 'OMITIDO';
                }
            }
        });

        document.getElementById('modalLinkProduct').style.display = 'none';
        this.renderExitExcelPreview();
    }


    async saveBatchExits() {
        // Filter Items that are either MATCHED or SKIPPED
        const readyItems = this.batchExitsData.filter(x => x.match || x.skipped);
        const unresolved = this.batchExitsData.length - readyItems.length;

        if (readyItems.length === 0) return alert("No hay items listos para procesar.");

        if (unresolved > 0) {
            if (!confirm(`⚠️ Hay ${unresolved} items PENDIENTES (Sin vincular ni omitir).\n\n¿Desea PROCESAR SOLO LOS ${readyItems.length} items listos e ignorar el resto?`)) return;
        }

        const btn = document.getElementById('btn-process-exit-excel');
        btn.disabled = true; btn.innerText = "Procesando...";

        try {
            const batch = db.batch();
            const invoicesMap = {};

            // IMPORTANTE: Agrupar
            for (const item of readyItems) {
                // Determine Product Data
                let prodId = null;
                let prodName = item.itemExcel; // Default to Excel Name

                if (item.match) {
                    prodId = item.match.id;
                    prodName = item.match.descripcion; // Official Name

                    // Solo descontar stock si existe match (Y NO ES PROPIAMENTE SERVICIO TIPO PRODUCTO)
                    const existingRef = db.collection('INVENTARIO').doc(prodId);
                    batch.update(existingRef, {
                        existencia: firebase.firestore.FieldValue.increment(-item.cant)
                    });
                } else if (item.isService) {
                    prodId = null; // Sin ID
                    prodName = item.itemExcel + " (SERVICIO)";
                    // NO DESCONTAMOS STOCK
                } else if (item.skipped && !item.isService) {
                    // Es OMITIDO/BASURA, saltar procesamiento de este item en la factura
                    continue;
                }

                // Group by Invoice Number
                const key = item.factura;
                if (!invoicesMap[key]) {
                    invoicesMap[key] = {
                        numeroFactura: key, // SCHEMANAME MATCHES SERVICE
                        fecha: item.fecha, // Date Object
                        cliente: item.cliente,
                        items: [],
                        total: 0
                    };
                }

                invoicesMap[key].items.push({
                    productId: prodId,
                    descripcionPapel: item.itemExcel, // Keep original name
                    name: prodName, // Display name
                    cantidad: item.cant,
                    precioUnitario: item.precio,
                    total: item.cant * item.precio
                });

                invoicesMap[key].total += (item.cant * item.precio);
            }

            const batchId = `lote_${Date.now()}`;
            const summaryRef = db.collection('INVENTARIO_LOTES').doc(batchId);
            const totalInvoices = Object.keys(invoicesMap).length;
            let totalAmount = 0;

            // Create Invoice Documents in INVENTARIO_SALIDAS
            for (const key in invoicesMap) {
                const inv = invoicesMap[key];
                const salidaRef = db.collection('INVENTARIO_SALIDAS').doc();

                totalAmount += inv.total;

                let dateStr = inv.fecha;
                if (inv.fecha instanceof Date) {
                    dateStr = inv.fecha.toISOString().split('T')[0];
                }

                batch.set(salidaRef, {
                    numeroFactura: inv.numeroFactura,
                    cliente: inv.cliente,
                    fecha: dateStr,
                    creditoFiscal: false,
                    items: inv.items,
                    total: inv.total,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    importBatchId: batchId // LINK TO BATCH
                });
            }

            // Save Master Batch Record
            batch.set(summaryRef, {
                fecha: firebase.firestore.FieldValue.serverTimestamp(),
                cantidadFacturas: totalInvoices,
                montoTotal: totalAmount,
                usuario: localStorage.getItem('usuario') || 'Admin', // Asumiendo local storage
                revertido: false
            });

            await batch.commit();

            alert(`✅ Importación completada.\nSe generaron ${totalInvoices} facturas bajo el Lote #${batchId.slice(-6)}.`);
            document.getElementById('modalImportarSalidas').style.display = 'none';
            this.loadData();
            this.loadExitsLog();
            // Opcional: Cargar lista de lotes si estuviéramos mostrándola
            // this.loadBatchesLog(); 

        } catch (e) {
            console.error(e);
            alert("Error crítico al guardar: " + e.message);
        } finally {
            btn.disabled = false;
            // Recalculate counts
            const valid = this.batchExitsData.filter(x => x.match || x.skipped).length;
            const total = this.batchExitsData.length;
            btn.innerText = `Procesar (${valid}/${total} Listos)`;
        }
    }
    // =========================================
    // DETAILS MODAL
    // =========================================
    async showExitHistoryDetails(id) {
        // Enforce cache check? We might have it in loadExitsLog scope but better fetch or find inside a cache if available.
        // For now, let's just re-fetch specific doc or find in UI. 
        // We don't have a global cache of Exits in controller, only `exits` local variable in `loadExitsLog`.
        // Let's assume we can fetch it or we make `exits` global. 
        // Making a quick fetch is safer.

        try {
            const doc = await db.collection('INVENTARIO_SALIDAS').doc(id).get();
            if (!doc.exists) return; // Deleted?

            const data = doc.data();

            document.getElementById('detail-exit-title').innerText = "Detalles Factura #" + (data.numeroFactura || "S/N");
            document.getElementById('detail-exit-date').innerText = data.fecha || "-";
            document.getElementById('detail-exit-client').innerText = data.cliente || "-";
            document.getElementById('detail-exit-total').innerText = "$" + (data.total || 0).toFixed(2);

            const tbody = document.getElementById('detail-exit-body');
            tbody.innerHTML = "";

            if (data.items && data.items.length > 0) {
                data.items.forEach(item => {
                    // Check schema (manual uses 'cantidad', 'precioUnitario')
                    // Excel import schema also standardized to 'cantidad', 'precioUnitario'
                    // Manual Schema: { cantidad, descripcionPapel, name, productId, precioUnitario, total }

                    const qty = item.cantidad || item.qty || 0;
                    const price = item.precioUnitario || item.price || 0;
                    const total = item.total || (qty * price);

                    const isSystem = item.productId ? '<span class="badge-si" style="background:#def;color:#027;padding:2px 5px;">SISTEMA</span>' : '<span class="badge-no" style="background:#eee;color:#777;padding:2px 5px;">MANUAL/OMITIDO</span>';

                    tbody.innerHTML += `
                        <tr>
                            <td>${item.descripcionPapel || item.itemExcel || item.name}</td>
                            <td>${isSystem} <br> <small>${item.name || ''}</small></td>
                            <td style="text-align:center">${qty}</td>
                            <td style="text-align:right">$${parseFloat(price).toFixed(2)}</td>
                            <td style="text-align:right">$${parseFloat(total).toFixed(2)}</td>
                        </tr>
                    `;
                });
            } else {
                tbody.innerHTML = "<tr><td colspan='5'>Sin items</td></tr>";
            }

            document.getElementById('modalExitDetails').style.display = 'flex';

        } catch (e) {
            console.error(e);
            alert("Error cargando detalles: " + e);
        }
    }
    // =========================================
    // LOTES / BATCHES HISTORY MANAGEMENT
    // =========================================

    async openBatchHistory() {
        document.getElementById('modalBatchHistory').style.display = 'flex';
        this.loadBatchesLog();
    }

    async loadBatchesLog() {
        const tbody = document.getElementById('batch-history-body');
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Cargando...</td></tr>';

        try {
            const snapshot = await db.collection('INVENTARIO_LOTES')
                .orderBy('fecha', 'desc')
                .limit(20)
                .get();

            tbody.innerHTML = '';
            if (snapshot.empty) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">No hay lotes registrados.</td></tr>';
                return;
            }

            snapshot.forEach(doc => {
                const data = doc.data();
                const d = data.fecha ? new Date(data.fecha.seconds * 1000).toLocaleString() : '-';
                const status = data.revertido ?
                    '<span style="color:red; font-weight:bold;">REVERTIDO</span>' :
                    '<span style="color:green; font-weight:bold;">ACTIVO</span>';

                const btn = !data.revertido ?
                    `<button class="btn btn-danger btn-sm" onclick="app.revertBatch('${doc.id}')">REVERTIR LOTE</button>` :
                    '<span style="color:#aaa;">-</span>';

                tbody.innerHTML += `
                    <tr>
                        <td>${d}</td>
                        <td><small>${doc.id}</small></td>
                        <td style="text-align:center">${data.cantidadFacturas}</td>
                        <td style="text-align:right">$${(data.montoTotal || 0).toFixed(2)}</td>
                        <td>${status}</td>
                        <td style="text-align:center">${btn}</td>
                    </tr>
                `;
            });

        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="6" style="color:red">Error: ${e.message}</td></tr>`;
        }
    }

    async revertBatch(batchId) {
        if (!confirm(`⚠️ PELIGRO:\n\nEsto ELIMINARÁ PERMANENTEMENTE TODAS las facturas asociadas al Lote "${batchId}".\n\n- Se devolverá el stock a todos los productos.\n- Las facturas desaparecerán del historial.\n- Esta acción NO se puede deshacer.\n\n¿Estás 100% seguro de proceder?`)) return;

        const btn = document.querySelector(`button[onclick="app.revertBatch('${batchId}')"]`);
        if (btn) { btn.disabled = true; btn.innerText = "Revirtiendo..."; }

        try {
            // 1. Buscar todas las facturas de este lote
            const invoicesSnap = await db.collection('INVENTARIO_SALIDAS')
                .where('importBatchId', '==', batchId)
                .get();

            if (invoicesSnap.empty) {
                alert("No se encontraron facturas activas para este lote (¿Ya fueron borradas?). Se marcará como revertido.");
                await db.collection('INVENTARIO_LOTES').doc(batchId).update({ revertido: true });
                this.loadBatchesLog();
                return;
            }

            const totalDocs = invoicesSnap.size;
            console.log(`Iniciando reversión de lote ${batchId} con ${totalDocs} facturas...`);

            // 2. Procesar en Batches de Firestore (Limit 500 ops)

            // A. Mapa de devoluciones (ProductId -> Cantidad a devolver)
            const stockReturns = {};
            const invoiceIdsToDelete = [];

            invoicesSnap.forEach(doc => {
                const inv = doc.data();
                invoiceIdsToDelete.push(doc.ref);

                if (inv.items && Array.isArray(inv.items)) {
                    inv.items.forEach(item => {
                        if (item.productId) { // Solo si tiene ID de sistema
                            if (!stockReturns[item.productId]) stockReturns[item.productId] = 0;
                            stockReturns[item.productId] += parseFloat(item.cantidad || 0);
                        }
                    });
                }
            });

            const batch = db.batch();

            // Updates de Stock
            for (const pid of Object.keys(stockReturns)) {
                const qty = stockReturns[pid];
                const ref = db.collection('INVENTARIO').doc(pid);
                batch.update(ref, {
                    existencia: firebase.firestore.FieldValue.increment(qty)
                });
            }

            // Deletes de Facturas
            for (const ref of invoiceIdsToDelete) {
                batch.delete(ref);
            }

            // Mark Batch as Reverted
            const batchRef = db.collection('INVENTARIO_LOTES').doc(batchId);
            batch.update(batchRef, { revertido: true });

            await batch.commit();

            alert(`✅ Lote revertido correctamente.\n- ${totalDocs} facturas eliminadas.\n- Stock restaurado.`);
            this.loadBatchesLog();
            this.loadExitsLog(); // Refresh main table too

        } catch (e) {
            console.error(e);
            alert("Error al revertir lote: " + e.message);
            if (btn) { btn.disabled = false; btn.innerText = "Error (Reintentar)"; }
        }
    }

    // =========================================
    // REPORTES LOGIC
    // =========================================
    loadReports() {
        if (this.cache.length === 0) {
            // Try to load if empty (rare case if refreshed on tab directly)
        }

        const critical = [];
        const negative = [];
        let totalValue = 0;

        this.cache.forEach(p => {
            const stock = parseFloat(p.existencia || 0);
            const min = parseFloat(p.stockMinimo || 5);
            const cost = parseFloat(p.costo || 0);

            // Total Value (Only count positive stock)
            if (stock > 0) {
                totalValue += (stock * cost);
            }

            // Negative
            if (stock < 0) {
                negative.push(p);
            }
            // Critical (Below or Equal min and Positive/Zero)
            // Note: Negatives are handled separately, so critical usually implies 0 <= stock <= min
            else if (stock <= min) {
                critical.push(p);
            }
        });

        // Update Counters
        document.getElementById('report-critical-count').innerText = critical.length;
        document.getElementById('report-negative-count').innerText = negative.length;
        document.getElementById('report-total-value').innerText = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalValue);

        // Render Critical Table
        const critBody = document.getElementById('report-critical-body');
        critBody.innerHTML = '';
        if (critical.length === 0) {
            critBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:15px; color:green;"><i class="fas fa-check-circle"></i> Todo el stock está saludable.</td></tr>';
        } else {
            critical.forEach(p => {
                critBody.innerHTML += `
                    <tr>
                        <td><small>${p.codigo}</small></td>
                        <td>${p.descripcion}</td>
                        <td style="color:#c0392b; font-weight:bold;">${p.existencia}</td>
                        <td>${p.stockMinimo || 5}</td>
                        <td>$${(p.costo || 0).toFixed(2)}</td>
                        <td><button class="btn btn-sm btn-primary" onclick="app.ui.activateTab('entradas'); app.openEntryModal(); setTimeout(()=>{ document.getElementById('entry-temp-name').value='${p.codigo} - ${p.descripcion}'; document.getElementById('entry-temp-id').value='${p.id}'; document.getElementById('entry-temp-cost').value='${p.costo}'; }, 500);">Abastecer</button></td>
                    </tr>
                `;
            });
        }

        // Render Negative Table
        const negBody = document.getElementById('report-negative-body');
        negBody.innerHTML = '';
        if (negative.length === 0) {
            negBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:15px; color:green;"><i class="fas fa-check-circle"></i> Sin stock negativo.</td></tr>';
        } else {
            negative.forEach(p => {
                negBody.innerHTML += `
                    <tr>
                        <td><small>${p.codigo}</small></td>
                        <td>${p.descripcion}</td>
                        <td style="color:#8e44ad; font-weight:bold;">${p.existencia}</td>
                        <td><button class="btn btn-sm btn-outline-primary" onclick="app.ui.activateTab('entradas'); app.openEntryModal(); setTimeout(()=>{ document.getElementById('entry-temp-name').value='${p.codigo} - ${p.descripcion}'; document.getElementById('entry-temp-id').value='${p.id}'; document.getElementById('entry-temp-cost').value='${p.costo}'; document.getElementById('entry-temp-qty').value='${Math.abs(p.existencia)}'; }, 500);">Corregir</button></td>
                    </tr>
                `;
            });
        }
    }

    // =========================================
    // IMPRESIÓN DE INVENTARIO
    // =========================================
    openPrintModal() {
        document.getElementById('modalPrintInventory').style.display = 'flex';
    }

    executePrint() {
        // Obtener columnas seleccionadas
        const selectedCols = Array.from(document.querySelectorAll('.print-col:checked')).map(cb => cb.value);

        if (selectedCols.length === 0) {
            alert('Selecciona al menos una columna para imprimir');
            return;
        }

        // Cerrar modal
        document.getElementById('modalPrintInventory').style.display = 'none';

        // Crear ventana de impresión
        const printWindow = window.open('', '', 'height=600,width=800');
        printWindow.document.write('<html><head><title>Inventario - Taller Willian</title>');
        printWindow.document.write('<style>');
        printWindow.document.write('body { font-family: Arial, sans-serif; margin: 20px; }');
        printWindow.document.write('h1 { text-align: center; margin-bottom: 20px; }');
        printWindow.document.write('table { width: 100%; border-collapse: collapse; font-size: 12px; }');
        printWindow.document.write('th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }');
        printWindow.document.write('th { background-color: #34495e; color: white; }');
        printWindow.document.write('tr:nth-child(even) { background-color: #f2f2f2; }');
        printWindow.document.write('.stock-bajo { color: #d35400; font-weight: bold; }');
        printWindow.document.write('.stock-critico { color: #c0392b; font-weight: bold; background: #fadbd8; }');
        printWindow.document.write('.stock-normal { color: #27ae60; }');
        printWindow.document.write('@media print { body { margin: 0; } }');
        printWindow.document.write('</style></head><body>');

        printWindow.document.write('<h1>Inventario - Taller Willian</h1>');
        printWindow.document.write('<p style="text-align:center; color:#666; font-size:11px;">Fecha: ' + new Date().toLocaleString() + '</p>');

        printWindow.document.write('<table>');
        printWindow.document.write('<thead><tr>');

        // Headers
        const headers = {
            codigo: 'Código',
            descripcion: 'Descripción',
            costo: 'P. Costo',
            precio: 'P. Venta',
            existencia: 'Existencia',
            stockMinimo: 'Stock Mín.',
            creditoFiscal: 'C.F.',
            proveedor: 'Proveedor'
        };

        selectedCols.forEach(col => {
            printWindow.document.write('<th>' + headers[col] + '</th>');
        });

        printWindow.document.write('</tr></thead><tbody>');

        // Data rows
        this.filtered.forEach(p => {
            printWindow.document.write('<tr>');

            selectedCols.forEach(col => {
                let value = '';
                let className = '';

                switch (col) {
                    case 'codigo':
                        value = p.codigo || '-';
                        break;
                    case 'descripcion':
                        value = p.descripcion || '-';
                        break;
                    case 'costo':
                        value = '$' + (p.costo || 0).toFixed(2);
                        break;
                    case 'precio':
                        value = '$' + (p.precio || 0).toFixed(2);
                        break;
                    case 'existencia':
                        value = p.existencia || 0;
                        className = (p.existencia <= 0) ? 'stock-critico' :
                            (p.existencia <= (p.stockMinimo || 0)) ? 'stock-bajo' :
                                'stock-normal';
                        break;
                    case 'stockMinimo':
                        value = p.stockMinimo || 0;
                        break;
                    case 'creditoFiscal':
                        value = p.creditoFiscal ? 'SI' : 'NO';
                        break;
                    case 'proveedor':
                        value = p.proveedor || '-';
                        break;
                }

                printWindow.document.write('<td class="' + className + '">' + value + '</td>');
            });

            printWindow.document.write('</tr>');
        });

        printWindow.document.write('</tbody></table>');
        printWindow.document.write('<p style="margin-top:20px; text-align:center; font-size:11px; color:#666;">Total de productos: ' + this.filtered.length + '</p>');
        printWindow.document.write('</body></html>');

        printWindow.document.close();
        printWindow.focus();

        // Esperar a que cargue e imprimir
        setTimeout(() => {
            printWindow.print();
        }, 250);
    }
}

window.app = new InventoryController();
