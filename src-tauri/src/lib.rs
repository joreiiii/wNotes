mod commands;
mod models;
mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_library,
            commands::create_folder,
            commands::rename_folder,
            commands::delete_folder,
            commands::create_notebook,
            commands::rename_notebook,
            commands::delete_notebook,
            commands::get_notebook_manifest,
            commands::save_notebook_manifest,
            commands::get_page,
            commands::save_page,
            commands::delete_page,
            commands::import_asset,
            commands::read_asset,
            commands::save_thumbnail,
            commands::read_thumbnail,
            commands::has_thumbnail,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
