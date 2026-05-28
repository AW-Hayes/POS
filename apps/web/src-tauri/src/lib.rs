use std::io::Write;
use std::net::TcpStream;
use std::time::Duration;

/// Send raw bytes to a network ESC/POS printer (e.g. TCP port 9100).
#[tauri::command]
fn print_to_printer(host: String, port: u16, data: Vec<u8>) -> Result<(), String> {
    let addr = format!("{}:{}", host, port);
    let mut stream = TcpStream::connect_timeout(
        &addr.parse().map_err(|e: std::net::AddrParseError| e.to_string())?,
        Duration::from_secs(5),
    )
    .map_err(|e| format!("Cannot connect to printer at {addr}: {e}"))?;
    stream.write_all(&data).map_err(|e| format!("Print error: {e}"))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![print_to_printer])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
