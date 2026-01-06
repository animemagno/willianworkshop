# REGLAS DE TRABAJO - PROYECTO TALLER WILLIAN

Este archivo contiene las normas obligatorias que debe seguir el Agente (IA) durante el desarrollo de este proyecto.

## 1. Comunicación
*   **Lenguaje Sencillo:** No usar palabras técnicas complejas (como "DOM", "Listeners", "Refactorización"). Explicar todo de forma simple y para un usuario no experto.
*   **Concisión:** Resumir las explicaciones de forma entendible y directa. Ir al grano.

## 1.1 Contexto Global (Lectura Obligatoria)
Para entender el estado real del proyecto, **SIEMPRE** debes leer estos archivos al iniciar:
1.  `task.md`: Hoja de ruta global (qué falta, qué sigue).
2.  `project_status.md`: (NUEVO) Resumen técnico detallado de implementaciones, bugs conocidos y deuda técnica.
3.  `REGLAS.md`: Estas normas.

## 2. Flujo de Desarrollo
*   **Consulta Previa:** Siempre preguntar o comentar "cómo se puede mejorar algo" ANTES de aplicar cambios. No asumir ni actuar por cuenta propia fuera de lo solicitado.
*   **Commit Controlado:** NUNCA hacer un commit sin preguntar antes. El usuario debe autorizar explícitamente cada guardado en el historial.
*   **Guardado Completo:** Al proceder con un guardado (commit), siempre se deben incluir **todos** los archivos modificados del proyecto en el repositorio.
*   **⚠️ IMPORTANTE - Guardado en GitHub:** 
    *   Cuando el usuario dice "guardar", se refiere a **guardar en GitHub** (commit + push), NO solo guardar localmente.
    *   Siempre verificar con `git status` si hay cambios pendientes de subir.
    *   Usar `git push` para sincronizar los commits locales con GitHub.
    *   Confirmar al usuario que los cambios están en la nube, no solo en su computadora.

## 3. Estrategia de Estabilidad ("Punto de Guardado")
Para evitar la degradación del código por errores acumulados:
1.  Trabajar en una funcionalidad hasta que esté **completamente funcional y probada**.
2.  Solicitar autorización para hacer un **COMMIT COMPLETO** (Punto de restauración).
3.  Una vez guardado, recomendar **CERRAR SESIÓN** y abrir un **NUEVO CHAT**.
4.  Continuar el trabajo en el nuevo chat con la memoria limpia.

## 4. Estética y Calidad
*   **Diseño Premium:** Priorizar una estética moderna, limpia y profesional (buenos colores, sombras, espaciado). Nada de diseños "básicos".
*   **Funcionalidad Móvil:** Toda pantalla debe verse y funcionar bien en dispositivos móviles.

## 5. Idioma y Proactividad Técnica
*   **Idioma Oficial:** Todo el trabajo, comentarios, commits y documentación debe realizarse en **ESPAÑOL**.
*   **Proactividad Técnica:** El Agente tiene libertad (y deber) de analizar las tareas implementadas y sugerir mejoras lógicas, arquitectónicas o incluso cambios de lenguaje/herramientas si esto facilita el trabajo o mejora la calidad del producto final. No limitarse solo a lo pedido si existe una solución técnica superior.
