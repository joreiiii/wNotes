use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};
use thiserror::Error;

use crate::models::{LibraryIndex, NotebookManifest};

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("path resolution error: {0}")]
    Path(#[from] tauri::Error),
    #[error("not found: {0}")]
    NotFound(String),
}

impl serde::Serialize for StorageError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, StorageError>;

/// Root of all app data (Tauri's per-app data dir, already namespaced by the app identifier).
fn root_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = app.path().app_data_dir()?;
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn notebooks_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = root_dir(app)?.join("notebooks");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// All ids used in paths are server-generated UUIDs (see commands.rs),
/// never derived from user-supplied titles, so path traversal is not
/// reachable through these helpers.
pub fn notebook_dir(app: &AppHandle, notebook_id: &str) -> Result<PathBuf> {
    let dir = notebooks_dir(app)?.join(notebook_id);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn pages_dir(app: &AppHandle, notebook_id: &str) -> Result<PathBuf> {
    let dir = notebook_dir(app, notebook_id)?.join("pages");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn assets_dir(app: &AppHandle, notebook_id: &str) -> Result<PathBuf> {
    let dir = notebook_dir(app, notebook_id)?.join("assets");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn thumbnails_dir(app: &AppHandle, notebook_id: &str) -> Result<PathBuf> {
    let dir = notebook_dir(app, notebook_id)?.join("thumbnails");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn index_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(root_dir(app)?.join("index.json"))
}

fn manifest_path(app: &AppHandle, notebook_id: &str) -> Result<PathBuf> {
    Ok(notebook_dir(app, notebook_id)?.join("manifest.json"))
}

fn page_path(app: &AppHandle, notebook_id: &str, page_id: &str) -> Result<PathBuf> {
    Ok(pages_dir(app, notebook_id)?.join(format!("{page_id}.json")))
}

pub fn read_index(app: &AppHandle) -> Result<LibraryIndex> {
    let path = index_path(app)?;
    if !path.exists() {
        return Ok(LibraryIndex::default());
    }
    let raw = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&raw)?)
}

pub fn write_index(app: &AppHandle, index: &LibraryIndex) -> Result<()> {
    let path = index_path(app)?;
    fs::write(path, serde_json::to_string_pretty(index)?)?;
    Ok(())
}

pub fn read_manifest(app: &AppHandle, notebook_id: &str) -> Result<NotebookManifest> {
    let path = manifest_path(app, notebook_id)?;
    if !path.exists() {
        return Err(StorageError::NotFound(format!(
            "manifest for notebook {notebook_id}"
        )));
    }
    let raw = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&raw)?)
}

pub fn write_manifest(app: &AppHandle, manifest: &NotebookManifest) -> Result<()> {
    let path = manifest_path(app, &manifest.id)?;
    fs::write(path, serde_json::to_string_pretty(manifest)?)?;
    Ok(())
}

pub fn read_page(app: &AppHandle, notebook_id: &str, page_id: &str) -> Result<serde_json::Value> {
    let path = page_path(app, notebook_id, page_id)?;
    if !path.exists() {
        return Err(StorageError::NotFound(format!("page {page_id}")));
    }
    let raw = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&raw)?)
}

pub fn write_page(
    app: &AppHandle,
    notebook_id: &str,
    page_id: &str,
    content: &serde_json::Value,
) -> Result<()> {
    let path = page_path(app, notebook_id, page_id)?;
    fs::write(path, serde_json::to_string(content)?)?;
    Ok(())
}

pub fn delete_page_file(app: &AppHandle, notebook_id: &str, page_id: &str) -> Result<()> {
    let path = page_path(app, notebook_id, page_id)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

pub fn delete_notebook_dir(app: &AppHandle, notebook_id: &str) -> Result<()> {
    let dir = notebook_dir(app, notebook_id)?;
    if dir.exists() {
        fs::remove_dir_all(dir)?;
    }
    Ok(())
}

/// Validates that `file_name` has no path separators, so it cannot escape
/// the notebook's own assets/thumbnails directory it is joined onto.
pub fn sanitize_file_name(file_name: &str) -> Result<&str> {
    let is_safe = !file_name.is_empty()
        && file_name != "."
        && file_name != ".."
        && !file_name.contains('/')
        && !file_name.contains('\\');
    if is_safe {
        Ok(file_name)
    } else {
        Err(StorageError::NotFound(format!(
            "invalid file name: {file_name}"
        )))
    }
}

pub fn write_asset(
    app: &AppHandle,
    notebook_id: &str,
    file_name: &str,
    bytes: &[u8],
) -> Result<PathBuf> {
    let safe_name = sanitize_file_name(file_name)?;
    let path = assets_dir(app, notebook_id)?.join(safe_name);
    fs::write(&path, bytes)?;
    Ok(path)
}

pub fn read_asset(app: &AppHandle, notebook_id: &str, file_name: &str) -> Result<Vec<u8>> {
    let safe_name = sanitize_file_name(file_name)?;
    let path = assets_dir(app, notebook_id)?.join(safe_name);
    Ok(fs::read(path)?)
}

pub fn write_thumbnail(
    app: &AppHandle,
    notebook_id: &str,
    page_id: &str,
    bytes: &[u8],
) -> Result<()> {
    let path = thumbnails_dir(app, notebook_id)?.join(format!("{page_id}.png"));
    fs::write(path, bytes)?;
    Ok(())
}

pub fn read_thumbnail(app: &AppHandle, notebook_id: &str, page_id: &str) -> Result<Vec<u8>> {
    let path = thumbnails_dir(app, notebook_id)?.join(format!("{page_id}.png"));
    Ok(fs::read(path)?)
}

pub fn thumbnail_exists(app: &AppHandle, notebook_id: &str, page_id: &str) -> Result<bool> {
    let path = thumbnails_dir(app, notebook_id)?.join(format!("{page_id}.png"));
    Ok(path.exists())
}

#[allow(dead_code)]
pub fn app_root(app: &AppHandle) -> Result<PathBuf> {
    root_dir(app)
}
