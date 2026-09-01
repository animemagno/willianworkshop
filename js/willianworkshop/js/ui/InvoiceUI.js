import { formatCurrency } from "../utils/formatters.js";

export class InvoiceUI {
    constructor() {
        this.els = {
            facturasContainer: document.getElementById('facturas-container'),
            gruposContainer: document.getElementById('grupos-container'),
            emptyFacturas: document.getElementById('empty-facturas'),
            emptyGrupos: document.getElementById('empty-grupos'),
            // Modal Elements created dynamically
        };
    }

    render(data) {
        const { facturas, grupos, equipos } = data;

        // 1. Renderizar Facturas Sueltas
        // Identificar equipos en grupos
        const equiposEnGrupos = new Set();
        grupos.forEach(g => {
            if (g.equipos) g.equipos.forEach(e => equiposEnGrupos.add(e));
        });

        // Filtrar sueltos
        const equiposSueltos = Array.from(equipos.values()).filter(e => !equiposEnGrupos.has(e.numero));

        this.renderLooseTeams(equiposSueltos);
        this.renderGroups(grupos, equipos);

        this.toggleEmptyStates(equiposSueltos.length === 0, grupos.size === 0);
    }

    renderLooseTeams(equipos) {
        this.els.facturasContainer.innerHTML = equipos.map(e => `
            <div class="factura-card ${e.esLocal ? 'local' : 'otra-ciudad'}" onclick="window.verDetalleEquipo('${e.numero}')">
                <span class="tipo-badge ${e.esLocal ? 'badge-local' : 'badge-otra-ciudad'}">
                    ${e.esLocal ? 'LOCAL' : 'CIUDAD'}
                </span>
                <div class="equipo-numero">${e.numero}</div>
                ${!e.esLocal && e.ciudad ? `<div class="ciudad-nombre">${e.ciudad}</div>` : ''}
                <div class="saldo-total">${formatCurrency(e.total)}</div>
            </div>
        `).join('');
    }

    renderGroups(gruposMap, equiposMap) {
        if (gruposMap.size === 0) {
            this.els.gruposContainer.innerHTML = '';
            return;
        }

        const sortedGroups = Array.from(gruposMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));

        this.els.gruposContainer.innerHTML = sortedGroups.map(g => {
            if (g.total <= 0) return ''; // Ocultar saldados

            const equiposHtml = (g.equipos || []).map(num => {
                const data = equiposMap.get(num);
                const saldo = data ? data.total : 0;
                if (saldo <= 0) return '';

                return `
                    <div class="grupo-equipo-item">
                        <div class="grupo-equipo-numero">${num}</div>
                        ${data && data.ciudad ? `<div class="grupo-equipo-ciudad">${data.ciudad}</div>` : ''}
                        <div class="grupo-equipo-saldo">${formatCurrency(saldo)}</div>
                    </div>
                `;
            }).join('');

            return `
                <div class="grupo-card">
                    <div class="grupo-header">
                        <div class="grupo-nombre">${g.nombre}</div>
                        <div class="grupo-actions">
                            <button class="icon-btn btn-success" onclick="window.abonarGrupo('${g.id}')" title="Abonar a Grupo">
                                <i class="fas fa-money-bill-wave"></i>
                            </button>
                        </div>
                    </div>
                    <div class="grupo-equipos-grid">
                        ${equiposHtml}
                    </div>
                    <div class="grupo-total">Total: ${formatCurrency(g.total)}</div>
                </div>
            `;
        }).join('');
    }

    toggleEmptyStates(noFacturas, noGrupos) {
        if (this.els.emptyFacturas) this.els.emptyFacturas.style.display = noFacturas ? 'block' : 'none';
        if (this.els.emptyGrupos) this.els.emptyGrupos.style.display = noGrupos ? 'block' : 'none';
    }

    showPaymentModal(grupo) {
        let modal = document.getElementById('modalAbonoGrupo');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modalAbonoGrupo';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-box">
                    <h3>Abonar a Grupo</h3>
                    <div id="infoGrupoAbono" class="modal-text"></div>
                    <div class="form-group">
                        <label>Monto a Abonar</label>
                        <input type="number" id="montoAbonoGrupo" class="abono-input" placeholder="0.00" min="0.01" step="0.01">
                    </div>
                    <div class="modal-buttons">
                        <button class="btn btn-success" id="btnConfirmarAbonoGrupo">Confirmar</button>
                        <button class="btn btn-primary" onclick="document.getElementById('modalAbonoGrupo').style.display='none'">Cancelar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            // Binding del evento click se hará en el controller porque requiere llamar al servicio
        }

        const infoDiv = document.getElementById('infoGrupoAbono');
        infoDiv.innerHTML = `
            <p><strong>Grupo:</strong> ${grupo.nombre}</p>
            <p><strong>Deuda Total:</strong> <span style="color:#e74c3c;font-weight:bold">${formatCurrency(grupo.total)}</span></p>
            <p style="font-size:0.9rem;color:#7f8c8d;margin-top:10px">El abono se distribuirá automáticamente a las facturas más antiguas.</p>
        `;

        const input = document.getElementById('montoAbonoGrupo');
        input.value = '';
        input.dataset.grupoId = grupo.id;

        modal.style.display = 'flex';
        input.focus();

        return {
            modal,
            confirmBtn: document.getElementById('btnConfirmarAbonoGrupo'),
            input
        };
    }
}
