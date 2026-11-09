import type {AIProviderConfig,StreamEvent} from '../../types/provider';

/** Incremental provider frames. Transport EOF is deliberately not a provider finish event. */
export class ProviderStreamParser {
  private buffer='';private event='message';private data:string[]=[];
  private input?:number;private output?:number;private jsonTool=false;
  constructor(private provider:AIProviderConfig,private emit:(event:StreamEvent)=>void,private structured=false){}
  feed(chunk:string){
    this.buffer+=chunk;
    if(this.buffer.length>2_000_000)throw Error('模型单个事件超过安全大小限制。');
    let end:number;
    while((end=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,end).replace(/\r$/,'');this.buffer=this.buffer.slice(end+1);this.line(line);}
  }
  finish(){if(this.buffer){this.line(this.buffer.replace(/\r$/,''));this.buffer='';}this.flush();}
  private line(line:string){
    if(this.provider.protocol==='ollama_native'){if(line.trim())this.parse(line.trim());return;}
    if(!line.trim()){this.flush();this.event='message';return;}
    if(line.startsWith(':'))return;
    if(line.startsWith('event:')){this.event=line.slice(6).trim();return;}
    if(line.startsWith('data:')){this.data.push(line.slice(5).replace(/^ /,''));if(this.data.reduce((n,s)=>n+s.length,0)>2_000_000)throw Error('模型单个事件超过安全大小限制。');return;}
    if(line.trimStart().startsWith('{'))this.parse(line.trim());
  }
  private flush(){if(!this.data.length)return;const raw=this.data.join('\n');this.data=[];this.parse(raw);}
  private text(value:unknown,reasoning=false){if(typeof value==='string'&&value)this.emit(reasoning?{type:'ReasoningDelta',text:value}:{type:'Delta',text:value});}
  private usage(input:unknown,output:unknown,reasoning?:unknown){
    if(typeof input==='number'&&Number.isSafeInteger(input)&&input>=0)this.input=input;
    if(typeof output==='number'&&Number.isSafeInteger(output)&&output>=0)this.output=output;
    if(this.input!==undefined&&this.output!==undefined)this.emit({type:'Usage',input_tokens:this.input,output_tokens:this.output,...(typeof reasoning==='number'&&reasoning>=0?{reasoning_tokens:reasoning}:{}),source:'provider'});
  }
  private parse(raw:string){
    if(raw.trim()==='[DONE]'){this.emit({type:'Done',finish_reason:'stop'});return;}
    let d:any;try{d=JSON.parse(raw);}catch{this.emit({type:'Error',kind:'invalid_response',message:'模型事件包含无效JSON，未把传输结束当作成功。'});return;}
    if(d.error||d.type==='error'||this.event==='error'){this.emit({type:'Error',kind:'invalid_response',message:`API 错误: ${d.error?.message??d.message??'invalid stream'}`});return;}
    if(this.provider.protocol==='ollama_native'){
      this.text(d.message?.thinking,true);this.text(d.message?.content);this.usage(d.prompt_eval_count,d.eval_count);
      if(d.done)this.emit({type:'Done',finish_reason:d.done_reason||'stop'});return;
    }
    if(this.provider.protocol==='openai_compatible'){
      const c=d.choices?.[0];this.text(c?.delta?.reasoning_content??c?.delta?.reasoning,true);this.text(c?.delta?.content??c?.text??c?.message?.content);
      this.usage(d.usage?.prompt_tokens,d.usage?.completion_tokens,d.usage?.completion_tokens_details?.reasoning_tokens);
      if(c?.finish_reason)this.emit({type:'Done',finish_reason:c.finish_reason});return;
    }
    if(this.provider.protocol==='anthropic'){
      if(d.type==='content_block_start'&&d.content_block?.type==='tool_use')this.jsonTool=this.structured&&d.content_block.name==='output_json';
      if(d.delta?.type==='thinking_delta')this.text(d.delta.thinking,true);
      this.text(d.delta?.text??d.content?.[0]?.text);
      if(this.jsonTool&&d.delta?.type==='input_json_delta')this.text(d.delta.partial_json);
      const u=d.usage??d.message?.usage;this.usage(u?.input_tokens,u?.output_tokens);
      const reason=d.delta?.stop_reason??d.stop_reason;
      if(reason)this.emit({type:'Done',finish_reason:reason==='tool_use'&&this.jsonTool?'stop':reason});
      else if(d.type==='message_stop'||this.event==='message_stop')this.emit({type:'Done',finish_reason:'stop'});return;
    }
    if(this.provider.protocol==='gemini'){
      for(const part of d.candidates?.[0]?.content?.parts??[])this.text(part.text,part.thought===true);
      const m=d.usageMetadata;this.usage(m?.promptTokenCount,m?.candidatesTokenCount,m?.thoughtsTokenCount);
      if(d.candidates?.[0]?.finishReason)this.emit({type:'Done',finish_reason:d.candidates[0].finishReason});
    }
  }
}

/** Only old callers get the legacy presentation markers; the actual parser is always typed. */
export function legacyReasoningAdapter(emit:(event:StreamEvent)=>void){
 let thinking=false;
 return (event:StreamEvent)=>{
  if(event.type==='ReasoningDelta'){
   emit({type:'Delta',text:(thinking?'':'<think>\n')+event.text});thinking=true;return;
  }
  if(thinking&&(event.type==='Delta'||event.type==='Done'||event.type==='TransportClosed'||event.type==='Error')){emit({type:'Delta',text:'\n</think>\n\n'});thinking=false;}
  emit(event);
 };
}
