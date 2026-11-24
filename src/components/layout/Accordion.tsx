import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';

interface AccordionProps {
  /**
   * 持久化键，按视图命名空间（如 `assets.images`）。
   * 展开状态随工程保存 (PRD §3.0.3)。
   */
  panelKey: string;
  title: string;
  /** 右上角计数徽标 */
  badge?: number | string;
  /** 该工程尚无记录时的初始状态 */
  defaultOpen?: boolean;
  /** 标题栏右侧的操作按钮 */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/** 侧边栏折叠面板 (PRD §3.0.3)。VSCode 式：标题行常驻，内容可折叠 */
export const Accordion: React.FC<AccordionProps> = ({
  panelKey,
  title,
  badge,
  defaultOpen = true,
  actions,
  children
}) => {
  // 只订阅自己这一条，避免任一面板开合触发整个侧栏重渲染
  const stored = useProjectStore((s) => s.panelStates[panelKey]);
  const setPanelOpen = useProjectStore((s) => s.setPanelOpen);

  // 未记录过的面板回落到 defaultOpen，新增面板因此无需数据迁移
  const open = stored ?? defaultOpen;

  return (
    <div className="border-b border-host-border">
      <div className="flex items-center gap-1 px-2 py-1.5 hover:bg-host-elevated/60 group">
        <button
          onClick={() => setPanelOpen(panelKey, !open)}
          className="flex items-center gap-1 flex-1 min-w-0 text-left text-[11px] font-semibold text-host-secondary uppercase tracking-wide"
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown className="w-3 h-3 text-host-tertiary shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-host-tertiary shrink-0" />
          )}
          <span className="truncate">{title}</span>
          {badge !== undefined && (
            <span className="ml-1 px-1.5 rounded bg-host-sunken border border-host-border/60 text-host-secondary text-[10px] font-mono shrink-0">
              {badge}
            </span>
          )}
        </button>
        {actions && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
            {actions}
          </div>
        )}
      </div>
      {open && <div className="pb-2">{children}</div>}
    </div>
  );
};
