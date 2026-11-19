import {expect,test} from 'bun:test';
import {restoreProtectedNodes} from '../src/services/ai/restoreProtectedNodes';
import {finalizeModelHtml} from '../src/services/ai/modelHtmlResult';

test('missing protected footer is restored from baseline before quality can flag it',()=>{
 const baseline=`<main data-nid="root"><section data-nid="body"><p data-nid="copy">正文</p></section><footer class="tabbar-wrap" data-nid="foot"><nav class="tabbar" data-nid="nav"><span data-nid="tab">决策</span></nav></footer></main>`;
 const draft=`<main data-nid="root"><section data-nid="body"><p data-nid="copy">正文已改</p></section></main>`;
 const restored=restoreProtectedNodes(draft,baseline,['foot','nav']);
 expect(restored).toContain('data-nid="foot"');
 expect(restored).toContain('data-nid="nav"');
 expect(restored).toContain('决策');
 expect(restored).toContain('正文已改');
});

test('finalizeModelHtml restores protected nodes once and can clear protected_style_changed',()=>{
 const baseline=`<!DOCTYPE html><html><body><main data-nid="root"><p data-nid="copy">说明</p><footer class="keep" data-nid="foot"><nav data-nid="nav">底栏</nav></footer></main></body></html>`;
 const raw=`<artifact type="screen" identifier="s1" title="t"><main data-nid="root"><p data-nid="copy">说明</p></main></artifact>`;
 const result=finalizeModelHtml({rawResponse:raw,continuationCount:0,warnings:[],finishReason:'stop'},{baselineHtml:baseline,protectedNids:['foot','nav'],deviceProfile:'pc',requireExternalMedia:false});
 expect(result.autoRepaired).toBe(true);
 expect(result.html).toContain('data-nid="foot"');
 expect(result.qualityReport?.findings.some(f=>f.code==='protected_style_changed')).toBe(false);
});
