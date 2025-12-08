
import { productService, salesService, ui, usuarioLogueado } from "../init.js";

let selectedDropdownIndex = -1;

async function init() {
    console.log("🚀 VentasController Check -> Usuario:", usuarioLogueado);

    // Cargar inventario y configuración inicial
    await productService.loadProducts();

    // Eventos de teclado global (F2, F4, Escape)
    document.addEventListener('keydown', handleGlobalKeys);

    // Eventos del buscador (Input, Keydown, Click fuera)
    setupSearchEvents();

    // Eventos del formulario (Submit)
    setupFormEvents();

    // Recuperar venta temporal si existe
    const tempSale = await salesService.loadTempSale(usuarioLogueado);
    if (tempSale) {
        ui.fillForm(tempSale);
        updateCartView();
    }

    // Cargar historial del día
    loadMiniHistory();

    // Eventos Botones Clave
    setupHeaderButtons();
}

function handleGlobalKeys(e) {
    if (e.key === 'F2') {
        e.preventDefault();
        ui.els.buscador.focus();
    } else if (e.key === 'F4') {
        e.preventDefault();
        processSale('efectivo');
    } else if (e.key === 'Escape') {
        ui.hideSearchResults();
    }
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

    // Botón Limpiar Carrito (en el header)
    document.getElementById('cleanCartBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (salesService.cart.length === 0 && !ui.els.equipo.value) {
            ui.els.equipo.focus();
            return;
        }

        if (confirm('¿Limpiar todo el formulario y carrito?')) {
            salesService.clearCart();
            salesService.clearTempSale(usuarioLogueado);
            ui.clearForm();
            updateCartView();
            ui.els.equipo.focus();
        }
    });

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
                // Actualizar solo totales visuales sin redibujar todo para no perder foco
                ui.updateCartTotals(salesService.cart, salesService.total, salesService.totalQuantity);
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

    // Servicios (existencia 999) o productos normales
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
    lista.innerHTML = '<p style="text-align:center;padding:20px;">Cargando historial...</p>';
    modal.style.display = 'flex';

    try {
        // Obtener historial completo del equipo
        const facturas = await salesService.getSalesByTeam(equipo, ciudad);

        if (facturas.length === 0) {
            lista.innerHTML = '<p style="text-align:center;padding:20px;color:#666;">No hay facturas registradas para este equipo.</p>';
            return;
        }

        // Renderizar facturas
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

// Funciones globales para botones
window.abonarFactura = (ventaId, saldoActual) => {
    const monto = prompt(`Saldo pendiente: $${saldoActual.toFixed(2)}\nIngrese monto a abonar:`);
    if (monto && !isNaN(monto) && parseFloat(monto) > 0) {
        // Implementar lógica de abono aquí (requerirá updateDoc)
        alert(`PENDIENTE: Implementar abono de $${monto} a ${ventaId}`);
    }
};

window.borrarFactura = (ventaId) => {
    if (confirm("¿Estás seguro de eliminar esta factura?")) {
        alert(`PENDIENTE: Implementar borrado de ${ventaId}`);
    }
};

window.imprimirFactura = (ventaId) => {
    alert(`PENDIENTE: Reimpresión de ${ventaId}`);
};

// Global exposure for simple button onclicks if necessary
window.cerrarExito = () => ui.hideModal('modalExito');
window.cerrarError = () => ui.hideModal('modalError');

// Init
document.addEventListener('DOMContentLoaded', init);
