import {beforeEach,afterEach,spyOn} from 'bun:test';
import {MediaResourceSessions} from '../../src/services/storage/mediaResourceSession';
/** DOM route tests only. Real image decode/paint is verified in the two-engine browser suite. */
export async function unitMediaUrl(path:string,base64:string){const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');return 'https://unit-preview.example.test/'+hash+'/'+path;}
export function stubIndependentMediaTransport(hashBytes=false){
 let mock:ReturnType<typeof spyOn>;
 beforeEach(()=>{mock=spyOn(MediaResourceSessions,'create').mockImplementation(()=>({async url(path:string,base64:string){return hashBytes?unitMediaUrl(path,base64):'https://unit-preview.example.test/'+path;},async close(){}}));});
 afterEach(()=>mock.mockRestore());
}
