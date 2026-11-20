import { beforeEach } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import {createTestWebLocks} from './helpers/webLocks';
import {installTestBrowserSnapshotStore} from './helpers/browserSnapshotStore';
import {useLocaleStore} from '../src/stores/useLocaleStore';

// bun test 默认无 DOM；文本节点工具与组件指纹均依赖 DOMParser
GlobalRegistrator.register();
Object.defineProperty(navigator,'locks',{configurable:true,value:createTestWebLocks()});
installTestBrowserSnapshotStore();
// Host chrome assertions still use zh-CN copy; English locale is covered by dedicated i18n tests.
function resetTestLocale() {
  try { localStorage.setItem('tau.locale', 'zh-CN'); } catch { /* ignore */ }
  useLocaleStore.setState({ locale: 'zh-CN' });
  document.documentElement.lang = 'zh-CN';
}
resetTestLocale();
beforeEach(resetTestLocale);
