mod mdx;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![mdx::mdx_run, mdx::mdx_read])
        .run(tauri::generate_context!())
        .expect("error while running LEoKTV");
}
