/** Shared transactions for browser fallback files; desktop files remain on disk. */
let connection:Promise<IDBDatabase>|undefined;
export function browserProjectDatabase():Promise<IDBDatabase>{
 if(!globalThis.indexedDB)return Promise.reject(Error('当前浏览器缺少IndexedDB，不能安全保存工程或资源；旧数据保留。'));
 if(connection)return connection;
 const opened=new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('taudesign-managed-projects-v1',2);let refused=false;
  request.onupgradeneeded=()=>{for(const name of ['projects','resources'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name);};
  request.onerror=()=>{refused=true;reject(Error('工程事务数据库无法打开，旧数据保留。'));};
  request.onblocked=()=>{refused=true;reject(Error('工程事务数据库升级被其它窗口占用，请关闭旧窗口后重试。'));};
  request.onsuccess=()=>{const db=request.result;if(refused){db.close();return;}db.onversionchange=()=>{db.close();if(connection===opened)connection=undefined;};resolve(db);};
 });connection=opened;void opened.catch(()=>{if(connection===opened)connection=undefined;});return opened;
}
