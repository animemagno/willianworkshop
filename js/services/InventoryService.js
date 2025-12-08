import { db } from "../config/firebase-config.js";
import {
    collection,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    query,
    where,
    serverTimestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class InventoryService {
    constructor() {
        this.products = [];
        this.isLoaded = false;
        // Mapeo de campos estandarizados
        this.fields = {
            id: 'id',
            codigo: 'codigo',
            codigosProveedor: 'codigosProveedor', // nuevo
            descTaller: 'descInventario', // Mapeado a descInventario en DB
            descFactura: 'descFactura',
            costo: 'precioCosto',
            precio: 'precioVenta',
            existencia: 'existencia',
            stockMin: 'stockMinimo',
            creditoFiscal: 'creditoFiscal',
            proveedor: 'proveedor',
            categoria: 'categoria', // nuevo
            ultimaAct: 'ultimaActualizacion'
        };
    }

    /**
     * Carga inicial y completa de productos
     * @returns {Promise<Array>}
     */
    async loadAll() {
        try {
            const querySnapshot = await getDocs(collection(db, "inventario"));
            this.products = querySnapshot.docs.map(doc => this._mapDocToProduct(doc));
            this.isLoaded = true;
            return this.products;
        } catch (error) {
            console.error("Error loading inventory:", error);
            throw error;
        }
    }

    /**
     * Helper para mapear documento de Firestore a Objeto Interno
     * @param {Object} doc - Firestore DocumentSnapshot
     */
    _mapDocToProduct(doc) {
        const d = doc.data();
        return {
            id: doc.id,
            codigo: d.codigo || "",
            codigosProveedor: d.codigosProveedor || "",
            descInventario: d.descInventario || d.descripcionTaller || "", // Compatibilidad
            descFactura: d.descFactura || d.descripcionFactura || "",
            precioCosto: parseFloat(d.precioCosto) || 0,
            precioVenta: parseFloat(d.precioVenta) || 0,
            existencia: parseInt(d.existencia) || 0,
            stockMinimo: parseInt(d.stockMinimo) || 0,
            creditoFiscal: d.creditoFiscal === undefined ? true : d.creditoFiscal,
            proveedor: d.proveedor || "",
            categoria: d.categoria || ""
        };
    }

    /**
     * Agrega un nuevo producto
     * @param {Object} productData 
     */
    async addProduct(productData) {
        try {
            // Validar código duplicado
            const existing = this.products.find(p => p.codigo === productData.codigo);
            if (existing) throw new Error(`El código ${productData.codigo} ya existe.`);

            const dataToSave = {
                ...productData,
                fechaCreacion: serverTimestamp(),
                ultimaActualizacion: serverTimestamp(),
                codigosProveedor: productData.codigosProveedor ?
                    productData.codigosProveedor.split(',').map(s => s.trim()).filter(s => s) : []
            };

            const docRef = await addDoc(collection(db, "inventario"), dataToSave);
            const newProduct = { id: docRef.id, ...dataToSave };
            this.products.push(newProduct);
            return newProduct;
        } catch (error) {
            console.error("Error adding product:", error);
            throw error;
        }
    }

    /**
     * Actualiza un producto existente
     * @param {string} id 
     * @param {Object} updates 
     */
    async updateProduct(id, updates) {
        try {
            const docRef = doc(db, "inventario", id);
            // Preparar datos, convirtiendo string a array si es necesario para códigos
            const dataToUpdate = { ...updates, ultimaActualizacion: serverTimestamp() };
            if (typeof updates.codigosProveedor === 'string') {
                dataToUpdate.codigosProveedor = updates.codigosProveedor.split(',').map(s => s.trim()).filter(s => s);
            }

            await updateDoc(docRef, dataToUpdate);

            // Actualizar local
            const index = this.products.findIndex(p => p.id === id);
            if (index !== -1) {
                this.products[index] = { ...this.products[index], ...dataToUpdate };
            }
        } catch (error) {
            console.error("Error updating product:", error);
            throw error;
        }
    }

    /**
     * Eliminar producto
     * @param {string} id 
     */
    async deleteProduct(id) {
        try {
            await deleteDoc(doc(db, "inventario", id));
            this.products = this.products.filter(p => p.id !== id);
        } catch (error) {
            console.error("Error deleting product:", error);
            throw error;
        }
    }

    /**
     * Búsqueda avanzada
     * @param {string} term 
     * @returns {Array} Matches
     */
    search(term) {
        if (!term) return this.products;
        const lower = term.toLowerCase().trim();
        return this.products.filter(p =>
            p.codigo.toLowerCase().includes(lower) ||
            p.descInventario.toLowerCase().includes(lower) ||
            p.descFactura.toLowerCase().includes(lower) ||
            (Array.isArray(p.codigosProveedor) && p.codigosProveedor.some(cp => cp.toLowerCase().includes(lower)))
        );
    }

    /**
     * Carga masiva desde Excel
     * @param {Array} rows - Array de objetos desde SheetJS
     */
    async bulkUpload(rows) {
        const batch = writeBatch(db);
        const errors = [];
        let count = 0;
        const BATCH_SIZE = 450; // Límite de Firestore es 500

        for (const row of rows) {
            // Mapeo de columnas Excel a campos DB
            // Asume headers: CODIGO, DESC_INVENTARIO, DESC_FACTURA, COSTO, PRECIO, EXISTENCIA
            const codigo = row['CODIGO'] || row['codigo'];

            if (!codigo) continue; // Saltar vacíos

            const data = {
                codigo: String(codigo).trim(),
                descInventario: row['DESC_INVENTARIO'] || row['descripcion'] || "",
                descFactura: row['DESC_FACTURA'] || row['descripcion'] || "",
                precioCosto: parseFloat(row['COSTO']) || 0,
                precioVenta: parseFloat(row['PRECIO']) || 0,
                existencia: parseInt(row['EXISTENCIA']) || 0,
                creditoFiscal: true,
                ultimaActualizacion: serverTimestamp()
            };

            // Verificar si existe para actualizar o crear
            // Nota: En bulk masivo real, esto debería optimizarse para no leer 1x1
            // Por ahora, asumimos que 'loadAll' está reciente
            const existing = this.products.find(p => p.codigo === data.codigo);

            if (existing) {
                const ref = doc(db, "inventario", existing.id);
                batch.update(ref, data);
            } else {
                const ref = doc(collection(db, "inventario"));
                batch.set(ref, data);
            }

            count++;
            if (count >= BATCH_SIZE) {
                await batch.commit(); // Commit parcial
                count = 0;
            }
        }

        if (count > 0) await batch.commit();
        await this.loadAll(); // Recargar todo al final
        return { success: true, count: rows.length };
    }
}
