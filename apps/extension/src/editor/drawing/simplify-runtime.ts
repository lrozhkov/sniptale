import { captureSource, createManualSource, sourceCoversDrawing } from './simplify-source';
import { pendingPresentation } from './simplify-presentation';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { FabricImage, type Canvas, type FabricObject } from 'fabric';
import type { DrawingSimplifyObject, DrawingSimplifySnapshot } from '../../features/drawing/public';
import type { SimplifySettings } from '../../features/simplify/settings';
import type { SimplifyComputeRegion } from '../../contracts/messaging/contracts/runtime-message/simplify.types';
import { CUSTOM_JSON_PROPS } from '../document/model/custom-json-props';
import {
  createEditorDrawingSimplifyObject,
  sampleEditorSimplifyRegion,
  setEditorSimplifyGeometryPreview,
} from './object/simplify';
import { readEditorDrawingObject } from './object/metadata';

export interface EditorSimplifyCompute {
  render(input: {
    source: DrawingSimplifySnapshot;
    region: SimplifyComputeRegion;
    settings: SimplifySettings;
  }): Promise<DrawingSimplifySnapshot & { version: string }>;
  cancel(): void;
  dispose(): void;
}
interface EditorSimplifyRuntimeOptions {
  canvas: Canvas;
  createCompute: () => EditorSimplifyCompute;
  prepareObject: (object: FabricObject) => void;
  commitHistory: () => void;
  syncRuntimeState: () => void;
  reportFailure?: (error: unknown) => void;
  publishDerived?: () => boolean;
}
type Job = {
  cleanup: () => void;
  complete: () => void;
  generation: number;
  preview: boolean;
  sourceContext: string;
  derived: boolean;
};
type Runtime = {
  options: EditorSimplifyRuntimeOptions;
  jobs: Map<FabricObject, Job>;
  presentations: Set<ReturnType<typeof pendingPresentation>>;
  dispose: () => void;
  generation: number;
  compute: EditorSimplifyCompute;
  active: Job | null;
  tail: Promise<void>;
  sourceContexts: WeakMap<FabricObject, string>;
  visualRevisions: WeakMap<
    FabricObject,
    { json: string; src: unknown; backdrop: unknown; revision: number }
  >;
  nextVisualRevision: number;
  pendingRefresh: Set<FabricObject>;
};
const runtimes = new WeakMap<Canvas, Runtime>();

/** Installs one lifecycle owner; composition supplies transport and controller commands. */
export function unmountEditorSimplifyRuntime(canvas: Canvas): void {
  runtimes.get(canvas)?.dispose();
}

export function mountEditorSimplifyRuntime(options: EditorSimplifyRuntimeOptions): () => void {
  runtimes.get(options.canvas)?.dispose();
  const runtime: Runtime = {
    options,
    jobs: new Map(),
    presentations: new Set(),
    generation: 0,
    dispose: () => undefined,
    compute: options.createCompute(),
    active: null,
    tail: Promise.resolve(),
    sourceContexts: new WeakMap(),
    visualRevisions: new WeakMap(),
    nextVisualRevision: 0,
    pendingRefresh: new Set(),
  };
  const cancel = (object: FabricObject) => {
    const job = runtime.jobs.get(object);
    if (!job) return;
    runtime.jobs.delete(object);
    job.cleanup();
    if (runtime.active === job) runtime.compute.cancel();
  };
  const added = options.canvas.on('object:added', ({ target }) => {
    const drawing = readEditorDrawingObject(target);
    if (drawing?.kind === 'simplify' && drawing.result && !drawing.sourceDirty)
      runtime.sourceContexts.set(target, lowerContext(runtime, target));
  });
  const removed = options.canvas.on('object:removed', ({ target }) => cancel(target));
  const clearPreviews = () => {
    for (const [object, job] of runtime.jobs) if (job.preview) cancel(object);
    if (!runtime.active) runtime.compute.cancel();
  };
  const selectionCleared = options.canvas.on('selection:cleared', clearPreviews);
  const selectionUpdated = options.canvas.on('selection:updated', clearPreviews);
  runtime.dispose = () => {
    runtime.generation += 1;
    for (const object of runtime.jobs.keys()) cancel(object);
    runtime.pendingRefresh.clear();
    for (const presentation of runtime.presentations) presentation.cleanup();
    runtime.presentations.clear();
    runtime.compute.dispose();
    removed();
    added();
    selectionCleared();
    selectionUpdated();
    if (runtimes.get(options.canvas) === runtime) runtimes.delete(options.canvas);
  };
  runtimes.set(options.canvas, runtime);
  for (const object of options.canvas.getObjects()) {
    const drawing = readEditorDrawingObject(object);
    if (drawing?.kind === 'simplify' && drawing.result && !drawing.sourceDirty)
      runtime.sourceContexts.set(object, lowerContext(runtime, object));
  }
  return runtime.dispose;
}

function commitComputedObject(
  runtime: Runtime,
  object: FabricObject,
  drawing: DrawingSimplifyObject,
  job: Job,
  result: DrawingSimplifySnapshot & { version: string },
  source: NonNullable<DrawingSimplifyObject['source']>,
  nextSettings: SimplifySettings,
  decoded: FabricImage
): void {
  const canvas = runtime.options.canvas;
  const { sourceDirty: _dirty, ...acceptedDrawing } = drawing;
  const next = createEditorDrawingSimplifyObject(
    {
      ...acceptedDrawing,
      settings: nextSettings,
      engineVersion: result.version,
      ...(!nextSettings.automatic && nextSettings.manualKind === 'image' ? {} : { source }),
      result,
    },
    1,
    decoded.getElement()
  );
  if (object.sniptaleLabel !== undefined) next.sniptaleLabel = object.sniptaleLabel;
  if (object.sniptaleLocked !== undefined) next.sniptaleLocked = object.sniptaleLocked;
  next.visible = object.visible;
  const index = canvas.getObjects().indexOf(object);
  const selected = canvas.getActiveObjects().includes(object);
  runtime.jobs.delete(object);
  canvas.remove(object);
  canvas.insertAt(index, next);
  runtime.sourceContexts.set(next, job.sourceContext);
  runtime.options.prepareObject(next);
  if (selected) canvas.setActiveObject(next);
  // Paint the decoded result before removing its pending blur cover.
  canvas.renderAll();
  job.complete();
  notifyEditorSimplifyDocumentCommit(canvas);
  if (job.derived) runtime.options.publishDerived?.();
  else runtime.options.commitHistory();
  runtime.options.syncRuntimeState();
}

/** Replaces only the current live object after computation and image decode succeed. */
export function requestEditorSimplify(
  canvas: Canvas,
  object: FabricObject,
  settings?: SimplifySettings,
  preview = false,
  derived = false
): boolean {
  const runtime = runtimes.get(canvas);
  const drawing = readEditorDrawingObject(object);
  if (!runtime || drawing?.kind !== 'simplify') return false;
  const previous = runtime.jobs.get(object);
  previous?.cleanup();
  if (previous && runtime.active === previous) runtime.compute.cancel();
  runtime.jobs.delete(object);
  if (preview && JSON.stringify(settings) === JSON.stringify(drawing.settings)) return true;
  const compute = runtime.compute;
  const presentation = pendingPresentation(canvas, drawing, () =>
    runtime.presentations.delete(presentation)
  );
  runtime.presentations.add(presentation);
  setEditorSimplifyGeometryPreview(object, !drawing.result || Boolean(drawing.sourceDirty));
  const job: Job = {
    cleanup: () => {
      presentation.cleanup();
      setEditorSimplifyGeometryPreview(object, false);
      object.canvas?.requestRenderAll();
    },
    complete: () => {
      setEditorSimplifyGeometryPreview(object, false);
      presentation.complete();
    },
    generation: runtime.generation,
    preview,
    derived,
    sourceContext: lowerContext(runtime, object),
  };
  runtime.jobs.set(object, job);
  const metadata = object.sniptaleDrawingJson;
  let capturedContext: string | null = null;
  const isCurrent = () =>
    runtimes.get(canvas) === runtime &&
    runtime.generation === job.generation &&
    runtime.jobs.get(object) === job &&
    canvas.getObjects().includes(object) &&
    object.sniptaleDrawingJson === metadata &&
    (capturedContext === null || lowerContext(runtime, object) === capturedContext);
  let retainedPreview = false;
  runtime.tail = runtime.tail.then(async () => {
    if (
      !drawing.result &&
      !drawing.source &&
      (drawing.settings.automatic || drawing.settings.manualKind === 'text')
    ) {
      // Two frames allow the pending overlay to paint before synchronous rasterization.
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          document.removeEventListener('visibilitychange', onVisibility);
          resolve();
        };
        const onVisibility = () => {
          if (document.hidden) finish();
        };
        document.addEventListener('visibilitychange', onVisibility);
        onVisibility();
        requestAnimationFrame(() => requestAnimationFrame(finish));
      });
    }
    if (!isCurrent()) return;
    runtime.active = job;
    try {
      const nextSettings = settings ?? drawing.settings;
      capturedContext = lowerContext(runtime, object);
      const knownContext = runtime.sourceContexts.get(object);
      const previousManualImage =
        !drawing.settings.automatic && drawing.settings.manualKind === 'image';
      const retainedSource =
        !previousManualImage &&
        drawing.source &&
        sourceCoversDrawing(canvas, drawing.source, drawing) &&
        (knownContext === capturedContext || (knownContext === undefined && !drawing.sourceDirty))
          ? drawing.source
          : undefined;
      job.sourceContext = capturedContext;
      const source =
        !nextSettings.automatic && nextSettings.manualKind === 'image'
          ? createManualSource(drawing)
          : (retainedSource ?? captureSource(canvas, object));
      const region = sampleEditorSimplifyRegion(
        { ...drawing, settings: nextSettings },
        source
      ).region;
      const result = await compute.render({
        source,
        region:
          !nextSettings.automatic && nextSettings.manualKind === 'text' && drawing.rotation
            ? { ...region, rotation: drawing.rotation }
            : region,
        settings: nextSettings,
      });
      if (!isCurrent()) return;
      const decoded = await FabricImage.fromURL(result.dataUrl);
      if (!isCurrent()) return;
      if (preview) {
        retainedPreview = true;
        presentation.show(result.dataUrl, source);
        return;
      }
      commitComputedObject(runtime, object, drawing, job, result, source, nextSettings, decoded);
    } catch (error) {
      if (isCurrent()) {
        if (!drawing.result) {
          runtime.jobs.delete(object);
          job.cleanup();
          canvas.remove(object);
        }
        runtime.options.reportFailure?.(error);
        runtime.options.syncRuntimeState();
      }
    } finally {
      if (runtime.jobs.get(object) === job && !retainedPreview) {
        runtime.jobs.delete(object);
        job.cleanup();
      }
      if (runtime.active === job) runtime.active = null;
    }
  });
  return true;
}

export function cancelPendingEditorSimplify(canvas: Canvas, consumeDerived = true): boolean {
  const runtime = runtimes.get(canvas);
  if (!runtime || (runtime.jobs.size === 0 && runtime.pendingRefresh.size === 0)) return false;
  const consumed = consumeDerived || [...runtime.jobs.values()].some((job) => !job.derived);
  runtime.generation += 1;
  runtime.pendingRefresh.clear();
  for (const [object, job] of runtime.jobs) {
    job.cleanup();
    const drawing = readEditorDrawingObject(object);
    if (drawing?.kind === 'simplify' && !drawing.result) canvas.remove(object);
  }
  runtime.jobs.clear();
  runtime.compute.cancel();
  canvas.requestRenderAll();
  runtime.options.syncRuntimeState();
  return consumed;
}

function lowerContext(runtime: Runtime, object: FabricObject): string {
  const objects = runtime.options.canvas.getObjects();
  const index = objects.indexOf(object);
  return objects
    .slice(0, Math.max(0, index))
    .filter((entry) => entry.visible !== false)
    .map((entry) => {
      const serialized: unknown = entry.toObject([...CUSTOM_JSON_PROPS]);
      if (!isPlainRecord(serialized)) throw new Error('Invalid lower drawing snapshot.');
      const drawing = readEditorDrawingObject(entry);
      if (drawing?.kind === 'simplify') {
        const { sourceDirty: _dirty, source: _source, result: _result, ...visualDrawing } = drawing;
        serialized['sniptaleDrawingJson'] = JSON.stringify(visualDrawing);
      }
      const {
        src,
        sniptaleLabel: _label,
        sniptaleLocked: _locked,
        sniptaleSimplifySourceData: _source,
        sniptaleBlurSourceData: backdrop,
        selectable: _selectable,
        evented: _evented,
        ...visual
      } = serialized;
      const json = JSON.stringify(visual);
      let known = runtime.visualRevisions.get(entry);
      if (!known || known.json !== json || known.src !== src || known.backdrop !== backdrop) {
        known = { json, src, backdrop, revision: ++runtime.nextVisualRevision };
        runtime.visualRevisions.set(entry, known);
      }
      return known.revision;
    })
    .join(',');
}

/** Carries the existing source context through canonical geometry replacement. */
export function carryEditorSimplifySourceContext(
  canvas: Canvas,
  previous: FabricObject,
  next: FabricObject
): void {
  const runtime = runtimes.get(canvas);
  const context = runtime?.sourceContexts.get(previous);
  if (runtime && context !== undefined) runtime.sourceContexts.set(next, context);
}

/** Rebuilds only Simplify objects invalidated by their own geometry or settings edit. */
export function notifyEditorSimplifyDocumentCommit(canvas: Canvas): void {
  const runtime = runtimes.get(canvas);
  if (!runtime) return;
  for (const object of canvas.getObjects()) {
    const drawing = readEditorDrawingObject(object);
    if (drawing?.kind !== 'simplify' || !drawing.sourceDirty) continue;
    const context = lowerContext(runtime, object);
    if (runtime.jobs.get(object)?.sourceContext === context || runtime.pendingRefresh.has(object))
      continue;
    runtime.pendingRefresh.add(object);
    const generation = runtime.generation;
    queueMicrotask(() => {
      runtime.pendingRefresh.delete(object);
      if (
        runtimes.get(canvas) !== runtime ||
        runtime.generation !== generation ||
        !canvas.getObjects().includes(object)
      )
        return;
      const current = readEditorDrawingObject(object);
      if (current?.kind === 'simplify' && current.sourceDirty)
        requestEditorSimplify(canvas, object, current.settings, false, Boolean(current.result));
    });
  }
}
