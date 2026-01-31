# Estado del Proyecto - Taller Willian
*Última actualización: 08 Enero 2026*

Este documento técnico resume el estado actual del desarrollo "Brain Dump" para facilitar la continuidad entre sesiones.

## 1. Estado Actual (Resumen)
El módulo de **Inventario** avanza positivamente, incluyendo ahora herramientas de "Aprendizaje de Alias" desde historial. El foco se está moviendo hacia la limpieza del módulo de **Historial (`historial.html`)** y posteriormente la refactorización total de **Ventas**.

## 2. Implementado (Hecho)
### Módulo Inventario & Configuración
*   **Herramienta de Vinculación de Historial:**
    *   Nuevo acceso en `configuracion.html` > "Herramientas de Mantenimiento".
    *   Modal en `inventario.html` que escanea las últimas 500 salidas.
    *   Detecta items sin vincular (texto plano) y permite asociarlos a productos reales.
    *   Al confirmar, guarda el nombre "raro" como un **Alias** permanente.
    *   **ESTADO:** Implementado.
*   **Módulo de Entradas Refactorizado:**
    *   **Agrupación por Factura:** Las entradas ahora se guardan como un único documento maestro con items anidados (tipo factura), igual que las salidas.
    *   **Historial Expandible:** La tabla de historial muestra facturas agrupadas y permite ver el detalle completo en un modal.
    *   **Flujo Proactivo de Códigos:** Al registrar un producto nuevo, el sistema pregunta obligatoriamente si posee el código, permitiendo ingresarlo manual, omitirlo (dejar en blanco) o generarlo automáticamente.
    *   **Navegación Fluida:** Ciclo de tabulación optimizado (Cantidad > Descripción > Precio > Cantidad) y botón de agregar rápido.
*   **Estabilidad (Kardex):**
    *   Sistema base estable y corregido (entradas, salidas, reversiones).

### Módulo Inventario (General)
*   Soporte completo para Importación/Exportación Excel con lógica de vinculación.
*   Búsqueda inteligente por Alias activa en controladores.

## 3. Pendiente (Por Hacer)
### Inmediato (Próxima Sesión)
*   **Prueba de Vinculación de Historial:** Verificar que la herramienta funcione correctamente cuando existan facturas con items no vinculados.
*   **Mejora de Historial (`historial.html`):**
    *   El usuario quiere trabajar en este módulo.
    *   Ideas: Mejor diseño visual, detalles expandibles, mejores filtros de estado.
*   **Refactorización Ventas (`ventas.html`):**
    *   Sigue siendo código legacy. Necesita reescritura modular.
    *   Integración crítica con KardexService.

### Mediano Plazo
*   **Cuentas y Facturación:** Módulos aún no iniciados.
*   **Roles:** Definición de permisos (Admin vs Mecánico).

## 4. Problemas Conocidos & Riesgos
*   **Prueba Pendiente:** La herramienta de vinculación de historial no se pudo probar "end-to-end" por falta de datos de ejemplo en la sesión actual.

## 5. Notas Técnicas
*   **CORE FIXED:** Se ha implementado consistencia transaccional total (ACID) en:
    *   Ventas (Descuenta Stock al instante).
    *   Edición Manual (Genera Log de Ajuste "AJUSTE MANUAL").
    *   Reversiones y Entradas/Salidas.
*   Se ha limpiado `InventoryController.js` eliminando código duplicado.
*   La lógica de vinculación ahora maneja dos escenarios: Importación Excel (Batch) y Vinculación Histórica (Single/Retroactive).

## 🏗️ Nueva Arquitectura de Base de Datos (Historial)

Para optimizar las consultas de historial, se ha migrado a un esquema centrado en **Perfiles**:

### Colección: `PERFILES`
Representa un cliente o equipo único.
- `id`: String (ej: `perfil_63`, `perfil_2_tejute`)
- `nombre`: String (ej: "63", "2 - Tejute")
- `saldo`: Number (Total acumulado)
- `ultimaActividad`: Timestamp
- `migrado`: Boolean (true)

### Sub-colección: `MOVIMIENTOS`
Contiene las facturas individuales asociadas a ese perfil.
- Ubicación: `PERFILES/{perfilId}/MOVIMIENTOS/{facturaId}`
- Datos: Copia fiel de la factura original de `VENTAS`.

---
