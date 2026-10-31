import {expect,test} from 'bun:test';
import {generateIconSvg,validateIconSvg} from '../src/services/ai/iconSvgGeneration';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
const provider={id:'icon',name:'test',protocol:'openai_compatible' as const,baseUrl:'http://mock',apiKey:''};
test('complete monochrome shapes and a single code fence serialize to safe SVG children',()=>{
  for(const raw of ['<path d="M2 2L20 20" stroke="currentColor"/>','```svg\n<g transform="translate(1 2)"><circle cx="10" cy="10" r="4" fill="none"/></g>\n```']){
    const result=validateIconSvg(raw);expect(result).not.toContain('<svg');expect(result.length).toBeGreaterThan(10);
  }
});
test.each([
  '<path d="M2 2"','<script>alert(1)</script>','<path d="M2 2" onclick="alert(1)"/>',
  '<image href="https://external.test/x"/>','<foreignObject><div>text</div></foreignObject>',
  '<path d="M2 2" fill="url(#external)"/>','<path d="M2 2" style="fill:red"/>',
  '<text>private text</text>','<!DOCTYPE svg><path d="M0 0"/>','<svg><path d="M0 0"/></svg>'
])('unsafe, active, external or incomplete fragment is never published: %s',raw=>expect(()=>validateIconSvg(raw)).toThrow());
test('existing core is used once and output-limit response cannot become a preview',async()=>{
  const transport=new MockTransport();transport.queueResponse('<circle cx="12" cy="12" r="8"/>');
  const svg=await generateIconSvg(new DefaultAIEngineCore(transport),{provider,model:'mock'},'圆形图标');expect(svg).toContain('circle');
  const limited=new MockTransport([{events:[{type:'Delta',text:'<path d="M0 0"/>'},{type:'Done',finish_reason:'length'}]}]);
  await expect(generateIconSvg(new DefaultAIEngineCore(limited),{provider,model:'mock'},'图标')).rejects.toThrow();
});
test('cancelled generation never starts a transport',async()=>{
  const transport=new MockTransport(),controller=new AbortController();controller.abort();
  await expect(generateIconSvg(new DefaultAIEngineCore(transport),{provider,model:'mock'},'图标',controller.signal)).rejects.toThrow();
  expect(transport.lastRequest).toBeUndefined();
});
