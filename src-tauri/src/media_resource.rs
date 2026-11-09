//! Independent immutable media for iframe previews. No filesystem path is exposed in a URL.
use std::collections::HashMap;
use std::sync::{Mutex,OnceLock};
use base64::Engine;
const LIMIT:usize=128*1024*1024;
#[derive(Clone)]
pub struct Resource { pub bytes:Vec<u8>,pub mime:String }
static RESOURCES:OnceLock<Mutex<HashMap<String,Resource>>>=OnceLock::new();
fn registry()->&'static Mutex<HashMap<String,Resource>>{RESOURCES.get_or_init(||Mutex::new(HashMap::new()))}
fn valid_token(token:&str)->bool{token.len()==36&&token.chars().all(|c|c.is_ascii_hexdigit()||c=='-')}
fn valid_mime(mime:&str)->bool{matches!(mime,"image/png"|"image/jpeg"|"image/gif"|"image/webp"|"image/avif"|"image/bmp"|"image/svg+xml"|"image/x-icon"|"font/woff"|"font/woff2"|"font/ttf"|"font/otf"|"audio/mpeg"|"audio/ogg"|"audio/wav"|"video/mp4"|"video/webm"|"text/vtt")}
#[tauri::command]
pub fn register_media_resource(token:String,mime:String,base64_data:String)->Result<(),String>{
 if !valid_token(&token)||!valid_mime(&mime)||base64_data.len()>48*1024*1024{return Err("预览媒体身份、类型或大小无效".into());}
 let bytes=base64::engine::general_purpose::STANDARD.decode(base64_data).map_err(|_|"媒体文件读取编码无效")?;
 if bytes.is_empty()||bytes.len()>32*1024*1024{return Err("预览媒体大小超限".into());}
 let mut map=registry().lock().map_err(|_|"媒体注册表不可用")?;
 if map.contains_key(&token)||map.len()>=4096||map.values().map(|r|r.bytes.len()).sum::<usize>()+bytes.len()>LIMIT{return Err("预览媒体缓存配额不足".into());}
 map.insert(token,Resource{bytes,mime});Ok(())
}
#[tauri::command]
pub fn release_media_resources(tokens:Vec<String>)->Result<(),String>{
 if tokens.len()>4096||tokens.iter().any(|t|!valid_token(t)){return Err("媒体释放清单无效".into());}
 let mut map=registry().lock().map_err(|_|"媒体注册表不可用")?;for token in tokens{map.remove(&token);}Ok(())
}
pub fn get(token:&str)->Option<Resource>{if !valid_token(token){return None;}registry().lock().ok()?.get(token).cloned()}
fn byte_range(header:&str,len:usize)->Option<(usize,usize)>{
 let text=header.strip_prefix("bytes=")?;let (a,b)=text.split_once('-')?;
 if len==0||text.contains(',')||!a.bytes().all(|c|c.is_ascii_digit())||!b.bytes().all(|c|c.is_ascii_digit()){return None;}
 if a.is_empty(){let count=b.parse::<usize>().ok()?;return if count==0{None}else{Some((len.saturating_sub(count),len-1))};}
 let start=a.parse::<usize>().ok()?;let end=if b.is_empty(){len-1}else{b.parse::<usize>().ok()?.min(len-1)};
 if start>=len||end<start{None}else{Some((start,end))}
}
pub fn response(token:&str,range:Option<&str>,method:&str)->tauri::http::Response<Vec<u8>>{
 use tauri::http::Response;
 if method!="GET"&&method!="HEAD"{return Response::builder().status(405).header("Allow","GET, HEAD").body(Vec::new()).unwrap();}
 let resource=match get(token){Some(r)=>r,None=>return Response::builder().status(404).body(Vec::new()).unwrap()};let total=resource.bytes.len();
 let mut builder=Response::builder().header("Content-Type",resource.mime).header("Cache-Control","no-store").header("Accept-Ranges","bytes")
  .header("Access-Control-Allow-Origin","*").header("X-Content-Type-Options","nosniff").header("Content-Security-Policy","default-src 'none'; style-src 'unsafe-inline'");
 let (start,end)=if let Some(header)=range{match byte_range(header,total){Some((a,b))=>{builder=builder.status(206).header("Content-Range",format!("bytes {a}-{b}/{total}"));(a,b)},None=>return builder.status(416).header("Content-Range",format!("bytes */{total}")).body(Vec::new()).unwrap()}}else{(0,total-1)};
 let bytes=if method=="HEAD"{Vec::new()}else{resource.bytes[start..=end].to_vec()};builder.header("Content-Length",(end-start+1).to_string()).body(bytes).unwrap()
}
#[cfg(test)]mod tests{use super::*;
 #[test]fn media_range_and_head_are_bounded_and_match_lengths(){
  let token="b1111111-1111-4111-a111-111111111111".to_string();register_media_resource(token.clone(),"video/mp4".into(),"MDEyMzQ1Njc4OQ==".into()).unwrap();
  for (range,expected) in [("bytes=2-4",b"234".to_vec()),("bytes=-3",b"789".to_vec()),("bytes=8-",b"89".to_vec()),("bytes=8-999",b"89".to_vec())]{let r=response(&token,Some(range),"GET");assert_eq!(r.status(),206);assert_eq!(r.body(),&expected);}
  for range in ["bytes=10-","bytes=4-2","bytes=-0","bytes=1-2,4-5","bytes=9999999999999999999999999-"]{assert_eq!(response(&token,Some(range),"GET").status(),416);}
  let head=response(&token,None,"HEAD");assert!(head.body().is_empty());assert_eq!(head.headers()["content-length"],"10");assert_eq!(response(&token,None,"POST").status(),405);release_media_resources(vec![token]).unwrap();
 }
 #[test]fn immutable_resource_has_no_path_access(){let token="a1111111-1111-4111-a111-111111111111".to_string();register_media_resource(token.clone(),"image/png".into(),"eA==".into()).unwrap();assert_eq!(get(&token).unwrap().bytes,b"x");assert!(get("../project.json").is_none());assert!(register_media_resource(token.clone(),"text/html".into(),"eA==".into()).is_err());release_media_resources(vec![token.clone()]).unwrap();assert!(get(&token).is_none());}
}
