# Planificación del Módulo de Historial y Reportes (Taller de Mototaxis)

Este documento detalla los requerimientos y la lógica necesaria para la página `historial.html`, enfocada en la consulta de registros pasados y generación de reportes.

## 1. Filtros y Visualización General

### Alcance Temporal
*   **Límite**: Mostrar historial de máximo **6 meses** de antigüedad.
*   **Organización**: Paginación o agrupación por **MES**.

### Tipos de Registros
*   Debe mostrar tanto facturas **Pendientes** (cuentas por cobrar) como **Abonadas/Pagadas** (cerradas).

## 2. Reportes e Impresión

### Características Generales
*   **Selección**: El usuario debe poder seleccionar qué reporte desea generar o imprimir.
*   **Formato de Impresión**: Formato amigable para impresora (posiblemente ticket o carta, a definir según uso).

### Reporte: Venta de Artículos (Resumen de Productos)
*   **Propósito**: Saber qué y cuánto se vendió.
*   **Ordenamiento**: Alfabético por nombre de producto.
*   **Datos a mostrar**:
    *   Nombre del Producto.
    *   Cantidad total vendida (en el periodo seleccionado).
    *   Precio Total (ingresos generados por ese producto).

### Reporte: Venta por Equipo
*   **Propósito**: Ver el movimiento financiero desglosado por unidad.
*   **Datos a mostrar**:
    *   Listado de Facturas asociadas al equipo.
    *   Detalles de los productos/servicios dentro de esas facturas.

## 3. Historial Específico por Equipo

### Funcionalidad de Búsqueda/Filtro
*   Permitir buscar un equipo específico para ver su "hoja de vida" completa.
*   **Alcance**: Todas las facturas almacenadas para ese equipo (respetando el límite de tiempo o histórico completo según se defina la base de datos).

### Impresión Individual
*   Capacidad de generar un reporte impreso exclusivo del historial del equipo seleccionado.

---
*Este documento complementa a `PLANIFICACION_VENTAS.md` y `PLANIFICACION_FACTURAS.md`, definiendo la estructura para el análisis de datos.*
