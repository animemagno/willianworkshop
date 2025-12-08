# Planificación del Módulo de Facturación y Ventas (Taller de Mototaxis)

Este documento detalla los requerimientos y la lógica necesaria para el funcionamiento de la página `venta.html` y sus interacciones con la base de datos.

## 1. Estructura de Datos y Colecciones

### Colección: `EQUIPO`
*   **Propósito**: Almacenar el historial completo de cada unidad (mototaxi).
*   **Identificador**: Número de equipo.
*   **Contenido**: Almacenará facturas clasificadas por estado:
    *   Créditos (pendientes).
    *   Abonos realizados.
    *   Facturas pagadas (historial).

### Colección: `INVENTARIO`
*   Fuente principal para la búsqueda de repuestos y productos.

### Colección: `SERVICIO` (Nueva)
*   Fuente para precios predeterminados de servicios (ej. "Cambio de aceite").
*   Se utiliza cuando un concepto no se encuentra en el inventario de productos.

## 2. Interfaz de Usuario e Inputs

### Campo: "EQUIPO"
*   **Formato**: Máximo 3 dígitos numéricos.
*   **Alineación**: Centrado.
*   **Lógica Especial**:
    *   Si se digita `0`: Se trata como un **CLIENTE GENERAL** (ventas mostrador / sin unidad específica).
    *   Cualquier otro número: Se asocia al historial de esa unidad específica.

### Campo: "CIUDAD"
*   **Propósito**: Diferenciar equipos con el mismo número pero de diferentes procedencias.
*   **Comportamiento**:
    *   Campo vacío = Equipo **LOCAL** (no se necesita diferenciar).
    *   Con texto = Procedencia específica (ej. "Santa Ana").
    *   Permite diferenciar (Ej: Equipo "25" Local vs. Equipo "25" Santa Ana).

### Campo: "BUSCAR PRODUCTO"
*   **Búsqueda**:
    *   Debe coincidir con el nombre exacto para seleccionar.
    *   **Búsqueda en tiempo real**: Debe filtrar desde la primera letra escrita (ej. "A" -> muestra "Amortiguador...").
    *   **Búsqueda parcial**: Debe encontrar por cualquier parte del nombre (ej. "trasero" -> encuentra "Amortiguador trasero").
*   **Lógica de Cantidad Rápida**:
    *   Si el usuario escribe un número antes del nombre (ej. "2 Amortiguador..."), el sistema interpreta que la cantidad es **2**.
    *   Si no se escribe número inicial, la cantidad por defecto es **1**.
*   **Lógica de Fallback (Servicios)**:
    *   Si el texto no coincide con un producto del inventario (ej. "Cambio de aceite"), buscará en la colección `SERVICIO`.

## 3. Carrito de Compra

*   **Columnas visibles**:
    *   Cantidad
    *   Descripción
    *   Código
    *   Precio Unitario
    *   Total
*   **Edición**:
    *   Permitir modificar **Cantidad** y **Precio Unitario** directamente en el carrito.
*   **Diseño**:
    *   Espacio reducido entre líneas (compacto).
*   **Acciones**:
    *   **Eliminar**: Debe solicitar confirmación ("¿Realmente desea eliminar este producto?") antes de borrar la línea.

## 4. Botones de Acción y Pago

### Botón: CRÉDITO
*   Almacena la venta como pendiente en la colección `EQUIPO`.
*   **Opción de Abono Inicial**:
    *   Preguntar si dejará abono o no.
    *   **Con Abono**: Descontar del total, almacenar fecha/hora del abono y saldo restante.
    *   **Sin Abono**: Almacenar la deuda total para futuros pagos.

### Botón: CONTADO
*   Procesa la venta como pagada inmediatamente (ingreso directo).

### Botón: ABONAR
*   Redirecciona a la página `facturas.html` (módulo a desarrollar posteriormente) para gestionar pagos de deudas existentes.

### Botones: RETIRO e INGRESO
*   Gestión de caja chica.
*   Permiten registrar salidas o entradas de dinero ajenas a ventas directas de productos.

## 5. Historial de Ventas (En pantalla de venta)

*   **Visualización**:
    *   Lista mostrando: Número de Equipo y Saldo de Venta.
*   **Interacción**:
    *   Al presionar un ítem, mostrar una tabla con el detalle de lo facturado.
*   **Funcionalidad: MODIFICAR**:
    *   Botón para editar una factura existente del día.
    *   **Comportamiento**:
        *   Traslada los productos nuevamente al "Carrito de Compra".
        *   Permite editar productos, precios, cantidades.
        *   **Regla de Oro**: Mantiene la **fecha y hora de creación original** (para no alterar el orden histórico de cierre de caja).
        *   Debe reflejar y recalcular los abonos si existieran.
        *   Si se cancela la deuda (paga el total), el estado se actualiza en el historial.


## 6. Sugerencias Inteligentes de Servicios (Venta Cruzada)

El sistema debe analizar los productos que se agregan al carrito para sugerir servicios relacionados.

*   **Lógica de Detección**:
    *   Si el carrito contiene productos con ciertas palabras clave (Ej: "Aceite", "Filtro"), el sistema buscará servicios asociados.
*   **Visualización**:
    *   Mostrar una alerta sutil o una sección de "Servicios Sugeridos" cerca del carrito o del botón de cobrar.
    *   Ejemplo: "Detectamos venta de Aceite. ¿Desea agregar 'Cambio de Aceite' por $X.XX?".
*   **Acción Rápida**:
    *   Botón para agregar el servicio sugerido con un solo clic.

---
*Este documento sirve como especificación técnica para la modularización del sistema.*
