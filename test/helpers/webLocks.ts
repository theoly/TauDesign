/** A queued in-process Web Locks adapter for DOM unit tests, not native/multi-process proof. */
export function createTestWebLocks(){
 const queues=new Map<string,Promise<void>>();
 return {async request<T>(name:string,callback:(lock:{name:string;mode:'exclusive'})=>T|Promise<T>):Promise<T>{
  const previous=queues.get(name)??Promise.resolve();let release!:()=>void;const held=new Promise<void>(done=>release=done),tail=previous.catch(()=>{}).then(()=>held);queues.set(name,tail);
  await previous.catch(()=>{});try{return await callback({name,mode:'exclusive'});}finally{release();if(queues.get(name)===tail)queues.delete(name);}
 }};
}
