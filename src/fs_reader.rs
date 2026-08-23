use ignore::{WalkBuilder, Walk};
use std::fs;
use std::path::{Path, PathBuf};

fn get_walker(root_path: &Path, show_all: bool) -> Walk {
    let mut builder = WalkBuilder::new(root_path);
    builder.max_depth(Some(64));
    if show_all {
        builder.hidden(false).ignore(false).git_ignore(false);
        // Only ignore .git to prevent absolute chaos, but show everything else
        builder.filter_entry(|e| e.file_name() != ".git");
    } else {
        builder.filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !matches!(
                name.as_ref(),
                "node_modules" | "target" | ".git" | ".idea" | ".vscode" | "dist" | "build" | "__pycache__" | ".next" | ".svelte-kit" | "coverage"
            )
        });
    }
    builder.build()
}

#[derive(Debug, serde::Serialize, Clone)]
pub struct DirEntry {
    pub name: String,
    pub path: PathBuf,
    pub is_dir: bool,
}

pub fn read_directory_entries(dir_path: &Path, show_all: bool) -> Result<Vec<DirEntry>, String> {
    if !dir_path.exists() {
        return Err("Directory does not exist".into());
    }
    
    let entries = fs::read_dir(dir_path).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        
        if !show_all {
            if matches!(
                name.as_str(),
                "node_modules" | "target" | ".git" | ".idea" | ".vscode" | "dist" | "build" | "__pycache__" | ".next" | ".svelte-kit" | "coverage" | ".DS_Store" | "Thumbs.db"
            ) || name.starts_with('.') {
                continue;
            }
        } else if name == ".git" {
            continue;
        }
        
        let path = entry.path();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        result.push(DirEntry {
            name,
            path,
            is_dir,
        });
    }
    
    result.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });
    
    Ok(result)
}

#[derive(Debug, serde::Serialize)]
pub struct FileNode {
    pub name: String,
    pub path: PathBuf,
    pub is_dir: bool,
    pub children: Vec<FileNode>,
}

pub fn build_tree(root_path: &Path, show_all: bool) -> Result<FileNode, String> {
    if !root_path.exists() {
        return Err("Path does not exist".into());
    }

    let mut root_node = FileNode {
        name: root_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        path: root_path.to_path_buf(),
        is_dir: true,
        children: Vec::new(),
    };

    let walker = get_walker(root_path, show_all);

    for result in walker {
        if let Ok(entry) = result {
            let path = entry.path();
            if path == root_path {
                continue;
            }
            if let Ok(relative) = path.strip_prefix(root_path) {
                let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
                insert_node(&mut root_node, relative, path.to_path_buf(), is_dir);
            }
        }
    }

    Ok(root_node)
}

fn insert_node(root: &mut FileNode, relative: &Path, full_path: PathBuf, is_dir: bool) {
    let mut current = root;
    let components: Vec<_> = relative.components().collect();
    
    for (i, component) in components.iter().enumerate() {
        let name = component.as_os_str().to_string_lossy().to_string();
        let is_last = i == components.len() - 1;
        
        let pos = current.children.iter().position(|c| c.name == name);
        if let Some(idx) = pos {
            current = &mut current.children[idx];
        } else {
            let new_node = FileNode {
                name: name.clone(),
                // Only the actual file/folder gets the real path to be selected
                path: if is_last { full_path.clone() } else { PathBuf::new() },
                is_dir: if is_last { is_dir } else { true },
                children: Vec::new(),
            };
            current.children.push(new_node);
            current = current.children.last_mut().unwrap();
        }
    }
}

use std::collections::HashSet;

pub fn render_tree(root_path: &Path, selected_files: &[String], mode: &str, show_all: bool, max_entries: usize) -> String {
    if mode == "none" {
        return String::new();
    }

    if mode == "scoped" && !selected_files.is_empty() {
        return render_scoped_tree(root_path, selected_files, show_all);
    }

    render_full_tree(root_path, show_all, max_entries)
}

fn render_full_tree(root_path: &Path, show_all: bool, max_entries: usize) -> String {
    let mut tree_str = String::new();
    let mut count = 0;
    let limit = if max_entries == 0 { usize::MAX } else { max_entries };
    let walker = get_walker(root_path, show_all);
    
    for result in walker {
        if let Ok(entry) = result {
            let path = entry.path();
            let relative = path.strip_prefix(root_path).unwrap_or(path);
            let depth = relative.components().count();
            
            if depth == 0 {
                tree_str.push_str(&format!("{}\n", root_path.file_name().unwrap_or_default().to_string_lossy()));
                continue;
            }
            
            count += 1;
            if count > limit {
                tree_str.push_str(&format!("  [... árbol limitado a los primeros {} elementos. Usa '∞ Max' para volcar todo sin límite ...]\n", limit));
                break;
            }
            
            let indent = "  ".repeat(depth.saturating_sub(1));
            let prefix = if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                "📂"
            } else {
                "📄"
            };
            
            tree_str.push_str(&format!("{}{} {}\n", indent, prefix, relative.file_name().unwrap_or_default().to_string_lossy()));
        }
    }
    tree_str
}

fn render_scoped_tree(root_path: &Path, selected_files: &[String], show_all: bool) -> String {
    let mut relevant_dirs = HashSet::new();
    let mut ancestor_dirs = HashSet::new();
    
    for file_str in selected_files {
        let path = PathBuf::from(file_str);
        if let Some(parent) = path.parent() {
            relevant_dirs.insert(parent.to_path_buf());
            
            let mut curr = parent;
            while let Some(p) = curr.parent() {
                ancestor_dirs.insert(curr.to_path_buf());
                if curr == root_path {
                    break;
                }
                curr = p;
            }
        }
    }
    ancestor_dirs.insert(root_path.to_path_buf());

    let mut tree_str = String::new();
    let walker = get_walker(root_path, show_all);

    for result in walker {
        if let Ok(entry) = result {
            let path = entry.path();
            
            if path == root_path {
                tree_str.push_str(&format!("{}\n", root_path.file_name().unwrap_or_default().to_string_lossy()));
                continue;
            }

            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            let parent = path.parent().unwrap_or(root_path);

            let is_ancestor = is_dir && ancestor_dirs.contains(path);
            let is_sibling_or_selected = relevant_dirs.contains(parent);

            if is_ancestor || is_sibling_or_selected {
                let relative = path.strip_prefix(root_path).unwrap_or(path);
                let depth = relative.components().count();
                let indent = "  ".repeat(depth.saturating_sub(1));
                let prefix = if is_dir { "📂" } else { "📄" };
                
                let is_selected = selected_files.iter().any(|f| Path::new(f) == path);
                let marker = if is_selected { " *" } else { "" };

                tree_str.push_str(&format!("{}{} {}{}\n", indent, prefix, relative.file_name().unwrap_or_default().to_string_lossy(), marker));
            }
        }
    }
    tree_str
}

pub fn read_file(path: &Path) -> Result<String, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    
    // Omit files larger than 5MB
    if metadata.len() > 5 * 1024 * 1024 {
        return Err("El archivo supera los 5MB y fue omitido para prevenir cuelgues.".into());
    }

    // Peek first 1024 bytes to check for null bytes (heuristic for binary files without extensions)
    if let Ok(mut file) = fs::File::open(path) {
        use std::io::Read;
        let mut buffer = [0; 1024];
        if let Ok(bytes_read) = file.read(&mut buffer) {
            if buffer[..bytes_read].contains(&0) {
                return Err("Binario detectado (contiene bytes nulos) y fue omitido.".into());
            }
        }
    }

    fs::read_to_string(path).map_err(|e| format!("Error decodificando UTF-8: {}", e))
}
