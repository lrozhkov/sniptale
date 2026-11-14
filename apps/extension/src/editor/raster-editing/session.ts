import { Color, type FabricObject } from 'fabric';
import type { RasterTarget, RasterTargetAdapter, RasterPublication } from './adapters';
import type { BackgroundRasterCandidate } from '../controller/background/sync';
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
import { fitRasterCropRatio, transformRasterCrop, type RasterCropAction } from './crop';
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

type RasterTool =
  | 'brush'
  | 'select'
  | 'fill'
  | 'remove-color'
  | 'erase'
  | 'restore'
  | 'crop'
  | null;
type RasterSelectionMethod = 'rectangle' | 'lasso' | 'wand';
type RasterSelectionMode = 'new' | 'add' | 'subtract';
type RasterCropRatio = 'free' | 'original' | '1:1' | '4:3' | '16:9';
interface RasterSettings {
  tolerance: number;
  contiguous: boolean;
  grow: number;
  brushSize: number;
  hardness: number;
  opacity: number;
  color: string;
}
/** Stable UI value: no accepted resources, pixels, masks or Fabric objects enter React. */
export interface RasterSessionSnapshot {
  available: boolean;
  editing: boolean;
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
  draftSelection?(
    target: RasterTarget,
    points: readonly SourcePoint[],
    method: 'rectangle' | 'lasso'
  ): void;
  crop(target: RasterTarget, bounds: PixelBounds | null): void;
  clear(): void;
  hideCursor?(): void;
  cursor?(target: RasterTarget, point: SourcePoint, diameter: number): void;
  prepared(target: RasterTarget, preview: { object: FabricObject; dispose(): void }): void;
}
type Gesture = {
  target: RasterTarget;
  generation: number;
  tool: RasterTool;
  method: RasterSelectionMethod;
  mode: RasterSelectionMode;
  settings: Readonly<RasterSettings>;
  points: SourcePoint[];
  selection: SelectionMask;
  pixels: RasterPixelData | null;
  stroke: RasterBrushStroke | null;
  ready: Promise<void>;
  released: boolean;
  cropStart: {
    bounds: PixelBounds;
    action: RasterCropAction;
    ratio: number | null;
    pending: boolean;
  } | null;
};
function matchesPublication(
  object: FabricObject,
  candidate: Pick<RasterPublication, 'metadata'>
): boolean {
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
  let historyRestore: object | null = null;
  let ownReplacement: { previous: FabricObject; next: FabricObject; revision: number } | null =
    null;
  let snapshot: RasterSessionSnapshot = {
    available: false,
    editing: false,
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
      opacity: 100,
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
    if (historyRestore) return;
    cancelWork();
    if (target && adapter.isCurrent(target)) presentation.selection(target, selected);
    emit({ busy: false });
  }
  function refresh() {
    if (disposed || historyRestore) return;
    const next = adapter.resolve();
    if (target?.identity === next?.identity && target?.revision === next?.revision) return;
    const retainMode =
      target !== null &&
      next !== null &&
      target.identity === next.identity &&
      target.id === next.id &&
      next.permission === 'allowed';
    cancelWork();
    target = next;
    pixels = null;
    selected = null;
    if (!retainMode) options.onModeChange?.(false);
    emit({
      available: next !== null,
      targetId: next?.id ?? null,
      targetName: next?.label ?? '',
      targetKind: next?.kind ?? null,
      permission: next?.permission ?? 'blocked',
      busy: false,
      error: null,
      editing: retainMode && snapshot.editing,
      tool: retainMode ? snapshot.tool : null,
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
    if (selected) presentation.selection(expected, selected);
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
  function observePublicationReplacement(
    expected: RasterTarget,
    revision: number,
    candidate: Pick<RasterPublication, 'metadata'>,
    receipt: { target: RasterTarget | null }
  ): NonNullable<BackgroundRasterCandidate['observeReplacement']> {
    return (next) => {
      if (
        !retainCurrentTarget(expected, revision) ||
        next.sniptaleId !== expected.id ||
        !matchesPublication(next, candidate)
      )
        return () => {};
      const transition = { previous: expected.identity, next, revision };
      ownReplacement = transition;
      return () => {
        if (ownReplacement === transition) ownReplacement = null;
        if (disposed || generation !== revision || target !== expected) return;
        const resolved = adapter.resolve();
        if (
          resolved?.identity === next &&
          resolved.permission === 'allowed' &&
          matchesPublication(next, candidate) &&
          adapter.isCurrent(resolved)
        )
          receipt.target = resolved;
      };
    };
  }
  function completePublication(
    expected: RasterTarget,
    revision: number,
    accepted: boolean,
    receipt: { target: RasterTarget | null }
  ) {
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
      const retainEditing =
        next !== null &&
        (next.identity === expected.identity || (replacement !== null && next.id === expected.id));
      if (!retainEditing) options.onModeChange?.(false);
      emit({
        editing: retainEditing && snapshot.editing,
        tool: retainEditing ? snapshot.tool : null,
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
      accepted = await adapter.publish(
        expected,
        value.candidate,
        signal,
        observePublicationReplacement(expected, revision, value.candidate, receipt)
      );
    } catch (error) {
      if (!disposed && generation === revision && target === expected) {
        ownReplacement = null;
        if (retainCurrentTarget(expected, revision)) fail(error, expected, revision);
      }
      return;
    }
    completePublication(expected, revision, accepted, receipt);
    return accepted;
  }
  async function publishCorrection(
    expected: RasterTarget,
    candidate: BackgroundRasterCandidate,
    signal: AbortSignal
  ): Promise<boolean> {
    if (disposed || signal.aborted || !adapter.isCurrent(expected)) return false;
    const selectedTarget = target;
    if (
      !selectedTarget ||
      selectedTarget.identity !== expected.identity ||
      selectedTarget.id !== expected.id
    )
      return adapter.publishCorrection(expected, candidate, signal);
    const revision = generation;
    const receipt: { target: RasterTarget | null } = { target: null };
    try {
      const accepted = await adapter.publishCorrection(
        expected,
        {
          ...candidate,
          observeReplacement: observePublicationReplacement(
            selectedTarget,
            revision,
            candidate,
            receipt
          ),
        },
        signal
      );
      completePublication(selectedTarget, revision, accepted, receipt);
      return accepted;
    } catch (error) {
      if (!disposed && generation === revision && target === selectedTarget) {
        ownReplacement = null;
        if (retainCurrentTarget(selectedTarget, revision)) fail(error, selectedTarget, revision);
      }
      throw error;
    }
  }
  function color(value: string): readonly [number, number, number, number] {
    const source = new Color(value).getSource();
    return [source[0], source[1], source[2], Math.round(source[3] * 255)];
  }
  async function editSelected(action: 'fill' | 'hide') {
    refresh();
    if (!target || target.permission !== 'allowed' || snapshot.busy) return;
    const expected = target,
      settings = snapshot.settings,
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
            color: color(settings.color),
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
    restriction: SelectionMask,
    settings: Readonly<RasterSettings>
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
        tolerance: Math.round((settings.tolerance * 255) / 100),
        grow: settings.grow,
        contiguous: settings.contiguous,
      },
      signal
    );
    return retainCurrentTarget(expected, revision) && result.kind === 'region'
      ? { mask: result.mask, seed }
      : null;
  }
  async function click(point: SourcePoint, selectionMode = snapshot.selectionMode) {
    refresh();
    if (!target || target.permission !== 'allowed' || snapshot.busy) return;
    const expected = target,
      tool = snapshot.tool,
      settings = snapshot.settings,
      mode = selectionMode;
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
      const result = await query(expected, revision, signal, point, source, restriction, settings);
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
          : color(settings.color);
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
  function cropRatioValue() {
    if (!target || snapshot.cropRatio === 'free') return null;
    const fixed = { '1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9 };
    return snapshot.cropRatio === 'original'
      ? target.geometry.width / target.geometry.height
      : fixed[snapshot.cropRatio];
  }
  function draftCropBounds(draft: Gesture): PixelBounds | null {
    const start = draft.points[0]!,
      end = draft.points[draft.points.length - 1]!;
    const initial = draft.cropStart;
    if (initial && initial.action !== 'new')
      return transformRasterCrop(
        draft.target.geometry,
        initial.bounds,
        initial.action,
        { x: end.x - start.x, y: end.y - start.y },
        initial.ratio
      );
    return rasterCropBounds(draft.target.geometry, start, end, initial?.ratio ?? null);
  }
  function showFullSource(expected: RasterTarget, source: RasterPixelData) {
    presentation.pixels(expected, source, {
      planes: source,
      coverage: new Uint8Array(0),
      strokeBounds: null,
      dirtyBounds: { x: 0, y: 0, width: source.width, height: source.height },
      pixels: composeRasterPixels(source),
    });
    presentation.crop(expected, crop ?? expected.geometry.crop);
  }
  async function previewCrop(constrain = true) {
    if (!target || target.permission !== 'allowed') return;
    const expected = target,
      { revision, signal } = start(expected);
    try {
      const source = await decoded(expected, revision, signal);
      if (source && retainCurrentTarget(expected, revision) && snapshot.tool === 'crop') {
        const ratio = cropRatioValue();
        if (constrain && ratio) {
          const next = fitRasterCropRatio(expected.geometry.crop, ratio);
          if (
            next.x !== expected.geometry.crop.x ||
            next.y !== expected.geometry.crop.y ||
            next.width !== expected.geometry.crop.width ||
            next.height !== expected.geometry.crop.height
          )
            crop = next;
        }
        showFullSource(expected, source);
        emit({ busy: false });
      }
    } catch (error) {
      fail(error, expected, revision);
    }
  }
  function beginGesture(
    point: SourcePoint,
    selectionMode = snapshot.selectionMode,
    cropAction: RasterCropAction = 'new'
  ): boolean {
    refresh();
    if (!target || target.permission !== 'allowed' || snapshot.busy || !snapshot.tool) return false;
    if (
      snapshot.tool === 'fill' ||
      snapshot.tool === 'remove-color' ||
      (snapshot.tool === 'select' && snapshot.selectionMethod === 'wand')
    ) {
      void click(point, selectionMode);
      return true;
    }
    if (!isRasterSourcePointVisible(target.geometry, point) && snapshot.tool !== 'crop')
      return false;
    const expected = target,
      prior = selected,
      settings = snapshot.settings,
      tool = snapshot.tool,
      method = snapshot.selectionMethod,
      cropStart =
        tool === 'crop'
          ? {
              bounds: { ...(crop ?? expected.geometry.crop) },
              action: cropAction,
              ratio: cropRatioValue(),
              pending: crop !== null,
            }
          : null,
      { revision, signal } = start(expected);
    const draft: Gesture = {
      target: expected,
      generation: revision,
      tool,
      method,
      mode: selectionMode,
      settings,
      points: [point],
      selection: prior,
      pixels: null,
      stroke: null,
      released: false,
      cropStart,
      ready: Promise.resolve(),
    };
    gesture = draft;
    if (draft.tool === 'brush' || draft.tool === 'erase' || draft.tool === 'restore') {
      draft.ready = (async () => {
        try {
          const source = await decoded(expected, revision, signal);
          if (!source || !retainCurrentTarget(expected, revision) || gesture !== draft) return;
          draft.pixels = source;
          draft.stroke = createRasterBrushStroke({
            planes: source,
            geometry: expected.geometry,
            diameter: draft.settings.brushSize,
            hardness: draft.settings.hardness / 100,
            ...(draft.tool === 'brush'
              ? {
                  mode: 'paint',
                  color: color(draft.settings.color),
                  opacity: draft.settings.opacity / 100,
                }
              : { mode: draft.tool === 'restore' ? 'restore' : 'erase' }),
            selection: prior,
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
            presentation.crop(expected, draftCropBounds(draft) ?? draft.cropStart?.bounds ?? null);
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
      else if (draft.tool === 'crop')
        presentation.crop(draft.target, draftCropBounds(draft) ?? draft.cropStart?.bounds ?? null);
      else if (draft.tool === 'select')
        presentation.draftSelection?.(
          draft.target,
          draft.points,
          draft.method === 'lasso' ? 'lasso' : 'rectangle'
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
        if (!preview.strokeBounds) {
          presentation.clear();
          presentation.selection(draft.target, selected);
          emit({ busy: false });
          return;
        }
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
        crop = draftCropBounds(draft) ?? (draft.cropStart?.pending ? draft.cropStart.bounds : null);
        presentation.crop(draft.target, crop ?? draft.target.geometry.crop);
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
    if (!target || snapshot.busy || gesture || !crop || target.permission !== 'allowed') return;
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
      const accepted = await publish(expected, revision, signal, value);
      if (
        accepted &&
        generation === revision &&
        snapshot.tool === 'crop' &&
        !snapshot.error &&
        !snapshot.busy
      )
        session.selectTool(null);
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
    getCropBounds: () => crop ?? target?.geometry.crop ?? null,
    /** Suspend pixel input while Undo/Redo replaces the document behind the same layer. */
    suspendForHistory() {
      if (disposed || historyRestore || !snapshot.editing || !target) return null;
      const previous = target,
        tool = snapshot.tool,
        prior = selected,
        token = {};
      cancelWork();
      historyRestore = token;
      emit({ busy: true });
      const isCurrent = () => !disposed && historyRestore === token;
      return {
        targetId: previous.id,
        isCurrent,
        complete() {
          if (!isCurrent()) return;
          historyRestore = null;
          const next = adapter.resolve();
          const retained = next?.id === previous.id && next.permission === 'allowed';
          target = next;
          pixels = null;
          selected =
            retained &&
            next.geometry.width === previous.geometry.width &&
            next.geometry.height === previous.geometry.height &&
            next.metadata.sniptaleRasterOriginalData ===
              previous.metadata.sniptaleRasterOriginalData
              ? prior
                ? workingSelectionMask(next.geometry, prior)
                : null
              : null;
          presentation.clear();
          if (retained) presentation.selection(next, selected);
          emit({
            available: next !== null,
            targetId: next?.id ?? null,
            targetName: next?.label ?? '',
            targetKind: next?.kind ?? null,
            permission: next?.permission ?? 'blocked',
            editing: retained,
            tool: retained ? tool : null,
            busy: false,
            error: null,
          });
          options.onModeChange?.(retained);
          if (retained && tool === 'crop') void previewCrop();
        },
      };
    },
    enterEditing() {
      if (historyRestore) return;
      refresh();
      if (!target || target.permission !== 'allowed') return;
      cancel();
      emit({ editing: true, tool: null, error: null });
      options.onModeChange?.(true);
    },
    exitEditing() {
      historyRestore = null;
      cancel();
      selected = null;
      presentation.clear();
      emit({ editing: false, tool: null });
      options.onModeChange?.(false);
    },
    selectTool(tool: RasterTool) {
      if (historyRestore) return;
      if (!snapshot.editing) return;
      refresh();
      if (!snapshot.editing || !target || target.permission !== 'allowed') return;
      cancel();
      emit({ tool, error: null });
      if (tool === 'crop') void previewCrop();
    },
    setTool(tool: RasterTool) {
      if (historyRestore) return;
      if (tool === null) {
        session.exitEditing();
        return;
      }
      refresh();
      if (!target || target.permission !== 'allowed') return;
      cancel();
      emit({ editing: true, tool, error: null });
      options.onModeChange?.(true);
      if (tool === 'crop') void previewCrop();
    },
    hideCursor() {
      presentation.hideCursor?.();
    },
    updateSettings(change: Partial<RasterSettings>) {
      if (historyRestore) return;
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
        !Number.isFinite(next.opacity) ||
        next.opacity < 0 ||
        next.opacity > 100 ||
        typeof next.contiguous !== 'boolean' ||
        new Color(next.color).isUnrecognised
      )
        return;
      if (!snapshot.busy) cancel();
      emit({ settings: next });
    },
    setSelectionMethod(selectionMethod: RasterSelectionMethod) {
      if (historyRestore) return;
      if (!snapshot.busy) cancel();
      emit({ selectionMethod });
    },
    setSelectionMode(selectionMode: RasterSelectionMode) {
      if (historyRestore) return;
      if (!snapshot.busy) cancel();
      emit({ selectionMode });
    },
    setCropRatio(cropRatio: RasterCropRatio) {
      if (historyRestore) return;
      if (gesture) return;
      emit({ cropRatio });
      const ratio = cropRatioValue();
      if (target && snapshot.tool === 'crop' && !snapshot.busy) {
        if (ratio) crop = fitRasterCropRatio(crop ?? target.geometry.crop, ratio);
        presentation.crop(target, crop ?? target.geometry.crop);
        emit();
      }
    },
    clearSelection() {
      if (historyRestore) return;
      cancel();
      selected = null;
      if (target) presentation.selection(target, selected);
      emit();
    },
    selectAll() {
      if (historyRestore) return;
      cancel();
      if (target) {
        selected = workingSelectionMask(target.geometry, null);
        presentation.selection(target, selected);
        emit();
      }
    },
    invertSelection() {
      if (historyRestore) return;
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
    cancelCrop() {
      cancel();
      if (snapshot.tool === 'crop') void previewCrop(false);
    },
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
      if (
        target &&
        (snapshot.tool === 'brush' || snapshot.tool === 'erase' || snapshot.tool === 'restore')
      )
        presentation.cursor?.(target, point, (gesture?.settings ?? snapshot.settings).brushSize);
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
    /** Publish prepared corrections through the session's existing native replacement admission. */
    publishCorrection,
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
