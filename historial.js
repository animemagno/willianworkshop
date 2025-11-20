// historial.js
import { db } from "./firebase-config.js";
import {
  collection,
  query,
  orderBy,
  getDocs,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const ventasContainer = document.getElementById("ventas-container");
const emptyVentas     = document.getElementById("empty-ventas");
const filterEquipo    = document.getElementById("filter-equipo");
const filterProducto  = document.getElementById("filter-producto");
const filterTipo      = document.getElementById("filter-tipo");
const filterFecha     = document.getElementById("filter-fecha");
const printBtn        = document.getElementById("print-historial-btn");
const mobileMenuBtn   = document.getElementById("mobileMenuBtn");
const mobileMenu      = document.getElementById("mobileMenu");
const logoutBtn       = document.getElementById("logoutBtn");

// Modales
const modalEliminar        = document.getElementById("modalEliminar");
const modalConfirmarEliminar= document.getElementById("modalConfirmarEliminar");
const modalCancelarEliminar = document.getElementById("modalCancelarEliminar");

let ventas = [];
let idActual = null;

// ---------- Cargar ventas ----------
async function cargarVentas() {
  const q = query(collection(db, "ventas"), orderBy("fecha", "desc"));
  const snapshot = await getDocs(q);
  ventas = snapshot.docs.map(doc => ({ 
    id: doc.id, 
    ...doc.data(),
    fechaTimestamp: doc.data().fecha
  }));
  renderVentas(ventas);
}

// ---------- Renderizar ----------
function renderVentas(lista) {
  if (lista.length === 0) {
    ventasContainer.innerHTML = "";
    emptyVentas.style.display = "block";
    return;
  }
  emptyVentas.style.display = "none";

  const grupos = agruparPorDia(lista);

  ventasContainer.innerHTML = Object.entries(grupos)
    .map(([dia, items]) => `
      <div class="dia-group">
        <div class="dia-header">
          <div class="dia-titulo">${items[0].fechaLabel}</div>
          <div class="dia-fecha">${dia}</div>
        </div>
        <div class="ventas-dia-grid">
          ${items
            .map(v => `
              <div class="venta-item" onclick="toggleDetail('${v.id}')">
                <div class="venta-desc">${v.equipo} - ${v.cliente}</div>
                <div class="venta-cant">${v.cantidadTotal}</div>
                <div class="venta-precio">$${v.total.toFixed(2)}</div>
                <div class="venta-subtotal">$${v.total.toFixed(2)}</div>
                <div class="venta-tipo ${v.tipo === 'credito' ? 'credito' : ''}">${v.tipo}</div>
                <div class="venta-actions">
                  <button class="btn btn-warning" onclick="event.stopPropagation(); editarVenta('${v.id}')">Editar</button>
                  <button class="btn btn-danger"  onclick="event.stopPropagation(); abrirEliminar('${v.id}')">Eliminar</button>
                </div>
              </div>
              <div id="detail-${v.id}" class="venta-detail">
                <table>
                  <thead>
                    <tr><th>Producto</th><th>Cant</th><th>Precio</th><th>Subtotal</th></tr>
                  </thead>
                  <tbody>
                    ${v.items
                      .map(i => `
                        <tr>
                          <td>${i.desc}</td>
                          <td>${i.cantidad}</td>
                          <td>$${i.precio.toFixed(2)}</td>
                          <td>$${i.subtotal.toFixed(2)}</td>
                        </tr>`)
                      .join("")}
                  </tbody>
                </table>
              </div>`)
            .join("")}
        </div>
      </div>`)
    .join("");
}

// ---------- Agrupar por día ----------
function agruparPorDia(lista) {
  return lista.reduce((acc, v) => {
    const fecha = v.fechaTimestamp ? new Date(v.fechaTimestamp.seconds * 1000) : new Date();
    const dia = fecha.toLocaleDateString("es-ES");
    const fechaLabel = fecha.toLocaleDateString("es-ES", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
    if (!acc[dia]) acc[dia] = [];
    acc[dia].push({ ...v, fechaLabel });
    return acc;
  }, {});
}

// ---------- Filtros combinados ----------
function aplicarFiltros() {
  const equipo = filterEquipo.value.trim().toLowerCase();
  const producto = filterProducto.value.trim().toLowerCase();
  const tipo = filterTipo.value;
  const fecha = filterFecha.value;

  const filtradas = ventas.filter(v => {
    // Filtro por equipo
    if (equipo && !v.equipo.toLowerCase().includes(equipo)) return false;
    
    // Filtro por producto
    if (producto) {
      const tieneProducto = v.items.some(item => 
        item.desc.toLowerCase().includes(producto)
      );
      if (!tieneProducto) return false;
    }
    
    // Filtro por tipo
    if (tipo && v.tipo !== tipo) return false;
    
    // Filtro por fecha
    if (fecha) {
      const ventaFecha = v.fechaTimestamp ? 
        new Date(v.fechaTimestamp.seconds * 1000).toISOString().split('T')[0] : 
        new Date().toISOString().split('T')[0];
      if (ventaFecha !== fecha) return false;
    }
    
    return true;
  });

  renderVentas(filtradas);
}

// ---------- Event listeners para filtros ----------
filterEquipo.addEventListener("input", aplicarFiltros);
filterProducto.addEventListener("input", aplicarFiltros);
filterTipo.addEventListener("change", aplicarFiltros);
filterFecha.addEventListener("change", aplicarFiltros);

// ---------- Funciones globales ----------
window.toggleDetail = id => {
  const det = document.getElementById(`detail-${id}`);
  det.classList.toggle("show");
};

window.editarVenta = id => {
  window.location.href = `venta.html?id=${id}`;
};

window.abrirEliminar = id => {
  idActual = id;
  modalEliminar.style.display = "flex";
};

// ---------- Cerrar modales ----------
function cerrarModales() {
  modalEliminar.style.display = "none";
  idActual = null;
}
modalCancelarEliminar.addEventListener("click", cerrarModales);

// ---------- Confirmar eliminar ----------
modalConfirmarEliminar.addEventListener("click", async () => {
  try {
    await deleteDoc(doc(db, "ventas", idActual));
    cerrarModales();
    cargarVentas();
  } catch (e) {
    alert("Error al eliminar");
  }
});

// ---------- Imprimir ----------
printBtn.addEventListener("click", () => {
  const ventana = window.open("", "_blank", "width=800,height=600");
  const fecha = new Date().toLocaleDateString("es-ES");
  
  let contenido = `
    <html>
      <head>
        <title>Historial de Ventas - Taller Wilian</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #2c3e50; text-align: center; margin-bottom: 20px; }
          .fecha { text-align: center; color: #7f8c8d; margin-bottom: 30px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
          th { background-color: #2c3e50; color: white; }
          tr:nth-child(even) { background-color: #f8f9fa; }
          .total { font-weight: bold; text-align: right; margin-top: 20px; }
          .credito { background-color: #fff3cd; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <h1>Taller Wilian - Historial de Ventas</h1>
        <div class="fecha">Reporte generado: ${fecha}</div>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Equipo</th>
              <th>Cliente</th>
              <th>Productos</th>
              <th>Tipo</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
  `;

  ventas.forEach(venta => {
    const fechaVenta = venta.fechaTimestamp ? 
      new Date(venta.fechaTimestamp.seconds * 1000).toLocaleDateString("es-ES") : 
      "Sin fecha";
    
    const productos = venta.items.map(item => 
      `${item.desc} (x${item.cantidad})`
    ).join(", ");

    contenido += `
      <tr class="${venta.tipo === 'credito' ? 'credito' : ''}">
        <td>${fechaVenta}</td>
        <td>${venta.equipo}</td>
        <td>${venta.cliente}</td>
        <td>${productos}</td>
        <td>${venta.tipo}</td>
        <td>$${venta.total.toFixed(2)}</td>
      </tr>
    `;
  });

  const totalGeneral = ventas.reduce((sum, venta) => sum + venta.total, 0);
  
  contenido += `
          </tbody>
        </table>
        <div class="total">Total General: $${totalGeneral.toFixed(2)}</div>
        <div class="total">Total de Ventas: ${ventas.length}</div>
      </body>
    </html>
  `;

  ventana.document.write(contenido);
  ventana.document.close();
  ventana.print();
});

// ---------- Menú móvil ----------
mobileMenuBtn.addEventListener("click", () => mobileMenu.classList.toggle("active"));
logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("usuarioLogueado");
  window.location.href = "login.html";
});

// ---------- Autenticación ----------
if (!localStorage.getItem("usuarioLogueado")) window.location.href = "login.html";

// ---------- Iniciar ----------
cargarVentas();
