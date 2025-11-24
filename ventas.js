// ventas.js - Sistema HÍBRIDO (online + offline)
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

/* ---------- CLAVE PARA GUARDAR LOCALMENTE ---------- */
const VENTA_GUARDADA_KEY = 'ventaEnProgreso';

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
    }, 1000);
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
    
    // Guardar en localStorage (siempre)
    localStorage.setItem(VENTA_GUARDADA_KEY, JSON.stringify(ventaData));
    
    // También en Firebase (si hay internet)
    guardarVentaEnFirebase(ventaData);
}

/* ---------- GUARDAR EN FIREBASE (si hay internet) ---------- */
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
        console.log("No se pudo guardar en Firebase (puede ser normal sin internet)");
    }
}

/* ---------- CARGAR VENTA GUARDADA AL INICIAR ---------- */
async function cargarVentaGuardada() {
    console.log("Buscando venta guardada...");
    
    // Primero desde localStorage
    const ventaLocal = localStorage.getItem(VENTA_GUARDADA_KEY);
    
    if (ventaLocal) {
        const ventaData = JSON.parse(ventaLocal);
        const fechaGuardado = new Date(ventaData.fechaGuardado);
        const hoy = new Date();
        
        // Solo cargar si es del mismo día
        if (fechaGuardado.toDateString() === hoy.toDateString()) {
            console.log("Venta recuperada desde localStorage");
            aplicarVentaGuardada(ventaData);
            return true;
        } else {
            console.log("Venta de día anterior, limpiando...");
            limpiarVentaGuardada();
        }
    }
    
    // Si no hay en localStorage, intentar desde Firebase
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
                console.log("Venta recuperada desde Firebase");
                aplicarVentaGuardada(ventaData);
                return true;
            } else {
                console.log("Venta de día anterior en Firebase, limpiando...");
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
        
        console.log("Venta recuperada - Productos:", carrito.length);
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
    console.log("Venta guardada limpiada");
}

/* ---------- MODALES ABONO (sin cambios) ---------- */
function mostrarModalAbonoInicial() {
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
        alert("Ingrese un monto válido para el abono");
        return;
    }
    
    if (monto > total) {
        alert("El abono no puede ser mayor al total de la venta");
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

/* ---------- GUARDAR VENTA FINAL ---------- */
async function guardarVenta(tipoBoton) {
    const eq = document.getElementById("equipo")?.value.trim();
    if (!eq) {
        alert("Ingresá el número de equipo");
        return;
    }
    if (carrito.length === 0) {
        alert("Agregá al menos un producto");
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
        if (idFactura) {
            await updateDoc(doc(db, "ventas", idFactura), venta);
        } else {
            await addDoc(collection(db, "ventas"), venta);
        }
        
        limpiarVentaGuardada(); // LIMPIAR AL FINALIZAR
        limpiarTodo();
        alert("✅ Venta guardada correctamente");
        location.reload();
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
    
    if (equipoInput) equipoInput.value = "";
    if (clienteInput) clienteInput.value = "";
    
    idFactura = null;
    
    if (window.actualizarCarrito) {
        window.actualizarCarrito(false);
    }
}

/* ---------- EVENTOS DE CARRITO ---------- */
function agregarProducto(desc, precio, cantidad) {
    const sub = precio * cantidad;
    carrito.push({ desc, precio, cantidad, subtotal: sub });
    total += sub;
    cantidadTotal += cantidad;
    
    if (window.actualizarCarrito) {
        window.actualizarCarrito(true);
    }
    
    mostrarNotificacionProducto(desc, precio, cantidad);
    guardarVentaAutomaticamente(); // GUARDAR CADA CAMBIO
}

/* ---------- INICIALIZAR AL CARGAR LA PÁGINA ---------- */
window.addEventListener('DOMContentLoaded', async () => {
    console.log("Iniciando ventas.js con sistema híbrido...");
    
    // Verificar login
    if (!localStorage.getItem('usuarioLogueado')) {
        window.location.href = 'login.html';
        return;
    }
    
    // Cargar venta guardada
    await cargarVentaGuardada();
    
    // Configurar eventos
    const equipoInput = document.getElementById("equipo");
    const clienteInput = document.getElementById("cliente");
    
    if (equipoInput) equipoInput.addEventListener("input", guardarVentaAutomaticamente);
    if (clienteInput) clienteInput.addEventListener("input", guardarVentaAutomaticamente);
    
    // Botones
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
    
    // Cargar edición si existe
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id) {
        await cargarFactura(id);
    }
});

/* ---------- HACER FUNCIONES GLOBALES ---------- */
window.actualizarCarrito = (desdeAgregar = false) => {
    const cartItems = document.getElementById("cart-items");
    const cartBadge = document.getElementById("cart-badge");
    const cartTotalTxt = document.getElementById("cart-total");
    const cartResumen = document.getElementById("cart-resumen");
    
    if (!cartItems || !cartBadge || !cartTotalTxt || !cartResumen) return;
    
    if (carrito.length === 0) {
        cartItems.innerHTML = `<div class="empty-cart"><i class="fas fa-shopping-cart"></i><div>No hay productos</div></div>`;
    } else {
        cartItems.innerHTML = carrito.map((it, i) => `
            <div class="cart-item" data-index="${i}">
                <div class="product-desc">${it.desc}</div>
                <div><input type="number" value="${it.cantidad}" min="1" style="width:50px" onchange="cambiarCantidad(${i},this.value)"></div>
                <div><input type="number" value="${it.precio.toFixed(2)}" min="0.01" step="0.01" style="width:70px" onchange="cambiarPrecio(${i},this.value)"></div>
                <div>$${it.subtotal.toFixed(2)}</div>
                <div><button class="delete-item-btn" onclick="abrirConfirmarEliminar(${i})"><i class="fas fa-trash"></i></button></div>
            </div>`).join("");
    }
    
    cartBadge.textContent = cantidadTotal;
    cartTotalTxt.textContent = `$${total.toFixed(2)}`;
    cartResumen.textContent = `Productos: ${cantidadTotal} | Total: `;
    
    guardarVentaAutomaticamente();
};

window.abrirConfirmarEliminar = (i) => {
    itemAEliminar = i;
    const modal = document.getElementById("modalConfirmarEliminar");
    if (modal) modal.style.display = 'flex';
};

window.cambiarCantidad = (i, v) => {
    const nueva = parseInt(v) || 1;
    const it = carrito[i];
    total -= it.subtotal;
    cantidadTotal -= it.cantidad;
    it.cantidad = nueva;
    it.subtotal = it.precio * it.cantidad;
    total += it.subtotal;
    cantidadTotal += nueva;
    window.actualizarCarrito(false);
};

window.cambiarPrecio = (i, v) => {
    const nuevo = parseFloat(v) || 0;
    const it = carrito[i];
    total -= it.subtotal;
    it.precio = nuevo;
    it.subtotal = it.precio * it.cantidad;
    total += it.subtotal;
    window.actualizarCarrito(false);
};

window.editarFactura = (id) => {
    window.location.href = `venta.html?id=${id}`;
};

/* ---------- CARGAR FACTURA PARA EDICIÓN ---------- */
async function cargarFactura(id) {
    try {
        const snap = await getDoc(doc(db, "ventas", id));
        if (!snap.exists()) {
            alert("Factura no encontrada");
            return;
        }
        
        const data = snap.data();
        idFactura = id;
        tipoOriginal = data.tipo;
        
        const equipoInput = document.getElementById("equipo");
        const clienteInput = document.getElementById("cliente");
        
        if (equipoInput) equipoInput.value = data.equipo;
        if (clienteInput) clienteInput.value = data.cliente || "";
        
        carrito = data.items.map(x => ({ ...x }));
        total = data.total;
        cantidadTotal = data.cantidadTotal;
        abonoInicial = data.abonoInicial || 0;
        saldoPendiente = data.saldoPendiente || total;
        
        const tituloVenta = document.getElementById("tituloVenta");
        if (tituloVenta) tituloVenta.textContent = "EDITAR VENTA";
        
        const efectivoBtn = document.getElementById("efectivoBtn");
        const creditoBtn = document.getElementById("creditoBtn");
        
        if (efectivoBtn) {
            efectivoBtn.textContent = "Actualizar";
            efectivoBtn.classList.remove("btn-success", "btn-warning");
            efectivoBtn.classList.add("btn-primary");
        }
        
        if (creditoBtn) {
            creditoBtn.textContent = "Cancelar";
            creditoBtn.classList.remove("btn-success", "btn-warning");
            creditoBtn.classList.add("btn-danger");
        }
        
        window.actualizarCarrito(false);
        guardarVentaAutomaticamente();
        
    } catch (e) {
        console.error("Error al cargar factura:", e);
        alert("Error al cargar la factura");
    }
}
