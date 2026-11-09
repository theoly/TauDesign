import { GlobalRegistrator } from '@happy-dom/global-registrator';
import {createTestWebLocks} from './helpers/webLocks';
import {installTestBrowserSnapshotStore} from './helpers/browserSnapshotStore';

// bun test 默认无 DOM；文本节点工具与组件指纹均依赖 DOMParser
GlobalRegistrator.register();
Object.defineProperty(navigator,'locks',{configurable:true,value:createTestWebLocks()});
installTestBrowserSnapshotStore();
