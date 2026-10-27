import {test,expect} from 'bun:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,statSync,symlinkSync,readlinkSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {releaseMetadata,collectBinaries,expectedBinaries} from '../scripts/release.mjs';
const fixture=(run:(root:string)=>void)=>{const root=mkdtempSync(join(tmpdir(),'tau-release-'));try{run(root);}finally{rmSync(root,{recursive:true,force:true});}};
const file=(root:string,name:string,body='binary')=>{const p=join(root,name);mkdirSync(join(p,'..'),{recursive:true});writeFileSync(p,body,{mode:0o755});return p;};
test('release tags are explicit SemVer, prereleases detected, shell/newline/path payloads rejected',()=>{
 expect(releaseMetadata('v1.2.3','TauDesign')).toEqual({version:'1.2.3',slug:'TauDesign',prerelease:false});
 expect(releaseMetadata('v0.0.1','TauDesign').version).toBe('0.0.1');
 expect(releaseMetadata('v1.2.3-beta.1','Tau Design').prerelease).toBe(true);
 for(const tag of ['master','v01.2.3','v1.2','v1.2.3+local','v1.2.3-beta.01','v1.2.3\n','v1.2.3\nversion=evil','v1.2.3;touch /tmp/x','v1.2.65536'])expect(()=>releaseMetadata(tag,'TauDesign')).toThrow();
 expect(()=>releaseMetadata('v1.0.0','../Bad')).toThrow();
});
test('Linux requires both packages before collection; ambiguous and empty outputs are rejected',()=>fixture(root=>{
 const output=join(root,'out');file(root,'bundle/deb/app.deb');
 const options={root:join(root,'bundle'),output,target:'x86_64-unknown-linux-gnu',tag:'v1.2.3',productName:'TauDesign'};
 expect(()=>collectBinaries(options)).toThrow('AppImage');
 file(root,'bundle/appimage/app.AppImage');
 expect(collectBinaries(options)).toEqual(expectedBinaries('TauDesign','1.2.3').filter(n=>n.includes('linux')));
 expect(readFileSync(join(output,'TauDesign-1.2.3-linux-x64.deb'),'utf8')).toBe('binary');
 file(root,'bundle/deb/another.deb');expect(()=>collectBinaries(options)).toThrow('found 2');
}));
test('Windows setup gets unambiguous platform/architecture filename',()=>fixture(root=>{
 file(root,'bundle/nsis/setup.exe');expect(collectBinaries({root:join(root,'bundle'),output:join(root,'out'),target:'x86_64-pc-windows-msvc',tag:'v1.0.0-beta.1',productName:'TauDesign'})).toEqual(['TauDesign-1.0.0-beta.1-windows-x64-setup.exe']);
}));
test('macOS app archives retain executable mode and symlinks through extraction',()=>fixture(root=>{
 const bundle=join(root,'bundle'),app='Tau Design.app';file(bundle,`macos/${app}/Contents/MacOS/app`);symlinkSync('app',join(bundle,'macos',app,'Contents/MacOS/alias'));
 const [name]=collectBinaries({root:bundle,output:join(root,'out'),target:'aarch64-apple-darwin',tag:'v1.2.3',productName:'Tau Design'});
 expect(name).toBe('Tau-Design-1.2.3-macos-arm64.app.tar.gz');mkdirSync(join(root,'extracted'));execFileSync('tar',['-xzf',join(root,'out',name),'-C',join(root,'extracted')]);
 expect(statSync(join(root,'extracted',app,'Contents/MacOS/app')).mode&0o111).toBeGreaterThan(0);expect(readlinkSync(join(root,'extracted',app,'Contents/MacOS/alias'))).toBe('app');
}));
test('empty bundles and unknown targets fail',()=>fixture(root=>{
 file(root,'nsis/setup.exe','');const options={root,output:join(root,'out'),tag:'v1.0.0',productName:'TauDesign'};
 expect(()=>collectBinaries({...options,target:'x86_64-pc-windows-msvc'})).toThrow('found 0');expect(()=>collectBinaries({...options,target:'unknown'})).toThrow('Unsupported');
}));
