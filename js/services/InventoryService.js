
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
    // items: [{ productId, name (if new), qty, cost }, ...]
    async registrarEntradaMasiva(items, providerId, providerName, isCredito) {
        const db = firebase.firestore();
        const entriesRef = db.collection('INVENTARIO_ENTRADAS');
        const providerRef = providerId ? db.collection('cuentas').doc(providerId) : null;

        return db.runTransaction(async (transaction) => {
            let totalCostBatch = 0;

            for (const item of items) {
                let productRef;
                let currentStock = 0;
                let currentCost = 0;
                let finalName = item.name; // Nombre final para historia

                // A. Manejo del Producto (Existente vs Nuevo)
                if (item.productId) {
                    // Producto Existente
                    productRef = this.collection.doc(item.productId);
                    const doc = await transaction.get(productRef);
                    if (!doc.exists) throw `Producto con ID ${item.productId} no encontrado.`;

                    const pData = doc.data();
                    currentStock = parseFloat(pData.existencia || 0);
                    currentCost = parseFloat(pData.costo || 0);
                    finalName = pData.descripcion; // Usar nombre oficial
                } else {
                    // Producto Nuevo (Crear al vuelo)
                    const newProdRef = this.collection.doc();
                    productRef = newProdRef;

                    // Crear el documento del producto
                    transaction.set(newProdRef, {
                        codigo: "GEN-" + Math.floor(Math.random() * 10000), // Código temporal o generico
                        descripcion: item.name,
                        descripcionFactura: item.name,
                        costo: item.cost, // Costo inicial
                        precio: item.cost * 1.30, // Precio sugerido +30%
                        existencia: 0, // Se sumará abajo
                        stockMinimo: 5,
                        creditoFiscal: false,
                        proveedor: providerName || ""
                    });

                    currentStock = 0;
                    currentCost = item.cost;
                    item.productId = newProdRef.id; // Asignar ID generado
                }

                // B. Cálculos
                const entryQty = parseFloat(item.qty);
                const entryCost = parseFloat(item.cost);
                const newStock = currentStock + entryQty;

                let newCost = currentCost;
                if (newStock > 0) {
                    // WAC: (ValorStockActual + ValorEntrada) / NuevoStock
                    const totalValue = (currentStock * currentCost) + (entryQty * entryCost);
                    newCost = totalValue / newStock;
                }

                // C. Actualizar Producto (Solo stock y costo)
                transaction.update(productRef, {
                    existencia: newStock,
                    costo: newCost
                });

                // D. Log Historial
                const entryDocRef = entriesRef.doc();
                transaction.set(entryDocRef, {
                    productId: item.productId,
                    productName: finalName,
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

            // E. Actualizar Saldo Proveedor (Una sola vez por el total)
            if (isCredito && providerRef) {
                const pDoc = await transaction.get(providerRef);
                if (pDoc.exists) {
                    const currentBalance = parseFloat(pDoc.data().saldo || 0);
                    transaction.update(providerRef, {
                        saldo: currentBalance + totalCostBatch
                    });
                }
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
            // 1. Leer Entrada
            const entryDoc = await transaction.get(entryRef);
            if (!entryDoc.exists) throw "La entrada no existe o ya fue borrada.";
            const entry = entryDoc.data();

            if (entry.revertida) throw "Esta entrada ya fue revertida.";

            // 2. Leer Producto
            const productRef = this.collection.doc(entry.productId);
            const productDoc = await transaction.get(productRef);

            if (productDoc.exists) {
                const product = productDoc.data();
                const currentStock = parseFloat(product.existencia || 0);
                const currentAvgCost = parseFloat(product.costo || 0);
                const qtyToRemove = parseFloat(entry.cantidad);
                const costToRemove = parseFloat(entry.costoUnitario);

                // Matematica Inversa WAC:
                // NuevoTotal = (StockActual * CostoPromActual) - (CantEntrada * CostoEntrada)
                // NuevoStock = StockActual - CantEntrada

                const finalStock = currentStock - qtyToRemove;
                let finalCost = currentAvgCost;

                if (finalStock > 0) {
                    const currentTotalValue = currentStock * currentAvgCost;
                    const valueToRemove = qtyToRemove * costToRemove;
                    finalCost = (currentTotalValue - valueToRemove) / finalStock;

                    // Sanity check: Cost shouldn't be negative (floating point errors)
                    if (finalCost < 0) finalCost = 0;
                } else {
                    finalCost = 0; // O mantener el ultimo conocido, pero si no hay stock, costo 0 es seguro
                }

                transaction.update(productRef, {
                    existencia: finalStock,
                    costo: finalCost
                });
            }

            // 3. Revertir Saldo Proveedor (Si fue crédito)
            if (entry.esCredito && entry.providerId) {
                const providerRef = db.collection('cuentas').doc(entry.providerId);
                const providerDoc = await transaction.get(providerRef);

                if (providerDoc.exists) {
                    const currentBalance = parseFloat(providerDoc.data().saldo || 0);
                    const amountDeducted = parseFloat(entry.cantidad) * parseFloat(entry.costoUnitario);
                    transaction.update(providerRef, {
                        saldo: currentBalance - amountDeducted
                    });
                }
            }

            // 4. Marcar entrada como revertida (o borrarla, pero mejor marcarla)
            // User asked "Opción de REVERTIR", history is usually kept.
            // Para mantener el historial limpio, podemos marcarla como "ANULADA" en el UI.
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
