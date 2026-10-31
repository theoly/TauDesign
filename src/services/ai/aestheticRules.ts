import { mobileNavigationPrompt, normalizeMobileNavigation } from '../../utils/mobileNavigation';
import { colorUsageRules } from '../../utils/semanticColors';
import type { DeviceProfile } from '../../styles/baseCss';

/**
 * 美学规则的设备分档注入 (A1 / T-AE-08, T-AE-09)。
 *
 * deviceProfile 此前只影响 Prompt 中的一行 `Width: 390px (MOBILE)`，
 * 而全部审美数值都是 PC 口径——直接施加到 390px 画框会系统性出错：
 * 区块间距 32~48px 过度撑开、grid-3 挤成不可读、hover 在触屏上永不触发、
 * 输入框 40px 低于触控最小尺寸。
 *
 * 参见 doc/aesthetic/spec.md 第四章 PC / Mobile 设备美学对照。
 */

/** 与设备无关的黄金视觉层级准则 (spec §1.1) */
export const GOLDEN_HIERARCHY = `VISUAL HIERARCHY (MANDATORY — these rules are what separate a polished UI from a rough prototype):
- 配色可见性与美观度：文字、图标和关键控件必须与实际背景清晰区分，严禁同色或近似色导致内容难以辨认。更换背景时同步检查并调整前景色；图片、渐变、半透明背景按叠加效果判断，必要时使用 Token 底色或遮罩。浅色/深色模式均须清晰可辨，并保持品牌色协调、语义一致和主次层级，不为柔和、低饱和或装饰效果牺牲可见性。
- COLOR ROLES: 背景 bg，卡片 surface，分组 surface-alt；品牌强调约5–10%，集中于主操作/选中。普通指标/图标用中性色，语义色仅表示状态。主色文字用 .text-primary，主按钮用 .btn-primary；勿写死白字、蓝链接或整段彩色正文。
- ${colorUsageRules()}
- TYPOGRAPHY LADDER: 标题/正文/辅助三层，具体字号遵守设备档位与排版工艺。
- SPACING RHYTHM: 组内.gap-1/.gap-2，卡片与章节间距按设备档位；组间大于组内。
- ICONS: 按钮、输入框、指标卡与列表行须有 Lucide/Heroicons 风格内联SVG图标，class="icon"、stroke="currentColor"；无图标页面不合格。
- REALISTIC CONTENT: 使用真实感中文姓名、电话、日期、金额和状态徽标；禁用“占位文字”/“Lorem ipsum”/“标题1”。
- 按钮文字默认不换行：.btn 已设 white-space: nowrap；不插入<br>。优先留足宽度或让按钮组整体换行，不改写、截断指定文案；仅用户明确要求时用 white-space: normal 覆盖并调高按钮。
- COMPONENT LAYOUT CONTRACT: .nowrap管flex换行，文字用.text-nowrap。标签.row.wrap.gap-2，不设.flex-1，空间不足整项换行。姓名单行、职业位于姓名下方，人物组可换行；润色不新增或移动节点。头像.avatar、装饰.icon-box，.icon的viewBox留白对称。长文本.flex-1.min-w-0，地址/URL按需.break-words。禁缩裁文案或位移补偿居中。长正文卡.col.gap-2，正文独占宽度自然撑高，操作不足换行。
- STATUS & FEEDBACK: 状态用.badge-soft + 语义色；通知角标遵循组件契约，右上附着不遮图标或内容。`;

/** Only new pages should proactively diversify repeated controls' business states. */
export const NEW_SCREEN_STATE_RULES = `新页面同组控件多状态：尽量利用现有实例展示代表性不同状态，如输入框空值/已填/错误/禁用、选项未选/选中、按钮可用/加载/禁用。不额外堆砌控件；状态须与业务一致，互斥组最多一个选中；遵守用户指定状态和参考图，移动端不依赖hover。`;

const PC_RULES = `DEVICE RULES — PC (1440px):
- CONTENT WIDTH: Use .container-max (max 1200px, centered); NEVER stretch page content across 1440px.
- Sections: .mt-8 / .mb-8; page: .p-6 / .p-8.
- Cards: .p-5 / .p-6. Body: .text-sm (14px).
- Inputs: 40~44px.
- Grids: .grid-2 / .grid-3 / .grid-4 are all appropriate for dense information.
- HOVER: .card-hover for clickable cards, .row-hover for table rows, .link-hover for inline links.
- Navigation: top bar and/or left sidebar.
- SEMANTIC REGIONS: Decouple <aside class="sidebar">, .toolbar / .filter-bar, and <table>. Never emit white-on-white text.`;

const MOBILE_RULES = `DEVICE RULES — MOBILE (390px):
- SINGLE COLUMN ONLY for main content. No wide tables or desktop grids. Compact cards/actions/metrics may use .grid-2, .grid-3 or .row.gap-2 with .flex-1 if content fits; short labels follow COMPONENT LAYOUT CONTRACT. Long horizontal card lists use .scroll-x.
- .list-item仅用于横向紧凑列表，长正文卡片不用它；顶部.row.wrap.gap-2，操作组.flex-auto.min-w-0.wrap.justify-end，空间不足整组换行、组内按钮逐项换行。旧页仅改对应class，保留DOM/文案。
- NO HOVER STATES. Touch screens never fire hover, and no hover utility exists in this profile's whitelist. Never write a :hover rule or reference a hover class. Express affordance through spacing, dividers, borders and .badge-soft instead.
- Page section spacing: .mt-4 / .mt-6 (NOT .mt-8); page padding .p-4 / .px-4 (NOT .p-8).
- Card padding: .p-3 / .p-4. Body text: .text-md (16px) — 14px is too small on a phone.
- TOUCH TARGETS: inputs use .input .input-touch (48px). Any icon-only button must carry .tap-target (44x44 minimum).
- SAFE AREAS: use .safe-bottom for the home indicator. System status and default WeChat navigation belong to the runtime shell, never reserve their top height in business HTML.
- STRUCTURE & APPBAR (STRICT LAYOUT CONTRACT):
  * BODY CONTAINMENT & NO OVERLAP: business content starts at its own origin; the renderer reserves system chrome. Never use negative margins or fixed top offsets to slide content under that chrome.
  * FULL-BLEED HERO BANNERS & GRADIENTS: When a screen features an immersive brand/gradient header (e.g. certification/profile/store banner), let the hero block span the full width without horizontal margins and without bottom rounded corners (0 bottom radius). List cards beneath it sit on the canvas with standard spacing or gentle overlap.
  * Bottom navigation uses .tabbar with .tabbar-item (mark active as .is-active).
  * CTA BUTTON PLACEMENT: In card forms or bottom sheet dialogs, form submit buttons belong inline within the card flow (e.g. under inputs, above social proof). Use .cta-fixed when a sticky full-screen bottom bar is explicitly requested or appropriate. When reproducing a design reference, ALWAYS match the button placement in the reference!
  * RIBBON BADGES & STATUS STRIPS: Card corner labels need their own reserved area; never cover the title, image subject or body content. Notification badges use .notification-control with a reserved top band and an absolute top-right badge; center the icon horizontally, never overlap it or use side-by-side columns. Use .badge-dot for a subtle update and .badge-count for small counts, reserving danger color for urgent issues. Notice bars use subtle background tint (.bg-warning-light or .bg-surface-alt) with semantic icons.
  * SEMANTIC REGION DECOUPLING: Keep business Hero (.hero-section), headings, search and actions independent from optional custom navigation. Never fuse system status with a business header. Never emit invisible white-on-white text when changing backgrounds!`;

export function getDeviceAestheticRules(device: DeviceProfile, useCustomNavigation = false): string {
  return device === 'pc' ? PC_RULES : `${MOBILE_RULES}\n${mobileNavigationPrompt({ deviceProfile: device, useCustomNavigation })}`;
}

/**
 * Few-Shot 范例按设备分档且条件注入 (T-AE-10)。
 *
 * buildSystemPrompt 的产物是每次请求全量常驻的 system prompt，塞入范例约
 * 增加 1.5k~3k token/次，因此只在「新建画框」时注入，且两档位互斥——
 * 给移动端喂 PC 范例是当前生成结果"PC 味很重"的直接来源。
 */
const PC_EXAMPLE = `<main class="p-8">
  <div class="container-max col gap-6">
    <div class="row items-center justify-between">
      <div class="col gap-1">
        <h1 class="text-2xl font-bold">运营概览</h1>
        <p class="text-sm text-muted">数据更新于 2026-09-16 09:30</p>
      </div>
      <button class="btn btn-primary"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg><span>新建任务</span></button>
    </div>
    <div class="grid-3 gap-4">
      <div class="card card-hover p-5 col gap-2">
        <div class="row items-center justify-between">
          <span class="text-xs text-muted">本月新增用户</span>
          <span class="text-success"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/></svg></span>
        </div>
        <span class="text-3xl font-bold">2,847</span>
        <span class="badge-soft text-success">较上月 +12.5%</span>
      </div>
    </div>
  </div>
</main>`;

const MOBILE_EXAMPLE = `<main class="col bg-surface-alt" style="min-height:100%;">
  <div class="status-bar"><span>9:41</span><span class="status-bar-icons"><svg viewBox="0 0 24 24" fill="currentColor" aria-label="信号"><path d="M3 19h3v-4H3zm5 0h3v-7H8zm5 0h3V9h-3zm5 0h3V5h-3z"/></svg><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="Wi-Fi"><path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="电量"><rect x="2" y="6" width="18" height="12" rx="2"/><path d="M22 10v4"/><rect x="5" y="9" width="12" height="6" fill="currentColor" stroke="none"/></svg></span></div>
  <div class="appbar">
    <span class="tap-target"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></span>
    <span class="appbar-title">账户登录</span>
    <span class="appbar-capsule" aria-label="小程序胶囊"><span class="appbar-capsule-more">···</span><span class="appbar-capsule-home"></span></span>
  </div>
  <div class="col gap-6 p-4 flex-1">
    <div class="col gap-2 mt-6">
      <h1 class="text-2xl font-bold">欢迎回来</h1>
      <p class="text-sm text-muted">登录后同步你的全部项目</p>
    </div>
    <div class="col gap-4">
      <div class="input-group">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
        <input class="input input-touch" value="138 0013 8000" />
      </div>
      <div class="input-group">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <input class="input input-touch" value="请输入验证码" />
        <button class="btn btn-ghost btn-sm nowrap">获取验证码</button>
      </div>
    </div>
    <div class="divider-text">或使用以下方式登录</div>
    <div class="row gap-3 justify-center">
      <span class="tap-target card p-3"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg></span>
    </div>
  </div>
  <div class="cta-fixed"><button class="btn btn-primary">登录</button></div>
</main>`;

export function getFewShotExample(device: DeviceProfile, useCustomNavigation = false): string {
  return device === 'pc' ? PC_EXAMPLE : normalizeMobileNavigation(MOBILE_EXAMPLE, { deviceProfile: device, useCustomNavigation }).html;
}
