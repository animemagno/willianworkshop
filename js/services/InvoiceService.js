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
    arrayUnion
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class InvoiceService {
    constructor() {
        this.facturasPendientes = [];
        this.grupos = new Map();
        this.equiposPendientes = new Map();
        this.unsubscribeVentas = null;
        this.unsubscribeGrupos = null;
    }

    /**
     * Inicia listeners para ventas a crédito y grupos
     * @param {Function} onUpdate Callback (facturas, grupos, equipos)
     */
    initListeners(onUpdate) {
        // 1. Grupos Listener
        this.unsubscribeGrupos = onSnapshot(collection(db, "grupos"), (snap) => {
            this.grupos.clear();
            snap.forEach(doc => {
                this.grupos.set(doc.id, { id: doc.id, ...doc.data() });
            });
            this._triggerUpdate(onUpdate);
        });

        // 2. Ventas Pendientes Listener
        const q = query(
            collection(db, "ventas"),
            where("tipo", "==", "credito"),
            where("saldoPendiente", ">", 0)
        );

        this.unsubscribeVentas = onSnapshot(q, (snapshot) => {
            this.facturasPendientes = [];
            this.equiposPendientes.clear();

            snapshot.forEach(doc => {
                const venta = { id: doc.id, ...doc.data() };
                this.facturasPendientes.push(venta);

                // Agrupar por equipo
                const equipoNum = venta.equipo;
                if (!this.equiposPendientes.has(equipoNum)) {
                    this.equiposPendientes.set(equipoNum, {
                        numero: equipoNum,
                        total: 0,
                        ciudad: venta.ciudad || '',
                        esLocal: venta.esLocal
                    });
                }
                const equipoData = this.equiposPendientes.get(equipoNum);
                equipoData.total += venta.saldoPendiente;
            });

            // Ordenar: más antiguas primero
            this.facturasPendientes.sort((a, b) => (a.fecha?.seconds || 0) - (b.fecha?.seconds || 0));

            this.updateGroupTotals(); // Recalcular totales de grupos basado en nuevas deudas
            this._triggerUpdate(onUpdate);
        });
    }

    _triggerUpdate(callback) {
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
