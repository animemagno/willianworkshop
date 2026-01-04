import { InventoryService } from '../services/InventoryService.js';

export class InventoryController {
    constructor() {
        this.inventoryService = new InventoryService();
        this.tablaCuerpo = document.getElementById('inventario-body');
        this.productosExcel = [];
        this.init();
    }

    async init() {
        console.log('Iniciando Inventario...');
        this.setupEventListeners();
        await this.cargarYMostrarProductos();
    }

    setupEventListeners() {
        // Pestañas
        const botonesMenu = document.querySelectorAll('.inventario-sidebar-item');
        botonesMenu.forEach(boton => {
            boton.addEventListener('click', () => {
                const tabId = boton.getAttribute('data-tab');
                this.cambiarPestana(tabId);
            });
        });

        // Botón Actualizar
        const btnActualizar = document.getElementById('actualizar-inventario-btn');
        if (btnActualizar) {
            btnActualizar.addEventListener('click', () => this.cargarYMostrarProductos());
        }

        // --- BOTÓN BORRAR TODO (NUEVO) ---
        // Lo buscaré o lo crearé dinámicamente si no existe en HTML
        let btnBorrar = document.getElementById('borrar-todo-btn');
        if (!btnBorrar) {
            // Inyectar botón si no existe (para probar rápido)
            const contenedorAcciones = document.querySelector('.inventario-actions div');
            if (contenedorAcciones) {
                btnBorrar = document.createElement('button');
                btnBorrar.id = 'borrar-todo-btn';
                btnBorrar.className = 'btn btn-danger';
                btnBorrar.innerHTML = '<i class="fas fa-trash-alt"></i> BORRAR TODO';
                btnBorrar.style.marginLeft = '10px';
                contenedorAcciones.appendChild(btnBorrar);
            }
        }

        if (btnBorrar) {
            btnBorrar.addEventListener('click', async () => {
                const seguro = confirm("⚠️ ¿ESTÁS SEGURO? \n\nEsto borrará TODOS los productos del inventario permanentemente. \n\n¿Continuar?");
                if (seguro) {
                    await this.borrarInventarioCompleto();
                }
            });
        }
    }

    cambiarPestana(tabId) {
        document.querySelectorAll('.inventario-sidebar-item').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        const botonActivo = document.querySelector(`.inventario-sidebar-item[data-tab="${tabId}"]`);
        if (botonActivo) botonActivo.classList.add('active');

        const contenidoActivo = document.getElementById(`tab-${tabId}`);
        if (contenidoActivo) contenidoActivo.classList.add('active');
    }

    async cargarYMostrarProductos() {
        try {
            this.tablaCuerpo.innerHTML = '<tr><td colspan="10">Cargando productos...</td></tr>';
            const productos = await this.inventoryService.obtenerTodos();
            this.renderizarTabla(productos);
        } catch (error) {
            console.error("Falló la carga:", error);
            this.tablaCuerpo.innerHTML = '<tr><td colspan="10">Error cargando datos.</td></tr>';
        }
    }

    async borrarInventarioCompleto() {
        try {
            this.tablaCuerpo.innerHTML = '<tr><td colspan="10">Borrando todo el inventario... Espere...</td></tr>';
            const exito = await this.inventoryService.borrarTodo();
            if (exito) {
                alert("Inventario borrado correctamente.");
                this.cargarYMostrarProductos(); // Recargar (debería salir vacío)
            } else {
                alert("Hubo un error al borrar.");
                this.cargarYMostrarProductos();
            }
        } catch (error) {
            alert("Error: " + error.message);
            this.cargarYMostrarProductos();
        }
    }

    renderizarTabla(productos) {
        this.tablaCuerpo.innerHTML = '';

        if (!productos || productos.length === 0) {
            this.tablaCuerpo.innerHTML = '<tr><td colspan="10" class="empty-cart">No hay productos en inventario</td></tr>';
            return;
        }

        productos.forEach(prod => {
            const fila = document.createElement('tr');

            const costo = parseFloat(prod.costo || 0).toFixed(2);
            const venta = parseFloat(prod.precio || 0).toFixed(2);
            let esFiscal = (prod.creditoFiscal === true || prod.creditoFiscal === 'SI') ? 'SI' : 'NO';

            fila.innerHTML = `
                <td>${prod.codigo || '-'}</td>
                <td>${prod.descripcion || '-'}</td>
                <td>${prod.descripcionFactura || '-'}</td>
                <td>$${costo}</td>
                <td>$${venta}</td>
                <td>${prod.existencia || 0}</td>
                <td>${prod.stockMinimo || 0}</td>
                <td>${esFiscal}</td>
                <td>${prod.proveedor || '-'}</td>
                <td>
                    <button class="btn-icon btn-edit"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon btn-delete"><i class="fas fa-trash"></i></button>
                </td>
            `;
            this.tablaCuerpo.appendChild(fila);
        });
    }
}

// Inicializar
new InventoryController();
