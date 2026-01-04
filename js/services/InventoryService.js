import { db } from '../config/firebase-config.js';

export class InventoryService {
    constructor() {
        this.collection = db.collection("INVENTARIO");
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
            // Firestore obliga a borrar de a pocos (batches)
            const snapshot = await this.collection.get();

            if (snapshot.empty) return true; // Ya estaba vacío

            // Borramos en grupos de 500 (límite de Firestore)
            const batch = db.batch();
            let count = 0;

            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
                count++;
            });

            await batch.commit();
            console.log(`Borrados ${count} productos.`);
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
