import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Map } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { Screen } from '../../types/project';
import { getBaseCss, DeviceProfile } from '../../styles/baseCss';
import { compileTokensToCss } from '../../utils/cssCompiler';
import { createMapProjection, getWorldViewport, mapPointToWorld, MapProjection, projectMapRect } from '../../utils/minimapGeometry';

const MAP_WIDTH = 208;
const MAP_HEIGHT = 128;

/** Isolated, inert page preview. Panning changes its outer transform, never its document. */
const PagePreview = React.memo(function PagePreview({ screen, device, tokensCss, overridesCss, width, height }: {
  screen: Screen; device: DeviceProfile; tokensCss: string; overridesCss: string; width: number; height: number;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(() => `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'">
    <style>${getBaseCss(device)}</style><style id="minimap-tokens"></style><style id="minimap-overrides"></style>
    <style>html { background: var(--color-bg); } html, body { scrollbar-width: none; } ::-webkit-scrollbar { display: none; }</style>
    </head><body>${screen.htmlContent}</body></html>`, [screen.htmlContent, device]);

  const syncStyles = () => {
    const doc = ref.current?.contentDocument;
    const tokens = doc?.getElementById('minimap-tokens');
    const overrides = doc?.getElementById('minimap-overrides');
    if (tokens) tokens.textContent = tokensCss;
    if (overrides) overrides.textContent = overridesCss;
  };
  useEffect(syncStyles, [tokensCss, overridesCss, srcDoc]);

  return <iframe ref={ref} srcDoc={srcDoc} onLoad={syncStyles} title={`${screen.name}缩略图`}
    tabIndex={-1} aria-hidden="true" scrolling="no" className="pointer-events-none border-0 origin-top-left"
    style={{ width, height, display: 'block' }} />;
});

export const CanvasMinimap: React.FC<{ canvasRef: React.RefObject<HTMLDivElement> }> = ({ canvasRef }) => {
  const { screens, screenOrder, settings, viewportTransform, activeScreenId, designSystem, overrides,
    setViewportTransform, setActiveScreen } = useProjectStore();
  const [expanded, setExpanded] = useState(true);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [dragProjection, setDragProjection] = useState<MapProjection | null>(null);
  const dragRef = useRef<{ pointerId: number; projection: MapProjection } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => {
      const { width, height } = canvas.getBoundingClientRect();
      setSize((previous) => previous.width === width && previous.height === height
        ? previous : { width: Math.max(1, width), height: Math.max(1, height) });
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(canvas);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [canvasRef]);

  const frameWidth = settings.frameWidth || (settings.deviceProfile === 'mobile' ? 390 : 1440);
  const frames = screenOrder.flatMap((id) => screens[id] ? [{
    screen: screens[id], x: screens[id].position.x, y: screens[id].position.y,
    width: frameWidth, height: screens[id].measuredHeight || 800
  }] : []);
  const viewport = getWorldViewport(viewportTransform, size);
  const projection = dragProjection ?? createMapProjection([...frames, viewport], MAP_WIDTH, MAP_HEIGHT);
  const viewRect = projectMapRect(viewport, projection);
  const tokensCss = useMemo(() => compileTokensToCss(designSystem.tokens, settings.colorMode), [designSystem.tokens, settings.colorMode]);
  const overridesByScreen = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [key, override] of Object.entries(overrides)) {
      const screenId = key.slice(0, key.lastIndexOf(':'));
      const declarations = Object.entries(override.declarations)
        .filter(([, value]) => value !== '' && value !== undefined && value !== null)
        .map(([property, value]) => `${property}: ${value} !important;`).join(' ');
      result[screenId] = (result[screenId] || '') + `[data-nid="${override.nid}"] { ${declarations} }\n`;
    }
    return result;
  }, [overrides]);

  const centerOn = (worldX: number, worldY: number) => {
    const scale = useProjectStore.getState().viewportTransform.scale;
    setViewportTransform({ x: size.width / 2 - worldX * scale, y: size.height / 2 - worldY * scale, scale });
  };
  const navigate = (event: React.PointerEvent<HTMLDivElement>, frozenProjection: MapProjection) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = mapPointToWorld(
      (event.clientX - rect.left) * MAP_WIDTH / rect.width,
      (event.clientY - rect.top) * MAP_HEIGHT / rect.height, frozenProjection);
    centerOn(point.x, point.y);
  };
  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragProjection(null);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div data-testid="canvas-minimap" className="absolute bottom-4 left-4 z-40 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl shadow-2xl p-2.5 flex flex-col gap-2 select-none"
      onMouseDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-4 text-[10px] font-semibold text-slate-400">
        <span className="flex items-center gap-1.5"><Map className="w-3 h-3 text-blue-400" />小地图 (Minimap)</span>
        <button type="button" aria-expanded={expanded} aria-controls="minimap-scene" onClick={() => setExpanded(!expanded)} className="text-slate-500 hover:text-slate-300 transition">
          {expanded ? '收起' : '展开'}
        </button>
      </div>
      {expanded && <>
        <div id="minimap-scene" data-testid="minimap-scene" aria-label="画布概览，点击或拖动定位" className="relative bg-slate-950 rounded-lg overflow-hidden cursor-crosshair touch-none"
          style={{ width: MAP_WIDTH, height: MAP_HEIGHT }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault(); event.stopPropagation();
            dragRef.current = { pointerId: event.pointerId, projection };
            setDragProjection(projection);
            event.currentTarget.setPointerCapture?.(event.pointerId);
            navigate(event, projection);
          }}
          onPointerMove={(event) => {
            if (dragRef.current?.pointerId === event.pointerId) navigate(event, dragRef.current.projection);
          }} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}>
          {frames.map((frame) => {
            const rect = projectMapRect(frame, projection);
            return <button key={frame.screen.id} type="button" data-testid={`minimap-screen-${frame.screen.id}`}
              aria-label={`定位画框：${frame.screen.name}`} aria-pressed={activeScreenId === frame.screen.id} title={frame.screen.name}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation(); setActiveScreen(frame.screen.id);
                centerOn(frame.x + frame.width / 2, frame.y + frame.height / 2);
              }}
              className={`absolute overflow-hidden rounded-[1px] bg-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-white ${activeScreenId === frame.screen.id ? 'ring-1 ring-blue-400 z-10' : 'ring-1 ring-slate-600 hover:ring-slate-300'}`}
              style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}>
              <div className="absolute top-0 left-0 origin-top-left pointer-events-none" style={{ transform: `scale(${projection.scale})` }}>
                <PagePreview screen={frame.screen} device={settings.deviceProfile} tokensCss={tokensCss} overridesCss={overridesByScreen[frame.screen.id] || ''} width={frameWidth} height={frame.height} />
              </div>
            </button>;
          })}
          <div data-testid="minimap-viewport" className="absolute pointer-events-none z-20 border border-blue-300 bg-blue-400/10 rounded-[1px]"
            style={{ left: viewRect.x, top: viewRect.y, width: viewRect.width, height: viewRect.height }} />
          {!frames.length && <span className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-500 pointer-events-none">暂无画框</span>}
        </div>
        <div className="flex justify-between text-[9px] text-slate-500"><span>{frames.length} 个画框 · 点击或拖动定位</span><span>{Math.round(viewportTransform.scale * 100)}%</span></div>
      </>}
    </div>
  );
};
