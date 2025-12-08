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
     * Busca productos en Firebase
     * Como Firestore no soporta búsqueda parcial nativa, cargamos todos y filtramos
     * @param {string} term 
     * @returns {Promise<Array>}
     */
    async searchRemote(term) {
        try {
            const termLower = term.toLowerCase().trim();
            const terms = termLower.split(/\s+/).filter(t => t.length > 0);

            // 1. Cargar productos de Inventario
            const querySnapshot = await getDocs(collection(db, "inventario"));
            let results = [];

            querySnapshot.forEach(doc => {
                const d = doc.data();
                const searchStr = `
                    ${d.codigo || ''} 
                    ${d.descInventario || d.descripcionTaller || ''} 
                    ${d.descFactura || d.descripcionFactura || ''}
                `.toLowerCase();

                const matches = terms.every(t => searchStr.includes(t));

                if (matches) {
                    results.push({
                        id: doc.id,
                        codigo: d.codigo || "",
                        descripcionTaller: d.descInventario || d.descripcionTaller || "",
                        descripcionFactura: d.descFactura || d.descripcionFactura || "",
                        precioVenta: parseFloat(d.precioVenta) || 0,
                        existencia: parseInt(d.existencia) || 0,
                        tipo: 'producto'
                    });
                }
            });

            // 2. Si no hay resultados, buscar en Servicios
            if (results.length === 0) {
                console.log("No encontrado en inventario, buscando en servicios...");
                const serviciosSnapshot = await getDocs(collection(db, "servicios"));

                serviciosSnapshot.forEach(doc => {
                    const s = doc.data();
                    const searchStr = `
                        ${s.nombre || ''} 
                        ${s.descripcion || ''}
                    `.toLowerCase();

                    const matches = terms.every(t => searchStr.includes(t));

                    if (matches) {
                        results.push({
                            id: doc.id,
                            codigo: "SERV",
                            descripcionTaller: s.nombre || s.descripcion || "Servicio",
                            descripcionFactura: s.descripcion || s.nombre || "Servicio",
                            precioVenta: parseFloat(s.precio) || 0,
                            existencia: 999, // Servicios siempre tienen existencia
                            tipo: 'servicio'
                        });
                    }
                });
            }

            // Limitar a 20 resultados
            return results.slice(0, 20);
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
