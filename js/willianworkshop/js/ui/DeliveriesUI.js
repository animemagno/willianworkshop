export class DeliveriesUI {
    constructor() {
        this.els = {
            tbody: document.getElementById('entregas-body'),
            searchInput: document.getElementById('buscar-entrega'),
            addBtn: document.getElementById('nueva-entrega-btn')
        };
    }

    render(entregas) {
        if (!entregas || entregas.length === 0) {
            this.els.tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-cart">
                        <i class="fas fa-truck" style="font-size:2rem;margin-bottom:10px;opacity:.5;"></i>
                        <div>No hay entregas registradas</div>
                    </td>
                </tr>
            `;
            return;
        }

        this.els.tbody.innerHTML = entregas.map(e => {
            const estadoClass = `estado-${e.estado?.toLowerCase() || 'pendiente'}`;
            return `
            <tr>
                <td>#${e.id.slice(0, 6)}</td>
                <td>${e.cliente || 'Consumidor Final'}</td>
                <td>${e.equipo || '-'}</td>
                <td>${e.fecha || new Date().toLocaleDateString()}</td>
                <td><span class="${estadoClass}">${e.estado || 'Pendiente'}</span></td>
                <td>
                    <button class="icon-btn btn-info" onclick="window.imprimirEntrega('${e.id}')" title="Imprimir Recibo"><i class="fas fa-print"></i></button>
                    <button class="icon-btn btn-complete" onclick="window.cambiarEstado('${e.id}', 'Entregado')" title="Marcar Entregado"><i class="fas fa-check"></i></button>
                    ${e.estado !== 'Cancelado' ? `<button class="icon-btn btn-delete" onclick="window.cambiarEstado('${e.id}', 'Cancelado')" title="Cancelar"><i class="fas fa-times"></i></button>` : ''}
                    <button class="icon-btn btn-delete" onclick="window.eliminarEntrega('${e.id}')" title="Eliminar Definitivamente"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
            `;
        }).join('');
    }

    promptNewDelivery() {
        const cliente = prompt("Nombre del Cliente:");
        if (!cliente) return null;
        const equipo = prompt("Equipo / Modelo:");

        return {
            cliente,
            equipo: equipo || 'Varios',
            fecha: new Date().toISOString().split('T')[0],
            estado: 'Pendiente'
        };
    }
}
