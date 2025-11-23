// inventario.js - Sistema completo de inventario con Firebase
console.log("✅ inventario.js cargando...");

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
        console.log("✅ SistemaInventario inicializado con Firebase");
    }

    async init() {
        try {
            console.log("🚀 Iniciando sistema de inventario...");
            this.setupMenuMobile();
            this.setupTabs();
            await this.cargarProductos();
            this.setupEventListeners();
            console.log("✅ Sistema de inventario listo");
        } catch (error) {
            console.error("❌ Error al iniciar:", error);
        }
    }

    // ========== CONFIGURACIÓN INICIAL ==========
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
            const tabButtons = document.querySelectorAll('.tab-btn');
            const tabContents = document.querySelectorAll('.tab-content');

            tabButtons.forEach(button => {
                button.addEventListener('click', () => {
                    const tabId = button.getAttribute('data-tab');
                    
                    // Remover activo de todos
                    tabButtons.forEach(btn => btn.classList.remove('active'));
                    tabContents.forEach(content => content.classList.remove('active'));
                    
                    // Activar actual
                    button.classList.add('active');
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
            // Búsqueda en tiempo real
            const buscarInput = document.getElementById('buscar-producto');
            if (buscarInput) {
                buscarInput.addEventListener('input', (e) => {
                    this.filtrarProductos(e.target.value);
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

    // ========== GESTIÓN DE EXCEL ==========
    setupExcelUpload() {
        try {
            const dropArea = document.getElementById('excel-drop-area');
            const fileInput = document.getElementById('excel-file');
            const preview = document.getElementById('excel-preview');

            if (!dropArea || !fileInput) {
                console.warn("❌ Elementos de Excel no encontrados");
                return;
            }

            // Click en área de drop
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
            console.log("📦 Cargando productos desde Firebase...");
            const tbody = document.getElementById('inventario-body');
            
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="9" class="empty-cart">
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

            console.log(`✅ ${this.productos.length} productos cargados desde Firebase`);
            this.mostrarProductos();
            
        } catch (error) {
            console.error("❌ Error cargando productos desde Firebase:", error);
            this.mostrarError("Error al cargar el inventario desde la base de datos");
        }
    }

    mostrarProductos(productosFiltrados = null) {
        try {
            const productos = productosFiltrados || this.productos;
            const tbody = document.getElementById('inventario-body');
            
            if (!tbody) {
                console.error("❌ No se encontró tbody#inventario-body");
                return;
            }
            
            if (productos.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="9" class="empty-cart">
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
                const codigoDisplay = producto.codigo || '<span style="color:#856404; font-style:italic;">SIN CÓDIGO</span>';

                return `
                    <tr>
                        <td class="${claseCodigo}"><strong>${codigoDisplay}</strong></td>
                        <td>${producto.descInventario}</td>
                        <td>${producto.descFactura}</td>
                        <td>$${producto.precioCosto?.toFixed(2) || '0.00'}</td>
                        <td>$${producto.precioVenta?.toFixed(2) || '0.00'}</td>
                        <td class="${claseStock}">${producto.existencia}</td>
                        <td>${producto.stockMinimo || 0}</td>
                        <td>${producto.proveedor || ''}</td>
                        <td>
                            <button class="icon-btn btn-edit" onclick="inventario.editarProducto('${producto.id}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="icon-btn btn-delete" onclick="inventario.eliminarProducto('${producto.id}')" title="Eliminar">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
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

            // Validar duplicados si tiene código
            if (producto.codigo) {
                const existe = this.productos.some(p => p.codigo === producto.codigo);
                if (existe) {
                    this.mostrarError('Ya existe un producto con este código');
                    return;
                }
            }

            console.log("💾 Guardando producto en Firebase:", producto);

            // Guardar en Firebase
            const docRef = await addDoc(collection(db, "inventario"), producto);
            console.log("✅ Producto guardado con ID:", docRef.id);

            // Actualizar lista local
            producto.id = docRef.id;
            this.productos.push(producto);
            
            this.mostrarExito('Producto agregado correctamente');
            document.getElementById('form-nuevo-producto').reset();
            this.mostrarProductos();
            
        } catch (error) {
            console.error('❌ Error guardando producto en Firebase:', error);
            this.mostrarError('Error al guardar el producto: ' + error.message);
        }
    }

    async editarProducto(id) {
        try {
            console.log("✏️ Editando producto:", id);
            const producto = this.productos.find(p => p.id === id);
            if (!producto) {
                this.mostrarError('Producto no encontrado');
                return;
            }

            // Llenar formulario de edición
            document.getElementById('edit-id').value = producto.id;
            document.getElementById('edit-codigo').value = producto.codigo || '';
            document.getElementById('edit-codigos-proveedor').value = producto.codigosProveedor || '';
            document.getElementById('edit-desc-inventario').value = producto.descInventario;
            document.getElementById('edit-desc-factura').value = producto.descFactura;
            document.getElementById('edit-precio-costo').value = producto.precioCosto;
            document.getElementById('edit-precio-venta').value = producto.precioVenta;
            document.getElementById('edit-existencia').value = producto.existencia;
            document.getElementById('edit-stock-minimo').value = producto.stockMinimo || 0;
            document.getElementById('edit-proveedor').value = producto.proveedor || '';

            // Mostrar modal
            document.getElementById('modalEditarProducto').style.display = 'flex';

        } catch (error) {
            console.error('❌ Error editando producto:', error);
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
                proveedor: (formData.get('edit-proveedor') || '').trim(),
                fechaActualizacion: new Date().toISOString()
            };

            console.log("🔄 Actualizando producto en Firebase:", id, updates);

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
                console.log("✅ Producto actualizado en índice:", index);
            }

            this.mostrarExito('Producto actualizado correctamente');
            this.cerrarModalEditar();
            this.mostrarProductos();

        } catch (error) {
            console.error('❌ Error actualizando producto en Firebase:', error);
            this.mostrarError('Error al actualizar el producto: ' + error.message);
        }
    }

    async eliminarProducto(id) {
        try {
            console.log("🗑️ Intentando eliminar producto:", id);
            
            // Verificar que el producto existe
            const producto = this.productos.find(p => p.id === id);
            if (!producto) {
                console.error("❌ Producto no encontrado para eliminar:", id);
                this.mostrarError('Producto no encontrado');
                return;
            }

            const nombreProducto = producto.descInventario || 'Producto';
            const confirmacion = confirm(`¿Estás seguro de que quieres eliminar "${nombreProducto}"?\n\nEsta acción no se puede deshacer.`);
            
            if (!confirmacion) {
                console.log("❌ Eliminación cancelada por el usuario");
                return;
            }

            console.log("✅ Confirmación recibida, eliminando producto de Firebase...");

            // Eliminar de Firebase
            await deleteDoc(doc(db, "inventario", id));

            // Eliminar de lista local
            this.productos = this.productos.filter(p => p.id !== id);

            this.mostrarExito(`"${nombreProducto}" eliminado correctamente`);
            this.mostrarProductos();
            console.log("✅ Producto eliminado exitosamente de Firebase");

        } catch (error) {
            console.error('❌ Error eliminando producto de Firebase:', error);
            this.mostrarError('Error al eliminar el producto: ' + error.message);
        }
    }

    // ========== GESTIÓN DE EXCEL ==========
    procesarArchivoExcel(file) {
        try {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    console.log("📊 Procesando archivo Excel...");
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    // Tomar la primera hoja
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    
                    // Convertir a JSON manteniendo celdas vacías
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                        header: 1, 
                        defval: "",
                        blankrows: true
                    });
                    
                    console.log("📋 Datos procesados del Excel:", jsonData);
                    this.mostrarPreviewExcel(jsonData);
                    
                } catch (error) {
                    console.error('❌ Error procesando Excel:', error);
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
                console.error("❌ Elementos de preview no encontrados");
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
                
                // Procesar cada celda manteniendo la posición correcta
                for (let i = 0; i < Math.max(fila.length, 5); i++) {
                    const celda = fila[i] !== undefined ? fila[i] : '';
                    
                    if (index === 0) {
                        // Encabezados
                        const encabezados = ['Código', 'Descripción Inventario', 'Descripción Factura', 'Precio Costo', 'Precio Venta', 'Existencia'];
                        html += `<th style="border:1px solid #ddd; padding:5px; background:#f2f2f2;">${encabezados[i] || `Col ${i+1}`}</th>`;
                    } else {
                        // Datos - RESPETAR CELDAS VACÍAS
                        const estilo = i === 0 && !celda ? 'background:#fff3cd; color:#856404; font-style:italic;' : '';
                        const displayCelda = celda === '' ? '<span style="color:#999; font-style:italic;">vacío</span>' : celda;
                        html += `<td style="border:1px solid #ddd; padding:5px; ${estilo}">${displayCelda}</td>`;
                        
                        // Contar productos sin código
                        if (i === 0 && index > 0 && !celda) {
                            productosSinCodigo++;
                        }
                    }
                }
                html += '</tr>';
            });
            
            html += '</table>';
            
            if (data.length > 10) {
                html += `<p style="color:#666; margin-top:10px;">... y ${data.length - 10} filas más</p>`;
            }
            
            // Mostrar advertencias sobre productos sin código
            if (productosSinCodigo > 0) {
                advertenciasHTML = `
                    <div class="excel-advertencia">
                        <i class="fas fa-exclamation-triangle"></i>
                        <strong>Nota:</strong> Se encontraron ${productosSinCodigo} productos sin código. 
                        Se mantendrán <strong>VACÍOS</strong> exactamente como en el archivo Excel.
                    </div>
                `;
            }
            
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
                this.mostrarError('El archivo no contiene datos válidos');
                return;
            }

            const datos = this.datosExcel.slice(1); // Excluir encabezados
            
            let productosCargados = 0;
            let productosActualizados = 0;
            let productosSinCodigo = 0;
            let errores = 0;

            for (const fila of datos) {
                if (fila.length === 0 || !fila[1]) continue; // Saltar filas vacías o sin descripción

                try {
                    // [0: Código, 1: Descripción Inventario, 2: Descripción Factura, 3: Precio Costo, 4: Precio Venta, 5: Existencia]
                    const codigo = fila[0]?.toString().trim() || ''; // RESPETAR VACÍOS
                    const descInventario = fila[1]?.toString().trim() || '';
                    const descFactura = fila[2]?.toString().trim() || descInventario; // Si no hay descripción factura, usar la de inventario
                    
                    if (!descInventario) {
                        continue; // Saltar si no hay descripción inventario
                    }

                    // Contar productos sin código
                    if (!codigo) {
                        productosSinCodigo++;
                    }

                    const productoData = {
                        codigo: codigo, // Mantener vacío si viene vacío
                        descInventario: descInventario,
                        descFactura: descFactura, // Mantener campo separado
                        precioCosto: this.parseNumero(fila[3]) || 0,
                        precioVenta: this.parseNumero(fila[4]) || 0,
                        existencia: this.parseNumero(fila[5], true) || 0,
                        stockMinimo: this.parseNumero(fila[6], true) || 0,
                        proveedor: (fila[7]?.toString().trim() || ''),
                        fechaCreacion: new Date().toISOString(),
                        fechaActualizacion: new Date().toISOString()
                    };

                    // Buscar producto existente
                    let productoExistente = null;
                    if (codigo) {
                        // Buscar por código
                        productoExistente = this.productos.find(p => p.codigo === productoData.codigo);
                    } else {
                        // Buscar por descripción (solo para productos sin código)
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
                    console.error('❌ Error procesando fila:', fila, error);
                    errores++;
                }
            }

            let mensaje = `Carga completada: ${productosCargados} nuevos, ${productosActualizados} actualizados`;
            if (productosSinCodigo > 0) {
                mensaje += `, ${productosSinCodigo} sin código (mantenidos vacíos)`;
            }
            if (errores > 0) {
                mensaje += `, ${errores} errores`;
            }

            this.mostrarExito(mensaje);
            
            document.getElementById('excel-preview').style.display = 'none';
            this.datosExcel = [];
            this.mostrarProductos();

        } catch (error) {
            console.error('❌ Error en carga masiva:', error);
            this.mostrarError('Error durante la carga masiva: ' + error.message);
        }
    }

    parseNumero(valor, esEntero = false) {
        if (valor === null || valor === undefined || valor === '') return 0;
        
        // Si ya es número, retornarlo
        if (typeof valor === 'number') return esEntero ? Math.round(valor) : valor;
        
        let strValor = valor.toString().trim();
        if (strValor === '') return 0;
        
        // Limpiar caracteres no numéricos excepto punto decimal y signo negativo
        strValor = strValor.replace(/[^\d.-]/g, '');
        
        const numero = parseFloat(strValor);
        if (isNaN(numero)) return 0;
        
        return esEntero ? Math.round(numero) : numero;
    }

    descargarPlantillaExcel() {
        try {
            const plantilla = [
                ['Código', 'Descripción Inventario', 'Descripción Factura', 'Precio Costo', 'Precio Venta', 'Existencia', 'Stock Mínimo', 'Proveedor'],
                ['TM001', 'Tulio Rin Ancho 2 Pulgadas', 'TULIO RIN ANCHO DE DOS PULGADAS', '18.40', '25.00', '50', '10', 'Todo Motor'],
                ['TM002', 'Cadena 7 Velocidades', 'CADENA 7V', '8.50', '12.00', '30', '5', 'Todo Motor'],
                ['', 'Producto sin código', 'PRODUCTO SIN CÓDIGO', '15.00', '20.00', '25', '5', 'Proveedor X']
            ];

            const worksheet = XLSX.utils.aoa_to_sheet(plantilla);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla Inventario');
            
            XLSX.writeFile(workbook, 'plantilla_inventario.xlsx');
            this.mostrarExito('Plantilla descargada correctamente');
        } catch (error) {
            console.error("❌ Error en descargarPlantillaExcel:", error);
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
                        <th>Código</th>
                        <th>Descripción Inventario</th>
                        <th>Descripción Factura</th>
                        <th>Existencia</th>
                        <th>Stock Mínimo</th>
                        <th>Estado</th>
                        <th>Proveedor</th>
                    </tr>
                </thead>
                <tbody>
        `;

        this.productos.forEach(producto => {
            const estado = this.obtenerEstadoStock(producto.existencia, producto.stockMinimo);
            const clase = this.obtenerClaseStock(producto.existencia, producto.stockMinimo);
            const claseCodigo = !producto.codigo ? 'codigo-vacio' : '';
            const codigoDisplay = producto.codigo || 'SIN CÓDIGO';
            
            html += `
                <tr>
                    <td class="${claseCodigo}">${codigoDisplay}</td>
                    <td>${producto.descInventario}</td>
                    <td>${producto.descFactura}</td>
                    <td class="${clase}">${producto.existencia}</td>
                    <td>${producto.stockMinimo || 0}</td>
                    <td>${estado}</td>
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
            <h4 style="margin:10px; color:#e74c3c;">Productos con Stock Bajo/Crítico</h4>
            <table class="inventario-table">
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Descripción Inventario</th>
                        <th>Descripción Factura</th>
                        <th>Existencia</th>
                        <th>Stock Mínimo</th>
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
            const codigoDisplay = producto.codigo || 'SIN CÓDIGO';
            
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

    generarReporteValorizacion() {
        const totalValorizacion = this.productos.reduce((sum, producto) => 
            sum + (producto.existencia * producto.precioCosto), 0
        );

        const totalValorVenta = this.productos.reduce((sum, producto) => 
            sum + (producto.existencia * producto.precioVenta), 0
        );

        let html = `
            <h4 style="margin:10px; color:#27ae60;">Valorización de Inventario</h4>
            <div style="padding:15px; background:#f8f9fa; border-radius:6px; margin-bottom:15px;">
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
                        <th>Código</th>
                        <th>Descripción Inventario</th>
                        <th>Descripción Factura</th>
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
            const codigoDisplay = producto.codigo || 'SIN CÓDIGO';
            
            html += `
                <tr>
                    <td class="${claseCodigo}">${codigoDisplay}</td>
                    <td>${producto.descInventario}</td>
                    <td>${producto.descFactura}</td>
                    <td>${producto.existencia}</td>
                    <td>$${producto.precioCosto.toFixed(2)}</td>
                    <td>$${valorCosto.toFixed(2)}</td>
                    <td>$${producto.precioVenta.toFixed(2)}</td>
                    <td>$${valorVenta.toFixed(2)}</td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        return html;
    }

    obtenerEstadoStock(existencia, stockMinimo) {
        if (!stockMinimo) return 'Sin mínimo';
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
        alert(`✅ ${mensaje}`);
    }

    mostrarError(mensaje) {
        alert(`❌ ${mensaje}`);
    }
}

// ========== INICIALIZACIÓN ==========
let inventario;

document.addEventListener('DOMContentLoaded', async function() {
    console.log("🚀 DOM cargado, iniciando inventario...");
    
    // Verificar autenticación
    if (!localStorage.getItem('usuarioLogueado')) {
        console.log("🔒 Redirigiendo a login...");
        window.location.href = 'login.html';
        return;
    }

    try {
        inventario = new SistemaInventario();
        await inventario.init();
        console.log("🎉 Inventario cargado exitosamente");
    } catch (error) {
        console.error("💥 Error crítico al cargar inventario:", error);
    }
});

// Hacer funciones disponibles globalmente
window.cerrarModalEditar = () => {
    if (inventario) inventario.cerrarModalEditar();
};

console.log("📄 inventario.js cargado completamente");
