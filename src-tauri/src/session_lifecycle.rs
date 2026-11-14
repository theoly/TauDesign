//! The session marker detects unclean exits, not write permissions or save success.
//! Only markers successfully written by this process may be removed at normal exit.
use fs2::FileExt;
use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

const MARKER: &str = ".session.lock";
#[derive(Default)]
struct Sessions {
    closing: bool,
    owned: HashMap<PathBuf, Vec<u8>>,
}
fn sessions() -> &'static Mutex<Sessions> {
    static STATE: OnceLock<Mutex<Sessions>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(Sessions::default()))
}
pub fn is_marker(rel: &str) -> bool {
    Path::new(rel)
        .components()
        .filter(|p| *p != std::path::Component::CurDir)
        .eq([std::path::Component::Normal(std::ffi::OsStr::new(MARKER))])
}
// A separate, persistent guard file serializes marker replacement and conditional
// removal across processes. The marker itself is atomically renamed on each open.
fn guard(root: &Path) -> Result<fs::File, String> {
    let directory =
        crate::project_fs::controlled_directory(root.to_str().ok_or("工程路径无效")?, "")?;
    if directory != root {
        return Err("工程目录已变化，未清理会话标记".into());
    }
    let path = directory.join(".session.guard");
    if let Ok(meta) = fs::symlink_metadata(&path) {
        if meta.file_type().is_symlink() || !meta.is_file() {
            return Err("会话保护文件不是普通文件".into());
        }
    }
    let file = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)
        .map_err(|e| e.to_string())?;
    let start = Instant::now();
    loop {
        match file.try_lock_exclusive() {
            Ok(()) => return Ok(file),
            Err(error)
                if error.kind() == std::io::ErrorKind::WouldBlock
                    && start.elapsed() < Duration::from_secs(2) =>
            {
                std::thread::sleep(Duration::from_millis(10))
            }
            Err(error) => return Err(format!("无法核对会话标记：{error}")),
        }
    }
}
fn remove_owned(root: &Path, expected: &[u8]) -> Result<(), String> {
    let _guard = guard(root)?;
    let path = root.join(MARKER);
    let meta = match fs::symlink_metadata(&path) {
        Ok(meta) => meta,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };
    if meta.file_type().is_symlink() || !meta.is_file() {
        return Err("会话标记不是普通文件，未删除".into());
    }
    if meta.len() > 4096 {
        return Ok(());
    }
    let mut actual = Vec::new();
    fs::File::open(&path)
        .map_err(|e| e.to_string())?
        .take(4097)
        .read_to_end(&mut actual)
        .map_err(|e| e.to_string())?;
    if actual == expected {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
pub fn write(root: &str, contents: &[u8]) -> Result<(), String> {
    if contents.len() > 4096 {
        return Err("会话标记超出大小限制".into());
    }
    let root = crate::project_fs::controlled_directory(root, "")?;
    let mut state = sessions().lock().map_err(|e| e.to_string())?;
    write_with_state(&mut state, root, contents)
}
fn write_with_state(state: &mut Sessions, root: PathBuf, contents: &[u8]) -> Result<(), String> {
    if state.closing {
        return Err("应用正在关闭，未重新写入会话标记".into());
    }
    let _guard = guard(&root)?;
    crate::project_fs::atomic_project_write_unlocked(
        root.to_str().ok_or("工程路径无效")?,
        MARKER,
        contents,
    )?;
    state.owned.insert(root, contents.to_vec());
    Ok(())
}
pub fn release(root: &str) -> Result<(), String> {
    let root = crate::project_fs::controlled_directory(root, "")?;
    let mut state = sessions().lock().map_err(|e| e.to_string())?;
    if let Some(expected) = state.owned.get(&root) {
        remove_owned(&root, expected)?;
        state.owned.remove(&root);
    }
    Ok(())
}
fn finish(state: &mut Sessions) -> Vec<String> {
    state.closing = true;
    let mut errors = Vec::new();
    state
        .owned
        .retain(|root, expected| match remove_owned(root, expected) {
            Ok(()) => false,
            Err(error) => {
                errors.push(error);
                true
            }
        });
    errors
}
pub fn normal_exit() {
    match sessions().lock() {
        Ok(mut state) => {
            for error in finish(&mut state) {
                log::warn!("清理正常退出标记失败：{error}");
            }
        }
        Err(error) => log::warn!("会话状态不可用，保留恢复标记：{error}"),
    }
}
// Requested/cancelled closes and auxiliary export windows must not clear recovery.
pub fn is_normal_end(event: &tauri::RunEvent) -> bool {
    matches!(event, tauri::RunEvent::Exit)
        || matches!(event, tauri::RunEvent::WindowEvent { label, event, .. } if is_main_destruction(label, event))
}
fn is_main_destruction(label: &str, event: &tauri::WindowEvent) -> bool {
    label == "main" && matches!(event, tauri::WindowEvent::Destroyed)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn folder() -> PathBuf {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "td-session-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        fs::canonicalize(path).unwrap()
    }
    #[test]
    fn normal_end_only_after_actual_main_destruction_or_exit() {
        assert!(is_normal_end(&tauri::RunEvent::Exit));
        assert!(is_main_destruction("main", &tauri::WindowEvent::Destroyed));
        assert!(!is_main_destruction(
            "export",
            &tauri::WindowEvent::Destroyed
        ));
        assert!(!is_main_destruction(
            "main",
            &tauri::WindowEvent::Focused(false)
        ));
        assert!(!is_normal_end(&tauri::RunEvent::Ready));
        // CloseRequested/ExitRequested are deliberately never used as completion.
    }
    #[test]
    fn acquired_marker_is_retained_until_released_and_quit_preserves_project_files() {
        let root = folder();
        let name = root.to_str().unwrap();
        fs::write(root.join("project.json"), "unchanged").unwrap();
        crate::project_fs::project_write_text_atomic(
            name.into(),
            MARKER.into(),
            "owned-session".into(),
        )
        .unwrap();
        assert_eq!(fs::read(root.join(MARKER)).unwrap(), b"owned-session");
        crate::project_fs::project_delete(name.into(), MARKER.into()).unwrap();
        release(name).unwrap();
        assert!(!root.join(MARKER).exists());
        assert_eq!(fs::read(root.join("project.json")).unwrap(), b"unchanged");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn cleanup_is_conditional_and_idempotent() {
        let root = folder();
        fs::write(root.join(MARKER), b"other-instance").unwrap();
        let mut state = Sessions {
            closing: false,
            owned: HashMap::from([(root.clone(), b"old-instance".to_vec())]),
        };
        assert!(finish(&mut state).is_empty());
        assert_eq!(fs::read(root.join(MARKER)).unwrap(), b"other-instance");
        assert!(state.closing);
        assert!(finish(&mut state).is_empty());
        fs::write(root.join(MARKER), b"same-instance").unwrap();
        state.owned.insert(root.clone(), b"same-instance".to_vec());
        assert!(finish(&mut state).is_empty());
        assert!(!root.join(MARKER).exists());
        assert!(write_with_state(&mut state, root.clone(), b"late-session").is_err());
        assert!(!root.join(MARKER).exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn separate_handles_serialize_replacement_and_removal() {
        let root = folder();
        let first = guard(&root).unwrap();
        let second = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(root.join(".session.guard"))
            .unwrap();
        assert_eq!(
            second.try_lock_exclusive().unwrap_err().kind(),
            std::io::ErrorKind::WouldBlock
        );
        drop(first);
        second.try_lock_exclusive().unwrap();
        drop(second);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn session_child() {
        let Ok(root) = std::env::var("TAUDESIGN_SESSION_TEST_ROOT") else {
            return;
        };
        crate::project_fs::project_write_text_atomic(root, MARKER.into(), "child-session".into())
            .unwrap();
        if std::env::var("TAUDESIGN_SESSION_TEST_NORMAL").as_deref() == Ok("1") {
            normal_exit();
        }
        // Exit without normal_exit represents termination that never reached the event loop's Exit callback.
        std::process::exit(0);
    }
    #[test]
    fn real_process_normal_exit_cleans_but_abrupt_exit_leaves_recovery_evidence() {
        for normal in [true, false] {
            let root = folder();
            let status = std::process::Command::new(std::env::current_exe().unwrap())
                .args(["--exact", "session_lifecycle::tests::session_child"])
                .env("TAUDESIGN_SESSION_TEST_ROOT", &root)
                .env(
                    "TAUDESIGN_SESSION_TEST_NORMAL",
                    if normal { "1" } else { "0" },
                )
                .status()
                .unwrap();
            assert!(status.success());
            assert_eq!(root.join(MARKER).exists(), !normal);
            fs::remove_dir_all(root).unwrap();
        }
    }
    #[cfg(unix)]
    #[test]
    fn cleanup_never_follows_marker_symlinks() {
        let root = folder();
        let outside = root.with_extension("outside");
        fs::write(&outside, b"owned").unwrap();
        std::os::unix::fs::symlink(&outside, root.join(MARKER)).unwrap();
        assert!(remove_owned(&root, b"owned").is_err());
        assert_eq!(fs::read(&outside).unwrap(), b"owned");
        fs::remove_dir_all(root).unwrap();
        fs::remove_file(outside).unwrap();
    }
}
