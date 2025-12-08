/**
 * Servicio para gestionar la configuración de la aplicación.
 * Actualmente usa LocalStorage, pero está preparado para migrar a Firebase si se requiere.
 */
export class ConfigService {
    constructor() {
        this.defaults = {
            'nombre-negocio': 'Taller Wilian',
            'telefono': '',
            'direccion': '',
            'correo': '',
            'modoEdicionInventario': false // Key especial usada por inventario
        };
    }

    /**
     * Carga configuración (Local)
     * @returns {Object} Key-Value config
     */
    loadConfig() {
        const config = {};
        for (const key in this.defaults) {
            const val = localStorage.getItem(key);
            if (val === null) {
                config[key] = this.defaults[key];
            } else {
                // Parse booleanos
                if (val === 'true') config[key] = true;
                else if (val === 'false') config[key] = false;
                else config[key] = val;
            }
        }
        return config;
    }

    saveConfig(newConfig) {
        for (const [key, value] of Object.entries(newConfig)) {
            localStorage.setItem(key, value);
        }
    }

    restoreDefaults() {
        this.saveConfig(this.defaults);
        return this.defaults;
    }
}
