import { expect,test } from 'bun:test';
import { assessRestyleTarget, selectRestylePlan } from '../src/services/ai/restyleAssessment';
const t={kind:'screen' as const,id:'s',name:'Page',html:'<div data-nid="aaaaaaaa" class="card">Hello</div>'};
test('token classes recommend skip without claiming aesthetics',()=>{
 const a=assessRestyleTarget(t);expect(a.recommended).toBe(false);expect(a.selectable).toBe(true);expect(a.reason).toContain('未发现必须重塑项');
 expect(selectRestylePlan({queue:[t],dryRun:t,estimatedCalls:1,naiveCalls:1},[]).estimatedCalls).toBe(0);
 expect(selectRestylePlan({queue:[t],dryRun:t,estimatedCalls:1,naiveCalls:1},['screen:s']).dryRun?.id).toBe('s');
});
test('source CSS and unknown classes need checking; protected and empty cannot run',()=>{
 expect(assessRestyleTarget(t,{scopedCss:'.card {color:red}'}).recommended).toBe(true);
 expect(assessRestyleTarget({...t,html:'<div class="unknown">Hi</div>'}).recommended).toBe(true);
 expect(assessRestyleTarget({...t,protectedNids:['aaaaaaaa']}).selectable).toBe(false);
 expect(assessRestyleTarget({...t,html:'<div></div>'}).selectable).toBe(false);
});
