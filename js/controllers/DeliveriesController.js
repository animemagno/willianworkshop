import { DeliveriesService } from "../services/DeliveriesService.js";
import { DeliveriesUI } from "../ui/DeliveriesUI.js";

const service = new DeliveriesService();
const ui = new DeliveriesUI();

let entregasLocal = [];

async function init() {
    if (!localStorage.getItem('usuarioLogueado')) {
        window.location.href = 'login.html';
        return;
    }

    console.log("🚚 Inicializando Módulo de Entregas...");
    entregasLocal = await service.loadAll();
    ui.render(entregasLocal);

    setupEventListeners();
    setupGlobalHandlers();
}

function setupEventListeners() {
    // Buscador
    const searchInput = document.getElementById('buscar-entrega');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = entregasLocal.filter(item =>
                (item.cliente && item.cliente.toLowerCase().includes(term)) ||
                (item.equipo && item.equipo.toLowerCase().includes(term)) ||
                (item.id && item.id.toLowerCase().includes(term))
            );
            ui.render(filtered);
        });
    }

    // Nueva Entrega
    const addBtn = document.getElementById('nueva-entrega-btn');
    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            const data = ui.promptNewDelivery();
            if (data) {
                try {
                    await service.addDelivery(data);
                    entregasLocal = await service.loadAll();
                    ui.render(entregasLocal);
                } catch (e) {
                    alert("Error al crear entrega: " + e.message);
                }
            }
        });
    }

    // Menú móvil
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
    window.cambiarEstado = async (id, nuevoEstado) => {
        try {
            await service.updateStatus(id, nuevoEstado);
            entregasLocal = entregasLocal.map(e => e.id === id ? { ...e, estado: nuevoEstado } : e);
            ui.render(entregasLocal);
        } catch (e) {
            alert("Error actualizando estado: " + e.message);
        }
    };

    window.eliminarEntrega = async (id) => {
        if (confirm("¿Estás seguro de eliminar esta entrega permanentemente?")) {
            try {
                await service.deleteDelivery(id);
                entregasLocal = entregasLocal.filter(e => e.id !== id);
                ui.render(entregasLocal);
            } catch (e) {
                alert("Error eliminando entrega: " + e.message);
            }
        }
    };
}

document.addEventListener('DOMContentLoaded', init);
