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
    numProveedores: 1, // Cantidad de columnas de proveedores configurada por el usuario
    nombresProveedores: ['Proveedor 1'], // Nombres extraídos del Excel o por defecto
    datosPegados: [],
    datosComparacion: null, // Datos del mes de referencia (ej. Septiembre si cargamos Agosto)
    mesReferencia: null,
    tipoReferencia: null, // 'siguiente' | 'anterior' | null
    filtroActivo: 'todos', // 'todos' | 'discrepancias' | 'cuadran'
    cacheMesesGuardados: {}, // Cache local en memoria de meses guardados

    // Nombres legibles para meses
    mesesNombres: {
        '2026-09': 'Septiembre 2026',
        '2026-08': 'Agosto 2026',
        '2026-07': 'Julio 2026',
        '2026-06': 'Junio 2026',
        '2026-05': 'Mayo 2026',
        '2026-04': 'Abril 2026',
        '2026-03': 'Marzo 2026',
        '2026-02': 'Febrero 2026',
        '2026-01': 'Enero 2026'
    },

    init: async function() {
        console.log("Iniciando Módulo de Carga de Inventario por Mes...");
        
        // Inicializar Firebase si es necesario
        if (!firebase.apps.length) {
            firebase.initializeApp(this.firebaseConfig);
        }
        this.db = firebase.firestore();

        // Cargar mes seleccionado desde el selector
        const selectMes = document.getElementById('select-mes-carga');
        if (selectMes) {
            this.mesActual = selectMes.value || '2026-09';
        }

        // Cargar cantidad de proveedores guardada para este mes si existe
        const provGuardados = localStorage.getItem(`num_prov_${this.mesActual}`);
        if (provGuardados !== null) {
            this.numProveedores = parseInt(provGuardados) || 1;
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

        // Si ya hay texto pegado, volver a procesar para reorganizar columnas al instante
        const txt = document.getElementById('txt-excel-paste');
        if (txt && txt.value.trim().length > 0) {
            this.procesarPegado();
        }
    },

    actualizarSelectorProveedoresUI: function() {
        const sel = document.getElementById('select-num-proveedores');
        if (sel) {
            sel.value = String(this.numProveedores);
        }
    },

    // Obtener nombre formateado del mes
    getNombreMes: function(mesKey) {
        return this.mesesNombres[mesKey] || mesKey;
    },

    // Actualizar etiquetas en la interfaz
    actualizarEtiquetasMes: function() {
        const nombre = this.getNombreMes(this.mesActual);
        const lblActual = document.getElementById('label-mes-actual');
        const lblPreview = document.getElementById('label-mes-preview');
        const selCarga = document.getElementById('select-mes-carga');
        const selPaso1 = document.getElementById('select-mes-paso1');
        
        if (lblActual) lblActual.textContent = nombre;
        if (lblPreview) lblPreview.textContent = nombre;
        if (selCarga && selCarga.value !== this.mesActual) selCarga.value = this.mesActual;
        if (selPaso1 && selPaso1.value !== this.mesActual) selPaso1.value = this.mesActual;
    },

    // Cambiar de mes de trabajo
    cambiarMes: async function(nuevoMes) {
        this.mesActual = nuevoMes;
        this.actualizarEtiquetasMes();
        
        // Cargar proveedores del mes si tenía configurado
        const provGuardados = localStorage.getItem(`num_prov_${this.mesActual}`);
        if (provGuardados !== null) {
            this.numProveedores = parseInt(provGuardados) || 1;
            this.actualizarSelectorProveedoresUI();
        }

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

    // Detectar automáticamente el mes con el cual comparar
    // Como el usuario va de Septiembre hacia atrás (Agosto, Julio, etc.):
    // - Si existe el mes siguiente (ej. Septiembre cuando se carga Agosto): compara con el siguiente.
    // - Si existe el mes anterior (ej. Agosto cuando se carga Septiembre): compara con el anterior.
    detectarMesReferencia: async function() {
        const [yearStr, monthStr] = this.mesActual.split('-');
        let year = parseInt(yearStr);
        let month = parseInt(monthStr);

        // 1. Probar primero si existe el mes SIGUIENTE (M + 1)
        let nextMonth = month + 1;
        let nextYear = year;
        if (nextMonth > 12) {
            nextMonth = 1;
            nextYear++;
        }
        const nextMonthKey = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
        let refData = await this.obtenerProductosDeMes(nextMonthKey);
        
        if (refData && refData.length > 0) {
            this.mesReferencia = nextMonthKey;
            this.tipoReferencia = 'siguiente';
            this.datosComparacion = refData;
            this.actualizarBannerComparacion(`Comparando contra ${this.getNombreMes(nextMonthKey)} (Mes Siguiente)`,
                `Tu Stock Final de este mes debe ser el Stock Inicial con el que arrancó ${this.getNombreMes(nextMonthKey)}.`);
            return;
        }

        // 2. Probar si existe el mes ANTERIOR (M - 1)
        let prevMonth = month - 1;
        let prevYear = year;
        if (prevMonth < 1) {
            prevMonth = 12;
            prevYear--;
        }
        const prevMonthKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
        refData = await this.obtenerProductosDeMes(prevMonthKey);

        if (refData && refData.length > 0) {
            this.mesReferencia = prevMonthKey;
            this.tipoReferencia = 'anterior';
            this.datosComparacion = refData;
            this.actualizarBannerComparacion(`Comparando contra ${this.getNombreMes(prevMonthKey)} (Mes Anterior)`,
                `El Stock del Mes Pasado de tu hoja debe coincidir exactamente con el Stock Final de ${this.getNombreMes(prevMonthKey)}.`);
            return;
        }

        // Si no hay ninguno guardado
        this.mesReferencia = null;
        this.tipoReferencia = null;
        this.datosComparacion = null;
        this.actualizarBannerComparacion(`Mes Base Inicial: ${this.getNombreMes(this.mesActual)}`,
            `No hay otros meses guardados para comparar aún. Este mes servirá como punto de partida para auditar los meses anteriores que cargues después.`);
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
                nombres: this.nombresProveedores
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
                this.actualizarSelectorProveedoresUI();
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

        // Separar por filas
        const lineas = rawText.split(/\r\n|\n|\r/);
        const filasProcesadas = [];
        let filaEncabezadoOmitida = false;
        const numProv = this.numProveedores;

        // Reset de nombres de proveedores
        this.nombresProveedores = [];
        for (let p = 0; p < numProv; p++) {
            this.nombresProveedores.push(`Proveedor ${p + 1}`);
        }

        for (let i = 0; i < lineas.length; i++) {
            let linea = lineas[i];
            if (!linea || !linea.trim()) continue; // Omitir líneas vacías

            // IMPORTANTE: Quitar solo el retorno de carro (\r) al final, NO usar .trim() al inicio
            // porque .trim() borra las tabulaciones iniciales (\t) que indican que el Código FEL está vacío
            linea = linea.replace(/\r$/, '');

            // Separar por tabulaciones (copiar estándar de Excel)
            let celdas = linea.split('\t');
            if (celdas.length < 3) {
                if (linea.includes(';')) celdas = linea.split(';');
                else if (linea.includes(',')) celdas = linea.split(',');
            }

            celdas = celdas.map(c => c.trim());

            // Detección inteligente de fila de encabezados
            if (i === 0 || (!filaEncabezadoOmitida && i < 2)) {
                const lineaUpper = linea.toUpperCase();
                if (lineaUpper.includes('CODIGO') || lineaUpper.includes('DESCRIPCION') || lineaUpper.includes('STOCK') || lineaUpper.includes('COSTO')) {
                    filaEncabezadoOmitida = true;
                    for (let p = 0; p < numProv; p++) {
                        const idxProv = 10 + p;
                        if (celdas[idxProv] && celdas[idxProv].length > 0) {
                            this.nombresProveedores[p] = celdas[idxProv];
                        }
                    }
                    continue; // Saltar la fila de títulos
                }
            }

            // CORRECCIÓN AUTOMÁTICA DE DESPLAZAMIENTO:
            // Si una fila no tiene Código FEL y por algún motivo no trajo la tabulación inicial,
            // le faltará exactamente 1 columna respecto a las demás. Lo corregimos insertando Código FEL vacío al inicio.
            const colsEsperadas = 11 + numProv;
            if (celdas.length === colsEsperadas - 1) {
                celdas.unshift(''); // Inserta el Código FEL vacío en el índice 0 para que no se corran los datos
            }

            // ESTRUCTURA EXACTA SEGÚN TU EXCEL:
            // 0: CÓDIGO FEL
            // 1: CÓDIGO (1 o varios códigos separados por espacios)
            // 2: DESCRIPCIÓN INVENTARIO
            // 3: DESCRIPCIÓN SEGÚN FACTURA
            // 4: COSTO SIN IVA
            // 5: COSTO CON IVA
            // 6: PRECIO DE VENTA
            // 7: TOTAL INVENTARIO
            // 8: STOCK FINAL DEL MES ACTUAL (Columna 9 de tu Excel)
            // 9: VENTAS DEL MES (Columna 10 de tu Excel)
            // 10 a (10 + numProv - 1): PROVEEDORES (Compras del mes)
            // (10 + numProv) o Última Columna: STOCK FINAL DEL MES PASADO

            const codigoFel = celdas[0] || '';
            const codigoRaw = celdas[1] || '';
            const descripcion = celdas[2] || '';
            const descripcionFactura = celdas[3] || '';
            
            const costoSinIva = this.parseNumero(celdas[4]);
            const costoConIva = this.parseNumero(celdas[5]);
            const precioVenta = this.parseNumero(celdas[6]);
            const totalInventario = this.parseNumero(celdas[7]);
            
            // Columna 9: Stock Final del mes actual
            const stockFinalMes = this.parseNumero(celdas[8]);
            
            // Columna 10: Ventas del mes
            const ventasMes = this.parseNumero(celdas[9]);

            // Columnas de proveedores
            const comprasProveedores = [];
            let totalCompras = 0;
            for (let p = 0; p < numProv; p++) {
                const idxProv = 10 + p;
                const cant = this.parseNumero(celdas[idxProv]);
                comprasProveedores.push(cant);
                totalCompras += cant;
            }

            // Última columna: Stock Final del Mes Pasado (con lo que inició este mes)
            // Buscamos en el índice esperado (10 + numProv) o en la última celda de la fila
            let stockMesPasado = 0;
            const idxMesPasado = 10 + numProv;
            if (celdas[idxMesPasado] !== undefined && celdas[idxMesPasado] !== '') {
                stockMesPasado = this.parseNumero(celdas[idxMesPasado]);
            } else if (celdas.length > idxMesPasado) {
                stockMesPasado = this.parseNumero(celdas[celdas.length - 1]);
            } else if (numProv === 0 && celdas[10] !== undefined) {
                stockMesPasado = this.parseNumero(celdas[10]);
            }

            // Si no hay código ni descripción, ignorar fila vacía
            if (!codigoFel && !codigoRaw && !descripcion) continue;

            // Extraer lista de códigos individuales si vienen varios en una celda
            const codigosArray = codigoRaw ? codigoRaw.split(/\s+/).filter(c => c.length > 0) : [];

            // Verificación matemática interna en la misma fila:
            // Stock Calculado = Stock Mes Pasado + Total Compras - Ventas
            const stockCalculadoInterno = stockMesPasado + totalCompras - ventasMes;
            const cuadraInterno = stockCalculadoInterno === stockFinalMes;

            filasProcesadas.push({
                index: filasProcesadas.length + 1,
                codigoFel: codigoFel,
                codigoRaw: codigoRaw,
                codigos: codigosArray,
                descripcion: descripcion,
                descripcionFactura: descripcionFactura,
                costoSinIva: costoSinIva,
                costoConIva: costoConIva,
                precioVenta: precioVenta,
                totalInventario: totalInventario > 0 ? totalInventario : (costoConIva * stockFinalMes),
                stockFinalMes: stockFinalMes,
                stock: stockFinalMes, // Compatibilidad general
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

    // AUDITORÍA / COMPARACIÓN DE STOCK ENTRE MESES CONSECUTIVOS
    auditarContraMesReferencia: function() {
        if (!this.datosComparacion || this.datosComparacion.length === 0) {
            this.datosPegados.forEach(p => {
                if (!p.cuadraInterno) {
                    p.auditoria = {
                        status: 'error',
                        mensaje: `⚠️ Fila no cuadra: ${p.stockMesPasado} + ${p.totalCompras} - ${p.ventasMes} = ${p.stockCalculadoInterno} (Excel dice ${p.stockFinalMes})`,
                        diferencia: p.stockFinalMes - p.stockCalculadoInterno
                    };
                } else {
                    p.auditoria = {
                        status: 'neutral',
                        mensaje: `✓ Base inicial (${p.stockFinalMes} uds)`,
                        diferencia: 0
                    };
                }
            });
            return;
        }

        // Crear mapas de búsqueda del mes de referencia
        const mapPorCodigoFel = {};
        const mapPorCodigo = {};
        const mapPorDescripcion = {};

        this.datosComparacion.forEach(item => {
            if (item.codigoFel) {
                mapPorCodigoFel[item.codigoFel.trim().toUpperCase()] = item;
            }
            if (item.codigoRaw) {
                mapPorCodigo[item.codigoRaw.trim().toUpperCase()] = item;
            }
            if (Array.isArray(item.codigos)) {
                item.codigos.forEach(c => {
                    if (c) mapPorCodigo[c.trim().toUpperCase()] = item;
                });
            }
            if (item.descripcion) {
                mapPorDescripcion[this.normalizarTexto(item.descripcion)] = item;
            }
        });

        const esMesSiguiente = this.tipoReferencia === 'siguiente';
        const nombreRef = this.getNombreMes(this.mesReferencia);

        this.datosPegados.forEach(prod => {
            let match = null;

            // 1. Por Código FEL
            if (prod.codigoFel && mapPorCodigoFel[prod.codigoFel.trim().toUpperCase()]) {
                match = mapPorCodigoFel[prod.codigoFel.trim().toUpperCase()];
            }
            // 2. Por Códigos
            else if (prod.codigos && prod.codigos.length > 0) {
                for (const c of prod.codigos) {
                    if (mapPorCodigo[c.trim().toUpperCase()]) {
                        match = mapPorCodigo[c.trim().toUpperCase()];
                        break;
                    }
                }
            }
            // 3. Por Código Raw
            else if (prod.codigoRaw && mapPorCodigo[prod.codigoRaw.trim().toUpperCase()]) {
                match = mapPorCodigo[prod.codigoRaw.trim().toUpperCase()];
            }
            // 4. Por Descripción
            if (!match && prod.descripcion) {
                const descNorm = this.normalizarTexto(prod.descripcion);
                if (mapPorDescripcion[descNorm]) {
                    match = mapPorDescripcion[descNorm];
                }
            }

            if (match) {
                // CASO A: Estamos comparando contra el mes SIGUIENTE (ej. estamos en Agosto y comparamos con Septiembre)
                // Tu Stock Final de Agosto debe coincidir con el Stock Inicial (stockMesPasado) con el que arrancó Septiembre!
                if (esMesSiguiente) {
                    const stockInicioSiguiente = parseFloat(match.stockMesPasado !== undefined ? match.stockMesPasado : (match.stockFinalMes || 0));
                    const stockFinalActual = prod.stockFinalMes;
                    const diff = stockFinalActual - stockInicioSiguiente;

                    if (diff === 0) {
                        prod.auditoria = {
                            status: 'ok',
                            mensaje: `✓ Cuadra exacto con ${nombreRef} (${stockFinalActual} uds)`,
                            diferencia: 0
                        };
                    } else {
                        const signo = diff > 0 ? `+${diff}` : `${diff}`;
                        prod.auditoria = {
                            status: 'error',
                            mensaje: `⚠️ Descuadre con ${nombreRef}: ${stockFinalActual} vs inicio ${stockInicioSiguiente} (${signo})`,
                            diferencia: diff
                        };
                    }
                }
                // CASO B: Estamos comparando contra el mes ANTERIOR (ej. estamos en Septiembre y comparamos con Agosto)
                // Tu Stock del Mes Pasado (stockMesPasado) debe coincidir con el Stock Final de Agosto!
                else {
                    const stockFinalAnterior = parseFloat(match.stockFinalMes !== undefined ? match.stockFinalMes : (match.stock || 0));
                    const stockInicioActual = prod.stockMesPasado;
                    const diff = stockInicioActual - stockFinalAnterior;

                    if (diff === 0) {
                        prod.auditoria = {
                            status: 'ok',
                            mensaje: `✓ Cuadra con ${nombreRef} (${stockInicioActual} uds)`,
                            diferencia: 0
                        };
                    } else {
                        const signo = diff > 0 ? `+${diff}` : `${diff}`;
                        prod.auditoria = {
                            status: 'error',
                            mensaje: `⚠️ Descuadre con ${nombreRef}: inició con ${stockInicioActual} pero cerró en ${stockFinalAnterior} (${signo})`,
                            diferencia: diff
                        };
                    }
                }
            } else {
                prod.auditoria = {
                    status: 'error',
                    mensaje: `⚠️ No existe en ${nombreRef}`,
                    diferencia: prod.stockFinalMes
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

        document.getElementById('stat-total-items').textContent = totalItems;
        document.getElementById('stat-total-stock').textContent = totalStock;
        document.getElementById('stat-total-valor').textContent = `$${totalValor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('stat-total-discrepancias').textContent = totalDiscrepancias;
        document.getElementById('stat-total-cuadran').textContent = totalCuadran;

        document.getElementById('count-todos').textContent = totalItems;
        document.getElementById('count-discrepancias').textContent = totalDiscrepancias;
        document.getElementById('count-cuadran').textContent = totalCuadran;

        this.renderizarHeadersTabla();
        this.renderizarTablaPreview();
    },

    // Generar encabezados de la tabla dinámicamente según la cantidad de proveedores
    renderizarHeadersTabla: function() {
        const trHeader = document.getElementById('preview-table-header-row');
        if (!trHeader) return;

        let thHtml = `
            <th style="width: 35px; text-align: center;">#</th>
            <th style="width: 90px;">Cód. FEL</th>
            <th style="width: 140px;">Códigos</th>
            <th>Descripción Inventario</th>
            <th>Desc. Factura</th>
            <th style="text-align: right; width: 85px;">Costo s/IVA</th>
            <th style="text-align: right; width: 85px;">Costo c/IVA</th>
            <th style="text-align: right; width: 85px;">P. Venta</th>
            <th style="text-align: right; width: 90px;">Total</th>
            <th style="text-align: center; width: 85px; background: #fffbeb; color: #92400e;" title="Stock final del mes pasado (con lo que arrancó este mes)">Stock Mes Pasado</th>
        `;

        // Columnas dinámicas de proveedores
        for (let p = 0; p < this.numProveedores; p++) {
            const nom = this.nombresProveedores[p] || `Proveedor ${p + 1}`;
            thHtml += `<th style="text-align: center; width: 85px; background: #ecfdf5; color: #065f46;" title="Compras de este proveedor">${nom}</th>`;
        }

        thHtml += `
            <th style="text-align: center; width: 80px; background: #fef2f2; color: #991b1b;" title="Ventas realizadas en este mes">Ventas</th>
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
        const totalCols = 12 + numProv;

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

            // Columnas de proveedores para esta fila
            let comprasHtml = '';
            for (let i = 0; i < numProv; i++) {
                const cantProv = p.comprasProveedores && p.comprasProveedores[i] !== undefined ? p.comprasProveedores[i] : 0;
                const estiloProv = cantProv > 0 ? 'font-weight: 700; color: #047857;' : 'color: #94a3b8;';
                comprasHtml += `<td style="text-align: center; ${estiloProv}">${cantProv}</td>`;
            }

            html += `
                <tr class="${rowClass}">
                    <td style="text-align:center; color:#94a3b8; font-size:0.8rem;">${p.index}</td>
                    <td>${p.codigoFel ? `<span class="badge-fel">${p.codigoFel}</span>` : '<span style="color:#94a3b8;">-</span>'}</td>
                    <td>${codigosHtml}</td>
                    <td style="font-weight: 600; color: #0f172a;">${p.descripcion}</td>
                    <td style="color:#64748b; font-size: 0.82rem;">${p.descripcionFactura || '-'}</td>
                    <td style="text-align: right; font-family: monospace;">$${p.costoSinIva.toFixed(2)}</td>
                    <td style="text-align: right; font-family: monospace;">$${p.costoConIva.toFixed(2)}</td>
                    <td style="text-align: right; font-family: monospace; font-weight: 700; color: #2563eb;">$${p.precioVenta.toFixed(2)}</td>
                    <td style="text-align: right; font-family: monospace; font-weight: 600;">$${p.totalInventario.toFixed(2)}</td>
                    <td style="text-align: center; font-weight: 700; background: #fffbeb; color: #b45309;">${p.stockMesPasado}</td>
                    ${comprasHtml}
                    <td style="text-align: center; font-weight: 700; background: #fef2f2; color: #b91c1c;">${p.ventasMes}</td>
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
