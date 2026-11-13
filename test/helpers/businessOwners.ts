import {buildPageRedesignSource} from '../../src/services/ai/pageRedesignSource';
import {businessItems} from '../../src/services/ai/businessInventoryOwnership';
export function fixtureBusinessOwners(html:string){
 const items=businessItems(buildPageRedesignSource(html,{deviceProfile:'mobile',protectedNids:['save']}));
 return {owners:[1,2,3].map(i=>({regionId:`section-${i}`,itemIds:items.filter(item=>{const text=JSON.stringify(item.value),n=Number(/(?:业务信息|完整内容|功能)([1-7])/.exec(text)?.[1]??0);return (n?n<=3?1:n<=5?2:3:item.kind==='text'&&text.includes('资料管理')?1:3)===i;}).map(item=>item.id)}))};
}
