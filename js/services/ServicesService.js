import { db } from "../config/firebase-config.js";
import {
    collection,
    getDocs,
    addDoc,
    deleteDoc,
    doc,
    query,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * Servicio para gestionar la colección de "servicios".
 * Asume que existe una colección "servicios" en Firestore.
 * Si no existe, al agregar el primer servicio se creará.
 */
export class ServicesService {
    constructor() {
        this.servicios = [];
    }

    /**
     * Carga todos los servicios disponibles
     * @returns {Promise<Array>}
     */
    async loadAll() {
        try {
            // Intentamos cargar de Firebase
            const q = query(collection(db, "servicios"), orderBy("fechaCreacion", "desc"));
            const snapshot = await getDocs(q);

            this.servicios = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Si está vacío, devolvemos un array vacío (la UI puede manejarlo o mostrar default)
            return this.servicios;
        } catch (error) {
            console.error("Error cargando servicios:", error);
            return [];
        }
    }

    async addService(data) {
        try {
            const docData = {
                ...data,
                fechaCreacion: serverTimestamp()
            };
            const docRef = await addDoc(collection(db, "servicios"), docData);
            const newService = { id: docRef.id, ...docData };
            this.servicios.unshift(newService);
            return newService;
        } catch (error) {
            console.error("Error agregando servicio:", error);
            throw error;
        }
    }

    async deleteService(id) {
        try {
            await deleteDoc(doc(db, "servicios", id));
            this.servicios = this.servicios.filter(s => s.id !== id);
        } catch (error) {
            console.error("Error eliminando servicio:", error);
            throw error;
        }
    }
}
