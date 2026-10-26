import { invoke } from '@tauri-apps/api/core';
import { isDesktopRuntime } from './folderPicker';

/** Open an existing project directory in the system file manager; never use a file:// URL. */
export async function openProjectDirectory(folderPath: string): Promise<void> {
  if (!folderPath.trim()) throw new Error('当前工程尚未关联本地目录。');
  if (!isDesktopRuntime()) throw new Error('请在桌面端打开工程目录。');
  await invoke('project_open_directory', { root: folderPath });
}
