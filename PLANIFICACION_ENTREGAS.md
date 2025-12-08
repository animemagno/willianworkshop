# Planificación del Módulo de Entregas (Rentas/Cuotas Diarias)

Este documento detalla los requerimientos y la lógica necesaria para la página `entregas.html`, enfocada en el control de pagos de renta diaria de una flota específica de mototaxis.

## 1. Configuración de Clientes y Tarifas

### Contexto
*   Servicio exclusivo para 2 clientes que administran un total de 4 Mototaxis.
*   **Tarifas Base**:
    *   Tipo 1: **$45.00** diarios.
    *   Tipo 2: **$30.00** diarios.

## 2. Interfaz de Registro (Flujo Rápido)

### Selección de Equipo
*   **Visualización**: Botones grandes para cada uno de los 4 equipos.
*   **Acción**: Al presionar un botón, se carga el contexto y calendario de ese equipo.

### Registro de Pago (Calendario Interactivo)
*   **Acción Estándar (Click simple)**: 
    *   Al presionar un día en el calendario, se marca como **"Entrega Completa"** automáticamente (carga el monto base: $30 o $45).
*   **Registro de Pagos Atrasados**:
    *   Permitir seleccionar días pasados para registrar pagos acumulados (ej. pagar lunes, martes y miércoles en una sola visita).
*   **Excepciones (Cuota Incompleta)**:
    *   **Casilla de Monto Estándar**: Debe existir un input para modificar el monto *antes* de hacer click en el día.
    *   **Casilla de Comentarios**: Campo obligatorio u opcional para justificar por qué no se completó la cuota o por qué no se trabajó (ej. "Taller", "Enfermo").

## 3. Visualización y Calendarios

### Métricas Clave (Por periodo)
*   **Saldo Acumulado**: Sumatoria total de dinero entregado en el periodo.
*   **Días Laborados**: Conteo de días con entrega > $0.
*   **Días de Descanso**: Conteo de días marcados explícitamente como descanso.

### Periodos de Corte
*   **Visualización**: Mes corriente (1 al 30/31).
*   **Corte Contable**: La sumatoria de saldos se debe poder calcular con fechas de corte flexibles (aprox. día 15 de cada mes), independiente de la vista visual del mes calendario.

## 4. Reportes e Impresión

### Calendario Impreso (Físico)
*   Debe generar una vista imprimible del mes corriente.
*   **Contenido del impreso**:
    *   Cuadrícula del mes con marcas de pago ($30/$45).
    *   Días de descanso marcados.
    *   Totales al pie de página (Saldo, Días trabajados, Días descanso).
    *   Comentarios relevantes de días con incidencias.

---
*Este módulo es independiente del flujo de reparaciones y ventas de repuestos.*
