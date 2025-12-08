import { formatCurrency } from "../utils/formatters.js";

export class SalesUI {
    constructor() {
        this.els = {
            cartItems: document.getElementById('cart-items'),
            cartTotal: document.getElementById('cart-total'),
            cartResumen: document.getElementById('cart-resumen'),
            cartBadge: document.getElementById('cart-badge'),
            searchDropdown: document.getElementById('search-dropdown'),
            notificacion: document.getElementById('notificacionProducto'),
            notifNombre: document.getElementById('notificacionNombre'),
            notifDetalles: document.getElementById('notificacionDetalles'),

            // Inputs
            equipo: document.getElementById('equipo'),
            cliente: document.getElementById('cliente'),
            cantidad: document.getElementById('cantidad'),
            buscador: document.getElementById('buscar-producto'),

            // Modals
            modalExito: document.getElementById('modalExito'),
            modalError: document.getElementById('modalError'),
            modalAbono: document.getElementById('modalAbonoInicial'),
            modalMontoAbono: document.getElementById('modalMontoAbono'),

            // Abono info
            abonoMonto: document.getElementById('abonoMonto'),
            abonoSaldo: document.getElementById('abonoSaldo'),
            abonoTotal: document.getElementById('abonoTotal'),
            inputMontoAbono: document.getElementById('montoAbono')
        };
    }

    renderCart(cart, total, count) {
        if (this.els.cartBadge) {
            this.els.cartBadge.textContent = count > 99 ? '99+' : count;
            this.els.cartBadge.style.display = count > 0 ? 'flex' : 'none';
        }

        if (cart.length === 0) {
            this.els.cartItems.innerHTML = `
                <div class="empty-cart">
                    <i class="fas fa-shopping-cart" style="font-size:2rem;margin-bottom:10px;opacity:.5;"></i>
                    <div>No hay productos agregados</div>
                </div>
            `;
            if (this.els.cartTotal) this.els.cartTotal.textContent = "$0.00";
            if (this.els.cartResumen) this.els.cartResumen.textContent = "Productos: 0 | Total: ";
            return;
        }

        this.els.cartItems.innerHTML = cart.map((item, i) => `
            <div class="cart-item" data-index="${i}">
               <div class="info">
                   <div class="desc product-desc">${item.desc}</div>
                   <div class="meta" style="color:#666;font-size:0.8rem">${item.cantidad} x ${formatCurrency(item.precio)}</div>
               </div>
               <div class="cant-col" style="text-align:center">${item.cantidad}</div>
               <div class="price-col" style="text-align:right">${formatCurrency(item.precio)}</div>
               <div class="subtotal" style="text-align:right">${formatCurrency(item.subtotal)}</div>
               <div class="actions" style="text-align:right">
                   <button class="delete-item-btn" title="Eliminar"><i class="fas fa-times"></i></button>
               </div>
            </div>
        `).join("");

        if (this.els.cartTotal) this.els.cartTotal.textContent = formatCurrency(total);
        if (this.els.cartResumen) this.els.cartResumen.textContent = `Productos: ${count} | Total: `;
    }

    renderSearchResults(results) {
        if (!results || results.length === 0) {
            this.els.searchDropdown.innerHTML = '<div class="search-dropdown-item">No se encontraron productos</div>';
            this.els.searchDropdown.style.display = 'block';
            return;
        }

        this.els.searchDropdown.innerHTML = results.map(p => `
            <div class="search-dropdown-item" data-id="${p.id}">
                <div style="font-weight: bold;">${p.descripcionTaller}</div>
                ${p.descripcionFactura ? `<div style="font-size: 0.8rem; color: #666;">${p.descripcionFactura}</div>` : ''}
                <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                    <span style="font-size: 0.8rem;">${p.codigo || 'S/C'}</span>
                    <span style="font-weight: bold; color: #27ae60;">${formatCurrency(p.precioVenta)}</span>
                </div>
                <div style="font-size: 0.7rem; color: ${p.existencia > 0 ? '#27ae60' : '#e74c3c'};">
                    Existencia: ${p.existencia}
                </div>
            </div>
        `).join('');
        this.els.searchDropdown.style.display = 'block';
    }

    hideSearchResults() {
        this.els.searchDropdown.style.display = 'none';
    }

    showNotification(name, price, quantity) {
        this.els.notifNombre.textContent = name;
        this.els.notifDetalles.textContent = `Cantidad: ${quantity} - ${formatCurrency(price)} c/u`;
        this.els.notificacion.classList.add("mostrar");
        setTimeout(() => this.els.notificacion.classList.remove("mostrar"), 2000);
    }

    updateAbonoModal(total, abono, saldo) {
        this.els.abonoTotal.textContent = formatCurrency(total);
        this.els.abonoMonto.textContent = formatCurrency(abono);
        this.els.abonoSaldo.textContent = formatCurrency(saldo);
        // this.els.inputMontoAbono.value = abono; // No forzar valor si el usuario escribe
    }

    // Modal helpers
    showModal(modalId) {
        const m = document.getElementById(modalId);
        if (m) m.style.display = 'flex';
    }

    hideModal(modalId) {
        const m = document.getElementById(modalId);
        if (m) m.style.display = 'none';
    }

    getFormData() {
        return {
            equipo: this.els.equipo.value.trim(),
            cliente: this.els.cliente.value.trim(),
            cantidad: parseInt(this.els.cantidad.value) || 1
        };
    }

    setFormData(data) {
        if (data.equipo) this.els.equipo.value = data.equipo;
        if (data.cliente) this.els.cliente.value = data.cliente;
    }

    clearForm() {
        this.els.equipo.value = "";
        this.els.cliente.value = "";
        this.els.buscador.value = "";
        this.els.cantidad.value = "1";
    }
}
