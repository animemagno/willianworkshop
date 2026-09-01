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
    },

    numeroALetras(num) {
        const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
        const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
        const especiales = {
            11: 'ONCE', 12: 'DOCE', 13: 'TRECE', 14: 'CATORCE', 15: 'QUINCE',
            16: 'DIECISEIS', 17: 'DIECISIETE', 18: 'DIECIOCHO', 19: 'DIECINUEVE',
            21: 'VEINTIUNO', 22: 'VEINTIDOS', 23: 'VEINTITRES', 24: 'VEINTICUATRO',
            25: 'VEINTICINCO', 26: 'VEINTISEIS', 27: 'VEINTISIETE', 28: 'VEINTIOCHO',
            29: 'VEINTINUEVE'
        };
        const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SIETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

        function convertirGrupo(n) {
            let output = '';
            if (n === 100) return 'CIEN';
            const c = Math.floor(n / 100);
            const d = Math.floor((n % 100) / 10);
            const u = n % 10;

            if (c > 0) output += centenas[c] + ' ';
            
            const resto = n % 100;
            if (resto > 0) {
                if (resto in especiales) {
                    output += especiales[resto] + ' ';
                } else {
                    if (d > 0) {
                        output += decenas[d];
                        if (u > 0) output += ' Y ' + unidades[u];
                        output += ' ';
                    } else if (u > 0) {
                        output += unidades[u] + ' ';
                    }
                }
            }
            return output.trim();
        }

        if (num === 0) return 'SON: CERO DÓLARES';

        const parteEntera = Math.floor(num);
        const centavos = Math.round((num - parteEntera) * 100);

        let output = '';
        const millones = Math.floor(parteEntera / 1000000);
        const miles = Math.floor((parteEntera % 1000000) / 1000);
        const unidadesCentenas = parteEntera % 1000;

        if (millones > 0) {
            if (millones === 1) output += 'UN MILLÓN ';
            else output += convertirGrupo(millones) + ' MILLONES ';
        }

        if (miles > 0) {
            if (miles === 1) output += 'MIL ';
            else output += convertirGrupo(miles) + ' MIL ';
        }

        if (unidadesCentenas > 0) {
            output += convertirGrupo(unidadesCentenas) + ' ';
        }

        output = output.trim();
        if (output === 'UN') {
            const centsText = String(centavos).padStart(2, '0');
            return `SON: UN CON ${centsText}/100 DÓLARES`;
        }
        if (output === '') output = 'CERO';

        const centsText = String(centavos).padStart(2, '0');
        return `SON: ${output} CON ${centsText}/100 DÓLARES`;
    },

    printInvoiceRealForm(invData) {
        // Diagnóstico rápido en consola
        console.log("Printing service - invData:", invData);

        // Procesamiento de Fecha extremadamente robusto (soporta Timestamp, Date, string YYYY-MM-DD, DD/MM/YYYY, etc.)
        let dayStr = '';
        let monthStr = '';
        let yearStr = '';
        
        const fechaVal = invData.fecha;
        if (fechaVal) {
            let dateObj = null;
            if (typeof fechaVal === 'object') {
                if (typeof fechaVal.toDate === 'function') {
                    dateObj = fechaVal.toDate();
                } else if (fechaVal.seconds) {
                    dateObj = new Date(fechaVal.seconds * 1000);
                } else if (fechaVal instanceof Date) {
                    dateObj = fechaVal;
                }
            } else if (typeof fechaVal === 'string') {
                const cleanFecha = fechaVal.trim();
                if (cleanFecha.includes('-')) {
                    const parts = cleanFecha.split('-');
                    if (parts[0].length === 4) { // YYYY-MM-DD
                        dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
                    } else { // DD-MM-YYYY o similar
                        dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
                    }
                } else if (cleanFecha.includes('/')) {
                    const parts = cleanFecha.split('/');
                    if (parts[2] && parts[2].length === 4) { // DD/MM/YYYY
                        dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
                    } else if (parts[0] && parts[0].length === 4) { // YYYY/MM/DD
                        dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
                    }
                } else {
                    const parsed = new Date(cleanFecha);
                    if (!isNaN(parsed.getTime())) {
                        dateObj = parsed;
                    }
                }
            }
            
            if (dateObj && !isNaN(dateObj.getTime())) {
                dayStr = String(dateObj.getDate()).padStart(2, '0');
                monthStr = String(dateObj.getMonth() + 1).padStart(2, '0');
                yearStr = String(dateObj.getFullYear()).substring(2, 4);
            }
        }

        // Datos del Cliente y Factura con fallbacks
        const clientName = invData.CLIENTE || invData.cliente || 'Cliente General';
        const invoiceNumber = invData.numeroFactura || invData.factura || 'S/N';
        
        // Mapeo e interpolación de items
        let itemsHTML = '';
        const items = invData.items || [];
        for (let i = 0; i < 14; i++) {
            const item = items[i];
            // Posicionamiento vertical en milímetros (mm): empieza en 87.4mm y avanza 6.0mm por renglón
            const topPos = 87.4 + (i * 6.0);
            if (item) {
                const desc = item.descripcionPapel || item.producto || item.descripcion || 'Repuesto';
                
                const cantVal = parseFloat(item.cantidad !== undefined ? item.cantidad : item.cant);
                const priceVal = parseFloat(item.precioUnitario !== undefined ? item.precioUnitario : item.precio);
                const totalVal = item.total !== undefined ? parseFloat(item.total) : (isNaN(cantVal) || isNaN(priceVal) ? 0 : cantVal * priceVal);
                
                const cantStr = isNaN(cantVal) ? '' : String(cantVal);
                const priceStr = isNaN(priceVal) ? '' : priceVal.toFixed(2);
                const totalStr = isNaN(totalVal) ? '' : totalVal.toFixed(2);
                
                itemsHTML += `
                    <div class="invoice-field text-center" style="top: ${topPos}mm; left: 0.0mm; width: 10.0mm;">${cantStr}</div>
                    <div class="invoice-field text-left" style="top: ${topPos}mm; left: 12.0mm; width: 43.0mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${PrintingService._escape(desc)}</div>
                    <div class="invoice-field text-right" style="top: ${topPos}mm; left: 56.0mm; width: 12.0mm;">${priceStr ? '$' + priceStr : ''}</div>
                    <div class="invoice-field text-right" style="top: ${topPos}mm; left: 70.0mm; width: 15.0mm;">${totalStr ? '$' + totalStr : ''}</div>
                `;
            }
        }

        // Calcular el monto total
        let totalAmount = invData.total;
        if (totalAmount === undefined || totalAmount === null) {
            totalAmount = items.reduce((sum, it) => {
                const c = parseFloat(it.cantidad !== undefined ? it.cantidad : it.cant) || 0;
                const p = parseFloat(it.precioUnitario !== undefined ? it.precioUnitario : it.precio) || 0;
                return sum + (c * p);
            }, 0);
        }
        totalAmount = parseFloat(totalAmount) || 0;
        const totalInWords = PrintingService.numeroALetras(totalAmount);

        // Abrir la ventana de impresión
        const printWindow = window.open('', '_blank', 'width=850,height=1100');
        if (!printWindow) {
            alert("Error: El navegador bloqueó la ventana emergente de impresión. Por favor habilite los popups en la barra de direcciones.");
            return;
        }

        // Calibración mm guardada en el cliente
        let offsetX = parseFloat(localStorage.getItem('workshop_invoice_offset_x') || '0');
        if (isNaN(offsetX)) offsetX = 0;
        let offsetY = parseFloat(localStorage.getItem('workshop_invoice_offset_y') || '0');
        if (isNaN(offsetY)) offsetY = 0;
        const showGuide = localStorage.getItem('workshop_invoice_show_guide') === 'true';

        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Factura #${PrintingService._escape(invoiceNumber)} - Imprimir</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                    background: #f0f2f5;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                
                /* Barra de herramientas flotante superior */
                .no-print.toolbar {
                    background: rgba(44, 62, 80, 0.95);
                    color: white;
                    padding: 10px 20px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.15);
                    border-bottom: 2px solid #3498db;
                    position: sticky;
                    top: 0;
                    z-index: 1000;
                }
                .toolbar-title {
                    font-size: 1rem;
                    font-weight: bold;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .toolbar-controls {
                    display: flex;
                    align-items: center;
                    gap: 15px;
                }
                .btn {
                    padding: 8px 16px;
                    border: none;
                    border-radius: 4px;
                    font-weight: bold;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    font-family: inherit;
                    transition: background 0.2s;
                }
                .btn-primary {
                    background: #3498db;
                    color: white;
                }
                .btn-primary:hover {
                    background: #2980b9;
                }
                .btn-success {
                    background: #2ecc71;
                    color: white;
                }
                .btn-success:hover {
                    background: #27ae60;
                }
                .btn-secondary {
                    background: #7f8c8d;
                    color: white;
                }
                .btn-secondary:hover {
                    background: #95a5a6;
                }
                .toggle-container {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    cursor: pointer;
                    font-size: 0.9rem;
                    user-select: none;
                }
                .toggle-container input {
                    cursor: pointer;
                }
                .input-group {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.9rem;
                }
                .input-group input {
                    width: 50px;
                    padding: 5px;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    text-align: center;
                    font-family: inherit;
                }
                
                /* Estilos de visualización en pantalla */
                @media screen {
                    body {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        padding-bottom: 50px;
                    }
                    #page-container {
                        box-shadow: 0 8px 25px rgba(0,0,0,0.25);
                        border: 1px solid #ccc;
                        margin-top: 30px;
                        background: white;
                    }
                }
                
                /* Hoja Media Carta (Statement) física */
                #page-container {
                    width: 139.7mm;
                    height: 215.9mm;
                    position: relative;
                    box-sizing: border-box;
                    overflow: hidden;
                }
                
                #page-container.show-guide {
                    background-image: url('scan0001.jpg');
                    background-size: 100% 100%;
                    background-repeat: no-repeat;
                }
                
                #print-content {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 139.7mm;
                    height: 215.9mm;
                    box-sizing: border-box;
                }
                
                /* Campos de factura posicionados absolutamente con alto contraste */
                .invoice-field {
                    position: absolute;
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 13px;
                    font-weight: normal;
                    letter-spacing: 0.5px;
                    color: #000000;
                    line-height: 1.1;
                    box-sizing: border-box;
                }
                
                .text-center {
                    text-align: center;
                }
                .text-left {
                    text-align: left;
                }
                .text-right {
                    text-align: right;
                }
                
                /* Ocultar barra al imprimir */
                @media print {
                    .no-print {
                        display: none !important;
                    }
                    html, body {
                        background: none !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        width: 139.7mm !important;
                        height: 215.9mm !important;
                        overflow: hidden !important;
                        display: block !important;
                    }
                    #page-container {
                        border: none !important;
                        box-shadow: none !important;
                        background-image: none !important; /* Jamás imprimir el fondo guía */
                        width: 139.7mm !important;
                        height: 215.9mm !important;
                        position: absolute !important;
                        top: 0 !important;
                        left: 0 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: hidden !important;
                        box-sizing: border-box !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    @page {
                        size: 139.7mm 215.9mm;
                        margin: 0 !important;
                    }
                }
            </style>
        </head>
        <body>
            <div class="no-print toolbar">
                <div class="toolbar-title">
                    <i class="fas fa-cog"></i> Calibrar e Imprimir Factura (Media Carta)
                </div>
                <div class="toolbar-controls">
                    <button class="btn btn-primary" onclick="window.print()"><i class="fas fa-print"></i> Imprimir</button>
                    <label class="toggle-container">
                        <input type="checkbox" id="toggle-guide" ${showGuide ? 'checked' : ''} onchange="toggleGuide(this.checked)">
                        <span>Mostrar Guía Física</span>
                    </label>
                    <div class="input-group">
                        <label>Despl. Vertical (Y):</label>
                        <input type="number" id="offset-y" step="0.5" value="${offsetY}" oninput="updateOffsets()">
                        <span>mm</span>
                    </div>
                    <div class="input-group">
                        <label>Despl. Horizontal (X):</label>
                        <input type="number" id="offset-x" step="0.5" value="${offsetX}" oninput="updateOffsets()">
                        <span>mm</span>
                    </div>
                    <button class="btn btn-success" onclick="saveOffsets()"><i class="fas fa-save"></i> Guardar Ajustes</button>
                    <button class="btn btn-secondary" onclick="resetOffsets()"><i class="fas fa-undo"></i> Restablecer</button>
                    <button class="btn btn-secondary" onclick="window.close()"><i class="fas fa-times"></i> Cerrar</button>
                </div>
            </div>
            
            <div id="page-container" class="${showGuide ? 'show-guide' : ''}">
                <div id="print-content" style="transform: translate(${offsetX}mm, ${offsetY}mm);">
                    
                    <!-- Fecha: DÍA, MES, AÑO -->
                    <div class="invoice-field text-center" style="top: 49.2mm; left: 55.0mm; width: 8.4mm;">${dayStr}</div>
                    <div class="invoice-field text-center" style="top: 49.2mm; left: 65.0mm; width: 8.4mm;">${monthStr}</div>
                    <div class="invoice-field text-center" style="top: 49.2mm; left: 75.0mm; width: 8.4mm;">${yearStr}</div>
                    
                    <!-- Datos de Cliente -->
                    <div class="invoice-field text-left" style="top: 58.7mm; left: 10.0mm; width: 75.0mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${PrintingService._escape(clientName)}</div>
                    
                    <!-- Dirección (Si existiera, sino vacío para escritura manual) -->
                    <div class="invoice-field text-left" style="top: 65.8mm; left: 10.0mm; width: 75.0mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${PrintingService._escape(invData.direccion || '')}</div>
                    
                    <!-- DUI o NIT -->
                    <div class="invoice-field text-left" style="top: 73.4mm; left: 10.0mm; width: 35.0mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${PrintingService._escape(invData.dui || invData.nit || '')}</div>
                    
                    <!-- Venta a Cuenta de -->
                    <div class="invoice-field text-left" style="top: 73.4mm; left: 50.0mm; width: 35.0mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${PrintingService._escape(invData.ventaACuentaDe || '')}</div>
                    
                    <!-- Items de la tabla -->
                    ${itemsHTML}
                    
                    <!-- Sección de Totales inferior -->
                    <div class="invoice-field text-left" style="top: 177.0mm; left: 10.0mm; width: 55.0mm; font-size: 11px; line-height: 1.1;">${PrintingService._escape(totalInWords)}</div>
                    <div class="invoice-field text-right" style="top: 177.0mm; left: 70.0mm; width: 15.0mm;">$${totalAmount.toFixed(2)}</div>
                    <div class="invoice-field text-right" style="top: 200.0mm; left: 70.0mm; width: 15.0mm;">$${totalAmount.toFixed(2)}</div>
                    
                </div>
            </div>

            <script>
                function updateOffsets() {
                    const x = parseFloat(document.getElementById('offset-x').value) || 0;
                    const y = parseFloat(document.getElementById('offset-y').value) || 0;
                    document.getElementById('print-content').style.transform = 'translate(' + x + 'mm, ' + y + 'mm)';
                }
                function toggleGuide(checked) {
                    const page = document.getElementById('page-container');
                    if (checked) {
                        page.classList.add('show-guide');
                    } else {
                        page.classList.remove('show-guide');
                    }
                }
                function saveOffsets() {
                    const x = parseFloat(document.getElementById('offset-x').value) || 0;
                    const y = parseFloat(document.getElementById('offset-y').value) || 0;
                    const checked = document.getElementById('toggle-guide').checked;
                    localStorage.setItem('workshop_invoice_offset_x', x);
                    localStorage.setItem('workshop_invoice_offset_y', y);
                    localStorage.setItem('workshop_invoice_show_guide', checked);
                    alert('Ajustes de calibración guardados exitosamente.');
                }
                function resetOffsets() {
                    document.getElementById('offset-x').value = 0;
                    document.getElementById('offset-y').value = 0;
                    updateOffsets();
                    localStorage.setItem('workshop_invoice_offset_x', 0);
                    localStorage.setItem('workshop_invoice_offset_y', 0);
                    alert('Desplazamiento restablecido a 0.');
                }
            </script>
        </body>
        </html>
        `;

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
    }
};
