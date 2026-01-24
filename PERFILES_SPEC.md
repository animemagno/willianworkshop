# Especificación del Sistema de Perfiles por Equipo
*Última actualización: 24 Enero 2026*

## 📋 Objetivo
Migrar todas las ventas históricas desde la base de datos antigua (`tallerwilliam-732b3`) a la nueva base de datos (`williantaller-1426b`) utilizando un sistema de **Perfiles por Equipo** que centralice toda la información financiera y de mantenimiento.

---

## 🏗️ Arquitectura de Base de Datos

### Colección Principal: `PERFILES`

Cada documento representa un equipo único (ej: "Equipo 63", "2 - Tejute").

#### Estructura del Documento:
```javascript
{
  // IDENTIFICACIÓN
  id: "perfil_63",  // o "perfil_2_tejute" para equipos con grupo
  numero: 63,       // Número de equipo
  nombre: "63",     // Nombre display (puede incluir grupo: "2 - Tejute")
  grupo: "Tejute",  // Opcional: nombre del grupo si aplica
  
  // PROPIETARIO
  propietario: {
    nombre: "Juan Pérez",
    telefono: "7777-7777",
    direccion: "San Salvador"
  },
  
  // ESTADO FINANCIERO
  saldo: 0.00,                    // Saldo pendiente actual
  totalVentas: 0.00,              // Total histórico de ventas
  totalAbonado: 0.00,             // Total histórico de abonos
  
  // FECHAS
  fechaCreacion: Timestamp,
  ultimaActividad: Timestamp,     // Última venta, abono o mantenimiento
  
  // MANTENIMIENTOS PROGRAMADOS
  mantenimientos: {
    cambioAceite: {
      ultimo: Timestamp,
      frecuenciaDias: 90,
      proximo: Timestamp,
      recordatorio: true
    },
    servicio: {
      ultimo: Timestamp,
      frecuenciaDias: 180,
      proximo: Timestamp,
      recordatorio: true
    }
  },
  
  // ESTADO
  activo: true,
  migrado: true,                  // Indica si fue migrado desde DB vieja
  fechaMigracion: Timestamp
}
```

---

### Sub-colección: `MOVIMIENTOS`

Ubicación: `PERFILES/{perfilId}/MOVIMIENTOS/{movimientoId}`

Almacena TODAS las transacciones financieras del equipo.

#### Tipos de Movimientos:

##### 1. **VENTA** (Factura)
```javascript
{
  tipo: "venta",
  facturaId: "original_id_from_ventas",
  fecha: Timestamp,
  
  // PRODUCTOS
  products: [
    {
      name: "Aceite 20W50",
      quantity: 2,
      unitPrice: 5.00,
      total: 10.00
    }
  ],
  
  // TOTALES
  subtotal: 10.00,
  iva: 1.30,
  total: 11.30,
  
  // ESTADO
  estado: "pendiente" | "pagado" | "cancelado",
  tipoPago: "contado" | "credito" | "pendiente",
  
  // SALDO
  saldoPendiente: 11.30,  // Se actualiza con abonos
  
  // METADATA
  usuario: "Admin",
  impreso: false,
  notas: ""
}
```

##### 2. **ABONO** (Pago)
```javascript
{
  tipo: "abono",
  fecha: Timestamp,
  monto: 5.00,
  
  // APLICACIÓN
  facturaId: "id_factura_relacionada",  // Opcional si es abono general
  
  // METADATA
  metodoPago: "efectivo" | "transferencia" | "tarjeta",
  usuario: "Admin",
  notas: "Abono inicial"
}
```

##### 3. **AJUSTE** (Corrección manual)
```javascript
{
  tipo: "ajuste",
  fecha: Timestamp,
  monto: 10.00,  // Puede ser positivo o negativo
  razon: "Corrección de factura duplicada",
  usuario: "Admin"
}
```

---

### Sub-colección: `MANTENIMIENTOS`

Ubicación: `PERFILES/{perfilId}/MANTENIMIENTOS/{mantenimientoId}`

Registro completo de servicios y mantenimientos realizados.

#### Estructura:
```javascript
{
  tipo: "cambio_aceite" | "servicio" | "reparacion" | "inspeccion",
  fecha: Timestamp,
  
  // DESCRIPCIÓN
  descripcion: "Cambio de aceite 20W50",
  kilometraje: 50000,  // Opcional
  
  // PRODUCTOS/SERVICIOS
  items: [
    {
      nombre: "Aceite 20W50",
      cantidad: 4,
      precio: 6.00
    }
  ],
  
  // COSTO
  costoManoObra: 5.00,
  costoRepuestos: 24.00,
  total: 29.00,
  
  // PROGRAMACIÓN
  proximoMantenimiento: {
    fecha: Timestamp,
    kilometraje: 55000,
    tipo: "cambio_aceite"
  },
  
  // RECORDATORIO
  recordatorio: {
    activo: true,
    diasAntes: 7,
    notificado: false
  },
  
  // METADATA
  mecanico: "Carlos",
  notas: "Motor en buen estado",
  fotosAntes: [],
  fotosDespues: []
}
```

---

## 🔄 Plan de Migración

### Fase 1: Preparación
- [x] Crear especificación completa ✅
- [ ] Crear herramienta de migración (`admin_migration.html`)
- [ ] Probar conexión dual a ambas bases de datos

### Fase 2: Migración de Datos
1. **Leer VENTAS** de `tallerwilliam-732b3`
2. **Agrupar por equipo** (usando `equipoNumber` o `clientName`)
3. **Crear PERFILES** en `williantaller-1426b`
4. **Migrar MOVIMIENTOS** a sub-colección
5. **Calcular saldos** acumulados

### Fase 3: Sincronización Continua
- [ ] Sistema para seguir añadiendo ventas de DB vieja a nueva
- [ ] Validación de duplicados
- [ ] Reconciliación de saldos

### Fase 4: Sistema de Recordatorios
- [ ] Calcular próximos mantenimientos
- [ ] Sistema de notificaciones
- [ ] Dashboard de alertas

---

## 🎯 Beneficios del Nuevo Sistema

### Consultas Optimizadas:
✅ **Antes:** Scan completo de VENTAS filtrado por equipo (lento)
✅ **Ahora:** Consulta directa a PERFILES/{equipoId}/MOVIMIENTOS (rápido)

### Datos Centralizados:
✅ Todo el historial de un equipo en un solo lugar
✅ Saldos calculados automáticamente
✅ Mantenimientos vinculados al equipo

### Reportes Mejorados:
✅ Estado financiero por equipo
✅ Historial de mantenimientos
✅ Alertas preventivas

---

## ⚙️ Implementación Técnica

### Herramienta de Migración
- **Archivo:** `admin_migration.html`
- **Funciones:**
  - Conectar a ambas bases de datos
  - Leer ventas de DB vieja
  - Transformar a estructura de perfiles
  - Escribir en DB nueva
  - Validar migración
  - Log de errores

### Validaciones Necesarias:
1. ✅ Detectar duplicados
2. ✅ Verificar sumas de saldos
3. ✅ Confirmar integridad de datos
4. ✅ Rollback en caso de error

---

## 📊 Ejemplo de Migración

**Datos Originales (tallerwilliam-732b3):**
```
VENTAS/
  ├── venta1 { equipoNumber: 63, total: 100, ... }
  ├── venta2 { equipoNumber: 63, total: 50, ... }
  └── venta3 { equipoNumber: 2, clientName: "Tejute", total: 200, ... }
```

**Resultado (williantaller-1426b):**
```
PERFILES/
  ├── perfil_63
  │   ├── numero: 63
  │   ├── saldo: 150
  │   └── MOVIMIENTOS/
  │       ├── venta1
  │       └── venta2
  │
  └── perfil_2_tejute
      ├── numero: 2
      ├── grupo: "Tejute"
      ├── saldo: 200
      └── MOVIMIENTOS/
          └── venta3
```

---

## 🚨 Consideraciones Importantes

1. **No borrar datos originales** hasta confirmar migración exitosa
2. **Hacer backup** antes de iniciar
3. **Migrar en batches** para evitar timeouts
4. **Validar cada batch** antes de continuar
5. **Mantener logs detallados** de la migración

---

## 📝 Próximos Pasos

1. ✅ Crear `admin_migration.html`
2. ✅ Implementar conexión dual a Firebase
3. ✅ Crear función de lectura de ventas antiguas
4. ✅ Crear función de transformación a perfiles
5. ✅ Implementar validaciones
6. ✅ Probar con datos de prueba
7. ✅ Ejecutar migración completa
8. ✅ Validar resultados
