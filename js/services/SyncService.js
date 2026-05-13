class SyncService {
    constructor() {
        // Obtenemos la base de datos de origen (ya inicializada por la app principal)
        this.dbOrigen = firebase.firestore();

        // Configuramos e inicializamos la base de datos de destino (TallerWilliam)
        const firebaseConfigDestino = {
            apiKey: "AIzaSyDh074AarXaYCc-Htw-lsCeIc_95QQNSnY",
            authDomain: "tallerwilliam-732b3.firebaseapp.com",
            projectId: "tallerwilliam-732b3",
            storageBucket: "tallerwilliam-732b3.firebasestorage.app",
            messagingSenderId: "822262666247",
            appId: "1:822262666247:web:6680487bbf1108006b86a2"
        };

        if (!firebase.apps.length || !firebase.apps.find(app => app.name === 'Destino')) {
            this.appDestino = firebase.initializeApp(firebaseConfigDestino, "Destino");
        } else {
            this.appDestino = firebase.app("Destino");
        }

        this.dbDestino = this.appDestino.firestore();
    }

    // Helper: obtener stock de un producto sin importar si usa 'existencia' o 'cantidad'
    _getStock(product) {
        const val = product.existencia ?? product.cantidad ?? 0;
        return parseFloat(val) || 0;
    }

    async analizarDiferencias() {
        try {
            // 1. Leer Origen (WillianWorkshop)
            const snapOrigen = await this.dbOrigen.collection('INVENTARIO').get();
            const productsOrigen = snapOrigen.docs.map(d => ({ ...d.data(), id: d.id }));

            const diffList = [];

            // Como vamos a limpiar el destino y clonar el origen, mostramos todos los productos del origen como "NUEVO" para sincronizar
            productsOrigen.forEach(po => {
                if (!po.codigo) return; // Ignorar si no tiene código

                diffList.push({
                    type: 'NEW',
                    source: po,
                    sourceQty: 1, // Siempre se asume cantidad 1 en la sincronización
                    sourcePrice: parseFloat(po.precio || 0),
                    destId: null,
                    destQty: null,
                    destPrice: null
                });
            });

            return diffList;
        } catch(error) {
            console.error("Error en análisis de sincronización:", error);
            throw error;
        }
    }

    async ejecutarSincronizacion(diffList) {
        if (!diffList || diffList.length === 0) return 0;

        // 1. Limpiar por completo la base de datos de destino (TallerWilliam) antes de copiar
        const snapDestino = await this.dbDestino.collection('INVENTARIO').get();
        let batchDelete = this.dbDestino.batch();
        let deleteCount = 0;
        const batchSize = 400; // Límite seguro de escrituras/borrados en Firestore

        for (const doc of snapDestino.docs) {
            batchDelete.delete(doc.ref);
            deleteCount++;

            if (deleteCount >= batchSize) {
                await batchDelete.commit();
                batchDelete = this.dbDestino.batch();
                deleteCount = 0;
            }
        }

        if (deleteCount > 0) {
            await batchDelete.commit();
        }

        // 2. Copiar todos los productos del origen al destino
        let processed = 0;
        let currentBatch = this.dbDestino.batch();
        let batchCount = 0;

        for (const item of diffList) {
            // El stock en destino siempre se guardará como 1 (lista de precios)
            const qty = 1;

            const dataToSave = {
                codigo: item.source.codigo,
                descripcion: item.source.descripcion || '',
                descripcionTaller: item.source.descripcionFactura || item.source.descripcion || '',
                cantidad: qty,         // TallerWilliam usa 'cantidad'
                precio: parseFloat(item.source.precio || 0),
                costo: parseFloat(item.source.costo || 0),
                minStock: parseFloat(item.source.stockMinimo || 5),
                aliases: item.source.aliases || [],
                creditoFiscal: item.source.creditoFiscal || false,
                ultimaActualizacion: firebase.firestore.FieldValue.serverTimestamp(),
                fechaCreacion: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Usamos exactamente el mismo ID del origen para mantener consistencia 1:1
            const ref = this.dbDestino.collection('INVENTARIO').doc(item.source.id);
            currentBatch.set(ref, dataToSave);

            batchCount++;
            processed++;

            if (batchCount >= batchSize) {
                await currentBatch.commit();
                currentBatch = this.dbDestino.batch();
                batchCount = 0;
            }
        }

        if (batchCount > 0) {
            await currentBatch.commit();
        }

        return processed;
    }
}

window.SyncService = SyncService;
