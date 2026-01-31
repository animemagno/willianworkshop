# Carpeta de Desarrollo Temporal

Esta carpeta contiene archivos creados durante el desarrollo y análisis del proyecto, pero que **NO son parte del proyecto original**.

## 📁 Contenido

### Documentación de Desarrollo:
- `GUIA_MIGRACION.md` - Guía para migrar datos de la DB antigua a la nueva
- `PENDIENTE_FACTURAS.md` - **IMPORTANTE**: Resumen del trabajo pendiente en facturas.html
- `PERFILES_SPEC.md` - Especificación de la estructura de perfiles
- `project_status.md` - Estado del proyecto
- `task.md` - Tareas pendientes

### Herramientas de Migración:
- `admin_migration.html` - Herramienta para migración completa de datos
- `sincronizacion.html` - Herramienta para sincronización incremental

### Herramientas de Análisis:
- `analizar_campos.html` - Analiza campos de la base de datos
- `comparar_inventarios.html` - Compara inventarios
- `diagnostico_perfiles.html` - Diagnóstico de perfiles
- `excel_to_json.html` - Convierte Excel a JSON
- `export_inventario.html` - Exporta inventario

### Archivos de Referencia:
- `SERVICIO_FACTURAS_NUEVO.js` - **IMPORTANTE**: Servicio correcto para facturas.html
- `facturas_individuales.html` - Página de prueba con facturas individuales funcionando

## ⚠️ Importante

### Archivos que DEBES revisar antes de eliminar:
1. **`PENDIENTE_FACTURAS.md`** - Contiene el estado actual y pasos a seguir
2. **`SERVICIO_FACTURAS_NUEVO.js`** - Código necesario para completar facturas.html
3. **`facturas_individuales.html`** - Página de prueba funcionando

### Archivos que puedes eliminar después de revisar:
- Todas las herramientas de análisis y migración (ya cumplieron su propósito)
- Documentación de desarrollo (opcional, pero útil como referencia)

## 🗑️ Para Eliminar Esta Carpeta

Una vez que hayas:
1. Integrado el servicio correcto en `facturas.html`
2. Verificado que todo funciona
3. Revisado `PENDIENTE_FACTURAS.md`

Puedes eliminar toda esta carpeta con:
```powershell
Remove-Item -Path "_dev_temp" -Recurse -Force
```

---
**Creado:** 30/01/2026
**Propósito:** Organizar archivos temporales de desarrollo
