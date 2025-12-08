import { formatCurrency } from "../utils/formatters.js";

export class HistoryUI {
    constructor() {
        this.els = {
            container: document.getElementById("ventas-container"),
            emptyState: document.getElementById("empty-ventas"),
            modalEliminar: document.getElementById("modalEliminar"),
        };
    }

    renderList(grupos) {
        if (!grupos || Object.keys(grupos).length === 0) {
            this.els.container.innerHTML = "";
            this.els.emptyState.style.display = "block";
            return;
        }
        this.els.emptyState.style.display = "none";

        this.els.container.innerHTML = Object.entries(grupos)
            .map(([dia, items]) => `
                <div class="dia-group">
                    <div class="dia-header">
                        <div class="dia-titulo">${items[0].fechaLabel}</div>
                        <div class="dia-fecha">${dia}</div>
                    </div>
                <div class="ventas-dia-grid">
                    ${items.map(v => this._renderItem(v)).join("")}
                </div>
                </div>`
            ).join("");
    }

    _renderItem(v) {
        return `
            <div class="venta-item" onclick="window.toggleDetail('${v.id}')">
                <div class="venta-desc">${v.equipo} - ${v.cliente}</div>
                <div class="venta-cant">${v.cantidadTotal}</div>
                <div class="venta-precio">${formatCurrency(v.total)}</div>
                <div class="venta-subtotal">${formatCurrency(v.total)}</div>
                <div class="venta-tipo ${v.tipo === 'credito' ? 'credito' : ''}">${v.tipo}</div>
                <div class="venta-actions">
                    <button class="btn btn-warning" onclick="event.stopPropagation(); window.editarVenta('${v.id}')">Editar</button>
                    <button class="btn btn-danger"  onclick="event.stopPropagation(); window.abrirEliminar('${v.id}')">Eliminar</button>
                </div>
            </div>
            <div id="detail-${v.id}" class="venta-detail">
                <table>
                    <thead>
                        <tr><th>Producto</th><th>Cant</th><th>Precio</th><th>Subtotal</th></tr>
                    </thead>
                    <tbody>
                        ${v.items.map(i => `
                            <tr>
                                <td>${i.desc}</td>
                                <td>${i.cantidad}</td>
                                <td>${formatCurrency(i.precio)}</td>
                                <td>${formatCurrency(i.subtotal)}</td>
                            </tr>`).join("")}
                    </tbody>
                </table>
            </div>`;
    }

    showDeleteModal() {
        this.els.modalEliminar.style.display = "flex";
    }

    hideDeleteModal() {
        this.els.modalEliminar.style.display = "none";
    }

    toggleDetail(id) {
        const det = document.getElementById(`detail-${id}`);
        if (det) det.classList.toggle("show");
    }

    printHistory(ventas) {
        const ventana = window.open("", "_blank", "width=800,height=600");
        const fecha = new Date().toLocaleDateString("es-ES");

        let contenido = `
          <html>
            <head>
              <title>Historial de Ventas - Taller Wilian</title>
              <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #2c3e50; text-align: center; margin-bottom: 20px; }
                .fecha { text-align: center; color: #7f8c8d; margin-bottom: 30px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
                th { background-color: #2c3e50; color: white; }
                tr:nth-child(even) { background-color: #f8f9fa; }
                .total { font-weight: bold; text-align: right; margin-top: 20px; }
                .credito { background-color: #fff3cd; }
                @media print { body { margin: 0; } }
              </style>
            </head>
            <body>
              <h1>Taller Wilian - Historial de Ventas</h1>
              <div class="fecha">Reporte generado: ${fecha}</div>
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Equipo</th>
                    <th>Cliente</th>
                    <th>Productos</th>
                    <th>Tipo</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
        `;

        ventas.forEach(venta => {
            const fechaVenta = venta.fechaTimestamp ?
                new Date(venta.fechaTimestamp.seconds * 1000).toLocaleDateString("es-ES") :
                "Sin fecha";

            const productos = (venta.items || []).map(item =>
                `${item.desc} (x${item.cantidad})`
            ).join(", ");

            contenido += `
            <tr class="${venta.tipo === 'credito' ? 'credito' : ''}">
              <td>${fechaVenta}</td>
              <td>${venta.equipo}</td>
              <td>${venta.cliente}</td>
              <td>${productos}</td>
              <td>${venta.tipo}</td>
              <td>${formatCurrency(venta.total)}</td>
            </tr>
          `;
        });

        const totalGeneral = ventas.reduce((sum, venta) => sum + (venta.total || 0), 0);

        contenido += `
                </tbody>
              </table>
              <div class="total">Total General: ${formatCurrency(totalGeneral)}</div>
              <div class="total">Total de Ventas: ${ventas.length}</div>
            </body>
          </html>
        `;

        ventana.document.write(contenido);
        ventana.document.close();
        // Allow time for styles to load in new window? usually fast enough
        setTimeout(() => ventana.print(), 500);
    }
}
