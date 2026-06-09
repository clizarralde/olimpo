# Olimpo — Próximos pasos

Backlog de mejoras pendientes (no bloqueantes). La app funciona y está publicada en
https://clizarralde.github.io/olimpo/

## 1. App nativa con Capacitor (integración de salud completa)
Envolver la PWA actual en una app nativa para escribir directo en los almacenes de salud,
sin depender del Atajo de iOS.

- **Por qué:** una PWA no puede escribir en Apple Salud (HealthKit) ni en Google Health Connect.
  El mismo proyecto Capacitor cubre **iOS + Android** reutilizando el código web actual.
- **Alcance:** empaquetar en Capacitor → agregar plugin de salud → escribir "Workout" +
  energía activa (kcal) + duración al finalizar el día. Reemplaza el botón actual de Atajos.
- **Costos:** iOS = Apple Developer USD 99/año (instalar en iPhone). Android = gratis (sideload
  del APK); Play Store = USD 25 una sola vez. Mac con Xcode ✅, Android Studio gratis.
- **Esfuerzo:** ~unas horas para empaquetar + ~1–2 días para la integración de salud y pruebas.
- **Tip:** se puede apuntar el WebView a la URL remota (GitHub Pages) para seguir actualizando
  con `git push` y recompilar sólo cuando se toca algo nativo.
- **Sugerencia de arranque:** primero el build de **Android** (gratis) para probar instalado,
  y luego sumar la escritura a Health Connect.

## 2. Ilustraciones cartoon faltantes (calentamiento + abdominales)
Generar las 4 ilustraciones que quedaron pendientes por el límite de facturación de OpenAI.

- **Ejercicios:** `entrada-calor`, `abs-banco`, `abs-inclinado`, `abs-rodillas`.
- **Estado actual:** muestran la **foto real** (free-exercise-db) como fallback en modo Cartoon.
- **Cómo hacerlo:** subir el límite/crédito en OpenAI (Billing → Usage limits) y correr
  `scripts/gen_cartoon.py` adaptado (1 grilla con esas poses) → guarda en `images/cartoon/m/`.

## 3. Más variantes de imágenes (motor ya listo)
El selector de estilo/personaje ya soporta la convención `images/<estilo>/<genero>/<id>.png`
con fallback a la foto. Falta sólo el contenido:

- **Personaje femenino** (`images/cartoon/f/`) — para mostrar la app a otra persona.
- **Estilo línea/minimalista** (`images/linea/m/`).
- Generables con el mismo `scripts/gen_cartoon.py` (cambiando el personaje/estilo del prompt).

## 4. Ideas sueltas (opcionales)
- Sync a **Google Fit** vía REST API desde la web: **descartado** (Google la está discontinuando
  ~2026–2027 a favor de Health Connect). Mejor ir por Capacitor.
- Recordatorios/notificaciones de entrenamiento (requiere Capacitor o web push).
