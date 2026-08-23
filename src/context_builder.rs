use std::path::Path;
use crate::fs_reader::{read_file, render_tree};

fn is_binary_extension(ext: &str) -> bool {
    matches!(
        ext.to_lowercase().as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "ico" | "svg" |
        "mp3" | "wav" | "ogg" | "flac" | "aac" | "m4a" |
        "mp4" | "mkv" | "avi" | "mov" | "webm" | "flv" | "wmv" |
        "pdf" | "zip" | "tar" | "gz" | "rar" | "7z" | "exe" | "dll" | "so" | "dylib" | "bin" | "dat" | "db" | "sqlite" | "sqlite3"
    )
}

const MAX_CONTEXT_CHARS: usize = 60_000;

pub fn build_prompt(
    root_path: &Path,
    selected_files: &[String],
    query: &str,
    tree_mode: &str,
    show_all: bool,
    max_tree_entries: usize,
) -> String {
    let mut prompt = String::new();
    
    // 1. Estructura del proyecto
    if tree_mode != "none" {
        let tree = render_tree(root_path, selected_files, tree_mode, show_all, max_tree_entries);
        if !tree.is_empty() {
            prompt.push_str("## Estructura del proyecto\n```text\n");
            prompt.push_str(&tree);
            prompt.push_str("```\n\n");
        }
    }
    
    // 2. Archivos
    if !selected_files.is_empty() {
        prompt.push_str("## Archivos\n\n");
    
    for file_path_str in selected_files {
        let path = Path::new(file_path_str);
        prompt.push_str(&format!("### Archivo: {}\n", path.display()));
        
        let ext = path.extension().unwrap_or_default().to_string_lossy();
        
        if is_binary_extension(&ext) {
            prompt.push_str("```text\n// Archivo binario o multimedia omitido. Solo se incluyó el nombre en el contexto.\n```\n\n");
            continue;
        }

        let lang = get_language(&ext);
        
        prompt.push_str(&format!("```{}\n", lang));
        
        if let Ok(content) = read_file(path) {
            let chunk = content;
            if prompt.len() + chunk.len() > MAX_CONTEXT_CHARS {
                let remaining = MAX_CONTEXT_CHARS.saturating_sub(prompt.len());
                if remaining > 100 {
                    let truncated: String = chunk.chars().take(remaining).collect();
                    prompt.push_str(&truncated);
                    prompt.push_str("\n\n[...truncado por límite de contexto...]\n");
                } else {
                    prompt.push_str("\n[...truncado por límite de contexto...]\n");
                }
                prompt.push_str("```\n\n");
                break;
            } else {
                prompt.push_str(&chunk);
            }
        } else {
            prompt.push_str("// Error leyendo el archivo (posiblemente binario no reconocido)");
        }
        
        prompt.push_str("\n```\n\n");
    }
    }
    
    // 3. Pregunta
    if !query.trim().is_empty() {
        prompt.push_str("## Pregunta\n");
        prompt.push_str(query);
        prompt.push('\n');
    }
    
    prompt
}

fn get_language(ext: &str) -> &'static str {
    match ext {
        "rs" => "rust",
        "ts" | "tsx" => "typescript",
        "js" | "jsx" => "javascript",
        "py" => "python",
        "toml" => "toml",
        "json" => "json",
        "html" => "html",
        "css" => "css",
        "md" => "markdown",
        "yml" | "yaml" => "yaml",
        "sh" => "bash",
        "c" => "c",
        "cpp" | "cc" | "cxx" => "cpp",
        "go" => "go",
        "java" => "java",
        _ => "text",
    }
}
