# Planificación del Módulo de Inventario

Este documento detalla los requerimientos para la página `inventario.html`.

## 1. Métodos de Ingreso de Stock

### Automatizado (Carga JSON)
*   **Fuente**: Archivos JSON provistos por proveedores (o generados de facturas electrónicas).
*   **Proceso**:
    *   Subir archivo.
    *   Sistema parsea: Nombre/Código, Costo Compra, Cantidad.
    *   **Conciliación**: Si el producto ya existe (match por código/nombre), suma stock y actualiza costo promedio o último costo. Si no, crea nuevo producto.

### Respaldo Documental (Facturas Proveedor)
*   **Registro**: Al ingresar lote de productos, permitir asociar una evidencia.
*   **Formatos**:
    *   Guardar el JSON original procesado.
    *   Subir imagen/foto de la factura física.
*   **Objetivo**: Auditoría de precios y fechas de compra.

### Manual y Edición
*   Interfaz para ingreso uno a uno (fallback).
*   Modo "Excel" (edición en celda) para ajustes rápidos (controlado por permisos de configuración).

## 2. Gestión de Existencias
*   Visualización de lista maestra de productos.
*   Búsqueda avanzada.
*   Kardex básico (Entradas por compra, Salidas por venta, Ajustes por Cuentas).

---
*La prioridad es la automatización vía JSON para reducir errores de digitación.*
