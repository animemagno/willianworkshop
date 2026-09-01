/**
 * ExitBatchService.js
 * Servicio de Importación Inteligente de Salidas por Lote
 * 
 * Compara facturas del Excel con las ya guardadas en Firebase.
 * Clasifica cada factura como NUEVA, IDÉNTICA o MODIFICADA.
 */
class ExitBatchService {
    constructor() {
        this.db = firebase.firestore();
    }

    /**
     * Extrae los números de factura únicos del lote parseado
     */
    getUniqueInvoiceNumbers(parsedItems) {
        const numbers = new Set();
        parsedItems.forEach(item => {
            if (item.factura) numbers.add(String(item.factura).trim());
        });
        return Array.from(numbers);
    }

    /**
     * Busca facturas existentes en Firebase por sus números.
     * Firestore solo permite 10 valores en 'in', así que divide en bloques.
     */
    async fetchExistingInvoices(invoiceNumbers) {
        if (!invoiceNumbers || invoiceNumbers.length === 0) return {};
        const existing = {};
        const CHUNK_SIZE = 10;

        for (let i = 0; i < invoiceNumbers.length; i += CHUNK_SIZE) {
            const chunk = invoiceNumbers.slice(i, i + CHUNK_SIZE);
            try {
                const snapshot = await this.db.collection('INVENTARIO_SALIDAS')
                    .where('numeroFactura', 'in', chunk)
                    .get();
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const key = String(data.numeroFactura).trim();
                    if (!existing[key]) {
                        existing[key] = { id: doc.id, ...data };
                    }
                });
            } catch (e) {
                console.error('Error buscando facturas:', e);
            }
        }
        return existing;
    }

    /**
     * Agrupa items del Excel por número de factura
     */
    groupItemsByInvoice(parsedItems) {
        const groups = {};
        parsedItems.forEach(item => {
            const key = String(item.factura).trim();
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });
        return groups;
    }

    /**
     * Compara una factura existente con los nuevos items del Excel.
     * Retorna si hay cambios y cuáles son.
     */
    detectChanges(existingInvoice, newItems) {
        const existingItems = existingInvoice.items || [];

        if (existingItems.length !== newItems.length) {
            return {
                hasChanges: true,
                type: 'MODIFIED',
                details: `Productos: ${existingItems.length} → ${newItems.length}`
            };
        }

        const sortedOld = [...existingItems].sort((a, b) =>
            (a.descripcionPapel || a.name || '').toLowerCase()
                .localeCompare((b.descripcionPapel || b.name || '').toLowerCase())
        );
        const sortedNew = [...newItems].sort((a, b) =>
            (a.itemExcel || '').toLowerCase()
                .localeCompare((b.itemExcel || '').toLowerCase())
        );

        const differences = [];
        for (let i = 0; i < sortedOld.length; i++) {
            const oldName = (sortedOld[i].descripcionPapel || sortedOld[i].name || '').toLowerCase().trim();
            const newName = (sortedNew[i].itemExcel || '').toLowerCase().trim();
            const oldQty = parseFloat(sortedOld[i].cantidad || 0);
            const newQty = parseFloat(sortedNew[i].cant || 0);
            const oldPrice = parseFloat(sortedOld[i].precioUnitario || 0);
            const newPrice = parseFloat(sortedNew[i].precio || 0);

            if (oldName !== newName) {
                differences.push(`Producto cambiado`);
            } else if (Math.abs(oldQty - newQty) > 0.001) {
                differences.push(`${sortedNew[i].itemExcel}: cant. ${oldQty}→${newQty}`);
            } else if (Math.abs(oldPrice - newPrice) > 0.001) {
                differences.push(`${sortedNew[i].itemExcel}: precio cambió`);
            }
        }

        if (differences.length > 0) {
            return {
                hasChanges: true,
                type: 'MODIFIED',
                details: differences.slice(0, 3).join(' | ') +
                    (differences.length > 3 ? ` (+${differences.length - 3} más)` : '')
            };
        }
        return { hasChanges: false, type: 'IDENTICAL', details: '' };
    }

    /**
     * Método principal: Clasifica todas las facturas del lote.
     * Retorna { classification, summary }
     */
    async classifyInvoices(parsedItems) {
        const invoiceNumbers = this.getUniqueInvoiceNumbers(parsedItems);
        if (invoiceNumbers.length === 0) {
            return { classification: {}, summary: { new: 0, identical: 0, modified: 0, total: 0 } };
        }

        console.log(`Comparando ${invoiceNumbers.length} facturas con la base de datos...`);
        const existingInvoices = await this.fetchExistingInvoices(invoiceNumbers);
        const groupedNew = this.groupItemsByInvoice(parsedItems);

        const classification = {};
        const summary = { new: 0, identical: 0, modified: 0, total: invoiceNumbers.length };

        for (const invoiceNum of invoiceNumbers) {
            const newItems = groupedNew[invoiceNum] || [];
            if (existingInvoices[invoiceNum]) {
                const comparison = this.detectChanges(existingInvoices[invoiceNum], newItems);
                classification[invoiceNum] = {
                    status: comparison.type,
                    details: comparison.details,
                    existingDocId: existingInvoices[invoiceNum].id,
                    existingData: existingInvoices[invoiceNum]
                };
                if (comparison.type === 'IDENTICAL') summary.identical++;
                else summary.modified++;
            } else {
                classification[invoiceNum] = {
                    status: 'NEW', details: '',
                    existingDocId: null, existingData: null
                };
                summary.new++;
            }
        }
        console.log('Clasificación completada:', summary);
        return { classification, summary };
    }

    /**
     * Revierte el stock de facturas modificadas y elimina los docs antiguos.
     * Se ejecuta ANTES de crear las nuevas versiones.
     */
    async revertModifiedInvoices(classification) {
        const modified = Object.entries(classification)
            .filter(([_, c]) => c.status === 'MODIFIED' && c.existingData);

        if (modified.length === 0) return;

        let batch = this.db.batch();
        let opsCount = 0;

        for (const [_, info] of modified) {
            const oldItems = info.existingData.items || [];
            for (const item of oldItems) {
                if (item.productId) {
                    const ref = this.db.collection('INVENTARIO').doc(item.productId);
                    batch.update(ref, {
                        existencia: firebase.firestore.FieldValue.increment(parseFloat(item.cantidad || 0))
                    });
                    opsCount++;
                }
            }
            // Borrar documento antiguo
            batch.delete(this.db.collection('INVENTARIO_SALIDAS').doc(info.existingDocId));
            opsCount++;

            if (opsCount >= 450) {
                await batch.commit();
                batch = this.db.batch();
                opsCount = 0;
            }
        }
        if (opsCount > 0) await batch.commit();
        console.log(`Revertidas ${modified.length} facturas modificadas.`);
    }
}

window.ExitBatchService = ExitBatchService;
