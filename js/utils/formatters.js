/**
 * Formatea un número como moneda USD
 * @param {number} amount 
 * @returns {string}
 */
export const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    }).format(amount);
};

/**
 * Parsea un string de moneda a float
 * @param {string} str 
 * @returns {number}
 */
export const parseCurrency = (str) => {
    if (!str) return 0;
    return parseFloat(str.replace(/[^0-9.-]+/g, ""));
};
