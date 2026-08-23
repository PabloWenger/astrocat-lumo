# Astrocat Lumo 🐾

Sidecar de escritorio nativo en **Rust + Tauri 2.0** diseñado para inspeccionar sistemas de archivos locales, ensamblar contexto estructurado y sincronizarlo fluidamente con **Proton Lumo** (`lumo.proton.me`) en una sola ventana unificada.

![Astrocat Lumo UI](ui/logo.png)

---

## ✨ Características

- **Ventana Unificada Dual-Webview:** 
  - Panel izquierdo con la interfaz nativa de Astrocat y panel derecho con la webview de Proton Lumo.
  - Divisor vertical arrastrable con el ratón en tiempo real y controles de ajuste rápido (`35%`, `50%`, `65%`, `80%`).
- **Control de Espacio y Layout Modular:**
  - **Superior:** Explorador de archivos (*File Tree*) a la izquierda y previsualización de contexto (*Context Preview*) en tiempo real a la derecha.
  - **Inferior:** Área de consulta (*Query*) de ancho completo con divisor horizontal ajustable por arrastre de ratón.
  - Botón de envío rápido `➤ Lumo` en la cabecera del Query.
- **Explorador Inteligente de Repositorios y Archivos:**
  - Árbol de archivos optimizado que omite directorios pesados (`node_modules`, `target`, `.git`, `dist`, etc.).
  - **Modo "All Files":** Toggle para explorar discos duros externos o carpetas generales (series, películas, música) sin filtros de código.
  - **Protección de Binarios / Multimedia:** Detección de archivos no legibles como texto plano (`.mp4`, `.png`, `.mp3`, `.pdf`, `.zip`, etc.), incluyendo su referencia por nombre sin inyectar binarios.
  - Herramientas rápidas: `+ Siblings` (seleccionar hermanos en la misma carpeta), `Uncheck`, `✕ Clear Tree` y `🔄 Refresh Tree` manteniendo la selección activa.
- **Modos de Scope de Árbol (*Tree Scope*):**
  - `🌳 Full`: Incluye el árbol completo del repositorio en el prompt.
  - `🌿 Scoped`: Genera un árbol compacto centrado en los archivos seleccionados y sus ramas directas.
  - `🚫 None`: Omite la estructura de carpetas del contexto.
- **Control de Límites y Carga de Archivos:**
  - **All Files**: Por defecto, la app ignora carpetas pesadas (node_modules, target, etc.) y respeta `.gitignore`. Activar esta opción omite esos filtros y fuerza a leer todo (útil para discos o carpetas sin código).
  - **Tree Max**: Define el límite de archivos y carpetas impresas visualmente en el árbol de contexto. Valores más altos (o "∞ Max") generarán árboles enormes, aumentando el coste del token de contexto.
  - **Prompt Max**: Tope de caracteres totales de texto plano permitidos en el prompt antes de truncar.
  > ⚠️ **Peligro (Modos ∞ Max):** El uso de límites infinitos bajo demanda está diseñado para casos donde tienes certeza del volumen de archivos. Si seleccionas "∞" en discos enteros, podrías agotar la memoria RAM o colapsar la UI al intentar cargar millones de elementos.
- **Gestión de Contexto y Estadísticas en Vivo:**
  - Contador de caracteres y estimación de tokens en tiempo real.
- **Puente DOM Desacoplado:**
  - Inyección JavaScript en Proton Lumo parametrizada mediante `lumo_selectors.json` (actualizable sin recompilar la app).

---

## 🛠️ Stack Tecnológico

- **Core & Backend:** Rust (Edition 2021)
- **Framework Desktop:** [Tauri 2.0](https://tauri.app/)
- **Frontend UI:** HTML5 + Vanilla CSS + JavaScript (cero dependencias externas / cero bundler overhead)
- **Gestión de Filesystem:** `ignore` crate para filtrado ágil y `rfd` para diálogos nativos del sistema operativo.

---

## 🚀 Instalación y Uso

### Prerrequisitos
- [Rust & Cargo](https://www.rust-lang.org/)
- Dependencias del sistema para Tauri (ver [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/))

### Ejecución en Desarrollo
```bash
# Iniciar la aplicación
cargo run tauri
# O si tienes instalado tauri-cli:
cargo tauri dev
```

### Compilar para Producción
```bash
cargo tauri build
```

---

## ⚙️ Configuración (`lumo_selectors.json`)

Si Proton Lumo actualiza la estructura de su interfaz web, puedes adaptar los selectores en `lumo_selectors.json` sin necesidad de recompilar el binario:

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

MIT / Apache 2.0 - Desarrollado por Pablo Wenger para el ecosistema **Astrocat**.
