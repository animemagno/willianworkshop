// ventas.js - CORREGIDO con búsqueda en base de datos
import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ---------- estado ---------- */
let carrito = [];
let total = 0;
let cantidadTotal = 0;
let idFactura = null;
let tipoOriginal = "efectivo";
let itemAEliminar = null;
let abonoInicial = 0;
let saldoPendiente = 0;
let productosInventario = [];
let timeoutBusqueda = null;

/* ---------- CLAVE PARA GUARDAR LOCALMENTE ---------- */
const VENTA_GARDADA_KEY = 'ventaEnProgreso';

/* ---------- CARGAR PRODUCTOS DEL INVENTARIO ---------- */
async function cargarProductosInventario() {
    try {
        const querySnapshot = await getDocs(collection(db, "inventario"));
        productosInventario = [];
        querySnapshot.forEach((doc) => {
            const producto = doc.data();
            productosInventario.push({
                id: doc.id,
                codigo: producto.codigo || "",
                descripcionTaller: producto.descripcionTaller || "",
                descripcionFactura: producto.descripcionFactura || "",
                precioVenta: producto.precioVenta || 0,
                existencia: producto.existencia || 0
            });
        });
        console.log("Productos cargados:", productosInventario.length);
    } catch (error) {
        console.error("Error cargando inventario:", error);
    }
}

/* ---------- BUSCAR PRODUCTOS EN BASE DE DATOS ---------- */
async function buscarProductosEnBaseDatos(termino) {
    try {
        if (!termino || termino.length < 2) {
            return [];
        }
        
        const terminoLower = termino.toLowerCase().trim();
        const resultados = [];
        const idsAgregados = new Set();

        // Buscar por código (exacto)
        const qCodigo = query(
            collection(db, "inventario"),
            where("codigo", ">=", terminoLower),
            where("codigo", "<=", terminoLower + '\uf8ff')
        );
        
        const snapshotCodigo = await getDocs(qCodigo);
        snapshotCodigo.forEach(doc => {
            const producto = { id: doc.id, ...doc.data() };
            if (!idsAgregados.has(producto.id)) {
                resultados.push({...producto, tipoBusqueda: "Código"});
                idsAgregados.add(producto.id);
            }
        });

        // Buscar por descripción taller
        const qTaller = query(
            collection(db, "inventario"),
            where("descripcionTaller", ">=", terminoLower),
            where("descripcionTaller", "<=", terminoLower + '\uf8ff')
        );
        
        const snapshotTaller = await getDocs(qTaller);
        snapshotTaller.forEach(doc => {
            const producto = { id: doc.id, ...doc.data() };
            if (!idsAgregados.has(producto.id)) {
                resultados.push({...producto, tipoBusqueda: "Descripción Taller"});
                idsAgregados.add(producto.id);
            }
        });

        // Buscar por descripción factura
        const qFactura = query(
            collection(db, "inventario"),
            where("descripcionFactura", ">=", terminoLower),
            where("descripcionFactura", "<=", terminoLower + '\uf8ff')
        );
        
        const snapshotFactura = await getDocs(qFactura);
        snapshotFactura.forEach(doc => {
            const producto = { id: doc.id, ...doc.data() };
            if (!idsAgregados.has(producto.id)) {
                resultados.push({...producto, tipoBusqueda: "Descripción Factura"});
                idsAgregados.add(producto.id);
            }
        });

        return resultados.slice(0, 10); // Limitar a 10 resultados

    } catch (error) {
        console.error("Error en búsqueda:", error);
        // Fallback a búsqueda local si hay error
        return buscarProductosLocal(termino);
    }
}

/* ---------- BÚSQUEDA LOCAL (FALLBACK) ---------- */
function buscarProductosLocal(termino) {
    if (!termino || termino.length < 2) {
        return [];
    }
    
    const terminoLower = termino.toLowerCase().trim();
    const resultados = [];
    const idsAgregados = new Set();
    
    // Buscar en productos ya cargados
    productosInventario.forEach(producto => {
        const matchesCodigo = producto.codigo && producto.codigo.toLowerCase().includes(terminoLower);
        const matchesTaller = producto.descripcionTaller && producto.descripcionTaller.toLowerCase().includes(terminoLower);
        const matchesFactura = producto.descripcionFactura && producto.descripcionFactura.toLowerCase().includes(terminoLower);
        
        if ((matchesCodigo || matchesTaller || matchesFactura) && !idsAgregados.has(producto.id)) {
            let tipoBusqueda = "";
            if (matchesCodigo) tipoBusqueda = "Código";
            else if (matchesTaller) tipoBusqueda = "Descripción Taller";
            else if (matchesFactura) tipoBusqueda = "Descripción Factura";
            
            resultados.push({...producto, tipoBusqueda});
            idsAgregados.add(producto.id);
        }
    });
    
    return resultados.slice(0, 10);
}

/* ---------- MOSTRAR RESULTADOS DE BÚSQUEDA ---------- */
function mostrarResultadosBusqueda(resultados) {
    const dropdown = document.getElementById("search-dropdown");
    if (!dropdown) return;
    
    if (resultados.length === 0) {
        dropdown.innerHTML = '<div class="search-dropdown-item">No se encontraron productos</div>';
        dropdown.style.display = 'block';
        return;
    }
    
    dropdown.innerHTML = resultados.map(producto => `
        <div class="search-dropdown-item" data-producto-id="${producto.id}">
            <div style="font-weight: bold;">${producto.descripcionTaller || 'Sin descripción'}</div>
            ${producto.descripcionFactura ? `<div style="font-size: 0.8rem; color: #666;">${producto.descripcionFactura}</div>` : ''}
            <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                <span style="font-size: 0.8rem;">Código: ${producto.codigo || 'N/A'}</span>
                <span style="font-weight: bold; color: #27ae60;">$${(producto.precioVenta || 0).toFixed(2)}</span>
            </div>
            <div style="font-size: 0.7rem; color: ${(producto.existencia || 0) > 0 ? '#27ae60' : '#e74c3c'};">
                Existencia: ${producto.existencia || 0} | Búsqueda: ${producto.tipoBusqueda}
            </div>
        </div>
    `).join('');
    
    dropdown.style.display = 'block';
    
    // Agregar event listeners a los items
    dropdown.querySelectorAll('.search-dropdown-item').forEach(item => {
        item.addEventListener('click', function() {
            seleccionarProducto(this.getAttribute('data-producto-id'));
        });
    });
}

/* ---------- SELECCIONAR PRODUCTO ---------- */
async function seleccionarProducto(productoId) {
    try {
        // Obtener datos actualizados del producto
        const docRef = doc(db, "inventario", productoId);
        const docSnap = await getDoc(docRef);
        
        if (!docSnap.exists()) {
            alert("❌ Producto no encontrado en inventario");
            cerrarDropdownBusqueda();
            return;
        }
        
        const producto = { id: docSnap.id, ...docSnap.data() };
        
        // Validar existencia
        if ((producto.existencia || 0) <= 0) {
            alert("❌ Producto sin existencia disponible");
            cerrarDropdownBusqueda();
            return;
        }
        
        const cantidadInput = document.getElementById("cantidad");
        const cantidad = parseInt(cantidadInput.value) || 1;
        
        // Validar cantidad
        if (cantidad <= 0) {
            alert("❌ La cantidad debe ser mayor a 0");
            return;
        }
        
        // Validar que no exceda existencia
        if (cantidad > (producto.existencia || 0)) {
            alert(`❌ Solo hay ${producto.existencia} unidades disponibles`);
            return;
        }
        
        // Prevenir productos duplicados en el carrito
        const productoExistente = carrito.find(item => item.id === productoId);
        if (productoExistente) {
            if (confirm("⚠️ Este producto ya está en el carrito. ¿Quieres agregar más cantidad?")) {
                // Actualizar cantidad del producto existente
                const index = carrito.indexOf(productoExistente);
                const nuevaCantidad = productoExistente.cantidad + cantidad;
                
                if (nuevaCantidad > producto.existencia) {
                    alert(`❌ No hay suficiente existencia. Máximo: ${producto.existencia}`);
                    return;
                }
                
                carrito[index].cantidad = nuevaCantidad;
                carrito[index].subtotal = nuevaCantidad * productoExistente.precio;
                
                // Recalcular totales
                total = carrito.reduce((sum, item) => sum + item.subtotal, 0);
                cantidadTotal = carrito.reduce((sum, item) => sum + item.cantidad, 0);
                
                if (window.actualizarCarrito) {
                    window.actualizarCarrito(true);
                }
                
                mostrarNotificacionProducto(producto.descripcionTaller, producto.precioVenta, cantidad);
                guardarVentaAutomaticamente();
            }
            cerrarDropdownBusqueda();
            return;
        }
        
        // Agregar nuevo producto al carrito
        agregarProducto(
            producto.descripcionTaller || "Producto sin nombre",
            producto.precioVenta || 0,
            cantidad,
            producto.id,
            producto.descripcionFactura
        );
        
        cerrarDropdownBusqueda();
        
    } catch (error) {
        console.error("Error seleccionando producto:", error);
        alert("❌ Error al cargar producto: " + error.message);
    }
}

/* ---------- CERRAR DROPDOWN DE BÚSQUEDA ---------- */
function cerrarDropdownBusqueda() {
    const dropdown = document.getElementById("search-dropdown");
    if (dropdown) {
        dropdown.style.display = 'none';
    }
}

/* ---------- NOTIFICACIÓN DE PRODUCTO AGREGADO ---------- */
function mostrarNotificacionProducto(desc, precio, cantidad) {
    const notificacion = document.getElementById("notificacionProducto");
    const nombreElement = document.getElementById("notificacionNombre");
    const detallesElement = document.getElementById("notificacionDetalles");
    
    if (!notificacion || !nombreElement || !detallesElement) return;
    
    nombreElement.textContent = desc;
    detallesElement.textContent = `Cantidad: ${cantidad} - $${precio.toFixed(2)} c/u`;
    
    notificacion.classList.add("mostrar");
    
    setTimeout(() => {
        notificacion.classList.remove("mostrar");
    }, 2000);
}

/* ---------- GUARDAR VENTA AUTOMÁTICAMENTE ---------- */
function guardarVentaAutomaticamente() {
    const equipoInput = document.getElementById("equipo");
    const clienteInput = document.getElementById("cliente");
    
    if (!equipoInput || !clienteInput) return;
    
    const ventaData = {
        equipo: equipoInput.value || "",
        cliente: clienteInput.value || "",
        carrito: carrito,
        total: total,
        cantidadTotal: cantidadTotal,
        fechaGuardado: new Date().toISOString(),
        idFactura: idFactura,
        abonoInicial: abonoInicial,
        saldoPendiente: saldoPendiente
    };
    
    localStorage.setItem(VENTA_GUARDADA_KEY, JSON.stringify(ventaData));
    guardarVentaEnFirebase(ventaData);
}

/* ---------- GUARDAR EN FIREBASE ---------- */
async function guardarVentaEnFirebase(ventaData) {
    try {
        const usuario = localStorage.getItem('usuarioLogueado');
        if (!usuario) return;
        
        const docRef = doc(db, "ventasTemporales", usuario);
        await setDoc(docRef, {
            ...ventaData,
            usuario: usuario,
            ultimaActualizacion: serverTimestamp()
        });
        console.log("Venta guardada en Firebase");
    } catch (error) {
        console.log("Error guardando en Firebase:", error);
    }
}

/* ---------- CARGAR VENTA GUARDADA ---------- */
async function cargarVentaGuardada() {
    const ventaLocal = localStorage.getItem(VENTA_GUARDADA_KEY);
    
    if (ventaLocal) {
        const ventaData = JSON.parse(ventaLocal);
        const fechaGuardado = new Date(ventaData.fechaGuardado);
        const hoy = new Date();
        
        if (fechaGuardado.toDateString() === hoy.toDateString()) {
            aplicarVentaGuardada(ventaData);
            return true;
        } else {
            limpiarVentaGuardada();
        }
    }
    
    return await cargarVentaDesdeFirebase();
}

/* ---------- CARGAR DESDE FIREBASE ---------- */
async function cargarVentaDesdeFirebase() {
    try {
        const usuario = localStorage.getItem('usuarioLogueado');
        if (!usuario) return false;
        
        const docRef = doc(db, "ventasTemporales", usuario);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const ventaData = docSnap.data();
            const fechaGuardado = ventaData.fechaGuardado ? new Date(ventaData.fechaGuardado) : new Date();
            const hoy = new Date();
            
            if (fechaGuardado.toDateString() === hoy.toDateString()) {
                aplicarVentaGuardada(ventaData);
                return true;
            } else {
                limpiarVentaGuardada();
            }
        }
    } catch (error) {
        console.log("Error cargando desde Firebase:", error);
    }
    return false;
}

/* ---------- APLICAR VENTA GUARDADA ---------- */
function aplicarVentaGuardada(ventaData) {
    const equipoInput = document.getElementById("equipo");
    const clienteInput = document.getElementById("cliente");
    
    if (!equipoInput || !clienteInput) {
        setTimeout(() => aplicarVentaGuardada(ventaData), 100);
        return;
    }
    
    if (ventaData.equipo) equipoInput.value = ventaData.equipo;
    if (ventaData.cliente) clienteInput.value = ventaData.cliente;
    
    if (ventaData.carrito && ventaData.carrito.length > 0) {
        carrito = ventaData.carrito;
        total = ventaData.total || 0;
        cantidadTotal = ventaData.cantidadTotal || 0;
        abonoInicial = ventaData.abonoInicial || 0;
        saldoPendiente = ventaData.saldoPendiente || total;
        
        if (window.actualizarCarrito) {
            window.actualizarCarrito(false);
        }
    }
    
    if (ventaData.idFactura) {
        idFactura = ventaData.idFactura;
    }
}

/* ---------- LIMPIAR VENTA GUARDADA ---------- */
function limpiarVentaGuardada() {
    localStorage.removeItem(VENTA_GUARDADA_KEY);
    const usuario = localStorage.getItem('usuarioLogueado');
    if (usuario) {
        const docRef = doc(db, "ventasTemporales", usuario);
        setDoc(docRef, {}).catch(() => {});
    }
}

/* ---------- VALIDAR NUMERO DE EQUIPO ---------- */
function validarNumeroEquipo(equipo) {
    if (!equipo) return false;
    
    // Debe tener exactamente 3 dígitos numéricos
    const regex = /^\d{3}$/;
    return regex.test(equipo);
}

/* ---------- VERIFICAR SI HAY PRECIOS CERO ---------- */
function hayPreciosCero() {
    return carrito.some(item => item.precio === 0);
}

/* ---------- MODALES ---------- */
function mostrarModalAbonoInicial() {
    // Si hay precios cero, no permitir abono
    if (hayPreciosCero()) {
        alert("⚠️ No se permite abono cuando hay productos con precio $0. Se guardará como crédito puro.");
        guardarVentaCredito(false);
        return;
    }
    
    document.getElementById("modalAbonoInicial").style.display = 'flex';
}

function cerrarAbonoInicial() {
    document.getElementById("modalAbonoInicial").style.display = 'none';
}

function mostrarModalMontoAbono() {
    const modal = document.getElementById("modalMontoAbono");
    document.getElementById("abonoTotal").textContent = `$${total.toFixed(2)}`;
    document.getElementById("montoAbono").value = "";
    document.getElementById("abonoMonto").textContent = "$0.00";
    document.getElementById("abonoSaldo").textContent = `$${total.toFixed(2)}`;
    modal.style.display = 'flex';
    
    setTimeout(() => {
        document.getElementById("montoAbono").focus();
    }, 300);
}

function cerrarMontoAbono() {
    document.getElementById("modalMontoAbono").style.display = 'none';
}

function actualizarCalculoAbono() {
    const montoInput = document.getElementById("montoAbono");
    const monto = parseFloat(montoInput.value) || 0;
    const maxMonto = total;
    
    if (monto > maxMonto) {
        montoInput.value = maxMonto.toFixed(2);
        monto = maxMonto;
    }
    
    abonoInicial = monto;
    saldoPendiente = total - monto;
    
    document.getElementById("abonoMonto").textContent = `$${abonoInicial.toFixed(2)}`;
    document.getElementById("abonoSaldo").textContent = `$${saldoPendiente.toFixed(2)}`;
}

function confirmarAbonoInicial() {
    const monto = parseFloat(document.getElementById("montoAbono").value) || 0;
    
    if (monto <= 0) {
        alert("❌ Ingrese un monto válido para el abono");
        return;
    }
    
    if (monto > total) {
        alert("❌ El abono no puede ser mayor al total de la venta");
        return;
    }
    
    cerrarMontoAbono();
    cerrarAbonoInicial();
    guardarVentaCredito(true);
}

function guardarVentaCredito(conAbono = false) {
    if (!conAbono) {
        abonoInicial = 0;
        saldoPendiente = total;
    }
    
    tipoOriginal = "credito";
    guardarVenta("credito");
}

/* ---------- GUARDAR VENTA (CON VALIDACIONES) ---------- */
async function guardarVenta(tipoBoton) {
    const eq = document.getElementById("equipo")?.value.trim();
    
    // Validar número de equipo
    if (!eq) {
        alert("❌ Ingresá el número de equipo");
        return;
    }
    
    if (!validarNumeroEquipo(eq)) {
        alert("❌ El número de equipo debe tener exactamente 3 dígitos numéricos");
        return;
    }
    
    if (carrito.length === 0) {
        alert("❌ Agregá al menos un producto");
        return;
    }

    // Validar precios cero en efectivo
    if (tipoBoton === "efectivo" && hayPreciosCero()) {
        alert("❌ No se puede vender en efectivo con productos a precio $0. Usá crédito.");
        return;
    }

    const cliente = document.getElementById("cliente")?.value.trim() || "";
    const esLocal = cliente === "";

    const venta = {
        equipo: eq,
        cliente: esLocal ? "LOCAL" : cliente,
        ciudad: cliente,
        esLocal: esLocal,
        tipo: tipoOriginal,
        items: carrito,
        total,
        cantidadTotal,
        abonoInicial: abonoInicial,
        saldoPendiente: saldoPendiente,
        fecha: serverTimestamp()
    };

    try {
        // GUARDAR POR NUMERO DE EQUIPO
        const idVenta = `equipo_${eq}_${Date.now()}`;
        await setDoc(doc(db, "ventas", idVenta), venta);
        
        limpiarVentaGuardada();
        limpiarTodo();
        alert("✅ Venta guardada correctamente");
        
        // ACTUALIZAR HISTORIAL EN TIEMPO REAL
        await cargarMiniHistorial();
        
    } catch (e) {
        console.error("Error:", e);
        alert("❌ Error al guardar: " + (e.message || "Inténtalo de nuevo"));
    }
}

/* ---------- LIMPIAR TODO ---------- */
function limpiarTodo() {
    carrito = []; 
    total = 0; 
    cantidadTotal = 0;
    abonoInicial = 0;
    saldoPendiente = 0;
    
    const equipoInput = document.getElementById("equipo");
    const clienteInput = document.getElementById("cliente");
    const buscarInput = document.getElementById("buscar-producto");
    
    if (equipoInput) equipoInput.value = "";
    if (clienteInput) clienteInput.value = "";
    if (buscarInput) buscarInput.value = "";
    
    idFactura = null;
    
    if (window.actualizarCarrito) {
        window.actualizarCarrito(false);
    }
    
    cerrarDropdownBusqueda();
}

/* ---------- CARRITO ---------- */
function agregarProducto(desc, precio, cantidad, productoId = null, descFactura = null) {
    const sub = precio * cantidad;
    const item = { 
        desc, 
        precio, 
        cantidad, 
        subtotal: sub,
        id: productoId,
        descFactura: descFactura || desc
    };
    
    carrito.push(item);
    total += sub;
    cantidadTotal += cantidad;
    
    if (window.actualizarCarrito) {
        window.actualizarCarrito(true);
    }
    
    mostrarNotificacionProducto(desc, precio, cantidad);
    guardarVentaAutomaticamente();
}

/* ---------- ACTUALIZAR CARRITO (GLOBAL) ---------- */
window.actualizarCarrito = function(mostrarAnimacion = false) {
    const cartItems = document.getElementById("cart-items");
    const cartTotal = document.getElementById("cart-total");
    const cartResumen = document.getElementById("cart-resumen");
    const cartBadge = document.getElementById("cart-badge");
    
    if (!cartItems || !cartTotal || !cartResumen) return;
    
    // Actualizar badge
    if (cartBadge) {
        cartBadge.textContent = cantidadTotal;
        cartBadge.style.display = cantidadTotal > 0 ? 'flex' : 'none';
    }
    
    if (carrito.length === 0) {
        cartItems.innerHTML = `
            <div class="empty-cart">
                <i class="fas fa-shopping-cart" style="font-size:2rem;margin-bottom:10px;opacity:.5;"></i>
                <div>No hay productos agregados</div>
            </div>
        `;
        cartTotal.textContent = "$0.00";
        cartResumen.textContent = "Productos: 0 | Total: ";
        return;
    }
    
    cartItems.innerHTML = carrito.map((item, index) => `
        <div class="cart-item ${mostrarAnimacion && index === carrito.length - 1 ? 'nuevo-item' : ''}">
            <div class="product-desc">${item.desc}</div>
            <div>${item.cantidad}</div>
            <div>$${item.precio.toFixed(2)}</div>
            <div class="subtotal">$${item.subtotal.toFixed(2)}</div>
            <button class="delete-item-btn" onclick="mostrarConfirmarEliminar(${index})" title="Eliminar producto">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
    
    cartTotal.textContent = `$${total.toFixed(2)}`;
    cartResumen.textContent = `Productos: ${cantidadTotal} | Total: `;
};

/* ---------- CONFIRMAR ELIMINAR ITEM ---------- */
window.mostrarConfirmarEliminar = function(index) {
    itemAEliminar = index;
    document.getElementById("modalConfirmarEliminar").style.display = 'flex';
};

window.cerrarConfirmarEliminar = function() {
    itemAEliminar = null;
    document.getElementById("modalConfirmarEliminar").style.display = 'none';
};

/* ---------- MINI HISTORIAL ---------- */
async function cargarMiniHistorial() {
    try {
        const hoy = new Date();
        const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0);
        const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);
        
        const q = query(collection(db, "ventas"), 
                       where("fecha", ">=", inicio), 
                       where("fecha", "<=", fin), 
                       orderBy("fecha", "desc"));
        const snap = await getDocs(q);
        const lista = snap.docs.map(d => ({ 
            id: d.id, 
            ...d.data(),
            fechaTimestamp: d.data().fecha
        }));

        const miniGrid = document.getElementById("miniGrid");
        const titulo = document.querySelector(".mini-historial h3");
        
        if (titulo) titulo.textContent = "Historial de hoy";
        
        if (lista.length === 0) {
            if (miniGrid) miniGrid.innerHTML = "<p style='color:#7f8c8d;font-size:.9rem'>Sin ventas hoy</p>";
            return;
        }
        
        const grupos = {};
        lista.forEach(v => {
            if (!grupos[v.equipo]) grupos[v.equipo] = [];
            grupos[v.equipo].push(v);
        });

        if (miniGrid) {
            miniGrid.innerHTML = Object.entries(grupos).map(([eq, facturas]) => {
                const totalEquipo = facturas.reduce((sum, v) => sum + v.total, 0);
                const esLocal = facturas[0].esLocal;
                const ciudad = facturas[0].ciudad;
                
                return `
                  <div class="mini-card" onclick="mostrarDetalleEquipo('${eq}')" title="Ver facturas del equipo ${eq}">
                    <div class="mini-equipo">${eq}</div>
                    <div class="mini-total">$${totalEquipo.toFixed(2)}</div>
                    ${!esLocal && ciudad ? `<div class="mini-ciudad">${ciudad}</div>` : ''}
                  </div>`;
            }).join("");
        }
        
    } catch (error) {
        console.error("Error cargando historial:", error);
        const miniGrid = document.getElementById("miniGrid");
        if (miniGrid) miniGrid.innerHTML = "<p style='color:#e74c3c;font-size:.9rem'>Error al cargar</p>";
    }
}

/* ---------- MOSTRAR DETALLE DE EQUIPO ---------- */
window.mostrarDetalleEquipo = async (equipo) => {
    try {
        const hoy = new Date();
        const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0);
        const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);
        
        const q = query(collection(db, "ventas"), 
                       where("fecha", ">=", inicio), 
                       where("fecha", "<=", fin), 
                       where("equipo", "==", equipo),
                       orderBy("fecha", "desc"));
        const snap = await getDocs(q);
        const facturas = snap.docs.map(d => ({ 
            id: d.id, 
            ...d.data(),
            fechaTimestamp: d.data().fecha
        }));

        const detalleEquipoContent = document.getElementById("detalleEquipoContent");
        const modalDetalle = document.getElementById("modalDetalle");
        
        if (facturas.length === 0) {
            if (detalleEquipoContent) detalleEquipoContent.innerHTML = "<p>No se encontraron ventas para este equipo hoy.</p>";
            if (modalDetalle) modalDetalle.style.display = "flex";
            return;
        }
        
        let html = `<h4 style="margin-bottom:15px;color:#2c3e50;text-align:center;">Ventas del Equipo: ${equipo}</h4>`;
        
        facturas.forEach((v, index) => {
            const fecha = v.fechaTimestamp ? 
              new Date(v.fechaTimestamp.seconds * 1000).toLocaleString() : "Fecha no disponible";
            
            const infoAbono = v.tipo === 'credito' && v.abonoInicial > 0 ? 
              `<tr><td style="padding:4px;font-weight:bold;">Abono:</td><td style="padding:4px;color:#27ae60;">$${v.abonoInicial.toFixed(2)}</td></tr>
               <tr><td style="padding:4px;font-weight:bold;">Saldo:</td><td style="padding:4px;color:#e74c3c;">$${v.saldoPendiente.toFixed(2)}</td></tr>` : '';
            
            html += `
              <div style="margin-bottom:20px;padding:15px;border:1px solid #ddd;border-radius:6px;background:#f8f9fa;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #ccc;">
                  <strong style="color:#2c3e50;">Venta ${index + 1}</strong>
                  <span style="font-size:.75rem;color:#7f8c8d;">${fecha}</span>
                </div>
                <table style="width:100%;font-size:.8rem;border-collapse:collapse;margin-bottom:10px;">
                  <tr><td style="padding:4px;font-weight:bold;width:80px;">Cliente:</td><td style="padding:4px;">${v.cliente}</td></tr>
                  <tr><td style="padding:4px;font-weight:bold;">Tipo:</td><td style="padding:4px;">
                    <span style="padding:2px 6px;border-radius:3px;color:white;background:${v.tipo === 'credito' ? '#f39c12' : '#3498db'};font-size:.7rem;">${v.tipo}</span>
                  </td></tr>
                  <tr><td style="padding:4px;font-weight:bold;">Total:</td><td style="padding:4px;font-weight:bold;color:#27ae60;">$${v.total.toFixed(2)}</td></tr>
                  ${infoAbono}
                </table>
                <table style="width:100%;font-size:.75rem;border-collapse:collapse;margin-bottom:10px;">
                  <thead><tr style="background:#2c3e50;color:white">
                    <th style="padding:6px;text-align:left;">Producto</th>
                    <th style="padding:6px;text-align:center;">Cant</th>
                    <th style="padding:6px;text-align:right;">P.U.</th>
                    <th style="padding:6px;text-align:right;">Subt.</th>
                  </tr></thead>
                  <tbody>
                    ${v.items.map(i => `
                      <tr>
                        <td style="padding:6px;border-bottom:1px solid #eee;">${i.desc}</td>
                        <td style="padding:6px;border-bottom:1px solid #eee;text-align:center;">${i.cantidad}</td>
                        <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;">$${i.precio.toFixed(2)}</td>
                        <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;">$${i.subtotal.toFixed(2)}</td>
                      </tr>`).join("")}
                  </tbody>
                </table>
              </div>`;
        });
        
        if (detalleEquipoContent) detalleEquipoContent.innerHTML = html;
        if (modalDetalle) modalDetalle.style.display = "flex";
        
    } catch (e) { 
        console.error("Error cargando detalle:", e);
        const detalleEquipoContent = document.getElementById("detalleEquipoContent");
        if (detalleEquipoContent) {
            detalleEquipoContent.innerHTML = `<p style="color:#e74c3c;text-align:center;">Error al cargar detalles</p>`;
        }
        const modalDetalle = document.getElementById("modalDetalle");
        if (modalDetalle) modalDetalle.style.display = "flex";
    }
};

/* ---------- EDITAR FACTURA ---------- */
window.editarFactura = (id) => {
    const modalDetalle = document.getElementById("modalDetalle");
    if (modalDetalle) modalDetalle.style.display = 'none';
    window.location.href = `venta.html?id=${id}`;
};

/* ---------- CERRAR DETALLE ---------- */
window.cerrarDetalle = () => {
    const modalDetalle = document.getElementById("modalDetalle");
    if (modalDetalle) modalDetalle.style.display = 'none';
};

/* ---------- INICIALIZAR TODO ---------- */
window.addEventListener('DOMContentLoaded', async () => {
    console.log("Iniciando ventas.js con búsqueda en base de datos...");
    
    if (!localStorage.getItem('usuarioLogueado')) {
        window.location.href = 'login.html';
        return;
    }
    
    // Cargar productos del inventario para búsqueda local
    await cargarProductosInventario();
    await cargarVentaGuardada();
    
    // Configurar eventos de búsqueda
    const buscarProductoInput = document.getElementById("buscar-producto");
    if (buscarProductoInput) {
        buscarProductoInput.addEventListener("input", function() {
            const termino = this.value;
            
            // Limpiar timeout anterior
            if (timeoutBusqueda) {
                clearTimeout(timeoutBusqueda);
            }
            
            // Esperar 300ms después de que el usuario deje de escribir
            timeoutBusqueda = setTimeout(async () => {
                if (termino.length >= 2) {
                    try {
                        const resultados = await buscarProductosEnBaseDatos(termino);
                        mostrarResultadosBusqueda(resultados);
                    } catch (error) {
                        console.error("Error en búsqueda:", error);
                        // Fallback a búsqueda local
                        const resultadosLocal = buscarProductosLocal(termino);
                        mostrarResultadosBusqueda(resultadosLocal);
                    }
                } else {
                    cerrarDropdownBusqueda();
                }
            }, 300);
        });
        
        // Cerrar dropdown al hacer clic fuera
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.search-container')) {
                cerrarDropdownBusqueda();
            }
        });
    }
    
    // Configurar eventos
    const equipoInput = document.getElementById("equipo");
    const clienteInput = document.getElementById("cliente");
    
    if (equipoInput) {
        equipoInput.addEventListener("input", function() {
            // Validar en tiempo real
            const valor = this.value;
            if (valor && !validarNumeroEquipo(valor)) {
                this.style.borderColor = '#e74c3c';
            } else {
                this.style.borderColor = '#ddd';
            }
            guardarVentaAutomaticamente();
        });
    }
    
    if (clienteInput) clienteInput.addEventListener("input", guardarVentaAutomaticamente);
    
    // Configurar botones de modales
    const btnConAbono = document.getElementById("btnConAbono");
    const btnSinAbono = document.getElementById("btnSinAbono");
    const confirmarAbonoBtn = document.getElementById("confirmarAbonoBtn");
    const confirmarEliminarBtn = document.getElementById("confirmarEliminarBtn");
    const montoAbonoInput = document.getElementById("montoAbono");
    
    if (btnConAbono) btnConAbono.addEventListener("click", () => {
        cerrarAbonoInicial();
        mostrarModalMontoAbono();
    });
    
    if (btnSinAbono) btnSinAbono.addEventListener("click", () => {
        cerrarAbonoInicial();
        guardarVentaCredito(false);
    });
    
    if (confirmarAbonoBtn) confirmarAbonoBtn.addEventListener("click", confirmarAbonoInicial);
    
    if (montoAbonoInput) {
        montoAbonoInput.addEventListener("input", actualizarCalculoAbono);
    }
    
    if (confirmarEliminarBtn) confirmarEliminarBtn.addEventListener("click", () => {
        if (itemAEliminar !== null) {
            const it = carrito[itemAEliminar];
            total -= it.subtotal;
            cantidadTotal -= it.cantidad;
            carrito.splice(itemAEliminar, 1);
            window.actualizarCarrito(false);
            guardarVentaAutomaticamente();
            itemAEliminar = null;
        }
        const modal = document.getElementById("modalConfirmarEliminar");
        if (modal) modal.style.display = 'none';
    });
    
    // Cerrar modales al hacer clic fuera
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', e => {
            if (e.target === modal) modal.style.display = 'none';
        });
    });
    
    // Botones de venta
    const efectivoBtn = document.getElementById("efectivoBtn");
    const creditoBtn = document.getElementById("creditoBtn");
    
    if (efectivoBtn) {
        efectivoBtn.addEventListener("click", () => {
            tipoOriginal = "efectivo";
            abonoInicial = 0;
            saldoPendiente = total;
            guardarVenta("efectivo");
        });
    }
    
    if (creditoBtn) {
        creditoBtn.addEventListener("click", () => {
            if (idFactura) {
                limpiarVentaGuardada();
                limpiarTodo();
                return;
            }
            mostrarModalAbonoInicial();
        });
    }
    
    // Menú móvil
    const mobileMenuBtn = document.getElementById("mobileMenuBtn");
    const mobileMenu = document.getElementById("mobileMenu");
    const cartIcon = document.getElementById("cartIcon");
    const carritoContainer = document.getElementById("carritoContainer");
    
    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener("click", () => {
            mobileMenu.classList.toggle("active");
        });
    }
    
    if (cartIcon && carritoContainer) {
        cartIcon.addEventListener("click", () => {
            carritoContainer.classList.toggle("mostrar");
        });
    }
    
    // Cerrar menú al hacer clic fuera
    document.addEventListener('click', function(e) {
        if (mobileMenu && !e.target.closest('#mobileMenu') && !e.target.closest('#mobileMenuBtn')) {
            mobileMenu.classList.remove("active");
        }
    });
    
    // Cargar edición si existe
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id) {
        await cargarFactura(id);
    } else {
        if (window.actualizarCarrito) {
            window.actualizarCarrito(false);
        }
    }
    
    // Cargar historial
    await cargarMiniHistorial();
    
    console.log("Sistema de ventas inicializado correctamente con búsqueda en base de datos");
});
