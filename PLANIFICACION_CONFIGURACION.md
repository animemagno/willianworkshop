# Planificación del Módulo de Configuración

Este documento detalla los requerimientos para la página `configuracion.html`.

## 1. Control de Funcionalidades (Feature Flags)

### Switch: "Edición Manual de Inventario"
*   **ON**: Permite editar celdas de nombre, precio y stock directamente en la tabla de inventario.
*   **OFF**: Bloquea la edición directa para prevenir errores accidentales o malintencionados. Solo permite cambios vía procesos formales (ingreso factura, módulo ajuste).

### Personalización por Página
*   Capacidad de habilitar/deshabilitar comportamientos específicos en `venta.html` o `historial.html` (según surjan necesidades).

## 2. Gestión de Usuarios y Seguridad

### Usuarios y Jerarquías
*   **Roles**:
    *   **Admin/Dueño**: Acceso total, puede ver costos, reportes financieros y cambiar configuraciones.
    *   **Vendedor/Operario**: Acceso a Ventas, Entregas, Inventario (Lectura). Restricción en eliminación de historiales o edición de configuraciones críticas.
*   **CRUD**: Crear, Editar y Eliminar usuarios del sistema.

---
*Este módulo es el panel de control para asegurar la integridad de los datos.*
