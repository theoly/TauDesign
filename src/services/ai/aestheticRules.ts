import { mobileNavigationPrompt, normalizeMobileNavigation } from '../../utils/mobileNavigation';
import { colorUsageRules } from '../../utils/semanticColors';
import type { DeviceProfile } from '../../styles/baseCss';
import {FORM_PRESENTATION_RULES} from './formPresentationRules';

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

/** 与设备无关的黄金视觉层级准则 (spec §1.1)；E5 压缩以保住 create ≤12k。 */
export const GOLDEN_HIERARCHY = `VISUAL HIERARCHY (MANDATORY):
- 配色可见性与美观度：文字、图标和关键控件必须与实际背景清晰区分，严禁同色或近似色导致内容难以辨认。更换背景时同步检查并调整前景色；图片、渐变、半透明背景按叠加效果判断，必要时用Token底色或遮罩。浅/深模式均保持品牌色协调、语义一致和主次层级，不为柔和、低饱和或装饰效果牺牲可见性。
- COLOR ROLES: bg/surface/surface-alt；品牌5–10%主操作；.text-primary主色字，.btn-primary主按钮；勿写死白字、蓝链接或整段彩色正文。
- ${colorUsageRules()}
- TYPE/SPACE: 标题/正文/辅助；组内.gap-1/.gap-2，组间更大。ICONS: Lucide/Heroicons风格图标仅引用已登记外部文件，.icon/.icon-mask继承currentColor；禁止内联SVG、猜路径或符号占位。没有已登记资源时保留完整文字控件，不删功能；禁无名图标按钮。
- CONTENT: 真实感中文数据；禁占位/Lorem/“标题1”。按钮文字默认不换行：.btn 已设 white-space: nowrap；不插入<br>。优先留足宽度或让按钮组整体换行，不改写、截断指定文案；仅用户明确要求时用 white-space: normal 覆盖。
- COMPONENT LAYOUT CONTRACT: .nowrap管flex、.text-nowrap管文字。标签.row.wrap.gap-2不设.flex-1；姓名单行、职业位于姓名下方；润色不新增或移动节点；长文.flex-1.min-w-0；角标.relative+.absolute。.badge-soft表状态。
${FORM_PRESENTATION_RULES}`;

/** Only new pages should proactively diversify repeated controls' business states. */
export const NEW_SCREEN_STATE_RULES = `新页面同组控件多状态：尽量利用现有实例展示代表性不同状态，如输入框空值/已填/错误/禁用、选项未选/选中、按钮可用/加载/禁用。不额外堆砌控件；状态须与业务一致，互斥组最多一个选中；遵守用户指定状态和参考图，移动端不依赖hover。`;

const PC_RULES = `DEVICE RULES — PC (1440px):
- .container-max≤1200px居中；区块.mt-8/.mb-8；页.p-6/.p-8；卡.p-5/.p-6；正文.text-sm。
- Inputs 40~44px；密集信息.grid-2/.grid-3/.grid-4；可点.card-hover/.row-hover/.link-hover。
- 顶/侧栏导航；SEMANTIC REGIONS: <aside class="sidebar">、.toolbar/.filter-bar、table独立。Never emit white-on-white text.`;

const MOBILE_RULES = `DEVICE RULES — MOBILE (390px):
- SINGLE COLUMN ONLY. 禁宽表；谨慎.grid-2/.scroll-x。
- NO HOVER STATES. 禁 :hover/hover类。
- WIDTH CONTAINMENT: 全部内容≤390px；禁固定宽度大于视口；标签簇用.row.wrap.gap-2；列内/吸底长按钮允许换行，勿用nowrap把父列撑破。
- .p-4/.text-md；.input-touch/.tap-target；.safe-bottom；不预留系统顶栏高度。
- FULL-BLEED HERO BANNERS & GRADIENTS: immersive brand/gradient headers use .hero-section full width, no horizontal margins, 0 bottom radius; cards below with normal spacing or gentle overlap.
- CTA BUTTON PLACEMENT: card/sheet submits stay in-flow; use .cta-fixed only for sticky full-width bottom bars or when the reference shows them. ALWAYS match the button placement in the reference!
- RIBBON BADGES & STATUS STRIPS: corner labels need reserved space via .relative+.absolute; notification badges use .notification-control; notice bars use .bg-warning-light/.bg-surface-alt.
- TABBAR: 多页根导航用.tabbar全宽贴底；子项必须是直接子级.tabbar-item（3~5项均分铺满，禁左侧挤成小卡片组）；图标28px+10px文案；选中.is-active用品牌色。默认微信通用底栏；轻品牌可加.tabbar-soft；消费/生活感可用.tabbar.tabbar-dock悬浮圆角。角标不遮标题与主体。
- SEMANTIC REGION DECOUPLING: .hero-section与自定义导航解耦；Never emit invisible white-on-white text.`;

export function getDeviceAestheticRules(device: DeviceProfile, useCustomNavigation = false): string {
  return device === 'pc' ? PC_RULES : `${MOBILE_RULES}\n${mobileNavigationPrompt({ deviceProfile: device, useCustomNavigation })}`;
}

/**
 * Legacy device HTML snippets retained for navigation / specimen regression tests only.
 *
 * @deprecated E5: production create prompts use `src/reference-pages` mother injector first.
 * Do not call this as the primary REFERENCE EXAMPLE path; PromptBuilder falls back to short
 * prose when the retriever refuses — never these long HTML blobs.
 */
const PC_EXAMPLE = `<main class="p-8">
  <div class="container-max col gap-6">
    <div class="row items-center justify-between">
      <div class="col gap-1">
        <h1 class="text-2xl font-bold">运营概览</h1>
        <p class="text-sm text-muted">数据更新于 2026-09-16 09:30</p>
      </div>
      <button class="btn btn-primary"><span>新建任务</span></button>
    </div>
    <div class="grid-3 gap-4">
      <div class="card card-hover p-5 col gap-2">
        <div class="row items-center justify-between">
          <span class="text-xs text-muted">本月新增用户</span>
          <span class="text-success text-sm">↑</span>
        </div>
        <span class="text-3xl font-bold">2,847</span>
        <span class="badge-soft text-success">较上月 +12.5%</span>
      </div>
    </div>
  </div>
</main>`;

const MOBILE_EXAMPLE = `<main class="col bg-surface-alt" style="min-height:100%;">
  <div class="status-bar"><span>9:41</span><span class="status-bar-icons"></span></div>
  <div class="appbar">
    <span class="tap-target">‹</span>
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
        <input class="input input-touch" value="138 0013 8000" />
      </div>
      <div class="input-group">
        <input class="input input-touch" value="请输入验证码" />
        <button class="btn btn-ghost btn-sm nowrap">获取验证码</button>
      </div>
    </div>
    <div class="divider-text">或使用以下方式登录</div>
  </div>
  <div class="cta-fixed"><button class="btn btn-primary">登录</button></div>
</main>`;

/** @deprecated Prefer mother injector; kept for mobile-navigation / specimen tests. */
export function getFewShotExample(device: DeviceProfile, useCustomNavigation = false): string {
  return device === 'pc' ? PC_EXAMPLE : normalizeMobileNavigation(MOBILE_EXAMPLE, { deviceProfile: device, useCustomNavigation }).html;
}
