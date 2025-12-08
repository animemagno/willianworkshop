import { db } from "../config/firebase-config.js";
import {
    collection,
    getDocs,
    query,
    where,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class ProductService {
    constructor() {
        this.products = [];
        this.isLoaded = false;
    }

    /**
     * Carga todos los productos del inventario en caché local
     */
    async loadProducts() {
        try {
            const querySnapshot = await getDocs(collection(db, "inventario"));
            this.products = [];
            querySnapshot.forEach((doc) => {
                const producto = doc.data();
                this.products.push({
                    id: doc.id,
                    codigo: producto.codigo || "",
                    descripcionTaller: producto.descInventario || producto.descripcionTaller || "",
                    descripcionFactura: producto.descFactura || producto.descripcionFactura || "",
                    precioVenta: parseFloat(producto.precioVenta) || 0,
                    existencia: parseInt(producto.existencia) || 0
                });
            });
            this.isLoaded = true;
            console.log("Inventario cargado:", this.products.length);
            return this.products;
        } catch (error) {
            console.error("Error cargando inventario:", error);
            throw error;
        }
    }

    /**
     * Busca productos localmente
     * @param {string} term 
     * @returns {Array}
     */
    searchLocal(term) {
        if (!term || term.length < 2) return [];

        const termLower = term.toLowerCase().trim();
        const terms = termLower.split(/\s+/).filter(t => t.length > 0);

        return this.products.filter(producto => {
            const searchStr = `
                ${producto.codigo || ''} 
                ${producto.descripcionTaller || ''} 
                ${producto.descripcionFactura || ''}
            `.toLowerCase();

            return terms.every(t => searchStr.includes(t));
        }).slice(0, 20); // Limitar resultados
    }

    /**
     * Busca productos en Firebase (fallback)
     * @param {string} term 
     * @returns {Promise<Array>}
     */
    async searchRemote(term) {
        try {
            const termLower = term.toLowerCase().trim();
            const results = [];

            // Búsqueda exacta por código
            const q = query(collection(db, "inventario"), where("codigo", "==", termLower));
            const snap = await getDocs(q);

            snap.forEach(doc => {
                const d = doc.data();
                results.push({
                    id: doc.id,
                    codigo: d.codigo || "",
                    descripcionTaller: d.descInventario || d.descripcionTaller || "",
                    descripcionFactura: d.descFactura || d.descripcionFactura || "",
                    precioVenta: parseFloat(d.precioVenta) || 0,
                    existencia: parseInt(d.existencia) || 0,
                    isRemote: true
                });
            });
            return results;
        } catch (e) {
            console.error("Error búsqueda remota:", e);
            return [];
        }
    }

    /**
     * Obtiene un producto por ID
     * @param {string} id 
     * @returns {Promise<Object|null>}
     */
    async getProductById(id) {
        // Primero buscar en caché
        let product = this.products.find(p => p.id === id);
        if (product) return product;

        // Si no está, buscar en DB
        try {
            const docSnap = await getDoc(doc(db, "inventario", id));
            if (docSnap.exists()) {
                const d = docSnap.data();
                return {
                    id: docSnap.id,
                    codigo: d.codigo || "",
                    descripcionTaller: d.descInventario || d.descripcionTaller || "",
                    descripcionFactura: d.descFactura || d.descripcionFactura || "",
                    precioVenta: parseFloat(d.precioVenta) || 0,
                    existencia: parseInt(d.existencia) || 0
                };
            }
        } catch (e) {
            console.error("Error getting product:", e);
        }
        return null;
    }
}
