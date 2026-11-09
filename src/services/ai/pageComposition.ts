import type {PageTaskPlan} from './pageTaskPlan';

export interface PageComposition {
 version:1;layout:'flow'|'sidebar-main'|'two-column';footer:'flow'|'cta';
 regions:Array<{id:string;role:'header'|'sidebar'|'main'|'secondary'|'footer'|'flow';featureIds:string[]}>;
}
export function pageCompositionSchema(device?: 'pc' | 'mobile', featureIds?: string[]) {
 return {
  type:'object',additionalProperties:false,required:['version','layout','footer','regions'],
  properties:{
   version:{type:'integer',const:1},
   layout:{type:'string',enum:['flow','sidebar-main','two-column']},
   footer:{type:'string',enum:device==='pc'?['flow']:['flow','cta']},
   regions:{type:'array',minItems:1,maxItems:3,items:{
    type:'object',additionalProperties:false,required:['id','role','featureIds'],
    properties:{
     id:{type:'string',enum:['section-1','section-2','section-3']},
     role:{type:'string',enum:['header','sidebar','main','secondary','footer','flow']},
     featureIds:{type:'array',minItems:1,maxItems:8,items:{type:'string',...(featureIds?.length?{enum:featureIds}:{})}}
    }
   }}
  }
 };
}

export const PAGE_COMPOSITION_SCHEMA = pageCompositionSchema();

/**
 * 自愈规整模型生成的页面布局计划：
 * 1. 自动对齐功能别名/标题至标准功能 ID；
 * 2. 跨区域去重，杜绝功能重复分配；
 * 3. 自动补齐模型遗漏的功能归属；
 * 4. 纠偏首尾 Header/Footer 角色与布局约束。
 */
export function repairPageComposition(value: unknown, plan: PageTaskPlan, device: 'pc' | 'mobile'): PageComposition {
  const validFeatures = plan.features.filter(f => f.change !== 'remove');
  if (!validFeatures.length) return defaultPageComposition(plan);
  const validIds = validFeatures.map(f => f.id);
  const titleToId = new Map(validFeatures.map(f => [f.title.trim().toLowerCase(), f.id]));

  const raw = (value && typeof value === 'object' ? value : {}) as Partial<PageComposition>;
  let layout: PageComposition['layout'] = 'flow';
  if (device === 'pc' && (raw.layout === 'sidebar-main' || raw.layout === 'two-column')) {
    layout = raw.layout;
  }
  let footer: PageComposition['footer'] = raw.footer === 'cta' && device === 'mobile' ? 'cta' : 'flow';

  const rawRegions = Array.isArray(raw.regions) && raw.regions.length > 0 ? raw.regions.slice(0, 3) : [];
  if (!rawRegions.length) {
    return defaultPageComposition(plan);
  }

  const assignedSet = new Set<string>();
  const repairedRegions: Array<{ id: string; role: 'header' | 'sidebar' | 'main' | 'secondary' | 'footer' | 'flow'; featureIds: string[] }> = [];

  for (let i = 0; i < rawRegions.length; i++) {
    const r = rawRegions[i];
    let role: 'header' | 'sidebar' | 'main' | 'secondary' | 'footer' | 'flow' = 'flow';
    if (r && typeof r === 'object' && ['header', 'sidebar', 'main', 'secondary', 'footer', 'flow'].includes(r.role)) {
      role = r.role;
    }
    if (device === 'mobile' && (role === 'sidebar' || role === 'secondary')) {
      role = 'flow';
    }

    const featureIds: string[] = [];
    const rawIds = Array.isArray(r?.featureIds) ? r.featureIds : [];
    for (const item of rawIds) {
      if (typeof item !== 'string' && typeof item !== 'number') continue;
      const str = String(item).trim();
      let matchedId = validIds.includes(str) ? str : undefined;
      if (!matchedId) {
        matchedId = titleToId.get(str.toLowerCase());
      }
      if (!matchedId) {
        const numMatch = str.match(/(?:feature|f)[-_]?([1-9][0-9]?)/i) || str.match(/^([1-9][0-9]?)$/);
        if (numMatch) {
          const candidate = `f${numMatch[1]}`;
          if (validIds.includes(candidate)) {
            matchedId = candidate;
          }
        }
      }
      if (matchedId && !assignedSet.has(matchedId)) {
        assignedSet.add(matchedId);
        featureIds.push(matchedId);
      }
    }

    repairedRegions.push({
      id: `section-${i + 1}`,
      role,
      featureIds
    });
  }

  // 补齐遗漏的功能 ID
  const missingIds = validIds.filter(id => !assignedSet.has(id));
  if (missingIds.length > 0) {
    let target = repairedRegions.find(r => r.role === 'main' || r.role === 'flow');
    if (!target) target = repairedRegions[repairedRegions.length - 1];
    if (target) {
      target.featureIds.push(...missingIds);
      missingIds.forEach(id => assignedSet.add(id));
    }
  }

  // 清理或平衡可能产生空 featureIds 的区域
  const nonEmptyRegions = repairedRegions.filter(r => r.featureIds.length > 0);
  for (const empty of repairedRegions.filter(r => r.featureIds.length === 0)) {
    const donor = nonEmptyRegions.find(r => r.featureIds.length > 1);
    if (donor) {
      const borrowed = donor.featureIds.pop()!;
      empty.featureIds.push(borrowed);
      nonEmptyRegions.push(empty);
    }
  }

  const finalRegions = repairedRegions.filter(r => r.featureIds.length > 0).slice(0, 3);
  if (!finalRegions.length) {
    return defaultPageComposition(plan);
  }

  // 重新对齐 ID 序号: section-1, section-2, section-3
  finalRegions.forEach((r, idx) => {
    r.id = `section-${idx + 1}`;
  });

  // 检查首尾角色合法性：header 只能在 index 0，footer 只能在最后
  if (finalRegions[0].role !== 'header' && finalRegions.some(r => r.role === 'header')) {
    finalRegions.forEach((r, idx) => {
      if (r.role === 'header' && idx !== 0) r.role = 'flow';
    });
  }
  const lastIdx = finalRegions.length - 1;
  if (finalRegions[lastIdx].role !== 'footer' && finalRegions.some(r => r.role === 'footer')) {
    finalRegions.forEach((r, idx) => {
      if (r.role === 'footer' && idx !== lastIdx) r.role = 'flow';
    });
  }

  // 主体不能为空
  const bodyRegions = finalRegions.filter(r => !['header', 'footer'].includes(r.role));
  if (!bodyRegions.length) {
    finalRegions[0].role = 'flow';
  }

  // 根据主体角色规范化 layout
  const newBody = finalRegions.filter(r => !['header', 'footer'].includes(r.role));
  if (layout === 'sidebar-main') {
    if (newBody.length !== 2 || newBody[0].role !== 'sidebar' || newBody[1].role !== 'main') {
      layout = 'flow';
      newBody.forEach(r => { if (['sidebar', 'secondary'].includes(r.role)) r.role = 'flow'; });
    }
  } else if (layout === 'two-column') {
    if (newBody.length !== 2 || newBody[0].role !== 'main' || newBody[1].role !== 'secondary') {
      layout = 'flow';
      newBody.forEach(r => { if (['sidebar', 'secondary'].includes(r.role)) r.role = 'flow'; });
    }
  } else if (layout === 'flow') {
    newBody.forEach(r => { if (!['main', 'flow'].includes(r.role)) r.role = 'flow'; });
  }

  // 如果 footer 为 cta，但移动端且没有 footer 角色，降级为 flow
  if (footer === 'cta' && (device !== 'mobile' || !finalRegions.some(r => r.role === 'footer'))) {
    footer = 'flow';
  }

  return {
    version: 1,
    layout,
    footer,
    regions: finalRegions
  };
}

/** An arrangement describes layout and ownership; it contains neither HTML nor model-owned infrastructure. */
export function parsePageComposition(value:unknown,plan:PageTaskPlan,device:'pc'|'mobile',options?:{autoRepair?:boolean}):PageComposition {
 if (options?.autoRepair) {
  value = repairPageComposition(value, plan, device);
 }
 const p=value as PageComposition;
 if(!p||Object.keys(p).sort().join(',')!=='footer,layout,regions,version'||p.version!==1||!['flow','sidebar-main','two-column'].includes(p.layout)||!['flow','cta'].includes(p.footer)||!Array.isArray(p.regions)||p.regions.length<1||p.regions.length>3)throw Error('页面布局计划必须为1–3个目标区域，不接受HTML公共壳或额外目标。');
 if(p.regions.some((r,i)=>!r||Object.keys(r).sort().join(',')!=='featureIds,id,role'||r.id!==`section-${i+1}`||!['header','sidebar','main','secondary','footer','flow'].includes(r.role)||!Array.isArray(r.featureIds)||!r.featureIds.length||r.featureIds.some(id=>typeof id!=='string')))throw Error('布局区域身份或职责无效。');
 const ids=plan.features.filter(f=>f.change!=='remove').map(f=>f.id),assigned=p.regions.flatMap(r=>r.featureIds);
 if(assigned.length!==ids.length||new Set(assigned).size!==assigned.length||assigned.some(id=>!ids.includes(id)))throw Error('布局计划遗漏、重复或臆造功能归属，未生成页面。');
 const roles=p.regions.map(r=>r.role),body=roles.filter(role=>!['header','footer'].includes(role));
 if(device==='mobile'&&p.layout!=='flow')throw Error('移动端布局计划必须保持单列流，不能生成PC双栏公共壳。');
 if(roles.filter(r=>r==='header').length>1||roles.filter(r=>r==='footer').length>1||roles.includes('header')&&roles[0]!=='header'||roles.includes('footer')&&roles.at(-1)!=='footer'||!body.length)throw Error('全宽头尾区域必须唯一且位于首尾，不能替代主体。');
 if(p.layout==='flow'&&body.some(role=>!['main','flow'].includes(role)))throw Error('单列流不能包含侧栏或双栏角色。');
 if(p.layout==='sidebar-main'&&(body.length!==2||body[0]!=='sidebar'||body[1]!=='main'))throw Error('侧栏布局必须是一个sidebar和一个main主体。');
 if(p.layout==='two-column'&&(body.length!==2||body[0]!=='main'||body[1]!=='secondary'))throw Error('双栏布局必须是一个main与一个secondary主体。');
 const res=structuredClone(p);
 if(res.footer==='cta'&&(device!=='mobile'||!roles.includes('footer'))){
  res.footer='flow';
 }
 return res;
}
export function defaultPageComposition(plan:PageTaskPlan):PageComposition {
 const features=plan.features.filter(f=>f.change!=='remove'),count=Math.min(3,features.length);
 if(!count)throw Error('功能规划没有可生成内容。');
 const groups=Array.from({length:count},()=>[] as string[]);features.forEach((feature,i)=>groups[Math.min(count-1,Math.floor(i*count/features.length))].push(feature.id));
 return {version:1,layout:'flow',footer:'flow',regions:groups.map((featureIds,i)=>({id:`section-${i+1}`,role:'flow',featureIds}))};
}
/** Only program-owned classes and Token dimensions; slots are empty, unique and non-nested. */
export function buildCompositionShell(composition:PageComposition,device:'pc'|'mobile'):string {
 const doc=new DOMParser().parseFromString('<!doctype html><html><head></head><body></body></html>','text/html');
 const root=doc.createElement('div');root.className=device==='pc'?'container-max col gap-4':'col gap-4';doc.body.append(root);
 const body=doc.createElement('main');body.className=composition.layout==='sidebar-main'?'row items-start gap-4':composition.layout==='two-column'?'grid-2 gap-4':'col gap-4';root.append(body);
 for(const region of composition.regions){
  const tag=region.role==='sidebar'||region.role==='secondary'?'aside':region.role==='header'?'header':region.role==='footer'?'footer':'section';
  const slot=doc.createElement(tag);slot.setAttribute('data-design-slot',region.id);slot.className='min-w-0';
  if(region.role==='sidebar'){slot.classList.add('flex-none');slot.style.width='calc(var(--space-8) * 6)';}
  if(composition.layout==='sidebar-main'&&region.role==='main')slot.classList.add('flex-1');
  if(region.role==='header')root.insertBefore(slot,body);
  else if(region.role==='footer'){if(composition.footer==='cta')slot.classList.add('cta-fixed');root.append(slot);}
  else body.append(slot);
 }
 return doc.documentElement.outerHTML;
}
