import type {AIProviderConfig} from '../../types/provider';
import {resolveModelCapability} from './modelCapabilities';
/** Configuration identity excludes credentials and unrelated model discovery results. */
export async function modelConfigurationFingerprint(provider:AIProviderConfig,model:string):Promise<string>{
 const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([,value])=>value!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,canonical(value)])):v;
 const text=JSON.stringify(canonical(['mi-v2',provider.protocol,new URL(provider.baseUrl.trim()).href,model,resolveModelCapability(provider,model)??null,provider.requestOutputCaps?.[model]??null]));
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
