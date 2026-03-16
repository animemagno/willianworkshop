class SyncService {
    constructor() {
        // Obtenemos la base de datos de origen (ya inicializada por la app principal)
        this.dbOrigen = firebase.firestore();

        // Configuramos e inicializamos la base de datos de destino
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

    async analizarDiferencias() {
        try {
            // 1. Leer Origen (Local)
            const snapOrigen = await this.dbOrigen.collection('INVENTARIO').get();
            const productsOrigen = snapOrigen.docs.map(d => ({ ...d.data(), id: d.id }));

            // 2. Leer Destino (TallerWilliam)
            const snapDestino = await this.dbDestino.collection('INVENTARIO').get();
            const productsDestino = snapDestino.docs.map(d => ({ ...d.data(), id: d.id }));

            // Mapa de destino por CODIGO para búsqueda rápida
            const mapDestino = {};
            productsDestino.forEach(p => {
                if (p.codigo) mapDestino[p.codigo.trim().toUpperCase()] = p;
            });

            const diffList = [];

            productsOrigen.forEach(po => {
                if (!po.codigo) return; // Ignorar si no tiene código (no hay forma segura de vincular)

                const code = po.codigo.trim().toUpperCase();
                const pd = mapDestino[code];

                // Adaptación de nombres de campo (origen: existencia vs destino: cantidad)
                const qtyOrigen = parseFloat(po.existencia || 0);

                if (!pd) {
                    // NO EXISTE EN DESTINO -> NUEVO
                    diffList.push({ type: 'NEW', source: po, destId: null, destQty: null, destPrice: null });
                } else {
                    // EXISTE -> VERIFICAR CAMBIOS
                    const qtyDestino = parseFloat(pd.cantidad || 0);
                    const stockDiff = qtyOrigen !== qtyDestino;
                    const priceDiff = po.precio !== pd.precio || po.costo !== pd.costo;
                    const descDiff = po.descripcion !== pd.descripcion;

                    if (stockDiff || priceDiff || descDiff) {
                        diffList.push({ type: 'UPDATE', source: po, destId: pd.id, destQty: qtyDestino, destPrice: pd.precio });
                    }
                }
            });

            return diffList;
        } catch(error) {
            console.error("Error en análisis de sincronización:", error);
            throw error;
        }
    }

    async ejecutarSincronizacion(diffList) {
        if (!diffList || diffList.length === 0) return 0;

        let processed = 0;
        const batchSize = 400; // Margen de seguridad de Firestore
        let currentBatch = this.dbDestino.batch();
        let batchCount = 0;

        for (const item of diffList) {
            // Transformamos los campos al formato de Destino
            const dataToSave = {
                codigo: item.source.codigo,
                descripcion: item.source.descripcion || '',
                descripcionTaller: item.source.descripcionFactura || item.source.descripcion || '', // Mapeo cruzado
                cantidad: parseFloat(item.source.existencia || 0), // Cambio principal: existencia -> cantidad
                precio: parseFloat(item.source.precio || 0),
                costo: parseFloat(item.source.costo || 0),
                minStock: parseFloat(item.source.stockMinimo || 5), // stockMinimo -> minStock
                aliases: item.source.aliases || [],
                creditoFiscal: item.source.creditoFiscal || false,
                ultimaActualizacion: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (item.type === 'NEW') {
                // Crear nuevo doc
                const newRef = this.dbDestino.collection('INVENTARIO').doc();
                currentBatch.set(newRef, {
                    ...dataToSave,
                    fechaCreacion: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else if (item.type === 'UPDATE' && item.destId) {
                // Actualizar existente
                const ref = this.dbDestino.collection('INVENTARIO').doc(item.destId);
                currentBatch.update(ref, dataToSave);
            }

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
