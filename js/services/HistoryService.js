import { db } from "../config/firebase-config.js";
import {
    collection,
    query,
    orderBy,
    getDocs,
    deleteDoc,
    doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class HistoryService {
    constructor() {
        this.ventas = [];
    }

    /**
     * Carga todas las ventas ordenadas por fecha descendente
     * @returns {Promise<Array>}
     */
    async loadAll() {
        try {
            const q = query(collection(db, "ventas"), orderBy("fecha", "desc"));
            const snapshot = await getDocs(q);
            this.ventas = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                fechaTimestamp: doc.data().fecha
            }));
            return this.ventas;
        } catch (error) {
            console.error("Error loading history:", error);
            throw error;
        }
    }

    /**
     * Elimina una venta por ID
     * @param {string} id 
     */
    async deleteSale(id) {
        try {
            await deleteDoc(doc(db, "ventas", id));
            this.ventas = this.ventas.filter(v => v.id !== id);
        } catch (error) {
            console.error("Error deleting sale:", error);
            throw error;
        }
    }

    /**
     * Filtra las ventas localmente
     * @param {Object} filters { equipo, producto, tipo, fecha }
     * @returns {Array} Ventas filtradas
     */
    filter(filters) {
        const { equipo, producto, tipo, fecha } = filters;
        const eq = equipo?.toLowerCase();
        const prod = producto?.toLowerCase();

        return this.ventas.filter(v => {
            // Filtro por equipo
            if (eq && !v.equipo.toLowerCase().includes(eq)) return false;

            // Filtro por producto
            if (prod) {
                const tieneProducto = v.items.some(item =>
                    item.desc.toLowerCase().includes(prod)
                );
                if (!tieneProducto) return false;
            }

            // Filtro por tipo
            if (tipo && v.tipo !== tipo) return false;

            // Filtro por fecha (YYYY-MM-DD)
            if (fecha) {
                const ventaFecha = v.fechaTimestamp ?
                    new Date(v.fechaTimestamp.seconds * 1000).toLocaleDateString('en-CA') : // 'en-CA' gives YYYY-MM-DD
                    new Date().toLocaleDateString('en-CA');
                if (ventaFecha !== fecha) return false;
            }

            return true;
        });
    }

    /**
     * Agrupa ventas por día
     * @param {Array} lista 
     * @returns {Object} { "DD/MM/YYYY": [ventas] }
     */
    groupByDay(lista) {
        return lista.reduce((acc, v) => {
            const fecha = v.fechaTimestamp ? new Date(v.fechaTimestamp.seconds * 1000) : new Date();
            const dia = fecha.toLocaleDateString("es-ES");
            const fechaLabel = fecha.toLocaleDateString("es-ES", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric"
            });

            if (!acc[dia]) acc[dia] = [];
            acc[dia].push({ ...v, fechaLabel });
            return acc;
        }, {});
    }
}
