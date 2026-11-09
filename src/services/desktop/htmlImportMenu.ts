import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isDesktopRuntime } from '../storage/folderPicker';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';

export const HTML_IMPORT_MENU_EVENT = 'menu:import-html';
export interface MenuBridge {
  listen: (callback: () => void) => Promise<() => void>;
  setEnabled: (enabled: boolean) => Promise<unknown>;
}

/** A native menu opens the existing import flow only after its listener is ready. */
export function bindHtmlImportMenu(onImport: () => void, bridge?: MenuBridge): () => void {
  return bindProjectMenu(onImport,{event:HTML_IMPORT_MENU_EVENT,command:'set_html_import_menu_enabled',label:'HTML 导入'},bridge);
}

/** All project-only native entries share the listener-before-enable lifecycle. */
export function bindProjectMenu(onOpen:()=>void,options:{event:string;command:string;label:string},bridge?:MenuBridge):()=>void {
  if (!bridge && !isDesktopRuntime()) return () => {};
  const native = bridge ?? {
    listen: (callback: () => void) => listen(options.event, callback),
    setEnabled: (enabled: boolean) => invoke(options.command, { enabled })
  };
  let disposed = false;
  let unlisten: (() => void) | undefined;
  let unsubscribe: (() => void) | undefined;
  let previous: boolean | undefined;
  let pending = Promise.resolve();
  const hasProject = () => {
    const state = useWorkspaceStore.getState();
    return state.view === 'workspace' && !!state.activeProjectId;
  };
  const sync = () => {
    const enabled = hasProject();
    if (enabled === previous) return;
    previous = enabled;
    pending = pending.then(async () => { if (!disposed) await native.setEnabled(enabled); })
      .catch(error => console.warn(`无法更新${options.label}菜单:`, error));
  };
  void native.listen(() => { if (!disposed && hasProject()) onOpen(); }).then(cleanup => {
    if (disposed) { cleanup(); return; }
    unlisten = cleanup;
    unsubscribe = useWorkspaceStore.subscribe(sync);
    sync();
  }).catch(error => console.warn(`无法注册${options.label}菜单:`, error));
  return () => { disposed = true; unsubscribe?.(); unlisten?.(); };
}
