import { ProductService } from "../services/ProductService.js";
import { SalesService } from "../services/SalesService.js";
import { SalesUI } from "../ui/SalesUI.js";

console.log('✅ VentasController.js loaded');

const productService = new ProductService();
const salesService = new SalesService();
const ui = new SalesUI();

let searchTimeout = null;
const usuarioLogueado = localStorage.getItem('usuarioLogueado');

// --- Initialization ---

async function init() {
    console.log("🚀 Inicializando Módulo de Ventas...");

    // Verificar autenticación
    if (!usuarioLogueado) {
        console.log('❌ Usuario no logueado, redirigiendo...');
        window.location.href = 'login.html';
        return;
    }

    // 1. Cargar datos
    await productService.loadProducts();
    const tempData = await salesService.loadTempSale(usuarioLogueado);

    if (tempData) {
        ui.setFormData(tempData);
        updateCartView();
    }

    loadMiniHistory();

    setupEventListeners();
    console.log('✅ Módulo de Ventas inicializado correctamente');
}

function setupEventListeners() {
    // 1. Búsqueda
    ui.els.buscador.addEventListener('input', (e) => {
        const val = e.target.value;
        clearTimeout(searchTimeout);

        if (val.length < 2) {
            ui.hideSearchResults();
            return;
        }

        searchTimeout = setTimeout(async () => {
            // Primero local, si no hay, remoto (según lógica original)
            let results = productService.searchLocal(val);
            if (results.length === 0) {
                results = await productService.searchRemote(val);
            }
            ui.renderSearchResults(results);
        }, 300);
    });

    // 2. Selección de producto (Event delegation en dropdown)
    ui.els.searchDropdown.addEventListener('click', async (e) => {
        const item = e.target.closest('.search-dropdown-item');
        if (!item) return;

        const id = item.dataset.id;
        await selectProduct(id);
    });

    // 3. Cerrar dropdown al hacer click fuera
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) ui.hideSearchResults();
    });

    // 4. Input Cantidad y Autosave
    ui.els.cantidad.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') e.preventDefault();
    });

    [ui.els.equipo, ui.els.cliente].forEach(el => {
        el.addEventListener('input', autoSave);
    });

    // 5. Carrito (Eliminar)
    ui.els.cartItems.addEventListener('click', (e) => {
        if (e.target.closest('.delete-item-btn')) {
            const row = e.target.closest('.cart-item');
            if (row) {
                const index = parseInt(row.dataset.index);
                if (confirm('¿Eliminar producto?')) {
                    salesService.removeFromCart(index);
                    updateCartView();
                    autoSave();
                }
            }
        }
    });

    // 6. Botones Principales
    document.getElementById('efectivoBtn')?.addEventListener('click', () => processSale('efectivo'));
    document.getElementById('creditoBtn')?.addEventListener('click', () => prepareCreditSale());

    // 7. Modales y Movimientos
    document.getElementById('btnRetiro')?.addEventListener('click', () => ui.showModal('modalRetiro'));
    document.getElementById('btnIngreso')?.addEventListener('click', () => ui.showModal('modalIngreso'));

    document.getElementById('btnConfirmarRetiro')?.addEventListener('click', () => processMovement('retiro'));
    document.getElementById('btnConfirmarIngreso')?.addEventListener('click', () => processMovement('ingreso'));

    // Abono Modals
    document.getElementById('btnConAbono')?.addEventListener('click', () => {
        ui.hideModal('modalAbonoInicial');
        ui.showModal('modalMontoAbono');
        ui.updateAbonoModal(salesService.total, 0, salesService.total);
    });

    document.getElementById('btnSinAbono')?.addEventListener('click', () => {
        ui.hideModal('modalAbonoInicial');
        processSale('credito');
    });

    document.getElementById('montoAbono')?.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0;
        salesService.setAbono(val);
        ui.updateAbonoModal(salesService.total, salesService.abonoInicial, salesService.saldoPendiente);
    });

    document.getElementById('confirmarAbonoBtn')?.addEventListener('click', () => {
        ui.hideModal('modalMontoAbono');
        processSale('credito');
    });

    // Mobile Swap
    const swapBtn = document.getElementById('swapBtn');
    const ventaWrapper = document.getElementById('ventaWrapper');
    if (swapBtn && ventaWrapper) {
        swapBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('🔄 Swap clicked');
            ventaWrapper.classList.toggle('invertido');
        });
    }

    // Dropdown Menu Operaciones
    const menuOperacionesBtn = document.getElementById('menuOperacionesBtn');
    const menuOperaciones = document.getElementById('menuOperaciones');

    if (menuOperacionesBtn && menuOperaciones) {
        menuOperacionesBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('📋 Menu clicked');
            menuOperaciones.classList.toggle('active');
        });

        // Cerrar menú al hacer click fuera
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown-menu-container')) {
                menuOperaciones.classList.remove('active');
            }
        });

        // Cerrar menú al seleccionar una opción
        menuOperaciones.addEventListener('click', () => {
            menuOperaciones.classList.remove('active');
        });
    }

    // Mobile Menu
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
        document.getElementById('mobileMenu').classList.toggle('active');
    });
    document.getElementById('cartIcon')?.addEventListener('click', () => {
        document.getElementById('carritoContainer').classList.toggle('mostrar');
    });

    // Cerrar modales (Overlay)
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.style.display = 'none';
        });
    });
}

// --- Logic ---

async function selectProduct(id) {
    const product = await productService.getProductById(id);
    if (!product) return;

    if (product.existencia <= 0) {
        alert("❌ Producto sin existencia");
        return;
    }

    const qty = parseInt(ui.els.cantidad.value) || 1;
    if (qty > product.existencia) {
        alert(`❌ Solo hay ${product.existencia} unidades`);
        return;
    }

    salesService.addToCart(product, qty);
    updateCartView();
    ui.hideSearchResults();
    ui.els.buscador.value = "";
    ui.showNotification(product.descripcionTaller, product.precioVenta, qty);
    autoSave();
}

function updateCartView() {
    ui.renderCart(salesService.cart, salesService.total, salesService.totalQuantity);
}

function autoSave() {
    salesService.saveTempSale(ui.getFormData(), usuarioLogueado);
}

async function processSale(type) {
    const formData = ui.getFormData();

    if (!formData.equipo) {
        alert("❌ Ingrese número de equipo");
        return;
    }
    if (salesService.cart.length === 0) {
        alert("❌ Carrito vacío");
        return;
    }

    // Validación Precio 0 para Efectivo
    if (type === 'efectivo' && salesService.cart.some(i => i.precio === 0)) {
        alert("❌ Productos con precio $0 requieren venta a CRÉDITO.");
        return;
    }

    try {
        await salesService.saveSale(type, formData, usuarioLogueado);

        ui.showModal('modalExito');
        resetSale();
        loadMiniHistory(); // Actualizar historial
    } catch (error) {
        console.error(error);
        alert("Error al guardar venta: " + error.message);
    }
}

function prepareCreditSale() {
    ui.showModal('modalAbonoInicial');
}

async function processMovement(type) {
    const idMonto = type === 'retiro' ? 'montoRetiro' : 'montoIngreso';
    const idConcepto = type === 'retiro' ? 'conceptoRetiro' : 'conceptoIngreso';
    const idModal = type === 'retiro' ? 'modalRetiro' : 'modalIngreso';

    const monto = document.getElementById(idMonto).value;
    const concepto = document.getElementById(idConcepto).value;

    if (!monto || !concepto) {
        alert("Complete todos los campos");
        return;
    }

    try {
        await salesService.registerMovement(type, monto, concepto, usuarioLogueado);
        alert("✅ Registrado correctamente");
        ui.hideModal(idModal);
        document.getElementById(idMonto).value = "";
        document.getElementById(idConcepto).value = "";
    } catch (e) {
        alert("Error: " + e.message);
    }
}

async function loadMiniHistory() {
    const sales = await salesService.getDailySales();
    const container = document.getElementById('miniGrid');
    if (!container) return;

    if (sales.length === 0) {
        container.innerHTML = "<p>Sin ventas hoy</p>";
        return;
    }

    // Agrupar por equipo
    const groups = {};
    sales.forEach(s => {
        if (!groups[s.equipo]) groups[s.equipo] = 0;
        groups[s.equipo] += s.total;
    });

    container.innerHTML = Object.entries(groups).map(([eq, tot]) => `
        <div class="mini-card">
            <div class="mini-equipo">${eq}</div>
            <div class="mini-total">$${tot.toFixed(2)}</div>
        </div>
    `).join("");
}

function resetSale() {
    salesService.clearCart();
    ui.clearForm();
    updateCartView();
}

// Global exposure for simple button onclicks if necessary (but handled by listeners now)
window.cerrarExito = () => ui.hideModal('modalExito');
window.cerrarError = () => ui.hideModal('modalError');

// Init
document.addEventListener('DOMContentLoaded', init);
