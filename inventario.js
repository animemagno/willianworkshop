// inventario.js - Sistema completo de inventario
import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

class SistemaInventario {
    constructor() {
        this.productos = [];
        this.proveedores = [];
        this.datosExcel = [];
        this.init();
    }

    async init() {
        // Configuración inicial similar a ventas.js
        this.setupMenuMobile();
        this.setupTabs();
        await this.cargarProductos();
        this.setupEventListeners();
    }

    // ========== CONFIGURACIÓN INICIAL (similar a ventas.js) ==========
    setupMenuMobile() {
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        const mobileMenu = document.getElementById('mobileMenu');
        const logoutBtn = document.getElementById('logoutBtn');

        mobileMenuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('active');
        });

        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('usuarioLogueado');
            window.location.href = 'login.html';
        });
    }

    setupTabs() {
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
                document.getElementById(`tab-${tabId}`).classList.add('active');
            });
        });
    }

    // ========== EVENT LISTENERS ==========
    setupEventListeners() {
        // Búsqueda en tiempo real
        document.getElementById('buscar-producto').addEventListener('input', (e) => {
            this.filtrarProductos(e.target.value);
        });

        // Formulario nuevo producto
        document.getElementById('form-nuevo-producto').addEventListener('submit', (e) => {
            e.preventDefault();
            this.guardarNuevoProducto();
        });

        // Limpiar formulario
        document.getElementById('limpiar-form-btn').addEventListener('click', () => {
            document.getElementById('form-nuevo-producto').reset();
        });

        // Formulario editar producto
        document.getElementById('form-editar-producto').addEventListener('submit', (e) => {
            e.preventDefault();
            this.actualizarProducto();
        });

        // Actualizar inventario
        document.getElementById('actualizar-inventario-btn').addEventListener('click', () => {
            this.cargarProductos();
        });

        // Carga de Excel
        this.setupExcelUpload();
        
        // Reportes
        this.setupReportes();
    }

    // ========== GESTIÓN DE EXCEL ==========
    setupExcelUpload() {
        const dropArea = document.getElementById('excel-drop-area');
        const fileInput = document.getElementById('excel-file');
        const preview = document.getElementById('excel-preview');
        const previewContent = document.getElementById('excel-preview-content');

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
        document.getElementById('descargar-plantilla-btn').addEventListener('click', () => {
            this.descargarPlantillaExcel();
        });

        // Confirmar carga
        document.getElementById('confirmar-carga-btn').addEventListener('click', () => {
            this.confirmarCargaExcel();
        });

        // Cancelar carga
        document.getElementById('cancelar-carga-btn').addEventListener('click', () => {
            preview.style.display = 'none';
            this.datosExcel = [];
        });
    }

    // ========== REPORTES ==========
    setupReportes() {
        document.getElementById('generar-reporte-btn').addEventListener('click', () => {
            this.generarReporte();
        });

        document.getElementById('imprimir-reporte-btn').addEventListener('click', () => {
            this.imprimirReporte();
        });
    }

    // ========== OPERACIONES CRUD PRODUCTOS ==========
    async cargarProductos() {
        try {
            const querySnapshot = await getDocs(collection(db, "inventario"));
            this.productos = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            this.mostrarProductos();
        } catch (error) {
            console.error("Error cargando productos:", error);
            this.mostrarError("Error al cargar el inventario");
        }
    }

    mostrarProductos(productosFiltrados = null) {
        const productos = productosFiltrados || this.productos;
        const tbody = document.getElementById('inventario-body');
        
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
            const codigosProveedor = producto.codigosProveedor ? 
                producto.codigosProveedor.join(', ') : '';

            return `
                <tr>
                    <td><strong>${producto.codigo}</strong></td>
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
    }

    obtenerClaseStock(existencia, stockMinimo) {
        if (!stockMinimo) return 'stock-normal';
        if (existencia <= 0) return 'stock-critico';
        if (existencia <= stockMinimo) return 'stock-bajo';
        return 'stock-normal';
    }

    filtrarProductos(termino) {
        if (!termino) {
            this.mostrarProductos();
            return;
        }

        const terminoLower = termino.toLowerCase();
        const filtrados = this.productos.filter(producto =>
            producto.codigo.toLowerCase().includes(terminoLower) ||
            producto.descInventario.toLowerCase().includes(terminoLower) ||
            producto.descFactura.toLowerCase().includes(terminoLower) ||
            (producto.codigosProveedor && producto.codigosProveedor.some(codigo => 
                codigo.toLowerCase().includes(terminoLower)
            )) ||
            (producto.proveedor && producto.proveedor.toLowerCase().includes(terminoLower))
        );

        this.mostrarProductos(filtrados);
    }

    async guardarNuevoProducto() {
        try {
            const formData = new FormData(document.getElementById('form-nuevo-producto'));
            
            // Procesar códigos de proveedor
            const codigosProveedor = formData.get('codigos-proveedor') ?
                formData.get('codigos-proveedor').split(',').map(cod => cod.trim()).filter(cod => cod) : [];

            const producto = {
                codigo: formData.get('codigo'),
                codigosProveedor: codigosProveedor,
                descInventario: formData.get('desc-inventario'),
                descFactura: formData.get('desc-factura'),
                precioCosto: parseFloat(formData.get('precio-costo')) || 0,
                precioVenta: parseFloat(formData.get('precio-venta')) || 0,
                existencia: parseInt(formData.get('existencia')) || 0,
                stockMinimo: parseInt(formData.get('stock-minimo')) || 0,
                proveedor: formData.get('proveedor') || '',
                categoria: formData.get('categoria') || '',
                fechaCreacion: serverTimestamp(),
                fechaActualizacion: serverTimestamp()
            };

            // Validar que no exista el código
            const existe = this.productos.some(p => p.codigo === producto.codigo);
            if (existe) {
                this.mostrarError('Ya existe un producto con este código');
                return;
            }

            await addDoc(collection(db, "inventario"), producto);
            
            this.mostrarExito('Producto agregado correctamente');
            document.getElementById('form-nuevo-producto').reset();
            await this.cargarProductos();
            
        } catch (error) {
            console.error('Error guardando producto:', error);
            this.mostrarError('Error al guardar el producto');
        }
    }

    async editarProducto(id) {
        try {
            const producto = this.productos.find(p => p.id === id);
            if (!producto) return;

            // Llenar formulario de edición
            document.getElementById('edit-id').value = producto.id;
            document.getElementById('edit-codigo').value = producto.codigo;
            document.getElementById('edit-codigos-proveedor').value = 
                producto.codigosProveedor ? producto.codigosProveedor.join(', ') : '';
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
            console.error('Error editando producto:', error);
            this.mostrarError('Error al cargar producto para editar');
        }
    }

    async actualizarProducto() {
        try {
            const id = document.getElementById('edit-id').value;
            const formData = new FormData(document.getElementById('form-editar-producto'));
            
            const codigosProveedor = formData.get('edit-codigos-proveedor') ?
                formData.get('edit-codigos-proveedor').split(',').map(cod => cod.trim()).filter(cod => cod) : [];

            const updates = {
                codigo: formData.get('edit-codigo'),
                codigosProveedor: codigosProveedor,
                descInventario: formData.get('edit-desc-inventario'),
                descFactura: formData.get('edit-desc-factura'),
                precioCosto: parseFloat(formData.get('edit-precio-costo')) || 0,
                precioVenta: parseFloat(formData.get('edit-precio-venta')) || 0,
                existencia: parseInt(formData.get('edit-existencia')) || 0,
                stockMinimo: parseInt(formData.get('edit-stock-minimo')) || 0,
                proveedor: formData.get('edit-proveedor') || '',
                fechaActualizacion: serverTimestamp()
            };

            await updateDoc(doc(db, "inventario", id), updates);
            
            this.mostrarExito('Producto actualizado correctamente');
            this.cerrarModalEditar();
            await this.cargarProductos();

        } catch (error) {
            console.error('Error actualizando producto:', error);
            this.mostrarError('Error al actualizar el producto');
        }
    }

    async eliminarProducto(id) {
        if (!confirm('¿Estás seguro de que quieres eliminar este producto?')) {
            return;
        }

        try {
            await deleteDoc(doc(db, "inventario", id));
            this.mostrarExito('Producto eliminado correctamente');
            await this.cargarProductos();
        } catch (error) {
            console.error('Error eliminando producto:', error);
            this.mostrarError('Error al eliminar el producto');
        }
    }

    // ========== GESTIÓN DE EXCEL (MEJORADA) ==========
    procesarArchivoExcel(file) {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // Intentar encontrar la hoja "inventario noviembre"
                let worksheet = workbook.Sheets['inventario noviembre'];
                if (!worksheet) {
                    // Si no existe, tomar la primera hoja
                    const firstSheetName = workbook.SheetNames[0];
                    worksheet = workbook.Sheets[firstSheetName];
                }
                
                // Usar sheet_to_json con header: 1 para obtener arrays
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                    header: 1, 
                    defval: "" // Valor por defecto para celdas vacías
                });
                
                this.mostrarPreviewExcel(jsonData);
                
            } catch (error) {
                console.error('Error procesando Excel:', error);
                this.mostrarError('Error al procesar el archivo Excel');
            }
        };
        
        reader.onerror = () => {
            this.mostrarError('Error al leer el archivo');
        };
        
        reader.readAsArrayBuffer(file);
    }

    mostrarPreviewExcel(data) {
        const preview = document.getElementById('excel-preview');
        const previewContent = document.getElementById('excel-preview-content');
        const advertenciasDiv = document.getElementById('excel-advertencias');
        
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
                    const encabezados = ['Código', 'Descripción', 'Precio Costo', 'Precio Venta', 'Existencia'];
                    html += `<th style="border:1px solid #ddd; padding:5px; background:#f2f2f2;">${encabezados[i] || `Col ${i+1}`}</th>`;
                } else {
                    // Datos
                    const estilo = i === 0 && !celda ? 'background:#fff3cd; color:#856404;' : '';
                    html += `<td style="border:1px solid #ddd; padding:5px; ${estilo}">${celda}</td>`;
                    
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
                    <strong>Advertencia:</strong> Se encontraron ${productosSinCodigo} productos sin código. 
                    Se generarán códigos automáticamente para estos productos.
                </div>
            `;
        }
        
        advertenciasDiv.innerHTML = advertenciasHTML;
        previewContent.innerHTML = html;
        preview.style.display = 'block';
    }

    async confirmarCargaExcel() {
        try {
            if (this.datosExcel.length < 2) {
                this.mostrarError('El archivo no contiene datos válidos');
                return;
            }

            const encabezados = this.datosExcel[0];
            const datos = this.datosExcel.slice(1);
            
            let productosCargados = 0;
            let productosActualizados = 0;
            let productosSinCodigo = 0;
            let errores = 0;

            for (const fila of datos) {
                if (fila.length === 0) continue;

                try {
                    // Mapear columnas manteniendo posiciones fijas
                    // [0: Código, 1: Descripción, 2: Precio Costo, 3: Precio Venta, 4: Existencia]
                    let codigo = fila[0]?.toString().trim() || '';
                    const descripcion = fila[1]?.toString().trim() || '';
                    
                    // Si no hay código, generar uno automático
                    if (!codigo) {
                        codigo = `AUTO-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                        productosSinCodigo++;
                    }

                    if (!descripcion) {
                        console.log('Fila sin descripción, omitiendo:', fila);
                        continue;
                    }

                    const producto = {
                        codigo: codigo,
                        codigosProveedor: codigo.startsWith('AUTO-') ? [] : [codigo],
                        descInventario: descripcion,
                        descFactura: descripcion,
                        precioCosto: this.parseNumero(fila[2]) || 0,
                        precioVenta: this.parseNumero(fila[3]) || 0,
                        existencia: this.parseNumero(fila[4], true) || 0,
                        stockMinimo: 0,
                        proveedor: '',
                        categoria: '',
                        fechaCreacion: serverTimestamp(),
                        fechaActualizacion: serverTimestamp(),
                        codigoAutomatico: codigo.startsWith('AUTO-')
                    };

                    // Verificar si existe (solo si no es código automático)
                    let productoExistente = null;
                    if (!codigo.startsWith('AUTO-')) {
                        productoExistente = this.productos.find(p => p.codigo === producto.codigo);
                    }
                    
                    if (productoExistente) {
                        // Actualizar producto existente
                        await updateDoc(doc(db, "inventario", productoExistente.id), {
                            descInventario: producto.descInventario,
                            descFactura: producto.descFactura,
                            precioCosto: producto.precioCosto,
                            precioVenta: producto.precioVenta,
                            existencia: producto.existencia,
                            fechaActualizacion: serverTimestamp()
                        });
                        productosActualizados++;
                    } else {
                        // Crear nuevo producto
                        await addDoc(collection(db, "inventario"), producto);
                        productosCargados++;
                    }

                } catch (error) {
                    console.error('Error procesando fila:', fila, error);
                    errores++;
                }
            }

            let mensaje = `Carga completada: ${productosCargados} nuevos, ${productosActualizados} actualizados`;
            if (productosSinCodigo > 0) {
                mensaje += `, ${productosSinCodigo} con código automático`;
            }
            if (errores > 0) {
                mensaje += `, ${errores} errores`;
            }

            this.mostrarExito(mensaje);
            
            document.getElementById('excel-preview').style.display = 'none';
            this.datosExcel = [];
            await this.cargarProductos();

        } catch (error) {
            console.error('Error en carga masiva:', error);
            this.mostrarError('Error durante la carga masiva: ' + error.message);
        }
    }

    // Función mejorada para parsear números
    parseNumero(valor, esEntero = false) {
        if (valor === null || valor === undefined || valor === '') return 0;
        
        // Convertir a string y limpiar
        let strValor = valor.toString().trim();
        
        // Remover caracteres no numéricos excepto punto decimal
        strValor = strValor.replace(/[^\d.-]/g, '');
        
        // Convertir a número
        const numero = parseFloat(strValor);
        
        if (isNaN(numero)) return 0;
        
        return esEntero ? Math.round(numero) : numero;
    }

    descargarPlantillaExcel() {
        const plantilla = [
            ['Código', 'Descripción', 'Precio Costo', 'Precio Venta', 'Existencia', 'Stock Mínimo', 'Proveedor'],
            ['TM001', 'Tulio Rin Ancho 2 Pulgadas', '18.40', '25.00', '50', '10', 'Todo Motor'],
            ['TM002', 'Cadena 7 Velocidades', '8.50', '12.00', '30', '5', 'Todo Motor'],
            ['', 'Producto sin código (se generará automático)', '15.00', '20.00', '25', '5', 'Proveedor X']
        ];

        const worksheet = XLSX.utils.aoa_to_sheet(plantilla);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla Inventario');
        
        XLSX.writeFile(workbook, 'plantilla_inventario.xlsx');
    }

    // ========== REPORTES ==========
    async generarReporte() {
        const tipoReporte = document.getElementById('tipo-reporte').value;
        const fechaInicio = document.getElementById('fecha-inicio').value;
        const fechaFin = document.getElementById('fecha-fin').value;
        
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
        reporteContenido.innerHTML = contenido;
        reporteContenido.style.display = 'block';
    }

    generarReporteStock() {
        let html = `
            <h4 style="margin:10px; color:#2c3e50;">Reporte de Stock Actual</h4>
            <table class="inventario-table">
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Descripción</th>
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
            
            html += `
                <tr>
                    <td>${producto.codigo}</td>
                    <td>${producto.descInventario}</td>
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
                        <th>Descripción</th>
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
            
            html += `
                <tr>
                    <td>${producto.codigo}</td>
                    <td>${producto.descInventario}</td>
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
                        <th>Descripción</th>
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
            
            html += `
                <tr>
                    <td>${producto.codigo}</td>
                    <td>${producto.descInventario}</td>
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
    }

    // ========== UTILIDADES ==========
    cerrarModalEditar() {
        document.getElementById('modalEditarProducto').style.display = 'none';
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
    // Verificar autenticación (igual que en otros archivos)
    if (!localStorage.getItem('usuarioLogueado')) {
        window.location.href = 'login.html';
        return;
    }

    inventario = new SistemaInventario();
});

// Hacer funciones disponibles globalmente
window.cerrarModalEditar = () => inventario.cerrarModalEditar();
