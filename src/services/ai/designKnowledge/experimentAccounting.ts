/** Shared by the live observer and the local evidence verifier; no model claims. */
export interface ExperimentCostTrace {inputChars:number;rawResponse:string;maxTokens:number;usage?:{inputTokens:number;outputTokens:number}}
export function experimentCosts(traces:readonly ExperimentCostTrace[]){
 let inputTokens=0,outputTokens=0,usageEstimated=false;
 for(const trace of traces){
  if(!Number.isSafeInteger(trace.inputChars)||trace.inputChars<0||typeof trace.rawResponse!=='string'||!Number.isSafeInteger(trace.maxTokens)||trace.maxTokens<=0)throw Error('Invalid experiment request accounting');
  if(trace.usage&&[trace.usage.inputTokens,trace.usage.outputTokens].every(n=>Number.isSafeInteger(n)&&n>=0)){inputTokens+=trace.usage.inputTokens;outputTokens+=trace.usage.outputTokens;}
  else{usageEstimated=true;inputTokens+=Math.ceil(trace.inputChars/3.5);outputTokens+=Math.ceil(trace.rawResponse.length/3.5);}
 }
 return {inputTokens,outputTokens,usageEstimated,requests:traces.length,requestedOutputTokens:traces.reduce((n,r)=>n+r.maxTokens,0)};
}
