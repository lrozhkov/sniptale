import { Color, type FabricObject } from 'fabric';
import type { RasterTarget, RasterTargetAdapter, RasterPublication } from './adapters';
import { EDITOR_RASTER_BINARY_FIELDS } from '../../features/editor/document/raster-state';
import { createRasterBrushStroke, type RasterBrushPreview, type RasterBrushStroke } from './brush';
import {
  rasterComputeFailure,
  RasterComputeError,
  type RasterComputeClient,
  type RasterComputeFailure,
  type RasterComputeValue,
} from './compute';
import type { PixelBounds, SelectionMask, SourcePoint } from './contracts';
import { rasterCropBounds } from './coordinates';
import { composeRasterPixels, composeRasterRegion, type RasterPixelData } from './pixels';
import {
  combineSelection,
  invertSelection,
  isRasterSourcePointVisible,
  wrapRasterSourcePoint,
  workingSelectionMask,
  gestureSelectionMask,
  selectionBounds,
} from './selection';

type RasterTool = 'select' | 'fill' | 'remove-color' | 'erase' | 'restore' | 'crop' | null;
type RasterSelectionMethod = 'rectangle' | 'lasso' | 'wand';
type RasterSelectionMode = 'new' | 'add' | 'subtract';
type RasterCropRatio = 'free' | 'original' | '1:1' | '4:3' | '16:9';
interface RasterSettings {
  tolerance: number;
  contiguous: boolean;
  grow: number;
  brushSize: number;
  hardness: number;
  color: string;
}
/** Stable UI value: no accepted resources, pixels, masks or Fabric objects enter React. */
export interface RasterSessionSnapshot {
  available: boolean;
  targetId: string | null;
  targetName: string;
  targetKind: RasterTarget['kind'] | null;
  permission: 'allowed' | 'blocked';
  tool: RasterTool;
  selectionMethod: RasterSelectionMethod;
  selectionMode: RasterSelectionMode;
  selection: 'none' | 'empty' | 'active';
  busy: boolean;
  error: RasterComputeFailure | null;
  cropPending: boolean;
  cropRatio: RasterCropRatio;
  settings: Readonly<RasterSettings>;
}
/** Presentation owns only native display projections, never document state. */
export interface RasterPresentation {
  pixels(target: RasterTarget, before: RasterPixelData, preview: RasterBrushPreview): void;
  selection(target: RasterTarget, mask: SelectionMask): void;
  crop(target: RasterTarget, bounds: PixelBounds | null): void;
  clear(): void;
  cursor?(target: RasterTarget, point: SourcePoint, diameter: number): void;
  prepared(target: RasterTarget, preview: { object: FabricObject; dispose(): void }): void;
}
type Gesture = {
  target: RasterTarget;
  generation: number;
  tool: RasterTool;
  method: RasterSelectionMethod;
  mode: RasterSelectionMode;
  points: SourcePoint[];
  selection: SelectionMask;
  pixels: RasterPixelData | null;
  stroke: RasterBrushStroke | null;
  ready: Promise<void>;
  released: boolean;
};
function matchesPublication(object: FabricObject, candidate: RasterPublication): boolean {
  return (
    object.sniptaleRasterState === candidate.metadata.sniptaleRasterState &&
    EDITOR_RASTER_BINARY_FIELDS.every((field) => object[field] === candidate.metadata[field])
  );
}
/** One mutable authority for one mounted canvas, with explicit computation and publication owners. */
export function createRasterSession(options: {
  adapter: RasterTargetAdapter;
  compute: RasterComputeClient;
  presentation: RasterPresentation;
  onModeChange?: (active: boolean) => void;
  initialColor?: string;
}) {
  const { adapter, compute, presentation } = options;
  const listeners = new Set<() => void>();
  let target: RasterTarget | null = null,
    selected: SelectionMask = null,
    pixels: RasterPixelData | null = null;
  let disposed = false,
    generation = 0,
    abort: AbortController | null = null,
    gesture: Gesture | null = null,
    crop: PixelBounds | null = null;
  let ownReplacement: { previous: FabricObject; next: FabricObject; revision: number } | null =
    null;
  let snapshot: RasterSessionSnapshot = {
    available: false,
    targetId: null,
    targetName: '',
    targetKind: null,
    permission: 'blocked',
    tool: null,
    selectionMethod: 'rectangle',
    selectionMode: 'new',
    selection: 'none',
    busy: false,
    error: null,
    cropPending: false,
    cropRatio: 'free',
    settings: {
      tolerance: 5,
      contiguous: true,
      grow: 0,
      brushSize: 32,
      hardness: 100,
      color: options.initialColor ?? '#000000',
    },
  };
  function emit(change: Partial<RasterSessionSnapshot> = {}) {
    snapshot = {
      ...snapshot,
      ...change,
      selection: selected === null ? 'none' : selected.some(Boolean) ? 'active' : 'empty',
      cropPending: crop !== null,
    };
    for (const listener of listeners) listener();
  }
  /** Refresh an invalidated current generation; stale jobs cannot settle a newer job or target. */
  function retainCurrentTarget(expected: RasterTarget, revision: number) {
    if (disposed || generation !== revision || target !== expected) return false;
    if (adapter.isCurrent(expected)) return true;
    refresh();
    return false;
  }
  function cancelWork() {
    ownReplacement = null;
    generation++;
    abort?.abort();
    abort = null;
    compute.cancel();
    gesture?.stroke?.cancel();
    gesture = null;
    crop = null;
    presentation.clear();
  }
  function cancel() {
    cancelWork();
    if (target && adapter.isCurrent(target)) presentation.selection(target, selected);
    emit({ busy: false });
  }
  function refresh() {
    if (disposed) return;
    const next = adapter.resolve();
    if (target?.identity === next?.identity && target?.revision === next?.revision) return;
    cancelWork();
    target = next;
    pixels = null;
    selected = null;
    if (!next) options.onModeChange?.(false);
    emit({
      available: next !== null,
      targetId: next?.id ?? null,
      targetName: next?.label ?? '',
      targetKind: next?.kind ?? null,
      permission: next?.permission ?? 'blocked',
      busy: false,
      error: null,
      tool: next ? snapshot.tool : null,
    });
  }
  function fail(error: unknown, expected: RasterTarget, revision: number) {
    if (!retainCurrentTarget(expected, revision)) return;
    presentation.clear();
    crop = null;
    gesture = null;
    emit({
      busy: false,
      error: rasterComputeFailure(error) === 'cancelled' ? null : rasterComputeFailure(error),
    });
  }
  function start(expected: RasterTarget) {
    cancelWork();
    abort = new AbortController();
    const revision = generation,
      signal = abort.signal;
    emit({ busy: true, error: null });
    return { expected, revision, signal };
  }
  async function decoded(expected: RasterTarget, revision: number, signal: AbortSignal) {
    if (pixels) return pixels;
    const result = await compute.run({ kind: 'decode', metadata: expected.metadata }, signal);
    if (!retainCurrentTarget(expected, revision) || result.kind !== 'decoded') return null;
    pixels = result.pixels;
    return pixels;
  }
  async function publish(
    expected: RasterTarget,
    revision: number,
    signal: AbortSignal,
    value: RasterComputeValue
  ) {
    if (!retainCurrentTarget(expected, revision) || value.kind !== 'encoded') return;
    const receipt: { target: RasterTarget | null } = { target: null };
    let accepted: boolean;
    try {
      accepted = await adapter.publish(expected, value.candidate, signal, (next) => {
        if (!retainCurrentTarget(expected, revision) || !matchesPublication(next, value.candidate))
          return () => {};
        const transition = { previous: expected.identity, next, revision };
        ownReplacement = transition;
        return () => {
          if (ownReplacement === transition) ownReplacement = null;
          if (disposed || generation !== revision || target !== expected) return;
          const resolved = adapter.resolve();
          if (
            resolved?.identity === next &&
            matchesPublication(next, value.candidate) &&
            adapter.isCurrent(resolved)
          )
            receipt.target = resolved;
        };
      });
    } catch (error) {
      if (!disposed && generation === revision && target === expected) {
        ownReplacement = null;
        if (retainCurrentTarget(expected, revision)) fail(error, expected, revision);
      }
      return;
    }
    if (disposed || generation !== revision || target !== expected) return;
    if (accepted) {
      presentation.clear();
      const next = adapter.resolve();
      target = next;
      pixels = null;
      const replacement = receipt.target;
      const own =
        replacement !== null &&
        next !== null &&
        next.identity === replacement.identity &&
        adapter.isCurrent(replacement) &&
        next.id === expected.id &&
        next.metadata.sniptaleRasterOriginalData === expected.metadata.sniptaleRasterOriginalData &&
        next.geometry.width === expected.geometry.width &&
        next.geometry.height === expected.geometry.height;
      if (next?.identity !== expected.identity && !own) selected = null;
      if (next) presentation.selection(next, selected);
      emit({
        available: !!next,
        targetId: next?.id ?? null,
        targetName: next?.label ?? '',
        targetKind: next?.kind ?? null,
        permission: next?.permission ?? 'blocked',
        busy: false,
      });
    } else if (!adapter.isCurrent(expected)) refresh();
    else fail(new RasterComputeError('compute-failed'), expected, revision);
  }
  function color(): readonly [number, number, number, number] {
    const source = new Color(snapshot.settings.color).getSource();
    return [source[0], source[1], source[2], Math.round(source[3] * 255)];
  }
  async function editSelected(action: 'fill' | 'hide') {
    refresh();
    if (!target || target.permission !== 'allowed' || snapshot.busy) return;
    const expected = target,
      region = workingSelectionMask(expected.geometry, selected);
    if (!region.some(Boolean)) return;
    const { revision, signal } = start(expected);
    try {
      const source = await decoded(expected, revision, signal);
      if (!source || !retainCurrentTarget(expected, revision)) return;
      await publish(
        expected,
        revision,
        signal,
        await compute.run(
          {
            kind: 'edit',
            metadata: expected.metadata,
            pixels: source,
            region,
            selection: region,
            action,
            color: color(),
          },
          signal
        )
      );
    } catch (error) {
      fail(error, expected, revision);
    }
  }
  async function query(
    expected: RasterTarget,
    revision: number,
    signal: AbortSignal,
    point: SourcePoint,
    source: RasterPixelData,
    restriction: SelectionMask
  ) {
    const wrapped = expected.geometry.periodic
      ? wrapRasterSourcePoint(expected.geometry.crop, point)
      : point;
    const seed = { x: Math.floor(wrapped.x), y: Math.floor(wrapped.y) };
    if (
      seed.x < 0 ||
      seed.y < 0 ||
      seed.x >= source.width ||
      seed.y >= source.height ||
      (restriction && !restriction[seed.y * source.width + seed.x])
    )
      return null;
    const result = await compute.run(
      {
        kind: 'region',
        pixels: source,
        selection: restriction,
        seed,
        tolerance: Math.round((snapshot.settings.tolerance * 255) / 100),
        grow: snapshot.settings.grow,
        contiguous: snapshot.settings.contiguous,
      },
      signal
    );
    return retainCurrentTarget(expected, revision) && result.kind === 'region'
      ? { mask: result.mask, seed }
      : null;
  }
  async function click(point: SourcePoint) {
    refresh();
    if (!target || target.permission !== 'allowed' || snapshot.busy) return;
    const expected = target,
      tool = snapshot.tool,
      mode = snapshot.selectionMode;
    if (
      tool !== 'fill' &&
      tool !== 'remove-color' &&
      !(tool === 'select' && snapshot.selectionMethod === 'wand')
    )
      return;
    if (!isRasterSourcePointVisible(expected.geometry, point)) return;
    const restriction = workingSelectionMask(
        expected.geometry,
        tool === 'select' ? null : selected
      ),
      { revision, signal } = start(expected);
    try {
      const source = await decoded(expected, revision, signal);
      if (!source || !retainCurrentTarget(expected, revision)) return;
      const result = await query(expected, revision, signal, point, source, restriction);
      if (!result) {
        if (retainCurrentTarget(expected, revision)) emit({ busy: false });
        return;
      }
      if (tool === 'select') {
        selected = combineSelection(source, selected, result.mask, mode);
        presentation.selection(expected, selected);
        emit({ busy: false });
        return;
      }
      const rgba = composeRasterRegion(source, {
          x: result.seed.x,
          y: result.seed.y,
          width: 1,
          height: 1,
        }),
        offset = 0;
      const key =
        tool === 'remove-color'
          ? ([rgba[offset]!, rgba[offset + 1]!, rgba[offset + 2]!, 255] as const)
          : color();
      const value = await compute.run(
        {
          kind: 'edit',
          metadata: expected.metadata,
          pixels: source,
          region: result.mask,
          selection: restriction,
          action: tool === 'fill' ? 'fill' : 'remove',
          color: key,
        },
        signal
      );
      await publish(expected, revision, signal, value);
    } catch (error) {
      fail(error, expected, revision);
    }
  }
  function draftCropBounds(draft: Gesture): PixelBounds | null {
    const size = draft.target.geometry;
    const fixedRatios = { free: null, '1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9 };
    const ratio =
      snapshot.cropRatio === 'original'
        ? size.width / size.height
        : fixedRatios[snapshot.cropRatio];
    return rasterCropBounds(size, draft.points[0]!, draft.points[draft.points.length - 1]!, ratio);
  }
  function showFullSource(expected: RasterTarget, source: RasterPixelData) {
    presentation.pixels(expected, source, {
      planes: source,
      coverage: new Uint8Array(0),
      dirtyBounds: { x: 0, y: 0, width: source.width, height: source.height },
      pixels: composeRasterPixels(source),
    });
    presentation.crop(expected, null);
  }
  async function previewCrop() {
    if (!target || target.permission !== 'allowed') return;
    const expected = target,
      { revision, signal } = start(expected);
    try {
      const source = await decoded(expected, revision, signal);
      if (source && retainCurrentTarget(expected, revision) && snapshot.tool === 'crop') {
        showFullSource(expected, source);
        emit({ busy: false });
      }
    } catch (error) {
      fail(error, expected, revision);
    }
  }
  function beginGesture(point: SourcePoint): boolean {
    refresh();
    if (!target || target.permission !== 'allowed' || snapshot.busy || !snapshot.tool) return false;
    if (
      snapshot.tool === 'fill' ||
      snapshot.tool === 'remove-color' ||
      (snapshot.tool === 'select' && snapshot.selectionMethod === 'wand')
    ) {
      void click(point);
      return true;
    }
    if (!isRasterSourcePointVisible(target.geometry, point) && snapshot.tool !== 'crop')
      return false;
    const expected = target,
      prior = selected,
      { revision, signal } = start(expected);
    const draft: Gesture = {
      target: expected,
      generation: revision,
      tool: snapshot.tool,
      method: snapshot.selectionMethod,
      mode: snapshot.selectionMode,
      points: [point],
      selection: prior,
      pixels: null,
      stroke: null,
      released: false,
      ready: Promise.resolve(),
    };
    gesture = draft;
    if (draft.tool === 'erase' || draft.tool === 'restore') {
      draft.ready = (async () => {
        try {
          const source = await decoded(expected, revision, signal);
          if (!source || !retainCurrentTarget(expected, revision) || gesture !== draft) return;
          draft.pixels = source;
          draft.stroke = createRasterBrushStroke({
            planes: source,
            geometry: expected.geometry,
            diameter: snapshot.settings.brushSize,
            hardness: snapshot.settings.hardness / 100,
            mode: draft.tool === 'restore' ? 'restore' : 'erase',
            selection: workingSelectionMask(expected.geometry, prior),
          });
          for (const p of draft.points) presentation.pixels(expected, source, draft.stroke.add(p));
        } catch (error) {
          fail(error, expected, revision);
        }
      })();
    } else if (draft.tool === 'crop') {
      draft.ready = (async () => {
        try {
          const source = await decoded(expected, revision, signal);
          if (source && retainCurrentTarget(expected, revision) && gesture === draft) {
            showFullSource(expected, source);
            presentation.crop(expected, draftCropBounds(draft));
            emit({ busy: false });
          }
        } catch (error) {
          fail(error, expected, revision);
        }
      })();
    } else emit({ busy: false });
    return true;
  }
  function moveGesture(point: SourcePoint) {
    const draft = gesture;
    if (!draft || draft.released || !retainCurrentTarget(draft.target, draft.generation)) return;
    draft.points.push(point);
    try {
      if (draft.stroke && draft.pixels)
        presentation.pixels(draft.target, draft.pixels, draft.stroke.add(point));
      else if (draft.tool === 'crop') presentation.crop(draft.target, draftCropBounds(draft));
      else if (draft.tool === 'select')
        presentation.selection(
          draft.target,
          gestureSelectionMask(
            draft.target.geometry,
            draft.points,
            draft.method === 'lasso' ? 'lasso' : 'rectangle'
          )
        );
    } catch (error) {
      fail(error, draft.target, draft.generation);
    }
  }
  async function endGesture(point: SourcePoint) {
    const draft = gesture;
    if (!draft || draft.released) return;
    moveGesture(point);
    draft.released = true;
    await draft.ready;
    if (!retainCurrentTarget(draft.target, draft.generation) || gesture !== draft) return;
    gesture = null;
    try {
      if (draft.stroke && draft.pixels && abort) {
        const preview = draft.stroke.finish();
        presentation.pixels(draft.target, draft.pixels, preview);
        emit({ busy: true });
        const value = await compute.run(
          {
            kind: 'encode',
            metadata: draft.target.metadata,
            before: draft.pixels,
            after: preview.planes,
          },
          abort.signal
        );
        await publish(draft.target, draft.generation, abort.signal, value);
      } else if (draft.tool === 'crop') {
        crop = draftCropBounds(draft);
        presentation.crop(draft.target, crop);
        emit({ busy: false });
      } else {
        const incoming = gestureSelectionMask(
            draft.target.geometry,
            draft.points,
            draft.method === 'lasso' ? 'lasso' : 'rectangle'
          ),
          bounds = workingSelectionMask(draft.target.geometry, null);
        for (let i = 0; i < incoming.length; i++) if (!bounds[i]) incoming[i] = 0;
        selected = combineSelection(draft.target.geometry, draft.selection, incoming, draft.mode);
        presentation.selection(draft.target, selected);
        emit({ busy: false });
      }
    } catch (error) {
      fail(error, draft.target, draft.generation);
    }
  }
  async function applyCrop() {
    if (!target || !crop || target.permission !== 'allowed') return;
    const expected = target,
      nextCrop = crop,
      { revision, signal } = start(expected);
    try {
      const source = await decoded(expected, revision, signal);
      if (!source || !retainCurrentTarget(expected, revision)) return;
      const value = await compute.run(
        { kind: 'encode', metadata: expected.metadata, before: source, after: source },
        signal
      );
      if (value.kind !== 'encoded' || !retainCurrentTarget(expected, revision)) return;
      value.candidate.metadata = {
        ...value.candidate.metadata,
        sniptaleRasterState: { ...value.candidate.metadata.sniptaleRasterState, crop: nextCrop },
      };
      await publish(expected, revision, signal, value);
    } catch (error) {
      fail(error, expected, revision);
    }
  }
  async function copySelected() {
    refresh();
    if (!target || snapshot.busy) return;
    const expected = target,
      mask = workingSelectionMask(expected.geometry, selected),
      bounds = selectionBounds(expected.geometry, mask);
    if (!bounds) return;
    const { revision, signal } = start(expected);
    try {
      const source = await decoded(expected, revision, signal);
      if (!source || !retainCurrentTarget(expected, revision)) return;
      const result = await compute.run(
        { kind: 'fragment', pixels: source, selection: mask, bounds },
        signal
      );
      if (!retainCurrentTarget(expected, revision) || result.kind !== 'fragment') return;
      const copied = await adapter.copy(expected, result.dataUrl, bounds, signal, mask);
      if (retainCurrentTarget(expected, revision))
        emit({ busy: false, error: copied ? null : 'compute-failed' });
      else refresh();
    } catch (error) {
      fail(error, expected, revision);
    }
  }
  const session = {
    retainOwnReplacementEvent(
      kind: 'removed' | 'added' | 'cleared' | 'selected',
      objects: readonly FabricObject[]
    ) {
      const transition = ownReplacement;
      if (!transition) return false;
      const expected =
        kind === 'removed' || kind === 'cleared' ? transition.previous : transition.next;
      if (
        !disposed &&
        generation === transition.revision &&
        objects.every((object) => object === expected)
      )
        return true;
      cancel();
      return false;
    },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    getTarget: () => target,
    setTool(tool: RasterTool) {
      refresh();
      cancel();
      emit({ tool: target ? tool : null, error: null });
      options.onModeChange?.(!!tool && !!target && target.permission === 'allowed');
      if (tool === 'crop' && target) void previewCrop();
    },
    updateSettings(change: Partial<RasterSettings>) {
      const next = { ...snapshot.settings, ...change };
      if (
        !Number.isFinite(next.tolerance) ||
        next.tolerance < 0 ||
        next.tolerance > 100 ||
        !Number.isInteger(next.grow) ||
        next.grow < 0 ||
        next.grow > 32768 ||
        !Number.isFinite(next.brushSize) ||
        next.brushSize < 1 ||
        next.brushSize > 32768 ||
        !Number.isFinite(next.hardness) ||
        next.hardness < 0 ||
        next.hardness > 100 ||
        typeof next.contiguous !== 'boolean' ||
        new Color(next.color).isUnrecognised
      )
        return;
      cancel();
      emit({ settings: next });
    },
    setSelectionMethod(selectionMethod: RasterSelectionMethod) {
      cancel();
      emit({ selectionMethod });
    },
    setSelectionMode(selectionMode: RasterSelectionMode) {
      cancel();
      emit({ selectionMode });
    },
    setCropRatio(cropRatio: RasterCropRatio) {
      emit({ cropRatio });
    },
    clearSelection() {
      cancel();
      selected = null;
      if (target) presentation.selection(target, selected);
      emit();
    },
    selectAll() {
      cancel();
      if (target) {
        selected = workingSelectionMask(target.geometry, null);
        presentation.selection(target, selected);
        emit();
      }
    },
    invertSelection() {
      cancel();
      if (target) {
        selected = invertSelection(target.geometry, selected);
        const bounds = workingSelectionMask(target.geometry, null);
        for (let i = 0; i < selected.length; i++) if (!bounds[i]) selected[i] = 0;
        presentation.selection(target, selected);
        emit();
      }
    },
    fillSelected: () => editSelected('fill'),
    hideSelected: () => editSelected('hide'),
    copySelected,
    applyCrop,
    cancelCrop: cancel,
    allowContentEditing() {
      if (target) {
        cancel();
        adapter.allowContentEditing(target);
        refresh();
      }
    },
    async flipHorizontal() {
      if (target) {
        const expected = target;
        cancel();
        try {
          await adapter.flip(expected, 'horizontal');
          refresh();
        } catch (error) {
          session.reportError(error);
        }
      }
    },
    async flipVertical() {
      if (target) {
        const expected = target;
        cancel();
        try {
          await adapter.flip(expected, 'vertical');
          refresh();
        } catch (error) {
          session.reportError(error);
        }
      }
    },
    moveCursor(point: SourcePoint) {
      if (target && (snapshot.tool === 'erase' || snapshot.tool === 'restore'))
        presentation.cursor?.(target, point, snapshot.settings.brushSize);
    },
    showPreparedPreview(targetId: string, preview: { object: FabricObject; dispose(): void }) {
      const expected = adapter.resolveById(targetId);
      if (!expected || !adapter.isCurrent(expected) || disposed) {
        preview.dispose();
        return false;
      }
      presentation.prepared(expected, preview);
      return true;
    },
    clearPreparedPreview() {
      cancel();
    },
    async runCorrectionPreparation(
      targetId: string,
      work: (signal: AbortSignal, isCurrent: () => boolean) => Promise<void>
    ) {
      cancel();
      if (disposed) return;
      abort = new AbortController();
      const revision = generation,
        signal = abort.signal;
      try {
        await adapter.hydrateTarget(signal, targetId);
        if (disposed || generation !== revision || signal.aborted) return;
        const expected = adapter.resolveById(targetId);
        if (!expected) return;
        const admitted = () =>
          !disposed && generation === revision && !signal.aborted && adapter.isCurrent(expected);
        await work(signal, admitted);
      } catch (error) {
        if (!disposed && generation === revision && !signal.aborted)
          emit({ error: rasterComputeFailure(error) });
      }
    },
    reportError(error: unknown) {
      if (!disposed) emit({ error: rasterComputeFailure(error) });
    },
    beginGesture,
    moveGesture,
    endGesture,
    cancel,
    handlesDelete() {
      return !!snapshot.tool && !!target && target.permission === 'allowed';
    },
    dispose() {
      if (disposed) return;
      cancelWork();
      disposed = true;
      compute.dispose();
      listeners.clear();
      options.onModeChange?.(false);
    },
  };
  refresh();
  return session;
}
export type RasterSession = ReturnType<typeof createRasterSession>;
