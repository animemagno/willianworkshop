// Namespace Global para Utilidades
window.Utils = window.Utils || {};

/**
 * Formatea un número como moneda USD
 */
window.Utils.formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    }).format(amount);
};

/**
 * Parsea un string de moneda a float
 */
window.Utils.parseCurrency = (str) => {
    if (!str) return 0;
    return parseFloat(str.replace(/[^0-9.-]+/g, ""));
};
