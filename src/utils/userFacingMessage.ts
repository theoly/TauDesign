/** Presentation only. Never use this on prompts, generated HTML, user text, or stored evidence. */
const replacements:Array<[RegExp,string]>=[
 [/^multiple_artifacts$/,'AI 返回了多个页面结果，目前只使用第一个。'],
 [/代码阶段仅返回推理并达到上限：复用既有输入，进行一次紧凑代码恢复；不是HTML续写。/g,'AI 只返回了思考过程，尚未生成页面内容。系统将保留原要求，再尝试一次更精简的生成。'],
 [/源码、实体、资源和新的iframe检查全部通过/g,'页面内容、关联组件、资源文件和实际显示效果均已检查通过'],
 [/续写达到(\d+)次或累计(\d+)请求输出Token上限；请拆分修改。/g,'本轮继续生成已达到$1次或$2个用量单位的上限，请缩小修改范围或分开设计。'],
 [/累计请求输出预算/g,'本轮已申请的回复额度为'],[/原生续写|分段续写/g,'继续生成'],
 [/已自动将生成的SVG图形外置为独立媒体；页面仍须通过全部交付检查。/g,'图表和图标已保存为独立文件，页面结果请查看检查记录。'],
 [/(?:SkeletonMainAtomic|SectionPlanThenWrite)\s*[：:]\s*完整main已取得，仍须全部交付检查。/g,'页面内容已生成，请查看完整性和布局检查结果。'],
 [/SkeletonMainAtomic/g,'直接生成页面'],[/SectionPlanThenWrite/g,'先规划布局，再生成页面'],[/SectionedPatch/g,'分区域生成页面'],[/DerivedCopyMutableOnly/g,'复制原页面并局部修改'],
 [/普通页面，程序基础设施后一次写入main。/g,'页面内容较少，可以一次生成。'],[/先规划再一次写入main/g,'先安排布局，再一次生成页面内容'],
 [/预计HTML超过45KiB。/g,'预计页面内容较多，需要分区域生成。'],
 [/结构化授权执行器/g,'已确认的修改流程'],[/完整基线/g,'完整原页面'],[/原父预算/g,'本轮剩余额度'],[/父任务/g,'本轮任务'],[/父预算/g,'本轮额度'],
 [/业务归属回执/g,'内容分配记录'],[/业务职责/g,'各区域需要展示的内容'],[/功能合同/g,'本轮功能要求'],[/mutableRegions/g,'允许修改的区域'],
 [/referenceImage\.fields\s*(?=参考图字段)/g,''],[/referenceImage\.fields/g,'参考图字段'],[/\bpageTaskPlan\b/g,'页面功能规划'],[/\bdesignGuidance\b/g,'设计指导'],[/\bworkflowContract\b/g,'本次设计要求'],
 [/业务规划格式、来源或范围无效/g,'功能规划未通过检查'],[/输出上限须小于上下文窗口/g,'单次回复长度必须小于一次可处理的总内容量'],
 [/工程或模型上下文/g,'本次使用的工程资料或模型设置'],[/上下文已变化/g,'本次使用的资料已变化'],[/上下文预算/g,'可处理的内容量'],
 [/公共骨架/g,'共用的页面布局'],[/共享父片段/g,'页面共用部分'],[/私有插槽/g,'本页内容区域'],[/父节点/g,'上层区域'],[/子节点/g,'内部元素'],
 [/调用回执/g,'请求记录'],[/回执/g,'记录'],[/冻结规则/g,'已确定的设计规则'],[/基线/g,'原版本'],[/指纹/g,'内容校验信息'],
 [/结构化输出/g,'规定格式的回复'],[/HTML续写/g,'接着生成页面代码'],[/一次写入main/g,'一次生成页面内容'],[/\bmain\b/g,'页面主体'],
 [/\bDOM\b/g,'页面结构'],[/\bCSS\b/g,'样式'],[/\bHTML\b/g,'页面代码'],[/\bJSON\b/g,'格式化数据'],[/\bSchema\b/gi,'回复格式要求'],[/\bProvider\b/gi,'AI 服务'],
 [/\bartifact\b/g,'页面内容'],[/\bCheckpoint\b/gi,'恢复点'],[/\bfingerprint\b/gi,'内容校验信息'],[/\bCAS\b/g,'保存前版本检查'],
 [/data-nid/g,'元素编号'],[/\bnid\b/g,'元素编号'],[/\bL4\b/g,'手动样式'],[/类名白名单/g,'项目支持的样式'],
 [/\bpatch\b/gi,'局部修改'],[/分区补丁/g,'分区域修改'],[/补丁/g,'局部修改'],[/源码/g,'页面代码'],[/(?:任务|执行)合同/g,'本轮要求'],[/输出合同/g,'回复格式要求'],[/授权合同/g,'已确认的修改范围'],[/契约/g,'要求'],
 [/(\d[\d,]*)\s*(?:tokens?|Token)\b/gi,'$1 个用量单位'],[/\btokens?\b/gi,'用量单位']
];
export function userFacingMessage(message:string):string{
 // Quoted labels, code, URLs and paths are diagnostic data, not interface terminology.
 if(/^\s*(?:```|<!doctype|<(?:html|artifact|main|section|div)\b)/i.test(message))return message;
 const literal=/(```[\s\S]*?```|`[^`\n]*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|“[^”\n]*”|「[^」\n]*」|『[^』\n]*』|《[^》\n]*》|https?:\/\/[^\s<>"'，。；]+|(?:[\w.-]+\/)+[\w.-]+)/g;
 return message.split(literal).map((part,index)=>index%2?part:replacements.reduce((text,[pattern,value])=>text.replace(pattern,value),part)).join('');
}

export function generationProgressLabel(mode:string):string{
 return ({SkeletonMainAtomic:'正在生成页面内容…',SectionPlanThenWrite:'正在安排页面布局，随后生成页面内容…',SectionedPatch:'页面内容较多，正在分区域设计…',DerivedCopyMutableOnly:'正在复制原页面，只修改你指定的部分…'} as Record<string,string>)[mode]??'正在生成页面…';
}
const stages:Record<string,string>={'functional-plan':'梳理页面功能','functional-plan-correction':'完善功能规划','reference-observation':'分析参考图片','composition-plan':'安排页面布局','business-ownership':'安排原页面内容','section-plan':'划分页面区域',artifact:'生成页面',root:'生成页面共用部分',planning:'梳理页面需求',generation:'生成页面',repair:'修复页面'};
export function requestStageLabel(stage:string|undefined):string{
 if(!stage)return '当前步骤';if(stages[stage])return stages[stage];
 const section=/^section-(\d+)$/.exec(stage);if(section)return `生成第 ${section[1]} 个区域`;
 const page=/^page-(\d+)$/.exec(stage);if(page)return `生成第 ${page[1]} 个页面`;
 if(/^branch-/.test(stage))return '生成页面共用部分';if(/^repair[-:]/.test(stage))return '修复页面';
 return '当前步骤';
}
export function finishReasonLabel(reason:string|undefined):string{
 if(!reason)return '未记录结束原因';
 return ({stop:'回复已结束',end_turn:'回复已结束',stop_sequence:'回复已结束',length:'达到回复长度上限',max_tokens:'达到回复长度上限',content_filter:'回复被安全规则拦截',tool_calls:'AI 请求执行其他操作',tool_use:'AI 请求执行其他操作',error:'请求失败',cancelled:'请求已停止',unknown:'回复是否完整尚未确认'} as Record<string,string>)[reason]??'结束原因未识别';
}
