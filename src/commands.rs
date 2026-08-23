use std::path::Path;
use crate::{fs_reader, context_builder, lumo_bridge};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn select_directory() -> Result<String, String> {
    if let Some(folder) = rfd::FileDialog::new().pick_folder() {
        Ok(folder.to_string_lossy().to_string())
    } else {
        Err("No directory selected".into())
    }
}

#[tauri::command]
pub fn get_file_tree(path: String, show_all: Option<bool>) -> Result<fs_reader::FileNode, String> {
    fs_reader::build_tree(Path::new(&path), show_all.unwrap_or(false))
}

#[tauri::command]
pub fn read_directory(path: String, show_all: Option<bool>) -> Result<Vec<fs_reader::DirEntry>, String> {
    fs_reader::read_directory_entries(Path::new(&path), show_all.unwrap_or(false))
}

#[tauri::command]
pub fn build_context(
    root: String,
    files: Vec<String>,
    query: String,
    tree_mode: Option<String>,
    show_all: Option<bool>,
    max_tree_entries: Option<usize>,
) -> Result<String, String> {
    let mode = tree_mode.unwrap_or_else(|| "full".into());
    let limit = max_tree_entries.unwrap_or(2500);
    let prompt = context_builder::build_prompt(
        Path::new(&root),
        &files,
        &query,
        &mode,
        show_all.unwrap_or(false),
        limit,
    );
    Ok(prompt)
}

#[tauri::command]
pub fn get_sibling_files(files: Vec<String>) -> Result<Vec<String>, String> {
    let mut siblings = Vec::new();
    let mut checked_dirs = std::collections::HashSet::new();

    for f in files {
        let path = Path::new(&f);
        if let Some(parent) = path.parent() {
            if checked_dirs.insert(parent.to_path_buf()) {
                if let Ok(entries) = std::fs::read_dir(parent) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_file() {
                            siblings.push(p.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }
    Ok(siblings)
}

#[tauri::command]
pub fn inject_to_lumo(app: AppHandle, text: String) -> Result<(), String> {
    lumo_bridge::inject_prompt(&app, &text)
}

#[tauri::command]
pub fn set_split_ratio(app: AppHandle, ratio: f64, state: tauri::State<'_, crate::SplitState>) -> Result<(), String> {
    if let Ok(mut r) = state.0.lock() {
        *r = ratio;
    }
    crate::update_webview_bounds(&app, ratio)
}

#[tauri::command]
pub fn drag_split_delta(
    app: AppHandle,
    delta_px: f64,
    state: tauri::State<'_, crate::SplitState>,
) -> Result<f64, String> {
    let window = app.get_window("main").ok_or("Main window not found")?;
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    let logical_width = size.width as f64 / scale_factor;

    if logical_width <= 0.0 {
        return Err("Invalid window width".into());
    }

    let mut ratio_guard = state.0.lock().map_err(|e| e.to_string())?;
    let current_ratio = *ratio_guard;
    let delta_ratio = delta_px / logical_width;
    let new_ratio = (current_ratio + delta_ratio).clamp(0.15, 0.85);
    *ratio_guard = new_ratio;

    crate::update_webview_bounds(&app, new_ratio)?;
    Ok(new_ratio)
}
