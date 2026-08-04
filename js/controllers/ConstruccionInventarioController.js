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

        const label = document.getElementById('label-mes-actual');
        if (label) {
            const [y, m] = this.selectedMonth.split('-');
            const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
            const mesNombre = nombresMeses[parseInt(m) - 1] || m;
            label.innerText = `${mesNombre} ${y}`;
        }
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

        // File drop zone for FEL / Sales report
        const dropArea = document.getElementById('sales-drop-area');
        const fileInput = document.getElementById('sales-file-input');

        if (dropArea && fileInput) {
            dropArea.addEventListener('click', () => fileInput.click());
            dropArea.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.style.borderColor = '#2563eb'; });
            dropArea.addEventListener('dragleave', () => { dropArea.style.borderColor = '#cbd5e1'; });
            dropArea.addEventListener('drop', (e) => {
                e.preventDefault();
                dropArea.style.borderColor = '#cbd5e1';
                if (e.dataTransfer.files.length > 0) this.handleSalesFile(e.dataTransfer.files[0]);
            });

            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) this.handleSalesFile(e.target.files[0]);
            });
        }

        // Search in reconstruction table
        const searchInput = document.getElementById('search-construccion');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterTable(e.target.value));
        }
    }

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

            // 4. Cargar todos los productos base
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

        // Necesitamos un stock inicial que haga stockResultante >= 0
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

            // Insertar o actualizar salidas
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
