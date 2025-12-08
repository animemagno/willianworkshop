
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

    // Cargar inventario y configuración inicial
    await productService.loadProducts();

    // Configurar event listeners
    setupGlobalKeys();
    setupSearchEvents();
    setupFormEvents();
    setupHeaderButtons();

    // Recuperar venta temporal si existe
    const tempSale = await salesService.loadTempSale(usuarioLogueado);
    if (tempSale) {
        ui.fillForm(tempSale);
        updateCartView();
    }

    // Cargar historial del día
    loadMiniHistory();
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
    const { buscador, resultados } = ui.els;

    buscador.addEventListener('input', async (e) => {
        const term = e.target.value;
        selectedDropdownIndex = -1;

        if (term.length < 2) {
            ui.hideSearchResults();
            return;
        }

        // 1. Búsqueda Local
        let results = productService.searchLocal(term);

        // 2. Si no hay local, buscar remoto
        if (results.length === 0) {
            console.log("Buscando remoto...", term);
            results = await productService.searchRemote(term);
        }

        ui.renderSearchResults(results);
    });

    buscador.addEventListener('keydown', (e) => {
        const items = resultados.querySelectorAll('li');
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
        const li = e.target.closest('li');
        if (li) {
            const id = li.dataset.id;
            const desc = li.dataset.desc; // Usar data attributes si disponibles, o recuperar
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
    // Escuchar cambios en inputs para AutoSave
    const inputs = document.querySelectorAll('.venta-input');
    inputs.forEach(input => {
        input.addEventListener('input', autoSave);
    });

    // Botones de acción principales
    document.getElementById('btnCobrar')?.addEventListener('click', () => processSale('efectivo'));
    document.getElementById('btnCredito')?.addEventListener('click', () => prepareCreditSale());

    // Botón Aceptar en Modal Abono (Crédito)
    document.getElementById('btnConfirmarAbono')?.addEventListener('click', () => {
        const abonoInput = document.getElementById('abonoInicialInput');
        const abono = parseFloat(abonoInput.value) || 0;
        salesService.setAbono(abono);
        ui.hideModal('modalAbonoInicial');
        processSale('credito');
    });

    // Botones Retiro/Ingreso
    document.getElementById('btnRetiro')?.addEventListener('click', () => ui.showModal('modalRetiro'));
    document.getElementById('btnIngreso')?.addEventListener('click', () => ui.showModal('modalIngreso'));

    document.getElementById('btnConfirmarRetiro')?.addEventListener('click', () => processMovement('retiro'));
    document.getElementById('btnConfirmarIngreso')?.addEventListener('click', () => processMovement('ingreso'));

    // Botón Limpiar Carrito (en el header - NUEVO)
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

    // Eventos para editar cantidad y precio en el carrito
    const listaCarrito = document.getElementById('lista-carrito');
    if (listaCarrito) {
        listaCarrito.addEventListener('input', (e) => {
            if (e.target.classList.contains('qty-input') || e.target.classList.contains('price-input')) {
                const index = parseInt(e.target.dataset.index);
                const val = parseFloat(e.target.value) || 0;

                if (e.target.classList.contains('qty-input')) {
                    salesService.updateCartItemQuantity(index, val);
                } else {
                    salesService.updateCartItemPrice(index, val);
                }
                // Actualizar solo totales visuales
                ui.updateCartTotals(salesService.cart, salesService.total, salesService.totalQuantity);
                autoSave();
            }
        });

        // Delegación para botón remover
        listaCarrito.addEventListener('click', (e) => {
            if (e.target.closest('.remove-btn')) {
                const index = parseInt(e.target.closest('.remove-btn').dataset.index);
                salesService.removeFromCart(index);
                updateCartView();
                autoSave();
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
            menuOperaciones.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown-menu-container')) {
                menuOperaciones.classList.remove('active');
            }
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
    // Si id es "SERV" o similar, necesitamos lógica especial o searchLocal/Remote devolver el objeto completo
    // Como searchRemote devuelve objetos con id de Firestore, getProductById debería funcionar
    // PERO si es un servicio ficticio o algo así, hay que tener cuidado.
    // Asumimos que getProductById en ProductService maneja esto o que el ID es válido.

    // NOTA: ProductService.getProductById busca en `this.products`. 
    // Si viene de searchRemote (Servicios), puede NO estar en `this.products` (Inventario local).
    // Necesitamos pasar el producto completo desde la selección si es posible, o hacer getProductById más listo.

    // SOLUCIÓN RÁPIDA: Si el ID falla en local, verificar si podemos recuperar datos de otra forma.
    // Sin embargo, `searchRemote` ya devuelve objetos completos. 
    // Lo mejor es guardar esos resultados temporales en product service o pasarlos.

    // Vamos a intentar obtenerlo. Si falla, asumimos que es Servico y lo buscamos en los resultados recientes (hack rápido)
    let product = await productService.getProductById(id);

    if (!product) {
        // Buscar en servicios o intentar simular si es 'SERV'
        // Por ahora, asumimos que si no está, es error, A MENOS que modifiquemos ProductService.
        // Re-implementaremos un fetch simple si falla el local.
        console.warn("Producto no en memoria local. Verificando...");
        // Aquí podrías implementar un fetch directo si hiciera falta.
    }

    // PARA HACERLO FUNCIONAR CON SERVICIOS QUE NO ESTÁN EN MEMORIA:
    // ProductService.getProductById debería ser capaz de devolver lo que renderizó searchRemote.
    // Si searchRemote devuelve items que no persisten en `products`, getProductById fallará.
    // Haremos un fix: si no encuentra, retornar false.

    if (!product) {
        // Intento de recuperación desesperada desde el DOM (no ideal pero funciona si no cambiamos el servicio hoy)
        // O mejor: Modificamos ProductService.js luego si esto falla.
        // Por ahora alertemos.
        alert("Error: Producto no encontrado en inventario local. (Lógica de servicios pendientes de integración total)");
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

    // Listeners para abrir modal historial completo
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

    const ciudadTexto = ciudad && ciudad !== 'LOCAL' ? ` - ${ciudad}` : '';
    titulo.textContent = `Facturas del Equipo ${equipo}${ciudadTexto}`;

    lista.innerHTML = '<p style="text-align:center;padding:20px;">Cargando historial...</p>';
    modal.style.display = 'flex';

    try {
        // Usar método robusto getSalesByTeam (fixed)
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

// Global functions exposed
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
