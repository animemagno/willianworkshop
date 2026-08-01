
// Servicio de Inventario (Global)
class InventoryService {
    constructor() {
        this.collection = firebase.firestore().collection("INVENTARIO");
    }

    // Obtener todos los productos
    async obtenerTodos() {
        try {
            const snapshot = await this.collection.orderBy('codigo').get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error obteniendo productos:", error);
            return [];
        }
    }

    // Actualizar Crédito Fiscal Masivo
    async actualizarCreditoFiscalTodos() {
        try {
            console.log("Iniciando actualización masiva de Crédito Fiscal...");
            const snapshot = await this.collection.get();
            if (snapshot.empty) return 0;

            let currentBatch = firebase.firestore().batch();
            let count = 0;
            let totalProcessed = 0;

            for (const doc of snapshot.docs) {
                // Actualizamos el campo
                currentBatch.update(doc.ref, { creditoFiscal: true });
                count++;
                totalProcessed++;

                // Si llegamos a 450 (margen de seguridad para límite 500)
                if (count >= 450) {
                    await currentBatch.commit();
                    currentBatch = firebase.firestore().batch();
                    count = 0;
                }
            }
            // Commit final si quedaron pendientes
            if (count > 0) {
                await currentBatch.commit();
            }

            return totalProcessed;
        } catch (error) {
            console.error("Error actualización masiva:", error);
            throw error;
        }
    }

    // Borrar todo el inventario (PELIGROSO)
    async borrarTodo() {
        try {
            const snapshot = await this.collection.get();

            if (snapshot.empty) return true;

            let currentBatch = firebase.firestore().batch();
            let count = 0;

            for (const doc of snapshot.docs) {
                currentBatch.delete(doc.ref);
                count++;
                if (count % 490 === 0) {
                    await currentBatch.commit();
                    currentBatch = firebase.firestore().batch();
                }
            }
            await currentBatch.commit();

            console.log(`Inventario borrado.`);
            return true;
        } catch (error) {
            console.error("Error borrando inventario:", error);
            throw error;
        }
    }

    // Guardar un producto nuevo
    async guardarProducto(datos) {
        try {
            await this.collection.add(datos);
            return true;
        } catch (error) {
            console.error("Error guardando producto:", error);
            throw error;
        }
    }

    // Actualizar un producto existente
    async actualizarProducto(id, datos) {
        const db = firebase.firestore();
        const ref = this.collection.doc(id);

        try {
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(ref);
                if (!doc.exists) throw "Producto no encontrado";

                const oldData = doc.data();
                const cambios = [];

                if (datos.descripcion !== undefined && datos.descripcion !== oldData.descripcion) {
                    cambios.push(`Descripción: "${oldData.descripcion || ''}" ➔ "${datos.descripcion}"`);
                }
                if (datos.precio !== undefined && parseFloat(datos.precio) !== parseFloat(oldData.precio || 0)) {
                    cambios.push(`Precio: $${parseFloat(oldData.precio || 0).toFixed(2)} ➔ $${parseFloat(datos.precio).toFixed(2)}`);
                }
                if (datos.costo !== undefined && parseFloat(datos.costo) !== parseFloat(oldData.costo || 0)) {
                    cambios.push(`Costo c/IVA: $${parseFloat(oldData.costo || 0).toFixed(2)} ➔ $${parseFloat(datos.costo).toFixed(2)}`);
                }
                if (datos.existencia !== undefined && parseFloat(datos.existencia) !== parseFloat(oldData.existencia || 0)) {
                    cambios.push(`Existencia: ${oldData.existencia || 0} ➔ ${datos.existencia}`);
                }

                // Actualizar producto
                transaction.update(ref, datos);

                // Registrar en la bitácora del reloj si hubo cambios
                if (cambios.length > 0) {
                    const logRef = db.collection('HISTORIAL_MODIFICACIONES_PRODUCTO').doc();
                    transaction.set(logRef, {
                        productId: id,
                        codigo: oldData.codigo || datos.codigo || '',
                        descripcion: datos.descripcion || oldData.descripcion || '',
                        cambios: cambios,
                        fecha: new Date().toISOString(),
                        timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            });
            return true;
        } catch (error) {
            console.error("Error actualizando producto:", error);
            throw error;
        }
    }

    // Obtener historial de modificaciones de un producto para la vista de Reloj 🕒
    async obtenerHistorialModificaciones(productId) {
        try {
            const db = firebase.firestore();
            const snapshot = await db.collection('HISTORIAL_MODIFICACIONES_PRODUCTO')
                .where('productId', '==', productId)
                .get();
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            docs.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            return docs;
        } catch (error) {
            console.error("Error obteniendo historial de modificaciones:", error);
            return [];
        }
    }

    // GESTIÓN DE PROVEEDORES Y ABONOS
    async obtenerProveedores() {
        try {
            const db = firebase.firestore();
            const snapshot = await db.collection('PROVEEDORES').get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (e) {
            console.error("Error obteniendo proveedores:", e);
            return [];
        }
    }

    async guardarProveedor(datos) {
        try {
            const db = firebase.firestore();
            if (datos.id) {
                await db.collection('PROVEEDORES').doc(datos.id).set(datos, { merge: true });
            } else {
                await db.collection('PROVEEDORES').add({
                    ...datos,
                    saldoPendiente: datos.saldoPendiente || 0,
                    fechaCreacion: new Date().toISOString()
                });
            }
            return true;
        } catch (e) {
            console.error("Error guardando proveedor:", e);
            throw e;
        }
    }

    async registrarAbonoProveedor(abonoData) {
        const db = firebase.firestore();
        const provRef = db.collection('PROVEEDORES').doc(abonoData.proveedorId);
        const abonoRef = db.collection('ABONOS_PROVEEDOR').doc();

        return db.runTransaction(async (transaction) => {
            const provDoc = await transaction.get(provRef);
            if (!provDoc.exists) throw "Proveedor no encontrado";

            const currentSaldo = parseFloat(provDoc.data().saldoPendiente || 0);
            const montoAbono = parseFloat(abonoData.monto || 0);
            const nuevoSaldo = Math.max(0, currentSaldo - montoAbono);

            transaction.update(provRef, { saldoPendiente: nuevoSaldo });
            transaction.set(abonoRef, {
                ...abonoData,
                saldoAnterior: currentSaldo,
                nuevoSaldo: nuevoSaldo,
                estado: 'COMPLETADO',
                fecha: new Date().toISOString(),
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            return { abonoId: abonoRef.id, nuevoSaldo };
        });
    }

    async cancelarAbonoProveedor(abonoId) {
        const db = firebase.firestore();
        const abonoRef = db.collection('ABONOS_PROVEEDOR').doc(abonoId);

        return db.runTransaction(async (transaction) => {
            const abonoDoc = await transaction.get(abonoRef);
            if (!abonoDoc.exists) throw "Abono no encontrado";

            const aData = abonoDoc.data();
            if (aData.estado === 'CANCELADO') throw "Este abono ya está cancelado.";

            const provRef = db.collection('PROVEEDORES').doc(aData.proveedorId);
            const provDoc = await transaction.get(provRef);

            if (provDoc.exists) {
                const currentSaldo = parseFloat(provDoc.data().saldoPendiente || 0);
                const restoredSaldo = currentSaldo + parseFloat(aData.monto || 0);
                transaction.update(provRef, { saldoPendiente: restoredSaldo });
            }

            transaction.update(abonoRef, { estado: 'CANCELADO', fechaCancelacion: new Date().toISOString() });
            return true;
        });
    }

    // Eliminar un producto individual
    async eliminarProducto(id) {
        try {
            await this.collection.doc(id).delete();
            return true;
        } catch (error) {
            console.error("Error eliminando producto:", error);
            throw error;
        }
    }

    // Buscar producto por termino (busqueda inteligente: codigo, nombre o alias)
    async buscarProductoInteligente(term) {
        if (!term) return [];
        term = term.toLowerCase().trim();

        try {
            // Nota: Firestore no tiene "OR" nativo facil ni busqueda full-text en cliente plano.
            // Traemos todo (ya cacheado en Controller) o hacemos query simple.
            // Para eficiencia, asumiremos que el Controller le pasa la lista completa o filtrada,
            // PERO aqui dejare un metodo util si quisieramos ir al server.
            // En este caso, usaremos la logica de filtrado en el Controller sobre la cache local para velocidad.
            return [];
        } catch (e) { return []; }
    }

    // Registrar Salida / Factura Fisica (Y aprender alias)
    async registrarSalida(header, items) {
        const db = firebase.firestore();
        const exitsRef = db.collection('INVENTARIO_SALIDAS');

        return db.runTransaction(async (transaction) => {
            const updates = [];

            // FASE 1: LECTURAS (Todo get debe ir antes de cualquier update/set)
            for (const item of items) {
                if (!item.productId) continue; // Si no se vinculo a nada, no leemos nada

                const productRef = this.collection.doc(item.productId);
                const doc = await transaction.get(productRef);

                if (!doc.exists) throw `Producto ${item.productId} no existe.`;
                updates.push({ ref: productRef, docData: doc.data(), itemInfo: item });
            }

            // FASE 2: ESCRITURAS
            // A. Actualizar Stock y Alias de Productos
            for (const up of updates) {
                const pData = up.docData;
                const item = up.itemInfo;

                // Calculo Stock
                const currentStock = parseFloat(pData.existencia || 0);
                const qty = parseFloat(item.cantidad || 0);
                const newStock = currentStock - qty;

                const updatePayload = { existencia: newStock };

                // Logica Alias (Si la descripcion papel es diferente a la oficial)
                const rawDesc = (item.descripcionPapel || "").trim();
                if (rawDesc && rawDesc.length > 2) {
                    const oficial = (pData.descripcion || "").toLowerCase();
                    const input = rawDesc.toLowerCase();
                    if (input !== oficial && !oficial.includes(input)) {
                        let aliases = pData.aliases || [];
                        if (!aliases.includes(input)) {
                            aliases.push(input);
                            updatePayload.aliases = aliases;
                        }
                    }
                }

                transaction.update(up.ref, updatePayload);
            }

            // B. Guardar Documento de Salida
            const exitDocRef = exitsRef.doc();
            transaction.set(exitDocRef, {
                ...header, // fecha, numeroFactura, CLIENTE
                items: items,
                total: items.reduce((sum, i) => sum + (i.total || 0), 0),
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
    }

    async obtenerSalidas() {
        try {
            const snapshot = await firebase.firestore()
                .collection('INVENTARIO_SALIDAS')
                .orderBy('fecha', 'desc') // Usar fecha de factura
                .limit(100)
                .get();
                
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Ordenar secundariamente por número de factura (descendente) de forma numérica
            docs.sort((a, b) => {
                if (a.fecha !== b.fecha) {
                    const dateA = a.fecha || "";
                    const dateB = b.fecha || "";
                    return dateB.localeCompare(dateA);
                }
                
                const numA = parseInt(a.numeroFactura) || 0;
                const numB = parseInt(b.numeroFactura) || 0;
                return numB - numA;
            });
            
            return docs;
        } catch (e) {
            console.error(e);
            return [];
        }
    }

    // Revertir una salida (Devolver stock)
    async revertirSalida(exitId) {
        const db = firebase.firestore();
        const exitRef = db.collection('INVENTARIO_SALIDAS').doc(exitId);

        return db.runTransaction(async (transaction) => {
            const exitDoc = await transaction.get(exitRef);
            if (!exitDoc.exists) throw "Registro no encontrado";

            const data = exitDoc.data();
            if (data.revertida) throw "Esta salida ya fue revertida anteriormente.";

            // Devolver stock item por item
            for (const item of data.items) {
                if (item.productId) {
                    const productRef = this.collection.doc(item.productId);
                    const pDoc = await transaction.get(productRef);
                    if (pDoc.exists) {
                        const currentStock = parseFloat(pDoc.data().existencia || 0);
                        const qtyToReturn = parseFloat(item.cantidad || 0);
                        transaction.update(productRef, {
                            existencia: currentStock + qtyToReturn
                        });
                    }
                }
            }

            // Marcar como revertida
            transaction.update(exitRef, {
                revertida: true,
                revertidaFecha: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
    }

    // Eliminar registro de salida
    async eliminarSalida(exitId) {
        try {
            await firebase.firestore().collection('INVENTARIO_SALIDAS').doc(exitId).delete();
            return true;
        } catch (e) {
            console.error(e);
            throw e;
        }
    }

    // Eliminar TODAS las salidas
    async borrarTodasSalidas() {
        try {
            const snapshot = await firebase.firestore().collection('INVENTARIO_SALIDAS').get();
            if (snapshot.empty) return true;

            let currentBatch = firebase.firestore().batch();
            let count = 0;

            for (const doc of snapshot.docs) {
                currentBatch.delete(doc.ref);
                count++;
                if (count % 490 === 0) {
                    await currentBatch.commit();
                    currentBatch = firebase.firestore().batch();
                }
            }
            await currentBatch.commit();
            return true;
        } catch (error) {
            console.error("Error borrando todas las salidas:", error);
            throw error;
        }
    }

    // Obtener el ultimo numero de factura registrado
    async getLastInvoiceNumber() {
        try {
            const snapshot = await firebase.firestore()
                .collection('INVENTARIO_SALIDAS')
                .orderBy('fecha', 'desc') // Ordenar por fecha reciente
                .limit(10) // Traer ultimas 10 para buscar serie
                .get();

            if (snapshot.empty) return 0;

            // Buscar el maximo numero que sea numerico
            let maxNum = 0;
            snapshot.docs.forEach(doc => {
                const num = parseInt(doc.data().numeroFactura) || 0;
                if (num > maxNum) maxNum = num;
            });

            return maxNum;
        } catch (e) {
            console.error(e);
            return 0;
        }
    }

    // Verificar si existe factura
    async checkInvoiceExists(num) {
        try {
            const snapshot = await firebase.firestore()
                .collection('INVENTARIO_SALIDAS')
                .where('numeroFactura', '==', num.toString())
                .limit(1)
                .get();
            return !snapshot.empty;
        } catch (e) { return false; }
    }

    // =========================================================
    // NUEVAS FUNCIONES: ENTRADAS, COSTO PROMEDIO Y PROVEEDORES
    // =========================================================

    // Obtener proveedores (desde colección 'cuentas')
    async obtenerProveedores() {
        try {
            const snapshot = await firebase.firestore().collection('cuentas').get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error obteniendo proveedores:", error);
            return [];
        }
    }

    // Registrar entrada MASIVA (Múltiples items)
    async registrarEntradaMasiva(items, providerId, providerName, isCredito) {
        const db = firebase.firestore();
        const entriesRef = db.collection('INVENTARIO_ENTRADAS');
        let providerRef = providerId ? db.collection('cuentas').doc(providerId) : null;

        return db.runTransaction(async (transaction) => {
            // PHASE 1: READS
            const productReads = [];
            const newProductOps = []; // Items que son nuevos productos

            // A. Leer Productos Existentes y Proveedor
            for (const item of items) {
                if (item.productId) {
                    const ref = this.collection.doc(item.productId);
                    const doc = await transaction.get(ref);
                    if (!doc.exists) throw `Producto ${item.productId} no encontrado.`;
                    productReads.push({ ref, doc, item });
                } else {
                    newProductOps.push(item);
                }
            }

            let providerData = null;
            if (isCredito && providerRef) {
                const pDoc = await transaction.get(providerRef);
                if (pDoc.exists) providerData = pDoc.data();
            }

            // PHASE 1.5: VERIFICAR Y CREAR PROVEEDOR SI NO EXISTE
            // Validar que tengamos un nombre para crear
            if (!providerId && providerName && providerName.trim().length > 0) {
                const newProvRef = db.collection('cuentas').doc();
                transaction.set(newProvRef, {
                    nombre: providerName.toUpperCase(),
                    saldo: 0,
                    telefono: "",
                    creado: firebase.firestore.FieldValue.serverTimestamp()
                });
                providerId = newProvRef.id;
                providerRef = newProvRef;
                providerData = { saldo: 0 }; // Inicializar para logica de saldo abajo
            } else if (providerId && !providerData) {
                // Caso raro: venia ID pero no existia el doc (no deberia pasar si leimos bien arriba)
                // Si providerRef existe pero el doc no, providerData es null.
            }

            // PHASE 2: WRITES & CALCULATIONS
            const historyItems = [];
            let totalCostInvoice = 0;

            // 1. Procesar Productos Existentes
            for (const pRead of productReads) {
                const pData = pRead.doc.data();
                const item = pRead.item;

                const currentCosto = parseFloat(pData.costo || 0);       // con IVA
                const currentStock = parseFloat(pData.existencia || 0);
                const entryQty = parseFloat(item.qty);
                const entryCosto = parseFloat(item.cost);                  // ya llega con IVA (processEntry lo convierte)

                // Precio promedio ponderado (con IVA)
                const totalStock = currentStock + entryQty;
                const nuevoCosto = totalStock > 0
                    ? (currentStock * currentCosto + entryQty * entryCosto) / totalStock
                    : entryCosto;
                const nuevoCostoSinIva = nuevoCosto / 1.13;

                // Acumular en RESUMEN_ENTRADAS_MES en vez de sumarle directamente a INVENTARIO
                const stableKey = window.RegistrosApp ? window.RegistrosApp.getGroupingKey(pData.descripcion, item.productId) : (pData.codigo || pData.descripcion).replace(/\//g, '-').trim();
                const resumenRef = db.collection('RESUMEN_ENTRADAS_MES').doc(stableKey);
                transaction.set(resumenRef, {
                    productId: item.productId,
                    producto: pData.descripcion,
                    codigoOficial: pData.codigo || '',
                    precioVentaOficial: pData.precio || 0,
                    costoUnitarioOficial: pData.costo || 0,
                    cantidadEntrada: firebase.firestore.FieldValue.increment(entryQty),
                    costoAcumulado: firebase.firestore.FieldValue.increment(entryQty * entryCosto),
                    mes: new Date().toISOString().substring(0, 7)
                }, { merge: true });

                const updatePayload = {
                    costo: nuevoCosto,
                    costoSinIva: nuevoCostoSinIva,
                    creditoFiscal: item.creditoFiscal
                };

                // Actualizar proveedor si viene en la entrada
                if (providerName && providerName.trim().length > 0) {
                    updatePayload.proveedor = providerName;
                }

                // Actualizar descripcionFactura solo si el item trae un nombre de factura diferente
                if (item.descripcionFactura && item.descripcionFactura.trim().length > 0) {
                    updatePayload.descripcionFactura = item.descripcionFactura.trim();
                }

                transaction.update(pRead.ref, updatePayload);

                historyItems.push({
                    productId: item.productId,
                    productCode: pData.codigo || "",
                    productName: pData.descripcion,
                    cantidad: entryQty,
                    costoUnitario: entryCosto,
                    costoAnterior: currentCosto,
                    costoNuevo: nuevoCosto,
                    costoSinIva: nuevoCostoSinIva,
                    total: entryQty * entryCosto
                });

                totalCostInvoice += (entryQty * entryCosto);
            }

            // 2. Procesar Productos Nuevos
            for (const item of newProductOps) {
                const newProdRef = this.collection.doc();
                const entryQty = parseFloat(item.qty);
                const entryCosto = parseFloat(item.cost); // ya llega con IVA
                const finalCode = item.displayCode || "";
                const finalPrice = item.salePrice !== null ? parseFloat(item.salePrice) : 0;
                const costoSinIva = entryCosto / 1.13;

                // Parse optional multi-codes
                const extraCodes = Array.isArray(item.codigosProveedor) ? item.codigosProveedor : [];

                // Nombre del taller = item.name (el usuario lo asignó en el carrito)
                // Nombre de factura = item.descripcionFactura (viene del JSON o del campo editable)
                const nombreTaller = (item.name || "").trim();
                const nombreFactura = (item.descripcionFactura && item.descripcionFactura.trim().length > 0)
                    ? item.descripcionFactura.trim()
                    : nombreTaller;

                // Crear el producto en el catálogo oficial de INVENTARIO congelado en 0
                transaction.set(newProdRef, {
                    codigo: finalCode,
                    codigosProveedor: extraCodes,
                    descripcion: nombreTaller,
                    descripcionFactura: nombreFactura,
                    costo: entryCosto,
                    costoSinIva: costoSinIva,
                    precio: finalPrice,
                    existencia: 0, // Congelado en 0 hasta la auditoría
                    stockMinimo: 5,
                    creditoFiscal: item.creditoFiscal || false,
                    proveedor: providerName || ""
                });

                // Registrar el stock inicial en la colección de tránsito de compras
                const stableKeyNew = window.RegistrosApp ? window.RegistrosApp.getGroupingKey(nombreTaller, newProdRef.id) : (codigo || nombreTaller).replace(/\//g, '-').trim();
                const resumenRef = db.collection('RESUMEN_ENTRADAS_MES').doc(stableKeyNew);
                transaction.set(resumenRef, {
                    productId: newProdRef.id,
                    producto: nombreTaller,
                    codigoOficial: codigo || '',
                    precioVentaOficial: precioVenta || 0,
                    costoUnitarioOficial: entryCosto || 0,
                    cantidadEntrada: firebase.firestore.FieldValue.increment(entryQty),
                    costoAcumulado: firebase.firestore.FieldValue.increment(entryQty * entryCosto),
                    mes: new Date().toISOString().substring(0, 7)
                }, { merge: true });

                historyItems.push({
                    productId: newProdRef.id,
                    productCode: finalCode,
                    productName: nombreTaller,
                    cantidad: entryQty,
                    costoUnitario: entryCosto,
                    costoSinIva: costoSinIva,
                    costoAnterior: 0,
                    costoNuevo: entryCosto,
                    total: entryQty * entryCosto
                });

                totalCostInvoice += (entryQty * entryCosto);
            }

            // 3. Guardar Registro Maestro de Entrada
            const masterEntryRef = entriesRef.doc();
            transaction.set(masterEntryRef, {
                providerId: providerId || null,
                providerName: providerName || null,
                esCredito: isCredito,
                items: historyItems,
                total: totalCostInvoice,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            // 4. Actualizar Saldo Proveedor
            if (isCredito && providerRef && providerData) {
                const currentBalance = parseFloat(providerData.saldo || 0);
                transaction.update(providerRef, {
                    saldo: currentBalance + totalCostInvoice
                });
            }
        });
    }

    // Obtener historial de entradas
    async obtenerEntradas() {
        try {
            const snapshot = await firebase.firestore()
                .collection('INVENTARIO_ENTRADAS')
                .orderBy('timestamp', 'desc')
                .limit(100) // Limite inicial
                .get();

            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error obteniendo entradas:", error);
            return [];
        }
    }

    // Revertir una entrada
    async revertirEntrada(entryId) {
        const db = firebase.firestore();
        const entryRef = db.collection('INVENTARIO_ENTRADAS').doc(entryId);

        return db.runTransaction(async (transaction) => {
            // PHASE 1: READS
            const entryDoc = await transaction.get(entryRef);
            if (!entryDoc.exists) throw "La entrada no existe.";
            const entry = entryDoc.data();
            if (entry.revertida) throw "Entrada ya revertida.";

            const items = entry.items || [{
                productId: entry.productId,
                cantidad: entry.cantidad,
                costoUnitario: entry.costoUnitario
            }];

            // 1.1 Read All Product Docs
            const productReads = [];
            for (const item of items) {
                if (item.productId) {
                    const productRef = this.collection.doc(item.productId);
                    const doc = await transaction.get(productRef);
                    productReads.push({ ref: productRef, doc: doc, item: item });
                }
            }

            // 1.2 Read Provider Doc (if needed)
            let providerRef = null;
            let providerDoc = null;
            if (entry.esCredito && entry.providerId) {
                providerRef = db.collection('cuentas').doc(entry.providerId);
                providerDoc = await transaction.get(providerRef);
            }

            // PHASE 2: WRITES
            // 2.1 Update RESUMEN_ENTRADAS_MES instead of INVENTARIO directly
            for (const pr of productReads) {
                if (pr.doc.exists) {
                    const qtyToRemove = parseFloat(pr.item.cantidad);
                    const costToRemove = parseFloat(pr.item.costoUnitario);

                    const stableKeyDel = window.RegistrosApp ? window.RegistrosApp.getGroupingKey(pr.doc.data().descripcion, pr.item.productId) : (pr.doc.data().codigo || pr.doc.data().descripcion).replace(/\//g, '-').trim();
                    const resumenRef = db.collection('RESUMEN_ENTRADAS_MES').doc(stableKeyDel);
                    transaction.set(resumenRef, {
                        cantidadEntrada: firebase.firestore.FieldValue.increment(-qtyToRemove),
                        costoAcumulado: firebase.firestore.FieldValue.increment(-qtyToRemove * costToRemove)
                    }, { merge: true });
                }
            }

            // 2.2 Revert Provider Balance
            if (providerRef && providerDoc && providerDoc.exists) {
                const currentBalance = parseFloat(providerDoc.data().saldo || 0);
                const entryTotal = entry.total || (parseFloat(entry.cantidad) * parseFloat(entry.costoUnitario));
                transaction.update(providerRef, { saldo: currentBalance - entryTotal });
            }

            // 2.3 Mark Entry Reverted
            transaction.update(entryRef, {
                revertida: true,
                revertidaFecha: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
    }

    // Eliminar una entrada (Solo si ya fue revertida o por limpieza)
    async eliminarEntrada(entryId) {
        try {
            await firebase.firestore().collection('INVENTARIO_ENTRADAS').doc(entryId).delete();
            return true;
        } catch (e) {
            console.error("Error eliminando entrada:", e);
            throw e;
        }
    }

    // Eliminar TODAS las entradas
    async borrarTodasEntradas() {
        try {
            const snapshot = await firebase.firestore().collection('INVENTARIO_ENTRADAS').get();
            if (snapshot.empty) return true;

            let currentBatch = firebase.firestore().batch();
            let count = 0;

            for (const doc of snapshot.docs) {
                currentBatch.delete(doc.ref);
                count++;
                if (count % 490 === 0) {
                    await currentBatch.commit();
                    currentBatch = firebase.firestore().batch();
                }
            }
            await currentBatch.commit();
            return true;
        } catch (error) {
            console.error("Error borrando todas las entradas:", error);
            throw error;
        }
    }

    // --- SISTEMA DE BACKUP ---
    async crearBackup() {
        const db = firebase.firestore();
        try {
            const snapshot = await this.collection.get();
            const productos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const backupRef = db.collection('INVENTARIO_BACKUPS').doc();
            await backupRef.set({
                fecha: firebase.firestore.FieldValue.serverTimestamp(),
                viva: true,
                totalProductos: productos.length,
                data: productos
            });
            return true;
        } catch (e) {
            console.error("Error creando backup:", e);
            throw e;
        }
    }

    async obtenerBackups() {
        try {
            const snapshot = await firebase.firestore()
                .collection('INVENTARIO_BACKUPS')
                .orderBy('fecha', 'desc')
                .limit(10)
                .get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (e) { return []; }
    }

    async restaurarDesdeBackup(backupId) {
        const db = firebase.firestore();
        try {
            const backupDoc = await db.collection('INVENTARIO_BACKUPS').doc(backupId).get();
            if (!backupDoc.exists) throw "Backup no encontrado";

            const backupData = backupDoc.data().data;

            // 1. Borrar actual
            await this.borrarTodo();

            // 2. Restaurar items
            let currentBatch = db.batch();
            let count = 0;
            for (const item of backupData) {
                const { id, ...data } = item;
                const ref = this.collection.doc(id);
                currentBatch.set(ref, data);
                count++;
                if (count % 450 === 0) {
                    await currentBatch.commit();
                    currentBatch = db.batch();
                }
            }
            if (count % 450 !== 0) await currentBatch.commit();
            return true;
        } catch (e) {
            console.error(e);
            throw e;
        }
    }

    // --- GESTIÓN DE ALIAS ---
    async obtenerTodosLosAlias() {
        try {
            const snapshot = await this.collection.get();
            const lista = [];
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.aliases && data.aliases.length > 0) {
                    lista.push({
                        productId: doc.id,
                        descripcion: data.descripcion,
                        codigo: data.codigo,
                        aliases: data.aliases
                    });
                }
            });
            return lista;
        } catch (e) { return []; }
    }

    async eliminarAlias(productId, aliasAEliminar) {
        try {
            const ref = this.collection.doc(productId);
            await ref.update({
                aliases: firebase.firestore.FieldValue.arrayRemove(aliasAEliminar)
            });
            return true;
        } catch (e) { throw e; }
    }

    // --- SISTEMA DE ARCHIVADO MENSUAL ---
    async archivarMovimientosMes(mes, anio) {
        const db = firebase.firestore();
        const start = new Date(anio, mes - 1, 1);
        const end = new Date(anio, mes, 0, 23, 59, 59);

        // 1. Obtener Entradas y Salidas del periodo
        const entriesSnap = await db.collection('INVENTARIO_ENTRADAS')
            .where('timestamp', '>=', start)
            .where('timestamp', '<=', end)
            .get();

        const exitsSnap = await db.collection('INVENTARIO_SALIDAS')
            .where('timestamp', '>=', start)
            .where('timestamp', '<=', end)
            .get();

        if (entriesSnap.empty && exitsSnap.empty) throw "No hay movimientos para archivar en este periodo.";

        const entries = entriesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const exits = exitsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 2. Crear Registro de Archivo
        const archiveRef = db.collection('ARCHIVOS_MENSUALES').doc();
        await archiveRef.set({
            mes,
            anio,
            periodo: `${mes}/${anio}`,
            fechaCierre: firebase.firestore.FieldValue.serverTimestamp(),
            totalEntradas: entries.length,
            totalSalidas: exits.length,
            entradas: entries,
            salidas: exits
        });

        // 3. Eliminar Originales (Batch)
        let batch = db.batch();
        let counts = 0;

        entriesSnap.docs.forEach(doc => {
            batch.delete(doc.ref);
            counts++;
            if (counts % 450 === 0) { batch.commit(); batch = db.batch(); }
        });

        exitsSnap.docs.forEach(doc => {
            batch.delete(doc.ref);
            counts++;
            if (counts % 450 === 0) { batch.commit(); batch = db.batch(); }
        });

        if (counts % 450 !== 0) await batch.commit();

        return true;
    }

    async obtenerArchivosMensuales() {
        try {
            const snapshot = await firebase.firestore()
                .collection('ARCHIVOS_MENSUALES')
                .orderBy('fechaCierre', 'desc')
                .get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (e) { return []; }
    }

    async obtenerDetalleArchivo(id) {
        try {
            const doc = await firebase.firestore().collection('ARCHIVOS_MENSUALES').doc(id).get();
            return doc.exists ? doc.data() : null;
        } catch (e) { throw e; }
    }

    // --- ELIMINAR BACKUP ---
    async eliminarBackup(backupId) {
        try {
            await firebase.firestore().collection('INVENTARIO_BACKUPS').doc(backupId).delete();
            return true;
        } catch (e) {
            console.error("Error eliminando backup:", e);
            throw e;
        }
    }
}

// Exponer globalmente
window.InventoryService = InventoryService;

