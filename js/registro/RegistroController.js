// js/registro/RegistroController.js

/**
 * RegistroController
 * Maneja la lógica específica de la página de registro.html (Entrada manual y por Excel).
 */
window.RegistroController = {
    async addFastEntryRow() {
        const app = window.RegistrosApp;
        if (!app) return;

        const productoInput = document.getElementById('fast-producto');
        const fechaInput = document.getElementById('fast-fecha');
        const cantidadInput = document.getElementById('fast-cantidad');
        const cuentaInput = document.getElementById('fast-cuenta');
        const precioEspecialInput = document.getElementById('fast-precio-especial');
        const observacionInput = document.getElementById('fast-observacion');

        const rawInputValue = productoInput.value.trim().toLowerCase();
        
        // Limpiar sufijos extra del código QR (ej. "AN131032'1" -> "AN131032")
        const inputValue = rawInputValue.includes("'") ? rawInputValue.split("'")[0] : rawInputValue;
        
        let productoDesc = productoInput.value.trim();
        if (rawInputValue.includes("'")) {
            productoDesc = inputValue.toUpperCase();
        }

        let productId = null;

        let cantidad = parseInt(cantidadInput.value);
        if (isNaN(cantidad) || cantidad < 1) cantidad = 1;
        const cuenta = cuentaInput.value.trim();
        const precioEspecial = precioEspecialInput ? parseFloat(precioEspecialInput.value) : null;
        const observacion = observacionInput.value.trim();

        if (!inputValue) return;

        const compareCodes = (code1, code2) => {
            if (!code1 || !code2) return false;
            const c1 = code1.toLowerCase().replace(/^0+/, '');
            const c2 = code2.toLowerCase().replace(/^0+/, '');
            return (c1 || "0") === (c2 || "0");
        };

        if (window.app && window.app.cache) {
            const match = window.app.cache.find(p => {
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

        try {
            const unifiedRef = app.db.collection('REGISTROS');
            const newDocId = unifiedRef.doc().id;

            const baseData = {
                fecha: (fechaInput && fechaInput.value) ? fechaInput.value : app.getLocalISODate() || "",
                producto: productoDesc || "",
                productId: productId || null,
                cantidad: cantidad || 1,
                cantidadUsada: 0,
                facturas: [],
                cuenta: cuenta || "",
                precioEspecial: isNaN(precioEspecial) ? null : precioEspecial,
                observacion: observacion || "",
                archivado: false,
                origen: 'manual',
                timestamp: window.firebase.firestore.FieldValue.serverTimestamp()
            };

            await unifiedRef.doc(newDocId).set(baseData);
        } catch (error) {
            console.error("Error guardando registro:", error);
            alert("Error al guardar el producto: " + error.message);
            return;
        }

        productoInput.value = '';
        cantidadInput.value = '1';
        observacionInput.value = '';
        cantidadInput.focus();
        cantidadInput.select();
    },

    handleExcelUpload(e) {
        const app = window.RegistrosApp;
        if (!app) return;

        const file = e.target.files[0];
        if (!file) return;

        app.showLoading(true);
        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                
                app.currentWorkbook = workbook;
                
                const filenameDisplay = document.getElementById('fast-excel-filename-display');
                if (filenameDisplay) filenameDisplay.innerText = `Archivo: ${file.name}`;
                
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
                
                const sheetsContainer = document.getElementById('fast-excel-sheets-container');
                if (sheetsContainer) sheetsContainer.style.display = 'block';
                
            } catch (error) {
                console.error("Error leyendo Excel:", error);
                alert("Error al leer el archivo Excel: " + error.message);
            } finally {
                app.showLoading(false);
            }
        };

        reader.readAsArrayBuffer(file);
    },

    async processSelectedFastExcelSheet() {
        const app = window.RegistrosApp;
        if (!app) return;

        if (!app.currentWorkbook) {
            alert("Por favor selecciona un archivo Excel primero.");
            return;
        }
        
        const sheetName = document.getElementById('fast-excel-sheet-select').value;
        if (!sheetName) {
            alert("Selecciona una hoja válida.");
            return;
        }
        
        app.showLoading(true);
        try {
            const worksheet = app.currentWorkbook.Sheets[sheetName];
            const rawData = XLSX.utils.sheet_to_json(worksheet, { header: "A", defval: null });
            
            await this.processExcelData(rawData);
            
            const sheetsContainer = document.getElementById('fast-excel-sheets-container');
            if (sheetsContainer) sheetsContainer.style.display = 'none';
            
            const filenameDisplay = document.getElementById('fast-excel-filename-display');
            if (filenameDisplay) filenameDisplay.innerText = '';
            
            const fileInput = document.getElementById('fast-excel-file');
            if (fileInput) fileInput.value = '';
            
            app.currentWorkbook = null;
            
        } catch (error) {
            console.error("Error al procesar hoja:", error);
            alert("Error al procesar la hoja de Excel: " + error.message);
        } finally {
            app.showLoading(false);
        }
    },

    async processExcelData(rows) {
        const app = window.RegistrosApp;
        if (!app) return;

        let currentExcelDate = null;
        let batch = app.db.batch();
        let operationsCount = 0;
        let totalProcessed = 0;
        let totalUpdated = 0;
        let totalSkipped = 0;

        const existingSnap = await app.registrosRef.where('archivado', '==', false).get();
        const existingMap = {};
        existingSnap.forEach(doc => {
            const data = doc.data();
            if (data.filaExcel !== undefined && data.filaExcel !== null) {
                existingMap[data.filaExcel] = { id: doc.id, ...data };
            }
        });

        let startIndex = 0;
        if (rows.length > 0 && typeof rows[0].A === 'string' && rows[0].A.toLowerCase().includes('fecha')) {
            startIndex = 1;
        }

        for (let i = startIndex; i < rows.length; i++) {
            const row = rows[i];
            const producto = row.C ? String(row.C).trim() : '';
            if (!producto) continue;

            let fechaRaw = row.A;
            let newDateDetected = false;
            let tempDateStr = null;

            if (fechaRaw !== undefined && fechaRaw !== null) {
                if (fechaRaw instanceof Date) {
                    if (!isNaN(fechaRaw.getTime())) {
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
                                if (y === "06") y = "2026";
                                else y = "20" + y;
                            } else if (y.length === 1 && y === "6") {
                                y = "2026";
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
                currentExcelDate = app.getLocalISODate();
            }

            const cantidad = parseInt(row.B) || 1;
            const cuenta = row.D ? String(row.D).trim() : '';
            const observacion = row.E ? String(row.E).trim() : '';
            const fechaAUsar = currentExcelDate;

            let productId = null;
            let productoDesc = producto;
            
            if (window.app && window.app.cache) {
                const mapeoKey = app.sanitizeForDocId(producto);
                const codigoMapeado = app.mapeoNombres ? app.mapeoNombres[mapeoKey] : null;
                if (codigoMapeado) {
                    const matchMapeado = app.findProductByCodigo(codigoMapeado);
                    if (matchMapeado) {
                        productId = matchMapeado.id;
                        productoDesc = matchMapeado.descripcion;
                    }
                }

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

            const filaExcelNum = i + 1;
            const existingDoc = existingMap[filaExcelNum];

            if (existingDoc) {
                const isSame = existingDoc.fecha === fechaAUsar &&
                               existingDoc.producto === productoDesc &&
                               existingDoc.cantidad === cantidad &&
                               (existingDoc.cuenta || '') === cuenta &&
                               (existingDoc.observacion || '') === observacion;
                
                if (isSame) {
                    totalSkipped++;
                    continue;
                }

                const totalBilled = existingDoc.cantidadUsada || 0;

                if (totalBilled > 0) {
                    batch.update(app.registrosRef.doc(existingDoc.id), {
                        producto: productoDesc,
                        productId: productId,
                        cuenta: cuenta,
                        observacion: observacion
                    });
                    operationsCount++;
                } else {
                    batch.update(app.registrosRef.doc(existingDoc.id), {
                        fecha: fechaAUsar,
                        producto: productoDesc,
                        productId: productId,
                        cantidad: cantidad,
                        cuenta: cuenta,
                        observacion: observacion
                    });
                    operationsCount++;
                }
                totalUpdated++;
            } else {
                const newDocId = app.registrosRef.doc().id;

                const baseData = {
                    fecha: fechaAUsar,
                    producto: productoDesc,
                    productId: productId,
                    cantidad: cantidad,
                    cantidadUsada: 0,
                    facturas: [],
                    cuenta: cuenta,
                    observacion: observacion,
                    origen: 'excel',
                    filaExcel: filaExcelNum,
                    archivado: false,
                    timestamp: window.firebase.firestore.FieldValue.serverTimestamp()
                };

                batch.set(app.registrosRef.doc(newDocId), baseData);

                operationsCount++;
                totalProcessed++;
            }

            if (operationsCount >= 400) {
                await batch.commit();
                batch = app.db.batch();
                operationsCount = 0;
            }
        }

        if (operationsCount > 0) {
            await batch.commit();
        }

        let msg = `¡Carga de Excel finalizada!\n`;
        if (totalProcessed > 0) msg += `- ${totalProcessed} registros nuevos agregados.\n`;
        if (totalUpdated > 0) msg += `- ${totalUpdated} registros existentes actualizados.\n`;
        if (totalSkipped > 0) msg += `- ${totalSkipped} registros duplicados omitidos.\n`;
        if (totalProcessed === 0 && totalUpdated === 0) msg += `- No se agregaron nuevos registros (todos ya existían).`;
        
        alert(msg);
    }
};
