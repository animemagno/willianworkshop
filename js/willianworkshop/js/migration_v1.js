
// Script de Migración: VENTAS -> PERFILES
// Este script lee todas las ventas, las agrupa por "Perfil" y crea la nueva estructura.

async function runMigration() {
    console.log("🚀 INICIANDO MIGRACIÓN DE HISTORIAL...");
    const db = firebase.firestore();
    const batchSize = 400; // Firestore limit 500

    // 1. Leer TODAS las ventas
    const snapshot = await db.collection("VENTAS").get();
    const totalVentas = snapshot.size;
    console.log(`📂 Se encontraron ${totalVentas} facturas en total.`);

    if (totalVentas === 0) {
        console.log("✅ Nada que migrar.");
        return;
    }

    // 2. Agrupar en Memoria
    const perfiles = {}; // Map: "NombrePerfil" -> { saldo: 0, movimientos: [], ultimaFecha: 0 }

    snapshot.docs.forEach(doc => {
        const venta = doc.data();
        const idVenta = doc.id;

        // Regla de Nombre de Perfil
        let nombrePerfil = "Sin Identificar";
        const equipo = (venta.equipo || "").trim();
        const cliente = (venta.cliente || "").trim(); // A veces ciudad, a veces nombre

        // Ignorar "0" o "LOCAL" genéricos si se desea, pero el usuario quiere conservar todo.
        // Lógica "15" vs "15 - Cedros"
        if (equipo && equipo !== "0" && equipo !== "Sin Asignar") {
            if (cliente && cliente !== "LOCAL" && cliente !== "MOSTRADOR") {
                nombrePerfil = `${equipo} - ${cliente}`;
            } else {
                nombrePerfil = `${equipo}`;
            }
        } else {
            // Sin equipo, usar cliente
            if (cliente) {
                nombrePerfil = cliente;
            } else {
                nombrePerfil = "Ventas Mostrador";
            }
        }

        // Crear entrada en Map
        if (!perfiles[nombrePerfil]) {
            perfiles[nombrePerfil] = {
                nombre: nombrePerfil,
                saldo: 0,
                movimientos: [],
                ultimaFecha: 0
            };
        }

        // Calcular Saldo
        const saldoDoc = parseFloat(venta.saldoPendiente || 0);
        perfiles[nombrePerfil].saldo += saldoDoc;

        // Actualizar última fecha
        const fechaVenta = venta.fecha ? (venta.fecha.seconds * 1000) : 0;
        if (fechaVenta > perfiles[nombrePerfil].ultimaFecha) {
            perfiles[nombrePerfil].ultimaFecha = fechaVenta;
        }

        // Agregar movimiento a la lista
        perfiles[nombrePerfil].movimientos.push({
            idOriginal: idVenta,
            data: venta
        });
    });

    const totalPerfiles = Object.keys(perfiles).length;
    console.log(`📊 Se han detectado ${totalPerfiles} PERFILES ÚNICOS.`);
    console.log(Object.keys(perfiles));

    // 3. Escribir en Firestore (Batches)
    // Iteramos por Perfil
    let processedProfiles = 0;

    for (const nombrePerfil of Object.keys(perfiles)) {
        const perfilData = perfiles[nombrePerfil];

        // ID Sanitizado para el documento
        const docId = "perfil_" + nombrePerfil.toLowerCase()
            .replace(/[^a-z0-9]/g, '_') // Solo letras y numeros
            .replace(/_+/g, '_');       // Evitar ___

        const perfilRef = db.collection("PERFILES").doc(docId);

        // Escribir Cabecera del Perfil
        await perfilRef.set({
            id: docId,
            nombre: nombrePerfil,
            saldo: parseFloat(perfilData.saldo.toFixed(2)),
            ultimaActividad: new Date(perfilData.ultimaFecha),
            migrado: true,
            migradoFecha: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Escribir Movimientos (Subcolección)
        // Lo hacemos en lotes para no saturar
        const movimientos = perfilData.movimientos;
        for (let i = 0; i < movimientos.length; i += batchSize) {
            const batch = db.batch();
            const chunk = movimientos.slice(i, i + batchSize);

            chunk.forEach(mov => {
                const movRef = perfilRef.collection("MOVIMIENTOS").doc(mov.idOriginal);
                // Copiamos la data exacta, tal vez agregando un flag
                batch.set(movRef, {
                    ...mov.data,
                    _migrado: true
                });
            });

            await batch.commit();
        }

        processedProfiles++;
        if (processedProfiles % 10 === 0) {
            console.log(`... Progreso: ${processedProfiles}/${totalPerfiles} perfiles creados.`);
        }
    }

    console.log("✅✅ MIGRACIÓN COMPLETADA EXITOSAMENTE ✅✅");
    alert("Migración completada. Revisa la consola para detalles.");
}

// Exponer globalmente para ejecutar desde consola
window.runMigration = runMigration;
