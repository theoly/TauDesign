//! Conditional publication of the existing project files. No second page index.
//! A durable before/after journal makes process termination recoverable; cooperating
//! readers and writers use one OS lock. This is not protection from hostile directory swapping.
use crate::project_fs::{atomic_project_write_unlocked, controlled_directory};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    io::{Read, Write},
    path::{Component, Path},
    time::{Duration, Instant},
};

const MAX_FILE: usize = 24 * 1024 * 1024;
const MAX_TOTAL: usize = 128 * 1024 * 1024;
const MAX_FILES: usize = 5000;
const STATE: &str = ".project-state";
const PENDING: &str = ".project-state/pending.json";
#[derive(Debug, Serialize)]
pub struct ProjectSnapshot {
    pub identity: String,
    pub files: BTreeMap<String, String>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ProjectFileChange {
    pub path: String,
    #[serde(deserialize_with = "required_contents")]
    pub contents: Option<String>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ProjectResourceDependency {
    pub rel_path: String,
    pub sha256: String,
}
fn required_contents<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<String>, D::Error> {
    Option::<String>::deserialize(deserializer)
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct JournalChange {
    path: String,
    #[serde(deserialize_with = "required_contents")]
    before: Option<String>,
    #[serde(deserialize_with = "required_contents")]
    after: Option<String>,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Journal {
    version: u8,
    id: String,
    committed: bool,
    changes: Vec<JournalChange>,
}
pub(crate) struct ProjectGuard {
    _file: fs::File,
}
fn hash(value: &[u8]) -> String {
    format!("{:x}", Sha256::digest(value))
}
fn safe_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 240
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_'))
        && name.as_bytes()[0].is_ascii_alphanumeric()
}
pub(crate) fn managed_path(path: &str) -> bool {
    if ["project.json", "base.css", "DESIGN.md", "history.json"].contains(&path) {
        return true;
    }
    let parts = path.split('/').collect::<Vec<_>>();
    if parts.len() != 2 || !safe_name(parts[1]) {
        return false;
    }
    match parts[0] {
        "screens" => [".html", ".css", ".manifest.json"]
            .iter()
            .any(|s| parts[1].ends_with(s)),
        "documents" => parts[1].ends_with(".md"),
        _ => false,
    }
}
fn normalized(rel: &str) -> Result<String, String> {
    if rel.contains('\\') {
        return Err("工程事务路径不能含反斜杠".into());
    }
    let mut parts = Vec::new();
    for part in Path::new(rel).components() {
        match part {
            Component::Normal(name) => parts.push(name.to_str().ok_or("工程路径不是UTF-8")?),
            Component::CurDir => {}
            _ => return Err("工程事务路径越界".into()),
        }
    }
    Ok(parts.join("/"))
}
/** Generic IO may not access the private recovery journal, and must not bypass recovery. */
pub(crate) fn guard(root: &str, rel: &str) -> Result<Option<ProjectGuard>, String> {
    let path = normalized(rel)?;
    if path == STATE || path.starts_with(&format!("{STATE}/")) {
        return Err("工程事务资料只能通过条件发布入口管理".into());
    }
    if managed_path(&path) || ["screens", "documents", "assets"].contains(&path.as_str()) || path.starts_with("assets/") {
        let guard = lock(root)?;
        recover(root)?;
        return Ok(Some(guard));
    }
    Ok(None)
}
fn lock(root: &str) -> Result<ProjectGuard, String> {
    let parent = controlled_directory(root, STATE)?;
    let path = parent.join("write.lock");
    if let Ok(meta) = fs::symlink_metadata(&path) {
        if meta.file_type().is_symlink() || !meta.is_file() {
            return Err("工程发布锁不是普通文件".into());
        }
    }
    let file = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    let start = Instant::now();
    loop {
        match file.try_lock_exclusive() {
            Ok(()) => return Ok(ProjectGuard { _file: file }),
            Err(e)
                if e.kind() == std::io::ErrorKind::WouldBlock
                    && start.elapsed() < Duration::from_secs(2) =>
            {
                std::thread::sleep(Duration::from_millis(5))
            }
            Err(e) => return Err(format!("工程正由其它实例发布或无法加锁: {e}")),
        }
    }
}
fn read_bytes(root: &str, rel: &str, cap: usize) -> Result<Option<Vec<u8>>, String> {
    let mut path = fs::canonicalize(root).map_err(|e| e.to_string())?;
    let parts = normalized(rel)?;
    let parts = parts.split('/').collect::<Vec<_>>();
    for (index, part) in parts.iter().enumerate() {
        path.push(part);
        match fs::symlink_metadata(&path) {
            Ok(meta)
                if meta.file_type().is_symlink()
                    || index + 1 < parts.len() && !meta.is_dir()
                    || index + 1 == parts.len() && !meta.is_file() =>
            {
                return Err("工程快照路径含符号链接或非普通文件".into())
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e.to_string()),
        }
    }
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    if file.metadata().map_err(|e| e.to_string())?.len() > cap as u64 {
        return Err("工程文件超过快照额度".into());
    }
    let mut bytes = Vec::new();
    file.take((cap + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > cap {
        return Err("工程文件在读取期间超过快照额度".into());
    }
    Ok(Some(bytes))
}
fn read(root: &str, rel: &str, cap: usize) -> Result<Option<String>, String> {
    let Some(bytes) = read_bytes(root, rel, cap)? else { return Ok(None); };
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|_| "工程快照不是有效UTF-8".into())
}
fn verify_resources(root: &str, resources: &[ProjectResourceDependency]) -> Result<(), String> {
    if resources.len() > 4096 { return Err("最终交付资源依赖超过4096项".into()); }
    let mut names = HashSet::new();
    let mut total = 0;
    for resource in resources {
        let path = &resource.rel_path;
        if !["assets/images/", "assets/icons/", "assets/imports/", "assets/media/"].iter().any(|prefix| path.starts_with(prefix))
            || normalized(path)? != *path || path.contains('\0') || path.len() > 2000
            || path.split('/').any(|part| part.is_empty() || part.len() > 240)
            || !names.insert(path) || resource.sha256.len() != 64
            || !resource.sha256.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) {
            return Err("最终交付资源依赖路径或摘要无效".into());
        }
        let bytes = read_bytes(root, path, 32 * 1024 * 1024)?.ok_or("页面资源文件不存在，请重新检查后再采纳")?;
        total += bytes.len();
        if total > MAX_TOTAL { return Err("最终交付资源超过128MiB读取额度".into()); }
        if hash(&bytes) != resource.sha256 { return Err("页面资源内容已变化，请刷新预览并复验后再采纳".into()); }
    }
    Ok(())
}
fn identity(files: &BTreeMap<String, String>) -> String {
    let mut digest = Sha256::new();
    for (path, text) in files {
        digest.update(path.as_bytes());
        digest.update([0]);
        digest.update(hash(text.as_bytes()).as_bytes());
        digest.update(b"\n");
    }
    format!("{:x}", digest.finalize())
}
fn snapshot(root: &str) -> Result<ProjectSnapshot, String> {
    let mut files = BTreeMap::new();
    let mut total = 0;
    let mut add = |path: String| -> Result<(), String> {
        if let Some(text) = read(root, &path, MAX_FILE)? {
            total += text.len();
            if total > MAX_TOTAL || files.len() >= MAX_FILES {
                return Err("工程快照超过128MiB或5000文件额度".into());
            }
            files.insert(path, text);
        }
        Ok(())
    };
    for path in ["project.json", "base.css", "DESIGN.md", "history.json"] {
        add(path.into())?;
    }
    for directory in ["screens", "documents"] {
        let path = Path::new(root).join(directory);
        match fs::symlink_metadata(&path) {
            Ok(meta) if meta.file_type().is_symlink() || !meta.is_dir() => {
                return Err("工程快照目录不是普通目录".into())
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(e) => return Err(e.to_string()),
        }
        for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let name = entry.file_name();
            let Some(name) = name.to_str() else { continue };
            let rel = format!("{directory}/{name}");
            if managed_path(&rel) {
                add(rel)?;
            }
        }
    }
    Ok(ProjectSnapshot {
        identity: identity(&files),
        files,
    })
}
fn apply(root: &str, path: &str, text: Option<&String>) -> Result<(), String> {
    if let Some(text) = text {
        return atomic_project_write_unlocked(root, path, text.as_bytes());
    }
    if read(root, path, MAX_FILE)?.is_some() {
        fs::remove_file(Path::new(root).join(path)).map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn stage_path(id: &str, index: usize, kind: &str) -> String {
    format!("{STATE}/{id}/{index}-{kind}.txt")
}
fn stage_value(
    root: &str,
    journal: &Journal,
    index: usize,
    kind: &str,
    expected: &Option<String>,
) -> Result<Option<String>, String> {
    let Some(expected) = expected else {
        return Ok(None);
    };
    if expected.len() != 64
        || !expected
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err("工程恢复哈希无效".into());
    }
    let text = read(root, &stage_path(&journal.id, index, kind), MAX_FILE)?
        .ok_or("工程恢复文件缺失，未覆盖现有工程")?;
    if hash(text.as_bytes()) != *expected {
        return Err("工程恢复文件已变化，未覆盖现有工程".into());
    }
    Ok(Some(text))
}
fn cleanup(root: &str, journal: &Journal) -> Result<(), String> {
    fs::remove_file(Path::new(root).join(PENDING)).map_err(|e| e.to_string())?;
    let _ = fs::remove_dir_all(Path::new(root).join(STATE).join(&journal.id));
    Ok(())
}
/** Validate every recovery byte before touching any project file. */
fn recover(root: &str) -> Result<(), String> {
    let Some(raw) = read(root, PENDING, 2 * 1024 * 1024)? else {
        return Ok(());
    };
    let journal: Journal =
        serde_json::from_str(&raw).map_err(|_| "工程恢复日志损坏，未覆盖现有工程")?;
    if journal.version != 1
        || !journal.id.starts_with("stage-")
        || !safe_name(&journal.id)
        || journal.changes.is_empty()
        || journal.changes.len() > MAX_FILES
    {
        return Err("工程恢复日志身份或数量无效".into());
    }
    let mut names = HashSet::new();
    let mut values = Vec::new();
    let mut total = 0;
    for (index, change) in journal.changes.iter().enumerate() {
        if !managed_path(&change.path) || !names.insert(&change.path) {
            return Err("工程恢复路径无效或重复".into());
        }
        let before = stage_value(root, &journal, index, "before", &change.before)?;
        let after = stage_value(root, &journal, index, "after", &change.after)?;
        total += before.as_ref().map_or(0, String::len) + after.as_ref().map_or(0, String::len);
        if total > MAX_TOTAL * 2 {
            return Err("工程恢复资料超过额度".into());
        }
        let current = read(root, &change.path, MAX_FILE)?.map(|v| hash(v.as_bytes()));
        if current != change.before && current != change.after {
            return Err("工程文件已有未知外部编辑，保留恢复资料并停止覆盖".into());
        }
        values.push(if journal.committed { after } else { before });
    }
    for (change, value) in journal.changes.iter().zip(&values) {
        apply(root, &change.path, value.as_ref())?;
    }
    cleanup(root, &journal)
}
#[cfg(test)]
fn crash_point(root: &str, phase: &str) {
    if std::env::var("TAUDESIGN_PROJECT_CRASH_ROOT")
        .ok()
        .as_deref()
        == Some(root)
        && std::env::var("TAUDESIGN_PROJECT_CRASH_PHASE")
            .ok()
            .as_deref()
            == Some(phase)
    {
        fs::write(Path::new(root).join("project-held.tmp"), phase).unwrap();
        fs::rename(
            Path::new(root).join("project-held.tmp"),
            Path::new(root).join("project-held"),
        )
        .unwrap();
        std::thread::sleep(Duration::from_secs(30));
    }
}
#[cfg(not(test))]
fn crash_point(_root: &str, _phase: &str) {}
#[cfg(test)]
thread_local! {
 static FAIL_AFTER_FIRST:std::cell::Cell<bool>=const{std::cell::Cell::new(false)};
 static RESOURCE_EDIT_AFTER_FIRST:std::cell::RefCell<Option<(std::path::PathBuf,Vec<u8>)>>=const{std::cell::RefCell::new(None)};
}
fn checked_write_point() -> Result<(), String> {
    #[cfg(test)]
    RESOURCE_EDIT_AFTER_FIRST.with(|edit| {if let Some((path,bytes))=edit.borrow_mut().take(){fs::write(path,bytes).map_err(|e|e.to_string())?;}Ok::<(),String>(())})?;
    #[cfg(test)]
    if FAIL_AFTER_FIRST.with(|flag| flag.replace(false)) {
        return Err("synthetic write failure".into());
    }
    Ok(())
}

#[tauri::command]
pub fn project_managed_snapshot(root: String) -> Result<ProjectSnapshot, String> {
    let _guard = lock(&root)?;
    recover(&root)?;
    snapshot(&root)
}

#[tauri::command]
pub fn project_publish_snapshot(
    root: String,
    expected: String,
    changes: Vec<ProjectFileChange>,
) -> Result<String, String> {
    publish_snapshot(root, expected, changes, Vec::new())
}
#[tauri::command]
pub fn project_publish_snapshot_checked(
    root: String,
    expected: String,
    changes: Vec<ProjectFileChange>,
    resources: Vec<ProjectResourceDependency>,
) -> Result<String, String> {
    publish_snapshot(root, expected, changes, resources)
}
fn publish_snapshot(root: String, expected: String, changes: Vec<ProjectFileChange>, resources: Vec<ProjectResourceDependency>) -> Result<String, String> {
    if expected.len() != 64
        || !expected
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err("工程基线身份无效".into());
    }
    if changes.is_empty() || changes.len() > MAX_FILES {
        return Err("工程发布文件数量无效".into());
    }
    let mut names = HashSet::new();
    let mut total = 0;
    for change in &changes {
        if !managed_path(&change.path) || !names.insert(&change.path) {
            return Err("工程发布路径无效或重复".into());
        }
        if let Some(text) = &change.contents {
            total += text.len();
            if text.len() > MAX_FILE || total > MAX_TOTAL {
                return Err("工程发布超过24MiB单文件或128MiB总额度".into());
            }
        }
    }
    let _guard = lock(&root)?;
    recover(&root)?;
    let before = snapshot(&root)?;
    if before.identity != expected {
        return Err("工程已由其它实例或外部编辑更新，未覆盖；请重新打开并核对".into());
    }
    verify_resources(&root, &resources)?;
    let mut next = before.files.clone();
    for change in &changes {
        if let Some(text) = &change.contents {
            next.insert(change.path.clone(), text.clone());
        } else {
            next.remove(&change.path);
        }
    }
    if next.len() > MAX_FILES || next.values().map(String::len).sum::<usize>() > MAX_TOTAL {
        return Err("发布后的工程快照超过额度".into());
    }
    let next_identity = identity(&next);
    static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let id = format!(
        "stage-{}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos(),
        SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    );
    let directory = Path::new(&root).join(STATE).join(&id);
    fs::create_dir(&directory).map_err(|e| e.to_string())?;
    let mut changes = changes;
    changes.sort_by_key(|change| (change.path == "project.json", change.path.clone()));
    let mut journal = Journal {
        version: 1,
        id,
        committed: false,
        changes: Vec::new(),
    };
    let staged = (|| {
        for (index, change) in changes.iter().enumerate() {
            let old = before.files.get(&change.path);
            for (kind, text) in [("before", old), ("after", change.contents.as_ref())] {
                if let Some(text) = text {
                    let mut file = fs::OpenOptions::new()
                        .write(true)
                        .create_new(true)
                        .open(Path::new(&root).join(stage_path(&journal.id, index, kind)))
                        .map_err(|e| e.to_string())?;
                    file.write_all(text.as_bytes())
                        .and_then(|_| file.sync_all())
                        .map_err(|e| e.to_string())?;
                }
            }
            journal.changes.push(JournalChange {
                path: change.path.clone(),
                before: old.map(|v| hash(v.as_bytes())),
                after: change.contents.as_ref().map(|v| hash(v.as_bytes())),
            });
        }
        atomic_project_write_unlocked(
            &root,
            PENDING,
            &serde_json::to_vec(&journal).map_err(|e| e.to_string())?,
        )
    })();
    if let Err(error) = staged {
        let _ = fs::remove_dir_all(directory);
        return Err(error);
    }
    crash_point(&root, "prepared");
    let applied = (|| {
        for (index, change) in changes.iter().enumerate() {
            apply(&root, &change.path, change.contents.as_ref())?;
            if index == 0 {
                crash_point(&root, "first-file");
                checked_write_point()?;
            }
        }
        // Cooperating asset writes share this lock. Recheck external changes made
        // during staging before deciding the page/History transaction is committed.
        verify_resources(&root, &resources)?;
        journal.committed = true;
        atomic_project_write_unlocked(
            &root,
            PENDING,
            &serde_json::to_vec(&journal).map_err(|e| e.to_string())?,
        )
    })();
    if let Err(error) = applied {
        recover(&root).map_err(|recovery| format!("工程发布失败且恢复受阻：{recovery}"))?;
        return Err(error);
    }
    crash_point(&root, "committed");
    // The decision is durable. Cleanup failure must not report an applied commit as aborted.
    let _ = cleanup(&root, &journal);
    Ok(next_identity)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn temp() -> String {
        static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "tdesign-project-snapshot-{}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        fs::create_dir_all(path.join("screens")).unwrap();
        fs::create_dir_all(path.join("documents")).unwrap();
        fs::write(path.join("project.json"), "{\"id\":\"original\"}").unwrap();
        fs::write(
            path.join("screens/page.html"),
            "\u{feff}<main>原文</main>\r\n",
        )
        .unwrap();
        fs::write(path.join("screens/page.css"), "old CSS").unwrap();
        path.to_str().unwrap().into()
    }
    fn changes(label: &str) -> Vec<ProjectFileChange> {
        vec![
            ProjectFileChange {
                path: "project.json".into(),
                contents: Some(format!("{{\"id\":\"{label}\"}}")),
            },
            ProjectFileChange {
                path: "screens/page.html".into(),
                contents: Some(format!("<main>{label}</main>")),
            },
            ProjectFileChange {
                path: "screens/page.css".into(),
                contents: None,
            },
            ProjectFileChange {
                path: "documents/brief.md".into(),
                contents: Some(format!("{label} requirements")),
            },
            ProjectFileChange {
                path: "history.json".into(),
                contents: Some(format!("{label} history")),
            },
        ]
    }
    #[test]
    fn checked_publication_rejects_replaced_missing_invalid_or_linked_resources_without_touching_project() {
        let root = temp();
        let directory = Path::new(&root).join("assets/images");fs::create_dir_all(&directory).unwrap();
        let path = directory.join("photo.bin");fs::write(&path, [0,1,2,255]).unwrap();
        let before = project_managed_snapshot(root.clone()).unwrap();
        let dependency = ProjectResourceDependency { rel_path: "assets/images/photo.bin".into(), sha256: hash(&[0,1,2,255]) };
        fs::write(&path, [0,1,3,255]).unwrap();
        assert!(project_publish_snapshot_checked(root.clone(), before.identity.clone(), changes("stale"), vec![dependency.clone()]).unwrap_err().contains("已变化"));
        fs::remove_file(&path).unwrap();
        assert!(project_publish_snapshot_checked(root.clone(), before.identity.clone(), changes("missing"), vec![dependency.clone()]).unwrap_err().contains("不存在"));
        fs::write(&path, [0,1,2,255]).unwrap();
        for bad in [ProjectResourceDependency { rel_path: "assets/images/../photo.bin".into(), ..dependency.clone() }, ProjectResourceDependency { rel_path: "project.json".into(), ..dependency.clone() }, ProjectResourceDependency { sha256: "not-a-hash".into(), ..dependency.clone() }] {
            assert!(project_publish_snapshot_checked(root.clone(), before.identity.clone(), changes("invalid"), vec![bad]).is_err());
        }
        assert!(project_publish_snapshot_checked(root.clone(), before.identity.clone(), changes("duplicate"), vec![dependency.clone(),dependency.clone()]).is_err());
        #[cfg(unix)] {
            let link = directory.join("link.bin");std::os::unix::fs::symlink(&path,&link).unwrap();
            assert!(project_publish_snapshot_checked(root.clone(), before.identity.clone(), changes("link"), vec![ProjectResourceDependency { rel_path: "assets/images/link.bin".into(), ..dependency.clone() }]).is_err());
        }
        assert_eq!(project_managed_snapshot(root.clone()).unwrap().files, before.files);
        project_publish_snapshot_checked(root.clone(), before.identity, changes("accepted"), vec![dependency]).unwrap();
        assert_eq!(project_managed_snapshot(root.clone()).unwrap().files["screens/page.html"], "<main>accepted</main>");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn ordinary_asset_writes_and_deletes_wait_for_the_same_native_project_lock() {
        let root = temp();let path = Path::new(&root).join("assets/icons");fs::create_dir_all(&path).unwrap();fs::write(path.join("icon.svg"),"old").unwrap();
        let held = lock(&root).unwrap();let (send,recv)=std::sync::mpsc::channel();
        let writer_root=root.clone();let writer=std::thread::spawn(move||{let result=crate::project_fs::project_write_text_atomic(writer_root,"assets/icons/icon.svg".into(),"new".into());send.send(result).unwrap();});
        assert!(recv.recv_timeout(Duration::from_millis(40)).is_err());assert_eq!(fs::read_to_string(path.join("icon.svg")).unwrap(),"old");drop(held);
        recv.recv_timeout(Duration::from_secs(2)).unwrap().unwrap();writer.join().unwrap();assert_eq!(fs::read_to_string(path.join("icon.svg")).unwrap(),"new");
        let held=lock(&root).unwrap();let (send,recv)=std::sync::mpsc::channel();let delete_root=root.clone();
        let delete=std::thread::spawn(move||{send.send(crate::project_fs::project_delete(delete_root,"assets/icons".into())).unwrap();});
        assert!(recv.recv_timeout(Duration::from_millis(40)).is_err());assert!(path.exists());drop(held);recv.recv_timeout(Duration::from_secs(2)).unwrap().unwrap();delete.join().unwrap();assert!(!path.exists());fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn external_resource_change_during_staging_rolls_back_pages_history_and_commit_metadata() {
        let root=temp();let directory=Path::new(&root).join("assets/images");fs::create_dir_all(&directory).unwrap();let resource=directory.join("photo.bin");fs::write(&resource,b"original").unwrap();
        let before=project_managed_snapshot(root.clone()).unwrap();
        RESOURCE_EDIT_AFTER_FIRST.with(|edit|*edit.borrow_mut()=Some((resource.clone(),b"external replacement".to_vec())));
        let result=project_publish_snapshot_checked(root.clone(),before.identity.clone(),changes("must-roll-back"),vec![ProjectResourceDependency {rel_path:"assets/images/photo.bin".into(),sha256:hash(b"original")}]);
        assert!(result.unwrap_err().contains("已变化"));let after=project_managed_snapshot(root.clone()).unwrap();assert_eq!(after.files,before.files);assert_eq!(after.identity,before.identity);assert_eq!(fs::read(resource).unwrap(),b"external replacement");assert!(!Path::new(&root).join(PENDING).exists());fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn child_resource_write_entry() {
        let Ok(root)=std::env::var("TAUDESIGN_RESOURCE_LOCK_ROOT") else{return;};
        atomic_project_write_unlocked(&root,"resource-attempting",b"ready").unwrap();
        crate::project_fs::project_write_binary(root.clone(),"assets/images/proof.bin".into(),"bmV3".into()).unwrap();
        atomic_project_write_unlocked(&root,"resource-written",b"done").unwrap();
    }
    #[test]
    fn a_separate_asset_writer_process_cannot_interleave_the_project_publication_lock() {
        let root=temp();let directory=Path::new(&root).join("assets/images");fs::create_dir_all(&directory).unwrap();fs::write(directory.join("proof.bin"),b"old").unwrap();let held=lock(&root).unwrap();
        let mut child=std::process::Command::new(std::env::current_exe().unwrap()).args(["project_snapshot::tests::child_resource_write_entry","--exact","--nocapture"]).env("TAUDESIGN_RESOURCE_LOCK_ROOT",&root).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).spawn().unwrap();
        let start=Instant::now();while !Path::new(&root).join("resource-attempting").exists(){if child.try_wait().unwrap().is_some(){panic!("resource writer exited before attempting IO");}if start.elapsed()>Duration::from_secs(5){let _=child.kill();let _=child.wait();panic!("resource writer did not start");}std::thread::sleep(Duration::from_millis(5));}
        std::thread::sleep(Duration::from_millis(40));let blocked=child.try_wait().unwrap().is_none()&&!Path::new(&root).join("resource-written").exists()&&fs::read(directory.join("proof.bin")).unwrap()==b"old";drop(held);
        let start=Instant::now();let status=loop{if let Some(status)=child.try_wait().unwrap(){break status;}if start.elapsed()>Duration::from_secs(5){let _=child.kill();let _=child.wait();panic!("resource writer failed to finish after publication unlocked");}std::thread::sleep(Duration::from_millis(5));};assert!(blocked);assert!(status.success());assert_eq!(fs::read(directory.join("proof.bin")).unwrap(),b"new");fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn competing_publishers_share_the_full_baseline_and_only_one_whole_result_wins() {
        let root = temp();
        let before = project_managed_snapshot(root.clone()).unwrap();
        assert_eq!(
            before.identity,
            "039d5f966573c3ec4db5e053c74a4b31d92a1b71438d1cf06701258b9750b19d"
        );
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(3));
        let mut threads = Vec::new();
        for label in ["one", "two"] {
            let path = root.clone();
            let expected = before.identity.clone();
            let start = barrier.clone();
            threads.push(std::thread::spawn(move || {
                start.wait();
                (
                    label,
                    project_publish_snapshot(path, expected, changes(label)),
                )
            }));
        }
        barrier.wait();
        let results = threads
            .into_iter()
            .map(|thread| thread.join().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(results.iter().filter(|(_, value)| value.is_ok()).count(), 1);
        let winner = results.iter().find(|(_, value)| value.is_ok()).unwrap();
        let after = project_managed_snapshot(root.clone()).unwrap();
        assert_eq!(winner.1.as_ref().unwrap(), &after.identity);
        assert_eq!(
            after.files["screens/page.html"],
            format!("<main>{}</main>", winner.0)
        );
        assert_eq!(
            after.files["documents/brief.md"],
            format!("{} requirements", winner.0)
        );
        assert!(!after.files.contains_key("screens/page.css"));
        assert_eq!(after.files["history.json"],format!("{} history",winner.0));
        assert_ne!(before.identity, after.identity);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn any_managed_file_edit_blocks_stale_publication_and_ordinary_io_uses_the_same_lock() {
        let root = temp();
        let before = project_managed_snapshot(root.clone()).unwrap();
        crate::project_fs::project_write_text_atomic(
            root.clone(),
            "screens/page.css".into(),
            "external edit".into(),
        )
        .unwrap();
        assert!(
            project_publish_snapshot(root.clone(), before.identity, changes("stale"))
                .unwrap_err()
                .contains("未覆盖")
        );
        assert_eq!(
            fs::read_to_string(Path::new(&root).join("screens/page.html")).unwrap(),
            before.files["screens/page.html"]
        );
        let held = lock(&root).unwrap();
        let path = root.clone();
        let thread = std::thread::spawn(move || {
            crate::project_fs::project_write_text_atomic(
                path,
                "project.json".into(),
                "ordinary".into(),
            )
        });
        std::thread::sleep(Duration::from_millis(30));
        assert!(!thread.is_finished());
        drop(held);
        thread.join().unwrap().unwrap();
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn failed_mid_write_rolls_back_every_old_byte_and_removes_new_files() {
        let root = temp();
        let before = project_managed_snapshot(root.clone()).unwrap();
        FAIL_AFTER_FIRST.with(|flag| flag.set(true));
        assert!(
            project_publish_snapshot(root.clone(), before.identity.clone(), changes("failed"))
                .unwrap_err()
                .contains("synthetic")
        );
        let after = project_managed_snapshot(root.clone()).unwrap();
        assert_eq!(before.files, after.files);
        assert_eq!(before.identity, after.identity);
        assert!(!Path::new(&root).join(PENDING).exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn standalone_history_edit_invalidates_the_same_project_baseline() {
        let root=temp();
        let before=project_managed_snapshot(root.clone()).unwrap();
        crate::project_fs::project_write_text_atomic(root.clone(),"history.json".into(),"external history".into()).unwrap();
        assert!(project_publish_snapshot(root.clone(),before.identity,changes("stale")).is_err());
        let after=project_managed_snapshot(root.clone()).unwrap();
        assert_eq!(after.files["history.json"],"external history");
        assert_eq!(after.files["screens/page.html"],before.files["screens/page.html"]);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn unsafe_duplicate_oversized_and_non_utf8_data_never_publish() {
        assert!(serde_json::from_str::<ProjectFileChange>(r#"{"path":"project.json"}"#).is_err());
        assert!(serde_json::from_str::<ProjectFileChange>(
            r#"{"path":"project.json","contents":null}"#
        )
        .is_ok());
        assert!(
            serde_json::from_str::<JournalChange>(r#"{"path":"project.json","after":null}"#)
                .is_err()
        );
        assert!(
            serde_json::from_str::<JournalChange>(r#"{"path":"project.json","before":null}"#)
                .is_err()
        );
        let root = temp();
        let before = project_managed_snapshot(root.clone()).unwrap();
        for path in [
            "../project.json",
            "screens/../project.json",
            "/project.json",
            "screens/a\\b.html",
            "screens/秘密.html",
            "assets/images/a.png",
            ".project-state/pending.json",
        ] {
            assert!(project_publish_snapshot(
                root.clone(),
                before.identity.clone(),
                vec![ProjectFileChange {
                    path: path.into(),
                    contents: Some("bad".into())
                }]
            )
            .is_err());
        }
        assert!(project_publish_snapshot(
            root.clone(),
            before.identity.clone(),
            vec![changes("a")[0].clone(), changes("a")[0].clone()]
        )
        .is_err());
        assert!(project_publish_snapshot(
            root.clone(),
            before.identity.clone(),
            vec![ProjectFileChange {
                path: "project.json".into(),
                contents: Some("a".repeat(MAX_FILE + 1))
            }]
        )
        .is_err());
        assert!(guard(&root, "./.project-state/pending.json").is_err());
        assert!(crate::project_fs::project_read_text(
            root.clone(),
            ".project-state/pending.json".into()
        )
        .is_err());
        assert_eq!(
            project_managed_snapshot(root.clone()).unwrap().files,
            before.files
        );
        fs::write(Path::new(&root).join("screens/page.html"), [0xff]).unwrap();
        assert!(project_managed_snapshot(root.clone())
            .unwrap_err()
            .contains("UTF-8"));
        fs::remove_dir_all(root).unwrap();
    }
    fn pending(root: &str) -> Journal {
        let id = "stage-test".to_string();
        fs::create_dir(Path::new(root).join(STATE).join(&id)).unwrap();
        let old = fs::read_to_string(Path::new(root).join("screens/page.html")).unwrap();
        let new = "<main>new</main>";
        fs::write(Path::new(root).join(stage_path(&id, 0, "before")), &old).unwrap();
        fs::write(Path::new(root).join(stage_path(&id, 0, "after")), new).unwrap();
        fs::write(Path::new(root).join("screens/page.html"), new).unwrap();
        let journal = Journal {
            version: 1,
            id,
            committed: false,
            changes: vec![JournalChange {
                path: "screens/page.html".into(),
                before: Some(hash(old.as_bytes())),
                after: Some(hash(new.as_bytes())),
            }],
        };
        fs::write(
            Path::new(root).join(PENDING),
            serde_json::to_vec(&journal).unwrap(),
        )
        .unwrap();
        journal
    }
    #[test]
    fn damaged_recovery_bytes_and_unknown_external_edits_are_not_silently_overwritten() {
        for external in [false, true] {
            let root = temp();
            let _guard = lock(&root).unwrap();
            let journal = pending(&root);
            drop(_guard);
            if external {
                fs::write(
                    Path::new(&root).join("screens/page.html"),
                    "external user edit",
                )
                .unwrap();
            } else {
                fs::write(
                    Path::new(&root).join(stage_path(&journal.id, 0, "before")),
                    "tampered",
                )
                .unwrap();
            }
            let expected = fs::read(Path::new(&root).join("screens/page.html")).unwrap();
            assert!(project_managed_snapshot(root.clone()).is_err());
            assert_eq!(
                fs::read(Path::new(&root).join("screens/page.html")).unwrap(),
                expected
            );
            assert!(Path::new(&root).join(PENDING).exists());
            fs::remove_dir_all(root).unwrap();
        }
    }
    #[cfg(unix)]
    #[test]
    fn symlinked_managed_files_or_private_state_never_redirect_snapshot_io() {
        use std::os::unix::fs::symlink;
        let root = temp();
        let outside = temp();
        fs::remove_file(Path::new(&root).join("screens/page.html")).unwrap();
        symlink(
            Path::new(&outside).join("screens/page.html"),
            Path::new(&root).join("screens/page.html"),
        )
        .unwrap();
        assert!(project_managed_snapshot(root.clone()).is_err());
        fs::remove_dir_all(root).unwrap();
        let root = temp();
        symlink(&outside, Path::new(&root).join(STATE)).unwrap();
        assert!(project_managed_snapshot(root.clone()).is_err());
        assert_eq!(
            fs::read_to_string(Path::new(&outside).join("project.json")).unwrap(),
            "{\"id\":\"original\"}"
        );
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }
    #[test]
    fn child_publish_entry() {
        let Ok(root) = std::env::var("TAUDESIGN_PROJECT_CRASH_ROOT") else {
            return;
        };
        let expected = project_managed_snapshot(root.clone()).unwrap().identity;
        project_publish_snapshot(root, expected, changes("child")).unwrap();
    }
    #[test]
    fn killed_real_process_recovers_before_decision_and_keeps_after_decision() {
        for phase in ["prepared", "first-file", "committed"] {
            let root = temp();
            let before = project_managed_snapshot(root.clone()).unwrap();
            let mut child = std::process::Command::new(std::env::current_exe().unwrap())
                .args([
                    "project_snapshot::tests::child_publish_entry",
                    "--exact",
                    "--nocapture",
                ])
                .env("TAUDESIGN_PROJECT_CRASH_ROOT", &root)
                .env("TAUDESIGN_PROJECT_CRASH_PHASE", phase)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
                .unwrap();
            let marker = Path::new(&root).join("project-held");
            let start = Instant::now();
            while !marker.exists() {
                if child.try_wait().unwrap().is_some() {
                    panic!("child exited before crash marker");
                }
                if start.elapsed() > Duration::from_secs(5) {
                    let _ = child.kill();
                    let _ = child.wait();
                    panic!("child did not reach crash point");
                }
                std::thread::sleep(Duration::from_millis(5));
            }
            let alive = child.try_wait().unwrap().is_none();
            let observed = fs::read_to_string(marker);
            child.kill().unwrap();
            child.wait().unwrap();
            assert!(alive);
            assert_eq!(observed.unwrap(), phase);
            // The ordinary read path must recover too, before returning any half-published file.
            let first =
                crate::project_fs::project_read_text(root.clone(), "screens/page.html".into())
                    .unwrap()
                    .unwrap();
            let after = project_managed_snapshot(root.clone()).unwrap();
            if phase == "committed" {
                assert_eq!(first, "<main>child</main>");
                assert!(!after.files.contains_key("screens/page.css"));
                assert_eq!(after.files["documents/brief.md"], "child requirements");
                assert_eq!(after.files["history.json"], "child history");
            } else {
                assert_eq!(after.files, before.files);
                assert_eq!(first, before.files["screens/page.html"]);
            }
            assert!(!Path::new(&root).join(PENDING).exists());
            assert_eq!(
                project_managed_snapshot(root.clone()).unwrap().identity,
                after.identity
            );
            fs::remove_dir_all(root).unwrap();
        }
    }
    #[test]
    fn child_race_entry() {
        let Ok(root) = std::env::var("TAUDESIGN_PROJECT_RACE_ROOT") else {
            return;
        };
        let label = std::env::var("TAUDESIGN_PROJECT_RACE_LABEL").unwrap();
        let expected = std::env::var("TAUDESIGN_PROJECT_RACE_EXPECTED").unwrap();
        fs::write(Path::new(&root).join(format!("ready-{label}")), b"ready").unwrap();
        let started = Instant::now();
        while !Path::new(&root).join("race-go").exists() {
            assert!(started.elapsed() < Duration::from_secs(5));
            std::thread::sleep(Duration::from_millis(5));
        }
        let result = project_publish_snapshot(root.clone(), expected, changes(&label));
        fs::write(
            Path::new(&root).join(format!("result-{label}.json")),
            serde_json::to_vec(&serde_json::json!({"ok":result.is_ok(),"identity":result.ok()}))
                .unwrap(),
        )
        .unwrap();
    }
    #[test]
    fn separate_processes_compete_at_one_durable_project_baseline() {
        let root = temp();
        let before = project_managed_snapshot(root.clone()).unwrap();
        let mut children = Vec::new();
        for label in ["one", "two"] {
            children.push((
                label,
                std::process::Command::new(std::env::current_exe().unwrap())
                    .args(["project_snapshot::tests::child_race_entry", "--exact"])
                    .env("TAUDESIGN_PROJECT_RACE_ROOT", &root)
                    .env("TAUDESIGN_PROJECT_RACE_LABEL", label)
                    .env("TAUDESIGN_PROJECT_RACE_EXPECTED", &before.identity)
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .spawn()
                    .unwrap(),
            ));
        }
        let started = Instant::now();
        while !children
            .iter()
            .all(|(label, _)| Path::new(&root).join(format!("ready-{label}")).exists())
        {
            if started.elapsed() > Duration::from_secs(5) {
                for (_, child) in &mut children {
                    let _ = child.kill();
                    let _ = child.wait();
                }
                panic!("race children did not become ready");
            }
            for (_, child) in &mut children {
                assert!(child.try_wait().unwrap().is_none());
            }
            std::thread::sleep(Duration::from_millis(5));
        }
        fs::write(Path::new(&root).join("race-go"), b"go").unwrap();
        for (_, child) in &mut children {
            assert!(child.wait().unwrap().success());
        }
        let results = children
            .iter()
            .map(|(label, _)| {
                (
                    *label,
                    serde_json::from_slice::<serde_json::Value>(
                        &fs::read(Path::new(&root).join(format!("result-{label}.json"))).unwrap(),
                    )
                    .unwrap(),
                )
            })
            .collect::<Vec<_>>();
        assert_eq!(
            results
                .iter()
                .filter(|(_, value)| value["ok"] == true)
                .count(),
            1
        );
        let winner = results
            .iter()
            .find(|(_, value)| value["ok"] == true)
            .unwrap();
        let saved = project_managed_snapshot(root.clone()).unwrap();
        assert_eq!(saved.identity, winner.1["identity"].as_str().unwrap());
        assert_eq!(
            saved.files["screens/page.html"],
            format!("<main>{}</main>", winner.0)
        );
        assert_eq!(
            saved.files["documents/brief.md"],
            format!("{} requirements", winner.0)
        );
        fs::remove_dir_all(root).unwrap();
    }
}
