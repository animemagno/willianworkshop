# MEMO: Tareas Pendientes - Módulo de Ventas

**Fecha de creación:** 2025-12-07  
**Última actualización:** 2025-12-07  
**Módulo:** venta.html / Ventas

---

## 📋 TAREAS PENDIENTES

### 1. ✅ COMPLETADAS EN ESTA SESIÓN

- ✅ Eliminar campo de cantidad del formulario
- ✅ Implementar prompt para solicitar cantidad al seleccionar producto
- ✅ Navegación con teclado (flechas ↑↓) en dropdown de búsqueda
- ✅ Selección con ENTER en dropdown
- ✅ Búsqueda directa en Firebase (no caché local)
- ✅ Cantidad y precio editables en el carrito
- ✅ Fondo gris oscuro en contenedores
- ✅ Título "NUEVA VENTA" solo sobre formulario
- ✅ Carrito con altura completa
- ✅ Texto más visible en dropdown (color blanco)
- ✅ Equipo "0" como "CLIENTE GENERAL"
- ✅ Agrupación correcta del historial por equipo + ciudad
- ✅ Mostrar ciudad en el historial cuando aplique

---

## 🔴 PENDIENTES DE ALTA PRIORIDAD

### 2. Fallback a Colección SERVICIO

**Descripción:**  
Cuando el usuario busca un producto y no se encuentra en la colección `inventario`, el sistema debe buscar automáticamente en la colección `SERVICIO`.

**Casos de uso:**
- Usuario busca "Cambio de aceite" → No está en inventario → Busca en SERVICIO
- Usuario busca "Mantenimiento" → No está en inventario → Busca en SERVICIO

**Implementación requerida:**

1. **Crear colección `SERVICIO` en Firebase:**
   ```
   Campos:
   - id: string
   - nombre: string (ej: "Cambio de aceite")
   - descripcion: string
   - precio: number
   - categoria: string (opcional)
   ```

2. **Modificar ProductService.js:**
   ```javascript
   async searchRemote(term) {
       // 1. Buscar en inventario
       let results = await buscarEnInventario(term);
       
       // 2. Si no hay resultados, buscar en SERVICIO
       if (results.length === 0) {
           results = await buscarEnServicios(term);
       }
       
       return results;
   }
   ```

3. **Agregar método `buscarEnServicios()`:**
   ```javascript
   async buscarEnServicios(term) {
       const querySnapshot = await getDocs(collection(db, "servicios"));
       // Filtrar por nombre/descripción
       // Retornar en el mismo formato que productos
   }
   ```

4. **Identificar servicios en el carrito:**
   - Agregar campo `tipo: 'producto' | 'servicio'` al item del carrito
   - Esto permite diferenciarlos en reportes y facturación

**Archivos a modificar:**
- `js/services/ProductService.js`
- `js/services/SalesService.js` (si es necesario)

---

## 🟡 PENDIENTES DE PRIORIDAD MEDIA

### 3. Sugerencias Inteligentes de Servicios (Venta Cruzada)

**Descripción:**  
El sistema debe analizar los productos en el carrito y sugerir servicios relacionados automáticamente.

**Lógica de detección:**
```javascript
// Palabras clave → Servicios sugeridos
const sugerencias = {
    'aceite': ['Cambio de aceite', 'Cambio de filtro de aceite'],
    'filtro': ['Cambio de filtro de aire', 'Cambio de filtro de aceite'],
    'llanta': ['Balanceo', 'Alineación'],
    'freno': ['Revisión de frenos', 'Cambio de pastillas']
};
```

**Implementación:**

1. **Crear función `detectarSugerencias(cart)`:**
   ```javascript
   function detectarSugerencias(cart) {
       const sugerencias = [];
       cart.forEach(item => {
           // Analizar descripción del producto
           // Buscar palabras clave
           // Agregar servicios sugeridos
       });
       return sugerencias;
   }
   ```

2. **Mostrar sugerencias en UI:**
   - Crear sección "Servicios Sugeridos" debajo del carrito
   - Botón "Agregar" para cada sugerencia
   - Agregar con un solo click

3. **Diseño:**
   ```html
   <div class="sugerencias-container">
       <h4>💡 Servicios Sugeridos</h4>
       <div class="sugerencia-item">
           <span>Cambio de aceite - $25.00</span>
           <button class="btn-agregar-sugerencia">Agregar</button>
       </div>
   </div>
   ```

**Archivos a modificar:**
- `js/controllers/VentasController.js`
- `js/ui/SalesUI.js`
- `css/venta.css`

---

## 🟢 MEJORAS OPCIONALES

### 4. Historial Interactivo

**Funcionalidades pendientes:**
- ❌ Click en item del historial → Mostrar detalle de la venta
- ❌ Botón "MODIFICAR" para editar facturas del día
- ❌ Mantener fecha/hora original al modificar
- ❌ Recalcular abonos si se modifica

### 5. Validaciones Adicionales

- ❌ Validar existencia en tiempo real al editar cantidad en carrito
- ❌ Alertar si la cantidad editada excede la existencia
- ❌ Bloquear venta si hay productos sin existencia

### 6. Optimizaciones

- ❌ Implementar caché local para productos frecuentes
- ❌ Reducir llamadas a Firebase con debounce más largo
- ❌ Lazy loading del historial

---

## 📝 NOTAS IMPORTANTES

### Decisiones Tomadas:
1. ✅ **NO implementar** lógica de cantidad rápida ("2 Amortiguador")
   - La lógica actual con prompt funciona bien
   
2. ✅ **NO mostrar** columna "Código" en el carrito
   - Mantener diseño compacto

### Estructura Actual:
```
Flujo de venta:
1. Equipo → TAB
2. Ciudad (opcional) → TAB
3. Buscar Producto
4. Navegar con ↑↓
5. Seleccionar con ENTER o click
6. Prompt solicita cantidad
7. Producto se agrega al carrito
8. Cantidad y precio editables en carrito
9. Botones: EFECTIVO o CRÉDITO (con opción de abono)
```

### Colecciones Firebase:
- ✅ `inventario` - Productos disponibles
- ✅ `ventas` - Ventas registradas
- ✅ `ventasTemporales` - Ventas en progreso
- ✅ `retiros` - Retiros de caja
- ✅ `ingresos` - Ingresos de caja
- ⏳ `servicios` - **PENDIENTE DE CREAR**

---

## 🚀 PRÓXIMOS PASOS SUGERIDOS

1. **Crear colección `servicios` en Firebase**
2. **Implementar fallback a SERVICIO**
3. **Probar con casos reales**
4. **Implementar sugerencias inteligentes** (opcional)
5. **Mejorar historial interactivo** (opcional)

---

## 📞 CONTACTO PARA DUDAS

Si necesitas continuar con estas tareas en otra sesión, menciona:
- "Continuar con tareas pendientes de ventas"
- "Implementar fallback a SERVICIO"
- "Ver MEMO de ventas"

---

**Fin del MEMO**
