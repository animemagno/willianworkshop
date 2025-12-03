# Documentación de Flujo y Arquitectura para Migración
> **Origen:** `ventas.html` (Monolítico)
> **Destino:** `willianworkshop` (Modular)
> **Fecha:** 02/12/2025

Este documento detalla la lógica de negocio, el estado y los flujos de trabajo implementados en `ventas.html` para facilitar su migración a una arquitectura modular.

---

## 1. Mapa de Arquitectura Sugerido

El código actual está organizado en objetos globales. Se recomienda migrar cada uno a su propio módulo/archivo:

| Objeto Monolítico | Tipo Sugerido | Ruta Sugerida | Responsabilidad |
|-------------------|---------------|---------------|-----------------|
| `AppState` | Store/Context | `src/store/store.js` | Estado global (carrito, usuario, datos cargados). |
| `DataService` | Service | `src/services/firebase/data.service.js` | Interacción directa con Firestore (CRUD). |
| `SalesService` | Service | `src/services/business/sales.service.js` | Lógica de negocio: cálculos, validaciones, orquestación. |
| `GrupoManager` | Service | `src/services/business/groups.service.js` | Lógica compleja de grupos y caché de totales. |
| `UIService` | UI/Component | `src/ui/ui.service.js` o Componentes React/Vue | Manipulación del DOM (separar en componentes visuales). |
| `ModalService` | UI/Component | `src/ui/modals.service.js` | Gestión de apertura/cierre de modales. |
| `ConcurrencyManager`| Utility | `src/utils/concurrency.js` | Manejo de bloqueos (Mutex) para evitar doble escritura. |
| `ErrorHandler` | Utility | `src/utils/error-handler.js` | Reintentos y manejo de errores de red. |
| `DateUtils` | Utility | `src/utils/date.utils.js` | Manejo de fechas y zonas horarias. |

---

## 2. Flujos de Trabajo Críticos (Business Logic)

### A. Gestión de Grupos y Actualización en Tiempo Real
**Ubicación actual:** `GrupoManager` y `setupRealTimeListener`

*   **Lógica:** Los grupos agrupan múltiples equipos. El saldo total del grupo es la suma de los saldos pendientes de sus equipos.
*   **Punto Crítico (Recientemente Corregido):**
    *   El sistema escucha cambios en la colección `VENTAS` en tiempo real.
    *   Al detectar cambios, **DEBE** invalidar el caché de totales y recalcular sumando los saldos de `equiposPendientes`.
    *   **No confiar en valores cacheados** si se fuerza una actualización (`force=true`).

### B. Proceso de Abono a Grupos (Distribución Inteligente)
**Ubicación actual:** `DataService.processGroupAbono` / `SalesService.processGroupAbono`

*   **Flujo:**
    1.  El usuario selecciona un grupo y un monto total a abonar.
    2.  El sistema busca todas las facturas pendientes asociadas a ese grupo (`paymentType: 'pendiente'`, `status: 'pendiente'`).
    3.  **Ordenamiento:** Las facturas se ordenan por fecha ascendente (de la más antigua a la más reciente).
    4.  **Distribución:** El monto se va descontando factura por factura, cubriendo primero las más antiguas.
    5.  **Registro:** Se crea un documento en `INGRESOS` y se actualiza cada factura afectada (agregando el abono al array `abonos` y reduciendo `saldoPendiente`).

### C. Proceso de Venta (Contado vs Pendiente)
**Ubicación actual:** `SalesService.processSale`

*   **Validaciones:** Verificar carrito no vacío, cliente/equipo válidos.
*   **Concurrencia:** Uso de `ConcurrencyManager.withLock` para evitar duplicidad de facturas.
*   **Generación de ID:** El número de factura se genera basado en la fecha y un contador secuencial en Firestore (`COUNTERS/sales`).
*   **Pendiente:** Si es crédito, se asocia a un grupo/equipo y queda en estado `pendiente`.
*   **Contado:** Se marca como `pagado` inmediatamente.

### D. Retiros de Caja
**Ubicación actual:** `SalesService.processRetiro` y `DataService.saveRetiro`

*   **Datos:** Concepto, Monto, Categoría (Gastos, Compra, Herramientas).
*   **Validación:** Monto > 0, Concepto no vacío.
*   **Persistencia:** Se guarda en colección `RETIROS`.

---

## 3. Estado Global (`AppState`)

Variables clave que deben migrarse al gestor de estado del nuevo proyecto:

```javascript
const AppState = {
    firebaseInitialized: false, // Estado de conexión
    cart: [],                   // Carrito de compras actual
    searchResults: [],          // Resultados de búsqueda de productos
    historial: [],              // Historial de movimientos del día
    equiposPendientes: new Map(), // Caché de equipos con deuda
    equiposSeleccionados: new Set(), // Para creación de grupos
    processingSale: false,      // Flag para evitar doble submit
    operationLock: false        // Mutex global
};
```

---

## 4. Correcciones Específicas a Mantener (¡IMPORTANTE!)

Al migrar, asegúrate de incluir estas correcciones recientes:

1.  **CSS Z-Index en Grupos:**
    *   Los botones de acción en las tarjetas de grupo deben tener `z-index` alto para ser clickeables.
    *   *Código:* `.grupo-actions { z-index: 10; }`

2.  **Invalidación de Caché en Grupos:**
    *   En la función de cálculo de totales, si se recibe el flag `force=true`, **ignorar el caché** y recalcular iterando sobre los equipos. Esto es vital para que el saldo baje inmediatamente después de un abono.

3.  **Manejo de Concurrencia:**
    *   Mantener el wrapper `ConcurrencyManager.withLock()` en todas las operaciones de escritura (Ventas, Abonos, Retiros) para evitar inconsistencias si el usuario hace doble clic.

4.  **Persistencia Offline:**
    *   El código actual maneja `enablePersistence()` de Firebase. Mantener esto para que la app funcione si se cae internet momentáneamente.
