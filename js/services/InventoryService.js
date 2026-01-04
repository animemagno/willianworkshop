
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
}

// Exponer globalmente
window.InventoryService = InventoryService;
