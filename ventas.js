// ventas.js
import { db } from "./firebase-config.js";
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let carrito = [];
let total = 0;
let cantidadTotal = 0;
let idFactura = null; // Si hay ID, estamos editando

// Referencias
const equipoInput = document.getElementById("equipo");
const clienteInput = document.getElementById("cliente");
const buscarProductoInput = document.getElementById("buscar-producto");
const cantidadInput = document.getElementById("cantidad");
const cartItems = document.getElementById("cart-items");
const cartBadge = document.getElementById("cart-badge");
const cartTotalElement = document.getElementById("cart-total");
const fueraCantidad = document.getElementById("fuera-cantidad");
const fueraSaldo = document.getElementById("fuera-saldo");
const efectivoBtn = document.getElementById("efectivoBtn");
const creditoBtn = document.getElementById("creditoBtn");
const swapBtn = document.getElementById("swapBtn");
const ventaWrapper = document.getElementById("ventaWrapper");
const carritoContainer = document.getElementById("carritoContainer");
const cartIcon = document.getElementById("cartIcon");
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const mobileMenu = document.getElementById("mobileMenu");
const logoutBtn = document.getElementById("logoutBtn");
const tituloVenta = document.getElementById("tituloVenta");

// Modales
const modalExito = document.getElementById("modalExito");
const modalError = document.getElementById("modalError");
const modalValida = document.getElementById("modalValida");
const textoError = document.getElementById("textoError");
const textoValida = document.getElementById("textoValida");

// ===== MODALES =====
function mostrarExito() {
  modalExito.style.display = "flex";
}
function cerrarExito() {
  modalExito.style.display = "none";
  if (idFactura) {
    window.location.href = "historial.html";
  }
}
function mostrarError(msg) {
  textoError.textContent = msg;
  modalError.style.display = "flex";
}
function cerrarError() {
  modalError.style.display = "none";
}
function mostrarValida(msg) {
  textoValida.textContent = msg;
  modalValida.style.display = "flex";
}
function cerrarValida() {
  modalValida.style.display = "none";
}

// ===== CARRITO =====
function agregarProducto(desc, precio, cantidad) {
  const subtotal = precio * cantidad;
  carrito.push({ desc, precio, cantidad, subtotal });
  total += subtotal;
  cantidadTotal += cantidad;
  actualizarCarrito();
}

function actualizarCarrito() {
  if (carrito.length === 0) {
    cartItems.innerHTML = `<div class="empty-cart"><i class="fas fa-shopping-cart"></i><div>No hay productos</div></div>`;
  } else {
    cartItems.innerHTML = carrito.map((item, index) => `
      <div class="cart-item">
        <div class="product-desc">${item.desc}</div>
        <div><input type="number" value="${item.cantidad}" min="1" style="width:50px" onchange="cambiarCantidad(${index}, this.value)"></div>
        <div><input type="number" value="${item.precio.toFixed(2)}" min="0.01" step="0.01" style="width:70px" onchange="cambiarPrecio(${index}, this.value)"></div>
        <div>$${item.subtotal.toFixed(2)}</div>
        <div><button class="delete-item-btn" data-index="${index}"><i class="fas fa-trash"></i></button></div>
      </div>
    `).join("");
  }
  cartBadge.textContent = cantidadTotal;
  cartTotalElement.textContent = `$${total.toFixed(2)}`;
  fueraCantidad.textContent = `Productos: ${cantidadTotal}`;
  fueraSaldo.textContent = `Total: $${total.toFixed(2)}`;
}

function cambiarCantidad(index, nuevaCantidad) {
  const cant = parseInt(nuevaCantidad) || 1;
  const item = carrito[index];
  total -= item.subtotal;
  cantidadTotal -= item.cantidad;
  item.cantidad = cant;
  item.subtotal = item.precio * item.cantidad;
  total += item.subtotal;
  cantidadTotal += item.cantidad;
  actualizarCarrito();
}

function cambiarPrecio(index, nuevoPrecio) {
  const precio = parseFloat(nuevoPrecio) || 0;
  const item = carrito[index];
  total -= item.subtotal;
  item.precio = precio;
  item.subtotal = item.precio * item.cantidad;
  total += item.subtotal;
  actualizarCarrito();
}

// ===== EVENTOS =====
cartItems.addEventListener("click", (e) => {
  if (e.target.closest(".delete-item-btn")) {
    const index = e.target.closest(".delete-item-btn").dataset.index;
    const item = carrito[index];
    total -= item.subtotal;
    cantidadTotal -= item.cantidad;
    carrito.splice(index, 1);
    actualizarCarrito();
  }
});

buscarProductoInput.addEventListener("focus", () => {
  const dropdown = document.getElementById("search-dropdown");
  dropdown.innerHTML = `
    <div class="search-dropdown-item" data-desc="Llanta 26&quot;" data-precio="25.00">Llanta 26" - $25.00</div>
    <div class="search-dropdown-item" data-desc="Cadena 7v" data-precio="8.50">Cadena 7v - $8.50</div>
    <div class="search-dropdown-item" data-desc="Freno disco" data-precio="15.00">Freno disco - $15.00</div>
  `;
  dropdown.style.display = "block";
});

document.getElementById("search-dropdown").addEventListener("click", (e) => {
  if (e.target.classList.contains("search-dropdown-item")) {
    const desc = e.target.dataset.desc;
    const precio = parseFloat(e.target.dataset.precio);
    const cantidad = parseInt(cantidadInput.value) || 1;
    agregarProducto(desc, precio, cantidad);
    buscarProductoInput.value = "";
    cantidadInput.value = "1";
    e.target.parentElement.style.display = "none";
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-container")) {
    document.getElementById("search-dropdown").style.display = "none";
  }
});

// ===== CARGAR FACTURA SI HAY ID =====
async function cargarFactura(id) {
  try {
    const docSnap = await getDoc(doc(db, "ventas", id));
    if (!docSnap.exists()) {
      mostrarError("Factura no encontrada.");
      return;
    }
    const data = docSnap.data();
    idFactura = id;
    equipoInput.value = data.equipo;
    clienteInput.value = data.cliente;
    carrito = data.items.map(i => ({ ...i }));
    total = data.total;
    cantidadTotal = data.cantidadTotal;
    tituloVenta.textContent = "EDITAR VENTA";
    actualizarCarrito();
  } catch (e) {
    mostrarError("Error al cargar la factura.");
  }
}

// ===== GUARDAR VENTA =====
async function guardarVenta(tipo) {
  const equipo = equipoInput.value.trim();

  if (!equipo || carrito.length === 0) {
    mostrarValida("Ingresa un número de equipo y agrega productos.");
    return;
  }

  const venta = {
    equipo,
    cliente: clienteInput.value.trim(),
    tipo,
    items: carrito,
    total,
    cantidadTotal,
    fecha: serverTimestamp()
  };

  try {
    if (idFactura) {
      // ACTUALIZAR FACTURA EXISTENTE
      await updateDoc(doc(db, "ventas", idFactura), venta);
      imprimirTicket(tipo);
      mostrarExito();
    } else {
      // NUEVA VENTA
      await addDoc(collection(db, "ventas"), venta);
      imprimirTicket(tipo);
      limpiarTodo();
      mostrarExito();
    }
  } catch (e) {
    console.error("Error al guardar:", e);
    mostrarError("Error al guardar la venta.");
  }
}

// ===== IMPRIMIR Y LIMPIAR =====
function imprimirTicket(tipo) {
  const ticket = `
Taller Wilian
${tipo === "efectivo" ? "VENTA AL CONTADO" : "VENTA A CRÉDITO"}
Equipo: ${equipoInput.value}
Cliente: ${clienteInput.value}
------------------------
${carrito.map(i => `${i.desc} x${i.cantidad} $${i.precio.toFixed(2)} = $${i.subtotal.toFixed(2)}`).join("\n")}
------------------------
Total: $${total.toFixed(2)}
Fecha: ${new Date().toLocaleString()}
  `;
  console.log("🖨️ Ticket:\n" + ticket);
  // Aquí puedes usar jsPDF o enviar a impresora térmica
}

function limpiarTodo() {
  carrito = [];
  total = 0;
  cantidadTotal = 0;
  equipoInput.value = "";
  clienteInput.value = "";
  idFactura = null;
  tituloVenta.textContent = "NUEVA VENTA";
  actualizarCarrito();
}

// ===== BOTONES =====
efectivoBtn.addEventListener("click", () => guardarVenta("efectivo"));
creditoBtn.addEventListener("click", () => guardarVenta("credito"));

// ===== MÓVIL E INTERFAZ =====
if (window.innerWidth > 768) {
  swapBtn.addEventListener("click", () => ventaWrapper.classList.toggle("invertido"));
} else {
  swapBtn.style.display = "none";
  cartIcon.addEventListener("click", () => {
    const wrapper = document.createElement("div");
    wrapper.id = "carritoFullScreen";
    wrapper.innerHTML = `
      <div style="position:fixed;top:0;left:0;width:100%;height:100%;background:white;z-index:2000;padding:20px;display:flex;flex-direction:column;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
          <h3>Carrito de Compras</h3>
          <button id="cerrarCarritoBtn" style="background:#e74c3c;color:white;border:none;border-radius:50%;width:36px;height:36px;font-size:1.2rem;cursor:pointer;"><i class="fas fa-times"></i></button>
        </div>
        <div id="carritoContenidoClone"></div>
      </div>
    `;
    document.body.appendChild(wrapper);
    const clone = document.getElementById("cart-items").cloneNode(true);
    document.getElementById("carritoContenidoClone").appendChild(clone);
    document.getElementById("cerrarCarritoBtn").addEventListener("click", () => {
      document.body.removeChild(wrapper);
    });
  });
}

// ===== MENÚ Y AUTENTICACIÓN =====
mobileMenuBtn.addEventListener("click", () => mobileMenu.classList.toggle("active"));
logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("usuarioLogueado");
  window.location.href = "login.html";
});

if (!localStorage.getItem("usuarioLogueado")) {
  window.location.href = "login.html";
}

// ===== INICIALIZAR =====
window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (id) {
    cargarFactura(id);
  } else {
    actualizarCarrito();
  }
});
