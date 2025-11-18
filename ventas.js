// ventas.js
import { db } from "./firebase-config.js";
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let carrito = [];
let total = 0;
let cantidadTotal = 0;
let idFactura = null;          // si hay ID es edición

// ---------- referencias ----------
const equipoInput   = document.getElementById("equipo");
const clienteInput  = document.getElementById("cliente");
const buscarInput   = document.getElementById("buscar-producto");
const cantInput     = document.getElementById("cantidad");
const cartItems     = document.getElementById("cart-items");
const cartBadge     = document.getElementById("cart-badge");
const cartTotalTxt  = document.getElementById("cart-total");
const fueraCant     = document.getElementById("fuera-cantidad");
const fueraTotal    = document.getElementById("fuera-saldo");
const efectivoBtn   = document.getElementById("efectivoBtn");
const creditoBtn    = document.getElementById("creditoBtn");
const swapBtn       = document.getElementById("swapBtn");
const wrapper       = document.getElementById("ventaWrapper");
const carritoDiv    = document.getElementById("carritoContainer");
const cartIcon      = document.getElementById("cartIcon");
const tituloVenta   = document.getElementById("tituloVenta");

// ---------- modales ----------
const modalExito   = document.getElementById("modalExito");
const modalError   = document.getElementById("modalError");
const modalValida  = document.getElementById("modalValida");
const txtError     = document.getElementById("textoError");
const txtValida    = document.getElementById("textoValida");

function mostrarExito() { modalExito.style.display = "flex"; }
function cerrarExito() {
  modalExito.style.display = "none";
  if (idFactura) window.location.href = "historial.html";
}
function mostrarError(msg) {
  txtError.textContent = msg;
  modalError.style.display = "flex";
}
function cerrarError() { modalError.style.display = "none"; }
function mostrarValida(msg) {
  txtValida.textContent = msg;
  modalValida.style.display = "flex";
}
function cerrarValida() { modalValida.style.display = "none"; }

// ---------- carrito ----------
function agregarProducto(desc, precio, cantidad) {
  const sub = precio * cantidad;
  carrito.push({ desc, precio, cantidad, subtotal: sub });
  total += sub;
  cantidadTotal += cantidad;
  actualizarCarrito();
}
function actualizarCarrito() {
  if (carrito.length === 0) {
    cartItems.innerHTML = `<div class="empty-cart"><i class="fas fa-shopping-cart"></i><div>No hay productos</div></div>`;
  } else {
    cartItems.innerHTML = carrito.map((it, i) => `
      <div class="cart-item">
        <div class="product-desc">${it.desc}</div>
        <div><input type="number" value="${it.cantidad}" min="1" style="width:50px" onchange="cambiarCantidad(${i},this.value)"></div>
        <div><input type="number" value="${it.precio.toFixed(2)}" min="0.01" step="0.01" style="width:70px" onchange="cambiarPrecio(${i},this.value)"></div>
        <div>$${it.subtotal.toFixed(2)}</div>
        <div><button class="delete-item-btn" data-i="${i}"><i class="fas fa-trash"></i></button></div>
      </div>`).join("");
  }
  cartBadge.textContent  = cantidadTotal;
  cartTotalTxt.textContent = `$${total.toFixed(2)}`;
  fueraCant.textContent  = `Productos: ${cantidadTotal}`;
  fueraTotal.textContent = `Total: $${total.toFixed(2)}`;
}
window.cambiarCantidad = (i, v) => {
  const nueva = parseInt(v) || 1;
  const it = carrito[i];
  total -= it.subtotal; cantidadTotal -= it.cantidad;
  it.cantidad = nueva; it.subtotal = it.precio * it.cantidad;
  total += it.subtotal; cantidadTotal += it.cantidad;
  actualizarCarrito();
};
window.cambiarPrecio = (i, v) => {
  const nuevo = parseFloat(v) || 0;
  const it = carrito[i];
  total -= it.subtotal;
  it.precio = nuevo; it.subtotal = it.precio * it.cantidad;
  total += it.subtotal;
  actualizarCarrito();
};
cartItems.addEventListener("click", e => {
  if (e.target.closest(".delete-item-btn")) {
    const i = e.target.closest(".delete-item-btn").dataset.i;
    const it = carrito[i];
    total -= it.subtotal; cantidadTotal -= it.cantidad;
    carrito.splice(i, 1);
    actualizarCarrito();
  }
});

// ---------- búsqueda rápida ----------
buscarInput.addEventListener("focus", () => {
  const dd = document.getElementById("search-dropdown");
  dd.innerHTML = `
    <div class="search-dropdown-item" data-d="Llanta 26&quot;" data-p="25.00">Llanta 26" - $25.00</div>
    <div class="search-dropdown-item" data-d="Cadena 7v" data-p="8.50">Cadena 7v - $8.50</div>
    <div class="search-dropdown-item" data-d="Freno disco" data-p="15.00">Freno disco - $15.00</div>`;
  dd.style.display = "block";
});
document.getElementById("search-dropdown").addEventListener("click", e => {
  if (e.target.classList.contains("search-dropdown-item")) {
    const desc = e.target.dataset.d;
    const precio = parseFloat(e.target.dataset.p);
    const cant = parseInt(cantInput.value) || 1;
    agregarProducto(desc, precio, cant);
    buscarInput.value = ""; cantInput.value = "1";
    e.target.parentElement.style.display = "none";
  }
});
document.addEventListener("click", e => {
  if (!e.target.closest(".search-container")) document.getElementById("search-dropdown").style.display = "none";
});

// ---------- carga de factura para edición ----------
async function cargarFactura(id) {
  try {
    const snap = await getDoc(doc(db, "ventas", id));
    if (!snap.exists()) { mostrarError("Factura no encontrada."); return; }
    const data = snap.data();
    idFactura = id;
    equipoInput.value  = data.equipo;
    clienteInput.value = data.cliente;
    carrito      = data.items.map(x => ({ ...x }));
    total        = data.total;
    cantidadTotal= data.cantidadTotal;
    tituloVenta.textContent = "EDITAR VENTA";
    actualizarCarrito();
  } catch (e) { mostrarError("Error al cargar la factura."); }
}

// ---------- guardar venta / actualizar ----------
async function guardarVenta(tipo) {
  const eq = equipoInput.value.trim();
  if (!eq || carrito.length === 0) { mostrarValida("Ingresa equipo y agrega productos."); return; }

  const venta = {
    equipo: eq,
    cliente: clienteInput.value.trim(),
    tipo,
    items: carrito,
    total,
    cantidadTotal,
    fecha: idFactura ? undefined : serverTimestamp()   // mantiene fecha original si es edición
  };
  try {
    if (idFactura) {
      await updateDoc(doc(db, "ventas", idFactura), venta);
    } else {
      await addDoc(collection(db, "ventas"), venta);
    }
    imprimirTicket(tipo);
    limpiarTodo();
    mostrarExito();
  } catch (e) {
    console.error(e);
    mostrarError("Error al guardar la venta.");
  }
}
function imprimirTicket(tipo) {
  const ticket = `Taller Wilian
${tipo === "efectivo" ? "VENTA AL CONTADO" : "VENTA A CRÉDITO"}
Equipo: ${equipoInput.value}
Cliente: ${clienteInput.value}
------------------------
${carrito.map(it => `${it.desc} x${it.cantidad} $${it.precio.toFixed(2)} = $${it.subtotal.toFixed(2)}`).join("\n")}
------------------------
Total: $${total.toFixed(2)}
Fecha: ${new Date().toLocaleString()}`;
  console.log("🖨️ Ticket:\n" + ticket);
}
function limpiarTodo() {
  carrito = []; total = 0; cantidadTotal = 0;
  equipoInput.value = ""; clienteInput.value = ""; idFactura = null;
  tituloVenta.textContent = "NUEVA VENTA";
  actualizarCarrito();
}

// ---------- botones ----------
efectivoBtn.addEventListener("click", () => guardarVenta("efectivo"));
creditoBtn.addEventListener("click",  () => guardarVenta("credito"));

// ---------- interfaz móvil ----------
if (window.innerWidth > 768) {
  swapBtn.addEventListener("click", () => wrapper.classList.toggle("invertido"));
} else {
  swapBtn.style.display = "none";
  cartIcon.addEventListener("click", () => {
    const wrap = document.createElement("div");
    wrap.id = "carritoFullScreen";
    wrap.innerHTML = `<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:white;z-index:2000;padding:20px;display:flex;flex-direction:column;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
        <h3>Carrito</h3><button id="cerrarCarritoBtn" style="background:#e74c3c;color:white;border:none;border-radius:50%;width:36px;height:36px;font-size:1.2rem;cursor:pointer;"><i class="fas fa-times"></i></button>
      </div><div id="carritoContenidoClone"></div></div>`;
    document.body.appendChild(wrap);
    document.getElementById("carritoContenidoClone").appendChild(cartItems.cloneNode(true));
    document.getElementById("cerrarCarritoBtn").addEventListener("click", () => document.body.removeChild(wrap));
  });
}

// ---------- menú y login ----------
document.getElementById("mobileMenuBtn").addEventListener("click", () => document.getElementById("mobileMenu").classList.toggle("active"));
document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("usuarioLogueado");
  window.location.href = "login.html";
});
if (!localStorage.getItem("usuarioLogueado")) window.location.href = "login.html";

// ---------- arranque ----------
window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (id) cargarFactura(id);
  else actualizarCarrito();
});
