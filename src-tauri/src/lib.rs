mod export_save;
mod png_export;
mod project_fs;
mod ssrf_guard;

use serde::Serialize;
use std::collections::HashMap;
use tauri::ipc::Channel;

#[derive(Clone, Serialize)]
#[serde(tag = "type", content = "data")]
pub enum StreamPayload {
    Chunk(String),
    Error(String),
    Done,
}

#[tauri::command]
async fn proxy_stream_request(
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: String,
    allow_private_network: Option<bool>,
    allowed_internal_hosts: Option<Vec<String>>,
    channel: Channel<StreamPayload>,
) -> Result<(), String> {
    let opts = ssrf_guard::SSRFGuardOptions {
        allow_private_network: allow_private_network.unwrap_or(false),
        allowed_internal_hosts: allowed_internal_hosts.unwrap_or_default(),
    };
    if let Some(err_msg) = ssrf_guard::validate_target_url(&url, &opts).to_error_string() {
        let _ = channel.send(StreamPayload::Error(err_msg));
        return Ok(());
    }

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(std::time::Duration::from_secs(30))
        .read_timeout(std::time::Duration::from_secs(90)) // 每次读取空闲超时；正常持续输出的流不受固定总时长截断
        .tcp_keepalive(Some(std::time::Duration::from_secs(15))) // 保持底层 TCP 连接活跃，防止网关意外切断长连接
        .build()
        .map_err(|e| e.to_string())?;

    let mut current_url = url;
    let mut hop_count: u8 = 0;
    let res = loop {
        let mut req = match method.to_uppercase().as_str() {
            "POST" => client.post(&current_url),
            "GET" => client.get(&current_url),
            _ => client.post(&current_url),
        };

        for (k, v) in &headers {
            req = req.header(k, v);
        }

        if !body.is_empty() {
            req = req.body(body.clone());
        }

        let resp = match req.send().await {
            Ok(r) => r,
            Err(e) => {
                let _ = channel.send(StreamPayload::Error(format!("网络请求失败: {}", e)));
                return Ok(());
            }
        };

        let status = resp.status();
        if status.is_redirection() {
            hop_count += 1;
            let location = match resp.headers().get(reqwest::header::LOCATION).and_then(|l| l.to_str().ok()) {
                Some(loc) => loc,
                None => {
                    let _ = channel.send(StreamPayload::Error("重定向响应缺失 Location 头".to_string()));
                    return Ok(());
                }
            };

            let next_url = match reqwest::Url::parse(&current_url).and_then(|base| base.join(location)) {
                Ok(u) => u.to_string(),
                Err(e) => {
                    let _ = channel.send(StreamPayload::Error(format!("[SSRF_BLOCKED] H: 重定向目标 URL 非法: {}", e)));
                    return Ok(());
                }
            };

            if let Err(blocked) = ssrf_guard::validate_redirect_hop(hop_count, &next_url, &opts) {
                let _ = channel.send(StreamPayload::Error(blocked.to_error_string().unwrap_or_default()));
                return Ok(());
            }

            current_url = next_url;
            continue;
        }

        break resp;
    };

    let status = res.status();
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        let mut msg = format!("HTTP 错误 {}: {}", status.as_u16(), text);
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
            if let Some(m) = json.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()) {
                msg = format!("HTTP 错误 {}: {}", status.as_u16(), m);
            } else if let Some(m) = json.get("message").and_then(|m| m.as_str()) {
                msg = format!("HTTP 错误 {}: {}", status.as_u16(), m);
            }
        }
        let _ = channel.send(StreamPayload::Error(msg));
        return Ok(());
    }

    use futures_util::StreamExt;
    let mut stream = res.bytes_stream();

    while let Some(chunk_res) = stream.next().await {
        match chunk_res {
            Ok(bytes) => {
                let text = String::from_utf8_lossy(&bytes).to_string();
                let _ = channel.send(StreamPayload::Chunk(text));
            }
            Err(e) => {
                let _ = channel.send(StreamPayload::Error(format!("读取流数据异常: {}", e)));
                return Ok(());
            }
        }
    }

    let _ = channel.send(StreamPayload::Done);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 高保真导出：离屏窗口通过该协议加载自包含 HTML (doc/feature/high-fidelity-png-export)
        .register_uri_scheme_protocol(png_export::EXPORT_SCHEME, |_ctx, request| {
            let token = request.uri().path().trim_start_matches('/').to_string();
            match png_export::get_html(&token) {
                Some(html) => tauri::http::Response::builder()
                    .status(200)
                    .header("Content-Type", "text/html; charset=utf-8")
                    .header("Cache-Control", "no-store")
                    .body(html.into_bytes())
                    .unwrap_or_else(|_| {
                        tauri::http::Response::builder()
                            .status(500)
                            .body(Vec::new())
                            .expect("empty response")
                    }),
                None => tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .expect("empty response"),
            }
        })
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
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            proxy_stream_request,
            project_fs::project_ensure_dir,
            project_fs::project_exists,
            project_fs::project_read_text,
            project_fs::read_text_context_file,
            project_fs::project_write_text_atomic,
            project_fs::project_append_line,
            project_fs::project_read_tail_lines,
            project_fs::project_read_all_lines,
            project_fs::project_write_binary,
            project_fs::project_read_binary,
            project_fs::project_list_dir,
            project_fs::project_delete,
            png_export::export_screen_png,
            export_save::export_save_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
