#!/usr/bin/env python3
"""Real Chromium/WebKit DOM and screenshots; fixture-only model, no Provider traffic."""
import argparse,asyncio,base64,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',default='doc/ui-design-workflow/evidence/2026-10-30-json-ui')
OUT=(ROOT/parser.parse_args().output).resolve()
async def verify_history(page,engine,kind):
    await page.wait_for_function('''async()=>{
      const turns=await functionChatFixture.state().getConversationStore().loadRecent();
      return turns.some(t=>t.assistant.pageTaskHistory);
    }''')
    await page.evaluate('''()=>{
      const state=functionChatFixture.state();
      const id=Object.keys(state.screens).find(id=>id!=='old')??'old';
      state.updateScreenHtml(id,'<main>后续修改页面，不能替换历史规划</main>');
      functionChatFixture.reopen();
    }''')
    await page.get_by_text('历史功能规划，仅供回溯；不代表当前页面已复验，也不能直接采纳或续写。',exact=True).wait_for()
    await page.get_by_label('功能与交互规划',exact=True).locator('summary').click()
    plan=await page.get_by_label('功能与交互规划',exact=True).inner_text()
    assert '选择预约时间并确认' in plan and '需要输入：预约时间' in plan
    assert await page.get_by_label('需求覆盖线索',exact=True).count()==0
    assert await page.evaluate('functionChatFixture.requests.length')==2
    assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
    assert 'FIXTURE_SECRET' not in await page.locator('body').inner_text()
    await page.get_by_label('功能与交互规划',exact=True).scroll_into_view_if_needed()
    await page.screenshot(path=str(OUT/f'{engine}-{kind}-history.png'),full_page=True)
    return {'planRestored':True,'requestsUnchanged':True,'currentPageCoverageNotReused':True}
async def verify_multi_page(page,engine,edited):
    kind='edited' if edited else 'unchanged'
    await page.goto('http://127.0.0.1:5174/test/fixtures/multi-page-functions.html',wait_until='networkidle')
    await page.locator('textarea[placeholder^="输入设计诉求"]').fill('生成登录页、注册页两个页面')
    await page.locator('button[title*="发送设计诉求"]').click()
    card=page.get_by_test_id('multi-page-plan')
    await card.get_by_role('button',name='确认计划并生成 2 页',exact=True).wait_for()
    await card.get_by_label('登录页功能规划',exact=True).locator('summary').click()
    text=await card.get_by_label('登录页功能规划',exact=True).inner_text()
    assert '需要展示：手机号登录' in text and '前提：信息已填写' in text and '状态：默认' in text
    assert await page.evaluate('multiFunctionFixture.requests.length')==1
    if edited:
        await card.get_by_label('第1页要求',exact=True).fill('增加邮箱输入框及提交后的反馈')
        assert '初始功能规划（要求已调整）' in await card.inner_text()
    await page.screenshot(path=str(OUT/f'{engine}-multi-{kind}-plan.png'),full_page=True)
    await card.get_by_role('button',name='确认计划并生成 2 页',exact=True).click()
    await page.wait_for_function('Object.keys(multiFunctionFixture.state().screens).length===3')
    await page.get_by_text('已按确认计划新增 2 页，全部通过检查。可一次撤销。',exact=True).wait_for()
    result=await page.evaluate('''()=>{
      const f=multiFunctionFixture,s=f.state(),pages=Object.values(s.screens).filter(p=>p.id!=='old');
      return {requests:f.requests,originalUnchanged:s.screens.old.htmlContent===f.original,historyAdded:f.history().past.length-f.before,
        plans:pages.map(p=>({name:p.name,goal:p.metadata.creationEvidence.contract.pageTaskPlan.plan.goal,
          confirmed:!!p.metadata.creationEvidence.contract.pageTaskPlan.request.planSource,workflow:p.metadata.creationEvidence.workflow.status}))};
    }''')
    expected=['batch-plan','page-plan','html','html'] if edited else ['batch-plan','html','html']
    assert [r['stage'] for r in result['requests']]==expected,result
    assert all(r['containsPlan'] for r in result['requests'] if r['stage']=='html'),result
    assert result['originalUnchanged'] and result['historyAdded']==1,result
    assert [p['confirmed'] for p in result['plans']]==[not edited,True],result
    assert all(p['workflow']=='ready' for p in result['plans']),result
    if edited:assert result['plans'][0]['goal']=='浏览邮箱登录并完成所需操作'
    await page.evaluate('multiFunctionFixture.inspectSecond()')
    await page.get_by_text('页面创建验收记录',exact=True).click()
    await page.get_by_label('功能与交互规划',exact=True).locator('summary').click()
    assert '规划来自已确认的多页计划' in await page.locator('body').inner_text()
    assert 'FIXTURE_SECRET' not in await page.locator('body').inner_text()
    assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
    await page.screenshot(path=str(OUT/f'{engine}-multi-{kind}-delivery.png'),full_page=True)
    return result
async def verify_functional_region(page,engine,reference,png):
    kind='reference' if reference else 'text'
    await page.goto('http://127.0.0.1:5174/test/fixtures/region-functions.html'+('?mode=reference' if reference else ''),wait_until='networkidle')
    if reference:
        await page.locator('input[type="file"]').set_input_files({'name':'区块参考.png','mimeType':'image/png','buffer':base64.b64decode(png)})
        await page.get_by_text('区块参考.png',exact=True).wait_for()
    await page.locator('textarea[placeholder^="输入设计诉求"]').fill('修改当前页面，优化资料区')
    await page.locator('button[title*="发送设计诉求"]').click()
    review=page.get_by_test_id('modification-review')
    await review.locator('input[type="checkbox"]').first.check()
    await review.locator('textarea').fill('增加邮箱输入框，提交后显示校验反馈')
    assert await review.get_by_role('radio',name='复制后完整区块修改',exact=False).is_checked()
    await review.get_by_role('button',name='按所选内容生成新版',exact=True).click()
    await page.wait_for_function('!!regionFunctionFixture.state().stagedScreen')
    await page.get_by_label('功能与交互规划',exact=True).wait_for()
    await page.get_by_label('功能与交互规划',exact=True).locator('summary').click()
    await page.get_by_label('需求覆盖线索',exact=True).locator('summary').click()
    result=await page.evaluate('''()=>{
      const f=regionFunctionFixture,s=f.state(),c=s.stagedScreen;
      const old=new DOMParser().parseFromString(f.original,'text/html'),next=new DOMParser().parseFromString(c.newHtml,'text/html');
      return {requests:f.requests,pipelineCalls:f.pipelineCalls,originalUnchanged:s.screens.page.htmlContent===f.original,
        outsideUnchanged:old.querySelector('aside').isEqualNode(next.querySelector('aside')),historyAdded:f.history().past.length-f.before,
        scope:c.workflowContract.allowedChanges,goal:c.workflowContract.pageTaskPlan.plan.goal,basis:c.workflowContract.pageTaskPlan.plan.features[0].basis,
        metadataContainsPixels:JSON.stringify(c.workflowContract).includes('data:image')};
    }''')
    assert [r['stage'] for r in result['requests']]==['analysis','plan','region'],result
    assert result['requests'][1]['planningInput']=={'nids':['region01'],'outsideInBaseline':False,'fullBaselinePresent':False},result
    assert result['requests'][2]['hasPlan'],result
    assert result['pipelineCalls']==0 and result['originalUnchanged'] and result['outsideUnchanged'] and result['historyAdded']==0,result
    assert result['scope']==['element:region01'] and result['goal']=='填写邮箱并查看反馈' and not result['metadataContainsPixels'],result
    assert result['basis']==('image' if reference else 'user'),result
    if reference:
        assert all(r['images']==result['requests'][0]['images'] and len(r['images'])==1 for r in result['requests']),result
    coverage=await page.get_by_label('需求覆盖线索',exact=True).inner_text()
    assert '0 项未定位' in coverage and '语义未验证' in coverage
    await page.get_by_label('本轮预算记录',exact=True).locator('summary').click()
    assert '请求 2/4' in await page.get_by_label('本轮预算记录',exact=True).inner_text()
    assert 'FIXTURE_SECRET' not in await page.locator('body').inner_text()
    assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
    await page.get_by_label('功能与交互规划',exact=True).scroll_into_view_if_needed()
    await page.screenshot(path=str(OUT/f'{engine}-region-{kind}.png'),full_page=True)
    await page.wait_for_function('''async()=>{
      const turns=await regionFunctionFixture.state().getConversationStore().loadRecent();return turns.some(t=>t.assistant.pageTaskHistory);
    }''')
    await page.evaluate('regionFunctionFixture.reopen()')
    await page.get_by_text('历史功能规划，仅供回溯；不代表当前页面已复验，也不能直接采纳或续写。',exact=True).wait_for()
    await page.get_by_label('功能与交互规划',exact=True).locator('summary').click()
    assert '填写邮箱并查看反馈' in await page.get_by_label('功能与交互规划',exact=True).inner_text()
    assert await page.get_by_label('需求覆盖线索',exact=True).count()==0
    assert await page.evaluate('regionFunctionFixture.requests.length')==3
    await page.screenshot(path=str(OUT/f'{engine}-region-{kind}-history.png'),full_page=True)
    return result
async def verify_element_structure(page,engine,mode,png):
    decorative=mode=='decorative'
    await page.goto('http://127.0.0.1:5174/test/fixtures/element-functions.html?mode='+mode,wait_until='networkidle')
    if mode=='reference':
        await page.locator('input[type="file"]').set_input_files({'name':'元素参考.png','mimeType':'image/png','buffer':base64.b64decode(png)})
        await page.get_by_text('元素参考.png',exact=True).wait_for()
    request='增加图标' if decorative else '把邮箱设为必填' if mode=='form' else '增加邮箱输入框，提交后显示校验反馈'
    wrapped='[引用元素 nid="region01" 画框="资料页" 标签=<section>]\n元素片段:\n<section>旧资料区</section>\n\n'+request
    await page.locator('textarea[placeholder^="输入设计诉求"]').fill(wrapped)
    await page.locator('button[title*="发送设计诉求"]').click()
    await page.wait_for_function('!!elementFunctionFixture.state().stagedScreen')
    assert await page.get_by_test_id('modification-review').count()==0
    result=await page.evaluate('''()=>{
      const f=elementFunctionFixture,s=f.state(),c=s.stagedScreen;
      const old=new DOMParser().parseFromString(f.original,'text/html'),next=new DOMParser().parseFromString(c.newHtml,'text/html');
      return {requests:f.requests,pipelineCalls:f.pipelineCalls,originalUnchanged:s.screens.page.htmlContent===f.original,
        outsideUnchanged:old.querySelector('aside').isEqualNode(next.querySelector('aside')),historyAdded:f.history().past.length-f.before,
        linkUnchanged:old.querySelector('a').isEqualNode(next.querySelector('a')),buttonUnchanged:old.querySelector('button').isEqualNode(next.querySelector('button')),
        elementNid:c.workflowContract.elementNid,scope:c.workflowContract.allowedChanges,structural:c.executionRecord.localEdit.structural,
        planned:!!c.workflowContract.pageTaskPlan,metadataContainsPixels:JSON.stringify(c.workflowContract).includes('data:image')};
    }''')
    assert [r['stage'] for r in result['requests']]==(['region'] if decorative else ['plan','region']),result
    assert result['elementNid']=='region01' and result['scope']==['element:region01'] and result['structural'],result
    assert result['pipelineCalls']==0 and result['historyAdded']==0 and result['originalUnchanged'] and result['outsideUnchanged'],result
    assert result['linkUnchanged'] and result['buttonUnchanged'] and not result['metadataContainsPixels'],result
    assert result['planned']==(not decorative),result
    if not decorative:
        assert result['requests'][0]['planningInput']=={'nids':['region01'],'outsideInBaseline':False,'fullBaselinePresent':False},result
        assert result['requests'][1]['hasPlan'],result
        await page.get_by_label('功能与交互规划',exact=True).locator('summary').click()
        await page.get_by_label('需求覆盖线索',exact=True).locator('summary').click()
        assert '语义未验证' in await page.get_by_label('需求覆盖线索',exact=True).inner_text()
    if mode=='reference':
        assert len(result['requests'][0]['images'])==1 and result['requests'][0]['images']==result['requests'][1]['images'],result
    if mode=='form':
        assert result['requests'][1]['formChanges']==[{'nid':'email001','attribute':'required','value':''}],result
        await page.evaluate('elementFunctionFixture.preview()')
        field=page.frame_locator('iframe[data-inspector-screen="page"]').locator('[data-nid="email001"]')
        await field.wait_for(state='visible')
        assert await field.evaluate('el=>el.required')
        assert await page.evaluate('!new DOMParser().parseFromString(elementFunctionFixture.original,"text/html").querySelector("input").required')
        result['nativeRequiredVerified']=True
    await page.get_by_label('本轮预算记录',exact=True).locator('summary').click()
    assert ('请求 1/1' if decorative else '请求 2/4') in await page.get_by_label('本轮预算记录',exact=True).inner_text()
    assert 'FIXTURE_SECRET' not in await page.locator('body').inner_text()
    assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
    await page.screenshot(path=str(OUT/f'{engine}-element-{mode}.png'),full_page=True)
    if mode=='form':
        await page.wait_for_function('elementFunctionFixture.state().getStagedDeliveryReport().status==="ready"')
        await page.get_by_role('button',name='采纳新版 (替换原版)',exact=True).first.click()
        await page.wait_for_function('!elementFunctionFixture.state().stagedScreen')
        adopted=await page.evaluate('''()=>{
          const f=elementFunctionFixture,s=f.state();
          const read=()=>new DOMParser().parseFromString(f.state().screens.page.htmlContent,'text/html').querySelector('[data-nid="email001"]').required;
          const applied=read(),history=f.history().past.length-f.before;
          f.history().undo();const undone=f.state().screens.page.htmlContent===f.original;
          f.history().redo();const redone=read();f.hidePreview();return {applied,history,undone,redone};
        }''')
        assert adopted=={'applied':True,'history':1,'undone':True,'redone':True},adopted
        result['nativeAdoption']=adopted
    if not decorative:
        await page.wait_for_function('''async()=>{
          const turns=await elementFunctionFixture.state().getConversationStore().loadRecent();return turns.some(t=>t.assistant.pageTaskHistory);
        }''')
        await page.evaluate('elementFunctionFixture.reopen()')
        await page.get_by_text('历史功能规划，仅供回溯；不代表当前页面已复验，也不能直接采纳或续写。',exact=True).wait_for()
        await page.get_by_label('功能与交互规划',exact=True).locator('summary').click()
        assert '填写邮箱并查看反馈' in await page.get_by_label('功能与交互规划',exact=True).inner_text()
        assert await page.get_by_label('需求覆盖线索',exact=True).count()==0
        assert await page.evaluate('elementFunctionFixture.requests.length')==2
        await page.screenshot(path=str(OUT/f'{engine}-element-{mode}-history.png'),full_page=True)
    return result
async def verify_reference_modification(page,engine,png):
    await page.goto('http://127.0.0.1:5174/test/fixtures/function-first-chat.html?mode=reference-modify',wait_until='networkidle')
    await page.locator('input[type="file"]').set_input_files({'name':'整页功能参考.png','mimeType':'image/png','buffer':base64.b64decode(png)})
    await page.get_by_text('整页功能参考.png',exact=True).wait_for()
    await page.locator('textarea').fill('参照附图修改 @原页 增加预约时间输入框和确认预约按钮')
    await page.locator('button[title*="发送设计诉求"]').click()
    await page.wait_for_function('!!functionChatFixture.state().stagedScreen')
    assert await page.get_by_test_id('modification-review').count()==0
    result=await page.evaluate('''()=>{
      const f=functionChatFixture,s=f.state(),c=s.stagedScreen,k=c.workflowContract,p=f.planningInputs[0];
      return {requests:f.requests,inputs:f.referenceInputs,scope:k.allowedChanges,target:c.targetScreenId,
        operation:k.operation,baselineMatches:p.baselineHtml===f.original,planningTarget:p.target.id,
        image:k.pageTaskPlan.request.imageFingerprint,receipt:k.referenceImage.inputReceipt,
        originalUnchanged:s.screens.old.htmlContent===f.original,pageCount:Object.keys(s.screens).length,
        historyAdded:f.history().past.length-f.before,metadataContainsPixels:JSON.stringify(k).includes('data:image')};
    }''')
    assert result['requests']==[{'json':True,'containsPlan':False},{'json':False,'containsPlan':True}],result
    assert result['scope']==['screen:old'] and result['target']=='old' and result['planningTarget']=='old' and result['operation']=='modify',result
    assert result['baselineMatches'] and result['originalUnchanged'] and result['pageCount']==1 and result['historyAdded']==0 and not result['metadataContainsPixels'],result
    assert result['inputs']==[{'json':True,'imageFingerprints':[result['image']],'model':'gpt-4o'},{'json':False,'imageFingerprints':[result['image']],'model':'gpt-4o'}],result
    assert result['receipt']['imageFingerprint']==result['image'] and result['receipt']['model']=='gpt-4o',result
    await page.get_by_label('功能与交互规划',exact=True).locator('summary').click()
    assert '参考图观察' in await page.get_by_label('功能与交互规划',exact=True).inner_text()
    await page.get_by_label('需求覆盖线索',exact=True).locator('summary').click()
    assert '语义未验证' in await page.get_by_label('需求覆盖线索',exact=True).inner_text()
    await page.get_by_label('本轮预算记录',exact=True).locator('summary').click()
    assert '请求 2/4' in await page.get_by_label('本轮预算记录',exact=True).inner_text()
    assert 'FIXTURE_SECRET' not in await page.locator('body').inner_text()
    assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
    await page.screenshot(path=str(OUT/f'{engine}-reference-modify.png'),full_page=True)
    result['history']=await verify_history(page,engine,'reference-modify')
    return result
async def verify_protocol_guidance(page,engine,device):
    await page.goto('http://127.0.0.1:5174/test/fixtures/protocol-guidance.html?device='+device,wait_until='networkidle')
    await page.get_by_role('button',name='执行区块试点',exact=True).click()
    await page.get_by_test_id('status').filter(has_text='ready').wait_for()
    await page.get_by_label('本次设计依据',exact=True).locator('summary').first.click()
    await page.get_by_label('本次设计依据',exact=True).get_by_text('调用记录 · 1 次',exact=True).click()
    await page.get_by_label('本轮预算记录',exact=True).locator('summary').click()
    assert '实际进入请求 1 条规则' in await page.get_by_label('本次设计依据',exact=True).inner_text()
    assert '4,096' in await page.get_by_label('本轮预算记录',exact=True).inner_text()
    frame=page.frame_locator('iframe[data-inspector-screen="page"]')
    await frame.locator('[data-nid="region01"]').wait_for()
    rendered=await frame.locator('body').evaluate('el=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,layout:getComputedStyle(el.querySelector("[data-nid=region01]")).display,text:el.querySelector("[data-nid=copy0001]").textContent})')
    assert rendered=={'width':1440 if device=='pc' else 390,'overflow':False,'layout':'flex','text':'长正文需要独立空间，保持完整内容。'},rendered
    await page.wait_for_function('protocolGuidanceFixture.state().getStagedDeliveryReport().status==="ready"')
    result=await page.evaluate('''()=>{
      const f=protocolGuidanceFixture,r=f.result,s=f.state(),c=s.stagedScreen;
      const before=new DOMParser().parseFromString(f.original,'text/html'),next=new DOMParser().parseFromString(c.newHtml,'text/html');
      return {device:f.device,protocol:r.contract.designGuidance.protocol,requests:f.requests,
       receipts:r.contract.designGuidance.requests.map(r=>({status:r.status,protocol:r.outputProtocol,rules:r.injectedRuleIds})),
       packetValid:!f.packetIssue(),originalUnchanged:s.screens.page.htmlContent===f.original,outsideUnchanged:before.querySelector('aside').isEqualNode(next.querySelector('aside')),
       scope:r.contract.allowedChanges,requestedOutputTokens:r.taskBudget.requestedOutputTokens};
    }''')
    assert result['protocol']=='fragment-json' and result['packetValid'] and result['originalUnchanged'] and result['outsideUnchanged'],result
    assert result['scope']==['element:region01'] and result['requestedOutputTokens']==4096,result
    assert result['receipts']==[{'status':'completed','protocol':'json-object','rules':['LY-04']}],result
    assert len(result['requests'])==1 and result['requests'][0]['rulePresent'] and not result['requests'][0]['wholeHtml'],result
    assert result['requests'][0]['schema']['type']=='json_schema' and result['requests'][0]['maxTokens']==4096,result
    assert 'FIXTURE_SECRET' not in await page.locator('body').inner_text()
    assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
    await page.screenshot(path=str(OUT/f'{engine}-protocol-{device}.png'),full_page=True)
    # WebKit full-page capture can trigger a new ResizeObserver measurement.
    # Wait for the actual gate again; never replace its live evidence.
    await page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    await page.wait_for_function('protocolGuidanceFixture.state().getStagedDeliveryReport().status==="ready"')
    await page.get_by_role('button',name='采纳经过门禁的候选',exact=True).click()
    await page.wait_for_function('''()=>['已采纳','采纳被拒绝'].includes(document.querySelector('[data-testid=status]').textContent)''')
    adoption_status=await page.get_by_test_id('status').inner_text()
    assert adoption_status=='已采纳',await page.evaluate('''()=>({status:document.querySelector('[data-testid=status]').textContent,error:protocolGuidanceFixture.state().stagedAdoptionError,report:protocolGuidanceFixture.state().getStagedDeliveryReport()})''')
    result['adoption']=await page.evaluate('''()=>{
      const f=protocolGuidanceFixture,read=()=>new DOMParser().parseFromString(f.state().screens.page.htmlContent,'text/html').querySelector('[data-nid=region01]').className;
      const applied=read()==='col gap-4',history=f.history().past.length-f.before;
      f.history().undo();const undone=f.state().screens.page.htmlContent===f.original;f.history().redo();return {applied,history,undone,redone:read()==='col gap-4'};
    }''')
    assert result['adoption']=={'applied':True,'history':1,'undone':True,'redone':True},result
    return {**result,'rendered':rendered}

async def verify_manual_continuation(page,engine,exhausted):
    await page.goto('http://127.0.0.1:5174/test/fixtures/manual-continuation.html'+('?mode=exhausted' if exhausted else ''),wait_until='networkidle')
    await page.locator('textarea[placeholder^="输入设计诉求"]').fill('新建长正文说明页')
    await page.locator('button[title*="发送设计诉求"]').click()
    await page.wait_for_function('manualContinuationFixture.outputs.length===1')
    await page.get_by_role('button',name='从头重新生成',exact=True).wait_for()
    if exhausted:
        assert await page.get_by_role('button',name='继续未完成设计',exact=True).count()==0
        assert '原任务剩余额度或时限不足以继续' in await page.locator('body').inner_text()
        await page.wait_for_function('manualContinuationFixture.ledgers[0].snapshot().closed')
    else:
        await page.get_by_role('button',name='继续未完成设计',exact=True).click()
        await page.wait_for_function('Object.keys(manualContinuationFixture.state().screens).length===2')
        await page.wait_for_function('manualContinuationFixture.ledgers[0].snapshot().closed')
    result=await page.evaluate('''()=>{
      const f=manualContinuationFixture,first=f.outputs[0],last=f.outputs.at(-1),s=f.state(),created=Object.values(s.screens).find(p=>p.id!=='old');
      return {requests:f.requests,outputCount:f.outputs.length,sameLedger:f.ledgers.every(b=>b===f.ledgers[0]),budget:f.ledgers[0].snapshot(),
       originalUnchanged:s.screens.old.htmlContent===f.original,history:f.history().past.length-f.before,created:!!created,
       sameTask:first.workflowContract.taskId===last.workflowContract.taskId,sameSelection:JSON.stringify(first.workflowContract.designGuidance.selection)===JSON.stringify(last.workflowContract.designGuidance.selection),
       receipts:last.workflowContract.designGuidance.requests.map(r=>({parent:r.parentTaskId===first.workflowContract.taskId,status:r.status,protocol:r.outputProtocol})),
       workflow:created?.metadata.creationEvidence.workflow.status};
    }''')
    assert result['sameLedger'] and result['originalUnchanged'] and result['sameTask'] and result['sameSelection'],result
    assert result['budget']['requests']==4 and result['budget']['closed'] and result['budget']['requestedOutputTokens']==27648,result
    assert [r['stage'] for r in result['requests']]==['plan','html','html','html'],result
    assert not result['requests'][0]['hasRule'] and all(r['hasRule'] for r in result['requests'][1:]),result
    assert all(r=={'parent':True,'status':'completed','protocol':'stream-text'} for r in result['receipts']),result
    assert result['created']==(not exhausted) and result['outputCount']==(1 if exhausted else 2),result
    assert result['history']==(0 if exhausted else 1),result
    if not exhausted:assert result['workflow']=='ready',result
    await page.get_by_label('本轮预算记录',exact=True).last.locator('summary').click()
    assert '请求 4/4' in await page.get_by_label('本轮预算记录',exact=True).last.inner_text()
    assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
    assert 'FIXTURE_SECRET' not in await page.locator('body').inner_text()
    await page.screenshot(path=str(OUT/f'{engine}-manual-{"exhausted" if exhausted else "resumed"}.png'),full_page=True)
    return result

async def set_rule_control(page,enabled):
    await page.get_by_role('button',name='Provider 配置',exact=True).first.click()
    panel=page.get_by_test_id('settings')
    control=panel.get_by_role('checkbox',name='自动参考设计规则',exact=True)
    await control.set_checked(enabled)
    assert await control.is_checked()==enabled
    await panel.get_by_role('button',name='×',exact=True).click()

async def verify_guidance_reopen(page,engine,device,kind):
    before=await page.evaluate('()=>({calls:ruleControlFixture.requests.length,history:ruleControlFixture.history().past.length,pages:Object.keys(ruleControlFixture.state().screens).length})')
    await page.evaluate('ruleControlFixture.reopen()')
    card=page.get_by_label('历史设计依据',exact=True).last
    await card.locator('summary').first.wait_for()
    await card.locator('summary').first.click()
    await card.get_by_text('调用记录 · 1 次',exact=True).click()
    assert '返回完成' in await card.inner_text()
    assert '不能直接采纳或续写' in await page.locator('body').inner_text()
    after=await page.evaluate('()=>({calls:ruleControlFixture.requests.length,history:ruleControlFixture.history().past.length,pages:Object.keys(ruleControlFixture.state().screens).length})')
    assert before==after,(before,after)
    assert await page.get_by_text('本次设计依据 ·',exact=True).count()==0
    assert 'FIXTURE_SECRET' not in await page.locator('body').inner_text()
    if kind=='modify':
        await page.evaluate('ruleControlFixture.showDelivery()')
        panel=page.get_by_label('页面交付历史',exact=True)
        await panel.locator('details').filter(has=page.locator('summary',has_text='替换原页 · 已应用')).first.locator(':scope > summary').click()
        saved=panel.get_by_label('历史设计依据',exact=True)
        await saved.locator('summary').first.click()
        await saved.get_by_text('调用记录 · 1 次',exact=True).click()
        assert '返回完成' in await saved.inner_text()
    await page.screenshot(path=str(OUT/f'{engine}-rule-history-{kind}-{device}.png'),full_page=True)
    if kind=='modify': await page.evaluate('ruleControlFixture.hideDelivery()')
    return {'callsUnchanged':True,'historyUnchanged':True,'pagesUnchanged':True,'frozenReceiptsShown':True}

async def verify_rule_roots(page,engine,device):
    await page.set_viewport_size({'width':1280,'height':1000})
    url='http://127.0.0.1:5174/test/fixtures/rule-control.html?device='+device
    await page.goto(url,wait_until='networkidle')
    await page.evaluate('localStorage.removeItem("ai_designer_providers_v1")')
    await page.reload(wait_until='networkidle')
    assert await page.evaluate('ruleControlFixture.config().autoReferenceDesignRules') is False
    await set_rule_control(page,True)
    await page.reload(wait_until='networkidle')
    assert await page.evaluate('ruleControlFixture.config().autoReferenceDesignRules') is True
    async def send(text):
        await page.locator('textarea[placeholder^="输入设计诉求"]').fill(text)
        await page.locator('button[title*="发送设计诉求"]').click()
    await send('新建长正文说明页')
    await page.wait_for_function('Object.keys(ruleControlFixture.state().screens).length===2')
    first=await page.evaluate('''()=>{
      const f=ruleControlFixture,s=f.state(),created=Object.values(s.screens).find(p=>p.id!=='page'),p=created.metadata.creationEvidence.contract.designGuidance;
      f.createdId=created.id;return {requests:f.requests.slice(),workflow:created.metadata.creationEvidence.workflow.status,rules:p.selection.selected.map(s=>s.rule.id),receipts:p.requests.map(r=>r.status),original:s.screens.page.htmlContent===f.original};
    }''')
    assert [r['stage'] for r in first['requests']]==['plan','html'] and first['workflow']=='ready' and first['original'],first
    assert not first['requests'][0]['hasRule'] and first['requests'][1]['hasRule'] and 'LY-04' in first['rules'] and first['receipts']==['completed'],first
    creation_history=await verify_guidance_reopen(page,engine,device,'create')
    await set_rule_control(page,False)
    await send('新建另一个长正文说明页')
    await page.wait_for_function('Object.keys(ruleControlFixture.state().screens).length===3')
    fallback=await page.evaluate('''()=>{
      const f=ruleControlFixture,s=f.state(),last=Object.values(s.screens).find(p=>p.id!=='page'&&p.id!==f.createdId);
      return {newHasRules:!!last.metadata.creationEvidence.contract.designGuidance,oldHasRules:!!s.screens[f.createdId].metadata.creationEvidence.contract.designGuidance,lastRequest:f.requests.at(-1)};
    }''')
    assert not fallback['newHasRules'] and fallback['oldHasRules'] and not fallback['lastRequest']['hasRule'],fallback
    await page.screenshot(path=str(OUT/f'{engine}-rule-control-{device}.png'),full_page=True)

    await page.goto(url+'&retry=1',wait_until='networkidle')
    await set_rule_control(page,True)
    await send('@资料页 修改页面，先分析长正文排版并列出修改建议')
    card=page.get_by_test_id('modification-review')
    await card.locator('input[type=checkbox]').first.wait_for()
    await card.locator('input[type=checkbox]').first.check()
    await card.get_by_label('补充修改要求',exact=True).fill('主按钮内边距增大')
    await card.locator('input[type=radio]').first.check()
    await set_rule_control(page,False)
    await card.get_by_role('button',name='按所选内容生成新版',exact=True).click()
    await page.wait_for_function('!!ruleControlFixture.state().stagedScreen')
    evidence=page.get_by_label('本次设计依据',exact=True).first
    await evidence.locator('summary').first.click()
    await evidence.get_by_text('调用记录 · 2 次',exact=True).click()
    assert '调用失败（由后续格式纠正替代）' in await evidence.inner_text()
    reviewed=await page.evaluate('''()=>{
      const f=ruleControlFixture,s=f.state(),c=s.stagedScreen,analysis=c.workflowContract.modificationReview.analysis.workflowContract;
      return {requests:f.requests,scope:c.workflowContract.allowedChanges,protocol:c.workflowContract.designGuidance.protocol,
       analysisProtocol:analysis.designGuidance.protocol,analysisCalls:analysis.designGuidance.requests.map(r=>({id:r.requestId,status:r.status,replaced:r.supersededByRequestId})),
       actualCalls:c.workflowContract.designGuidance.requests.map(r=>r.status),original:s.screens.page.htmlContent===f.original,history:f.history().past.length-f.before};
    }''')
    assert [r['stage'] for r in reviewed['requests']]==['analysis','analysis','finite'],reviewed
    assert reviewed['scope']==['element:button01'] and reviewed['protocol']=='finite-json' and reviewed['analysisProtocol']=='analysis-json',reviewed
    assert [r['status'] for r in reviewed['analysisCalls']]==['failed','completed'] and reviewed['analysisCalls'][0]['replaced']==reviewed['analysisCalls'][1]['id'],reviewed
    assert reviewed['actualCalls']==['completed'] and reviewed['original'] and reviewed['history']==0,reviewed
    await page.evaluate('ruleControlFixture.preview()')
    frame=page.frame_locator('iframe[data-inspector-screen="page"]')
    await frame.locator('[data-nid=button01]').wait_for()
    assert await frame.locator('body').evaluate('()=>innerWidth')==(1440 if device=='pc' else 390)
    await page.wait_for_function('ruleControlFixture.state().getStagedDeliveryReport().status==="ready"')
    assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
    await page.screenshot(path=str(OUT/f'{engine}-rule-analysis-{device}.png'),full_page=True)
    await page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    await page.wait_for_function('ruleControlFixture.state().getStagedDeliveryReport().status==="ready"')
    await page.get_by_role('button',name='采纳新版 (替换原版)',exact=True).first.click()
    await page.wait_for_function('!ruleControlFixture.state().stagedScreen')
    adopted=await page.evaluate('''()=>{
      const f=ruleControlFixture,read=()=>new DOMParser().parseFromString(f.state().screens.page.htmlContent,'text/html').querySelector('[data-nid=button01]').className;
      const applied=read().includes('font-semibold')&&read().includes('p-4'),history=f.history().past.length-f.before;
      f.history().undo();const undone=f.state().screens.page.htmlContent===f.original;f.history().redo();const redone=read().includes('p-4');f.hidePreview();return {applied,history,undone,redone};
    }''')
    assert adopted=={'applied':True,'history':1,'undone':True,'redone':True},adopted
    assert 'FIXTURE_SECRET' not in await page.locator('body').inner_text()
    modification_history=await verify_guidance_reopen(page,engine,device,'modify')
    await page.goto(url+'&hold=1',wait_until='networkidle')
    await set_rule_control(page,True)
    await send('@资料页 修改页面，先分析长正文排版并列出修改建议')
    await page.wait_for_function('ruleControlFixture.requests.length===1')
    await page.locator('button[title*="立即停止"]').click()
    cancelled_card=page.get_by_label('本次设计依据',exact=True).first
    await cancelled_card.locator('summary').first.click()
    await cancelled_card.get_by_text('调用记录 · 1 次',exact=True).click()
    await page.wait_for_function('document.body.innerText.includes("已取消 · 实际进入请求")')
    cancelled=await page.evaluate('''()=>{const f=ruleControlFixture,s=f.state();return {calls:f.requests.length,original:s.screens.page.htmlContent===f.original,candidate:!!s.stagedScreen,history:f.history().past.length-f.before};}''')
    assert cancelled=={'calls':1,'original':True,'candidate':False,'history':0},cancelled
    await page.screenshot(path=str(OUT/f'{engine}-rule-cancel-{device}.png'),full_page=True)
    await set_rule_control(page,False)
    return {'device':device,'creation':first,'fallback':fallback,'reviewed':reviewed,'adopted':adopted,'cancelled':cancelled,'creationHistory':creation_history,'modificationHistory':modification_history}

async def verify_guided_repair(page,engine,device):
    await page.set_viewport_size({'width':1280,'height':1000})
    await page.goto('http://127.0.0.1:5174/test/fixtures/rule-control.html?device='+device+'&repair=1',wait_until='networkidle')
    await set_rule_control(page,True)
    await page.locator('textarea[placeholder^="输入设计诉求"]').fill('新建长正文说明页')
    await page.locator('button[title*="发送设计诉求"]').click()
    await page.wait_for_function('Object.keys(ruleControlFixture.state().screens).length===2')
    result=await page.evaluate('''()=>{
      const f=ruleControlFixture,s=f.state(),created=Object.values(s.screens).find(p=>p.id!=='page'),e=created.metadata.creationEvidence,r=e.repair;
      return {device:f.device,requests:f.requests,workflow:e.workflow.status,render:e.render.status,renderErrors:e.render.findings.filter(f=>f.severity==='error').length,
        parent:e.contract.taskId,original:s.screens.page.htmlContent===f.original,parentCalls:e.contract.designGuidance.requests.map(r=>r.status),
        repair:r.status,trace:r.guidance,html:created.htmlContent,before:f.before,history:f.history().past.length};
    }''')
    assert [r['stage'] for r in result['requests']]==['plan','html','repair'],result
    assert result['workflow']=='ready' and result['render']=='complete' and result['renderErrors']==0,result
    assert result['repair']=='repaired' and result['parentCalls']==['completed'] and result['original'],result
    trace=result['trace']
    assert trace['parentTaskId']==result['parent'] and len(trace['requests'])==1 and trace['requests'][0]['status']=='completed',result
    assert trace['requests'][0]['requestId']==result['parent']+':style-repair:request-1' and trace['injectedRuleIds'],result
    assert result['requests'][2]['maxTokens']==1800 and result['requests'][2]['hasRule'] and 'font-size:0' not in result['html'],result
    assert result['history']-result['before']==1,result
    await page.evaluate('ruleControlFixture.showCreation()')
    await page.get_by_text('页面创建验收记录',exact=True).click()
    await page.get_by_text('受控样式修复 1 次（已完整复验）',exact=True).click()
    source=page.get_by_label('修复设计规则来源',exact=True)
    await source.wait_for()
    assert '沿用原任务' in await source.inner_text() and '返回完成' in await source.inner_text()
    assert 'FIXTURE_SECRET' not in await page.locator('body').inner_text()
    await page.screenshot(path=str(OUT/f'{engine}-guided-repair-{device}.png'),full_page=True)
    history=await page.evaluate('''()=>{
      const f=ruleControlFixture,s=f.state(),created=Object.values(s.screens).find(p=>p.id!=='page'),e=JSON.stringify(created.metadata.creationEvidence);
      f.history().undo();const undone=!f.state().screens[created.id];f.history().redo();return {undone,redone:JSON.stringify(f.state().screens[created.id].metadata.creationEvidence)===e};
    }''')
    assert history=={'undone':True,'redone':True},history
    result.pop('html')
    return {**result,**history}

async def verify_runtime_recovery(page,engine,device):
    await page.set_viewport_size({'width':1280,'height':1000})
    await page.goto('http://127.0.0.1:5174/test/fixtures/rule-control.html?device='+device,wait_until='networkidle')
    await set_rule_control(page,True)
    await page.locator('textarea[placeholder^="输入设计诉求"]').fill('新建长正文说明页')
    await page.locator('button[title*="发送设计诉求"]').click()
    await page.wait_for_function('Object.keys(ruleControlFixture.state().screens).length===2')
    before=await page.evaluate('()=>({calls:ruleControlFixture.requests.length,history:ruleControlFixture.history().past.length,pages:Object.keys(ruleControlFixture.state().screens).length})')
    await page.evaluate('ruleControlFixture.breakHistory()')
    await page.evaluate('ruleControlFixture.reopen()')
    await page.get_by_text('坏来源正文仍可阅读',exact=True).wait_for()
    assert await page.get_by_label('历史设计依据',exact=True).count()==1
    assert '历史设计依据损坏或与本轮请求不匹配' in await page.locator('body').inner_text()
    assert '不应恢复坏行' not in await page.locator('body').inner_text()
    after=await page.evaluate('()=>({calls:ruleControlFixture.requests.length,history:ruleControlFixture.history().past.length,pages:Object.keys(ruleControlFixture.state().screens).length})')
    assert before==after,(before,after)
    await page.screenshot(path=str(OUT/f'{engine}-damaged-history-{device}.png'),full_page=True)
    return {'device':device,'malformedRowsIsolated':True,'indexRecovered':True,'invalidProvenanceExplained':True,**after}

async def verify_local_draft_source(page,engine,device):
    await page.set_viewport_size({'width':1280,'height':1000})
    await page.goto('http://127.0.0.1:5174/test/fixtures/rule-control.html?device='+device+'&draft=1',wait_until='networkidle')
    await set_rule_control(page,True)
    await page.locator('textarea[placeholder^="输入设计诉求"]').fill('新建长正文说明页')
    await page.locator('button[title*="发送设计诉求"]').click()
    draft=page.get_by_label('未通过验收的页面草稿',exact=True)
    await draft.locator('input[aria-label^="操作文案"]').wait_for()
    assert await page.evaluate('Object.keys(ruleControlFixture.state().screens).length')==1
    await set_rule_control(page,False)
    await draft.locator('input[aria-label^="操作文案"]').fill('查看详情')
    await draft.get_by_role('button',name='确认文案并定点修复',exact=True).click()
    await page.wait_for_function('Object.keys(ruleControlFixture.state().screens).length===2')
    source=page.get_by_label('草稿修复历史来源',exact=True).first
    await source.wait_for()
    assert '未调用模型' in await source.inner_text()
    result=await page.evaluate('''()=>{
      const f=ruleControlFixture,s=f.state(),page=Object.values(s.screens).find(p=>p.id!=='page'),e=page.metadata.creationEvidence,r=e.execution.draftRepair;
      return {device:f.device,requests:f.requests,workflow:e.workflow.status,source:e.execution.source,originalTask:r.sourceTaskId,
        parentTask:r.historicalGuidanceSource.taskId,parentCalls:r.historicalGuidanceSource.designGuidance.requests.map(r=>r.status),
        newRules:!!e.contract.designGuidance,history:f.history().past.length-f.before,originalUnchanged:s.screens.page.htmlContent===f.original};
    }''')
    assert [r['stage'] for r in result['requests']]==['plan','html'],result
    assert result['workflow']=='ready' and result['source']=='local-edit' and not result['newRules'],result
    assert result['originalTask']==result['parentTask'] and result['parentCalls']==['completed'] and result['history']==1 and result['originalUnchanged'],result
    await page.evaluate('ruleControlFixture.showCreation()')
    await page.get_by_text('页面创建验收记录',exact=True).click()
    assert await page.get_by_label('草稿修复历史来源',exact=True).count()==2
    await page.screenshot(path=str(OUT/f'{engine}-local-draft-source-{device}.png'),full_page=True)
    undone=await page.evaluate('''()=>{
      const f=ruleControlFixture,page=Object.values(f.state().screens).find(p=>p.id!=='page'),metadata=JSON.stringify(page.metadata);
      f.history().undo();const removed=!f.state().screens[page.id];f.history().redo();return removed&&JSON.stringify(f.state().screens[page.id].metadata)===metadata;
    }''')
    assert undone
    return {**result,'undoRedo':True,'newModelCallsForRepair':0}

async def main():
    OUT.mkdir(parents=True,exist_ok=True);results=[]
    (OUT/'result.json').unlink(missing_ok=True)
    async with async_playwright() as p:
        for engine in ['chromium','webkit']:
            browser=await getattr(p,engine).launch(headless=True)
            page=await browser.new_page(viewport={'width':1280,'height':1000},locale='zh-CN');errors=[];external=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            async def route(request):
                if request.request.url.startswith(('http://127.0.0.1:5174/','data:','blob:')):await request.continue_()
                else:external.append(request.request.url);await request.abort()
            await page.route('**/*',route)
            try:
                await page.goto('http://127.0.0.1:5174/test/fixtures/design-evidence.html',wait_until='networkidle')
                await page.get_by_label('本次设计依据',exact=True).locator('summary').first.click()
                await page.get_by_label('本轮预算记录',exact=True).locator('summary').click()
                text=await page.locator('body').inner_text()
                assert '不等于实际消耗或费用' in text and 'FIXTURE_SECRET' not in text
                assert '长正文空间' in text and '不表示 Provider 已确认收到' in text
                assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
                await page.screenshot(path=str(OUT/f'{engine}-cards.png'),full_page=True)
                await page.get_by_placeholder('对选中元素提要求，如：增加内边距').fill('文字加粗')
                await page.get_by_role('button',name='生成局部微调候选').click()
                await page.get_by_text('已创建局部修改候选，请比较后采纳。',exact=True).wait_for()
                result=await page.evaluate('''()=>({calls:fixture.calls,originalUnchanged:fixture.state().screens.page.htmlContent===fixture.original,
                  candidate:fixture.state().stagedScreen?.newHtml.includes('font-semibold'),scope:fixture.state().stagedScreen?.workflowContract?.allowedChanges})''')
                assert result=={'calls':1,'originalUnchanged':True,'candidate':True,'scope':['element:target01']},result
                await page.set_viewport_size({'width':768,'height':1000})
                assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
                await page.screenshot(path=str(OUT/f'{engine}-candidate.png'),full_page=True)
                svg_safe=await page.evaluate('''async()=>{
                  const {validateIconSvg}=await import('/src/services/ai/iconSvgGeneration.ts');
                  const safe=validateIconSvg('<path d="M2 2L20 20" stroke="currentColor"/>');
                  let rejected=false;try{validateIconSvg('<path d="M2 2" onclick="alert(1)"/>');}catch{rejected=true;}
                  return safe.includes('path')&&rejected;
                }''')
                assert svg_safe
                json_pilot=await page.evaluate('''async()=>{
                  const {DefaultAIEngineCore}=await import('/src/services/ai/engine/core/aiEngineCore.ts');
                  const {MockTransport}=await import('/src/services/ai/engine/transport/mockTransport.ts');
                  const {executeStructuredEdit}=await import('/src/services/ai/structuredEditExecutor.ts');
                  const {buildDesignTaskContract}=await import('/src/services/ai/designWorkflow.ts');
                  const transport=new MockTransport();transport.queueResponse(JSON.stringify({requiresPageRewrite:false,reason:'',operations:[{nid:'target01',type:'add_classes',value:'font-semibold'}]}));
                  const core=new DefaultAIEngineCore(transport);core.generateObject=fixture.originalGenerateObject.bind(core);
                  const request='保留按钮文字，调整按钮样式';
                  const contract=buildDesignTaskContract({intent:'modify_screen',request,target:{id:'page',name:'页面',htmlContent:fixture.original},elementNid:'target01',deviceProfile:'mobile',frameWidth:390});
                  const result=await executeStructuredEdit(core,{mode:'element',screen:{id:'page',name:'页面',htmlContent:fixture.original},request,contract,
                    settings:{deviceProfile:'mobile',frameWidth:390,useCustomNavigation:false},designSystem:fixture.state().designSystem,colorMode:'light',
                    elementNid:'target01',binding:{provider:{id:'fixture',protocol:'openai_compatible',baseUrl:'http://mock',apiKey:'FIXTURE_SECRET'},model:'fixture'},
                    contextualGuidance:{features:['button']},isCurrent:()=>true});
                  return {status:result.status,ruleIds:result.contract.designGuidance?.selection.selected.map(s=>s.rule.id),
                    requests:result.contract.designGuidance?.requests.map(r=>({status:r.status,outputProtocol:r.outputProtocol})),
                    schema:transport.lastRequest?.body.response_format?.type,originalUnchanged:fixture.state().screens.page.htmlContent===fixture.original};
                }''')
                assert json_pilot=={'status':'ready','ruleIds':['TY-06'],'requests':[{'status':'completed','outputProtocol':'json-object'}],
                                   'schema':'json_schema','originalUnchanged':True},json_pilot
                await page.goto('http://127.0.0.1:5174/test/fixtures/function-first.html',wait_until='networkidle')
                await page.get_by_role('button',name='运行功能优先设计').click()
                await page.get_by_text('受控验证完成',exact=True).wait_for()
                await page.get_by_label('功能与交互规划',exact=True).locator('summary').click()
                function_first=await page.evaluate('''()=>({requests:functionFixture.requests,plan:!!functionFixture.output.workflowContract.pageTaskPlan,
                  requestsUsed:functionFixture.output.taskBudget.requests,originalUnchanged:functionFixture.original==='<main>原页面不变</main>'})''')
                assert function_first=={'requests':[{'json':True,'containsPlan':False},{'json':False,'containsPlan':True}],
                                       'plan':True,'requestsUsed':2,'originalUnchanged':True},function_first
                text=await page.locator('body').inner_text()
                assert '需要输入：预约时间' in text and '前提：已选择时间' in text and '反馈：展示预约结果' in text and '条件：未选择时间' in text
                assert 'FIXTURE_SECRET' not in text
                assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
                await page.screenshot(path=str(OUT/f'{engine}-function-first.png'),full_page=True)
                await page.goto('http://127.0.0.1:5174/test/fixtures/function-first-chat.html',wait_until='networkidle')
                await page.locator('textarea').fill('创建预约页面，选择预约时间并确认预约')
                await page.locator('button[title*="发送设计诉求"]').click()
                await page.get_by_text('正在梳理用户任务、必要信息与交互状态…',exact=True).wait_for()
                await page.wait_for_timeout(1250)
                assert await page.evaluate('functionChatFixture.requests.length')==1
                assert await page.get_by_text('意图推理与多模态反推',exact=True).locator('xpath=../..').locator('svg.animate-spin').count()==1
                await page.wait_for_function('Object.keys(functionChatFixture.state().screens).length===2')
                await page.get_by_label('功能与交互规划',exact=True).locator('summary').click()
                await page.get_by_label('功能与交互规划',exact=True).scroll_into_view_if_needed()
                function_chat=await page.evaluate('''()=>{
                  const page=Object.values(functionChatFixture.state().screens).find(s=>s.id!=='old');
                  return {requests:functionChatFixture.requests,plan:!!page.metadata.creationEvidence.contract.pageTaskPlan,
                    workflow:page.metadata.creationEvidence.workflow.status,originalUnchanged:functionChatFixture.state().screens.old.htmlContent===functionChatFixture.original};
                }''')
                assert function_chat=={'requests':[{'json':True,'containsPlan':False},{'json':False,'containsPlan':True}],
                                      'plan':True,'workflow':'ready','originalUnchanged':True},function_chat
                text=await page.locator('body').inner_text()
                assert '业务规划未返回用量' in text and 'FIXTURE_SECRET' not in text
                assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
                await page.get_by_label('需求覆盖线索',exact=True).locator('summary').click()
                await page.get_by_label('需求覆盖线索',exact=True).scroll_into_view_if_needed()
                coverage=await page.get_by_label('需求覆盖线索',exact=True).inner_text()
                assert '0 项未定位' in coverage and '源码线索' in coverage and '场景待核对' in coverage and '语义未验证' in coverage
                await page.screenshot(path=str(OUT/f'{engine}-function-chat.png'),full_page=True)
                creation_history=await verify_history(page,engine,'creation')
                await page.goto('http://127.0.0.1:5174/test/fixtures/function-first-chat.html?mode=modify',wait_until='networkidle')
                await page.locator('textarea').fill('修改 @原页 增加预约时间输入框和确认预约按钮')
                await page.locator('button[title*="发送设计诉求"]').click()
                await page.wait_for_function('!!functionChatFixture.state().stagedScreen')
                functional_modify=await page.evaluate('''()=>({requests:functionChatFixture.requests,
                  plan:!!functionChatFixture.state().stagedScreen.workflowContract.pageTaskPlan,
                  originalUnchanged:functionChatFixture.state().screens.old.htmlContent===functionChatFixture.original,
                  pageCount:Object.keys(functionChatFixture.state().screens).length})''')
                assert functional_modify=={'requests':[{'json':True,'containsPlan':False},{'json':False,'containsPlan':True}],
                                          'plan':True,'originalUnchanged':True,'pageCount':1},functional_modify
                await page.get_by_label('需求覆盖线索',exact=True).locator('summary').click()
                await page.get_by_label('需求覆盖线索',exact=True).scroll_into_view_if_needed()
                assert '0 项未定位' in await page.get_by_label('需求覆盖线索',exact=True).inner_text()
                await page.screenshot(path=str(OUT/f'{engine}-functional-modify.png'),full_page=True)
                modification_history=await verify_history(page,engine,'modification')
                await page.goto('http://127.0.0.1:5174/test/fixtures/function-first-chat.html?mode=reference',wait_until='networkidle')
                reference_png=await page.evaluate('''()=>{
                  const canvas=document.createElement('canvas');canvas.width=390;canvas.height=240;
                  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,390,240);
                  ctx.fillStyle='#172554';ctx.font='24px sans-serif';ctx.fillText('预约时间',24,48);
                  ctx.fillStyle='#eff6ff';ctx.fillRect(24,72,342,48);ctx.fillStyle='#172554';ctx.fillText('10:00',36,104);
                  ctx.fillStyle='#2563eb';ctx.fillRect(24,144,342,48);ctx.fillStyle='#fff';ctx.fillText('确认预约',120,177);
                  return canvas.toDataURL('image/png').split(',')[1];
                }''')
                await page.locator('input[type="file"]').set_input_files({'name':'预约参考.png','mimeType':'image/png','buffer':base64.b64decode(reference_png)})
                await page.get_by_text('预约参考.png',exact=True).wait_for()
                await page.locator('textarea').fill('根据参考图创建一个预约页面，选择预约时间并确认预约')
                await page.locator('button[title*="发送设计诉求"]').click()
                await page.wait_for_function('Object.keys(functionChatFixture.state().screens).length===2')
                reference_creation=await page.evaluate('''()=>{
                  const created=Object.values(functionChatFixture.state().screens).find(s=>s.id!=='old');
                  const c=created.metadata.creationEvidence.contract;
                  return {requests:functionChatFixture.requests,inputs:functionChatFixture.referenceInputs,
                    planImage:c.pageTaskPlan.request.imageFingerprint,basis:c.pageTaskPlan.plan.features[0].basis,
                    workflow:created.metadata.creationEvidence.workflow.status,originalUnchanged:functionChatFixture.state().screens.old.htmlContent===functionChatFixture.original,
                    metadataContainsPixels:JSON.stringify(c).includes('data:image')};
                }''')
                assert reference_creation['basis']=='image' and reference_creation['workflow']=='ready'
                assert reference_creation['originalUnchanged'] and not reference_creation['metadataContainsPixels']
                assert reference_creation['requests']==[{'json':True,'containsPlan':False},{'json':False,'containsPlan':True}]
                assert reference_creation['inputs']==[{'json':True,'imageFingerprints':[reference_creation['planImage']],'model':'gpt-4o'},
                                                     {'json':False,'imageFingerprints':[reference_creation['planImage']],'model':'gpt-4o'}]
                await page.get_by_label('功能与交互规划',exact=True).locator('summary').click()
                assert '参考图观察' in await page.get_by_label('功能与交互规划',exact=True).inner_text()
                await page.get_by_label('功能与交互规划',exact=True).scroll_into_view_if_needed()
                await page.screenshot(path=str(OUT/f'{engine}-reference-creation.png'),full_page=True)
                reference_history=await verify_history(page,engine,'reference')
                assert '参考图观察' in await page.get_by_label('功能与交互规划',exact=True).inner_text()
                reference_modify=await verify_reference_modification(page,engine,reference_png)
                multi_unchanged=await verify_multi_page(page,engine,False)
                multi_edited=await verify_multi_page(page,engine,True)
                region_text=await verify_functional_region(page,engine,False,reference_png)
                region_reference=await verify_functional_region(page,engine,True,reference_png)
                element_text=await verify_element_structure(page,engine,'text',reference_png)
                element_reference=await verify_element_structure(page,engine,'reference',reference_png)
                element_decorative=await verify_element_structure(page,engine,'decorative',reference_png)
                element_form=await verify_element_structure(page,engine,'form',reference_png)
                protocol_mobile=await verify_protocol_guidance(page,engine,'mobile')
                protocol_pc=await verify_protocol_guidance(page,engine,'pc')
                manual_resumed=await verify_manual_continuation(page,engine,False)
                manual_exhausted=await verify_manual_continuation(page,engine,True)
                rule_mobile=await verify_rule_roots(page,engine,'mobile')
                rule_pc=await verify_rule_roots(page,engine,'pc')
                repair_mobile=await verify_guided_repair(page,engine,'mobile')
                repair_pc=await verify_guided_repair(page,engine,'pc')
                runtime_mobile=await verify_runtime_recovery(page,engine,'mobile')
                runtime_pc=await verify_runtime_recovery(page,engine,'pc')
                draft_mobile=await verify_local_draft_source(page,engine,'mobile')
                draft_pc=await verify_local_draft_source(page,engine,'pc')
                assert not errors,errors
                assert not external,external
                results.append({'engine':engine,'status':'passed',**result,'svgRestrictedXml':svg_safe,'jsonPilot':json_pilot,'functionFirst':function_first,'functionChat':function_chat,'functionalModify':functional_modify,'creationHistory':creation_history,'modificationHistory':modification_history,'referenceCreation':reference_creation,'referenceHistory':reference_history,'referenceModify':reference_modify,'multiUnchanged':multi_unchanged,'multiEdited':multi_edited,'regionText':region_text,'regionReference':region_reference,'elementText':element_text,'elementReference':element_reference,'elementDecorative':element_decorative,'elementForm':element_form,'pageErrors':errors,'externalRequests':external})
                results[-1].update(protocolMobile=protocol_mobile,protocolPc=protocol_pc,runtimeRecoveryMobile=runtime_mobile,runtimeRecoveryPc=runtime_pc,localDraftMobile=draft_mobile,localDraftPc=draft_pc)
                results[-1].update(manualResumed=manual_resumed,manualExhausted=manual_exhausted)
                results[-1].update(ruleControlMobile=rule_mobile,ruleControlPc=rule_pc,guidedRepairMobile=repair_mobile,guidedRepairPc=repair_pc)
                print(json.dumps(results[-1],ensure_ascii=False),flush=True)
            except Exception:
                await page.screenshot(path=str(OUT/f'{engine}-failed.png'),full_page=True)
                raise
            finally:await browser.close()
    (OUT/'result.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':asyncio.run(main())
