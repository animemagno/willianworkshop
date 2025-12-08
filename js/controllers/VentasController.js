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

let selectedDropdownIndex = -1;

function setupEventListeners() {
    // 1. Búsqueda con navegación por teclado - Busca directamente en Firebase
    ui.els.buscador.addEventListener('input', (e) => {
        const val = e.target.value;
        clearTimeout(searchTimeout);
        selectedDropdownIndex = -1;

        if (val.length < 2) {
            ui.hideSearchResults();
            return;
        }

        searchTimeout = setTimeout(async () => {
            // Buscar directamente en Firebase
            console.log('🔍 Buscando en Firebase:', val);
            const results = await productService.searchRemote(val);
            console.log('📦 Resultados encontrados:', results.length);
            ui.renderSearchResults(results);
            selectedDropdownIndex = -1;
        }, 300);
    });

    // 2. Navegación con teclado en el buscador
    ui.els.buscador.addEventListener('keydown', async (e) => {
        const dropdown = ui.els.searchDropdown;
        const items = dropdown.querySelectorAll('.search-dropdown-item');

        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedDropdownIndex = Math.min(selectedDropdownIndex + 1, items.length - 1);
            updateDropdownSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedDropdownIndex = Math.max(selectedDropdownIndex - 1, 0);
            updateDropdownSelection(items);
        } else if (e.key === 'Enter' && selectedDropdownIndex >= 0) {
            e.preventDefault();
            const id = items[selectedDropdownIndex].dataset.id;
            await selectProduct(id);
        }
    });

    // 3. Selección de producto con click
    ui.els.searchDropdown.addEventListener('click', async (e) => {
        const item = e.target.closest('.search-dropdown-item');
        if (!item) return;

        const id = item.dataset.id;
        await selectProduct(id);
    });

    // 4. Cerrar dropdown al hacer click fuera
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            ui.hideSearchResults();
            selectedDropdownIndex = -1;
        }
    });

    // 5. Autosave en equipo y cliente
    [ui.els.equipo, ui.els.cliente].forEach(el => {
        el.addEventListener('input', autoSave);
    });

    // 6. Carrito - Editar cantidad y precio
    ui.els.cartItems.addEventListener('input', (e) => {
        if (e.target.classList.contains('cart-cantidad')) {
            const index = parseInt(e.target.dataset.index);
            const newQty = parseInt(e.target.value) || 1;
            salesService.updateCartItemQuantity(index, newQty);
            updateCartView();
            autoSave();
        } else if (e.target.classList.contains('cart-precio')) {
            const index = parseInt(e.target.dataset.index);
            const newPrice = parseFloat(e.target.value) || 0;
            salesService.updateCartItemPrice(index, newPrice);
            updateCartView();
            autoSave();
        }
    });

    // 7. Carrito - Eliminar
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

    // 8. Botón Limpiar Carrito
    document.getElementById('limpiarCarritoBtn')?.addEventListener('click', () => {
        if (salesService.cart.length === 0) {
            alert('El carrito ya está vacío');
            return;
        }

        if (confirm('¿Estás seguro de vaciar el carrito?\n\nSe perderán todos los productos agregados.')) {
            salesService.clearCart();
            ui.clearForm();
            updateCartView();
            salesService.clearTempSale(usuarioLogueado);
            ui.els.equipo.focus();
            console.log('🗑️ Carrito limpiado');
        }
    });

    // 9. Botones Principales
    document.getElementById('efectivoBtn')?.addEventListener('click', () => processSale('efectivo'));
    document.getElementById('creditoBtn')?.addEventListener('click', () => prepareCreditSale());

    // 10. Modales y Movimientos
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

function updateDropdownSelection(items) {
    items.forEach((item, index) => {
        if (index === selectedDropdownIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
            item.classList.remove('selected');
        }
    });
}

async function selectProduct(id) {
    const product = await productService.getProductById(id);
    if (!product) return;

    if (product.existencia <= 0) {
        alert("❌ Producto sin existencia");
        return;
    }

    // Pedir cantidad con prompt
    const qtyInput = prompt(`Cantidad para: ${product.descripcionTaller}\n\nExistencia disponible: ${product.existencia}`, "1");

    if (qtyInput === null) {
        // Usuario canceló
        ui.els.buscador.focus();
        return;
    }

    const qty = parseInt(qtyInput) || 1;

    if (qty <= 0) {
        alert("❌ La cantidad debe ser mayor a 0");
        ui.els.buscador.focus();
        return;
    }

    if (qty > product.existencia) {
        alert(`❌ Solo hay ${product.existencia} unidades disponibles`);
        ui.els.buscador.focus();
        return;
    }

    salesService.addToCart(product, qty);
    updateCartView();
    ui.hideSearchResults();
    ui.els.buscador.value = "";
    ui.showNotification(product.descripcionTaller, product.precioVenta, qty);
    autoSave();

    // Volver el foco al buscador
    selectedDropdownIndex = -1;
    ui.els.buscador.focus();
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

    // Agrupar por equipo + ciudad
    const groups = {};
    sales.forEach(s => {
        // Crear clave única: equipo + ciudad
        const equipo = s.equipo === '0' ? 'CLIENTE GENERAL' : s.equipo;
        const ciudad = s.ciudad && s.ciudad !== 'LOCAL' ? s.ciudad : '';
        const key = ciudad ? `${equipo}-${ciudad}` : equipo;

        if (!groups[key]) {
            groups[key] = {
                equipo: equipo,
                ciudad: ciudad,
                total: 0
            };
        }
        groups[key].total += s.total;
    });

    container.innerHTML = Object.values(groups).map(group => `
        <div class="mini-card" data-equipo="${group.equipo}" data-ciudad="${group.ciudad || 'LOCAL'}" style="cursor: pointer;">
            <div class="mini-equipo">
                ${group.equipo}
                ${group.ciudad ? `<span class="mini-ciudad">${group.ciudad}</span>` : ''}
            </div>
            <div class="mini-total">$${group.total.toFixed(2)}</div>
        </div>
    `).join("");

    // Agregar event listeners a las mini-cards
    container.querySelectorAll('.mini-card').forEach(card => {
        card.addEventListener('click', () => {
            const equipo = card.dataset.equipo;
            const ciudad = card.dataset.ciudad;
            mostrarFacturasEquipo(equipo, ciudad);
        });
    });
}

async function mostrarFacturasEquipo(equipo, ciudad) {
    const modal = document.getElementById('modalFacturasEquipo');
    const titulo = document.getElementById('tituloModalFacturas');
    const lista = document.getElementById('listaFacturasEquipo');

    // Actualizar título
    const ciudadTexto = ciudad && ciudad !== 'LOCAL' ? ` - ${ciudad}` : '';
    titulo.textContent = `Facturas del Equipo ${equipo}${ciudadTexto}`;

    // Mostrar loading
    lista.innerHTML = '<p style="text-align:center;padding:20px;">Cargando facturas...</p>';
    modal.style.display = 'flex';

    try {
        // Obtener facturas del equipo
        const sales = await salesService.getDailySales();
        const facturas = sales.filter(s => {
            const equipoMatch = s.equipo === equipo;
            const ciudadMatch = (s.ciudad || 'LOCAL') === ciudad;
            return equipoMatch && ciudadMatch;
        });

        if (facturas.length === 0) {
            lista.innerHTML = '<p style="text-align:center;padding:20px;color:#666;">No hay facturas para este equipo hoy.</p>';
            return;
        }

        // Renderizar facturas
        lista.innerHTML = facturas.map(f => `
            <div class="factura-item" style="background: #f8f9fa; padding: 15px; margin-bottom: 10px; border-radius: 8px; border-left: 4px solid ${f.saldoPendiente > 0 ? '#f59e0b' : '#10b981'};">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <strong>${f.tipo === 'credito' ? '💳 CRÉDITO' : '💵 EFECTIVO'}</strong>
                    <span style="color: #666; font-size: 0.9rem;">${new Date(f.fecha.seconds * 1000).toLocaleString()}</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.9rem;">
                    <div><strong>Total:</strong> $${f.total.toFixed(2)}</div>
                    <div><strong>Abono:</strong> $${f.abonoInicial.toFixed(2)}</div>
                    <div><strong>Saldo:</strong> <span style="color: ${f.saldoPendiente > 0 ? '#f59e0b' : '#10b981'}; font-weight: bold;">$${f.saldoPendiente.toFixed(2)}</span></div>
                    <div><strong>Estado:</strong> ${f.saldoPendiente > 0 ? '⏳ Pendiente' : '✅ Pagado'}</div>
                </div>
                <details style="margin-top: 10px;">
                    <summary style="cursor: pointer; color: #3b82f6; font-weight: 600;">Ver productos (${f.items.length})</summary>
                    <div style="margin-top: 8px; padding-left: 10px;">
                        ${f.items.map(item => `
                            <div style="padding: 4px 0; border-bottom: 1px solid #e5e7eb; font-size: 0.85rem;">
                                ${item.cantidad}x ${item.desc} - $${item.subtotal.toFixed(2)}
                            </div>
                        `).join('')}
                    </div>
                </details>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error cargando facturas:', error);
        lista.innerHTML = '<p style="text-align:center;padding:20px;color:#ef4444;">Error al cargar las facturas.</p>';
    }
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
