class InventoryController {
    constructor() {
        this.svc = new InventoryService(); // Servicio existente
        this.cache = []; // Todos los productos
        this.filtered = []; // Filtrados
        this.sortState = { key: 'codigo', dir: 'asc' };

        // Excel Cache
        this.excelData = [];

        this.init();
    }

    async init() {
        console.log("INVENTORY CONTROLLER v2.0 STARTED");
        this.bindEvents();
        await this.loadData();
    }

    // =========================================
    // 1. EVENTOS Y TABS
    // =========================================
    bindEvents() {
        // TABS
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.target; // "lista", "nuevo", "excel"
                this.switchTab(target);
            });
        });

        // REFRESH
        document.getElementById('btn-refresh').addEventListener('click', () => this.loadData());

        // BUSQUEDA
        document.getElementById('input-search').addEventListener('input', (e) => this.filterData(e.target.value));

        // SORTING
        document.querySelectorAll('th[data-sort]').forEach(th => {
            th.addEventListener('click', () => this.handleSort(th.dataset.sort));
        });

        // FORMULARIO NUEVO
        document.getElementById('btn-save-product').addEventListener('click', () => this.saveProduct());
        document.getElementById('btn-cancel-form').addEventListener('click', () => this.resetForm());

        // EXCEL DROP
        const dropArea = document.getElementById('drop-area');
        const fileInput = document.getElementById('file-excel');

        dropArea.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleExcelFile(e.target.files[0]));

        dropArea.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.classList.add('dragover'); });
        dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
        dropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dropArea.classList.remove('dragover');
            if (e.dataTransfer.files.length) this.handleExcelFile(e.dataTransfer.files[0]);
        });

        document.getElementById('btn-confirm-excel').addEventListener('click', () => this.uploadExcelData());
        document.getElementById('btn-cancel-excel').addEventListener('click', () => {
            document.getElementById('excel-preview').style.display = 'none';
            document.getElementById('drop-area').style.display = 'block';
            this.excelData = [];
        });

        // MENU MÓVIL
        document.getElementById('mobileMenuBtn').addEventListener('click', () => {
            document.getElementById('mobileMenu').classList.toggle('show');
        });

        // Inject Extra actions (Borrar Todo, CF)
        this.injectExtraActions();
    }

    switchTab(tabName) {
        // 1. Update Buttons
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.target === tabName);
        });

        // 2. Update Content
        document.querySelectorAll('.tab-content').forEach(c => {
            c.classList.remove('active');
        });
        document.getElementById(`tab-${tabName}`).classList.add('active');
    }

    // =========================================
    // 2. DATOS Y RENDER
    // =========================================
    async loadData() {
        const tbody = document.getElementById('inventory-body');
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center">Cargando datos...</td></tr>';

        try {
            this.cache = await this.svc.obtenerTodos(); // Fetch from Firestore
            this.filtered = [...this.cache];
            this.applySort(); // Ordena y Pinta
        } catch (error) {
            console.error(error);
            tbody.innerHTML = `<tr><td colspan="10" style="color:red; text-align:center">Error: ${error.message}</td></tr>`;
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
        this.updateSortIcons();
        this.applySort();
    }

    updateSortIcons() {
        document.querySelectorAll('th[data-sort]').forEach(th => {
            th.className = ''; // reset classes
            if (th.dataset.sort === this.sortState.key) {
                th.classList.add(this.sortState.dir === 'asc' ? 'active-asc' : 'active-desc');
            }
        });
    }

    applySort() {
        const { key, dir } = this.sortState;
        this.filtered.sort((a, b) => {
            let valA = a[key] || "";
            let valB = b[key] || "";

            if (typeof valA === 'number' && typeof valB === 'number') {
                return dir === 'asc' ? valA - valB : valB - valA;
            }
            valA = valA.toString().toLowerCase();
            valB = valB.toString().toLowerCase();
            if (valA < valB) return dir === 'asc' ? -1 : 1;
            if (valA > valB) return dir === 'asc' ? 1 : -1;
            return 0;
        });
        this.renderTable();
    }

    renderTable() {
        const tbody = document.getElementById('inventory-body');
        tbody.innerHTML = '';
        const limit = 200; // Render limit

        const data = this.filtered.slice(0, limit);

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center">No se encontraron productos.</td></tr>';
            return;
        }

        data.forEach(p => {
            const tr = document.createElement('tr');

            const cfBadge = p.creditoFiscal ?
                '<span class="badge-si">SI</span>' : '<span class="badge-no">NO</span>';

            const precio = (p.precio || 0).toFixed(2);
            const costo = (p.costo || 0).toFixed(2);

            tr.innerHTML = `
                <td><b>${p.codigo || "--"}</b></td>
                <td>${p.descripcion || "--"}</td>
                <td>${p.descripcionFactura || ""}</td>
                <td>$${costo}</td>
                <td style="color:#27ae60; font-weight:bold;">$${precio}</td>
                <td style="text-align:center">${p.existencia || 0}</td>
                <td style="text-align:center">${p.stockMinimo || 0}</td>
                <td style="text-align:center">${cfBadge}</td>
                <td>${p.proveedor || ""}</td>
                <td style="text-align:center; position:relative;">
                    <button class="action-btn" onclick="app.toggleActionMenu('${p.id}')">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div id="menu-${p.id}" class="action-menu">
                        <button onclick="app.loadForm('${p.id}')"><i class="fas fa-edit"></i> Editar</button>
                        <button class="delete" onclick="app.deleteProduct('${p.id}')"><i class="fas fa-trash"></i> Eliminar</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // =========================================
    // 3. CRUD (CREATE / UPDATE / DELETE)
    // =========================================

    // Abrir menú de acciones (3 puntos)
    toggleActionMenu(id) {
        // Cerrar otros
        document.querySelectorAll('.action-menu').forEach(m => m.classList.remove('show'));

        const menu = document.getElementById(`menu-${id}`);
        if (menu) {
            menu.classList.add('show');
            // Auto-cerrar al clickar fuera
            setTimeout(() => {
                const closeNav = (e) => {
                    if (!menu.contains(e.target)) {
                        menu.classList.remove('show');
                        document.removeEventListener('click', closeNav);
                    }
                }
                document.addEventListener('click', closeNav);
            }, 0);
        }
    }

    // CARGAR DATOS EN FORMULARIO (Edit)
    loadForm(id) {
        const p = this.cache.find(item => item.id === id);
        if (!p) return;

        document.getElementById('field-id').value = id;
        document.getElementById('field-codigo').value = p.codigo || "";
        document.getElementById('field-proveedor').value = p.proveedor || "";
        document.getElementById('field-descripcion').value = p.descripcion || "";
        document.getElementById('field-desc-fact').value = p.descripcionFactura || "";
        document.getElementById('field-costo').value = p.costo || 0;
        document.getElementById('field-precio').value = p.precio || 0;
        document.getElementById('field-existencia').value = p.existencia || 0;
        document.getElementById('field-minimo').value = p.stockMinimo || 5;
        document.getElementById('field-cf').value = p.creditoFiscal ? "true" : "false";

        document.getElementById('form-mode-title').innerText = "Editar Producto";
        this.switchTab('nuevo');
    }

    resetForm() {
        document.getElementById('field-id').value = "";
        document.getElementById('field-codigo').value = "";
        document.getElementById('field-proveedor').value = "";
        document.getElementById('field-descripcion').value = "";
        document.getElementById('field-desc-fact').value = "";
        document.getElementById('field-costo').value = 0;
        document.getElementById('field-precio').value = 0;
        document.getElementById('field-existencia').value = 0;
        document.getElementById('field-minimo').value = 5;
        document.getElementById('field-cf').value = "false";
        document.getElementById('form-mode-title').innerText = "Registrar Nuevo Producto";

        this.switchTab('lista');
    }

    async saveProduct() {
        const id = document.getElementById('field-id').value;
        const data = {
            codigo: document.getElementById('field-codigo').value,
            proveedor: document.getElementById('field-proveedor').value,
            descripcion: document.getElementById('field-descripcion').value,
            descripcionFactura: document.getElementById('field-desc-fact').value,
            costo: parseFloat(document.getElementById('field-costo').value) || 0,
            precio: parseFloat(document.getElementById('field-precio').value) || 0,
            existencia: parseFloat(document.getElementById('field-existencia').value) || 0,
            stockMinimo: parseFloat(document.getElementById('field-minimo').value) || 5,
            creditoFiscal: document.getElementById('field-cf').value === "true"
        };

        if (!data.codigo || !data.descripcion) {
            alert("El código y la descripción son obligatorios.");
            return;
        }

        const btn = document.getElementById('btn-save-product');
        btn.disabled = true;
        btn.innerHTML = "Guardando...";

        try {
            if (id) {
                await this.svc.actualizarProducto(id, data); // Update
            } else {
                await this.svc.guardarProducto(data); // Create
            }
            alert("Producto guardado correctamente.");
            this.resetForm();
            this.loadData();
        } catch (error) {
            alert("Error: " + error.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> GUARDAR PRODUCTO';
        }
    }

    async deleteProduct(id) {
        if (confirm("¿Estás seguro de eliminar este producto?")) {
            try {
                await this.svc.eliminarProducto(id);
                this.cache = this.cache.filter(p => p.id !== id);
                this.filtered = this.filtered.filter(p => p.id !== id);
                this.applySort();
            } catch (error) {
                alert("Error eliminando: " + error.message);
            }
        }
    }

    // =========================================
    // 4. EXCEL LOGIC (Ported)
    // =========================================
    handleExcelFile(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            // Lógica de detección inteligente (simplificada del código anterior)
            // 1. Buscar hoja con headers
            const keywords = ['codigo', 'descrip', 'venta', 'precio', 'stock'];
            let bestSheet = null;

            for (const name of workbook.SheetNames) {
                const sheet = workbook.Sheets[name];
                // Convert to JSON
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                // Scan for keywords
                let matches = 0;
                rows.slice(0, 20).forEach(row => {
                    const txt = JSON.stringify(row).toLowerCase();
                    if (keywords.some(k => txt.includes(k))) matches++;
                });
                if (matches > 1) {
                    bestSheet = rows;
                    break;
                }
            }

            if (!bestSheet) { alert("No se detectó una hoja válida de inventario."); return; }
            this.processExcelRows(bestSheet);
        };
        reader.readAsArrayBuffer(file);
    }

    processExcelRows(rows) {
        // Encontrar header row
        let headerIdx = -1;
        const keywords = ['codigo', 'descrip', 'venta', 'precio', 'stock'];
        for (let i = 0; i < Math.min(rows.length, 50); i++) {
            const rowStr = JSON.stringify(rows[i]).toLowerCase();
            if (keywords.some(k => rowStr.includes(k))) {
                headerIdx = i;
                break;
            }
        }

        if (headerIdx === -1) { alert("No se encontraron encabezados."); return; }

        const headers = rows[headerIdx].map(h => String(h).toLowerCase().trim());
        const dataRows = rows.slice(headerIdx + 1);

        // Mapear columnas
        const colMap = {
            codigo: headers.findIndex(h => h.includes('cod') || h.includes('id')),
            desc: headers.findIndex(h => h.includes('desc') || h.includes('prod')),
            costo: headers.findIndex(h => h.includes('costo') || h.includes('compra')),
            precio: headers.findIndex(h => (h.includes('precio') || h.includes('venta')) && !h.includes('costo')),
            exist: headers.findIndex(h => h.includes('exist') || h.includes('cant') || h.includes('stock')),
            prov: headers.findIndex(h => h.includes('prov'))
        };

        this.excelData = dataRows.map(row => {
            if (!row[colMap.codigo] && !row[colMap.desc]) return null; // Filtro filas vacías

            const cleanNum = (val) => {
                if (!val) return 0;
                if (typeof val === 'number') return val;
                const v = String(val).replace(/[^0-9.]/g, '');
                return parseFloat(v) || 0;
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

        this.showExcelPreview();
    }

    showExcelPreview() {
        document.getElementById('drop-area').style.display = 'none';
        document.getElementById('excel-preview').style.display = 'block';

        const table = document.getElementById('preview-table');
        let html = `<thead><tr><th>Código</th><th>Descripción</th><th>Costo</th><th>Precio</th><th>Stock</th></tr></thead><tbody>`;

        this.excelData.slice(0, 50).forEach(p => {
            html += `<tr><td>${p.codigo}</td><td>${p.descripcion}</td><td>${p.costo}</td><td>${p.precio}</td><td>${p.existencia}</td></tr>`;
        });
        html += `</tbody>`;
        table.innerHTML = html;
    }

    async uploadExcelData() {
        if (this.excelData.length === 0) return;

        const btn = document.getElementById('btn-confirm-excel');
        btn.disabled = true;
        btn.innerText = "Subiendo...";

        const batchSize = 400;
        try {
            for (let i = 0; i < this.excelData.length; i += batchSize) {
                const chunk = this.excelData.slice(i, i + batchSize);
                const batch = db.batch();
                chunk.forEach(data => {
                    const ref = db.collection('INVENTARIO').doc();
                    batch.set(ref, data);
                });
                await batch.commit();
            }
            alert(`Importación completada: ${this.excelData.length} productos.`);
            this.switchTab('lista');
            this.loadData();
            // Reset excel UI
            document.getElementById('drop-area').style.display = 'block';
            document.getElementById('excel-preview').style.display = 'none';
        } catch (e) {
            alert("Error subiendo: " + e.message);
        } finally {
            btn.disabled = false;
            btn.innerText = "Confirmar Importación";
        }
    }

    // =========================================
    // 5. UTILS / EXTRA
    // =========================================
    injectExtraActions() {
        const container = document.getElementById('extra-actions');

        // BORRAR TODO
        const btnDel = document.createElement('button');
        btnDel.className = 'btn btn-danger';
        btnDel.innerHTML = '<i class="fas fa-trash"></i> Borrar Todo';
        btnDel.onclick = async () => {
            if (confirm("⚠️ PELIGRO: ¿Borrar TODO el inventario?")) {
                await this.svc.borrarTodo();
                this.loadData();
            }
        };

        // ACTIVAR CF
        const btnCF = document.createElement('button');
        btnCF.className = 'btn btn-info';
        btnCF.innerHTML = 'Activar CF Masivo';
        btnCF.onclick = async () => {
            if (confirm("¿Activar CF para todos?")) {
                await this.svc.actualizarCreditoFiscalTodos();
                this.loadData();
            }
        };

        container.appendChild(btnCF);
        container.appendChild(btnDel);
    }
}

// INICIALIZACIÓN GLOBAL
const app = new InventoryController();
window.app = app; // Expose for inline onclicks
