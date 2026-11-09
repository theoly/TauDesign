//! Single-operation task transactions. OS locks never outlive an IPC command.
use fs2::FileExt;
use sha2::{Digest,Sha256};
use std::{fs,io::Read,path::PathBuf,time::{Duration,Instant}};
use crate::project_fs::{controlled_directory,atomic_project_write_unlocked};

pub(crate) fn valid_id(id:&str)->bool{id.starts_with("design-")&&id.len()>7&&id.len()<=117&&id.bytes().all(|b|b.is_ascii_lowercase()||b.is_ascii_digit()||b==b'-')}
pub(crate) fn task_path(rel:&str)->Result<Option<(String,String)>,String>{
 let normalized=rel.replace('\\',"/");let parts=normalized.split('/').filter(|p|!p.is_empty()&&*p!=".").collect::<Vec<_>>();if parts.first()!=Some(&"tasks"){return Ok(None);}
 if rel.contains('\\')||parts.iter().any(|p|*p==".."){return Err("任务路径不能含反斜杠或相对跳转".into());}
 let id=parts.get(1).copied().unwrap_or("");if id==".locks"{return Err("任务锁记录只能由任务事务管理".into());}
 if id.is_empty(){return Ok(None);}if !valid_id(id){return Err("任务目录标识无效".into());}
 Ok(Some((id.into(),parts.get(2..).unwrap_or(&[]).join("/"))))
}
pub(crate) struct TaskGuard{_file:fs::File,root:PathBuf,id:String}
impl TaskGuard{
 fn deleted(&self)->Result<bool,String>{
  let path=self.root.join("tasks/.locks").join(format!("{}.deleted",self.id));
  match fs::symlink_metadata(path){Ok(m) if m.is_file()&&!m.file_type().is_symlink()=>Ok(true),Ok(_)=>Err("任务删除标记不是普通文件".into()),Err(e) if e.kind()==std::io::ErrorKind::NotFound=>Ok(false),Err(e)=>Err(e.to_string())}
 }
 pub(crate) fn require_live(&self)->Result<(),String>{if self.deleted()?{Err("任务已被清理，拒绝迟到写入".into())}else{Ok(())}}
 pub(crate) fn require_capacity(&self)->Result<(),String>{
  if fs::symlink_metadata(self.root.join("tasks").join(&self.id)).is_ok(){return Ok(());}
  let count=fs::read_dir(self.root.join("tasks")).map_err(|e|e.to_string())?.filter_map(Result::ok).filter(|entry|entry.file_name().to_str().is_some_and(valid_id)).count();
  if count>=40{Err("设计任务存档已达40项，请清理历史记录".into())}else{Ok(())}
 }
 fn claimed(&self)->bool{self.root.join(format!("tasks/{}/recovery-claim.json",self.id)).exists()}
}
pub(crate) fn lock(root:&str,id:&str)->Result<TaskGuard,String>{
 if !valid_id(id){return Err("任务标识无效".into());}
 let parent=controlled_directory(root,"tasks/.locks")?;let path=parent.join("project.lock");
 if let Ok(meta)=fs::symlink_metadata(&path){if meta.file_type().is_symlink()||!meta.is_file(){return Err("任务锁文件不能是符号链接或非普通文件".into());}}
 let file=fs::OpenOptions::new().read(true).write(true).create(true).open(&path).map_err(|e|e.to_string())?;let start=Instant::now();
 loop{match file.try_lock_exclusive(){Ok(())=>break,Err(error) if error.kind()==std::io::ErrorKind::WouldBlock&&start.elapsed()<Duration::from_secs(2)=>std::thread::sleep(Duration::from_millis(5)),Err(error)=>return Err(format!("任务由其它实例使用或无法加锁: {error}"))}}
 let canonical=fs::canonicalize(root).map_err(|e|e.to_string())?;Ok(TaskGuard{_file:file,root:canonical,id:id.into()})
}
/** Generic writes can publish immutable parts and metadata, never the authority manifest. */
pub(crate) fn guard_write(root:&str,rel:&str)->Result<Option<TaskGuard>,String>{
 if let Some((id,tail))=task_path(rel)?{
  if tail=="manifest.json"||tail=="recovery-claim.json"{return Err("任务清单与恢复占用必须通过原子任务事务发布".into());}
  let guard=lock(root,&id)?;guard.require_live()?;guard.require_capacity()?;
  if guard.claimed()&&tail!="attempts.jsonl"{return Err("任务已被新恢复任务接替，拒绝旧产物写入".into());}return Ok(Some(guard));
 }Ok(None)
}
fn manifest_path(root:&str,id:&str)->Result<Option<PathBuf>,String>{
 if !valid_id(id){return Err("任务标识无效".into());}
 let mut path=fs::canonicalize(root).map_err(|e|e.to_string())?;
 for part in ["tasks",id,"manifest.json"]{path.push(part);match fs::symlink_metadata(&path){Ok(meta) if meta.file_type().is_symlink()=>return Err("任务清单路径不能包含符号链接".into()),Ok(_)=>{},Err(e) if e.kind()==std::io::ErrorKind::NotFound=>return Ok(None),Err(e)=>return Err(e.to_string())}}
 if !path.is_file(){return Err("任务清单不是普通文件".into());}Ok(Some(path))
}
#[tauri::command]
pub fn project_task_manifest_identity(root:String,id:String)->Result<Option<String>,String>{
 let Some(path)=manifest_path(&root,&id)? else{return Ok(None)};
 let mut file=fs::File::open(path).map_err(|e|e.to_string())?;let mut hash=Sha256::new();let mut buffer=[0u8;65536];let mut bytes=0usize;
 loop{let count=file.read(&mut buffer).map_err(|e|e.to_string())?;if count==0{break;}bytes+=count;if bytes>64*1024*1024{return Err("损坏任务清单超过64MiB身份检查额度，请在工程目录中检查异常文件".into());}hash.update(&buffer[..count]);}
 Ok(Some(format!("{:x}",hash.finalize())))
}
pub(crate) fn check_expected(root:&str,id:&str,expected:&Option<String>)->Result<(),String>{
 if expected.as_ref().is_some_and(|s|s.len()!=64||!s.bytes().all(|b|b.is_ascii_hexdigit()&&!b.is_ascii_uppercase())){return Err("任务清单身份无效".into());}
 if &project_task_manifest_identity(root.into(),id.into())?!=expected{return Err("任务清单已由其它实例更新，未覆盖新记录".into());}Ok(())
}
#[tauri::command]
pub fn project_publish_task_manifest(root:String,id:String,expected:Option<String>,contents:String)->Result<(),String>{
 let guard=lock(&root,&id)?;guard.require_live()?;guard.require_capacity()?;if guard.claimed(){return Err("旧任务已被恢复任务接替，未发布旧清单".into());}check_expected(&root,&id,&expected)?;
 if contents.len()>800000{return Err("任务清单超过发布额度".into());}
 if let Some(path)=manifest_path(&root,&id)?{let old=fs::read_to_string(path).map_err(|e|e.to_string())?;if serde_json::from_str::<serde_json::Value>(&old).ok().and_then(|v|v.get("state").and_then(|s|s.as_str()).map(str::to_owned)).as_deref()==Some("completed")&&old!=contents{return Err("已完成任务不能被旧执行覆盖".into());}}
 let parsed:serde_json::Value=serde_json::from_str(&contents).map_err(|_|"任务清单不是JSON")?;
 if parsed.get("id").and_then(|v|v.as_str())!=Some(id.as_str())||parsed.get("version").and_then(|v|v.as_u64())!=Some(1)||parsed.get("projectId").and_then(|v|v.as_str()).filter(|s|!s.is_empty()).is_none(){return Err("任务清单身份不一致".into());}
 atomic_project_write_unlocked(&root,&format!("tasks/{id}/manifest.json"),contents.as_bytes())
}
#[tauri::command]
pub fn project_delete_design_task(root:String,id:String,expected:Option<String>)->Result<(),String>{
 let guard=lock(&root,&id)?;check_expected(&root,&id,&expected)?;
 // A permanent tombstone prevents a delayed owner from recreating any task files.
 atomic_project_write_unlocked(&root,&format!("tasks/.locks/{id}.deleted"),br#"{"version":1,"deleted":true}"#)?;
 let path=guard.root.join("tasks").join(&id);
 match fs::symlink_metadata(&path){Ok(meta) if meta.file_type().is_symlink()||!meta.is_dir()=>Err("任务清理目标不能是符号链接或文件".into()),Ok(_)=>fs::remove_dir_all(path).map_err(|e|e.to_string()),Err(e) if e.kind()==std::io::ErrorKind::NotFound=>Ok(()),Err(e)=>Err(e.to_string())}
}


#[derive(serde::Deserialize)]
pub struct TaskArchiveFile {pub path:String,pub contents:String}
fn archive_path(path:&str)->bool{
 let parts=path.split('/').collect::<Vec<_>>();
 if parts.len()>2||parts.len()==2&&parts[0]!="artifacts"{return false;}
 let name=parts[parts.len()-1];name.as_bytes().first().is_some_and(|b|b.is_ascii_alphanumeric())&&name.len()<=200&&name.bytes().all(|b|b.is_ascii_alphanumeric()||matches!(b,b'.'|b'-'|b'_'))&&[".json",".jsonl",".html",".txt"].iter().any(|suffix|name.ends_with(suffix))
}
#[cfg(test)]
fn archive_crash_point(root:&str,phase:&str){
 if std::env::var("TAUDESIGN_ARCHIVE_CRASH_ROOT").ok().as_deref()==Some(root)&&std::env::var("TAUDESIGN_ARCHIVE_CRASH_PHASE").ok().as_deref()==Some(phase){fs::write(PathBuf::from(root).join("archive-held"),phase).unwrap();std::thread::sleep(Duration::from_secs(30));}
}
/** Migration copies historical bytes, including damaged JSON, never old execution authority.
 * The whole task directory becomes visible only after every staged file is complete. */
#[tauri::command]
pub fn project_import_task_archive(root:String,id:String,files:Vec<TaskArchiveFile>,deleted_marker:Option<String>,directory:bool)->Result<(),String>{
 let guard=lock(&root,&id)?;guard.require_live()?;if directory{guard.require_capacity()?;}
 let target=guard.root.join("tasks").join(&id);
 if fs::symlink_metadata(&target).is_ok(){return Err("目标已有任务目录，未覆盖".into());}
 if files.len()>5000||!directory&&(!files.is_empty()||deleted_marker.is_none()){return Err("任务归档文件数量无效".into());}
 let mut names=std::collections::HashSet::new();let mut total=0usize;
 for file in &files{if !archive_path(&file.path)||!names.insert(file.path.clone()){return Err("任务归档路径无效或重复".into());}total=total.checked_add(file.contents.len()).ok_or("任务归档超额")?;if file.contents.len()>24*1024*1024||total>128*1024*1024{return Err("任务归档超过迁移额度".into());}}
 if deleted_marker.as_ref().is_some_and(|text|text.is_empty()||text.len()>2048){return Err("删除记录超过迁移额度或内容为空".into());}
 let imports=controlled_directory(&root,"tasks/.imports")?;
 let nonce=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e|e.to_string())?.as_nanos();let staging=imports.join(format!("{id}-{}-{nonce}",std::process::id()));fs::create_dir(&staging).map_err(|e|e.to_string())?;
 let result=(||->Result<(),String>{
  for file in files{let path=staging.join(&file.path);if file.path.starts_with("artifacts/"){fs::create_dir_all(staging.join("artifacts")).map_err(|e|e.to_string())?;}use std::io::Write;let mut output=fs::OpenOptions::new().write(true).create_new(true).open(path).map_err(|e|e.to_string())?;output.write_all(file.contents.as_bytes()).map_err(|e|e.to_string())?;output.sync_all().map_err(|e|e.to_string())?;}
  #[cfg(test)] archive_crash_point(&root,"staged");
  // Publish the tombstone first. A crash cannot reactivate a task that was already deleted.
  if let Some(marker)=deleted_marker{atomic_project_write_unlocked(&root,&format!("tasks/.locks/{id}.deleted"),marker.as_bytes())?;}
  #[cfg(test)] archive_crash_point(&root,"tombstone");
  if directory{fs::rename(&staging,&target).map_err(|e|e.to_string())?;}Ok(())
 })();
 if staging.exists(){let _=fs::remove_dir_all(&staging);}result
}

#[cfg(test)]
mod tests{
 use super::*;
 use crate::project_fs::{project_write_text_atomic,project_append_line,project_ensure_dir,project_create_text_exclusive,project_delete};
 fn root()->PathBuf{let p=std::env::temp_dir().join(format!("taudesign-task-txn-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));fs::create_dir_all(&p).unwrap();p}
 fn manifest(id:&str,state:&str,n:u64)->String{serde_json::json!({"version":1,"id":id,"projectId":"p","state":state,"sequence":n}).to_string()}
 #[test]
 fn two_writers_publish_once_and_completed_tasks_cannot_be_downgraded(){
  let root=root();let path=root.to_str().unwrap().to_owned();let id="design-race";
  project_publish_task_manifest(path.clone(),id.into(),None,manifest(id,"draft",0)).unwrap();let expected=project_task_manifest_identity(path.clone(),id.into()).unwrap();
  let mut threads=Vec::new();for n in [1,2]{let p=path.clone();let e=expected.clone();threads.push(std::thread::spawn(move||project_publish_task_manifest(p,id.into(),e,manifest(id,"draft",n)).is_ok()));}
  assert_eq!(threads.into_iter().filter(|t|t.thread().id()!=std::thread::current().id()).map(|t|t.join().unwrap()).filter(|ok|*ok).count(),1);
  let current=project_task_manifest_identity(path.clone(),id.into()).unwrap();project_publish_task_manifest(path.clone(),id.into(),current,manifest(id,"completed",3)).unwrap();let completed=project_task_manifest_identity(path.clone(),id.into()).unwrap();assert!(project_publish_task_manifest(path,id.into(),completed,manifest(id,"draft",4)).is_err());fs::remove_dir_all(root).unwrap();
 }
 #[test]
 fn deletion_tombstone_rejects_late_parts_logs_claims_and_manifest_recreation(){
  let root=root();let path=root.to_str().unwrap().to_owned();let id="design-deleted";project_publish_task_manifest(path.clone(),id.into(),None,manifest(id,"draft",0)).unwrap();
  let expected=project_task_manifest_identity(path.clone(),id.into()).unwrap();project_delete_design_task(path.clone(),id.into(),expected).unwrap();
  assert!(project_write_text_atomic(path.clone(),format!("tasks/{id}/artifacts/late.html"),"<main>late</main>".into()).is_err());
  assert!(project_append_line(path.clone(),format!("tasks/{id}/attempts.jsonl"),"{}".into()).is_err());assert!(project_ensure_dir(path.clone(),format!("tasks/{id}/artifacts")).is_err());
  assert!(project_publish_task_manifest(path.clone(),id.into(),None,manifest(id,"draft",2)).is_err());let claim=serde_json::json!({"version":1,"originTaskId":id,"newTaskId":"design-next","createdAt":1}).to_string();assert!(project_create_text_exclusive(path,format!("tasks/{id}/recovery-claim.json"),claim,None).is_err());
  assert!(!root.join(format!("tasks/{id}")).exists());fs::remove_dir_all(root).unwrap();
 }
 #[test]
 fn recovery_claim_compares_source_and_blocks_old_body_but_allows_cost_settlement(){
  let root=root();let path=root.to_str().unwrap().to_owned();let id="design-source";project_publish_task_manifest(path.clone(),id.into(),None,manifest(id,"blocked",0)).unwrap();let expected=project_task_manifest_identity(path.clone(),id.into()).unwrap();
  let claim=serde_json::json!({"version":1,"originTaskId":id,"newTaskId":"design-next","createdAt":1}).to_string();assert!(project_create_text_exclusive(path.clone(),format!("tasks/{id}/recovery-claim.json"),claim.clone(),None).is_err());assert!(project_create_text_exclusive(path.clone(),format!("tasks/{id}/recovery-claim.json"),claim,expected.clone()).unwrap());
  assert!(project_publish_task_manifest(path.clone(),id.into(),expected,manifest(id,"draft",1)).is_err());assert!(project_write_text_atomic(path.clone(),format!("tasks/{id}/artifacts/old.html"),"old".into()).is_err());project_append_line(path,format!("tasks/{id}/attempts.jsonl"),"{\"kind\":\"superseded-settlement\"}".into()).unwrap();fs::remove_dir_all(root).unwrap();
 }
 #[test]
 fn ordinary_alias_paths_cannot_bypass_manifest_or_lock_authority(){
  let root=root();let path=root.to_str().unwrap().to_owned();for rel in ["tasks/design-a/manifest.json","./tasks/design-a/./manifest.json","tasks//design-a/manifest.json","tasks\\design-a\\manifest.json","tasks/.locks/design-a.lock"]{assert!(project_write_text_atomic(path.clone(),rel.into(),"{}".into()).is_err(),"{rel}");}
  for rel in ["tasks","./tasks/./","tasks/.locks","tasks/design-a/manifest.json"]{assert!(project_delete(path.clone(),rel.into()).is_err(),"{rel}");}fs::remove_dir_all(root).unwrap();
 }
 #[test]
 fn project_task_quota_is_atomic_across_different_task_ids(){
  let root=root();for n in 0..39{fs::create_dir_all(root.join(format!("tasks/design-quota-{n}"))).unwrap();}let path=root.to_str().unwrap().to_owned();let mut threads=Vec::new();
  for id in ["design-quota-a","design-quota-b"]{let p=path.clone();threads.push(std::thread::spawn(move||project_publish_task_manifest(p,id.into(),None,manifest(id,"draft",1)).is_ok()));}assert_eq!(threads.into_iter().map(|t|t.join().unwrap()).filter(|ok|*ok).count(),1);assert_eq!(fs::read_dir(root.join("tasks")).unwrap().filter_map(Result::ok).filter(|entry|entry.file_name().to_str().is_some_and(valid_id)).count(),40);fs::remove_dir_all(root).unwrap();
 }
 #[test]
 fn child_lock_owner(){
  let Ok(root)=std::env::var("TAUDESIGN_TASK_LOCK_TEST_ROOT")else{return};let _guard=lock(&root,"design-process").unwrap();atomic_project_write_unlocked(&root,"tasks/design-process/artifacts/unpublished.html",b"<main>private</main>").unwrap();fs::write(PathBuf::from(&root).join("child-held"),b"ready").unwrap();std::thread::sleep(Duration::from_secs(30));
 }
 #[test]
 fn real_child_process_exit_releases_lock_without_publishing_its_private_artifact(){
  let root=root();let path=root.to_str().unwrap().to_owned();let id="design-process";project_publish_task_manifest(path.clone(),id.into(),None,manifest(id,"draft",0)).unwrap();let expected=project_task_manifest_identity(path.clone(),id.into()).unwrap();
  let mut child=std::process::Command::new(std::env::current_exe().unwrap()).args(["--exact","task_fs::tests::child_lock_owner","--nocapture"]).env("TAUDESIGN_TASK_LOCK_TEST_ROOT",&path).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).spawn().unwrap();
  let start=Instant::now();while !root.join("child-held").exists()&&start.elapsed()<Duration::from_secs(5){if child.try_wait().unwrap().is_some(){panic!("child exited before acquiring task lock");}std::thread::sleep(Duration::from_millis(5));}
  assert!(root.join("child-held").exists());let blocked=project_publish_task_manifest(path.clone(),id.into(),expected.clone(),manifest(id,"draft",1));child.kill().unwrap();child.wait().unwrap();assert!(blocked.is_err());assert_eq!(project_task_manifest_identity(path.clone(),id.into()).unwrap(),expected);
  project_publish_task_manifest(path,id.into(),expected,manifest(id,"draft",2)).unwrap();assert!(root.join("tasks/design-process/artifacts/unpublished.html").exists());fs::remove_dir_all(root).unwrap();
 }
 #[cfg(unix)]
 #[test]
 fn symlinked_lock_or_task_directory_never_writes_outside_the_project(){
  use std::os::unix::fs::symlink;let root=root();let outside=root.with_extension("outside");fs::create_dir_all(&outside).unwrap();fs::create_dir_all(root.join("tasks/.locks")).unwrap();symlink(outside.join("lock"),root.join("tasks/.locks/project.lock")).unwrap();let path=root.to_str().unwrap().to_owned();assert!(project_publish_task_manifest(path.clone(),"design-link".into(),None,manifest("design-link","draft",1)).is_err());assert!(!outside.join("lock").exists());fs::remove_file(root.join("tasks/.locks/project.lock")).unwrap();
  symlink(&outside,root.join("tasks/design-escape")).unwrap();assert!(project_publish_task_manifest(path.clone(),"design-escape".into(),None,manifest("design-escape","draft",1)).is_err());assert!(project_delete_design_task(path,"design-escape".into(),None).is_err());assert!(!outside.join("manifest.json").exists());fs::remove_dir_all(root).unwrap();fs::remove_dir_all(outside).unwrap();
 }
 #[test]
 fn archive_import_preserves_damaged_text_and_claims_without_replaying_authority(){
  let root=root();let path=root.to_str().unwrap().to_owned();let id="design-import";
  let claim=serde_json::json!({"version":1,"originTaskId":id,"newTaskId":"design-replacement","createdAt":1}).to_string();
  let files=vec![TaskArchiveFile{path:"manifest.json".into(),contents:"{broken JSON\n中文".into()},TaskArchiveFile{path:"artifacts/region.html".into(),contents:"<main>未完成".into()},TaskArchiveFile{path:"attempts.jsonl".into(),contents:"{bad row\n{}".into()},TaskArchiveFile{path:"recovery-claim.json".into(),contents:claim.clone()}];
  project_import_task_archive(path.clone(),id.into(),files,None,true).unwrap();
  assert_eq!(fs::read_to_string(root.join(format!("tasks/{id}/manifest.json"))).unwrap(),"{broken JSON\n中文");assert_eq!(fs::read_to_string(root.join(format!("tasks/{id}/recovery-claim.json"))).unwrap(),claim);
  assert!(project_write_text_atomic(path.clone(),format!("tasks/{id}/artifacts/late.html"),"late".into()).is_err());assert!(project_append_line(path,format!("tasks/{id}/attempts.jsonl"),"{}".into()).is_ok());fs::remove_dir_all(root).unwrap();
 }
 #[test]
 fn competing_archive_imports_publish_one_complete_directory_and_never_overwrite(){
  let root=root();let path=root.to_str().unwrap().to_owned();let mut jobs=Vec::new();
  for n in [1,2]{let p=path.clone();jobs.push(std::thread::spawn(move||project_import_task_archive(p,"design-import-race".into(),vec![TaskArchiveFile{path:"manifest.json".into(),contents:n.to_string()},TaskArchiveFile{path:"artifacts/output.html".into(),contents:n.to_string()}],None,true).is_ok()));}
  assert_eq!(jobs.into_iter().map(|job|job.join().unwrap()).filter(|ok|*ok).count(),1);
  let dir=root.join("tasks/design-import-race");assert_eq!(fs::read(dir.join("manifest.json")).unwrap(),fs::read(dir.join("artifacts/output.html")).unwrap());
  assert!(project_import_task_archive(path,"design-import-race".into(),vec![],None,true).is_err());fs::remove_dir_all(root).unwrap();
 }
 #[test]
 fn archive_import_preserves_empty_directories_and_deletion_markers_without_consuming_folder_quota(){
  let root=root();let path=root.to_str().unwrap().to_owned();for n in 0..40{project_import_task_archive(path.clone(),format!("design-empty-{n}"),vec![],None,true).unwrap();}
  assert!(project_import_task_archive(path.clone(),"design-over-limit".into(),vec![],None,true).is_err());
  project_import_task_archive(path.clone(),"design-old-deleted".into(),vec![],Some("historical marker\n".into()),false).unwrap();assert_eq!(fs::read_to_string(root.join("tasks/.locks/design-old-deleted.deleted")).unwrap(),"historical marker\n");
  assert!(project_import_task_archive(path,"design-old-deleted".into(),vec![],None,true).is_err());assert!(root.join("tasks/design-empty-0").is_dir());assert!(!root.join("tasks/design-old-deleted").exists());fs::remove_dir_all(root).unwrap();
 }
 #[test]
 fn archive_import_rejects_escaping_duplicate_paths_and_staging_symlinks(){
  let root=root();let path=root.to_str().unwrap().to_owned();
  for name in ["../outside.json","artifacts/../outside.html","artifacts/nested/a.html","/absolute.json","a\\b.json"]{assert!(project_import_task_archive(path.clone(),"design-invalid".into(),vec![TaskArchiveFile{path:name.into(),contents:"bad".into()}],None,true).is_err());}
  assert!(project_import_task_archive(path.clone(),"design-invalid".into(),vec![TaskArchiveFile{path:"manifest.json".into(),contents:"a".into()},TaskArchiveFile{path:"manifest.json".into(),contents:"b".into()}],None,true).is_err());assert!(!root.join("tasks/design-invalid").exists());
  #[cfg(unix)]{use std::os::unix::fs::symlink;let outside=root.with_extension("archive-outside");fs::create_dir_all(&outside).unwrap();symlink(&outside,root.join("tasks/.imports")).unwrap();assert!(project_import_task_archive(path,"design-link".into(),vec![],None,true).is_err());assert_eq!(fs::read_dir(&outside).unwrap().count(),0);fs::remove_dir_all(outside).unwrap();}
  fs::remove_dir_all(root).unwrap();
 }

 #[test]
 fn child_archive_import(){
  let Ok(root)=std::env::var("TAUDESIGN_ARCHIVE_CRASH_ROOT")else{return};let phase=std::env::var("TAUDESIGN_ARCHIVE_CRASH_PHASE").unwrap();
  project_import_task_archive(root,"design-archive-crash".into(),vec![TaskArchiveFile{path:"manifest.json".into(),contents:"historical manifest".into()},TaskArchiveFile{path:"artifacts/ready.html".into(),contents:"<main>ready</main>".into()}],if phase=="tombstone"{Some("old deleted marker".into())}else{None},true).unwrap();
 }
 #[test]
 fn killed_archive_import_never_publishes_partial_directory_and_preserves_deletion_barrier(){
  for phase in ["staged","tombstone"]{
   let root=root();let path=root.to_str().unwrap().to_owned();let mut child=std::process::Command::new(std::env::current_exe().unwrap()).args(["--exact","task_fs::tests::child_archive_import","--nocapture"]).env("TAUDESIGN_ARCHIVE_CRASH_ROOT",&path).env("TAUDESIGN_ARCHIVE_CRASH_PHASE",phase).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).spawn().unwrap();
   let start=Instant::now();while !root.join("archive-held").exists()&&start.elapsed()<Duration::from_secs(5){if child.try_wait().unwrap().is_some(){panic!("archive child exited before selected crash point");}std::thread::sleep(Duration::from_millis(5));}
   let reached=root.join("archive-held").exists();let hidden=!root.join("tasks/design-archive-crash").exists();child.kill().unwrap();child.wait().unwrap();assert!(reached&&hidden);assert!(!root.join("tasks/design-archive-crash").exists());
   let retry=project_import_task_archive(path,"design-archive-crash".into(),vec![TaskArchiveFile{path:"manifest.json".into(),contents:"retry".into()}],None,true);
   if phase=="staged"{retry.unwrap();assert_eq!(fs::read_to_string(root.join("tasks/design-archive-crash/manifest.json")).unwrap(),"retry");}else{assert!(retry.is_err());assert_eq!(fs::read_to_string(root.join("tasks/.locks/design-archive-crash.deleted")).unwrap(),"old deleted marker");}
   fs::remove_dir_all(root).unwrap();
  }
 }

}
