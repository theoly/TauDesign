import {bindProjectMenu,type MenuBridge} from './htmlImportMenu';
export const DESIGN_TASK_MENU_EVENT='menu:design-tasks';
export const OPEN_DESIGN_TASKS_EVENT='taudesign:open-design-tasks';
export function openDesignTaskRecords(){window.dispatchEvent(new Event(OPEN_DESIGN_TASKS_EVENT));}
export function bindDesignTaskMenu(onOpen:()=>void,bridge?:MenuBridge){return bindProjectMenu(onOpen,{event:DESIGN_TASK_MENU_EVENT,command:'set_design_tasks_menu_enabled',label:'未完成设计'},bridge);}
