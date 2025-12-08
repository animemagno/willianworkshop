import { db } from "../config/firebase-config.js";
import {
    collection,
    getDocs,
    addDoc,
    deleteDoc,
    doc,
    query,
    orderBy,
    serverTimestamp,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * Servicio para gestionar la colección de "entregas".
 */
export class DeliveriesService {
    constructor() {
        this.entregas = [];
    }

    /**
     * Carga todas las entregas ordenadas por fecha
     * @returns {Promise<Array>}
     */
    async loadAll() {
        try {
            const q = query(collection(db, "entregas"), orderBy("fechaCreacion", "desc"));
            const snapshot = await getDocs(q);

            this.entregas = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            return this.entregas;
        } catch (error) {
            console.error("Error cargando entregas:", error);
            // Return empty if fails or collection doesn't exist yet
            return [];
        }
    }

    async addDelivery(data) {
        try {
            const docData = {
                ...data, // cliente, equipo, fecha, estado: 'pendiente'
                fechaCreacion: serverTimestamp()
            };
            const docRef = await addDoc(collection(db, "entregas"), docData);
            const newDelivery = { id: docRef.id, ...docData };
            this.entregas.unshift(newDelivery);
            return newDelivery;
        } catch (error) {
            console.error("Error agregando entrega:", error);
            throw error;
        }
    }

    async updateStatus(id, newStatus) {
        try {
            await updateDoc(doc(db, "entregas", id), { estado: newStatus });
            const index = this.entregas.findIndex(e => e.id === id);
            if (index !== -1) {
                this.entregas[index].estado = newStatus;
            }
        } catch (error) {
            console.error("Error actualizando estado:", error);
            throw error;
        }
    }

    async deleteDelivery(id) {
        try {
            await deleteDoc(doc(db, "entregas", id));
            this.entregas = this.entregas.filter(e => e.id !== id);
        } catch (error) {
            console.error("Error eliminando entrega:", error);
            throw error;
        }
    }
}
