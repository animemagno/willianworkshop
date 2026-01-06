const PrintingService = {
    _escape(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    printCurrentHistorial() {
        // Obtenemos los movimientos SIN referencia directa a la UI si es posible, 
        // pero aquí dependemos de AppState que es el estado global.
        const movimientos = AppState.filteredHistorial || AppState.historial;
        const titulo = AppState.currentFilter === 'today' ? 'Historial del Día' : 'Historial de Movimientos';

        let totalContado = 0;
        let totalPendiente = 0;
        let totalAbonos = 0;
        let totalRetiros = 0;
        let totalIngresos = 0;
        let ventasContado = 0;
        let ventasPendiente = 0;
        let ventasConAbonos = 0;
        let cantidadRetiros = 0;
        let cantidadIngresos = 0;
        let cantidadAbonos = 0;

        movimientos.forEach(movimiento => {
            if (movimiento.tipo === 'retiro') {
                totalRetiros += movimiento.monto || 0;
                cantidadRetiros++;
            } else if (movimiento.tipo === 'ingreso') {
                totalIngresos += movimiento.monto || 0;
                cantidadIngresos++;
            } else if (movimiento.tipo === 'abono') {
                totalAbonos += movimiento.monto || 0;
                cantidadAbonos++;
            } else if (movimiento.tipo === 'venta') {
                if (movimiento.paymentType === 'contado') {
                    totalContado += movimiento.total || 0;
                    ventasContado++;
                } else {
                    totalPendiente += movimiento.total || 0;
                    ventasPendiente++;

                    if (movimiento.abonos && movimiento.abonos.length > 0) {
                        ventasConAbonos++;
                        movimiento.abonos.forEach(abono => {
                            totalAbonos += abono.monto;
                        });
                    }
                }
            }
        });

        const fechaActual = DateUtils.getCurrentTimestampElSalvador().toLocaleDateString('es-ES');
        const printWindow = window.open('', '_blank', 'width=800,height=600');

        let reportHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>${this._escape(titulo)}</title>
                <style>
                    body { 
                        font-family: 'Arial', sans-serif; 
                        font-size: 12px; 
                        margin: 0;
                        padding: 15px;
                        color: #000;
                    }
                    .header { 
                        text-align: center; 
                        margin-bottom: 20px;
                        border-bottom: 2px solid #333;
                        padding-bottom: 10px;
                    }
                    .header h1 {
                        font-size: 24px;
                        margin: 10px 0;
                        color: #2c3e50;
                    }
                    .header h2 {
                        font-size: 18px;
                        margin: 8px 0;
                        color: #34495e;
                    }
                    .header h3 {
                        font-size: 14px;
                        margin: 5px 0;
                        color: #7f8c8d;
                    }
                    .table-container {
                        width: 100%;
                        margin-bottom: 20px;
                    }
                    .ventas-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 15px 0;
                        font-size: 11px;
                    }
                    .ventas-table th {
                        background: #2c3e50;
                        color: white;
                        padding: 10px 8px;
                        text-align: left;
                        font-weight: bold;
                        border: 1px solid #34495e;
                    }
                    .ventas-table td {
                        padding: 8px;
                        border: 1px solid #ddd;
                        vertical-align: top;
                    }
                    .ventas-table tr:nth-child(even) {
                        background: #f8f9fa;
                    }
                    .producto-item {
                        padding: 2px 0;
                        font-size: 10px;
                    }
                    .contado-badge {
                        background: #27ae60;
                        color: white;
                        padding: 3px 6px;
                        border-radius: 3px;
                        font-size: 9px;
                        font-weight: bold;
                    }
                    .pendiente-badge {
                        background: #f39c12;
                        color: white;
                        padding: 3px 6px;
                        border-radius: 3px;
                        font-size: 9px;
                        font-weight: bold;
                    }
                    .retiro-badge {
                        background: #e74c3c;
                        color: white;
                        padding: 3px 6px;
                        border-radius: 3px;
                        font-size: 9px;
                        font-weight: bold;
                    }
                    .ingreso-badge {
                        background: #27ae60;
                        color: white;
                        padding: 3px 6px;
                        border-radius: 3px;
                        font-size: 9px;
                        font-weight: bold;
                    }
                    .abono-badge {
                        background: #2ecc71;
                        color: white;
                        padding: 3px 6px;
                        border-radius: 3px;
                        font-size: 9px;
                        font-weight: bold;
                    }
                    .resumen-section {
                        margin-top: 25px;
                        padding: 15px;
                        background: #e8f4fd;
                        border-radius: 8px;
                        border: 1px solid #b8daff;
                    }
                    .resumen-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr 1fr 1fr;
                        gap: 15px;
                        margin-top: 10px;
                    }
                    .resumen-item {
                        text-align: center;
                        padding: 10px;
                        background: white;
                        border-radius: 6px;
                        border: 1px solid #dee2e6;
                    }
                    .resumen-valor {
                        font-size: 18px;
                        font-weight: bold;
                        color: #2c3e50;
                        margin-top: 5px;
                    }
                    .page-break {
                        page-break-before: always;
                    }
                    @page {
                        size: A4 portrait;
                        margin: 1.5cm 1cm;
                    }
                    .footer {
                        text-align: center;
                        margin-top: 20px;
                        padding-top: 10px;
                        border-top: 1px solid #ddd;
                        font-size: 10px;
                        color: #7f8c8d;
                    }
                    .movimiento-card {
                        margin-bottom: 15px;
                        border: 1px solid #ddd;
                        border-radius: 6px;
                        overflow: hidden;
                        page-break-inside: avoid;
                    }
                    .movimiento-header {
                        background: #f8f9fa;
                        padding: 10px 12px;
                        border-bottom: 1px solid #ddd;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .productos-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 10px;
                    }
                    .productos-table th {
                        background: #ecf0f1;
                        padding: 6px 8px;
                        text-align: left;
                        font-weight: bold;
                        border-bottom: 2px solid #bdc3c7;
                    }
                    .productos-table td {
                        padding: 5px 8px;
                        border-bottom: 1px solid #ecf0f1;
                    }
                    .productos-table tr:last-child td {
                        border-bottom: none;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>TALLER WILIAN</h1>
                    <h2>HISTORIAL DE MOVIMIENTOS ${fechaActual}</h2>
                </div>
        `;

        movimientos.forEach((movimiento) => {
            const fecha = movimiento.timestamp ? new Date(movimiento.timestamp.toDate ? movimiento.timestamp.toDate() : movimiento.timestamp).toLocaleString('es-ES') : 'N/A';

            if (movimiento.tipo === 'retiro') {
                const tipoBadge = 'retiro-badge';
                const tipoText = 'RETIRO';
                const color = '#e74c3c';

                reportHTML += `
                    <div class="movimiento-card" style="border-left: 4px solid ${color};">
                        <div class="movimiento-header" style="background: white;">
                            <div>
                                <strong>${tipoText}</strong> - ${this._escape(movimiento.concepto) || 'Sin concepto'}
                                <br><span style="font-size: 9px; color: #666;">${fecha}</span>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 14px; font-weight: bold; color: ${color};">
                                    -$${movimiento.monto.toFixed(2)}
                                </div>
                                <span class="${tipoBadge}">${tipoText}</span>
                            </div>
                        </div>
                    </div>
                `;
            } else if (movimiento.tipo === 'ingreso') {
                const tipoBadge = 'ingreso-badge';
                const tipoText = 'INGRESO';
                const color = '#27ae60';

                reportHTML += `
                    <div class="movimiento-card" style="border-left: 4px solid ${color};">
                        <div class="movimiento-header" style="background: white;">
                            <div>
                                <strong>${tipoText}</strong> - ${this._escape(movimiento.concepto) || 'Sin concepto'}
                                <br><span style="font-size: 9px; color: #666;">${fecha}</span>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 14px; font-weight: bold; color: ${color};">
                                    +$${movimiento.monto.toFixed(2)}
                                </div>
                                <span class="${tipoBadge}">${tipoText}</span>
                            </div>
                        </div>
                    </div>
                `;
            } else if (movimiento.tipo === 'abono') {
                const tipoBadge = 'abono-badge';
                const tipoText = 'ABONO';
                const color = '#2ecc71';

                reportHTML += `
                    <div class="movimiento-card" style="border-left: 4px solid ${color};">
                        <div class="movimiento-header" style="background: white;">
                            <div>
                                <strong>${tipoText}</strong> - ${this._escape(movimiento.concepto) || 'Abono a cuenta'}
                                <br><span style="font-size: 9px; color: #666;">${fecha}</span>
                                <br><span style="font-size: 10px;">Cliente: ${this._escape(movimiento.clientName) || 'General'} (Eq: ${this._escape(movimiento.equipoNumber) || '-'})</span>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 14px; font-weight: bold; color: ${color};">
                                    +$${(movimiento.monto || 0).toFixed(2)}
                                </div>
                                <span class="${tipoBadge}">${tipoText}</span>
                            </div>
                        </div>
                    </div>
                `;
            } else if (movimiento.tipo === 'venta') {
                const venta = movimiento;
                const tipoBadge = venta.paymentType === 'contado' ? 'contado-badge' : 'pendiente-badge';
                const tipoText = venta.paymentType === 'contado' ? 'CONTADO' : 'PENDIENTE';

                let productosRows = '';
                if (venta.products && venta.products.length > 0) {
                    venta.products.forEach(producto => {
                        productosRows += `
                            <tr>
                                <td width="10%" style="text-align: center;">${producto.cantidad}</td>
                                <td width="50%">${this._escape(producto.descripcion)}</td>
                                <td width="20%" style="text-align: right;">$${producto.precio.toFixed(2)}</td>
                                <td width="20%" style="text-align: right;">$${(producto.precio * producto.cantidad).toFixed(2)}</td>
                            </tr>
                        `;
                    });
                } else {
                    productosRows = '<tr><td colspan="4" style="text-align: center; color: #999;">Sin productos registrados</td></tr>';
                }

                reportHTML += `
                    <div class="movimiento-card">
                        <div class="movimiento-header">
                            <div>
                                <strong>Factura #${this._escape(venta.invoiceNumber) || 'N/A'}</strong> - Equipo: ${this._escape(venta.equipoNumber) || 'N/A'}
                                <br><span style="font-size: 9px; color: #666;">${fecha} - ${this._escape(venta.clientName) || 'Cliente'}</span>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 14px; font-weight: bold;">$${(venta.total || 0).toFixed(2)}</div>
                                <span class="${tipoBadge}">${tipoText}</span>
                            </div>
                        </div>
                        <div style="padding: 5px 10px;">
                            <table class="productos-table">
                                <thead>
                                    <tr>
                                        <th width="10%" style="text-align: center;">Cant.</th>
                                        <th width="50%">Descripción</th>
                                        <th width="20%">Precio</th>
                                        <th width="20%" style="text-align: right;">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${productosRows}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }
        });

        let abonosHTML = '';
        const ventasConAbonosList = movimientos.filter(mov =>
            mov.tipo === 'venta' && mov.abonos && mov.abonos.length > 0
        );

        if (ventasConAbonosList.length > 0) {
            abonosHTML += `
                <div class="page-break"></div>
                <div class="header">
                    <h2>HISTORIAL DE ABONOS ${fechaActual}</h2>
                </div>
                <div class="table-container">
                    <table class="ventas-table">
                        <thead>
                            <tr>
                                <th width="15%">Fecha</th>
                                <th width="10%">Equipo</th>
                                <th width="15%">Total</th>
                                <th width="15%">Abono</th>
                                <th width="15%">Saldo</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            ventasConAbonosList.forEach(venta => {
                const saldoPendiente = venta.saldoPendiente !== undefined ? venta.saldoPendiente : venta.total;
                const totalAbonado = venta.abonos.reduce((sum, abono) => sum + abono.monto, 0);

                abonosHTML += `
                    <tr>
                        <td>${new Date(venta.timestamp.toDate ? venta.timestamp.toDate() : venta.timestamp).toLocaleDateString('es-ES')}</td>
                        <td>${this._escape(venta.equipoNumber) || 'N/A'}</td>
                        <td>$${venta.total.toFixed(2)}</td>
                        <td>$${totalAbonado.toFixed(2)}</td>
                        <td>$${saldoPendiente.toFixed(2)}</td>
                    </tr>
                `;
            });

            abonosHTML += `</tbody></table></div>`;
        }

        reportHTML += abonosHTML;

        const flujoNeto = totalContado + totalAbonos + totalIngresos - totalRetiros;
        reportHTML += `
            <div class="resumen-section">
                <h3 style="margin: 0 0 15px 0; text-align: center; color: #2c3e50;">RESUMEN</h3>
                <div class="resumen-grid">
                    <div class="resumen-item">
                        <div>VENTAS AL CONTADO</div>
                        <div class="resumen-valor">$${totalContado.toFixed(2)}</div>
                        <div style="font-size: 10px; color: #666;">${ventasContado} ventas</div>
                    </div>
                    <div class="resumen-item">
                        <div>TOTAL ABONOS</div>
                        <div class="resumen-valor" style="color: #2ecc71;">$${totalAbonos.toFixed(2)}</div>
                        <div style="font-size: 10px; color: #666;">${cantidadAbonos + ventasConAbonos} transacciones</div>
                    </div>
                    <div class="resumen-item">
                        <div>INGRESOS</div>
                        <div class="resumen-valor" style="color: #27ae60;">+$${totalIngresos.toFixed(2)}</div>
                        <div style="font-size: 10px; color: #666;">${cantidadIngresos} ingresos</div>
                    </div>
                    <div class="resumen-item">
                        <div>RETIROS</div>
                        <div class="resumen-valor" style="color: #e74c3c;">-$${totalRetiros.toFixed(2)}</div>
                        <div style="font-size: 10px; color: #666;">${cantidadRetiros} retiros</div>
                    </div>
                </div>
                <div style="margin-top: 20px; padding: 15px; background: #2c3e50; color: white; border-radius: 6px; text-align: center;">
                    <div style="font-size: 14px; margin-bottom: 5px;">FLUJO NETO DE CAJA</div>
                    <div style="font-size: 24px; font-weight: bold;">${flujoNeto >= 0 ? '+' : ''}$${flujoNeto.toFixed(2)}</div>
                    <div style="font-size: 11px; margin-top: 5px; opacity: 0.8;">Ventas + Abonos + Ingresos - Retiros</div>
                </div>
            </div>
            
            <div class="footer">
                <div>Documento generado automáticamente por el Sistema de Ventas Taller Wilian</div>
                <div>Fecha de impresión: ${DateUtils.getCurrentTimestampElSalvador().toLocaleString('es-ES')}</div>
            </div>
        `;

        reportHTML += `</body></html>`;

        printWindow.document.open();
        printWindow.document.write(reportHTML);
        printWindow.document.close();

        printWindow.focus();

        printWindow.onload = function () {
            setTimeout(() => {
                printWindow.print();
                UIService.showStatus("Historial enviado a impresión", "success");
            }, 500);
        };

        if (printWindow.document.readyState === 'complete') {
            printWindow.onload();
        }
    },

    printTicket(saleData) {
        const printWindow = window.open('', '_blank', 'width=300,height=600');
        const fecha = saleData.timestamp ? new Date(saleData.timestamp.toDate ? saleData.timestamp.toDate() : saleData.timestamp) : DateUtils.getCurrentTimestampElSalvador();
        const fechaFormateada = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });

        const saldoPendiente = saleData.saldoPendiente !== undefined ? saleData.saldoPendiente : saleData.total;
        const tieneAbonos = saleData.abonos && saleData.abonos.length > 0;
        const tipoPago = saleData.paymentType === 'pendiente' ? 'PENDIENTE' : 'CONTADO';

        let abonosHTML = '';
        if (tieneAbonos) {
            saleData.abonos.forEach(abono => {
                const fechaAbono = abono.fecha ? new Date(abono.fecha.toDate ? abono.fecha.toDate() : abono.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 'N/A';
                abonosHTML += `
                    <div style="display: flex; justify-content: space-between; font-size: 20px; margin: 2px 0;">
                        <div>ABONO: $${abono.monto.toFixed(2)} (${fechaAbono})</div>
                    </div>
                `;
            });
        }

        let productosHTML = '';
        if (saleData.products && saleData.products.length > 0) {
            saleData.products.forEach(producto => {
                const descripcion = producto.descripcion.length > 25 ? producto.descripcion.substring(0, 25) + '...' : producto.descripcion;
                productosHTML += `
                    <div style="margin: 4px 0;">
                        <div style="font-size: 16px;">• ${this._escape(descripcion)}</div>
                        <div style="display: flex; justify-content: space-between; font-size: 18px;">
                            <div>x${producto.cantidad}</div>
                            <div>$${(producto.precio * producto.cantidad).toFixed(2)}</div>
                        </div>
                    </div>
                    <div style="border-bottom: 1px dotted #000; margin: 2px 0;"></div>
                `;
            });
        }

        const contenido = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Ticket #${this._escape(saleData.invoiceNumber)}</title>
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
                    <div class="small-text">Factura: ${this._escape(saleData.invoiceNumber)}</div>
                    <div class="small-text">${fechaFormateada}, ${tipoPago}</div>
                </div>
                
                <div class="line"></div>
                
                ${saleData.clientName !== saleData.equipoNumber ? `
                    <div class="medium-text">
                        <strong>Grupo:</strong> ${this._escape(saleData.clientName)}
                    </div>
                ` : ''}
                <div class="equipo-text" style="text-align: center;">
                    ${this._escape(saleData.equipoNumber)}
                </div>
                
                <div class="line"></div>
                
                <div style="margin: 8px 0;">
                    ${productosHTML}
                </div>
                
                <div class="line"></div>
                
                <div class="total large-text">
                    TOTAL: $${saleData.total.toFixed(2)}
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
                `;

        printWindow.document.open();
        printWindow.document.write(contenido);
        printWindow.document.close();
        printWindow.focus();

        printWindow.onload = function () {
            setTimeout(() => {
                printWindow.print();
                printWindow.onafterprint = function () {
                    printWindow.close(); // Cerrar solo después de imprimir
                };
            }, 500);
        };

        // Fallback
        if (printWindow.document.readyState === 'complete') {
            printWindow.onload();
        }
    },

    printAbonoTicket(venta, abonoData, nuevoSaldo) {
        const printWindow = window.open('', '_blank', 'width=300,height=600');
        const fechaAbono = abonoData.fecha ? new Date(abonoData.fecha.toDate ? abonoData.fecha.toDate() : abonoData.fecha) : DateUtils.getCurrentTimestampElSalvador();
        const fechaFormateada = fechaAbono.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Abono #${this._escape(venta.invoiceNumber)}</title>
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
                    .abono-detail { 
                        margin: 8px 0;
                        font-size: 20px;
                    }
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
                    <div class="small-text">COMPROBANTE DE ABONO</div>
                    <div class="small-text">${fechaFormateada}</div>
                </div>
                
                <div class="line"></div>
                
                <div class="medium-text">
                    <strong>Factura:</strong> ${this._escape(venta.invoiceNumber)}<br>
                    ${venta.clientName !== venta.equipoNumber ? `<strong>Grupo:</strong> ${this._escape(venta.clientName)}` : ''}
                </div>
                <div class="equipo-text" style="text-align: center;">
                    ${this._escape(venta.equipoNumber)}
                </div>
                
                <div class="line"></div>
                
                <div class="abono-detail">
                    <div style="text-align: center; font-size: 24px; margin: 10px 0;">
                        MONTO DEL ABONO
                    </div>
                    <div style="text-align: center; font-size: 28px; font-weight: bold;">
                        $${abonoData.monto.toFixed(2)}
                    </div>
                </div>

                <div class="saldo-info">
                    <div>SALDO ANTERIOR: $${(venta.saldoPendiente || venta.total).toFixed(2)}</div>
                    <div>NUEVO SALDO: $${nuevoSaldo.toFixed(2)}</div>
                </div>
                
                <div class="thank-you">
                    GRACIAS POR PREFERIRNOS
                </div>
            </body>
            </html>
                `);

        printWindow.document.close();
        printWindow.focus();

        printWindow.onload = function () {
            setTimeout(() => {
                printWindow.print();
                printWindow.onafterprint = function () {
                    printWindow.close();
                };
            }, 500);
        };

        if (printWindow.document.readyState === 'complete') {
            printWindow.onload();
        }
    },

    printRetiroTicket(retiroData) {
        const printWindow = window.open('', '_blank', 'width=300,height=600');
        const fecha = retiroData.timestamp ? new Date(retiroData.timestamp.toDate ? retiroData.timestamp.toDate() : retiroData.timestamp) : DateUtils.getCurrentTimestampElSalvador();
        const fechaFormateada = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });

        const categoriaText = {
            'compra': 'Compra de materiales',
            'gastos': 'Gastos operativos',
            'herramientas': 'Herramientas',
            'otros': 'Otros'
        }[retiroData.categoria] || retiroData.categoria;

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Retiro de Fondos</title>
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
                    .retiro-detail { 
                        margin: 8px 0;
                        font-size: 20px;
                    }
                    .total { font-weight: bold; text-align: center; margin-top: 12px; font-size: 24px; }
                    .footer { text-align: center; margin-top: 12px; font-size: 18px; font-weight: bold; }
                    .small-text { font-size: 18px; }
                    .medium-text { font-size: 20px; }
                    .large-text { font-size: 26px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h3 style="margin: 2px 0; font-size: 26px;">TALLER WILLIAN</h3>
                    <div class="small-text">COMPROBANTE DE RETIRO</div>
                    <div class="small-text">${fechaFormateada}</div>
                </div>
                
                <div class="line"></div>
                
                <div class="medium-text">
                    <strong>Concepto:</strong><br>
                    ${this._escape(retiroData.concepto) || 'Sin descripción'}
                </div>
                
                <div class="medium-text" style="margin-top: 5px;">
                    <strong>Categoría:</strong> ${categoriaText}
                </div>
                
                <div class="line"></div>
                
                <div class="retiro-detail">
                    <div style="text-align: center; font-size: 24px; margin: 10px 0;">
                        MONTO RETIRADO
                    </div>
                    <div style="text-align: center; font-size: 28px; font-weight: bold;">
                        $${Math.abs(retiroData.monto).toFixed(2)}
                    </div>
                </div>
                
                <div class="line"></div>
                
                <div class="footer">
                    Firma de Responsable
                    <br><br><br>
                    _____________________
                </div>
            </body>
            </html>
                `);

        printWindow.document.close();
        printWindow.focus();

        printWindow.onload = function () {
            setTimeout(() => {
                printWindow.print();
                printWindow.onafterprint = function () {
                    printWindow.close();
                };
            }, 500);
        };

        if (printWindow.document.readyState === 'complete') {
            printWindow.onload();
        }
    }
};
