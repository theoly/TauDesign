import { contentFingerprint } from '../services/ai/designWorkflow';
import { validReferenceRegion, type ImageAttachment } from '../types/referenceImage';
export type CropRect = {x:number;y:number;width:number;height:number};

export async function cropReferenceImage(source: ImageAttachment, rect: CropRect): Promise<ImageAttachment> {
  if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(source.dataUrl)) throw Error('请使用PNG、JPEG、WebP或GIF参考图。');
  const image = new Image();
  await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('参考图解码失败。'));image.src=source.dataUrl;});
  const region={...rect,sourceFingerprint:contentFingerprint(source.dataUrl),sourceWidth:image.naturalWidth,sourceHeight:image.naturalHeight};
  if (!validReferenceRegion(region)) throw Error('选区应至少8×8像素、不能越界，最多1600万像素。');
  if(rect.x===0&&rect.y===0&&rect.width===image.naturalWidth&&rect.height===image.naturalHeight)return {name:source.name,dataUrl:source.dataUrl};
  const canvas=document.createElement('canvas');canvas.width=rect.width;canvas.height=rect.height;
  const context=canvas.getContext('2d');if(!context)throw Error('当前环境无法裁切图片。');
  context.drawImage(image,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
  const dataUrl=canvas.toDataURL('image/png');if(!dataUrl.startsWith('data:image/png;base64,'))throw Error('裁切结果为空，请重新选择。');
  return {name:source.name,dataUrl,region};
}
