// ventas.js
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
  getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ---------- estado ---------- */
let carrito = [];
let total = 0;
let cantidadTotal = 0;
let idFactura = null;
let tipoOriginal = "efectivo";
let itemAEliminar = null;

/* ---------- EJECUCIÓN DESPUÉS DE QUE EXISTA EL DOM ---------- */
window.addEventListener('DOMContentLoaded', () => {

  /* ---------- referencias ---------- */
  const equipoInput   = document.getElementById("equipo");
  const clienteInput  = document.getElementById("cliente");
  const buscarInput   = document.getElementById("buscar-producto");
  const cantInput     = document.getElementById("cantidad");
  const cartItems     = document.getElementById("cart-items");
  const cartBadge     = document.getElementById("cart-badge");
  const cartTotalTxt  = document.getElementById("cart-total");
  const cartResumen   = document.getElementById("cart-resumen");
  const efectivoBtn   = document.getElementById("efectivoBtn");
  const creditoBtn    = document.getElementById("creditoBtn");
  const swapBtn       = document.getElementById("swapBtn");
  const wrapper       = document.getElementById("ventaWrapper");
  const cartIcon      = document.getElementById("cartIcon");
  const tituloVenta   = document.getElementById("tituloVenta");
  const miniGrid      = document.getElementById("miniGrid");
  const detalleBox    = document.getElementById("detalleBox");

  const modalExito    = document.getElementById("modalExito");
  const modalError    = document.getElementById("modalError");
  const modalDetalle  = document.getElementById("modalDetalle");
  const modalConfirmarEliminar = document.getElementById("modalConfirmarEliminar");
  const confirmarEliminarBtn = document.getElementById("confirmarEliminarBtn");
  const detalleEquipoContent = document.getElementById("detalleEquipoContent");
  const txtError      = document.getElementById("textoError");

  /* ---------- funciones de cierre ---------- */
  window.cerrarExito = () => modalExito.style.display = 'none';
  window.cerrarError = () => modalError.style.display = 'none';
  window.cerrarDetalle = () => modalDetalle.style.display = 'none';
  window.cerrarConfirmarEliminar = () => {
    modalConfirmarEliminar.style.display = 'none';
    itemAEliminar = null;
  };

  /* ---------- confirmar eliminación ---------- */
  confirmarEliminarBtn.addEventListener("click", () => {
    if (itemAEliminar !== null) {
      const it = carrito[itemAEliminar];
      total -= it.subtotal; 
      cantidadTotal -= it.cantidad;
      carrito.splice(itemAEliminar, 1);
      actualizarCarrito(false);
      itemAEliminar = null;
    }
    modalConfirmarEliminar.style.display = 'none';
  });

  /* ---------- carrito ---------- */
  function agregarProducto(desc, precio, cantidad) {
    const sub = precio * cantidad;
    carrito.push({ desc, precio, cantidad, subtotal: sub });
    total += sub;
    cantidadTotal += cantidad;
    actualizarCarrito(true);
  }

  function actualizarCarrito(desdeAgregar = false) {
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
      if (desdeAgregar) {
        const nuevo = cartItems.querySelector('.cart-item:last-child');
        if (nuevo) nuevo.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
    cartBadge.textContent  = cantidadTotal;
    cartTotalTxt.textContent = `$${total.toFixed(2)}`;
    cartResumen.textContent = `Productos: ${cantidadTotal} | Total: `;
  }

  window.abrirConfirmarEliminar = (i) => {
    itemAEliminar = i;
    modalConfirmarEliminar.style.display = 'flex';
  };

  window.cambiarCantidad = (i, v) => {
    const nueva = parseInt(v) || 1;
    const it = carrito[i];
    total -= it.subtotal; 
    cantidadTotal -= it.cantidad;
    it.cantidad = nueva; 
    it.subtotal = it.precio * it.cantidad;
    total += it.subtotal; 
    cantidadTotal += it.cantidad;
    actualizarCarrito(false);
  };

  window.cambiarPrecio = (i, v) => {
    const nuevo = parseFloat(v) || 0;
    const it = carrito[i];
    total -= it.subtotal;
    it.precio = nuevo; 
    it.subtotal = it.precio * it.cantidad;
    total += it.subtotal;
    actualizarCarrito(false);
  };

  /* ---------- búsqueda ---------- */
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
      buscarInput.value = ""; 
      cantInput.value = "1";
      e.target.parentElement.style.display = "none";
    }
  });

  document.addEventListener("click", e => {
    if (!e.target.closest(".search-container")) {
      document.getElementById("search-dropdown").style.display = "none";
    }
  });

  /* ---------- edición ---------- */
  async function cargarFactura(id) {
    try {
      const snap = await getDoc(doc(db, "ventas", id));
      if (!snap.exists()) { 
        mostrarError("Factura no encontrada."); 
        return; 
      }
      const data = snap.data();
      idFactura   = id;
      tipoOriginal= data.tipo;
      equipoInput.value  = data.equipo;
      clienteInput.value = data.cliente || "";
      carrito      = data.items.map(x => ({ ...x }));
      total        = data.total;
      cantidadTotal= data.cantidadTotal;

      tituloVenta.textContent = "EDITAR VENTA";
      efectivoBtn.textContent = "Actualizar";
      creditoBtn.textContent  = "Cancelar";
      efectivoBtn.classList.remove("btn-success","btn-warning");
      efectivoBtn.classList.add("btn-primary");
      creditoBtn.classList.remove("btn-success","btn-warning");
      creditoBtn.classList.add("btn-danger");
      actualizarCarrito(false);
    } catch (e) { 
      mostrarError("Error al cargar la factura."); 
    }
  }

  /* ---------- guardar / actualizar ---------- */
  async function guardarVenta(tipoBoton) {
    const eq = equipoInput.value.trim();
    if (!eq) {
      mostrarError("Ingresa el número de equipo.");
      return;
    }
    if (carrito.length === 0) {
      mostrarError("Agrega al menos un producto al carrito.");
      return;
    }

    // Lógica de ciudad: vacío = local, con valor = otra ciudad
    const cliente = clienteInput.value.trim();
    const esLocal = cliente === "";

    const venta = {
      equipo: eq,
      cliente: esLocal ? "LOCAL" : cliente,
      ciudad: cliente,
      esLocal: esLocal,
      tipo: tipoOriginal,
      items: carrito,
      total,
      cantidadTotal
    };

    if (!idFactura) {
      venta.fecha = serverTimestamp();
    }

    try {
      if (idFactura) {
        await updateDoc(doc(db, "ventas", idFactura), venta);
      } else {
        await addDoc(collection(db, "ventas"), venta);
      }
      imprimirTicket(tipoOriginal, esLocal);
      limpiarTodo();
      mostrarExito();
      await cargarMiniHistorial();
    } catch (e) {
      console.error("Error completo:", e);
      mostrarError("Error al guardar: " + (e.message || e.code || "Inténtalo de nuevo."));
    }
  }

  function imprimirTicket(tipo, esLocal) {
    const ubicacion = esLocal ? "LOCAL" : clienteInput.value;
    const ticket = `Taller Wilian
${tipo === "efectivo" ? "VENTA AL CONTADO" : "VENTA A CRÉDITO"}
Equipo: ${equipoInput.value}
Ubicación: ${ubicacion}
------------------------
${carrito.map(it => `${it.desc} x${it.cantidad} $${it.precio.toFixed(2)} = $${it.subtotal.toFixed(2)}`).join("\n")}
------------------------
Total: $${total.toFixed(2)}
Fecha: ${new Date().toLocaleString()}`;
    console.log("🖨️ Ticket:\n" + ticket);
  }

  function limpiarTodo() {
    carrito = []; 
    total = 0; 
    cantidadTotal = 0;
    equipoInput.value = ""; 
    clienteInput.value = ""; 
    idFactura = null;
    tituloVenta.textContent = "NUEVA VENTA";
    efectivoBtn.textContent = "Efectivo";
    creditoBtn.textContent  = "Crédito";
    efectivoBtn.classList.add("btn-success"); 
    efectivoBtn.classList.remove("btn-primary");
    creditoBtn.classList.add("btn-warning");  
    creditoBtn.classList.remove("btn-danger");
    actualizarCarrito(false);
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  function mostrarExito() {
    modalExito.style.display = 'flex';
  }

  function mostrarError(mensaje) {
    txtError.textContent = mensaje;
    modalError.style.display = 'flex';
  }

  /* ---------- mini-historial del DÍA ---------- */
  async function cargarMiniHistorial() {
    const hoy = new Date();
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0);
    const fin    = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);
    const q = query(collection(db, "ventas"), 
                   where("fecha", ">=", inicio), 
                   where("fecha", "<=", fin), 
                   orderBy("fecha", "desc"));
    const snap = await getDocs(q);
    const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (lista.length === 0) {
      miniGrid.innerHTML = "<p style='color:#7f8c8d;font-size:.9rem'>Sin movimientos hoy</p>";
      return;
    }
    
    const grupos = {};
    lista.forEach(v => {
      if (!grupos[v.equipo]) {
        grupos[v.equipo] = { 
          ids: [], 
          total: 0,
          cliente: v.cliente,
          tipo: v.tipo
        };
      }
      grupos[v.equipo].ids.push(v.id);
      grupos[v.equipo].total += v.total;
    });

    miniGrid.innerHTML = Object.entries(grupos).map(([eq, g]) => `
      <div class="mini-card" onclick="mostrarDetalleEquipo('${g.ids[0]}')" title="Clic para ver detalle">
        <div class="mini-equipo">${eq}</div>
        <div class="mini-total">$${g.total.toFixed(2)}</div>
        <small>${g.tipo === "credito" ? "Crédito" : "Efectivo"}</small>
      </div>`).join("");
  }

  window.mostrarDetalleEquipo = async id => {
    try {
      const snap = await getDoc(doc(db, "ventas", id));
      if (!snap.exists()) return;
      const v = snap.data();
      const fecha = v.fecha ? new Date(v.fecha.seconds * 1000).toLocaleString() : "Fecha no disponible";
      
      let html = `<table class="venta-detail-table" style="width:100%;font-size:.8rem;border-collapse:collapse">
        <tr><th style="background:#ecf0f1;padding:6px">Equipo</th><td style="padding:6px">${v.equipo}</td></tr>
        <tr><th style="background:#ecf0f1;padding:6px">Cliente</th><td style="padding:6px">${v.cliente}</td></tr>
        <tr><th style="background:#ecf0f1;padding:6px">Total</th><td style="padding:6px">$${v.total.toFixed(2)}</td></tr>
        <tr><th style="background:#ecf0f1;padding:6px">Tipo</th><td style="padding:6px">${v.tipo}</td></tr>
        <tr><th style="background:#ecf0f1;padding:6px">Fecha</th><td style="padding:6px">${fecha}</td></tr>
        </table>
        <table style="width:100%;font-size:.8rem;border-collapse:collapse;margin-top:10px">
          <thead><tr style="background:#2c3e50;color:white"><th>Producto</th><th>Cant</th><th>P.U.</th><th>Subt.</th></tr></thead>
          <tbody>`;
      v.items.forEach(i => html+=`<tr><td style="padding:4px">${i.desc}</td><td style="padding:4px">${i.cantidad}</td><td style="padding:4px">$${i.precio.toFixed(2)}</td><td style="padding:4px">$${i.subtotal.toFixed(2)}</td></tr>`);
      html += `</tbody></table>`;
      detalleEquipoContent.innerHTML = html;
      modalDetalle.style.display = "flex";
    } catch (e) { 
      console.error("Error cargando detalle:", e); 
    }
  };

  /* ---------- eventos de botones ---------- */
  efectivoBtn.addEventListener("click", () => {
    tipoOriginal = "efectivo";
    guardarVenta("efectivo");
  });
  
  creditoBtn.addEventListener("click", () => {
    if (idFactura) { 
      limpiarTodo(); 
      return; 
    }
    tipoOriginal = "credito";
    guardarVenta("credito");
  });
  
  document.getElementById("abonarBtn").addEventListener('click', () => {
    window.location.href = 'facturas.html';
  });

  /* ---------- móvil ---------- */
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

  /* ---------- menú y login ---------- */
  document.getElementById("mobileMenuBtn").addEventListener("click", () => document.getElementById("mobileMenu").classList.toggle("active"));
  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("usuarioLogueado");
    window.location.href = "login.html";
  });
  if (!localStorage.getItem("usuarioLogueado")) window.location.href = "login.html";

  /* ---------- arranque ---------- */
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (id) cargarFactura(id);
  else actualizarCarrito(false);
  cargarMiniHistorial();

  /* ---------- CIERRES DE MODALES ---------- */
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) modal.style.display = 'none';
    });
  });
  document.querySelectorAll('.modal-box .btn-primary').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.modal-overlay').style.display = 'none');
  });

});
