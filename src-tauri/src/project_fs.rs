//! 工程文件夹读写 (A2 / T-AE-39, T-AE-40, T-AE-41)
//!
//! PRD D1 / §3.8.2 指定工程为一个文件夹，自动保存采用「临时文件 + 原子重命名」。
//! 此前整个文件 IO 层不存在，实际走 localStorage（ISSUE-008），带来两个后果：
//!   1. ~5–10MB 硬上限，写满抛 QuotaExceededError 且无捕获，会连带导致工程保存失败；
//!   2. 会话存档等体积敏感的功能完全无处落盘。
//!
//! 安全边界：**不引入 tauri-plugin-fs 的宽泛作用域**，而是由这里的命令强制
//! 「一切相对路径必须落在工程根目录内」。调用方无法通过 `..` 或绝对路径越界。

use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Component, Path, PathBuf};

/// 校验相对路径并拼出绝对路径。拒绝绝对路径、`..` 回溯与空段。
fn resolve(root: &str, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() {
        return Err(format!("拒绝绝对路径: {rel}"));
    }
    for comp in rel_path.components() {
        match comp {
            Component::Normal(_) => {}
            Component::CurDir => {}
            _ => return Err(format!("路径越界或非法: {rel}")),
        }
    }
    let root_path = Path::new(root);
    if !root_path.is_absolute() {
        return Err(format!("工程根目录必须是绝对路径: {root}"));
    }
    Ok(root_path.join(rel_path))
}

/// Descendants of a chosen project directory may not redirect writes through symlinks.
/// Like recovery claims, this guards existing paths, not hostile same-user directory swapping.
pub(crate) fn controlled_directory(root:&str,rel:&str)->Result<PathBuf,String>{
    resolve(root,rel)?;
    let canonical_root=existing_directory(root)?;let mut current=canonical_root.clone();
    for component in Path::new(rel).components(){
        if let Component::Normal(part)=component{
            current.push(part);
            match fs::symlink_metadata(&current){
                Ok(meta) if meta.file_type().is_symlink()||!meta.is_dir()=>return Err("工程写入目录不能是符号链接或文件".into()),
                Ok(_)=>{},
                Err(error) if error.kind()==std::io::ErrorKind::NotFound=>{
                    match fs::create_dir(&current){Ok(())=>{},Err(error) if error.kind()==std::io::ErrorKind::AlreadyExists=>{},Err(error)=>return Err(error.to_string())}
                    let meta=fs::symlink_metadata(&current).map_err(|e|e.to_string())?;
                    if meta.file_type().is_symlink()||!meta.is_dir(){return Err("工程写入目录发生变化".into());}
                },
                Err(error)=>return Err(error.to_string()),
            }
            if !fs::canonicalize(&current).map_err(|e|e.to_string())?.starts_with(&canonical_root){return Err("工程写入目录越界".into());}
        }
    }
    Ok(current)
}

fn atomic_project_write(root:&str,rel:&str,contents:&[u8])->Result<(),String>{
    let _project_guard=crate::project_snapshot::guard(root,rel)?;
    let _task_guard=crate::task_fs::guard_write(root,rel)?;
    atomic_project_write_unlocked(root,rel,contents)
}
pub(crate) fn atomic_project_write_unlocked(root:&str,rel:&str,contents:&[u8])->Result<(),String>{
    resolve(root,rel)?;
    let relative=Path::new(rel);let name=relative.file_name().ok_or("缺少工程文件名")?;
    let parent=controlled_directory(root,relative.parent().unwrap_or(Path::new("")).to_str().ok_or("工程文件路径无效")?)?;
    let path=parent.join(name);
    if let Ok(meta)=fs::symlink_metadata(&path){if meta.file_type().is_symlink()||!meta.is_file(){return Err("工程写入目标不能是符号链接或非普通文件".into());}}
    static SEQUENCE:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(0);
    let sequence=SEQUENCE.fetch_add(1,std::sync::atomic::Ordering::Relaxed);
    let now=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e|e.to_string())?.as_nanos();
    let temporary=parent.join(format!(".{}.{}.{now}.{sequence}.tmp",name.to_string_lossy(),std::process::id()));
    let result=(||{
        let mut file=fs::OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|e|e.to_string())?;
        file.write_all(contents).and_then(|_|file.sync_all()).map_err(|e|e.to_string())?;drop(file);
        fs::rename(&temporary,&path).map_err(|e|e.to_string())
    })();
    if result.is_err(){let _=fs::remove_file(temporary);}result
}

/// Only existing absolute directories may be passed to the OS file manager.
fn existing_directory(root: &str) -> Result<PathBuf, String> {
    let path = Path::new(root);
    if root.is_empty() || !path.is_absolute() {
        return Err("工程目录必须是本地绝对路径".into());
    }
    let directory = fs::canonicalize(path).map_err(|e| format!("无法访问工程目录: {e}"))?;
    if !directory.is_dir() {
        return Err("工程路径不是目录".into());
    }
    Ok(directory)
}

/// Bounded text reads for task manifests/artifacts. A quota is checked both before and during IO.
#[tauri::command]
pub fn project_read_text_limited(root:String,rel:String,max_bytes:usize)->Result<Option<String>,String>{
    let _project_guard=crate::project_snapshot::guard(&root,&rel)?;
    if max_bytes==0||max_bytes>4*1024*1024{return Err("文本读取额度无效".into());}
    let path=resolve(&root,&rel)?;
    let canonical_root=existing_directory(&root)?;
    let canonical=match fs::canonicalize(&path){Ok(p)=>p,Err(e) if e.kind()==std::io::ErrorKind::NotFound=>return Ok(None),Err(e)=>return Err(e.to_string())};
    if !canonical.starts_with(canonical_root){return Err("任务文本路径越界".into());}
    // Reject pipes/devices before opening: opening a FIFO can block before File::metadata.
    if !fs::metadata(&canonical).map_err(|e|e.to_string())?.is_file(){return Err("任务文本不是普通文件".into());}
    let file=fs::File::open(canonical).map_err(|e|e.to_string())?;
    if !file.metadata().map_err(|e|e.to_string())?.is_file(){return Err("任务文本不是文件".into());}
    if file.metadata().map_err(|e|e.to_string())?.len()>max_bytes as u64{return Err("任务文本超过读取额度".into());}
    let mut bytes=Vec::new();file.take((max_bytes+1) as u64).read_to_end(&mut bytes).map_err(|e|e.to_string())?;
    if bytes.len()>max_bytes{return Err("任务文本在读取时超过额度".into());}
    String::from_utf8(bytes).map(Some).map_err(|_|"任务文本不是UTF-8".into())
}

#[cfg(test)]
mod bounded_task_text_tests {
    use super::*;
    #[test]
    fn bounded_task_text_counts_bytes_and_rejects_non_files() {
        let root=std::env::temp_dir().join(format!("tdesign-text-{}",std::process::id()));
        fs::create_dir_all(&root).unwrap();let base=root.to_str().unwrap().to_owned();
        fs::write(root.join("a.txt"),"中文").unwrap();
        assert_eq!(project_read_text_limited(base.clone(),"a.txt".into(),6).unwrap(),Some("中文".into()));
        assert!(project_read_text_limited(base.clone(),"a.txt".into(),5).is_err());
        assert!(project_read_text_limited(base.clone(),"a.txt".into(),0).is_err());
        assert!(project_read_text_limited(base.clone(),"../elsewhere".into(),10).is_err());
        assert!(project_read_text_limited(base.clone(),".".into(),10).is_err());
        assert_eq!(project_read_text_limited(base.clone(),"missing".into(),10).unwrap(),None);
        fs::write(root.join("invalid"),[0xff]).unwrap();
        assert!(project_read_text_limited(base,"invalid".into(),10).is_err());fs::remove_dir_all(root).unwrap();
    }
    #[test]
    #[cfg(unix)]
    fn bounded_task_text_cannot_read_symlink_outside_project() {
        use std::os::unix::fs::symlink;
        let root=std::env::temp_dir().join(format!("tdesign-bounded-text-link-{}",std::process::id()));
        let outside=root.with_extension("outside");fs::create_dir_all(&root).unwrap();fs::write(&outside,"private").unwrap();symlink(&outside,root.join("link")).unwrap();
        assert!(project_read_text_limited(root.to_str().unwrap().into(),"link".into(),100).is_err());
        fs::remove_dir_all(root).unwrap();fs::remove_file(outside).unwrap();
    }
}

#[cfg(test)]
mod bounded_media_tests {
    use super::*;
    #[test]
    fn atomic_media_and_text_publications_never_share_a_temporary_file(){
        let root=std::env::temp_dir().join(format!("tdesign-atomic-media-{}",std::process::id()));fs::create_dir_all(&root).unwrap();let base=root.to_str().unwrap().to_owned();
        project_write_binary(base.clone(),"assets/history/image.png".into(),"AAEC/w==".into()).unwrap();
        assert_eq!(fs::read(root.join("assets/history/image.png")).unwrap(),[0u8,1,2,255]);
        let mut threads=Vec::new();for index in 0..12{let path=base.clone();threads.push(std::thread::spawn(move||project_write_text_atomic(path,"tasks/design-a/state.json".into(),format!("{{\"winner\":{index}}}")).unwrap()));}
        for thread in threads{thread.join().unwrap();}
        let winner:serde_json::Value=serde_json::from_str(&fs::read_to_string(root.join("tasks/design-a/state.json")).unwrap()).unwrap();assert!(winner["winner"].as_u64().unwrap()<12);
        assert_eq!(fs::read_dir(root.join("tasks/design-a")).unwrap().count(),1);fs::remove_dir_all(root).unwrap();
    }
    #[test]
    #[cfg(unix)]
    fn media_and_history_writes_refuse_symlinked_descendants(){
        use std::os::unix::fs::symlink;
        let root=std::env::temp_dir().join(format!("tdesign-atomic-link-{}",std::process::id()));let outside=root.with_extension("outside");fs::create_dir_all(&root).unwrap();fs::create_dir_all(&outside).unwrap();fs::write(outside.join("source"),"original").unwrap();
        symlink(&outside,root.join("assets")).unwrap();symlink(outside.join("source"),root.join("history.json")).unwrap();let base=root.to_str().unwrap().to_owned();
        assert!(project_ensure_dir(base.clone(),"assets/history".into()).is_err());
        assert!(project_write_binary(base.clone(),"assets/history/image.png".into(),"YQ==".into()).is_err());
        assert!(project_write_text_atomic(base,"history.json".into(),"changed".into()).is_err());
        assert_eq!(fs::read_to_string(outside.join("source")).unwrap(),"original");assert!(!outside.join("history").exists());fs::remove_dir_all(root).unwrap();fs::remove_dir_all(outside).unwrap();
    }
    #[test]
    fn bounded_media_reads_exact_bytes_and_rejects_limits_and_non_files(){
        let root=std::env::temp_dir().join(format!("tdesign-media-{}",std::process::id()));fs::create_dir_all(&root).unwrap();let base=root.to_str().unwrap().to_owned();
        fs::write(root.join("image.png"),[0u8,1,2,255]).unwrap();
        assert_eq!(project_read_binary_limited(base.clone(),"image.png".into(),4).unwrap(),Some("AAEC/w==".into()));
        assert!(project_read_binary_limited(base.clone(),"image.png".into(),3).is_err());
        assert!(project_read_binary_limited(base.clone(),"image.png".into(),0).is_err());
        assert!(project_read_binary_limited(base.clone(),"image.png".into(),33*1024*1024).is_err());
        assert!(project_read_binary_limited(base.clone(),".".into(),100).is_err());
        assert!(project_read_binary_limited(base.clone(),"../outside".into(),100).is_err());
        assert_eq!(project_read_binary_limited(base,"missing".into(),100).unwrap(),None);fs::remove_dir_all(root).unwrap();
    }
    #[test]
    #[cfg(unix)]
    fn bounded_media_rejects_outside_links_and_fifo_before_open(){
        use std::os::unix::fs::symlink;
        let root=std::env::temp_dir().join(format!("tdesign-media-link-{}",std::process::id()));let outside=root.with_extension("outside");fs::create_dir_all(&root).unwrap();fs::write(&outside,"secret").unwrap();symlink(&outside,root.join("link")).unwrap();
        let base=root.to_str().unwrap().to_owned();assert!(project_read_binary_limited(base.clone(),"link".into(),100).is_err());
        assert!(std::process::Command::new("mkfifo").arg(root.join("pipe")).status().unwrap().success());
        assert!(project_read_binary_limited(base,"pipe".into(),100).is_err());fs::remove_dir_all(root).unwrap();fs::remove_file(outside).unwrap();
    }
}

#[tauri::command]
pub async fn project_open_directory(root: String) -> Result<(), String> {
    let directory = existing_directory(&root)?;
    tauri::async_runtime::spawn_blocking(move || {
        // Arguments are passed directly, never interpolated into a shell command.
        #[cfg(target_os = "macos")]
        let mut command = std::process::Command::new("open");
        #[cfg(target_os = "windows")]
        let mut command = std::process::Command::new("explorer.exe");
        #[cfg(target_os = "linux")]
        let mut command = std::process::Command::new("xdg-open");
        #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
        return Err("当前系统不支持打开工程目录".to_string());

        #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
        {
            command.arg(directory);
            // Explorer can delegate to an existing process and return a non-zero code.
            #[cfg(target_os = "windows")]
            return command.spawn().map(|_| ()).map_err(|e| format!("打开目录失败: {e}"));
            #[cfg(not(target_os = "windows"))]
            {
                let status = command.status().map_err(|e| format!("打开目录失败: {e}"))?;
                if status.success() { Ok(()) } else { Err(format!("文件管理器未能打开目录（{status}）")) }
            }
        }
    }).await.map_err(|e| format!("打开目录失败: {e}"))?
}

#[tauri::command]
pub fn project_ensure_dir(root: String, rel: String) -> Result<(), String> {
    let _project_guard=crate::project_snapshot::guard(&root,&rel)?;
    let _task_guard=crate::task_fs::guard_write(&root,&rel)?;
    controlled_directory(&root,&rel).map(|_|())
}

#[tauri::command]
pub fn project_exists(root: String, rel: String) -> Result<bool, String> {
    let _project_guard=crate::project_snapshot::guard(&root,&rel)?;
    Ok(resolve(&root, &rel)?.exists())
}

#[tauri::command]
pub fn project_read_text(root: String, rel: String) -> Result<Option<String>, String> {
    let _project_guard=crate::project_snapshot::guard(&root,&rel)?;
    let path = resolve(&root, &rel)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path)
        .map(Some)
        .map_err(|e| format!("读取失败 {rel}: {e}"))
}

/// 仅供用户在对话中明确引用本地文本文件时使用。相对路径受工程目录约束；
/// 绝对路径必须由用户在本轮消息中给出，且只读取小体积 UTF-8 文本。
#[tauri::command]
pub fn read_text_context_file(
    path: String,
    project_root: Option<String>,
) -> Result<String, String> {
    const MAX_BYTES: u64 = 64 * 1024;
    const EXTENSIONS: &[&str] = &[
        "md", "markdown", "txt", "json", "yaml", "yml", "csv", "tsv", "xml", "html", "css", "js",
        "jsx", "ts", "tsx", "log", "sql", "ini", "toml", "sh", "py", "rs",
    ];

    let expanded = if path.starts_with("~/") || path.starts_with("~\\") {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map_err(|_| "无法解析用户主目录".to_string())?;
        Path::new(&home).join(&path[2..])
    } else {
        PathBuf::from(&path)
    };
    let is_relative = !expanded.is_absolute();
    let candidate = if is_relative {
        let root = project_root
            .as_deref()
            .ok_or("当前工程没有本地目录，无法读取相对路径")?;
        resolve(root, &path)?
    } else {
        expanded
    };
    let canonical =
        fs::canonicalize(&candidate).map_err(|e| format!("无法读取文件 {path}: {e}"))?;

    if is_relative {
        let root = project_root.as_deref().ok_or("当前工程没有本地目录")?;
        let canonical_root =
            fs::canonicalize(root).map_err(|e| format!("无法读取工程目录: {e}"))?;
        if !canonical.starts_with(canonical_root) {
            return Err(format!("路径超出当前工程目录: {path}"));
        }
    }

    let ext = canonical
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!("不支持读取该文件类型: {path}"));
    }
    let meta = fs::metadata(&canonical).map_err(|e| format!("无法读取文件 {path}: {e}"))?;
    if !meta.is_file() {
        return Err(format!("路径不是文件: {path}"));
    }
    if meta.len() > MAX_BYTES {
        return Err(format!("文件超过 64 KiB 限制: {path}"));
    }
    let bytes = fs::read(&canonical).map_err(|e| format!("无法读取文件 {path}: {e}"))?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(format!("文件超过 64 KiB 限制: {path}"));
    }
    let content = String::from_utf8(bytes).map_err(|_| format!("文件不是 UTF-8 文本: {path}"))?;
    if content.contains('\0') {
        return Err(format!("文件包含二进制内容: {path}"));
    }
    Ok(content.trim_start_matches('\u{feff}').to_string())
}

/// 原子写入：先写临时文件并 fsync，再 rename 覆盖。
/// 中途崩溃时目标文件仍保持上一个完整版本 (PRD §3.8.2)。
#[tauri::command]
pub fn project_write_text_atomic(root: String, rel: String, contents: String) -> Result<(), String> {
    atomic_project_write(&root,&rel,contents.as_bytes())
}

/// JSONL 追加写 (T-AE-31)。
///
/// 会话是 append-only 事件流：追加不读不改已有内容，写入放大为零；
/// 崩溃最多丢失最后一行，而单个大 JSON 一处损坏就全文件报废。
#[tauri::command]
pub fn project_append_line(root: String, rel: String, line: String) -> Result<(), String> {
    let _project_guard=crate::project_snapshot::guard(&root,&rel)?;
    let _task_guard=crate::task_fs::guard_write(&root,&rel)?;
    let path = resolve(&root, &rel)?;
    let parent=Path::new(&rel).parent().unwrap_or(Path::new("")).to_str().ok_or("追加路径无效")?;controlled_directory(&root,parent)?;
    if let Ok(meta)=fs::symlink_metadata(&path){if meta.file_type().is_symlink()||!meta.is_file(){return Err("追加目标不能是符号链接或非普通文件".into());}}
    let mut f = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("打开追加失败: {e}"))?;
    // 单行内不得含换行，否则会破坏 JSONL 的行边界
    let sanitized = line.replace('\n', "\\n").replace('\r', "");
    writeln!(f, "{sanitized}").map_err(|e| format!("追加失败: {e}"))?;
    f.sync_all().map_err(|e| format!("落盘失败: {e}"))
}

/// 读取 JSONL 的最后 N 行（打开工程时恢复最近若干轮对话）。
/// 无法解析的行由调用方跳过——这正是 JSONL 相对单 JSON 的关键优势。
fn read_jsonl_lines(reader: impl BufRead, limit: Option<usize>) -> Result<Vec<String>, String> {
    if limit == Some(0) {
        return Ok(vec![]);
    }
    let mut lines = std::collections::VecDeque::with_capacity(limit.unwrap_or(0).min(1024));
    for bytes in reader.split(b'\n') {
        let bytes = bytes.map_err(|e| format!("读行失败: {e}"))?;
        // A crash may cut the final UTF-8 code point. Drop that row, never its valid neighbors.
        let Ok(mut line) = String::from_utf8(bytes) else {
            continue;
        };
        if line.ends_with('\r') {
            line.pop();
        }
        if line.trim().is_empty() {
            continue;
        }
        if limit.is_some_and(|count| lines.len() == count) {
            lines.pop_front();
        }
        lines.push_back(line);
    }
    Ok(lines.into_iter().collect())
}

#[tauri::command]
pub fn project_read_tail_lines(
    root: String,
    rel: String,
    limit: usize,
) -> Result<Vec<String>, String> {
    let _project_guard=crate::project_snapshot::guard(&root,&rel)?;
    let path = resolve(&root, &rel)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let f = fs::File::open(&path).map_err(|e| format!("读取失败: {e}"))?;
    read_jsonl_lines(BufReader::new(f), Some(limit))
}

#[tauri::command]
pub fn project_read_all_lines(root: String, rel: String) -> Result<Vec<String>, String> {
    let _project_guard=crate::project_snapshot::guard(&root,&rel)?;
    let path = resolve(&root, &rel)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let f = fs::File::open(&path).map_err(|e| format!("读取失败: {e}"))?;
    read_jsonl_lines(BufReader::new(f), None)
}

/// 写入二进制资产（图片附件转存，T-AE-32）。入参为 base64，不含 data URI 前缀。
#[tauri::command]
pub fn project_write_binary(root: String, rel: String, base64_data: String) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data.as_bytes())
        .map_err(|e| format!("base64 解码失败: {e}"))?;
    atomic_project_write(&root,&rel,&bytes)
}

/// 读取二进制资产（如图片附件），返回 base64 编码字符串。
#[tauri::command]
pub fn project_read_binary_limited(root:String,rel:String,max_bytes:usize)->Result<Option<String>,String>{
    let _project_guard=crate::project_snapshot::guard(&root,&rel)?;
    use base64::Engine;
    if max_bytes==0||max_bytes>32*1024*1024{return Err("二进制读取额度无效".into());}
    let path=resolve(&root,&rel)?;
    let canonical_root=existing_directory(&root)?;
    let canonical=match fs::canonicalize(path){Ok(p)=>p,Err(e) if e.kind()==std::io::ErrorKind::NotFound=>return Ok(None),Err(e)=>return Err(e.to_string())};
    if !canonical.starts_with(canonical_root){return Err("媒体路径越界".into());}
    if !fs::metadata(&canonical).map_err(|e|e.to_string())?.is_file(){return Err("媒体不是普通文件".into());}
    let file=fs::File::open(canonical).map_err(|e|e.to_string())?;
    let meta=file.metadata().map_err(|e|e.to_string())?;
    if !meta.is_file()||meta.len()>max_bytes as u64{return Err("媒体文件超过读取额度或不是普通文件".into());}
    let mut bytes=Vec::new();file.take((max_bytes+1) as u64).read_to_end(&mut bytes).map_err(|e|e.to_string())?;
    if bytes.len()>max_bytes{return Err("媒体文件在读取时超过额度".into());}
    Ok(Some(base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[tauri::command]
pub fn project_read_binary(root: String, rel: String) -> Result<Option<String>, String> {
    let _project_guard=crate::project_snapshot::guard(&root,&rel)?;
    use base64::Engine;
    let path = resolve(&root, &rel)?;
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&path).map_err(|e| format!("读取失败: {e}"))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(Some(b64))
}

#[tauri::command]
pub fn project_list_dir(root: String, rel: String) -> Result<Vec<String>, String> {
    let _project_guard=crate::project_snapshot::guard(&root,&rel)?;
    let path = resolve(&root, &rel)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let mut names: Vec<String> = fs::read_dir(&path)
        .map_err(|e| format!("列目录失败: {e}"))?
        .filter_map(|e| e.ok())
        .filter_map(|e| e.file_name().into_string().ok())
        .collect();
    names.sort();
    Ok(names)
}

#[tauri::command]
pub fn project_delete(root: String, rel: String) -> Result<(), String> {
    let _project_guard=crate::project_snapshot::guard(&root,&rel)?;
    let canonical_rel=rel.split('/').filter(|p|!p.is_empty()&&*p!=".").collect::<Vec<_>>().join("/");
    if canonical_rel=="tasks"||canonical_rel.starts_with("tasks/.locks"){return Err("任务根目录或锁记录不能通过普通删除入口清理".into());}
    let _task_guard=if let Some((id,tail))=crate::task_fs::task_path(&rel)?{
        if tail.is_empty()||tail=="manifest.json"||tail=="recovery-claim.json"{return Err("任务清单或目录必须通过原子清理事务删除".into());}
        let guard=crate::task_fs::lock(&root,&id)?;guard.require_live()?;Some(guard)
    }else{None};
    let path = resolve(&root, &rel)?;
    if !path.exists() {
        return Ok(());
    }
    if path.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| format!("删除目录失败: {e}"))
    } else {
        fs::remove_file(&path).map_err(|e| format!("删除失败: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jsonl_invalid_utf8_rows_do_not_hide_valid_neighbors() {
        let root = std::env::temp_dir().join(format!("tdesign-jsonl-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("history.jsonl");
        let mut bytes = b"{\"turnId\":\"first\"}\r\n\n".to_vec();
        bytes.extend_from_slice(&[0xff, b'\n']);
        bytes.extend_from_slice(b"{\"turnId\":\"last\"}\n");
        bytes.extend_from_slice(&[0xe4, 0xb8]);
        fs::write(&path, bytes).unwrap();
        let root_str = root.to_str().unwrap().to_string();
        let expected = vec![
            "{\"turnId\":\"first\"}".to_string(),
            "{\"turnId\":\"last\"}".to_string(),
        ];
        assert_eq!(
            project_read_all_lines(root_str.clone(), "history.jsonl".into()).unwrap(),
            expected
        );
        assert_eq!(
            project_read_tail_lines(root_str.clone(), "history.jsonl".into(), 1).unwrap(),
            vec![expected[1].clone()]
        );
        assert!(
            project_read_tail_lines(root_str.clone(), "history.jsonl".into(), 0)
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            project_read_tail_lines(root_str, "history.jsonl".into(), usize::MAX).unwrap(),
            expected
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn jsonl_io_errors_remain_errors() {
        struct Broken;
        impl std::io::Read for Broken {
            fn read(&mut self, _: &mut [u8]) -> std::io::Result<usize> {
                Err(std::io::Error::other("disk unavailable"))
            }
        }
        impl BufRead for Broken {
            fn fill_buf(&mut self) -> std::io::Result<&[u8]> {
                Err(std::io::Error::other("disk unavailable"))
            }
            fn consume(&mut self, _: usize) {}
        }
        assert!(read_jsonl_lines(Broken, None).is_err());
    }

    #[test]
    fn directory_open_accepts_existing_absolute_folders_only() {
        let root = std::env::temp_dir().join(format!("tdesign-工程目录 test-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("project.json"), "{}").unwrap();
        assert_eq!(existing_directory(root.to_str().unwrap()).unwrap(), fs::canonicalize(&root).unwrap());
        assert!(existing_directory("").is_err());
        assert!(existing_directory("relative-folder").is_err());
        assert!(existing_directory("https://example.com").is_err());
        assert!(existing_directory(root.join("missing").to_str().unwrap()).is_err());
        assert!(existing_directory(root.join("project.json").to_str().unwrap()).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_escaping_paths() {
        assert!(resolve("/tmp/p", "../etc/passwd").is_err());
        assert!(resolve("/tmp/p", "a/../../b").is_err());
        assert!(resolve("/tmp/p", "/etc/passwd").is_err());
        assert!(resolve("relative/root", "a.json").is_err());
    }

    #[test]
    fn accepts_in_scope_paths() {
        assert!(resolve("/tmp/p", "project.json").is_ok());
        assert!(resolve("/tmp/p", "conversations/2026-09.jsonl").is_ok());
        assert!(resolve("/tmp/p", "./assets/images/a.png").is_ok());
    }

    #[test]
    fn reads_small_utf8_text_and_rejects_escape_or_binary() {
        let root =
            std::env::temp_dir().join(format!("tdesign-text-context-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("brief.md"), "# 需求\n正文").unwrap();
        fs::write(root.join("binary.txt"), b"a\0b").unwrap();
        fs::write(root.join("invalid.txt"), [0xff]).unwrap();
        fs::write(root.join("huge.md"), vec![b'a'; 64 * 1024 + 1]).unwrap();
        let root_str = root.to_str().unwrap().to_string();
        assert_eq!(
            read_text_context_file("brief.md".into(), Some(root_str.clone())).unwrap(),
            "# 需求\n正文"
        );
        assert_eq!(
            read_text_context_file(root.join("brief.md").to_str().unwrap().into(), None).unwrap(),
            "# 需求\n正文"
        );
        assert!(read_text_context_file("../brief.md".into(), Some(root_str.clone())).is_err());
        assert!(read_text_context_file("binary.txt".into(), Some(root_str.clone())).is_err());
        assert!(read_text_context_file("invalid.txt".into(), Some(root_str.clone())).is_err());
        assert!(read_text_context_file("huge.md".into(), Some(root_str.clone())).is_err());
        assert!(read_text_context_file("brief.png".into(), Some(root_str)).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn relative_symlink_cannot_escape_project_root() {
        let root = std::env::temp_dir().join(format!("tdesign-text-link-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let outside =
            std::env::temp_dir().join(format!("tdesign-outside-{}.md", std::process::id()));
        fs::write(&outside, "private").unwrap();
        std::os::unix::fs::symlink(&outside, root.join("linked.md")).unwrap();
        assert!(
            read_text_context_file("linked.md".into(), Some(root.to_str().unwrap().into()))
                .is_err()
        );
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_file(outside);
    }
}


/// A permanent single-use recovery claim. Crash recovery creates a new task, never resurrects an old ledger.
#[tauri::command]
pub fn project_create_text_exclusive(root:String,rel:String,contents:String,expected:Option<String>)->Result<bool,String>{
    let parts:Vec<&str>=rel.split('/').collect();
    let task_id=|id:&str|id.starts_with("design-")&&id.len()>7&&id.len()<=117&&id.bytes().all(|c|c.is_ascii_lowercase()||c.is_ascii_digit()||c==b'-');
    if parts.len()!=3||parts[0]!="tasks"||!task_id(parts[1])||parts[2]!="recovery-claim.json"||contents.len()>2048{return Err("恢复占用路径或内容无效".into());}
    let _task_guard=crate::task_fs::lock(&root,parts[1])?;_task_guard.require_live()?;_task_guard.require_capacity()?;
    crate::task_fs::check_expected(&root,parts[1],&expected)?;
    let claim:serde_json::Value=serde_json::from_str(&contents).map_err(|_|"恢复占用内容不是JSON")?;
    let next=claim.get("newTaskId").and_then(|v|v.as_str()).ok_or("缺少新任务标识")?;
    if claim.get("version").and_then(|v|v.as_u64())!=Some(1)||claim.get("originTaskId").and_then(|v|v.as_str())!=Some(parts[1])||!task_id(next)||next==parts[1]||claim.get("createdAt").and_then(|v|v.as_u64()).is_none(){return Err("恢复占用身份无效".into());}
    let canonical_root=existing_directory(&root)?;
    let mut parent=canonical_root.clone();
    // Refuse live and broken symlinks before creating a descendant. This does not
    // claim protection against a hostile same-user process swapping directories.
    for part in &parts[..2]{
      parent.push(part);
      match fs::symlink_metadata(&parent){
       Ok(meta) if meta.file_type().is_symlink()||!meta.is_dir()=>return Err("恢复占用目录不能是符号链接或文件".into()),
       Ok(_)=>{},
       Err(error) if error.kind()==std::io::ErrorKind::NotFound=>{
        match fs::create_dir(&parent){Ok(())=>{},Err(error) if error.kind()==std::io::ErrorKind::AlreadyExists=>{},Err(error)=>return Err(error.to_string())}
        let meta=fs::symlink_metadata(&parent).map_err(|e|e.to_string())?;
        if meta.file_type().is_symlink()||!meta.is_dir(){return Err("恢复占用目录发生变化".into());}
       },
       Err(error)=>return Err(error.to_string()),
      }
      if !fs::canonicalize(&parent).map_err(|e|e.to_string())?.starts_with(&canonical_root){return Err("恢复占用目录越界".into());}
    }
    let path=parent.join(parts[2]);
    match fs::OpenOptions::new().write(true).create_new(true).open(&path){
      Ok(mut file)=>{
       if let Err(error)=file.write_all(contents.as_bytes()).and_then(|_|file.sync_all()){
        drop(file);let _=fs::remove_file(&path);return Err(error.to_string());
       }
       Ok(true)
      },
      Err(e) if e.kind()==std::io::ErrorKind::AlreadyExists=>Ok(false),
      Err(e)=>Err(e.to_string()),
    }
}

#[cfg(test)]
mod recovery_claim_tests {
 use super::*;
 fn claim(origin:&str,next:&str)->String{serde_json::json!({"version":1,"originTaskId":origin,"newTaskId":next,"createdAt":1}).to_string()}
 #[test]
 fn concurrent_claim_is_single_use_and_rejects_other_paths(){
  let root=std::env::temp_dir().join(format!("tdesign-recovery-claim-{}",std::process::id()));fs::create_dir_all(&root).unwrap();
  let mut threads=Vec::new();for i in 0..8{let path=root.to_str().unwrap().to_owned();threads.push(std::thread::spawn(move||project_create_text_exclusive(path,"tasks/design-source/recovery-claim.json".into(),claim("design-source",&format!("design-new-{i}")),None).unwrap()));}
  assert_eq!(threads.into_iter().filter_map(|t|t.join().ok()).filter(|value|*value).count(),1);
  assert!(project_create_text_exclusive(root.to_str().unwrap().into(),"tasks/design-source/screens/recovery-claim.json".into(),claim("design-source","design-next"),None).is_err());
  assert!(project_create_text_exclusive(root.to_str().unwrap().into(),"tasks/design-other/recovery-claim.json".into(),claim("design-source","design-next"),None).is_err());
  let saved=fs::read_to_string(root.join("tasks/design-source/recovery-claim.json")).unwrap();assert_eq!(serde_json::from_str::<serde_json::Value>(&saved).unwrap()["originTaskId"],"design-source");fs::remove_dir_all(root).unwrap();
 }
 #[cfg(unix)]
 #[test]
 fn live_and_broken_symlinks_do_not_create_claims_outside_the_project(){
  let root=std::env::temp_dir().join(format!("tdesign-claim-symlink-{}",std::process::id()));let outside=std::env::temp_dir().join(format!("tdesign-claim-outside-{}",std::process::id()));
  fs::create_dir_all(root.join("tasks")).unwrap();fs::create_dir_all(&outside).unwrap();
  std::os::unix::fs::symlink(&outside,root.join("tasks/design-live")).unwrap();std::os::unix::fs::symlink(outside.join("missing"),root.join("tasks/design-broken")).unwrap();
  for id in ["design-live","design-broken"]{assert!(project_create_text_exclusive(root.to_str().unwrap().into(),format!("tasks/{id}/recovery-claim.json"),claim(id,"design-next"),None).is_err());}
  assert!(!outside.join("recovery-claim.json").exists());assert!(!outside.join("missing").exists());fs::remove_dir_all(root).unwrap();fs::remove_dir_all(outside).unwrap();
 }
}
