// js/core/FirebaseService.js

class FirebaseService {
    constructor() {
        if (!window.firebase || !window.firebase.apps.length) {
            console.warn("Firebase no está inicializado o firebase-config.js falta.");
        } else {
            this.db = window.firebase.firestore();
        }
    }

    getDb() {
        return this.db;
    }

    getCollection(name) {
        if (!this.db) return null;
        return this.db.collection(name);
    }

    getRegistrosRef() {
        return this.getCollection('REGISTROS');
    }

    getRespaldoRef() {
        return this.getCollection('REGISTROS_RESPALDO');
    }

    getPreciosRef() {
        return this.getCollection('PRECIOS_REGISTROS');
    }

    getMapeoRef() {
        return this.getCollection('MAPEO_NOMBRES');
    }

    getSalidasRef() {
        return this.getCollection('INVENTARIO_SALIDAS');
    }

    // Helper genérico para obtener todos los documentos ordenados
    async getAllFromCollection(collectionName, orderByField = null, direction = 'asc') {
        try {
            let ref = this.getCollection(collectionName);
            if (orderByField) {
                ref = ref.orderBy(orderByField, direction);
            }
            const snapshot = await ref.get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Error obteniendo colección ${collectionName}:`, error);
            return [];
        }
    }
}

// Hacerlo disponible globalmente
window.firebaseService = new FirebaseService();
