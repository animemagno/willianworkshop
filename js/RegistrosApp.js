/**
 * RegistrosApp.js
 * Controla la lógica de la pantalla de Registro de Salidas (Manual y por Excel)
 */

window.alert = function(message) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            text: message,
            icon: message.includes('⚠️') || message.includes('PELIGRO') || message.includes('Error') || message.includes('problema') ? 'warning' : (message.includes('✅') || message.includes('éxito') || message.includes('correctamente') || message.includes('¡') ? 'success' : 'info'),
            confirmButtonColor: '#3498db',
            customClass: {
                popup: 'premium-popup'
            }
        });
    } else {
        console.log(message);
    }
};

const RegistrosApp = {
    db: null,
    registrosRef: null,
    unsubscribe: null,
    unsubscribeClones: null,
    allRegistros: [],
    historyLoaded: false,
    mapeoRef: null,
    mapeoNombres: {}, // { nombreExcel_clave → codigoInventario }
    currentLinkContext: 'registry', // 'registry' | 'invoice'
    currentLinkInvoiceId: null,
    currentLinkInvoiceItemIndex: null,
    editingInvoiceId: null,
    expandedAccounts: new Set(),

    async confirmDialog(message) {
        if (typeof Swal === 'undefined') return confirm(message);
        const result = await Swal.fire({
            title: '¿Confirmar acción?',
            text: message,
            icon: message.includes('⚠️') || message.includes('PELIGRO') || message.includes('eliminar') || message.includes('anular') || message.includes('ELIMINAR') ? 'warning' : 'question',
            showCancelButton: true,
            confirmButtonColor: message.includes('⚠️') || message.includes('PELIGRO') || message.includes('eliminar') || message.includes('anular') || message.includes('ELIMINAR') ? '#e74c3c' : '#3498db',
            cancelButtonColor: '#7f8c8d',
            confirmButtonText: 'Sí, confirmar',
            cancelButtonText: 'Cancelar',
            customClass: {
                popup: 'premium-popup'
            }
        });
        return result.isConfirmed;
    },

    async init() {
        this.showLoading(true);
        try {
            if (!window.firebaseService || !window.firebaseService.getDb()) {
                console.error("Firebase no está inicializado. Verifica FirebaseService.");
                return;
            }
            this.db = window.firebaseService.getDb();
            this.registrosRef = window.firebaseService.getRegistrosRef();
            this.respaldoRef = window.firebaseService.getRespaldoRef();
            this.preciosRef = window.firebaseService.getPreciosRef();
            this.mapeoRef = window.firebaseService.getMapeoRef();
            this.facturaTipo = null;

            this.allRegistros = []; // Todos los registros
            this.allClonesMap = {}; // Clones agrupados por respaldoId
            this.facturaItems = []; // Items en la factura (drag & drop)

            this.setupUI();
            this.setupEventListeners();
            this.loadCustomServices(); // Mover aquí para que cargue instantáneamente
            
            await this.loadActiveInvoices();
            await this.loadMapeoNombres();
            await this.initFacturaDate();
            this.loadFacturaDraft();
            
            // Autocompletar la fecha de registro rápido con la fecha de hoy
            const fastFechaInput = document.getElementById('fast-fecha');
            if (fastFechaInput) {
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                fastFechaInput.value = `${yyyy}-${mm}-${dd}`;
            }

            await this.loadInvoicesHistory();
            this.listenToRegistros();

        } catch (error) {
            console.error("Error al iniciar RegistrosApp:", error);
            alert("Error al iniciar el módulo: " + error.message);
        } finally {
            this.showLoading(false);
        }
    },

    activeInvoicesUnsubscribe: null,

    loadActiveInvoices() {
        if (this.activeInvoicesUnsubscribe) this.activeInvoicesUnsubscribe();

        return new Promise((resolve) => {
            let isInitial = true;
            this.activeInvoicesUnsubscribe = this.db.collection('INVENTARIO_SALIDAS')
                .onSnapshot(snap => {
                    this.activeInvoiceIds = new Set(snap.docs.map(doc => doc.id));
                    if (isInitial) {
                        isInitial = false;
                        resolve();
                    }
                }, err => {
                    console.error("Error al escuchar facturas activas para auto-sanación:", err);
                    if (!this.activeInvoiceIds) this.activeInvoiceIds = new Set();
                    if (isInitial) {
                        isInitial = false;
                        resolve();
                    }
                });
        });
    },

    // autoMigrateRegistros removed.,

    async initFacturaDate() {
        const inputFecha = document.getElementById('factura-fecha');
        if (!inputFecha) return;

        try {
            const snap = await this.db.collection('INVENTARIO_SALIDAS')
                .orderBy('timestamp', 'desc')
                .limit(1)
                .get();

            const currentISODate = this.getLocalISODate();
            const currentMonthStr = currentISODate.substring(0, 7);
            
            // Determinar el primer día laborable del mes actual (Lunes a Sábado)
            const firstDayOfMonth = new Date(currentMonthStr + '-01T12:00:00Z');
            let firstWorkingDayStr = currentMonthStr + '-01';
            if (firstDayOfMonth.getUTCDay() === 0) { // Si es Domingo
                firstWorkingDayStr = currentMonthStr + '-02';
            }

            let targetDateStr = firstWorkingDayStr;

            if (!snap.empty) {
                const data = snap.docs[0].data();
                if (data.fecha) {
                    const lastInvoiceMonthStr = data.fecha.substring(0, 7);
                    if (lastInvoiceMonthStr === currentMonthStr) {
                        // Es del mes actual, continuamos la secuencia
                        targetDateStr = data.fecha;
                    }
                    // Si es de un mes anterior, se mantiene targetDateStr = firstWorkingDayStr
                }
            }

            inputFecha.value = targetDateStr;
            this.mesFacturable = targetDateStr.substring(0, 7); 
        } catch (e) {
            console.error("Error obteniendo fecha de última factura:", e);
            inputFecha.value = this.getLocalISODate();
            this.mesFacturable = this.getLocalISODate().substring(0, 7);
        }
    },

    saveFacturaDraft() {
        try {
            const draft = {
                items: this.facturaItems,
                cliente: document.getElementById('factura-cliente') ? document.getElementById('factura-cliente').value : '',
                numero: document.getElementById('factura-numero') ? document.getElementById('factura-numero').value : ''
            };
            localStorage.setItem('facturaDraft_v1', JSON.stringify(draft));
        } catch(e) {
            console.error("Error saving draft", e);
        }
    },

    loadFacturaDraft() {
        try {
            const draftStr = localStorage.getItem('facturaDraft_v1');
            if (draftStr) {
                const draft = JSON.parse(draftStr);
                if (draft.items && draft.items.length > 0) {
                    this.facturaItems = draft.items;
                    setTimeout(() => {
                        if (draft.cliente && document.getElementById('factura-cliente')) {
                            document.getElementById('factura-cliente').value = draft.cliente;
                        }
                        if (draft.numero && document.getElementById('factura-numero')) {
                            document.getElementById('factura-numero').value = draft.numero;
                        }
                        this.renderFactura();
                        this.renderFacturacionData();
                    }, 100);
                }
            }
        } catch(e) {
            console.error("Error loading draft", e);
        }
    },

    avanzarDiaFactura() {
        const inputFecha = document.getElementById('factura-fecha');
        if (!inputFecha || !inputFecha.value) return;

        let dateObj = new Date(inputFecha.value + 'T12:00:00');
        dateObj.setDate(dateObj.getDate() + 1);

        if (dateObj.getDay() === 0) {
            dateObj.setDate(dateObj.getDate() + 1);
        }

        const newDateStr = dateObj.toISOString().split('T')[0];
        inputFecha.value = newDateStr;
        this.saveFacturaDraft();
        this.renderFacturacionData();
    },

    getLocalISODate(dateObj = new Date()) {
        const offset = dateObj.getTimezoneOffset() * 60000;
        return (new Date(dateObj.getTime() - offset)).toISOString().split('T')[0];
    },

    formatDateUserFriendly(dateStr) {
        // Recibe YYYY-MM-DD y devuelve DD/MM/YYYY
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return dateStr;
    },

    parseDateToMillis(dateStr) {
        if (!dateStr) return 0;
        const str = String(dateStr).trim();
        let y, m, d;
        if (str.includes('-')) {
            const parts = str.split('-');
            if (parts[0].length === 4) {
                // YYYY-MM-DD
                y = parseInt(parts[0]);
                m = parseInt(parts[1]) - 1;
                d = parseInt(parts[2]);
            } else {
                // DD-MM-YYYY
                y = parseInt(parts[2]);
                m = parseInt(parts[1]) - 1;
                d = parseInt(parts[0]);
            }
        } else if (str.includes('/')) {
            const parts = str.split('/');
            if (parts[0].length === 4) {
                // YYYY/MM/DD
                y = parseInt(parts[0]);
                m = parseInt(parts[1]) - 1;
                d = parseInt(parts[2]);
            } else {
                // DD/MM/YYYY
                y = parseInt(parts[2]);
                if (y < 100) y += 2000; // corregir año de 2 dígitos
                m = parseInt(parts[1]) - 1;
                d = parseInt(parts[0]);
            }
        } else {
            return 0;
        }
        if (isNaN(y) || isNaN(m) || isNaN(d)) return 0;
        return new Date(y, m, d).getTime();
    },

    normalizeDateStr(dateStr) {
        if (!dateStr) return '';
        const millis = this.parseDateToMillis(dateStr);
        if (millis === 0) return dateStr;
        const d = new Date(millis);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    },

    _findProductInCache(rawName, pId) {
        if (!window.app || !window.app.cache) return null;
        
        const cacheKey = pId ? `${pId}_${rawName}` : rawName;
        if (!this._productSearchMemo) this._productSearchMemo = {};
        if (this._productSearchMemo[cacheKey] !== undefined) {
            return this._productSearchMemo[cacheKey];
        }

        let cachedProduct = null;
        if (pId) {
            cachedProduct = window.app.cache.find(p => p.id === pId);
        }

        if (!cachedProduct && rawName) {
            const normRaw = this.normalizeVolumeInString(rawName);
            cachedProduct = window.app.cache.find(p => {
                if (p._normDesc === undefined) p._normDesc = this.normalizeVolumeInString(p.descripcion);
                if (p._normDesc === normRaw) return true;
                if (p.aliases) {
                    if (p._normAliases === undefined) {
                        p._normAliases = p.aliases.map(a => this.normalizeVolumeInString(a));
                    }
                    if (p._normAliases.includes(normRaw)) return true;
                }
                return false;
            });
        }

        this._productSearchMemo[cacheKey] = cachedProduct || null;
        return cachedProduct || null;
    },

    getOfficialProductName(regOrName, productId = null) {
        if (!regOrName) return '';
        let rawName = typeof regOrName === 'object' ? (regOrName.producto || '') : regOrName;
        let pId = typeof regOrName === 'object' ? (regOrName.productId || regOrName.vinculoId || null) : productId;

        const cachedProduct = this._findProductInCache(rawName, pId);
        if (cachedProduct) {
            return cachedProduct.descripcion || cachedProduct.descripcionTaller || rawName;
        }
        return rawName;
    },

    getGroupingKey(regOrName, productId = null) {
        if (!regOrName) return '';
        let rawName = typeof regOrName === 'object' ? (regOrName.producto || '') : regOrName;
        let pId = typeof regOrName === 'object' ? (regOrName.productId || regOrName.vinculoId || null) : productId;

        const cachedProduct = this._findProductInCache(rawName, pId);
        if (cachedProduct) {
            if (cachedProduct.codigo && cachedProduct.codigo.trim()) {
                return cachedProduct.codigo.toLowerCase().trim();
            }
            const officialName = cachedProduct.descripcion || cachedProduct.descripcionTaller || rawName;
            return officialName.toLowerCase().trim();
        }
        return rawName.toLowerCase().trim();
    },

    normalizeVolumeInString(str) {
        if (!str) return '';
        let normalized = str.toLowerCase().trim();
        normalized = normalized.replace(/\b1\s*litros?\b/g, '1000ml');
        normalized = normalized.replace(/\b1\s*l\b/g, '1000ml');
        normalized = normalized.replace(/\b1000\s*ml\b/g, '1000ml');
        return normalized.replace(/\s+/g, ' ');
    },

    // Extrae el mes en formato YYYY-MM de una fecha (sea YYYY-MM-DD o DD/MM/YYYY)
    _getRegMonth(fecha) {
        if (!fecha) return '';
        const str = String(fecha).trim();
        // YYYY-MM-DD
        if (str.length >= 7 && str[4] === '-') {
            return str.substring(0, 7);
        }
        // DD/MM/YYYY
        if (str.includes('/')) {
            const parts = str.split('/');
            if (parts.length === 3) {
                const y = parts[2].length === 4 ? parts[2] : (parts[0].length === 4 ? parts[0] : '');
                const m = parts[2].length === 4 ? parts[1] : parts[1];
                if (y && m) return `${y}-${m.padStart(2, '0')}`;
            }
        }
        // Intentar parsear con parseDateToMillis
        const millis = this.parseDateToMillis(str);
        if (millis > 0) {
            const d = new Date(millis);
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        }
        return '';
    },

    // Convierte un nombre a clave válida para ID de documento Firestore
    sanitizeForDocId(str) {
        return str.toLowerCase().trim().replace(/[/.#$\[\]]/g, '_');
    },

    // Carga todos los vínculos manuales guardados en MAPEO_NOMBRES
    async loadMapeoNombres() {
        try {
            if (!this.mapeoRef) return;
            const snap = await this.mapeoRef.get();
            this.mapeoNombres = {};
            snap.forEach(doc => {
                const data = doc.data();
                if (data.codigoInventario) {
                    this.mapeoNombres[doc.id] = data.codigoInventario;
                }
            });
            console.log(`MAPEO_NOMBRES cargado: ${Object.keys(this.mapeoNombres).length} entradas.`);
        } catch (err) {
            console.error('Error cargando MAPEO_NOMBRES:', err);
            this.mapeoNombres = {};
        }
    },

    // Busca un producto en el caché por su código de inventario
    findProductByCodigo(codigo) {
        if (!codigo || !window.app || !window.app.cache) return null;
        const codigoBuscar = codigo.toLowerCase().trim();
        return window.app.cache.find(p => {
            if (!p.codigo) return false;
            const partes = p.codigo.split(/[\s,-]+/);
            return partes.some(c => c.toLowerCase().trim() === codigoBuscar);
        }) || null;
    },

    setupUI() {
        // Enfocar en cantidad al inicio
        const inputCant = document.getElementById('fast-cantidad');
        if (inputCant) inputCant.focus();

        // Poner la fecha de hoy por defecto en el campo de fecha
        const fechaInput = document.getElementById('fast-fecha');
        if (fechaInput && !fechaInput.value) {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            fechaInput.value = `${yyyy}-${mm}-${dd}`;
        }
    },

    setupEventListeners() {
        // Formulario de ingreso rápido (El submit ahora se maneja directamente en el onsubmit del HTML para evitar recargas)
        
        // Manejar ENTER en cantidad para que pase a producto sin guardar
        const inputCant = document.getElementById('fast-cantidad');
        if (inputCant) {
            inputCant.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const inputProd = document.getElementById('fast-producto');
                    if (inputProd) inputProd.focus();
                }
            });
        }
        // Archivo Excel
        const excelFile = document.getElementById('excel-file') || document.getElementById('import-excel-input');
        if (excelFile) {
            excelFile.addEventListener('change', (e) => {
                this.handleExcelUpload(e);
            });
        }

        const fastExcelFile = document.getElementById('fast-excel-file');
        if (fastExcelFile) {
            fastExcelFile.addEventListener('change', (e) => {
                if (window.RegistroController) window.RegistroController.handleExcelUpload(e);
            });
        }

        // Filtros
        const searchInput = document.getElementById('search-registro');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.renderTable());
        }

        const clienteInput = document.getElementById('factura-cliente');
        if (clienteInput) clienteInput.addEventListener('input', () => this.saveFacturaDraft());
        
        const numeroInput = document.getElementById('factura-numero');
        if (numeroInput) numeroInput.addEventListener('input', () => this.saveFacturaDraft());

        const fechaInput = document.getElementById('factura-fecha');
        if (fechaInput) {
            fechaInput.addEventListener('change', () => {
                this.saveFacturaDraft();
                this.renderFacturacionData();
            });
        }
        
        this.setupAutocomplete();
    },

    setupAutocomplete() {
        const input = document.getElementById('fast-producto');
        const container = document.getElementById('fast-producto-suggestions');
        if (!input || !container) return;

        let currentFocus = -1;

        input.addEventListener('input', () => {
            const val = input.value.trim().toLowerCase();
            container.innerHTML = '';
            currentFocus = -1;
            
            if (!val) {
                container.style.display = 'none';
                return;
            }

            if (!window.app || !window.app.cache) return;

            // Filtrar productos (buscar en codigo, descripcion y aliases)
            const results = window.app.cache.filter(p => {
                const searchStr = `${p.codigo || ''} ${p.descripcion || ''} ${(p.aliases || []).join(' ')}`.toLowerCase();
                return searchStr.includes(val);
            }).slice(0, 15); // Mostrar máx 15 resultados

            if (results.length === 0) {
                container.style.display = 'none';
                return;
            }

            results.forEach((p, index) => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.dataset.index = index;
                div.innerHTML = `
                    <div>
                        <strong>${p.codigo || ''}</strong> ${p.descripcion || ''}
                    </div>
                    <div class="suggestion-stock">Stock: ${p.existencia}</div>
                `;
                div.addEventListener('mousedown', (e) => {
                    // Usar mousedown en lugar de click para evitar que el blur del input lo oculte antes de registrar el clic
                    e.preventDefault();
                    input.value = p.descripcion || p.codigo;
                    container.style.display = 'none';
                });
                container.appendChild(div);
            });

            container.style.display = 'block';
        });

        input.addEventListener('keydown', (e) => {
            let items = container.querySelectorAll('.suggestion-item');
            if (!items || items.length === 0 || container.style.display === 'none') return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                currentFocus++;
                addActive(items);
                scrollToActive(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                currentFocus--;
                addActive(items);
                scrollToActive(items);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (currentFocus > -1) {
                    if (items[currentFocus]) {
                        items[currentFocus].dispatchEvent(new MouseEvent('mousedown'));
                    }
                }
            }
        });

        function addActive(items) {
            if (!items) return false;
            removeActive(items);
            if (currentFocus >= items.length) currentFocus = 0;
            if (currentFocus < 0) currentFocus = items.length - 1;
            items[currentFocus].style.backgroundColor = '#edf2f7'; // Resaltado
        }

        function removeActive(items) {
            for (let i = 0; i < items.length; i++) {
                items[i].style.backgroundColor = '';
            }
        }
        
        function scrollToActive(items) {
            if (currentFocus > -1 && items[currentFocus]) {
                const activeItem = items[currentFocus];
                const containerHeight = container.clientHeight;
                const itemTop = activeItem.offsetTop;
                const itemHeight = activeItem.offsetHeight;

                if (itemTop < container.scrollTop) {
                    container.scrollTop = itemTop;
                } else if (itemTop + itemHeight > container.scrollTop + containerHeight) {
                    container.scrollTop = itemTop + itemHeight - containerHeight;
                }
            }
        }

        input.addEventListener('blur', () => {
            container.style.display = 'none';
        });

        input.addEventListener('focus', () => {
            if (input.value.trim() && container.children.length > 0) {
                container.style.display = 'block';
            }
        });
    },

    calculateComputedBilledMap(registros) {
        if (this._cachedComputedBilledMap) {
            return this._cachedComputedBilledMap;
        }

        const facturadoPorMesYProducto = {};
        if (!this._cachedFacturadoHistorico) {
            this._cachedFacturadoHistorico = {};
            if (Array.isArray(this.allHistoricalInvoices)) {
                this.allHistoricalInvoices.forEach(inv => {
                    const mes = inv.fecha ? inv.fecha.substring(0, 7) : '';
                    if (!mes) return;
                    if (!this._cachedFacturadoHistorico[mes]) this._cachedFacturadoHistorico[mes] = {};
                    
                    const items = inv.items || [];
                    items.forEach(item => {
                        if (item.isManoDeObra || item.productId === 'SERVICIO') return;
                        const key = this.getGroupingKey(item.descripcionPapel || item.producto, item.productId);
                        this._cachedFacturadoHistorico[mes][key] = (this._cachedFacturadoHistorico[mes][key] || 0) + (item.cantidad || 0);
                    });
                });
            }
        }

        for (const m in this._cachedFacturadoHistorico) {
            facturadoPorMesYProducto[m] = { ...this._cachedFacturadoHistorico[m] };
        }

        const descAcumuladores = {};
        for (const m in facturadoPorMesYProducto) {
            descAcumuladores[m] = { ...facturadoPorMesYProducto[m] };
        }

        for (const regId in this.allClonesMap) {
            const clones = this.allClonesMap[regId] || [];
            clones.forEach(c => {
                if (c.estado === 'facturado' && c.facturaId) {
                    const inv = this.allHistoricalInvoices.find(f => f.id === c.facturaId);
                    if (inv && inv.fecha) {
                        const mesInv = inv.fecha.substring(0, 7);
                        const originalReg = this.allRegistros.find(r => r.id === regId);
                        if (originalReg) {
                            const key = this.getGroupingKey(originalReg);
                            if (descAcumuladores[mesInv] && descAcumuladores[mesInv][key] > 0) {
                                const descontar = Math.min(descAcumuladores[mesInv][key], c.cantidad);
                                descAcumuladores[mesInv][key] -= descontar;
                            }
                        }
                    }
                }
            });
        }

        const computedBilledMap = {};
        
        if (!this._cachedRegistrosOrdenadosAsc) {
            this._cachedRegistrosOrdenadosAsc = [...this.allRegistros].sort((a, b) => {
                const millisA = this.parseDateToMillis(a.fecha);
                const millisB = this.parseDateToMillis(b.fecha);
                if (millisA !== millisB) return millisA - millisB;
                const hasFilaA = a.filaExcel !== undefined && a.filaExcel !== null;
                const hasFilaB = b.filaExcel !== undefined && b.filaExcel !== null;
                if (hasFilaA && hasFilaB) return a.filaExcel - b.filaExcel;
                if (hasFilaA) return -1;
                if (hasFilaB) return 1;
                return 0;
            });
        }
        
        const registrosParaFIFO = this._cachedRegistrosOrdenadosAsc;

        // --- STRICT MONTHLY FIFO ---
        registrosParaFIFO.forEach(reg => {
            const mesReg = reg.fecha ? reg.fecha.substring(0, 7) : '';
            const key = this.getGroupingKey(reg);
            let billedHere = 0;
            let remainingQty = reg.cantidad;

            if (descAcumuladores[mesReg] && descAcumuladores[mesReg][key] > 0) {
                const descontar = Math.min(descAcumuladores[mesReg][key], remainingQty);
                descAcumuladores[mesReg][key] -= descontar;
                remainingQty -= descontar;
                billedHere += descontar;
            }

            computedBilledMap[reg.id] = billedHere;
        });

        this._cachedComputedBilledMap = computedBilledMap;
        return computedBilledMap;
    },

    renderFastEntryTable() {
        const tbody = document.getElementById('fast-entry-tbody');
        const excelTbody = document.getElementById('excel-table-tbody');
        const historialTbody = document.getElementById('historial-archivo-tbody');
        if (!tbody) return;

        let totalItems = 0;
        let resumenMap = {};

        tbody.innerHTML = '';
        if (excelTbody) excelTbody.innerHTML = '';
        if (historialTbody) historialTbody.innerHTML = '';

        // Calcular mapa de facturación FIFO antes de usarlo en los filtros
        const computedBilledMap = this.calculateComputedBilledMap(this.allRegistros);

        // Determinar el mes en contexto para ocultar pendientes de meses pasados
        let selectedMonthStr = '';
        const facturaFechaInput = document.getElementById('factura-fecha');
        if (facturaFechaInput && facturaFechaInput.value) {
            selectedMonthStr = facturaFechaInput.value.substring(0, 7);
        } else {
            const today = new Date();
            selectedMonthStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
        }

        const registrosArchivados = this.allRegistros.filter(r => r.archivado);
        
        const registrosAMostrar = this.allRegistros.filter(r => {
            // En modo "Meses Aislados", ocultamos los registros que no son del mes en contexto
            // para que no se sumen en los resúmenes ni se muestren como pendientes en el mes actual.
            if (r.fecha && r.fecha.substring(0, 7) !== selectedMonthStr) return false;

            if (!r.archivado) return true;
            // Si está archivado pero ya no está completamente facturado (ej: factura eliminada), mostrarlo.
            const fifoBilled = computedBilledMap[r.id] || 0;
            const clones = this.allClonesMap[r.id] || [];
            const explicitBilledClones = clones.filter(c => c.estado === 'facturado').reduce((sum, c) => sum + c.cantidad, 0);
            const totalBilled = (fifoBilled + explicitBilledClones);
            return totalBilled < r.cantidad;
        });

        if (historialTbody) {
            if (registrosArchivados.length === 0) {
                historialTbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 40px; color: #aaa;">No hay registros archivados</td></tr>`;
            } else {
                const mesesMap = {};
                registrosArchivados.forEach(reg => {
                    if (!reg.fecha) return;
                    const mesKey = reg.fecha.substring(0, 7); // YYYY-MM
                    if (!mesesMap[mesKey]) {
                        mesesMap[mesKey] = { mesKey, count: 0 };
                    }
                    mesesMap[mesKey].count += 1;
                });
                
                const mesesArray = Object.values(mesesMap).sort((a, b) => b.mesKey.localeCompare(a.mesKey));
                
                mesesArray.forEach(mes => {
                    const [year, month] = mes.mesKey.split('-');
                    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                    const monthName = monthNames[parseInt(month, 10) - 1];
                    const label = `${monthName} ${year}`;
                    
                    const tr = document.createElement('tr');
                    tr.style.background = '#fff';
                    tr.innerHTML = `
                        <td style="border: 1px solid #edf2f7; padding: 15px; font-weight: bold; font-size: 1.1rem; color: #2c3e50;">
                            <i class="far fa-calendar-alt" style="margin-right: 8px; color: #3498db;"></i> ${label}
                        </td>
                        <td style="text-align: center; border: 1px solid #edf2f7; padding: 15px; font-weight: bold; color: #7f8c8d; font-size: 1.1rem;">
                            ${mes.count} registros
                        </td>
                        <td style="text-align: center; border: 1px solid #edf2f7; padding: 15px;">
                            <button class="btn btn-info" onclick="RegistrosApp.abrirHistorialMes('${mes.mesKey}', '${label}')" style="padding: 8px 15px; border-radius: 6px; border: none; background: #3498db; color: white; cursor: pointer; transition: background 0.2s;">
                                <i class="fas fa-eye"></i> Ver Detalles
                            </button>
                        </td>
                    `;
                    historialTbody.appendChild(tr);
                });
            }
        }

        if (registrosAMostrar.length === 0) {
            tbody.innerHTML = `
                <tr id="empty-state-row">
                    <td colspan="6" style="text-align: center; padding: 40px 20px; color: #aaa;">
                        <i class="fas fa-box-open" style="font-size: 40px; margin-bottom: 10px;"></i>
                        <p>No hay productos registrados.</p>
                        <p style="font-size: 13px;">Agrega productos desde el formulario para comenzar.</p>
                    </td>
                </tr>
            `;
            if (excelTbody) {
                excelTbody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; padding: 40px; color: #aaa;">No hay datos para mostrar</td>
                    </tr>
                `;
            }
        } else {
            // Ordenar por fecha descendente (más recientes arriba).
            // Para el mismo día, priorizar filaExcel de forma ascendente (el orden del Excel).
            // Si son manuales o no tienen filaExcel, colocarlos al final (desempatados por timestamp ascendente).
            registrosAMostrar.sort((a, b) => {
                const millisA = this.parseDateToMillis(a.fecha);
                const millisB = this.parseDateToMillis(b.fecha);
                
                if (millisA !== millisB) {
                    return millisB - millisA; // Descendente (más recientes arriba)
                }
                
                const hasFilaA = a.filaExcel !== undefined && a.filaExcel !== null;
                const hasFilaB = b.filaExcel !== undefined && b.filaExcel !== null;
                
                if (hasFilaA && hasFilaB) {
                    return a.filaExcel - b.filaExcel; // Fila menor arriba (ascendente)
                } else if (hasFilaA) {
                    return -1; // a (Excel) va arriba de b (manual)
                } else if (hasFilaB) {
                    return 1; // b (Excel) va arriba de a (manual)
                }
                
                let tA = 0;
                if (a.timestamp) {
                    if (typeof a.timestamp.toMillis === 'function') tA = a.timestamp.toMillis();
                    else if (a.timestamp instanceof Date) tA = a.timestamp.getTime();
                    else if (typeof a.timestamp === 'number') tA = a.timestamp;
                }
                let tB = 0;
                if (b.timestamp) {
                    if (typeof b.timestamp.toMillis === 'function') tB = b.timestamp.toMillis();
                    else if (b.timestamp instanceof Date) tB = b.timestamp.getTime();
                    else if (typeof b.timestamp === 'number') tB = b.timestamp;
                }
                return tB - tA; // Descendente para que los más recientes vayan arriba
            });

            // computedBilledMap ya fue calculado al inicio de renderFastEntryTable()

            registrosAMostrar.forEach((reg, index) => {
                totalItems += reg.cantidad;
                const key = this.getGroupingKey(reg);
                const officialName = this.getOfficialProductName(reg);

                // Obtener clones y calcular estado de facturación y acumulados
                const clones = this.allClonesMap[reg.id] || [];
                const fifoBilled = computedBilledMap[reg.id] || 0;
                
                const explicitBilledClones = clones.filter(c => c.estado === 'facturado').reduce((sum, c) => sum + c.cantidad, 0);
                
                let totalBilled = (fifoBilled + explicitBilledClones);
                
                const totalPending = Math.max(0, reg.cantidad - totalBilled);


                if (!resumenMap[key]) {
                    resumenMap[key] = { name: officialName, count: 0, countFacturado: 0 };
                }
                resumenMap[key].count += reg.cantidad;
                resumenMap[key].countFacturado += totalBilled;

                let rowStyle = '';
                let displayProductStyle = '';
                let isFullyFacturado = false;
                let isPartiallyFacturado = false;

                if (totalBilled >= reg.cantidad) {
                    isFullyFacturado = true;
                    rowStyle = 'background-color: #e8f5e9 !important;';
                    displayProductStyle = 'color: #27ae60; font-weight: bold;';
                } else if (totalBilled > 0) {
                    isPartiallyFacturado = true;
                    rowStyle = 'background-color: #fffbeb !important;';
                    displayProductStyle = 'color: #b7791f; font-weight: bold;';
                }

                // Generar etiquetas de facturas
                const billedClones = clones.filter(c => c.estado === 'facturado');
                let pillsHtml = '';
                billedClones.forEach(bc => {
                    const numFact = bc.numeroFactura || bc.facturaId || 'N/A';
                    const client = bc.clienteFactura || 'Cliente General';
                    const qty = bc.cantidad;
                    pillsHtml += `
                        <span class="invoice-pill" title="Cliente: ${client}">
                            <i class="fas fa-file-invoice" style="color: #4a5568;"></i> Fact. #${numFact} (${qty} ud${qty > 1 ? 's' : ''})
                        </span>
                    `;
                });

                const isLinked = reg.productId ? true : false;
                const displayProduct = isLinked 
                    ? `<span style="${displayProductStyle}">${officialName}</span> <span style="font-size:11px; color:#3498db; cursor:pointer; margin-left:6px;" onclick="RegistrosApp.openLinkRegistryModal('${reg.id}', '${reg.producto.replace(/'/g, "\\'")}')" title="Editar vínculo con Inventario"><i class="fas fa-edit"></i></span>`
                    : `<span style="${displayProductStyle}">${reg.producto}</span> <button class="btn" style="padding: 2px 6px; font-size: 11px; margin-left: 8px; border-radius: 4px; border: 1px solid #d35400; color: #d35400; background: #fffcf8; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;" onclick="RegistrosApp.openLinkRegistryModal('${reg.id}', '${reg.producto.replace(/'/g, "\\'")}')"><i class="fas fa-link"></i> Vincular</button>`;

                const productCellContent = `
                    <div>
                        ${displayProduct}
                        ${pillsHtml ? `<div style="margin-top: 2px; display: flex; flex-wrap: wrap; gap: 4px;">${pillsHtml}</div>` : ''}
                    </div>
                `;

                // Bloquear eliminación si tiene partes facturadas, pero permitir archivar
                const actionCell = (isFullyFacturado || isPartiallyFacturado)
                    ? (isFullyFacturado 
                        ? `<i class="fas fa-check-circle" style="color: #27ae60; font-size: 1.2rem;" title="Facturado"></i>`
                        : `<div style="display: flex; gap: 5px; align-items: center; justify-content: center;">
                             <i class="fas fa-adjust" style="color: #b7791f; font-size: 1.2rem;" title="Facturado Parcial (${totalBilled}/${reg.cantidad})"></i>
                             <button type="button" class="btn btn-warning" style="padding: 2px 6px; font-size: 10px; border-radius: 4px; background-color: #f39c12; color: white; border: none; cursor: pointer;" onclick="RegistrosApp.forzarArchivar('${reg.id}')" title="Archivar manualmente"><i class="fas fa-archive"></i></button>
                           </div>`)
                    : `<button type="button" class="btn btn-danger" style="padding: 5px; width: 30px; height: 30px; border-radius: 50%;" onclick="RegistrosApp.deleteRegistro('${reg.id}')" title="Eliminar fila"><i class="fas fa-times"></i></button>`;

                const tr = document.createElement('tr');
                if (rowStyle) tr.style.cssText = rowStyle;
                
                // Add strikethrough for fully facturado qty
                const qtyDisplay = isFullyFacturado 
                    ? `<strong style="text-decoration: line-through; color: #7f8c8d;">${reg.cantidad}</strong>` 
                    : `<strong>${reg.cantidad}</strong>`;
                
                tr.innerHTML = `
                    <td style="border-bottom: 1px solid #edf2f7; ${isFullyFacturado ? 'color: #27ae60;' : ''}">${qtyDisplay}</td>
                    <td style="border-bottom: 1px solid #edf2f7;"><span style="font-size: 13px; color: ${isFullyFacturado ? '#27ae60' : '#7f8c8d'};">${this.formatDate(reg.fecha)}</span></td>
                    <td style="border-bottom: 1px solid #edf2f7;">${productCellContent}</td>
                    <td style="border-bottom: 1px solid #edf2f7; font-size: 0.95rem; font-weight: bold; color: ${isFullyFacturado ? '#27ae60' : '#2c3e50'};">${reg.cuenta || '-'}</td>
                    <td style="border-bottom: 1px solid #edf2f7; font-size: 0.95rem; font-weight: bold; color: ${isFullyFacturado ? '#27ae60' : '#e67e22'};">${reg.precioEspecial ? '$' + parseFloat(reg.precioEspecial).toFixed(2) : '-'}</td>
                    <td style="border-bottom: 1px solid #edf2f7;"><span style="font-size:13px; color:${isFullyFacturado ? '#27ae60' : '#666'};">${reg.observacion || '-'}</span></td>
                    <td style="border-bottom: 1px solid #edf2f7; text-align: center;">${actionCell}</td>
                `;
                tbody.appendChild(tr);
            });

            if (excelTbody) {
                let lastFormattedDate = null;
                let lastRawDate = null;
                const registrosParaExcel = registrosAMostrar.slice().reverse();

                registrosParaExcel.forEach((reg, index) => {
                    const currentFormattedDate = this.formatDate(reg.fecha);
                    const currentRawDate = reg.fecha;
                    
                    const clones = this.allClonesMap[reg.id] || [];
                    const fifoBilled = computedBilledMap[reg.id] || 0;
                    const explicitBilledClones = clones.filter(c => c.estado === 'facturado').reduce((sum, c) => sum + c.cantidad, 0);
                    let totalBilled = (fifoBilled + explicitBilledClones);
                    let isFullyFacturado = totalBilled >= reg.cantidad;

                    let rowStyle = '';
                    if (isFullyFacturado) {
                        rowStyle = 'background-color: #e8f5e9 !important;';
                    } else if (totalBilled > 0) {
                        rowStyle = 'background-color: #fffbeb !important;';
                    }

                    const billedClones = clones.filter(c => c.estado === 'facturado');
                    let pillsHtml = '';
                    billedClones.forEach(bc => {
                        const numFact = bc.numeroFactura || bc.facturaId || 'N/A';
                        const client = bc.clienteFactura || 'Cliente General';
                        const qty = bc.cantidad;
                        pillsHtml += `
                            <span class="invoice-pill" title="Cliente: ${client}">
                                <i class="fas fa-file-invoice" style="color: #4a5568;"></i> Fact. #${numFact} (${qty} ud${qty > 1 ? 's' : ''})
                            </span>
                        `;
                    });

                    if (lastFormattedDate !== null && currentFormattedDate !== lastFormattedDate) {
                        const trBtn = document.createElement('tr');
                        trBtn.innerHTML = `
                            <td colspan="6" style="border: 1px solid #d4d4d4; padding: 4px; text-align: center; background-color: #fcfcfc;">
                                <button type="button" class="btn" style="background: none; border: 1px dashed #bbb; color: #666; font-size: 12px; padding: 4px 10px; border-radius: 4px; cursor: pointer;" onclick="RegistrosApp.addEmptyRowForDate('${lastRawDate}')">+ Agregar espacio en ${lastFormattedDate}</button>
                            </td>
                        `;
                        excelTbody.appendChild(trBtn);
                    }

                    const showDate = currentFormattedDate !== lastFormattedDate;
                    lastFormattedDate = currentFormattedDate;
                    lastRawDate = currentRawDate;

                    const safeProducto = (reg.producto || '').replace(/'/g, "\\'").replace(/"/g, "&quot;");
                    const safeCuenta = (reg.cuenta || '').replace(/'/g, "\\'").replace(/"/g, "&quot;");
                    const safeObservacion = (reg.observacion || '').replace(/'/g, "\\'").replace(/"/g, "&quot;");
                    const safePrecioEspecial = (reg.precioEspecial || '').toString();

                    const trExcel = document.createElement('tr');
                    if (rowStyle) trExcel.style.cssText = rowStyle;
                    
                    const excelQty = isFullyFacturado 
                        ? `<span style="text-decoration: line-through; color: #7f8c8d;">${reg.cantidad}</span>` 
                        : `${reg.cantidad}`;

                    trExcel.innerHTML = `
                        <td style="border: 1px solid #d4d4d4; padding: 8px; text-align: center; vertical-align: top; color: ${isFullyFacturado ? '#27ae60' : '#333'}; cursor: pointer;" ondblclick="RegistrosApp.editExcelCell(this, '${reg.id}', 'fecha', '${reg.fecha}')" title="Doble clic para editar">${showDate ? currentFormattedDate : ''}</td>
                        <td style="border: 1px solid #d4d4d4; padding: 8px; text-align: center; color: ${isFullyFacturado ? '#27ae60' : '#333'}; cursor: pointer;" ondblclick="RegistrosApp.editExcelCell(this, '${reg.id}', 'cantidad', '${reg.cantidad}')" title="Doble clic para editar">${excelQty}</td>
                        <td style="border: 1px solid #d4d4d4; padding: 8px; color: ${isFullyFacturado ? '#27ae60' : '#333'}; cursor: pointer;" ondblclick="RegistrosApp.editExcelCell(this, '${reg.id}', 'producto', '${safeProducto}')" title="Doble clic para editar">
                            <div>
                                <span>${reg.producto}</span>
                                ${pillsHtml ? `<div style="margin-top: 2px; display: flex; flex-wrap: wrap; gap: 4px;">${pillsHtml}</div>` : ''}
                            </div>
                        </td>
                        <td style="border: 1px solid #d4d4d4; padding: 8px; color: ${isFullyFacturado ? '#27ae60' : '#333'}; font-weight: bold; cursor: pointer;" ondblclick="RegistrosApp.editExcelCell(this, '${reg.id}', 'cuenta', '${safeCuenta}')" title="Doble clic para editar">${reg.cuenta || ''}</td>
                        <td style="border: 1px solid #d4d4d4; padding: 8px; color: ${isFullyFacturado ? '#27ae60' : '#333'}; font-weight: bold; cursor: pointer;" ondblclick="RegistrosApp.editExcelCell(this, '${reg.id}', 'precioEspecial', '${safePrecioEspecial}')" title="Doble clic para editar">${reg.precioEspecial ? '$' + parseFloat(reg.precioEspecial).toFixed(2) : ''}</td>
                        <td style="border: 1px solid #d4d4d4; padding: 8px; color: ${isFullyFacturado ? '#27ae60' : '#333'}; cursor: pointer;" ondblclick="RegistrosApp.editExcelCell(this, '${reg.id}', 'observacion', '${safeObservacion}')" title="Doble clic para editar">${reg.observacion || ''}</td>
                    `;
                    excelTbody.appendChild(trExcel);

                    if (index === registrosParaExcel.length - 1) {
                        const trBtnFinal = document.createElement('tr');
                        trBtnFinal.innerHTML = `
                            <td colspan="6" style="border: 1px solid #d4d4d4; padding: 4px; text-align: center; background-color: #fcfcfc;">
                                <button type="button" class="btn" style="background: none; border: 1px dashed #bbb; color: #666; font-size: 12px; padding: 4px 10px; border-radius: 4px; cursor: pointer;" onclick="RegistrosApp.addEmptyRowForDate('${lastRawDate}')">+ Agregar espacio en ${lastFormattedDate}</button>
                            </td>
                        `;
                        excelTbody.appendChild(trBtnFinal);
                    }
                });
            }
        }

        const totalItemsSpan = document.getElementById('total-items');
        if (totalItemsSpan) totalItemsSpan.innerText = totalItems;

        // Render Resumen
        const resumenTbody = document.getElementById('resumen-tbody');
        if (!resumenTbody) return;

        if (Object.keys(resumenMap).length === 0) {
            resumenTbody.innerHTML = `
                <tr id="resumen-empty-state">
                    <td colspan="4" style="text-align: center; padding: 40px 20px; color: #aaa;">
                        <i class="fas fa-chart-bar" style="font-size: 40px; margin-bottom: 10px;"></i>
                        <p>El resumen aparecerá aquí.</p>
                    </td>
                </tr>
            `;
        } else {
            resumenTbody.innerHTML = '';
            const sortedKeys = Object.keys(resumenMap).sort((a, b) => resumenMap[a].name.localeCompare(resumenMap[b].name));
            
            sortedKeys.forEach(key => {
                const total = resumenMap[key].count;
                const facturados = resumenMap[key].countFacturado;
                const disponibles = total - facturados;

                const disponiblesHtml = disponibles > 0 ? `<strong>${disponibles}</strong>` : `<span style="color:#a0aec0;">0</span>`;
                const facturadosHtml = facturados > 0 ? `<span style="color:#27ae60; font-weight:bold;">${facturados}</span>` : `<span style="color:#a0aec0;">0</span>`;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${resumenMap[key].name}</td>
                    <td style="text-align: center;">${disponiblesHtml}</td>
                    <td style="text-align: center; background-color: #f8fff9;">${facturadosHtml}</td>
                    <td style="text-align: center;"><strong>${total}</strong></td>
                `;
                resumenTbody.appendChild(tr);
            });
        }
    },

    async addEmptyRowForDate(rawDateStr) {
        if (!rawDateStr) return;
        try {
            const newDocId = this.registrosRef.doc().id;

            const dataToSet = {
                fecha: rawDateStr,
                cantidad: 1,
                cantidadUsada: 0,
                facturas: [],
                producto: 'Nuevo Registro (Doble clic para editar)',
                cuenta: '',
                observacion: '',
                origen: 'excel',
                archivado: false,
                timestamp: window.firebase.firestore.FieldValue.serverTimestamp()
            };

            await this.registrosRef.doc(newDocId).set(dataToSet);
        } catch (e) {
            console.error("Error agregando fila:", e);
            alert("Error al agregar la fila.");
        }
    },

    editExcelCell(tdElement, docId, field, currentValue) {
        if (tdElement.querySelector('input')) return; // Ya está editando

        let inputType = 'text';
        if (field === 'cantidad') inputType = 'number';
        if (field === 'fecha') inputType = 'date';

        const input = document.createElement('input');
        input.type = inputType;
        input.value = currentValue;
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';
        input.style.padding = '4px';
        input.style.border = '2px solid #3498db';
        input.style.outline = 'none';
        input.style.fontFamily = 'inherit';
        input.style.fontSize = 'inherit';

        tdElement.innerHTML = '';
        tdElement.appendChild(input);
        input.focus();

        const saveChanges = async () => {
            if (input.dataset.saving) return;
            input.dataset.saving = 'true';

            let newValue = input.value;
            if (field === 'cantidad') {
                newValue = parseInt(newValue) || 1;
            }
            if (field === 'fecha' && !newValue) {
                newValue = currentValue; 
            }

            if (newValue.toString() === currentValue.toString()) {
                tdElement.innerHTML = currentValue;
                setTimeout(() => {
                    if (!document.querySelector('#excel-table-tbody input')) {
                        this.renderFastEntryTable();
                    }
                }, 150);
                return;
            }

            tdElement.innerHTML = newValue;

            try {
                const reg = this.allRegistros.find(r => r.id === docId);
                const totalBilled = reg ? (reg.cantidadUsada || 0) : 0;

                if (field === 'cantidad') {
                    if (newValue < totalBilled) {
                        alert(`⚠️ No puedes reducir la cantidad por debajo del total ya facturado (${totalBilled} uds).`);
                        tdElement.innerHTML = currentValue;
                        setTimeout(() => {
                            if (!document.querySelector('#excel-table-tbody input')) {
                                this.renderFastEntryTable();
                            }
                        }, 150);
                        return;
                    }

                    await this.registrosRef.doc(docId).update({ cantidad: newValue });

                    if (reg) reg.cantidad = newValue;

                } else {
                    await this.registrosRef.doc(docId).update({ [field]: newValue });

                    if (reg) reg[field] = newValue;
                }
            } catch (e) {
                console.error("Error actualizando celda:", e);
                const regError = this.allRegistros.find(r => r.id === docId);
                if (regError) regError[field] = currentValue;
                tdElement.innerHTML = currentValue;
            }

            setTimeout(() => {
                if (!document.querySelector('#excel-table-tbody input')) {
                    this.renderFastEntryTable();
                }
            }, 150);
        };

        input.addEventListener('blur', saveChanges);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur();
            } else if (e.key === 'Escape') {
                input.removeEventListener('blur', saveChanges);
                tdElement.innerHTML = currentValue;
                setTimeout(() => {
                    if (!document.querySelector('#excel-table-tbody input')) {
                        this.renderFastEntryTable();
                    }
                }, 150);
            }
        });
    },

    abrirHistorialMes(mesKey, label) {
        document.getElementById('titulo-mes-historial').innerText = label;
        const tbody = document.getElementById('detalle-mes-historial-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        const registrosDelMes = this.allRegistros.filter(r => r.archivado && r.fecha && r.fecha.startsWith(mesKey));
        
        registrosDelMes.sort((a, b) => {
            const diff = this.parseDateToMillis(b.fecha) - this.parseDateToMillis(a.fecha);
            return diff !== 0 ? diff : (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0);
        });

        if (registrosDelMes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: #aaa;">No hay registros para este mes</td></tr>`;
        } else {
            registrosDelMes.forEach(reg => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="border: 1px solid #cbd5e0; text-align: center;">${reg.cantidad}</td>
                    <td style="border: 1px solid #cbd5e0; text-align: center;">${this.formatDate(reg.fecha)}</td>
                    <td style="border: 1px solid #cbd5e0; color: #555;">${reg.producto}</td>
                    <td style="border: 1px solid #cbd5e0; color: #555;">${reg.cuenta || '-'}</td>
                    <td style="border: 1px solid #cbd5e0; color: #555;">${reg.precioEspecial ? '$' + parseFloat(reg.precioEspecial).toFixed(2) : '-'}</td>
                    <td style="border: 1px solid #cbd5e0; color: #555;">Archivado</td>
                `;
                tbody.appendChild(tr);
            });
        }
        
        document.getElementById('modalHistorialMes').style.display = 'flex';
    },

    async cerrarMes() {
        const isRegistroPage = !!document.getElementById('fast-entry-tbody');
        
        let registrosParaArchivar;
        let computedBilledMap = {};
        
        if (isRegistroPage) {
            // Calcular estado de facturación real usando lógica FIFO
            computedBilledMap = this.calculateComputedBilledMap(this.allRegistros);
            
            // En registro.html, allRegistros contiene los respaldos
            // Filtrar los que ya fueron completamente facturados
            registrosParaArchivar = this.allRegistros.filter(r => {
                if (r.archivado) return false;
                const fifoBilled = computedBilledMap[r.id] || 0;
                const clones = this.allClonesMap[r.id] || [];
                const cloneBilled = clones.reduce((sum, c) => c.estado === 'facturado' ? sum + c.cantidad : sum, 0);
                const totalBilled = (fifoBilled + cloneBilled);
                return totalBilled >= r.cantidad;
            });
        } else {
            registrosParaArchivar = this.allRegistros.filter(r => r.estado === 'facturado' && !r.archivado);
        }

        const modal = document.getElementById('modalConsolidacionFlotantes');

        if (!modal) {
            // Comportamiento fallback si no existe el modal
            if (registrosParaArchivar.length === 0) {
                alert("No hay registros facturados listos para archivar.");
                return;
            }
            if (!confirm(`¿Estás seguro de cerrar el mes? Se archivarán ${registrosParaArchivar.length} registros facturados.`)) return;
            
            this.showLoading(true);
            try {
                let batch = this.db.batch();
                let count = 0;
                for (let reg of registrosParaArchivar) {
                    batch.update(this.registrosRef.doc(reg.id), { archivado: true });
                    count++;
                    if (count >= 400) { await batch.commit(); batch = this.db.batch(); count = 0; }
                }
                if (count > 0) await batch.commit();
                alert("Archivado exitoso.");
            } catch(e) { console.error(e); } finally { this.showLoading(false); }
            return;
        }

        // --- LÓGICA DE CIERRE + CONSOLIDACIÓN DE FLOTANTES EN REGISTRO.HTML ---
        this.showLoading(true);
        try {
            this.flotantesParaCierre = {};
            this.registrosParaArchivarCierre = registrosParaArchivar;

            // Agrupar flotantes (aquellos con totalPending > 0)
            for (let reg of this.allRegistros) {
                if (reg.archivado) continue;
                
                let totalPending = 0;
                
                if (isRegistroPage) {
                    const fifoBilled = computedBilledMap[reg.id] || 0;
                    const totalBilled = fifoBilled;
                    totalPending = Math.max(0, reg.cantidad - totalBilled);
                } else {
                    totalPending = (reg.estado === 'pendiente' || !reg.estado) ? reg.cantidad : 0;
                }
                
                if (totalPending > 0) {
                    const clones = this.allClonesMap[reg.id] || [];
                    const pendingClones = clones.filter(c => c.estado === 'pendiente');
                    const dataToGroup = pendingClones.length > 0 ? pendingClones[0] : reg; // Usa el clon pendiente o el registro base
                    
                    if (dataToGroup.productId || dataToGroup.producto) {
                        const stableKey = this.getGroupingKey(dataToGroup) || (dataToGroup.codigoOficial || dataToGroup.producto).replace(/\//g, '-').trim();
                        
                        if (!this.flotantesParaCierre[stableKey]) {
                            this.flotantesParaCierre[stableKey] = {
                                cantidad: 0,
                                registrosCount: 0,
                                producto: dataToGroup.producto || 'Producto',
                                codigoOficial: dataToGroup.codigoOficial || '',
                                respaldoIds: new Set(),
                                clonIds: [],
                                dataReference: dataToGroup
                            };
                        }
                        this.flotantesParaCierre[stableKey].cantidad += totalPending;
                        this.flotantesParaCierre[stableKey].registrosCount += 1;
                        this.flotantesParaCierre[stableKey].respaldoIds.add(reg.id);
                        
                        pendingClones.forEach(c => {
                           this.flotantesParaCierre[stableKey].clonIds.push(c.id);
                        });
                    }
                }
            }

            // Renderizar la tabla UI
            const tbody = document.getElementById('cierre-flotantes-body');
            tbody.innerHTML = '';
            const keys = Object.keys(this.flotantesParaCierre);
            
            if (keys.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#888; padding: 15px;">No hay registros flotantes (pendientes).</td></tr>`;
            } else {
                keys.forEach(k => {
                    const flot = this.flotantesParaCierre[k];
                    tbody.innerHTML += `
                        <tr>
                            <td style="padding:10px; border-bottom:1px solid #eee;">
                                <strong>${flot.codigoOficial}</strong><br>
                                <small>${flot.producto}</small>
                            </td>
                            <td style="padding:10px; border-bottom:1px solid #eee; text-align:center;">
                                <span style="background: #eee; padding: 3px 8px; border-radius: 10px; font-size: 12px;">${flot.registrosCount} regs</span>
                            </td>
                            <td style="padding:10px; border-bottom:1px solid #eee; text-align:center; color:#d35400; font-weight:bold;">
                                ${flot.cantidad}
                            </td>
                            <td style="padding:10px; border-bottom:1px solid #eee; text-align:center;">
                                <input type="number" class="flotante-cierre-input" data-key="${k}" value="${flot.cantidad}" min="0" style="width: 80px; text-align:center; padding:5px;">
                            </td>
                        </tr>
                    `;
                });
            }

            modal.style.display = 'flex';
        } catch(e) {
            console.error(e);
            alert("Error cargando flotantes");
        } finally {
            this.showLoading(false);
        }
    },

    async confirmarCierreMes() {
        if (!confirm("¿Confirmar el cierre mensual? Esto archivará los registros facturados y consolidará tus registros flotantes según lo indicado.")) return;

        const btn = document.getElementById('btn-confirmar-cierre-mes');
        btn.disabled = true;
        btn.innerText = "Procesando...";

        try {
            let batch = this.db.batch();
            let count = 0;

            // 1. Archivar los facturados
            for (let reg of this.registrosParaArchivarCierre) {
                batch.update(this.registrosRef.doc(reg.id), { archivado: true });
                count++;
                if (count >= 400) { await batch.commit(); batch = this.db.batch(); count = 0; }
            }

            // 2. Consolidar Flotantes
            const flotantesInputs = document.querySelectorAll('.flotante-cierre-input');
            const flotantesAConservar = {};
            flotantesInputs.forEach(input => {
                flotantesAConservar[input.getAttribute('data-key')] = parseInt(input.value) || 0;
            });

            const now = new Date();
            // Pone la fecha del primer día del mes actual
            const nextMonth1stDate = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonth1st = nextMonth1stDate.toISOString().split('T')[0];

            for (const key of Object.keys(this.flotantesParaCierre)) {
                const flot = this.flotantesParaCierre[key];
                const aConservar = flotantesAConservar[key] || 0;

                // Archivar registros base sin importar si tienen facturados o no
                for (const respaldoId of flot.respaldoIds) {
                    batch.update(this.registrosRef.doc(respaldoId), { archivado: true });
                    count++;
                    if (count >= 400) { await batch.commit(); batch = this.db.batch(); count = 0; }
                }

                // Crear consolidado nuevo
                if (aConservar > 0) {
                    const newRef = this.registrosRef.doc();
                    const consolidatedData = {
                        ...flot.dataReference,
                        cantidad: aConservar,
                        cantidadUsada: 0,
                        facturas: [],
                        fecha: nextMonth1st,
                        timestamp: nextMonth1stDate,
                        observacion: `(CONSOLIDADO) Flotante del mes anterior.`,
                        archivado: false
                    };

                    delete consolidatedData.id;
                    delete consolidatedData.respaldoId;
                    consolidatedData.estado = 'pendiente'; // BUGFIX: Ensure consolidated items are correctly marked as pending so they can be invoiced!

                    batch.set(newRef, consolidatedData);
                    count++;
                }
            }

            if (count > 0) await batch.commit();

            alert("Cierre de mes y Consolidación exitosos.");
            document.getElementById('modalConsolidacionFlotantes').style.display = 'none';

        } catch (e) {
            console.error(e);
            alert("Error durante la consolidación.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Confirmar Cierre de Mes';
        }
    },

    // Métodos movidos a RegistroController.js

    currentSelectedDate: null,
    facturaItems: [],

    listenToRegistros() {
        if (this.unsubscribe) this.unsubscribe();
        if (this.unsubscribeClones) this.unsubscribeClones();

        const isRegistroPage = !!document.getElementById('fast-entry-tbody');

        if (isRegistroPage) {
            // ====== REGISTRO.HTML: Escucha dual ======
            // Listener 1: REGISTROS_RESPALDO → llena this.allRegistros (datos a mostrar)
            // Listener 2: REGISTROS_SALIDA → llena this.allClonesMap (clones agrupados por respaldoId)

            let respaldoReady = false;
            let clonesReady = false;

            this.unsubscribe = this.registrosRef
                .orderBy('fecha', 'desc')
                .limit(10000)
                .onSnapshot(snapshot => {
                    this.allRegistros = [];
                    this.allClonesMap = {};
                    this._cachedFacturadoHistorico = null;
                    this._cachedRegistrosOrdenadosAsc = null;
                    this._cachedRegistrosOrdenadosDesc = null;
                    this._cachedComputedBilledMap = null;

                    snapshot.forEach(doc => {
                        const data = doc.data();
                        
                        // Auto-corrección en caliente de fechas guardadas erróneamente con año 2006
                        if (data.fecha && data.fecha.startsWith("2006-")) {
                            const nuevaFecha = data.fecha.replace("2006-", "2026-");
                            this.registrosRef.doc(doc.id).update({ fecha: nuevaFecha }).catch(() => {});
                            data.fecha = nuevaFecha;
                        }

                        // BUGFIX: Auto-limpiar respaldoId en registros consolidados del mes anterior.
                        // El cerrarMes copiaba el respaldoId del doc archivado, causando que las
                        // escrituras de facturación/anulación fueran al documento equivocado.
                        if (data.respaldoId && data.observacion && data.observacion.includes('CONSOLIDADO')) {
                            this.registrosRef.doc(doc.id).update({
                                respaldoId: window.firebase.firestore.FieldValue.delete()
                            }).catch(() => {});
                            delete data.respaldoId;
                        }

                        this.allRegistros.push({ id: doc.id, ...data });

                        // Build allClonesMap simulation for backwards compatibility with UI
                        const clonesSimulados = [];
                        
                        // Simulamos clones facturados basados en el array data.facturas
                        (data.facturas || []).forEach(f => {
                            clonesSimulados.push({
                                id: 'simul_' + doc.id + '_' + f.facturaId,
                                estado: 'facturado',
                                cantidad: f.cantidad,
                                numeroFactura: f.numeroFactura,
                                facturaId: f.facturaId,
                                clienteFactura: f.clienteFactura,
                                respaldoId: doc.id
                            });
                        });
                        
                        // Simulamos un clon pendiente con la cantidad libre restante
                        const cantidadUsada = data.cantidadUsada || 0;
                        if (cantidadUsada < data.cantidad) {
                            clonesSimulados.push({
                                id: 'simul_pend_' + doc.id,
                                estado: 'pendiente',
                                cantidad: data.cantidad - cantidadUsada,
                                respaldoId: doc.id
                            });
                        }
                        
                        this.allClonesMap[doc.id] = clonesSimulados;
                    });

                    this._onDualDataReady();
                }, error => {
                    console.error("Error al escuchar REGISTROS:", error);
                });

        } else {
            // ====== SALIDAS.HTML y otras pantallas: Escucha simple de REGISTROS ======
            this.unsubscribe = this.registrosRef
                .orderBy('fecha', 'desc')
                .limit(10000)
                .onSnapshot(snapshot => {
                    this.allRegistros = [];
                    this._cachedFacturadoHistorico = null;
                    this._cachedRegistrosOrdenadosAsc = null;
                    this._cachedRegistrosOrdenadosDesc = null;
                    this._cachedComputedBilledMap = null;
                    snapshot.forEach(doc => {
                        const data = doc.data();

                        // Auto-corrección en caliente de fechas guardadas erróneamente con año 2006
                        if (data.fecha && data.fecha.startsWith("2006-")) {
                            const nuevaFecha = data.fecha.replace("2006-", "2026-");
                            this.registrosRef.doc(doc.id).update({ fecha: nuevaFecha }).catch(() => {});
                            data.fecha = nuevaFecha;
                        }

                        this.allRegistros.push({
                            id: doc.id,
                            ...data
                        });
                    });
                    this.renderDatesList();
                    this.renderFacturacionData();


                    const isEditingExcel = document.querySelector('#excel-table-tbody input');
                    if (!isEditingExcel) {
                        this.renderFastEntryTable();
                    }
                }, error => {
                    console.error("Error al escuchar registros:", error);
                });
        }
    },

    // Método auxiliar invocado cuando ambos listeners de registro.html tienen datos
    _onDualDataReady() {
        this.renderDatesList();
        this.renderFacturacionData();

        const isEditingExcel = document.querySelector('#excel-table-tbody input');
        if (!isEditingExcel) {
            this.renderFastEntryTable();
        }
    },


    renderFacturacionData() {
        const listadoTbody = document.getElementById('fact-listado-tbody');
        const resumenTbody = document.getElementById('fact-resumen-tbody');
        if (!listadoTbody || !resumenTbody) return;

        // Si el historial de facturas aún no se ha cargado por primera vez,
        // mostrar spinners de carga en las tarjetas de facturación en lugar de datos incorrectos
        if (!this.historyLoaded) {
            listadoTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;"><div class="spinner" style="margin:auto; border-top-color:#3498db; width:24px; height:24px;"></div></td></tr>';
            resumenTbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:20px;"><div class="spinner" style="margin:auto; border-top-color:#3498db; width:24px; height:24px;"></div></td></tr>';
            return;
        }

        // 1. Obtener la fecha y el mes de la factura en construcción actual
        const dateInput = document.getElementById('factura-fecha');
        const dateInputVal = dateInput ? dateInput.value : '';
        const mesFacturaActual = dateInputVal ? dateInputVal.substring(0, 7) : new Date().toISOString().substring(0, 7);

        // Código muerto de consolidación por mes eliminado.

        // 3. Tomar TODOS los registros del mes (tanto pendientes como facturados) para aplicar la deducción FIFO
        if (!this._cachedRegistrosOrdenadosAsc) {
            this._cachedRegistrosOrdenadosAsc = [...this.allRegistros].sort((a, b) => {
                const millisA = this.parseDateToMillis(a.fecha);
                const millisB = this.parseDateToMillis(b.fecha);
                
                if (millisA !== millisB) {
                    return millisA - millisB;
                }
                
                const hasFilaA = a.filaExcel !== undefined && a.filaExcel !== null;
                const hasFilaB = b.filaExcel !== undefined && b.filaExcel !== null;
                
                if (hasFilaA && hasFilaB) {
                    return a.filaExcel - b.filaExcel;
                } else if (hasFilaA) {
                    return -1;
                } else if (hasFilaB) {
                    return 1;
                }
                
                let tA = 0;
                if (a.timestamp) {
                    if (typeof a.timestamp.toMillis === 'function') tA = a.timestamp.toMillis();
                    else if (a.timestamp instanceof Date) tA = a.timestamp.getTime();
                    else if (typeof a.timestamp === 'number') tA = a.timestamp;
                }
                let tB = 0;
                if (b.timestamp) {
                    if (typeof b.timestamp.toMillis === 'function') tB = b.timestamp.toMillis();
                    else if (b.timestamp instanceof Date) tB = b.timestamp.getTime();
                    else if (typeof b.timestamp === 'number') tB = b.timestamp;
                }
                return tA - tB;
            });
        }
        
        const todosLosRegistrosMes = this._cachedRegistrosOrdenadosAsc;

        let cacheMap = null;
        if (window.app && window.app.cache) {
            cacheMap = { byId: {}, byName: {} };
            window.app.cache.forEach(p => {
                if (p.id) cacheMap.byId[p.id] = p;
                if (p.descripcion) cacheMap.byName[p.descripcion.toLowerCase().trim()] = p;
            });
        }

        // Calcular los totales originales de los pendientes (para arrastre y límites)
        let resumenMap = {};
        todosLosRegistrosMes.forEach(reg => {
            if (reg.estado === 'facturado') return;
            if (reg.archivado) return; // Ignorar archivados en el total visual
            if (!reg.producto) return;
            const key = this.getGroupingKey(reg);
            const officialName = this.getOfficialProductName(reg);
            
            let currentCosto = reg.costoUnitarioOficial || 0;
            if (currentCosto === 0 && cacheMap) {
                const cachedProduct = (reg.productId && cacheMap.byId[reg.productId]) || 
                                      cacheMap.byName[officialName.toLowerCase().trim()];
                if (cachedProduct) {
                    currentCosto = cachedProduct.costo || 0;
                }
            }
            
            if (!resumenMap[key]) {
                resumenMap[key] = { 
                    name: officialName, 
                    count: 0, 
                    productId: reg.productId || reg.vinculoId || null,
                    codigoOficial: reg.codigoOficial || '',
                    precioVentaOficial: reg.precioVentaOficial || 0,
                    costoUnitarioOficial: currentCosto
                };
            }
            resumenMap[key].count += reg.cantidad;
        });

        listadoTbody.innerHTML = '';
        let hasVisible = false;
        const resumenRestanteMap = {};
        const cuentasMap = {};
        const listadoFragment = document.createDocumentFragment();

        // Calcular cantidades de summary en la factura actual para distribuirlas por FIFO
        let summaryInvoicedMap = {};
        this.facturaItems.forEach(fi => {
            if (fi.type === 'summary') {
                const key = this.getGroupingKey(fi.producto, fi.vinculoId);
                summaryInvoicedMap[key] = (summaryInvoicedMap[key] || 0) + fi.cantidadFacturar;
            }
        });

        // Calcular mapa facturado usando la lógica centralizada
        const computedBilledMap = this.calculateComputedBilledMap(this.allRegistros);

        // 4. Procesar todos los registros aplicando FIFO
        todosLosRegistrosMes.forEach(reg => {
            if (!reg.producto) return;
            const key = this.getGroupingKey(reg);
            const officialName = this.getOfficialProductName(reg);
            
            // Calcular facturado histórico (igual que en renderFastEntryTable y _calculateRealRemaining)
            const fifoBilled = computedBilledMap[reg.id] || 0;
            const clones = this.allClonesMap[reg.id] || [];
            const explicitBilledClones = clones.filter(c => c.estado === 'facturado').reduce((sum, c) => sum + c.cantidad, 0);
            const totalBilledHist = (fifoBilled + explicitBilledClones);
            
            // Determinar cantidad ya cargada explicitamente (type single) en la factura actual
            const factItem = this.facturaItems.find(fi => fi.type === 'single' && fi.originalId === reg.id);
            let cantidadFacturadaExplicit = factItem ? factItem.cantidadFacturar : 0;
            
            let cantidadDisponible = reg.cantidad - totalBilledHist - cantidadFacturadaExplicit;
            if (cantidadDisponible < 0) cantidadDisponible = 0;

            // Si el registro está archivado, su stock restante es fantasma
            if (reg.archivado) {
                cantidadDisponible = 0;
            }

            // Descontar items summary (factura actual) via FIFO después
            let cantidadDesdeSummary = 0;
            if (summaryInvoicedMap[key] > 0) {
                if (cantidadDisponible > 0) {
                    const toTake = Math.min(cantidadDisponible, summaryInvoicedMap[key]);
                    cantidadDesdeSummary = toTake;
                    summaryInvoicedMap[key] -= toTake;
                    cantidadDisponible -= toTake;
                }
            }

            const cantidadEnFacturaActual = cantidadFacturadaExplicit + cantidadDesdeSummary;

            // Acumular la cantidad restante para el Resumen Agrupado
            if ((reg.estado === 'pendiente' || !reg.estado) && !reg.archivado) {
                if (cantidadDisponible > 0 || cantidadEnFacturaActual > 0) {
                    resumenRestanteMap[key] = (resumenRestanteMap[key] || 0) + cantidadDisponible;
                }
            }

            const isFullyUsed = (reg.estado === 'facturado' || cantidadDisponible <= 0);

            if (isFullyUsed || reg.archivado) {
                return; // Ocultar completamente los registros usados o archivados en la pantalla de Salidas
            }

            hasVisible = true;
            const tr = document.createElement('tr');
            
            tr.setAttribute('draggable', 'true');
            let currentCosto = reg.costoUnitarioOficial || 0;
            if (currentCosto === 0 && cacheMap) {
                const cachedProduct = (reg.productId && cacheMap.byId[reg.productId]) || 
                                      cacheMap.byName[officialName.toLowerCase().trim()];
                if (cachedProduct) {
                    currentCosto = cachedProduct.costo || 0;
                }
            }

            const data = { type: 'single', id: reg.id, producto: officialName, max: cantidadDisponible, productId: reg.productId || null, cuenta: reg.cuenta || '', codigoOficial: reg.codigoOficial || '', precioVentaOficial: reg.precioVentaOficial || 0, costoUnitarioOficial: currentCosto, precioEspecial: reg.precioEspecial !== undefined ? reg.precioEspecial : null };

            tr.ondragstart = (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify(data));
                e.dataTransfer.effectAllowed = 'copy';
            };

            tr.onclick = (e) => {
                e.stopPropagation();
                this.addItemToFactura(data);
            };

            const quantityDisplay = cantidadDisponible < reg.cantidad ? `<strong>${cantidadDisponible}</strong> <small>de ${reg.cantidad}</small>` : `<strong>${cantidadDisponible}</strong>`;

            tr.innerHTML = `
                <td>${this.formatDate(reg.fecha)}</td>
                <td>${quantityDisplay}</td>
                <td>${officialName}</td>
            `;

            listadoFragment.appendChild(tr);

            // Acumular por cuenta usando la data procesada
            if ((reg.estado === 'pendiente' || !reg.estado) && cantidadDisponible > 0 && !reg.archivado) {
                if (reg.cuenta) {
                    const c = reg.cuenta.trim();
                    if (c !== '') {
                        if (!cuentasMap[c]) cuentasMap[c] = { items: [], count: 0 };
                        cuentasMap[c].items.push(data);
                        cuentasMap[c].count += cantidadDisponible;
                    }
                }
            }
        });
        listadoTbody.appendChild(listadoFragment);

        if (!hasVisible) {
            listadoTbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color:#999;">No hay registros en este mes.</td></tr>';
        }

        // 4.5. Llenar Tarjeta 1 (Por Cuenta)
        const cuentasTbody = document.getElementById('fact-cuentas-tbody');
        if (cuentasTbody) {
            cuentasTbody.innerHTML = '';
            const cuentasFragment = document.createDocumentFragment();
            const sortedCuentas = Object.keys(cuentasMap).sort();
            
            if (sortedCuentas.length === 0) {
                cuentasTbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color:#999;">No hay cuentas con registros pendientes.</td></tr>';
            } else {
                sortedCuentas.forEach((c, index) => {
                    const cuentaData = cuentasMap[c];
                    const accountRowId = `account-row-${index}`;
                    const isOriginallyExpanded = this.expandedAccounts.has(c);
                    
                    const tr = document.createElement('tr');
                    tr.style.cursor = 'pointer';
                    tr.style.background = '#f8f9fa';
                    tr.setAttribute('data-expanded', isOriginallyExpanded ? 'true' : 'false');
                    
                    tr.onclick = (e) => {
                        e.stopPropagation();
                        // Toggle visibilidad de los detalles
                        const isExpanded = tr.getAttribute('data-expanded') === 'true';
                        
                        if (isExpanded) {
                            this.expandedAccounts.delete(c);
                        } else {
                            this.expandedAccounts.add(c);
                        }

                        const detailsRows = document.querySelectorAll(`.${accountRowId}-detail`);
                        detailsRows.forEach(row => row.style.display = isExpanded ? 'none' : 'table-row');
                        tr.setAttribute('data-expanded', isExpanded ? 'false' : 'true');
                        tr.querySelector('.expand-icon').className = isExpanded ? 'fas fa-chevron-right expand-icon' : 'fas fa-chevron-down expand-icon';
                    };

                    tr.innerHTML = `
                        <td style="font-weight: bold; color: #2c3e50; font-size: 1.05rem;">
                            <i class="fas ${isOriginallyExpanded ? 'fa-chevron-down' : 'fa-chevron-right'} expand-icon" style="color: #a0aec0; margin-right: 8px; width: 15px;"></i>
                            <i class="fas fa-folder-open" style="color: #3498db; margin-right: 5px;"></i> ${c}
                        </td>
                        <td style="text-align: center; vertical-align: middle;"><strong>${cuentaData.count}</strong></td>
                        <td style="text-align: center; vertical-align: middle;">
                            <button class="btn btn-primary btn-add-all" style="padding: 4px 8px; font-size: 12px; background: #3498db; color: white; border: none; border-radius: 4px;">
                                <i class="fas fa-plus"></i> Todos
                            </button>
                        </td>
                    `;

                    const btnAddAll = tr.querySelector('.btn-add-all');
                    btnAddAll.onclick = (e) => {
                        e.stopPropagation();
                        cuentaData.items.forEach(item => this.addItemToFactura(item));
                        const dropzone = document.getElementById('factura-dropzone');
                        if (dropzone) {
                            dropzone.scrollIntoView({ behavior: 'smooth' });
                            dropzone.classList.add('drag-over');
                            setTimeout(() => dropzone.classList.remove('drag-over'), 300);
                        }
                    };

                    cuentasFragment.appendChild(tr);

                    // Filas de Detalles
                    cuentaData.items.forEach(item => {
                        const trDetail = document.createElement('tr');
                        trDetail.className = `${accountRowId}-detail`;
                        trDetail.style.display = isOriginallyExpanded ? 'table-row' : 'none';
                        trDetail.style.background = '#ffffff';
                        trDetail.style.borderLeft = '4px solid #3498db';
                        
                        let priceText = '';
                        let badgeHtml = '';
                        if (item.precioEspecial !== null && item.precioEspecial !== undefined && item.precioEspecial !== "") {
                            priceText = `$${parseFloat(item.precioEspecial).toFixed(2)}`;
                            badgeHtml = `<span style="font-size: 0.7rem; background: #c6f6d5; color: #22543d; padding: 2px 4px; border-radius: 4px; margin-left: 6px; font-weight: bold;">PRECIO ASIGNADO</span>`;
                        } else {
                            const costo = parseFloat(item.costoUnitarioOficial || 0);
                            priceText = `$${costo.toFixed(2)}`;
                            badgeHtml = `<span style="font-size: 0.7rem; background: #fed7d7; color: #822727; padding: 2px 4px; border-radius: 4px; margin-left: 6px; font-weight: bold;">PRECIO DE COSTO (+IVA)</span>`;
                        }

                        trDetail.innerHTML = `
                            <td colspan="2" style="padding-left: 35px; padding-top: 10px; padding-bottom: 10px; border-bottom: 1px solid #f1f1f1; cursor: pointer;">
                                <div style="font-size: 0.95rem; color: #2d3748; margin-bottom: 4px;">${item.producto}</div>
                                <div style="display: flex; align-items: center;">
                                    <span style="font-weight: bold; color: #2c3e50; font-size: 0.95rem;">${priceText}</span>
                                    ${badgeHtml}
                                </div>
                            </td>
                            <td style="text-align: center; vertical-align: middle; border-bottom: 1px solid #f1f1f1; cursor: pointer;">
                                <span style="font-weight: bold; background: #edf2f7; color: #4a5568; padding: 4px 8px; border-radius: 4px; border: 1px solid #cbd5e0;">x${item.max}</span>
                            </td>
                        `;
                        
                        trDetail.onclick = (e) => {
                            e.stopPropagation();
                            this.addItemToFactura(item);
                            // Flash effect para feedback visual
                            const originalBg = trDetail.style.background;
                            trDetail.style.background = '#e6fffa';
                            setTimeout(() => trDetail.style.background = originalBg, 200);
                        };

                        cuentasFragment.appendChild(trDetail);
                    });
                });
                cuentasTbody.appendChild(cuentasFragment);
            }
        }

        // 5. Llenar Tarjeta 2 (Resumen Agrupado) con las cantidades reales restantes filtradas
        resumenTbody.innerHTML = '';
        let hasResumen = false;
        const resumenFragment = document.createDocumentFragment();

        const sortedKeys = Object.keys(resumenMap).sort((a, b) => resumenMap[a].name.localeCompare(resumenMap[b].name));

        for (const key of sortedKeys) {
            const prodName = resumenMap[key].name;
            const restante = resumenRestanteMap[key] || 0;
            const total = resumenMap[key].count;

            if (total <= 0 || restante <= 0) continue;

            hasResumen = true;
            const tr = document.createElement('tr');
            
            tr.setAttribute('draggable', 'true');
            tr.style.cursor = 'pointer';
            const data = { type: 'summary', producto: prodName, max: restante, productId: resumenMap[key].productId || null, cuenta: '', codigoOficial: resumenMap[key].codigoOficial || '', precioVentaOficial: resumenMap[key].precioVentaOficial || 0, costoUnitarioOficial: resumenMap[key].costoUnitarioOficial || 0 };

            tr.ondragstart = (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify(data));
                e.dataTransfer.effectAllowed = 'copy';
            };

            tr.onclick = (e) => {
                e.stopPropagation();
                this.addItemToFactura(data);
            };

            tr.innerHTML = `
                <td>${prodName}</td>
                <td><strong>${restante}</strong></td>
            `;
            
            resumenFragment.appendChild(tr);
        }
        resumenTbody.appendChild(resumenFragment);

        if (!hasResumen) {
            resumenTbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:20px; color:#999;">Todo fue asignado a la factura.</td></tr>';
        }
    },

    allowDrop(e) {
        e.preventDefault();
        document.getElementById('factura-dropzone').style.backgroundColor = '#ecf0f1';
    },

    dragLeave(e) {
        e.currentTarget.style.backgroundColor = '#fafbfc';
        e.currentTarget.style.borderColor = '#bdc3c7';
    },

    // Calcula en tiempo real cuántas unidades reales quedan disponibles para un producto
    // Replica la lógica FIFO de renderFacturacionData() para obtener el restante actualizado
    _calculateRealRemaining(productKey, type, specificRegId) {
        // Obtener registros ordenados ascendentemente (más antiguos primero)
        const registrosOrdenados = [...this.allRegistros].sort((a, b) => {
            const millisA = this.parseDateToMillis(a.fecha);
            const millisB = this.parseDateToMillis(b.fecha);
            if (millisA !== millisB) return millisA - millisB;
            const hasFilaA = a.filaExcel !== undefined && a.filaExcel !== null;
            const hasFilaB = b.filaExcel !== undefined && b.filaExcel !== null;
            if (hasFilaA && hasFilaB) return a.filaExcel - b.filaExcel;
            if (hasFilaA) return -1;
            if (hasFilaB) return 1;
            return 0;
        });

        const computedBilledMap = this.calculateComputedBilledMap(this.allRegistros);

        // Reconstruir descuentos de la factura actual (items summary)
        let summaryInvoicedMap = {};
        this.facturaItems.forEach(fi => {
            if (fi.type === 'summary') {
                const key = this.getGroupingKey(fi.producto, fi.vinculoId);
                summaryInvoicedMap[key] = (summaryInvoicedMap[key] || 0) + fi.cantidadFacturar;
            }
        });

        // Para type 'single', contar cuantas veces este registro específico ya está en la factura
        let singleAlreadyInvoiced = 0;
        if (type === 'single' && specificRegId) {
            const singleItem = this.facturaItems.find(fi => fi.type === 'single' && fi.originalId === specificRegId);
            singleAlreadyInvoiced = singleItem ? singleItem.cantidadFacturar : 0;
        }

        let totalRestante = 0;
        let restanteParaRegistroEspecifico = 0;

        registrosOrdenados.forEach(reg => {
            if (!reg.producto) return;
            const key = this.getGroupingKey(reg);
            if (key !== productKey) return;

            // Calcular facturado histórico (igual que en renderFastEntryTable)
            const fifoBilled = computedBilledMap[reg.id] || 0;
            const clones = this.allClonesMap[reg.id] || [];
            const explicitBilledClones = clones.filter(c => c.estado === 'facturado').reduce((sum, c) => sum + c.cantidad, 0);
            const totalBilledHist = (fifoBilled + explicitBilledClones);

            // Descontar items single de la factura actual
            const factItem = this.facturaItems.find(fi => fi.type === 'single' && fi.originalId === reg.id);
            let cantidadFacturadaExplicit = factItem ? factItem.cantidadFacturar : 0;

            let cantidadDisponible = reg.cantidad - totalBilledHist - cantidadFacturadaExplicit;
            if (cantidadDisponible < 0) cantidadDisponible = 0;

            // Si el registro está archivado, su stock restante es fantasma
            if (reg.archivado) {
                cantidadDisponible = 0;
            }

            // Descontar items summary (factura actual) via FIFO después
            let cantidadDesdeSummary = 0;
            if (summaryInvoicedMap[key] > 0) {
                if (cantidadDisponible > 0) {
                    const toTake = Math.min(cantidadDisponible, summaryInvoicedMap[key]);
                    cantidadDesdeSummary = toTake;
                    summaryInvoicedMap[key] -= toTake;
                    cantidadDisponible -= toTake;
                }
            }

            // Solo acumular el restante si el registro no está completamente facturado o archivado
            if ((reg.estado === 'pendiente' || !reg.estado) && !reg.archivado) {
                totalRestante += cantidadDisponible;

                // Para type single, guardar el restante del registro específico
                if (type === 'single' && reg.id === specificRegId) {
                    restanteParaRegistroEspecifico = cantidadDisponible;
                }
            }
        });

        // Para type single devolvemos el restante del registro específico
        // Para type summary devolvemos el total restante global del producto
        return type === 'single' ? restanteParaRegistroEspecifico : totalRestante;
    },

    addItemToFactura(data) {
        try {
            // Check if already in factura
            const incomingKey = this.getGroupingKey(data.producto, data.productId);
            let existingItem = this.facturaItems.find(item => {
                const itemKey = this.getGroupingKey(item.producto, item.vinculoId);
                return itemKey === incomingKey;
            });

            if (existingItem) {
                // Recalcular el restante REAL en tiempo real, sin depender de data.max (que puede ser obsoleto)
                // Si el item en factura ya se convirtió en 'summary' (agrupado), verificamos el inventario global, no el específico de la tarjeta.
                const typeToCheck = existingItem.type === 'summary' ? 'summary' : data.type;
                const realMax = this._calculateRealRemaining(incomingKey, typeToCheck, data.id);
                
                if (realMax > 0) {
                    existingItem.cantidadFacturar += 1;
                    // Si viene un item diferente al que originó la fila, lo convertimos en 'summary'
                    // para que el sistema FIFO distribuya el descuento entre todas las filas coincidentes.
                    if (existingItem.type === 'single' && existingItem.originalId !== data.id) {
                        existingItem.type = 'summary';
                        existingItem.originalId = null;
                    }
                } else {
                    alert('No puedes agregar más. Límite pendiente alcanzado.');
                }
            } else {
                // Para items nuevos, también calcular el restante real
                const realMax = this._calculateRealRemaining(incomingKey, data.type, data.id);
                if (realMax <= 0) {
                    alert('No puedes agregar más. Límite pendiente alcanzado.');
                    return;
                }
                let initialPrice = data.precioVentaOficial || 0;
                let isPrecioAsignado = false;
                
                if (data.precioEspecial !== null && data.precioEspecial !== undefined && data.precioEspecial !== "") {
                    initialPrice = parseFloat(data.precioEspecial);
                    if (isNaN(initialPrice)) initialPrice = 0;
                    isPrecioAsignado = true;
                }

                const newItem = {
                    id: Date.now().toString(),
                    type: data.type,
                    originalId: data.id || null,
                    producto: data.producto,
                    cuenta: data.cuenta || '',
                    cantidadFacturar: 1,
                    max: realMax,
                    vinculoId: data.productId || null,
                    codigoOficial: data.codigoOficial || '',
                    precioUnitario: initialPrice,
                    costoUnitario: data.costoUnitarioOficial || 0,
                    precioAsignado: isPrecioAsignado
                };
                this.facturaItems.push(newItem);
                
                // Solo cargar precios del inventario si NO tiene un precio asignado especial
                if (!isPrecioAsignado) {
                    this.loadItemPrices(newItem);
                }
            }

            this.renderFactura();
            this.renderFacturacionData();
        } catch (err) {
            console.error("Error al agregar a la factura:", err);
        }
    },

    addServiceToFactura(serviceName, isManoDeObraPrice = false) {
        try {
            // Buscar si ya existe este servicio en la factura
            let existingItem = this.facturaItems.find(item => item.producto === serviceName && item.isManoDeObra);

            if (existingItem) {
                if (isManoDeObraPrice) {
                    // Solicitar actualización de precio para Mano de Obra
                    const priceStr = prompt(`Ingrese el nuevo monto para ${serviceName} ($):`, existingItem.precioUnitario.toFixed(2));
                    if (priceStr !== null) {
                        const price = parseFloat(priceStr);
                        if (!isNaN(price) && price >= 0) {
                            existingItem.precioUnitario = price;
                        }
                    }
                } else {
                    // Incrementar cantidad para otros servicios
                    existingItem.cantidadFacturar += 1;
                }
            } else {
                let price = 0;
                if (isManoDeObraPrice) {
                    const priceStr = prompt(`Ingrese el monto para ${serviceName} ($):`, "0.00");
                    if (priceStr === null) return; // Cancelado
                    const parsedPrice = parseFloat(priceStr);
                    if (!isNaN(parsedPrice) && parsedPrice >= 0) {
                        price = parsedPrice;
                    }
                }

                const newItem = {
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                    producto: serviceName,
                    cantidadFacturar: 1,
                    max: 999, // Límite virtual alto para servicios
                    vinculoId: null,
                    precioUnitario: price,
                    costoUnitario: 0,
                    isManoDeObra: true
                };
                this.facturaItems.push(newItem);
            }

            this.renderFactura();
            this.renderFacturacionData();
        } catch (err) {
            console.error("Error al agregar servicio:", err);
        }
    },

    async promptCustomService() {
        const { value: serviceName } = await Swal.fire({
            title: 'Nuevo Servicio',
            input: 'text',
            inputLabel: 'Nombre del servicio manual u otro...',
            inputPlaceholder: 'Ej. Reparación de motor...',
            showCancelButton: true,
            confirmButtonText: 'Agregar',
            cancelButtonText: 'Cancelar',
            inputValidator: (value) => {
                if (!value || !value.trim()) {
                    return 'El nombre no puede estar vacío';
                }
            }
        });

        if (serviceName) {
            const nameTrimmed = serviceName.trim();
            let customServices = JSON.parse(localStorage.getItem('custom_workshop_services') || '[]');
            if (!customServices.includes(nameTrimmed)) {
                customServices.push(nameTrimmed);
                localStorage.setItem('custom_workshop_services', JSON.stringify(customServices));
                this.renderSingleCustomService(nameTrimmed);
            } else {
                Swal.fire('Atención', 'Este servicio ya existe en la lista.', 'info');
            }
        }
    },

    loadCustomServices() {
        let customServices = JSON.parse(localStorage.getItem('custom_workshop_services') || '[]');
        customServices.forEach(serviceName => {
            this.renderSingleCustomService(serviceName);
        });
    },

    renderSingleCustomService(serviceName) {
        const tbody = document.getElementById('servicios-list-tbody');
        const rowManoObra = document.getElementById('row-mano-obra');
        if (!tbody || !rowManoObra) return;

        const tr = document.createElement('tr');
        tr.onclick = () => RegistrosApp.addServiceToFactura(serviceName, true);
        
        tr.innerHTML = `
            <td style="font-weight: 500; padding: 12px 10px;"><i class="fas fa-tools" style="color: #3498db; margin-right: 8px;"></i> ${serviceName}</td>
            <td style="text-align: center; padding: 12px 10px;">
                <button class="btn" style="padding: 4px 10px; font-size: 13px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-plus"></i> Agregar
                </button>
            </td>
        `;
        
        tbody.insertBefore(tr, rowManoObra);
    },

    dropToFactura(e) {
        e.preventDefault();
        document.getElementById('factura-dropzone').style.backgroundColor = '#fafbfc';

        const dataStr = e.dataTransfer.getData('text/plain');
        if (!dataStr) return;

        try {
            const data = JSON.parse(dataStr);
            this.addItemToFactura(data);
        } catch (err) {
            console.error("Error al soltar:", err);
        }
    },

    async loadItemPrices(item) {
        const safeId = item.producto.replace(/\//g, '-').trim();
        let currentVinculoId = item.vinculoId;
        let precioEncontrado = false;

        try {
            // 1. Intentar buscar por ID de vínculo en el inventario
            if (currentVinculoId && window.app && window.app.cache) {
                const cachedProduct = window.app.cache.find(p => p.id === currentVinculoId);
                if (cachedProduct) {
                    item.costoUnitario = cachedProduct.costo || 0;
                    item.precioUnitario = cachedProduct.precio || 0;
                    precioEncontrado = true;
                }
            }

            // 2. Si no se encontró en el inventario por ID, buscar en PRECIOS_REGISTROS
            if (!precioEncontrado) {
                const doc = await this.preciosRef.doc(safeId).get();
                if (doc.exists) {
                    const data = doc.data();
                    item.precioUnitario = data.precioNormal || 0;
                    if (data.vinculoId) {
                        item.vinculoId = data.vinculoId;
                        if (window.app && window.app.cache) {
                            const p = window.app.cache.find(c => c.id === data.vinculoId);
                            if (p) item.costoUnitario = p.costo || 0;
                        }
                    }
                    precioEncontrado = true;
                }
            }

            // 3. Si aún no se encuentra, buscar en el inventario usando la caché local (case-insensitive, por nombre, código y alias)
            if (!precioEncontrado) {
                if (!this._inventarioCache) {
                    const snapAll = await this.db.collection('INVENTARIO').get();
                    this._inventarioCache = [];
                    snapAll.forEach(d => this._inventarioCache.push({ id: d.id, ...d.data() }));
                }

                const searchName = item.producto.toLowerCase().trim();
                
                // Función auxiliar para comparar códigos ignorando ceros a la izquierda
                const compareCodes = (code1, code2) => {
                    if (!code1 || !code2) return false;
                    const c1 = code1.toLowerCase().replace(/^0+/, '');
                    const c2 = code2.toLowerCase().replace(/^0+/, '');
                    return (c1 || "0") === (c2 || "0");
                };

                const match = this._inventarioCache.find(p => {
                    const descMatch = p.descripcion && p.descripcion.toLowerCase().trim() === searchName;
                    
                    // Separar el código principal por si tiene múltiples (ej. "AA12 3714")
                    const mainCodes = p.codigo ? p.codigo.split(/[\s,-]+/) : [];
                    const codeMatch = mainCodes.some(c => compareCodes(c, searchName));
                    
                    const officialCodeMatch = item.codigoOficial && p.codigo && compareCodes(p.codigo, item.codigoOficial);
                    
                    const aliasMatch = p.aliases && Array.isArray(p.aliases) && p.aliases.some(alias => compareCodes(alias, searchName));
                    const provMatch = p.codigosProveedor && Array.isArray(p.codigosProveedor) && p.codigosProveedor.some(c => compareCodes(c, searchName));

                    return descMatch || codeMatch || officialCodeMatch || aliasMatch || provMatch;
                });

                if (match) {
                    item.vinculoId = match.id;
                    item.costoUnitario = match.costo || 0;
                    item.precioUnitario = match.precio || 0;
                    precioEncontrado = true;
                }
            }
        } catch (e) {
            console.error("Error buscando precio para", item.producto, e);
        }
        this.renderFactura();
    },

    renderFactura() {
        const tbody = document.getElementById('factura-tbody');
        const dropzone = document.getElementById('factura-dropzone');
        if (!tbody) return;

        dropzone.classList.remove('factura-full');
        dropzone.style.backgroundColor = '#fafbfc'; // Restaurar default

        tbody.innerHTML = '';

        if (this.facturaItems.length === 0) {
            tbody.innerHTML = `
                <tr id="factura-empty-state">
                    <td colspan="5" style="text-align: center; padding: 25px 10px; color: #aaa;">
                        <i class="fas fa-hand-holding-box" style="font-size: 30px; margin-bottom: 8px;"></i>
                        <br><strong style="font-size: 0.9rem;">La factura está vacía</strong><br>
                        <span style="font-size: 0.8rem;">Arrastra los productos aquí</span><br>
                        <small style="font-size: 0.75rem;">(Sin límite de productos)</small>
                    </td>
                </tr>
            `;
            const cardTotalEl = document.getElementById('card-factura-total');
            if (cardTotalEl) cardTotalEl.innerText = "0.00";
            
            const counterEl = document.getElementById('factura-line-counter');
            if (counterEl) {
                counterEl.innerText = `(0 líneas)`;
            }

            this.saveFacturaDraft();
            return;
        }

        let grandTotal = 0;

        this.facturaItems.forEach(item => {
            const total = item.cantidadFacturar * (item.precioUnitario || 0);
            grandTotal += total;

            const isGeneralService = item.isManoDeObra && item.producto !== 'Mano de Obra';
            
            const costoHTML = isGeneralService 
                ? `<span style="color: #cbd5e0; font-size: 14px; font-weight: bold; display: block; text-align: center;">-</span>`
                : `<span style="display: block; text-align: center; color: #2d3748; font-weight: bold; font-size: 0.9rem;">$${(item.costoUnitario || 0).toFixed(2)}</span>`;

            const ventaHTML = isGeneralService 
                ? `<span style="color: #cbd5e0; font-size: 14px; font-weight: bold; display: block; text-align: center;">-</span>`
                : `<input type="number" class="form-control" step="0.01" min="0" value="${(item.precioUnitario || 0).toFixed(2)}" style="width:65px; padding:2px 4px; font-size: 0.85rem;" onchange="RegistrosApp.updateFacturaItemPrice('${item.id}', this.value)">`;

            const totalHTML = isGeneralService
                ? `<span style="color: #cbd5e0; font-size: 14px; font-weight: bold; display: block; text-align: center;">-</span>`
                : `$${total.toFixed(2)}`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 4px;">
                    <input type="number" class="form-control" value="${item.cantidadFacturar}" min="1" max="${item.max}" style="width:50px; padding:2px 4px; text-align: center; font-size: 0.85rem;" onchange="RegistrosApp.updateFacturaItemQty('${item.id}', this.value, ${item.max})">
                </td>
                <td style="font-size: 0.85rem; line-height: 1.2; padding: 4px;">
                    ${item.producto}
                    ${item.isManoDeObra 
                        ? '<div style="font-size:10px; color:#27ae60; font-weight: bold;"><i class="fas fa-tools"></i> Servicio</div>' 
                        : (item.max === 999 
                            ? '<div style="font-size:10px; color:#dd6b20; font-weight: bold;"><i class="fas fa-edit"></i> Libre</div>' 
                            : ''
                          )
                    }
                </td>
                <td style="padding: 4px;">${costoHTML}</td>
                <td style="padding: 4px;">${ventaHTML}</td>
                <td style="font-weight: bold; font-size:0.85rem; text-align: right; padding-right: 5px;">
                    ${totalHTML}
                </td>
                <td style="text-align: center; padding: 4px;">
                    <button class="btn btn-danger" style="padding: 2px 6px; font-size:11px;" onclick="RegistrosApp.removeFacturaItem('${item.id}')">
                        <i class="fas fa-times"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        const cardTotalEl = document.getElementById('card-factura-total');
        if (cardTotalEl) cardTotalEl.innerText = grandTotal.toFixed(2);

        const counterEl = document.getElementById('factura-line-counter');
        if (counterEl) {
            counterEl.innerText = `(${this.facturaItems.length} líneas)`;
        }

        this.saveFacturaDraft();
    },

    updateFacturaItemQty(id, newQty, max) {
        const item = this.facturaItems.find(i => i.id === id);
        if (item) {
            let val = parseInt(newQty);
            if (isNaN(val) || val < 1) val = 1;
            if (val > max) {
                alert('La cantidad no puede superar el inventario pendiente (' + max + ')');
                val = max;
            }
            item.cantidadFacturar = val;
            this.renderFactura();
            this.renderFacturacionData();
        }
    },

    updateFacturaItemPrice(id, newPrice) {
        const item = this.facturaItems.find(i => i.id === id);
        if (item) {
            let val = parseFloat(newPrice);
            if (isNaN(val) || val < 0) val = 0;
            item.precioUnitario = val;
            this.renderFactura();
        }
    },

    removeFacturaItem(id) {
        this.facturaItems = this.facturaItems.filter(i => i.id !== id);
        this.renderFactura();
        this.renderFacturacionData();
    },

    renderDatesList() {
        // Build map of dates and counts
        const dateMap = {};
        this.allRegistros.forEach(reg => {
            const norm = this.normalizeDateStr(reg.fecha);
            if (!norm) return;
            if (!dateMap[norm]) dateMap[norm] = 0;
            dateMap[norm]++;
        });

        // Sort dates descending
        const sortedDates = Object.keys(dateMap).sort((a, b) => {
            return this.parseDateToMillis(b) - this.parseDateToMillis(a);
        });

        const listContainer = document.getElementById('dates-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        if (sortedDates.length === 0) {
            listContainer.innerHTML = '<p style="color:#999; padding:20px; text-align:center;">No hay datos guardados aún.</p>';
            this.currentSelectedDate = null;
        } else {
            // Select first date if none selected or if selected doesn't exist anymore
            if (!this.currentSelectedDate || !dateMap[this.currentSelectedDate]) {
                this.currentSelectedDate = sortedDates[0];
            }

            sortedDates.forEach(dateStr => {
                const btn = document.createElement('button');
                btn.className = `date-btn ${this.currentSelectedDate === dateStr ? 'active' : ''}`;
                btn.innerHTML = `<span><i class="fas fa-calendar-day"></i> ${dateStr}</span> <span class="badge">${dateMap[dateStr]}</span>`;
                btn.onclick = () => {
                    this.currentSelectedDate = dateStr;
                    // Update active classes without full rerender of list
                    document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.renderTable();
                };
                listContainer.appendChild(btn);
            });
        }

        this.renderTable();
    },

    renderTable() {
        const tbody = document.getElementById('registros-tbody');
        if (!tbody) return; // Prevent error if called before DOM is fully ready or modified

        const searchInput = document.getElementById('search-registro');
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        const titleEl = document.getElementById('selected-date-title');

        if (!this.currentSelectedDate) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#7f8d8d;">Selecciona un día</td></tr>';
            if (titleEl) titleEl.innerHTML = `<i class="fas fa-list"></i> Historial`;
            return;
        }

        if (titleEl) titleEl.innerHTML = `<i class="fas fa-list"></i> Historial del día: <span style="color:var(--accent-color)">${this.currentSelectedDate}</span>`;

        tbody.innerHTML = '';

        const computedBilledMap = this.calculateComputedBilledMap(this.allRegistros);

        let filtered = this.allRegistros.filter(reg => {
            const norm = this.normalizeDateStr(reg.fecha);
            if (norm !== this.currentSelectedDate) return false;
            
            // Permitir mostrar registros archivados si ya no están completamente facturados
            if (reg.archivado) {
                const fifoBilled = computedBilledMap[reg.id] || 0;
                const clones = this.allClonesMap[reg.id] || [];
                const explicitBilledClones = clones.filter(c => c.estado === 'facturado').reduce((sum, c) => sum + c.cantidad, 0);
                const totalBilled = (fifoBilled + explicitBilledClones);
                if (totalBilled >= reg.cantidad) return false;
            }

            const matchSearch = reg.producto.toLowerCase().includes(searchTerm) ||
                (reg.cuenta && reg.cuenta.toLowerCase().includes(searchTerm));
            return matchSearch;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#7f8c8d;">No hay registros encontrados</td></tr>';
            return;
        }


        filtered.sort((a, b) => {
            const clonesA = this.allClonesMap[a.id] || [];
            const explicitA = clonesA.filter(c => c.estado === 'facturado').reduce((sum, c) => sum + c.cantidad, 0);
            const billedA = Math.max(computedBilledMap[a.id] || 0, explicitA);
            const aDone = billedA >= a.cantidad;

            const clonesB = this.allClonesMap[b.id] || [];
            const explicitB = clonesB.filter(c => c.estado === 'facturado').reduce((sum, c) => sum + c.cantidad, 0);
            const billedB = Math.max(computedBilledMap[b.id] || 0, explicitB);
            const bDone = billedB >= b.cantidad;

            if (!aDone && bDone) return -1;
            if (aDone && !bDone) return 1;
            return 0;
        });

        filtered.forEach(reg => {
            const tr = document.createElement('tr');
            
            const clones = this.allClonesMap[reg.id] || [];
            const fifoBilled = computedBilledMap[reg.id] || 0;
            const explicitBilledClones = clones.filter(c => c.estado === 'facturado').reduce((sum, c) => sum + c.cantidad, 0);
            
            let totalBilled = (fifoBilled + explicitBilledClones);
            
            const isFullyFacturado = totalBilled >= reg.cantidad;
            const isPartiallyFacturado = totalBilled > 0 && totalBilled < reg.cantidad;

            const statusClass = isFullyFacturado ? 'status-invoiced' : 'status-pending';
            
            let statusText = 'Pendiente';
            if (isFullyFacturado) {
                statusText = 'Facturado';
            } else if (isPartiallyFacturado) {
                statusText = `Parcial (${totalBilled}/${reg.cantidad})`;
            }

            if (isFullyFacturado) {
                tr.style.backgroundColor = '#f1faf5'; // Fondo verde pastel ultra sutil
                tr.style.borderLeft = '4px solid #2ecc71'; // Línea verde viva izquierda para indicador de completado
            } else if (isPartiallyFacturado) {
                tr.style.backgroundColor = '#fffbeb';
                tr.style.borderLeft = '4px solid #f39c12';
            }

            // Botón para recuperar quirúrgicamente registros huérfanos de facturas eliminadas antes
            const revertButtonHTML = isFullyFacturado
                ? `<button class="btn" style="padding:5px 10px; font-size:12px; background:#2ecc71; color:white; border:none; border-radius:4px; margin-right:5px; cursor:pointer;" onclick="RegistrosApp.revertRegistryToPending('${reg.id}')" title="Devolver a Pendiente">
                       <i class="fas fa-undo"></i> Devolver
                   </button>`
                : '';

            const editButtonHTML = !isFullyFacturado
                ? `<button class="btn btn-warning" style="padding:5px 10px; font-size:12px; margin-right:5px; color:white;" onclick="RegistrosApp.editRegistroQuantity('${reg.id}', ${reg.cantidad})" title="Editar Cantidad">
                       <i class="fas fa-edit"></i>
                   </button>`
                : '';

            const obsColor = isFullyFacturado ? '#2e7d32' : '#666';

            const officialName = this.getOfficialProductName(reg);
            
            let codigoText = '';
            const cachedProduct = this._findProductInCache(reg.producto, reg.productId);
            if (cachedProduct && cachedProduct.codigo && cachedProduct.codigo !== 'S/C') {
                codigoText = `<span style="color:#7f8c8d; font-size: 0.9em; margin-right: 5px;">[${cachedProduct.codigo}]</span>`;
            }

            const isLinked = reg.productId ? true : false;

            const productDisplayHTML = isFullyFacturado
                ? `<span>${codigoText}${officialName}</span>`
                : isLinked
                    ? `<span>${codigoText}${officialName}</span> <span style="font-size:11px; color:#3498db; cursor:pointer; margin-left:6px;" onclick="RegistrosApp.openLinkRegistryModal('${reg.id}', '${reg.producto.replace(/'/g, "\\'")}')" title="Editar vínculo con Inventario"><i class="fas fa-edit"></i></span>`
                    : `<span>${codigoText}</span><span style="color:#e67e22;">${reg.producto}</span> <button class="btn" style="padding: 2px 6px; font-size: 11px; margin-left: 8px; border-radius: 4px; border: 1px solid #d35400; color: #d35400; background: #fffcf8; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;" onclick="RegistrosApp.openLinkRegistryModal('${reg.id}', '${reg.producto.replace(/'/g, "\\'")}')"><i class="fas fa-link"></i> Vincular</button>`;

            const qtyDisplay = isFullyFacturado 
                ? `<strong style="text-decoration: line-through; color: #7f8c8d;">${reg.cantidad}</strong>` 
                : `<strong>${reg.cantidad}</strong>`;

            tr.innerHTML = `
                <td>${qtyDisplay}</td>
                <td>${productDisplayHTML}</td>
                <td>${reg.cuenta || '<span style="color:#ccc;">-</span>'}</td>
                <td><span style="font-size:13px; color:${obsColor};">${reg.observacion || ''}</span></td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td style="text-align: center;">
                    ${revertButtonHTML}
                    ${editButtonHTML}
                    <button class="btn btn-danger" style="padding:5px 10px; font-size:12px;" onclick="RegistrosApp.deleteRegistro('${reg.id}')" title="Eliminar este registro">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    async revertRegistryToPending(id) {
        if (await this.confirmDialog('¿Devolver manualmente este producto al estado "Pendiente"? (Volverá a aparecer en la lista para facturar)')) {
            try {
                await this.registrosRef.doc(id).update({
                    estado: 'pendiente',
                    precioFacturado: window.firebase.firestore.FieldValue.delete(),
                    costoFacturado: window.firebase.firestore.FieldValue.delete(),
                    facturaId: window.firebase.firestore.FieldValue.delete(),
                    numeroFactura: window.firebase.firestore.FieldValue.delete(),
                    clienteFactura: window.firebase.firestore.FieldValue.delete()
                });
                alert("✅ Producto devuelto a Pendiente correctamente.");
            } catch (error) {
                console.error("Error al revertir registro:", error);
                alert("Error al restaurar: " + error.message);
            }
        }
    },

    async editRegistroQuantity(id, currentQty) {
        const newQtyStr = prompt("Ingrese la nueva cantidad para este registro flotante:", currentQty);
        if (newQtyStr === null) return;
        const newQty = parseInt(newQtyStr, 10);
        if (isNaN(newQty) || newQty <= 0) {
            alert("Cantidad inválida. Debe ser un número mayor a 0.");
            return;
        }

        try {
            await this.registrosRef.doc(id).update({ cantidad: newQty });
            alert("Cantidad actualizada exitosamente.");
            this.loadRegistros(this.currentSelectedDate);
        } catch (error) {
            console.error("Error al editar cantidad:", error);
            alert("Error al actualizar la cantidad.");
        }
    },

    async deleteRegistro(id) {
        if (await this.confirmDialog('¿Estás seguro de eliminar este registro?')) {
            try {
                await this.registrosRef.doc(id).delete();
            } catch (error) {
                console.error("Error eliminando:", error);
                alert("No se pudo eliminar.");
            }
        }
    },

    async forzarArchivar(id) {
        if (await this.confirmDialog('¿Estás seguro de archivar manualmente este registro parcialmente facturado? Esto lo enviará directamente al Historial Archivado.')) {
            try {
                this.showLoading(true);
                await this.registrosRef.doc(id).update({ archivado: true });
                alert('Registro archivado exitosamente.');
            } catch (e) {
                console.error("Error al archivar registro:", e);
                alert("Error al archivar: " + e.message);
            } finally {
                this.showLoading(false);
            }
        }
    },

    async deleteAllRegistros() {
        if (await this.confirmDialog('⚠️ ¡PELIGRO! ¿Estás seguro de ELIMINAR TODOS los registros de salidas? Esta acción no se puede deshacer.')) {
            this.showLoading(true);
            try {
                // Borrar todos los registros en la colección unificada
                const snapshot = await this.registrosRef.get();
                let batch = this.db.batch();
                let ops = 0;
                snapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                    ops++;
                    if (ops >= 400) {
                        // Idealmente se deberían manejar lotes separados aquí
                    }
                });

                await batch.commit();
                alert('Todos los registros han sido eliminados.');
            } catch (error) {
                console.error("Error eliminando todo:", error);
                alert("Hubo un problema al intentar eliminar todos los registros.");
            } finally {
                this.showLoading(false);
            }
        }
    },

    formatDate(dateStr) {
        return this.normalizeDateStr(dateStr);
    },

    // ==========================================
    // FLUJO PASO A PASO INTEGRADO EN PANTALLA (SIN MODALES)
    // ==========================================
    currentStep: 1,

    nextStep() {
        if (this.currentStep === 1) {
            if (this.facturaItems.length === 0) {
                alert("Debes agregar al menos un repuesto a la factura.");
                return;
            }
            this.goToStep(2);
        } else if (this.currentStep === 2) {
            this.goToBillingStep();
        } else if (this.currentStep === 3) {
            this.finalizeInvoice();
        }
    },

    goToStep(step) {
        this.currentStep = step;

        const cardListado = document.getElementById('card-listado');
        const cardResumen = document.getElementById('card-resumen');
        const cardServicios = document.getElementById('card-servicios-mano-obra');
        const cardPrecios = document.getElementById('card-facturacion-precios');
        const facturaDropzone = document.getElementById('factura-dropzone');

        const btnSiguiente = document.getElementById('btn-siguiente-factura');
        const btnSiguienteText = document.getElementById('btn-siguiente-factura-text');

        // Ocultar todos
        if (cardListado) cardListado.style.display = 'none';
        if (cardResumen) cardResumen.style.display = 'none';
        if (cardServicios) cardServicios.style.display = 'none';
        if (cardPrecios) cardPrecios.style.display = 'none';

        if (step === 1) {
            if (cardListado) cardListado.style.display = 'flex';
            if (cardResumen) cardResumen.style.display = 'flex';
            if (facturaDropzone) facturaDropzone.style.display = 'flex';
            if (btnSiguienteText) btnSiguienteText.innerText = "Siguiente: Servicios";
            if (btnSiguiente) btnSiguiente.style.display = 'flex';
        } else if (step === 2) {
            if (cardServicios) cardServicios.style.display = 'flex';
            if (facturaDropzone) facturaDropzone.style.display = 'flex';
            if (btnSiguienteText) btnSiguienteText.innerText = "Siguiente: Precios";
            if (btnSiguiente) btnSiguiente.style.display = 'flex';

            // Servicios interactivos cargados en facturaDirecta
        } else if (step === 3) {
            if (cardPrecios) cardPrecios.style.display = 'flex';
            if (facturaDropzone) facturaDropzone.style.display = 'none';
            if (btnSiguienteText) btnSiguienteText.innerText = "Finalizar Factura";
            this.loadMonthlyProfitsSummary();
        }
    },

    async openProcessModal() {
        // Redirigir dinámicamente al paso 2 por compatibilidad
        this.nextStep();
    },

    async selectInvoiceType(tipo) {
        this.facturaTipo = tipo;

        const optR = document.getElementById('opt-factura-repuestos');
        const optN = document.getElementById('opt-factura-normal');

        if (tipo === 'repuestos') {
            if (optR) {
                optR.style.borderColor = 'var(--accent-color)';
                optR.style.backgroundColor = '#fff3e0';
            }
            if (optN) {
                optN.style.borderColor = '#ddd';
                optN.style.backgroundColor = 'transparent';
            }
        } else {
            if (optN) {
                optN.style.borderColor = 'var(--primary-color)';
                optN.style.backgroundColor = '#e8f4f8';
            }
            if (optR) {
                optR.style.borderColor = '#ddd';
                optR.style.backgroundColor = 'transparent';
            }
        }

        const section = document.getElementById('invoice-prices-section');
        if (section) section.style.display = 'grid';
        await this.loadPreciosYRenderizar();
    },

    async loadPreciosYRenderizar() {
        const tbody = document.getElementById('invoice-prices-tbody');
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;"><div class="spinner" style="margin: 20px auto; border-top-color: var(--primary-color);"></div><p>Cargando precios...</p></td></tr>';

        for (let item of this.facturaItems) {
            if (item.isManoDeObra) {
                continue; // Saltar carga para servicios/mano de obra
            }
            // Limpiamos el nombre para usarlo como ID en Firebase (evitar barras)
            const safeId = item.producto.replace(/\//g, '-').trim();
            // Preserve vinculoId si viene del escaneo
            let currentVinculoId = item.vinculoId;
            let loadedPrice = 0;
            let precioEncontrado = false;

            try {
                // 1. Si tenemos el vinculoId, cargar directamente de la caché
                if (currentVinculoId && window.app && window.app.cache) {
                    const cachedProduct = window.app.cache.find(p => p.id === currentVinculoId);
                    if (cachedProduct) {
                        item.costoUnitario = cachedProduct.costo || item.costoUnitario || 0;
                        loadedPrice = this.facturaTipo === 'repuestos' ? (cachedProduct.precioRepuestos || cachedProduct.precio || 0) : (cachedProduct.precio || 0);
                        precioEncontrado = true;
                    }
                }

                // 2. Fallback a buscar por nombre en PRECIOS_REGISTROS si no se encontró o no tiene vínculo
                if (!precioEncontrado) {
                    const doc = await this.preciosRef.doc(safeId).get();
                    if (doc.exists) {
                        const data = doc.data();
                        loadedPrice = this.facturaTipo === 'repuestos' ? (data.precioRepuestos || 0) : (data.precioNormal || 0);
                        if (data.vinculoId) {
                            item.vinculoId = data.vinculoId;
                            if (window.app && window.app.cache) {
                                const p = window.app.cache.find(c => c.id === data.vinculoId);
                                if (p) item.costoUnitario = p.costo || item.costoUnitario || 0;
                            } else {
                                const invDoc = await this.db.collection('INVENTARIO').doc(data.vinculoId).get();
                                if (invDoc.exists) item.costoUnitario = invDoc.data().costo || item.costoUnitario || 0;
                            }
                        }
                        precioEncontrado = true;
                    }
                }

                // 3. Fallback a buscar por nombre descriptivo exacto en la caché para el costo (y precio si falta)
                if ((!item.costoUnitario || !precioEncontrado) && window.app && window.app.cache) {
                    const match = window.app.cache.find(p => p.descripcion && p.descripcion.toLowerCase().trim() === item.producto.toLowerCase().trim());
                    if (match) {
                        item.vinculoId = match.id;
                        item.costoUnitario = match.costo || item.costoUnitario || 0;
                        if (!precioEncontrado) {
                            loadedPrice = this.facturaTipo === 'repuestos' ? (match.precioRepuestos || match.precio || 0) : (match.precio || 0);
                            precioEncontrado = true;
                        }
                    }
                }
            } catch (e) {
                console.error("Error buscando precio para", item.producto, e);
            }

            // Si el precio unitario del item es 0, usamos el cargado.
            // Si ya tiene un precio mayor que 0, lo conservamos (ej. editado en Card 3).
            if (!item.precioUnitario || item.precioUnitario === 0) {
                item.precioUnitario = loadedPrice;
            }
        }

        this.renderInvoicePrices();
    },

    renderInvoicePrices() {
        const tbody = document.getElementById('invoice-prices-tbody');
        tbody.innerHTML = '';

        this.facturaItems.forEach((item, index) => {
            const total = item.cantidadFacturar * item.precioUnitario;
            const isService = !!item.isManoDeObra;
            const costoUnitario = item.costoUnitario || 0;
            const gananciaEfectivo = (item.precioUnitario - costoUnitario) * item.cantidadFacturar;

            const vinculoHTML = isService 
                ? `<span style="font-size: 12px; font-weight: bold; color: #00796b; background: #e6fffa; padding: 4px 8px; border-radius: 4px; border: 1px solid #b2f5ea; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-tools"></i> Servicio</span>`
                : `<button class="btn" style="background: #eee; color: #555; padding: 5px 10px; font-size: 12px; border: 1px solid #ccc; width: 100%;">
                       <i class="fas fa-link"></i> ${item.vinculoId ? 'Vinculado' : 'Vincular (Próximamente)'}
                   </button>`;

            const costoHTML = isService 
                ? `<span style="color: #cbd5e0; font-size: 14px;">-</span>`
                : `$${costoUnitario.toFixed(2)}`;

            const precioInputHTML = `<input type="number" class="form-control" step="0.01" min="0" value="${item.precioUnitario.toFixed(2)}"
                        onchange="RegistrosApp.updateItemPrice(${index}, this.value)" style="width: 90px; padding: 6px; font-size: 14px;">`;

            const gananciaHTML = `$<span id="inv-ganancia-${index}">${gananciaEfectivo.toFixed(2)}</span>`;

            const totalSpanHTML = `$<span id="inv-total-${index}">${total.toFixed(2)}</span>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.cantidadFacturar}</strong></td>
                <td style="font-size: 13px; font-weight: 500;">${item.producto}</td>
                <td>
                    ${vinculoHTML}
                </td>
                <td style="font-size: 14px; color: #555;">${costoHTML}</td>
                <td>
                    ${precioInputHTML}
                </td>
                <td style="font-weight: bold; text-align: right; color: ${gananciaEfectivo >= 0 ? 'var(--success-color)' : 'var(--danger-color)'};">
                    ${gananciaHTML}
                </td>
                <td style="font-weight: bold; font-size: 15px; text-align: right;">${totalSpanHTML}</td>
            `;
            tbody.appendChild(tr);
        });

        this.updateInvoiceGrandTotal();
    },

    updateItemPrice(index, newVal) {
        const val = parseFloat(newVal) || 0;
        this.facturaItems[index].precioUnitario = val;
        const item = this.facturaItems[index];
        const total = val * item.cantidadFacturar;
        document.getElementById(`inv-total-${index}`).innerText = total.toFixed(2);

        const gananciaEfectivo = (val - (item.costoUnitario || 0)) * item.cantidadFacturar;
        const gananciaEl = document.getElementById(`inv-ganancia-${index}`);
        if (gananciaEl) {
            gananciaEl.innerText = gananciaEfectivo.toFixed(2);
            gananciaEl.parentElement.style.color = gananciaEfectivo >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
        }

        this.updateInvoiceGrandTotal();
    },

    updateInvoiceGrandTotal() {
        let grandTotal = 0;
        let gananciaProductos = 0;
        let totalManoObra = 0;

        this.facturaItems.forEach(item => {
            const rowTotal = item.cantidadFacturar * item.precioUnitario;
            grandTotal += rowTotal;

            if (item.isManoDeObra) {
                totalManoObra += rowTotal;
            } else {
                const rowGain = (item.precioUnitario - (item.costoUnitario || 0)) * item.cantidadFacturar;
                gananciaProductos += rowGain;
            }
        });

        const elGrandTotal = document.getElementById('invoice-grand-total');
        const elGananciaProd = document.getElementById('invoice-ganancia-productos');
        const elManoObra = document.getElementById('invoice-mano-obra');

        if (elGrandTotal) elGrandTotal.innerText = grandTotal.toFixed(2);
        if (elGananciaProd) elGananciaProd.innerText = gananciaProductos.toFixed(2);
        if (elManoObra) elManoObra.innerText = totalManoObra.toFixed(2);
    },

    async finalizeInvoice() {
        try {
            this.showLoading(true);

            const inputFecha = document.getElementById('factura-fecha');
            const fechaFactura = inputFecha && inputFecha.value ? inputFecha.value : this.getLocalISODate();

            const dObj = new Date(fechaFactura + 'T12:00:00');
            if (dObj.getDay() === 0) {
                alert('⚠️ No se puede guardar una factura con fecha de Domingo. Por favor, cambia la fecha.');
                this.showLoading(false);
                return;
            }
            if (this.mesFacturable && fechaFactura.substring(0, 7) !== this.mesFacturable) {
                alert(`⚠️ Error: La fecha (${fechaFactura}) está fuera del mes de facturación actual (${this.mesFacturable}). No se puede guardar.`);
                this.showLoading(false);
                return;
            }

            const batch = this.db.batch();

            // Si estamos editando, revertir primero los efectos de la factura anterior
            if (this.editingInvoiceId) {
                const oldFactDoc = await this.db.collection('INVENTARIO_SALIDAS').doc(this.editingInvoiceId).get();
                if (oldFactDoc.exists) {
                    const oldData = oldFactDoc.data();
                    const oldItems = oldData.items || [];
                    
                    // Revertir de RESUMEN_SALIDAS_MES
                    oldItems.forEach(item => {
                        const pId = item.productId;
                        if (pId && pId !== 'SERVICIO' && pId !== 'OMITIDO') {
                            const stableKey = this.getGroupingKey(item.descripcionPapel || item.producto, pId);
                            const resumenRef = this.db.collection('RESUMEN_SALIDAS_MES').doc(stableKey);
                            batch.set(resumenRef, {
                                cantidadFacturada: window.firebase.firestore.FieldValue.increment(-item.cantidad)
                            }, { merge: true });
                        }
                    });

                    // Revertir registros diarios a estado 'pendiente' y desvincularlos (Unified DB)
                    const registrosLocales = this.allRegistros.filter(r => r.facturas && r.facturas.some(f => f.facturaId === this.editingInvoiceId));
                    const uniqueRegIds = [...new Set(registrosLocales.map(r => r.respaldoId || r.id))];
                    
                    for (let id of uniqueRegIds) {
                        const originalReg = this.allRegistros.find(r => (r.respaldoId || r.id) === id && !(r.id || '').startsWith('simul_'));
                        if (!originalReg) continue;
                        
                        const facturasToKeep = (originalReg.facturas || []).filter(f => f.facturaId !== this.editingInvoiceId);
                        const removedFacturas = (originalReg.facturas || []).filter(f => f.facturaId === this.editingInvoiceId);
                        const cantidadRestaurar = removedFacturas.reduce((sum, f) => sum + f.cantidad, 0);
                        
                        if (cantidadRestaurar > 0) {
                            batch.update(this.registrosRef.doc(id), {
                                facturas: facturasToKeep,
                                cantidadUsada: window.firebase.firestore.FieldValue.increment(-cantidadRestaurar)
                            });
                            
                            // Sincronizar memoria caché
                            originalReg.facturas = facturasToKeep;
                            originalReg.cantidadUsada = Math.max(0, (originalReg.cantidadUsada || 0) - cantidadRestaurar);
                        }
                    }
                }
            }

            // Generar ID de factura por adelantado para vincular los registros
            const facturaRef = this.editingInvoiceId 
                ? this.db.collection('INVENTARIO_SALIDAS').doc(this.editingInvoiceId)
                : this.db.collection('INVENTARIO_SALIDAS').doc();
            const facturaId = facturaRef.id;

            // Asegurar que activeInvoiceIds reconozca esta factura antes de que se lance el snapshot y la auto-sanación la borre
            if (this.activeInvoiceIds) {
                this.activeInvoiceIds.add(facturaId);
            }

            // Maps para agrupar operaciones y evitar el error "Cannot update the same document twice in a batch"
            const preciosUpdates = new Map();
            const resumenUpdates = new Map();
            const registrosUpdates = new Map();

            // Guardar o actualizar la memoria de precios
            this.facturaItems.forEach(item => {
                if (item.isManoDeObra) return; // Omitir mano de obra en memoria de precios de repuestos
                const safeId = item.producto.replace(/\//g, '-').trim();
                const realDocRef = this.preciosRef.doc(safeId);

                const updateData = {};
                if (this.facturaTipo === 'repuestos') {
                    updateData.precioRepuestos = item.precioUnitario;
                } else {
                    updateData.precioNormal = item.precioUnitario;
                }
                if (item.vinculoId) {
                    updateData.vinculoId = item.vinculoId;
                }

                // Agrupar actualización de precios
                if (!preciosUpdates.has(safeId)) {
                    preciosUpdates.set(safeId, { ref: realDocRef, data: { ...updateData } });
                } else {
                    Object.assign(preciosUpdates.get(safeId).data, updateData);
                }

                // Acumular en RESUMEN_SALIDAS_MES en vez de descontar directamente de INVENTARIO (Inmovilizado)
                if (item.vinculoId) {
                    const stableKey = this.getGroupingKey(item.descripcionPapel || item.producto, item.vinculoId);
                    const resumenRef = this.db.collection('RESUMEN_SALIDAS_MES').doc(stableKey);
                    
                    if (!resumenUpdates.has(stableKey)) {
                        resumenUpdates.set(stableKey, {
                            ref: resumenRef,
                            productId: item.vinculoId,
                            producto: item.producto,
                            cantidadFacturada: item.cantidadFacturar,
                            mes: fechaFactura.substring(0, 7)
                        });
                    } else {
                        resumenUpdates.get(stableKey).cantidadFacturada += item.cantidadFacturar;
                    }
                }
            });

            // Extraer cliente y numero ANTES del FIFO para poder estamparlos en los clones facturados
            const elCliente = document.getElementById('factura-cliente');
            const elNumero = document.getElementById('factura-numero');
            const cliente = elCliente ? (elCliente.value || 'Cliente General') : 'Cliente General';
            const numero = elNumero ? (elNumero.value || '') : '';

            // Pasar registros pendientes a facturado (FIFO) - Limitado al mes de la factura
            const targetMonth = fechaFactura.substring(0, 7);
            let pendientesParaFacturar = this.allRegistros.filter(r => 
                (r.estado === 'pendiente' || !r.estado) && 
                r.fecha && 
                r.fecha.substring(0, 7) === targetMonth
            );
            pendientesParaFacturar.sort((a, b) => this.parseDateToMillis(a.fecha) - this.parseDateToMillis(b.fecha)); // Ordenar por fecha cronológicamente de forma robusta (FIFO)

            this.facturaItems.forEach(item => {
                if (item.isManoDeObra) return; // Omitir Mano de obra del descuento de pendientes
                let cantidadFaltante = item.cantidadFacturar;
                
                const safeItemName = item.producto.toLowerCase().trim();

                for (let i = 0; i < pendientesParaFacturar.length; i++) {
                    let reg = pendientesParaFacturar[i];
                    const regKey = this.getGroupingKey(reg);
                    const itemKey = this.getGroupingKey(item.producto, item.vinculoId);
                    const safeRegName = this.getOfficialProductName(reg).toLowerCase().trim();

                    const matchByKey = (regKey === itemKey);
                    const matchByName = (safeRegName === safeItemName);

                    if (reg.producto && item.producto && (matchByKey || matchByName) && cantidadFaltante > 0) {
                        const cantDisponibleReal = reg.cantidad - (reg.cantidadUsada || 0);
                        if (cantDisponibleReal <= 0) continue;

                        let regRef = this.registrosRef.doc(reg.id);
                        let qtyToConsume = Math.min(cantDisponibleReal, cantidadFaltante);
                        
                        // Agrupar actualización de registros pendientes
                        if (!registrosUpdates.has(reg.id)) {
                            registrosUpdates.set(reg.id, {
                                ref: regRef,
                                cantidadUsada: qtyToConsume,
                                facturas: [{
                                    facturaId: facturaId,
                                    numeroFactura: numero,
                                    clienteFactura: cliente,
                                    precioFacturado: item.precioUnitario,
                                    costoFacturado: item.costoUnitario || 0,
                                    cantidad: qtyToConsume
                                }]
                            });
                        } else {
                            const existing = registrosUpdates.get(reg.id);
                            existing.cantidadUsada += qtyToConsume;
                            existing.facturas.push({
                                facturaId: facturaId,
                                numeroFactura: numero,
                                clienteFactura: cliente,
                                precioFacturado: item.precioUnitario,
                                costoFacturado: item.costoUnitario || 0,
                                cantidad: qtyToConsume
                            });
                        }
                        
                        cantidadFaltante -= qtyToConsume;
                        reg.cantidadUsada = (reg.cantidadUsada || 0) + qtyToConsume; // En memoria para el siguiente loop
                    }
                }
            });

            // --- APLICAR OPERACIONES EN BATCHES (CON LÍMITE DE 400 POR BATCH) ---
            const allBatches = [];
            let currentBatch = this.db.batch();
            let opsCount = 0;

            const pushOp = (callback) => {
                callback(currentBatch);
                opsCount++;
                if (opsCount >= 400) {
                    allBatches.push(currentBatch.commit()); // Ejecutar el batch actual
                    currentBatch = this.db.batch(); // Crear uno nuevo
                    opsCount = 0;
                }
            };

            // Aplicar todas las agrupaciones al sistema de chunking
            preciosUpdates.forEach(update => {
                pushOp(b => b.set(update.ref, update.data, { merge: true }));
            });

            resumenUpdates.forEach(update => {
                pushOp(b => b.set(update.ref, {
                    productId: update.productId,
                    producto: update.producto,
                    cantidadFacturada: window.firebase.firestore.FieldValue.increment(update.cantidadFacturada),
                    mes: update.mes
                }, { merge: true }));
            });

            registrosUpdates.forEach(update => {
                pushOp(b => b.update(update.ref, {
                    cantidadUsada: window.firebase.firestore.FieldValue.increment(update.cantidadUsada),
                    facturas: window.firebase.firestore.FieldValue.arrayUnion(...update.facturas)
                }));
            });

            // Guardar factura en colección INVENTARIO_SALIDAS (Compatible con willianworkshop)
            // NOTA: cliente y numero se extraen al inicio del FIFO más arriba.
            const grandTotal = this.facturaItems.reduce((sum, item) => sum + (item.cantidadFacturar * item.precioUnitario), 0);
            const totalCosto = this.facturaItems.reduce((sum, item) => sum + (item.cantidadFacturar * (item.costoUnitario || 0)), 0);
            const totalManoObra = this.facturaItems.reduce((sum, item) => sum + (item.isManoDeObra ? (item.cantidadFacturar * item.precioUnitario) : 0), 0);
            const totalProductos = grandTotal - totalManoObra;
            const gananciaProductos = totalProductos - totalCosto;
            const gananciaNeta = grandTotal - totalCosto;

            pushOp(b => b.set(facturaRef, {
                CLIENTE: cliente,
                numeroFactura: numero,
                tipo: this.facturaTipo,
                total: grandTotal,
                costoTotal: totalCosto,
                totalManoObra: totalManoObra,
                gananciaProductos: gananciaProductos,
                gananciaNeta: gananciaNeta,
                tieneItemsSinVincular: this.facturaItems.some(i => !i.isManoDeObra && !i.vinculoId),
                fecha: fechaFactura, // formato YYYY-MM-DD (Local)
                timestamp: window.firebase.firestore.FieldValue.serverTimestamp(),
                items: this.facturaItems.map(item => ({
                    descripcionPapel: item.producto, // mapping para compatibilidad
                    cuenta: item.cuenta || '',
                    cantidad: item.cantidadFacturar,
                    precioUnitario: item.precioUnitario,
                    costoUnitario: item.costoUnitario || 0,
                    productId: item.vinculoId || null,
                    codigoOficial: item.codigoOficial || '',
                    isManoDeObra: !!item.isManoDeObra,
                    total: item.cantidadFacturar * item.precioUnitario
                }))
            }));

            // Hacer commit del batch final
            if (opsCount > 0) {
                allBatches.push(currentBatch.commit());
            }

            // Esperar a que se procesen TODOS los batches
            await Promise.all(allBatches);

            // AGREGAR A LA MEMORIA INMEDIATAMENTE PARA EVITAR RACE CONDITIONS CON FIREBASE CACHE
            const localInvoiceData = {
                id: facturaRef.id,
                CLIENTE: cliente,
                numeroFactura: numero,
                tipo: this.facturaTipo,
                total: grandTotal,
                costoTotal: totalCosto,
                totalManoObra: totalManoObra,
                gananciaProductos: gananciaProductos,
                gananciaNeta: gananciaNeta,
                fecha: fechaFactura,
                items: this.facturaItems.map(item => ({
                    descripcionPapel: item.producto,
                    cuenta: item.cuenta || '',
                    cantidad: item.cantidadFacturar,
                    precioUnitario: item.precioUnitario,
                    costoUnitario: item.costoUnitario || 0,
                    productId: item.vinculoId || null,
                    codigoOficial: item.codigoOficial || '',
                    isManoDeObra: !!item.isManoDeObra,
                    total: item.cantidadFacturar * item.precioUnitario
                }))
            };
            if (this.allHistoricalInvoices) {
                this.allHistoricalInvoices = this.allHistoricalInvoices.filter(inv => inv.id !== localInvoiceData.id);
            }
            this.allHistoricalInvoices.push(localInvoiceData);
            // Guardar en buffer local para proteger contra race condition de loadInvoicesHistory
            if (!this._locallyAddedInvoices) this._locallyAddedInvoices = [];
            this._locallyAddedInvoices.push(localInvoiceData);

            this._cachedFacturadoHistorico = null;
            this._cachedComputedBilledMap = null;

            this.showLoading(false);
            alert("¡Factura procesada con éxito! Las existencias actuales en pantalla reflejan el cambio y se guardó para la auditoría.");

            // Si estábamos editando, restaurar la interfaz
            if (this.editingInvoiceId) {
                this.editingInvoiceId = null;
                const btnCancel = document.getElementById('btn-cancel-edit-invoice');
                if (btnCancel) btnCancel.remove();
                
                const btnFinalizar = document.querySelector('button[onclick="RegistrosApp.finalizeInvoice()"]');
                if (btnFinalizar) {
                    btnFinalizar.innerHTML = `<i class="fas fa-check-circle"></i> Finalizar y Guardar Factura`;
                    btnFinalizar.style.backgroundColor = '#27ae60';
                    btnFinalizar.style.boxShadow = '0 4px 6px rgba(39,174,96,0.2)';
                }
            }

            // Regresar al Paso 1 visualmente
            this.goToStep(1);

            // Fetch histórico en background después de un margen de seguridad
            // para que Firestore cache sincronice, manteniendo la memoria local
            // como la fuente de verdad inmediata.
            setTimeout(() => {
                this.loadInvoicesHistory();
            }, 3000);

            // Limpiar factura DESPUÉS de actualizar la UI
            // Esto evita que los repintados locales vacíen la información antes de tiempo.
            this.facturaItems = [];
            this.saveFacturaDraft();
            this.renderFactura();
            document.getElementById('factura-cliente').value = '';
            document.getElementById('factura-numero').value = '';
            
            // Repintar las tablas (Tarjetas 1 y 2) con el inventario actualizado
            this.renderFacturacionData();

        } catch (error) {
            this.showLoading(false);
        }
    },

    async loadMonthlyProfitsSummary() {
        try {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const prefix = `${year}-${month}`; // ej: "2026-05"

            const elNombreMes = document.getElementById('resumen-mes-nombre');
            const mesesNombres = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
            if (elNombreMes) elNombreMes.innerText = mesesNombres[now.getMonth()];

            // Buscar facturas del mes actual
            const snapshot = await this.db.collection('INVENTARIO_SALIDAS')
                .where('fecha', '>=', prefix + '-01')
                .where('fecha', '<=', prefix + '-31')
                .get();

            let totalFacturadoMes = 0;
            let gananciaProductosMes = 0;
            let manoObraMes = 0;

            snapshot.forEach(doc => {
                const data = doc.data();
                const invTotal = typeof data.total === 'number' ? data.total : 0;
                totalFacturadoMes += invTotal;

                if (typeof data.totalManoObra === 'number' && typeof data.gananciaProductos === 'number') {
                    manoObraMes += data.totalManoObra;
                    gananciaProductosMes += data.gananciaProductos;
                } else {
                    // Fallback para facturas ya guardadas antes de esta actualización
                    const items = data.items || [];
                    let rowManoObra = 0;
                    let rowCostoTotal = 0;
                    items.forEach(it => {
                        const isServ = it.isManoDeObra || it.productId === 'SERVICIO' || (it.descripcionPapel && (it.descripcionPapel.toLowerCase().includes('mano de obra') || it.descripcionPapel.toLowerCase().includes('servicio')));
                        const qty = it.cantidad || 0;
                        const price = it.precioUnitario || 0;
                        const cost = it.costoUnitario || 0;
                        const itTotal = qty * price;

                        if (isServ) {
                            rowManoObra += itTotal;
                        } else {
                            rowCostoTotal += (qty * cost);
                        }
                    });

                    manoObraMes += rowManoObra;
                    const rowProdTotal = invTotal - rowManoObra;
                    gananciaProductosMes += (rowProdTotal - rowCostoTotal);
                }
            });

            const elTotalFact = document.getElementById('mes-total-facturado');
            const elGananciaProd = document.getElementById('mes-ganancia-productos');
            const elManoObra = document.getElementById('mes-mano-obra');

            if (elTotalFact) elTotalFact.innerText = totalFacturadoMes.toFixed(2);
            if (elGananciaProd) elGananciaProd.innerText = gananciaProductosMes.toFixed(2);
            if (elManoObra) elManoObra.innerText = manoObraMes.toFixed(2);

            const hTotalFact = document.getElementById('historial-total-facturado');
            const hGananciaProd = document.getElementById('historial-ganancia-productos');
            const hManoObra = document.getElementById('historial-mano-obra');

            if (hTotalFact) hTotalFact.innerText = totalFacturadoMes.toFixed(2);
            if (hGananciaProd) hGananciaProd.innerText = gananciaProductosMes.toFixed(2);
            if (hManoObra) hManoObra.innerText = manoObraMes.toFixed(2);

        } catch (err) {
            console.error("Error al cargar resumen de ganancias del mes:", err);
        }
    },

    async deleteInvoice(facturaId) {
        if (!await this.confirmDialog('⚠️ ¿Estás seguro de ANULAR y ELIMINAR esta factura?\n\nEsto devolverá todos los productos facturados a la lista de "Pendientes" y restará la cantidad del reporte mensual.')) {
            return;
        }

        this.showLoading(true);
        try {
            const batch = this.db.batch();

            // Eliminar de activeInvoiceIds localmente de inmediato para estar sincronizados
            if (this.activeInvoiceIds) {
                this.activeInvoiceIds.delete(facturaId);
            }

            // 1. Obtener los datos de la factura
            const facturaDoc = await this.db.collection('INVENTARIO_SALIDAS').doc(facturaId).get();
            if (!facturaDoc.exists) {
                alert("La factura seleccionada no existe en la base de datos.");
                this.showLoading(false);
                return;
            }

            const facturaData = facturaDoc.data();
            const items = facturaData.items || [];

            // 2. Descontar del RESUMEN_SALIDAS_MES para cada producto de la factura
            items.forEach(item => {
                const pId = item.productId || item.vinculoId;
                if (pId && pId !== 'SERVICIO' && pId !== 'OMITIDO') {
                    const stableKey = this.getGroupingKey(item.descripcionPapel || item.producto, pId);
                    const resumenRef = this.db.collection('RESUMEN_SALIDAS_MES').doc(stableKey);
                    batch.set(resumenRef, {
                        cantidadFacturada: window.firebase.firestore.FieldValue.increment(-item.cantidad)
                    }, { merge: true });
                }
            });

            // 3. Buscar todos los registros unificados que tengan este facturaId para restaurarlos
            const registrosLocales = this.allRegistros.filter(r => r.facturas && r.facturas.some(f => f.facturaId === facturaId));
            // BUGFIX: Usar reg.id (el ID real del documento en Firestore), NO reg.respaldoId
            // porque los registros consolidados del mes anterior tienen un respaldoId que apunta
            // al documento archivado viejo, causando que las escrituras vayan al doc equivocado.
            const uniqueRegIds = [...new Set(registrosLocales.map(r => r.id))];
            
            for (let id of uniqueRegIds) {
                // Find original in memory to get current arrays
                const originalReg = this.allRegistros.find(r => r.id === id && !(r.id || '').startsWith('simul_'));
                if (originalReg) {
                    const facturasToKeep = (originalReg.facturas || []).filter(f => f.facturaId !== facturaId);
                    const removedFacturas = (originalReg.facturas || []).filter(f => f.facturaId === facturaId);
                    const cantidadRestaurar = removedFacturas.reduce((sum, f) => sum + f.cantidad, 0);
                    
                    if (cantidadRestaurar > 0) {
                        batch.update(this.registrosRef.doc(id), {
                            facturas: facturasToKeep,
                            cantidadUsada: window.firebase.firestore.FieldValue.increment(-cantidadRestaurar)
                        });
                    }
                } else {
                    // Fallback to fetch from DB if not in memory (shouldn't happen with allRegistros loaded)
                    const docSnap = await this.registrosRef.doc(id).get();
                    if (docSnap.exists) {
                        const data = docSnap.data();
                        const facturasToKeep = (data.facturas || []).filter(f => f.facturaId !== facturaId);
                        const removedFacturas = (data.facturas || []).filter(f => f.facturaId === facturaId);
                        const cantidadRestaurar = removedFacturas.reduce((sum, f) => sum + f.cantidad, 0);
                        if (cantidadRestaurar > 0) {
                            batch.update(this.registrosRef.doc(id), {
                                facturas: facturasToKeep,
                                cantidadUsada: window.firebase.firestore.FieldValue.increment(-cantidadRestaurar)
                            });
                        }
                    }
                }
            }

            // 4. Eliminar el documento de la factura
            batch.delete(this.db.collection('INVENTARIO_SALIDAS').doc(facturaId));

            await batch.commit();

            // ELIMINAR DE LA MEMORIA INMEDIATAMENTE PARA EVITAR RACE CONDITIONS CON FIREBASE CACHE
            if (this.allHistoricalInvoices) {
                this.allHistoricalInvoices = this.allHistoricalInvoices.filter(inv => inv.id !== facturaId);
            }
            // También eliminar del buffer de facturas locales para que no se re-agregue
            if (this._locallyAddedInvoices) {
                this._locallyAddedInvoices = this._locallyAddedInvoices.filter(inv => inv.id !== facturaId);
            }
            this._cachedFacturadoHistorico = null;
            this._cachedComputedBilledMap = null;
            this.renderFacturacionData(); // Forzar repintado con memoria actualizada

            alert("✅ Factura anulada con éxito. Todos los productos han vuelto a estar Pendientes.");

            const inputNum = document.getElementById('factura-numero');
            if (inputNum) inputNum.value = '';

            // Recargar historial (en background) después de un margen de seguridad
            setTimeout(() => {
                this.loadInvoicesHistory();
            }, 3000);

        } catch (error) {
            console.error("Error al anular la factura:", error);
            alert("Error al anular la factura: " + error.message);
        } finally {
            this.showLoading(false);
        }
    },

    showLoading(show) {
        const el = document.getElementById('loading-overlay') || document.getElementById('salidas-loading');
        if (el) {
            el.style.display = show ? 'flex' : 'none';
        }
    },

    switchTab(tabId, btnElement) {
        // Hide all tab contents
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        // Remove active class from all buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Show selected tab
        document.getElementById(tabId).classList.add('active');
        // Set button as active
        if (btnElement) {
            btnElement.classList.add('active');
        }

        // Si se abre la pestaña de registros, renderizamos por si hubo cambios
        if (tabId === 'tab-registros') {
            this.renderTable();
        }
    },

    switchInnerTab(tabId, btnElement) {
        // Ocultar contenidos de las pestañas internas
        document.querySelectorAll('.inner-tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        // Quitar clase active a los botones internos
        document.querySelectorAll('.inner-tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Mostrar la seleccionada
        document.getElementById('inner-tab-' + tabId).classList.add('active');
        // Activar botón
        if (btnElement) {
            btnElement.classList.add('active');
        }
    },

    openLinkRegistryModal(id, productoName) {
        this.currentLinkContext = 'registry';
        this.currentLinkRegistryId = id;
        this.currentLinkRegistryName = productoName;
        
        const modal = document.getElementById('modalLinkProduct');
        if (!modal) return;
        
        // Configurar flags globales para compatibilidad si InventoryController existe
        if (window.app) {
            window.app.isRegistryLinking = true;
            window.app.currentRegistryId = id;
            window.app.currentRegistryName = productoName;
        }
        
        document.getElementById('link-excel-name').innerText = productoName;
        document.getElementById('link-search-input').value = "";
        
        modal.style.display = 'flex';
        document.getElementById('link-search-input').focus();
        
        // Configurar live search independiente
        const linkInput = document.getElementById('link-search-input');
        if (linkInput) {
            linkInput.onkeyup = (e) => this.searchLinkProduct(e.target.value);
            this.searchLinkProduct("");
        }
    },

    searchLinkProduct(term) {
        const tbody = document.getElementById('link-results-body');
        if (!tbody) return;

        const cleanTerm = term ? term.toLowerCase().trim() : "";
        const cache = (window.app && window.app.cache) ? window.app.cache : [];

        let matches;
        if (!cleanTerm) {
            matches = cache.slice(0, 50);
        } else {
            matches = cache.filter(p =>
                (p.codigo && p.codigo.toLowerCase().includes(cleanTerm)) ||
                (p.descripcion && p.descripcion.toLowerCase().includes(cleanTerm))
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
                    <td><strong>${p.codigo || ''}</strong></td>
                    <td>${p.descripcion || ''}</td>
                    <td>${p.existencia || p.stock || 0}</td>
                    <td>$${p.precio || 0}</td>
                    <td>
                        <button class="btn btn-sm btn-success" onclick="RegistrosApp.selectLinkProduct('${p.id}')">
                            <i class="fas fa-check"></i> Seleccionar
                        </button>
                    </td>
                </tr>
             `;
            tbody.innerHTML += row;
        });
    },

    async selectLinkProduct(productId) {
        if (this.currentLinkContext === 'invoice') {
            await this.selectLinkProductForInvoice(productId);
            return;
        }
        const cache = (window.app && window.app.cache) ? window.app.cache : [];
        const product = cache.find(p => p.id === productId);

        if (!product || !this.currentLinkRegistryId) return;

        if (!await this.confirmDialog(`¿Vincular permanentemente "${this.currentLinkRegistryName}" con el producto "${product.descripcion}"?\n\nEl sistema aprenderá este alias y actualizará todos los registros pendientes con este nombre.`)) return;

        try {
            // Guardar alias en Firestore para el producto (aprender el alias)
            const ref = this.db.collection('INVENTARIO').doc(product.id);
            await ref.update({
                aliases: firebase.firestore.FieldValue.arrayUnion(this.currentLinkRegistryName)
            });

            if (!product.aliases) product.aliases = [];
            product.aliases.push(this.currentLinkRegistryName);

            // Actualizar el registro actual y todos los pendientes iguales
            const batch = this.db.batch();
            
            const isRegistroPage = !!document.getElementById('fast-entry-tbody');
            const unlinkedDesc = this.currentLinkRegistryName;

            // 1. Crear el objeto con la data estática a copiar (Rich Data)
            const updateData = {
                productId: product.id,
                producto: product.descripcion,
                codigoOficial: product.codigo || '',
                precioVentaOficial: product.precio || 0,
                costoUnitarioOficial: product.costo || 0,
                costoSinIvaOficial: product.costoSinIva || 0
            };

            // 2. Actualizar la referencia clickeada directamente (ahora solo unificada)
            batch.update(this.registrosRef.doc(this.currentLinkRegistryId), updateData);

            // 3. Actualizar todos los demás registros con la misma descripción
            const recordsSnap = await this.registrosRef
                .where('producto', '==', unlinkedDesc)
                .get();

            recordsSnap.forEach(doc => {
                if (doc.id === this.currentLinkRegistryId) return;
                batch.update(doc.ref, updateData);
            });

            await batch.commit();

            // Guardar en MAPEO_NOMBRES si el producto tiene código en inventario
            if (product.codigo && product.codigo.trim()) {
                try {
                    const mapeoKey = this.sanitizeForDocId(this.currentLinkRegistryName);
                    await this.mapeoRef.doc(mapeoKey).set({
                        nombreExcel: this.currentLinkRegistryName,
                        codigoInventario: product.codigo.trim(),
                        descripcionInventario: product.descripcion || '',
                        timestamp: window.firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    // Actualizar memoria local para que funcione de inmediato
                    this.mapeoNombres[mapeoKey] = product.codigo.trim();
                    console.log(`Mapeo guardado: "${this.currentLinkRegistryName}" → código "${product.codigo}"`);
                } catch (mapeoErr) {
                    console.error('Error guardando MAPEO_NOMBRES:', mapeoErr);
                }
            }

            alert("✅ Vinculación completada correctamente.");
        } catch (err) {
            console.error("Error vinculando registro:", err);
            alert("Error al vincular: " + err.message);
        }

        // Limpiar flags
        this.currentLinkRegistryId = null;
        this.currentLinkRegistryName = null;

        // Cerrar modal
        const modal = document.getElementById('modalLinkProduct');
        if (modal) modal.style.display = 'none';
    },

    async skipLinkItem() {
        if (!this.currentLinkRegistryId) return;

        const targetName = this.currentLinkRegistryName;
        let isService = false;

        if (await this.confirmDialog(`¿Este ítem "${targetName}" es un SERVICIO (Mano de Obra)?\n\n[SÍ] = Servicio (No descuenta stock)\n[NO] = Omitido (Se ignorará)`)) {
            isService = true;
        }

        try {
            const batch = this.db.batch();
            
            // 1. Actualizar el principal clickeado
            const mainRef = this.registrosRef.doc(this.currentLinkRegistryId);
            batch.update(mainRef, {
                productId: isService ? 'SERVICIO' : 'OMITIDO',
                producto: isService ? 'Mano de Obra / Servicio' : 'Item Omitido'
            });

            // 2. Actualizar todos los demás registros pendientes con el mismo nombre
            const snapshot = await this.registrosRef
                .where('producto', '==', targetName)
                .get();

            snapshot.forEach(doc => {
                if (doc.id !== this.currentLinkRegistryId) {
                    batch.update(doc.ref, {
                        productId: isService ? 'SERVICIO' : 'OMITIDO',
                        producto: isService ? 'Mano de Obra / Servicio' : 'Item Omitido'
                    });
                }
            });

            await batch.commit();
            alert("✅ Vinculación omitida/servicio completada.");
        } catch (err) {
            console.error("Error al omitir:", err);
            alert("Error al omitir: " + err.message);
        }

        const modal = document.getElementById('modalLinkProduct');
        if (modal) modal.style.display = 'none';
    },

    openLinkInvoiceItemModal(facturaId, itemIndex) {
        const inv = this.allHistoricalInvoices.find(i => i.id === facturaId);
        if (!inv) return;
        const item = (inv.items || [])[itemIndex];
        if (!item) return;
        const itemName = item.descripcionPapel || item.producto || '';
        this.currentLinkContext = 'invoice';
        this.currentLinkInvoiceId = facturaId;
        this.currentLinkInvoiceItemIndex = itemIndex;
        this.currentLinkRegistryName = itemName;
        const modal = document.getElementById('modalLinkProduct');
        if (!modal) return;
        document.getElementById('link-excel-name').innerText = itemName;
        document.getElementById('link-search-input').value = '';
        modal.style.display = 'flex';
        document.getElementById('link-search-input').focus();
        const linkInput = document.getElementById('link-search-input');
        if (linkInput) {
            linkInput.onkeyup = (e) => this.searchLinkProduct(e.target.value);
            this.searchLinkProduct('');
        }
    },

    async selectLinkProductForInvoice(productId) {
        const cache = (window.app && window.app.cache) ? window.app.cache : [];
        const product = cache.find(p => p.id === productId);
        if (!product || this.currentLinkInvoiceId === null) return;

        const inv = this.allHistoricalInvoices.find(i => i.id === this.currentLinkInvoiceId);
        const invDate = inv ? (inv.fecha || '') : '';
        const currentMonth = this.getLocalISODate().substring(0, 7);
        const isCurrentMonth = invDate && invDate.startsWith(currentMonth);

        const confirmMsg = isCurrentMonth
            ? `¿Vincular "${this.currentLinkRegistryName}" con "${product.descripcion}"?\n\nSe registrará el descuento en el inventario mensual.`
            : `¿Vincular "${this.currentLinkRegistryName}" con "${product.descripcion}"?\n\nNota: Como esta factura es de un mes anterior (${invDate}), NO se descontará stock del mes actual.`;

        if (!confirm(confirmMsg)) return;

        try {
            const facturaId = this.currentLinkInvoiceId;
            const itemIndex = this.currentLinkInvoiceItemIndex;
            const facturaDoc = await this.db.collection('INVENTARIO_SALIDAS').doc(facturaId).get();
            if (!facturaDoc.exists) { alert('Factura no encontrada.'); return; }
            const items = JSON.parse(JSON.stringify(facturaDoc.data().items || []));
            if (itemIndex < 0 || itemIndex >= items.length) return;
            const cantidad = items[itemIndex].cantidad || 0;
            items[itemIndex] = { ...items[itemIndex], productId: product.id };
            const allLinked = items.every(it =>
                it.isManoDeObra ||
                (it.productId && it.productId !== 'SERVICIO' && it.productId !== 'OMITIDO')
            );
            const batch = this.db.batch();
            batch.update(this.db.collection('INVENTARIO_SALIDAS').doc(facturaId), {
                items: items,
                tieneItemsSinVincular: !allLinked
            });

            if (cantidad > 0 && isCurrentMonth) {
                const stableKey = this.getGroupingKey(product.descripcion, product.id);
                const resRef = this.db.collection('RESUMEN_SALIDAS_MES').doc(stableKey);
                batch.set(resRef, {
                    productId: product.id,
                    producto: product.descripcion,
                    cantidadFacturada: window.firebase.firestore.FieldValue.increment(cantidad),
                    mes: currentMonth
                }, { merge: true });
            }

            await batch.commit();
            const localInv = this.allHistoricalInvoices.find(i => i.id === facturaId);
            if (localInv) { localInv.items = items; localInv.tieneItemsSinVincular = !allLinked; }
            if (product.codigo && product.codigo.trim()) {
                try {
                    const mk = this.sanitizeForDocId(this.currentLinkRegistryName);
                    await this.mapeoRef.doc(mk).set({
                        nombreExcel: this.currentLinkRegistryName,
                        codigoInventario: product.codigo.trim(),
                        descripcionInventario: product.descripcion || '',
                        timestamp: window.firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    this.mapeoNombres[mk] = product.codigo.trim();
                } catch (me) { console.error('MAPEO_NOMBRES error:', me); }
            }

            if (isCurrentMonth) {
                alert('✅ Vinculación completada. El descuento fue registrado.');
            } else {
                alert('✅ Vinculación completada. (Sin descuento por ser mes anterior).');
            }

            this.renderInvoicesHistory(this.allHistoricalInvoices);
            this.viewInvoiceDetail(facturaId);
        } catch (err) {
            console.error('Error vinculando ítem de factura:', err);
            alert('Error al vincular: ' + err.message);
        }
        this.currentLinkContext = 'registry';
        this.currentLinkInvoiceId = null;
        this.currentLinkInvoiceItemIndex = null;
        this.currentLinkRegistryName = null;
        const modal = document.getElementById('modalLinkProduct');
        if (modal) modal.style.display = 'none';
    },

    async deleteOnlyPendingRegistros() {
        const pendientes = this.allRegistros.filter(r => r.estado === 'pendiente' || !r.estado);
        if (pendientes.length === 0) {
            alert("No hay registros pendientes para eliminar.");
            return;
        }

        if (await this.confirmDialog(`⚠️ ¿Estás seguro de eliminar TODOS los ${pendientes.length} registros pendientes en pantalla?\n\nEsta acción eliminará tanto los ingresados manualmente como los de Excel que aún no se hayan facturado.`)) {
            this.showLoading(true);
            try {
                let batch = this.db.batch();
                let operationsCount = 0;

                for (let reg of pendientes) {
                    // Si reg.id es de un clon simulado, obtenemos el respaldoId real
                    const realId = reg.respaldoId || reg.id;
                    const docSnap = await this.registrosRef.doc(realId).get();
                    if (docSnap.exists) {
                        const data = docSnap.data();
                        const facturasCount = (data.facturas && data.facturas.length > 0) ? data.facturas.length : 0;
                        
                        if (facturasCount === 0) {
                            // Nunca facturado: Eliminar completamente
                            batch.delete(this.registrosRef.doc(realId));
                        } else {
                            // Parcialmente facturado: Ajustar cantidad a la cantidadUsada para eliminar la parte pendiente
                            if (data.cantidad > data.cantidadUsada) {
                                batch.update(this.registrosRef.doc(realId), {
                                    cantidad: data.cantidadUsada
                                });
                            }
                        }
                        operationsCount++;
                    }

                    if (operationsCount >= 400) {
                        await batch.commit();
                        batch = this.db.batch();
                        operationsCount = 0;
                    }
                }

                if (operationsCount > 0) {
                    await batch.commit();
                }

                alert("¡Registros pendientes eliminados correctamente!");
            } catch (error) {
                console.error("Error al eliminar registros pendientes:", error);
                alert("Hubo un error al eliminar los registros pendientes: " + error.message);
            } finally {
                this.showLoading(false);
            }
        }
    },

    // ==========================================
    // SECCIÓN DE SERVICIOS, HISTORIAL E IMPORTACIÓN MASIVA
    // ==========================================

    currentHistorialTab: 'list',

    allHistoricalInvoices: [],
    async openInvoicesHistoryModal() {
        if (typeof switchMainTab === 'function') {
            switchMainTab('historial');
        }
    },

    async loadInvoicesHistory() {
        this.loadMonthlyProfitsSummary();
        const tbody = document.getElementById('historial-invoices-tbody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px;"><div class="spinner" style="margin:auto; border-top-color:#3498db;"></div><p style="margin-top:10px; color:#718096;">Cargando historial...</p></td></tr>';
        }

        try {
            const snapshot = await this.db.collection('INVENTARIO_SALIDAS')
                .orderBy('fecha', 'desc')
                .limit(1500)
                .get();

            // Guardar IDs de facturas que ya teníamos en memoria local (podrían no estar aún en Firestore)
            const localInvoiceIds = new Set((this.allHistoricalInvoices || []).map(inv => inv.id));

            this.allHistoricalInvoices = [];
            this._cachedFacturadoHistorico = null;
            this._cachedComputedBilledMap = null;
            const fetchedIds = new Set();
            snapshot.forEach(doc => {
                fetchedIds.add(doc.id);
                this.allHistoricalInvoices.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            // BUGFIX: Re-agregar facturas que existían en memoria local pero que Firestore
            // aún no devolvió (race condition de sincronización de caché).
            // Esto evita que la compuerta "rebote" de regreso a las tarjetas.
            if (this._locallyAddedInvoices && this._locallyAddedInvoices.length > 0) {
                this._locallyAddedInvoices.forEach(localInv => {
                    if (!fetchedIds.has(localInv.id)) {
                        this.allHistoricalInvoices.push(localInv);
                        console.log('[RACE-FIX] Re-agregada factura local no sincronizada:', localInv.id, localInv.numeroFactura);
                    }
                });
                // Limpiar las que ya fueron confirmadas por Firestore
                this._locallyAddedInvoices = this._locallyAddedInvoices.filter(inv => !fetchedIds.has(inv.id));
            }

            this.allHistoricalInvoices.sort((a, b) => {
                const nA = String(a.numeroFactura || '').replace(/\D/g, '');
                const nB = String(b.numeroFactura || '').replace(/\D/g, '');
                const numA = parseInt(nA, 10) || 0;
                const numB = parseInt(nB, 10) || 0;
                if (numA !== numB) {
                    return numB - numA;
                }
                const tA = this.parseDateToMillis(a.fecha);
                const tB = this.parseDateToMillis(b.fecha);
                return tB - tA;
            });

            if (tbody) {
                this.renderInvoicesHistory(this.allHistoricalInvoices);
            }
            this.historyLoaded = true;

            this.renderFacturacionData();

            if (this.allHistoricalInvoices.length > 0) {
                const lastInvoice = this.allHistoricalInvoices[0];
                const lastNumStr = String(lastInvoice.numeroFactura || '').replace(/\D/g, '');
                const lastNum = parseInt(lastNumStr, 10) || 0;
                const nextNum = lastNum > 0 ? lastNum + 1 : '';
                const inputNum = document.getElementById('factura-numero');
                if (inputNum && (!inputNum.value || String(inputNum.value).trim() === '')) {
                    inputNum.value = nextNum;
                }
            }
        } catch (error) {
            console.error("Error al cargar historial:", error);
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#e53e3e;"><i class="fas fa-exclamation-circle"></i> Error al cargar el historial: ' + error.message + '</td></tr>';
        }
    },

    renderInvoicesHistory(invoices) {
        const tbody = document.getElementById('historial-invoices-tbody');
        tbody.innerHTML = '';

        if (invoices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:#718096;"><i class="fas fa-folder-open" style="font-size:30px; margin-bottom:8px;"></i><br>No se encontraron facturas.</td></tr>';
            return;
        }

        invoices.forEach(inv => {
            const dateFormatted = this.formatDate(inv.fecha);
            const totalVal = typeof inv.total === 'number' ? inv.total : 0;
            const typeText = inv.tipo === 'repuestos' ? 'Repuestos' : 'Normal';
            const typeClass = inv.tipo === 'repuestos' ? 'status-pending' : 'status-invoiced';
            const sinVincular = !!inv.tieneItemsSinVincular;
            const alertaBadge = sinVincular
                ? `<span style="display:inline-flex;align-items:center;gap:3px;background:#fed7d7;color:#c53030;border:1px solid #fc8181;border-radius:4px;padding:1px 7px;font-size:11px;font-weight:bold;margin-left:6px;"><i class='fas fa-exclamation-triangle'></i> Sin vincular</span>`
                : '';

            const isChecked = localStorage.getItem(`invoiceChecked_${inv.id}`) === 'true';
            const hasNote = !!localStorage.getItem(`invoiceNote_${inv.id}`);
            const checkIcon = isChecked ? '<i class="fas fa-check-circle" style="font-size:18px; color:#38a169;"></i>' : '<i class="fas fa-circle" style="font-size:18px; color:#cbd5e0;"></i>';
            const rowBg = isChecked ? '#f0fff4' : '';
            const noteIcon = hasNote ? ' <i class="fas fa-sticky-note" title="Tiene nota" style="color: #d69e2e; font-size: 0.9rem; margin-left: 5px;"></i>' : '';

            const tr = document.createElement('tr');
            if (rowBg) tr.style.backgroundColor = rowBg;
            if (sinVincular) tr.style.cssText += 'background:#fff5f5; border-left:4px solid #e53e3e;';
            tr.innerHTML = `
                <td style="padding: 12px; border: 1px solid #edf2f7; text-align: center; cursor: pointer;" onclick="RegistrosApp.toggleInvoiceChecked('${inv.id}', this)">${checkIcon}</td>
                <td style="padding: 12px; border: 1px solid #edf2f7; font-weight: 500;">${dateFormatted}</td>
                <td style="padding: 12px; border: 1px solid #edf2f7; font-weight: 600; color: #2d3748;">${inv.CLIENTE || 'Cliente General'}${alertaBadge}</td>
                <td style="padding: 12px; border: 1px solid #edf2f7; text-align: center; font-family: monospace; font-size: 0.95rem;">${inv.numeroFactura || '<span style="color:#cbd5e0;">-</span>'}${noteIcon}</td>
                <td style="padding: 12px; border: 1px solid #edf2f7; text-align: center;"><span class="status-badge ${typeClass}">${typeText}</span></td>
                <td style="padding: 12px; border: 1px solid #edf2f7; text-align: right; font-weight: bold; color: #2b6cb0;">$${totalVal.toFixed(2)}</td>
                <td style="padding: 12px; border: 1px solid #edf2f7; text-align: center;">
                    <button class="btn" style="background:#3182ce; color:white; padding:6px 12px; font-size:13px; font-weight:bold; border-radius:4px; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:5px;" onclick="RegistrosApp.viewInvoiceDetail('${inv.id}')">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    toggleInvoiceChecked(id, btn) {
        const current = localStorage.getItem(`invoiceChecked_${id}`) === 'true';
        const next = !current;
        localStorage.setItem(`invoiceChecked_${id}`, next ? 'true' : 'false');
        const row = btn.closest('tr');
        if (next) {
            btn.innerHTML = '<i class="fas fa-check-circle" style="font-size:18px; color:#38a169;"></i>';
            if (row) row.style.backgroundColor = '#f0fff4';
        } else {
            btn.innerHTML = '<i class="fas fa-circle" style="font-size:18px; color:#cbd5e0;"></i>';
            if (row) row.style.backgroundColor = '';
        }
    },

    saveInvoiceNote() {
        const id = this.currentViewedInvoiceId;
        if (!id) return;
        const textarea = document.getElementById('invoice-notes-textarea');
        if (!textarea) return;
        if (this._noteSaveTimeout) clearTimeout(this._noteSaveTimeout);
        this._noteSaveTimeout = setTimeout(() => {
            const text = textarea.value.trim();
            if (text) {
                localStorage.setItem(`invoiceNote_${id}`, text);
            } else {
                localStorage.removeItem(`invoiceNote_${id}`);
            }
            const savedMsg = document.getElementById('invoice-note-saved-msg');
            if (savedMsg) {
                savedMsg.style.display = 'block';
                savedMsg.innerText = 'Nota guardada ✔';
                setTimeout(() => { savedMsg.style.display = 'none'; }, 2000);
            }
        }, 500);
    },

    filterInvoicesHistory() {
        const query = document.getElementById('historial-search').value.toLowerCase().trim();
        if (!query) {
            this.renderInvoicesHistory(this.allHistoricalInvoices);
            return;
        }

        const filtered = this.allHistoricalInvoices.filter(inv => {
            const matchCliente = (inv.CLIENTE || '').toLowerCase().includes(query);
            const matchNumero = (inv.numeroFactura || '').toLowerCase().includes(query);
            const matchFecha = (inv.fecha || '').toLowerCase().includes(query);
            return matchCliente || matchNumero || matchFecha;
        });

        this.renderInvoicesHistory(filtered);
    },

    currentViewedInvoiceId: null,

    async editInvoiceDate() {
        const id = this.currentViewedInvoiceId;
        if (!id) return;
        const inv = this.allHistoricalInvoices.find(i => i.id === id);
        if (!inv) return;

        let currentDate = inv.fecha;
        
        if (typeof Swal !== 'undefined') {
            const { value: newDate } = await Swal.fire({
                title: 'Editar Fecha de Factura',
                input: 'date',
                inputValue: currentDate,
                showCancelButton: true,
                confirmButtonColor: '#3498db',
                cancelButtonColor: '#7f8c8d',
                confirmButtonText: 'Guardar',
                cancelButtonText: 'Cancelar',
                customClass: { popup: 'premium-popup' }
            });

            if (newDate && newDate !== currentDate) {
                await this.updateInvoiceDate(id, newDate);
            }
        } else {
            const newDate = prompt("Ingrese la nueva fecha (YYYY-MM-DD):", currentDate);
            if (newDate && newDate !== currentDate) {
                await this.updateInvoiceDate(id, newDate);
            }
        }
    },

    async updateInvoiceDate(id, newDate) {
        this.showLoading(true);
        try {
            const batch = this.db.batch();
            
            // Actualizar la factura
            batch.update(this.db.collection('INVENTARIO_SALIDAS').doc(id), {
                fecha: newDate
            });

            // Actualizar también los registros en REGISTROS_SALIDA si existen
            const registrosSnap = await this.registrosRef.where('facturaId', '==', id).get();
            if (!registrosSnap.empty) {
                registrosSnap.forEach(doc => {
                    batch.update(this.registrosRef.doc(doc.id), {
                        fecha: newDate
                    });
                });
            }

            await batch.commit();

            alert("✅ Fecha actualizada correctamente.");
            
            // Recargar el detalle y la lista
            await this.loadInvoicesHistory();
            this.viewInvoiceDetail(id);
            
        } catch (e) {
            console.error("Error al actualizar la fecha:", e);
            alert("Error al actualizar la fecha: " + e.message);
        } finally {
            this.showLoading(false);
        }
    },

    viewInvoiceDetail(id) {
        const inv = this.allHistoricalInvoices.find(i => i.id === id);
        if (!inv) return;

        this.currentViewedInvoiceId = id;

        document.getElementById('detail-invoice-client').innerText = inv.CLIENTE || 'Cliente General';
        document.getElementById('detail-invoice-number').innerText = inv.numeroFactura || 'Sin número';
        document.getElementById('detail-invoice-date').innerText = this.formatDate(inv.fecha);
        
        const typeText = inv.tipo === 'repuestos' ? 'Repuestos' : 'Normal';
        const typeClass = inv.tipo === 'repuestos' ? 'status-pending' : 'status-invoiced';
        const typeEl = document.getElementById('detail-invoice-type');
        typeEl.innerText = typeText;
        typeEl.className = "status-badge " + typeClass;

        // -------------------------------------------------------------
        // CÁLCULO DINÁMICO DE EXCESO DE FACTURACIÓN PARA EL MES DE ESTA FACTURA
        // -------------------------------------------------------------
        const mesFactura = inv.fecha.substring(0, 7); // ej: "2026-05"
        
        // 1. Obtener registros de ese mes
        const regsDelMes = this.allRegistros.filter(r => r.fecha && r.fecha.startsWith(mesFactura));
        const totalRegistrado = {};
        regsDelMes.forEach(r => {
            const key = this.getGroupingKey(r);
            totalRegistrado[key] = (totalRegistrado[key] || 0) + r.cantidad;
        });

        // 2. Obtener todas las facturas del mes y ordenarlas cronológicamente
        const facturasDelMes = this.allHistoricalInvoices.filter(f => f.fecha && f.fecha.startsWith(mesFactura));
        facturasDelMes.sort((a, b) => {
            const tA = this.parseDateToMillis(a.fecha);
            const tB = this.parseDateToMillis(b.fecha);
            if (tA !== tB) return tA - tB;
            const nA = parseInt(String(a.numeroFactura || '').replace(/\D/g, ''), 10) || 0;
            const nB = parseInt(String(b.numeroFactura || '').replace(/\D/g, ''), 10) || 0;
            return nA - nB;
        });

        // 3. Simular acumulación para identificar excesos
        const acumuladoFacturado = {};
        const excedidoEnFactura = {}; // { facturaId: { key: { esOrigen: boolean, exceso: number } } }
        
        facturasDelMes.forEach(f => {
            excedidoEnFactura[f.id] = {};
            const items = f.items || [];
            items.forEach(item => {
                if (item.isManoDeObra || item.productId === 'SERVICIO') return;
                const key = this.getGroupingKey(item.descripcionPapel || item.producto, item.productId);
                const cant = item.cantidad || 0;
                
                const maxRegistrado = totalRegistrado[key] || 0;
                const previoAcumulado = acumuladoFacturado[key] || 0;
                acumuladoFacturado[key] = previoAcumulado + cant;
                
                if (acumuladoFacturado[key] > maxRegistrado) {
                    const esOrigen = previoAcumulado <= maxRegistrado;
                    const exceso = Math.min(cant, acumuladoFacturado[key] - maxRegistrado);
                    excedidoEnFactura[f.id][key] = {
                        esOrigen: esOrigen,
                        exceso: exceso
                    };
                }
            });
        });

        // 4. Ocultar advertencia de excesos (desactivado por solicitud del usuario)
        const alertContainer = document.getElementById('detail-invoice-alert-container');
        if (alertContainer) {
            alertContainer.innerHTML = '';
            alertContainer.style.display = 'none';
        }
        // -------------------------------------------------------------

        const tbody = document.getElementById('detail-invoice-tbody');
        tbody.innerHTML = '';

        const items = inv.items || [];
        items.forEach((item, itemIdx) => {
            const desc = item.descripcionPapel || item.producto || 'Repuesto';
            const cant = item.cantidad || 0;
            const unit = item.precioUnitario || 0;
            const tot = cant * unit;
            const esServicio = item.isManoDeObra || item.productId === 'SERVICIO' || item.productId === 'OMITIDO';
            const estaVinculado = !esServicio && !!item.productId;
            let estadoHTML = '';
            
            if (esServicio) {
                estadoHTML = `<span style="font-size:10px;color:#00796b;background:#e6fffa;padding:1px 6px;border-radius:3px;margin-left:5px;font-weight:bold;">Servicio</span>`;
            } else if (estaVinculado) {
                // Verificar si tiene alerta de exceso específica
                const key = this.getGroupingKey(desc, item.productId);
                const excesoInfo = excedidoEnFactura[id] && excedidoEnFactura[id][key];
                if (excesoInfo) {
                    const btnEliminarExceso = `<button class="btn btn-danger" style="padding: 2px 6px; font-size: 10px; margin-left: 8px; border-radius: 4px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; font-family: inherit; line-height: 1;" onclick="RegistrosApp.removeInvoiceItemExcess('${id}', ${itemIdx}, '${desc.replace(/'/g, "\\'")}', ${excesoInfo.exceso})" title="Eliminar exceso de este producto"><i class="fas fa-times"></i> Corregir Exceso</button>`;
                    if (excesoInfo.esOrigen) {
                        estadoHTML = `<span style="font-size:10px;color:#e53e3e;background:#fed7d7;padding:2px 6px;border-radius:3px;margin-left:5px;font-weight:bold;"><i class="fas fa-exclamation-triangle"></i> Inicia Exceso (+${excesoInfo.exceso})</span>${btnEliminarExceso}`;
                    } else {
                        estadoHTML = `<span style="font-size:10px;color:#e53e3e;background:#fff5f5;border:1px solid #fc8181;padding:1px 5px;border-radius:3px;margin-left:5px;font-weight:bold;"><i class="fas fa-exclamation-circle"></i> Exceso (+${excesoInfo.exceso})</span>${btnEliminarExceso}`;
                    }
                } else {
                    estadoHTML = `<span style="font-size:10px;color:#276749;background:#f0fff4;padding:1px 6px;border-radius:3px;margin-left:5px;font-weight:bold;"><i class='fas fa-check'></i> Vinculado</span>`;
                }
            } else {
                estadoHTML = `<button class="btn" style="font-size:11px;padding:2px 8px;margin-left:6px;background:#fed7d7;color:#c53030;border:1px solid #fc8181;border-radius:4px;cursor:pointer;" onclick="RegistrosApp.openLinkInvoiceItemModal('${id}',${itemIdx})"><i class='fas fa-link'></i> Vincular</button>`;
            }
            let displayCuenta = item.cuenta || '';
            if (!displayCuenta && !esServicio) {
                // Fallback para facturas antiguas: buscar el registro original en allRegistros
                const regMatch = this.allRegistros.find(r => r.facturaId === id && this.getGroupingKey(r) === this.getGroupingKey(desc, item.productId));
                if (regMatch && regMatch.cuenta) {
                    displayCuenta = regMatch.cuenta;
                }
            }

            const tr = document.createElement('tr');
            if (!esServicio && !estaVinculado) tr.style.backgroundColor = '#fff5f5';
            tr.innerHTML = `
                <td style="text-align: center; border: 1px solid #edf2f7; padding: 8px; font-weight: bold;">${cant}</td>
                <td style="border: 1px solid #edf2f7; padding: 8px; font-size:13px;">${desc}${estadoHTML}</td>
                <td style="border: 1px solid #edf2f7; padding: 8px; font-size:12px; color:#7f8c8d;">${displayCuenta || '-'}</td>
                <td style="text-align: right; border: 1px solid #edf2f7; padding: 8px; color:#555;">$${unit.toFixed(2)}</td>
                <td style="text-align: right; border: 1px solid #edf2f7; padding: 8px; font-weight: bold;">$${tot.toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });

        const totalVal = typeof inv.total === 'number' ? inv.total : 0;
        document.getElementById('detail-invoice-total').innerText = "$" + totalVal.toFixed(2);

        // Cargar nota guardada de esta factura
        const textarea = document.getElementById('invoice-notes-textarea');
        if (textarea) {
            textarea.value = localStorage.getItem(`invoiceNote_${id}`) || '';
        }
        const savedMsg = document.getElementById('invoice-note-saved-msg');
        if (savedMsg) savedMsg.style.display = 'none';

        // Enlazar el botón de anular factura dinámicamente
        const btnAnular = document.getElementById('btn-anular-factura');
        if (btnAnular) {
            btnAnular.onclick = () => {
                document.getElementById('modal-detalle-factura').style.display = 'none';
                RegistrosApp.deleteInvoice(id);
            };
        }

        // Agregar y enlazar el botón de editar factura
        let btnEditar = document.getElementById('btn-editar-factura');
        if (!btnEditar) {
            btnEditar = document.createElement('button');
            btnEditar.id = 'btn-editar-factura';
            btnEditar.className = 'btn';
            btnEditar.style.cssText = 'background: #f39c12; color: white; padding: 10px 20px; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 8px; margin-left: 10px;';
            btnEditar.innerHTML = `<i class="fas fa-edit"></i> Editar Factura`;
            if (btnAnular) {
                btnAnular.after(btnEditar);
            }
        }
        btnEditar.onclick = () => {
            document.getElementById('modal-detalle-factura').style.display = 'none';
            RegistrosApp.startEditingInvoice(id);
        };

        document.getElementById('modal-detalle-factura').style.display = 'flex';
    },

    async removeInvoiceItemExcess(facturaId, itemIndex, itemDesc, cantidadExceso) {
        if (!await this.confirmDialog(`⚠️ ¿Deseas corregir el exceso de "${itemDesc}" en esta factura?\n\nEsto reducirá la cantidad facturada en -${cantidadExceso} unidades para eliminar el desfase y actualizará los reportes automáticamente.`)) {
            return;
        }

        this.showLoading(true);
        try {
            const facturaDocRef = this.db.collection('INVENTARIO_SALIDAS').doc(facturaId);
            const doc = await facturaDocRef.get();
            if (!doc.exists) {
                alert("La factura seleccionada no existe.");
                this.showLoading(false);
                return;
            }

            const data = doc.data();
            const items = data.items || [];
            if (itemIndex < 0 || itemIndex >= items.length) {
                alert("Ítem de factura no encontrado.");
                this.showLoading(false);
                return;
            }

            const item = items[itemIndex];
            const pId = item.productId || item.vinculoId;

            // 1. Calcular nuevas cantidades del item
            const oldCantidad = item.cantidad || 0;
            const newCantidad = oldCantidad - cantidadExceso;

            if (newCantidad <= 0) {
                // Si la cantidad se reduce a 0, se remueve el ítem de la factura
                items.splice(itemIndex, 1);
            } else {
                // Sino, se reduce la cantidad y se recalculan totales del item
                item.cantidad = newCantidad;
                item.total = newCantidad * (item.precioUnitario || 0);
            }

            // 2. Recalcular totales de la factura
            const newGrandTotal = items.reduce((sum, it) => sum + ((it.cantidad || 0) * (it.precioUnitario || 0)), 0);
            const newTotalCosto = items.reduce((sum, it) => sum + ((it.cantidad || 0) * (it.costoUnitario || 0)), 0);
            const newTotalManoObra = items.reduce((sum, it) => sum + (it.isManoDeObra ? ((it.cantidad || 0) * (it.precioUnitario || 0)) : 0), 0);
            const newTotalProductos = newGrandTotal - newTotalManoObra;
            const newGananciaProductos = newTotalProductos - newTotalCosto;
            const newGananciaNeta = newGrandTotal - newTotalCosto;

            const batch = this.db.batch();

            // 3. Si la factura tiene ítems restantes, la actualizamos. Si queda vacía, la eliminamos.
            if (items.length === 0) {
                batch.delete(facturaDocRef);
                // Si eliminamos la factura completa, también limpiamos de activeInvoiceIds
                if (this.activeInvoiceIds) this.activeInvoiceIds.delete(facturaId);
            } else {
                batch.update(facturaDocRef, {
                    items: items,
                    total: newGrandTotal,
                    totalProductos: newTotalProductos,
                    totalCosto: newTotalCosto,
                    gananciaProductos: newGananciaProductos,
                    gananciaNeta: newGananciaNeta
                });
            }

            // 4. Actualizar el acumulador RESUMEN_SALIDAS_MES restando el exceso de forma atómica
            if (pId && pId !== 'SERVICIO' && pId !== 'OMITIDO') {
                const stableKey = this.getGroupingKey(item.descripcionPapel || item.producto, pId);
                const resumenRef = this.db.collection('RESUMEN_SALIDAS_MES').doc(stableKey);
                batch.set(resumenRef, {
                    cantidadFacturada: window.firebase.firestore.FieldValue.increment(-cantidadExceso)
                }, { merge: true });
            }

            await batch.commit();

            // 5. Mostrar confirmación y recargar datos
            alert("✅ Exceso corregido exitosamente.");
            
            // Recargar datos locales del historial y del listener principal
            await this.loadInvoicesHistory();
            
            if (items.length === 0) {
                // Si la factura se eliminó por quedar vacía, cerramos el modal
                document.getElementById('modal-detalle-factura').style.display = 'none';
            } else {
                // Sino, volvemos a abrir el detalle actualizado
                this.viewInvoiceDetail(facturaId);
            }
        } catch (err) {
            console.error("Error al corregir exceso de factura:", err);
            alert("Error al corregir exceso: " + err.message);
        } finally {
            this.showLoading(false);
        }
    },

    prevInvoiceDetail() {
        if (!this.currentViewedInvoiceId) return;
        const idx = this.allHistoricalInvoices.findIndex(inv => inv.id === this.currentViewedInvoiceId);
        if (idx > 0) {
            this.viewInvoiceDetail(this.allHistoricalInvoices[idx - 1].id);
        } else {
            alert("Ya estás en la primera factura de la lista.");
        }
    },

    nextInvoiceDetail() {
        if (!this.currentViewedInvoiceId) return;
        const idx = this.allHistoricalInvoices.findIndex(inv => inv.id === this.currentViewedInvoiceId);
        if (idx >= 0 && idx < this.allHistoricalInvoices.length - 1) {
            this.viewInvoiceDetail(this.allHistoricalInvoices[idx + 1].id);
        } else {
            alert("Ya estás en la última factura de la lista.");
        }
    },

    async printInvoiceDetail(id) {
        const invoiceId = id || this.currentViewedInvoiceId;
        if (!invoiceId) return;

        const inv = this.allHistoricalInvoices.find(i => i.id === invoiceId);
        if (!inv) return;

        if (typeof Swal !== 'undefined') {
            const result = await Swal.fire({
                title: 'Imprimir Factura',
                text: 'Seleccione el formato de impresión para esta factura:',
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#3498db',
                cancelButtonColor: '#7f8c8d',
                denyButtonColor: '#27ae60',
                showDenyButton: true,
                confirmButtonText: '<i class="fas fa-ticket-alt"></i> Ticket de Caja',
                denyButtonText: '<i class="fas fa-file-invoice"></i> Factura Física',
                cancelButtonText: 'Cancelar',
                customClass: { popup: 'premium-popup' }
            });

            if (result.isConfirmed) {
                this.printInvoiceAsTicket(inv);
            } else if (result.isDenied) {
                this.printInvoiceAsRealForm(inv);
            }
        } else {
            const choice = prompt("Seleccione formato de impresión:\n1 - Ticket Térmico\n2 - Factura Física", "1");
            if (choice === "1") {
                this.printInvoiceAsTicket(inv);
            } else if (choice === "2") {
                this.printInvoiceAsRealForm(inv);
            }
        }
    },

    printInvoiceAsTicket(inv) {
        const mappedData = {
            invoiceNumber: inv.numeroFactura || 'S/N',
            timestamp: inv.fecha,
            saldoPendiente: inv.saldoPendiente || 0,
            abonos: inv.abonos || [],
            paymentType: inv.tipo === 'repuestos' ? 'repuestos' : 'normal',
            clientName: inv.CLIENTE || 'Cliente General',
            equipoNumber: inv.CLIENTE || '',
            total: inv.total || 0,
            products: (inv.items || []).map(item => ({
                descripcion: item.descripcionPapel || item.producto || 'Repuesto',
                cantidad: item.cantidad,
                precio: item.precioUnitario
            }))
        };
        PrintingService.printTicket(mappedData);
    },

    printInvoiceAsRealForm(inv) {
        PrintingService.printInvoiceRealForm(inv);
    },

    parsedHistoricalInvoices: [],
    handleHistoricalExcelUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Leer todo el excel como objeto
                const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: null });
                if (rawData.length === 0) {
                    alert("El archivo Excel está vacío.");
                    return;
                }

                // Intentar mapear columnas de forma inteligente
                const mappedRows = [];
                let lastFecha = new Date().toISOString().substring(0, 10);
                let lastFactura = "S-N";

                rawData.forEach(row => {
                    let fecha = "";
                    let cliente = "Cliente General";
                    let factura = "";
                    let producto = "";
                    let cantidad = 1;
                    let precio = 0;

                    // Buscar columnas que coincidan
                    Object.keys(row).forEach(key => {
                        const cleanKey = key.toLowerCase().trim();
                        if (cleanKey.includes("fech") || cleanKey === "date") {
                            let val = row[key];
                            if (val instanceof Date) {
                                fecha = val.toISOString().substring(0, 10);
                            } else if (val && String(val).trim()) {
                                fecha = String(val).trim().substring(0, 10);
                            }
                        } else if (cleanKey.includes("client") || cleanKey === "cuenta" || cleanKey.includes("nombr")) {
                            if (row[key]) cliente = String(row[key]).trim();
                        } else if (cleanKey.includes("fact") || cleanKey.includes("num") || cleanKey.includes("doc")) {
                            if (row[key]) factura = String(row[key]).trim();
                        } else if (cleanKey.includes("prod") || cleanKey.includes("desc") || cleanKey.includes("art") || cleanKey.includes("item")) {
                            if (row[key]) producto = String(row[key]).trim();
                        } else if (cleanKey.includes("cant") || cleanKey === "qty") {
                            if (row[key] !== null && row[key] !== undefined && String(row[key]).trim() !== '') {
                                cantidad = parseFloat(row[key]) || 1;
                            }
                        } else if (cleanKey.includes("prec") || cleanKey.includes("unit") || cleanKey === "val") {
                            if (row[key] !== null && row[key] !== undefined && String(row[key]).trim() !== '') {
                                let pStr = String(row[key]).replace('$', '').trim();
                                precio = parseFloat(pStr) || 0;
                            }
                        }
                    });

                    if (fecha) lastFecha = fecha;
                    else fecha = lastFecha;

                    if (factura) lastFactura = factura;
                    else factura = lastFactura;

                    if (producto) {
                        mappedRows.push({ fecha, cliente, factura, producto, cantidad, precio });
                    }
                });

                if (mappedRows.length === 0) {
                    alert("No se encontraron registros de productos en el Excel. Por favor verifica las columnas.");
                    return;
                }

                // Agrupar filas por Número de Factura + Cliente + Fecha
                const groups = {};
                mappedRows.forEach(row => {
                    const groupKey = (row.factura || "S-N") + "_" + row.cliente + "_" + (row.fecha || "S-F");
                    if (!groups[groupKey]) {
                        groups[groupKey] = {
                            CLIENTE: row.cliente,
                            numeroFactura: row.factura,
                            fecha: row.fecha || new Date().toISOString().substring(0, 10),
                            tipo: "normal",
                            items: []
                        };
                    }
                    
                    const isServicio = row.producto.toLowerCase().includes('mano de obra') || row.producto.toLowerCase().includes('servicio');
                    let matchedProductId = isServicio ? 'SERVICIO' : null;
                    
                    if (!isServicio) {
                        const match = RegistrosApp.findProductByCodigo(row.producto);
                        if (match && match.id) matchedProductId = match.id;
                    }

                    groups[groupKey].items.push({
                        descripcionPapel: row.producto,
                        cantidad: row.cantidad,
                        precioUnitario: row.precio,
                        costoUnitario: 0,
                        productId: matchedProductId,
                        isManoDeObra: isServicio,
                        vinculoId: matchedProductId ? 'AUTO_EXCEL' : null,
                        total: row.cantidad * row.precio
                    });
                });

                // Convertir grupos a lista y calcular totales de factura
                this.parsedHistoricalInvoices = Object.values(groups).map(group => {
                    const total = group.items.reduce((sum, it) => sum + it.total, 0);
                    const tieneSinVincular = group.items.some(i => !i.isManoDeObra && !i.productId);
                    return {
                        ...group,
                        total: total,
                        costoTotal: 0,
                        gananciaNeta: total,
                        tieneItemsSinVincular: tieneSinVincular
                    };
                });

                this.parsedHistoricalInvoices.sort((a, b) => {
                    const nA = String(a.numeroFactura || '').replace(/\D/g, '');
                    const nB = String(b.numeroFactura || '').replace(/\D/g, '');
                    const numA = parseInt(nA, 10) || 0;
                    const numB = parseInt(nB, 10) || 0;
                    if (numA !== numB) {
                        return numB - numA;
                    }
                    const tA = this.parseDateToMillis(a.fecha);
                    const tB = this.parseDateToMillis(b.fecha);
                    return tB - tA;
                });

                // Mostrar resumen de carga
                document.getElementById('import-historical-rows-count').innerText = mappedRows.length;
                document.getElementById('import-historical-invoices-count').innerText = this.parsedHistoricalInvoices.length;
                document.getElementById('import-historical-status').style.display = 'block';

            } catch (err) {
                console.error("Error al leer Excel histórico:", err);
                alert("Ocurrió un error al procesar el archivo Excel: " + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    },

    async finalizeHistoricalExcelImport() {
        if (this.parsedHistoricalInvoices.length === 0) return;

        this.showLoading(true);
        try {
            let batch = this.db.batch();
            let operationsCount = 0;

            for (let inv of this.parsedHistoricalInvoices) {
                const docRef = this.db.collection('INVENTARIO_SALIDAS').doc();
                batch.set(docRef, {
                    ...inv,
                    timestamp: window.firebase.firestore.FieldValue.serverTimestamp()
                });
                operationsCount++;

                // Límite de Firebase Batch de 500 operaciones
                if (operationsCount >= 450) {
                    await batch.commit();
                    batch = this.db.batch();
                    operationsCount = 0;
                }
            }

            if (operationsCount > 0) {
                await batch.commit();
            }

            alert(`¡Carga exitosa! Se han importado ${this.parsedHistoricalInvoices.length} facturas anteriores de manera correcta.`);
            document.getElementById('import-historical-status').style.display = 'none';
            document.getElementById('excel-historical-file').value = '';
            this.parsedHistoricalInvoices = [];
            this.switchHistorialTab('list');

        } catch (error) {
            console.error("Error al subir facturas históricas:", error);
            alert("Hubo un problema al guardar las facturas en la base de datos: " + error.message);
        } finally {
            this.showLoading(false);
        }
    },

    async runBillingAudit() {
        const auditMonthInput = document.getElementById('audit-month-input');
        if (!auditMonthInput || !auditMonthInput.value) {
            alert("Por favor selecciona un mes válido.");
            return;
        }

        const mes = auditMonthInput.value; // ej: "2026-05"
        
        // Calcular el mes anterior para abarcar facturas con desfases de fecha
        const parts = mes.split('-');
        let year = parseInt(parts[0], 10);
        let month = parseInt(parts[1], 10);
        month--;
        if (month === 0) {
            month = 12;
            year--;
        }
        const prevMesStr = `${year}-${String(month).padStart(2, '0')}`;

        const resultsContainer = document.getElementById('audit-results-container');
        if (!resultsContainer) return;

        resultsContainer.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div class="spinner" style="margin: auto; border-top-color: #3498db;"></div>
                <p style="margin-top: 15px; color: #718096; font-weight: bold;">Analizando datos del mes ${mes}...</p>
            </div>
        `;

        try {
            // 1. Consultar facturas del mes
            const invoicesSnap = await this.db.collection('INVENTARIO_SALIDAS')
                .where('fecha', '>=', mes + '-01')
                .where('fecha', '<=', mes + '-31')
                .get();

            const invoices = [];
            invoicesSnap.forEach(doc => {
                invoices.push({ id: doc.id, ...doc.data() });
            });

            // Ordenar facturas cronológicamente
            invoices.sort((a, b) => {
                const tA = this.parseDateToMillis(a.fecha);
                const tB = this.parseDateToMillis(b.fecha);
                if (tA !== tB) return tA - tB;
                const nA = parseInt(String(a.numeroFactura || '').replace(/\D/g, ''), 10) || 0;
                const nB = parseInt(String(b.numeroFactura || '').replace(/\D/g, ''), 10) || 0;
                return nA - nB;
            });

            // 2. Consultar registros del mes
            const regsSnap = await this.registrosRef
                .where('fecha', '>=', mes + '-01')
                .where('fecha', '<=', mes + '-31')
                .get();

            const regs = [];
            regsSnap.forEach(doc => {
                regs.push({ id: doc.id, ...doc.data() });
            });

            // 3. Agrupar registros diarios
            const regsMap = {}; // key -> { officialName, totalQty, list: [] }

            regs.forEach(r => {
                if (r.archivado === undefined) r.archivado = false;
                const key = this.getGroupingKey(r);
                const officialName = this.getOfficialProductName(r);
                if (!regsMap[key]) {
                    regsMap[key] = { officialName, totalQty: 0, list: [] };
                }
                regsMap[key].totalQty += r.cantidad;
                regsMap[key].list.push(r);
            });

            // 4. Agrupar ítems de facturas
            const facturasMap = {}; // key -> { totalFacturado: 0, list: [] }
            invoices.forEach(inv => {
                const items = inv.items || [];
                items.forEach(item => {
                    if (item.isManoDeObra || item.productId === 'SERVICIO') return;
                    const key = this.getGroupingKey(item.descripcionPapel || item.producto, item.productId);
                    
                    if (!facturasMap[key]) {
                        facturasMap[key] = { totalFacturado: 0, list: [] };
                    }
                    facturasMap[key].totalFacturado += item.cantidad;
                    facturasMap[key].list.push({
                        invoiceId: inv.id,
                        numeroFactura: inv.numeroFactura || 'S/N',
                        fecha: inv.fecha,
                        cliente: inv.CLIENTE || 'Cliente General',
                        cantidad: item.cantidad,
                        producto: item.descripcionPapel || item.producto,
                        productId: item.productId
                    });
                });
            });

            // 5. Unificar todos los productos encontrados en el mes
            const allKeys = new Set([...Object.keys(regsMap), ...Object.keys(facturasMap)]);
            const auditReport = [];

            allKeys.forEach(key => {
                let officialName = key;
                if (regsMap[key]) {
                    officialName = regsMap[key].officialName;
                } else if (facturasMap[key] && facturasMap[key].list.length > 0) {
                    const firstFactItem = facturasMap[key].list[0];
                    officialName = this.getOfficialProductName(firstFactItem.producto, firstFactItem.productId);
                }

                const regData = regsMap[key] || { officialName, totalQty: 0, list: [] };
                const factData = facturasMap[key] || { totalFacturado: 0, list: [] };

                const R = regData.totalQty;
                const F = factData.totalFacturado;
                const diff = F - R;

                let estado = 'ok'; // 'ok' | 'missing' | 'excess'
                const facturasExcedentes = [];

                if (diff > 0) {
                    estado = 'excess';
                    // Calcular en qué factura empezó el exceso
                    let sumaAcumulada = 0;
                    factData.list.forEach(item => {
                        const anteriorSuma = sumaAcumulada;
                        sumaAcumulada += item.cantidad;
                        if (sumaAcumulada > R) {
                            // Esta factura excede el stock registrado
                            const unidadesExcedentesEnEsta = Math.min(item.cantidad, sumaAcumulada - R);
                            facturasExcedentes.push({
                                ...item,
                                exceso: unidadesExcedentesEnEsta,
                                esElOrigen: anteriorSuma <= R
                            });
                        }
                    });
                } else if (diff < 0) {
                    estado = 'missing';
                }

                auditReport.push({
                    key,
                    officialName: regData.officialName,
                    R,
                    F,
                    diff,
                    estado,
                    facturasExcedentes
                });
            });

            // Ordenar reporte: primero los excesos (rojo), luego los faltantes (naranja), y al final los correctos (verde)
            auditReport.sort((a, b) => {
                const priority = { 'excess': 1, 'missing': 2, 'ok': 3 };
                if (priority[a.estado] !== priority[b.estado]) {
                    return priority[a.estado] - priority[b.estado];
                }
                return a.officialName.localeCompare(b.officialName);
            });

            // Renderizar la tabla de resultados
            if (auditReport.length === 0) {
                resultsContainer.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #718096; background: white; border: 1px solid #e2e8f0; border-radius: 8px;">
                        <i class="fas fa-check-circle" style="font-size: 40px; color: #27ae60; margin-bottom: 10px;"></i>
                        <p>No se encontraron movimientos de repuestos en el mes seleccionado.</p>
                    </div>
                `;
                return;
            }

            let html = `
                <div style="margin-top: 15px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.95rem; color: #4a5568; font-weight: bold;">
                        Auditoría completa para ${mes}: ${auditReport.length} productos analizados.
                    </span>
                    <button class="btn btn-primary" onclick="RegistrosApp.syncDatabaseStatus('${mes}')" style="padding: 6px 12px; font-size: 13px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        <i class="fas fa-sync"></i> Corregir Estado en Firebase
                    </button>
                </div>
                <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow-x: auto; background: white;">
                    <table class="inventario-table" style="width: 100%; border-collapse: collapse; margin: 0;">
                        <thead>
                            <tr style="background: #f8f9fa;">
                                <th style="border: 1px solid #edf2f7; padding: 12px; text-align: left;">Producto / Repuesto</th>
                                <th style="border: 1px solid #edf2f7; padding: 12px; text-align: center; width: 110px;">Registrado (Día)</th>
                                <th style="border: 1px solid #edf2f7; padding: 12px; text-align: center; width: 110px;">Facturado (Total)</th>
                                <th style="border: 1px solid #edf2f7; padding: 12px; text-align: center; width: 90px;">Desfase</th>
                                <th style="border: 1px solid #edf2f7; padding: 12px; text-align: center; width: 140px;">Estado</th>
                                <th style="border: 1px solid #edf2f7; padding: 12px; text-align: left;">Facturas con Exceso / Detalles</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            auditReport.forEach(row => {
                let badgeClass = '';
                let badgeText = '';
                let rowStyle = '';
                let desfaseHtml = '';
                let detallesHtml = '';

                if (row.estado === 'ok') {
                    badgeClass = 'status-badge status-invoiced';
                    badgeText = '✅ Correcto';
                    desfaseHtml = '<span style="color: #27ae60; font-weight: bold;">0</span>';
                    detallesHtml = '<span style="color: #a0aec0; font-size: 0.9rem;">Sin desfases</span>';
                } else if (row.estado === 'missing') {
                    badgeClass = 'status-badge status-pending';
                    badgeText = '⚠️ Pendiente Facturar';
                    rowStyle = 'background-color: #fffaf0;';
                    desfaseHtml = `<span style="color: #dd6b20; font-weight: bold;">${row.diff}</span>`;
                    detallesHtml = `<span style="color: #dd6b20; font-size: 0.9rem;"><i class="fas fa-info-circle"></i> Faltan facturar ${Math.abs(row.diff)} unidad(es) de los registros diarios.</span>`;
                } else if (row.estado === 'excess') {
                    badgeClass = 'status-badge btn-danger';
                    badgeClass += ' audit-danger-badge';
                    rowStyle = 'background-color: #fff5f5;';
                    desfaseHtml = `<span style="color: #e53e3e; font-weight: bold;">+${row.diff}</span>`;
                    badgeText = '🚨 EXCESO FACTURADO';
                    
                    const factLinks = row.facturasExcedentes.map(item => {
                        const origenLabel = item.esElOrigen ? ' <span style="background: #fed7d7; color: #9b2c2c; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;">⚠️ AQUÍ EMPEZÓ EXCESO</span>' : '';
                        return `<div style="margin-bottom: 5px; line-height: 1.4;">
                            Factura <strong style="cursor:pointer; color:#3182ce; text-decoration:underline;" onclick="document.getElementById('modal-detalle-factura').style.display='none'; RegistrosApp.viewInvoiceDetail('${item.invoiceId}')">N° ${item.numeroFactura}</strong> 
                            (${item.cliente}) - Cantidad en factura: ${item.cantidad} (Exceso: ${item.exceso})${origenLabel}
                        </div>`;
                    }).join('');

                    detallesHtml = `<div style="font-size: 0.85rem; color: #c53030;">
                        ${factLinks}
                    </div>`;
                }

                html += `
                    <tr style="${rowStyle}">
                        <td style="border: 1px solid #edf2f7; padding: 12px; font-weight: 500;">${row.officialName}</td>
                        <td style="border: 1px solid #edf2f7; padding: 12px; text-align: center; font-weight: bold;">${row.R}</td>
                        <td style="border: 1px solid #edf2f7; padding: 12px; text-align: center; font-weight: bold;">${row.F}</td>
                        <td style="border: 1px solid #edf2f7; padding: 12px; text-align: center;">${desfaseHtml}</td>
                        <td style="border: 1px solid #edf2f7; padding: 12px; text-align: center;">
                            <span class="${badgeClass}" style="padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: bold; color: ${row.estado === 'excess' ? 'white' : 'inherit'}; background-color: ${row.estado === 'excess' ? '#e53e3e' : ''}">${badgeText}</span>
                        </td>
                        <td style="border: 1px solid #edf2f7; padding: 12px; vertical-align: top;">${detallesHtml}</td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;

            resultsContainer.innerHTML = html;

        } catch (e) {
            console.error("Error al ejecutar auditoría:", e);
            resultsContainer.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #e53e3e;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 40px; margin-bottom: 10px;"></i>
                    <p>Error al ejecutar la auditoría: ${e.message}</p>
                </div>
            `;
        }
    },

    startEditingInvoice(id) {
        const inv = this.allHistoricalInvoices.find(i => i.id === id);
        if (!inv) return;

        Swal.fire({
            title: '¿Editar factura?',
            text: `Se cargará la Factura N° ${inv.numeroFactura || 'S/N'} en el panel de facturación. Podrás editar repuestos, servicios, cliente o precios y luego guardar los cambios.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#f39c12',
            confirmButtonText: 'Sí, editar',
            cancelButtonText: 'Cancelar'
        }).then(result => {
            if (!result.isConfirmed) return;

            this.editingInvoiceId = id;

            // Mapear los ítems de la factura de vuelta a la estructura de la aplicación
            this.facturaItems = (inv.items || []).map(item => ({
                id: Math.random().toString(36).substr(2, 9) + Date.now().toString(),
                producto: item.descripcionPapel || item.producto,
                cuenta: item.cuenta || '',
                cantidadFacturar: item.cantidad,
                max: 999, // Límite virtual alto para permitir ediciones libres
                vinculoId: item.productId || null,
                precioUnitario: item.precioUnitario || 0,
                costoUnitario: item.costoUnitario || 0,
                isManoDeObra: !!item.isManoDeObra
            }));

            // Rellenar campos del formulario
            const inputCliente = document.getElementById('factura-cliente');
            const inputNumero = document.getElementById('factura-numero');
            const inputFecha = document.getElementById('factura-fecha');

            if (inputCliente) inputCliente.value = inv.CLIENTE || '';
            if (inputNumero) inputNumero.value = inv.numeroFactura || '';
            if (inputFecha) {
                inputFecha.value = inv.fecha || this.getLocalISODate();
                this.mesFacturable = inputFecha.value.substring(0, 7);
            }

            // Cambiar textos visuales para que se note el estado de edición
            const btnFinalizar = document.querySelector('button[onclick="RegistrosApp.finalizeInvoice()"]');
            if (btnFinalizar) {
                btnFinalizar.innerHTML = `<i class="fas fa-save"></i> Guardar Cambios de Factura`;
                btnFinalizar.style.backgroundColor = '#f39c12';
                btnFinalizar.style.boxShadow = '0 4px 6px rgba(243,156,18,0.2)';
            }

            // Agregar un botón visible de cancelar edición en la UI de facturación
            this.addCancelEditButton();

            // Cambiar a la pestaña de Facturación
            if (typeof switchMainTab === 'function') {
                switchMainTab('facturacion');
            }

            // Ir al Paso 1 de facturación para permitir cambios
            this.goToStep(1);

            // Guardar borrador en localStorage y refrescar
            this.saveFacturaDraft();
            this.renderFactura();
            this.renderFacturacionData();
        });
    },

    addCancelEditButton() {
        const btnFinalizar = document.querySelector('button[onclick="RegistrosApp.finalizeInvoice()"]');
        if (btnFinalizar) {
            let btnCancel = document.getElementById('btn-cancel-edit-invoice');
            if (!btnCancel) {
                btnCancel = document.createElement('button');
                btnCancel.id = 'btn-cancel-edit-invoice';
                btnCancel.className = 'btn';
                btnCancel.style.cssText = 'padding: 12px 20px; font-weight: bold; background: #718096; color: white; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 8px; margin-right: 10px;';
                btnCancel.innerHTML = `<i class="fas fa-times"></i> Cancelar Edición`;
                btnCancel.onclick = () => this.cancelEditingInvoice();
                btnFinalizar.before(btnCancel);
            }
        }
    },

    cancelEditingInvoice() {
        this.editingInvoiceId = null;
        this.facturaItems = [];
        this.saveFacturaDraft();
        this.renderFactura();

        const inputCliente = document.getElementById('factura-cliente');
        const inputNumero = document.getElementById('factura-numero');
        if (inputCliente) inputCliente.value = '';
        if (inputNumero) inputNumero.value = '';

        // Restaurar botón de finalizar
        const btnFinalizar = document.querySelector('button[onclick="RegistrosApp.finalizeInvoice()"]');
        if (btnFinalizar) {
            btnFinalizar.innerHTML = `<i class="fas fa-check-circle"></i> Finalizar y Guardar Factura`;
            btnFinalizar.style.backgroundColor = '#27ae60';
            btnFinalizar.style.boxShadow = '0 4px 6px rgba(39,174,96,0.2)';
        }

        const btnCancel = document.getElementById('btn-cancel-edit-invoice');
        if (btnCancel) btnCancel.remove();

        this.goToStep(1);
        alert("Edición cancelada. Se limpió el borrador.");
    },

    async syncDatabaseStatus(mes) {
        if (!mes) {
            alert("No se ha especificado un mes válido para la sincronización.");
            return;
        }
        this.showLoading(true);
        try {
            // 1. Obtener todas las facturas del mes seleccionado
            const invoicesSnap = await this.db.collection('INVENTARIO_SALIDAS')
                .where('fecha', '>=', mes + '-01')
                .where('fecha', '<=', mes + '-31')
                .get();

            // 2. Agrupar cantidades facturadas
            const facturadoMap = {};
            invoicesSnap.forEach(doc => {
                const inv = doc.data();
                const items = inv.items || [];
                items.forEach(item => {
                    if (item.isManoDeObra || item.productId === 'SERVICIO') return;
                    const key = this.getGroupingKey(item.descripcionPapel || item.producto, item.productId);
                    if (key) {
                        facturadoMap[key] = (facturadoMap[key] || 0) + item.cantidad;
                    }
                });
            });

            // 3. Consultar los registros del mes seleccionado
            const regsSnap = await this.registrosRef
                .where('fecha', '>=', mes + '-01')
                .where('fecha', '<=', mes + '-31')
                .get();
                
            let regs = [];
            regsSnap.forEach(doc => regs.push({id: doc.id, ...doc.data()}));
            
            regs.sort((a, b) => this.parseDateToMillis(a.fecha) - this.parseDateToMillis(b.fecha));

            let actualizados = 0;
            const batch = this.db.batch();
            
            let debugLog = "";

            // 4. Consumir de facturadoMap y auto-corregir fechas
            regs.forEach(reg => {
                const key = this.getGroupingKey(reg);
                if (!key) return;

                // Auto-corregir fecha si está en DD/MM/YYYY
                if (reg.fecha && reg.fecha.includes('/')) {
                    const parts = reg.fecha.split('/');
                    if (parts.length === 3) {
                        batch.update(this.registrosRef.doc(reg.id), { fecha: `${parts[2]}-${parts[1]}-${parts[0]}` });
                        actualizados++;
                    }
                }

                if (facturadoMap[key] && facturadoMap[key] > 0) {
                    if (facturadoMap[key] >= reg.cantidad) {
                        facturadoMap[key] -= reg.cantidad;
                        if (reg.estado === 'pendiente' || !reg.estado) {
                            batch.update(this.registrosRef.doc(reg.id), { estado: 'facturado' });
                            actualizados++;
                        }
                    } else {
                        // Consumo parcial
                        const abonar = facturadoMap[key];
                        facturadoMap[key] = 0;
                        
                        if (reg.estado === 'pendiente' || !reg.estado) {
                            // El original lo dejamos pendiente con lo que sobra
                            batch.update(this.registrosRef.doc(reg.id), { 
                                cantidad: reg.cantidad - abonar 
                            });
                            
                            // Creamos uno nuevo 'facturado' con lo que se pudo abonar
                            const newDocRef = this.registrosRef.doc();
                            batch.set(newDocRef, {
                                ...reg,
                                cantidad: abonar,
                                estado: 'facturado'
                            });
                            actualizados++;
                        }
                    }
                }
            });

            if (debugLog) alert("DEBUG:\n" + debugLog);

            if (actualizados > 0) {
                await batch.commit();
                alert(`¡Éxito! Se han marcado ${actualizados} registros como 'facturado' en la base de datos.`);
            } else {
                alert('No se encontraron registros pendientes que necesiten corrección (todos los cubiertos ya están facturados).');
            }
        } catch (e) {
            console.error("Error al sincronizar:", e);
            alert("Error al sincronizar: " + e.message);
        } finally {
            this.showLoading(false);
        }
    },

    async revertAllFacturadoToPendiente() {
        const confirm = await this.confirmDialog("⚠️ ¿Seguro que deseas convertir todos los registros marcados como 'facturado' a 'pendiente' en la base de datos? Esto permitirá borrarlos o editarlos nuevamente.");
        if (!confirm) return;

        this.showLoading(true);
        try {
            const snap = await this.registrosRef.where('estado', '==', 'facturado').get();
            if (snap.empty) {
                alert("No se encontraron registros con estado 'facturado' en la base de datos.");
                return;
            }

            let count = 0;
            let batch = this.db.batch();
            let ops = 0;
            
            for (const doc of snap.docs) {
                batch.update(this.registrosRef.doc(doc.id), {
                    estado: 'pendiente',
                    numeroFactura: window.firebase.firestore.FieldValue.delete(),
                    clienteFactura: window.firebase.firestore.FieldValue.delete()
                });
                count++;
                ops++;
                if (ops >= 400) {
                    await batch.commit();
                    batch = this.db.batch();
                    ops = 0;
                }
            }
            if (ops > 0) {
                await batch.commit();
            }

            alert(`¡Éxito! Se han restablecido ${count} registros a estado 'pendiente'.`);
            
            if (typeof this.listenToRegistros === 'function') {
                this.listenToRegistros();
            } else {
                location.reload();
            }
        } catch (e) {
            console.error("Error al restablecer registros:", e);
            alert("Error al restablecer registros: " + e.message);
        } finally {
            this.showLoading(false);
        }
    }
};

// Inicializar de forma segura
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => RegistrosApp.init());
} else {
    RegistrosApp.init();
}

// Exponer globalmente para los botones HTML
window.RegistrosApp = RegistrosApp;
