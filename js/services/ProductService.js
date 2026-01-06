/* js/services/ProductService.js - GLOBAL VERSION COMPATIBLE WITH FILE:// AND FIREBASE V8 */
(function () {
    class ProductService {
        constructor() {
            this.products = [];
            this.isLoaded = false;
            // Assumes firebase is initialized globally in HTML
            this.db = firebase.firestore();
        }

        /**
         * Carga todos los productos del inventario en caché local
         */
        async loadProducts() {
            try {
                // Using "INVENTARIO" collection (Standard in this project)
                const querySnapshot = await this.db.collection("INVENTARIO").orderBy("descripcion", "asc").get(); // Ordering optional but nice
                this.products = [];
                querySnapshot.forEach((doc) => {
                    const d = doc.data();
                    this.products.push({
                        id: doc.id,
                        codigo: d.codigo || "",
                        descripcionTaller: d.descripcion || d.descInventario || d.descripcionTaller || "",
                        descripcionFactura: d.descripcionFactura || d.descFactura || "",
                        precioVenta: parseFloat(d.precio || d.precioVenta) || 0,
                        existencia: parseInt(d.existencia) || 0,
                        aliases: d.aliases || []
                    });
                });
                this.isLoaded = true;
                console.log(`Inventario cargado: ${this.products.length} productos.`);
                return this.products;
            } catch (error) {
                console.error("Error cargando inventario:", error);
                // Return empty but don't crash app
                return [];
            }
        }

        /**
         * Busca productos localmente
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
                    ${(producto.aliases || []).join(' ')}
                `.toLowerCase();

                return terms.every(t => searchStr.includes(t));
            }).slice(0, 20);
        }

        /**
         * Fallback for remote search (v8 style)
         */
        async searchRemote(term) {
            // Since we load all products locally, verify if we missed anything in "SERVICIOS"
            // Or just return local results. Implementing basic services search.
            let results = this.searchLocal(term);

            if (results.length === 0) {
                try {
                    const snap = await this.db.collection("servicios").get();
                    snap.forEach(doc => {
                        const s = doc.data();
                        if ((s.nombre || '').toLowerCase().includes(term.toLowerCase())) {
                            results.push({
                                id: doc.id,
                                codigo: "SERV",
                                descripcionTaller: s.nombre,
                                precioVenta: parseFloat(s.precio) || 0,
                                existencia: 999,
                                tipo: 'servicio'
                            });
                        }
                    });
                } catch (e) { console.warn("Error searching services", e); }
            }
            return results.slice(0, 20);
        }

        async getProductById(id) {
            let product = this.products.find(p => p.id === id);
            if (product) return product;

            try {
                const docSnap = await this.db.collection("INVENTARIO").doc(id).get();
                if (docSnap.exists) {
                    const d = docSnap.data();
                    return {
                        id: docSnap.id,
                        codigo: d.codigo || "",
                        descripcionTaller: d.descripcion || "",
                        precioVenta: parseFloat(d.precio) || 0,
                        existencia: parseInt(d.existencia) || 0
                    };
                }
            } catch (e) {
                console.error("Error getting product:", e);
            }
            return null;
        }
    }

    // Expose globally
    window.ProductService = ProductService;
})();
