# Estado del Proyecto - Taller Willian
*Última actualización: 05 Enero 2026*

Este documento técnico resume el estado actual del desarrollo "Brain Dump" para facilitar la continuidad entre sesiones.

## 1. Estado Actual (Resumen)
El módulo de **Inventario (`inventario.html`)** está estable y modernizado (Fase 0 completada). Se ha implementado un sistema robusto de estabilidad (Kardex) y búsqueda avanzada (Alias). El módulo de **Ventas** está pendiente de refactorización total.

## 2. Implementado (Hecho)
### Módulo Inventario (`inventario.html` + `InventoryApp.js`)
*   **Estabilidad (Kardex):**
    *   Colección `INVENTORY_LOG` en Firestore creada.
    *   Servicio `KardexService.js` activo: registra entradas, salidas (manuales), y ajustes.
    *   Funciones de **Revertir Movimiento** (Safe Revert) y **Reconstruir Stock** implementadas y funcionales.
    *   **Corrección Bug Crítico:** Eliminar entradas ya no deja stock negativo; ahora se revierte el movimiento.
*   **Vinculación de Productos (Alias):**
    *   Campo `aliases` (Array) en Firestore.
    *   Editor de producto actualizado con campo "Palabras Clave / Alias".
    *   Buscadores (Principal y Modal Pedidos) actualizados para buscar dentro de los alias.
*   **UI/UX:**
    *   Modal de Edición de Productos corregido (ya no está comprimido).
    *   Diseño visual limpio y responsive.

## 3. Pendiente (Por Hacer)
### Inmediato (Próxima Sesión)
*   **Refactorización Ventas (`ventas.html`):**
    *   El archivo actual es código heredado (legacy).
    *   Necesita reescribirse usando arquitectura modular (similar a Inventario).
    *   **CRÍTICO:** Integrar búsqueda por Alias en el carrito de ventas.
    *   **CRÍTICO:** Integrar `KardexService.logMovement('salida')` al finalizar una venta para descontar stock real y mantener historial.

### Mediano Plazo
*   **Cuentas y Facturación:** Módulos aún no iniciados.
*   **Roles:** Definición de permisos (Admin vs Mecánico).

## 4. Problemas Conocidos & Riesgos
*   **Desincronización de Ventas:** Actualmente, si se vende algo en `ventas.html`, **NO** se descuenta correctamente usando el Kardex Log, lo que puede causar que la herramienta "Reconstruir Stock" devuelva valores incorrectos (ya que no "sabe" que hubo una venta). La reconstrucción solo es fiable para Entradas/Ajustes manuales por ahora.
*   **Código Legacy:** Archivos como `ventas_old.html` o scripts antiguos pueden confundir. Se debe priorizar la limpieza.

## 5. Mejoras Sugeridas (Proactividad)
*   **Migración a Módulos ES6:** El proyecto usa muchos `<script src="...">` globales. A medida que crezca, sería mejor usar `import/export` nativo si el servidor lo permite, o mantener la separación clara en carpetas como `js/inventory/`, `js/sales/`.
*   **Validación de Tipos:** El manejo de precios/cantidades a veces mezcla strings y numbers. Se han puesto parches (`parseInt`, `parseFloat`), pero una validación centralizada de datos (Data Models) sería más segura.
