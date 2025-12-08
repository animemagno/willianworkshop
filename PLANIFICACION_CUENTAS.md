# Planificación del Módulo de Cuentas (Socios y Préstamos Externos)

Este documento detalla los requerimientos para la página `cuentas.html`, enfocada en la gestión de intercambio de inventario con terceros (Socios, Amigos, Otros Talleres).

## 1. Concepto Central
Gestionar préstamos de productos bidireccionales (Entradas y Salidas) que no son ventas ni compras directas, sino movimientos de confianza que generan un saldo pendiente (en dinero o en especie).

## 2. Funcionalidades Principales

### Registro de Socios/Contactos
*   CRUD simple de terceros con los que se realiza intercambio.

### Movimientos de Inventario (Entradas/Salidas)
*   **Préstamo OTORGADO (Salida)**:
    *   Nosotros damos un repuesto a un socio.
    *   Se descuenta de nuestro stock físico.
    *   Genera una cuenta por cobrar (o devolución pendiente) al socio.
*   **Préstamo RECIBIDO (Entrada)**:
    *   Un socio nos presta un repuesto.
    *   Se suma temporalmente a nuestro stock (o se usa directamente en una reparación).
    *   Genera una deuda con el socio.

### Liquidación de Cuentas
*   **Pago Monetario**: Saldar la deuda pagando en efectivo el valor de los productos.
*   **Devolución de Producto**: Regresar físicamente la mercancía prestada (ajuste de inventario inverso).
*   **Historial**: Registro de qué se prestó, cuándo y si ya se solventó.

---
*Este módulo es crítico para controlar "fugas" o "ingresos fantasma" de inventario por préstamos informales.*
