import { ServicesService } from "../services/ServicesService.js";
import { ServicesUI } from "../ui/ServicesUI.js";

const service = new ServicesService();
const ui = new ServicesUI();

let serviciosLocal = []; // Para filtrado

async function init() {
    if (!localStorage.getItem('usuarioLogueado')) {
        window.location.href = 'login.html';
        return;
    }

    console.log("🛠 Inicializando Módulo de Servicios...");
    serviciosLocal = await service.loadAll();

    // Si no hay servicios en DB, usar datos mock iniciales para que no se vea vacío el demo
    if (serviciosLocal.length === 0) {
        // Mock data temporal solo visual si no hay nada en DB
        // Pero idealmente deberíamos dejarlo vacío.
        // Simularemos vacío.
    }

    ui.render(serviciosLocal);
    setupEventListeners();
    setupGlobalHandlers();
}

function setupEventListeners() {
    // Buscador
    const searchInput = document.getElementById('buscar-servicio');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = serviciosLocal.filter(s =>
                s.descripcion.toLowerCase().includes(term)
            );
            ui.render(filtered);
        });
    }

    // Agregar
    const addBtn = document.getElementById('agregar-servicio-btn');
    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            const data = ui.promptNewService();
            if (data) {
                try {
                    await service.addService(data);
                    serviciosLocal.unshift(data); // Optimistic update approximation (reloaded by loadAll normally)
                    // Recargar todo correcto
                    serviciosLocal = await service.loadAll();
                    ui.render(serviciosLocal);
                } catch (e) {
                    alert("Error al agregar: " + e.message);
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
    window.eliminarServicio = async (id) => {
        if (confirm("¿Eliminar este servicio?")) {
            try {
                await service.deleteService(id);
                serviciosLocal = serviciosLocal.filter(s => s.id !== id);
                ui.render(serviciosLocal);
            } catch (e) {
                alert("Error eliminando: " + e.message);
            }
        }
    };
}

document.addEventListener('DOMContentLoaded', init);
