import { afterEach, describe, expect, test } from 'bun:test';
import { bindHtmlImportMenu } from '../src/services/desktop/htmlImportMenu';
import { useWorkspaceStore } from '../src/stores/useWorkspaceStore';
const initial = useWorkspaceStore.getState();
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
afterEach(() => useWorkspaceStore.setState(initial));
describe('File菜单HTML导入桥接', () => {
  test('先注册再启用，打开/关闭工程同步状态，重复事件只发起现有入口', async () => {
    useWorkspaceStore.setState({view:'manager',activeProjectId:null});
    const enabled:boolean[]=[];let handler=()=>{},opened=0,cleaned=0;
    const stop=bindHtmlImportMenu(()=>opened++,{listen:async callback=>{handler=callback;return ()=>cleaned++},setEnabled:async value=>{enabled.push(value)}});
    await flush();expect(enabled).toEqual([false]);handler();expect(opened).toBe(0);
    useWorkspaceStore.setState({view:'workspace',activeProjectId:'project'});await flush();expect(enabled).toEqual([false,true]);
    handler();handler();expect(opened).toBe(2);
    useWorkspaceStore.setState({view:'manager',activeProjectId:null});await flush();handler();expect(opened).toBe(2);expect(enabled).toEqual([false,true,false]);
    stop();handler();expect(opened).toBe(2);expect(cleaned).toBe(1);
    useWorkspaceStore.setState({view:'workspace',activeProjectId:'other'});await flush();expect(enabled).toEqual([false,true,false]);
  });
  test('卸载早于原生异步注册完成时立即释放，不遗留订阅或启用旧菜单', async () => {
    useWorkspaceStore.setState({view:'workspace',activeProjectId:'project'});let release!:(cleanup:()=>void)=>void,cleaned=0,updated=0;
    const stop=bindHtmlImportMenu(()=>{}, {listen:()=>new Promise(resolve=>{release=resolve}),setEnabled:async()=>{updated++}});
    stop();release(()=>cleaned++);await flush();expect(cleaned).toBe(1);expect(updated).toBe(0);
  });
  test('纯浏览器不调用Tauri菜单API', () => {
    expect(()=>bindHtmlImportMenu(()=>{})()).not.toThrow();
  });
});
