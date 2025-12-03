// facturas.js - Gestión de facturas pendientes y grupos
import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  arrayUnion,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ---------- ESTADO ---------- */
let facturasPendientes = [];
let grupos = new Map();
let equiposPendientes = new Map();
let unsubscribeVentas = null;
let unsubscribeGrupos = null;

/* ---------- INICIALIZACIÓN ---------- */
document.addEventListener('DOMContentLoaded', async () => {
    if (!localStorage.getItem('usuarioLogueado')) {
        window.location.href = 'login.html';
        return;
    }

    await cargarGrupos();
    setupRealTimeListener();
    
    // Event listeners para botones de abono masivo (se agregarán dinámicamente)
});

/* ---------- LISTENER TIEMPO REAL (VENTAS) ---------- */
function setupRealTimeListener() {
    const q = query(
        collection(db, "ventas"),
        where("tipo", "==", "credito"),
        where("saldoPendiente", ">", 0)
    );

    unsubscribeVentas = onSnapshot(q, async (snapshot) => {
        facturasPendientes = [];
        equiposPendientes.clear();

        snapshot.forEach(doc => {
            const venta = { id: doc.id, ...doc.data() };
            facturasPendientes.push(venta);
            
            // Agrupar por equipo para cálculos rápidos
            const equipoNum = venta.equipo;
            if (!equiposPendientes.has(equipoNum)) {
                equiposPendientes.set(equipoNum, {
                    numero: equipoNum,
                    total: 0,
                    ciudad: venta.ciudad || '',
                    esLocal: venta.esLocal
                });
            }
            const equipoData = equiposPendientes.get(equipoNum);
            equipoData.total += venta.saldoPendiente;
        });

        // Ordenar facturas por fecha (más antiguas primero) para lógica de abonos
        facturasPendientes.sort((a, b) => {
            const dateA = a.fecha?.seconds || 0;
            const dateB = b.fecha?.seconds || 0;
            return dateA - dateB;
        });

        await actualizarTotalesGrupos(true); // Forzar actualización de totales
        renderFacturas();
        renderGrupos();
        actualizarEstadoVacio();
    }, (error) => {
        console.error("Error en listener de ventas:", error);
    });
}

/* ---------- CARGAR GRUPOS (Una vez al inicio, luego listener si se desea) ---------- */
async function cargarGrupos() {
    try {
        const q = query(collection(db, "grupos"));
        const snapshot = await getDocs(q);
        
        grupos.clear();
        snapshot.forEach(doc => {
            grupos.set(doc.id, { id: doc.id, ...doc.data() });
        });
        
        // Listener para cambios en grupos (creación/edición)
        unsubscribeGrupos = onSnapshot(collection(db, "grupos"), (snap) => {
            grupos.clear();
            snap.forEach(doc => {
                grupos.set(doc.id, { id: doc.id, ...doc.data() });
            });
            actualizarTotalesGrupos(true);
            renderGrupos();
        });

    } catch (error) {
        console.error("Error cargando grupos:", error);
    }
}

/* ---------- ACTUALIZAR TOTALES DE GRUPOS ---------- */
async function actualizarTotalesGrupos(force = false) {
    const batch = writeBatch(db);
    let updatesCount = 0;

    for (const [grupoId, grupo] of grupos.entries()) {
        let nuevoTotal = 0;

        // Recalcular total sumando deudas de equipos pertenecientes al grupo
        if (grupo.equipos && Array.isArray(grupo.equipos)) {
            grupo.equipos.forEach(equipoNum => {
                const equipoData = equiposPendientes.get(equipoNum);
                if (equipoData) {
                    nuevoTotal += equipoData.total;
                }
            });
        }

        // Si el total cambió, actualizar en Firebase y localmente
        if (grupo.total !== nuevoTotal) {
            grupo.total = nuevoTotal;
            const grupoRef = doc(db, "grupos", grupoId);
            batch.update(grupoRef, { 
                total: nuevoTotal,
                ultimaActualizacion: serverTimestamp()
            });
            updatesCount++;
        }
    }

    if (updatesCount > 0) {
        try {
            await batch.commit();
            console.log(`Actualizados ${updatesCount} grupos`);
        } catch (error) {
            console.error("Error actualizando totales de grupos:", error);
        }
    }
}

/* ---------- RENDERIZAR FACTURAS (EQUIPOS SUELTOS) ---------- */
function renderFacturas() {
    const container = document.getElementById('facturas-container');
    if (!container) return;

    // Identificar equipos que YA están en un grupo para no mostrarlos sueltos
    const equiposEnGrupos = new Set();
    grupos.forEach(g => {
        if (g.equipos) g.equipos.forEach(e => equiposEnGrupos.add(e));
    });

    // Filtrar equipos pendientes que NO están en grupos
    const equiposSueltos = Array.from(equiposPendientes.values())
        .filter(e => !equiposEnGrupos.has(e.numero));

    container.innerHTML = equiposSueltos.map(equipo => `
        <div class="factura-card ${equipo.esLocal ? 'local' : 'otra-ciudad'}" onclick="mostrarDetalleEquipo('${equipo.numero}')">
            <span class="tipo-badge ${equipo.esLocal ? 'badge-local' : 'badge-otra-ciudad'}">
                ${equipo.esLocal ? 'LOCAL' : 'CIUDAD'}
            </span>
            <div class="equipo-numero">${equipo.numero}</div>
            ${!equipo.esLocal && equipo.ciudad ? `<div class="ciudad-nombre">${equipo.ciudad}</div>` : ''}
            <div class="saldo-total">$${equipo.total.toFixed(2)}</div>
        </div>
    `).join('');
}

/* ---------- RENDERIZAR GRUPOS ---------- */
function renderGrupos() {
    const container = document.getElementById('grupos-container');
    if (!container) return;

    if (grupos.size === 0) {
        container.innerHTML = '';
        return;
    }

    const gruposArray = Array.from(grupos.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));

    container.innerHTML = gruposArray.map(grupo => {
        // Generar HTML de equipos dentro del grupo
        const equiposHtml = (grupo.equipos || []).map(equipoNum => {
            const data = equiposPendientes.get(equipoNum);
            const saldo = data ? data.total : 0;
            const ciudad = data ? data.ciudad : '';
            
            // Solo mostrar si tiene saldo o si queremos mostrar todos
            if (saldo <= 0) return ''; 

            return `
                <div class="grupo-equipo-item">
                    <div class="grupo-equipo-numero">${equipoNum}</div>
                    ${ciudad ? `<div class="grupo-equipo-ciudad">${ciudad}</div>` : ''}
                    <div class="grupo-equipo-saldo">$${saldo.toFixed(2)}</div>
                </div>
            `;
        }).join('');

        if (grupo.total <= 0) return ''; // Ocultar grupos sin deuda

        return `
            <div class="grupo-card">
                <div class="grupo-header">
                    <div class="grupo-nombre">${grupo.nombre}</div>
                    <div class="grupo-actions" style="position: absolute; top: 10px; right: 10px; z-index: 10;">
                        <button class="icon-btn btn-success" onclick="abrirModalAbonoGrupo('${grupo.id}')" title="Abonar a Grupo">
                            <i class="fas fa-money-bill-wave"></i>
                        </button>
                    </div>
                </div>
                <div class="grupo-equipos-grid">
                    ${equiposHtml}
                </div>
                <div class="grupo-total">Total: $${grupo.total.toFixed(2)}</div>
            </div>
        `;
    }).join('');
}

/* ---------- ACTUALIZAR ESTADO VACÍO ---------- */
function actualizarEstadoVacio() {
    const emptyFacturas = document.getElementById('empty-facturas');
    const emptyGrupos = document.getElementById('empty-grupos');
    const facturasContainer = document.getElementById('facturas-container');
    const gruposContainer = document.getElementById('grupos-container');

    if (emptyFacturas && facturasContainer) {
        emptyFacturas.style.display = facturasContainer.children.length === 0 ? 'block' : 'none';
    }

    if (emptyGrupos && gruposContainer) {
        emptyGrupos.style.display = gruposContainer.children.length === 0 ? 'block' : 'none';
    }
}

/* ---------- LÓGICA DE ABONO A GRUPO ---------- */
window.abrirModalAbonoGrupo = (grupoId) => {
    const grupo = grupos.get(grupoId);
    if (!grupo) return;

    // Crear modal dinámicamente si no existe
    let modal = document.getElementById('modalAbonoGrupo');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalAbonoGrupo';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-box">
                <h3>Abonar a Grupo</h3>
                <div id="infoGrupoAbono" class="modal-text"></div>
                <div class="form-group">
                    <label>Monto a Abonar</label>
                    <input type="number" id="montoAbonoGrupo" class="abono-input" placeholder="0.00" min="0.01" step="0.01">
                </div>
                <div class="modal-buttons">
                    <button class="btn btn-success" id="btnConfirmarAbonoGrupo">Confirmar</button>
                    <button class="btn btn-primary" onclick="document.getElementById('modalAbonoGrupo').style.display='none'">Cancelar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById('btnConfirmarAbonoGrupo').onclick = () => procesarAbonoGrupo();
    }

    const infoDiv = document.getElementById('infoGrupoAbono');
    infoDiv.innerHTML = `
        <p><strong>Grupo:</strong> ${grupo.nombre}</p>
        <p><strong>Deuda Total:</strong> <span style="color:#e74c3c;font-weight:bold">$${grupo.total.toFixed(2)}</span></p>
        <p style="font-size:0.9rem;color:#7f8c8d;margin-top:10px">El abono se distribuirá automáticamente a las facturas más antiguas.</p>
    `;
    
    document.getElementById('montoAbonoGrupo').value = '';
    document.getElementById('montoAbonoGrupo').dataset.grupoId = grupoId;
    modal.style.display = 'flex';
    document.getElementById('montoAbonoGrupo').focus();
};

async function procesarAbonoGrupo() {
    const input = document.getElementById('montoAbonoGrupo');
    const grupoId = input.dataset.grupoId;
    const monto = parseFloat(input.value);
    const grupo = grupos.get(grupoId);

    if (!monto || monto <= 0) {
        alert("Ingrese un monto válido");
        return;
    }

    if (monto > grupo.total + 0.01) { // Margen de error pequeño
        alert("El monto no puede ser mayor a la deuda total");
        return;
    }

    try {
        // 1. Obtener facturas del grupo
        const facturasGrupo = facturasPendientes.filter(f => 
            grupo.equipos.includes(f.equipo)
        );

        // 2. Ordenar por fecha (ya están ordenadas en facturasPendientes, pero aseguramos)
        facturasGrupo.sort((a, b) => (a.fecha?.seconds || 0) - (b.fecha?.seconds || 0));

        const batch = writeBatch(db);
        let montoRestante = monto;
        let facturasAfectadas = 0;

        // 3. Distribuir abono
        for (const factura of facturasGrupo) {
            if (montoRestante <= 0.009) break;

            const deudaFactura = factura.saldoPendiente;
            const abonoParaEsta = Math.min(montoRestante, deudaFactura);

            if (abonoParaEsta > 0) {
                const facturaRef = doc(db, "ventas", factura.id);
                const nuevoSaldo = deudaFactura - abonoParaEsta;

                // Actualizar factura
                batch.update(facturaRef, {
                    saldoPendiente: nuevoSaldo,
                    abonos: arrayUnion({
                        monto: abonoParaEsta,
                        fecha: new Date(),
                        tipo: 'abono_grupal',
                        grupoId: grupoId
                    }),
                    ultimaActualizacion: serverTimestamp()
                });

                // Registrar ingreso
                const ingresoRef = doc(collection(db, "ingresos"));
                batch.set(ingresoRef, {
                    monto: abonoParaEsta,
                    concepto: `Abono Grupal - Factura Equipo ${factura.equipo}`,
                    fecha: serverTimestamp(),
                    categoria: 'abono',
                    facturaId: factura.id,
                    grupoId: grupoId
                });

                montoRestante -= abonoParaEsta;
                facturasAfectadas++;
            }
        }

        await batch.commit();
        alert(`Abono aplicado correctamente a ${facturasAfectadas} facturas.`);
        document.getElementById('modalAbonoGrupo').style.display = 'none';

    } catch (error) {
        console.error("Error procesando abono grupal:", error);
        alert("Error al procesar el abono: " + error.message);
    }
}

/* ---------- DETALLE DE EQUIPO (REUTILIZADO DE VENTAS.JS PERO ADAPTADO) ---------- */
window.mostrarDetalleEquipo = (equipo) => {
    // Implementar lógica para mostrar facturas específicas de un equipo
    // y permitir abono individual si se desea
    alert(`Detalle del equipo ${equipo} - Pendiente de implementar modal individual`);
};
