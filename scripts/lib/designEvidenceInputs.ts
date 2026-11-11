import {readdir,readFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
export const sha256=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
/** Executable inputs only; excludes evidence/output/target caches and never reads private Provider storage. */
export async function captureDesignInputs(root:string,includeTests=false){
 const paths:string[]=[];
 async function visit(path:string){
  for(const entry of await readdir(path,{withFileTypes:true})){
   if(['target','gen','node_modules','__pycache__','.git','.DS_Store','Thumbs.db','visual-baselines'].includes(entry.name))continue;
   const full=resolve(path,entry.name);
   if(entry.isDirectory())await visit(full);else if(entry.isFile()&&!entry.name.endsWith('.pyc'))paths.push(relative(root,full));
  }
 }
 for(const dir of ['src','scripts','src-tauri','public'])await visit(resolve(root,dir));
 if(includeTests)await visit(resolve(root,'test'));
 for(const file of await readdir(root))if(/^(?:package\.json|pnpm-lock\.yaml|bun\.lock|index\.html|.*\.config\.(?:ts|js|cjs|mjs)|tsconfig.*\.json|bunfig\.toml)$/.test(file))paths.push(file);
 paths.push('test/fixtures/design-knowledge/generation-v1.json','test/fixtures/design-experiment.html','test/fixtures/design-native-acceptance.html');
 const entries=await Promise.all([...new Set(paths)].sort().map(async path=>[path,sha256(await readFile(resolve(root,path)))]));
 return Object.fromEntries(entries) as Record<string,string>;
}
