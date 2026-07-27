use serde::{Deserialize, Serialize};

/// Top-level library tree (folders + notebooks), stored at `index.json`.
/// The frontend owns the deeper page/stroke schema; Rust only persists
/// opaque JSON blobs for page content to avoid duplicating that schema
/// in two languages.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LibraryIndex {
    pub folders: Vec<FolderEntry>,
    pub notebooks: Vec<NotebookEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderEntry {
    pub id: String,
    pub title: String,
    pub parent_id: Option<String>,
    pub order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookEntry {
    pub id: String,
    pub title: String,
    pub parent_id: Option<String>,
    pub order: i32,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub modified_at: chrono::DateTime<chrono::Utc>,
}

/// Per-notebook manifest: `notebooks/{id}/manifest.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookManifest {
    pub id: String,
    pub title: String,
    pub page_order: Vec<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub modified_at: chrono::DateTime<chrono::Utc>,
}
