import {afterEach,beforeEach,expect,test} from 'bun:test';
import {styleRepairErrorNids} from '../src/services/ai/styleRepairEligibility';
import {assessedFinding} from '../src/services/ai/findingPolicy';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {proposeStyleRepair} from '../src/services/ai/controlledStyleRepair';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import type {RenderedQualityReport} from '../src/utils/renderedQuality';

const source='<section data-nid="region"><button data-nid="save" style="font-size:0px"><span>保存资料</span></button></section>';
const literal=assessedFinding('required-action-text','failed',{code:'required_action_text_missing',nid:'save',message:'原文不可见',actual:'字号0',expected:'保存资料'});
const ordinary={code:'render_action_invisible_label',severity:'error' as const,nid:'save',message:'文案不可见',actual:'字号0',expected:'文案'};
const unknown=assessedFinding('required-action-text-support','unverified',{code:'required_action_text_unverified',nid:'save',message:'未测量',actual:'变换',expected:'复验'});
let prior:ReturnType<typeof useProjectStore.getState>,history:ReturnType<typeof useHistoryStore.getState>;
beforeEach(()=>{prior=useProjectStore.getState();history=useHistoryStore.getState();useProjectStore.getState().initNewProject({name:'样式修复资格',deviceProfile:'pc',createSpecimen:false});});
afterEach(()=>{useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);});
function task(request='按钮文案改为“保存资料”'){
 return buildDesignTaskContract({intent:'create_screen',request,deviceProfile:'pc',frameWidth:1440});
}
const rows=[
 {name:'own zero font',html:source,findings:[literal],allowed:true},
 {name:'measured ordinary failure same control',html:source.replace('font-size:0px','font-size:14px'),findings:[ordinary,literal],allowed:true},
 {name:'ordinary unchanged protocol',html:source,findings:[ordinary],allowed:true},
 {name:'wrong literal',html:source.replace('保存资料','查看详情'),findings:[literal],allowed:false},
 {name:'empty literal',html:source.replace('保存资料',''),findings:[literal],allowed:false},
 {name:'adjacent text',html:source.replace('保存资料','')+'<p>保存资料</p>',findings:[literal],allowed:false},
 {name:'child zero font with visible named icon',html:'<button data-nid="save" aria-label="保存资料"><span style="font-size:0">保存资料</span><svg class="icon" aria-hidden="true"></svg></button>',findings:[literal],allowed:false},
 {name:'uncertain rendering',html:source,findings:[unknown],allowed:false},
 {name:'ordinary mixed with uncertain',html:source,findings:[ordinary,unknown],allowed:false},
 {name:'no source declaration',html:source,findings:[literal],request:'优化页面',allowed:false},
 {name:'duplicate source matches',html:source+'<button data-nid="another" style="font-size:0">保存资料</button>',findings:[literal],allowed:false},
 {name:'wrong target',html:source,findings:[{...literal,nid:'region'}],allowed:false},
 {name:'unknown required code',html:source,findings:[{...ordinary,code:'render_compressed_body'}],allowed:false},
 {name:'ordinary cannot repair missing declared text',html:source.replace('保存资料','查看详情'),findings:[ordinary],allowed:false},
];
for(const row of rows)test(`style-only qualification: ${row.name}`,()=>{
 const doc=new DOMParser().parseFromString(row.html,'text/html'),report={status:'complete' as const,inspected:3,findings:row.findings};
 expect(styleRepairErrorNids(doc,task(row.request),report)).toEqual(row.allowed?['save']:undefined);
});
for(const kind of ['incomplete','invalid-coverage','invalid-assessment','bad-findings'] as const)test(`${kind} initial report never reaches a repair model`,async()=>{
 const report:RenderedQualityReport={status:'complete',inspected:3,findings:[literal]};
 if(kind==='incomplete')report.status='incomplete';
 if(kind==='invalid-coverage')(report as any).coverage=[{reason:'skip-required',count:1,nids:['save']}];
 if(kind==='invalid-assessment')(report.findings[0] as any)={...literal,severity:'warning'};
 if(kind==='bad-findings')(report as any).findings=null;
 let calls=0;const core={streamText(){calls++;throw Error('should not call');},async generateObject(){calls++;throw Error('should not call');}};
 const result=await proposeStyleRepair({state:useProjectStore.getState(),html:source,contract:task(),render:report,context:'12345678'},
  {isCurrent:()=>true,model:{core,provider:{id:'fixture'} as any,model:'fixture'}});
 expect(result.status).toBe('skipped');expect(calls).toBe(0);
});
