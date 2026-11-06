import { prepareDrawingSimplifySelection, isSimplifyRegionTooSmall } from './simplify-object';
import { createSimplifySourceCapture, type SimplifySourceCaptureOptions } from './simplify-capture';
import { createDrawingId, translateDrawingObject } from '../../features/drawing/public';
import {
  createSimplifyComputeClient,
  type SimplifyComputeDependencies,
} from '../../workflows/simplify/compute-client';
import type {
  DrawingObject,
  DrawingSession,
  DrawingSimplifyObject,
  DrawingSimplifySource,
} from '../../features/drawing/public';
import type { SimplifySettings } from '../../features/simplify/settings';

type SimplifyPending = {
  readonly object: DrawingSimplifyObject;
  readonly updating: boolean;
};
type SimplifyFeedback = 'failed' | 'too-small' | 'no-source' | null;
export interface ContentSimplifyDependencies extends SimplifyComputeDependencies {
  acquire(event: Event, signal?: AbortSignal): Promise<DrawingSimplifySource>;
  decode(dataUrl: string): Promise<void>;
}
export interface ContentSimplifyRuntime {
  prepare(event: Event, projectionCurrent?: () => boolean): Promise<DrawingSimplifySource>;
  cancelPreparation(): void;
  submit(
    object: DrawingSimplifyObject,
    event?: Event,
    prepared?: DrawingSimplifySource | Promise<DrawingSimplifySource>
  ): Promise<void>;
  /** Recomputes target masks and admits a transformed selection in one history step. */
  transform(objects: readonly DrawingObject[]): Promise<void>;
  duplicate(): Promise<void>;
  update(object: DrawingSimplifyObject, patch: Partial<SimplifySettings>): Promise<void>;
  rebuild(object: DrawingSimplifyObject): Promise<void>;
  getPending(): readonly SimplifyPending[];
  getPendingObjects(): readonly DrawingObject[];
  getFeedback(): SimplifyFeedback;
  getRevision(): number;
  subscribe(listener: () => void): () => void;
  cancel(): void;
  dispose(): void;
}

/** Creates the runtime capture adapter with explicit content transport and projection owners. */
export function createContentSimplifyDependencies(
  options: SimplifySourceCaptureOptions
): ContentSimplifyDependencies {
  return {
    send: (request) => options.services.messaging.sendRuntimeMessage(request),
    acquire: createSimplifySourceCapture(options),
    async decode(dataUrl) {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Simplify result could not be decoded.'));
        image.src = dataUrl;
      });
    },
  };
}

function planSimplifyTransaction(
  objects: readonly DrawingObject[],
  existing: readonly DrawingObject[],
  append: boolean,
  anchors: readonly DrawingObject[]
) {
  const before = new Map(existing.map((object) => [object.id, object]));
  const baselines = new Map(
    objects.flatMap((object) => {
      const value = before.get(object.id);
      return value ? [[object.id, value] as const] : [];
    })
  );
  for (const anchor of anchors) baselines.set(anchor.id, anchor);
  const creating = append || (objects.length === 1 && !before.has(objects[0]!.id));
  return !creating && baselines.size !== objects.length ? null : { baselines, creating };
}

class ContentSimplifyRuntimeOwner implements ContentSimplifyRuntime {
  private readonly session: DrawingSession;
  private readonly deps: ContentSimplifyDependencies;
  private readonly compute: ReturnType<typeof createSimplifyComputeClient>;
  private readonly unsubscribe: () => void;
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  private feedback: SimplifyFeedback = null;
  private retained: DrawingSimplifySource | null = null;
  private disposed = false;
  private acquisitionAbort: AbortController | null = null;
  private preparationAbort: AbortController | null = null;
  private preparationValid: (() => boolean) | null = null;
  private preparing: { object: DrawingSimplifyObject; token: AbortController } | null = null;
  private generation = 0;
  private cacheOwners = new Set<string>();
  private pending: {
    objects: readonly DrawingObject[];
    baselines: ReadonlyMap<string, DrawingObject>;
    activeTool: ReturnType<DrawingSession['getSnapshot']>['activeTool'];
  } | null = null;

  constructor(session: DrawingSession, deps: ContentSimplifyDependencies) {
    this.session = session;
    this.deps = deps;
    this.compute = createSimplifyComputeClient(deps);
    this.unsubscribe = this.session.subscribe(() => {
      const current = new Map(
        this.session.getSnapshot().document.objects.map((object) => [object.id, object])
      );
      if (
        this.pending &&
        (this.session.getSnapshot().activeTool !== this.pending.activeTool ||
          [...this.pending.baselines].some(([id, object]) => current.get(id) !== object))
      )
        this.cancel();
      if (
        !this.pending &&
        !this.session.getSnapshot().selectedObjectIds.some((id) => this.cacheOwners.has(id))
      )
        this.compute.cancel();
    });
  }

  private publish = () => {
    this.revision += 1;
    this.listeners.forEach((listener) => listener());
  };
  cancel = () => {
    this.cancelPreparation();
    this.acquisitionAbort?.abort();
    this.acquisitionAbort = null;
    this.generation += 1;
    this.pending = null;
    this.compute.cancel();
    this.publish();
  };
  private commitObjects(accepted: DrawingObject[], creating: boolean): void {
    this.cacheOwners = new Set(
      accepted.filter((object) => object.kind === 'simplify').map((object) => object.id)
    );
    this.pending = null;
    if (creating) this.session.commitObjects(accepted, { select: true });
    else this.session.replaceObjects(accepted);
    const committed = new Map(
      this.session.getSnapshot().document.objects.map((object) => [object.id, object])
    );
    if (accepted.some((object) => committed.get(object.id) !== object)) this.feedback = 'failed';
  }
  private run = async (
    objects: readonly DrawingObject[],
    event?: Event,
    force = true,
    append = false,
    anchors: readonly DrawingObject[] = [],
    preparedSource?: DrawingSimplifySource
  ) => {
    if (this.disposed || objects.length === 0) return;
    if (objects.some(isSimplifyRegionTooSmall)) {
      this.feedback = 'too-small';
      this.publish();
      return;
    }
    const plan = planSimplifyTransaction(
      objects,
      this.session.getSnapshot().document.objects,
      append,
      anchors
    );
    if (!plan) return;
    const { baselines, creating } = plan;
    if (this.pending) this.compute.cancel();
    this.acquisitionAbort?.abort();
    const abort = new AbortController();
    this.acquisitionAbort = abort;
    const ownGeneration = ++this.generation;
    const current = () => !this.disposed && this.generation === ownGeneration;
    this.pending = { objects, baselines, activeTool: this.session.getSnapshot().activeTool };
    this.feedback = null;
    this.publish();
    let acquiring = false;
    try {
      const accepted = await prepareDrawingSimplifySelection(
        { objects, baselines, force, append },
        (object) => object.source ?? preparedSource ?? (creating && !append ? this.retained : null),
        {
          current,
          render: this.compute.render,
          decode: (dataUrl) => this.deps.decode(dataUrl),
          ...(creating && event
            ? {
                acquire: async () => {
                  acquiring = true;
                  const source = await this.deps.acquire(event, abort.signal);
                  acquiring = false;
                  if (current()) this.retained = source;
                  return source;
                },
              }
            : {}),
        }
      );
      if (!current()) return;
      if (!accepted) {
        this.feedback = 'no-source';
        return;
      }
      this.commitObjects(accepted, creating);
    } catch {
      if (current()) this.feedback = acquiring ? 'no-source' : 'failed';
    } finally {
      if (current()) {
        this.pending = null;
        this.publish();
      }
    }
  };
  prepare = async (
    event: Event,
    projectionCurrent?: () => boolean
  ): Promise<DrawingSimplifySource> => {
    this.cancelPreparation();
    const abort = new AbortController();
    this.preparationAbort = abort;
    const snapshot = this.session.getSnapshot();
    const document = snapshot.document;
    const tool = snapshot.activeTool;
    const scrollX = window.scrollX,
      scrollY = window.scrollY,
      scale = window.devicePixelRatio;
    const valid = () => {
      const current = this.session.getSnapshot();
      return (
        current.document === document &&
        current.activeTool === tool &&
        window.scrollX === scrollX &&
        window.scrollY === scrollY &&
        window.devicePixelRatio === scale &&
        (projectionCurrent?.() ?? true)
      );
    };
    this.preparationValid = valid;
    if (this.pending)
      await new Promise<void>((resolve, reject) => {
        const unsubscribe = this.subscribe(() => {
          if (!this.pending) {
            unsubscribe();
            resolve();
          }
        });
        abort.signal.addEventListener(
          'abort',
          () => {
            unsubscribe();
            reject(abort.signal.reason);
          },
          { once: true }
        );
      });
    abort.signal.throwIfAborted();
    if (!valid()) throw new Error('Simplify source changed during preparation.');
    const source = await this.deps.acquire(event, abort.signal);
    abort.signal.throwIfAborted();
    if (!valid()) throw new Error('Simplify source changed during preparation.');
    return source;
  };
  cancelPreparation = (): void => {
    this.preparationAbort?.abort();
    this.preparationAbort = null;
    this.preparationValid = null;
    if (this.preparing) {
      this.preparing = null;
      this.publish();
    }
  };
  submit = async (
    object: DrawingSimplifyObject,
    event?: Event,
    prepared?: DrawingSimplifySource | Promise<DrawingSimplifySource>
  ): Promise<void> => {
    if (!prepared) return this.run([object], event);
    const preparation = this.preparationAbort;
    if (isSimplifyRegionTooSmall(object)) {
      this.cancelPreparation();
      return this.run([object], event);
    }
    if (this.pending) {
      this.acquisitionAbort?.abort();
      this.generation += 1;
      this.pending = null;
      this.compute.cancel();
      this.publish();
    }
    if (preparation) {
      this.preparing = { object, token: preparation };
      this.feedback = null;
      this.publish();
    }
    try {
      const source = prepared instanceof Promise ? await prepared : prepared;
      if (
        this.disposed ||
        !preparation ||
        preparation.signal.aborted ||
        this.preparationAbort !== preparation
      )
        return;
      if (!this.preparationValid?.()) {
        this.feedback = 'no-source';
        this.publish();
        return;
      }
      this.preparationAbort = null;
      this.preparationValid = null;
      if (this.preparing?.token === preparation) this.preparing = null;
      await this.run([object], undefined, true, false, [], source);
    } catch {
      if (
        !this.disposed &&
        preparation &&
        this.preparationAbort === preparation &&
        !preparation.signal.aborted
      ) {
        this.feedback = 'no-source';
        this.publish();
      }
    } finally {
      if (this.preparing?.token === preparation) {
        this.preparing = null;
        this.publish();
      }
    }
  };
  transform = (objects: readonly DrawingObject[]): Promise<void> => {
    return this.run(objects, undefined, false);
  };
  duplicate = (): Promise<void> => {
    const snapshot = this.session.getSnapshot();
    const selected = snapshot.document.objects.filter((object) =>
      snapshot.selectedObjectIds.includes(object.id)
    );
    const copies = selected.map((object) => ({
      ...translateDrawingObject(object, { x: 12, y: 12 }),
      id: createDrawingId(),
    }));
    return this.run(copies, undefined, false, true, selected);
  };
  update = (object: DrawingSimplifyObject, patch: Partial<SimplifySettings>): Promise<void> => {
    const draft = this.pending?.objects.find((item) => item.id === object.id);
    return this.run([
      {
        ...object,
        settings: { ...(draft?.kind === 'simplify' ? draft.settings : object.settings), ...patch },
      },
    ]);
  };
  rebuild = (object: DrawingSimplifyObject): Promise<void> => {
    const draft = this.pending?.objects.find((item) => item.id === object.id);
    return this.run([draft?.kind === 'simplify' ? draft : object]);
  };
  getPending = (): readonly SimplifyPending[] => {
    const computing =
      this.pending?.objects.flatMap((object) =>
        object.kind === 'simplify'
          ? [{ object, updating: this.pending!.baselines.has(object.id) }]
          : []
      ) ?? [];
    return this.preparing
      ? [...computing, { object: this.preparing.object, updating: false }]
      : computing;
  };
  getPendingObjects = (): readonly DrawingObject[] => {
    const computing = this.pending?.objects ?? [];
    return this.preparing ? [...computing, this.preparing.object] : computing;
  };
  getFeedback = (): SimplifyFeedback => {
    return this.feedback;
  };
  getRevision = (): number => {
    return this.revision;
  };
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    this.cancel();
    this.compute.dispose();
    this.retained = null;
    this.listeners.clear();
  };
}

/** Owns disposable async work; only decoded, current results enter one drawing history step. */
export function createContentSimplifyRuntime(
  session: DrawingSession,
  deps: ContentSimplifyDependencies
): ContentSimplifyRuntime {
  return new ContentSimplifyRuntimeOwner(session, deps);
}
