// js/core/InventoryLogic.js

/**
 * Lógica pura del inventario (matemáticas y agrupaciones).
 * Este módulo no tiene estado interno y depende de los datos que se le pasen,
 * permitiendo una fácil reutilización y testing.
 */
window.InventoryLogic = {
    /**
     * Agrupa registros por su nombre oficial (y productId si está disponible).
     */
    getGroupingKey: function(productoOrReg, vinculoId = null) {
        if (!productoOrReg) return '';
        
        let pId = vinculoId;
        let pName = '';
        
        if (typeof productoOrReg === 'object') {
            pId = productoOrReg.productId || productoOrReg.vinculoId;
            pName = productoOrReg.producto || '';
        } else {
            pName = productoOrReg;
        }

        if (pId) {
            return String(pId).trim().toUpperCase();
        }
        
        let p = (pName || '').toString().trim().toUpperCase();
        // Normalización básica
        p = p.replace(/\s+/g, ' ')
             .replace(/Á/g, 'A').replace(/É/g, 'E').replace(/Í/g, 'I')
             .replace(/Ó/g, 'O').replace(/Ú/g, 'U');
        return p;
    },

    /**
     * Extrae el nombre oficial del producto intentando buscarlo en el caché si existe.
     */
    getOfficialProductName: function(reg, cacheMap = null) {
        if (!reg) return '';
        let originalName = (reg.producto || '').trim();
        
        if (cacheMap) {
            if (reg.productId && cacheMap.byId && cacheMap.byId[reg.productId]) {
                return cacheMap.byId[reg.productId].descripcion;
            }
            const keyDesc = originalName.toLowerCase().trim();
            if (cacheMap.byName && cacheMap.byName[keyDesc]) {
                return cacheMap.byName[keyDesc].descripcion;
            }
        }
        return originalName;
    },

    /**
     * Parsea una fecha en varios formatos posibles a milisegundos para ordenamiento.
     */
    parseDateToMillis: function(dateObj) {
        if (!dateObj) return 0;
        if (dateObj instanceof Date) return dateObj.getTime();
        if (typeof dateObj.toMillis === 'function') return dateObj.toMillis();
        if (typeof dateObj === 'number') return dateObj;
        if (typeof dateObj === 'string') {
            // Manejar DD/MM/YYYY
            if (dateObj.includes('/')) {
                const parts = dateObj.split('/');
                if (parts.length === 3) {
                    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00Z`).getTime();
                }
            }
            // Manejar YYYY-MM-DD
            const t = new Date(dateObj).getTime();
            if (!isNaN(t)) return t;
        }
        return 0;
    },

    /**
     * Normaliza un string de fecha para consistencia en la UI (DD/MM/YYYY).
     */
    normalizeDateStr: function(dateStr) {
        if (!dateStr) return '';
        const millis = this.parseDateToMillis(dateStr);
        if (millis === 0) return dateStr;
        
        const d = new Date(millis);
        const day = String(d.getUTCDate()).padStart(2, '0');
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const year = d.getUTCFullYear();
        
        return `${year}-${month}-${day}`;
    },

    /**
     * Ordena registros de inventario de manera robusta usando la fecha y filaExcel.
     */
    sortRegistrosAsc: function(registros) {
        return [...registros].sort((a, b) => {
            const millisA = this.parseDateToMillis(a.fecha);
            const millisB = this.parseDateToMillis(b.fecha);
            if (millisA !== millisB) return millisA - millisB;
            
            const hasFilaA = a.filaExcel !== undefined && a.filaExcel !== null;
            const hasFilaB = b.filaExcel !== undefined && b.filaExcel !== null;
            
            if (hasFilaA && hasFilaB) return a.filaExcel - b.filaExcel;
            if (hasFilaA) return -1;
            if (hasFilaB) return 1;
            return 0;
        });
    },

    /**
     * Motor principal de cálculo FIFO:
     * Calcula cuánto se ha facturado de cada registro específico en el inventario.
     */
    calculateComputedBilledMap: function(registros, historicalInvoices, clonesMap = {}) {
        // 1. Agrupar total facturado histórico
        const facturadoHistorico = {};
        if (Array.isArray(historicalInvoices)) {
            historicalInvoices.forEach(inv => {
                const items = inv.items || [];
                items.forEach(item => {
                    if (item.isManoDeObra || item.productId === 'SERVICIO') return;
                    const key = this.getGroupingKey(item.descripcionPapel || item.producto, item.productId);
                    facturadoHistorico[key] = (facturadoHistorico[key] || 0) + (item.cantidad || 0);
                });
            });
        }

        const descAcumuladores = { ...facturadoHistorico };

        // 2. Prevenir Doble Consumo (Clones)
        for (const regId in clonesMap) {
            const clones = clonesMap[regId] || [];
            clones.forEach(c => {
                if (c.estado === 'facturado' && c.facturaId) {
                    const inv = historicalInvoices.find(f => f.id === c.facturaId);
                    if (inv) {
                        const originalReg = registros.find(r => r.id === regId);
                        if (originalReg) {
                            const key = this.getGroupingKey(originalReg);
                            if (descAcumuladores[key] && descAcumuladores[key] > 0) {
                                const descontar = Math.min(descAcumuladores[key], c.cantidad);
                                descAcumuladores[key] -= descontar;
                            }
                        }
                    }
                }
            });
        }

        // 3. FIFO Global
        const computedBilledMap = {};
        const registrosParaFIFO = this.sortRegistrosAsc(registros);

        registrosParaFIFO.forEach(reg => {
            const key = this.getGroupingKey(reg);
            let billedHere = 0;
            let remainingQty = reg.cantidad;

            if (descAcumuladores[key] && descAcumuladores[key] > 0) {
                const descontar = Math.min(descAcumuladores[key], remainingQty);
                descAcumuladores[key] -= descontar;
                remainingQty -= descontar;
                billedHere += descontar;
            }
            
            computedBilledMap[reg.id] = billedHere;
        });

        return computedBilledMap;
    }
};
