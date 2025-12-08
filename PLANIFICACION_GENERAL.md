# Planificación General y Requisitos Transversales (Rules of the Road)

Este documento define reglas críticas que deben aplicarse en todo el desarrollo del sistema Taller William.

## 1. Integridad de Datos (Cero Duplicados)

### Prevención de Doble Facturación
*   **Mecanismo de Bloqueo UI**: Deshabilitar botones de "Cobrar" o "Guardar" inmediatamente después del primer clic (prevent double-submit).
*   **Identificadores Únicos**: Generación de IDs de transacción únicos (UUID o Timestamp + Random) en el cliente antes de enviar a Firebase. Si el servidor recibe el mismo ID, lo descarta.
*   **Verificación de Estado**: Antes de guardar, verificar si ya existe una transacción reciente idéntica para ese equipo/cliente en el último minuto (filtro de spam).

## 2. Respaldos y Seguridad (Backups)

### En la Nube
*   **Base de Datos**: Aprovechar la redundancia nativa de Firestore (Firebase), pero implementar **exportaciones periódicas** (JSON) de las colecciones críticas (Inventario, Ventas, Historial) a una ubicación segura (Google Cloud Storage o descarga local administrativa).

### Copias Locales / PDF
*   **Generación Automática**: Cada vez que se cierra una venta o factura importante, el sistema debe generar un PDF.
*   **Almacenamiento**: Guardar copia de ese PDF en la nube (Storage) vinculado a la transacción, permitiendo re-descarga futura.

## 3. Comunicación con Clientes

### Envío de Facturas y Recordatorios
*   **Integración WhatsApp**: Implementar botón "Enviar por WhatsApp" al finalizar una venta o desde el historial.
*   **Formato**:
    *   **Enlace**: Link directo al PDF de la factura (si está público/seguro).
    *   **Texto Resumen**: Mensaje pre-formateado con los detalles clave:
        > *"Hola, adjunto detalle de su servicio en Taller William. Total: $45.00. Gracias por su preferencia."*
*   **Recordatorios de Cobro**: Desde el módulo de Facturas/Cuentas, botón para enviar recordatorio de saldo pendiente amigable:
    > *"Estimado cliente, le recordamos su saldo pendiente de $30.00..."*

---
*Estas reglas son obligatorias para todos los módulos del sistema.*
