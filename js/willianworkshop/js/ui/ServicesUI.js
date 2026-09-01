import { formatCurrency } from "../utils/formatters.js";

export class ServicesUI {
    constructor() {
        this.els = {
            container: document.getElementById('servicios-container'),
            emptyState: document.getElementById('empty-servicios'),
            searchInput: document.getElementById('buscar-servicio'),
            addBtn: document.getElementById('agregar-servicio-btn')
        };
    }

    render(servicios) {
        if (!servicios || servicios.length === 0) {
            this.els.container.innerHTML = '';
            this.els.emptyState.style.display = 'block';
            return;
        }

        this.els.emptyState.style.display = 'none';

        this.els.container.innerHTML = servicios.map(s => `
            <div class="servicio-item">
                <div class="servicio-desc">${s.descripcion}</div>
                <div class="servicio-cant">${s.cantidad || 1}</div>
                <div class="servicio-precio">${formatCurrency(s.precio)}</div>
                <div class="servicio-subtotal">${formatCurrency((s.precio * (s.cantidad || 1)))}</div>
                <div class="servicio-actions">
                    <button class="delete-item-btn" title="Eliminar" onclick="window.eliminarServicio('${s.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Muestra un prompt simple para agregar servicio (MVP)
     * En el futuro debería ser un modal completo
     */
    promptNewService() {
        const desc = prompt("Descripción del servicio:");
        if (!desc) return null;

        const precio = parseFloat(prompt("Precio del servicio:", "0"));
        if (isNaN(precio)) return null;

        return {
            descripcion: desc,
            precio: precio,
            cantidad: 1 // Default
        };
    }
}
