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

        this.init();
    }

    async init() {
        console.log("INVENTORY CONTROLLER (GLOBAL) STARTED");
        this.bindEvents();
        this.exposeGlobalFunctions();
        await this.loadData();
    }

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
            });
        });

        // SEARCH
        const searchInput = document.getElementById('buscar-producto');
        if (searchInput) searchInput.addEventListener('input', (e) => this.filterData(e.target.value));

        const refreshBtn = document.getElementById('btn-refresh');
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.loadData());

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

        // Cost Input Enter
        const costInput = document.getElementById('entry-temp-cost');
        if (costInput) {
            costInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); this.addEntryItem(); }
            });
        }

        // Search Product for Entry
        const entrySearch = document.getElementById('entry-temp-name');
        if (entrySearch) {
            entrySearch.addEventListener('input', (e) => this.handleEntryProductSearch(e.target.value));
            // Close search on blur/click outside is handled by CSS or generic click
            document.addEventListener('click', (e) => {
                if (e.target !== entrySearch && !e.target.closest('#entry-search-results')) {
                    const res = document.getElementById('entry-search-results');
                    if (res) res.style.display = 'none';
                }
            });
        }

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
        if (confirm("¿Eliminar producto permanentemente?")) {
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

            // Logic ported
            const keywords = ['codigo', 'descrip', 'venta', 'precio', 'stock'];
            let bestSheet = null;
            for (const name of workbook.SheetNames) {
                const sheet = workbook.Sheets[name];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                let matches = 0;
                rows.slice(0, 20).forEach(row => {
                    const txt = JSON.stringify(row).toLowerCase();
                    if (keywords.some(k => txt.includes(k))) matches++;
                });
                if (matches > 1) { bestSheet = rows; break; }
            }

            if (!bestSheet) { alert("No se detectó hoja válida."); return; }
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

        const headers = rows[headerIdx].map(h => String(h).toLowerCase().trim());
        const dataRows = rows.slice(headerIdx + 1);

        const colMap = {
            codigo: headers.findIndex(h => h.includes('cod') || h.includes('id')),
            desc: headers.findIndex(h => h.includes('desc') || h.includes('prod')),
            costo: headers.findIndex(h => h.includes('costo') || h.includes('compra')),
            precio: headers.findIndex(h => (h.includes('precio') || h.includes('venta')) && !h.includes('costo')),
            exist: headers.findIndex(h => h.includes('exist') || h.includes('cant') || h.includes('stock')),
            prov: headers.findIndex(h => h.includes('prov'))
        };

        this.excelData = dataRows.map(row => {
            if (!row[colMap.codigo] && !row[colMap.desc]) return null;
            const cleanNum = (val) => {
                if (!val) return 0;
                if (typeof val === 'number') return val;
                return parseFloat(String(val).replace(/[^0-9.]/g, '')) || 0;
            };
            return {
                codigo: row[colMap.codigo] ? String(row[colMap.codigo]) : "GEN-" + Math.floor(Math.random() * 10000),
                descripcion: row[colMap.desc] || "Sin Descripción",
                descripcionFactura: "",
                costo: cleanNum(row[colMap.costo]),
                precio: cleanNum(row[colMap.precio]),
                existencia: cleanNum(row[colMap.exist]),
                stockMinimo: 5,
                creditoFiscal: false,
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
        if (entries.length === 0) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center">Sin entradas.</td></tr>'; return; }

        entries.forEach(e => {
            const dateStr = e.timestamp ? new Date(e.timestamp.seconds * 1000).toLocaleString() : "Reciente";
            const isReverted = e.revertida ? '<span class="badge-no" style="background:#fee;color:red;padding:2px 5px;">REVERTIDA</span>' : '<span class="badge-si" style="background:#efe;color:green;padding:2px 5px;">OK</span>';
            let actionBtn = !e.revertida ?
                `<button class="btn btn-warning" onclick="app.revertEntry('${e.id}')" title="Revertir"><i class="fas fa-undo"></i></button>` :
                `<button class="btn btn-danger" onclick="app.deleteEntry('${e.id}')" title="Borrar Historial"><i class="fas fa-trash"></i></button>`;

            tbody.innerHTML += `<tr>
                <td>${dateStr}</td>
                <td>${e.productName}</td>
                <td style="text-align:center">${e.cantidad}</td>
                <td style="text-align:right">$${Number(e.costoUnitario).toFixed(2)}</td>
                <td style="text-align:center"><small>$${Number(e.costoAnterior).toFixed(2)} -> $${Number(e.costoNuevo).toFixed(2)}</small></td>
                <td>${e.providerName || '-'}<br><small>${e.esCredito ? 'CREDITO' : 'CONTADO'}</small></td>
                <td style="text-align:center">${isReverted}</td>
                <td style="text-align:center">${actionBtn}</td>
             </tr>`;
        });
    }

    async openEntryModal() {
        this.entryCart = [];
        this.renderEntryCart();
        // Load Providers
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
        let displayCode = "NUEVO";
        let displayName = name;

        if (id && name.includes(" - ")) {
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

        document.getElementById('entry-temp-name').focus();
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
        if (confirm("⚠️ PELIGRO: ¿Borrar TODO el inventario? Esta acción no se puede deshacer.")) {
            await this.svc.borrarTodo();
            this.loadData();
        }
    }
}

// Inicializar cuando el DOM esté listo o inmediatamente si script al final
new InventoryController();
