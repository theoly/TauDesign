import {test,expect} from 'bun:test';
import {compileBusinessTextEdits} from '../src/services/ai/businessTextEdits';
import {buildPageRedesignSource,inspectRedesignContent} from '../src/services/ai/pageRedesignSource';
test('明确文案替换编译成唯一节点的旧新文字合同，必须真正落实新文案',()=>{
 const old='<main><p data-nid="hint">资料越完整，匹配越精准</p><h1 data-nid="title">保持标题</h1></main>';
 const source=buildPageRedesignSource(old,{deviceProfile:'pc'}),request='将“资料越完整，匹配越精准”改为“资料越完整，获得的曝光越多”';
 expect(compileBusinessTextEdits(source.texts,request)).toEqual([{version:1,nid:'hint',before:'资料越完整，匹配越精准',after:'资料越完整，获得的曝光越多'}]);
 expect(inspectRedesignContent(source,old,request,old).some(f=>f.code==='redesign_text_change_missing')).toBe(true);
 expect(inspectRedesignContent(source,old.replace('</main>','<p>资料越完整，获得的曝光越多</p></main>'),request,old).some(f=>f.code==='redesign_text_change_missing')).toBe(true);
 expect(inspectRedesignContent(source,old.replace('资料越完整，匹配越精准','资料越完整，获得的曝光越多'),request,old)).toEqual([]);
 expect(compileBusinessTextEdits(source.texts,'不要'+request)).toEqual([]);
 expect(compileBusinessTextEdits([...source.texts,...source.texts],request)).toEqual([]);
 expect(()=>compileBusinessTextEdits(source.texts,request+'；将“资料越完整，匹配越精准”改为“别的内容”')).toThrow('冲突');
});
