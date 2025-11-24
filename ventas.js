// ventas.js - CORREGIDO con todos los errores arreglados
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

/* ---------- MODALES (AHORA SÍ FUNCIONAN) ---------- */
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

/* ---------- GUARDAR VENTA (CON NUMERO DE EQUIPO) ---------- */
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
    
    if (equipoInput) equipoInput.value = "";
    if (clienteInput) clienteInput.value = "";
    
    idFactura = null;
    
    if (window.actualizarCarrito) {
        window.actualizarCarrito(false);
    }
}

/* ---------- CARRITO ---------- */
function agregarProducto(desc, precio, cantidad) {
    const sub = precio * cantidad;
    carrito.push({ desc, precio, cantidad, subtotal: sub });
    total += sub;
    cantidadTotal += cantidad;
    
    if (window.actualizarCarrito) {
        window.actualizarCarrito(true);
    }
    
    mostrarNotificacionProducto(desc, precio, cantidad);
    guardarVentaAutomaticamente();
}

/* ---------- MINI HISTORIAL (AHORA SI ACTUALIZA EN TIEMPO REAL) ---------- */
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
            miniGrid.innerHTML = "<p style='color:#7f8c8d;font-size:.9rem'>Sin ventas hoy</p>";
            return;
        }
        
        const grupos = {};
        lista.forEach(v => {
            if (!grupos[v.equipo]) grupos[v.equipo] = [];
            grupos[v.equipo].push(v);
        });

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
            detalleEquipoContent.innerHTML = "<p>No se encontraron ventas para este equipo hoy.</p>";
            modalDetalle.style.display = "flex";
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
        
        detalleEquipoContent.innerHTML = html;
        modalDetalle.style.display = "flex";
        
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

window.editarFactura = (id) => {
    const modalDetalle = document.getElementById("modalDetalle");
    if (modalDetalle) modalDetalle.style.display = 'none';
    window.location.href = `venta.html?id=${id}`;
};

/* ---------- INICIALIZAR TODO ---------- */
window.addEventListener('DOMContentLoaded', async () => {
    console.log("Iniciando ventas.js con todas las correcciones...");
    
    if (!localStorage.getItem('usuarioLogueado')) {
        window.location.href = 'login.html';
        return;
    }
    
    await cargarVentaGuardada();
    
    // Configurar eventos
    const equipoInput = document.getElementById("equipo");
    const clienteInput = document.getElementById("cliente");
    
    if (equipoInput) equipoInput.addEventListener("input", guardarVentaAutomaticamente);
    if (clienteInput) clienteInput.addEventListener("input", guardarVentaAutomaticamente);
    
    // Configurar botones de modales (AHORA SÍ FUNCIONAN)
    const btnConAbono = document.getElementById("btnConAbono");
    const btnSinAbono = document.getElementById("btnSinAbono");
    const confirmarAbonoBtn = document.getElementById("confirmarAbonoBtn");
    const confirmarEliminarBtn = document.getElementById("confirmarEliminarBtn");
    
    if (btnConAbono) btnConAbono.addEventListener("click", () => {
        cerrarAbonoInicial();
        mostrarModalMontoAbono();
    });
    
    if (btnSinAbono) btnSinAbono.addEventListener("click", () => {
        cerrarAbonoInicial();
        guardarVentaCredito(false);
    });
    
    if (confirmarAbonoBtn) confirmarAbonoBtn.addEventListener("click", confirmarAbonoInicial);
    
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
});
