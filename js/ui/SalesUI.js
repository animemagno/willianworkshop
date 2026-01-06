/* js/ui/SalesUI.js - GLOBAL VERSION CON GESTIÓN DE INTERFAZ Y TABS */
(function () {
    const formatCurrency = window.Utils ? window.Utils.formatCurrency : (val) => "$" + (val || 0).toFixed(2);

    class SalesUI {
        constructor() {
            this.els = {
                // Contenedores Principales
                cartItems: document.getElementById('cart-items'),
                cartTotal: document.getElementById('total-amount'),
                searchDropdown: document.getElementById('search-dropdown'),

                // Inputs Principales
                equipo: document.getElementById('equipo'),
                cliente: document.getElementById('cliente'),
                buscador: document.getElementById('buscar-producto'),

                // Modals
                modalIngreso: document.getElementById('ingreso-modal'),
                modalRetiro: document.getElementById('retiro-modal'),
                modalAbonoInicial: document.getElementById('abono-inicial-modal'),
                modalExito: document.getElementById('modalExito'),

                // Abono Inicial Modal Elements
                abonoMonto: document.getElementById('monto-abono-inicial'),
                abonoSaldoMsg: document.getElementById('saldo-despues-abono'),
                lblAbonoTotal: document.getElementById('abono-modal-total'),
                lblAbonoEquipo: document.getElementById('abono-modal-equipo'),
                lblAbonoCliente: document.getElementById('abono-modal-cliente')
            };
        }



        // --- GESTIÓN DE MODALES ---
        showModal(modalId) {
            // Mapeo de nombres cortos a IDs reales si es necesario
            let id = modalId;
            if (modalId === 'ingreso') id = 'ingreso-modal';
            if (modalId === 'retiro') id = 'retiro-modal';
            if (modalId === 'abonoInicial') id = 'abono-inicial-modal';

            const m = document.getElementById(id);
            if (m) {
                m.style.display = 'flex';
                // Animación simple si se desea
            }
        }

        hideModal(modalId) {
            let id = modalId;
            if (modalId === 'ingreso') id = 'ingreso-modal';
            if (modalId === 'retiro') id = 'retiro-modal';
            if (modalId === 'abonoInicial') id = 'abono-inicial-modal';

            const m = document.getElementById(id);
            if (m) m.style.display = 'none';
        }

        // --- CARRITO Y PRODUCTOS ---
        renderCart(cart, total, count) {
            if (!this.els.cartItems) return;

            if (cart.length === 0) {
                this.els.cartItems.innerHTML = `
                    <div class="empty-cart">
                        <i class="fas fa-shopping-cart" style="font-size: 2rem; margin-bottom: 10px; opacity: 0.5;"></i>
                        <div>No hay productos agregados</div>
                    </div>`;
                if (this.els.cartTotal) this.els.cartTotal.textContent = "TOTAL: $0.00";
                return;
            }

            this.els.cartItems.innerHTML = cart.map((item, i) => `
                <div class="cart-item" data-index="${i}" style="display: grid; grid-template-columns: 60px 2fr 1fr 1fr 40px; gap: 10px; align-items: center; padding: 10px; border-bottom: 1px solid #eee;">
                   <div class="cant-col">
                       <input type="number" class="cart-cantidad quantity-input" data-index="${i}" value="${item.cantidad}" min="1">
                   </div>
                   <div class="product-desc" style="font-weight: 500;">${item.desc}</div>
                   <div class="price-col">
                       <input type="number" class="cart-precio price-input" data-index="${i}" value="${item.precio}" min="0" step="0.01">
                   </div>
                   <div class="subtotal" style="font-weight: bold; text-align: right;">${formatCurrency(item.subtotal)}</div>
                   <div class="actions" style="text-align: center;">
                       <button class="delete-item-btn" title="Eliminar"><i class="fas fa-trash-alt"></i></button>
                   </div>
                </div>
            `).join("");

            if (this.els.cartTotal) this.els.cartTotal.textContent = `TOTAL: ${formatCurrency(total)}`;
        }

        renderSearchResults(results) {
            if (!this.els.searchDropdown) return;

            if (!results || results.length === 0) {
                this.els.searchDropdown.innerHTML = '<div style="padding:10px; color:#666;">No se encontraron productos</div>';
                this.els.searchDropdown.style.display = 'block';
                return;
            }

            this.els.searchDropdown.innerHTML = results.map(p => `
                <div class="search-dropdown-item" data-id="${p.id}" style="padding:10px; border-bottom:1px solid #eee; cursor:pointer;">
                    <div style="font-weight: bold;">${p.descripcionTaller}</div>
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
            if (this.els.searchDropdown) this.els.searchDropdown.style.display = 'none';
        }

        updateAbonoModal(total, abono, saldo) {
            if (this.els.lblAbonoTotal) this.els.lblAbonoTotal.textContent = total.toFixed(2);
            if (this.els.abonoSaldoMsg) this.els.abonoSaldoMsg.textContent = formatCurrency(saldo);
        }

        setupAbonoModalInfo(equipo, cliente) {
            if (this.els.lblAbonoEquipo) this.els.lblAbonoEquipo.textContent = equipo || '-';
            if (this.els.lblAbonoCliente) this.els.lblAbonoCliente.textContent = cliente || '-';
        }

        getFormData() {
            return {
                equipo: this.els.equipo ? this.els.equipo.value.trim() : '',
                cliente: this.els.cliente ? this.els.cliente.value.trim() : '',
                cantidad: 1
            };
        }

        setFormData(data) {
            if (data.equipo && this.els.equipo) this.els.equipo.value = data.equipo;
            if (data.cliente && this.els.cliente) this.els.cliente.value = data.cliente;
        }

        clearForm() {
            if (this.els.equipo) this.els.equipo.value = "";
            if (this.els.cliente) this.els.cliente.value = "";
            if (this.els.buscador) this.els.buscador.value = "";
        }
    }

    window.SalesUI = SalesUI;
})();
