
export class CapitalService {
    constructor() {
        this.STORAGE_KEY_TOTAL = 'workshop_capital_total';
        this.STORAGE_KEY_HISTORY = 'workshop_capital_history';
    }

    /**
     * Obtiene el saldo total actual de capital.
     * @returns {Promise<number>}
     */
    async getTotalCapital() {
        // Simulamos asincronía para futura compatibilidad con backend real
        const total = localStorage.getItem(this.STORAGE_KEY_TOTAL);
        return total ? parseFloat(total) : 0.00;
    }

    /**
     * Registra un nuevo aporte de capital.
     * @param {number} amount Monto a ingresar
     * @param {string} description Descripción o motivo
     * @param {string} date Fecha del aporte (YYYY-MM-DD)
     * @returns {Promise<number>} Nuevo saldo total
     */
    async addCapital(amount, description, date) {
        if (!amount || amount <= 0) throw new Error("El monto debe ser mayor a 0.");

        const currentTotal = await this.getTotalCapital();
        const newTotal = currentTotal + parseFloat(amount);

        // 1. Guardar nuevo total
        localStorage.setItem(this.STORAGE_KEY_TOTAL, newTotal.toString());

        // 2. Guardar en historial
        const entry = {
            id: Date.now().toString(),
            amount: parseFloat(amount),
            description: description || "Aporte de Capital",
            date: date || new Date().toISOString().split('T')[0],
            timestamp: new Date().toISOString()
        };

        const history = this.getHistory();
        history.unshift(entry); // Agregar al inicio
        localStorage.setItem(this.STORAGE_KEY_HISTORY, JSON.stringify(history));

        return newTotal;
    }

    /**
     * Obtiene el historial de aportes
     * @returns {Array} 
     */
    getHistory() {
        const history = localStorage.getItem(this.STORAGE_KEY_HISTORY);
        return history ? JSON.parse(history) : [];
    }
}
