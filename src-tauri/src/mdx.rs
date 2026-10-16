use std::{io::{BufRead, BufReader}, sync::atomic::{AtomicBool, Ordering}};
use tauri::{ipc::Channel, Manager};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

static BUSY: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub async fn mdx_run(app: tauri::AppHandle, audio: Vec<u8>, on_event: Channel<Value>) -> Result<Value, String> {
    if !cfg!(target_os = "windows") {
        return Err("MDX 暂时只支持 Windows 桌面版".into());
    }
    if audio.is_empty() || audio.len() > 256 * 1024 * 1024 {
        return Err("输入音频为空或超过 256 MiB，请先使用较短的歌曲".into());
    }
    if BUSY.swap(true, Ordering::SeqCst) {
        return Err("另一个 MDX 任务正在运行".into());
    }
    let result = tauri::async_runtime::spawn_blocking(move || run_worker(app, audio, on_event)).await;
    BUSY.store(false, Ordering::SeqCst);
    result.map_err(|e| e.to_string())?
}

fn run_worker(app: tauri::AppHandle, audio: Vec<u8>, on_event: Channel<Value>) -> Result<Value, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?.join("mdx");
    std::fs::create_dir_all(root.join("input")).map_err(|e| e.to_string())?;
    let key = format!("{:x}", Sha256::digest(&audio));
    let input = root.join("input").join(format!("{key}.audio"));
    std::fs::write(&input, audio).map_err(|e| e.to_string())?;
    let binaries = app.path().resource_dir().map_err(|e| e.to_string())?.join("binaries");
    let worker = [binaries.join("mdx-worker.exe"), binaries.join("mdx-worker-x86_64-pc-windows-msvc.exe")]
        .into_iter().find(|path| path.is_file())
        .ok_or("安装包中缺少 MDX 运行时，请重新安装 Windows MDX 版")?;
    let request = json!({"op":"process", "root":root, "input":input});
    let mut command = std::process::Command::new(worker);
    command.args(["--once", &request.to_string()])
        .current_dir(&root)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(|e| format!("无法启动 MDX: {e}"))?;
    let stdout = child.stdout.take().ok_or("无法读取 MDX 输出")?;
    let mut completed = None;
    let mut failure = None;
    for line in BufReader::new(stdout).lines() {
        let line = line.map_err(|e| e.to_string())?;
        if let Ok(event) = serde_json::from_str::<Value>(&line) {
            if event["event"] == "complete" { completed = Some(event.clone()); }
            if event["event"] == "error" { failure = event["error"].as_str().map(str::to_owned); }
            let _ = on_event.send(event);
        }
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    // Source PCM is transient; model and verified separated stems remain cached.
    let _ = std::fs::remove_file(&input);
    if let Some(message) = failure { return Err(message); }
    if !status.success() { return Err(format!("MDX 进程异常退出: {status}")); }
    completed.ok_or_else(|| "MDX 没有生成输出文件".into())
}

#[tauri::command]
pub async fn mdx_read(app: tauri::AppHandle, path: String) -> Result<Vec<u8>, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?.join("mdx").join("separated")
        .canonicalize().map_err(|e| e.to_string())?;
    let artifact = std::path::PathBuf::from(path).canonicalize().map_err(|e| e.to_string())?;
    if !artifact.starts_with(root) || artifact.extension().and_then(|s| s.to_str()) != Some("wav") {
        return Err("只能读取本地分离结果".into());
    }
    std::fs::read(artifact).map_err(|e| e.to_string())
}
