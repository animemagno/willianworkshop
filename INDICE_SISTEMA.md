# ÍNDICE MAESTRO Y GUÍA DE FLUJO DE PÁGINAS - TALLER WILLIAN

Este documento es el mapa oficial del sistema. Contiene el propósito, flujo de trabajo, campos de datos, pestañas y archivos vinculados de cada página del proyecto.

> **Regla de uso obligatorio:** En cada nueva sesión de trabajo, el Agente debe leer este archivo junto a `REGLAS.md` y `task.md` antes de realizar cualquier cambio, para comprender la función exacta de cada pantalla y no alterar la lógica compartida.

---

## 🗺️ 1. Mapa Resumen del Flujo de Trabajo

El sistema funciona como una cadena conectada de operaciones:

```
[carga_inventario.html / construccion_inventario.html]
                │
                ▼
        [inventario.html] ◄────────────────────────────────────────┐
          (Base congelada + Stock simulado en vivo)                │
                │                                                  │
                ▼                                                  │
        [registro.html]                                            │
   (Registra entradas, cuentas, precios especiales)                │
                │                                                  │
                ▼                                                  │
        [salidas.html]                                             │
   (Paso 1: Repuestos -> Paso 2: Servicios -> Paso 3: Factura)    │
                │                                                  │
        ┌───────┴──────────────────┐                               │
        ▼                          ▼                               │
[imprimir_factura.html]     [Auditoría en inventario.html] ────────┘
 (Hoja carta con totales)    (Descuenta existencias definitivas)
```

---

## 📄 2. Detalle de Páginas

---

### 1. `registro.html` (Registro de Entradas y Movimientos)

* **Propósito:**
  Registrar los movimientos y repuestos que ingresan al taller o están listos para facturar, usando como base la lista de productos del inventario (`inventario.html`). Almacena los registros pendientes que luego serán tomados por el módulo de facturación (`salidas.html`).

* **Flujo de Trabajo / Mecánica de Uso:**
  1. El usuario selecciona la **Fecha** del día en la parte superior.
  2. En el panel izquierdo ingresa la **Cantidad**, escribe o busca el **Producto** (con autocompletado del inventario), asigna una **Cuenta** (si es de un cliente o mayorista específico), define un **Precio Especial de Venta** (si aplica) y añade una **Observación**.
  3. Presiona **"Agregar a la Tabla"**. El repuesto se guarda en la base de datos como registro pendiente de facturar.
  4. En el panel derecho revisa los productos ingresados en sus diferentes pestañas.
  5. Al terminar el mes de trabajo, abre el menú **"Acciones" > "Cerrar Mes"** para archivar los repuestos ya facturados y trasladar los pendientes al nuevo mes como "MES ANTERIOR".

* **Campos y Datos que Maneja:**
  * **Fecha (`fecha`):** Fecha del movimiento.
  * **Cantidad (`cantidad`):** Unidades que ingresan.
  * **Producto / Descripción (`producto` / `descripcion`):** Nombre del repuesto (vinculado al inventario).
  * **Cuenta (`cuenta`):** Opcional. Nombre del cliente o cuenta especial.
  * **Precio Especial de Venta (`precioEspecial`):** Precio de venta acordado para este lote.
  * **Observación (`observacion`):** Comentarios o detalles adicionales.
  * **Cantidad Usada (`cantidadUsada`):** Control interno de cuántas unidades ya se consumieron en facturas.
  * **Estado (`estado`):** `'disponible'` o `'facturado'`.

* **Pestañas y Opciones:**
  * **Pestaña "Registros Pendientes":** Muestra la lista de repuestos libres con sus cantidades, fechas, cuentas y precios especiales.
  * **Pestaña "Resumen Dinámico":** Agrupa los productos por nombre y totaliza: Disponibles, Facturados y Total general.
  * **Pestaña "Tabla Excel":** Vista ordenada estilo hoja de cálculo para fácil lectura o verificación.
  * **Pestaña "Historial Archivado":** Lista de meses archivados con opción de abrir y consultar registros pasados.
  * **Menú "Acciones":**
    * *Cerrar Mes:* Abre ventana para cerrar el período activo, archivar lo facturado y pasar los sobrantes a "MES ANTERIOR".
    * *Borrar Todo:* Limpieza completa de registros con confirmación de seguridad.
  * **Botón Pantalla Completa:** Maximiza el espacio de trabajo para tablets o monitores del taller.

* **Archivos Vinculados:**
  * Vista: `registro.html`
  * Estilos: `css/inventario.css`
  * Controladores y lógica:
    * `js/registro/RegistroController.js` (Manejo de formularios y pestañas del registro).
    * `js/RegistrosApp.js` (Lógica global de registros, cierre de mes y sincronización).
    * `js/core/FirebaseService.js` (Conexión con base de datos).
    * `js/core/InventoryLogic.js` (Cálculos y reglas de inventario).
    * `js/migrateDB.js` (Migraciones y ajustes de base de datos).
  * Base de Datos (Firestore): Colección `REGISTROS` / `REGISTROS_SALIDA`.

* **Impacto en Otras Páginas:**
  * Alimenta directamente a **`salidas.html`**. Si se modifica la estructura de `REGISTROS` o `cantidadUsada`, puede afectar la disponibilidad de productos en la facturación.

---

### 2. `salidas.html` (Salidas y Facturación en 3 Pasos)

* **Propósito:**
  Crear facturas de venta oficiales del taller tomando los repuestos registrados en `registro.html`, añadiendo mano de obra o servicios, confirmando costos y ganancias, y emitiendo el comprobante correlativo.

* **Flujo de Trabajo / Mecánica de Uso:**
  * **Pestaña "Facturación" (3 Pasos Consecutivos):**
    1. **Paso 1: Repuestos (Grid de 3 Tarjetas):**
       * *Tarjeta 1 (Todos los Registros):* Muestra los ingresos cronológicos en la pestaña "General", o agrupados por cliente en la pestaña "Por Cuenta" para cargar lotes completos con un solo toque.
       * *Tarjeta 2 (Resumen Agrupado):* Muestra repuestos unificados con su total disponible.
       * *Tarjeta 3 (Factura en Construcción / Dropzone):* El usuario arrastra o toca productos para agregarlos. Coloca el **Cliente**, el **N° Factura** (correlativo automático) y la **Fecha** (con botón `+1D` que salta domingos). Presiona **"Siguiente: Servicios"**.
    2. **Paso 2: Mano de Obra y Servicios:**
       * Muestra botones rápidos para servicios comunes (Cambio de aceite, frenos, bombas) y el botón **"Mano de Obra"** que pide el precio a cobrar.
       * Botón "Atrás: Repuestos" y "Siguiente: Precios de Repuestos".
    3. **Paso 3: Confirmación de Precios y Ganancias:**
       * *Panel Izquierdo:* Muestra la ganancia neta de la factura actual y el acumulado mensual de ganancias.
       * *Panel Derecho:* Tabla final de la factura donde se revisan costos y precios. Se puede cambiar el **Costo Unitario** haciendo **doble clic** sobre él.
       * Presiona **"Finalizar y Guardar Factura"**: Valida que el número no esté duplicado en la base de datos, descuenta los repuestos usando orden FIFO y guarda la factura.
  * **Pestaña "Historial de Facturas":**
    * Muestra todas las facturas emitidas con tarjetas superiores de ganancias del mes.
    * Filtro desplegable por mes y buscador de clientes en vivo.
    * Botón **"Corregir Secuencia en Cascada"**: Reordena correlativos consecutivamente si hubo saltos o números repetidos.
    * Al abrir el detalle de una factura, incluye el botón **"Hoja Carta"** para imprimirla en formato formal.

* **Campos y Datos que Maneja:**
  * Factura: `numeroFactura`, `fechaFactura`, `cliente`, `total`, `gananciaProductos`, `manoObra`, `items`.
  * Ítems: `producto`, `cantidad`, `costo`, `precioUnitario`, `subtotal`, `groupingKey`, `originRegistryId`.

* **Archivos Vinculados:**
  * Vista: `salidas.html`
  * Estilos: `css/inventario.css`
  * Scripts:
    * `js/salidas/SalidasController.js` (Navegación de pasos 1, 2 y 3, filtros e interfaz).
    * `js/RegistrosApp.js` (Lógica de construcción, validación de correlativos, guardado en base de datos).
    * `js/DateUtils.js` (Reglas de fechas y omisión de domingos).
    * `js/PrintingService.js` (Impresión directa de tickets o comprobantes).
    * `js/core/FirebaseService.js` e `js/core/InventoryLogic.js`.
  * Base de Datos (Firestore): Colecciones `facturas` y `REGISTROS`.

* **Impacto en Otras Páginas:**
  * Consume unidades de `registro.html`.
  * Las ventas de repuestos alimentan el cálculo de stock simulado en `inventario.html`.
  * Las facturas guardadas son leídas por `imprimir_factura.html`.

---

### 3. `imprimir_factura.html` (Impresión de Factura en Tamaño Carta)

* **Propósito:**
  Visualizar e imprimir facturas en formato formal de hoja completa (Letter / 8.5 x 11 pulgadas) listo para entrega al cliente o respaldo contable.

* **Flujo de Trabajo / Mecánica de Uso:**
  1. Se puede abrir directamente con el parámetro de la factura (ej: `imprimir_factura.html?id=ID_FACTURA`) desde `salidas.html`, o abriendo la página directamente.
  2. En la barra superior (que no se imprime) se puede seleccionar cualquier factura de la lista, buscar por cliente/número o usar los botones de anterior/siguiente.
  3. Muestra el diseño impreso con datos del taller, fecha, cliente, N° de factura, tabla de productos/servicios y total en números y en letras.
  4. Presionar el botón **"Imprimir Factura"** para enviar a la impresora o guardar en PDF.

* **Campos que Muestra:**
  * **Cantidad**, **Descripción / Producto o Servicio**, **Precio Unitario**, **Total por Fila**.
  * Pie con: **Total General ($)** y conversión automática a letras en español (ej: "CIEN DÓLARES CON 00/100").

* **Archivos Vinculados:**
  * Vista: `imprimir_factura.html`
  * Base de Datos (Firestore): Colección `facturas`.

---

### 4. `inventario.html` (Inventario General y Stock Simulado)

* **Propósito:**
  Controlar las existencias oficiales de repuestos del taller. Muestra tanto el inventario físico oficial como el stock simulado en vivo (restando ventas del mes sin modificar la base de datos hasta auditar).

* **Flujo de Trabajo / Mecánica de Uso:**
  1. Muestra la lista de hasta 300 artículos con sus códigos, descripciones, costos, precios y existencias.
  2. El stock en pantalla es simulado: toma las existencias guardadas y descuenta automáticamente lo vendido en las facturas del mes actual.
  3. **Botón "Auditoría Ventas":** Compara las existencias de la base de datos contra las ventas reales del mes. Al confirmar, descuenta definitivamente las cantidades en la base de datos y reinicia el mes de forma limpia.
  4. **Botón "Personalizar Columnas":** Permite activar o desactivar columnas visibles (Costo c/IVA, Costo s/IVA, Precio Venta, Stock Inicial, Compras Proveedores, Ventas, Pendientes, Stock Real).
  5. Buscador rápido por código o nombre del producto, y filtros por stock bajo/crítico.

* **Archivos Vinculados:**
  * Vista: `inventario.html`
  * Estilos: `css/inventario.css`
  * Scripts:
    * `js/core/FirebaseService.js` (Lectura de colección `INVENTARIO`).
    * `js/core/InventoryLogic.js` (Cálculo de stock simulado y auditoría).
    * `js/core/ColumnManager.js` (Guardado de preferencias de columnas).
    * `js/RegistrosApp.js`.
  * Base de Datos (Firestore): Colección `INVENTARIO` y `RESUMEN_SALIDAS_MES`.

---

### 5. `carga_inventario.html` (Carga Masiva de Inventario por Mes)

* **Propósito:**
  Subir el inventario inicial o mensual a partir de archivos de Excel sin tener que digitar producto por producto.

* **Flujo de Trabajo / Mecánica de Uso:**
  1. El usuario selecciona el mes y año de trabajo.
  2. Carga un archivo de Excel (`.xlsx` o `.xls`).
  3. El sistema muestra una vista previa de los productos detectados (Código, Descripción, Stock, Costos).
  4. Se presiona "Confirmar y Guardar Mes" para almacenar el lote en la nube.
  5. Permite consultar el historial de meses cargados anteriormente.

* **Archivos Vinculados:**
  * Vista: `carga_inventario.html`
  * Estilos: `css/inventario.css`
  * Scripts: `js/carga_inventario.js` y librerías SheetJS (`xlsx.full.min.js`).

---

### 6. `construccion_inventario.html` (Construcción y Conciliación Mensual)

* **Propósito:**
  Herramienta avanzada para conciliar y armar el nuevo mes de inventario uniendo tres fuentes: Inventario Base anterior + Compras a Proveedores + Ventas Electrónicas (FEL).

* **Flujo de Trabajo / Mecánica de Uso:**
  1. Asistente paso a paso para mapear columnas de archivos Excel.
  2. Compara existencias anteriores, suma las entradas de repuestos y resta las salidas.
  3. Tarjeta final: "Aplicar y Guardar Todo en la Nube" para consolidar el mes oficial en Firebase.

* **Archivos Vinculados:**
  * Vista: `construccion_inventario.html`
  * Scripts: `js/controllers/ConstruccionInventarioController.js`, `js/services/InventoryService.js`.

---

### 7. `facturas.html` (Facturas de Proveedores y Compras)

* **Propósito:**
  Registrar y dar seguimiento a las compras de repuestos realizadas a los proveedores, controlando abonos, deudas y entradas de inventario.

* **Flujo de Trabajo / Mecánica de Uso:**
  1. Registro de proveedor, fecha de compra, número de factura y productos adquiridos.
  2. Módulo de control de pagos: permite registrar abonos y saldos pendientes con cada proveedor.
  3. Detalle de factura con desglose de ítems comprados.

* **Archivos Vinculados:**
  * Vista: `facturas.html`
  * Estilos: `css/facturas.css`
  * Scripts: `js/FacturasTabManager.js`, `js/GrupoManager.js`.

---

### 8. `venta.html` (Punto de Venta de Mostrador - POS)

* **Propósito:**
  Registrar ventas rápidas de mostrador y cobros directos por número de equipo de vehículo, con control de caja chica (ingresos y retiros de efectivo).

* **Flujo de Trabajo / Mecánica de Uso:**
  1. Panel izquierdo: Carrito de compra con cantidades, precios y total.
  2. Panel derecho: Formulario de venta directa con número de equipo, cliente y repuestos.
  3. Botones de cabecera: Registro de "Ingreso" y "Retiro" de caja.

* **Archivos Vinculados:**
  * Vista: `venta.html`
  * Estilos: `css/ventas_styles.css`
  * Scripts: `js/controllers/VentasController.js`, `js/services/SalesService.js`, `js/services/ProductService.js`, `js/ui/SalesUI.js`.

---

### 9. `historial.html` (Historial de Ventas Directas)

* **Propósito:**
  Consultar, filtrar e imprimir el historial de ventas directas realizadas desde el punto de venta (`venta.html`).

* **Flujo de Trabajo / Mecánica de Uso:**
  1. Búsqueda por número de equipo, nombre de producto, tipo de pago (efectivo o crédito) y fechas.
  2. Botón "Imprimir Historial".
  3. Opción de anular o eliminar registros incorrectos mediante ventana de confirmación.

* **Archivos Vinculados:**
  * Vista: `historial.html`
  * Estilos: `css/historial.css`
  * Scripts: `js/controllers/HistoryController.js`, `js/HistorialService.js`.

---

### 10. `cuentas.html` (Memos y Cuentas / Flujo Financiero)

* **Propósito:**
  Gestionar recordatorios internos del taller (memos) y registrar movimientos financieros como aportes de capital y saldos de caja.

* **Flujo de Trabajo / Mecánica de Uso:**
  * **Pestaña MEMOS:** Tarjetas de notas internas con buscador y creación rápida de nuevas notas.
  * **Pestaña CUENTAS:** Registro de aportes de capital con monto, motivo y fecha para balance del negocio.

* **Archivos Vinculados:**
  * Vista: `cuentas.html`
  * Estilos: `css/cuentas.css`
  * Scripts: `js/controllers/AccountsController.js`.

---

### 11. `servicios.html` (Catálogo de Servicios)

* **Propósito:**
  Administrar el catálogo de trabajos y servicios mecánicos ofrecidos por el taller con sus precios estándar.

* **Archivos Vinculados:**
  * Vista: `servicios.html`
  * Estilos: `css/servicios.css`
  * Scripts: `js/controllers/ServicesController.js`.

---

### 12. `entregas.html` (Gestión de Entregas)

* **Propósito:**
  Seguimiento del estado de entrega de vehículos o equipos reparados a los clientes (En proceso, Listo, Entregado).

* **Archivos Vinculados:**
  * Vista: `entregas.html`
  * Estilos: `css/entregas.css`
  * Scripts: `js/controllers/DeliveriesController.js`.

---

### 13. `configuracion.html` (Ajustes del Sistema)

* **Propósito:**
  Configurar los datos del taller (nombre, teléfono, dirección, correo), activar/desactivar la edición directa en tabla de inventario y gestionar alias de productos.

* **Archivos Vinculados:**
  * Vista: `configuracion.html`
  * Estilos: `css/configuracion.css`
  * Scripts: `js/controllers/ConfigController.js`.

---

### 14. `login.html` e `index.html` (Acceso y Menú Principal)

* **`login.html`:** Validación de acceso mediante celular y código. Guarda sesión en `localStorage` con la clave `usuarioLogueado`.
* **`index.html`:** Menú principal con tarjetas de acceso a cada módulo del sistema. Si no hay usuario activo, redirige automáticamente a `login.html`.

---

### 15. Páginas Técnicas y de Diagnóstico

* **`detalle_equipo.html`:** Ficha técnica individual de un vehículo con todas sus reparaciones y cuentas acumuladas.
* **`diagnostico.html`:** Herramienta técnica para descargar en formato CSV el contenido de las colecciones `REGISTROS_SALIDA` y `facturas` para verificación de datos.
* **`sincronizacion.html`:** Utilidad para transferir o sincronizar bases de datos entre colecciones de Firebase.

---

## ⚠️ 3. Reglas de Oro para Modificaciones (Evitar Dañar Otras Páginas)

1. **`RegistrosApp.js` es compartido:**
   * Este archivo gobierna `registro.html`, `salidas.html` e `inventario.html`.
   * Cualquier cambio en las funciones de este archivo debe respetar tanto la pantalla de Registro como la de Salidas.

2. **No alterar los campos base de `REGISTROS`:**
   * Las propiedades `fecha`, `cantidad`, `producto`, `cuenta`, `precioEspecial`, `cantidadUsada` y `estado` son leídas estrictamente por `salidas.html`. No cambies sus nombres.

3. **Respetar la regla de Inventario Congelado:**
   * Al facturar, la base de datos de inventario **NO se descuenta de inmediato**. Se guarda en ventas mensuales y se calcula el stock simulado en vivo. Únicamente la auditoría aplica la rebaja definitiva.

4. **Regla de omisión de domingos:**
   * Las fechas de facturación en `salidas.html` nunca deben caer en domingo. Si una fecha calculada o seleccionada es domingo, debe saltar automáticamente al lunes.
