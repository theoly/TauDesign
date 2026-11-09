import { spyOn } from 'bun:test';
import { act } from 'react';
import { DefaultAIEngineCore } from '../src/services/ai/engine/core';

export const mockModificationAnalysis = () => spyOn(DefaultAIEngineCore.prototype, 'generateObject').mockResolvedValue({
  summary: '基于原页面整理修改项', items: [{ title: '调整页面层级', reason: '原页面信息层级需要改善', change: '按用户要求调整页面层级', scope: 'page', operations: [] }]
});

export async function waitForChatIdle(container:HTMLElement){
 const deadline=Date.now()+3000;
 while(container.querySelector('button[title*="点击可立即停止"]')){
  if(Date.now()>deadline)throw Error('Chat did not finish the controlled fixture request');
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
 }
}

export async function confirmLatestModification(container: HTMLElement) {
  await waitForChatIdle(container);
  const cards = Array.from(container.querySelectorAll('[data-testid="modification-review"]'));
  const card = cards[cards.length - 1];
  if (!card) return; // 新建页面不经过分析。
  const checkbox = card.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
  if (!checkbox) throw new Error('修改分析尚未完成');
  await act(async () => { checkbox.click(); });
  const confirm = Array.from(card.querySelectorAll('button')).find(b => b.textContent?.includes('按所选内容生成新版'))!;
  await act(async () => { confirm.click(); });
  await waitForChatIdle(container);
}
