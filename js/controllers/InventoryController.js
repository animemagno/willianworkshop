
// Controlador de Inventario (Global)
class InventoryController {
    constructor() {
        this.inventoryService = new InventoryService();
        this.tablaCuerpo = document.getElementById('inventario-body');
        // Almacén temporal de datos leídos del Excel
        this.datosExcelCargados = [];
        this.init();
    }

    async init() {
        console.log('Iniciando Inventario...');
        this.setupEventListeners();
        await this.cargarYMostrarProductos();
    }

    setupEventListeners() {
        // --- NAVEGACIÓN DE PESTAÑAS ---
        const botonesMenu = document.querySelectorAll('.inventario-sidebar-item');
        botonesMenu.forEach(boton => {
            boton.addEventListener('click', () => {
                const tabId = boton.getAttribute('data-tab');
                this.cambiarPestana(tabId);
            });
        });

        // --- BOTONES DE ACCIÓN ---
        const btnActualizar = document.getElementById('actualizar-inventario-btn');
        if (btnActualizar) btnActualizar.addEventListener('click', () => this.cargarYMostrarProductos());

        // Botón borrar (inyectado)
        this.inyectarBotonBorrar();

        // --- LÓGICA DE EXCEL ---
        const excelInput = document.getElementById('excel-file');
        const dropArea = document.getElementById('excel-drop-area');

        if (dropArea && excelInput) {
            // Click en el área abre el selector de archivo
            dropArea.addEventListener('click', () => excelInput.click());

            // Al seleccionar archivo
            excelInput.addEventListener('change', (e) => this.manejarArchivoExcel(e.target.files[0]));

            // Drag & Drop visual
            dropArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropArea.classList.add('drag-over');
            });
            dropArea.addEventListener('dragleave', () => dropArea.classList.remove('drag-over'));
            dropArea.addEventListener('drop', (e) => {
                e.preventDefault();
                dropArea.classList.remove('drag-over');
                if (e.dataTransfer.files.length) {
                    this.manejarArchivoExcel(e.dataTransfer.files[0]);
                }
            });
        }
    }

    inyectarBotonBorrar() {
        let btnBorrar = document.getElementById('borrar-todo-btn');
        if (!btnBorrar) {
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
            // Clonar para limpiar eventos antiguos
            const newBtn = btnBorrar.cloneNode(true);
            btnBorrar.parentNode.replaceChild(newBtn, btnBorrar);
            newBtn.addEventListener('click', async () => {
                const seguro = confirm("⚠️ ¿ESTÁS SEGURO? \n\nEsto borrará TODOS los productos.\n\nAcción irreversible.");
                if (seguro) await this.borrarInventarioCompleto();
            });
        }
    }

    async manejarArchivoExcel(archivo) {
        if (!archivo) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

            // Usamos 'sheet_to_json' con defval:"" para que NO ignore celdas vacías
            // Esto es CLAVE: si no ponemos defval, las desplaza
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });

            this.procesarDatosExcel(jsonData);
        };
        reader.readAsArrayBuffer(archivo);
    }

    procesarDatosExcel(datosCrudos) {
        if (!datosCrudos || datosCrudos.length === 0) {
            alert("El archivo parece vacío.");
            return;
        }

        // Mapeo Inteligente de Columnas
        // Buscamos qué propiedad del JSON corresponde a cada campo nuestro
        const primeraFila = datosCrudos[0]; // Usamos la primera fila de datos para ver las keys (encabezados)
        const keys = Object.keys(primeraFila);

        // Helper para buscar key parecida
        const buscarKey = (palabrasClave) => {
            const keyEncontrada = keys.find(k => {
                const kMin = k.toLowerCase();
                return palabrasClave.some(p => kMin.includes(p));
            });
            return keyEncontrada;
        };

        const keyCodigo = buscarKey(['cod', 'código', 'id']);
        const keyDescInv = buscarKey(['inv', 'taller', 'descrip', 'prod']); // Prioridad inventario
        const keyDescFact = buscarKey(['fact', 'fiscal']);
        const keyCosto = buscarKey(['costo', 'compra']);
        const keyVenta = buscarKey(['venta', 'precio', 'públ']);
        const keyExistencia = buscarKey(['exist', 'cant', 'stock']);
        const keyMinimo = buscarKey(['min', 'mín']);
        const keyCredito = buscarKey(['créd', 'fisc']);
        const keyProveedor = buscarKey(['prov']);

        // Convertir al formato interno
        this.datosExcelCargados = datosCrudos.map(fila => {
            // Función segura para obtener valor y limpiar
            const val = (k) => {
                if (!k) return "";
                let v = fila[k];
                if (v === undefined || v === null) return "";
                return v.toString().trim();
            };

            // Parsear numeros
            const parseNum = (k) => {
                const v = val(k).replace('$', '').replace(',', '');
                return parseFloat(v) || 0;
            };

            return {
                codigo: val(keyCodigo),
                descripcion: val(keyDescInv) || "SIN DESCRIPCIÓN", // Fallback si no hay desc
                descripcionFactura: val(keyDescFact),
                costo: parseNum(keyCosto),
                precio: parseNum(keyVenta),
                existencia: parseNum(keyExistencia),
                stockMinimo: parseNum(keyMinimo),
                creditoFiscal: val(keyCredito).toUpperCase() === 'SI',
                proveedor: val(keyProveedor)
            };
        });

        // Mostrar Vista Previa
        this.mostrarVistaPreviaExcel();
    }

    mostrarVistaPreviaExcel() {
        const contenedor = document.getElementById('tab-cargar-excel');

        // Crear tabla de preview si no existe
        let previewContainer = document.getElementById('excel-preview-container');
        if (!previewContainer) {
            previewContainer = document.createElement('div');
            previewContainer.id = 'excel-preview-container';
            previewContainer.style.marginTop = '20px';
            contenedor.appendChild(previewContainer);
        }

        // Generar HTML de la tabla
        let h = `
            <h3>Vista Previa (${this.datosExcelCargados.length} productos)</h3>
            <p>Por favor revisa que las columnas coincidan. Las celdas vacías deben verse vacías.</p>
            <div style="max-height: 400px; overflow: auto; border: 1px solid #ccc;">
            <table class="inventario-table">
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Desc. Inventario</th>
                        <th>Desc. Factura</th>
                        <th>Costo</th>
                        <th>Venta</th>
                        <th>Exist.</th>
                    </tr>
                </thead>
                <tbody>
        `;

        // Mostrar primeros 50 para no trabar el navegador
        this.datosExcelCargados.slice(0, 50).forEach(d => {
            h += `
                <tr>
                    <td>${d.codigo}</td>
                    <td>${d.descripcion}</td>
                    <td>${d.descripcionFactura}</td>
                    <td>$${d.costo}</td>
                    <td>$${d.precio}</td>
                    <td>${d.existencia}</td>
                </tr>
            `;
        });

        h += `</tbody></table></div>`;

        // Botones de Confirmar
        h += `
            <div class="inventario-actions" style="margin-top: 20px; justify-content: flex-end;">
                <button class="btn btn-danger" onclick="window.inventario.cancelarCarga()">CANCELAR</button>
                <button class="btn btn-success" onclick="window.inventario.guardarCargaExcel()">
                    <i class="fas fa-save"></i> GUARDAR EN BASE DE DATOS
                </button>
            </div>
        `;

        previewContainer.innerHTML = h;
    }

    cancelarCarga() {
        document.getElementById('excel-preview-container').innerHTML = '';
        this.datosExcelCargados = [];
        document.getElementById('excel-file').value = ''; // Reset input
    }

    async guardarCargaExcel() {
        if (this.datosExcelCargados.length === 0) return;

        const btnGuardar = document.querySelector('#excel-preview-container .btn-success');
        if (btnGuardar) {
            btnGuardar.disabled = true;
            btnGuardar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        }

        try {
            // Guardar uno por uno (o batch)
            // Para ser robustos, uno por uno o batches pequeños
            let guardados = 0;
            const batchSize = 400;
            const chunks = [];

            for (let i = 0; i < this.datosExcelCargados.length; i += batchSize) {
                chunks.push(this.datosExcelCargados.slice(i, i + batchSize));
            }

            for (const chunk of chunks) {
                const batch = firebase.firestore().batch();
                chunk.forEach(prod => {
                    const ref = firebase.firestore().collection("INVENTARIO").doc(); // ID auto
                    batch.set(ref, prod);
                });
                await batch.commit();
                guardados += chunk.length;
                console.log(`Guardados ${guardados} productos...`);
            }

            alert(`✅ Éxito: Se guardaron ${guardados} productos correctamente.`);
            this.cancelarCarga();
            this.cambiarPestana('lista'); // Volver a la lista
            this.cargarYMostrarProductos(); // Actualizar lista

        } catch (error) {
            console.error("Error al guardar:", error);
            alert("❌ Error al guardar datos: " + error.message);
            if (btnGuardar) {
                btnGuardar.disabled = false;
                btnGuardar.innerHTML = 'Reintentar';
            }
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

    // ... borrarInventarioCompleto y renderizarTabla se mantienen igual ...
    async borrarInventarioCompleto() {
        try {
            this.tablaCuerpo.innerHTML = '<tr><td colspan="10">Borrando...</td></tr>';
            const exito = await this.inventoryService.borrarTodo();
            if (exito) {
                alert("Inventario borrado.");
                this.cargarYMostrarProductos();
            } else {
                alert("Error al borrar.");
                this.cargarYMostrarProductos();
            }
        } catch (e) { alert(e.message); this.cargarYMostrarProductos(); }
    }

    renderizarTabla(productos) {
        this.tablaCuerpo.innerHTML = '';
        if (!productos || productos.length === 0) {
            this.tablaCuerpo.innerHTML = '<tr><td colspan="10" class="empty-cart">No hay productos</td></tr>';
            return;
        }
        productos.forEach(prod => {
            const tr = document.createElement('tr');
            // Checkeo de seguridad para valores null
            const c = (prod.costo || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
            const v = (prod.precio || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
            tr.innerHTML = `
                <td>${prod.codigo || ''}</td>
                <td>${prod.descripcion || ''}</td>
                <td>${prod.descripcionFactura || ''}</td>
                <td>${c}</td>
                <td>${v}</td>
                <td>${prod.existencia || 0}</td>
                <td>${prod.stockMinimo || 0}</td>
                <td>${prod.creditoFiscal ? 'SI' : 'NO'}</td>
                <td>${prod.proveedor || ''}</td>
                <td> <button class="btn-icon"><i class="fas fa-edit"></i></button> </td>
            `;
            this.tablaCuerpo.appendChild(tr);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const controller = new InventoryController();
    controller.init();
    window.inventario = controller;
});
