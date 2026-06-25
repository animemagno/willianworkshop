// js/salidas/SalidasController.js

/**
 * SalidasController
 * Maneja la lógica de UI y navegación de la página de salidas.html
 */
window.SalidasController = {
    avanzarDiaFactura() {
        const app = window.RegistrosApp;
        if (!app) return;
        
        const fechaInput = document.getElementById('factura-fecha');
        if (!fechaInput || !fechaInput.value) return;

        const dateObj = new Date(fechaInput.value + 'T00:00:00Z');
        dateObj.setUTCDate(dateObj.getUTCDate() + 1);

        const y = dateObj.getUTCFullYear();
        const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getUTCDate()).padStart(2, '0');
        fechaInput.value = `${y}-${m}-${d}`;
    },

    nextStep() {
        const app = window.RegistrosApp;
        if (!app) return;

        if (app.currentStep === 1) {
            if (app.facturaItems.length === 0) {
                alert("Debes agregar al menos un repuesto a la factura.");
                return;
            }
            this.goToStep(2);
        } else if (app.currentStep === 2) {
            this.goToBillingStep();
        } else if (app.currentStep === 3) {
            app.finalizeInvoice();
        }
    },

    goToStep(step) {
        const app = window.RegistrosApp;
        if (!app) return;

        app.currentStep = step;

        const cardListado = document.getElementById('card-listado');
        const cardResumen = document.getElementById('card-resumen');
        const cardServicios = document.getElementById('card-servicios-mano-obra');
        const cardPrecios = document.getElementById('card-facturacion-precios');
        const facturaDropzone = document.getElementById('factura-dropzone');

        const btnSiguiente = document.getElementById('btn-siguiente-factura');
        const btnSiguienteText = document.getElementById('btn-siguiente-factura-text');

        // Ocultar todos
        if (cardListado) cardListado.style.display = 'none';
        if (cardResumen) cardResumen.style.display = 'none';
        if (cardServicios) cardServicios.style.display = 'none';
        if (cardPrecios) cardPrecios.style.display = 'none';

        if (step === 1) {
            if (cardListado) cardListado.style.display = 'flex';
            if (cardResumen) cardResumen.style.display = 'flex';
            if (btnSiguienteText) btnSiguienteText.innerText = "Siguiente Paso (Servicios) ->";
            if (facturaDropzone) facturaDropzone.style.display = 'flex';
        } else if (step === 2) {
            if (cardServicios) cardServicios.style.display = 'flex';
            if (btnSiguienteText) btnSiguienteText.innerText = "Revisar Facturación ->";
            if (facturaDropzone) facturaDropzone.style.display = 'flex';
        } else if (step === 3) {
            if (cardPrecios) cardPrecios.style.display = 'block';
            if (btnSiguienteText) btnSiguienteText.innerText = "Confirmar y Generar Factura";
            if (facturaDropzone) facturaDropzone.style.display = 'none';
            // Al entrar al paso 3, recalcular e inicializar precios
            app.renderFactura();
        }
    },

    goToBillingStep() {
        const app = window.RegistrosApp;
        if (!app) return;

        if (app.facturaItems.length === 0) {
            alert("Debes agregar al menos un repuesto, servicio o mano de obra.");
            return;
        }

        this.goToStep(3);
        app.selectInvoiceType(app.facturaTipo || 'normal');
    },

    backToServicesStep() {
        this.goToStep(2);
    },

    backToRepuestosStep() {
        this.goToStep(1);
    },

    switchListadoTab(tabId) {
        const btnGeneral = document.getElementById('tab-listado-general');
        const btnCuentas = document.getElementById('tab-listado-cuentas');
        const contentGeneral = document.getElementById('content-listado-general');
        const contentCuentas = document.getElementById('content-listado-cuentas');

        if (tabId === 'general') {
            if (btnGeneral) {
                btnGeneral.style.background = '#3498db';
                btnGeneral.style.color = 'white';
                btnGeneral.style.border = 'none';
            }
            if (btnCuentas) {
                btnCuentas.style.background = '#e2e8f0';
                btnCuentas.style.color = '#4a5568';
                btnCuentas.style.border = '1px solid #cbd5e0';
            }
            if (contentGeneral) contentGeneral.style.display = 'flex';
            if (contentCuentas) contentCuentas.style.display = 'none';
        } else {
            if (btnCuentas) {
                btnCuentas.style.background = '#3498db';
                btnCuentas.style.color = 'white';
                btnCuentas.style.border = 'none';
            }
            if (btnGeneral) {
                btnGeneral.style.background = '#e2e8f0';
                btnGeneral.style.color = '#4a5568';
                btnGeneral.style.border = '1px solid #cbd5e0';
            }
            if (contentGeneral) contentGeneral.style.display = 'none';
            if (contentCuentas) contentCuentas.style.display = 'block';
        }
    },

    switchHistorialTab(tabId) {
        const app = window.RegistrosApp;
        if (!app) return;
        
        app.currentHistorialTab = tabId;
        const listBtn = document.getElementById('tab-historial-list');
        const importBtn = document.getElementById('tab-historial-import');
        const auditBtn = document.getElementById('tab-historial-audit');
        const listContent = document.getElementById('historial-tab-list-content');
        const importContent = document.getElementById('historial-tab-import-content');
        const auditContent = document.getElementById('historial-tab-audit-content');

        // Resetear estilos y ocultar contenidos
        [listBtn, importBtn, auditBtn].forEach(btn => {
            if (btn) {
                btn.style.borderBottomColor = 'transparent';
                btn.style.color = '#718096';
            }
        });
        [listContent, importContent, auditContent].forEach(content => {
            if (content) content.style.display = 'none';
        });

        if (tabId === 'list') {
            if (listBtn) {
                listBtn.style.borderBottomColor = '#3498db';
                listBtn.style.color = '#3498db';
            }
            if (listContent) listContent.style.display = 'block';
            if (app.loadInvoicesHistory) app.loadInvoicesHistory();
        } else if (tabId === 'import') {
            if (importBtn) {
                importBtn.style.borderBottomColor = '#3498db';
                importBtn.style.color = '#3498db';
            }
            if (importContent) importContent.style.display = 'block';
        } else if (tabId === 'audit') {
            if (auditBtn) {
                auditBtn.style.borderBottomColor = '#3498db';
                auditBtn.style.color = '#3498db';
            }
            if (auditContent) auditContent.style.display = 'block';
            const auditMonthInput = document.getElementById('audit-month-input');
            if (auditMonthInput && !auditMonthInput.value) {
                const now = new Date();
                const y = now.getFullYear();
                const m = String(now.getMonth() + 1).padStart(2, '0');
                auditMonthInput.value = `${y}-${m}`;
            }
        }
    }
};
