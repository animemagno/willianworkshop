window.GrupoManager = {
    grupos: new Map(),
    equiposPendientes: new Map(),
    currentEditingGroup: null,
    currentGrupoDetalle: null,
    unsubscribe: null,
    // CORRECCIÓN 5: Cache para optimizar rendimiento
    totalesCache: new Map(),
    lastUpdateTime: null,

    async initialize() {
        await this.loadGrupos();
        await this.loadEquiposPendientes();
        this.setupRealTimeListener();
        this.updateUI();
    },

    setupRealTimeListener() {
        if (!AppState.firebaseInitialized) return;

        this.unsubscribe = AppState.db.collection("VENTAS")
            .where("paymentType", "==", "pendiente")
            .where("status", "==", "pendiente")
            .onSnapshot(async (snapshot) => {
                await this.loadEquiposPendientes(true); // Force update
                await this.actualizarTotalesGrupos(true); // Force update totals
                this.updateUI();
            }, (error) => {
                console.error("Error en listener tiempo real:", error);
            });
    },

    async loadGrupos() {
        try {
            if (!AppState.firebaseInitialized) return;

            const snapshot = await ErrorHandler.withRetry(
                () => AppState.db.collection("GRUPOS").get(),
                3,
                "Carga de grupos"
            );

            this.grupos.clear();
            snapshot.forEach(doc => {
                this.grupos.set(doc.id, { id: doc.id, ...doc.data() });
            });

            await this.actualizarTotalesGrupos();

        } catch (error) {
            console.error("Error cargando grupos:", error);
            UIService.showStatus("Error cargando grupos: " + error.message, "error");
        }
    },

    // CORRECCIÓN 5: Función optimizada para actualizar totales
    async actualizarTotalesGrupos(force = false) {
        try {
            const now = Date.now();
            // Usar cache si la actualización fue hace menos de 30 segundos, a menos que se fuerce
            if (!force && this.lastUpdateTime && (now - this.lastUpdateTime < 30000)) {
                return;
            }

            const batch = AppState.db.batch();
            let updatesCount = 0;

            for (const [grupoId, grupo] of this.grupos.entries()) {
                // CORRECCIÓN: Siempre recalcular el total desde equiposPendientes
                // No usar caché porque los saldos cambian con abonos
                let nuevoTotal = 0;

                for (const equipoNum of grupo.equipos) {
                    let equipoEncontrado = null;
                    this.equiposPendientes.forEach((equipo, key) => {
                        if (equipo.numero === equipoNum && equipo.total > 0) {
                            equipoEncontrado = equipo;
                        }
                    });

                    if (equipoEncontrado) {
                        nuevoTotal += equipoEncontrado.total;
                    }
                }

                // Actualizar si hay diferencia
                if (grupo.total !== nuevoTotal) {
                    grupo.total = nuevoTotal;

                    if (AppState.firebaseInitialized) {
                        try {
                            const grupoRef = AppState.db.collection("GRUPOS").doc(grupoId);
                            batch.update(grupoRef, {
                                total: nuevoTotal,
                                fechaActualizacion: new Date()
                            });
                            updatesCount++;

                            // Limitar tamaño del batch para evitar timeouts
                            if (updatesCount >= 400) {
                                await batch.commit();
                                updatesCount = 0;
                            }
                        } catch (error) {
                            console.error(`Error actualizando grupo ${grupo.nombre}:`, error);
                        }
                    }
                }
            }

            // Commit batch final si hay updates pendientes
            if (updatesCount > 0) {
                await batch.commit();
            }

            this.lastUpdateTime = now;

        } catch (error) {
            console.error("Error actualizando totales de grupos:", error);
        }
    },

    async loadEquiposPendientes(force = false) {
        try {
            if (!AppState.firebaseInitialized) return;

            const snapshot = await ErrorHandler.withRetry(
                () => AppState.db.collection("VENTAS")
                    .where("paymentType", "==", "pendiente")
                    .where("status", "==", "pendiente")
                    .get(),
                3,
                "Carga de equipos pendientes"
            );

            this.equiposPendientes.clear();

            snapshot.forEach(doc => {
                const venta = doc.data();
                const equipo = venta.equipoNumber;
                const cliente = venta.clientName || '';

                let saldoPendiente = venta.total || 0;
                if (venta.abonos && venta.abonos.length > 0) {
                    const totalAbonado = venta.abonos.reduce((sum, abono) => sum + abono.monto, 0);
                    saldoPendiente = venta.total - totalAbonado;
                }

                if (equipo && saldoPendiente > 0) {
                    const key = `${equipo}-${cliente}`;

                    if (!this.equiposPendientes.has(key)) {
                        this.equiposPendientes.set(key, {
                            numero: equipo,
                            cliente: cliente,
                            total: 0,
                            facturas: []
                        });
                    }

                    const equipoData = this.equiposPendientes.get(key);
                    equipoData.facturas.push({
                        id: doc.id,
                        ...venta,
                        saldoPendiente: saldoPendiente
                    });
                    equipoData.total += saldoPendiente;
                }
            });

            await this.actualizarTotalesGrupos(force);
            MemoryManager.cleanupIfNeeded(this.equiposPendientes);

        } catch (error) {
            console.error("Error cargando equipos pendientes:", error);
        }
    },

    async crearGrupo(nombre, equiposSeleccionados) {
        try {
            if (!AppState.firebaseInitialized) {
                throw new Error("No hay conexión a la base de datos");
            }

            const equiposConFacturas = equiposSeleccionados.filter(equipoNum => {
                let tieneFacturas = false;
                this.equiposPendientes.forEach((equipo, key) => {
                    if (equipo.numero === equipoNum && equipo.total > 0) {
                        tieneFacturas = true;
                    }
                });
                return tieneFacturas;
            });

            if (equiposConFacturas.length === 0) {
                throw new Error("Los equipos seleccionados no tienen facturas pendientes");
            }

            let totalGrupo = 0;
            equiposConFacturas.forEach(equipoNum => {
                this.equiposPendientes.forEach((equipo, key) => {
                    if (equipo.numero === equipoNum) {
                        totalGrupo += equipo.total;
                    }
                });
            });

            const grupoData = {
                nombre: nombre,
                equipos: equiposConFacturas,
                total: totalGrupo,
                fechaCreacion: new Date(),
                activo: true
            };

            const docRef = await ErrorHandler.withRetry(
                () => AppState.db.collection("GRUPOS").add(grupoData),
                3,
                "Creación de grupo"
            );

            grupoData.id = docRef.id;
            this.grupos.set(docRef.id, grupoData);

            // Actualizar las facturas con la información del grupo
            for (const equipoNum of equiposConFacturas) {
                for (const [key, equipo] of this.equiposPendientes.entries()) {
                    if (equipo.numero === equipoNum) {
                        for (const factura of equipo.facturas) {
                            try {
                                await AppState.db.collection("VENTAS").doc(factura.id).update({
                                    grupo: docRef.id,
                                    grupoNombre: nombre
                                });
                            } catch (error) {
                                console.error(`Error actualizando factura ${factura.id}:`, error);
                            }
                        }
                    }
                }
            }

            await this.loadEquiposPendientes();
            await this.actualizarTotalesGrupos();
            this.updateUI();

            return docRef.id;
        } catch (error) {
            console.error("Error creando grupo:", error);
            throw error;
        }
    },

    async actualizarGrupo(grupoId, nombre, equiposSeleccionados) {
        try {
            if (!AppState.firebaseInitialized) {
                throw new Error("No hay conexión a la base de datos");
            }

            const equiposConFacturas = equiposSeleccionados.filter(equipoNum => {
                let tieneFacturas = false;
                this.equiposPendientes.forEach((equipo, key) => {
                    if (equipo.numero === equipoNum && equipo.total > 0) {
                        tieneFacturas = true;
                    }
                });
                return tieneFacturas;
            });

            let totalGrupo = 0;
            equiposConFacturas.forEach(equipoNum => {
                this.equiposPendientes.forEach((equipo, key) => {
                    if (equipo.numero === equipoNum) {
                        totalGrupo += equipo.total;
                    }
                });
            });

            const grupoData = {
                nombre: nombre,
                equipos: equiposConFacturas,
                total: totalGrupo,
                fechaActualizacion: new Date()
            };

            await ErrorHandler.withRetry(
                () => AppState.db.collection("GRUPOS").doc(grupoId).update(grupoData),
                3,
                "Actualización de grupo"
            );

            const grupoExistente = this.grupos.get(grupoId);
            if (grupoExistente) {
                Object.assign(grupoExistente, grupoData);
            }

            // Actualizar facturas con el nuevo grupo
            for (const equipoNum of equiposConFacturas) {
                for (const [key, equipo] of this.equiposPendientes.entries()) {
                    if (equipo.numero === equipoNum) {
                        for (const factura of equipo.facturas) {
                            try {
                                await AppState.db.collection("VENTAS").doc(factura.id).update({
                                    grupo: grupoId,
                                    grupoNombre: nombre
                                });
                            } catch (error) {
                                console.error(`Error actualizando factura ${factura.id}:`, error);
                            }
                        }
                    }
                }
            }

            // Remover grupo de facturas que ya no están en el grupo
            const grupoOriginal = this.grupos.get(grupoId);
            if (grupoOriginal) {
                for (const equipoNum of grupoOriginal.equipos) {
                    if (!equiposConFacturas.includes(equipoNum)) {
                        for (const [key, equipo] of this.equiposPendientes.entries()) {
                            if (equipo.numero === equipoNum) {
                                for (const factura of equipo.facturas) {
                                    try {
                                        if (AppState.firebaseInitialized) {
                                            // CORRECCIÓN 1: Usar firebase.firestore.FieldValue consistentemente
                                            await AppState.db.collection("VENTAS").doc(factura.id).update({
                                                grupo: firebase.firestore.FieldValue.delete(),
                                                grupoNombre: firebase.firestore.FieldValue.delete()
                                            });
                                        }
                                    } catch (error) {
                                        console.error(`Error removiendo grupo de factura ${factura.id}:`, error);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            await this.loadEquiposPendientes();
            await this.actualizarTotalesGrupos();
            this.updateUI();

            return grupoId;
        } catch (error) {
            console.error("Error actualizando grupo:", error);
            throw error;
        }
    },

    async eliminarGrupo(grupoId) {
        try {
            if (!AppState.firebaseInitialized) {
                throw new Error("No hay conexión a la base de datos");
            }

            const grupo = this.grupos.get(grupoId);
            if (grupo) {
                for (const equipoNum of grupo.equipos) {
                    for (const [key, equipo] of this.equiposPendientes.entries()) {
                        if (equipo.numero === equipoNum) {
                            for (const factura of equipo.facturas) {
                                try {
                                    if (AppState.firebaseInitialized) {
                                        // CORRECCIÓN 1: Usar firebase.firestore.FieldValue consistentemente
                                        await AppState.db.collection("VENTAS").doc(factura.id).update({
                                            grupo: firebase.firestore.FieldValue.delete(),
                                            grupoNombre: firebase.firestore.FieldValue.delete()
                                        });
                                    }
                                } catch (error) {
                                    console.error(`Error removiendo grupo de factura ${factura.id}:`, error);
                                }
                            }
                        }
                    }
                }
            }

            await ErrorHandler.withRetry(
                () => AppState.db.collection("GRUPOS").doc(grupoId).delete(),
                3,
                "Eliminación de grupo"
            );

            this.grupos.delete(grupoId);
            this.totalesCache.clear(); // Limpiar cache

            await this.loadEquiposPendientes();
            await this.actualizarTotalesGrupos();
            this.updateUI();

        } catch (error) {
            console.error("Error eliminando grupo:", error);
            throw error;
        }
    },

    getEquiposSinGrupo() {
        const equiposSinGrupo = new Map();

        this.equiposPendientes.forEach((equipo, key) => {
            let tieneGrupo = false;

            this.grupos.forEach(grupo => {
                if (grupo.equipos.includes(equipo.numero)) {
                    tieneGrupo = true;
                }
            });

            if (!tieneGrupo && equipo.total > 0) {
                equiposSinGrupo.set(key, equipo);
            }
        });

        return equiposSinGrupo;
    },

    getEquiposEnGrupos() {
        const equiposEnGrupos = new Set();

        this.grupos.forEach(grupo => {
            grupo.equipos.forEach(equipoNum => {
                equiposEnGrupos.add(equipoNum);
            });
        });

        return equiposEnGrupos;
    },

    updateUI() {
        if (window.FacturasTabManager) {
            FacturasTabManager.renderEquiposIndividuales();
        }
        if (window.GruposTabManager) {
            GruposTabManager.renderGruposVisual();
        }
    },

    // Delegación para impresión de saldos si se llama desde HTML
    imprimirSaldosEquipos() {
        if (window.FacturasTabManager) {
            FacturasTabManager.imprimirSaldosEquipos();
        }
    },

    async mostrarDetalleEquipo(key) {
        const equipo = this.equiposPendientes.get(key);
        AppState.selectedInvoicesForPayment = new Set();

        let facturasHTML = '';
        if (equipo) {
            // Sort invoices by date (oldest first)
            const sortedFacturas = [...equipo.facturas].sort((a, b) => {
                const dateA = a.timestamp ? (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) : new Date(0);
                const dateB = b.timestamp ? (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp)) : new Date(0);
                return dateA - dateB;
            });

            facturasHTML = `
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px;">
                        <thead>
                            <tr style="background-color: #2c3e50; color: white;">
                                <th style="padding: 10px; text-align: center; width: 40px;">
                                    <i class="fas fa-check-square"></i>
                                </th>
                                <th style="padding: 10px; text-align: left;">Factura</th>
                                <th style="padding: 10px; text-align: left;">Productos</th>
                                <th style="padding: 10px; text-align: right;">Total</th>
                                <th style="padding: 10px; text-align: right;">Abonos</th>
                                <th style="padding: 10px; text-align: right;">Saldo</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            sortedFacturas.forEach((factura, index) => {
                let productosHTML = '';
                if (factura.products && factura.products.length > 0) {
                    productosHTML = `<table style="width: 100%; font-size: 12px; border-collapse: collapse;">`;
                    factura.products.forEach(producto => {
                        const totalProducto = (producto.precio * producto.cantidad).toFixed(2);
                        productosHTML += `
                            <tr>
                                <td style="width: 35px; text-align: center; vertical-align: top; color: #2c3e50; font-weight: bold; padding: 2px;">
                                    ${producto.cantidad}
                                </td>
                                <td style="vertical-align: top; padding: 2px;">
                                    ${producto.descripcion}
                                </td>
                                <td style="text-align: right; vertical-align: top; font-weight: bold; color: #555; padding: 2px; width: 60px;">
                                    $${totalProducto}
                                </td>
                            </tr>
                        `;
                    });
                    productosHTML += `</table>`;
                }
                const saldoPendiente = factura.saldoPendiente !== undefined ? factura.saldoPendiente : factura.total;
                const tieneAbonos = factura.abonos && factura.abonos.length > 0;

                let abonosHTML = '-';
                if (tieneAbonos) {
                    abonosHTML = '';
                    factura.abonos.forEach(abono => {
                        const fechaAbono = abono.fecha ? new Date(abono.fecha.toDate ? abono.fecha.toDate() : abono.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : 'N/A';
                        abonosHTML += `
                            <div style="font-size: 11px; color: #27ae60;">
                                +$${abono.monto.toFixed(2)} (${fechaAbono})
                            </div>
                        `;
                    });
                }

                const rowStyle = index % 2 === 0 ? 'background-color: #f9f9f9;' : 'background-color: #ffffff;';

                facturasHTML += `
                    <tr style="${rowStyle} border-bottom: 1px solid #ddd;">
                        <td style="padding: 8px; text-align: center;">
                            <input type="checkbox" class="invoice-checkbox" data-id="${factura.id}" 
                                   onchange="GrupoManager.toggleInvoiceSelection('${factura.id}')" 
                                   style="width: 18px; height: 18px; cursor: pointer;">
                        </td>
                        <td style="padding: 8px; font-weight: bold; color: #2c3e50;">
                            #${factura.invoiceNumber}
                            <div style="font-size: 11px; color: #95a5a6; font-weight: normal;">
                                ${factura.timestamp ? new Date(factura.timestamp.toDate ? factura.timestamp.toDate() : factura.timestamp).toLocaleDateString('es-ES') : ''}
                            </div>
                        </td>
                        <td style="padding: 8px;">
                            ${productosHTML}
                        </td>
                        <td style="padding: 8px; text-align: right; font-weight: bold;">
                            $${factura.total.toFixed(2)}
                        </td>
                        <td style="padding: 8px; text-align: right;">
                            ${abonosHTML}
                        </td>
                        <td style="padding: 8px; text-align: right; font-weight: bold; color: #e74c3c;">
                            $${saldoPendiente.toFixed(2)}
                        </td>
                    </tr>
                `;
            });

            facturasHTML += `
                        </tbody>
                    </table>
                </div>
            `;
        }

        const modalContent = `
            <h3 style="margin-bottom: 15px; text-align: center; color: #2c3e50;">
                <i class="fas fa-tools"></i> Equipo ${equipo.numero}
            </h3>
            <div class="detalle-equipo" style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef; display: flex; justify-content: space-around; flex-wrap: wrap; gap: 10px;">
                <div><strong><i class="fas fa-user"></i> Cliente:</strong> ${equipo.cliente}</div>
                <div><strong><i class="fas fa-file-invoice-dollar"></i> Facturas:</strong> ${equipo ? equipo.facturas.length : 0}</div>
                <div style="font-size: 1.1em; color: #e74c3c;"><strong><i class="fas fa-money-bill-wave"></i> Total Pendiente:</strong> $${equipo ? equipo.total.toFixed(2) : '0.00'}</div>
            </div>
            
            <div style="margin: 15px 0; text-align: right;">
                <button class="btn btn-info" id="pay-selected-btn" onclick="GrupoManager.showBulkPaymentModal()" style="display: none; background-color: #3498db; border: none; padding: 8px 15px; border-radius: 5px; color: white; font-weight: bold; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                    <i class="fas fa-check-circle"></i> ABONAR SELECCIONADAS
                </button>
            </div>

            <div class="grupo-facturas">
                ${facturasHTML || '<p style="text-align: center; padding: 20px; color: #7f8c8d;">No hay facturas pendientes para este equipo</p>'}
            </div>
        `;

        document.getElementById('detalle-modal-content').innerHTML = modalContent;
        document.getElementById('detalle-modal').style.display = 'block';
        AppState.currentDetalle = { tipo: 'equipo', data: key };
    },

    toggleInvoiceSelection(invoiceId) {
        if (AppState.selectedInvoicesForPayment.has(invoiceId)) {
            AppState.selectedInvoicesForPayment.delete(invoiceId);
        } else {
            AppState.selectedInvoicesForPayment.add(invoiceId);
        }

        const btn = document.getElementById('pay-selected-btn');
        if (AppState.selectedInvoicesForPayment.size > 0) {
            btn.style.display = 'inline-block';
            btn.textContent = `ABONAR (${AppState.selectedInvoicesForPayment.size})`;
        } else {
            btn.style.display = 'none';
        }
    },

    showBulkPaymentModal() {
        if (AppState.selectedInvoicesForPayment.size === 0) return;

        const modal = document.getElementById('bulk-abono-modal');
        const info = document.getElementById('bulk-abono-info');

        // Mostrar info y ocultar elementos de grupo
        info.style.display = 'block';
        info.innerHTML = `
            <strong>Facturas Seleccionadas:</strong> ${AppState.selectedInvoicesForPayment.size}<br>
            Ingrese el monto total a abonar. Se distribuirá entre las facturas seleccionadas (más antiguas primero).
        `;

        // Ocultar elementos específicos de grupos
        document.getElementById('bulk-abono-grupo-nombre').textContent = '';
        document.getElementById('bulk-abono-fecha').textContent = '';
        document.getElementById('bulk-abono-equipos-list').innerHTML = '';
        document.getElementById('bulk-abono-equipos-list').parentElement.style.display = 'none';

        document.getElementById('monto-bulk-abono').value = '';
        modal.style.display = 'block';

        // Configurar el botón para procesar facturas seleccionadas
        const processBtn = document.getElementById('process-bulk-abono-btn');
        processBtn.onclick = async () => {
            if (processBtn.disabled) return;
            processBtn.disabled = true;

            const monto = parseFloat(document.getElementById('monto-bulk-abono').value);
            if (!monto || monto <= 0) {
                UIService.showStatus("Ingrese un monto válido", "error");
                processBtn.disabled = false;
                return;
            }

            try {
                UIService.showLoading(true);
                const facturasIds = Array.from(AppState.selectedInvoicesForPayment);
                await SalesService.processMultiAbono(facturasIds, monto);

                UIService.showStatus("Abono masivo realizado correctamente", "success");
                modal.style.display = 'none';
                document.getElementById('detalle-modal').style.display = 'none';
                AppState.selectedInvoicesForPayment.clear();

                // Recargar datos de grupos y equipos
                await GrupoManager.loadEquiposPendientes(true);
                await GrupoManager.actualizarTotalesGrupos(true);
                GrupoManager.updateUI();

            } catch (error) {
                UIService.showStatus("Error: " + error.message, "error");
            } finally {
                UIService.showLoading(false);
                processBtn.disabled = false;
            }
        };
    },

    showGroupPaymentModal(grupoId) {
        const grupo = this.grupos.get(grupoId);
        if (!grupo) return;

        const modal = document.getElementById('bulk-abono-modal');
        const info = document.getElementById('bulk-abono-info');

        // Ocultar info de facturas individuales
        info.style.display = 'none';
        info.innerHTML = '';

        // Mostrar elementos específicos de grupos
        document.getElementById('bulk-abono-equipos-list').parentElement.style.display = 'block';

        document.getElementById('monto-bulk-abono').value = '';
        modal.style.display = 'block';

        const processBtn = document.getElementById('process-bulk-abono-btn');
        processBtn.onclick = async () => {
            if (processBtn.disabled) return;
            processBtn.disabled = true;

            const monto = parseFloat(document.getElementById('monto-bulk-abono').value);
            if (!monto || monto <= 0) {
                UIService.showStatus("Ingrese un monto válido", "error");
                processBtn.disabled = false;
                return;
            }

            if (monto > grupo.total) {
                UIService.showStatus("El monto no puede ser mayor al total del grupo", "error");
                processBtn.disabled = false;
                return;
            }

            try {
                UIService.showLoading(true);

                // Recopilar todas las facturas del grupo y ordenarlas por fecha (más antiguas primero)
                const facturas = [];
                for (const equipoNum of grupo.equipos) {
                    this.equiposPendientes.forEach((equipo, key) => {
                        if (equipo.numero === equipoNum && equipo.facturas) {
                            equipo.facturas.forEach(f => {
                                facturas.push({
                                    id: f.id,
                                    timestamp: f.timestamp,
                                    saldoPendiente: f.saldoPendiente !== undefined ? f.saldoPendiente : f.total
                                });
                            });
                        }
                    });
                }

                if (facturas.length === 0) {
                    throw new Error("El grupo no tiene facturas pendientes");
                }

                // Ordenar por fecha (más antiguas primero)
                facturas.sort((a, b) => {
                    const dateA = a.timestamp ? (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) : new Date(0);
                    const dateB = b.timestamp ? (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp)) : new Date(0);
                    return dateA - dateB;
                });

                // Distribuir el abono entre las facturas
                let montoRestante = monto;
                const abonoData = {
                    fecha: DateUtils.getCurrentTimestampElSalvador(),
                    fechaString: DateUtils.getCurrentTimestampElSalvador().toLocaleString('es-ES')
                };

                for (const factura of facturas) {
                    if (montoRestante <= 0) break;

                    const montoAbonar = Math.min(montoRestante, factura.saldoPendiente);

                    if (montoAbonar > 0) {
                        await DataService.addAbono(factura.id, {
                            ...abonoData,
                            monto: montoAbonar
                        });
                        montoRestante -= montoAbonar;
                    }
                }

                UIService.showStatus(`Abono de $${monto.toFixed(2)} aplicado al grupo correctamente`, "success");
                modal.style.display = 'none';

                // Recargar datos del grupo
                await this.loadEquiposPendientes(true);
                await this.actualizarTotalesGrupos(true);
                this.updateUI();

                // Recargar historial si existe
                if (typeof SalesService !== 'undefined' && SalesService.loadHistorial) {
                    await SalesService.loadHistorial();
                }

            } catch (error) {
                UIService.showStatus("Error: " + error.message, "error");
            } finally {
                UIService.showLoading(false);
                processBtn.disabled = false;
            }
        };
    },

    showGroupPaymentModalSelector() {
        const gruposActivos = Array.from(this.grupos.values()).filter(g => g.activo && g.total > 0);

        if (gruposActivos.length === 0) {
            UIService.showStatus("No hay grupos con saldo pendiente", "info");
            return;
        }

        // Si solo hay un grupo, abrir directamente
        if (gruposActivos.length === 1) {
            this.showGroupPaymentModal(gruposActivos[0].id);
            return;
        }

        // Mostrar selector de grupos
        let gruposHTML = '';
        gruposActivos.forEach(grupo => {
            gruposHTML += `
                <div style="padding: 12px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s;"
                     onclick="GrupoManager.showGroupPaymentModal('${grupo.id}'); document.getElementById('grupo-selector-modal').style.display='none';"
                     onmouseover="this.style.background='#e8f4fd'; this.style.borderColor='#3498db';"
                     onmouseout="this.style.background='white'; this.style.borderColor='#ddd';">
                    <div style="font-weight: bold; color: #2c3e50;">${grupo.nombre}</div>
                    <div style="font-size: 0.85rem; color: #666;">Equipos: ${grupo.equipos.length} | Saldo: $${grupo.total.toFixed(2)}</div>
                </div>
            `;
        });

        // Crear modal temporal si no existe
        let modal = document.getElementById('grupo-selector-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'grupo-selector-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 400px;">
                    <h3 style="margin-bottom: 15px; text-align: center;">Seleccionar Grupo</h3>
                    <div id="grupo-selector-list" style="max-height: 300px; overflow-y: auto;"></div>
                    <button class="btn btn-secondary" style="width: 100%; margin-top: 15px;" 
                            onclick="document.getElementById('grupo-selector-modal').style.display='none';">
                        CANCELAR
                    </button>
                </div>
            `;
            document.body.appendChild(modal);
        }

        document.getElementById('grupo-selector-list').innerHTML = gruposHTML;
        modal.style.display = 'block';
    },

    async mostrarDetalleGrupoCompleto(grupoId) {
        const grupo = this.grupos.get(grupoId);
        if (!grupo) return;

        this.currentGrupoDetalle = grupo;

        let equiposHTML = '';
        let totalGeneral = 0;
        let totalPendiente = 0;
        let cantidadFacturas = 0;
        let tieneAbonos = false;

        for (const equipoNum of grupo.equipos) {
            let equipoEncontrado = null;
            this.equiposPendientes.forEach((equipo, key) => {
                if (equipo.numero === equipoNum && equipo.total > 0) {
                    equipoEncontrado = equipo;
                }
            });

            if (equipoEncontrado) {
                totalGeneral += equipoEncontrado.total;
                cantidadFacturas += equipoEncontrado.facturas.length;

                let facturasHTML = '';
                equipoEncontrado.facturas.forEach(factura => {
                    const saldoPendiente = factura.saldoPendiente !== undefined ? factura.saldoPendiente : factura.total;
                    totalPendiente += saldoPendiente;

                    if (factura.abonos && factura.abonos.length > 0) {
                        tieneAbonos = true;
                    }

                    let productosHTML = '';
                    if (factura.products && factura.products.length > 0) {
                        factura.products.forEach(producto => {
                            productosHTML += `
                                <div class="producto-item">
                                    <div>${producto.descripcion} x${producto.cantidad}</div>
                                    <div>$${(producto.precio * producto.cantidad).toFixed(2)}</div>
                                </div>
                            `;
                        });
                    }

                    facturasHTML += `
                        <div class="grupo-detalle-factura">
                            <div><strong>Factura:</strong> ${factura.invoiceNumber}</div>
                            <div><strong>Fecha:</strong> ${new Date(factura.timestamp.toDate ? factura.timestamp.toDate() : factura.timestamp).toLocaleDateString('es-ES')}</div>
                            <div><strong>Total:</strong> $${factura.total.toFixed(2)}</div>
                            ${factura.abonos && factura.abonos.length > 0 ? `<div><strong>Saldo Pendiente:</strong> $${saldoPendiente.toFixed(2)}</div>` : ''}
                            <div><strong>Productos:</strong></div>
                            ${productosHTML}
                        </div>
                    `;
                });

                equiposHTML += `
                    <div class="grupo-detalle-equipo">
                        <h4>Equipo ${equipoEncontrado.numero} - ${equipoEncontrado.cliente}</h4>
                        <div><strong>Total:</strong> $${equipoEncontrado.total.toFixed(2)}</div>
                        <div><strong>Facturas:</strong> ${equipoEncontrado.facturas.length}</div>
                        ${facturasHTML}
                    </div>
                `;
            }
        }

        const modalContent = `
            <h3 style="margin-bottom: 15px; text-align: center;">${grupo.nombre} - Detalles Completos</h3>
            <div class="grupo-resumen">
                <div><strong>Total del Grupo:</strong> $${totalGeneral.toFixed(2)}</div>
                ${tieneAbonos ? `<div><strong>Saldo Pendiente:</strong> $${totalPendiente.toFixed(2)}</div>` : ''}
                <div><strong>Número de Equipos:</strong> ${grupo.equipos.length}</div>
                <div><strong>Total de Facturas:</strong> ${cantidadFacturas}</div>
            </div>
            <div class="grupo-facturas">
                <h4>Detalles por Equipo:</h4>
                ${equiposHTML || '<p>No hay equipos con facturas pendientes en este grupo</p>'}
            </div>
        `;

        document.getElementById('grupo-detalle-modal-content').innerHTML = modalContent;
        document.getElementById('grupo-detalle-modal').style.display = 'block';
    },

    async imprimirGrupoCompleto() {
        const grupo = this.currentGrupoDetalle;
        if (!grupo) return;

        for (const equipoNum of grupo.equipos) {
            let equipoEncontrado = null;
            this.equiposPendientes.forEach((equipo, key) => {
                if (equipo.numero === equipoNum && equipo.total > 0) {
                    equipoEncontrado = equipo;
                }
            });

            if (equipoEncontrado) {
                equipoEncontrado.facturas.forEach(factura => {
                    this.imprimirTicketFactura(factura, equipoEncontrado);
                });
            }
        }
    },

    imprimirTicketFactura(factura, equipo) {
        const printWindow = window.open('', '_blank');
        const fecha = factura.timestamp ? new Date(factura.timestamp.toDate ? factura.timestamp.toDate() : factura.timestamp) : new Date();
        const fechaFormateada = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });

        const saldoPendiente = factura.saldoPendiente !== undefined ? factura.saldoPendiente : factura.total;
        const tieneAbonos = factura.abonos && factura.abonos.length > 0;
        const tipoPago = tieneAbonos && saldoPendiente > 0 ? 'PENDIENTE' : 'CONTADO';

        let abonosHTML = '';
        if (tieneAbonos) {
            factura.abonos.forEach(abono => {
                const fechaAbono = abono.fecha ? new Date(abono.fecha.toDate ? abono.fecha.toDate() : abono.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 'N/A';
                abonosHTML += `
                    <div style="display: flex; justify-content: space-between; font-size: 20px; margin: 2px 0;">
                        <div>ABONO: $${abono.monto.toFixed(2)} (${fechaAbono})</div>
                    </div>
                `;
            });
        }

        let productosHTML = '';
        if (factura.products && factura.products.length > 0) {
            factura.products.forEach(producto => {
                const descripcion = producto.descripcion.length > 25 ? producto.descripcion.substring(0, 25) + '...' : producto.descripcion;
                productosHTML += `
                    <div style="margin: 4px 0;">
                        <div style="font-size: 16px;">• ${descripcion}</div>
                        <div style="display: flex; justify-content: space-between; font-size: 18px;">
                            <div>x${producto.cantidad}</div>
                            <div>$${(producto.precio * producto.cantidad).toFixed(2)}</div>
                        </div>
                    </div>
                    <div style="border-bottom: 1px dotted #000; margin: 2px 0;"></div>
                `;
            });
        }

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Ticket #${factura.invoiceNumber}</title>
                <style>
                    body { 
                        font-family: 'Courier New', monospace; 
                        font-size: 22px; 
                        margin: 0; 
                        padding: 6px;
                        width: 58mm;
                        font-weight: bold;
                    }
                    .header { text-align: center; margin-bottom: 12px; }
                    .line { border-bottom: 2px dashed #000; margin: 4px 0; }
                    .total { font-weight: bold; text-align: center; margin-top: 12px; font-size: 24px; }
                    .footer { text-align: center; margin-top: 12px; font-size: 18px; font-weight: bold; }
                    .small-text { font-size: 18px; }
                    .medium-text { font-size: 20px; }
                    .large-text { font-size: 26px; }
                    .equipo-text { font-size: 32px; font-weight: 900; margin: 5px 0; }
                    .thank-you { text-align: center; margin-top: 15px; font-weight: bold; font-size: 20px; }
                    .saldo-info {
                        background: #f0f0f0;
                        padding: 8px;
                        margin: 8px 0;
                        border-radius: 4px;
                        font-size: 18px;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h3 style="margin: 2px 0; font-size: 26px;">TALLER WILLIAN</h3>
                    <div class="small-text">Factura: ${factura.invoiceNumber}</div>
                    <div class="small-text">${fechaFormateada}, ${tipoPago}</div>
                </div>
                
                <div class="line"></div>
                
                ${equipo.cliente && equipo.cliente.toLowerCase() !== 'cliente general' && equipo.cliente !== `Equipo ${equipo.numero}` && equipo.cliente !== equipo.numero ? `
                    <div class="medium-text">
                        <strong>Cliente:</strong> ${equipo.cliente}
                    </div>
                ` : ''}
                <div class="equipo-text" style="text-align: center;">
                    ${equipo.numero}
                </div>
                
                <div class="line"></div>
                
                <div style="margin: 8px 0;">
                    ${productosHTML}
                </div>
                
                <div class="line"></div>
                
                <div class="total large-text">
                    TOTAL: $${factura.total.toFixed(2)}
                </div>

                ${abonosHTML}

                ${tieneAbonos && saldoPendiente > 0 ? `
                    <div class="saldo-info">
                        <div>SALDO PENDIENTE:</div>
                        <div class="large-text">$${saldoPendiente.toFixed(2)}</div>
                    </div>
                ` : ''}
                
                <div class="thank-you">
                    GRACIAS POR PREFERIRNOS
                </div>
            </body>
            </html>
        `);

        printWindow.document.close();
        printWindow.focus();

        setTimeout(() => {
            printWindow.print();
            setTimeout(() => {
                printWindow.close();
            }, 500);
        }, 500);
    },

    async actualizarDesdeVenta(ventaData) {
        if (ventaData.paymentType === 'pendiente' && ventaData.status === 'pendiente') {
            const equipo = ventaData.equipoNumber;
            if (equipo) {
                await this.loadEquiposPendientes();
                await this.actualizarTotalesGrupos();
                this.updateUI();
            }
        }
    },

    async capturarImagenGrupo(grupoId) {
        const grupo = this.grupos.get(grupoId);
        if (!grupo) {
            UIService.showStatus('Grupo no encontrado', 'error');
            return;
        }

        // Verificar que html2canvas esté disponible
        if (typeof html2canvas === 'undefined') {
            UIService.showStatus('Error: Recarga la página para cargar la librería de captura', 'error');
            console.error('html2canvas no está cargado');
            return;
        }

        try {
            UIService.showLoading(true);

            // Crear un contenedor temporal para la captura
            const captureDiv = document.createElement('div');
            captureDiv.style.cssText = `
                position: fixed;
                left: -9999px;
                top: 0;
                background: white;
                padding: 20px;
                width: 400px;
                font-family: Arial, sans-serif;
                border: 2px solid #2c3e50;
                border-radius: 10px;
            `;

            // Recopilar equipos del grupo
            let equiposHTML = '';
            let totalGrupo = 0;

            for (const equipoNum of grupo.equipos) {
                let equipoEncontrado = null;
                this.equiposPendientes.forEach((equipo, key) => {
                    if (equipo.numero === equipoNum && equipo.total > 0) {
                        equipoEncontrado = equipo;
                    }
                });

                if (equipoEncontrado) {
                    totalGrupo += equipoEncontrado.total;
                    equiposHTML += `
                        <div style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #ddd; background: ${equiposHTML ? '#f9f9f9' : 'white'};">
                            <div style="font-weight: bold; color: #2c3e50; font-size: 16px;">Equipo ${equipoEncontrado.numero}</div>
                            <div style="font-weight: bold; color: #e74c3c; font-size: 16px;">$${equipoEncontrado.total.toFixed(2)}</div>
                        </div>
                    `;
                }
            }

            captureDiv.innerHTML = `
                <div style="text-align: center; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 3px solid #3498db;">
                    <h2 style="margin: 0; color: #2c3e50; font-size: 24px;">TALLER WILLIAN</h2>
                    <h3 style="margin: 5px 0 0 0; color: #3498db; font-size: 20px;">${grupo.nombre}</h3>
                </div>
                <div style="margin-bottom: 15px;">
                    ${equiposHTML}
                </div>
                <div style="background: #2c3e50; color: white; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 14px; margin-bottom: 5px;">TOTAL DEL GRUPO</div>
                    <div style="font-size: 28px; font-weight: bold;">$${totalGrupo.toFixed(2)}</div>
                </div>
                <div style="text-align: center; margin-top: 15px; color: #7f8c8d; font-size: 12px;">
                    ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </div>
            `;

            document.body.appendChild(captureDiv);

            // Capturar con html2canvas
            const canvas = await html2canvas(captureDiv, {
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false
            });

            // Remover el div temporal
            document.body.removeChild(captureDiv);

            // Convertir a blob y descargar
            canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = `${grupo.nombre.replace(/\s+/g, '_')}_${new Date().getTime()}.png`;
                link.href = url;
                link.click();
                URL.revokeObjectURL(url);

                UIService.showStatus('Imagen capturada y descargada correctamente', 'success');
            });

        } catch (error) {
            console.error('Error al capturar imagen:', error);
            UIService.showStatus('Error al capturar imagen: ' + error.message, 'error');
        } finally {
            UIService.showLoading(false);
        }
    },


    generarGridEquipos(modalType = 'crear') {
        const grid = document.getElementById(modalType === 'crear' ? 'all-equipos-grid' : 'editar-all-equipos-grid');
        const equiposEnGrupos = this.getEquiposEnGrupos();
        const selectedSet = modalType === 'crear' ? AppState.equiposSeleccionados : AppState.equiposEditSeleccionados;

        let html = '';

        // Recopilar todos los equipos con deuda
        const equiposConDeuda = [];
        this.equiposPendientes.forEach((equipo, key) => {
            if (equipo.total > 0) {
                equiposConDeuda.push({
                    numero: equipo.numero,
                    total: equipo.total,
                    cliente: equipo.cliente || null,
                    facturas: equipo.facturas
                });
            }
        });

        // Ordenar por número de equipo
        equiposConDeuda.sort((a, b) => {
            const numA = parseFloat(a.numero) || 0;
            const numB = parseFloat(b.numero) || 0;
            return numA - numB;
        });

        // Generar HTML para cada equipo con deuda
        equiposConDeuda.forEach(equipo => {
            const equipoNum = equipo.numero;
            const estaSeleccionado = selectedSet.has(equipoNum);
            const estaEnOtroGrupo = equiposEnGrupos.has(equipoNum) &&
                (modalType === 'crear' ||
                    (modalType === 'editar' && this.currentEditingGroup &&
                        !this.currentEditingGroup.equipos.includes(equipoNum)));

            let estilo = '';
            let estiloInline = '';

            if (estaEnOtroGrupo) {
                estilo = 'equipo-en-grupo';
                estiloInline = 'border-color: #e74c3c; background: #f8d7da; color: #721c24; cursor: not-allowed;';
            } else {
                estilo = 'has-facturas';
                estiloInline = 'border-color: #27ae60; background: #f0fff0;';
            }

            // Mostrar etiqueta de localidad/cliente si existe
            const etiquetaCliente = equipo.cliente ?
                `<br><small style="color: #e74c3c; font-size: 0.65rem;">${equipo.cliente}</small>` : '';

            html += `
                <div class="all-equipo-item ${estilo} ${estaSeleccionado ? 'selected' : ''}" 
                     onclick="${estaEnOtroGrupo ? '' : `GrupoManager.toggleEquipoSelection('${equipoNum}', '${modalType}')`}"
                     style="${estiloInline}">
                    ${equipoNum}
                    ${etiquetaCliente}
                    <br><small style="color: #27ae60;">$${equipo.total.toFixed(2)}</small>
                    ${estaEnOtroGrupo ? '<br><small style="color: #e74c3c; font-size: 0.6rem;">EN GRUPO</small>' : ''}
                </div>
            `;
        });

        if (equiposConDeuda.length === 0) {
            html = '<div style="text-align: center; color: #999; padding: 20px;">No hay equipos con deuda pendiente</div>';
        }

        grid.innerHTML = html;
    },

    actualizarListaSeleccionados(modalType = 'crear') {
        const selectedList = document.getElementById(modalType === 'crear' ? 'selected-equipos-list' : 'editar-selected-equipos-list');
        const contador = document.getElementById(modalType === 'crear' ? 'contador-equipos' : 'editar-contador-equipos');
        const selectedSet = modalType === 'crear' ? AppState.equiposSeleccionados : AppState.equiposEditSeleccionados;

        contador.textContent = selectedSet.size;

        if (selectedSet.size === 0) {
            selectedList.innerHTML = '<div style="color: #999; text-align: center; font-size: 0.8rem;">No hay equipos seleccionados</div>';
        } else {
            let badgesHTML = '';
            const equiposOrdenados = Array.from(selectedSet).sort((a, b) => parseInt(a) - parseInt(b));

            equiposOrdenados.forEach(num => {
                let equipoEncontrado = null;
                this.equiposPendientes.forEach((equipo, key) => {
                    if (equipo.numero === num && equipo.total > 0) {
                        equipoEncontrado = equipo;
                    }
                });

                if (equipoEncontrado) {
                    badgesHTML += `<span class="selected-equipo-badge">${num} ($${equipoEncontrado.total.toFixed(2)})</span>`;
                } else {
                    badgesHTML += `<span class="selected-equipo-badge" style="background: #95a5a6;">${num} ($0.00)</span>`;
                }
            });
            selectedList.innerHTML = badgesHTML;
        }
    },

    async editarGrupo(grupoId) {
        const grupo = this.grupos.get(grupoId);
        if (!grupo) {
            UIService.showStatus("No se encontró el grupo para editar", "error");
            return;
        }

        this.currentEditingGroup = grupo;

        AppState.equiposEditSeleccionados = new Set(grupo.equipos);

        document.getElementById('editar-nombre-grupo').value = grupo.nombre;
        this.generarGridEquipos('editar');
        this.actualizarListaSeleccionados('editar');

        document.getElementById('editar-grupo-modal').style.display = 'block';
    },

    async actualizarGrupoDesdeModal() {
        const grupo = this.currentEditingGroup;
        if (!grupo) {
            UIService.showStatus("No hay grupo seleccionado para editar", "error");
            return;
        }

        const nombre = document.getElementById('editar-nombre-grupo').value.trim();
        if (!nombre) {
            UIService.showStatus("Ingrese un nombre para el grupo", "error");
            return;
        }

        if (AppState.equiposEditSeleccionados.size === 0) {
            UIService.showStatus("Seleccione al menos un equipo", "error");
            return;
        }

        try {
            const equiposArray = Array.from(AppState.equiposEditSeleccionados);
            await this.actualizarGrupo(grupo.id, nombre, equiposArray);
            UIService.showStatus(`Grupo "${nombre}" actualizado correctamente`, "success");
            document.getElementById('editar-grupo-modal').style.display = 'none';
            this.currentEditingGroup = null;
            AppState.equiposEditSeleccionados.clear();
        } catch (error) {
            UIService.showStatus("Error al actualizar grupo: " + error.message, "error");
        }
    },

    toggleEquipoSelection(equipoNum, modalType = 'crear') {
        const selectedSet = modalType === 'crear' ? AppState.equiposSeleccionados : AppState.equiposEditSeleccionados;

        if (selectedSet.has(equipoNum)) {
            selectedSet.delete(equipoNum);
        } else {
            if (selectedSet.size >= 130) {
                UIService.showStatus("Máximo 130 equipos permitidos", "error");
                return;
            }
            selectedSet.add(equipoNum);
        }

        this.actualizarListaSeleccionados(modalType);

        const selector = modalType === 'crear' ? '.all-equipo-item' : '#editar-all-equipos-grid .all-equipo-item';
        document.querySelectorAll(selector).forEach(item => {
            const num = item.textContent.split('\n')[0].trim();
            if (num === equipoNum) {
                if (selectedSet.has(num)) {
                    item.classList.add('selected');
                } else {
                    item.classList.remove('selected');
                }
            }
        });
    },

    solicitarEliminarGrupo(grupoId) {
        if (!confirm("¿Está seguro de eliminar este grupo? Los equipos volverán a estar disponibles individualmente y se eliminarán las asociaciones de grupo.")) {
            return;
        }

        try {
            UIService.showLoading(true);
            this.eliminarGrupo(grupoId);
            UIService.showStatus("Grupo eliminado correctamente", "success");
            this.updateUI();
        } catch (error) {
            UIService.showStatus("Error al eliminar grupo: " + error.message, "error");
        } finally {
            UIService.showLoading(false);
        }
    }
};
