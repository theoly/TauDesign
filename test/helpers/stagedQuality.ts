import { useProjectStore } from '../../src/stores/useProjectStore';

/** Direct store adoption tests must supply the same complete render evidence required by the canvas UI. */
export function passStagedRenderCheck(): void {
  const store = useProjectStore.getState();
  store.setStagedRenderQuality(store.getStagedRenderContextKey(), { status: 'complete', findings: [], inspected: 1 });
}
