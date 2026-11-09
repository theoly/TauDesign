import type { Asset, ComponentDefinition } from '../../types/project';

/** 范例只组合既有基座类；白名单仍由base.css派生。 */
export const COMPONENT_CONTRACTS = [
  { id: 'person-row', rule: '人物行：头像不压缩，姓名单行，职业独立一行；多人组空间不足整体换行。', html: '<div class="row wrap gap-3"><div class="row items-center gap-2"><span class="avatar">王</span><div class="col min-w-0 gap-1"><span class="text-nowrap font-semibold">王先生</span><span class="text-sm text-secondary break-words">骨科主治医师</span></div></div><span class="text-muted">与</span><div class="row items-center gap-2"><span class="avatar">李</span><div class="col min-w-0 gap-1"><span class="text-nowrap font-semibold">李女士</span><span class="text-sm text-secondary break-words">高校教师</span></div></div></div>' },
  { id: 'tag-cluster', rule: '标签组：标签不可flex-1，保留完整文案，空间不足整项换行。', html: '<div class="row wrap gap-2"><span class="tag">第2次 / 合同3次</span><span class="badge-soft">有效约见待核销</span></div>' },
  { id: 'status', rule: '状态：图标尺寸由icon控制，容器居中，文字不拆分；不能通过偏移补偿居中。', html: '<span class="badge-soft"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span>待回访</span></span>' },
  { id: 'stat', rule: '统计：数字与单位整体不换行，标题独立一行；普通指标用中性色。', html: '<div class="col min-w-0 gap-1"><strong class="text-xl text-nowrap">24人</strong><span class="text-sm text-secondary">今日已跟进</span></div>' },
  { id: 'media-row', rule: '图文列表：媒体不压缩，正文列flex-1 min-w-0；地址可自然断行，详情不得隐藏数据。', html: '<article class="row items-start gap-3"><span class="icon-box flex-none"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8"/></svg></span><div class="col flex-1 min-w-0 gap-1"><h3 class="font-semibold">约见地点</h3><p class="text-sm break-words">翠湖漫咖啡·文林街店</p></div></article>' },
  { id: 'action-group', rule: '操作栏：主次按钮完整单行；整组可换行，禁止缩字或截断用户指定文案。', html: '<div class="row wrap items-center gap-2"><button class="btn btn-primary">录入双方约见后反馈</button><button class="btn btn-ghost">保留原版</button></div>' },
  { id: 'conversation-reading', rule: '对话建议（仅新建或已授权重排）：一次回复最多一个外层表面，三条建议用标题、正文和节间留白分组，避免每段再套卡片。移动正文text-md leading-relaxed，主正文继承正文色或使用var(--color-text-primary)，不是品牌强调色text-primary；不把整段降为text-muted；时间/来源用text-xs text-secondary。建议正文独占阅读宽度，复制/采用放段落下方，重复操作用btn-ghost/btn-outline降低视觉权重，不排成抢眼的大按钮矩阵。不缩字、不裁正文、不靠固定高度挤进首屏；旧页未授权不重组或改变采用状态。', html: '<section class="col gap-3"><header class="col gap-1"><h2 class="text-md font-semibold">咨询师建议</h2><p class="text-xs text-secondary">今天20:18 · 来源：文字咨询</p></header><div class="card p-4 col gap-4"><article class="col gap-2"><h3 class="text-md font-semibold">01 · 给自己安排短暂休息</h3><p class="text-md leading-relaxed" style="color:var(--color-text-primary)">这里展示用户授权保留的完整建议正文，独立占据阅读宽度并自然换行。</p><div class="row wrap justify-end gap-2"><button class="btn btn-ghost btn-sm">复制</button><button class="btn btn-outline btn-sm">采用</button></div></article></div></section>' },
  { id: 'notification', rule: '通知角标：notification-control使用紧凑图标网格并预留上沿，主icon水平居中，badge-count/badge-dot绝对定位附着图标主体右上角（不是外层整行/卡片右上角），不能遮主图标、标题或正文；禁止改为双列并排。小badge-dot表示更新、xs字号badge-count表示计数、独立badge-soft表示文字状态。超过99显示99+，aria-label保留完整数量。默认中性浅底，未读用text-primary浅底，仅紧急事项用text-danger。', html: '<button class="btn btn-ghost notification-control" aria-label="通知，3条未读"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span class="badge-count text-primary" aria-hidden="true">3</span></button>' }
] as const;

function externalIconExample(id:string,html:string,assets:ReadonlyArray<Pick<Asset,'name'|'relPath'>>):string|undefined {
  const doc=new DOMParser().parseFromString(html,'text/html'),icons=Array.from(doc.querySelectorAll('svg'));
  if(!icons.length)return html;
  const name=id==='notification'?'bell':id==='status'?'clock':'map-pin';
  const asset=assets.find(a=>a.name===`图标 · ${name}`&&/^assets\/icons\/[a-f0-9]{64}\.svg$/.test(a.relPath));
  if(!asset)return;
  for(const icon of icons){const span=doc.createElement('span');span.className='icon icon-mask';span.setAttribute('aria-hidden','true');span.style.setProperty('mask-image',`url("${asset.relPath}")`);span.style.setProperty('-webkit-mask-image',`url("${asset.relPath}")`);icon.replaceWith(span);}
  return doc.body.innerHTML;
}
export function renderComponentContracts(includeExamples: boolean, request = '', externalIcons?:ReadonlyArray<Pick<Asset,'name'|'relPath'>>): string {
  const matches = [
    /聊天|咨询师|建议正文|对话建议|conversation/i.test(request) ? 'conversation-reading' : '',
    /通知|未读|角标|徽标|badge/i.test(request) ? 'notification' : '',
    /姓名|人物|会员|约见|婚恋|客户/.test(request) ? 'person-row' : '',
    /统计|指标|数据|看板/.test(request) ? 'stat' : '',
    /状态|回访/.test(request) ? 'status' : '',
    /图文|列表|地址|地点/.test(request) ? 'media-row' : '',
    /标签|筛选/.test(request) ? 'tag-cluster' : ''
  ].filter(Boolean);
  const selected = new Set((matches.length ? matches : ['tag-cluster', 'action-group']).slice(0, 2));
  return '### COMPONENT CONTRACTS\n' + COMPONENT_CONTRACTS.filter(c => c.id !== 'conversation-reading' || matches.includes(c.id)).map(c =>
    `- ${c.rule}${includeExamples && selected.has(c.id) ? (()=>{const html=externalIcons===undefined?c.html:externalIconExample(c.id,c.html,externalIcons);return html?`\n\`\`\`html\n${html}\n\`\`\``:'\n图标结构示例未提供：当前未登记对应独立资源，不得猜测路径或改为内联SVG。';})() : ''}`
  ).join('\n') + '\n修改或润色只调整已授权节点，不得按范例重建原页面。';
}

/** 完整模板按预算整项选择，绝不切断DOM；不声称模型可以读取未提供的文件。 */
export function renderProjectComponents(components: ComponentDefinition[], budget = 8000): string {
  let used = 0;
  const entries: string[] = [];
  let omitted = 0;
  for (const component of components) {
    const version = component.version ?? 1;
    const origin = component.origin ? `；来源 ${component.origin.kind}${component.origin.sourceScreenId ? ` / ${component.origin.sourceScreenId}#${component.origin.sourceNid ?? ''}` : ''}` : '';
    const contract = component.templateContract ? `\n模板合同 v${component.templateContract.version}：固定结构/属性/文案必须保持；仅声明的插槽内容可变。实例须声明data-component-id和data-component-version。\nslotDefs=${JSON.stringify(component.slotDefs??[])}` : '\n旧组件未启用固定模板/插槽校验。';
    const entry = `组件名称: ${component.name} (${component.id}) v${version}${origin}${contract}\n\`\`\`html\n${component.templateHtml}\n\`\`\``;
    if (used + entry.length > budget) { omitted++; continue; }
    used += entry.length;
    entries.push(entry);
  }
  return `复用下列完整模板的结构与样式，修改时保留现有组件标识。\n${entries.join('\n\n')}${omitted ? `\n另有${omitted}个组件超出上下文预算，未提供模板；不要臆造其结构。` : ''}`;
}
