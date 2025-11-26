// inventario.js - Sistema completo de inventario con Firebase
console.log("âœ… inventario.js cargando...");

import { db } from './firebase-config.js';
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDocs,
    query,
    where,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

class SistemaInventario {
    constructor() {
        this.productos = [];
        this.proveedores = [];
        this.datosExcel = [];
        this.ordenActual = '';
        console.log("âœ… SistemaInventario inicializado con Firebase");
    }

    async init() {
        try {
            console.log("ðŸš€ Iniciando sistema de inventario...");
            this.setupMenuMobile();
            this.setupTabs();
            await this.cargarProductos();
            this.setupEventListeners();
            console.log("âœ… Sistema de inventario listo");
        } catch (error) {
            console.error("âŒ Error al iniciar:", error);
        }
    }

    // ========== CONFIGURACIÃ“N INICIAL ==========
    setupMenuMobile() {
        try {
            const mobileMenuBtn = document.getElementById('mobileMenuBtn');
            const mobileMenu = document.getElementById('mobileMenu');
            const logoutBtn = document.getElementById('logoutBtn');

            if (mobileMenuBtn && mobileMenu) {
                mobileMenuBtn.addEventListener('click', () => {
                    mobileMenu.classList.toggle('active');
                });
            }

            if (logoutBtn) {
                logoutBtn.addEventListener('click', () => {
                    localStorage.removeItem('usuarioLogueado');
                    window.location.href = 'login.html';
                });
            }
        } catch (error) {
            console.error("Error en setupMenuMobile:", error);
        }
    }

    setupTabs() {
        try {
            const sidebarItems = document.querySelectorAll('.inventario-sidebar-item');
            const tabContents = document.querySelectorAll('.tab-content');

            sidebarItems.forEach(item => {
                item.addEventListener('click', () => {
                    const tabId = item.getAttribute('data-tab');

                    // Remover activo de todos
                    sidebarItems.forEach(sideItem => sideItem.classList.remove('active'));
                    tabContents.forEach(content => content.classList.remove('active'));

                    // Activar actual
                    item.classList.add('active');
                    const tabContent = document.getElementById(`tab-${tabId}`);
                    if (tabContent) {
                        tabContent.classList.add('active');
                    }
                });
            });
        } catch (error) {
            console.error("Error en setupTabs:", error);
        }
    }

    // ========== EVENT LISTENERS ==========
    setupEventListeners() {
        try {
            // BÃºsqueda en tiempo real
            const buscarInput = document.getElementById('buscar-producto');
            if (buscarInput) {
                buscarInput.addEventListener('input', (e) => {
                    this.filtrarProductos(e.target.value);
                });
            }

            //Ordenamiento
            const ordenarSelect = document.getElementById('ordenar-por');
            if (ordenarSelect) {
                ordenarSelect.addEventListener('change', (e) => {
                    this.ordenActual = e.target.value;
                    console.log('Ordenando por:', this.ordenActual);
                    const termino = buscarInput ? buscarInput.value : '';
                    this.filtrarProductos(termino);
                });
            }

            // Formulario nuevo producto
            const formNuevo = document.getElementById('form-nuevo-producto');
            if (formNuevo) {
                formNuevo.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.guardarNuevoProducto();
                });
            }

            // Limpiar formulario
            const limpiarBtn = document.getElementById('limpiar-form-btn');
            if (limpiarBtn) {
                limpiarBtn.addEventListener('click', () => {
                    document.getElementById('form-nuevo-producto').reset();
                    document.getElementById('credito-fiscal').checked = true;
                });
            }

            // Formulario editar producto
            const formEditar = document.getElementById('form-editar-producto');
            if (formEditar) {
                formEditar.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.actualizarProducto();
                });
            }

            // Actualizar inventario
            const actualizarBtn = document.getElementById('actualizar-inventario-btn');
            if (actualizarBtn) {
                actualizarBtn.addEventListener('click', () => {
                    this.cargarProductos();
                });
            }

            // Carga de Excel
            this.setupExcelUpload();

            // Reportes
            this.setupReportes();

        } catch (error) {
            console.error("Error en setupEventListeners:", error);
        }
    }

    // ========== GESTIÃ“N DE EXCEL ==========
    setupExcelUpload() {
        try {
            const dropArea = document.getElementById('excel-drop-area');
            const fileInput = document.getElementById('excel-file');
            const preview = document.getElementById('excel-preview');

            if (!dropArea || !fileInput) {
                console.warn("âŒ Elementos de Excel no encontrados");
                return;
            }

            // Click en Ã¡rea de drop
            dropArea.addEventListener('click', () => {
                fileInput.click();
            });

            // Drag and drop
            dropArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropArea.style.background = '#e8f4fd';
            });

            dropArea.addEventListener('dragleave', () => {
                dropArea.style.background = '#f8f9fa';
            });

            dropArea.addEventListener('drop', (e) => {
                e.preventDefault();
                dropArea.style.background = '#f8f9fa';
                const files = e.dataTransfer.files;
                if (files.length) {
                    this.procesarArchivoExcel(files[0]);
                }
            });

            // Cambio de archivo
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length) {
                    this.procesarArchivoExcel(e.target.files[0]);
                }
            });

            // Descargar plantilla
            const descargarBtn = document.getElementById('descargar-plantilla-btn');
            if (descargarBtn) {
                descargarBtn.addEventListener('click', () => {
                    this.descargarPlantillaExcel();
                });
            }

            // Confirmar carga
            const confirmarBtn = document.getElementById('confirmar-carga-btn');
            if (confirmarBtn) {
                confirmarBtn.addEventListener('click', () => {
                    this.confirmarCargaExcel();
                });
            }

            // Cancelar carga
            const cancelarBtn = document.getElementById('cancelar-carga-btn');
            if (cancelarBtn) {
                cancelarBtn.addEventListener('click', () => {
                    preview.style.display = 'none';
                    this.datosExcel = [];
                });
            }

        } catch (error) {
            console.error("Error en setupExcelUpload:", error);
        }
    }

    // ========== REPORTES ==========
    setupReportes() {
        try {
            const generarBtn = document.getElementById('generar-reporte-btn');
            const imprimirBtn = document.getElementById('imprimir-reporte-btn');

            if (generarBtn) {
                generarBtn.addEventListener('click', () => {
                    this.generarReporte();
                });
            }

            if (imprimirBtn) {
                imprimirBtn.addEventListener('click', () => {
                    this.imprimirReporte();
                });
            }
        } catch (error) {
            console.error("Error en setupReportes:", error);
        }
    }

    // ========== OPERACIONES CRUD PRODUCTOS CON FIREBASE ==========
    async cargarProductos() {
        try {
            console.log("ðŸ“¦ Cargando productos desde Firebase...");
            const tbody = document.getElementById('inventario-body');

            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="10" class="empty-cart">
                            <i class="fas fa-spinner fa-spin" style="font-size:2rem;margin-bottom:10px;"></i>
                            <div>Cargando inventario...</div>
                        </td>
                    </tr>
                `;
            }

            const querySnapshot = await getDocs(collection(db, "inventario"));
            this.productos = [];

            querySnapshot.forEach((doc) => {
                const producto = {
                    id: doc.id,
                    ...doc.data()
                };
                this.productos.push(producto);
            });

            console.log(`âœ… ${this.productos.length} productos cargados desde Firebase`);
            this.mostrarProductos();

        } catch (error) {
            console.error("âŒ Error cargando productos desde Firebase:", error);
            this.mostrarError("Error al cargar el inventario desde la base de datos");
        }
    }

    mostrarProductos(productosFiltrados = null) {
        try {
            let productos = productosFiltrados || this.productos;
            productos = this.ordenarProductos(productos);
            const tbody = document.getElementById('inventario-body');
            const modoEdicion = localStorage.getItem('modoEdicionInventario') === 'true';

            if (!tbody) {
                console.error("âŒ No se encontrÃ³ tbody#inventario-body");
                return;
            }

            if (productos.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="10" class="empty-cart">
                            <i class="fas fa-boxes" style="font-size:2rem;margin-bottom:10px;opacity:.5;"></i>
                            <div>No hay productos en inventario</div>
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = productos.map(producto => {
                const claseStock = this.obtenerClaseStock(producto.existencia, producto.stockMinimo);
                const claseCodigo = !producto.codigo ? 'codigo-vacio' : '';
                const codigoDisplay = producto.codigo || '<span style="color:#856404; font-style:italic;">SIN CÃ“DIGO</span>';
                const creditoFiscal = producto.creditoFiscal !== false ? 'SI' : 'NO';
                const claseCredito = producto.creditoFiscal !== false ? 'credito-si' : 'credito-no';

                if (modoEdicion) {
                    // MODO EDICIÃ“N (EXCEL)
                    return `
                        <tr data-id="${producto.id}">
                            <td><input type="text" value="${producto.codigo || ''}" class="edit-input" onchange="inventario.guardarCambioRapido('${producto.id}', 'codigo', this.value)"></td>
                            <td><input type="text" value="${producto.descInventario}" class="edit-input" onchange="inventario.guardarCambioRapido('${producto.id}', 'descInventario', this.value)"></td>
                            <td><input type="text" value="${producto.descFactura}" class="edit-input" onchange="inventario.guardarCambioRapido('${producto.id}', 'descFactura', this.value)"></td>
                            <td><input type="number" step="0.01" value="${producto.precioCosto}" class="edit-input" onchange="inventario.guardarCambioRapido('${producto.id}', 'precioCosto', this.value)"></td>
                            <td><input type="number" step="0.01" value="${producto.precioVenta}" class="edit-input" onchange="inventario.guardarCambioRapido('${producto.id}', 'precioVenta', this.value)"></td>
                            <td><input type="number" value="${producto.existencia}" class="edit-input" onchange="inventario.guardarCambioRapido('${producto.id}', 'existencia', this.value)"></td>
                            <td><input type="number" value="${producto.stockMinimo || 0}" class="edit-input" onchange="inventario.guardarCambioRapido('${producto.id}', 'stockMinimo', this.value)"></td>
                            <td>
                                <select onchange="inventario.guardarCambioRapido('${producto.id}', 'creditoFiscal', this.value === 'true')">
                                    <option value="true" ${producto.creditoFiscal !== false ? 'selected' : ''}>SI</option>
                                    <option value="false" ${producto.creditoFiscal === false ? 'selected' : ''}>NO</option>
                                </select>
                            </td>
                            <td><input type="text" value="${producto.proveedor || ''}" class="edit-input" onchange="inventario.guardarCambioRapido('${producto.id}', 'proveedor', this.value)"></td>
                            <td>
                                <button class="icon-btn btn-delete" onclick="inventario.eliminarProducto('${producto.id}')" title="Eliminar">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `;
                } else {
                    // MODO VISUALIZACIÃ“N (SEGURO)
                    return `
                        <tr>
                            <td class="${claseCodigo}"><strong>${codigoDisplay}</strong></td>
                            <td>${producto.descInventario}</td>
                            <td>${producto.descFactura}</td>
                            <td class="precio">$${producto.precioCosto?.toFixed(2) || '0.00'}</td>
                            <td class="precio">$${producto.precioVenta?.toFixed(2) || '0.00'}</td>
                            <td class="${claseStock}">${producto.existencia}</td>
                            <td>${producto.stockMinimo || 0}</td>
                            <td><span class="${claseCredito}">${creditoFiscal}</span></td>
                            <td>${producto.proveedor || ''}</td>
                            <td>
                                <!-- Botones ocultos en modo seguro -->
                                <span style="color:#999; font-size:0.8rem;"><i class="fas fa-lock"></i></span>
                            </td>
                        </tr>
                    `;
                }
            }).join('');

        } catch (error) {
            console.error("Error en mostrarProductos:", error);
        }
    }

    obtenerClaseStock(existencia, stockMinimo) {
        if (!stockMinimo) return 'stock-normal';
        if (existencia <= 0) return 'stock-critico';
        if (existencia <= stockMinimo) return 'stock-bajo';
        return 'stock-normal';
    }

    ordenarProductos(productos) {
        if (!this.ordenActual) return productos;

        const productosCopia = [...productos];
        const [campo, direccion] = this.ordenActual.split('-');

        productosCopia.sort((a, b) => {
            let valorA, valorB;

            switch (campo) {
                case 'codigo':
                    valorA = (a.codigo || '').toLowerCase();
                    valorB = (b.codigo || '').toLowerCase();
                    break;
                case 'descripcion':
                    valorA = a.descInventario.toLowerCase();
                    valorB = b.descInventario.toLowerCase();
                    break;
                case 'existencia':
                    valorA = a.existencia || 0;
                    valorB = b.existencia || 0;
                    break;
                default:
                    return 0;
            }

            if (valorA < valorB) return direccion === 'asc' ? -1 : 1;
            if (valorA > valorB) return direccion === 'asc' ? 1 : -1;
            return 0;
        });

        return productosCopia;
    }

    filtrarProductos(termino) {
        try {
            if (!termino) {
                this.mostrarProductos();
                return;
            }

            const terminoLower = termino.toLowerCase();
            const filtrados = this.productos.filter(producto =>
                (producto.codigo && producto.codigo.toLowerCase().includes(terminoLower)) ||
                producto.descInventario.toLowerCase().includes(terminoLower) ||
                producto.descFactura.toLowerCase().includes(terminoLower) ||
                (producto.proveedor && producto.proveedor.toLowerCase().includes(terminoLower))
            );

            this.mostrarProductos(filtrados);
        } catch (error) {
            console.error("Error en filtrarProductos:", error);
        }
    }

    async guardarNuevoProducto() {
        try {
            const formData = new FormData(document.getElementById('form-nuevo-producto'));

            const producto = {
                codigo: (formData.get('codigo') || '').trim(),
                codigosProveedor: (formData.get('codigos-proveedor') || '').trim(),
                descInventario: formData.get('desc-inventario').trim(),
                descFactura: formData.get('desc-factura').trim(),
                precioCosto: parseFloat(formData.get('precio-costo')) || 0,
                precioVenta: parseFloat(formData.get('precio-venta')) || 0,
                existencia: parseInt(formData.get('existencia')) || 0,
                stockMinimo: parseInt(formData.get('stock-minimo')) || 0,
                creditoFiscal: document.getElementById('credito-fiscal').checked,
                proveedor: (formData.get('proveedor') || '').trim(),
                categoria: (formData.get('categoria') || '').trim(),
                fechaCreacion: new Date().toISOString(),
                fechaActualizacion: new Date().toISOString()
            };

            // Validar campos requeridos
            if (!producto.descInventario || !producto.descFactura) {
                this.mostrarError('Las descripciones son obligatorias');
                return;
            }

            // Validar duplicados si tiene cÃ³digo
            if (producto.codigo) {
                const existe = this.productos.some(p => p.codigo === producto.codigo);
                if (existe) {
                    this.mostrarError('Ya existe un producto con este cÃ³digo');
                    return;
                }
            }

            console.log("ðŸ’¾ Guardando producto en Firebase:", producto);

            // Guardar en Firebase
            const docRef = await addDoc(collection(db, "inventario"), producto);
            console.log("âœ… Producto guardado con ID:", docRef.id);

            // Actualizar lista local
            producto.id = docRef.id;
            this.productos.push(producto);

            this.mostrarExito('Producto agregado correctamente');
            document.getElementById('form-nuevo-producto').reset();
            document.getElementById('credito-fiscal').checked = true;
            this.mostrarProductos();

        } catch (error) {
            console.error('âŒ Error guardando producto en Firebase:', error);
            this.mostrarError('Error al guardar el producto: ' + error.message);
        }
    }

    async editarProducto(id) {
        try {
            console.log("âœï¸ Editando producto:", id);
            const producto = this.productos.find(p => p.id === id);
            if (!producto) {
                this.mostrarError('Producto no encontrado');
                return;
            }

            // Llenar formulario de ediciÃ³n
            document.getElementById('edit-id').value = producto.id;
            document.getElementById('edit-codigo').value = producto.codigo || '';
            document.getElementById('edit-codigos-proveedor').value = producto.codigosProveedor || '';
            document.getElementById('edit-desc-inventario').value = producto.descInventario;
            document.getElementById('edit-desc-factura').value = producto.descFactura;
            document.getElementById('edit-precio-costo').value = producto.precioCosto;
            document.getElementById('edit-precio-venta').value = producto.precioVenta;
            document.getElementById('edit-existencia').value = producto.existencia;
            document.getElementById('edit-stock-minimo').value = producto.stockMinimo || 0;
            document.getElementById('edit-credito-fiscal').checked = producto.creditoFiscal !== false;
            document.getElementById('edit-proveedor').value = producto.proveedor || '';

            // Mostrar modal
            document.getElementById('modalEditarProducto').style.display = 'flex';

        } catch (error) {
            console.error('âŒ Error editando producto:', error);
            this.mostrarError('Error al cargar producto para editar');
        }
    }

    async actualizarProducto() {
        try {
            const id = document.getElementById('edit-id').value;
            const formData = new FormData(document.getElementById('form-editar-producto'));

            const updates = {
                codigo: (formData.get('edit-codigo') || '').trim(),
                codigosProveedor: (formData.get('edit-codigos-proveedor') || '').trim(),
                descInventario: formData.get('edit-desc-inventario').trim(),
                descFactura: formData.get('edit-desc-factura').trim(),
                precioCosto: parseFloat(formData.get('edit-precio-costo')) || 0,
                precioVenta: parseFloat(formData.get('edit-precio-venta')) || 0,
                existencia: parseInt(formData.get('edit-existencia')) || 0,
                stockMinimo: parseInt(formData.get('edit-stock-minimo')) || 0,
                creditoFiscal: document.getElementById('edit-credito-fiscal').checked,
                proveedor: (formData.get('edit-proveedor') || '').trim(),
                fechaActualizacion: new Date().toISOString()
            };

            console.log("ðŸ”„ Actualizando producto en Firebase:", id, updates);

            // Validar campos requeridos
            if (!updates.descInventario || !updates.descFactura) {
                this.mostrarError('Las descripciones son obligatorias');
                return;
            }

            // Actualizar en Firebase
            const productoRef = doc(db, "inventario", id);
            await updateDoc(productoRef, updates);

            // Actualizar en lista local
            const index = this.productos.findIndex(p => p.id === id);
            if (index !== -1) {
                this.productos[index] = { ...this.productos[index], ...updates };
                console.log("âœ… Producto actualizado en Ã­ndice:", index);
            }

            this.mostrarExito('Producto actualizado correctamente');
            this.cerrarModalEditar();
            this.mostrarProductos();

        } catch (error) {
            console.error('âŒ Error actualizando producto en Firebase:', error);
            this.mostrarError('Error al actualizar el producto: ' + error.message);
        }
    }

    async eliminarProducto(id) {
        try {
            console.log("ðŸ—‘ï¸ Intentando eliminar producto:", id);

            // Verificar que el producto existe
            const producto = this.productos.find(p => p.id === id);
            if (!producto) {
                console.error("âŒ Producto no encontrado para eliminar:", id);
                this.mostrarError('Producto no encontrado');
                return;
            }

            const nombreProducto = producto.descInventario || 'Producto';
            const confirmacion = confirm(`Â¿EstÃ¡s seguro de que quieres eliminar "${nombreProducto}"?\n\nEsta acciÃ³n no se puede deshacer.`);

            if (!confirmacion) {
                console.log("âŒ EliminaciÃ³n cancelada por el usuario");
                return;
            }

            console.log("âœ… ConfirmaciÃ³n recibida, eliminando producto de Firebase...");

            // Eliminar de Firebase
            await deleteDoc(doc(db, "inventario", id));

            // Eliminar de lista local
            this.productos = this.productos.filter(p => p.id !== id);

            this.mostrarExito(`"${nombreProducto}" eliminado correctamente`);
            this.mostrarProductos();
            console.log("âœ… Producto eliminado exitosamente de Firebase");

        } catch (error) {
            console.error('âŒ Error eliminando producto de Firebase:', error);
            this.mostrarError('Error al eliminar el producto: ' + error.message);
        }
    }

    // ========== GESTIÃ“N DE EXCEL ==========
    procesarArchivoExcel(file) {
        try {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    console.log("ðŸ“Š Procesando archivo Excel...");
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    // Tomar la primera hoja
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];

                    // Convertir a JSON manteniendo celdas vacÃ­as
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                        header: 1,
                        defval: "",
                        blankrows: true
                    });

                    console.log("ðŸ“‹ Datos procesados del Excel:", jsonData);
                    this.mostrarPreviewExcel(jsonData);

                } catch (error) {
                    console.error('âŒ Error procesando Excel:', error);
                    this.mostrarError('Error al procesar el archivo Excel: ' + error.message);
                }
            };

            reader.onerror = () => {
                this.mostrarError('Error al leer el archivo');
            };

            reader.readAsArrayBuffer(file);
        } catch (error) {
            console.error("Error en procesarArchivoExcel:", error);
        }
    }

    mostrarPreviewExcel(data) {
        try {
            const preview = document.getElementById('excel-preview');
            const previewContent = document.getElementById('excel-preview-content');
            const advertenciasDiv = document.getElementById('excel-advertencias');

            if (!preview || !previewContent) {
                console.error("âŒ Elementos de preview no encontrados");
                return;
            }

            // Limitar a 10 filas para preview
            const previewData = data.slice(0, 11);
            this.datosExcel = data;

            let html = '<table style="width:100%; border-collapse:collapse; font-size:12px;">';
            let productosSinCodigo = 0;
            let advertenciasHTML = '';

            previewData.forEach((fila, index) => {
                html += '<tr>';

                // Procesar cada celda manteniendo la posiciÃ³n correcta
                for (let i = 0; i < Math.max(fila.length, 7); i++) {
                    const celda = fila[i] !== undefined ? fila[i] : '';

                    if (index === 0) {
                        // Encabezados
                        const encabezados = ['CÃ³digo', 'DescripciÃ³n Inventario', 'DescripciÃ³n Factura', 'Precio Costo', 'Precio Venta', 'Existencia', 'CrÃ©dito Fiscal'];
                        html += `<th style="border:1px solid #ddd; padding:5px; background:#f2f2f2;">${encabezados[i] || `Col ${i + 1}`}</th>`;
                    } else {
                        // Datos - RESPETAR CELDAS VACÃAS
                        const estilo = i === 0 && !celda ? 'background:#fff3cd; color:#856404; font-style:italic;' : '';
                        let displayCelda = celda === '' ? '<span style="color:#999; font-style:italic;">vacÃ­o</span>' : celda;

                        // Formatear precios con signo de dÃ³lar
                        if (i === 3 || i === 4) {
                            const valor = this.parseNumero(celda);
                            displayCelda = valor > 0 ? `$${valor.toFixed(2)}` : displayCelda;
                        }

                        // Formatear crÃ©dito fiscal - CORREGIDO: Por defecto SI
                        if (i === 6) {
                            if (celda === '' || celda === undefined || celda === null) {
                                // Si estÃ¡ vacÃ­o, mostrar SI por defecto
                                displayCelda = '<span style="color:#27ae60; font-weight:bold;">SI (por defecto)</span>';
                            } else {
                                const creditoStr = celda.toString().trim().toUpperCase();
                                displayCelda = (creditoStr === 'SI' || creditoStr === 'TRUE' || creditoStr === '1' || creditoStr === 'SÃ') ?
                                    '<span style="color:#27ae60; font-weight:bold;">SI</span>' :
                                    '<span style="color:#e74c3c; font-weight:bold;">NO</span>';
                            }
                        }

                        html += `<td style="border:1px solid #ddd; padding:5px; ${estilo}">${displayCelda}</td>`;

                        // Contar productos sin cÃ³digo
                        if (i === 0 && index > 0 && !celda) {
                            productosSinCodigo++;
                        }
                    }
                }
                html += '</tr>';
            });

            html += '</table>';

            if (data.length > 10) {
                html += `<p style="color:#666; margin-top:10px;">... y ${data.length - 10} filas mÃ¡s</p>`;
            }

            // Mostrar advertencias sobre productos sin cÃ³digo
            if (productosSinCodigo > 0) {
                advertenciasHTML = `
                    <div class="excel-advertencia">
                        <i class="fas fa-exclamation-triangle"></i>
                        <strong>Nota:</strong> Se encontraron ${productosSinCodigo} productos sin cÃ³digo. 
                        Se mantendrÃ¡n <strong>VACÃOS</strong> exactamente como en el archivo Excel.
                    </div>
                `;
            }

            // Agregar advertencia sobre crÃ©dito fiscal por defecto
            advertenciasHTML += `
                <div class="excel-advertencia">
                    <i class="fas fa-info-circle"></i>
                    <strong>InformaciÃ³n:</strong> Los productos sin valor en "CrÃ©dito Fiscal" se cargarÃ¡n como <strong>SI</strong> por defecto.
                </div>
            `;

            advertenciasDiv.innerHTML = advertenciasHTML;
            previewContent.innerHTML = html;
            preview.style.display = 'block';

        } catch (error) {
            console.error("Error en mostrarPreviewExcel:", error);
        }
    }

    async confirmarCargaExcel() {
        try {
            if (this.datosExcel.length < 2) {
                this.mostrarError('El archivo no contiene datos vÃ¡lidos');
                return;
            }

            const datos = this.datosExcel.slice(1); // Excluir encabezados

            let productosCargados = 0;
            let productosActualizados = 0;
            let productosSinCodigo = 0;
            let errores = 0;

            for (const fila of datos) {
                if (fila.length === 0 || !fila[1]) continue; // Saltar filas vacÃ­as o sin descripciÃ³n

                try {
                    // [0: CÃ³digo, 1: DescripciÃ³n Inventario, 2: DescripciÃ³n Factura, 3: Precio Costo, 4: Precio Venta, 5: Existencia, 6: CrÃ©dito Fiscal]
                    const codigo = fila[0]?.toString().trim() || ''; // RESPETAR VACÃOS
                    const descInventario = fila[1]?.toString().trim() || '';
                    const descFactura = fila[2]?.toString().trim() || descInventario;

                    if (!descInventario) {
                        continue; // Saltar si no hay descripciÃ³n inventario
                    }

                    // Contar productos sin cÃ³digo
                    if (!codigo) {
                        productosSinCodigo++;
                    }

                    // CORREGIDO: Determinar crÃ©dito fiscal - POR DEFECTO SI
                    let creditoFiscal = true; // VALOR POR DEFECTO: SI
                    if (fila[6] !== undefined && fila[6] !== null && fila[6] !== '') {
                        const creditoStr = fila[6]?.toString().trim().toUpperCase();
                        // Solo cambiar a NO si explÃ­citamente dice "NO"
                        creditoFiscal = !(creditoStr === 'NO' || creditoStr === 'FALSE' || creditoStr === '0');
                    }

                    const productoData = {
                        codigo: codigo, // Mantener vacÃ­o si viene vacÃ­o
                        descInventario: descInventario,
                        descFactura: descFactura,
                        precioCosto: this.parseNumero(fila[3]) || 0,
                        precioVenta: this.parseNumero(fila[4]) || 0,
                        existencia: this.parseNumero(fila[5], true) || 0,
                        stockMinimo: this.parseNumero(fila[6], true) || 0,
                        creditoFiscal: creditoFiscal, // SIEMPRE SI por defecto
                        proveedor: (fila[7]?.toString().trim() || ''),
                        fechaCreacion: new Date().toISOString(),
                        fechaActualizacion: new Date().toISOString()
                    };

                    // Buscar producto existente
                    let productoExistente = null;
                    if (codigo) {
                        // Buscar por cÃ³digo
                        productoExistente = this.productos.find(p => p.codigo === productoData.codigo);
                    } else {
                        // Buscar por descripciÃ³n (solo para productos sin cÃ³digo)
                        productoExistente = this.productos.find(p =>
                            !p.codigo && p.descInventario.toLowerCase() === descInventario.toLowerCase()
                        );
                    }

                    if (productoExistente) {
                        // Actualizar producto existente en Firebase
                        const productoRef = doc(db, "inventario", productoExistente.id);
                        await updateDoc(productoRef, {
                            ...productoData,
                            fechaActualizacion: new Date().toISOString()
                        });

                        // Actualizar en lista local
                        const index = this.productos.findIndex(p => p.id === productoExistente.id);
                        if (index !== -1) {
                            this.productos[index] = { ...this.productos[index], ...productoData };
                        }
                        productosActualizados++;
                    } else {
                        // Crear nuevo producto en Firebase
                        const docRef = await addDoc(collection(db, "inventario"), productoData);

                        // Agregar a lista local
                        productoData.id = docRef.id;
                        this.productos.push(productoData);
                        productosCargados++;
                    }

                } catch (error) {
                    console.error('âŒ Error procesando fila:', fila, error);
                    errores++;
                }
            }

            let mensaje = `Carga completada: ${productosCargados} nuevos, ${productosActualizados} actualizados`;
            if (productosSinCodigo > 0) {
                mensaje += `, ${productosSinCodigo} sin cÃ³digo (mantenidos vacÃ­os)`;
            }
            if (errores > 0) {
                mensaje += `, ${errores} errores`;
            }

            this.mostrarExito(mensaje);

            document.getElementById('excel-preview').style.display = 'none';
            this.datosExcel = [];
            this.mostrarProductos();

        } catch (error) {
            console.error('âŒ Error en carga masiva:', error);
            this.mostrarError('Error durante la carga masiva: ' + error.message);
        }
    }

    parseNumero(valor, esEntero = false) {
        if (valor === null || valor === undefined || valor === '') return 0;

        // Si ya es nÃºmero, retornarlo
        if (typeof valor === 'number') return esEntero ? Math.round(valor) : valor;

        let strValor = valor.toString().trim();
        if (strValor === '') return 0;

        // Limpiar caracteres no numÃ©ricos excepto punto decimal y signo negativo
        strValor = strValor.replace(/[^\d.-]/g, '');

        const numero = parseFloat(strValor);
        if (isNaN(numero)) return 0;

        return esEntero ? Math.round(numero) : numero;
    }

    descargarPlantillaExcel() {
        try {
            const plantilla = [
                ['CÃ³digo', 'DescripciÃ³n Inventario', 'DescripciÃ³n Factura', 'Precio Costo', 'Precio Venta', 'Existencia', 'CrÃ©dito Fiscal', 'Proveedor'],
                ['TM001', 'Tulio Rin Ancho 2 Pulgadas', 'TULIO RIN ANCHO DE DOS PULGADAS', '18.40', '25.00', '50', 'SI', 'Todo Motor'],
                ['TM002', 'Cadena 7 Velocidades', 'CADENA 7V', '8.50', '12.00', '30', 'SI', 'Todo Motor'],
                ['', 'Producto sin cÃ³digo', 'PRODUCTO SIN CÃ“DIGO', '15.00', '20.00', '25', 'SI', 'Proveedor X']
            ];

            const worksheet = XLSX.utils.aoa_to_sheet(plantilla);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla Inventario');

            XLSX.writeFile(workbook, 'plantilla_inventario.xlsx');
            this.mostrarExito('Plantilla descargada correctamente');
        } catch (error) {
            console.error("âŒ Error en descargarPlantillaExcel:", error);
            this.mostrarError('Error al descargar la plantilla');
        }
    }

    // ========== REPORTES ==========
    async generarReporte() {
        try {
            const tipoReporte = document.getElementById('tipo-reporte').value;
            let contenido = '';

            switch (tipoReporte) {
                case 'stock':
                    contenido = this.generarReporteStock();
                    break;
                case 'bajo-stock':
                    contenido = this.generarReporteBajoStock();
                    break;
                case 'valorizacion':
                    contenido = this.generarReporteValorizacion();
                    break;
                case 'sin-codigo':
                    contenido = this.generarReporteSinCodigo();
                    break;
            }

            const reporteContenido = document.getElementById('reporte-contenido');
            if (reporteContenido) {
                reporteContenido.innerHTML = contenido;
                reporteContenido.style.display = 'block';
            }
        } catch (error) {
            console.error("Error en generarReporte:", error);
        }
    }

    generarReporteStock() {
        let html = `
            <h4 style="margin:10px; color:#2c3e50;">Reporte de Stock Actual</h4>
            <table class="inventario-table">
                <thead>
                    <tr>
                        <th>CÃ³digo</th>
                        <th>DescripciÃ³n Inventario</th>
                        <th>DescripciÃ³n Factura</th>
                        <th>Existencia</th>
                        <th>Stock MÃ­nimo</th>
                        <th>Estado</th>
                        <th>CrÃ©dito Fiscal</th>
                        <th>Proveedor</th>
                    </tr>
                </thead>
                <tbody>
        `;

        this.productos.forEach(producto => {
            const estado = this.obtenerEstadoStock(producto.existencia, producto.stockMinimo);
            const clase = this.obtenerClaseStock(producto.existencia, producto.stockMinimo);
            const claseCodigo = !producto.codigo ? 'codigo-vacio' : '';
            const codigoDisplay = producto.codigo || 'SIN CÃ“DIGO';
            const creditoFiscal = producto.creditoFiscal !== false ? 'SI' : 'NO';
            const claseCredito = producto.creditoFiscal !== false ? 'credito-si' : 'credito-no';

            html += `
                <tr>
                    <td class="${claseCodigo}">${codigoDisplay}</td>
                    <td>${producto.descInventario}</td>
                    <td>${producto.descFactura}</td>
                    <td class="${clase}">${producto.existencia}</td>
                    <td>${producto.stockMinimo || 0}</td>
                    <td>${estado}</td>
                    <td><span class="${claseCredito}">${creditoFiscal}</span></td>
                    <td>${producto.proveedor || ''}</td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        return html;
    }

    generarReporteBajoStock() {
        const productosBajoStock = this.productos.filter(producto =>
            producto.stockMinimo && producto.existencia <= producto.stockMinimo
        );

        if (productosBajoStock.length === 0) {
            return '<div class="empty-cart">No hay productos con stock bajo</div>';
        }

        let html = `
            <h4 style="margin:10px; color:#e74c3c;">Productos con Stock Bajo/CrÃ­tico</h4>
            <table class="inventario-table">
                <thead>
                    <tr>
                        <th>CÃ³digo</th>
                        <th>DescripciÃ³n Inventario</th>
                        <th>DescripciÃ³n Factura</th>
                        <th>Existencia</th>
                        <th>Stock MÃ­nimo</th>
                        <th>Diferencia</th>
                        <th>Estado</th>
                    </tr>
                </thead>
                <tbody>
        `;

        productosBajoStock.forEach(producto => {
            const diferencia = producto.existencia - producto.stockMinimo;
            const estado = this.obtenerEstadoStock(producto.existencia, producto.stockMinimo);
            const clase = this.obtenerClaseStock(producto.existencia, producto.stockMinimo);
            const claseCodigo = !producto.codigo ? 'codigo-vacio' : '';
            const codigoDisplay = producto.codigo || 'SIN CÃ“DIGO';

            html += `
                <tr>
                    <td class="${claseCodigo}">${codigoDisplay}</td>
                    <td>${producto.descInventario}</td>
                    <td>${producto.descFactura}</td>
                    <td class="${clase}">${producto.existencia}</td>
                    <td>${producto.stockMinimo}</td>
                    <td>${diferencia}</td>
                    <td>${estado}</td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        return html;
    }

    generarReporteSinCodigo() {
        const productosSinCodigo = this.productos.filter(producto => !producto.codigo);

        if (productosSinCodigo.length === 0) {
            return '<div class="empty-cart">No hay productos sin cÃ³digo</div>';
        }

        let html = `
            <h4 style="margin:10px; color:#856404;">Productos sin CÃ³digo</h4>
            <table class="inventario-table">
                <thead>
                    <tr>
                        <th>DescripciÃ³n Inventario</th>
                        <th>DescripciÃ³n Factura</th>
                        <th>Precio Costo</th>
                        <th>Precio Venta</th>
                        <th>Existencia</th>
                        <th>CrÃ©dito Fiscal</th>
                        <th>Proveedor</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
        `;

        productosSinCodigo.forEach(producto => {
            const creditoFiscal = producto.creditoFiscal !== false ? 'SI' : 'NO';
            const claseCredito = producto.creditoFiscal !== false ? 'credito-si' : 'credito-no';

            html += `
                <tr>
                    <td>${producto.descInventario}</td>
                    <td>${producto.descFactura}</td>
                    <td class="precio">$${producto.precioCosto?.toFixed(2) || '0.00'}</td>
                    <td class="precio">$${producto.precioVenta?.toFixed(2) || '0.00'}</td>
                    <td>${producto.existencia}</td>
                    <td><span class="${claseCredito}">${creditoFiscal}</span></td>
                    <td>${producto.proveedor || ''}</td>
                    <td>
                        <button class="icon-btn btn-edit" onclick="inventario.editarProducto('${producto.id}')" title="Agregar cÃ³digo">
                            <i class="fas fa-edit"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        return html;
    }

    generarReporteValorizacion() {
        const totalValorizacion = this.productos.reduce((sum, producto) =>
            sum + (producto.existencia * producto.precioCosto), 0
        );

        const totalValorVenta = this.productos.reduce((sum, producto) =>
            sum + (producto.existencia * producto.precioVenta), 0
        );

        let html = `
            <h4 style="margin:10px; color:#27ae60;">ValorizaciÃ³n de Inventario</h4>
            <div style="padding:15px; background:#f8f9fa;border-radius:6px; margin-bottom:15px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <strong>Valor total en costo:</strong>
                    <span style="color:#2c3e50; font-weight:bold;">$${totalValorizacion.toFixed(2)}</span>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <strong>Valor total en venta:</strong>
                    <span style="color:#27ae60; font-weight:bold;">$${totalValorVenta.toFixed(2)}</span>
                </div>
            </div>
            <table class="inventario-table">
                <thead>
                    <tr>
                        <th>CÃ³digo</th>
                        <th>DescripciÃ³n Inventario</th>
                        <th>DescripciÃ³n Factura</th>
                        <th>Existencia</th>
                        <th>Costo Unit.</th>
                        <th>Valor en Costo</th>
                        <th>Precio Venta</th>
                        <th>Valor en Venta</th>
                    </tr>
                </thead>
                <tbody>
        `;

        this.productos.forEach(producto => {
            const valorCosto = producto.existencia * producto.precioCosto;
            const valorVenta = producto.existencia * producto.precioVenta;
            const claseCodigo = !producto.codigo ? 'codigo-vacio' : '';
            const codigoDisplay = producto.codigo || 'SIN CÃ“DIGO';

            html += `
                <tr>
                    <td class="${claseCodigo}">${codigoDisplay}</td>
                    <td>${producto.descInventario}</td>
                    <td>${producto.descFactura}</td>
                    <td>${producto.existencia}</td>
                    <td class="precio">$${producto.precioCosto.toFixed(2)}</td>
                    <td class="precio">$${valorCosto.toFixed(2)}</td>
                    <td class="precio">$${producto.precioVenta.toFixed(2)}</td>
                    <td class="precio">$${valorVenta.toFixed(2)}</td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        return html;
    }

    obtenerEstadoStock(existencia, stockMinimo) {
        if (!stockMinimo) return 'Sin mÃ­nimo';
        if (existencia <= 0) return 'AGOTADO';
        if (existencia <= stockMinimo) return 'BAJO STOCK';
        return 'NORMAL';
    }

    imprimirReporte() {
        try {
            const contenido = document.getElementById('reporte-contenido').innerHTML;
            const ventana = window.open('', '_blank', 'width=800,height=600');

            ventana.document.write(`
                <html>
                    <head>
                        <title>Reporte de Inventario - Taller Wilian</title>
                        <style>
                            body { font-family: Arial, sans-serif; margin: 20px; }
                            table { width: 100%; border-collapse: collapse; }
                            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                            th { background-color: #2c3e50; color: white; }
                            .stock-bajo { background-color: #fff3cd; }
                            .stock-critico { background-color: #f8d7da; }
                            .codigo-vacio { background-color: #fff3cd; color: #856404; font-style: italic; }
                            .precio { color: #27ae60; font-weight: bold; }
                            .credito-si { background-color: #d4edda; color: #155724; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; }
                            .credito-no { background-color: #f8d7da; color: #721c24; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; }
                            @media print { body { margin: 0; } }
                        </style>
                    </head>
                    <body>
                        <h1>Taller Wilian - Reporte de Inventario</h1>
                        <p>Generado: ${new Date().toLocaleString()}</p>
                        ${contenido}
                    </body>
                </html>
            `);

            ventana.document.close();
            ventana.print();
        } catch (error) {
            console.error("Error en imprimirReporte:", error);
        }
    }

    // ========== UTILIDADES ==========
    cerrarModalEditar() {
        try {
            document.getElementById('modalEditarProducto').style.display = 'none';
        } catch (error) {
            console.error("Error en cerrarModalEditar:", error);
        }
    }

    mostrarExito(mensaje) {
        alert(`âœ… ${mensaje}`);
    }

    mostrarError(mensaje) {
        alert(`âŒ ${mensaje}`);
    }

    // ========== EDICIÃ“N RÃPIDA (MODO EXCEL) ==========
    async guardarCambioRapido(id, campo, valor) {
        try {
            console.log(`ðŸ“ Cambio rÃ¡pido: ${id} - ${campo} = ${valor}`);

            let valorFinal = valor;
            if (campo === 'precioCosto' || campo === 'precioVenta') valorFinal = parseFloat(valor) || 0;
            if (campo === 'existencia' || campo === 'stockMinimo') valorFinal = parseInt(valor) || 0;

            const productoRef = doc(db, "inventario", id);
            await updateDoc(productoRef, {
                [campo]: valorFinal,
                fechaActualizacion: new Date().toISOString()
            });

            // Actualizar localmente
            const index = this.productos.findIndex(p => p.id === id);
            if (index !== -1) {
                this.productos[index][campo] = valorFinal;
            }

            console.log("âœ… Cambio guardado");
        } catch (error) {
            console.error("âŒ Error guardando cambio rÃ¡pido:", error);
            this.mostrarError("Error al guardar el cambio");
        }
    }

    // ========== MOVIMIENTOS DE INVENTARIO ==========
    setupEventListeners() {
        // ... (listeners anteriores se mantienen si no se sobrescriben, pero aquÃ­ agrego los nuevos)
        // Re-implementing setupEventListeners to include new ones without losing old ones would be cleaner if I could edit the whole method.
        // But since I am appending/replacing the end, I will add a specific setup method for new features and call it in init.

        // This part is tricky with replace_file_content if I can't see the original setupEventListeners.
        // I will assume the original setupEventListeners is already called in init.
        // I will add a new method setupNewFeatures and call it from init? No, init is already defined.
        // I will add the listeners dynamically in the init or constructor?
        // Better: I will add a method 'setupNuevasFunciones' and call it manually at the end of the file after instantiation.
    }

    setupNuevasFunciones() {
        // Registrar Movimiento
        const btnMov = document.getElementById('registrar-movimiento-btn');
        if (btnMov) {
            btnMov.addEventListener('click', () => {
                document.getElementById('modalRegistrarMovimiento').style.display = 'flex';
                this.cargarBusquedaMovimiento();
            });
        }

        const formMov = document.getElementById('form-movimiento');
        if (formMov) {
            formMov.addEventListener('submit', (e) => {
                e.preventDefault();
                this.registrarMovimiento();
            });
        }

        // Escanear Pedido
        const btnScan = document.getElementById('escanear-pedido-btn');
        if (btnScan) {
            btnScan.addEventListener('click', () => {
                document.getElementById('modalEscanearPedido').style.display = 'flex';
                this.iniciarEscaner();
            });
        }

        // Busqueda en movimiento
        const inputBusqueda = document.getElementById('mov-producto-busqueda');
        if (inputBusqueda) {
            inputBusqueda.addEventListener('input', (e) => this.buscarProductoMovimiento(e.target.value));
        }
    }

    cargarBusquedaMovimiento() {
        document.getElementById('mov-producto-busqueda').value = '';
        document.getElementById('mov-producto-id').value = '';
        document.getElementById('mov-producto-nombre').value = '';
        document.getElementById('mov-cantidad').value = '';
        document.getElementById('mov-referencia').value = '';
        document.getElementById('mov-resultados-busqueda').style.display = 'none';
    }

    buscarProductoMovimiento(termino) {
        const resultadosDiv = document.getElementById('mov-resultados-busqueda');
        if (!termino || termino.length < 2) {
            resultadosDiv.style.display = 'none';
            return;
        }

        const terminoLower = termino.toLowerCase();
        const resultados = this.productos.filter(p =>
            (p.codigo && p.codigo.toLowerCase().includes(terminoLower)) ||
            p.descInventario.toLowerCase().includes(terminoLower)
        ).slice(0, 10);

        if (resultados.length > 0) {
            resultadosDiv.innerHTML = resultados.map(p => `
                <div style="padding: 8px; cursor: pointer; border-bottom: 1px solid #eee;" 
                     onclick="inventario.seleccionarProductoMovimiento('${p.id}', '${p.descInventario}')">
                    <strong>${p.codigo || 'S/C'}</strong> - ${p.descInventario} (Stock: ${p.existencia})
                </div>
            `).join('');
            resultadosDiv.style.display = 'block';
        } else {
            resultadosDiv.style.display = 'none';
        }
    }

    seleccionarProductoMovimiento(id, nombre) {
        document.getElementById('mov-producto-id').value = id;
        document.getElementById('mov-producto-nombre').value = nombre;
        document.getElementById('mov-resultados-busqueda').style.display = 'none';
        document.getElementById('mov-producto-busqueda').value = '';
    }

    async registrarMovimiento() {
        try {
            const id = document.getElementById('mov-producto-id').value;
            const tipo = document.getElementById('mov-tipo').value;
            const cantidad = parseInt(document.getElementById('mov-cantidad').value);
            const referencia = document.getElementById('mov-referencia').value;

            if (!id) {
                this.mostrarError('Debes seleccionar un producto');
                return;
            }

            const producto = this.productos.find(p => p.id === id);
            if (!producto) return;

            let nuevaExistencia = producto.existencia;
            if (tipo === 'entrada') {
                nuevaExistencia += cantidad;
            } else {
                nuevaExistencia -= cantidad;
            }

            // Actualizar Firebase
            await updateDoc(doc(db, "inventario", id), {
                existencia: nuevaExistencia,
                fechaActualizacion: new Date().toISOString()
            });

            // Registrar en historial
            await this.registrarHistorial(
                tipo.toUpperCase(),
                `Movimiento manual - Ref: ${referencia}`,
                [{
                    id: producto.id,
                    nombre: producto.descInventario,
                    cantidad: cantidad,
                    anterior: producto.existencia,
                    nuevo: nuevaExistencia
                }]
            );

            // Actualizar local
            producto.existencia = nuevaExistencia;

            this.mostrarExito('Movimiento registrado correctamente');
            document.getElementById('modalRegistrarMovimiento').style.display = 'none';
            this.mostrarProductos();

        } catch (error) {
            console.error("Error en registrarMovimiento:", error);
            this.mostrarError("Error al registrar movimiento");
        }
    }

    // ========== ESCÃNER DE CÃ“DIGO DE BARRAS ==========
    // ========== ESCÁNER DE CÓDIGO DE BARRAS (FLUJO DE COMPRAS) ==========
    iniciarEscaner() {
        // Paso 1: Abrir configuración de compra
        document.getElementById('modalEscanearPedido').style.display = 'none';
        document.getElementById('modalConfigCompra').style.display = 'flex';

        // Resetear variables de sesión
        this.sesionCompra = {
            proveedor: '',
            creditoFiscal: true
        };

        // Configurar listener para el formulario de inicio
        const formConfig = document.getElementById('form-config-compra');
        // Clonar para eliminar listeners anteriores
        const newForm = formConfig.cloneNode(true);
        formConfig.parentNode.replaceChild(newForm, formConfig);

        newForm.onsubmit = (e) => {
            e.preventDefault();
            this.sesionCompra.proveedor = document.getElementById('compra-proveedor').value;
            this.sesionCompra.creditoFiscal = document.getElementById('compra-credito-fiscal').checked;

            document.getElementById('modalConfigCompra').style.display = 'none';
            document.getElementById('modalEscanearPedido').style.display = 'flex';

            this.iniciarCamara();
        };
    }

    iniciarCamara() {
        if (this.html5QrcodeScanner) return;

        this.pedidoActual = [];
        this.actualizarTablaPedido();

        const onScanSuccess = (decodedText, decodedResult) => {
            console.log(`Code matched = ${decodedText}`, decodedResult);
            this.html5QrcodeScanner.pause();
            this.procesarCodigoEscaneado(decodedText);
        };

        const onScanFailure = (error) => { };

        this.html5QrcodeScanner = new Html5Qrcode("reader");
        const config = {
            fps: 25,
            qrbox: { width: 280, height: 150 },
            aspectRatio: 1.0,
            formatsToSupport: [
                Html5QrcodeSupportedFormats.QR_CODE,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39,
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.UPC_A
            ],
            experimentalFeatures: { useBarCodeDetectorIfSupported: true }
        };

        this.html5QrcodeScanner.start(
            { facingMode: "environment" },
            config,
            onScanSuccess,
            onScanFailure
        ).catch(err => {
            console.error("Error iniciando cámara", err);
            this.mostrarError("No se pudo acceder a la cámara");
        });

        // Configurar botones de cancelar
        const btnCancelExistente = document.getElementById('btn-cancelar-existente');
        if (btnCancelExistente) {
            btnCancelExistente.onclick = () => {
                document.getElementById('modalProductoExistente').style.display = 'none';
                this.html5QrcodeScanner.resume();
            };
        }

        const btnCancelNuevo = document.getElementById('btn-cancelar-nuevo');
        if (btnCancelNuevo) {
            btnCancelNuevo.onclick = () => {
                document.getElementById('modalProductoNuevo').style.display = 'none';
                this.html5QrcodeScanner.resume();
            };
        }

        const btnProcesar = document.getElementById('procesar-pedido-btn');
        if (btnProcesar) {
            btnProcesar.onclick = () => {
                this.procesarPedidoCompleto();
            };
        }
    }

    procesarCodigoEscaneado(codigo) {
        const producto = this.productos.find(p => p.codigo === codigo);

        if (producto) {
            // CASO A: Producto Existe
            const modal = document.getElementById('modalProductoExistente');
            document.getElementById('prod-existente-info').textContent = `${producto.descInventario} (Stock: ${producto.existencia})`;
            document.getElementById('prod-existente-cantidad').value = 1;
            document.getElementById('prod-existente-precio').value = producto.precioCosto || 0;

            modal.style.display = 'flex';
            document.getElementById('prod-existente-cantidad').focus();

            const form = document.getElementById('form-prod-existente');
            form.onsubmit = (e) => {
                e.preventDefault();
                const cantidad = parseInt(document.getElementById('prod-existente-cantidad').value);
                const costo = parseFloat(document.getElementById('prod-existente-precio').value);

                this.agregarAlPedido(producto, cantidad, costo, false);
                modal.style.display = 'none';
                this.html5QrcodeScanner.resume();
            };

        } else {
            // CASO B: Producto Nuevo
            const modal = document.getElementById('modalProductoNuevo');
            document.getElementById('prod-nuevo-codigo').textContent = codigo;
            document.getElementById('prod-nuevo-desc').value = '';
            document.getElementById('prod-nuevo-cantidad').value = 1;
            document.getElementById('prod-nuevo-precio').value = '';

            modal.style.display = 'flex';
            document.getElementById('prod-nuevo-desc').focus();

            const form = document.getElementById('form-prod-nuevo');
            form.onsubmit = (e) => {
                e.preventDefault();
                const desc = document.getElementById('prod-nuevo-desc').value;
                const cantidad = parseInt(document.getElementById('prod-nuevo-cantidad').value);
                const costo = parseFloat(document.getElementById('prod-nuevo-precio').value);

                const prodTemp = {
                    id: 'TEMP_' + Date.now(),
                    codigo: codigo,
                    descInventario: desc,
                    descFactura: desc,
                    existencia: 0,
                    esNuevo: true
                };

                this.agregarAlPedido(prodTemp, cantidad, costo, true);
                modal.style.display = 'none';
                this.html5QrcodeScanner.resume();
            };
        }
    }

    agregarAlPedido(producto, cantidad, costo, esNuevo) {
        this.pedidoActual.push({
            producto: producto,
            cantidad: cantidad,
            costo: costo,
            esNuevo: esNuevo,
            proveedor: this.sesionCompra.proveedor,
            creditoFiscal: this.sesionCompra.creditoFiscal
        });
        this.actualizarTablaPedido();
    }

    async procesarPedidoCompleto() {
        if (this.pedidoActual.length === 0) return;

        if (!confirm(¿Procesar entrada de  productos ?)) return;

        try {
            const itemsHistorial = [];

            for (const item of this.pedidoActual) {
                let productoId = item.producto.id;
                let nuevaExistencia = 0;

                if (item.esNuevo) {
                    // CREAR PRODUCTO NUEVO
                    const nuevoProducto = {
                        codigo: item.producto.codigo,
                        descInventario: item.producto.descInventario,
                        descFactura: item.producto.descFactura,
                        precioCosto: item.costo,
                        precioVenta: 0,
                        existencia: item.cantidad,
                        stockMinimo: 5,
                        creditoFiscal: item.creditoFiscal,
                        proveedor: item.proveedor,
                        fechaCreacion: new Date().toISOString()
                    };

                    const docRef = await addDoc(collection(db, "inventario"), nuevoProducto);
                    productoId = docRef.id;
                    nuevaExistencia = item.cantidad;

                    this.productos.push({ id: productoId, ...nuevoProducto });

                } else {
                    // ACTUALIZAR EXISTENTE
                    nuevaExistencia = (item.producto.existencia || 0) + item.cantidad;
                    await updateDoc(doc(db, "inventario", productoId), {
                        existencia: nuevaExistencia,
                        precioCosto: item.costo,
                        proveedor: item.proveedor || item.producto.proveedor,
                        fechaActualizacion: new Date().toISOString()
                    });

                    const pLocal = this.productos.find(p => p.id === productoId);
                    if (pLocal) {
                        pLocal.existencia = nuevaExistencia;
                        pLocal.precioCosto = item.costo;
                    }
                }

                itemsHistorial.push({
                    id: productoId,
                    nombre: item.producto.descInventario,
                    cantidad: item.cantidad,
                    costo: item.costo,
                    tipo: item.esNuevo ? 'NUEVO INGRESO' : 'REABASTECIMIENTO'
                });
            }

            await this.registrarHistorial(
                'COMPRA',
                `Entrada masiva (Prov: ${this.sesionCompra.proveedor || 'N/A'})`,
                itemsHistorial
            );

            this.mostrarExito("Compra procesada correctamente");
            this.pedidoActual = [];
            this.actualizarTablaPedido();
            document.getElementById('modalEscanearPedido').style.display = 'none';

            if (this.html5QrcodeScanner) {
                this.html5QrcodeScanner.stop().then(() => {
                    this.html5QrcodeScanner = null;
                });
            }
            this.mostrarProductos();

        } catch (error) {
            console.error("Error procesando pedido:", error);
            this.mostrarError("Error al procesar la compra");
        }
    }
}

// ========== INICIALIZACIÓN ==========
window.inventario = null;

document.addEventListener('DOMContentLoaded', async function () {
    console.log("🚀 DOM cargado, iniciando inventario...");

    if (!localStorage.getItem('usuarioLogueado')) {
        window.location.href = 'login.html';
        return;
    }

    try {
        window.inventario = new SistemaInventario();
        await window.inventario.init();
        window.inventario.setupNuevasFunciones();
        console.log("🎉 Inventario cargado exitosamente");
    } catch (error) {
        console.error("💥 Error crítico al cargar inventario:", error);
    }
});

window.cerrarModalEditar = () => {
    if (window.inventario) window.inventario.cerrarModalEditar();
};
