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

    // Helper: obtener stock de un producto sin importar si usa 'existencia' o 'cantidad'
    _getStock(product) {
        // Priorizar existencia (willianworkshop), luego cantidad (TallerWilliam)
        const val = product.existencia ?? product.cantidad ?? 0;
        return parseFloat(val) || 0;
    }

    async analizarDiferencias() {
        try {
            // 1. Leer Origen (WillianWorkshop)
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
                if (!po.codigo) return; // Ignorar si no tiene código

                const code = po.codigo.trim().toUpperCase();
                const pd = mapDestino[code];

                // Obtener stock con fallback a ambos nombres de campo
                const qtyOrigen = this._getStock(po);

                if (!pd) {
                    // NO EXISTE EN DESTINO -> NUEVO
                    diffList.push({
                        type: 'NEW',
                        source: po,
                        sourceQty: qtyOrigen,
                        sourcePrice: parseFloat(po.precio || 0),
                        destId: null,
                        destQty: null,
                        destPrice: null
                    });
                } else {
                    // EXISTE -> VERIFICAR CAMBIOS
                    const qtyDestino = this._getStock(pd);
                    const stockDiff = qtyOrigen !== qtyDestino;
                    const priceDiff = (parseFloat(po.precio || 0) !== parseFloat(pd.precio || 0))
                                   || (parseFloat(po.costo || 0) !== parseFloat(pd.costo || 0));
                    const descDiff = (po.descripcion || '') !== (pd.descripcion || '');

                    if (stockDiff || priceDiff || descDiff) {
                        diffList.push({
                            type: 'UPDATE',
                            source: po,
                            sourceQty: qtyOrigen,
                            sourcePrice: parseFloat(po.precio || 0),
                            destId: pd.id,
                            destQty: qtyDestino,
                            destPrice: parseFloat(pd.precio || 0)
                        });
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
        const batchSize = 400;
        let currentBatch = this.dbDestino.batch();
        let batchCount = 0;

        for (const item of diffList) {
            // Transformamos los campos al formato de Destino (TallerWilliam usa 'cantidad')
            const qty = this._getStock(item.source);

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
                ultimaActualizacion: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (item.type === 'NEW') {
                const newRef = this.dbDestino.collection('INVENTARIO').doc();
                currentBatch.set(newRef, {
                    ...dataToSave,
                    fechaCreacion: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else if (item.type === 'UPDATE' && item.destId) {
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
