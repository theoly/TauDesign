import {expect,test} from 'bun:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PageTaskPlanCard} from '../src/components/chat/PageTaskPlanCard';
import {preparePageTaskPlan} from '../src/services/ai/pageTaskPlan';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {defaultProviders} from '../src/stores/useAIConfigStore';
import {TaskBudget} from '../src/services/ai/taskBudget';
test('task card displays information, interactions, conditions and unresolved questions as escaped design data',async()=>{
 const contract=buildDesignTaskContract({intent:'create_screen',request:'创建预约页面',deviceProfile:'mobile',frameWidth:390});
 const transport=new MockTransport();transport.queueResponse(JSON.stringify({goal:'完成预约',actor:'预约用户',completion:['查看反馈'],questions:['确认预约规则'],
  features:[{id:'f1',title:'预约',change:'add',basis:'inference',sourceIds:[],information:[{label:'<img src=x onerror=alert(1)>',kind:'input'}],
  interactions:[{label:'确认预约',precondition:'已填写',outcome:'显示结果',targetScreenId:''}],states:[{name:'空值',condition:'尚未填写',feedback:'提示填写'}]}]}));
 const budget=new TaskBudget({maxRequests:1,maxRequestedOutputTokens:3072,maxDurationMs:900000,maxRequestDurationMs:900000});
 try{contract.pageTaskPlan=await preparePageTaskPlan(new DefaultAIEngineCore(transport),{contract,provider:{...defaultProviders[0],protocol:'openai_compatible',baseUrl:'http://mock'},model:'mock',budget,isCurrent:()=>true});}
 finally{budget.close();}
 const markup=renderToStaticMarkup(<PageTaskPlanCard contract={contract}/>),doc=new DOMParser().parseFromString(markup,'text/html');
 expect(doc.body.textContent).toContain('需要输入：<img');expect(doc.querySelector('img')).toBeNull();
 for(const text of ['AI 推断','前提：已填写','反馈：显示结果','条件：尚未填写','待确认：确认预约规则','不表示业务功能'])expect(doc.body.textContent).toContain(text);
});
