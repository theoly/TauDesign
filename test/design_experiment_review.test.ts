import {expect,test} from 'bun:test';
import {buildBlindReviewHtml} from '../src/services/ai/designKnowledge/experimentReview';
const index={version:1,planId:'12345678',pairs:[{id:'p001',request:'<script>alert("data")</script>',device:'mobile' as const,left:'r12345678.png',right:'r87654321.png'}]};
test('review HTML escapes request data and never embeds private mode mapping',()=>{
 const html=buildBlindReviewHtml(index);expect(html).not.toContain('<script>alert');expect(html).toContain('\\u003cscript\\u003e');expect(html).not.toContain('contextual');expect(html).not.toContain('baseline');
});
test('form requires explicit human/independent/blind attestations and four axes per page',()=>{
 const html=buildBlindReviewHtml(index);for(const text of ['未使用AI代填','独立完成评分','未查看方案来源','内容完整','层级','可读性','任务完成度','请选择','是否可采纳'])expect(html).toContain(text);
 expect(html).toContain('不可用页面不能选择均可用的平局');expect(html).toContain('review.planId!==index.planId');
});
