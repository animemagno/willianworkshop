const HistorialService = {
    _escape(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    updateHistorial(movimientos) {
        const historialBody = document.getElementById('historial-body');
        AppState.historial = movimientos;
        AppState.filteredHistorial = movimientos;

        // Ocultar resumen diario si estamos viendo historial general
        const dailySummary = document.getElementById('daily-summary-container');
        if (dailySummary) {
            dailySummary.style.display = 'none';
        }
        this.applyCurrentFilter();
    },

    applyCurrentFilter() {
        let filtered = AppState.historial;

        switch (AppState.currentFilter) {
            case 'hoy':
                const today = DateUtils.getCurrentDateStringElSalvador();
                filtered = filtered.filter(mov => {
                    return mov.date === today;
                });
                break;
            case 'todo':
                // Mostrar todo sin filtrar
                break;
        }

        AppState.filteredHistorial = filtered;
        this.renderHistorial();
    },

    renderHistorial() {
        const historialBody = document.getElementById('historial-body');
        const movimientos = AppState.filteredHistorial;

        if (movimientos.length === 0) {
            historialBody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-cart">No hay movimientos que coincidan con el filtro</td>
                </tr>
            `;
            return;
        }

        let historialHTML = '';

        movimientos.forEach(movimiento => {
            const fecha = movimiento.timestamp ? new Date(movimiento.timestamp.toDate ? movimiento.timestamp.toDate() : movimiento.timestamp).toLocaleDateString('es-ES') : 'N/A';

            if (movimiento.tipo === 'retiro') {
                historialHTML += `
                    <tr style="background-color: #fff5f5;">
                        <td><strong>RET-${this._escape(movimiento.id.substring(0, 6))}</strong></td>
                        <td>
                            <div class="cliente-equipo">-</div>
                            <div class="cliente-nombre">${this._escape(movimiento.concepto) || 'Sin concepto'}</div>
                        </td>
                        <td>
                            <div class="saldo-pendiente-rojo">-$${Math.abs(movimiento.monto).toFixed(2)}</div>
                        </td>
                        <td><span class="retiro-badge">RETIRO</span></td>
                        <td>${fecha}</td>
                        <td>
                            <div class="historial-actions-container">
                                <button class="icon-btn btn-view" onclick="SalesService.viewRetiro('${this._escape(movimiento.id)}')" title="Ver retiro">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <div class="action-menu-wrapper">
                                    <button class="menu-toggle-btn" onclick="UIService.toggleActionMenu(this)" title="Más acciones">
                                        <i class="fas fa-ellipsis-v"></i>
                                    </button>
                                    <div class="action-dropdown">
                                        <div class="action-dropdown-item" onclick="SalesService.editRetiro('${this._escape(movimiento.id)}')">
                                            <i class="fas fa-edit"></i> Editar
                                        </div>
                                        <div class="action-dropdown-item delete-item" onclick="SalesService.deleteRetiro('${this._escape(movimiento.id)}')">
                                            <i class="fas fa-trash"></i> Eliminar
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            } else if (movimiento.tipo === 'ingreso') {
                historialHTML += `
                    <tr style="background-color: #f0fff4;">
                        <td><strong>ING-${this._escape(movimiento.id.substring(0, 6))}</strong></td>
                        <td>
                            <div class="cliente-equipo">-</div>
                            <div class="cliente-nombre">${this._escape(movimiento.concepto) || 'Sin concepto'}</div>
                        </td>
                        <td>
                            <div class="saldo-pendiente-negro" style="color: #27ae60;">+$${Math.abs(movimiento.monto).toFixed(2)}</div>
                        </td>
                        <td><span class="ingreso-badge">INGRESO</span></td>
                        <td>${fecha}</td>
                        <td>
                            <div class="historial-actions-container">
                                <button class="icon-btn btn-view" onclick="SalesService.viewIngreso('${this._escape(movimiento.id)}')" title="Ver ingreso">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <div class="action-menu-wrapper">
                                    <button class="menu-toggle-btn" onclick="UIService.toggleActionMenu(this)" title="Más acciones">
                                        <i class="fas fa-ellipsis-v"></i>
                                    </button>
                                    <div class="action-dropdown">
                                        <div class="action-dropdown-item" onclick="SalesService.editIngreso('${this._escape(movimiento.id)}')">
                                            <i class="fas fa-edit"></i> Editar
                                        </div>
                                        <div class="action-dropdown-item delete-item" onclick="SalesService.deleteIngreso('${this._escape(movimiento.id)}')">
                                            <i class="fas fa-trash"></i> Eliminar
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            } else if (movimiento.tipo === 'abono') {
                historialHTML += `
                    <tr style="background-color: #f0fff4;">
                        <td><strong>ABO-${this._escape(movimiento.id.substring(0, 6))}</strong></td>
                        <td>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div class="cliente-equipo" style="margin-bottom: 0; font-size: 1.1em; min-width: 30px;">${this._escape(movimiento.equipoNumber) || '-'}</div>
                                <div class="cliente-nombre" style="font-size: 0.85em; margin-bottom: 0;">
                                    Abono <a href="#" onclick="event.preventDefault(); SalesService.viewInvoice('${this._escape(movimiento.invoiceId || movimiento.invoiceNumber)}');" style="color: #7f8c8d; text-decoration: underline;">
                                        #${this._escape(movimiento.invoiceNumber)}
                                    </a>
                                </div>
                            </div>
                        </td>
                        <td>
                            <div class="saldo-pendiente-negro">+$${movimiento.monto.toFixed(2)}</div>
                        </td>
                        <td><span class="contado-badge" style="background-color: #27ae60;">ABONO</span></td>
                        <td>${fecha}</td>
                        <td>
                            <div class="historial-actions-container">
                                <button class="icon-btn btn-view" onclick="SalesService.viewInvoice('${this._escape(movimiento.invoiceNumber)}')" title="Ver factura">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <div class="action-menu-wrapper">
                                    <button class="menu-toggle-btn" onclick="UIService.toggleActionMenu(this)" title="Más acciones">
                                        <i class="fas fa-ellipsis-v"></i>
                                    </button>
                                    <div class="action-dropdown">
                                        <div class="action-dropdown-item delete-item" onclick="SalesService.deleteAbono('${this._escape(movimiento.id)}', '${this._escape(movimiento.invoiceId || '')}')">
                                            <i class="fas fa-trash"></i> Eliminar abono
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            } else {
                // Es una VENTA
                const venta = movimiento;
                let estadoReal = venta.paymentType;
                let tipoClass = 'pendiente-badge';
                let tipoTexto = 'PENDIENTE';
                let saldoPendiente = venta.saldoPendiente !== undefined ? venta.saldoPendiente : venta.total;

                if (venta.paymentType === 'contado') {
                    tipoClass = 'contado-badge';
                    tipoTexto = 'CONTADO';
                } else if (venta.paymentType === 'pendiente') {
                    if (saldoPendiente <= 0) {
                        estadoReal = 'contado';
                        tipoClass = 'contado-badge';
                        tipoTexto = 'PAGADO';
                    }
                }

                let montoMostrar = venta.total || 0;
                let claseMonto = 'saldo-pendiente-negro';

                if (estadoReal === 'pendiente') {
                    montoMostrar = saldoPendiente;
                    if (venta.saldoPendiente < venta.total) {
                        claseMonto = 'saldo-pendiente-rojo';
                    }
                }

                let botonesHTML = '';
                if (estadoReal === 'contado' || estadoReal === 'pagado') {
                    botonesHTML = `
                        <button class="icon-btn btn-view" onclick="SalesService.viewInvoice('${this._escape(venta.id)}')" title="Ver factura">
                            <i class="fas fa-eye"></i>
                        </button>
                        <div class="action-menu-wrapper">
                            <button class="menu-toggle-btn" onclick="UIService.toggleActionMenu(this)" title="Más acciones">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                            <div class="action-dropdown">
                                <div class="action-dropdown-item" onclick="SalesService.reprintInvoice('${this._escape(venta.id)}')">
                                    <i class="fas fa-print"></i> Reimprimir
                                </div>
                                <div class="action-dropdown-item delete-item" onclick="SalesService.deleteInvoice('${this._escape(venta.id)}')">
                                    <i class="fas fa-trash"></i> Eliminar
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    botonesHTML = `
                        <button class="icon-btn btn-view" onclick="SalesService.viewInvoice('${this._escape(venta.id)}')" title="Ver factura">
                            <i class="fas fa-eye"></i>
                        </button>
                        <div class="action-menu-wrapper">
                            <button class="menu-toggle-btn" onclick="UIService.toggleActionMenu(this)" title="Más acciones">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                            <div class="action-dropdown">
                                <div class="action-dropdown-item" onclick="SalesService.reprintInvoice('${this._escape(venta.id)}')">
                                    <i class="fas fa-print"></i> Reimprimir
                                </div>
                                <div class="action-dropdown-item" onclick="SalesService.editInvoice('${this._escape(venta.id)}')">
                                    <i class="fas fa-edit"></i> Editar
                                </div>
                                <div class="action-dropdown-item" onclick="SalesService.registrarAbono('${this._escape(venta.id)}')">
                                    <i class="fas fa-money-bill-wave"></i> Abonar
                                </div>
                                <div class="action-dropdown-item" onclick="SalesService.cancelInvoice('${this._escape(venta.id)}')">
                                    <i class="fas fa-ban"></i> Cancelar
                                </div>
                                <div class="action-dropdown-item delete-item" onclick="SalesService.deleteInvoice('${this._escape(venta.id)}')">
                                    <i class="fas fa-trash"></i> Eliminar
                                </div>
                            </div>
                        </div>
                    `;
                }

                historialHTML += `
                    <tr>
                        <td>
                            <a href="#" onclick="event.preventDefault(); SalesService.viewInvoice('${this._escape(venta.id)}');" style="color: #2c3e50; text-decoration: none; font-weight: bold;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">
                                #${this._escape(venta.invoiceNumber)}
                            </a>
                        </td>
                        <td>
                            <div class="cliente-equipo">${this._escape(venta.equipoNumber) || '-'}</div>
                            <div class="cliente-nombre">${this._escape(venta.clientName) || 'Cliente General'}</div>
                        </td>
                        <td>
                            <div class="${claseMonto}">$${montoMostrar.toFixed(2)}</div>
                            ${venta.total !== montoMostrar ? `<div style="font-size: 0.7rem; color: #999;">Total: $${venta.total.toFixed(2)}</div>` : ''}
                        </td>
                        <td><span class="${tipoClass}">${tipoTexto}</span></td>
                        <td>${fecha}</td>
                        <td>
                            <div class="action-buttons historial-actions-container">
                                ${botonesHTML}
                            </div>
                        </td>
                    </tr>
                `;
            }
        });

        historialBody.innerHTML = historialHTML;
    },

    renderProductSummary(movimientos) {
        const summaryContent = document.getElementById('daily-summary-content');
        const cashSummary = document.getElementById('daily-cash-summary');
        const productsMap = new Map();

        let totalVentas = 0;
        let totalAbonos = 0;
        let totalRetiros = 0;
        let totalIngresos = 0;

        movimientos.forEach(mov => {
            if (mov.tipo === 'venta') {
                // Sumar productos
                if (mov.products) {
                    mov.products.forEach(prod => {
                        const current = productsMap.get(prod.descripcion) || { cantidad: 0, total: 0 };
                        productsMap.set(prod.descripcion, {
                            cantidad: current.cantidad + prod.cantidad,
                            total: current.total + (prod.precio * prod.cantidad)
                        });
                    });
                }
                // Sumar al total de ventas (contado + crédito)
                // Para flujo de caja real, sumamos lo que entró hoy
                if (mov.paymentType === 'contado') {
                    totalVentas += mov.total;
                }
            } else if (mov.tipo === 'abono') {
                totalAbonos += mov.monto;
            } else if (mov.tipo === 'retiro') {
                totalRetiros += Math.abs(mov.monto);
            } else if (mov.tipo === 'ingreso') {
                totalIngresos += mov.monto;
            }
        });

        // Renderizar productos en tabla compacta
        if (productsMap.size === 0) {
            summaryContent.innerHTML = '<div style="color: #7f8c8d; font-style: italic;">No hubo ventas de productos este día.</div>';
        } else {
            // Ordenar por cantidad vendida
            const sortedProducts = Array.from(productsMap.entries()).sort((a, b) => b[1].cantidad - a[1].cantidad);

            // Determinar número de columnas basado en cantidad de productos
            const numProducts = sortedProducts.length;
            const numColumns = numProducts <= 12 ? 4 : 6;

            let html = `
                <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                    <thead>
                        <tr style="background-color: #34495e; color: white;">
                            <th style="padding: 6px 8px; text-align: left; border: 1px solid #ddd;">Cant.</th>
                            <th style="padding: 6px 8px; text-align: left; border: 1px solid #ddd;">Producto</th>
                            <th style="padding: 6px 8px; text-align: right; border: 1px solid #ddd;">Total</th>
            `;

            // Repetir encabezados según número de columnas
            for (let i = 1; i < numColumns; i++) {
                html += `
                            <th style="padding: 6px 8px; text-align: left; border: 1px solid #ddd;">Cant.</th>
                            <th style="padding: 6px 8px; text-align: left; border: 1px solid #ddd;">Producto</th>
                            <th style="padding: 6px 8px; text-align: right; border: 1px solid #ddd;">Total</th>
                `;
            }

            html += `
                        </tr>
                    </thead>
                    <tbody>
            `;

            // Dividir productos en filas
            const productsPerRow = numColumns;
            for (let i = 0; i < sortedProducts.length; i += productsPerRow) {
                html += '<tr>';

                for (let j = 0; j < productsPerRow; j++) {
                    const index = i + j;
                    if (index < sortedProducts.length) {
                        const [nombre, data] = sortedProducts[index];
                        html += `
                            <td style="padding: 5px 6px; border: 1px solid #ddd; text-align: center; font-weight: bold; color: #27ae60; background-color: #f9f9f9;">x${data.cantidad}</td>
                            <td style="padding: 5px 6px; border: 1px solid #ddd; font-weight: 500; color: #2c3e50;">${this._escape(nombre)}</td>
                            <td style="padding: 5px 6px; border: 1px solid #ddd; text-align: right; font-weight: bold; color: #2980b9;">$${data.total.toFixed(2)}</td>
                        `;
                    } else {
                        // Celdas vacías para completar la fila
                        html += `
                            <td style="padding: 5px 6px; border: 1px solid #ddd; background-color: #f5f5f5;"></td>
                            <td style="padding: 5px 6px; border: 1px solid #ddd; background-color: #f5f5f5;"></td>
                            <td style="padding: 5px 6px; border: 1px solid #ddd; background-color: #f5f5f5;"></td>
                        `;
                    }
                }

                html += '</tr>';
            }

            html += `
                    </tbody>
                </table>
            `;

            summaryContent.innerHTML = html;
        }

        // Renderizar resumen de caja
        const saldoFinal = totalVentas + totalAbonos + totalIngresos - totalRetiros;
        cashSummary.innerHTML = `
            <div style="color: #27ae60;">Ventas Contado: $${totalVentas.toFixed(2)}</div>
            <div style="color: #2980b9;">Abonos Recibidos: $${totalAbonos.toFixed(2)}</div>
            <div style="color: #16a085;">Ingresos: +$${totalIngresos.toFixed(2)}</div>
            <div style="color: #c0392b;">Retiros: -$${totalRetiros.toFixed(2)}</div>
            <div style="color: #2c3e50; border-left: 2px solid #bdc3c7; padding-left: 15px;">Flujo Neto: $${saldoFinal.toFixed(2)}</div>
        `;
    },

    generarResumenProductos(movimientos) {
        // Filtrar solo ventas
        const ventas = movimientos.filter(m => !m.tipo || m.tipo === 'venta');
        if (ventas.length === 0) return '';

        const productosMap = {};

        ventas.forEach(venta => {
            if (venta.products && Array.isArray(venta.products)) {
                venta.products.forEach(p => {
                    if (p.codigo && p.codigo.toLowerCase() === 'manual') return;

                    const key = p.codigo || p.descripcion;
                    if (!productosMap[key]) {
                        productosMap[key] = {
                            codigo: p.codigo,
                            descripcion: p.descripcion,
                            cantidad: 0,
                            totalVenta: 0
                        };
                    }
                    productosMap[key].cantidad += (parseFloat(p.cantidad) || 0);
                    // Usar precio * cantidad de la venta para exactitud
                    productosMap[key].totalVenta += (parseFloat(p.precio) * parseFloat(p.cantidad));
                });
            }
        });

        const productos = Object.values(productosMap).sort((a, b) => b.totalVenta - a.totalVenta);

        if (productos.length === 0) return '';

        const totalGeneral = productos.reduce((sum, p) => sum + p.totalVenta, 0);
        const totalCantidad = productos.reduce((sum, p) => sum + p.cantidad, 0);

        let html = `
            <div style="background-color: #f8f9fa; padding: 15px; border-top: 2px solid #ddd; margin-top: 20px;">
                <h4 style="margin-bottom: 10px; color: #2c3e50; text-align: center;">RESUMEN DE PRODUCTOS VENDIDOS</h4>
                <table class="table table-sm table-bordered" style="width: 100%; font-size: 0.9em; background: white;">
                    <thead class="thead-light">
                        <tr>
                            <th>Cód.</th>
                            <th>Descripción</th>
                            <th class="text-center">Cant.</th>
                            <th class="text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        productos.forEach(p => {
            html += `
                <tr>
                    <td>${this._escape(p.codigo) || '-'}</td>
                    <td>${this._escape(p.descripcion)}</td>
                    <td class="text-center"><strong>${p.cantidad}</strong></td>
                    <td class="text-right">$${p.totalVenta.toFixed(2)}</td>
                </tr>
            `;
        });

        html += `
                <tr style="background-color: #e8f4fd; font-weight: bold;">
                    <td colspan="2" class="text-right">TOTALES:</td>
                    <td class="text-center">${totalCantidad}</td>
                    <td class="text-right">$${totalGeneral.toFixed(2)}</td>
                </tr>
            </tbody>
        </table>
    </div>
        `;

        return html;
    }
};
