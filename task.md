# TAREAS Y ESTADO DEL PROYECTO

Este archivo contiene el resumen de lo que ya está listo y lo que sigue, para mantener la memoria del sistema limpia y ordenada al iniciar un nuevo chat.

## ✅ LISTO (Terminado y Guardado)
1.  **Facturación con Precios y Totales (Tarjeta 3):**
    *   Los productos cargan automáticamente su precio al ser arrastrados.
    *   Puedes editar el precio unitario directamente en la Tarjeta 3.
    *   El total por fila y el total de la factura se calculan al instante.
2.  **Inventario Congelado con Stock Simulado:**
    *   La base de datos ya no se altera de forma directa al facturar.
    *   Todas las pantallas y reportes calculan y muestran de forma automática el stock simulado real restando lo vendido en el mes.
3.  **Auditoría de Ventas del Mes:**
    *   Nuevo botón **"Auditoría Ventas"** en la parte superior.
    *   Muestra lo vendido en el mes, el stock de la base de datos y el stock real.
    *   Al confirmar, descuenta definitivamente las unidades en la base de datos y reinicia el mes de forma limpia.
4.  **Límite de Visualización Ampliado:**
    *   Se aumentó la capacidad para mostrar hasta **300 artículos** simultáneos en la lista del inventario.
5.  **Cierre de Mes en Registro (registro.html):**
    *   La ventana de cierre ahora toma directamente el mes activo en trabajo (ej. Agosto 2026).
    *   Conteo exacto de artículos físicos facturados a archivar y pendientes de facturar.
    *   Guardado seguro en base de datos para archivar sin errores de documentos faltantes.
    *   Tabla detallada mostrando únicamente los registros pendientes a trasladar como "MES ANTERIOR".
6.  **Facturación por Cuenta en Salidas (salidas.html):**
    *   Prioridad estricta al descontar registros al facturar (prioriza registro de origen y nombre de cuenta).
    *   Evita que productos con cuenta consuman registros generales del inicio de mes o reboten al Paso 1.
7.  **Sincronización Directa de Registros y Filtro Estricto de Mes:**
    *   `registro.html` y `salidas.html` leen directamente el estado real de cada producto (`cantidadUsada`).
    *   Al liberar productos de facturas, regresan exactamente con su fecha y cuenta original.
    *   Filtro estricto por mes actual en `salidas.html` para evitar que se muestren registros residuales de meses anteriores.

8.  **Control y Prevención de Facturas Duplicadas (salidas.html):**
    *   Cálculo centralizado del siguiente número correlativo (`getNextInvoiceNumber`).
    *   Los borradores ya no congelan números viejos de días anteriores al restaurarse.
    *   Validación en tiempo real contra Firestore en `finalizeInvoice` que impide guardar números repetidos y reasigna automáticamente el número correlativo siguiente.
    *   Detección de reactivación de pantalla/pestaña para actualizar el número si la tablet estuvo en reposo.
    *   Identificación visual de facturas repetidas en el historial (etiqueta "Repetida").
    *   Botón para editar el número de factura directamente desde la ventana de detalle de factura para corregir cualquier duplicado histórico.
    *   **Herramienta de Renumeración en Cascada:** Botón "Corregir Secuencia en Cascada" en el historial y en el detalle de factura que reasigna de forma consecutiva (1 a 1) desde el número elegido (ej: 960) hasta el final con vista previa visual antes de aplicar.

## 📋 PRÓXIMOS PASOS (Por si deseas continuar)
*   Seguir con cualquier mejora de diseño, reportes adicionales o nuevas funciones en las pantallas que necesites.
