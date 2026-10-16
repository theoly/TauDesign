export interface MapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapProjection {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function getWorldViewport(
  transform: { x: number; y: number; scale: number },
  size: { width: number; height: number }
): MapRect {
  return {
    x: -transform.x / transform.scale,
    y: -transform.y / transform.scale,
    width: size.width / transform.scale,
    height: size.height / transform.scale
  };
}

/** Fit the actual scene and viewport with one uniform scale, including negative coordinates. */
export function createMapProjection(rects: MapRect[], width: number, height: number): MapProjection {
  const bounds = rects.length ? rects : [{ x: 0, y: 0, width: 1, height: 1 }];
  const minX = Math.min(...bounds.map((r) => r.x));
  const minY = Math.min(...bounds.map((r) => r.y));
  const maxX = Math.max(...bounds.map((r) => r.x + r.width));
  const maxY = Math.max(...bounds.map((r) => r.y + r.height));
  const worldWidth = Math.max(1, maxX - minX);
  const worldHeight = Math.max(1, maxY - minY);
  const padding = 8;
  const scale = Math.min((width - padding * 2) / worldWidth, (height - padding * 2) / worldHeight);
  return {
    scale,
    offsetX: (width - worldWidth * scale) / 2 - minX * scale,
    offsetY: (height - worldHeight * scale) / 2 - minY * scale
  };
}

export function projectMapRect(rect: MapRect, projection: MapProjection): MapRect {
  return {
    x: rect.x * projection.scale + projection.offsetX,
    y: rect.y * projection.scale + projection.offsetY,
    width: rect.width * projection.scale,
    height: rect.height * projection.scale
  };
}

export function mapPointToWorld(x: number, y: number, projection: MapProjection) {
  return {
    x: (x - projection.offsetX) / projection.scale,
    y: (y - projection.offsetY) / projection.scale
  };
}
