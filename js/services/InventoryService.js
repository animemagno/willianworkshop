
// Servicio de Inventario (Global)
class InventoryService {
    constructor() {
        // Usamos la db global inicializada en el HTML
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

    // Borrar todo el inventario (PELIGROSO)
    async borrarTodo() {
        try {
            const snapshot = await this.collection.get();

            if (snapshot.empty) return true;

            const batch = firebase.firestore().batch(); // batch desde instancia global
            let count = 0;
            // OJO: Firestore batch limit is 500. Si hay más, fallará.
            // Para simplicidad ahora: Borrar de 500 en 500.

            // Implementación simple para < 500
            if (snapshot.size <= 500) {
                snapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                await batch.commit();
            } else {
                // Borrado recursivo o múltiple batches (TODO si es necesario)
                // Por ahora asumimos < 500 o que el usuario borre varias veces.
                let i = 0;
                let currentBatch = firebase.firestore().batch();
                for (const doc of snapshot.docs) {
                    currentBatch.delete(doc.ref);
                    i++;
                    if (i % 490 === 0) {
                        await currentBatch.commit();
                        currentBatch = firebase.firestore().batch();
                    }
                }
                await currentBatch.commit();
            }

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
}

// Exponer globalmente
window.InventoryService = InventoryService;
