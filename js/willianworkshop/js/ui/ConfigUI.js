export class ConfigUI {
    constructor() {
        this.els = {
            inputs: {
                'nombre-negocio': document.getElementById('nombre-negocio'),
                'telefono': document.getElementById('telefono'),
                'direccion': document.getElementById('direccion'),
                'correo': document.getElementById('correo'),
                'modoEdicionInventario': document.getElementById('modo-edicion-inventario')
            },
            saveBtn: document.getElementById('guardar-btn'),
            restoreBtn: document.getElementById('restaurar-btn')
        };
    }

    fillValues(config) {
        for (const [key, el] of Object.entries(this.els.inputs)) {
            if (el) {
                if (el.type === 'checkbox') {
                    el.checked = !!config[key];
                } else {
                    el.value = config[key] || '';
                }
            }
        }
    }

    getValues() {
        const values = {};
        for (const [key, el] of Object.entries(this.els.inputs)) {
            if (el) {
                if (el.type === 'checkbox') {
                    values[key] = el.checked;
                } else {
                    values[key] = el.value;
                }
            }
        }
        return values;
    }
}
