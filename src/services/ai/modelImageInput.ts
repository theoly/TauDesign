import type {AIProviderConfig} from '../../types/provider';
import type {EngineMessage} from './engine/core/types';
import {resolveModelCapability} from './modelCapabilities';

export type ModelImageInput = {kind:'base64';mime:string;data:string;url:string} | {kind:'url';url:string};
/** Encodings belong only to the provider's image part, never a text prompt. No upload or fetch here. */
export function modelImageInput(provider:AIProviderConfig,model:string,message:EngineMessage):ModelImageInput|undefined {
  if(!message.imageUrl)return;
  if(message.role!=='user')throw Error('参考图只能通过用户消息的专用图片字段发送。');
  const capability=resolveModelCapability(provider,model);
  if(capability?.mediaInput==='unsupported')throw Error('当前模型配置不支持图片输入，未发送请求。');
  if(capability?.mediaInput==='file-upload')throw Error('当前模型配置要求文件上传，尚无已验证的上传句柄；请核对图片输入配置。');
  const url=message.imageUrl;
  if(url.startsWith('data:')) {
    if(capability?.mediaInput==='url')throw Error('当前模型配置只接受图片URL，不能发送本地编码图片。');
    if(url.length>32*1024*1024)throw Error('参考图超过单次图片字段大小限制。');
    const match=/^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(url);
    if(!match||match[2].length%4===1)throw Error('参考图编码或图片类型无效，未发送请求。');
    return {kind:'base64',mime:match[1].toLowerCase().replace('image/jpg','image/jpeg'),data:match[2],url};
  }
  let parsed:URL;try{parsed=new URL(url);}catch{throw Error('参考图须使用专用图片字段中的编码图片或HTTPS链接。');}
  if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error('参考图链接无效，未发送请求。');
  // These existing protocols accept local bytes. Never silently drop an unsupported remote input.
  if(provider.protocol==='gemini'||provider.protocol==='ollama_native')throw Error('当前协议需要本地参考图字节；此入口不自动下载或上传远程图片。');
  return {kind:'url',url};
}
