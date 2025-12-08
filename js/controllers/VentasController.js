
import { ProductService } from "../services/ProductService.js";
import { SalesService } from "../services/SalesService.js";
import { SalesUI } from "../ui/SalesUI.js";

const productService = new ProductService();
const salesService = new SalesService();
const ui = new SalesUI();
const usuarioLogueado = localStorage.getItem('usuario') || 'Admin';

let selectedDropdownIndex = -1;

async function init() {
    console.log("🚀 VentasController Inicializado -> Usuario:", usuarioLogueado);

    try {
        await productService.loadProducts();
    } catch (e) {
        console.error("Error cargando productos:", e);
    }

    // Configurar layout (eventos globales)
    setupGlobalKeys();

    // Configurar buscador (CRÍTICO: usar selectores correctos)
    setupSearchEvents();

    // Configurar eventos del formulario y carrito
    setupFormEvents();

    // Configurar botones del header
    setupHeaderButtons();

    // Recuperar venta temporal si existe
    try {
        const tempSale = await salesService.loadTempSale(usuarioLogueado);
        if (tempSale) {
            ui.setFormData(tempSale); // Usar setFormData para mayor seguridad
            updateCartView();
        }
    } catch (e) { console.warn("Error recuperando venta temp", e); }

    // Cargar historial del día
    try {
        loadMiniHistory();
    } catch (e) { console.error("Error cargando historial inicial", e); }
}

function setupGlobalKeys() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F2') {
            e.preventDefault();
            ui.els.buscador.focus();
        } else if (e.key === 'F4') {
            e.preventDefault();
            processSale('efectivo');
        } else if (e.key === 'Escape') {
            ui.hideSearchResults();
        }
    });
}

function setupSearchEvents() {
    // CORRECCIÓN: Usar searchDropdown, no resultados
    const { buscador, searchDropdown } = ui.els;
    const resultados = searchDropdown; // Alias para compatibilidad lógica

    if (!buscador || !resultados) {
        console.error("❌ Elementos de búsqueda no encontrados en el DOM");
        return;
    }

    buscador.addEventListener('input', async (e) => {
        const term = e.target.value;
        selectedDropdownIndex = -1;

        if (term.length < 2) {
            ui.hideSearchResults();
            return;
        }

        let results = productService.searchLocal(term);
        if (results.length === 0) {
            console.log("Buscando remoto...", term);
            results = await productService.searchRemote(term);
        }
        ui.renderSearchResults(results);
    });

    buscador.addEventListener('keydown', (e) => {
        // En SalesUI, los items tienen clase 'search-dropdown-item'
        const items = resultados.querySelectorAll('.search-dropdown-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedDropdownIndex = Math.min(selectedDropdownIndex + 1, items.length - 1);
            updateDropdownSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedDropdownIndex = Math.max(selectedDropdownIndex - 1, 0);
            updateDropdownSelection(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedDropdownIndex >= 0) {
                items[selectedDropdownIndex].click();
            }
        }
    });

    // Delegación de eventos para selección de producto
    resultados.addEventListener('click', (e) => {
        const item = e.target.closest('.search-dropdown-item');
        if (item) {
            const id = item.dataset.id;
            selectProduct(id);
        }
    });

    // Click fuera cierra resultados
    document.addEventListener('click', (e) => {
        if (!buscador.contains(e.target) && !resultados.contains(e.target)) {
            ui.hideSearchResults();
        }
    });
}

function setupFormEvents() {
    // Botones de acción principales
    document.getElementById('btnCobrar')?.addEventListener('click', () => processSale('efectivo'));
    document.getElementById('btnCredito')?.addEventListener('click', () => prepareCreditSale());

    // Botón Aceptar en Modal Abono (Crédito)
    document.getElementById('btnConfirmarAbono')?.addEventListener('click', () => {
        // En SalesUI, el input es inputMontoAbono (montoAbono), verificar ID
        const abonoInput = document.getElementById('montoAbono') || document.getElementById('abonoInicialInput');
        const abono = parseFloat(abonoInput?.value) || 0;
        salesService.setAbono(abono);
        ui.hideModal('modalAbonoInicial');
        processSale('credito');
    });

    // Botones Retiro/Ingreso
    const btnRetiro = document.getElementById('btnRetiro');
    const btnIngreso = document.getElementById('btnIngreso');
    if (btnRetiro) btnRetiro.addEventListener('click', () => ui.showModal('modalRetiro'));
    if (btnIngreso) btnIngreso.addEventListener('click', () => ui.showModal('modalIngreso'));

    document.getElementById('btnConfirmarRetiro')?.addEventListener('click', () => processMovement('retiro'));
    document.getElementById('btnConfirmarIngreso')?.addEventListener('click', () => processMovement('ingreso'));

    // Botón Limpiar Carrito
    const cleanBtn = document.getElementById('cleanCartBtn');
    if (cleanBtn) {
        cleanBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (salesService.cart.length === 0 && !ui.els.equipo.value) {
                ui.els.equipo.focus();
                return;
            }
            if (confirm('¿Limpiar todo el formulario y carrito?')) {
                resetSale();
                salesService.clearTempSale(usuarioLogueado);
                ui.els.equipo.focus();
            }
        });
    }

    // Eventos del carrito (CORRECCIÓN DE CLASES)
    const listaCarrito = ui.els.cartItems; // Usar referencia de UI, más seguro
    if (listaCarrito) {
        listaCarrito.addEventListener('input', (e) => {
            // Clases según SalesUI: .cart-cantidad, .cart-precio
            if (e.target.classList.contains('cart-cantidad') || e.target.classList.contains('cart-precio')) {
                const index = parseInt(e.target.dataset.index);
                const val = parseFloat(e.target.value) || 0;

                if (e.target.classList.contains('cart-cantidad')) {
                    salesService.updateCartItemQuantity(index, val);
                } else {
                    salesService.updateCartItemPrice(index, val);
                }
                ui.renderCart(salesService.cart, salesService.total, salesService.totalQuantity);
                autoSave();
            }
        });

        // Delegación para botón remover (clase .delete-item-btn según SalesUI)
        listaCarrito.addEventListener('click', (e) => {
            const btn = e.target.closest('.delete-item-btn');
            if (btn) {
                const itemDiv = btn.closest('.cart-item');
                const index = parseInt(itemDiv.dataset.index);

                if (!isNaN(index)) {
                    salesService.removeFromCart(index);
                    updateCartView();
                    autoSave();
                }
            }
        });
    }
}

function setupHeaderButtons() {
    // Botón Swap
    const swapBtn = document.getElementById('swapBtn');
    const ventaWrapper = document.getElementById('ventaWrapper');
    if (swapBtn && ventaWrapper) {
        swapBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log("Swap ejecutado");
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
            console.log("Menu click", menuOperaciones.classList.contains('active'));
            if (menuOperaciones.style.display === 'block') {
                menuOperaciones.style.display = 'none';
                menuOperaciones.classList.remove('active');
            } else {
                menuOperaciones.style.display = 'block';
                menuOperaciones.classList.add('active');
            }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown-menu-container')) {
                menuOperaciones.style.display = 'none';
                menuOperaciones.classList.remove('active');
            }
        });
    }

    // Mobile Menu
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener('click', () => {
            // Toggle simple de clase active, asegurar que CSS lo maneja
            mobileMenu.classList.toggle('active');
        });
    }
}

// --- Logic Helpers ---

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
    let product = await productService.getProductById(id);

    // Fallback simple si no está en memoria local (ej. Servicios remotos)
    if (!product) {
        // Buscar en resultados del DOM si es un hack rápido necesario
        // O simplemente asumir que si vino del click, existe en algún lado.
        // Re-consultar searchRemote para obtener el objeto completo si id es string
        const remoteResults = await productService.searchRemote(id); // Si id coincide con algo buscable
        // Esto es difícil si solo tenemos ID.
        // Asumiremos que searchRemote cacheó algo o que productService lo maneja.
        // Si falla, alertamos.
        if (!product) {
            console.warn("Producto no encontrado en cache. ID:", id);
            // Intento de llamar a searchRemote de nuevo con el ID si es un código
            // Limitación actual: Si es servicio sin persistencia, necesitamos el objeto.
        }
    }

    if (!product) {
        alert("Error cargando detalles del producto. Intente buscar de nuevo.");
        return;
    }

    if (product.existencia <= 0 && product.tipo !== 'servicio') {
        alert("❌ Producto sin existencia");
        return;
    }

    const qtyInput = prompt(`Cantidad para: ${product.descripcionTaller}\n\nExistencia disponible: ${product.existencia}`, "1");
    if (qtyInput === null) {
        ui.els.buscador.focus();
        return;
    }

    const qty = parseInt(qtyInput) || 1;
    if (qty <= 0) return;

    if (product.tipo !== 'servicio' && qty > product.existencia) {
        alert(`❌ Solo hay ${product.existencia} unidades disponibles`);
        return;
    }

    salesService.addToCart(product, qty);
    updateCartView();
    ui.hideSearchResults();
    ui.els.buscador.value = "";
    ui.showNotification(product.descripcionTaller, product.precioVenta, qty);
    autoSave();

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

    if (type === 'efectivo' && salesService.cart.some(i => i.precio === 0)) {
        alert("❌ Productos con precio $0 requieren venta a CRÉDITO.");
        return;
    }

    try {
        await salesService.saveSale(type, formData, usuarioLogueado);
        ui.showModal('modalExito');
        resetSale();
        loadMiniHistory();
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

    if (!monto || !concepto) return;

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

    const groups = {};
    sales.forEach(s => {
        const equipo = s.equipo === '0' ? 'CLIENTE GENERAL' : s.equipo;
        const ciudad = s.ciudad && s.ciudad !== 'LOCAL' ? s.ciudad : '';
        const key = ciudad ? `${equipo}-${ciudad}` : equipo;

        if (!groups[key]) {
            groups[key] = { equipo, ciudad, total: 0 };
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

    // IMPORTANTE: Asegurar que el modal existe antes de operar
    if (!modal || !lista) {
        console.error("Modal de facturas no encontrado en DOM");
        return;
    }

    const ciudadTexto = ciudad && ciudad !== 'LOCAL' ? ` - ${ciudad}` : '';
    titulo.textContent = `Facturas del Equipo ${equipo}${ciudadTexto}`;

    lista.innerHTML = '<p style="text-align:center;padding:20px;">Cargando historial...</p>';
    modal.style.display = 'flex';

    try {
        const facturas = await salesService.getSalesByTeam(equipo, ciudad);

        if (facturas.length === 0) {
            lista.innerHTML = '<p style="text-align:center;padding:20px;color:#666;">No hay facturas registradas.</p>';
            return;
        }

        lista.innerHTML = facturas.map(f => {
            const esPendiente = f.saldoPendiente > 0;
            const colorEstado = esPendiente ? '#f59e0b' : '#10b981';
            const estadoTexto = esPendiente ? '⏳ Pendiente' : '✅ Pagado';

            return `
            <div class="factura-item" style="background: #f8f9fa; padding: 15px; margin-bottom: 10px; border-radius: 8px; border-left: 4px solid ${colorEstado}; position: relative;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <strong>${f.tipo === 'credito' ? '💳 CRÉDITO' : '💵 EFECTIVO'}</strong>
                    <span style="color: #666; font-size: 0.9rem;">${new Date(f.fecha.seconds * 1000).toLocaleString()}</span>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.9rem;">
                    <div><strong>Total:</strong> $${f.total.toFixed(2)}</div>
                    <div><strong>Abono:</strong> $${f.abonoInicial.toFixed(2)}</div>
                    <div><strong>Saldo:</strong> <span style="color: ${colorEstado}; font-weight: bold;">$${f.saldoPendiente.toFixed(2)}</span></div>
                    <div><strong>Estado:</strong> ${estadoTexto}</div>
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

                <div class="factura-acciones" style="margin-top: 15px; display: flex; gap: 10px; justify-content: flex-end;">
                    ${esPendiente ? `
                        <button onclick="abonarFactura('${f.id}', ${f.saldoPendiente})" class="btn-mini" style="background: #10b981; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">
                            <i class="fas fa-money-bill-wave"></i> Abonar
                        </button>
                    ` : ''}
                    <button onclick="imprimirFactura('${f.id}')" class="btn-mini" style="background: #3b82f6; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">
                        <i class="fas fa-print"></i>
                    </button>
                    ${esPendiente ? `
                    <button onclick="borrarFactura('${f.id}')" class="btn-mini" style="background: #ef4444; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">
                        <i class="fas fa-trash"></i>
                    </button>
                    ` : ''}
                </div>
            </div>
        `}).join('');

    } catch (error) {
        console.error('Error cargando historial:', error);
        lista.innerHTML = '<p style="text-align:center;padding:20px;color:#ef4444;">Error al cargar el historial.</p>';
    }
}

function resetSale() {
    salesService.clearCart();
    ui.clearForm();
    updateCartView();
}

window.abonarFactura = (ventaId, saldoActual) => {
    const monto = prompt(`Saldo pendiente: $${saldoActual.toFixed(2)}\nIngrese monto a abonar:`);
    if (monto && !isNaN(monto) && parseFloat(monto) > 0) {
        alert(`PENDIENTE: Implementar abono de $${monto} a venta ${ventaId}`);
    }
};

window.borrarFactura = (ventaId) => {
    if (confirm("¿Estás seguro de eliminar esta factura?")) {
        alert(`PENDIENTE: Implementar borrado de venta ${ventaId}`);
    }
};

window.imprimirFactura = (ventaId) => {
    alert(`PENDIENTE: Reimpresión de venta ${ventaId}`);
};

window.cerrarExito = () => ui.hideModal('modalExito');
window.cerrarError = () => ui.hideModal('modalError');

// Init
document.addEventListener('DOMContentLoaded', init);
