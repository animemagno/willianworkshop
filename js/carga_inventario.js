/**
 * js/carga_inventario.js
 * Lógica modular para carga y auditoría de inventario por mes
 * Taller Willian Workshop - 2026
 */

const CargaInventarioApp = {
    // Configuración Firebase
    firebaseConfig: {
        apiKey: "AIzaSyCaZdPPYddeMPTiNm5cCdFL6m9b9swX0-c",
        authDomain: "williantaller-1426b.firebaseapp.com",
        projectId: "williantaller-1426b",
        storageBucket: "williantaller-1426b.firebasestorage.app",
        messagingSenderId: "757966587061",
        appId: "1:757966587061:web:6c700e862317119d64aafc"
    },
    
    db: null,
    mesActual: '2026-09',
    numProveedores: 0, // Cantidad de columnas de proveedores (por defecto 0 si no se usan)
    nombresProveedores: [], // Nombres extraídos del Excel o configurados
    columnasProveedores: [], // Índices de columnas de cada proveedor en el Excel
    headersExcelDetectados: [], // Encabezados extraídos de la primera fila
    opcionesColsDetectadas: [], // Lista de opciones de columnas para los selectores
    datosPegados: [],
    datosComparacion: null, // Datos del mes de referencia (ej. Septiembre si cargamos Agosto)
    mesReferencia: null,
    tipoReferencia: null, // 'siguiente' | 'anterior' | null
    filtroActivo: 'todos', // 'todos' | 'discrepancias' | 'cuadran'
    cacheMesesGuardados: {}, // Cache local en memoria de meses guardados

    // Nombres legibles para meses
    mesesNombresLista: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],

    init: async function() {
        console.log("Iniciando Módulo de Carga de Inventario por Mes...");
        
        // Inicializar Firebase si es necesario
        if (!firebase.apps.length) {
            firebase.initializeApp(this.firebaseConfig);
        }
        this.db = firebase.firestore();

        // Cargar mes y año seleccionados desde los selectores
        const selMes = document.getElementById('select-mes-nombre');
        const selAnio = document.getElementById('select-anio');
        if (selMes && selAnio) {
            this.mesActual = `${selAnio.value}-${selMes.value}`;
        }

        // Cargar cantidad de proveedores guardada para este mes si existe
        const provGuardados = localStorage.getItem(`num_prov_${this.mesActual}`);
        if (provGuardados !== null) {
            this.numProveedores = parseInt(provGuardados) || 0;
        } else {
            this.numProveedores = 0;
        }

        const colProvGuardadas = localStorage.getItem(`col_prov_${this.mesActual}`);
        if (colProvGuardadas) {
            try { this.columnasProveedores = JSON.parse(colProvGuardadas); } catch (e) {}
        } else {
            this.columnasProveedores = [];
        }

        const nomProvGuardados = localStorage.getItem(`nom_prov_${this.mesActual}`);
        if (nomProvGuardados) {
            try { this.nombresProveedores = JSON.parse(nomProvGuardados); } catch (e) {}
        } else {
            this.nombresProveedores = [];
        }

        this.actualizarSelectorProveedoresUI();
        this.actualizarEtiquetasMes();
        this.recuperarBorradorLocal();
        await this.cargarCacheMesesGuardados();
        await this.detectarMesReferencia();
    },

    // Ajustar número de proveedores con botones + y -
    ajustarProveedores: function(delta) {
        let nuevo = this.numProveedores + delta;
        if (nuevo < 0) nuevo = 0;
        if (nuevo > 15) nuevo = 15;
        this.setNumProveedores(nuevo);
    },

    // Establecer número de proveedores desde el selector
    setNumProveedores: function(val) {
        const num = parseInt(val) || 0;
        this.numProveedores = num;
        localStorage.setItem(`num_prov_${this.mesActual}`, num);
        this.actualizarSelectorProveedoresUI();
        this.renderizarSelectoresProveedores();

        // Si hay panel de mapeo abierto, actualizar mini preview
        const panel = document.getElementById('panel-mapeo-columnas');
        if (panel && panel.style.display !== 'none') {
            this.renderizarMiniPreview();
        }
    },

    actualizarSelectorProveedoresUI: function() {
        const sel = document.getElementById('select-num-proveedores');
        if (sel) {
            sel.value = String(this.numProveedores);
        }
    },

    // Renderizar tarjetas de mapeo y nombres de proveedores
    renderizarSelectoresProveedores: function() {
        const container = document.getElementById('container-proveedores-mapeo');
        const grid = document.getElementById('grid-proveedores-columnas');
        if (!container || !grid) return;

        const num = this.numProveedores;
        if (num <= 0) {
            container.style.display = 'none';
            grid.innerHTML = '';
            return;
        }

        container.style.display = 'block';

        const totalCols = this.opcionesColsDetectadas ? this.opcionesColsDetectadas.length : 0;
        const headers = this.headersExcelDetectados || [];

        // Identificar columnas ya ocupadas por campos fijos
        const colCod = parseInt(document.getElementById('map-col-codigo')?.value) ?? -1;
        const colDesc = parseInt(document.getElementById('map-col-descripcion')?.value) ?? -1;
        const colCosto = parseInt(document.getElementById('map-col-costo-con-iva')?.value) ?? -1;
        const colPrecio = parseInt(document.getElementById('map-col-precio-venta')?.value) ?? -1;
        const colStockIni = parseInt(document.getElementById('map-col-stock-inicial')?.value) ?? -1;
        const colStockFin = parseInt(document.getElementById('map-col-stock-final')?.value) ?? -1;
        const colVentas = parseInt(document.getElementById('map-col-ventas')?.value) ?? -1;
        const colsFijasOcupadas = new Set([colCod, colDesc, colCosto, colPrecio, colStockIni, colStockFin, colVentas].filter(c => c >= 0));

        // Ajustar tamaño de arrays
        while (this.columnasProveedores.length < num) {
            this.columnasProveedores.push(-1);
        }
        while (this.nombresProveedores.length < num) {
            this.nombresProveedores.push('');
        }

        // Autoasignar columnas para proveedores que aún no tengan asignación
        for (let p = 0; p < num; p++) {
            if (this.columnasProveedores[p] === -1 || this.columnasProveedores[p] === undefined || (totalCols > 0 && this.columnasProveedores[p] >= totalCols)) {
                const yaAsignadas = new Set(this.columnasProveedores.filter(c => c >= 0));
                for (let c = 0; c < totalCols; c++) {
                    if (!colsFijasOcupadas.has(c) && !yaAsignadas.has(c)) {
                        this.columnasProveedores[p] = c;
                        break;
                    }
                }
            }

            // Tomar el título de la columna del Excel
            const cIdx = this.columnasProveedores[p];
            if (cIdx >= 0 && headers[cIdx] && headers[cIdx].trim()) {
                if (!this.nombresProveedores[p] || this.nombresProveedores[p].startsWith('Proveedor ')) {
                    this.nombresProveedores[p] = headers[cIdx].trim();
                }
            } else if (!this.nombresProveedores[p]) {
                this.nombresProveedores[p] = `Proveedor ${p + 1}`;
            }
        }

        let html = '';
        for (let p = 0; p < num; p++) {
            const colActual = this.columnasProveedores[p] !== undefined ? this.columnasProveedores[p] : -1;
            const nomActual = this.nombresProveedores[p] || (colActual >= 0 && headers[colActual] ? headers[colActual].trim() : `Proveedor ${p + 1}`);

            let opcionesHtml = '<option value="-1">(Ninguno / No aplica)</option>';
            if (this.opcionesColsDetectadas && this.opcionesColsDetectadas.length > 0) {
                this.opcionesColsDetectadas.forEach(op => {
                    const sel = (op.index === colActual) ? 'selected' : '';
                    opcionesHtml += `<option value="${op.index}" ${sel}>${op.label}</option>`;
                });
            }

            html += `
                <div style="background: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.8rem; font-weight: 800; color: #166534; display: flex; align-items: center; gap: 5px;">
                            <i class="fas fa-truck"></i> Proveedor ${p + 1}:
                        </span>
                        <span style="font-size: 0.72rem; color: #15803d; font-weight: 600; background: #dcfce7; padding: 1px 6px; border-radius: 4px;">
                            ${colActual >= 0 ? `Columna ${colActual + 1}` : 'Sin asignar'}
                        </span>
                    </div>
                    <div>
                        <label style="font-size: 0.72rem; font-weight: 700; color: #374151; margin-bottom: 2px; display: block;">
                            Columna en tu Excel:
                        </label>
                        <select id="map-col-prov-${p}" onchange="CargaInventarioApp.onCambioColumnaProveedor(${p})" style="width: 100%; font-size: 0.8rem; padding: 5px 8px; border: 1px solid #86efac; border-radius: 6px; background: #ffffff; color: #1e293b;">
                            ${opcionesHtml}
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 0.72rem; font-weight: 700; color: #374151; margin-bottom: 2px; display: block;">
                            Nombre / Título detectado:
                        </label>
                        <input type="text" id="input-nombre-prov-${p}" value="${nomActual.replace(/"/g, '&quot;')}" oninput="CargaInventarioApp.onCambioNombreProveedor(${p}, this.value)" placeholder="Título o nombre del proveedor" style="width: 100%; font-size: 0.8rem; padding: 5px 8px; border: 1px solid #86efac; border-radius: 6px; background: #ffffff; color: #065f46; font-weight: 700;">
                    </div>
                </div>
            `;
        }

        grid.innerHTML = html;
        this.guardarConfigProveedoresLocal();
    },

    onCambioColumnaProveedor: function(pIndex) {
        const select = document.getElementById(`map-col-prov-${pIndex}`);
        if (!select) return;
        const colIdx = parseInt(select.value);
        this.columnasProveedores[pIndex] = colIdx;

        // Tomar automáticamente el título del Excel si la columna seleccionada tiene encabezado
        const headers = this.headersExcelDetectados || [];
        if (colIdx >= 0 && headers[colIdx] && headers[colIdx].trim()) {
            const nuevoNom = headers[colIdx].trim();
            this.nombresProveedores[pIndex] = nuevoNom;
            const inputNom = document.getElementById(`input-nombre-prov-${pIndex}`);
            if (inputNom) {
                inputNom.value = nuevoNom;
            }
        }

        this.guardarConfigProveedoresLocal();
        this.renderizarMiniPreview();
    },

    onCambioNombreProveedor: function(pIndex, nuevoNombre) {
        this.nombresProveedores[pIndex] = (nuevoNombre || '').trim();
        this.guardarConfigProveedoresLocal();
        this.renderizarMiniPreview();
    },

    guardarConfigProveedoresLocal: function() {
        localStorage.setItem(`col_prov_${this.mesActual}`, JSON.stringify(this.columnasProveedores));
        localStorage.setItem(`nom_prov_${this.mesActual}`, JSON.stringify(this.nombresProveedores));
    },

    // Obtener nombre formateado del mes (dinámico para cualquier año y mes)
    getNombreMes: function(mesKey) {
        if (!mesKey || typeof mesKey !== 'string') return '';
        const parts = mesKey.split('-');
        if (parts.length === 2) {
            const y = parts[0];
            const m = parseInt(parts[1], 10);
            if (m >= 1 && m <= 12) {
                return `${this.mesesNombresLista[m - 1]} ${y}`;
            }
        }
        return mesKey;
    },

    // Evento disparado al cambiar Mes o Año en los selectores
    onCambioMesAnio: function() {
        const selMes = document.getElementById('select-mes-nombre');
        const selAnio = document.getElementById('select-anio');
        if (selMes && selAnio) {
            const nuevoMes = `${selAnio.value}-${selMes.value}`;
            this.cambiarMes(nuevoMes);
        }
    },

    // Actualizar etiquetas en la interfaz
    actualizarEtiquetasMes: function() {
        const nombre = this.getNombreMes(this.mesActual);
        const lblActual = document.getElementById('label-mes-actual');
        const lblPaso1 = document.getElementById('label-mes-paso1');
        const lblPreview = document.getElementById('label-mes-preview');
        const selMes = document.getElementById('select-mes-nombre');
        const selAnio = document.getElementById('select-anio');
        
        if (lblActual) lblActual.textContent = nombre;
        if (lblPaso1) lblPaso1.textContent = nombre;
        if (lblPreview) lblPreview.textContent = nombre;

        if (this.mesActual) {
            const parts = this.mesActual.split('-');
            if (parts.length === 2) {
                if (selAnio && selAnio.value !== parts[0]) selAnio.value = parts[0];
                if (selMes && selMes.value !== parts[1]) selMes.value = parts[1];
            }
        }
    },

    // Cambiar de mes de trabajo
    cambiarMes: async function(nuevoMes) {
        this.mesActual = nuevoMes;
        this.actualizarEtiquetasMes();
        
        // Cargar proveedores del mes si tenía configurado
        const provGuardados = localStorage.getItem(`num_prov_${this.mesActual}`);
        if (provGuardados !== null) {
            this.numProveedores = parseInt(provGuardados) || 0;
        } else {
            this.numProveedores = 0;
        }
        const colProvGuardadas = localStorage.getItem(`col_prov_${this.mesActual}`);
        if (colProvGuardadas) {
            try { this.columnasProveedores = JSON.parse(colProvGuardadas); } catch (e) {}
        } else {
            this.columnasProveedores = [];
        }
        const nomProvGuardados = localStorage.getItem(`nom_prov_${this.mesActual}`);
        if (nomProvGuardados) {
            try { this.nombresProveedores = JSON.parse(nomProvGuardados); } catch (e) {}
        } else {
            this.nombresProveedores = [];
        }
        this.actualizarSelectorProveedoresUI();
        this.renderizarSelectoresProveedores();

        // Guardar borrador actual si existe y cargar borrador del nuevo mes si tiene
        this.recuperarBorradorLocal();
        await this.detectarMesReferencia();
        
        if (this.datosPegados.length > 0) {
            this.auditarContraMesReferencia();
            this.renderizarVistaPrevia();
        } else {
            const previewSec = document.getElementById('section-preview');
            if (previewSec) previewSec.style.display = 'none';
        }
    },

    // Configurar auditoría interna de los datos del mes
    detectarMesReferencia: async function() {
        this.mesReferencia = null;
        this.tipoReferencia = null;
        this.datosComparacion = null;
        const nombre = this.getNombreMes(this.mesActual);
        this.actualizarBannerComparacion(
            `Comprobación de Datos Ingresados: ${nombre}`,
            `Auditando cuadratura interna: Inventario Inicial + Entradas (Proveedores) - Ventas = Stock Final del Mes.`
        );
    },

    actualizarBannerComparacion: function(titulo, detalle) {
        const t = document.getElementById('titulo-comparacion');
        const d = document.getElementById('detalle-comparacion');
        if (t) t.textContent = titulo;
        if (d) d.textContent = detalle;
    },

    // Cargar cache de meses ya guardados en Firestore
    cargarCacheMesesGuardados: async function() {
        try {
            const snap = await this.db.collection('INVENTARIO_HISTORIAL_MESES').get();
            this.cacheMesesGuardados = {};
            snap.forEach(doc => {
                this.cacheMesesGuardados[doc.id] = doc.data();
            });
        } catch (e) {
            console.error("Error cargando cache de meses:", e);
        }
    },

    // Obtener productos de un mes específico desde Firestore o localStorage
    obtenerProductosDeMes: async function(mesKey) {
        const local = localStorage.getItem(`inventario_guardado_${mesKey}`);
        if (local) {
            try {
                return JSON.parse(local);
            } catch (e) {}
        }

        try {
            const subSnap = await this.db.collection('INVENTARIO_HISTORIAL_MESES')
                .doc(mesKey)
                .collection('PRODUCTOS')
                .get();

            if (!subSnap.empty) {
                const list = [];
                subSnap.forEach(d => list.push(d.data()));
                localStorage.setItem(`inventario_guardado_${mesKey}`, JSON.stringify(list));
                return list;
            }
        } catch (e) {
            console.warn(`No se pudo leer productos de ${mesKey}:`, e);
        }

        return null;
    },

    // Limpiar el área de texto
    limpiarPegado: function() {
        const txt = document.getElementById('txt-excel-paste');
        if (txt) txt.value = '';
        this.datosPegados = [];
        localStorage.removeItem(`draft_carga_inventario_${this.mesActual}`);
        const previewSec = document.getElementById('section-preview');
        if (previewSec) previewSec.style.display = 'none';
        
        const panelMapeo = document.getElementById('panel-mapeo-columnas');
        if (panelMapeo) panelMapeo.style.display = 'none';

        const miniTbody = document.getElementById('mini-preview-tbody');
        if (miniTbody) miniTbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #94a3b8;">Pega datos para ver la muestra</td></tr>';

        const statusInfo = document.getElementById('txt-status-info');
        if (statusInfo) {
            statusInfo.innerHTML = '<i class="fas fa-info-circle"></i> Cuadro limpio. Puedes pegar nuevos datos.';
        }
    },

    // Guardar borrador localmente en el navegador
    guardarBorradorLocal: function() {
        if (this.datosPegados && this.datosPegados.length > 0) {
            localStorage.setItem(`draft_carga_inventario_${this.mesActual}`, JSON.stringify(this.datosPegados));
            localStorage.setItem(`draft_prov_${this.mesActual}`, JSON.stringify({
                num: this.numProveedores,
                nombres: this.nombresProveedores,
                columnas: this.columnasProveedores
            }));
        }
    },

    // Recuperar borrador si el usuario refresca la página
    recuperarBorradorLocal: function() {
        const draft = localStorage.getItem(`draft_carga_inventario_${this.mesActual}`);
        const draftProv = localStorage.getItem(`draft_prov_${this.mesActual}`);
        
        if (draftProv) {
            try {
                const pInfo = JSON.parse(draftProv);
                if (pInfo.num !== undefined) this.numProveedores = pInfo.num;
                if (pInfo.nombres) this.nombresProveedores = pInfo.nombres;
                if (pInfo.columnas) this.columnasProveedores = pInfo.columnas;
                this.actualizarSelectorProveedoresUI();
                this.renderizarSelectoresProveedores();
            } catch (e) {}
        }

        if (draft) {
            try {
                this.datosPegados = JSON.parse(draft);
                if (this.datosPegados.length > 0) {
                    this.auditarContraMesReferencia();
                    this.renderizarVistaPrevia();
                    const statusInfo = document.getElementById('txt-status-info');
                    if (statusInfo) {
                        statusInfo.innerHTML = `<i class="fas fa-check-circle" style="color: #059669;"></i> Se recuperó tu borrador anterior (${this.datosPegados.length} productos).`;
                    }
                }
            } catch (e) {
                console.error("Error recuperando borrador:", e);
            }
        }

        // Si ya hay texto en el cuadro al iniciar, analizar mapeo
        const txt = document.getElementById('txt-excel-paste');
        if (txt && txt.value.trim().length > 0) {
            this.onPegadoCambiado();
        }
    },

    // Extraer celdas de una línea respetando tabulaciones
    extraerCeldasLinea: function(linea) {
        if (!linea) return [];
        linea = linea.replace(/\r$/, '');
        let celdas = linea.split('\t');
        if (celdas.length < 3) {
            if (linea.includes(';')) celdas = linea.split(';');
            else if (linea.includes(',')) celdas = linea.split(',');
        }
        return celdas.map(c => c.trim());
    },

    // Disparado en cada cambio de texto en el textarea
    onPegadoCambiado: function() {
        const txtInput = document.getElementById('txt-excel-paste');
        const rawText = txtInput ? txtInput.value.trim() : '';
        const panel = document.getElementById('panel-mapeo-columnas');

        if (!rawText) {
            if (panel) panel.style.display = 'none';
            return;
        }

        this.analizarYRenderizarMapeo(rawText);
    },

    // Analizar encabezados y columnas del texto pegado
    analizarYRenderizarMapeo: function(rawText) {
        const panel = document.getElementById('panel-mapeo-columnas');
        if (!panel) return;

        const lineas = rawText.split(/\r\n|\n|\r/).filter(l => l && l.trim().length > 0);
        if (lineas.length === 0) {
            panel.style.display = 'none';
            return;
        }

        const fila0 = this.extraerCeldasLinea(lineas[0]);
        const fila1 = lineas.length > 1 ? this.extraerCeldasLinea(lineas[1]) : [];

        // Detectar si la primera fila es encabezado
        const textoFila0 = fila0.join(' ').toUpperCase();
        const tieneEncabezados = textoFila0.includes('CODIGO') || 
                                 textoFila0.includes('DESC') || 
                                 textoFila0.includes('COSTO') || 
                                 textoFila0.includes('PRECIO') || 
                                 textoFila0.includes('STOCK') || 
                                 textoFila0.includes('VENTA') ||
                                 textoFila0.includes('EXISTENCIA');

        const headers = tieneEncabezados ? fila0 : [];
        const muestra = tieneEncabezados ? (fila1.length > 0 ? fila1 : fila0) : fila0;
        const totalCols = Math.max(fila0.length, fila1.length);

        if (totalCols === 0) {
            panel.style.display = 'none';
            return;
        }

        const badge = document.getElementById('badge-total-columnas');
        if (badge) {
            badge.textContent = `${totalCols} columnas detectadas`;
        }

        // Construir opciones
        const opcionesCols = [];
        for (let i = 0; i < totalCols; i++) {
            const h = headers[i] || `Columna ${i + 1}`;
            const s = (muestra[i] !== undefined && muestra[i] !== '') ? ` ("${muestra[i].substring(0, 16)}")` : '';
            opcionesCols.push({ index: i, label: `Col. ${i + 1}: ${h}${s}`, headerClean: (headers[i] || '').toUpperCase() });
        }

        // Guardar encabezados y opciones detectadas en la app
        this.headersExcelDetectados = headers;
        this.opcionesColsDetectadas = opcionesCols;

        // Leer mapeo previo guardado si coincide en columnas
        const mapeoGuardado = localStorage.getItem('mapeo_columnas_carga');
        let mapeo = null;
        if (mapeoGuardado) {
            try { mapeo = JSON.parse(mapeoGuardado); } catch (e) {}
        }

        const autodetectar = (regexList, fallbackIndex, allowNone = false) => {
            if (tieneEncabezados) {
                for (const col of opcionesCols) {
                    for (const rx of regexList) {
                        if (rx.test(col.headerClean)) {
                            return col.index;
                        }
                    }
                }
            }
            if (fallbackIndex !== undefined && fallbackIndex < totalCols && fallbackIndex >= 0) {
                return fallbackIndex;
            }
            return allowNone ? -1 : 0;
        };

        const configCampos = [
            { id: 'map-col-codigo', clave: 'codigo', regex: [/CODIGO.*(BARRA|PRODUCTO|INTERNO)?$/i, /COD(IGO)?$/i, /ITEM/i, /REFERENCIA/i, /ARTICULO/i], fallback: totalCols >= 11 ? 1 : 0, required: true },
            { id: 'map-col-codigo-fel', clave: 'codigoFel', regex: [/FEL/i], fallback: totalCols >= 11 ? 0 : -1, required: false },
            { id: 'map-col-descripcion', clave: 'descripcion', regex: [/DESCRIPCION.*(INVENTARIO|TALLER|PRODUCTO)?$/i, /DESC(RIPCION)?$/i, /PRODUCTO/i, /NOMBRE/i], fallback: totalCols >= 11 ? 2 : (totalCols > 1 ? 1 : 0), required: true },
            { id: 'map-col-descripcion-factura', clave: 'descripcionFactura', regex: [/FACTURA/i, /DESC.*FAC/i], fallback: totalCols >= 11 ? 3 : -1, required: false },
            { id: 'map-col-costo-sin-iva', clave: 'costoSinIva', regex: [/SIN.*IVA/i, /S\/IVA/i, /NETO/i], fallback: totalCols >= 11 ? 4 : -1, required: false },
            { id: 'map-col-costo-con-iva', clave: 'costoConIva', regex: [/CON.*IVA/i, /C\/IVA/i, /COSTO/i], fallback: totalCols >= 11 ? 5 : (totalCols > 2 ? 2 : 0), required: true },
            { id: 'map-col-precio-venta', clave: 'precioVenta', regex: [/VENTA/i, /PRECIO/i, /PVP/i], fallback: totalCols >= 11 ? 6 : (totalCols > 3 ? 3 : -1), required: false },
            { id: 'map-col-stock-inicial', clave: 'stockInicial', regex: [/INICIAL/i, /PASADO/i, /ANTERIOR/i], fallback: totalCols >= 11 ? (totalCols - 1) : -1, required: true },
            { id: 'map-col-stock-final', clave: 'stockFinal', regex: [/FINAL/i, /EXISTENCIA/i, /ACTUAL/i, /STOCK/i], fallback: totalCols >= 11 ? 8 : (totalCols > 4 ? 4 : 0), required: true },
            { id: 'map-col-ventas', clave: 'ventas', regex: [/VENTA(S)?/i, /SALIDA(S)?/i], fallback: totalCols >= 11 ? 9 : -1, required: true }
        ];

        configCampos.forEach(campo => {
            const selectEl = document.getElementById(campo.id);
            if (!selectEl) return;

            // Todas las columnas tienen la opción Ninguno / No aplica
            let html = '<option value="-1">(Ninguno / No aplica)</option>';

            opcionesCols.forEach(op => {
                html += `<option value="${op.index}">${op.label}</option>`;
            });
            selectEl.innerHTML = html;

            let valSeleccionado;
            if (mapeo && mapeo[campo.clave] !== undefined && mapeo[campo.clave] < totalCols) {
                valSeleccionado = mapeo[campo.clave];
            } else {
                valSeleccionado = autodetectar(campo.regex, campo.fallback, true);
            }
            selectEl.value = String(valSeleccionado);
        });

        panel.style.display = 'block';
        this.renderizarSelectoresProveedores();
        this.renderizarMiniPreview(lineas, tieneEncabezados);
    },

    // Disparado cuando el usuario cambia manualmente una columna en el selector
    onCambioMapeoColumna: function() {
        const mapeo = {
            codigo: parseInt(document.getElementById('map-col-codigo')?.value) ?? 1,
            codigoFel: parseInt(document.getElementById('map-col-codigo-fel')?.value) ?? -1,
            descripcion: parseInt(document.getElementById('map-col-descripcion')?.value) ?? 2,
            descripcionFactura: parseInt(document.getElementById('map-col-descripcion-factura')?.value) ?? -1,
            costoSinIva: parseInt(document.getElementById('map-col-costo-sin-iva')?.value) ?? -1,
            costoConIva: parseInt(document.getElementById('map-col-costo-con-iva')?.value) ?? 5,
            precioVenta: parseInt(document.getElementById('map-col-precio-venta')?.value) ?? 6,
            stockInicial: parseInt(document.getElementById('map-col-stock-inicial')?.value) ?? -1,
            stockFinal: parseInt(document.getElementById('map-col-stock-final')?.value) ?? 8,
            ventas: parseInt(document.getElementById('map-col-ventas')?.value) ?? 9
        };
        localStorage.setItem('mapeo_columnas_carga', JSON.stringify(mapeo));
        this.renderizarSelectoresProveedores();
        this.renderizarMiniPreview();
    },

    // Renderizar la muestra inmediata de las primeras filas con las columnas seleccionadas
    renderizarMiniPreview: function(lineas, tieneEncabezados) {
        const tbody = document.getElementById('mini-preview-tbody');
        if (!tbody) return;

        if (!lineas) {
            const txt = document.getElementById('txt-excel-paste');
            const raw = txt ? txt.value.trim() : '';
            lineas = raw.split(/\r\n|\n|\r/).filter(l => l && l.trim().length > 0);
            if (lineas.length === 0) return;
            const fila0 = this.extraerCeldasLinea(lineas[0]);
            const textoFila0 = fila0.join(' ').toUpperCase();
            tieneEncabezados = textoFila0.includes('CODIGO') || textoFila0.includes('DESC') || textoFila0.includes('STOCK') || textoFila0.includes('VENTA');
        }

        const startIdx = tieneEncabezados ? 1 : 0;
        const filasMuestra = lineas.slice(startIdx, startIdx + 4);

        const colCod = parseInt(document.getElementById('map-col-codigo')?.value) ?? 1;
        const colDesc = parseInt(document.getElementById('map-col-descripcion')?.value) ?? 2;
        const colCostoCiva = parseInt(document.getElementById('map-col-costo-con-iva')?.value) ?? 5;
        const colPrecio = parseInt(document.getElementById('map-col-precio-venta')?.value) ?? 6;
        const colStockIni = parseInt(document.getElementById('map-col-stock-inicial')?.value) ?? -1;
        const colVentas = parseInt(document.getElementById('map-col-ventas')?.value) ?? 9;
        const colStockFin = parseInt(document.getElementById('map-col-stock-final')?.value) ?? 8;

        // Renderizar encabezados dinámicos del mini-preview
        const trHeader = document.getElementById('mini-preview-thead-tr');
        if (trHeader) {
            let ths = `<th style="width: 35px; text-align: center;">#</th>`;
            if (colCod >= 0) ths += `<th>Código</th>`;
            if (colDesc >= 0) ths += `<th>Descripción</th>`;
            if (colCostoCiva >= 0) ths += `<th style="text-align: right;">Costo c/IVA</th>`;
            if (colPrecio >= 0) ths += `<th style="text-align: right;">Precio</th>`;
            if (colStockIni >= 0) ths += `<th style="text-align: center; background: #fffbeb; color: #92400e;">Inv. Inicial</th>`;

            // Una sola columna consolidada de Entradas (suma de proveedores)
            ths += `<th style="text-align: center; background: #d1fae5; color: #065f46; font-weight: 800;">Entradas</th>`;
            ths += `<th style="text-align: center; background: #fef3c7; color: #92400e; font-weight: 800;">Inicio + Entradas</th>`;

            if (colVentas >= 0) ths += `<th style="text-align: center; background: #fef2f2; color: #991b1b;">Ventas</th>`;
            if (colStockFin >= 0) ths += `<th style="text-align: center; background: #eff6ff; color: #1e40af;">Inv. Final</th>`;
            trHeader.innerHTML = ths;
        }

        let totalColumnasActivas = 3; // # + Entradas + Inicio+Entradas
        if (colCod >= 0) totalColumnasActivas++;
        if (colDesc >= 0) totalColumnasActivas++;
        if (colCostoCiva >= 0) totalColumnasActivas++;
        if (colPrecio >= 0) totalColumnasActivas++;
        if (colStockIni >= 0) totalColumnasActivas++;
        if (colVentas >= 0) totalColumnasActivas++;
        if (colStockFin >= 0) totalColumnasActivas++;

        if (filasMuestra.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${totalColumnasActivas}" style="text-align:center; color:#94a3b8;">Sin filas de datos</td></tr>`;
            return;
        }

        let html = '';
        filasMuestra.forEach((lin, i) => {
            const celdas = this.extraerCeldasLinea(lin);
            const cod = (colCod >= 0 && celdas[colCod]) ? celdas[colCod] : '-';
            const desc = (colDesc >= 0 && celdas[colDesc]) ? celdas[colDesc] : '-';
            const costo = colCostoCiva >= 0 ? this.parseNumero(celdas[colCostoCiva]) : 0;
            const precio = colPrecio >= 0 ? this.parseNumero(celdas[colPrecio]) : 0;
            const ini = colStockIni >= 0 ? this.parseNumero(celdas[colStockIni]) : 0;
            const ventas = colVentas >= 0 ? this.parseNumero(celdas[colVentas]) : 0;
            const fin = colStockFin >= 0 ? this.parseNumero(celdas[colStockFin]) : 0;

            let filaHtml = `<tr><td style="font-weight:bold; color:#64748b; text-align: center;">${i + 1}</td>`;
            if (colCod >= 0) filaHtml += `<td style="font-weight:700; color:#1e293b;">${cod}</td>`;
            if (colDesc >= 0) filaHtml += `<td style="color:#334155;">${desc}</td>`;
            if (colCostoCiva >= 0) filaHtml += `<td style="text-align:right; font-family:monospace; color:#059669;">$${costo.toFixed(2)}</td>`;
            if (colPrecio >= 0) filaHtml += `<td style="text-align:right; font-family:monospace; color:#2563eb;">$${precio.toFixed(2)}</td>`;
            if (colStockIni >= 0) filaHtml += `<td style="text-align:center; font-weight:700; color:#d97706; background:#fffbeb;">${ini}</td>`;

            let totalComprasFila = 0;
            for (let p = 0; p < this.numProveedores; p++) {
                const colP = this.columnasProveedores[p] !== undefined ? this.columnasProveedores[p] : -1;
                const cantP = (colP >= 0 && colP < celdas.length) ? this.parseNumero(celdas[colP]) : 0;
                totalComprasFila += cantP;
            }

            // Una sola columna de Entradas e Inicio + Entradas
            filaHtml += `<td style="text-align:center; font-weight:800; color:#065f46; background:#d1fae5;">${totalComprasFila}</td>`;
            filaHtml += `<td style="text-align:center; font-weight:800; color:#92400e; background:#fef3c7;">${ini + totalComprasFila}</td>`;

            if (colVentas >= 0) filaHtml += `<td style="text-align:center; font-weight:700; color:#dc2626; background:#fef2f2;">${ventas}</td>`;
            if (colStockFin >= 0) filaHtml += `<td style="text-align:center; font-weight:700; color:#059669; background:#eff6ff;">${fin}</td>`;
            filaHtml += `</tr>`;

            html += filaHtml;
        });

        tbody.innerHTML = html;
    },

    // PROCESAR EL TEXTO PEGADO DESDE EXCEL
    procesarPegado: function() {
        const txtInput = document.getElementById('txt-excel-paste');
        const rawText = txtInput ? txtInput.value.trim() : '';

        if (!rawText) {
            Swal.fire({
                icon: 'warning',
                title: 'No hay datos para procesar',
                text: 'Por favor, copia las celdas desde tu Excel (Ctrl+C) y pégalas en el cuadro antes de procesar.',
                confirmButtonColor: '#2563eb'
            });
            return;
        }

        // Si el panel de mapeo no estaba visible, inicializarlo
        const panel = document.getElementById('panel-mapeo-columnas');
        if (!panel || panel.style.display === 'none') {
            this.analizarYRenderizarMapeo(rawText);
        }

        // Leer mapeo configurado por el usuario
        const colCodigo = parseInt(document.getElementById('map-col-codigo')?.value) ?? 1;
        const colCodigoFel = parseInt(document.getElementById('map-col-codigo-fel')?.value) ?? -1;
        const colDescripcion = parseInt(document.getElementById('map-col-descripcion')?.value) ?? 2;
        const colDescripcionFactura = parseInt(document.getElementById('map-col-descripcion-factura')?.value) ?? -1;
        const colCostoSinIva = parseInt(document.getElementById('map-col-costo-sin-iva')?.value) ?? -1;
        const colCostoConIva = parseInt(document.getElementById('map-col-costo-con-iva')?.value) ?? 5;
        const colPrecioVenta = parseInt(document.getElementById('map-col-precio-venta')?.value) ?? -1;
        const colStockInicial = parseInt(document.getElementById('map-col-stock-inicial')?.value) ?? -1;
        const colStockFinal = parseInt(document.getElementById('map-col-stock-final')?.value) ?? 8;
        const colVentas = parseInt(document.getElementById('map-col-ventas')?.value) ?? 9;

        // Separar por filas
        const lineas = rawText.split(/\r\n|\n|\r/);
        const filasProcesadas = [];
        let filaEncabezadoOmitida = false;
        const numProv = this.numProveedores;

        // Leer configuración de proveedores desde los selectores e inputs
        const columnasProv = [];
        const nombresProv = [];
        for (let p = 0; p < numProv; p++) {
            const selectP = document.getElementById(`map-col-prov-${p}`);
            const inputP = document.getElementById(`input-nombre-prov-${p}`);
            const colIdx = selectP ? parseInt(selectP.value) : (this.columnasProveedores[p] ?? -1);
            let nom = inputP ? inputP.value.trim() : (this.nombresProveedores[p] || '');
            columnasProv.push(colIdx);
            nombresProv.push(nom);
        }
        this.columnasProveedores = columnasProv;
        this.nombresProveedores = nombresProv;

        for (let i = 0; i < lineas.length; i++) {
            let linea = lineas[i];
            if (!linea || !linea.trim()) continue;

            const celdas = this.extraerCeldasLinea(linea);

            // Detección inteligente de fila de encabezados
            if (i === 0 || (!filaEncabezadoOmitida && i < 2)) {
                const lineaUpper = linea.toUpperCase();
                if (lineaUpper.includes('CODIGO') || lineaUpper.includes('DESCRIPCION') || lineaUpper.includes('STOCK') || lineaUpper.includes('COSTO') || lineaUpper.includes('VENTA')) {
                    filaEncabezadoOmitida = true;
                    // Asignar nombres de columnas de proveedores si aún no tienen o si tienen el por defecto
                    for (let p = 0; p < numProv; p++) {
                        const colIdx = this.columnasProveedores[p];
                        if (colIdx >= 0 && celdas[colIdx] && celdas[colIdx].trim()) {
                            if (!this.nombresProveedores[p] || this.nombresProveedores[p].startsWith('Proveedor ')) {
                                this.nombresProveedores[p] = celdas[colIdx].trim();
                            }
                        }
                        if (!this.nombresProveedores[p]) {
                            this.nombresProveedores[p] = `Proveedor ${p + 1}`;
                        }
                    }
                    continue;
                }
            }

            // Extraer campos según la selección del usuario
            const codigoRaw = (colCodigo >= 0 && celdas[colCodigo] !== undefined) ? celdas[colCodigo] : '';
            const codigoFel = (colCodigoFel >= 0 && celdas[colCodigoFel] !== undefined) ? celdas[colCodigoFel] : '';
            const descripcion = (colDescripcion >= 0 && celdas[colDescripcion] !== undefined) ? celdas[colDescripcion] : '';
            const descripcionFactura = (colDescripcionFactura >= 0 && celdas[colDescripcionFactura] !== undefined) ? celdas[colDescripcionFactura] : '';

            // Si la fila está completamente en blanco, ignorarla
            const tieneContenido = celdas.some(c => c && c.length > 0);
            if (!tieneContenido) continue;

            // Si un producto no tiene código en el Excel, se deja en blanco (NO generar códigos artificiales)
            const finalCodigoRaw = codigoRaw ? codigoRaw.trim() : '';
            let finalDescripcion = descripcion ? descripcion.trim() : '';
            if (!finalDescripcion) {
                finalDescripcion = descripcionFactura || finalCodigoRaw || 'Sin descripción';
            }

            const costoSinIva = colCostoSinIva >= 0 ? this.parseNumero(celdas[colCostoSinIva]) : 0;
            const costoConIva = colCostoConIva >= 0 ? this.parseNumero(celdas[colCostoConIva]) : 0;
            const precioVenta = colPrecioVenta >= 0 ? this.parseNumero(celdas[colPrecioVenta]) : 0;
            const stockFinalMes = colStockFinal >= 0 ? this.parseNumero(celdas[colStockFinal]) : 0;
            const ventasMes = colVentas >= 0 ? this.parseNumero(celdas[colVentas]) : 0;
            const stockMesPasado = colStockInicial >= 0 ? this.parseNumero(celdas[colStockInicial]) : 0;

            // Extraer compras de proveedores según la columna mapeada
            const comprasProveedores = [];
            let totalCompras = 0;
            if (numProv > 0) {
                for (let p = 0; p < numProv; p++) {
                    const colIdx = this.columnasProveedores[p];
                    const cant = (colIdx >= 0 && colIdx < celdas.length) ? this.parseNumero(celdas[colIdx]) : 0;
                    comprasProveedores.push(cant);
                    totalCompras += cant;
                }
            }

            // Extraer lista de códigos individuales si vienen varios en una celda
            const codigosArray = finalCodigoRaw ? finalCodigoRaw.split(/\s+/).filter(c => c.length > 0) : [];

            // Verificación matemática interna en la misma fila:
            // Si en ese mes no se anotaba inventario inicial, no forzamos la fórmula para no generar falsos errores
            const tieneFormulaCompleta = (colStockInicial >= 0 && colStockFinal >= 0);
            const stockCalculadoInterno = stockMesPasado + totalCompras - ventasMes;
            const cuadraInterno = tieneFormulaCompleta ? (stockCalculadoInterno === stockFinalMes) : true;
            const totalInventario = costoConIva * stockFinalMes;

            filasProcesadas.push({
                index: filasProcesadas.length + 1,
                codigoFel: codigoFel,
                codigoRaw: finalCodigoRaw,
                codigos: codigosArray,
                descripcion: finalDescripcion,
                descripcionFactura: descripcionFactura,
                costoSinIva: costoSinIva,
                costoConIva: costoConIva,
                precioVenta: precioVenta,
                totalInventario: totalInventario,
                stockFinalMes: stockFinalMes,
                stock: stockFinalMes,
                ventasMes: ventasMes,
                comprasProveedores: comprasProveedores,
                totalCompras: totalCompras,
                stockMesPasado: stockMesPasado,
                cuadraInterno: cuadraInterno,
                stockCalculadoInterno: stockCalculadoInterno,
                auditoria: {
                    status: 'neutral',
                    mensaje: 'Sin comparar',
                    diferencia: 0
                }
            });
        }

        if (filasProcesadas.length === 0) {
            Swal.fire({
                icon: 'error',
                title: 'Formato no reconocido',
                text: 'No se pudieron extraer filas válidas. Revisa las columnas y vuelve a copiar desde Excel.',
                confirmButtonColor: '#2563eb'
            });
            return;
        }

        this.datosPegados = filasProcesadas;
        this.guardarBorradorLocal();
        this.auditarContraMesReferencia();
        this.renderizarVistaPrevia();

        const statusInfo = document.getElementById('txt-status-info');
        if (statusInfo) {
            statusInfo.innerHTML = `<i class="fas fa-check-circle" style="color: #059669;"></i> Se procesaron <strong>${filasProcesadas.length}</strong> productos exitosamente con <strong>${numProv}</strong> columnas de proveedores.${filaEncabezadoOmitida ? ' (Títulos de proveedores leídos del Excel).' : ''}`;
        }

        const previewSec = document.getElementById('section-preview');
        if (previewSec) {
            previewSec.scrollIntoView({ behavior: 'smooth' });
        }
    },

    // Parsear texto numérico a float limpio
    parseNumero: function(val) {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        let str = String(val).replace(/\$/g, '').replace(/,/g, '').trim();
        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
    },

    // Normalizar texto para comparaciones seguras
    normalizarTexto: function(texto) {
        if (!texto) return '';
        return String(texto)
            .trim()
            .toUpperCase()
            .replace(/\s+/g, ' ')
            .replace(/Á/g, 'A').replace(/É/g, 'E').replace(/Í/g, 'I')
            .replace(/Ó/g, 'O').replace(/Ú/g, 'U');
    },

    // AUDITORÍA / COMPROBACIÓN EXCLUSIVA DE LOS DATOS INGRESADOS EN EL MES
    auditarContraMesReferencia: function() {
        this.auditarDatosIngresados();
    },

    auditarDatosIngresados: function() {
        const colStockIni = parseInt(document.getElementById('map-col-stock-inicial')?.value) ?? -1;
        const colStockFin = parseInt(document.getElementById('map-col-stock-final')?.value) ?? 8;
        const colVentas = parseInt(document.getElementById('map-col-ventas')?.value) ?? -1;

        const tieneStockIni = colStockIni >= 0;
        const tieneStockFin = colStockFin >= 0;

        this.datosPegados.forEach(p => {
            const inicio = p.stockMesPasado || 0;
            const entradas = p.totalCompras || 0;
            const disponible = inicio + entradas;
            const ventas = p.ventasMes || 0;
            const finalMes = p.stockFinalMes || 0;
            const calculado = disponible - ventas;

            // Si se tiene Inventario Inicial y Final configurados
            if (tieneStockIni && tieneStockFin) {
                if (calculado === finalMes) {
                    p.auditoria = {
                        status: 'ok',
                        mensaje: `✓ Cuadra (${finalMes} uds)`,
                        diferencia: 0
                    };
                } else {
                    const diff = finalMes - calculado;
                    const signo = diff > 0 ? `+${diff}` : `${diff}`;
                    p.auditoria = {
                        status: 'error',
                        mensaje: `⚠️ Descuadre (${signo}): ${disponible} disp. - ${ventas} vtas = ${calculado} (Excel dice ${finalMes})`,
                        diferencia: diff
                    };
                }
            } else if (tieneStockFin) {
                // Si en meses antiguos no se anotaba inventario inicial
                p.auditoria = {
                    status: 'ok',
                    mensaje: `✓ Registrado (${finalMes} uds)`,
                    diferencia: 0
                };
            } else {
                p.auditoria = {
                    status: 'ok',
                    mensaje: `✓ Registrado`,
                    diferencia: 0
                };
            }
        });
    },

    // Establecer filtro activo en la vista previa
    setFiltro: function(filtro) {
        this.filtroActivo = filtro;
        
        const btnTodos = document.getElementById('filter-btn-todos');
        const btnDisc = document.getElementById('filter-btn-discrepancias');
        const btnCuad = document.getElementById('filter-btn-cuadran');

        if (btnTodos) btnTodos.classList.toggle('active', filtro === 'todos');
        if (btnDisc) btnDisc.classList.toggle('active', filtro === 'discrepancias');
        if (btnCuad) btnCuad.classList.toggle('active', filtro === 'cuadran');

        this.renderizarTablaPreview();
    },

    // Renderizar métricas y tabla
    renderizarVistaPrevia: function() {
        const previewSec = document.getElementById('section-preview');
        if (!previewSec) return;

        previewSec.style.display = 'block';

        let totalItems = this.datosPegados.length;
        let totalStock = 0;
        let totalValor = 0;
        let totalDiscrepancias = 0;
        let totalCuadran = 0;

        this.datosPegados.forEach(p => {
            totalStock += p.stockFinalMes;
            totalValor += p.totalInventario;
            if (p.auditoria.status === 'error') totalDiscrepancias++;
            else if (p.auditoria.status === 'ok') totalCuadran++;
        });

        const elItems = document.getElementById('stat-total-items');
        if (elItems) elItems.textContent = totalItems;
        const elValor = document.getElementById('stat-total-valor');
        if (elValor) elValor.textContent = `$${totalValor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const elDisc = document.getElementById('stat-total-discrepancias');
        if (elDisc) elDisc.textContent = totalDiscrepancias;
        const elCuad = document.getElementById('stat-total-cuadran');
        if (elCuad) elCuad.textContent = totalCuadran;

        document.getElementById('count-todos').textContent = totalItems;
        document.getElementById('count-discrepancias').textContent = totalDiscrepancias;
        document.getElementById('count-cuadran').textContent = totalCuadran;

        this.renderizarHeadersTabla();
        this.renderizarTablaPreview();
    },

    // Generar encabezados de la tabla dinámicamente según la cantidad de proveedores y columnas seleccionadas
    renderizarHeadersTabla: function() {
        const trHeader = document.getElementById('preview-table-header-row');
        if (!trHeader) return;

        const colFel = parseInt(document.getElementById('map-col-codigo-fel')?.value) ?? -1;
        const colDescFac = parseInt(document.getElementById('map-col-descripcion-factura')?.value) ?? -1;
        const colCostoSiva = parseInt(document.getElementById('map-col-costo-sin-iva')?.value) ?? -1;
        const colCostoCiva = parseInt(document.getElementById('map-col-costo-con-iva')?.value) ?? -1;
        const colPrecio = parseInt(document.getElementById('map-col-precio-venta')?.value) ?? -1;
        const colStockIni = parseInt(document.getElementById('map-col-stock-inicial')?.value) ?? -1;
        const colVentas = parseInt(document.getElementById('map-col-ventas')?.value) ?? -1;

        let thHtml = `<th style="width: 35px; text-align: center;">#</th>`;

        if (colFel >= 0) {
            thHtml += `<th style="width: 90px;">Cód. FEL</th>`;
        }

        thHtml += `<th style="width: 140px;">Códigos</th>`;
        thHtml += `<th>Descripción Inventario</th>`;

        if (colDescFac >= 0) {
            thHtml += `<th>Desc. Factura</th>`;
        }

        if (colCostoSiva >= 0) {
            thHtml += `<th style="text-align: right; width: 85px;">Costo s/IVA</th>`;
        }

        if (colCostoCiva >= 0) {
            thHtml += `<th style="text-align: right; width: 85px;">Costo c/IVA</th>`;
        }

        if (colPrecio >= 0) {
            thHtml += `<th style="text-align: right; width: 85px;">P. Venta</th>`;
        }

        if (colCostoCiva >= 0) {
            thHtml += `<th style="text-align: right; width: 90px;">Total</th>`;
        }

        if (colStockIni >= 0) {
            thHtml += `<th style="text-align: center; width: 85px; background: #fffbeb; color: #92400e;" title="Stock final del mes pasado (con lo que arrancó este mes)">Stock Mes Pasado</th>`;
        }

        // Columna única: ENTRADAS (Total de compras de todos los proveedores)
        thHtml += `<th style="text-align: center; width: 85px; background: #d1fae5; color: #065f46; font-weight: 800;" title="Total de compras ingresadas (Entradas)">ENTRADAS</th>`;

        // Columna: INICIO + ENTRADAS (Suma de inventario inicial + entradas)
        thHtml += `<th style="text-align: center; width: 95px; background: #fef3c7; color: #92400e; font-weight: 800;" title="Inventario Inicial + Entradas (Total disponible)">INICIO + ENTRADAS</th>`;

        if (colVentas >= 0) {
            thHtml += `<th style="text-align: center; width: 80px; background: #fef2f2; color: #991b1b;" title="Ventas realizadas en este mes">Ventas</th>`;
        }

        thHtml += `
            <th style="text-align: center; width: 90px; background: #eff6ff; color: #1e40af; font-weight: 800;" title="Stock final resultante al cierre del mes">Stock Final Mes</th>
            <th style="text-align: center; width: 175px;">Auditoría / Cuadratura</th>
        `;

        trHeader.innerHTML = thHtml;
    },

    // Renderizar solo el cuerpo de la tabla según filtros y búsqueda
    renderizarTablaPreview: function() {
        const tbody = document.getElementById('preview-table-body');
        if (!tbody) return;

        const inputBuscar = document.getElementById('input-buscar-preview');
        const query = inputBuscar ? inputBuscar.value.trim().toLowerCase() : '';
        const numProv = this.numProveedores;
        const trHeader = document.getElementById('preview-table-header-row');
        const totalCols = (trHeader && trHeader.children.length) ? trHeader.children.length : 12;

        const colFel = parseInt(document.getElementById('map-col-codigo-fel')?.value) ?? -1;
        const colDescFac = parseInt(document.getElementById('map-col-descripcion-factura')?.value) ?? -1;
        const colCostoSiva = parseInt(document.getElementById('map-col-costo-sin-iva')?.value) ?? -1;
        const colCostoCiva = parseInt(document.getElementById('map-col-costo-con-iva')?.value) ?? -1;
        const colPrecio = parseInt(document.getElementById('map-col-precio-venta')?.value) ?? -1;
        const colStockIni = parseInt(document.getElementById('map-col-stock-inicial')?.value) ?? -1;
        const colVentas = parseInt(document.getElementById('map-col-ventas')?.value) ?? -1;

        let filtrados = this.datosPegados.filter(p => {
            if (this.filtroActivo === 'discrepancias' && p.auditoria.status !== 'error') return false;
            if (this.filtroActivo === 'cuadran' && p.auditoria.status !== 'ok') return false;

            if (query) {
                const matchDesc = p.descripcion && p.descripcion.toLowerCase().includes(query);
                const matchFel = p.codigoFel && p.codigoFel.toLowerCase().includes(query);
                const matchCod = p.codigoRaw && p.codigoRaw.toLowerCase().includes(query);
                return matchDesc || matchFel || matchCod;
            }
            return true;
        });

        if (filtrados.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="${totalCols}" style="text-align:center; padding: 40px; color: #94a3b8;">
                        <i class="fas fa-search" style="font-size: 28px; margin-bottom: 8px;"></i><br>
                        No se encontraron productos con el filtro aplicado.
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        filtrados.forEach(p => {
            const esDiscrepancia = p.auditoria.status === 'error';
            const rowClass = esDiscrepancia ? 'row-discrepancy' : '';

            // Insignias de códigos
            let codigosHtml = '';
            if (p.codigos && p.codigos.length > 0) {
                p.codigos.forEach(c => {
                    codigosHtml += `<span class="badge-code">${c}</span>`;
                });
            } else {
                codigosHtml = `<span style="color:#94a3b8;">-</span>`;
            }

            // Insignia de auditoría
            let statusBadge = '';
            if (p.auditoria.status === 'ok') {
                statusBadge = `<span class="status-badge status-ok"><i class="fas fa-check"></i> ${p.auditoria.mensaje}</span>`;
            } else if (p.auditoria.status === 'error') {
                statusBadge = `<span class="status-badge status-error"><i class="fas fa-exclamation-triangle"></i> ${p.auditoria.mensaje}</span>`;
            } else {
                statusBadge = `<span class="status-badge status-neutral"><i class="fas fa-info-circle"></i> ${p.auditoria.mensaje}</span>`;
            }

            // Desglose de proveedores para el tooltip de la celda de Entradas
            let desgloseProv = [];
            if (numProv > 0 && p.comprasProveedores) {
                for (let i = 0; i < numProv; i++) {
                    const cant = p.comprasProveedores[i] || 0;
                    if (cant > 0) {
                        const nom = this.nombresProveedores[i] || `Proveedor ${i + 1}`;
                        desgloseProv.push(`${nom}: ${cant}`);
                    }
                }
            }
            const tooltipProv = desgloseProv.length > 0 ? `title="Desglose: ${desgloseProv.join(', ')}"` : 'title="Total de entradas ingresadas"';

            // Columna única: ENTRADAS
            const estiloEntradas = p.totalCompras > 0 ? 'font-weight: 800; color: #065f46; background: #d1fae5;' : 'font-weight: 600; color: #94a3b8; background: #f0fdf4;';
            const entradasHtml = `<td style="text-align: center; ${estiloEntradas}" ${tooltipProv}>${p.totalCompras}</td>`;

            // Columna: INICIO + ENTRADAS
            const inicioMasEntradas = (p.stockMesPasado || 0) + (p.totalCompras || 0);
            const estiloInicioEntradas = 'font-weight: 800; color: #92400e; background: #fef3c7;';
            const inicioEntradasHtml = `<td style="text-align: center; ${estiloInicioEntradas}">${inicioMasEntradas}</td>`;

            html += `
                <tr class="${rowClass}">
                    <td style="text-align:center; color:#94a3b8; font-size:0.8rem;">${p.index}</td>
                    ${colFel >= 0 ? `<td>${p.codigoFel ? `<span class="badge-fel">${p.codigoFel}</span>` : '<span style="color:#94a3b8;">-</span>'}</td>` : ''}
                    <td>${codigosHtml}</td>
                    <td style="font-weight: 600; color: #0f172a;">${p.descripcion}</td>
                    ${colDescFac >= 0 ? `<td style="color:#64748b; font-size: 0.82rem;">${p.descripcionFactura || '-'}</td>` : ''}
                    ${colCostoSiva >= 0 ? `<td style="text-align: right; font-family: monospace;">$${p.costoSinIva.toFixed(2)}</td>` : ''}
                    ${colCostoCiva >= 0 ? `<td style="text-align: right; font-family: monospace;">$${p.costoConIva.toFixed(2)}</td>` : ''}
                    ${colPrecio >= 0 ? `<td style="text-align: right; font-family: monospace; font-weight: 700; color: #2563eb;">$${p.precioVenta.toFixed(2)}</td>` : ''}
                    ${colCostoCiva >= 0 ? `<td style="text-align: right; font-family: monospace; font-weight: 600;">$${p.totalInventario.toFixed(2)}</td>` : ''}
                    ${colStockIni >= 0 ? `<td style="text-align: center; font-weight: 700; background: #fffbeb; color: #b45309;">${p.stockMesPasado}</td>` : ''}
                    ${entradasHtml}
                    ${inicioEntradasHtml}
                    ${colVentas >= 0 ? `<td style="text-align: center; font-weight: 700; background: #fef2f2; color: #b91c1c;">${p.ventasMes}</td>` : ''}
                    <td style="text-align: center; font-weight: 800; font-size: 1rem; background: #eff6ff; color: #1e40af;">${p.stockFinalMes}</td>
                    <td style="text-align: center;">${statusBadge}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    },

    // GUARDAR EN BASE DE DATOS FIRESTORE
    guardarEnBaseDeDatos: async function() {
        if (!this.datosPegados || this.datosPegados.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'No hay datos',
                text: 'Primero pega y procesa los datos de Excel antes de guardar.',
                confirmButtonColor: '#2563eb'
            });
            return;
        }

        const mesNombre = this.getNombreMes(this.mesActual);
        const totalItems = this.datosPegados.length;
        let totalDiscrepancias = this.datosPegados.filter(p => p.auditoria.status === 'error').length;

        let advertenciaTexto = `Se guardará el inventario de <strong>${mesNombre}</strong> con <strong>${totalItems}</strong> productos y <strong>${this.numProveedores}</strong> columnas de proveedores.`;
        if (totalDiscrepancias > 0) {
            advertenciaTexto += `<br><br><span style="color: #e11d48; font-weight: bold;"><i class="fas fa-exclamation-triangle"></i> Hay ${totalDiscrepancias} productos con discrepancias.</span> Se guardará de todas formas para que puedas continuar ajustando.`;
        }

        const confirmacion = await Swal.fire({
            title: `¿Guardar Inventario de ${mesNombre}?`,
            html: advertenciaTexto,
            icon: totalDiscrepancias > 0 ? 'warning' : 'question',
            showCancelButton: true,
            confirmButtonColor: '#059669',
            cancelButtonColor: '#64748b',
            confirmButtonText: '<i class="fas fa-save"></i> Sí, Guardar Ahora',
            cancelButtonText: 'Cancelar'
        });

        if (!confirmacion.isConfirmed) return;

        Swal.fire({
            title: 'Guardando Inventario...',
            html: `Guardando ${totalItems} productos en la base de datos...<br><div class="loading-spinner" style="margin: 15px auto;"></div>`,
            allowOutsideClick: false,
            showConfirmButton: false
        });

        try {
            const mesDocRef = this.db.collection('INVENTARIO_HISTORIAL_MESES').doc(this.mesActual);
            
            let totalStock = 0;
            let totalValor = 0;
            this.datosPegados.forEach(p => {
                totalStock += p.stockFinalMes;
                totalValor += p.totalInventario;
            });

            // 1. Resumen del mes
            await mesDocRef.set({
                mes: this.mesActual,
                mesLabel: mesNombre,
                totalProductos: totalItems,
                stockTotal: totalStock,
                totalValor: totalValor,
                numProveedores: this.numProveedores,
                nombresProveedores: this.nombresProveedores,
                totalDiscrepancias: totalDiscrepancias,
                fechaGuardado: firebase.firestore.FieldValue.serverTimestamp()
            });

            // 2. Guardar productos en lotes (batch)
            const productosColRef = mesDocRef.collection('PRODUCTOS');
            let currentBatch = this.db.batch();
            let batchCount = 0;

            for (let i = 0; i < this.datosPegados.length; i++) {
                const prod = this.datosPegados[i];
                const docId = `PROD_${String(i + 1).padStart(5, '0')}`;
                const docRef = productosColRef.doc(docId);

                currentBatch.set(docRef, {
                    id: docId,
                    orden: i + 1,
                    codigoFel: prod.codigoFel,
                    codigoRaw: prod.codigoRaw,
                    codigos: prod.codigos,
                    descripcion: prod.descripcion,
                    descripcionFactura: prod.descripcionFactura,
                    costoSinIva: prod.costoSinIva,
                    costoConIva: prod.costoConIva,
                    precioVenta: prod.precioVenta,
                    totalInventario: prod.totalInventario,
                    stockFinalMes: prod.stockFinalMes,
                    stock: prod.stockFinalMes,
                    ventasMes: prod.ventasMes,
                    comprasProveedores: prod.comprasProveedores,
                    totalCompras: prod.totalCompras,
                    stockMesPasado: prod.stockMesPasado,
                    auditoria: {
                        status: prod.auditoria.status,
                        mensaje: prod.auditoria.mensaje,
                        diferencia: prod.auditoria.diferencia
                    }
                });

                batchCount++;
                if (batchCount >= 450) {
                    await currentBatch.commit();
                    currentBatch = this.db.batch();
                    batchCount = 0;
                }
            }

            if (batchCount > 0) {
                await currentBatch.commit();
            }

            // Guardar en caché local
            localStorage.setItem(`inventario_guardado_${this.mesActual}`, JSON.stringify(this.datosPegados));
            await this.cargarCacheMesesGuardados();

            // Limpiar la pantalla y el borrador para dejarla lista para el siguiente mes
            this.limpiarPegado();
            window.scrollTo({ top: 0, behavior: 'smooth' });

            const statusInfo = document.getElementById('txt-status-info');
            if (statusInfo) {
                statusInfo.innerHTML = `<i class="fas fa-check-circle" style="color: #059669;"></i> ¡Inventario de <strong>${mesNombre}</strong> guardado exitosamente! Pantalla limpia y lista para el siguiente mes.`;
            }

            Swal.fire({
                icon: 'success',
                title: '¡Inventario Guardado!',
                html: `El mes de <strong>${mesNombre}</strong> ha sido guardado exitosamente con <strong>${totalItems}</strong> productos.<br><br><span style="color: #059669; font-weight: 700;">La pantalla se ha limpiado y está lista para el siguiente mes.</span>`,
                confirmButtonColor: '#059669'
            });

        } catch (error) {
            console.error("Error guardando mes:", error);
            Swal.fire({
                icon: 'error',
                title: 'Error al Guardar',
                text: 'Ocurrió un error guardando en la base de datos: ' + (error.message || error),
                confirmButtonColor: '#2563eb'
            });
        }
    },

    // MODAL DE HISTORIAL DE MESES
    abrirHistorialMeses: async function() {
        const modal = document.getElementById('modal-historial-meses');
        const tbody = document.getElementById('historial-meses-tbody');
        if (!modal || !tbody) return;

        modal.style.display = 'flex';
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #94a3b8;"><i class="fas fa-spinner fa-spin"></i> Cargando meses guardados...</td></tr>';

        try {
            const snap = await this.db.collection('INVENTARIO_HISTORIAL_MESES').orderBy('mes', 'desc').get();
            
            if (snap.empty) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 30px; color: #94a3b8;">Aún no hay meses guardados en el historial.</td></tr>';
                return;
            }

            let html = '';
            snap.forEach(doc => {
                const data = doc.data();
                const fecha = data.fechaGuardado && data.fechaGuardado.toDate ? data.fechaGuardado.toDate().toLocaleString('es-ES') : 'Reciente';
                const valorFmt = (data.totalValor || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const discBadge = data.totalDiscrepancias > 0 
                    ? `<span style="color: #e11d48; font-weight: bold; font-size: 0.8rem; margin-left: 6px;"><i class="fas fa-exclamation-triangle"></i> ${data.totalDiscrepancias}</span>`
                    : '';

                html += `
                    <tr>
                        <td style="font-weight: 700; color: #1e293b;">
                            <i class="fas fa-calendar-alt" style="color: #2563eb; margin-right: 6px;"></i>
                            ${data.mesLabel || data.mes} ${discBadge}
                        </td>
                        <td style="text-align: center; font-weight: 600;">${data.totalProductos || 0}</td>
                        <td style="text-align: right; font-family: monospace; font-weight: 600;">$${valorFmt}</td>
                        <td style="color: #64748b; font-size: 0.8rem;">${fecha}</td>
                        <td style="text-align: center;">
                            <button class="btn-action btn-action-primary" style="padding: 5px 10px; font-size: 0.78rem;" onclick="CargaInventarioApp.cargarMesDesdeHistorial('${data.mes}')">
                                <i class="fas fa-eye"></i> Cargar
                            </button>
                            <button class="btn-action btn-action-secondary" style="padding: 5px 10px; font-size: 0.78rem; color: #dc2626;" onclick="CargaInventarioApp.eliminarMesHistorial('${data.mes}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });

            tbody.innerHTML = html;

        } catch (e) {
            console.error("Error consultando historial de meses:", e);
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #e11d48;">Error al consultar: ${e.message}</td></tr>`;
        }
    },

    // Cargar mes desde historial
    cargarMesDesdeHistorial: async function(mesKey) {
        document.getElementById('modal-historial-meses').style.display = 'none';
        
        const select = document.getElementById('select-mes-carga');
        if (select) select.value = mesKey;

        this.mesActual = mesKey;
        this.actualizarEtiquetasMes();

        Swal.fire({
            title: 'Cargando Mes...',
            html: `Recuperando inventario de ${this.getNombreMes(mesKey)}...`,
            allowOutsideClick: false,
            showConfirmButton: false,
            didOpen: () => Swal.showLoading()
        });

        const productos = await this.obtenerProductosDeMes(mesKey);
        Swal.close();

        if (productos && productos.length > 0) {
            this.datosPegados = productos.map((p, idx) => ({
                index: idx + 1,
                codigoFel: p.codigoFel || '',
                codigoRaw: p.codigoRaw || '',
                codigos: p.codigos || [],
                descripcion: p.descripcion || '',
                descripcionFactura: p.descripcionFactura || '',
                costoSinIva: p.costoSinIva || 0,
                costoConIva: p.costoConIva || 0,
                precioVenta: p.precioVenta || 0,
                totalInventario: p.totalInventario || 0,
                stockFinalMes: p.stockFinalMes !== undefined ? p.stockFinalMes : (p.stock || 0),
                stock: p.stockFinalMes !== undefined ? p.stockFinalMes : (p.stock || 0),
                ventasMes: p.ventasMes || 0,
                comprasProveedores: p.comprasProveedores || [],
                totalCompras: p.totalCompras || 0,
                stockMesPasado: p.stockMesPasado || 0,
                cuadraInterno: true,
                stockCalculadoInterno: p.stockFinalMes || 0,
                auditoria: p.auditoria || { status: 'neutral', mensaje: 'Sin auditar', diferencia: 0 }
            }));

            // Leer cantidad de proveedores si estaba guardada
            if (this.cacheMesesGuardados[mesKey] && this.cacheMesesGuardados[mesKey].numProveedores !== undefined) {
                this.numProveedores = this.cacheMesesGuardados[mesKey].numProveedores;
                if (this.cacheMesesGuardados[mesKey].nombresProveedores) {
                    this.nombresProveedores = this.cacheMesesGuardados[mesKey].nombresProveedores;
                }
                this.actualizarSelectorProveedoresUI();
            }

            await this.detectarMesReferencia();
            this.auditarContraMesReferencia();
            this.renderizarVistaPrevia();

            const statusInfo = document.getElementById('txt-status-info');
            if (statusInfo) {
                statusInfo.innerHTML = `<i class="fas fa-database" style="color: #2563eb;"></i> Mes <strong>${this.getNombreMes(mesKey)}</strong> cargado desde el historial (${productos.length} productos).`;
            }
        } else {
            Swal.fire({
                icon: 'warning',
                title: 'Mes vacío',
                text: 'No se encontraron productos para este mes.',
                confirmButtonColor: '#2563eb'
            });
        }
    },

    // Eliminar mes del historial
    eliminarMesHistorial: async function(mesKey) {
        const confirmacion = await Swal.fire({
            title: `¿Eliminar ${this.getNombreMes(mesKey)}?`,
            text: 'Esta acción borrará el inventario guardado de este mes en el historial.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Sí, Eliminar',
            cancelButtonText: 'Cancelar'
        });

        if (!confirmacion.isConfirmed) return;

        try {
            await this.db.collection('INVENTARIO_HISTORIAL_MESES').doc(mesKey).delete();
            localStorage.removeItem(`inventario_guardado_${mesKey}`);
            await this.abrirHistorialMeses();
            Swal.fire({
                icon: 'success',
                title: 'Eliminado',
                text: `El mes ha sido eliminado del historial.`,
                confirmButtonColor: '#059669',
                timer: 1500
            });
        } catch (e) {
            console.error("Error eliminando mes:", e);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'No se pudo eliminar: ' + e.message,
                confirmButtonColor: '#2563eb'
            });
        }
    }
};

// Iniciar al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    CargaInventarioApp.init();
});
