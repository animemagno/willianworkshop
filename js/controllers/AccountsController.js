import { AccountsService } from "../services/AccountsService.js";
import { CapitalService } from "../services/CapitalService.js";
import { AccountsUI } from "../ui/AccountsUI.js";

const service = new AccountsService();
const capitalService = new CapitalService();
const ui = new AccountsUI();

let memosLocal = [];
let cuentasLocal = [];

// Utilidad local para formato de moneda
const formatMoney = (amount) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    }).format(amount);
};

async function init() {
    if (!localStorage.getItem('usuarioLogueado')) {
        window.location.href = 'login.html';
        return;
    }

    console.log("📒 Inicializando Módulo de Cuentas y Memos...");
    ui.initTabs();

    // Cargar datos
    try {
        const [memos, cuentas, capital] = await Promise.all([
            service.loadMemos(),
            service.loadAccounts(),
            capitalService.getTotalCapital()
        ]);

        memosLocal = memos;
        cuentasLocal = cuentas;

        ui.renderMemos(memosLocal);
        ui.renderAccounts(cuentasLocal);

        // Renderizar Capital Inicial
        updateCapitalDisplay(capital);

    } catch (error) {
        console.error("Error cargando datos:", error);
    }

    setupEventListeners();
    setupGlobalHandlers();

    // Inicializar fecha del modal con hoy
    const fechaInput = document.getElementById('capital-fecha');
    if (fechaInput) {
        fechaInput.value = new Date().toISOString().split('T')[0];
    }
}

function updateCapitalDisplay(amount) {
    const displayElement = document.getElementById('capital-total');
    if (displayElement) {
        // Quitamos el símbolo $ porque ya está en el HTML
        displayElement.textContent = formatMoney(amount).replace('$', '');
    }
}

function setupEventListeners() {
    // === LÓGICA DE CAPITAL (CUENTA JEFE) ===
    const modalCapital = document.getElementById('capitalModal');
    const btnAddCapital = document.getElementById('btn-add-capital');
    const btnCloseCapital = document.getElementById('closeCapitalModal');
    const btnCancelCapital = document.getElementById('cancelCapitalBtn');
    const btnSaveCapital = document.getElementById('saveCapitalBtn');

    if (btnAddCapital) {
        btnAddCapital.addEventListener('click', () => {
            modalCapital.classList.add('active');
            document.getElementById('capital-monto').focus();
        });
    }

    const closeModal = () => {
        modalCapital.classList.remove('active');
        // Limpiar inputs
        document.getElementById('capital-monto').value = '';
        document.getElementById('capital-desc').value = '';
    };

    if (btnCloseCapital) btnCloseCapital.addEventListener('click', closeModal);
    if (btnCancelCapital) btnCancelCapital.addEventListener('click', closeModal);

    if (btnSaveCapital) {
        btnSaveCapital.addEventListener('click', async () => {
            const montoInput = document.getElementById('capital-monto');
            const descInput = document.getElementById('capital-desc');
            const fechaInput = document.getElementById('capital-fecha');

            const monto = parseFloat(montoInput.value);
            const desc = descInput.value;
            const fecha = fechaInput.value;

            if (!monto || monto <= 0) {
                alert("Por favor ingrese un monto válido.");
                return;
            }

            try {
                const newTotal = await capitalService.addCapital(monto, desc, fecha);
                updateCapitalDisplay(newTotal);
                closeModal();
                // Opcional: Mostrar confirmación (toast)
                // alert("Aporte registrado exitosamente"); 
            } catch (e) {
                alert("Error al registrar: " + e.message);
            }
        });
    }

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
