# Planificación del Módulo de Servicios (Catálogo de Mano de Obra)

Este documento detalla los requerimientos para la página `servicios.html`.

## 1. Propósito
Administrar el listado de trabajos de mano de obra disponibles y sus precios base.

## 2. Funcionalidades

### Gestión de Catálogo
*   **Listar**: Ver todos los servicios disponibles.
*   **Añadir**:
    *   **Nombre del Servicio**: (Ej. "Cambio de Aceite", "Poner Pivot").
    *   **Precio**: Costo estándar del servicio.
    *   **Palabras Clave (Activadores)**: (Opcional) Palabras que, si aparecen en una venta de productos, disparan la sugerencia de este servicio (Ej. Para "Cambio de Aceite", las claves serían "Aceite", "Filtro").

---
*La lógica de "Sugerencia Automática" se ejecutará en la pantalla de Ventas, pero los datos nacen aquí.*
