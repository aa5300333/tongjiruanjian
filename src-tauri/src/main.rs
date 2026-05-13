#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod lottery_parser;

use tauri::{Manager, Window};
use lottery_parser::{ParseResult, parse_input_rust};

// 定义 Tauri 命令：高效率解析
#[tauri::command]
fn parse_lottery_data(input: String) -> Result<Vec<ParseResult>, String> {
    println!("Rust parsing input: {}", input);
    let results = parse_input_rust(&input);
    Ok(results)
}

// 定义 Tauri 命令：显示预加载的录入窗口
#[tauri::command]
async fn show_entry_window(handle: tauri::AppHandle) {
    if let Some(window) = handle.get_window("entry") {
        window.show().unwrap();
        window.set_focus().unwrap();
    }
}

// 定义 Tauri 命令：隐藏窗口
#[tauri::command]
async fn hide_window(window: Window) {
    window.hide().unwrap();
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // 在启动时，你可以对窗口进行一些预处理
            let main_window = app.get_window("main").unwrap();
            let entry_window = app.get_window("entry").unwrap();
            
            // 确保录入窗口初始状态是隐藏的
            entry_window.hide().unwrap();
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            parse_lottery_data,
            show_entry_window,
            hide_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
