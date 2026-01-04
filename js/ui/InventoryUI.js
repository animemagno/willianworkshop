// Clase UI Global (Sin Import/Export)
class InventoryUI {
    constructor() {
        this.els = {
            tableBody: document.getElementById('inventario-body'),
            searchInput: document.getElementById('buscar-producto'),
            modalEdit: document.getElementById('modalEditarProducto'),
            formEdit: document.getElementById('form-editar-producto'),
            formNew: document.getElementById('form-nuevo-producto'),

            // Excel
            dropArea: document.getElementById('excel-drop-area'),
            fileInput: document.getElementById('excel-file'),
            excelPreview: document.getElementById('excel-preview'),
            excelContent: document.getElementById('excel-preview-content')
        };
    }

    renderTable(products) {
        if (!products || products.length === 0) {
            this.els.tableBody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align:center; padding:30px; color:#888;">
                        <i class="fas fa-box-open" style="font-size:2rem;margin-bottom:10px;"></i><br>
                        No se encontraron productos
                    </td>
                </tr>
            `;
            return;
        }

        this.els.tableBody.innerHTML = products.map(p => {
            const stockClass = p.existencia <= (p.stockMinimo || 0) && p.existencia > 0 ? 'stock-bajo' :
                p.existencia <= 0 ? 'stock-critico' : 'stock-normal';

            const creditoBadge = p.creditoFiscal ?
                '<span class="credito-si">SI</span>' :
                '<span class="credito-no">NO</span>';

            // Usamos window.Utils si existe, o fallback simple
            const precioFmt = window.Utils && window.Utils.formatCurrency ?
                window.Utils.formatCurrency(p.precioVenta) :
                "$" + p.precioVenta.toFixed(2);

            return `
                <tr data-id="${p.id}">
                    <td><strong>${p.codigo}</strong></td>
                    <td>${p.descInventario}</td>
                    <td><small>${p.descFactura || ''}</small></td>
                    <td>$${(p.precioCosto || 0).toFixed(2)}</td>
                    <td class="precio" style="font-weight:bold; color:#2c3e50;">${precioFmt}</td>
                    <td class="${stockClass}" style="text-align:center;">${p.existencia}</td>
                    <td style="text-align:center;">${p.stockMinimo || 0}</td>
                    <td style="text-align:center;">${creditoBadge}</td>
                    <td>${p.proveedor || '-'}</td>
                    <td style="text-align:center;">
                        <button class="icon-btn btn-edit" title="Editar" onclick="window.editarProducto('${p.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="icon-btn btn-delete" title="Eliminar" onclick="window.eliminarProducto('${p.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    showEditModal(product) {
        // Llenar campos
        document.getElementById('edit-id').value = product.id;
        document.getElementById('edit-codigo').value = product.codigo || "";
        document.getElementById('edit-codigos-proveedor').value = Array.isArray(product.codigosProveedor) ? product.codigosProveedor.join(', ') : '';
        document.getElementById('edit-desc-inventario').value = product.descInventario || "";
        document.getElementById('edit-desc-factura').value = product.descFactura || "";
        document.getElementById('edit-precio-costo').value = product.precioCosto || 0;
        document.getElementById('edit-precio-venta').value = product.precioVenta || 0;
        document.getElementById('edit-existencia').value = product.existencia || 0;
        document.getElementById('edit-stock-minimo').value = product.stockMinimo || 5;
        document.getElementById('edit-credito-fiscal').checked = product.creditoFiscal;
        document.getElementById('edit-proveedor').value = product.proveedor || '';

        this.els.modalEdit.style.display = 'flex';
    }

    hideEditModal() {
        this.els.modalEdit.style.display = 'none';
        this.els.formEdit.reset();
    }

    getEditFormData() {
        return {
            id: document.getElementById('edit-id').value,
            codigo: document.getElementById('edit-codigo').value,
            codigosProveedor: document.getElementById('edit-codigos-proveedor').value,
            descInventario: document.getElementById('edit-desc-inventario').value,
            descFactura: document.getElementById('edit-desc-factura').value,
            precioCosto: parseFloat(document.getElementById('edit-precio-costo').value) || 0,
            precioVenta: parseFloat(document.getElementById('edit-precio-venta').value) || 0,
            existencia: parseFloat(document.getElementById('edit-existencia').value) || 0,
            stockMinimo: parseFloat(document.getElementById('edit-stock-minimo').value) || 0,
            creditoFiscal: document.getElementById('edit-credito-fiscal').checked,
            proveedor: document.getElementById('edit-proveedor').value
        };
    }

    getNewFormData() {
        return {
            codigo: document.getElementById('codigo').value,
            codigosProveedor: document.getElementById('codigos-proveedor').value,
            descInventario: document.getElementById('desc-inventario').value,
            descFactura: document.getElementById('desc-factura').value,
            precioCosto: parseFloat(document.getElementById('precio-costo').value) || 0,
            precioVenta: parseFloat(document.getElementById('precio-venta').value) || 0,
            existencia: parseFloat(document.getElementById('existencia').value) || 0,
            stockMinimo: parseFloat(document.getElementById('stock-minimo').value) || 0,
            creditoFiscal: document.getElementById('credito-fiscal').checked,
            proveedor: document.getElementById('proveedor').value,
            categoria: document.getElementById('categoria').value
        };
    }

    clearNewForm() {
        this.els.formNew.reset();
    }

    // Tabs logic
    activateTab(tabId) {
        // Update Buttons
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.target === tabId);
        });

        // Update Content
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        const content = document.getElementById(`tab-${tabId}`);
        if (content) content.classList.add('active');
    }

    renderExcelPreview(data) {
        this.els.excelPreview.style.display = 'block';
        this.els.dropArea.style.display = 'none'; // ocultar drop area

        let html = '<table class="inventario-table"><thead><tr>';
        if (data.length > 0) {
            Object.keys(data[0]).forEach(key => html += `<th>${key}</th>`);
            html += '</tr></thead><tbody>';

            data.slice(0, 10).forEach(row => {
                html += '<tr>';
                Object.values(row).forEach(val => html += `<td>${val}</td>`);
                html += '</tr>';
            });
            html += '</tbody></table>';

            if (data.length > 10) {
                html += `<p style="padding:10px;text-align:center;color:#666">... y ${data.length - 10} más.</p>`;
            }
        } else {
            html = '<p>Archivo vacío o formato no reconocido</p>';
        }
        this.els.excelContent.innerHTML = html;
    }
}

// Exponer globalmente
window.InventoryUI = InventoryUI;
