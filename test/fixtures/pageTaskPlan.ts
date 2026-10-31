import type {PageTaskPlan} from '../../src/services/ai/pageTaskPlan';
/** Controlled business plan for chat integration. No production planner is bypassed. */
export const chatPageTaskPlan:PageTaskPlan={goal:'查看资料并完成操作',actor:'页面用户',completion:['展示操作反馈'],questions:[],features:[{id:'f1',title:'资料',change:'add',basis:'user',sourceIds:['user:request'],information:[{label:'资料',kind:'display'}],interactions:[{label:'查看详情',precondition:'已选择资料',outcome:'显示详情',targetScreenId:''}],states:[{name:'默认',condition:'资料已就绪',feedback:'显示资料'}]}]};
