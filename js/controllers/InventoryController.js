import { InventoryService } from "../services/InventoryService.js";
import { InventoryUI } from "../ui/InventoryUI.js";

const service = new InventoryService();
const ui = new InventoryUI();
let searchTimeout = null;
let excelData = []; // Store parsed excel data

async function init() {
    console.log("📦 Inicializando Módulo de Inventario...");
    await service.loadAll();
    ui.renderTable(service.products);
    setupEventListeners();

    // Expose global functions for HTML attributes
    window.inventario = {
        cambiarTab: (tabId) => ui.activateTab(tabId)
    };

    // Global actions called from HTML onclick
    window.editarProducto = async (id) => {
        const product = service.products.find(p => p.id === id);
        if (product) ui.showEditModal(product);
    };

    window.eliminarProducto = async (id) => {
        if (confirm("¿Estás seguro de eliminar este producto? Esta acción no se puede deshacer.")) {
            try {
                await service.deleteProduct(id);
                ui.renderTable(service.products); // Update table locally
                alert("✅ Producto eliminado");
            } catch (e) {
                alert("Error eliminando: " + e.message);
            }
        }
    };

    window.cerrarModalEditar = () => ui.hideEditModal();
}

function setupEventListeners() {
    // 1. Search
    ui.els.searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const results = service.search(e.target.value);
            ui.renderTable(results);
        }, 300);
    });

    // 2. New Product Form
    ui.els.formNew.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const data = ui.getNewFormData();
            await service.addProduct(data);
            alert("✅ Producto agregado correctamente");
            ui.clearNewForm();
            ui.renderTable(service.products); // Refresh list
        } catch (error) {
            alert("Error: " + error.message);
        }
    });

    // 3. Edit Product Form
    ui.els.formEdit.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const data = ui.getEditFormData();
            const id = data.id;
            delete data.id; // Don't update ID field in DB doc body usually

            await service.updateProduct(id, data);
            alert("✅ Producto actualizado");
            ui.hideEditModal();
            ui.renderTable(service.search(ui.els.searchInput.value));
        } catch (error) {
            alert("Error: " + error.message);
        }
    });

    // 4. Excel Upload
    setupExcelHandlers();

    // 5. Update Button
    document.getElementById('actualizar-inventario-btn')?.addEventListener('click', async () => {
        await service.loadAll();
        ui.renderTable(service.products);
        alert("Lista actualizada");
    });
}

function setupExcelHandlers() {
    const dropArea = ui.els.dropArea;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    dropArea.addEventListener('drop', handleDrop, false);
    dropArea.addEventListener('click', () => ui.els.fileInput.click());
    ui.els.fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    function handleDrop(e) {
        const dt = e.dataTransfer;
        handleFiles(dt.files);
    }

    function handleFiles(files) {
        if (files.length > 0) {
            const file = files[0];
            processExcel(file);
        }
    }

    document.getElementById('confirmar-carga-btn')?.addEventListener('click', async () => {
        if (excelData.length === 0) return;

        if (!confirm(`¿Cargar ${excelData.length} productos? Esto puede tardar unos segundos.`)) return;

        try {
            const result = await service.bulkUpload(excelData);
            alert(`✅ Carga completada. Procesados: ${result.count}`);
            ui.els.excelPreview.style.display = 'none';
            excelData = [];
            ui.renderTable(service.products);
            ui.activateTab('lista');
        } catch (e) {
            alert("Error en carga masiva: " + e.message);
        }
    });

    document.getElementById('cancelar-carga-btn')?.addEventListener('click', () => {
        ui.els.excelPreview.style.display = 'none';
        excelData = [];
    });
}

function processExcel(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        excelData = XLSX.utils.sheet_to_json(worksheet, { raw: false });

        ui.renderExcelPreview(excelData);
    };
    reader.readAsArrayBuffer(file);
}

// Init
document.addEventListener('DOMContentLoaded', init);
