// DOCUMENTACIÓN: Este archivo contiene la lógica actualizada para facturas.html
// 
// CAMBIOS PRINCIPALES:
// 1. Sistema de pestañas (FACTURAS / GRUPOS)
// 2. Muestra facturas individuales en lugar de equipos consolidados
// 3. Permite duplicados del mismo equipo si tiene múltiples facturas pendientes
// 4. Muestra nombres de clientes en rojo cuando son diferentes del número de equipo
//
// INTEGRACIÓN:
// - Reemplazar el servicio InvoiceService en facturas.html con este código
// - Actualizar la función render() para usar 'facturas' en lugar de 'equipos'

class InvoiceService {
    constructor() {
        this.grupos = new Map();
        this.facturasPendientes = []; // Array de facturas individuales
        this.equiposPorGrupo = new Map(); // Para la pestaña de grupos
        this.perfilesRaw = [];
    }

    initListeners(onUpdate) {
        console.log("🚀 Iniciando servicio de facturas...");

        // 1. Escuchar Grupos
        db.collection("grupos").onSnapshot((snap) => {
            this.grupos.clear();
            snap.forEach(doc => {
                this.grupos.set(doc.id, { id: doc.id, ...doc.data() });
            });
            this._triggerUpdate(onUpdate);
        });

        // 2. Escuchar TODOS los Perfiles y cargar sus facturas
        db.collection("PERFILES")
            .onSnapshot(async (snapshot) => {
                console.log(`🔍 Total perfiles: ${snapshot.size}`);

                this.facturasPendientes = [];
                this.equiposPorGrupo.clear();
                this.perfilesRaw = [];

                const promises = [];
                snapshot.forEach(doc => {
                    const perfil = doc.data();
                    perfil.id = doc.id;
                    this.perfilesRaw.push(perfil);

                    const esActivo = (perfil.activo === true || perfil.activo === "true" || perfil.activo === undefined);

                    if (esActivo) {
                        const promise = this._cargarFacturasPendientes(doc.ref, perfil).then(facturas => {
                            if (facturas && facturas.length > 0) {
                                // Si tiene grupo, agregar al mapa de grupos
                                if (perfil.grupo) {
                                    const saldoTotal = facturas.reduce((sum, f) => sum + f.saldo, 0);
                                    this.equiposPorGrupo.set(perfil.numero, {
                                        numero: perfil.numero,
                                        nombre: perfil.nombre || perfil.numero,
                                        total: saldoTotal,
                                        ciudad: perfil.grupo,
                                        id: doc.id
                                    });
                                } else {
                                    // Si NO tiene grupo, agregar facturas a la lista principal
                                    this.facturasPendientes.push(...facturas);
                                }
                            }
                        });
                        promises.push(promise);
                    }
                });

                await Promise.all(promises);
                this._triggerUpdate(onUpdate);
            }, (error) => {
                console.error("❌ Error cargando perfiles:", error);
            });
    }

    // Cargar facturas pendientes individuales de un perfil
    async _cargarFacturasPendientes(perfilRef, perfil) {
        try {
            let snap = await perfilRef.collection('MOVIMIENTOS').get();
            if (snap.empty) snap = await perfilRef.collection('movimientos').get();

            const facturas = [];
            snap.forEach(doc => {
                const mov = doc.data();
                if (mov.tipo === 'venta' || !mov.tipo) {
                    const status = mov.status || '';
                    const saldoPendiente = parseFloat(mov.saldoPendiente || 0);

                    let saldo = 0;
                    if (saldoPendiente > 0) {
                        saldo = saldoPendiente;
                    } else if (status === 'pendiente' || status === '') {
                        const total = parseFloat(mov.total || 0);
                        const abonos = mov.abonos && Array.isArray(mov.abonos)
                            ? mov.abonos.reduce((sum, a) => sum + parseFloat(a.monto || 0), 0)
                            : 0;
                        saldo = Math.max(0, total - abonos);
                    }

                    if (saldo > 0.01) {
                        facturas.push({
                            id: doc.id,
                            equipoNumero: perfil.numero,
                            equipoNombre: mov.clientName || perfil.nombre || `Equipo ${perfil.numero}`,
                            saldo: saldo,
                            ciudad: perfil.grupo || '',
                            esLocal: !perfil.grupo,
                            perfilId: perfil.id
                        });
                    }
                }
            });

            return facturas;
        } catch (error) {
            console.error("Error cargando facturas:", error);
            return [];
        }
    }

    _triggerUpdate(callback) {
        if (callback) {
            // Ordenar facturas por número de equipo
            this.facturasPendientes.sort((a, b) => {
                const numA = parseInt(String(a.equipoNumero).replace(/\D/g, '')) || 0;
                const numB = parseInt(String(b.equipoNumero).replace(/\D/g, '')) || 0;
                return numA - numB;
            });

            callback({
                grupos: this.grupos,
                facturas: this.facturasPendientes, // Devuelve facturas individuales
                equiposPorGrupo: this.equiposPorGrupo
            });
        }
    }

    getPerfilIdByNumero(numero) {
        const perfil = this.perfilesRaw.find(p => String(p.numero) === String(numero));
        return perfil ? perfil.id : null;
    }
}
