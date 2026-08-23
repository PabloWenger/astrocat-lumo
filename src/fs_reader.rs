use ignore::{WalkBuilder, Walk};
use std::fs;
use std::path::{Path, PathBuf};

fn get_walker(root_path: &Path, show_all: bool) -> Walk {
    let mut builder = WalkBuilder::new(root_path);
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

pub fn render_tree(root_path: &Path, selected_files: &[String], mode: &str, show_all: bool) -> String {
    if mode == "none" {
        return String::new();
    }

    if mode == "scoped" && !selected_files.is_empty() {
        return render_scoped_tree(root_path, selected_files, show_all);
    }

    render_full_tree(root_path, show_all)
}

fn render_full_tree(root_path: &Path, show_all: bool) -> String {
    let mut tree_str = String::new();
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
    fs::read_to_string(path).map_err(|e| e.to_string())
}
