# Guía: Ejecutar Migración de Datos

## Opción 1: Migración Inicial (Completa)
Usa esto si la base de datos nueva está vacía y quieres copiar todo desde cero.

1. **Abre `admin_migration.html`** en tu navegador.
2. **Haz clic en "Conectar Bases de Datos"**: Debe mostrar "DB Antigua ✓" y "DB Nueva ✓".
3. **Haz clic en "Analizar Datos"**: Verás cuántas ventas y equipos detectó.
4. **Haz clic en "Iniciar Migración"**: Espera a que la barra de progreso termine.
5. **Verifica**: Debe decir "MIGRACIÓN COMPLETADA".

---

## Opción 2: Sincronización Diaria (Incremental)
Usa esto para mantener la base de datos actualizada día a día **sin borrar nada**.

1. **Abre `sincronizacion.html`** en tu navegador.
2. **Haz clic en "1. Analizar Diferencias"**:
   - La herramienta comparará ambas bases de datos.
   - Te dirá exactamente cuántos registros nuevos hay.
3. **Haz clic en "2. Sincronizar Faltantes"**:
   - Solo se copiarán las nuevas ventas.
   - Los saldos de los clientes existentes se actualizarán automáticamente.
   - **Tus datos existentes están seguros.**

---

## Verificación
Después de migrar o sincronizar, abre `facturas.html` para ver los resultados reflejados inmediatamente.

## Solución de Problemas
- **"Facturas vacía"**: Asegúrate de haber realizado al menos una migración.
- **"Sin fecha"**: El sistema busca fechas en múltiples formatos automáticamente. Si persiste, verifica la fuente de datos.
