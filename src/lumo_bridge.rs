use serde::Deserialize;
use std::fs;
use std::path::Path;
use tauri::Manager;

#[derive(Deserialize)]
#[allow(dead_code)]
struct LumoSelectors {
    input_selector: String,
    response_container: String,
    loading_indicator: String,
}

fn load_selectors() -> LumoSelectors {
    let path = Path::new("lumo_selectors.json");
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(selectors) = serde_json::from_str(&content) {
            return selectors;
        }
    }
    // Default fallback
    LumoSelectors {
        input_selector: "textarea, input[type=\"text\"]".into(),
        response_container: "[data-testid='assistant-message']".into(),
        loading_indicator: "[data-testid='loading']".into(),
    }
}

pub fn inject_prompt(app_handle: &tauri::AppHandle, prompt: &str) -> Result<(), String> {
    let lumo_webview = app_handle
        .get_webview("lumo")
        .ok_or("Lumo webview not found")?;

    let selectors = load_selectors();
    
    // Escape the prompt for JS injection safely
    let prompt_json = serde_json::to_string(prompt).unwrap_or_else(|_| "\"\"".into());
    
    let js_code = format!(
        r#"
        (function() {{
            const input = document.querySelector('{selector}');
            if (input) {{
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype, 'value'
                ).set || Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'value'
                ).set;
                
                nativeInputValueSetter.call(input, {prompt_val});
                input.dispatchEvent(new Event('input', {{ bubbles: true }}));
            }} else {{
                console.error("Lumo input selector not found");
            }}
        }})();
        "#,
        selector = selectors.input_selector,
        prompt_val = prompt_json
    );
    
    lumo_webview.eval(&js_code).map_err(|e| e.to_string())?;
    Ok(())
}
