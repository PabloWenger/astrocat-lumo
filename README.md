# Astrocat Lumo 🐾

**Astrocat Lumo** es un *sidecar* de escritorio nativo, ultrarrápido y seguro, construido en **Rust + Tauri 2.0**. Su objetivo es inspeccionar ecosistemas locales de código, ensamblar contextos estructurados en tiempo real, y sincronizarlos fluidamente con **Proton Lumo** (`lumo.proton.me`) dentro de una experiencia unificada de ventana dual.

![Astrocat Lumo UI](ui/screenshot.png)

---

## ✨ Características Principales

### 🖥️ Interfaz Dual Unificada
- **Arquitectura Split-View:** Panel de control nativo a la izquierda (Astrocat) y entorno web inyectado a la derecha (Proton Lumo).
- **Layout Fluido:** Divisor vertical y divisor de query horizontal 100% redimensionables en tiempo real, sin *lag* y con retención de estado.

### 🧠 Explorador Inteligente (*Smart Tree*)
- **Filtro Automático y `.gitignore`:** El backend en Rust respeta tu archivo `.gitignore` nativamente y filtra automáticamente extensiones binarias (imágenes, videos, ejecutables) y directorios pesados (`node_modules`, `target`, `.git`) para mantener un contexto prístino.
- **Scope Dinámico:** Genera un árbol topológico inteligente (`🌿 Scoped`) que se recorta para mostrar únicamente las ramas que conectan los archivos que has seleccionado, ahorrando miles de tokens sin perder contexto estructural.
- **Protección de Memoria:** Análisis de cabeceras de bytes y omisión por tamaño (>5MB) impiden bloqueos al intentar cargar archivos binarios ocultos o gigantes.

### 📊 Presupuesto y Telemetría en Tiempo Real
- **Token Bar:** Barra de progreso visual que monitorea constantemente los caracteres leídos y los tokens estimados frente a tu límite configurado, cambiando de color dinámicamente si te acercas al *threshold*.
- **Previsualización en Vivo:** Observa exactamente lo que Lumo va a leer en el panel de *Context Preview* antes de enviarlo.

### 🔌 Inyección DOM Desacoplada
- **Comunicación IPC Transparente:** Astrocat inyecta los prompts directamente en los textareas de Proton Lumo y dispara los eventos nativos de React/Svelte de forma limpia.
- **Configurable en Caliente:** Si la web cambia sus selectores CSS, simplemente actualiza `lumo_selectors.json` y los cambios se aplican sin necesidad de recompilar la app.

---

## 🛠️ Stack Tecnológico

- **Core & Backend:** Rust (Edition 2021) con `ignore` y `rfd`.
- **Framework Desktop:** [Tauri 2.0](https://tauri.app/)
- **Frontend UI:** HTML5 + Vanilla CSS + JavaScript. *Zero dependencies, zero bundler overhead.*
- **CI/CD Automático:** Integrado con GitHub Actions para generar ejecutables en cada release para macOS, Windows y Linux automáticamente.

---

## 🚀 Instalación y Uso

### Descargar Ejecutable
Dirígete a la pestaña de **[Releases](https://github.com/PabloWenger/astrocat-lumo/releases)** en este repositorio y descarga la última versión para tu sistema operativo (`.dmg`, `.exe` o `.deb`).

### Compilar desde el Código Fuente
1. Asegúrate de tener [Rust](https://www.rust-lang.org/) instalado y las [dependencias de Tauri](https://v2.tauri.app/start/prerequisites/).
2. Clona el repositorio y ejecuta:

```bash
# Iniciar la aplicación en modo desarrollo
cargo run tauri
# O con el CLI de Tauri:
cargo tauri dev
```

Para generar un *build* optimizado para producción:
```bash
cargo tauri build
```

---

## ⚙️ Mantenimiento de Inyección (`lumo_selectors.json`)

Si el frontend de Proton Lumo se actualiza y el botón "Enviar" deja de responder, puedes ajustar los selectores CSS editando el archivo `lumo_selectors.json` (sin recompilar la app).

```json
{
  "editor_selectors": [
    "div[contenteditable='true']",
    "textarea[placeholder*='Ask']",
    "textarea"
  ],
  "submit_selectors": [
    "button[type='submit']",
    "button[aria-label*='Send']"
  ]
}
```

---

## 📄 Licencia

MIT / Apache 2.0 - Desarrollado por **[m[00]n](https://github.com/PabloWenger)** para el ecosistema creativo de **[Astrocat Studio](https://astrocatstud.io)**.
