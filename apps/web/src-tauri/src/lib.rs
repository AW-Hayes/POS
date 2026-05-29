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

/// On Windows, WebView2 runs under network isolation that can block loopback
/// (localhost / 127.0.0.1) connections to the local API server. Running
/// CheckNetIsolation at startup exempts the WebView2 host process so the app
/// can always reach the local API without requiring manual intervention.
#[cfg(target_os = "windows")]
fn exempt_webview2_loopback() {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    // Best-effort: silently ignore failures (e.g. process not elevated).
    let _ = std::process::Command::new("CheckNetIsolation.exe")
        .args(["LoopbackExempt", "-a", "-n=Microsoft.Win32WebViewHost_cw5n1h2txyewy"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    exempt_webview2_loopback();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![print_to_printer])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
