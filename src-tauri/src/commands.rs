use chrono::Utc;
use tauri::AppHandle;
use uuid::Uuid;

use crate::models::{FolderEntry, LibraryIndex, NotebookEntry, NotebookManifest};
use crate::storage::{self, Result};

#[tauri::command]
pub fn get_library(app: AppHandle) -> Result<LibraryIndex> {
    storage::read_index(&app)
}

#[tauri::command]
pub fn create_folder(
    app: AppHandle,
    title: String,
    parent_id: Option<String>,
) -> Result<FolderEntry> {
    let mut index = storage::read_index(&app)?;
    let order = index.folders.len() as i32 + index.notebooks.len() as i32;
    let entry = FolderEntry {
        id: Uuid::new_v4().to_string(),
        title,
        parent_id,
        order,
    };
    index.folders.push(entry.clone());
    storage::write_index(&app, &index)?;
    Ok(entry)
}

#[tauri::command]
pub fn rename_folder(app: AppHandle, folder_id: String, title: String) -> Result<()> {
    let mut index = storage::read_index(&app)?;
    if let Some(folder) = index.folders.iter_mut().find(|f| f.id == folder_id) {
        folder.title = title;
    }
    storage::write_index(&app, &index)?;
    Ok(())
}

/// Cascades: deletes nested folders and notebooks (and their on-disk data) too.
#[tauri::command]
pub fn delete_folder(app: AppHandle, folder_id: String) -> Result<()> {
    let mut index = storage::read_index(&app)?;

    let mut folder_ids_to_delete = vec![folder_id.clone()];
    let mut frontier = vec![folder_id];
    while let Some(current) = frontier.pop() {
        for f in index.folders.iter().filter(|f| f.parent_id.as_deref() == Some(current.as_str())) {
            folder_ids_to_delete.push(f.id.clone());
            frontier.push(f.id.clone());
        }
    }

    let notebook_ids_to_delete: Vec<String> = index
        .notebooks
        .iter()
        .filter(|n| {
            n.parent_id
                .as_ref()
                .is_some_and(|p| folder_ids_to_delete.contains(p))
        })
        .map(|n| n.id.clone())
        .collect();

    for nb_id in &notebook_ids_to_delete {
        storage::delete_notebook_dir(&app, nb_id)?;
    }

    index
        .folders
        .retain(|f| !folder_ids_to_delete.contains(&f.id));
    index
        .notebooks
        .retain(|n| !notebook_ids_to_delete.contains(&n.id));
    storage::write_index(&app, &index)?;
    Ok(())
}

#[tauri::command]
pub fn create_notebook(
    app: AppHandle,
    title: String,
    parent_id: Option<String>,
) -> Result<NotebookEntry> {
    let mut index = storage::read_index(&app)?;
    let now = Utc::now();
    let order = index.folders.len() as i32 + index.notebooks.len() as i32;
    let entry = NotebookEntry {
        id: Uuid::new_v4().to_string(),
        title: title.clone(),
        parent_id,
        order,
        created_at: now,
        modified_at: now,
    };

    let first_page_id = Uuid::new_v4().to_string();
    let manifest = NotebookManifest {
        id: entry.id.clone(),
        title,
        page_order: vec![first_page_id.clone()],
        created_at: now,
        modified_at: now,
    };
    storage::write_manifest(&app, &manifest)?;

    let blank_page = serde_json::json!({
        "id": first_page_id,
        "width": 1653.0,
        "height": 2339.0,
        "template": { "kind": "grid" },
        "pdfRef": null,
        "strokes": [],
        "textObjects": [],
        "imageObjects": []
    });
    storage::write_page(&app, &entry.id, &first_page_id, &blank_page)?;

    index.notebooks.push(entry.clone());
    storage::write_index(&app, &index)?;
    Ok(entry)
}

#[tauri::command]
pub fn rename_notebook(app: AppHandle, notebook_id: String, title: String) -> Result<()> {
    let mut index = storage::read_index(&app)?;
    if let Some(nb) = index.notebooks.iter_mut().find(|n| n.id == notebook_id) {
        nb.title = title.clone();
        nb.modified_at = Utc::now();
    }
    storage::write_index(&app, &index)?;

    let mut manifest = storage::read_manifest(&app, &notebook_id)?;
    manifest.title = title;
    manifest.modified_at = Utc::now();
    storage::write_manifest(&app, &manifest)?;
    Ok(())
}

#[tauri::command]
pub fn delete_notebook(app: AppHandle, notebook_id: String) -> Result<()> {
    let mut index = storage::read_index(&app)?;
    index.notebooks.retain(|n| n.id != notebook_id);
    storage::write_index(&app, &index)?;
    storage::delete_notebook_dir(&app, &notebook_id)?;
    Ok(())
}

#[tauri::command]
pub fn get_notebook_manifest(app: AppHandle, notebook_id: String) -> Result<NotebookManifest> {
    storage::read_manifest(&app, &notebook_id)
}

#[tauri::command]
pub fn save_notebook_manifest(app: AppHandle, manifest: NotebookManifest) -> Result<()> {
    storage::write_manifest(&app, &manifest)?;
    let mut index = storage::read_index(&app)?;
    if let Some(nb) = index.notebooks.iter_mut().find(|n| n.id == manifest.id) {
        nb.modified_at = Utc::now();
    }
    storage::write_index(&app, &index)?;
    Ok(())
}

#[tauri::command]
pub fn get_page(app: AppHandle, notebook_id: String, page_id: String) -> Result<serde_json::Value> {
    storage::read_page(&app, &notebook_id, &page_id)
}

#[tauri::command]
pub fn save_page(
    app: AppHandle,
    notebook_id: String,
    page_id: String,
    content: serde_json::Value,
) -> Result<()> {
    storage::write_page(&app, &notebook_id, &page_id, &content)?;
    let mut index = storage::read_index(&app)?;
    if let Some(nb) = index.notebooks.iter_mut().find(|n| n.id == notebook_id) {
        nb.modified_at = Utc::now();
    }
    storage::write_index(&app, &index)?;
    Ok(())
}

#[tauri::command]
pub fn delete_page(app: AppHandle, notebook_id: String, page_id: String) -> Result<()> {
    storage::delete_page_file(&app, &notebook_id, &page_id)
}

/// Copies raw bytes (e.g. a picked PDF or image, already read by the
/// frontend via the fs/dialog plugins) into the notebook's own assets
/// folder and returns the stored file name to reference from page data.
#[tauri::command]
pub fn import_asset(
    app: AppHandle,
    notebook_id: String,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<String> {
    let ext = std::path::Path::new(&file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin");
    let stored_name = format!("{}.{}", Uuid::new_v4(), ext);
    storage::write_asset(&app, &notebook_id, &stored_name, &bytes)?;
    Ok(stored_name)
}

#[tauri::command]
pub fn read_asset(app: AppHandle, notebook_id: String, file_name: String) -> Result<Vec<u8>> {
    storage::read_asset(&app, &notebook_id, &file_name)
}

#[tauri::command]
pub fn save_thumbnail(
    app: AppHandle,
    notebook_id: String,
    page_id: String,
    bytes: Vec<u8>,
) -> Result<()> {
    storage::write_thumbnail(&app, &notebook_id, &page_id, &bytes)
}

#[tauri::command]
pub fn read_thumbnail(app: AppHandle, notebook_id: String, page_id: String) -> Result<Vec<u8>> {
    storage::read_thumbnail(&app, &notebook_id, &page_id)
}

#[tauri::command]
pub fn has_thumbnail(app: AppHandle, notebook_id: String, page_id: String) -> Result<bool> {
    storage::thumbnail_exists(&app, &notebook_id, &page_id)
}
