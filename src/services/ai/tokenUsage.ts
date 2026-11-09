import type {TokenUsage} from './engine/core/types';
/** Requested caps are not usage. Sources must survive aggregation, including failed steps. */
export function sumTokenUsage(left:TokenUsage|undefined,right:TokenUsage|undefined):TokenUsage|undefined{
 if(!left)return right?{...right}:undefined;if(!right)return {...left};
 if(!left.inputTokens&&!left.outputTokens&&!left.source)return {...right};
 const source=left.source===undefined&&right.source===undefined?undefined:left.source==='provider'&&right.source==='provider'?'provider':left.source==='estimated'||right.source==='estimated'?'estimated':'unknown';
 return {inputTokens:left.inputTokens+right.inputTokens,outputTokens:left.outputTokens+right.outputTokens,...(source?{source}:{}),...(left.reasoningTokens!==undefined&&right.reasoningTokens!==undefined?{reasoningTokens:left.reasoningTokens+right.reasoningTokens}:{})};
}
