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
    allRegistros: [],
    mapeoRef: null,
    mapeoNombres: {}, // { nombreExcel_clave → codigoInventario }
    currentLinkContext: 'registry', // 'registry' | 'invoice'
    currentLinkInvoiceId: null,
    currentLinkInvoiceItemIndex: null,

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
            // Inicializar Firebase
            if (!window.firebase.apps.length) {
                console.error("Firebase no está inicializado. Verifica firebase-config.js.");
                return;
            }
            this.db = window.firebase.firestore();
            this.registrosRef = this.db.collection('REGISTROS_SALIDA');
            this.preciosRef = this.db.collection('PRECIOS_REGISTROS');
            this.mapeoRef = this.db.collection('MAPEO_NOMBRES');
            this.MAX_FACTURA_ITEMS = 14;
            this.facturaTipo = null;

            this.allRegistros = []; // Todos los registros
            this.facturaItems = []; // Items en la factura (drag & drop)

            this.setupUI();
            this.setupEventListeners();
            await this.loadActiveInvoices();
            await this.loadMapeoNombres();
            this.listenToRegistros();
            this.loadInvoicesHistory();

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

    getLocalISODate(dateObj = new Date()) {
        const offset = dateObj.getTimezoneOffset() * 60000;
        return (new Date(dateObj.getTime() - offset)).toISOString().split('T')[0];
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

    getOfficialProductName(regOrName, productId = null) {
        if (!regOrName) return '';
        let rawName = typeof regOrName === 'object' ? (regOrName.producto || '') : regOrName;
        let pId = typeof regOrName === 'object' ? (regOrName.productId || regOrName.vinculoId || null) : productId;

        if (window.app && window.app.cache) {
            let cachedProduct = null;
            if (pId) {
                cachedProduct = window.app.cache.find(p => p.id === pId);
            }

            // Fallback súper inteligente y automático: si no se encontró por ID, normalizar volumen y buscar
            if (!cachedProduct && rawName) {
                const normRaw = this.normalizeVolumeInString(rawName);
                cachedProduct = window.app.cache.find(p => {
                    const normDesc = this.normalizeVolumeInString(p.descripcion);
                    const normAlias = p.aliases && p.aliases.some(a => this.normalizeVolumeInString(a) === normRaw);
                    return normDesc === normRaw || normAlias;
                });
            }

            if (cachedProduct) {
                return cachedProduct.descripcion || cachedProduct.descripcionTaller || rawName;
            }
        }
        return rawName;
    },

    getGroupingKey(regOrName, productId = null) {
        if (!regOrName) return '';
        let rawName = typeof regOrName === 'object' ? (regOrName.producto || '') : regOrName;
        let pId = typeof regOrName === 'object' ? (regOrName.productId || regOrName.vinculoId || null) : productId;

        if (window.app && window.app.cache) {
            let cachedProduct = null;
            if (pId) {
                cachedProduct = window.app.cache.find(p => p.id === pId);
            }

            // Fallback súper inteligente y automático: si no se encontró por ID, normalizar volumen y buscar
            if (!cachedProduct && rawName) {
                const normRaw = this.normalizeVolumeInString(rawName);
                cachedProduct = window.app.cache.find(p => {
                    const normDesc = this.normalizeVolumeInString(p.descripcion);
                    const normAlias = p.aliases && p.aliases.some(a => this.normalizeVolumeInString(a) === normRaw);
                    return normDesc === normRaw || normAlias;
                });
            }

            if (cachedProduct) {
                // Si el producto tiene un código en el inventario, agrupar por ese código
                if (cachedProduct.codigo && cachedProduct.codigo.trim()) {
                    return cachedProduct.codigo.toLowerCase().trim();
                }
                // Si no tiene código, usar su descripción oficial
                const officialName = cachedProduct.descripcion || cachedProduct.descripcionTaller || rawName;
                return officialName.toLowerCase().trim();
            }
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
        // Enfocar en producto al inicio para usar el lector rápido
        const inputProd = document.getElementById('fast-producto');
        if (inputProd) inputProd.focus();
    },

    setupEventListeners() {
        // Formulario de ingreso rápido (El submit ahora se maneja directamente en el onsubmit del HTML para evitar recargas)
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
                this.handleExcelUpload(e);
            });
        }

        // Filtros
        const searchInput = document.getElementById('search-registro');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.renderTable());
        }
    },

    renderFastEntryTable() {
        const tbody = document.getElementById('fast-entry-tbody');
        if (!tbody) return;

        const pendientes = this.allRegistros.filter(r => r.estado === 'pendiente');

        let totalItems = 0;
        let resumenMap = {};

        tbody.innerHTML = '';

        if (pendientes.length === 0) {
            tbody.innerHTML = `
                <tr id="empty-state-row">
                    <td colspan="6" style="text-align: center; padding: 40px 20px; color: #aaa;">
                        <i class="fas fa-box-open" style="font-size: 40px; margin-bottom: 10px;"></i>
                        <p>No hay productos pendientes.</p>
                        <p style="font-size: 13px;">Agrega productos desde el formulario para comenzar.</p>
                    </td>
                </tr>
            `;
        } else {
            // Ordenar por fecha ascendente (más antiguas arriba) y desempatar por timestamp ascendente (orden de ingreso)
            pendientes.sort((a, b) => {
                const millisA = this.parseDateToMillis(a.fecha);
                const millisB = this.parseDateToMillis(b.fecha);
                
                if (millisA !== millisB) {
                    return millisA - millisB; // Ascendente (más antiguas arriba)
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
                return tA - tB; // Ascendente (orden de ingreso)
            });

            pendientes.forEach(reg => {
                totalItems += reg.cantidad;
                const key = this.getGroupingKey(reg);
                const officialName = this.getOfficialProductName(reg);

                if (!resumenMap[key]) {
                    resumenMap[key] = { name: officialName, count: 0 };
                }
                resumenMap[key].count += reg.cantidad;

                const isLinked = reg.productId ? true : false;
                const displayProduct = isLinked 
                    ? `${officialName} <span style="font-size:11px; color:#3498db; cursor:pointer; margin-left:6px;" onclick="RegistrosApp.openLinkRegistryModal('${reg.id}', '${reg.producto.replace(/'/g, "\\'")}')" title="Editar vínculo con Inventario"><i class="fas fa-edit"></i></span>`
                    : `${reg.producto} <button class="btn" style="padding: 2px 6px; font-size: 11px; margin-left: 8px; border-radius: 4px; border: 1px solid #d35400; color: #d35400; background: #fffcf8; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;" onclick="RegistrosApp.openLinkRegistryModal('${reg.id}', '${reg.producto.replace(/'/g, "\\'")}')"><i class="fas fa-link"></i> Vincular</button>`;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${reg.cantidad}</strong></td>
                    <td><span style="font-size: 13px; color: #7f8c8d;">${this.formatDate(reg.fecha)}</span></td>
                    <td>${displayProduct}</td>
                    <td>${reg.cuenta || '-'}</td>
                    <td><span style="font-size:13px; color:#666;">${reg.observacion || '-'}</span></td>
                    <td style="text-align: center;">
                        <button type="button" class="btn btn-danger" style="padding: 5px; width: 30px; height: 30px; border-radius: 50%;" onclick="RegistrosApp.deleteRegistro('${reg.id}')" title="Eliminar fila">
                            <i class="fas fa-times"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        const totalItemsSpan = document.getElementById('total-items');
        if (totalItemsSpan) totalItemsSpan.innerText = totalItems;

        // Render Resumen
        const resumenTbody = document.getElementById('resumen-tbody');
        if (!resumenTbody) return;

        if (Object.keys(resumenMap).length === 0) {
            resumenTbody.innerHTML = `
                <tr id="resumen-empty-state">
                    <td colspan="2" style="text-align: center; padding: 40px 20px; color: #aaa;">
                        <i class="fas fa-chart-bar" style="font-size: 40px; margin-bottom: 10px;"></i>
                        <p>El resumen aparecerá aquí.</p>
                    </td>
                </tr>
            `;
        } else {
            resumenTbody.innerHTML = '';
            // Obtener productos y ordenarlos alfabéticamente por su nombre oficial
            const sortedKeys = Object.keys(resumenMap).sort((a, b) => resumenMap[a].name.localeCompare(resumenMap[b].name));
            
            sortedKeys.forEach(key => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${resumenMap[key].name}</td>
                    <td><strong>${resumenMap[key].count}</strong></td>
                `;
                resumenTbody.appendChild(tr);
            });
        }
    },

    async addFastEntryRow() {
        const productoInput = document.getElementById('fast-producto');
        const cantidadInput = document.getElementById('fast-cantidad');
        const cuentaInput = document.getElementById('fast-cuenta');
        const observacionInput = document.getElementById('fast-observacion');

        const rawInputValue = productoInput.value.trim().toLowerCase();
        
        // Limpiar sufijos extra del código QR (ej. "AN131032'1" -> "AN131032")
        const inputValue = rawInputValue.includes("'") ? rawInputValue.split("'")[0] : rawInputValue;
        
        let productoDesc = productoInput.value.trim();
        // Si se limpió el código, usamos el código limpio como fallback visual
        if (rawInputValue.includes("'")) {
            productoDesc = inputValue.toUpperCase();
        }

        let productId = null;

        let cantidad = parseInt(cantidadInput.value);
        if (isNaN(cantidad) || cantidad < 1) cantidad = 1;
        const cuenta = cuentaInput.value.trim();
        const observacion = observacionInput.value.trim();

        if (!inputValue) return;

        // Función auxiliar para comparar códigos ignorando ceros a la izquierda
        const compareCodes = (code1, code2) => {
            if (!code1 || !code2) return false;
            // Quitamos ceros a la izquierda para comparar "03714" con "3714"
            const c1 = code1.toLowerCase().replace(/^0+/, '');
            const c2 = code2.toLowerCase().replace(/^0+/, '');
            // Si después de quitar ceros quedan vacíos (ej. era "0"), los comparamos como "0"
            return (c1 || "0") === (c2 || "0");
        };

        // Búsqueda en caché local de InventoryController
        if (window.app && window.app.cache) {
            const match = window.app.cache.find(p => {
                // Separar el código principal por espacios, comas o guiones por si tiene múltiples códigos (ej. "AA12 3714 1414")
                const mainCodes = p.codigo ? p.codigo.split(/[\s,-]+/) : [];
                
                const matchMain = mainCodes.some(c => compareCodes(c, inputValue));
                const matchDesc = p.descripcion && compareCodes(p.descripcion, inputValue);
                const matchAlias = p.aliases && p.aliases.some(a => compareCodes(a, inputValue));
                const matchProv = p.codigosProveedor && p.codigosProveedor.some(c => compareCodes(c, inputValue));

                return matchMain || matchDesc || matchAlias || matchProv;
            });

            if (match) {
                productoDesc = match.descripcion;
                productId = match.id;
            } else {
                console.warn("Producto escaneado no encontrado en BD:", productoDesc);
                productoDesc += " ⚠️ NO ENCONTRADO";
            }
        }

        // Guardar instantáneamente en Firebase
        try {
            const docRef = RegistrosApp.registrosRef.doc();
            await docRef.set({
                fecha: RegistrosApp.getLocalISODate() || "",
                producto: productoDesc || "",
                productId: productId || null,
                cantidad: cantidad || 1,
                cuenta: cuenta || "",
                observacion: observacion || "",
                estado: 'pendiente',
                origen: 'manual',
                timestamp: Date.now()
            });
        } catch (error) {
            console.error("Error guardando registro:", error);
            alert("Error al guardar el producto: " + error.message);
            return;
        }

        // Resetear inputs para el siguiente producto
        productoInput.value = '';
        cantidadInput.value = '1';
        observacionInput.value = '';

        // Volver a enfocar el producto para escaneo continuo
        productoInput.focus();
    },

    handleExcelUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        this.showLoading(true);
        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                // Usar cellDates: true para que la librería maneje las fechas de Excel automáticamente
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                
                this.currentWorkbook = workbook;
                
                // Mostrar nombre del archivo
                const filenameDisplay = document.getElementById('fast-excel-filename-display');
                if (filenameDisplay) filenameDisplay.innerText = `Archivo: ${file.name}`;
                
                // Llenar selector de hojas
                const sheetSel = document.getElementById('fast-excel-sheet-select');
                if (sheetSel) {
                    sheetSel.innerHTML = '';
                    workbook.SheetNames.forEach(name => {
                        const opt = document.createElement('option');
                        opt.value = name;
                        opt.innerText = name;
                        sheetSel.appendChild(opt);
                    });
                }
                
                // Mostrar contenedor del selector de hojas
                const sheetsContainer = document.getElementById('fast-excel-sheets-container');
                if (sheetsContainer) sheetsContainer.style.display = 'block';
                
            } catch (error) {
                console.error("Error leyendo Excel:", error);
                alert("Error al leer el archivo Excel: " + error.message);
            } finally {
                this.showLoading(false);
            }
        };

        reader.readAsArrayBuffer(file);
    },

    async processSelectedFastExcelSheet() {
        if (!this.currentWorkbook) {
            alert("Por favor selecciona un archivo Excel primero.");
            return;
        }
        
        const sheetName = document.getElementById('fast-excel-sheet-select').value;
        if (!sheetName) {
            alert("Selecciona una hoja válida.");
            return;
        }
        
        this.showLoading(true);
        try {
            const worksheet = this.currentWorkbook.Sheets[sheetName];
            // Convertir a JSON crudo garantizando que las columnas A, B, C y D siempre existan incluso si están vacías
            const rawData = XLSX.utils.sheet_to_json(worksheet, { header: "A", defval: null });
            
            await this.processExcelData(rawData);
            
            // Ocultar selector de hojas y limpiar campos
            const sheetsContainer = document.getElementById('fast-excel-sheets-container');
            if (sheetsContainer) sheetsContainer.style.display = 'none';
            
            const filenameDisplay = document.getElementById('fast-excel-filename-display');
            if (filenameDisplay) filenameDisplay.innerText = '';
            
            const fileInput = document.getElementById('fast-excel-file');
            if (fileInput) fileInput.value = '';
            
            this.currentWorkbook = null;
            
        } catch (error) {
            console.error("Error al procesar hoja:", error);
            alert("Error al procesar la hoja de Excel: " + error.message);
        } finally {
            this.showLoading(false);
        }
    },

    async processExcelData(rows) {
        let currentExcelDate = null;
        let batch = this.db.batch();
        let operationsCount = 0;
        let totalProcessed = 0;

        // Saltar la primera fila si es el encabezado
        let startIndex = 0;
        if (rows.length > 0 && typeof rows[0].A === 'string' && rows[0].A.toLowerCase().includes('fecha')) {
            startIndex = 1;
        }

        for (let i = startIndex; i < rows.length; i++) {
            const row = rows[i];

            // Columna C: Descripción (Producto) - Si no hay producto, saltar la fila
            const producto = row.C ? String(row.C).trim() : '';
            if (!producto) continue;

            // Columna A: Fecha
            let fechaRaw = row.A;
            let newDateDetected = false;
            let tempDateStr = null;

            if (fechaRaw !== undefined && fechaRaw !== null) {
                if (fechaRaw instanceof Date) {
                    if (!isNaN(fechaRaw.getTime())) {
                        // Extraer partes UTC directamente para evitar desplazamientos por zona horaria
                        const y = fechaRaw.getUTCFullYear();
                        const m = String(fechaRaw.getUTCMonth() + 1).padStart(2, '0');
                        const d = String(fechaRaw.getUTCDate()).padStart(2, '0');
                        tempDateStr = `${y}-${m}-${d}`;
                        newDateDetected = true;
                    }
                } else if (typeof fechaRaw === 'string') {
                    const cleanStr = fechaRaw.trim();
                    if (cleanStr.includes('/') || cleanStr.includes('-')) {
                        const parts = cleanStr.includes('/') ? cleanStr.split('/') : cleanStr.split('-');
                        if (parts.length === 3) {
                            let y = parts[2];
                            if (y.length === 2) {
                                if (y === "06") y = "2026"; // Corregir "06" -> "2026" (evitar 2006)
                                else y = "20" + y;
                            } else if (y.length === 1 && y === "6") {
                                y = "2026"; // Corregir "6" -> "2026"
                            }
                            if (parts[0].length === 4) {
                                tempDateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                            } else {
                                tempDateStr = `${y}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                            }
                            newDateDetected = true;
                        }
                    }
                } else if (typeof fechaRaw === 'number') {
                    // Ignorar números pequeños como 15 o 8
                    if (fechaRaw > 30000) {
                        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
                        const jsDate = new Date(excelEpoch.getTime() + fechaRaw * 86400000);
                        const y = jsDate.getUTCFullYear();
                        const m = String(jsDate.getUTCMonth() + 1).padStart(2, '0');
                        const d = String(jsDate.getUTCDate()).padStart(2, '0');
                        tempDateStr = `${y}-${m}-${d}`;
                        newDateDetected = true;
                    }
                }
            }

            if (newDateDetected && tempDateStr && !tempDateStr.startsWith("1900")) {
                currentExcelDate = tempDateStr;
            }

            if (!currentExcelDate) {
                currentExcelDate = this.getLocalISODate();
            }

            // Columna B: Cantidad
            const cantidad = parseInt(row.B) || 1;

            // Columna D: Cuenta
            const cuenta = row.D ? String(row.D).trim() : '';

            // Columna E: Observacion
            const observacion = row.E ? String(row.E).trim() : '';

            // Fecha final a usar
            const fechaAUsar = currentExcelDate;

            // Intentar vincular usando MAPEO_NOMBRES primero (vínculos manuales guardados)
            let productId = null;
            let productoDesc = producto;
            if (window.app && window.app.cache) {
                // 1. Buscar en el diccionario de vínculos manuales
                const mapeoKey = this.sanitizeForDocId(producto);
                const codigoMapeado = this.mapeoNombres ? this.mapeoNombres[mapeoKey] : null;
                if (codigoMapeado) {
                    const matchMapeado = this.findProductByCodigo(codigoMapeado);
                    if (matchMapeado) {
                        productId = matchMapeado.id;
                        productoDesc = matchMapeado.descripcion;
                    }
                    // Si el código ya no existe en inventario, no crear vínculo fantasma
                }

                // 2. Fallback: coincidencia exacta por descripción o alias
                if (!productId) {
                    const match = window.app.cache.find(p => {
                        const matchDesc = p.descripcion && p.descripcion.toLowerCase().trim() === producto.toLowerCase().trim();
                        const matchAlias = p.aliases && p.aliases.some(a => a.toLowerCase().trim() === producto.toLowerCase().trim());
                        return matchDesc || matchAlias;
                    });
                    if (match) {
                        productId = match.id;
                        productoDesc = match.descripcion;
                    }
                }
            }

            // Crear documento en Firestore
            const docRef = this.registrosRef.doc();
            batch.set(docRef, {
                fecha: fechaAUsar,
                producto: productoDesc,
                productId: productId,
                cantidad: cantidad,
                cuenta: cuenta,
                observacion: observacion,
                estado: 'pendiente',
                origen: 'excel',
                timestamp: Date.now()
            });

            operationsCount++;
            totalProcessed++;

            // Firestore limits batches to 500 operations
            if (operationsCount >= 450) {
                await batch.commit();
                batch = this.db.batch();
                operationsCount = 0;
            }
        }

        if (operationsCount > 0) {
            await batch.commit();
        }

        alert(`¡Carga exitosa! Se procesaron ${totalProcessed} registros.`);
    },

    currentSelectedDate: null,
    facturaItems: [],

    listenToRegistros() {
        if (this.unsubscribe) this.unsubscribe();

        // Obtener los últimos 2000 registros para asegurar que todo el Excel se muestre
        this.unsubscribe = this.registrosRef
            .orderBy('timestamp', 'desc')
            .limit(2000)
            .onSnapshot(snapshot => {
                this.allRegistros = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    
                    // Auto-corrección en caliente de fechas guardadas erróneamente con año 2006
                    if (data.fecha && data.fecha.startsWith("2006-")) {
                        const nuevaFecha = data.fecha.replace("2006-", "2026-");
                        this.registrosRef.doc(doc.id).update({ fecha: nuevaFecha })
                            .then(() => console.log(`Auto-corregida fecha de ${data.fecha} a ${nuevaFecha} en doc: ${doc.id}`))
                            .catch(err => console.error("Error al auto-corregir fecha:", err));
                        data.fecha = nuevaFecha; // Modificar en caliente localmente para visualización instantánea
                    }

                    // Auto-sanación de registros huérfanos con estado "facturado" pero cuya factura ya no existe
                    if (data.estado === 'facturado') {
                        if (!data.facturaId || (this.activeInvoiceIds && !this.activeInvoiceIds.has(data.facturaId))) {
                            console.warn(`Auto-sanando registro huérfano ${doc.id}: factura ausente o eliminada.`);
                            this.registrosRef.doc(doc.id).update({
                                estado: 'pendiente',
                                facturaId: window.firebase.firestore.FieldValue.delete(),
                                precioFacturado: window.firebase.firestore.FieldValue.delete(),
                                costoFacturado: window.firebase.firestore.FieldValue.delete()
                            }).catch(err => console.error("Error auto-sanando:", err));
                            data.estado = 'pendiente'; // Modificar en caliente localmente
                        }
                    }
                    
                    this.allRegistros.push({ id: doc.id, ...data });
                });
                this.renderDatesList();
                this.renderFacturacionData();
                this.renderFastEntryTable();
            }, error => {
                console.error("Error al escuchar registros:", error);
            });
    },

    renderFacturacionData() {
        const listadoTbody = document.getElementById('fact-listado-tbody');
        const resumenTbody = document.getElementById('fact-resumen-tbody');
        if (!listadoTbody || !resumenTbody) return;

        const pendientes = this.allRegistros.filter(r => r.estado === 'pendiente');

        // Ordenar por fecha ascendente (más antiguas arriba) y desempatar por timestamp ascendente (orden de ingreso)
        pendientes.sort((a, b) => {
            const millisA = this.parseDateToMillis(a.fecha);
            const millisB = this.parseDateToMillis(b.fecha);
            
            if (millisA !== millisB) {
                return millisA - millisB; // Ascendente (más antiguas arriba)
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
            return tA - tB; // Ascendente (orden de ingreso)
        });

        // Unificar todo el descuento por producto (sincronización entre tarjetas) - Claves unificadas por código de barra o nombre oficial
        const facturadoPorProducto = {};
        this.facturaItems.forEach(item => {
            if (!item.producto) return;
            const key = this.getGroupingKey(item.producto, item.vinculoId);
            facturadoPorProducto[key] = (facturadoPorProducto[key] || 0) + item.cantidadFacturar;
        });

        // Calcular los totales originales agrupando por clave de agrupación (código o nombre oficial)
        let resumenMap = {};
        pendientes.forEach(reg => {
            if (!reg.producto) return;
            const key = this.getGroupingKey(reg);
            const officialName = this.getOfficialProductName(reg);
            if (!resumenMap[key]) {
                resumenMap[key] = { name: officialName, count: 0, productId: reg.productId || null };
            }
            resumenMap[key].count += reg.cantidad;
        });

        // Copia para ir descontando de la Tarjeta 1 (FIFO)
        const aDescontarTarjeta1 = { ...facturadoPorProducto };

        listadoTbody.innerHTML = '';
        let hasVisible = false;

        // 1. Llenar Tarjeta 1 (Listado Completo)
        pendientes.forEach(reg => {
            let cantidadDisponible = reg.cantidad;
            if (!reg.producto) return;
            const key = this.getGroupingKey(reg);
            const officialName = this.getOfficialProductName(reg);

            // Descontar usando FIFO (lo más antiguo primero)
            if (aDescontarTarjeta1[key] > 0) {
                if (aDescontarTarjeta1[key] >= cantidadDisponible) {
                    aDescontarTarjeta1[key] -= cantidadDisponible;
                    cantidadDisponible = 0;
                } else {
                    cantidadDisponible -= aDescontarTarjeta1[key];
                    aDescontarTarjeta1[key] = 0;
                }
            }

            // Si ya está completamente asignado, no mostrar en Tarjeta 1
            if (cantidadDisponible <= 0) return;

            hasVisible = true;
            const tr = document.createElement('tr');
            tr.setAttribute('draggable', 'true');
            tr.style.cursor = 'pointer'; // Indicador de clickabilidad premium

            const data = { type: 'summary', producto: officialName, max: resumenMap[key].count, productId: reg.productId || null };

            tr.ondragstart = (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify(data));
                e.dataTransfer.effectAllowed = 'copy';
            };

            // Evento táctil/clic para tablet y PC
            tr.onclick = (e) => {
                e.stopPropagation(); // Detener propagación para evitar colapsar la tarjeta
                this.addItemToFactura(data);
            };

            tr.innerHTML = `
                <td>${this.formatDate(reg.fecha)}</td>
                <td><strong>${cantidadDisponible}</strong></td>
                <td>${officialName}</td>
            `;
            listadoTbody.appendChild(tr);
        });

        if (!hasVisible) {
            listadoTbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color:#999;">Todos los registros fueron asignados a la factura.</td></tr>';
        }

        // 2. Llenar Tarjeta 2 (Resumen Agrupado)
        resumenTbody.innerHTML = '';
        let hasResumen = false;

        // Obtener los productos y ordenarlos alfabéticamente por su nombre original
        const sortedKeys = Object.keys(resumenMap).sort((a, b) => resumenMap[a].name.localeCompare(resumenMap[b].name));

        for (const key of sortedKeys) {
            const prodName = resumenMap[key].name;
            const totalOriginal = resumenMap[key].count;
            const yaFacturado = facturadoPorProducto[key] || 0;
            const restante = totalOriginal - yaFacturado;

            if (restante <= 0) continue;

            hasResumen = true;
            const tr = document.createElement('tr');
            tr.setAttribute('draggable', 'true');
            tr.style.cursor = 'pointer'; // Indicador táctil premium

            const data = { type: 'summary', producto: prodName, max: totalOriginal, productId: resumenMap[key].productId || null };

            tr.ondragstart = (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify(data));
                e.dataTransfer.effectAllowed = 'copy';
            };

            // Evento táctil/clic para tablet y PC
            tr.onclick = (e) => {
                e.stopPropagation(); // Detener propagación para evitar colapsar la tarjeta
                this.addItemToFactura(data);
            };

            tr.innerHTML = `
                <td>${prodName}</td>
                <td><strong>${restante}</strong></td>
            `;
            resumenTbody.appendChild(tr);
        }

        if (!hasResumen) {
            resumenTbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:20px; color:#999;">Todo fue asignado a la factura.</td></tr>';
        }
    },

    allowDrop(e) {
        if (this.facturaItems.length >= this.MAX_FACTURA_ITEMS) {
            e.dataTransfer.dropEffect = 'none';
            return;
        }
        e.preventDefault();
        document.getElementById('factura-dropzone').style.backgroundColor = '#ecf0f1';
    },

    dragLeave(e) {
        e.currentTarget.style.backgroundColor = '#fafbfc';
        e.currentTarget.style.borderColor = '#bdc3c7';
    },

    addItemToFactura(data) {
        try {
            // Check if already in factura
            let existingItem = null;
            if (data.type === 'single') {
                existingItem = this.facturaItems.find(item => item.type === 'single' && item.originalId === data.id);
            } else {
                existingItem = this.facturaItems.find(item => item.type === 'summary' && item.producto.toLowerCase().trim() === data.producto.toLowerCase().trim());
            }

            if (!existingItem && this.facturaItems.length >= this.MAX_FACTURA_ITEMS) {
                alert("La factura ha alcanzado el límite de 14 productos.");
                this.renderFactura(); // Restablecer colores
                return;
            }

            if (existingItem) {
                if (existingItem.cantidadFacturar < data.max) {
                    existingItem.cantidadFacturar += 1;
                } else {
                    alert('No puedes agregar más. Límite pendiente alcanzado.');
                }
            } else {
                const newItem = {
                    id: Date.now().toString(),
                    type: data.type,
                    originalId: data.id || null,
                    producto: data.producto,
                    cantidadFacturar: 1,
                    max: data.max,
                    vinculoId: data.productId || null,
                    precioUnitario: 0,
                    costoUnitario: 0
                };
                this.facturaItems.push(newItem);
                this.loadItemPrices(newItem);
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

                if (!existingItem && this.facturaItems.length >= this.MAX_FACTURA_ITEMS) {
                    alert("La factura ha alcanzado el límite de 14 ítems.");
                    return;
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

            // 3. Si aún no se encuentra, buscar en el inventario por el nombre descriptivo exacto
            if (!precioEncontrado && window.app && window.app.cache) {
                const match = window.app.cache.find(p => p.descripcion && p.descripcion.toLowerCase().trim() === item.producto.toLowerCase().trim());
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

        if (this.facturaItems.length >= this.MAX_FACTURA_ITEMS) {
            dropzone.classList.add('factura-full');
        } else {
            dropzone.classList.remove('factura-full');
            dropzone.style.backgroundColor = '#fafbfc'; // Restaurar default
        }

        tbody.innerHTML = '';

        if (this.facturaItems.length === 0) {
            tbody.innerHTML = `
                <tr id="factura-empty-state">
                    <td colspan="5" style="text-align: center; padding: 40px 20px; color: #aaa;">
                        <i class="fas fa-hand-holding-box" style="font-size: 30px; margin-bottom: 10px;"></i>
                        <br>Arrastra los productos aquí para agregarlos a la factura<br>
                        <small>(Límite de 14 productos)</small>
                    </td>
                </tr>
            `;
            const cardTotalEl = document.getElementById('card-factura-total');
            if (cardTotalEl) cardTotalEl.innerText = "0.00";
            return;
        }

        let grandTotal = 0;

        this.facturaItems.forEach(item => {
            const total = item.cantidadFacturar * (item.precioUnitario || 0);
            grandTotal += total;

            const isGeneralService = item.isManoDeObra && item.producto !== 'Mano de Obra';
            const precioHTML = isGeneralService 
                ? `<span style="color: #cbd5e0; font-size: 14px; font-weight: bold; display: block; text-align: center;">-</span>`
                : `<input type="number" class="form-control" step="0.01" min="0" value="${(item.precioUnitario || 0).toFixed(2)}" style="width:75px; padding:2px 5px;" onchange="RegistrosApp.updateFacturaItemPrice('${item.id}', this.value)">`;

            const totalHTML = isGeneralService
                ? `<span style="color: #cbd5e0; font-size: 14px; font-weight: bold; display: block; text-align: center;">-</span>`
                : `$${total.toFixed(2)}`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <input type="number" class="form-control" value="${item.cantidadFacturar}" min="1" max="${item.max}" style="width:60px; padding:2px 5px;" onchange="RegistrosApp.updateFacturaItemQty('${item.id}', this.value, ${item.max})">
                </td>
                <td>
                    ${item.producto}
                    ${item.isManoDeObra ? '<div style="font-size:11px; color:#27ae60; font-weight: bold;"><i class="fas fa-tools"></i> Servicio de Taller</div>' : `<div style="font-size:11px; color:#888;">Disponible: ${item.max}</div>`}
                </td>
                <td>
                    ${precioHTML}
                </td>
                <td style="font-weight: bold; font-size:13px; text-align: right; padding-right: 5px;">
                    ${totalHTML}
                </td>
                <td style="text-align: center;">
                    <button class="btn btn-danger" style="padding: 2px 6px; font-size:12px;" onclick="RegistrosApp.removeFacturaItem('${item.id}')">
                        <i class="fas fa-times"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        const cardTotalEl = document.getElementById('card-factura-total');
        if (cardTotalEl) cardTotalEl.innerText = grandTotal.toFixed(2);
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

        let filtered = this.allRegistros.filter(reg => {
            const norm = this.normalizeDateStr(reg.fecha);
            if (norm !== this.currentSelectedDate) return false;

            const matchSearch = reg.producto.toLowerCase().includes(searchTerm) ||
                (reg.cuenta && reg.cuenta.toLowerCase().includes(searchTerm));
            return matchSearch;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#7f8c8d;">No hay registros encontrados</td></tr>';
            return;
        }

        // Ordenar: primero los pendientes, luego por fecha descendente
        filtered.sort((a, b) => {
            if (a.estado === 'pendiente' && b.estado !== 'pendiente') return -1;
            if (a.estado !== 'pendiente' && b.estado === 'pendiente') return 1;
            return 0; // Ya están del mismo día, mantenemos orden de inserción/timestamp
        });

        filtered.forEach(reg => {
            const tr = document.createElement('tr');

            const statusClass = reg.estado === 'pendiente' ? 'status-pending' : 'status-invoiced';
            const statusText = reg.estado === 'pendiente' ? 'Pendiente' : 'Facturado';

            if (reg.estado === 'facturado') {
                tr.style.backgroundColor = '#f1faf5'; // Fondo verde pastel ultra sutil
                tr.style.borderLeft = '4px solid #2ecc71'; // Línea verde viva izquierda para indicador de completado
            }

            // Botón para recuperar quirúrgicamente registros huérfanos de facturas eliminadas antes
            const revertButtonHTML = reg.estado === 'facturado'
                ? `<button class="btn" style="padding:5px 10px; font-size:12px; background:#2ecc71; color:white; border:none; border-radius:4px; margin-right:5px; cursor:pointer;" onclick="RegistrosApp.revertRegistryToPending('${reg.id}')" title="Devolver a Pendiente">
                       <i class="fas fa-undo"></i> Devolver
                   </button>`
                : '';

            const obsColor = reg.estado === 'facturado' ? '#2e7d32' : '#666';

            const officialName = this.getOfficialProductName(reg);
            const isLinked = reg.productId ? true : false;

            const productDisplayHTML = reg.estado === 'facturado'
                ? `<span>${officialName}</span>`
                : isLinked
                    ? `<span>${officialName}</span> <span style="font-size:11px; color:#3498db; cursor:pointer; margin-left:6px;" onclick="RegistrosApp.openLinkRegistryModal('${reg.id}', '${reg.producto.replace(/'/g, "\\'")}')" title="Editar vínculo con Inventario"><i class="fas fa-edit"></i></span>`
                    : `<span style="color:#e67e22;">${reg.producto}</span> <button class="btn" style="padding: 2px 6px; font-size: 11px; margin-left: 8px; border-radius: 4px; border: 1px solid #d35400; color: #d35400; background: #fffcf8; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;" onclick="RegistrosApp.openLinkRegistryModal('${reg.id}', '${reg.producto.replace(/'/g, "\\'")}')"><i class="fas fa-link"></i> Vincular</button>`;

            tr.innerHTML = `
                <td><strong>${reg.cantidad}</strong></td>
                <td>${productDisplayHTML}</td>
                <td>${reg.cuenta || '<span style="color:#ccc;">-</span>'}</td>
                <td><span style="font-size:13px; color:${obsColor};">${reg.observacion || ''}</span></td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td style="text-align: center;">
                    ${revertButtonHTML}
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
                    facturaId: window.firebase.firestore.FieldValue.delete()
                });
                alert("✅ Producto devuelto a Pendiente correctamente.");
            } catch (error) {
                console.error("Error al revertir registro:", error);
                alert("Error al restaurar: " + error.message);
            }
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

    async deleteAllRegistros() {
        if (await this.confirmDialog('⚠️ ¡PELIGRO! ¿Estás seguro de ELIMINAR TODOS los registros de salidas? Esta acción no se puede deshacer.')) {
            this.showLoading(true);
            try {
                const snapshot = await this.registrosRef.get();
                const batch = this.db.batch();
                snapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
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
            item.costoUnitario = 0;
            let loadedPrice = 0;
            let precioEncontrado = false;

            try {
                // 1. Si tenemos el vinculoId, cargar directamente de la caché
                if (currentVinculoId && window.app && window.app.cache) {
                    const cachedProduct = window.app.cache.find(p => p.id === currentVinculoId);
                    if (cachedProduct) {
                        item.costoUnitario = cachedProduct.costo || 0;
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
                                if (p) item.costoUnitario = p.costo || 0;
                            } else {
                                const invDoc = await this.db.collection('INVENTARIO').doc(data.vinculoId).get();
                                if (invDoc.exists) item.costoUnitario = invDoc.data().costo || 0;
                            }
                        }
                        precioEncontrado = true;
                    }
                }

                // 3. Fallback a buscar por nombre descriptivo exacto en la caché
                if (!precioEncontrado && window.app && window.app.cache) {
                    const match = window.app.cache.find(p => p.descripcion && p.descripcion.toLowerCase().trim() === item.producto.toLowerCase().trim());
                    if (match) {
                        item.vinculoId = match.id;
                        item.costoUnitario = match.costo || 0;
                        loadedPrice = this.facturaTipo === 'repuestos' ? (match.precioRepuestos || match.precio || 0) : (match.precio || 0);
                        precioEncontrado = true;
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
            const batch = this.db.batch();

            // Generar ID de factura por adelantado para vincular los registros
            const facturaRef = this.db.collection('INVENTARIO_SALIDAS').doc();
            const facturaId = facturaRef.id;

            // Asegurar que activeInvoiceIds reconozca esta factura antes de que se lance el snapshot y la auto-sanación la borre
            if (this.activeInvoiceIds) {
                this.activeInvoiceIds.add(facturaId);
            }

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

                batch.set(realDocRef, updateData, { merge: true });

                // Acumular en RESUMEN_SALIDAS_MES en vez de descontar directamente de INVENTARIO (Inmovilizado)
                if (item.vinculoId) {
                    const resumenRef = this.db.collection('RESUMEN_SALIDAS_MES').doc(item.vinculoId);
                    batch.set(resumenRef, {
                        productId: item.vinculoId,
                        producto: item.producto,
                        cantidadFacturada: window.firebase.firestore.FieldValue.increment(item.cantidadFacturar),
                        mes: this.getLocalISODate().substring(0, 7)
                    }, { merge: true });
                }
            });

            // Pasar registros pendientes a facturado (FIFO)
            let pendientesParaFacturar = this.allRegistros.filter(r => r.estado === 'pendiente');
            pendientesParaFacturar.sort((a, b) => this.parseDateToMillis(a.fecha) - this.parseDateToMillis(b.fecha)); // Ordenar por fecha cronológicamente de forma robusta (FIFO)

            this.facturaItems.forEach(item => {
                if (item.isManoDeObra) return; // Omitir Mano de obra del descuento de pendientes
                let cantidadFaltante = item.cantidadFacturar;
                for (let i = 0; i < pendientesParaFacturar.length; i++) {
                    let reg = pendientesParaFacturar[i];
                    if (reg.producto && item.producto && this.getGroupingKey(reg) === this.getGroupingKey(item.producto, item.vinculoId) && cantidadFaltante > 0) {
                        let regRef = this.registrosRef.doc(reg.id);
                        if (reg.cantidad <= cantidadFaltante) {
                            // Se consume todo el registro
                            batch.update(regRef, {
                                estado: 'facturado',
                                facturaId: facturaId,
                                precioFacturado: item.precioUnitario,
                                costoFacturado: item.costoUnitario || 0
                            });
                            cantidadFaltante -= reg.cantidad;
                            reg.cantidad = 0; // Marcar como consumido en memoria para el loop
                        } else {
                            // Se consume parcialmente: Actualizamos el registro actual restando la cantidad, y creamos uno nuevo facturado
                            batch.update(regRef, {
                                cantidad: reg.cantidad - cantidadFaltante
                            });

                            const newDocRef = this.registrosRef.doc();
                            batch.set(newDocRef, {
                                ...reg,
                                cantidad: cantidadFaltante,
                                estado: 'facturado',
                                facturaId: facturaId,
                                precioFacturado: item.precioUnitario,
                                costoFacturado: item.costoUnitario || 0,
                                timestamp: window.firebase.firestore.FieldValue.serverTimestamp()
                            });

                            reg.cantidad -= cantidadFaltante;
                            cantidadFaltante = 0;
                        }
                    }
                }
            });

            // Guardar factura en colección INVENTARIO_SALIDAS (Compatible con willianworkshop)
            const cliente = document.getElementById('factura-cliente').value || 'Cliente General';
            const numero = document.getElementById('factura-numero').value || '';
            const grandTotal = this.facturaItems.reduce((sum, item) => sum + (item.cantidadFacturar * item.precioUnitario), 0);
            const totalCosto = this.facturaItems.reduce((sum, item) => sum + (item.cantidadFacturar * (item.costoUnitario || 0)), 0);
            const totalManoObra = this.facturaItems.reduce((sum, item) => sum + (item.isManoDeObra ? (item.cantidadFacturar * item.precioUnitario) : 0), 0);
            const totalProductos = grandTotal - totalManoObra;
            const gananciaProductos = totalProductos - totalCosto;
            const gananciaNeta = grandTotal - totalCosto;

            batch.set(facturaRef, {
                CLIENTE: cliente,
                numeroFactura: numero,
                tipo: this.facturaTipo,
                total: grandTotal,
                costoTotal: totalCosto,
                totalManoObra: totalManoObra,
                gananciaProductos: gananciaProductos,
                gananciaNeta: gananciaNeta,
                tieneItemsSinVincular: this.facturaItems.some(i => !i.isManoDeObra && !i.vinculoId),
                fecha: this.getLocalISODate(), // formato YYYY-MM-DD (Local)
                timestamp: window.firebase.firestore.FieldValue.serverTimestamp(),
                items: this.facturaItems.map(item => ({
                    descripcionPapel: item.producto, // mapping para compatibilidad
                    cantidad: item.cantidadFacturar,
                    precioUnitario: item.precioUnitario,
                    costoUnitario: item.costoUnitario || 0,
                    productId: item.vinculoId || null,
                    isManoDeObra: !!item.isManoDeObra,
                    total: item.cantidadFacturar * item.precioUnitario
                }))
            });

            await batch.commit();

            this.showLoading(false);
            alert("¡Factura procesada con éxito! Las existencias actuales en pantalla reflejan el cambio y se guardó para la auditoría.");

            // Limpiar factura
            this.facturaItems = [];
            this.renderFactura();
            document.getElementById('factura-cliente').value = '';
            document.getElementById('factura-numero').value = '';

            // Regresar al Paso 1
            this.goToStep(1);
            this.loadInvoicesHistory();

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
                    const resumenRef = this.db.collection('RESUMEN_SALIDAS_MES').doc(pId);
                    batch.set(resumenRef, {
                        cantidadFacturada: window.firebase.firestore.FieldValue.increment(-item.cantidad)
                    }, { merge: true });
                }
            });

            // 3. Buscar todos los registros de REGISTROS_SALIDA que tengan este facturaId para restaurarlos
            const registrosSnap = await this.registrosRef.where('facturaId', '==', facturaId).get();
            if (!registrosSnap.empty) {
                // Caso Nuevo/Preciso: Si tiene facturaId, los restauramos de inmediato
                registrosSnap.forEach(doc => {
                    const regRef = this.registrosRef.doc(doc.id);
                    batch.update(regRef, {
                        estado: 'pendiente',
                        facturaId: window.firebase.firestore.FieldValue.delete(),
                        precioFacturado: window.firebase.firestore.FieldValue.delete(),
                        costoFacturado: window.firebase.firestore.FieldValue.delete()
                    });
                });
            } else {
                // Caso Fallback (Facturas antiguas o sin facturaId):
                // Para cada producto de la factura, buscamos registros ya facturados con ese mismo nombre
                // y devolvemos la cantidad correspondiente a "pendiente"
                for (let item of items) {
                    const prodName = item.descripcionPapel || item.producto;
                    const qtyToRestore = item.cantidad || 0;
                    if (qtyToRestore <= 0) continue;

                    const querySnap = await this.registrosRef
                        .where('producto', '==', prodName)
                        .where('estado', '==', 'facturado')
                        .get();

                    let currentRestored = 0;
                    querySnap.forEach(doc => {
                        if (currentRestored >= qtyToRestore) return;

                        const regData = doc.data();
                        const regQty = regData.cantidad || 1;

                        if (currentRestored + regQty <= qtyToRestore) {
                            // Se puede restaurar el registro completo
                            const regRef = this.registrosRef.doc(doc.id);
                            batch.update(regRef, {
                                estado: 'pendiente',
                                precioFacturado: window.firebase.firestore.FieldValue.delete(),
                                costoFacturado: window.firebase.firestore.FieldValue.delete()
                            });
                            currentRestored += regQty;
                        } else {
                            // Restauración parcial: dividimos para ajustar la cantidad exacta
                            const leftOver = regQty - (qtyToRestore - currentRestored);
                            const regRef = this.registrosRef.doc(doc.id);
                            
                            // El original lo dejamos como facturado con la diferencia sobrante
                            batch.update(regRef, {
                                cantidad: leftOver
                            });

                            // Creamos uno nuevo pendiente con la cantidad restaurada
                            const newDocRef = this.registrosRef.doc();
                            batch.set(newDocRef, {
                                ...regData,
                                cantidad: qtyToRestore - currentRestored,
                                estado: 'pendiente',
                                timestamp: Date.now()
                            });
                            // Limpiar campos de facturación en el nuevo
                            batch.update(newDocRef, {
                                precioFacturado: window.firebase.firestore.FieldValue.delete(),
                                costoFacturado: window.firebase.firestore.FieldValue.delete(),
                                facturaId: window.firebase.firestore.FieldValue.delete()
                            });

                            currentRestored = qtyToRestore;
                        }
                    });
                }
            }

            // 4. Eliminar el documento de la factura
            batch.delete(this.db.collection('INVENTARIO_SALIDAS').doc(facturaId));

            await batch.commit();
            alert("✅ Factura anulada con éxito. Todos los productos han vuelto a estar Pendientes.");

            const inputNum = document.getElementById('factura-numero');
            if (inputNum) inputNum.value = '';

            // Recargar historial
            this.loadInvoicesHistory();

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
            
            // 1. Actualizar el principal clickeado
            const mainRef = this.db.collection('REGISTROS_SALIDA').doc(this.currentLinkRegistryId);
            batch.update(mainRef, {
                productId: product.id,
                producto: product.descripcion
            });

            // 2. Actualizar todos los demás registros pendientes con el mismo nombre
            const unlinkedDesc = this.currentLinkRegistryName;
            const snapshot = await this.db.collection('REGISTROS_SALIDA')
                .where('producto', '==', unlinkedDesc)
                .where('estado', '==', 'pendiente')
                .get();

            snapshot.forEach(doc => {
                if (doc.id !== this.currentLinkRegistryId) {
                    batch.update(doc.ref, {
                        productId: product.id,
                        producto: product.descripcion
                    });
                }
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
                        timestamp: Date.now()
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
            const mainRef = this.db.collection('REGISTROS_SALIDA').doc(this.currentLinkRegistryId);
            batch.update(mainRef, {
                productId: isService ? 'SERVICIO' : 'OMITIDO',
                producto: isService ? 'Mano de Obra / Servicio' : 'Item Omitido'
            });

            // 2. Actualizar todos los demás registros pendientes con el mismo nombre
            const snapshot = await this.db.collection('REGISTROS_SALIDA')
                .where('producto', '==', targetName)
                .where('estado', '==', 'pendiente')
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
                const resRef = this.db.collection('RESUMEN_SALIDAS_MES').doc(product.id);
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
                        timestamp: Date.now()
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
        const pendientes = this.allRegistros.filter(r => r.estado === 'pendiente');
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
                    batch.delete(this.registrosRef.doc(reg.id));
                    operationsCount++;

                    if (operationsCount >= 450) {
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
    goToBillingStep() {
        if (this.facturaItems.length === 0) {
            alert("Debes agregar al menos un repuesto, servicio o mano de obra.");
            return;
        }

        this.goToStep(3);

        // Pre-seleccionar tipo normal por defecto
        this.selectInvoiceType(this.facturaTipo || 'normal');
    },

    backToServicesStep() {
        this.goToStep(2);
    },

    backToRepuestosStep() {
        this.goToStep(1);
    },

    currentHistorialTab: 'list',
    switchHistorialTab(tabId) {
        this.currentHistorialTab = tabId;
        const listBtn = document.getElementById('tab-historial-list');
        const importBtn = document.getElementById('tab-historial-import');
        const listContent = document.getElementById('historial-tab-list-content');
        const importContent = document.getElementById('historial-tab-import-content');

        if (tabId === 'list') {
            listBtn.style.borderBottomColor = '#3498db';
            listBtn.style.color = '#3498db';
            importBtn.style.borderBottomColor = 'transparent';
            importBtn.style.color = '#718096';
            listContent.style.display = 'block';
            importContent.style.display = 'none';
            this.loadInvoicesHistory();
        } else {
            importBtn.style.borderBottomColor = '#3498db';
            importBtn.style.color = '#3498db';
            listBtn.style.borderBottomColor = 'transparent';
            listBtn.style.color = '#718096';
            listContent.style.display = 'none';
            importContent.style.display = 'block';
        }
    },

    allHistoricalInvoices: [],
    async openInvoicesHistoryModal() {
        if (typeof switchMainTab === 'function') {
            switchMainTab('historial');
        }
    },

    async loadInvoicesHistory() {
        this.loadMonthlyProfitsSummary();
        const tbody = document.getElementById('historial-invoices-tbody');
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px;"><div class="spinner" style="margin:auto; border-top-color:#3498db;"></div><p style="margin-top:10px; color:#718096;">Cargando historial...</p></td></tr>';

        try {
            const snapshot = await this.db.collection('INVENTARIO_SALIDAS')
                .orderBy('fecha', 'desc')
                .limit(150)
                .get();

            this.allHistoricalInvoices = [];
            snapshot.forEach(doc => {
                this.allHistoricalInvoices.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

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

            this.renderInvoicesHistory(this.allHistoricalInvoices);

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
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:#718096;"><i class="fas fa-folder-open" style="font-size:30px; margin-bottom:8px;"></i><br>No se encontraron facturas.</td></tr>';
            return;
        }

        invoices.forEach(inv => {
            const dateFormatted = this.formatDate(inv.fecha);
            const totalVal = typeof inv.total === 'number' ? inv.total : 0;
            const typeText = inv.tipo === 'repuestos' ? 'Repuestos' : 'Normal';
            const typeClass = inv.tipo === 'repuestos' ? 'status-pending' : 'status-invoiced';
            const sinVincular = !!inv.tieneItemsSinVincular;
            const alertaBadge = sinVincular
                ? `<span style="display:inline-flex;align-items:center;gap:3px;background:#fef3c7;color:#92400e;border:1px solid #f59e0b;border-radius:4px;padding:1px 7px;font-size:11px;font-weight:bold;margin-left:6px;"><i class='fas fa-exclamation-triangle'></i> Sin vincular</span>`
                : '';

            const tr = document.createElement('tr');
            if (sinVincular) tr.style.cssText = 'background:#fffbeb; border-left:4px solid #f59e0b;';
            tr.innerHTML = `
                <td style="padding: 12px; border: 1px solid #edf2f7; font-weight: 500;">${dateFormatted}</td>
                <td style="padding: 12px; border: 1px solid #edf2f7; font-weight: 600; color: #2d3748;">${inv.CLIENTE || 'Cliente General'}${alertaBadge}</td>
                <td style="padding: 12px; border: 1px solid #edf2f7; text-align: center; font-family: monospace; font-size: 0.95rem;">${inv.numeroFactura || '<span style="color:#cbd5e0;">-</span>'}</td>
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
                estadoHTML = `<span style="font-size:10px;color:#276749;background:#f0fff4;padding:1px 6px;border-radius:3px;margin-left:5px;font-weight:bold;"><i class='fas fa-check'></i> Vinculado</span>`;
            } else {
                estadoHTML = `<button class="btn" style="font-size:11px;padding:2px 8px;margin-left:6px;background:#fef3c7;color:#92400e;border:1px solid #f59e0b;border-radius:4px;cursor:pointer;" onclick="RegistrosApp.openLinkInvoiceItemModal('${id}',${itemIdx})"><i class='fas fa-link'></i> Vincular</button>`;
            }
            const tr = document.createElement('tr');
            if (!esServicio && !estaVinculado) tr.style.backgroundColor = '#fffbeb';
            tr.innerHTML = `
                <td style="text-align: center; border: 1px solid #edf2f7; padding: 8px; font-weight: bold;">${cant}</td>
                <td style="border: 1px solid #edf2f7; padding: 8px; font-size:13px;">${desc}${estadoHTML}</td>
                <td style="text-align: right; border: 1px solid #edf2f7; padding: 8px; color:#555;">$${unit.toFixed(2)}</td>
                <td style="text-align: right; border: 1px solid #edf2f7; padding: 8px; font-weight: bold;">$${tot.toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });

        const totalVal = typeof inv.total === 'number' ? inv.total : 0;
        document.getElementById('detail-invoice-total').innerText = "$" + totalVal.toFixed(2);

        // Enlazar el botón de anular factura dinámicamente
        const btnAnular = document.getElementById('btn-anular-factura');
        if (btnAnular) {
            btnAnular.onclick = () => {
                document.getElementById('modal-detalle-factura').style.display = 'none';
                RegistrosApp.deleteInvoice(id);
            };
        }

        document.getElementById('modal-detalle-factura').style.display = 'flex';
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

    printInvoiceDetail() {
        window.print();
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
    }
};

// Inicializar de forma segura
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => RegistrosApp.init());
} else {
    RegistrosApp.init();
}
