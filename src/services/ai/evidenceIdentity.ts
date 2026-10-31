import type {DesignTaskContract} from './designWorkflow';
import {contentFingerprint} from './designWorkflow';
import {guidanceBinding} from './designKnowledge/receipt';
import {getBaseCss} from '../../styles/baseCss';

/** Task inputs exclude checker versions and completion receipts, which may be refreshed independently. */
export function taskInputBinding(contract:DesignTaskContract):string {
 return contentFingerprint(JSON.stringify([guidanceBinding(contract),contract.acceptance,contract.referencePageId,contract.sourceName,
  contract.projectPages,contract.projectPageCount,contract.designGuidance?[contract.designGuidance.protocol,contract.designGuidance.selection]:undefined]));
}
/** Application-owned revision. Bump when rendered checks or their dependencies change. */
export const RenderEvidenceAuthority={revision:()=> 'render-checks-2026-10-31.1'};
const cssCache=new Map<string,{source:string;fingerprint:string}>();
export function renderEvidenceIdentity(profile:'pc'|'mobile'):string {
 const source=getBaseCss(profile);let css=cssCache.get(profile);
 if(css?.source!==source){css={source,fingerprint:contentFingerprint(source)};cssCache.set(profile,css);}
 return contentFingerprint(JSON.stringify([RenderEvidenceAuthority.revision(),profile,css.fingerprint,
  typeof navigator==='undefined'?'unavailable':navigator.userAgent,typeof window==='undefined'?1:window.devicePixelRatio]));
}
