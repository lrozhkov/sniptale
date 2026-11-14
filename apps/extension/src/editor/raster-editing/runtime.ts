import type { Canvas } from 'fabric';
import type { RasterTargetAdapter } from './adapters';
import { createRasterComputeClient, type RasterComputeClient } from './compute';
import { mountRasterInteraction } from './interaction';
import { createRasterOverlay } from './overlay';
import { createRasterSession } from './session';

interface EditorRasterRuntimeOptions {
  canvas: Canvas;
  adapter: RasterTargetAdapter;
  createCompute?: () => RasterComputeClient;
  onModeChange?: (active: boolean) => void;
  initialColor?: string;
  getMainTool?: () => string;
  isPanning?: () => boolean;
}
const runtimes = new WeakMap<Canvas, EditorRasterRuntime>();
/** Mount exactly one raster owner for this Canvas. All external effects are explicit dependencies. */
export function mountEditorRasterRuntime(options: EditorRasterRuntimeOptions) {
  unmountEditorRasterRuntime(options.canvas);
  let reportError: ((error: unknown) => void) | undefined;
  const { canvas, adapter } = options,
    overlay = createRasterOverlay(canvas, { adapter, onError: (error) => reportError?.(error) });
  const session = createRasterSession({
    adapter,
    compute:
      options.createCompute?.() ??
      createRasterComputeClient({
        createWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
      }),
    presentation: overlay,
    ...(options.onModeChange ? { onModeChange: options.onModeChange } : {}),
    ...(options.initialColor ? { initialColor: options.initialColor } : {}),
  });
  reportError = session.reportError;
  const interaction = mountRasterInteraction({
    canvas,
    session,
    ...(options.getMainTool ? { getMainTool: options.getMainTool } : {}),
    ...(options.isPanning ? { isPanning: options.isPanning } : {}),
  });
  let disposed = false,
    refreshSequence = 0;
  function refresh() {
    session.refresh();
    const sequence = ++refreshSequence;
    if ('hydrateTarget' in adapter && typeof adapter.hydrateTarget === 'function')
      void adapter.hydrateTarget().then(
        () => {
          if (!disposed && sequence === refreshSequence) session.refresh();
        },
        () => {
          if (!disposed && sequence === refreshSequence) session.refresh();
        }
      );
  }
  function selectionChanged() {
    session.cancel();
    refresh();
  }
  const removers = [
    canvas.on('selection:created', ({ selected }) => {
      if (!session.retainOwnReplacementEvent('selected', selected)) selectionChanged();
    }),
    canvas.on('selection:updated', ({ selected, deselected }) => {
      if (
        !session.retainOwnReplacementEvent('selected', selected) ||
        !session.retainOwnReplacementEvent('cleared', deselected)
      )
        selectionChanged();
    }),
    canvas.on('selection:cleared', ({ deselected }) => {
      if (!session.retainOwnReplacementEvent('cleared', deselected)) selectionChanged();
    }),
    canvas.on('object:modified', refresh),
    canvas.on('object:removed', ({ target }) => {
      if (!session.retainOwnReplacementEvent('removed', [target])) refresh();
    }),
    canvas.on('object:added', ({ target }) => {
      if (!session.retainOwnReplacementEvent('added', [target])) refresh();
    }),
  ];
  const runtime = {
    ...session,
    adapter,
    /** Keep the editing target through the queued document transition and its rollback. */
    async preserveEditingForHistory(operation: () => Promise<void>) {
      const restore = session.suspendForHistory();
      try {
        await operation();
      } finally {
        try {
          if (restore?.isCurrent()) {
            const selectionStillOnTarget = () => {
              const selected = canvas.getActiveObjects();
              return (
                !selected.length ||
                (selected.length === 1 && selected[0]?.sniptaleId === restore.targetId)
              );
            };
            if (selectionStillOnTarget()) {
              try {
                await adapter.hydrateTarget(undefined, restore.targetId);
              } catch {
                // An unavailable target ends editing; the history result remains authoritative.
              }
              if (restore.isCurrent() && selectionStillOnTarget()) {
                const next = adapter.resolveById(restore.targetId);
                if (next?.permission === 'allowed') {
                  canvas.setActiveObject(next.identity);
                  canvas.requestRenderAll();
                }
              }
            }
          }
        } finally {
          restore?.complete();
        }
      }
    },
    finishEditing() {
      session.exitEditing();
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    },
    refresh,
    dispose() {
      if (disposed) return;
      disposed = true;
      refreshSequence++;
      for (const remove of removers) remove();
      interaction.dispose();
      session.dispose();
      overlay.dispose();
      if (runtimes.get(canvas) === runtime) runtimes.delete(canvas);
    },
  };
  runtimes.set(canvas, runtime);
  refresh();
  return runtime;
}
export type EditorRasterRuntime = ReturnType<typeof mountEditorRasterRuntime>;
/** Read the Canvas-scoped runtime without constructing hidden dependencies. */
export function getEditorRasterRuntime(
  canvas: Canvas | null | undefined
): EditorRasterRuntime | null {
  return canvas ? (runtimes.get(canvas) ?? null) : null;
}
/** Dispose every transient projection, listener and Worker belonging to this Canvas. */
export function unmountEditorRasterRuntime(canvas: Canvas): void {
  runtimes.get(canvas)?.dispose();
}
