
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
        try {
            await this.collection.doc(id).update(datos);
            return true;
        } catch (error) {
            console.error("Error actualizando producto:", error);
            throw error;
        }
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
                .limit(50)
                .get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
        const providerRef = providerId ? db.collection('cuentas').doc(providerId) : null;

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

            // PHASE 2: WRITES & CALCULATIONS
            let totalCostBatch = 0;

            // 1. Procesar Productos Existentes
            for (const pRead of productReads) {
                const pData = pRead.doc.data();
                const item = pRead.item;

                const currentStock = parseFloat(pData.existencia || 0);
                const currentCost = parseFloat(pData.costo || 0);
                const entryQty = parseFloat(item.qty);
                const entryCost = parseFloat(item.cost);

                const newStock = currentStock + entryQty;
                let newCost = currentCost;

                // WAC
                if (newStock > 0) {
                    const totalValue = (currentStock * currentCost) + (entryQty * entryCost);
                    newCost = totalValue / newStock;
                }

                transaction.update(pRead.ref, { existencia: newStock, costo: newCost });

                // Log Historial
                const entryDocRef = entriesRef.doc();
                transaction.set(entryDocRef, {
                    productId: item.productId,
                    productName: pData.descripcion,
                    cantidad: entryQty,
                    costoUnitario: entryCost,
                    costoAnterior: currentCost,
                    costoNuevo: newCost,
                    stockAnterior: currentStock,
                    stockNuevo: newStock,
                    providerId: providerId || null,
                    providerName: providerName || null,
                    esCredito: isCredito,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });

                totalCostBatch += (entryQty * entryCost);
            }

            // 2. Procesar Productos Nuevos
            for (const item of newProductOps) {
                const newProdRef = this.collection.doc();
                const entryQty = parseFloat(item.qty);
                const entryCost = parseFloat(item.cost);

                transaction.set(newProdRef, {
                    codigo: "GEN-" + Math.floor(Math.random() * 10000),
                    descripcion: item.name,
                    descripcionFactura: item.name,
                    costo: entryCost,
                    precio: entryCost * 1.30,
                    existencia: entryQty,
                    stockMinimo: 5,
                    creditoFiscal: false,
                    proveedor: providerName || ""
                });

                // Log Historial (Nuevo)
                const entryDocRef = entriesRef.doc();
                transaction.set(entryDocRef, {
                    productId: newProdRef.id,
                    productName: item.name,
                    cantidad: entryQty,
                    costoUnitario: entryCost,
                    costoAnterior: 0,
                    costoNuevo: entryCost,
                    stockAnterior: 0,
                    stockNuevo: entryQty,
                    providerId: providerId || null,
                    providerName: providerName || null,
                    esCredito: isCredito,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });

                totalCostBatch += (entryQty * entryCost);
            }

            // 3. Actualizar Saldo Proveedor
            if (isCredito && providerRef && providerData) {
                const currentBalance = parseFloat(providerData.saldo || 0);
                transaction.update(providerRef, {
                    saldo: currentBalance + totalCostBatch
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

            const productRef = this.collection.doc(entry.productId);
            const productDoc = await transaction.get(productRef);

            let providerDoc = null;
            let providerRef = null;
            if (entry.esCredito && entry.providerId) {
                providerRef = db.collection('cuentas').doc(entry.providerId);
                providerDoc = await transaction.get(providerRef);
            }

            // PHASE 2: WRITES
            // Revertir Producto
            if (productDoc.exists) {
                const pData = productDoc.data();
                const currentStock = parseFloat(pData.existencia || 0);
                const currentAvgCost = parseFloat(pData.costo || 0);
                const qtyToRemove = parseFloat(entry.cantidad);
                const costToRemove = parseFloat(entry.costoUnitario);

                const finalStock = currentStock - qtyToRemove;
                let finalCost = currentAvgCost;

                if (finalStock > 0) {
                    const currentTotalVal = currentStock * currentAvgCost;
                    const valToRemove = qtyToRemove * costToRemove;
                    finalCost = (currentTotalVal - valToRemove) / finalStock;
                    if (finalCost < 0) finalCost = 0;
                } else {
                    finalCost = 0;
                }

                transaction.update(productRef, { existencia: finalStock, costo: finalCost });
            }

            // Revertir Proveedor
            if (providerRef && providerDoc && providerDoc.exists) {
                const currentBalance = parseFloat(providerDoc.data().saldo || 0);
                const amount = parseFloat(entry.cantidad) * parseFloat(entry.costoUnitario);
                transaction.update(providerRef, { saldo: currentBalance - amount });
            }

            // Marcar Revertida
            transaction.update(entryRef, {
                revertida: true,
                revertidaFecha: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
    }

    // Eliminar registro de entrada (Solo si ya está revertida o se desea borrar forzosamente)
    async eliminarEntrada(entryId) {
        try {
            await firebase.firestore().collection('INVENTARIO_ENTRADAS').doc(entryId).delete();
            return true;
        } catch (error) {
            console.error("Error eliminando entrada:", error);
            throw error;
        }
    }
}

// Exponer globalmente
window.InventoryService = InventoryService;

