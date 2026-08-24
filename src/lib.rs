pub mod fs_reader;
pub mod context_builder;
pub mod lumo_bridge;
pub mod commands;

use std::sync::{Arc, Mutex};
use tauri::{Manager, WindowEvent};
use tauri::PhysicalPosition;

pub struct SplitState(pub Arc<Mutex<f64>>);

pub fn update_webview_bounds(app: &tauri::AppHandle, ratio: f64) -> Result<(), String> {
    let window = app.get_window("main").ok_or("Main window not found")?;
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let clamped_ratio = ratio.clamp(0.15, 0.85);
    let ui_width = (size.width as f64 * clamped_ratio).round() as u32;
    let lumo_width = size.width.saturating_sub(ui_width);

    if let Some(ui) = app.get_webview("ui") {
        let _ = ui.set_bounds(tauri::Rect {
            position: tauri::Position::Physical(PhysicalPosition::new(0, 0)),
            size: tauri::Size::Physical(tauri::PhysicalSize::new(ui_width, size.height)),
        });
    }

    if let Some(lumo) = app.get_webview("lumo") {
        let _ = lumo.set_bounds(tauri::Rect {
            position: tauri::Position::Physical(PhysicalPosition::new(ui_width as i32, 0)),
            size: tauri::Size::Physical(tauri::PhysicalSize::new(lumo_width, size.height)),
        });
    }

    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let split_ratio = Arc::new(Mutex::new(0.50));
            app.manage(SplitState(split_ratio.clone()));

            let window = tauri::window::WindowBuilder::new(app, "main")
                .title("Astrocat Lumo")
                .inner_size(1400.0, 850.0)
                .build()?;

            let size = window.inner_size()?;
            let initial_ratio = 0.50;
            let ui_width = (size.width as f64 * initial_ratio).round() as u32;
            let lumo_width = size.width.saturating_sub(ui_width);

            let ui_webview = tauri::webview::WebviewBuilder::new("ui", tauri::WebviewUrl::App("index.html".into()));
            let _ui = window.add_child(
                ui_webview,
                tauri::Position::Physical(PhysicalPosition::new(0, 0)),
                tauri::Size::Physical(tauri::PhysicalSize::new(ui_width, size.height))
            )?;

            let app_handle = app.handle().clone();
            let lumo_url = tauri::WebviewUrl::External("https://lumo.proton.me".parse().unwrap());
            let lumo_webview = tauri::webview::WebviewBuilder::new("lumo", lumo_url)
                .initialization_script(r#"
                    window.open = function(url) { 
                        window.location.href = url; 
                        return window; 
                    };
                    document.addEventListener('click', function(e) {
                        let target = e.target.closest('a');
                        if (target && target.getAttribute('target') === '_blank') {
                            target.setAttribute('target', '_self');
                        }
                    });
                "#)
                .on_new_window(move |url, _| {
                    if let Some(lumo) = app_handle.get_webview("lumo") {
                        let _ = lumo.navigate(url);
                    }
                    tauri::webview::NewWindowResponse::Deny
                })
                .on_navigation(|_| true);
            let _lumo = window.add_child(
                lumo_webview,
                tauri::Position::Physical(PhysicalPosition::new(ui_width as i32, 0)),
                tauri::Size::Physical(tauri::PhysicalSize::new(lumo_width, size.height))
            )?;

            let split_ratio_clone = split_ratio.clone();
            let app_handle_for_resize = app.handle().clone();
            window.on_window_event(move |event| {
                if let WindowEvent::Resized(_) = event {
                    let ratio = *split_ratio_clone.lock().unwrap();
                    let _ = update_webview_bounds(&app_handle_for_resize, ratio);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::select_directory,
            commands::get_file_tree,
            commands::read_directory,
            commands::build_context,
            commands::get_sibling_files,
            commands::inject_to_lumo,
            commands::set_split_ratio,
            commands::drag_split_delta,
            commands::open_url, commands::reload_lumo
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
