// ventas.js
import { db } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let carrito = [];
let total = 0;
let cantidadTotal = 0;

const equipoInput = document.getElementById("equipo");
const clienteInput = document.getElementById("cliente");
const buscarProductoInput = document.getElementById("buscar-producto");
const cantidadInput = document.getElementById("cantidad");
const cartItems = document.getElementById("cart-items");
const cartBadge = document.getElementById("cart-badge");
const cartTotalElement = document.getElementById("cart-total");
const efectivoBtn = document.getElementById("efectivoBtn");
const creditoBtn = document.getElementById("creditoBtn");

// Agregar producto al carrito
function agregarProducto(desc, precio, cantidad) {
  const subtotal = precio * cantidad;
  carrito.push({ desc, precio, cantidad, subtotal });
  total += subtotal;
  cantidadTotal += cantidad;
  actualizarCarrito();
}

// Actualizar vista del carrito
function actualizarCarrito() {
  if (carrito.length === 0) {
    cartItems.innerHTML = `<div class="empty-cart"><i class="fas fa-shopping-cart"></i><div>No hay productos</div></div>`;
  } else {
    cartItems.innerHTML = carrito.map((item, index) => `
      <div class="cart-item">
        <div>${item.desc}</div>
        <div>${item.cantidad}</div>
        <div>$${item.precio.toFixed(2)}</div>
        <div>$${item.subtotal.toFixed(2)}</div>
        <div><button class="delete-item-btn" data-index="${index}"><i class="fas fa-trash"></i></button></div>
      </div>
    `).join("");
  }
  cartBadge.textContent = cantidadTotal;
  cartTotalElement.textContent = `$${total.toFixed(2)}`;
}

// Eliminar producto
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

// Búsqueda simulada
buscarProductoInput.addEventListener("focus", () => {
  const dropdown = document.getElementById("search-dropdown");
  dropdown.innerHTML = `
    <div class="search-dropdown-item" data-desc="Llanta 26&quot;" data-precio="25.00">Llanta 26" - $25.00</div>
    <div class="search-dropdown-item" data-desc="Cadena 7v" data-precio="8.50">Cadena 7v - $8.50</div>
    <div class="search-dropdown-item" data-desc="Freno disco" data-precio="15.00">Freno disco - $15.00</div>
  `;
  dropdown.style.display = "block";
});

// Seleccionar producto
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

// Cerrar dropdown al hacer clic fuera
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-container")) {
    document.getElementById("search-dropdown").style.display = "none";
  }
});

// Guardar venta
async function guardarVenta(tipo) {
  const equipo = equipoInput.value.trim();
  const cliente = clienteInput.value.trim();

  if (!equipo || !cliente || carrito.length === 0) {
    alert("Completa equipo, cliente y agrega productos.");
    return;
  }

  const venta = {
    equipo,
    cliente,
    tipo,
    items: carrito,
    total,
    cantidadTotal,
    fecha: serverTimestamp()
  };

  try {
    await addDoc(collection(db, "ventas"), venta);
    alert("Venta guardada ✅");
    imprimirTicket(tipo);
    limpiarTodo();
  } catch (e) {
    console.error("Error al guardar:", e);
    alert("Error al guardar venta.");
  }
}

// Imprimir ticket (simulado)
function imprimirTicket(tipo) {
  const ticket = `
Taller Wilian
${tipo === "efectivo" ? "VENTA AL CONTADO" : "VENTA A CRÉDITO"}
Equipo: ${equipoInput.value}
Cliente: ${clienteInput.value}
------------------------
${carrito.map(i => `${i.desc} x${i.cantidad} $${i.subtotal.toFixed(2)}`).join("\n")}
------------------------
Total: $${total.toFixed(2)}
Fecha: ${new Date().toLocaleString()}
  `;
  console.log("🖨️ Ticket:\n" + ticket);
  // Aquí puedes usar jsPDF o enviar a impresora térmica
}

// Limpiar todo
function limpiarTodo() {
  carrito = [];
  total = 0;
  cantidadTotal = 0;
  equipoInput.value = "";
  clienteInput.value = "";
  actualizarCarrito();
}

// Botones de pago
efectivoBtn.addEventListener("click", () => guardarVenta("efectivo"));
creditoBtn.addEventListener("click", () => guardarVenta("credito"));

// Inicializar
actualizarCarrito();
