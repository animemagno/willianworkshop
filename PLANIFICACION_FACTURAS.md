# Planificación del Módulo de Facturas y Cuentas por Cobrar (Taller de Mototaxis)

Este documento detalla los requerimientos y la lógica necesaria para la página `facturas.html`, enfocada en la visualización de deudas y la gestión de abonos.

## 1. Vista Principal: Facturas Pendientes (Por Equipo)

### Visualización (Nivel 1)
*   **Formato**: Tarjetas o Cuadrículas.
*   **Identificador**: "Número" de Equipo.
*   **Contenido Visible**:
    *   Saldo Total Pendiente (suma de todas las facturas de ese equipo).

### Detalle (Nivel 2 - Al presionar una tarjeta de equipo)
*   **Formato**: Tabla detallada.
*   **Contenido**:
    *   Lista de facturas pendientes asociadas a ese equipo.
    *   Detalles de cada factura (Fecha producto, total original).
    *   Saldo pendiente específico de cada factura.

### Funcionalidad de Abonos (Individual)
*   **Objetivo**: Registrar pagos parciales o totales a la deuda de un equipo.
*   **Modalidades de Aplicación del Pago**:
    1.  **Automática**: El sistema distribuye el monto del abono comenzando por la factura más antigua (FIFO - First In, First Out).
    2.  **Manual/Selectiva**: El usuario selecciona explícitamente a qué factura(s) desea aplicar el abono.

## 2. Pestaña: GRUPOS

### Visualización de Grupos (Nivel 1)
*   **Formato**: Tarjetas.
*   **Contenido**: Nombre del Grupo y (probablemente) Saldo Total del Grupo.

### Detalle de Grupo (Nivel 2 - Al presionar nombre del grupo)
*   **Visualización**: Muestra las **Tarjetas de los Equipos** que pertenecen a ese grupo (reutilizando la vista de tarjetas de equipos individual).
*   **Detalle**: Tablas individuales con las facturas pendientes de cada equipo del grupo.

### Funcionalidad de Abonos (Grupal)
*   **Flexibilidad Jerárquica**:
    1.  **Abono al GRUPO**: Realizar un pago global que se distribuye entre las deudas del grupo (se necesitará definir si la lógica automática aplica aquí también, ej: equipos con deuda más antigua).
    2.  **Abono por EQUIPO (dentro del grupo)**: Seleccionar un equipo específico del grupo y aplicarle un abono solo a él.
    3.  **Abono por FACTURA (dentro del grupo)**: Llegar al nivel de detalle de seleccionar facturas específicas de un equipo dentro del grupo.

---
*Este documento complementa a `PLANIFICACION_VENTAS.md` y define la estructura para la gestión de cobros.*
