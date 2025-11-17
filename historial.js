// historial.js
import { db } from "./firebase-config.js";
import { collection, query, orderBy, limit, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const ventasContainer = document.getElementById("ventas-container");
const emptyVentas = document.getElementById("empty-ventas");
const filterInput = document.getElementById("filter-historial");
const printBtn = document.getElementById("print-historial-btn");
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const mobileMenu = document.getElementById("mobileMenu");
const logoutBtn = document.getElementById("logoutBtn");

// Modales
const modalEliminar = document.getElementById("modalEliminar");
const modalConfirmarEliminar = document.getElementById("modalConfirmarEliminar");
const modalCancelarEliminar = document.getElementById("modalCancelarEliminar");

let ventas = [];
let idActual = null;

// Cargar ventas
async function cargarVentas() {
  const q = query(collection(db, "ventas"), orderBy("fecha", "desc"), limit(500));
  const snapshot = await getDocs(q);
  ventas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderVentas(ventas);
}

// Renderizar ventas agrupadas por día
function renderVentas(lista) {
  if (lista.length === 0) {
    ventasContainer.innerHTML = "";
    emptyVentas.style.display = "block";
    return;
  }

  emptyVentas.style.display = "none";
  const grupos = agruparPorDia(lista);

  ventasContainer.innerHTML = Object.entries(grupos).map(([dia, items]) => `
    <div class="dia-group">
      <div class="dia-header">
        <div class="dia-titulo">${items[0].fechaLabel}</div>
        <div class="dia-fecha">${dia}</div>
      </div>
      <div class="ventas-dia-grid">
        ${items.map(v => `
          <div class="venta-item" onclick="toggleDetail('${v.id}')">
            <div class="venta-desc">${v.equipo} - ${v.cliente}</div>
            <div class="venta-cant">${v.cantidadTotal}</div>
            <div class="venta-precio">$${v.total.toFixed(2)}</div>
            <div class="venta-subtotal">$${v.total.toFixed(2)}</div>
            <div class="venta-tipo">${v.tipo}</div>
            <div class="venta-actions">
              <button class="btn btn-warning" onclick="editarVenta('${v.id}')">Editar</button>
              <button class="btn btn-danger" onclick="abrirEliminar('${v.id}')">Eliminar</button>
            </div>
          </div>
          <div id="detail-${v.id}" class="venta-detail">
            <table>
              <thead>
                <tr><th>Producto</th><th>Cant</th><th>Precio</th><th>Subtotal</th></tr>
              </thead>
              <tbody>
                ${v.items.map(i => `
                  <tr>
                    <td>${i.desc}</td>
                    <td>${i.cantidad}</td>
                    <td>$${i.precio.toFixed(2)}</td>
                    <td>$${i.subtotal.toFixed(2)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");
}

// Agrupar por día
function agruparPorDia(lista) {
  return lista.reduce((acc, v) => {
    const dia = new Date(v.fecha?.seconds * 1000).toLocaleDateString("es-ES");
    const fechaLabel = new Date(v.fecha?.seconds * 1000).toLocaleDateString("es-ES", { weekday: 'long' });
    if (!acc[dia]) acc[dia] = [];
    acc[dia].push({ ...v, fechaLabel });
    return acc;
  }, {});
}

// Mostrar/ocultar detalle
window.toggleDetail = (id) => {
  const detail = document.getElementById(`detail-${id}`);
  detail.classList.toggle("show");
};

// EDITAR: redirige a venta.html con ID
window.editarVenta = (id) => {
  window.location.href = `venta.html?id=${id}`;
};

// ELIMINAR: modal + confirmación
window.abrirEliminar = (id) => {
  idActual = id;
  modalEliminar.style.display = "flex";
};

// Cerrar modal eliminar
function cerrarModales() {
  modalEliminar.style.display = "none";
  idActual = null;
}

// Confirmar eliminar
modalConfirmarEliminar.addEventListener("click", async () => {
  try {
    await deleteDoc(doc(db, "ventas", idActual));
    cerrarModales();
    cargarVentas();
  } catch (e) {
    alert("Error al eliminar");
  }
});

modalCancelarEliminar.addEventListener("click", cerrarModales);

// Filtrar por equipo
filterInput.addEventListener("input", () => {
  const valor = filterInput.value.trim().toLowerCase();
  const filtradas = ventas.filter(v => v.equipo.toLowerCase().includes(valor));
  renderVentas(filtradas);
});

// Imprimir historial
printBtn.addEventListener("click", () => {
  const texto = ventasContainer.innerText;
  const ventana = window.open("", "", "width=600,height=600");
  ventana.document.write(`
    <html>
      <head><title>Historial de Ventas</title></head>
      <body><pre>${texto}</pre></body>
    </html>
  `);
  ventana.print();
  ventana.close();
});

// Menú móvil
mobileMenuBtn.addEventListener("click", () => mobileMenu.classList.toggle("active"));
logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("usuarioLogueado");
  window.location.href = "login.html";
});

// Autenticación básica
if (!localStorage.getItem("usuarioLogueado")) {
  window.location.href = "login.html";
}

// Iniciar
cargarVentas();
