import {afterEach,expect,test} from 'bun:test';
import {bindDesignTaskMenu,openDesignTaskRecords,OPEN_DESIGN_TASKS_EVENT} from '../src/services/desktop/designTaskMenu';
import {useWorkspaceStore} from '../src/stores/useWorkspaceStore';
const original=useWorkspaceStore.getState(),flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
afterEach(()=>useWorkspaceStore.setState(original));
test('task menu is disabled without a project, subscribes before enabling and opens no old project after cleanup',async()=>{
 useWorkspaceStore.setState({view:'manager',activeProjectId:null});const states:boolean[]=[];let callback=()=>{},opens=0,cleanups=0;
 const stop=bindDesignTaskMenu(()=>opens++,{listen:async handler=>{callback=handler;return()=>cleanups++;},setEnabled:async enabled=>states.push(enabled)});
 await flush();expect(states).toEqual([false]);callback();expect(opens).toBe(0);
 useWorkspaceStore.setState({view:'workspace',activeProjectId:'a'});await flush();callback();expect(opens).toBe(1);expect(states).toEqual([false,true]);
 useWorkspaceStore.setState({view:'manager',activeProjectId:null});await flush();callback();expect(opens).toBe(1);stop();callback();expect(opens).toBe(1);expect(cleanups).toBe(1);
});
test('late listener registration is released, and the UI open event carries no saved-task authority',async()=>{
 let release!:(cleanup:()=>void)=>void,cleanups=0,updates=0;const stop=bindDesignTaskMenu(()=>{}, {listen:()=>new Promise(resolve=>release=resolve),setEnabled:async()=>{updates++;}});stop();release(()=>cleanups++);await flush();expect(cleanups).toBe(1);expect(updates).toBe(0);
 let opened=0;const handler=(event:Event)=>{opened++;expect((event as CustomEvent).detail).toBeUndefined();};window.addEventListener(OPEN_DESIGN_TASKS_EVENT,handler);try{openDesignTaskRecords();expect(opened).toBe(1);}finally{window.removeEventListener(OPEN_DESIGN_TASKS_EVENT,handler);}
});
