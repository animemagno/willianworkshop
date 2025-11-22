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

/* ---------- GUARDADO AUTOMÁTICO ---------- */
const VENTA_GUARDADA_KEY = 'ventaEnProgreso';

// Guardar venta automáticamente
function guardarVentaAutomaticamente() {
    console.log("🔵 GUARDANDO VENTA AUTOMÁTICAMENTE...");
    
    const equipoInput = document.getElementById("equipo");
    const clienteInput = document.getElementById("cliente");
    
    const ventaData = {
        equipo: equipoInput?.value || "",
        cliente: clienteInput?.value || "",
        carrito: carrito,
        total: total,
        cantidadTotal: cantidadTotal,
        fechaGuardado: new Date().toISOString(),
        idFactura: idFactura
    };
    
    console.log("📦 Datos a guardar:", ventaData);
    
    // Guardar en localStorage (funciona sin internet)
    localStorage.setItem(VENTA_GUARDADA_KEY, JSON.stringify(ventaData));
    console.log("✅ Guardado en localStorage");
    
    // Guardar en Firebase (si hay conexión)
    guardarVentaEnFirebase(ventaData);
}

// Guardar en Firebase
async function guardarVentaEnFirebase(ventaData) {
    try {
        const usuario = localStorage.getItem('usuarioLogueado');
        if (!usuario) {
            console.log("❌ No hay usuario logueado, no se guarda en Firebase");
            return;
        }
        
        const docRef = doc(db, "ventasTemporales", usuario);
        await setDoc(docRef, {
            ...ventaData,
            usuario: usuario,
            ultimaActualizacion: serverTimestamp()
        });
        console.log("✅ Guardado en Firebase");
    } catch (error) {
        console.log("❌ Error guardando en Firebase:", error);
    }
}

// Cargar venta guardada al iniciar
async function cargarVentaGuardada() {
    console.log("🟡 INICIANDO CARGA DE VENTA GUARDADA...");
    
    // Primero intentar desde localStorage (más rápido)
    const ventaLocal = localStorage.getItem(VENTA_GUARDADA_KEY);
    console.log("📂 Ventas en localStorage:", ventaLocal ? "SÍ" : "NO");
    
    if (ventaLocal) {
        const ventaData = JSON.parse(ventaLocal);
        const fechaGuardado = new Date(ventaData.fechaGuardado);
        const hoy = new Date();
        
        console.log("📅 Fecha guardada:", fechaGuardado.toLocaleString());
        console.log("📅 Hoy:", hoy.toLocaleString());
        console.log("🔍 Mismo día?:", fechaGuardado.toDateString() === hoy.toDateString());
        
        // Solo cargar si es del mismo día
        if (fechaGuardado.toDateString() === hoy.toDateString()) {
            console.log("🔄 Aplicando venta guardada desde localStorage...");
            aplicarVentaGuardada(ventaData);
            return true;
        } else {
            console.log("🗑️ Limpiando venta de días anteriores...");
            limpiarVentaGuardada();
        }
    }
    
    // Si no hay en localStorage, intentar desde Firebase
    console.log("🌐 Intentando cargar desde Firebase...");
    return await cargarVentaDesdeFirebase();
}

// Cargar desde Firebase
async function cargarVentaDesdeFirebase() {
    try {
        const usuario = localStorage.getItem('usuarioLogueado');
        if (!usuario) {
            console.log("❌ No hay usuario para cargar desde Firebase");
            return false;
        }
        
        console.log("👤 Usuario:", usuario);
        const docRef = doc(db, "ventasTemporales", usuario);
        const docSnap = await getDoc(docRef);
        
        console.log("📄 Documento en Firebase:", docSnap.exists() ? "EXISTE" : "NO EXISTE");
        
        if (docSnap.exists()) {
            const ventaData = docSnap.data();
            const fechaGuardado = ventaData.fechaGuardado ? new Date(ventaData.fechaGuardado) : new Date();
            const hoy = new Date();
            
            console.log("📅 Fecha Firebase:", fechaGuardado.toLocaleString());
            console.log("📅 Hoy:", hoy.toLocaleString());
            console.log("🔍 Mismo día?:", fechaGuardado.toDateString() === hoy.toDateString());
            
            // Solo cargar si es del mismo día
            if (fechaGuardado.toDateString() === hoy.toDateString()) {
                console.log("🔄 Aplicando venta guardada desde Firebase...");
                aplicarVentaGuardada(ventaData);
                return true;
            } else {
                console.log("🗑️ Limpiando venta antigua de Firebase...");
                limpiarVentaGuardada();
            }
        }
    } catch (error) {
        console.log("❌ Error cargando desde Firebase:", error);
    }
    return false;
}

// Aplicar los datos de la venta guardada
function aplicarVentaGuardada(ventaData) {
    console.log("🎯 APLICANDO VENTA GUARDADA:", ventaData);
    
    const equipoInput = document.getElementById("equipo");
    const clienteInput = document.getElementById("cliente");
    
    if (ventaData.equipo && equipoInput) {
        equipoInput.value = ventaData.equipo;
        console.log("🔢 Equipo aplicado:", ventaData.equipo);
    }
    
    if (ventaData.cliente && clienteInput) {
        clienteInput.value = ventaData.cliente;
        console.log("🏙️ Ciudad aplicada:", ventaData.cliente);
    }
    
    if (ventaData.carrito && ventaData.carrito.length > 0) {
        carrito = ventaData.carrito;
        total = ventaData.total || 0;
        cantidadTotal = ventaData.cantidadTotal || 0;
        
        console.log("🛒 Carrito aplicado:", carrito.length, "productos");
        console.log("💰 Total aplicado:", total);
        console.log("📦 Cantidad total aplicada:", cantidadTotal);
        
        // Llamar a actualizarCarrito después de un pequeño delay para asegurar que el DOM esté listo
        setTimeout(() => {
            actualizarCarrito(false);
            console.log("✅ Venta recuperada y aplicada completamente");
        }, 100);
        
    } else {
        console.log("❌ No hay productos en el carrito guardado");
    }
    
    if (ventaData.idFactura) {
        idFactura = ventaData.idFactura;
        console.log("📝 ID Factura aplicado:", idFactura);
    }
}

// Limpiar venta guardada
function limpiarVentaGuardada() {
    console.log("🧹 LIMPIANDO VENTA GUARDADA...");
    localStorage.removeItem(VENTA_GUARDADA_KEY);
    const usuario = localStorage.getItem('usuarioLogueado');
    if (usuario) {
        // Intentar limpiar en Firebase también
        const docRef = doc(db, "ventasTemporales", usuario);
        setDoc(docRef, {}).catch(() => {});
    }
    console.log("✅ Venta guardada limpiada");
}

/* ---------- EJECUCIÓN DESPUÉS DE QUE EXISTA EL DOM ---------- */
window.addEventListener('DOMContentLoaded', async () => {
  console.log("🚀 DOM CARGADO - INICIANDO VENTAS.JS");

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

  console.log("🔍 Elementos del DOM encontrados:");
  console.log("- Equipo input:", !!equipoInput);
  console.log("- Cliente input:", !!clienteInput);
  console.log("- Cart items:", !!cartItems);

  /* ---------- Cargar venta guardada al iniciar ---------- */
  console.log("🔄 CARGANDO VENTA GUARDADA...");
  await cargarVentaGuardada();

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
    console.log("🗑️ Confirmando eliminación de producto...");
    if (itemAEliminar !== null) {
      const it = carrito[itemAEliminar];
      total -= it.subtotal; 
      cantidadTotal -= it.cantidad;
      carrito.splice(itemAEliminar, 1);
      actualizarCarrito(false);
      itemAEliminar = null;
      guardarVentaAutomaticamente();
    }
    modalConfirmarEliminar.style.display = 'none';
  });

  /* ---------- carrito ---------- */
  function agregarProducto(desc, precio, cantidad) {
    console.log("➕ AGREGANDO PRODUCTO:", desc, precio, cantidad);
    const sub = precio * cantidad;
    carrito.push({ desc, precio, cantidad, subtotal: sub });
    total += sub;
    cantidadTotal += cantidad;
    actualizarCarrito(true);
    guardarVentaAutomaticamente();
  }

  function actualizarCarrito(desdeAgregar = false) {
    console.log("🛒 ACTUALIZANDO CARRITO. Productos:", carrito.length);
    
    if (carrito.length === 0) {
      cartItems.innerHTML = `<div class="empty-cart"><i class="fas fa-shopping-cart"></i><div>No hay productos</div></div>`;
      console.log("🛒 Carrito vacío - mostrando mensaje");
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
      console.log("🛒 Carrito actualizado con", carrito.length, "productos");
    }
    
    cartBadge.textContent  = cantidadTotal;
    cartTotalTxt.textContent = `$${total.toFixed(2)}`;
    cartResumen.textContent = `Productos: ${cantidadTotal} | Total: `;
    
    console.log("📊 Resumen actualizado - Productos:", cantidadTotal, "Total:", total);
  }

  window.abrirConfirmarEliminar = (i) => {
    console.log("❓ Abriendo confirmación para eliminar producto índice:", i);
    itemAEliminar = i;
    modalConfirmarEliminar.style.display = 'flex';
  };

  window.cambiarCantidad = (i, v) => {
    console.log("🔢 Cambiando cantidad del producto", i, "a", v);
    const nueva = parseInt(v) || 1;
    const it = carrito[i];
    total -= it.subtotal; 
    cantidadTotal -= it.cantidad;
    it.cantidad = nueva; 
    it.subtotal = it.precio * it.cantidad;
    total += it.subtotal; 
    cantidadTotal += it.cantidad;
    actualizarCarrito(false);
    guardarVentaAutomaticamente();
  };

  window.cambiarPrecio = (i, v) => {
    console.log("💰 Cambiando precio del producto", i, "a", v);
    const nuevo = parseFloat(v) || 0;
    const it = carrito[i];
    total -= it.subtotal;
    it.precio = nuevo; 
    it.subtotal = it.precio * it.cantidad;
    total += it.subtotal;
    actualizarCarrito(false);
    guardarVentaAutomaticamente();
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

  /* ---------- Guardar automáticamente cuando cambian los campos de equipo y cliente ---------- */
  equipoInput.addEventListener("input", () => {
    console.log("✏️ Equipo cambiado, guardando...");
    guardarVentaAutomaticamente();
  });

  clienteInput.addEventListener("input", () => {
    console.log("✏️ Cliente cambiado, guardando...");
    guardarVentaAutomaticamente();
  });

  /* ---------- edición ---------- */
  async function cargarFactura(id) {
    try {
      console.log("📝 Cargando factura para edición:", id);
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
      guardarVentaAutomaticamente();
    } catch (e) { 
      mostrarError("Error al cargar la factura."); 
    }
  }

  /* ---------- guardar / actualizar ---------- */
  async function guardarVenta(tipoBoton) {
    console.log("💾 GUARDANDO VENTA FINAL...");
    const eq = equipoInput.value.trim();
    if (!eq) {
      mostrarError("Ingresa el número de equipo.");
      return;
    }
    if (carrito.length === 0) {
      mostrarError("Agrega al menos un producto al carrito.");
      return;
    }

    // Validar que no haya precios en $0.00 antes de completar
    const tienePrecioCero = carrito.some(item => item.precio === 0);
    if (tienePrecioCero) {
      mostrarError("Complete todos los precios antes de finalizar la venta.");
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
      limpiarVentaGuardada();
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
    console.log("🧹 LIMPIANDO TODO...");
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
    const lista = snap.docs.map(d => ({ 
      id: d.id, 
      ...d.data(),
      fechaTimestamp: d.data().fecha
    }));

    if (lista.length === 0) {
      miniGrid.innerHTML = "<p style='color:#7f8c8d;font-size:.9rem'>Sin movimientos hoy</p>";
      return;
    }
    
    // Agrupar por equipo pero mantener todas las facturas individuales
    const grupos = {};
    lista.forEach(v => {
      if (!grupos[v.equipo]) {
        grupos[v.equipo] = [];
      }
      grupos[v.equipo].push(v);
    });

    miniGrid.innerHTML = Object.entries(grupos).map(([eq, facturas]) => {
      const totalEquipo = facturas.reduce((sum, v) => sum + v.total, 0);
      const esLocal = facturas[0].esLocal;
      const ciudad = facturas[0].ciudad;
      
      return `
        <div class="mini-card" onclick="mostrarDetalleEquipo('${eq}')" title="Clic para ver todas las facturas de este equipo">
          <div class="mini-equipo">${eq}</div>
          <div class="mini-total">$${totalEquipo.toFixed(2)}</div>
          ${!esLocal && ciudad ? `<div class="mini-ciudad">${ciudad}</div>` : ''}
        </div>`;
    }).join("");
  }

  window.mostrarDetalleEquipo = async (equipo) => {
    try {
      const hoy = new Date();
      const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0);
      const fin    = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);
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

      if (facturas.length === 0) return;

      let html = `<h4 style="margin-bottom:15px;color:#2c3e50;text-align:center;">Facturas del Equipo: ${equipo}</h4>`;
      
      facturas.forEach((v, index) => {
        const fecha = v.fechaTimestamp ? 
          new Date(v.fechaTimestamp.seconds * 1000).toLocaleString() : "Fecha no disponible";
        
        html += `
          <div style="margin-bottom:20px;padding:15px;border:1px solid #ddd;border-radius:6px;background:#f8f9fa;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #ccc;">
              <strong style="color:#2c3e50;">Factura ${index + 1}</strong>
              <span style="font-size:.75rem;color:#7f8c8d;">${fecha}</span>
            </div>
            <table style="width:100%;font-size:.8rem;border-collapse:collapse;margin-bottom:10px;">
              <tr>
                <td style="padding:4px;font-weight:bold;width:80px;">Cliente:</td>
                <td style="padding:4px;">${v.cliente}</td>
              </tr>
              <tr>
                <td style="padding:4px;font-weight:bold;">Tipo:</td>
                <td style="padding:4px;">
                  <span style="padding:2px 6px;border-radius:3px;color:white;background:${v.tipo === 'credito' ? '#f39c12' : '#3498db'};font-size:.7rem;">
                    ${v.tipo}
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding:4px;font-weight:bold;">Total:</td>
                <td style="padding:4px;font-weight:bold;color:#27ae60;">$${v.total.toFixed(2)}</td>
              </tr>
            </table>
            <table style="width:100%;font-size:.75rem;border-collapse:collapse;margin-bottom:10px;">
              <thead>
                <tr style="background:#2c3e50;color:white">
                  <th style="padding:6px;text-align:left;">Producto</th>
                  <th style="padding:6px;text-align:center;">Cant</th>
                  <th style="padding:6px;text-align:right;">P.U.</th>
                  <th style="padding:6px;text-align:right;">Subt.</th>
                </tr>
              </thead>
              <tbody>`;
        
        v.items.forEach(i => {
          html += `
            <tr>
              <td style="padding:6px;border-bottom:1px solid #eee;">${i.desc}</td>
              <td style="padding:6px;border-bottom:1px solid #eee;text-align:center;">${i.cantidad}</td>
              <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;">$${i.precio.toFixed(2)}</td>
              <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;">$${i.subtotal.toFixed(2)}</td>
            </tr>`;
        });
        
        html += `
              </tbody>
            </table>
            <div style="text-align:right;margin-top:10px;">
              <button class="btn btn-warning" style="font-size:.7rem;padding:6px 12px;" onclick="editarFactura('${v.id}')">
                <i class="fas fa-edit"></i> Editar
              </button>
            </div>
          </div>`;
      });

      // Total general del equipo
      const totalGeneral = facturas.reduce((sum, v) => sum + v.total, 0);
      html += `
        <div style="margin-top:15px;padding:12px;background:#2c3e50;color:white;border-radius:4px;text-align:center;">
          <strong>Total General del Equipo ${equipo}: $${totalGeneral.toFixed(2)}</strong>
        </div>`;

      detalleEquipoContent.innerHTML = html;
      modalDetalle.style.display = "flex";
    } catch (e) { 
      console.error("Error cargando detalle:", e); 
    }
  };

  window.editarFactura = (id) => {
    modalDetalle.style.display = 'none';
    window.location.href = `venta.html?id=${id}`;
  };

  /* ---------- eventos de botones ---------- */
  efectivoBtn.addEventListener("click", () => {
    tipoOriginal = "efectivo";
    guardarVenta("efectivo");
  });
  
  creditoBtn.addEventListener("click", () => {
    if (idFactura) { 
      limpiarVentaGuardada();
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
