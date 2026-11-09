import {test,expect} from 'bun:test';
import {inspectExternalMedia,assertExternalMedia,embeddedMediaIssue} from '../src/services/ai/externalMedia';
test('HTML/CSS reference independent files and approved HTTPS without media payload',()=>{
 const html='<main><img src="assets/images/cover.webp" srcset="assets/images/cover.webp 1x, https://example.test/large.webp 2x"><video src="assets/media/demo.mp4" poster="assets/images/poster.webp"><track src="assets/media/zh.vtt"></video><img src="assets/icons/bell.svg"><p>base64和data URL是本文讨论的概念。</p></main>';
 const result=inspectExternalMedia(html,'body{background:linear-gradient(red,blue),url("assets/images/bg.webp")}@font-face{font-family:body;src:url("assets/fonts/body.woff2")}');expect(result.violations).toEqual([]);expect(result.references).toHaveLength(9);
});
for(const [name,html] of Object.entries({image:'<img src="data:image/png;base64,YQ==">',encodedSvg:'<img src="data:image/svg+xml,%3Csvg%3E">',background:'<div style="background:url(d\\61ta:image/png;base64,YQ==)"></div>',poster:'<video poster="data:image/png;base64,YQ=="></video>',font:'<style>@font-face{src:url(data:font/woff2;base64,YQ==)}</style>',srcset:'<img srcset="https://example.test/a.png 1x, data:image/png;base64,YQ== 2x">',inlineSvg:'<svg><path d="M0 0L1 1"/></svg>',blob:'<audio src="blob:temporary"></audio>',template:'<template><img src="data:image/png;base64,YQ=="></template>',hidden:'<div data-image="data:image/png;base64,YQ=="></div>',imageSet:'<style>div{background:image-set("data:image/png;base64,YQ==" 1x)}</style>',traversal:'<img src="assets/images/%2e%2e/secret.png">'}))test(`rejects ${name} media in page output`,()=>{expect(()=>assertExternalMedia(html)).toThrow();});
test('SVG use may reference only an external asset, not a hidden in-page sprite',()=>{
 expect(inspectExternalMedia('<svg><use href="assets/icons/sprite.svg#bell"/></svg>').violations).toEqual([]);
 expect(inspectExternalMedia('<svg><use href="#bell"/></svg>').violations.length).toBeGreaterThan(0);
});
test('every image-set candidate and deferred custom-property image stays external',()=>{
 for(const css of [
  'background:image-set("assets/images/a.png" 1x, "data:image/png;base64,YQ==" 2x)',
  'background:-webkit-image-set("assets/images/a.png" 1x, "blob:temporary" 2x)',
  '--picture:"data:image/png;base64,YQ==";background:image-set(var(--picture) 1x)',
  'background:image-set(url("assets/images/a.png") 1x, "data:image/png;base64,YQ==" type("image/png") 2x)',
 ])expect(()=>assertExternalMedia('<main></main>',css)).toThrow();
 expect(inspectExternalMedia('<main></main>','background:image-set("assets/images/a.png" type("image/png") 1x, "assets/images/b.png" 2x)').references.map(r=>r.url)).toEqual(['assets/images/a.png','assets/images/b.png']);
});
test('unfinished start tags and CSS payload cannot become recovery prefixes',()=>{
 for(const html of ['<img src="data:image/png;base64,YQ==','<img src="d&#97;ta:image/png;base64,YQ==','<video poster="blob:temp','<img srcset="assets/images/a.png 1x, data:image/png;base64,YQ== 2x','<div style="background:url(data:image/png;base64,YQ=='])expect(embeddedMediaIssue(html)).toBeDefined();
 expect(embeddedMediaIssue('<img src="assets/images/part')).toBeUndefined();expect(embeddedMediaIssue('<p>讨论base64和data URL。</p>')).toBeUndefined();
});
test('inert text and unknown classes cannot smuggle media bytes into diagnostics or saved page code',()=>{
 for(const html of ['<p>data:image/png;base64,YWJjZA==</p>','<main class="bg-[url(data:image/png;base64,YQ==)]"></main>','<main data-value="prefix data:image/png;base64,YQ=="></main>'])expect(embeddedMediaIssue(html)?.code).toBe('embedded_media');
 expect(embeddedMediaIssue('<p>本文讨论base64及data URL规范，不含资源内容。</p>')).toBeUndefined();
});
