import { InvoiceService } from "../services/InvoiceService.js";
import { InvoiceUI } from "../ui/InvoiceUI.js";

const service = new InvoiceService();
const ui = new InvoiceUI();

function init() {
    if (!localStorage.getItem('usuarioLogueado')) {
        window.location.href = 'login.html';
        return;
    }

    console.log("💰 Inicializando Módulo de Facturas...");
    setupGlobalHandlers();

    service.initListeners((data) => {
        ui.render(data);
    });
}

function setupGlobalHandlers() {
    // Definir funciones globales para onclick en HTML

    // 1. Ver Detalle Equipo (Suelto)
    window.verDetalleEquipo = (numero) => {
        alert(`Detalle del equipo ${numero} - Pendiente implementar modal individual`);
    };

    // 2. Abonar Grupo
    window.abonarGrupo = (grupoId) => {
        const grupo = service.grupos.get(grupoId);
        if (!grupo) return;

        const { confirmBtn, input } = ui.showPaymentModal(grupo);

        // Sobreescribir onclick para evitar listeners duplicados
        confirmBtn.onclick = async () => {
            const monto = parseFloat(input.value);
            if (!monto || monto <= 0) {
                alert("Ingrese un monto válido");
                return;
            }

            try {
                const count = await service.processGroupPayment(grupoId, monto);
                alert(`✅ Abono aplicado a ${count} facturas.`);
                document.getElementById('modalAbonoGrupo').style.display = 'none';
            } catch (e) {
                alert("Error: " + e.message);
            }
        };
    };

    // Mobile menu toggle (si no está ya manejado por script inline, lo movemos aquí para limpieza)
    const mobileBtn = document.getElementById('mobileMenuBtn');
    if (mobileBtn) {
        mobileBtn.onclick = () => document.getElementById('mobileMenu').classList.toggle('active');
    }
}

document.addEventListener('DOMContentLoaded', init);
