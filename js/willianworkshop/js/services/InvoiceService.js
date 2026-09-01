import { db } from "../config/firebase-config.js";
import {
    collection,
    doc,
    getDocs,
    getDoc,
    query,
    where,
    onSnapshot,
    writeBatch,
    serverTimestamp,
    arrayUnion,
    collectionGroup
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class InvoiceService {
    constructor() {
        this.facturasPendientes = [];
        this.grupos = new Map();
        this.equiposPendientes = new Map();
        this.perfiles = new Map();
        this.unsubscribePerfiles = null;
        this.unsubscribeGrupos = null;
    }

    /**
     * Inicia listeners para perfiles con saldo pendiente y grupos
     * @param {Function} onUpdate Callback (facturas, grupos, equipos)
     */
    initListeners(onUpdate) {
        console.log("💰 Inicializando listeners de facturas...");

        // 1. Grupos Listener
        this.unsubscribeGrupos = onSnapshot(collection(db, "grupos"), (snap) => {
            this.grupos.clear();
            snap.forEach(doc => {
                this.grupos.set(doc.id, { id: doc.id, ...doc.data() });
            });
            console.log(`📦 ${this.grupos.size} grupos cargados`);
            this._triggerUpdate(onUpdate);
        });

        // 2. Perfiles Listener (Sistema Nuevo)
        const qPerfiles = query(
            collection(db, "PERFILES"),
            where("saldo", ">", 0),
            where("activo", "==", true)
        );

        this.unsubscribePerfiles = onSnapshot(qPerfiles, async (snapshot) => {
            console.log(`🔍 Detectados ${snapshot.size} perfiles con saldo pendiente`);

            this.equiposPendientes.clear();
            this.perfiles.clear();

            for (const perfilDoc of snapshot.docs) {
                const perfil = { id: perfilDoc.id, ...perfilDoc.data() };
                this.perfiles.set(perfil.id, perfil);

                // Agregar a equipos pendientes
                this.equiposPendientes.set(perfil.numero, {
                    numero: perfil.numero,
                    nombre: perfil.nombre || perfil.numero,
                    total: perfil.saldo || 0,
                    ciudad: perfil.grupo || '',
                    esLocal: !perfil.grupo // Si no tiene grupo, es local
                });
            }

            console.log(`✅ ${this.equiposPendientes.size} equipos con deuda cargados`);

            this.updateGroupTotals();
            this._triggerUpdate(onUpdate);
        });
    }

    _triggerUpdate(callback) {
        console.log('📊 Estado actual:');
        console.log(`   - Perfiles: ${this.perfiles.size}`);
        console.log(`   - Equipos pendientes: ${this.equiposPendientes.size}`);
        console.log(`   - Grupos: ${this.grupos.size}`);

        if (this.equiposPendientes.size === 0) {
            console.warn('⚠️ NO HAY EQUIPOS CON SALDO PENDIENTE');
            console.log('💡 Posibles causas:');
            console.log('   1. No se ha ejecutado la migración (usa admin_migration.html)');
            console.log('   2. Todos los saldos están en 0');
            console.log('   3. Los perfiles están marcados como inactivos');
        }

        if (callback) {
            callback({
                facturas: this.facturasPendientes,
                grupos: this.grupos,
                equipos: this.equiposPendientes
            });
        }
    }

    /**
     * Recalcula totales de grupos y actualiza en Firebase si difieren
     */
    async updateGroupTotals() {
        const batch = writeBatch(db);
        let updates = 0;

        for (const [grupoId, grupo] of this.grupos.entries()) {
            let nuevoTotal = 0;
            if (grupo.equipos && Array.isArray(grupo.equipos)) {
                grupo.equipos.forEach(equipoNum => {
                    const data = this.equiposPendientes.get(equipoNum);
                    if (data) nuevoTotal += data.total;
                });
            }

            if (grupo.total !== nuevoTotal) {
                grupo.total = nuevoTotal; // Update local immediately
                batch.update(doc(db, "grupos", grupoId), {
                    total: nuevoTotal,
                    ultimaActualizacion: serverTimestamp()
                });
                updates++;
            }
        }

        if (updates > 0) await batch.commit();
    }

    /**
     * Procesa un abono a un grupo, distribuyendo monto a facturas antiguas
     */
    async processGroupPayment(grupoId, monto) {
        const grupo = this.grupos.get(grupoId);
        if (!grupo) throw new Error("Grupo no encontrado");
        if (monto > grupo.total + 0.1) throw new Error("Monto excede la deuda total");

        // Filtrar facturas del grupo
        const facturasGrupo = this.facturasPendientes.filter(f =>
            grupo.equipos.includes(f.equipo)
        );

        // Asegurar orden
        facturasGrupo.sort((a, b) => (a.fecha?.seconds || 0) - (b.fecha?.seconds || 0));

        const batch = writeBatch(db);
        let remanente = monto;
        let count = 0;

        for (const factura of facturasGrupo) {
            if (remanente <= 0.009) break;

            const deuda = factura.saldoPendiente;
            const abono = Math.min(remanente, deuda);

            if (abono > 0) {
                const nuevoSaldo = deuda - abono;
                const ref = doc(db, "ventas", factura.id);

                batch.update(ref, {
                    saldoPendiente: nuevoSaldo,
                    abonos: arrayUnion({
                        monto: abono,
                        fecha: new Date(),
                        tipo: 'abono_grupal',
                        grupoId: grupoId
                    }),
                    ultimaActualizacion: serverTimestamp()
                });

                // Registrar ingreso financiero
                const ingresoRef = doc(collection(db, "ingresos"));
                batch.set(ingresoRef, {
                    monto: abono,
                    concepto: `Abono Grupal - Factura Equipo ${factura.equipo}`,
                    fecha: serverTimestamp(),
                    categoria: 'abono',
                    facturaId: factura.id,
                    grupoId: grupoId
                });

                remanente -= abono;
                count++;
            }
        }

        await batch.commit();
        return count;
    }
}
