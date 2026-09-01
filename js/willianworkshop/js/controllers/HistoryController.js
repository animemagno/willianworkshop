import { HistoryService } from "../services/HistoryService.js";
import { HistoryUI } from "../ui/HistoryUI.js";

const service = new HistoryService();
const ui = new HistoryUI();
let itemToDeleteId = null;
// We need to store current filtered list for printing, 
// but service stores all, so we re-filter or store filtered state here.
// Let's store filtered locally.
let currentFilteredVentas = [];

async function init() {
    if (!localStorage.getItem('usuarioLogueado')) {
        window.location.href = 'login.html';
        return;
    }

    console.log("📜 Inicializando Módulo de Historial...");
    await service.loadAll();
    currentFilteredVentas = service.ventas; // Initial state
    applyRender(); // Render initial

    setupEventListeners();
    setupGlobalHandlers();
}

function applyRender() {
    const grupos = service.groupByDay(currentFilteredVentas);
    ui.renderList(grupos);
}

function handleFilters() {
    const filters = {
        equipo: document.getElementById('filter-equipo').value,
        producto: document.getElementById('filter-producto').value,
        tipo: document.getElementById('filter-tipo').value,
        fecha: document.getElementById('filter-fecha').value,
    };

    currentFilteredVentas = service.filter(filters);
    applyRender();
}

function setupEventListeners() {
    // Filtros
    ['filter-equipo', 'filter-producto', 'filter-tipo', 'filter-fecha'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(id === 'filter-tipo' || id === 'filter-fecha' ? 'change' : 'input', handleFilters);
    });

    // Imprimir
    document.getElementById('print-historial-btn')?.addEventListener('click', () => {
        ui.printHistory(currentFilteredVentas);
    });

    // Modal Eliminar
    document.getElementById('modalConfirmarEliminar')?.addEventListener('click', async () => {
        if (itemToDeleteId) {
            try {
                await service.deleteSale(itemToDeleteId);
                // Refresh list
                currentFilteredVentas = currentFilteredVentas.filter(v => v.id !== itemToDeleteId);
                ui.hideDeleteModal();
                alert("Venta eliminada");
                applyRender();
            } catch (e) {
                alert("Error eliminando venta: " + e.message);
            }
        }
    });

    document.getElementById('modalCancelarEliminar')?.addEventListener('click', () => {
        ui.hideDeleteModal();
        itemToDeleteId = null;
    });

    // Mobile Menu
    const mobileBtn = document.getElementById('mobileMenuBtn');
    if (mobileBtn) {
        mobileBtn.addEventListener('click', () => document.getElementById('mobileMenu').classList.toggle('active'));
    }

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('usuarioLogueado');
            window.location.href = 'login.html';
        });
    }
}

function setupGlobalHandlers() {
    window.toggleDetail = (id) => ui.toggleDetail(id);

    window.editarVenta = (id) => {
        // Redirigir a venta.html en modo edición (requerirá lógica en venta.html para leer id url params)
        // Actualmente el sistema de ventas no soportaba edición por URL param oficialmente en el refactor anterior,
        // pero se mantiene la redirección por compatibilidad futura o si ya estaba implementado.
        window.location.href = `venta.html?id=${id}`;
    };

    window.abrirEliminar = (id) => {
        itemToDeleteId = id;
        ui.showDeleteModal();
    };
}

document.addEventListener('DOMContentLoaded', init);
