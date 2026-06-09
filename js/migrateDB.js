async function runUnifiedMigration() {
    console.log("Iniciando migración a base de datos unificada REGISTROS...");
    const db = window.firebase.firestore();
    const respaldoRef = db.collection('REGISTROS_RESPALDO');
    const salidaRef = db.collection('REGISTROS_SALIDA');
    const unifiedRef = db.collection('REGISTROS');

    try {
        const respaldosSnap = await respaldoRef.get();
        const salidasSnap = await salidaRef.get();

        console.log(`Encontrados ${respaldosSnap.docs.length} respaldos y ${salidasSnap.docs.length} clones.`);

        // 1. Limpiar la colección unificada de intentos anteriores fallidos
        console.log("Limpiando colección unificada REGISTROS de intentos anteriores...");
        const oldUnifiedSnap = await unifiedRef.get();
        let clearBatch = db.batch();
        let clearOps = 0;
        for (const doc of oldUnifiedSnap.docs) {
            clearBatch.delete(doc.ref);
            clearOps++;
            if (clearOps >= 400) {
                await clearBatch.commit();
                clearBatch = db.batch();
                clearOps = 0;
            }
        }
        if (clearOps > 0) {
            await clearBatch.commit();
        }
        console.log("Colección unificada limpiada.");

        // Agrupar clones por respaldoId
        const clonesMap = {};
        salidasSnap.docs.forEach(doc => {
            const data = doc.data();
            if (data.respaldoId) {
                if (!clonesMap[data.respaldoId]) clonesMap[data.respaldoId] = [];
                clonesMap[data.respaldoId].push({ id: doc.id, ...data });
            }
        });

        let batch = db.batch();
        let opsCount = 0;

        for (const doc of respaldosSnap.docs) {
            const data = doc.data();
            const clones = clonesMap[doc.id] || [];

            // Calcular cantidad facturada
            const cantidadFacturada = clones.reduce((sum, c) => c.estado === 'facturado' ? sum + c.cantidad : sum, 0);

            // Obtener lista de facturas
            const facturas = clones
                .filter(c => c.estado === 'facturado')
                .map(c => ({
                    facturaId: c.facturaId || null,
                    numeroFactura: c.numeroFactura || null,
                    cantidad: c.cantidad
                }));

            const unifiedData = {
                ...data,
                cantidadUsada: cantidadFacturada,
                facturas: facturas,
                origenMigracion: doc.id
            };

            const newDocRef = unifiedRef.doc(doc.id); // Conservamos el mismo ID para mantener consistencia
            batch.set(newDocRef, unifiedData);
            opsCount++;

            if (opsCount >= 400) {
                await batch.commit();
                console.log("Batch commiteado (400 ops)...");
                batch = db.batch(); // Re-iniciar batch
                opsCount = 0;
            }
        }

        if (opsCount > 0) {
            await batch.commit();
        }

        console.log("Migración completada exitosamente.");
        alert("Migración completada. Ahora puedes actualizar el código principal.");
    } catch (e) {
        console.error("Error en migración:", e);
        alert("Error en migración: " + e.message);
    }
}
window.runUnifiedMigration = runUnifiedMigration;
