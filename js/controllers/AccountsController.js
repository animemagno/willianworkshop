import { AccountsService } from "../services/AccountsService.js";
import { AccountsUI } from "../ui/AccountsUI.js";

const service = new AccountsService();
const ui = new AccountsUI();

let memosLocal = [];
let cuentasLocal = [];

async function init() {
    if (!localStorage.getItem('usuarioLogueado')) {
        window.location.href = 'login.html';
        return;
    }

    console.log("📒 Inicializando Módulo de Cuentas y Memos...");
    ui.initTabs();

    // Cargar datos
    [memosLocal, cuentasLocal] = await Promise.all([
        service.loadMemos(),
        service.loadAccounts()
    ]);

    ui.renderMemos(memosLocal);
    ui.renderAccounts(cuentasLocal);

    setupEventListeners();
    setupGlobalHandlers();
}

function setupEventListeners() {
    // Buscadores
    const searchMemo = document.getElementById('buscar-memo');
    if (searchMemo) {
        searchMemo.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = memosLocal.filter(m =>
                m.titulo.toLowerCase().includes(term) ||
                m.contenido.toLowerCase().includes(term)
            );
            ui.renderMemos(filtered);
        });
    }

    const searchCuenta = document.getElementById('buscar-cuenta');
    if (searchCuenta) {
        searchCuenta.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = cuentasLocal.filter(c =>
                c.nombre.toLowerCase().includes(term)
            );
            ui.renderAccounts(filtered);
        });
    }

    // Botones Agregar
    document.getElementById('nuevo-memo-btn')?.addEventListener('click', async () => {
        const data = ui.promptNewMemo();
        if (data) {
            try {
                await service.addMemo(data.titulo, data.contenido);
                memosLocal = await service.loadMemos();
                ui.renderMemos(memosLocal);
            } catch (e) {
                alert("Error al agregar memo: " + e.message);
            }
        }
    });

    document.getElementById('nueva-cuenta-btn')?.addEventListener('click', async () => {
        const data = ui.promptNewAccount();
        if (data) {
            try {
                await service.addAccount(data.nombre, data.descripcion, data.saldo);
                cuentasLocal = await service.loadAccounts();
                ui.renderAccounts(cuentasLocal);
            } catch (e) {
                alert("Error al agregar cuenta: " + e.message);
            }
        }
    });

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
    window.eliminarMemo = async (id) => {
        if (confirm("¿Eliminar este memo?")) {
            try {
                await service.deleteMemo(id);
                memosLocal = memosLocal.filter(m => m.id !== id);
                ui.renderMemos(memosLocal);
            } catch (e) {
                alert("Error eliminando: " + e.message);
            }
        }
    };

    window.eliminarCuenta = async (id) => {
        if (confirm("¿Eliminar esta cuenta?")) {
            try {
                await service.deleteAccount(id);
                cuentasLocal = cuentasLocal.filter(c => c.id !== id);
                ui.renderAccounts(cuentasLocal);
            } catch (e) {
                alert("Error eliminando: " + e.message);
            }
        }
    };
}

document.addEventListener('DOMContentLoaded', init);
