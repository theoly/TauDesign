import {useProjectStore,type HtmlScreenImportSetup} from '../../src/stores/useProjectStore';
import type {Screen} from '../../src/types/project';
/** Low-level saved-document fixture, not the public import application path. No rendering is claimed here. */
export function seedImportedScreen(screen:Omit<Screen,'id'|'position'>,setup:HtmlScreenImportSetup) {
  return useProjectStore.getState().addScreen(screen,undefined,{autoPan:true,importSetup:setup});
}
