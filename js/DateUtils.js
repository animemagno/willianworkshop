const DateUtils = {
    getCurrentDateElSalvador() {
        try {
            // Obtener componentes de fecha seguros para El Salvador
            // CORRECCIÓN CRÍTICA: hour12: false para usar formato 24h
            // Sin esto, 3 PM se guardaba como 3 AM (p.hour="3" ignorando dayPeriod="PM")
            const options = {
                timeZone: 'America/El_Salvador',
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric',
                hour12: false
            };
            const formatter = new Intl.DateTimeFormat('en-US', options);
            const parts = formatter.formatToParts(new Date());

            const p = {};
            parts.forEach(part => p[part.type] = part.value);

            // Hora en formato 24h: p.hour será "15" para las 3 PM (correcto)
            const hour24 = parseInt(p.hour);
            // Manejar hora 24 (medianoche) como 0
            const finalHour = hour24 === 24 ? 0 : hour24;

            return new Date(p.year, p.month - 1, p.day, finalHour, p.minute, p.second);
        } catch (e) {
            console.warn("Error timezone SV, usando local:", e);
            return new Date();
        }
    },

    getCurrentDateStringElSalvador() {
        const date = this.getCurrentDateElSalvador();
        return this.formatDateToYYYYMMDD(date);
    },

    formatDateToYYYYMMDD(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    createDateFromStringElSalvador(dateString) {
        if (!dateString) return this.getCurrentDateElSalvador();
        const [year, month, day] = dateString.split('-').map(Number);
        // Retornar mediodía para evitar problemas de bordes
        return new Date(year, month - 1, day, 12, 0, 0);
    },

    adjustToElSalvadorTime(date) {
        if (!date) return this.getCurrentDateElSalvador();
        try {
            const options = {
                timeZone: 'America/El_Salvador',
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric',
                hour12: false
            };
            const formatter = new Intl.DateTimeFormat('en-US', options);
            const parts = formatter.formatToParts(date);

            const p = {};
            parts.forEach(part => p[part.type] = part.value);

            const hour24 = parseInt(p.hour);
            const finalHour = hour24 === 24 ? 0 : hour24;

            return new Date(p.year, p.month - 1, p.day, finalHour, p.minute, p.second);
        } catch (e) {
            return date;
        }
    },

    isTodayInElSalvador(dateString) {
        const today = this.getCurrentDateStringElSalvador();
        return dateString === today;
    },

    isFutureDateInElSalvador(dateString) {
        const today = this.getCurrentDateStringElSalvador();
        return dateString > today;
    },

    getCurrentTimestampElSalvador() {
        // CORRECCIÓN: Usar serverTimestamp para consistencia con ventas_movil.html
        return firebase.firestore.FieldValue.serverTimestamp();
    },

    // Función centralizada para extraer milisegundos de cualquier tipo de timestamp
    getTimeMs(item) {
        if (!item) return 0;
        const ts = item.timestamp;
        // Firestore Timestamp con método toDate()
        if (ts && typeof ts.toDate === 'function') {
            return ts.toDate().getTime();
        }
        // Firestore Timestamp con campo seconds
        if (ts && ts.seconds) {
            return (ts.seconds * 1000) + ((ts.nanoseconds || 0) / 1000000);
        }
        // Date object
        if (ts instanceof Date) {
            return ts.getTime();
        }
        // String ISO o similar
        if (ts && typeof ts === 'string') {
            const parsed = new Date(ts);
            if (!isNaN(parsed.getTime())) return parsed.getTime();
        }
        // Número directo (milisegundos)
        if (ts && typeof ts === 'number') {
            return ts;
        }
        // Timestamp local temporal (usado cuando serverTimestamp aún no se resuelve)
        if (item._localTimestamp) {
            return item._localTimestamp;
        }
        // Si no hay timestamp válido, usar fechaCreacion como fallback
        if (item.fechaCreacion) {
            const fc = item.fechaCreacion;
            if (typeof fc.toDate === 'function') return fc.toDate().getTime();
            if (fc.seconds) return (fc.seconds * 1000) + ((fc.nanoseconds || 0) / 1000000);
            if (fc instanceof Date) return fc.getTime();
        }
        // Último recurso: intentar construir desde campo 'date' (YYYY-MM-DD)
        if (item.date) {
            const parts = item.date.split('-');
            if (parts.length === 3) {
                return new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59).getTime();
            }
        }
        return 0; // Sin fecha conocida, va al final
    },

    // Comparador estándar: más reciente primero (descendente)
    sortDescByTimestamp(a, b) {
        return DateUtils.getTimeMs(b) - DateUtils.getTimeMs(a);
    }
};
