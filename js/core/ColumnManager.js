/* =========================================
   COLUMN MANAGER - PERSONALIZACIÓN DE COLUMNAS
   ========================================= */
window.ColumnManager = {
    config: {
        descFactura: false,
        costo: true,
        costoSinIva: true,
        precio: true,
        totalCosto: true,
        stockInicial: true,
        proveedores: true,
        ventas: true,
        pendientes: true,
        stockReal: true,
        acciones: true
    },

    init() {
        const saved = localStorage.getItem('inventario_column_config');
        if (saved) {
            try {
                this.config = { ...this.config, ...JSON.parse(saved) };
            } catch (e) {
                console.error("Error al cargar configuración de columnas:", e);
            }
        }

        this.syncCheckboxes();

        document.querySelectorAll('#modalColumnas input[data-col-target]').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const colKey = e.target.dataset.colTarget;
                this.config[colKey] = e.target.checked;
                this.saveAndApply();
            });
        });

        this.apply();
    },

    syncCheckboxes() {
        document.querySelectorAll('#modalColumnas input[data-col-target]').forEach(chk => {
            const colKey = chk.dataset.colTarget;
            if (this.config[colKey] !== undefined) {
                chk.checked = !!this.config[colKey];
            }
        });
    },

    saveAndApply() {
        localStorage.setItem('inventario_column_config', JSON.stringify(this.config));
        this.apply();
    },

    resetDefaults() {
        Object.keys(this.config).forEach(k => this.config[k] = true);
        this.config.descFactura = false;
        this.syncCheckboxes();
        this.saveAndApply();
    },

    apply() {
        let styleEl = document.getElementById('column-manager-styles');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'column-manager-styles';
            document.head.appendChild(styleEl);
        }

        let css = '';
        Object.keys(this.config).forEach(colKey => {
            const isVisible = this.config[colKey];
            if (!isVisible) {
                css += `[data-col="${colKey}"] { display: none !important; }\n`;
            }
        });

        styleEl.textContent = css;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.ColumnManager.init();
});
