import type { DesignSystemTokens } from '../types/designSystem';
import { compileTokensToCss } from './cssCompiler';
import { getBaseCss, type DeviceProfile } from '../styles/baseCss';

/** 静态组件夹具，完全复用画框 CSS；无模型内容或可执行脚本。 */
export function buildThemePreview(tokens: DesignSystemTokens, mode: 'light' | 'dark', device: DeviceProfile): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'"><style>${getBaseCss(device)}\n${compileTokensToCss(tokens, mode, device)}</style></head>
<body class="p-4"><main class="col gap-4">
<section class="card p-4 col gap-3"><h2 class="text-lg font-semibold">真实基座组件</h2><p class="text-secondary">正文、品牌文字与按钮文字分别使用对应角色。</p>
<div class="row wrap gap-2"><button class="btn btn-primary"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 4v16M4 12h16"/></svg><span>主要操作</span></button><button class="btn btn-secondary">次要操作</button><button class="btn btn-outline">描边操作</button><button class="btn btn-text">文字操作</button><button class="btn btn-danger">危险操作</button><button class="btn btn-primary" disabled>不可用</button></div>
<div class="row wrap gap-2"><button class="btn btn-primary" style="background:var(--color-primary-hover)">悬停样本</button><button class="btn btn-primary" style="background:var(--color-primary-active)">按下样本</button><button class="btn btn-primary" style="outline:var(--space-1) solid var(--color-focus-ring);outline-offset:var(--space-1)">焦点样本</button></div>
<p class="text-muted">Tab 可查看实际焦点；${device === 'pc' ? '鼠标可查看悬停' : '移动端仅展示状态样本，不注入悬停规则'}。</p>
<label class="col gap-2">姓名<input class="input" placeholder="请输入姓名" /></label><input class="input" disabled placeholder="禁用输入框" />
<div class="row wrap gap-2"><span class="badge bg-success-light">✓ 已完成</span><span class="badge bg-warning-light">! 待确认</span><span class="badge bg-danger-light">! 验证失败</span><span class="badge bg-info-light">i 新消息</span><span class="badge is-selected">✓ 已选中</span></div>
</section><section class="panel col gap-2"><h3 class="font-semibold">卡片内分组</h3><p class="text-muted">嵌套背景与辅助文字</p></section><section class="bg-overlay border r-md p-3">浮层表面</section><section class="bg-inverse r-md p-3">反色内容：操作已保存</section>
</main></body></html>`;
}
