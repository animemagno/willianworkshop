// historial.js
import { db } from "./firebase-config.js";
import { collection, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const ventasContainer = document.getElementById("ventas-container");
const emptyVentas = document.getElementById("empty-ventas");
const filterInput = document.getElementById("filter-historial");
const printBtn = document.getElementById("print-historial-btn");
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const mobileMenu = document.getElementById("mobileMenu");
const logoutBtn = document.getElementById("logoutBtn");

let ventas = [];

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
          <div class="venta-item">
            <div class="venta-desc">${v.equipo} - ${v.cliente}</div>
            <div class="venta-cant">${v.cantidadTotal}</div>
            <div class="venta-precio">$${v.total.toFixed(2)}</div>
            <div class="venta-subtotal">$${v.total.toFixed(2)}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");
}

// Agrupar por día (formato DD/MM/YYYY)
function agruparPorDia(lista) {
  return lista.reduce((acc, v) => {
    const dia = new Date(v.fecha?.seconds * 1000).toLocaleDateString("es-ES");
    const fechaLabel = new Date(v.fecha?.seconds * 1000).toLocaleDateString("es-ES", { weekday: 'long' });
    if (!acc[dia]) acc[dia] = [];
    acc[dia].push({ ...v, fechaLabel });
    return acc;
  }, {});
}

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
