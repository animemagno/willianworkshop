/* js/controllers/VentasController.js - GLOBAL VERSION CON LEGACY SUPPORT */
(function () {
    let productService;
    let salesService;
    let ui;
    const usuarioLogueado = localStorage.getItem('usuario') || 'Admin';

    async function init() {
        console.log("🚀 VentasController (Clean & Funcional) Iniciado.");

        productService = new window.ProductService();
        salesService = new window.SalesService();
        ui = new window.SalesUI();

        // 1. Inicializar Interface
        setupLegacyBridge(); // Conectar botones del HTML viejo a la lógica nueva
        setupFormEvents();
        setupSearchEvents();

        // 2. Cargar Datos
        try {
            await productService.loadProducts();
        } catch (e) {
            console.error("Error cargando productos:", e);
        }

        // 3. Recuperar Venta Pendiente
        try {
            const tempSale = await salesService.loadTempSale(usuarioLogueado);
            if (tempSale) {
                ui.setFormData(tempSale);
                updateCartView();
            }
        } catch (e) { console.warn("Error venta temp", e); }
    }

    // --- PUENTE PARA HTML LEGADO (Evita editar todo el HTML) ---
    function setupLegacyBridge() {
        // Objeto global que simula el viejo UIService para que los onclick="UIService.show..." funcionen
        window.UIService = {
            showIngresoModal: () => ui.showModal('ingreso'),
            showRetiroModal: () => ui.showModal('retiro'),
            toggleDashboardLayout: () => {
                alert("Función de cambiar diseño pendiente de implementación en clean code.");
            },
            filterHistoryByDate: () => {
                console.log("Filtrar historial - Pendiente");
            }
        };

        // Eventos para cerrar modales (ya que los botones cerrar tienen IDs pero no onclicks a veces)
        document.getElementById('close-ingreso-modal')?.addEventListener('click', () => ui.hideModal('ingreso'));
        document.getElementById('close-retiro-modal')?.addEventListener('click', () => ui.hideModal('retiro'));
        document.getElementById('close-abono-modal')?.addEventListener('click', () => ui.hideModal('abono')); // Si existe
    }

    function setupSearchEvents() {
        const { buscador, searchDropdown } = ui.els;
        if (!buscador) return;

        buscador.addEventListener('input', async (e) => {
            const term = e.target.value;
            if (term.length < 2) {
                ui.hideSearchResults();
                return;
            }
            let results = productService.searchLocal(term);
            ui.renderSearchResults(results);
        });

        if (searchDropdown) {
            searchDropdown.addEventListener('click', (e) => {
                const item = e.target.closest('.search-dropdown-item');
                if (item) {
                    const id = item.dataset.id;
                    selectProduct(id);
                }
            });
        }

        document.addEventListener('click', (e) => {
            if (searchDropdown && !buscador.contains(e.target) && !searchDropdown.contains(e.target)) {
                ui.hideSearchResults();
            }
        });
    }

    async function selectProduct(id) {
        let product = await productService.getProductById(id);
        if (!product) return;

        if (product.tipo !== 'servicio' && product.existencia <= 0) {
            alert("Producto sin existencia");
            return;
        }

        let qty = 1;
        // Prompt simplificado para cantidad
        const inputQty = prompt(`Cantidad para: ${product.descripcionTaller}\nExistencia disponible: ${product.existencia}`, "1");
        if (inputQty === null) return;
        qty = parseInt(inputQty) || 1;

        salesService.addToCart(product, qty);
        updateCartView();
        ui.hideSearchResults();
        ui.els.buscador.value = "";

        autoSave();
    }

    function updateCartView() {
        if (salesService && ui) {
            ui.renderCart(salesService.cart, salesService.total, salesService.totalQuantity);
        }
    }

    function autoSave() {
        salesService.saveTempSale(ui.getFormData(), usuarioLogueado);
    }

    function setupFormEvents() {
        // Botones de pago del HTML Legacy
        const contadoBtn = document.getElementById('contado-btn');
        const pendienteBtn = document.getElementById('pendiente-btn');

        if (contadoBtn) {
            contadoBtn.addEventListener('click', (e) => {
                e.preventDefault();
                processSale('efectivo');
            });
        }
        if (pendienteBtn) {
            pendienteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                prepareCreditSale();
            });
        }

        // Delegación de eventos del carrito (Eliminar, Cambiar Cantidad)
        if (ui.els.cartItems) {
            ui.els.cartItems.addEventListener('click', (e) => {
                const btn = e.target.closest('.delete-item-btn');
                if (btn) {
                    const itemDiv = btn.closest('.cart-item');
                    const index = parseInt(itemDiv.dataset.index);
                    if (confirm("¿Eliminar producto del carrito?")) {
                        salesService.removeFromCart(index);
                        updateCartView();
                        autoSave();
                    }
                }
            });

            ui.els.cartItems.addEventListener('change', (e) => {
                if (e.target.classList.contains('quantity-input')) {
                    const index = parseInt(e.target.dataset.index);
                    const val = parseFloat(e.target.value);
                    salesService.updateCartItemQuantity(index, val);
                    updateCartView();
                    autoSave();
                }

                if (e.target.classList.contains('price-input')) {
                    const index = parseInt(e.target.dataset.index);
                    const val = parseFloat(e.target.value);
                    salesService.updateCartItemPrice(index, val);
                    updateCartView();
                    autoSave();
                }
            });
        }

        // Modal Abono Inicial
        const btnProcesarAbono = document.getElementById('procesar-venta-con-abono-btn');
        const btnCancelarAbono = document.getElementById('cancelar-abono-inicial-btn');
        const inputMontoAbono = document.getElementById('monto-abono-inicial');

        if (btnProcesarAbono) {
            btnProcesarAbono.addEventListener('click', () => {
                const abono = parseFloat(inputMontoAbono.value) || 0;
                if (abono < 0) { alert("Abono inválido"); return; }

                salesService.setAbono(abono);
                ui.hideModal('abonoInicial');
                processSale('credito');
            });
        }

        if (btnCancelarAbono) btnCancelarAbono.addEventListener('click', () => ui.hideModal('abonoInicial'));

        if (inputMontoAbono) {
            inputMontoAbono.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value) || 0;
                ui.updateAbonoModal(salesService.total, val, salesService.total - val);
            });
        }
    }

    function prepareCreditSale() {
        const formData = ui.getFormData();
        if (!formData.equipo || formData.equipo === '0' || formData.equipo === '') {
            alert("⚠️ Para vender a crédito (PENDIENTE) es OBLIGATORIO ingresar el número de Equipo.");
            return;
        }

        // Preparar modal
        ui.updateAbonoModal(salesService.total, 0, salesService.total);
        ui.setupAbonoModalInfo(formData.equipo, formData.cliente);

        if (ui.els.abonoMonto) ui.els.abonoMonto.value = "";

        ui.showModal('abonoInicial');
    }

    async function processSale(type) {
        const formData = ui.getFormData();

        if (salesService.cart.length === 0) {
            alert("El carrito está vacío.");
            return;
        }

        if (type === 'efectivo' && (!formData.equipo || formData.equipo === '')) {
            if (!confirm("¿Registrar venta de Contado SIN número de equipo?")) return;
        }

        try {
            // Mostrar loading (si existe en HTML)
            const loading = document.getElementById('loading-overlay');
            if (loading) loading.style.display = 'flex';

            await salesService.saveSale(type, formData, usuarioLogueado);

            if (loading) loading.style.display = 'none';

            // Modal Exito
            const modalExito = document.getElementById('modalExito');
            if (modalExito) modalExito.style.display = 'flex';
            else alert("¡Venta Exitosa!");

            salesService.clearCart();
            ui.clearForm();
            updateCartView();
        } catch (error) {
            const loading = document.getElementById('loading-overlay');
            if (loading) loading.style.display = 'none';
            alert("Error al procesar la venta: " + error.message);
        }
    }

    // Arrancar
    document.addEventListener('DOMContentLoaded', init);
})();
