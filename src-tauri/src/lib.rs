use std::sync::Mutex;

use tauri::{ipc::Response, State};

/// The `.epub` the app was launched with (via a file association), handed to
/// the web UI once it is ready to ask for it.
#[derive(Default)]
struct LaunchFile(Mutex<Option<String>>);

fn epub_arg(args: impl IntoIterator<Item = String>) -> Option<String> {
  args
    .into_iter()
    .skip(1)
    .find(|a| a.to_lowercase().ends_with(".epub"))
}

#[tauri::command]
fn take_launch_file(state: State<LaunchFile>) -> Option<String> {
  state.0.lock().ok()?.take()
}

/// Raw bytes of the `.epub` this instance was launched with.
#[tauri::command]
fn read_epub(path: String) -> Result<Response, String> {
  if !path.to_lowercase().ends_with(".epub") {
    return Err("not an .epub file".into());
  }
  std::fs::read(&path).map(Response::new).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // No single-instance plugin: every launch (the exe, or double-clicking an
  // .epub) is its own process and window.
  let builder = tauri::Builder::default();

  // Remembers the window's size, position and maximised state between launches.
  #[cfg(desktop)]
  let builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());

  builder
    .manage(LaunchFile(Mutex::new(epub_arg(std::env::args()))))
    .invoke_handler(tauri::generate_handler![take_launch_file, read_epub])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
