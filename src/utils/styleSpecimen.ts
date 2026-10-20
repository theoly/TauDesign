import { extractClassWhitelist } from './cssCompiler';
import { getBaseCss, type DeviceProfile } from '../styles/baseCss';

/**
 * 风格样张页 (Style Specimen) —— 新建工程的首个画框。
 *
 * 取代此前信息量为零的空白欢迎页 (doc/aesthetic/spec.md §6.6)。三重作用：
 *   1. 让用户第一眼看到所选风格的真实样貌；
 *   2. 为「风格候选并排」提供确定性的渲染载体（同一 HTML × 不同 Token）；
 *   3. **覆盖类名白名单全集**，任何类名空转都会在页面上肉眼可见——
 *      这使 A0 的验收从"逐条核对 51 个类"退化为"打开样张页看一眼"(§6.6.5)。
 *
 * 纯静态模板，不调用大模型：确定性、零成本、零等待，且随 Token 即时换肤。
 */

const SPACING_STEPS = ['0', '1', '2', '3', '4', '5', '6', '8'];
const TEXT_SIZES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];
const WEIGHTS: Array<[string, string]> = [
  ['font-normal', '常规 400'],
  ['font-medium', '中等 500'],
  ['font-semibold', '半粗 600'],
  ['font-bold', '加粗 700']
];
const RADII = ['r-none', 'r-sm', 'r-md', 'r-lg', 'r-xl', 'r-full'];
const SHADOWS = ['shadow-none', 'shadow-sm', 'shadow-md', 'shadow-lg'];

const icon = (path: string) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

const ICONS = {
  sparkles: icon('<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>'),
  user: icon('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  search: icon('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
  check: icon('<path d="M20 6 9 17l-5-5"/>'),
  alert: icon('<path d="M12 9v4"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="10"/>'),
  trend: icon('<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>'),
  mail: icon('<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 5L2 7"/>'),
  settings: icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>')
};

const section = (title: string, hint: string, body: string) => `
  <section class="card p-6 mb-6 col gap-4">
    <div class="col gap-1">
      <h2 class="text-lg font-semibold">${title}</h2>
      <p class="text-xs text-muted">${hint}</p>
    </div>
    <div class="divider"></div>
    ${body}
  </section>`;

const swatch = (cls: string, label: string) => `
      <div class="col gap-2 items-center">
        <div class="${cls} border r-md" style="width: 100%; height: 44px;"></div>
        <span class="text-xs text-muted">${label}</span>
      </div>`;

/** 生成风格样张页 HTML。覆盖该设备档位基座样式表中的全部类名。 */
export function buildStyleSpecimenHtml(device: DeviceProfile = 'pc'): string {
  const colorSwatches = [
    ['bg-primary', 'primary'],
    ['bg-primary-light', 'primary-light'],
    ['bg-accent', 'accent'],
    ['bg-accent-light', 'accent-light'],
    ['bg-surface', 'surface'],
    ['bg-surface-alt', 'surface-alt'],
    ['bg-success-light', 'success'],
    ['bg-warning-light', 'warning'],
    ['bg-danger-light', 'danger']
  ].map(([c, l]) => swatch(c, l)).join('');

  const textScale = TEXT_SIZES.map(
    (t) => `
      <div class="row items-baseline justify-between gap-4 py-2 border-b">
        <span class="text-${t}">设计系统 Design System</span>
        <span class="text-xs text-muted nowrap">text-${t}</span>
      </div>`
  ).join('');

  const weights = WEIGHTS.map(
    ([c, l]) => `
      <div class="row items-center justify-between py-2">
        <span class="text-md ${c}">字重示例 Weight</span>
        <span class="text-xs text-muted">${l}</span>
      </div>`
  ).join('');

  const textColors = ['text-primary', 'text-secondary', 'text-muted', 'text-success', 'text-warning', 'text-danger']
    .map((c) => `<span class="text-sm ${c} px-3 py-1 bg-surface-alt r-sm">${c}</span>`)
    .join('');

  const radii = RADII.map(
    (r) => `
      <div class="col gap-2 items-center">
        <div class="bg-primary-light border ${r}" style="width: 100%; height: 56px;"></div>
        <span class="text-xs text-muted">${r}</span>
      </div>`
  ).join('');

  const shadows = SHADOWS.map(
    (sh) => `
      <div class="col gap-2 items-center">
        <div class="bg-surface r-lg ${sh}" style="width: 100%; height: 56px;"></div>
        <span class="text-xs text-muted">${sh}</span>
      </div>`
  ).join('');

  const spacingRuler = SPACING_STEPS.map(
    (n) => `
      <div class="row items-center gap-3">
        <span class="text-xs text-muted" style="width: 28px;">${n}</span>
        <div class="bg-primary r-sm p-${n}"><div class="bg-surface r-none" style="width:4px;height:4px;"></div></div>
        <span class="text-xs text-muted">p-${n} / gap-${n} / m-${n}</span>
      </div>`
  ).join('');

  const gapDemo = SPACING_STEPS.map((n) => `<div class="row gap-${n} mb-1"><div class="bg-accent-light px-2 py-1 text-xs r-sm">A</div><div class="bg-accent-light px-2 py-1 text-xs r-sm">B</div></div>`).join('');

  const marginDemo = SPACING_STEPS
    .map((n) => `<span class="badge bg-surface-alt text-secondary mt-${n} mb-${n} px-${n} py-${n}">${n}</span>`)
    .join('');

  const marginAllDemo = SPACING_STEPS
    .map((n) => `<span class="tag m-${n}">m-${n}</span>`)
    .join('');

  const grids = [1, 2, 3, 4, 5, 6]
    .map(
      (n) => `
      <div class="col gap-2">
        <span class="text-xs text-muted">grid-${n}</span>
        <div class="grid-${n} gap-2">${Array.from({ length: n }, () => '<div class="bg-surface-alt border r-sm py-3 text-center text-xs text-muted">列</div>').join('')}</div>
      </div>`
    )
    .join('');

  const alignments = `
      <div class="col gap-3">
        <div class="row justify-start gap-2 bg-surface-alt p-2 r-sm"><span class="badge bg-primary-light text-primary">justify-start</span></div>
        <div class="row justify-center gap-2 bg-surface-alt p-2 r-sm"><span class="badge bg-primary-light text-primary">justify-center</span></div>
        <div class="row justify-end gap-2 bg-surface-alt p-2 r-sm"><span class="badge bg-primary-light text-primary">justify-end</span></div>
        <div class="row justify-between gap-2 bg-surface-alt p-2 r-sm"><span class="badge bg-primary-light text-primary">justify-between</span><span class="text-xs text-muted">右</span></div>
        <div class="row justify-around gap-2 bg-surface-alt p-2 r-sm"><span class="badge bg-primary-light text-primary">justify-around</span><span class="text-xs text-muted">右</span></div>
        <div class="row items-stretch gap-2 bg-surface-alt p-2 r-sm" style="height:48px;"><div class="bg-surface border r-sm px-3 text-xs col justify-center">items-stretch</div><div class="bg-surface border r-sm px-3 text-xs col justify-center">items-end 见下</div></div>
        <div class="row items-end gap-2 bg-surface-alt p-2 r-sm" style="height:48px;"><span class="text-xs text-muted">items-end</span></div>
        <div class="row items-start gap-2 bg-surface-alt p-2 r-sm" style="height:48px;"><span class="text-xs text-muted">items-start</span></div>
        <div class="row wrap gap-2">${Array.from({ length: 8 }, (_, i) => `<span class="tag">标签 ${i + 1}</span>`).join('')}</div>
        <div class="row gap-2"><div class="flex-1 bg-surface-alt p-2 r-sm text-xs text-center">flex-1</div><div class="flex-none bg-surface-alt p-2 r-sm text-xs">flex-none</div><div class="flex-auto bg-surface-alt p-2 r-sm text-xs text-center">flex-auto</div></div>
        <div class="row gap-4"><span class="text-left flex-1 text-xs text-muted">text-left</span><span class="text-center flex-1 text-xs text-muted">text-center</span><span class="text-right flex-1 text-xs text-muted">text-right</span></div>
      </div>`;

  const buttons = `
      <div class="row wrap gap-3 items-center">
        <button class="btn btn-primary">${ICONS.sparkles}<span>主要操作</span></button>
        <button class="btn btn-ghost">${ICONS.settings}<span>次要操作</span></button>
        <button class="btn btn-primary btn-sm">小号 sm</button>
        <button class="btn btn-primary btn-lg">大号 lg</button>
        <button class="btn btn-ghost cursor-pointer">${ICONS.search}</button>
      </div>`;

  const forms = `
      <div class="col gap-3">
        <div class="col gap-1">
          <label class="text-xs text-secondary font-medium">邮箱地址</label>
          <input class="input" value="zhang.wei@example.com" />
        </div>
        <div class="col gap-1">
          <label class="text-xs text-secondary font-medium">所属团队</label>
          <select class="select"><option>设计中心</option><option>研发中心</option></select>
        </div>
        <div class="row items-center gap-2">
          <span class="text-xs text-muted leading-relaxed">已阅读并同意</span>
          <span class="text-xs text-primary">《服务协议》</span>
        </div>
      </div>`;

  const badges = `
      <div class="row wrap gap-2 items-center">
        <span class="badge bg-success-light text-success">已通过</span>
        <span class="badge bg-warning-light text-warning">待审核</span>
        <span class="badge bg-danger-light text-danger">已驳回</span>
        <span class="badge bg-primary-light text-primary">进行中</span>
        <span class="tag">tag 标签</span>
        <span class="badge bg-primary text-inverse">text-inverse</span>
      </div>`;

  const avatars = `
      <div class="row items-center gap-3">
        <div class="avatar bg-primary-light text-primary">张</div>
        <div class="avatar bg-accent-light text-primary">李</div>
        <div class="avatar bg-surface-alt text-secondary">${ICONS.user}</div>
        <div class="col gap-0">
          <span class="text-sm font-semibold">张伟</span>
          <span class="text-xs text-muted">产品设计师 · 138 0013 8000</span>
        </div>
      </div>`;

  const contentLayout = `
      <div class="col gap-4 min-w-0">
        <div class="row wrap items-center gap-3">
          <div class="row items-center gap-2">
            <span class="avatar bg-primary-light text-primary">王</span>
            <div class="col gap-1"><span class="text-nowrap font-semibold">王先生</span><span class="text-xs text-muted">医生</span></div>
          </div>
          <div class="row items-center gap-2">
            <span class="avatar bg-accent-light text-primary">李</span>
            <div class="col gap-1"><span class="text-nowrap font-semibold">李女士</span><span class="text-xs text-muted">高校教师</span></div>
          </div>
        </div>
        <div class="row wrap gap-2">
          <span class="badge bg-primary-light">第 2 次 / 合同 3 次</span>
          <span class="badge-soft">有效约见待核销</span>
          <span class="tag bg-surface-alt">提醒待解冻</span>
        </div>
        <div class="row items-start gap-2">
          <span class="icon-box bg-primary-light r-full">${ICONS.mail}</span>
          <p class="flex-1 min-w-0 break-words text-sm">地址与长链接自然换行：https://example.com/appointments/202610191234567890</p>
        </div>
      </div>`;

  const metrics = `
      <div class="grid-3 gap-4">
        ${[
          ['本月新增', '2,847', '+12.5%', 'text-success', ICONS.trend],
          ['待处理', '126', '需关注', 'text-warning', ICONS.alert],
          ['已完成', '9,431', '+3.2%', 'text-success', ICONS.check]
        ]
          .map(
            ([label, value, delta, tone, ic]) => `
        <div class="panel p-4 col gap-2">
          <div class="row items-center justify-between">
            <span class="text-xs text-muted">${label}</span>
            <span class="${tone}">${ic}</span>
          </div>
          <span class="text-2xl font-bold">${value}</span>
          <span class="text-xs ${tone}">${delta}</span>
        </div>`
          )
          .join('')}
      </div>`;

  const listAndBorders = `
      <div class="col">
        <div class="row items-center justify-between py-3 border-b">
          <div class="row items-center gap-3">${ICONS.mail}<span class="text-sm">列表项 · border-b</span></div>
          <span class="text-xs text-muted">刚刚</span>
        </div>
        <div class="row items-center justify-between py-3 border-b">
          <div class="row items-center gap-3">${ICONS.user}<span class="text-sm">列表项 · 第二行</span></div>
          <span class="text-xs text-muted">2 小时前</span>
        </div>
        <div class="row items-center justify-between py-3 border-t mt-2">
          <span class="text-xs text-muted">border-t</span>
          <span class="text-xs text-muted">border-l / border-r ↓</span>
        </div>
        <div class="row gap-3 mt-3">
          <div class="border-l px-3 py-2 text-xs text-muted">border-l</div>
          <div class="border-r px-3 py-2 text-xs text-muted">border-r</div>
          <div class="border px-3 py-2 text-xs text-muted r-sm overflow-hidden">border + overflow-hidden</div>
        </div>
      </div>`;

  const misc = `
      <div class="col gap-3">
        <div class="bg-surface-alt r-md p-3 sticky-top text-xs text-muted">sticky-top · 滚动时吸顶</div>
        <div class="r-md overflow-hidden border" style="height: 88px;">
          <img class="full-img" alt="示例图" src="data:image/svg+xml;utf8,${encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120"><rect width="400" height="120" fill="#e2e8f0"/><text x="200" y="66" font-size="14" fill="#64748b" text-anchor="middle" font-family="sans-serif">full-img 占位图</text></svg>'
          )}" />
        </div>
        <p class="text-sm text-secondary leading-relaxed m-0">leading-relaxed：这段文字用于演示放松的行高，在长段落中提供更舒展的阅读节奏。</p>
      </div>`;

  const texture = `
      <div class="col gap-4">
        <div class="grid-3 gap-3">
          ${[['shadow-soft', '弥散柔光'], ['shadow-card', '卡片微阴影'], ['shadow-glow', '主色光晕']]
            .map(([c, l]) => `<div class="col gap-2 items-center"><div class="bg-surface r-lg ${c}" style="width:100%;height:56px;"></div><span class="text-xs text-muted">${l}</span></div>`)
            .join('')}
        </div>
        <div class="row wrap gap-3 items-center">
          <span class="badge-soft">badge-soft</span>
          <button class="btn btn-ghost notification-control" aria-label="通知，3条未读">${ICONS.mail}<span class="badge-count text-primary" aria-hidden="true">3</span></button>
          <button class="btn btn-ghost notification-control" aria-label="有新更新">${ICONS.mail}<span class="badge-dot" aria-hidden="true"></span></button>
          <span class="badge-count">12</span><span class="badge-count text-danger">2</span>
          <span class="badge-soft text-success">${ICONS.check}已完成</span>
          <span class="badge-soft text-warning">${ICONS.alert}待处理</span>
        </div>
        <div class="input-group">
          ${ICONS.search}
          <input class="input" value="搜索项目、页面或组件" />
          <button class="btn btn-primary btn-sm nowrap">搜索</button>
        </div>
        <div class="divider-text">或使用以下方式继续</div>
        <div class="row items-center justify-between gap-4">
          <div class="avatar-group">
            <div class="avatar bg-primary-light text-primary">张</div>
            <div class="avatar bg-accent-light text-primary">李</div>
            <div class="avatar bg-surface-alt text-secondary">王</div>
          </div>
          <div class="col gap-2 flex-1">
            <div class="skeleton" style="height:10px;width:70%;"></div>
            <div class="skeleton" style="height:10px;width:45%;"></div>
          </div>
        </div>
        <div class="glass p-4 r-lg text-sm text-secondary">glass · 毛玻璃表面</div>
        <div class="surface-subtle p-4 r-lg text-sm text-secondary">surface-subtle · 微质感表面</div>
        <div class="border-subtle p-4 r-lg text-sm text-secondary">border-subtle · 半透明微边框（随 borderAlpha 变化）</div>
        <div class="grid-3 gap-3">
          <div class="bg-gradient-soft p-3 r-md text-xs text-muted text-center">bg-gradient-soft</div>
          <div class="bg-ambient-warm p-3 r-md text-xs text-muted text-center">bg-ambient-warm</div>
          <div class="bg-ambient-cool p-3 r-md text-xs text-muted text-center">bg-ambient-cool</div>
        </div>
        <div class="sheet-card p-4 col gap-2">
          <div class="row items-center justify-between text-xs">
            <span>sheet-card 底部面板</span>
            <div class="row items-center">
              <span>前缀</span>
              <span class="divider-v"></span>
              <span>后缀</span>
            </div>
          </div>
        </div>
      </div>`;

  const deviceBlock =
    device === 'pc'
      ? `
      <div class="col gap-4">
        <div class="container-max panel p-4 text-center text-xs text-muted">container-max · 内容最大宽度容器，严禁在 1440px 下横向拉通</div>
        <div class="card card-hover p-4">
          <span class="text-sm font-medium">card-hover · 悬浮微上浮</span>
          <p class="text-xs text-muted mt-2 m-0">移动端无 hover，故该类仅存在于 PC 档位。</p>
        </div>
        <div class="col">
          <div class="row-hover row items-center justify-between px-4 py-3 border-b"><span class="text-sm">row-hover · 表格行悬浮</span><span class="text-xs text-muted">2026-09-16</span></div>
          <div class="row-hover row items-center justify-between px-4 py-3 border-b"><span class="text-sm">row-hover · 第二行</span><span class="text-xs text-muted">2026-09-15</span></div>
        </div>
        <span class="link-hover text-sm">link-hover · 悬浮下划线</span>
      </div>`
      : `
      <div class="col gap-4">
        <div class="border r-lg overflow-hidden col">
          <div class="status-bar"><span>9:41</span><span class="status-bar-icons"><svg viewBox="0 0 24 24" fill="currentColor" aria-label="信号"><path d="M3 19h3v-4H3zm5 0h3v-7H8zm5 0h3V9h-3zm5 0h3V5h-3z"/></svg><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="Wi-Fi"><path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M9 16a5 5 0 0 1 6 0"/></svg><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="电量"><rect x="2" y="6" width="18" height="12" rx="2"/><path d="M22 10v4"/><rect x="5" y="9" width="12" height="6" fill="currentColor" stroke="none"/></svg></span></div>
          <div class="appbar"><span class="tap-target">${ICONS.user}</span><span class="appbar-title">页面标题</span><span class="appbar-capsule" aria-label="小程序胶囊"><span class="appbar-capsule-more">···</span><span class="appbar-capsule-home"></span></span></div>
          <div class="list-item"><span class="text-sm flex-1">list-item · 最小高度 56px</span><span class="text-xs text-muted">详情</span></div>
          <div class="list-item"><span class="text-sm flex-1">list-item · 第二行</span><span class="text-xs text-muted">详情</span></div>
        </div>
        <div class="col gap-2">
          <span class="text-xs text-muted">input-touch · 48px 触控高度</span>
          <input class="input input-touch" value="手机号 / 邮箱" />
        </div>
        <div class="col gap-2">
          <span class="text-xs text-muted">scroll-x · 横滑替代多列栅格</span>
          <div class="scroll-x">${Array.from({ length: 5 }, (_, i) => `<div class="panel p-4 text-xs text-secondary" style="width:140px;">卡片 ${i + 1}</div>`).join('')}</div>
        </div>
        <div class="border r-lg overflow-hidden">
          <div class="cta-fixed"><button class="btn btn-ghost">取消</button><button class="btn btn-primary">立即开通</button></div>
        </div>
        <div class="border r-lg overflow-hidden">
          <div class="tabbar">
            ${[['首页', ICONS.sparkles, true], ['消息', ICONS.mail, false], ['我的', ICONS.user, false]]
              .map(([l, ic, act]) => `<div class="tabbar-item${act ? ' is-active' : ''}">${ic}<span>${l}</span></div>`)
              .join('')}
          </div>
        </div>
        <div class="safe-top safe-bottom bg-surface-alt r-md text-xs text-muted text-center">safe-top / safe-bottom · 安全区预留</div>
      </div>`;

  return `<main class="p-8 col gap-0">
  <header class="col gap-2 mb-6">
    <div class="row items-center gap-3">
      <div class="avatar bg-primary-light text-primary">${ICONS.sparkles}</div>
      <div class="col gap-0">
        <h1 class="text-3xl font-bold">风格样张</h1>
        <p class="text-sm text-muted">当前设计系统的完整外观与常用组件</p>
      </div>
    </div>
    <div class="panel p-4 row items-center justify-between gap-4 mt-2">
      <div class="row items-center gap-3 flex-1">
        <span class="text-primary">${ICONS.sparkles}</span>
        <span class="text-sm text-secondary">在左侧对话面板描述你的需求，即可生成第一个页面。本页可随时删除。</span>
      </div>
      <button class="btn btn-ghost btn-sm nowrap">知道了</button>
    </div>
  </header>

  ${section('色板 Palette', '主色、强调色、表面层级与语义色', `<div class="grid-5 gap-3">${colorSwatches}</div>`)}
  ${section('字阶 Type Scale', 'text-xs 至 text-4xl 全档', `<div class="col gap-0">${textScale}</div>`)}
  ${section('字重与文本色', 'font-* 四档与语义文本色', `<div class="col gap-2">${weights}<div class="row wrap gap-2 mt-3">${textColors}</div></div>`)}
  ${section('圆角 Radius', 'r-none 至 r-full', `<div class="grid-6 gap-3">${radii}</div>`)}
  ${section('阴影 Shadow', '层级与悬浮感', `<div class="grid-4 gap-3">${shadows}</div>`)}
  ${section('间距标尺 Spacing', '4px 基准阶梯，p / px / py / m / mt / mb / gap 同刻度', `<div class="col gap-3">${spacingRuler}<div class="divider"></div><div class="col gap-0">${gapDemo}</div><div class="row wrap gap-1 mt-3">${marginDemo}</div><div class="row wrap mt-3 bg-surface-alt r-sm">${marginAllDemo}</div></div>`)}
  ${section('栅格 Grid', 'grid-1 至 grid-6', `<div class="col gap-4">${grids}</div>`)}
  ${section('布局与对齐 Flex', 'justify / items / flex / text-align / wrap', alignments)}
  ${section('按钮 Button', '主次、尺寸与图标组合', buttons)}
  ${section('表单 Form', '输入框、下拉与辅助说明', forms)}
  ${section('标识 Badge & Tag', '状态标识与标签', badges)}
  ${section('头像 Avatar', '用户标识与信息组合', avatars)}
  ${section('内容布局契约', '姓名单行、标签整体换行、图标居中、长文本可收缩', contentLayout)}
  ${section('数据卡片 Metrics', '指标卡与趋势标识', metrics)}
  ${section('列表与边框 Borders', 'border 全方向', listAndBorders)}
  ${section('微质感 Micro-texture', '复合阴影、毛玻璃、输入组、软标识与骨架屏', texture)}
  ${section(device === 'pc' ? 'PC 专属' : '移动端专属', device === 'pc' ? '内容最大宽度与悬浮态' : '安全区、标题栏、标签导航与吸底 CTA', deviceBlock)}
  ${section('其他工具类', 'sticky-top / full-img / overflow-hidden / leading-relaxed', misc)}
</main>`;
}

/** 校验样张页对白名单的覆盖率 —— A0 的自动化门禁 (T-AE-05) */
export function specimenCoverage(device: DeviceProfile = 'pc'): { total: number; covered: number; missing: string[] } {
  const html = buildStyleSpecimenHtml(device);
  const used = new Set<string>();
  for (const m of html.matchAll(/\bclass="([^"]*)"/g)) {
    for (const c of m[1].split(/\s+/).filter(Boolean)) used.add(c);
  }
  const whitelist = extractClassWhitelist(getBaseCss(device));
  const missing = whitelist.filter((c) => !used.has(c));
  return { total: whitelist.length, covered: whitelist.length - missing.length, missing };
}
