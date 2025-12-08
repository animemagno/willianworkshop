import { ConfigService } from "../services/ConfigService.js";
import { ConfigUI } from "../ui/ConfigUI.js";

const service = new ConfigService();
const ui = new ConfigUI();

function init() {
    if (!localStorage.getItem('usuarioLogueado')) {
        window.location.href = 'login.html';
        return;
    }

    console.log("⚙️ Inicializando Módulo de Configuración...");

    // Cargar config inicial
    const currentConfig = service.loadConfig();
    ui.fillValues(currentConfig);

    setupEventListeners();
}

function setupEventListeners() {
    const saveBtn = document.getElementById('guardar-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const newValues = ui.getValues();
            service.saveConfig(newValues);
            alert('✅ Configuración guardada correctamente');
        });
    }

    const restoreBtn = document.getElementById('restaurar-btn');
    if (restoreBtn) {
        restoreBtn.addEventListener('click', () => {
            if (confirm("¿Estás seguro de restaurar los valores por defecto?")) {
                const defaults = service.restoreDefaults();
                ui.fillValues(defaults);
                alert('Valores restaurados.');
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

document.addEventListener('DOMContentLoaded', init);
