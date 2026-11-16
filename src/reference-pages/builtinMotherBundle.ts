/* Auto-generated browser/Bun-safe builtin mother bundle. Do not edit by hand. */
import type { MotherPage } from "./types";
export const BUILTIN_MOTHER_BUNDLE: MotherPage[] = [
  {
    "meta": {
      "id": "mobile-conversation-reading",
      "version": "1.0.0",
      "status": "active",
      "device": "mobile",
      "pageKind": "conversation",
      "aliases": [
        "移动阅读",
        "建议正文",
        "conversation reading"
      ],
      "features": [
        "long-copy",
        "reading",
        "segments"
      ],
      "density": "relaxed",
      "compositionHint": {
        "layout": "flow",
        "regionRoles": [
          "main"
        ],
        "primaryCta": "inline"
      },
      "applicableWhen": [
        "移动端长文阅读与建议",
        "分段清晰"
      ],
      "notApplicableWhen": [
        "卡片套卡片",
        "系统壳阅读器"
      ],
      "statesShown": [
        "filled",
        "selected"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "bfdc9635",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"col bg-page p-4 gap-5\">\n  <article class=\"col gap-4\" data-region=\"main\">\n    <div class=\"col gap-2\">\n      <span class=\"badge-soft is-selected\">阅读建议</span>\n      <h1 class=\"text-2xl font-display font-bold tracking-tight\">先讲清「谁适合来」</h1>\n      <p class=\"text-sm text-muted\">针对陶艺体验课详情页</p>\n    </div>\n    <p class=\"text-md leading-relaxed text-secondary\">详情里材料、时长、交通挤在同一段，新手很难判断自己是否匹配。建议把「零基础可参加」提前到英雄区副文，把交通与取消规则沉到后续卡片。</p>\n    <div class=\"card shadow-card p-4 col gap-3\">\n      <h2 class=\"text-md font-semibold\">推荐分段</h2>\n      <p class=\"text-sm text-secondary leading-relaxed\">1）适合谁 2）当天流程 3）携带物品 4）改期规则。每段只保留一句主信息，避免列表再套列表。</p>\n    </div>\n    <p class=\"text-md leading-relaxed text-secondary\">按钮文案用「预约本场」比「立即购买」更贴合到店体验场景，也能降低误触预期。</p>\n    <button class=\"btn btn-primary\">按此改写</button>\n    <button class=\"btn btn-ghost\">保留原文</button>\n  </article>\n</main>\n",
    "regions": []
  },
  {
    "meta": {
      "id": "mobile-dashboard-stack",
      "version": "1.0.0",
      "status": "active",
      "device": "mobile",
      "pageKind": "dashboard",
      "aliases": [
        "移动看板",
        "指标横滑",
        "mobile dashboard"
      ],
      "features": [
        "metrics",
        "scroll-x",
        "cards"
      ],
      "density": "compact",
      "compositionHint": {
        "layout": "flow",
        "regionRoles": [
          "header",
          "main"
        ],
        "primaryCta": "inline"
      },
      "applicableWhen": [
        "移动端指标横滑 + 纵向区块",
        "无 hover 依赖"
      ],
      "notApplicableWhen": [
        "桌面侧栏壳",
        "系统状态栏"
      ],
      "statesShown": [
        "filled",
        "selected",
        "loading"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "d814ad0a",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"col bg-page\">\n  <header class=\"p-4 col gap-1 border-b bg-surface\" data-region=\"header\">\n    <h1 class=\"text-xl font-bold\">店铺看板</h1>\n    <p class=\"text-sm text-muted\">今日实时 · 西湖银泰店</p>\n  </header>\n  <section class=\"col gap-4 p-4\" data-region=\"main\">\n    <div class=\"row gap-3 scroll-x\">\n      <div class=\"card shadow-card p-4 col gap-1 flex-none\">\n        <span class=\"text-xs text-muted\">成交额</span>\n        <span class=\"text-2xl font-bold\">¥2.4万</span>\n        <span class=\"badge-soft text-success\">+8%</span>\n      </div>\n      <div class=\"card shadow-card p-4 col gap-1 flex-none is-selected\">\n        <span class=\"text-xs text-muted\">到店预约</span>\n        <span class=\"text-2xl font-bold\">36</span>\n        <span class=\"badge-soft text-info\">高峰</span>\n      </div>\n      <div class=\"card shadow-card p-4 col gap-1 flex-none surface-subtle\">\n        <span class=\"text-xs text-muted\">退款</span>\n        <span class=\"text-2xl font-bold skeleton\">—</span>\n        <span class=\"text-xs text-muted\">刷新中</span>\n      </div>\n    </div>\n    <article class=\"card shadow-card p-4 col gap-3\">\n      <h2 class=\"text-md font-semibold\">时段热度</h2>\n      <div class=\"col gap-2 text-sm\">\n        <div class=\"row justify-between\"><span>10:00–12:00</span><span class=\"font-medium\">偏淡</span></div>\n        <div class=\"row justify-between is-selected\"><span>14:00–16:00</span><span class=\"font-medium text-primary\">拥挤</span></div>\n        <div class=\"row justify-between\"><span>18:00–20:00</span><span class=\"font-medium\">适中</span></div>\n      </div>\n    </article>\n    <button class=\"btn btn-primary\">查看明细</button>\n  </section>\n</main>\n",
    "regions": []
  },
  {
    "meta": {
      "id": "mobile-detail-hero",
      "version": "1.0.0",
      "status": "active",
      "device": "mobile",
      "pageKind": "detail",
      "aliases": [
        "移动详情",
        "英雄详情",
        "商品详情",
        "hero detail"
      ],
      "features": [
        "hero",
        "badge",
        "cards"
      ],
      "density": "standard",
      "compositionHint": {
        "layout": "flow",
        "regionRoles": [
          "header",
          "main"
        ],
        "primaryCta": "inline"
      },
      "applicableWhen": [
        "移动端全宽英雄区详情",
        "下方信息卡列表"
      ],
      "notApplicableWhen": [
        "桌面双栏档案",
        "系统状态栏演示"
      ],
      "statesShown": [
        "filled",
        "selected",
        "disabled"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "0073cc60",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"col bg-page\">\n  <header class=\"hero-section bg-gradient-soft p-6 col gap-3\" data-region=\"header\">\n    <span class=\"badge-soft\">限时体验</span>\n    <h1 class=\"text-2xl font-display font-bold tracking-tight\">青禾手作陶艺课</h1>\n    <p class=\"text-sm text-secondary leading-relaxed\">一次入门拉坯与上釉，带走一件自用器物。</p>\n    <div class=\"row items-baseline gap-2\">\n      <span class=\"text-2xl font-bold text-primary\">¥268</span>\n      <span class=\"text-sm text-muted\">含材料</span>\n    </div>\n  </header>\n  <section class=\"col gap-3 p-4\" data-region=\"main\">\n    <article class=\"card shadow-card p-4 col gap-2 is-selected\">\n      <h2 class=\"text-md font-semibold\">场次信息</h2>\n      <p class=\"text-sm text-secondary\">本周六 14:00–16:30 · 西湖银泰店</p>\n      <span class=\"badge-soft text-success\">余 6 席</span>\n    </article>\n    <article class=\"card shadow-card p-4 col gap-2\">\n      <h2 class=\"text-md font-semibold\">适合谁</h2>\n      <p class=\"text-sm text-secondary\">零基础友好，建议穿着便于清洗的衣物。</p>\n    </article>\n    <article class=\"card shadow-card p-4 col gap-2 surface-subtle\">\n      <h2 class=\"text-md font-semibold\">取消规则</h2>\n      <p class=\"text-sm text-muted\">开课前 24 小时可免费改期一次。</p>\n    </article>\n    <button class=\"btn btn-primary\">立即预约</button>\n    <button class=\"btn btn-ghost\" disabled>已加入心愿单</button>\n  </section>\n</main>\n",
    "regions": []
  },
  {
    "meta": {
      "id": "mobile-detail-tabs",
      "version": "1.0.0",
      "status": "active",
      "device": "mobile",
      "pageKind": "detail",
      "aliases": [
        "详情分栏",
        "详情标签",
        "detail tabs"
      ],
      "features": [
        "tabs",
        "badge",
        "cards"
      ],
      "density": "compact",
      "compositionHint": {
        "layout": "flow",
        "regionRoles": [
          "header",
          "main"
        ],
        "primaryCta": "inline"
      },
      "applicableWhen": [
        "移动详情需横向小节切换",
        "概览与评价分区"
      ],
      "notApplicableWhen": [
        "单英雄无切换",
        "桌面侧栏导航"
      ],
      "statesShown": [
        "filled",
        "selected",
        "empty"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "bb97d99a",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"col bg-page\">\n  <header class=\"p-4 col gap-3 border-b bg-surface\" data-region=\"header\">\n    <div class=\"row items-start justify-between gap-3\">\n      <div class=\"col gap-1 min-w-0\">\n        <h1 class=\"text-xl font-bold\">云杉协作专业版</h1>\n        <p class=\"text-sm text-muted\">团队空间 · 12 人在用</p>\n      </div>\n      <span class=\"badge-soft text-info\">试用中</span>\n    </div>\n    <div class=\"row gap-2 scroll-x\">\n      <button class=\"btn btn-secondary btn-sm is-active text-nowrap\">概览</button>\n      <button class=\"btn btn-ghost btn-sm text-nowrap\">成员</button>\n      <button class=\"btn btn-ghost btn-sm text-nowrap\">账单</button>\n    </div>\n  </header>\n  <section class=\"col gap-3 p-4\" data-region=\"main\">\n    <article class=\"card shadow-card p-4 col gap-2\">\n      <h2 class=\"text-md font-semibold\">本月用量</h2>\n      <p class=\"text-sm text-secondary\">存储 18.6 GB / 50 GB · 自动化 42 次</p>\n      <span class=\"badge-soft text-success\">健康</span>\n    </article>\n    <article class=\"card shadow-card p-4 col gap-3\">\n      <h2 class=\"text-md font-semibold\">最近成员</h2>\n      <div class=\"list-item row items-center gap-3 py-2 is-selected\">\n        <span class=\"avatar\">林</span>\n        <div class=\"col gap-0 min-w-0 flex-1\"><span class=\"text-sm font-medium\">林婉清</span><span class=\"text-xs text-muted\">管理员</span></div>\n      </div>\n      <div class=\"list-item row items-center gap-3 py-2\">\n        <span class=\"avatar\">周</span>\n        <div class=\"col gap-0 min-w-0 flex-1\"><span class=\"text-sm font-medium\">周予安</span><span class=\"text-xs text-muted\">编辑</span></div>\n      </div>\n    </article>\n    <div class=\"card p-4 surface-subtle text-sm text-muted\">账单页暂无逾期记录。</div>\n    <button class=\"btn btn-primary\">管理订阅</button>\n  </section>\n</main>\n",
    "regions": []
  },
  {
    "meta": {
      "id": "mobile-empty-state",
      "version": "1.0.0",
      "status": "active",
      "device": "mobile",
      "pageKind": "empty",
      "aliases": [
        "移动空态",
        "无内容引导",
        "mobile empty"
      ],
      "features": [
        "empty-cta",
        "centered"
      ],
      "density": "relaxed",
      "compositionHint": {
        "layout": "flow",
        "regionRoles": [
          "main"
        ],
        "primaryCta": "inline"
      },
      "applicableWhen": [
        "移动端空态引导",
        "触控主按钮"
      ],
      "notApplicableWhen": [
        "桌面宽屏空态装饰过多",
        "系统空页面壳"
      ],
      "statesShown": [
        "empty",
        "disabled"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "0933c952",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"col bg-page p-6 flex-1 items-center justify-center gap-5\" data-region=\"main\">\n  <div class=\"icon-box bg-surface-alt text-muted\">空</div>\n  <div class=\"col gap-2 items-center text-center\">\n    <h1 class=\"text-xl font-bold\">暂无预约</h1>\n    <p class=\"text-sm text-muted\">附近门店还有空位，挑一场适合你的体验吧。</p>\n  </div>\n  <button class=\"btn btn-primary\">去看看</button>\n  <button class=\"btn btn-ghost btn-sm\" disabled>定位未开启</button>\n</main>\n",
    "regions": []
  },
  {
    "meta": {
      "id": "mobile-form-sheet",
      "version": "1.0.0",
      "status": "active",
      "device": "mobile",
      "pageKind": "form",
      "aliases": [
        "移动表单",
        "信息登记",
        "sheet form",
        "触控表单"
      ],
      "features": [
        "form-groups",
        "input-touch",
        "validation"
      ],
      "density": "standard",
      "compositionHint": {
        "layout": "flow",
        "regionRoles": [
          "main"
        ],
        "primaryCta": "inline"
      },
      "applicableWhen": [
        "移动端单列表单",
        "提交按钮位于内容流末"
      ],
      "notApplicableWhen": [
        "桌面多列分组",
        "强制底栏 cta-fixed"
      ],
      "statesShown": [
        "filled",
        "error",
        "disabled"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "aec18d56",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"col bg-page p-4 gap-4\">\n  <section class=\"sheet-card shadow-card p-5 col gap-5\" data-region=\"main\">\n    <div class=\"col gap-1\">\n      <h1 class=\"text-xl font-bold\">预约到店</h1>\n      <p class=\"text-sm text-muted\">请填写联系方式，顾问将在 2 小时内回电</p>\n    </div>\n    <div class=\"col gap-4\">\n      <div class=\"col gap-2\">\n        <label class=\"text-sm font-medium\">姓名</label>\n        <input class=\"input input-touch\" value=\"周予安\" />\n      </div>\n      <div class=\"col gap-2\">\n        <label class=\"text-sm font-medium\">手机号</label>\n        <input class=\"input input-touch\" value=\"138 0013\" />\n        <span class=\"text-xs text-danger\">请输入 11 位手机号</span>\n      </div>\n      <div class=\"col gap-2\">\n        <label class=\"text-sm font-medium\">意向门店</label>\n        <select class=\"select input-touch\"><option>西湖银泰店</option><option>钱江世纪城店</option></select>\n      </div>\n      <div class=\"col gap-2\">\n        <label class=\"text-sm font-medium\">期望时段</label>\n        <input class=\"input input-touch\" value=\"本周六下午\" disabled />\n        <span class=\"text-xs text-muted\">该时段已约满时可改选</span>\n      </div>\n    </div>\n    <button class=\"btn btn-primary\">提交预约</button>\n  </section>\n</main>\n",
    "regions": []
  },
  {
    "meta": {
      "id": "mobile-landing-hero",
      "version": "1.0.0",
      "status": "active",
      "device": "mobile",
      "pageKind": "landing",
      "aliases": [
        "移动落地",
        "移动营销首屏",
        "mobile landing"
      ],
      "features": [
        "hero",
        "brand",
        "cta-fixed"
      ],
      "density": "relaxed",
      "compositionHint": {
        "layout": "flow",
        "regionRoles": [
          "header",
          "main",
          "footer"
        ],
        "primaryCta": "cta-fixed"
      },
      "applicableWhen": [
        "移动全宽英雄区",
        "底栏单一主操作"
      ],
      "notApplicableWhen": [
        "桌面三列卖点首屏",
        "系统状态栏落地"
      ],
      "statesShown": [
        "filled",
        "selected"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "66494c08",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"col bg-page\">\n  <header class=\"hero-section bg-ambient-warm p-6 col gap-4\" data-region=\"header\">\n    <span class=\"text-sm font-medium text-primary\">青禾手作</span>\n    <h1 class=\"text-3xl font-display font-bold tracking-tight\">周末做一只自己的杯子</h1>\n    <p class=\"text-md text-secondary leading-relaxed\">零基础可参加，材料与烧制都含在体验里。</p>\n  </header>\n  <section class=\"col gap-3 p-4\" data-region=\"main\">\n    <article class=\"card shadow-card p-4 col gap-2\">\n      <h2 class=\"text-md font-semibold\">适合谁</h2>\n      <p class=\"text-sm text-secondary\">想动手但不想买设备的朋友，可结伴到店。</p>\n    </article>\n    <article class=\"card shadow-card p-4 col gap-2 is-selected\">\n      <h2 class=\"text-md font-semibold\">当天流程</h2>\n      <p class=\"text-sm text-secondary\">讲解 20 分钟，动手 90 分钟，清洁收尾。</p>\n    </article>\n  </section>\n  <footer class=\"cta-fixed\" data-region=\"footer\">\n    <button class=\"btn btn-primary\">预约本场</button>\n  </footer>\n</main>\n",
    "regions": []
  },
  {
    "meta": {
      "id": "mobile-list-cards",
      "version": "1.0.0",
      "status": "active",
      "device": "mobile",
      "pageKind": "list",
      "aliases": [
        "移动卡片列表",
        "手机项目列表",
        "mobile card list"
      ],
      "features": [
        "filters",
        "cards",
        "badge",
        "avatar"
      ],
      "density": "standard",
      "compositionHint": {
        "layout": "flow",
        "regionRoles": [
          "header",
          "main"
        ],
        "primaryCta": "toolbar"
      },
      "applicableWhen": [
        "移动端卡片浏览列表",
        "顶部分类筛选"
      ],
      "notApplicableWhen": [
        "桌面多列表格",
        "系统壳伪元素演示",
        "营销落地页",
        "营销长落地页"
      ],
      "statesShown": [
        "filled",
        "selected",
        "empty"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "0082b5c8",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"col bg-page\">\n  <header class=\"col gap-3 p-4 border-b bg-surface\" data-region=\"header\">\n    <div class=\"row items-center justify-between gap-3\">\n      <h1 class=\"text-xl font-bold\">我的课程</h1>\n      <button class=\"btn btn-primary btn-sm\">报名</button>\n    </div>\n    <div class=\"filter-bar scroll-x\" data-region=\"filters\">\n      <button class=\"btn btn-secondary btn-sm is-active text-nowrap\">全部</button>\n      <button class=\"btn btn-ghost btn-sm text-nowrap\">进行中</button>\n      <button class=\"btn btn-ghost btn-sm text-nowrap\">已完成</button>\n      <button class=\"btn btn-ghost btn-sm text-nowrap\">已过期</button>\n    </div>\n  </header>\n  <section class=\"col gap-3 p-4\" data-region=\"main\">\n    <article class=\"card shadow-card p-4 col gap-3 is-selected\">\n      <div class=\"row justify-between items-start gap-2\">\n        <div class=\"col gap-1 min-w-0\">\n          <h2 class=\"text-md font-semibold\">产品叙事工作坊</h2>\n          <p class=\"text-xs text-muted\">导师 陈予安 · 剩余 4 课时</p>\n        </div>\n        <span class=\"badge-soft text-success\">进行中</span>\n      </div>\n      <p class=\"text-sm text-secondary\">下周一下午继续「用户旅程图」实操。</p>\n      <div class=\"row justify-between items-center\">\n        <span class=\"avatar\">陈</span>\n        <button class=\"btn btn-ghost btn-sm\">继续学习</button>\n      </div>\n    </article>\n    <article class=\"card shadow-card p-4 col gap-3\">\n      <div class=\"row justify-between items-start gap-2\">\n        <div class=\"col gap-1 min-w-0\">\n          <h2 class=\"text-md font-semibold\">原型表达精讲</h2>\n          <p class=\"text-xs text-muted\">导师 林知夏 · 已学完</p>\n        </div>\n        <span class=\"badge-soft text-muted\">已完成</span>\n      </div>\n      <p class=\"text-sm text-secondary\">可回看作业点评与示范稿。</p>\n      <div class=\"row justify-between items-center\">\n        <span class=\"avatar\">林</span>\n        <button class=\"btn btn-ghost btn-sm\">查看证书</button>\n      </div>\n    </article>\n    <article class=\"card shadow-card p-4 col gap-3 surface-subtle\">\n      <div class=\"row justify-between items-start gap-2\">\n        <div class=\"col gap-1 min-w-0\">\n          <h2 class=\"text-md font-semibold\">品牌色系统营</h2>\n          <p class=\"text-xs text-muted\">报名已截止</p>\n        </div>\n        <span class=\"badge-soft text-warning\">已过期</span>\n      </div>\n      <p class=\"text-sm text-secondary\">下一期开放时可优先候补。</p>\n    </article>\n  </section>\n</main>\n",
    "regions": []
  },
  {
    "meta": {
      "id": "mobile-pricing-stack",
      "version": "1.0.0",
      "status": "active",
      "device": "mobile",
      "pageKind": "pricing",
      "aliases": [
        "移动套餐",
        "纵向套餐",
        "mobile pricing"
      ],
      "features": [
        "pricing-tiers",
        "badge",
        "cards"
      ],
      "density": "standard",
      "compositionHint": {
        "layout": "flow",
        "regionRoles": [
          "header",
          "main"
        ],
        "primaryCta": "inline"
      },
      "applicableWhen": [
        "移动端纵向套餐卡",
        "推荐卡微质感"
      ],
      "notApplicableWhen": [
        "三列桌面对比",
        "等权三主按钮"
      ],
      "statesShown": [
        "filled",
        "selected",
        "disabled"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "622253d6",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"col bg-page p-4 gap-4\">\n  <header class=\"col gap-2\" data-region=\"header\">\n    <h1 class=\"text-xl font-bold\">会员方案</h1>\n    <p class=\"text-sm text-muted\">随时升级，按剩余天数折算</p>\n  </header>\n  <section class=\"col gap-3\" data-region=\"main\">\n    <article class=\"card shadow-card p-4 col gap-3\">\n      <div class=\"row justify-between items-center\">\n        <h2 class=\"text-md font-semibold\">月度会员</h2>\n        <span class=\"text-lg font-bold\">¥39</span>\n      </div>\n      <p class=\"text-sm text-secondary\">适合短期体验全部课程与社群。</p>\n      <button class=\"btn btn-secondary\">选择月度</button>\n    </article>\n    <article class=\"card shadow-card p-4 col gap-3 border is-selected\">\n      <div class=\"row justify-between items-center\">\n        <div class=\"row items-center gap-2\"><h2 class=\"text-md font-semibold\">年度会员</h2><span class=\"badge-soft text-primary\">更划算</span></div>\n        <span class=\"text-lg font-bold\">¥299</span>\n      </div>\n      <p class=\"text-sm text-secondary\">含线下开放日优先报名与作业点评。</p>\n      <button class=\"btn btn-primary\">开通年度</button>\n    </article>\n    <article class=\"card p-4 col gap-3 surface-subtle\">\n      <div class=\"row justify-between items-center\">\n        <h2 class=\"text-md font-semibold\">家庭共享</h2>\n        <span class=\"text-sm text-muted\">即将开放</span>\n      </div>\n      <p class=\"text-sm text-muted\">最多 4 位家人共用权益。</p>\n      <button class=\"btn btn-ghost\" disabled>加入候补</button>\n    </article>\n  </section>\n</main>\n",
    "regions": []
  },
  {
    "meta": {
      "id": "mobile-result-status",
      "version": "1.0.0",
      "status": "active",
      "device": "mobile",
      "pageKind": "result",
      "aliases": [
        "移动结果",
        "状态结果",
        "mobile result"
      ],
      "features": [
        "result-status",
        "next-actions"
      ],
      "density": "standard",
      "compositionHint": {
        "layout": "flow",
        "regionRoles": [
          "main",
          "footer"
        ],
        "primaryCta": "inline"
      },
      "applicableWhen": [
        "移动端状态结果页",
        "主次按钮纵向"
      ],
      "notApplicableWhen": [
        "桌面宽结果卡",
        "空态引导页"
      ],
      "statesShown": [
        "filled",
        "selected",
        "disabled"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "129f0afb",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"col bg-page p-5 gap-5\">\n <section class=\"col gap-4 items-center text-center py-6\" data-region=\"main\">\n <span class=\"badge-soft text-warning\">处理中</span>\n <h1 class=\"text-2xl font-bold\">支付确认中</h1>\n <p class=\"text-sm text-secondary leading-relaxed\">银行正在确认本笔 ¥268 支付。通常 1 分钟内完成，请稍候。</p>\n <div class=\"card shadow-card p-4 col gap-2 text-left\">\n <div class=\"row justify-between text-sm\"><span class=\"text-muted\">商户</span><span>青禾手作</span></div>\n <div class=\"row justify-between text-sm is-selected\"><span class=\"text-muted\">单号</span><span>PAY-6612</span></div>\n </div>\n </section>\n <footer class=\"col gap-2\" data-region=\"footer\">\n <button class=\"btn btn-primary\">刷新状态</button>\n <button class=\"btn btn-ghost\">联系客服</button>\n <button class=\"btn btn-text btn-sm\" disabled>取消支付不可用</button>\n </footer>\n</main>\n",
    "regions": []
  },
  {
    "meta": {
      "id": "mobile-settings-grouped",
      "version": "1.0.0",
      "status": "active",
      "device": "mobile",
      "pageKind": "settings",
      "aliases": [
        "移动设置",
        "分组设置列表",
        "mobile settings"
      ],
      "features": [
        "settings-groups",
        "list-item"
      ],
      "density": "compact",
      "compositionHint": {
        "layout": "flow",
        "regionRoles": [
          "header",
          "main"
        ],
        "primaryCta": "none"
      },
      "applicableWhen": [
        "移动端分组设置列表",
        "节标题 + 行"
      ],
      "notApplicableWhen": [
        "桌面侧栏设置",
        "系统设置壳"
      ],
      "statesShown": [
        "filled",
        "selected",
        "disabled"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "7ee5db08",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"col bg-page\">\n  <header class=\"p-4 border-b bg-surface\" data-region=\"header\">\n    <h1 class=\"text-xl font-bold\">设置</h1>\n  </header>\n  <section class=\"col gap-4 p-4\" data-region=\"main\">\n    <div class=\"col gap-2\">\n      <h2 class=\"text-xs text-muted tracking-wide\">账户</h2>\n      <div class=\"card shadow-card overflow-hidden\">\n        <div class=\"list-item px-4 py-3 row justify-between items-center is-selected\">\n          <span class=\"text-sm\">个人资料</span><span class=\"text-xs text-muted\">林婉清</span>\n        </div>\n        <div class=\"list-item px-4 py-3 row justify-between items-center\">\n          <span class=\"text-sm\">手机号</span><span class=\"text-xs text-muted\">138****8000</span>\n        </div>\n      </div>\n    </div>\n    <div class=\"col gap-2\">\n      <h2 class=\"text-xs text-muted tracking-wide\">通知</h2>\n      <div class=\"card shadow-card overflow-hidden\">\n        <div class=\"list-item px-4 py-3 row justify-between items-center\">\n          <div class=\"col gap-0\"><span class=\"text-sm\">活动提醒</span><span class=\"text-xs text-muted\">开课前一天</span></div>\n          <button class=\"btn btn-secondary btn-sm\">开</button>\n        </div>\n        <div class=\"list-item px-4 py-3 row justify-between items-center\">\n          <div class=\"col gap-0\"><span class=\"text-sm\">营销邮件</span><span class=\"text-xs text-muted\">可随时退订</span></div>\n          <button class=\"btn btn-ghost btn-sm\" disabled>关</button>\n        </div>\n      </div>\n    </div>\n    <button class=\"btn btn-primary\">保存设置</button>\n  </section>\n</main>\n",
    "regions": []
  },
  {
    "meta": {
      "id": "pc-conversation-suggest",
      "version": "1.0.0",
      "status": "active",
      "device": "pc",
      "pageKind": "conversation",
      "aliases": [
        "长文建议",
        "方案说明",
        "阅读正文",
        "conversation suggest"
      ],
      "features": [
        "long-copy",
        "suggestions",
        "reading"
      ],
      "density": "relaxed",
      "compositionHint": {
        "layout": "flow",
        "regionRoles": [
          "header",
          "main"
        ],
        "primaryCta": "inline"
      },
      "applicableWhen": [
        "长阅读建议/说明页",
        "低权操作不抢正文"
      ],
      "notApplicableWhen": [
        "密集仪表盘",
        "嵌套卡片墙"
      ],
      "statesShown": [
        "filled",
        "selected",
        "disabled"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "9f75dded",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"bg-page p-10\">\n  <div class=\"container-max col gap-8\">\n    <header class=\"col gap-2\" data-region=\"header\">\n      <span class=\"badge-soft\">设计建议</span>\n      <h1 class=\"text-3xl font-display font-bold tracking-tight\">把首屏主张写短一点</h1>\n      <p class=\"text-md text-muted\">基于你提供的会员续费落地页草稿</p>\n    </header>\n    <article class=\"col gap-5\" data-region=\"main\">\n      <p class=\"text-md leading-relaxed text-secondary\">当前标题承载了品牌名、优惠力度与活动时间，读者需要扫两遍才能抓住行动点。建议把主张收束为一句「续费即得春季开放日席位」，把折扣信息降到副文或卡片内。</p>\n      <div class=\"card shadow-card p-5 col gap-3 bg-surface-alt\">\n        <h2 class=\"text-lg font-semibold\">可试用的结构</h2>\n        <ol class=\"col gap-2 text-sm text-secondary leading-relaxed\">\n          <li>英雄区：品牌 + 一句主张 + 单一主按钮</li>\n          <li>下一节：三条权益，每条一行短句</li>\n          <li>页脚：次要链接，不与主 CTA 争抢</li>\n        </ol>\n      </div>\n      <p class=\"text-md leading-relaxed text-secondary\">若必须保留倒计时，请放在英雄区下方独立一行，避免做成漂浮角标压住标题。需要我按这个结构重排文案时，直接说「按建议改稿」。</p>\n      <div class=\"row gap-3 items-center\">\n        <button class=\"btn btn-primary\">采纳建议</button>\n        <button class=\"btn btn-ghost\">另存草稿</button>\n        <button class=\"btn btn-text\" disabled>已同步到评论</button>\n      </div>\n    </article>\n  </div>\n</main>\n",
    "regions": []
  },
  {
    "meta": {
      "id": "pc-dashboard-metrics",
      "version": "1.0.0",
      "status": "active",
      "device": "pc",
      "pageKind": "dashboard",
      "aliases": [
        "指标看板",
        "运营概览",
        "metrics dashboard"
      ],
      "features": [
        "metrics",
        "toolbar",
        "cards",
        "secondary-list"
      ],
      "density": "compact",
      "compositionHint": {
        "layout": "flow",
        "regionRoles": [
          "header",
          "main",
          "secondary"
        ],
        "primaryCta": "toolbar"
      },
      "applicableWhen": [
        "运营/业务指标概览",
        "指标卡有主次字号"
      ],
      "notApplicableWhen": [
        "纯表单",
        "营销落地首屏"
      ],
      "statesShown": [
        "filled",
        "selected",
        "loading"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "56c5c321",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"bg-page p-8\">\n  <div class=\"container-max col gap-6\">\n    <header class=\"toolbar\" data-region=\"header\">\n      <div class=\"col gap-1\">\n        <h1 class=\"text-2xl font-bold\">运营概览</h1>\n        <p class=\"text-sm text-muted\">数据更新于今天 09:30</p>\n      </div>\n      <div class=\"row gap-2\">\n        <button class=\"btn btn-ghost btn-sm\">本周</button>\n        <button class=\"btn btn-primary\">导出报告</button>\n      </div>\n    </header>\n    <section class=\"grid-4 gap-4\" data-region=\"main\">\n      <div class=\"card shadow-card p-5 col gap-2\">\n        <span class=\"text-xs text-muted\">本月新增用户</span>\n        <span class=\"text-3xl font-bold\">2,847</span>\n        <span class=\"badge-soft text-success\">较上月 +12.5%</span>\n      </div>\n      <div class=\"card shadow-card p-5 col gap-2\">\n        <span class=\"text-xs text-muted\">付费转化</span>\n        <span class=\"text-2xl font-semibold\">6.8%</span>\n        <span class=\"badge-soft text-warning\">略低于目标</span>\n      </div>\n      <div class=\"card shadow-card p-5 col gap-2\">\n        <span class=\"text-xs text-muted\">活跃团队</span>\n        <span class=\"text-2xl font-semibold\">412</span>\n        <span class=\"badge-soft text-info\">周环比持平</span>\n      </div>\n      <div class=\"card shadow-card p-5 col gap-2 surface-subtle\">\n        <span class=\"text-xs text-muted\">退订率</span>\n        <span class=\"text-2xl font-semibold skeleton\">—</span>\n        <span class=\"text-xs text-muted\">统计刷新中</span>\n      </div>\n    </section>\n    <div class=\"grid-2 gap-5 items-start\">\n      <div class=\"card shadow-card p-5 col gap-3\">\n        <h2 class=\"text-lg font-semibold\">渠道表现</h2>\n        <div class=\"col gap-3\">\n          <div class=\"row justify-between text-sm\"><span>内容投放</span><span class=\"font-semibold\">¥86.2 万</span></div>\n          <div class=\"row justify-between text-sm\"><span>私域邀请</span><span class=\"font-semibold\">¥41.5 万</span></div>\n          <div class=\"row justify-between text-sm text-muted\"><span>线下活动</span><span>¥12.0 万</span></div>\n        </div>\n      </div>\n      <aside class=\"card shadow-card p-5 col gap-3\" data-region=\"secondary\">\n        <h2 class=\"text-lg font-semibold\">待办事项</h2>\n        <div class=\"py-2 is-selected text-sm\">复核春季开放日名额</div>\n        <div class=\"py-2 text-sm\">同步仓储看板验收结果</div>\n        <div class=\"py-2 text-sm text-muted\">整理会员续费文案</div>\n      </aside>\n    </div>\n  </div>\n</main>\n",
    "regions": []
  },
  {
    "meta": {
      "id": "pc-dashboard-sidebar",
      "version": "1.0.0",
      "status": "active",
      "device": "pc",
      "pageKind": "dashboard",
      "aliases": [
        "侧栏看板",
        "后台总览",
        "sidebar dashboard"
      ],
      "features": [
        "sidebar",
        "metrics",
        "navigation",
        "table"
      ],
      "density": "compact",
      "compositionHint": {
        "layout": "sidebar-main",
        "regionRoles": [
          "sidebar",
          "main"
        ],
        "primaryCta": "toolbar"
      },
      "applicableWhen": [
        "带侧栏导航的后台总览",
        "证明 sidebar 壳层可用"
      ],
      "notApplicableWhen": [
        "移动单列看板",
        "无导航营销页"
      ],
      "statesShown": [
        "filled",
        "selected",
        "empty"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "15f13a34",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"bg-page row items-stretch\">\n  <aside class=\"sidebar p-4 col gap-4\" data-region=\"sidebar\">\n    <div class=\"col gap-1 px-2\">\n      <span class=\"text-sm font-bold\">云杉后台</span>\n      <span class=\"text-xs text-muted\">运营中心</span>\n    </div>\n    <nav class=\"col gap-1\">\n      <button class=\"btn btn-secondary btn-sm justify-start is-selected\">总览</button>\n      <button class=\"btn btn-ghost btn-sm justify-start\">订单</button>\n      <button class=\"btn btn-ghost btn-sm justify-start\">客户</button>\n      <button class=\"btn btn-ghost btn-sm justify-start\">设置</button>\n    </nav>\n  </aside>\n  <section class=\"flex-1 col gap-5 p-6\" data-region=\"main\">\n    <header class=\"toolbar\">\n      <div class=\"col gap-1\">\n        <h1 class=\"text-xl font-bold\">今日总览</h1>\n        <p class=\"text-sm text-muted\">门店与线上合并口径</p>\n      </div>\n      <button class=\"btn btn-primary\">创建任务</button>\n    </header>\n    <div class=\"grid-3 gap-4\">\n      <div class=\"card shadow-card p-4 col gap-1\"><span class=\"text-xs text-muted\">成交额</span><span class=\"text-2xl font-bold\">¥18.6 万</span></div>\n      <div class=\"card shadow-card p-4 col gap-1\"><span class=\"text-xs text-muted\">订单数</span><span class=\"text-2xl font-bold\">326</span></div>\n      <div class=\"card shadow-card p-4 col gap-1 surface-subtle\"><span class=\"text-xs text-muted\">客诉</span><span class=\"text-2xl font-bold\">3</span></div>\n    </div>\n    <div class=\"card shadow-card overflow-hidden\">\n      <div class=\"row items-center justify-between px-5 py-3 border-b bg-surface-alt\">\n        <h2 class=\"text-md font-semibold\">异常订单</h2>\n        <span class=\"badge-soft text-warning\">2 条待处理</span>\n      </div>\n      <div class=\"px-5 py-3 row justify-between is-selected\"><span class=\"text-sm\">ORD-0842 支付超时</span><button class=\"btn btn-text btn-sm\">处理</button></div>\n      <div class=\"px-5 py-3 row justify-between\"><span class=\"text-sm\">ORD-0791 地址不全</span><button class=\"btn btn-text btn-sm\">处理</button></div>\n      <div class=\"p-5 text-sm text-muted\">其余订单运行正常。</div>\n    </div>\n  </section>\n</main>\n",
    "regions": []
  },
  {
    "meta": {
      "id": "pc-detail-profile",
      "version": "1.0.0",
      "status": "active",
      "device": "pc",
      "pageKind": "detail",
      "aliases": [
        "资料详情",
        "客户档案",
        "人物详情",
        "profile detail"
      ],
      "features": [
        "avatar",
        "badge",
        "two-column",
        "attribute-grid"
      ],
      "density": "standard",
      "compositionHint": {
        "layout": "two-column",
        "regionRoles": [
          "header",
          "main",
          "secondary"
        ],
        "primaryCta": "inline"
      },
      "applicableWhen": [
        "人物/客户档案详情",
        "摘要与详情双栏"
      ],
      "notApplicableWhen": [
        "纯列表",
        "营销落地"
      ],
      "statesShown": [
        "filled",
        "selected",
        "disabled"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "9438bc46",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"bg-page p-8\">\n  <div class=\"container-max col gap-6\">\n    <header class=\"row items-center justify-between gap-4\" data-region=\"header\">\n      <div class=\"row items-center gap-4 min-w-0\">\n        <span class=\"avatar\">婉</span>\n        <div class=\"col gap-1 min-w-0\">\n          <div class=\"row items-center gap-2 wrap\">\n            <h1 class=\"text-2xl font-bold\">林婉清</h1>\n            <span class=\"badge-soft text-success\">已认证</span>\n          </div>\n          <p class=\"text-sm text-muted\">杭州云杉科技 · 产品负责人</p>\n        </div>\n      </div>\n      <div class=\"row gap-2\">\n        <button class=\"btn btn-secondary\">发消息</button>\n        <button class=\"btn btn-primary\">编辑资料</button>\n      </div>\n    </header>\n    <div class=\"grid-2 gap-6 items-start\">\n      <section class=\"card shadow-card p-6 col gap-4\" data-region=\"main\">\n        <h2 class=\"text-lg font-semibold\">基本信息</h2>\n        <div class=\"grid-2 gap-4\">\n          <div class=\"col gap-1\"><span class=\"text-xs text-muted\">手机</span><span class=\"text-sm\">138 0013 8000</span></div>\n          <div class=\"col gap-1\"><span class=\"text-xs text-muted\">邮箱</span><span class=\"text-sm\">wanqing@yunshan.cn</span></div>\n          <div class=\"col gap-1\"><span class=\"text-xs text-muted\">入驻时间</span><span class=\"text-sm\">2024-03-18</span></div>\n          <div class=\"col gap-1\"><span class=\"text-xs text-muted\">客户等级</span><span class=\"badge-soft text-primary\">A 类战略</span></div>\n        </div>\n        <div class=\"divider\"></div>\n        <p class=\"text-sm text-secondary leading-relaxed\">关注移动端转化与会员续费体验，近期推进春季开放日。</p>\n      </section>\n      <aside class=\"col gap-4\" data-region=\"secondary\">\n        <div class=\"card shadow-card p-5 col gap-3\">\n          <h3 class=\"text-md font-semibold\">近期动态</h3>\n          <div class=\"py-2 col gap-1 is-selected\">\n            <span class=\"text-sm font-medium\">提交改版需求</span>\n            <span class=\"text-xs text-muted\">昨天 16:20</span>\n          </div>\n          <div class=\"py-2 col gap-1\">\n            <span class=\"text-sm font-medium\">完成访谈纪要</span>\n            <span class=\"text-xs text-muted\">周一 10:05</span>\n          </div>\n        </div>\n        <div class=\"panel p-4 col gap-2 surface-subtle\">\n          <span class=\"text-sm font-medium\">跟进负责人</span>\n          <div class=\"row items-center gap-2\"><span class=\"avatar\">何</span><span class=\"text-sm\">何知夏</span></div>\n          <button class=\"btn btn-ghost btn-sm\" disabled>已指派</button>\n        </div>\n      </aside>\n    </div>\n  </div>\n</main>\n",
    "regions": []
  },
  {
    "meta": {
      "id": "pc-empty-state",
      "version": "1.0.0",
      "status": "active",
      "device": "pc",
      "pageKind": "empty",
      "aliases": [
        "空状态",
        "无数据",
        "empty state"
      ],
      "features": [
        "empty-cta",
        "centered"
      ],
      "density": "relaxed",
      "compositionHint": {
        "layout": "flow",
        "regionRoles": [
          "main"
        ],
        "primaryCta": "inline"
      },
      "applicableWhen": [
        "列表/项目为空引导创建",
        "单一主操作"
      ],
      "notApplicableWhen": [
        "已有数据的列表",
        "错误结果页"
      ],
      "statesShown": [
        "empty",
        "disabled"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "618347a6",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"bg-page p-12\">\n  <div class=\"container-max col items-center justify-center gap-5 py-16\" data-region=\"main\">\n    <div class=\"icon-box bg-surface-alt text-muted\">空</div>\n    <div class=\"col gap-2 items-center text-center\">\n      <h1 class=\"text-2xl font-bold\">还没有项目</h1>\n      <p class=\"text-md text-muted\">创建第一个项目后，团队成员就可以一起协作了。</p>\n    </div>\n    <div class=\"row gap-3\">\n      <button class=\"btn btn-primary\">创建项目</button>\n      <button class=\"btn btn-ghost\">导入模板</button>\n    </div>\n    <button class=\"btn btn-text btn-sm\" disabled>示例项目加载中</button>\n  </div>\n</main>\n",
    "regions": []
  },
  {
    "meta": {
      "id": "pc-form-grouped",
      "version": "1.0.0",
      "status": "active",
      "device": "pc",
      "pageKind": "form",
      "aliases": [
        "分组表单",
        "资料表单",
        "新建客户",
        "grouped form"
      ],
      "features": [
        "form-groups",
        "validation",
        "input"
      ],
      "density": "standard",
      "compositionHint": {
        "layout": "flow",
        "regionRoles": [
          "header",
          "main"
        ],
        "primaryCta": "inline"
      },
      "applicableWhen": [
        "分组字段的创建/编辑表单",
        "需要错误态示例"
      ],
      "notApplicableWhen": [
        "多步向导",
        "纯展示详情"
      ],
      "statesShown": [
        "filled",
        "error",
        "disabled"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "448e93f7",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"bg-page p-8\">\n  <div class=\"container-max col gap-8\">\n    <header class=\"col gap-1\" data-region=\"header\">\n      <h1 class=\"text-2xl font-bold\">新建客户</h1>\n      <p class=\"text-sm text-muted\">带 * 为必填项，保存后可继续补充联系人</p>\n    </header>\n    <section class=\"col gap-6\" data-region=\"main\">\n      <div class=\"card shadow-card p-6 col gap-5\">\n        <h2 class=\"text-lg font-semibold\">基本信息</h2>\n        <div class=\"grid-2 gap-5\">\n          <div class=\"col gap-2\">\n            <label class=\"text-sm font-medium\">公司名称 *</label>\n            <input class=\"input\" value=\"杭州云杉科技有限公司\" />\n          </div>\n          <div class=\"col gap-2\">\n            <label class=\"text-sm font-medium\">客户等级</label>\n            <select class=\"select\"><option>A 类战略</option><option>B 类成长</option></select>\n          </div>\n          <div class=\"col gap-2\">\n            <label class=\"text-sm font-medium\">联系邮箱 *</label>\n            <input class=\"input\" value=\"ops@\" />\n            <span class=\"text-xs text-danger\">请输入完整邮箱地址</span>\n          </div>\n          <div class=\"col gap-2\">\n            <label class=\"text-sm font-medium\">所属行业</label>\n            <input class=\"input\" value=\"企业服务\" disabled />\n            <span class=\"text-xs text-muted\">由线索来源自动填充</span>\n          </div>\n        </div>\n      </div>\n      <div class=\"card shadow-card p-6 col gap-5\">\n        <h2 class=\"text-lg font-semibold\">跟进备注</h2>\n        <div class=\"col gap-2\">\n          <label class=\"text-sm font-medium\">备注</label>\n          <textarea class=\"input\" rows=\"3\">本周完成需求访谈，对方希望先看移动端方案。</textarea>\n        </div>\n      </div>\n      <div class=\"row justify-end gap-3\">\n        <button class=\"btn btn-ghost\">取消</button>\n        <button class=\"btn btn-primary\">保存客户</button>\n      </div>\n    </section>\n  </div>\n</main>\n",
    "regions": []
  },
  {
    "meta": {
      "id": "pc-form-wizard",
      "version": "1.0.0",
      "status": "active",
      "device": "pc",
      "pageKind": "form",
      "aliases": [
        "分步表单",
        "向导表单",
        "步骤创建",
        "wizard form"
      ],
      "features": [
        "wizard",
        "steps",
        "form-groups"
      ],
      "density": "standard",
      "compositionHint": {
        "layout": "flow",
        "regionRoles": [
          "header",
          "main"
        ],
        "primaryCta": "inline"
      },
      "applicableWhen": [
        "多步骤创建流程",
        "需展示当前步与进度"
      ],
      "notApplicableWhen": [
        "单页短表单",
        "设置开关页"
      ],
      "statesShown": [
        "filled",
        "disabled",
        "selected"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "3ea21f39",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"bg-page p-8\">\n  <div class=\"container-max col gap-8\">\n    <header class=\"col gap-4\" data-region=\"header\">\n      <h1 class=\"text-2xl font-bold\">发布活动</h1>\n      <div class=\"row items-center gap-3 text-sm\">\n        <span class=\"badge-soft text-primary is-selected\">1 基本信息</span>\n        <span class=\"text-muted\">—</span>\n        <span class=\"badge-soft\">2 场次安排</span>\n        <span class=\"text-muted\">—</span>\n        <span class=\"badge-soft text-muted\">3 确认发布</span>\n      </div>\n    </header>\n    <section class=\"card shadow-card p-6 col gap-5\" data-region=\"main\">\n      <h2 class=\"text-lg font-semibold\">基本信息</h2>\n      <div class=\"col gap-4\">\n        <div class=\"col gap-2\">\n          <label class=\"text-sm font-medium\">活动名称</label>\n          <input class=\"input\" value=\"春季会员开放日\" />\n        </div>\n        <div class=\"grid-2 gap-4\">\n          <div class=\"col gap-2\">\n            <label class=\"text-sm font-medium\">活动类型</label>\n            <select class=\"select\"><option>线下沙龙</option><option>线上直播</option></select>\n          </div>\n          <div class=\"col gap-2\">\n            <label class=\"text-sm font-medium\">预计人数</label>\n            <input class=\"input\" value=\"80\" />\n          </div>\n        </div>\n        <div class=\"col gap-2\">\n          <label class=\"text-sm font-medium\">一句话介绍</label>\n          <textarea class=\"input\" rows=\"2\">面向老会员与潜客的产品体验与答疑。</textarea>\n        </div>\n      </div>\n      <div class=\"row justify-between items-center mt-2\">\n        <button class=\"btn btn-ghost\" disabled>上一步</button>\n        <button class=\"btn btn-primary\">下一步</button>\n      </div>\n    </section>\n  </div>\n</main>\n",
    "regions": []
  },
  {
    "meta": {
      "id": "pc-landing-hero",
      "version": "1.0.0",
      "status": "active",
      "device": "pc",
      "pageKind": "landing",
      "aliases": [
        "落地页",
        "品牌首页",
        "营销首屏",
        "landing hero"
      ],
      "features": [
        "hero",
        "brand",
        "single-cta"
      ],
      "density": "relaxed",
      "compositionHint": {
        "layout": "flow",
        "regionRoles": [
          "header",
          "main",
          "footer"
        ],
        "primaryCta": "inline"
      },
      "applicableWhen": [
        "品牌英雄区 + 单一主操作",
        "首屏不堆统计条"
      ],
      "notApplicableWhen": [
        "后台列表",
        "多 CTA 首屏"
      ],
      "statesShown": [
        "filled",
        "selected"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "f622beae",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"bg-page\">\n <header class=\"hero-section bg-gradient-soft\" data-region=\"header\">\n <div class=\"container-max col gap-6 py-16 px-8\">\n <span class=\"text-sm font-medium tracking-wide text-primary\">青禾手作</span>\n <h1 class=\"text-5xl font-display font-bold tracking-tight\">在城市里，做一件会用很久的器物</h1>\n <p class=\"text-lg text-secondary\">周末两小时入门拉坯，带走自己的杯子或碗。</p>\n <div class=\"row gap-3 items-center\">\n <button class=\"btn btn-primary btn-lg\">预约体验</button>\n <button class=\"btn btn-ghost\">查看课表</button>\n </div>\n </div>\n </header>\n <section class=\"container-max px-8 py-12 col gap-6\" data-region=\"main\">\n <h2 class=\"text-2xl font-semibold\">三件事你会带走</h2>\n <div class=\"grid-3 gap-5\">\n <div class=\"card shadow-card p-5 col gap-2\"><h3 class=\"text-md font-semibold\">基础手法</h3><p class=\"text-sm text-secondary\">定心、拉高、修坯一次讲清。</p></div>\n <div class=\"card shadow-card p-5 col gap-2 is-selected\"><h3 class=\"text-md font-semibold\">上釉配色</h3><p class=\"text-sm text-secondary\">从店内釉色里选一组稳妥搭配。</p></div>\n <div class=\"card shadow-card p-5 col gap-2\"><h3 class=\"text-md font-semibold\">成品取件</h3><p class=\"text-sm text-secondary\">烧制完成后到店领取或邮寄。</p></div>\n </div>\n </section>\n <footer class=\"border-t py-6\" data-region=\"footer\">\n <div class=\"container-max px-8 row justify-between items-center text-sm text-muted\">\n <span>青禾手作 · 西湖银泰店</span>\n <button class=\"btn btn-text btn-sm\">联系顾问</button>\n </div>\n </footer>\n</main>\n",
    "regions": []
  },
  {
    "meta": {
      "id": "pc-list-cards",
      "version": "1.0.0",
      "status": "active",
      "device": "pc",
      "pageKind": "list",
      "aliases": [
        "卡片列表",
        "项目列表",
        "成员卡片",
        "card list",
        "gallery list",
        "会员列表"
      ],
      "features": [
        "filters",
        "cards",
        "avatar",
        "badge",
        "grid",
        "toolbar"
      ],
      "density": "standard",
      "compositionHint": {
        "layout": "flow",
        "regionRoles": [
          "header",
          "main"
        ],
        "primaryCta": "toolbar"
      },
      "applicableWhen": [
        "适合卡片浏览的资源或项目列表",
        "需展示头像与徽章摘要"
      ],
      "notApplicableWhen": [
        "密集多列表格",
        "长文阅读页",
        "营销长落地页",
        "营销落地页"
      ],
      "statesShown": [
        "filled",
        "selected",
        "empty"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "99998f75",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"bg-page p-8\">\n  <div class=\"container-max col gap-6\">\n    <header class=\"toolbar\" data-region=\"header\">\n      <div class=\"col gap-1 min-w-0\">\n        <h1 class=\"text-2xl font-bold\">项目空间</h1>\n        <p class=\"text-sm text-muted\">12 个进行中 · 3 个待启动</p>\n      </div>\n      <button class=\"btn btn-primary\">新建项目</button>\n    </header>\n    <div class=\"filter-bar\" data-region=\"filters\">\n      <button class=\"btn btn-secondary btn-sm is-selected\">全部</button>\n      <button class=\"btn btn-ghost btn-sm\">设计</button>\n      <button class=\"btn btn-ghost btn-sm\">研发</button>\n      <button class=\"btn btn-ghost btn-sm\">运营</button>\n    </div>\n    <section class=\"grid-3 gap-5\" data-region=\"main\">\n      <article class=\"card shadow-card p-5 col gap-4 is-selected\">\n        <div class=\"row justify-between items-start gap-3\">\n          <div class=\"col gap-1 min-w-0\">\n            <h2 class=\"text-lg font-semibold min-w-0 break-words\">春秋茶馆改版</h2>\n            <p class=\"text-sm text-muted\">设计组 · 更新于昨天</p>\n          </div>\n          <span class=\"badge-soft text-success\">进行中</span>\n        </div>\n        <p class=\"text-sm text-secondary leading-relaxed\">完成菜单页与点单流程高保真，待评审动效节奏。</p>\n        <div class=\"row items-center justify-between\">\n          <div class=\"avatar-group\"><span class=\"avatar\">婉</span><span class=\"avatar\">予</span><span class=\"avatar\">知</span></div>\n          <button class=\"btn btn-text btn-sm\">打开</button>\n        </div>\n      </article>\n      <article class=\"card shadow-card p-5 col gap-4 card-hover\">\n        <div class=\"row justify-between items-start gap-3\">\n          <div class=\"col gap-1 min-w-0\">\n            <h2 class=\"text-lg font-semibold\">会员续费活动</h2>\n            <p class=\"text-sm text-muted\">运营组 · 更新于周一</p>\n          </div>\n          <span class=\"badge-soft text-warning\">待启动</span>\n        </div>\n        <p class=\"text-sm text-secondary leading-relaxed\">落地页文案已定稿，等待素材与权益规则确认。</p>\n        <div class=\"row items-center justify-between\">\n          <div class=\"avatar-group\"><span class=\"avatar\">清</span><span class=\"avatar\">安</span></div>\n          <button class=\"btn btn-text btn-sm\">打开</button>\n        </div>\n      </article>\n      <article class=\"card shadow-card p-5 col gap-4 card-hover\">\n        <div class=\"row justify-between items-start gap-3\">\n          <div class=\"col gap-1 min-w-0\">\n            <h2 class=\"text-lg font-semibold\">仓储看板</h2>\n            <p class=\"text-sm text-muted\">研发组 · 更新于 3 天前</p>\n          </div>\n          <span class=\"badge-soft text-info\">联调中</span>\n        </div>\n        <p class=\"text-sm text-secondary leading-relaxed\">指标卡与出入库明细已通，下周验收筛选联动。</p>\n        <div class=\"row items-center justify-between\">\n          <div class=\"avatar-group\"><span class=\"avatar\">夏</span><span class=\"avatar\">杉</span></div>\n          <button class=\"btn btn-text btn-sm\">打开</button>\n        </div>\n      </article>\n    </section>\n  </div>\n</main>\n",
    "regions": [
      {
        "role": "filters",
        "html": "<div class=\"filter-bar\" data-region=\"filters\">\n  <button class=\"btn btn-secondary btn-sm is-selected\">全部</button>\n  <button class=\"btn btn-ghost btn-sm\">设计</button>\n  <button class=\"btn btn-ghost btn-sm\">研发</button>\n  <button class=\"btn btn-ghost btn-sm\">运营</button>\n</div>\n"
      },
      {
        "role": "header",
        "html": "<header class=\"toolbar\" data-region=\"header\">\n  <div class=\"col gap-1 min-w-0\">\n    <h1 class=\"text-2xl font-bold\">项目空间</h1>\n    <p class=\"text-sm text-muted\">12 个进行中 · 3 个待启动</p>\n  </div>\n  <button class=\"btn btn-primary\">新建项目</button>\n</header>\n"
      }
    ]
  },
  {
    "meta": {
      "id": "pc-list-table",
      "version": "1.0.0",
      "status": "active",
      "device": "pc",
      "pageKind": "list",
      "aliases": [
        "表格列表",
        "数据表格",
        "订单列表",
        "table list",
        "data table"
      ],
      "features": [
        "filters",
        "table",
        "toolbar",
        "badge",
        "row-actions"
      ],
      "density": "compact",
      "compositionHint": {
        "layout": "flow",
        "regionRoles": [
          "header",
          "main",
          "footer"
        ],
        "primaryCta": "toolbar"
      },
      "applicableWhen": [
        "需要可筛选的表格型列表",
        "多列字段对比与行内操作"
      ],
      "notApplicableWhen": [
        "营销落地页",
        "纯卡片瀑布流",
        "移动端信息流",
        "营销长落地页"
      ],
      "statesShown": [
        "filled",
        "selected",
        "empty"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "0bf0cc36",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"bg-page p-8\">\n  <div class=\"container-max col gap-6\">\n    <header class=\"toolbar\" data-region=\"header\">\n      <div class=\"col gap-1 min-w-0\">\n        <h1 class=\"text-2xl font-bold tracking-tight\">订单管理</h1>\n        <p class=\"text-sm text-muted\">共 128 条 · 今日新增 6 单</p>\n      </div>\n      <div class=\"row gap-2 items-center\">\n        <button class=\"btn btn-secondary btn-sm\">导出</button>\n        <button class=\"btn btn-primary\">新建订单</button>\n      </div>\n    </header>\n    <div class=\"filter-bar\" data-region=\"filters\">\n      <input class=\"input\" placeholder=\"搜索订单号 / 客户\" />\n      <select class=\"select\"><option>全部状态</option><option>待支付</option><option>已发货</option></select>\n      <button class=\"btn btn-ghost btn-sm\">重置</button>\n    </div>\n    <section class=\"card shadow-card overflow-hidden\" data-region=\"main\">\n      <div class=\"row items-center gap-4 px-5 py-3 bg-surface-alt border-b text-xs text-muted font-medium\">\n        <span class=\"flex-1\">订单信息</span><span class=\"flex-none\">金额</span><span class=\"flex-none\">状态</span><span class=\"flex-none\">操作</span>\n      </div>\n      <div class=\"row-hover is-selected px-5 py-4 row items-center gap-4\">\n        <div class=\"flex-1 col gap-1 min-w-0\">\n          <span class=\"text-sm font-medium text-nowrap\">ORD-20261116-0842</span>\n          <span class=\"text-xs text-muted\">杭州云杉科技 · 林婉清</span>\n        </div>\n        <span class=\"flex-none text-sm font-semibold\">¥2,860</span>\n        <span class=\"badge-soft text-warning flex-none\">待支付</span>\n        <button class=\"btn btn-text btn-sm flex-none\">催付</button>\n      </div>\n      <div class=\"row-hover px-5 py-4 row items-center gap-4\">\n        <div class=\"flex-1 col gap-1 min-w-0\">\n          <span class=\"text-sm font-medium text-nowrap\">ORD-20261115-2301</span>\n          <span class=\"text-xs text-muted\">苏州青禾园艺 · 周予安</span>\n        </div>\n        <span class=\"flex-none text-sm font-semibold\">¥680</span>\n        <span class=\"badge-soft text-success flex-none\">已发货</span>\n        <button class=\"btn btn-text btn-sm flex-none\">详情</button>\n      </div>\n      <div class=\"row-hover px-5 py-4 row items-center gap-4\">\n        <div class=\"flex-1 col gap-1 min-w-0\">\n          <span class=\"text-sm font-medium text-nowrap\">ORD-20261114-1190</span>\n          <span class=\"text-xs text-muted\">成都叠溪文创 · 何知夏</span>\n        </div>\n        <span class=\"flex-none text-sm font-semibold\">¥1,240</span>\n        <span class=\"badge-soft text-info flex-none\">处理中</span>\n        <button class=\"btn btn-text btn-sm flex-none\">跟进</button>\n      </div>\n    </section>\n    <footer class=\"row justify-between items-center text-sm text-muted\" data-region=\"footer\">\n      <span>已选 1 条</span>\n      <div class=\"row gap-2\"><button class=\"btn btn-ghost btn-sm\">上一页</button><button class=\"btn btn-ghost btn-sm\">下一页</button></div>\n    </footer>\n  </div>\n</main>\n",
    "regions": []
  },
  {
    "meta": {
      "id": "pc-pricing-compare",
      "version": "1.0.0",
      "status": "active",
      "device": "pc",
      "pageKind": "pricing",
      "aliases": [
        "套餐对比",
        "价格表",
        "会员套餐",
        "pricing compare"
      ],
      "features": [
        "pricing-tiers",
        "badge",
        "comparison"
      ],
      "density": "standard",
      "compositionHint": {
        "layout": "flow",
        "regionRoles": [
          "header",
          "main"
        ],
        "primaryCta": "inline"
      },
      "applicableWhen": [
        "三列套餐对比",
        "突出推荐档"
      ],
      "notApplicableWhen": [
        "单列移动套餐",
        "后台设置页"
      ],
      "statesShown": [
        "filled",
        "selected",
        "disabled"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "c9b47db9",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"bg-page p-8\">\n <div class=\"container-max col gap-8\">\n <header class=\"col gap-2 text-center\" data-region=\"header\">\n <h1 class=\"text-3xl font-display font-bold tracking-tight\">选择适合团队的方案</h1>\n <p class=\"text-md text-muted\">按年付可再省两周费用，随时可升级</p>\n </header>\n <section class=\"grid-3 gap-5 items-stretch\" data-region=\"main\">\n <article class=\"card shadow-card p-6 col gap-4\">\n <div class=\"col gap-1\">\n <h2 class=\"text-lg font-semibold\">基础版</h2>\n <p class=\"text-sm text-muted\">个人创作者起步</p>\n </div>\n <div class=\"row items-baseline gap-1\"><span class=\"text-3xl font-bold\">¥49</span><span class=\"text-sm text-muted\">/月</span></div>\n <ul class=\"col gap-2 text-sm text-secondary\">\n <li>3 个项目空间</li>\n <li>基础协作评论</li>\n <li>邮件支持</li>\n </ul>\n <button class=\"btn btn-secondary\">开始试用</button>\n </article>\n <article class=\"card shadow-card p-6 col gap-4 border is-selected relative\">\n <span class=\"badge-soft text-primary\">推荐</span>\n <div class=\"col gap-1\">\n <h2 class=\"text-lg font-semibold\">专业版</h2>\n <p class=\"text-sm text-muted\">成长团队首选</p>\n </div>\n <div class=\"row items-baseline gap-1\"><span class=\"text-3xl font-bold\">¥129</span><span class=\"text-sm text-muted\">/月</span></div>\n <ul class=\"col gap-2 text-sm text-secondary\">\n <li>无限项目与版本</li>\n <li>权限与审计日志</li>\n <li>优先支持通道</li>\n </ul>\n <button class=\"btn btn-primary\">升级专业版</button>\n </article>\n <article class=\"card shadow-card p-6 col gap-4 surface-subtle\">\n <div class=\"col gap-1\">\n <h2 class=\"text-lg font-semibold\">企业版</h2>\n <p class=\"text-sm text-muted\">安全与专属服务</p>\n </div>\n <div class=\"row items-baseline gap-1\"><span class=\"text-3xl font-bold\">定制</span></div>\n <ul class=\"col gap-2 text-sm text-secondary\">\n <li>单点登录与专属部署</li>\n <li>客户成功经理</li>\n <li>合同与发票支持</li>\n </ul>\n <button class=\"btn btn-ghost\" disabled>联系销售</button>\n </article>\n </section>\n </div>\n</main>\n",
    "regions": []
  },
  {
    "meta": {
      "id": "pc-result-success",
      "version": "1.0.0",
      "status": "active",
      "device": "pc",
      "pageKind": "result",
      "aliases": [
        "成功结果",
        "提交成功",
        "result success"
      ],
      "features": [
        "result-status",
        "next-actions"
      ],
      "density": "standard",
      "compositionHint": {
        "layout": "flow",
        "regionRoles": [
          "main",
          "footer"
        ],
        "primaryCta": "inline"
      },
      "applicableWhen": [
        "提交成功摘要与后续操作",
        "主次按钮清晰"
      ],
      "notApplicableWhen": [
        "失败为主的状态页",
        "长表单本身"
      ],
      "statesShown": [
        "filled",
        "selected",
        "disabled"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "b30b4595",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"bg-page p-10\">\n <div class=\"container-max col items-center gap-6 py-12\">\n <section class=\"card shadow-card p-8 col gap-4 items-center text-center\" data-region=\"main\">\n <span class=\"badge-soft text-success\">已完成</span>\n <h1 class=\"text-3xl font-display font-bold\">预约已提交</h1>\n <p class=\"text-md text-secondary leading-relaxed\">我们将在 2 小时内短信确认场次。订单号 ORD-20261116-0842，可在「我的预约」查看进度。</p>\n <div class=\"panel p-4 surface-subtle text-sm text-left col gap-2\">\n <div class=\"row justify-between\"><span class=\"text-muted\">门店</span><span>西湖银泰店</span></div>\n <div class=\"row justify-between is-selected\"><span class=\"text-muted\">时间</span><span>周六 14:00</span></div>\n <div class=\"row justify-between\"><span class=\"text-muted\">人数</span><span>2 人</span></div>\n </div>\n </section>\n <footer class=\"row gap-3\" data-region=\"footer\">\n <button class=\"btn btn-primary\">查看预约</button>\n <button class=\"btn btn-ghost\">返回首页</button>\n <button class=\"btn btn-text\" disabled>已发送回执</button>\n </footer>\n </div>\n</main>\n",
    "regions": []
  },
  {
    "meta": {
      "id": "pc-settings-sections",
      "version": "1.0.0",
      "status": "active",
      "device": "pc",
      "pageKind": "settings",
      "aliases": [
        "设置分组",
        "账户设置",
        "settings sections"
      ],
      "features": [
        "settings-groups",
        "sidebar",
        "toggles"
      ],
      "density": "standard",
      "compositionHint": {
        "layout": "sidebar-main",
        "regionRoles": [
          "sidebar",
          "main"
        ],
        "primaryCta": "none"
      },
      "applicableWhen": [
        "分组设置与说明",
        "侧栏导航设置"
      ],
      "notApplicableWhen": [
        "营销落地",
        "数据看板"
      ],
      "statesShown": [
        "filled",
        "selected",
        "disabled"
      ],
      "promptBudgetChars": 1200,
      "license": {
        "source": "authored",
        "note": "builtin beauty p0"
      },
      "origin": "builtin",
      "contentFingerprint": "1741255c",
      "review": {
        "reviewer": "beauty-p0",
        "date": "2026-11-16",
        "renderPass": true
      }
    },
    "bodyHtml": "<main class=\"bg-page row items-start\">\n  <aside class=\"sidebar p-4 col gap-3\" data-region=\"sidebar\">\n    <h1 class=\"text-sm font-bold px-2\">设置</h1>\n    <nav class=\"col gap-1\">\n      <button class=\"btn btn-secondary btn-sm justify-start is-selected\">账户</button>\n      <button class=\"btn btn-ghost btn-sm justify-start\">通知</button>\n      <button class=\"btn btn-ghost btn-sm justify-start\">安全</button>\n    </nav>\n  </aside>\n  <section class=\"flex-1 col gap-6 p-8\" data-region=\"main\">\n    <div class=\"col gap-1\">\n      <h2 class=\"text-xl font-bold\">账户资料</h2>\n      <p class=\"text-sm text-muted\">这些信息会显示在团队成员列表中</p>\n    </div>\n    <div class=\"card shadow-card p-6 col gap-5\">\n      <div class=\"grid-2 gap-5\">\n        <div class=\"col gap-2\">\n          <label class=\"text-sm font-medium\">显示名称</label>\n          <input class=\"input\" value=\"林婉清\" />\n        </div>\n        <div class=\"col gap-2\">\n          <label class=\"text-sm font-medium\">对外邮箱</label>\n          <input class=\"input\" value=\"wanqing@yunshan.cn\" />\n        </div>\n      </div>\n      <div class=\"row items-center justify-between py-2 border-t\">\n        <div class=\"col gap-1\">\n          <span class=\"text-sm font-medium\">公开个人主页</span>\n          <span class=\"text-xs text-muted\">关闭后仅团队内可见</span>\n        </div>\n        <button class=\"btn btn-secondary btn-sm is-selected\">已开启</button>\n      </div>\n      <div class=\"row items-center justify-between py-2 border-t\">\n        <div class=\"col gap-1\">\n          <span class=\"text-sm font-medium\">两步验证</span>\n          <span class=\"text-xs text-muted\">由管理员统一要求</span>\n        </div>\n        <button class=\"btn btn-ghost btn-sm\" disabled>已强制</button>\n      </div>\n      <div class=\"row justify-end\">\n        <button class=\"btn btn-primary\">保存更改</button>\n      </div>\n    </div>\n  </section>\n</main>\n",
    "regions": []
  }
];
