# Pendiente: Integración de Facturas Individuales

## 🎯 Objetivo
Mostrar facturas individuales en `facturas.html` en lugar de equipos consolidados, permitiendo duplicados del mismo equipo si tiene múltiples facturas pendientes.

## ✅ Cambios Ya Completados

### 1. `detalle_equipo.html` - FUNCIONANDO ✅
- ✅ Reconoce estados: PAGADO, PENDIENTE, CANCELADA
- ✅ Muestra badges visuales de estado
- ✅ Solo muestra "Saldo Pendiente" en facturas no pagadas
- ✅ Compatible con todos los campos del backup JSON
- ✅ Calcula saldos correctamente usando `saldoPendiente`, `status`, `paymentType`

### 2. `facturas.html` - PARCIALMENTE COMPLETADO ⚠️
- ✅ Sistema de pestañas agregado (FACTURAS / GRUPOS)
- ✅ Función `render()` actualizada
- ✅ Función `renderLooseTeams()` actualizada
- ✅ Función `renderGroups()` actualizada
- ❌ **FALTA:** Reemplazar el servicio `InvoiceService`

## ⚠️ Problema Actual
`facturas.html` muestra "undefined" y "$NaN" porque el servicio `InvoiceService` todavía usa la lógica antigua que devuelve `equipos` en lugar de `facturas`.

## 🔧 Solución (Para Mañana)

### Opción 1: Reemplazar el Servicio Manualmente
1. Abrir `facturas.html`
2. Buscar la clase `InvoiceService` (línea ~402)
3. Copiar el contenido de `SERVICIO_FACTURAS_NUEVO.js`
4. Reemplazar toda la clase `InvoiceService` con ese código
5. Guardar y recargar

### Opción 2: Usar la Página de Prueba
El archivo `facturas_individuales.html` ya tiene la lógica correcta implementada y debería funcionar. Puedes:
1. Abrir `facturas_individuales.html` en el navegador
2. Verificar que muestra las facturas correctamente
3. Si funciona, usar ese código como referencia

## 📁 Archivos Relevantes

### Archivos Modificados:
- `detalle_equipo.html` - ✅ Funcionando correctamente
- `facturas.html` - ⚠️ Necesita integración del servicio
- `GUIA_MIGRACION.md` - ✅ Actualizada con instrucciones

### Archivos de Referencia:
- `SERVICIO_FACTURAS_NUEVO.js` - Código del servicio correcto
- `facturas_individuales.html` - Página de prueba funcionando
- `taller_willian_backup_2026-01-30.json` - Backup con datos de ejemplo

## 🎨 Resultado Esperado

### Pestaña FACTURAS:
```
┌─────────┐ ┌─────────┐ ┌─────────┐
│    0    │ │    0    │ │    2    │
│Apastepe │ │ Jolman  │ │ Cedros  │
│ $10.00  │ │$618.00  │ │$125.50  │
└─────────┘ └─────────┘ └─────────┘
```

### Pestaña GRUPOS:
```
┌─────────────────────────────┐
│ Grupo A          Total: $488│
├─────────────────────────────┤
│ [115] [26] [38]             │
│ $43   $134 $311             │
└─────────────────────────────┘
```

## 📝 Notas Importantes

1. **Facturas Duplicadas**: Es normal que un equipo aparezca varias veces si tiene múltiples facturas pendientes
2. **Nombres en Rojo**: Los nombres de clientes (diferentes del número) aparecen en rojo
3. **Solo Pendientes**: Solo se muestran facturas con `saldoPendiente > 0` o `status === 'pendiente'`
4. **Equipos con Grupo**: No aparecen en la pestaña FACTURAS, solo en GRUPOS

## 🚀 Próximos Pasos (Mañana)

1. Integrar el servicio correcto en `facturas.html`
2. Probar que las facturas se muestren correctamente
3. Verificar que los duplicados funcionen
4. Confirmar que los grupos se muestren en su pestaña
5. Implementar las funciones de botones (imprimir, crear grupo, abonar)

---

**Última actualización:** 30/01/2026 00:52
**Estado:** Pendiente de integración del servicio
