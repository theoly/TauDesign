import type {DesignSystem} from '../../types/designSystem';
import type {Screen} from '../../types/project';
import {BACKGROUND_ROLES,type ThemeBackgrounds,type BackgroundRole} from '../../types/themeBackground';
import {compileThemeBackground} from '../../utils/themeBackground';
import {resolveThemeColors} from '../../utils/semanticColors';
import {contentFingerprint} from '../ai/designWorkflow';
import {extractPageStyle} from './pageStyleExtraction';

interface StyleState {id:string;designSystem:DesignSystem;screens:Record<string,Screen>;settings:{colorMode:'light'|'dark';deviceProfile:'pc'|'mobile'};overrides:unknown;designLibraryBinding?:unknown}
export function styleApplicationKey(state:StyleState):string {return contentFingerprint(JSON.stringify([state.id,state.designSystem,state.screens,state.settings,state.overrides,state.designLibraryBinding]));}

/** Snapshot only background roles, leaving unrelated project tokens intact. */
function backgroundSnapshot(theme:DesignSystem,screen:Screen):ThemeBackgrounds {
 const snapshot:ThemeBackgrounds={};
 for(const role of BACKGROUND_ROLES){snapshot[role]={};for(const mode of ['light','dark'] as const){
  const authored=screen.metadata?.themeBackgrounds?.snapshot?.[role]?.[mode]??theme.tokens.backgrounds?.[role]?.[mode],colors=resolveThemeColors(theme.tokens,mode).values;
  snapshot[role]![mode]=authored&&compileThemeBackground(authored)?structuredClone(authored):{kind:'solid',color:role==='page'?colors.background:role==='primaryAction'?colors.primary:colors.surface};
 }}return snapshot;
}

export function backgroundScreenUpdates(state:StyleState,next:DesignSystem,syncIds:string[]):Record<string,Screen> {
 const selected=new Set(syncIds);for(const id of selected)if(!state.screens[id])throw new Error('待同步页面已变化，请重新预览。');
 const beforePaints=backgroundSnapshot(state.designSystem,{metadata:undefined} as Screen),afterPaints=backgroundSnapshot(next,{metadata:undefined} as Screen);
 const changed=BACKGROUND_ROLES.filter(role=>JSON.stringify(beforePaints[role])!==JSON.stringify(afterPaints[role]));
 if(!changed.length)return {};
 const updates:Record<string,Screen>={};
 for(const screen of Object.values(state.screens)){
  if(screen.metadata?.kind==='specimen')continue;
  let policy:NonNullable<Screen['metadata']>['themeBackgrounds'];
  if(!selected.has(screen.id)){
   if(screen.metadata?.importedHtml&&!screen.metadata.themeBackgrounds)continue;
   policy={...screen.metadata?.themeBackgrounds,snapshot:backgroundSnapshot(state.designSystem,screen)};
  }else{
   const analysis=extractPageStyle(screen,state.designSystem,state.settings.colorMode,state.settings.deviceProfile),bindings={...screen.metadata?.themeBackgrounds?.bindings},snapshot={...screen.metadata?.themeBackgrounds?.snapshot};
   for(const role of changed){
    delete snapshot[role];
    const targets=analysis.backgrounds.filter(c=>c.role===role).map(c=>c.selector);
    bindings[role]=role==='page'?[...new Set(['body',...targets.slice(0,8)])]:targets.slice(0,20);
   }
   policy={bindings,...(Object.keys(snapshot).length?{snapshot}:{})};
  }
  updates[screen.id]={...screen,metadata:{...screen.metadata,themeBackgrounds:policy}};
 }
 return updates;
}

export const backgroundVariable:Record<BackgroundRole,string>={page:'page',primaryAction:'primary-action',decorativeSurface:'decorative-surface'};
