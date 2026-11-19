import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { transformReviewAnnotationAnchors } from '../../features/video/review/annotation-effects/layout';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EffectBundleCatalogEntry } from '../../features/video/project/effect-bundle/catalog';
import type {
  ReviewAnnotationEffect,
  ReviewAnnotationEffects,
  ReviewAnnotationEffectTransform,
} from '../../features/video/review/annotation-effects/types';
import {
  parseReviewAnnotationEffects,
  readReviewAnnotationEffectDocument,
  reviewAnnotationEffectMatchesDocument,
} from '../../features/video/review/annotation-effects/validation';
import type { ReviewSelection } from '../../features/video/review/types';
import {
  ReviewAnnotationAcquisitionError,
  applyReviewAnnotationCatalogDocument,
} from '../../workflows/video-review/annotation-acquisition';
import type { createVideoReviewSession } from '../../workflows/video-review/session';
import type { ReviewBeforeAction } from './note-transitions';
import type { ReviewAnnotationGeometry } from './annotation-effects-geometry';
import type { ReviewCommandContext, ReviewCommandPort } from './command-context';

/** A transient move updates only stage consumers; the session still owns commit and Undo. */
export interface ReviewAnnotationMovement {
  subscribe(listener: (instance: ReviewAnnotationEffect | null) => boolean | void): () => void;
}

/** Accepted stage geometry notifies its local inspector without updating the editor root. */
interface ReviewAnnotationGeometrySource {
  read(): ReviewAnnotationGeometry | null;
  subscribe(listener: () => void): () => void;
}

type Session = ReturnType<typeof createVideoReviewSession>;
type Patch = Partial<Omit<ReviewAnnotationEffect, 'id' | 'snapshotId' | 'order'>>;
type Gesture = {
  session: Session;
  kind: 'field' | 'placement';
  before: ReviewAnnotationEffect;
  after: ReviewAnnotationEffect;
};
type Failure = 'acquisition' | 'unsupported' | 'save' | 'edit' | 'stale' | 'invalid';
type Choice = {
  catalog: EffectBundleCatalogEntry;
  documentId: string;
  start: number;
  end?: number;
  endMax?: number;
  timeDomain?: 'result';
  locale: string;
  presetId?: string;
  attachment?: ReviewAnnotationEffect['attachment'];
  plane: { width: number; height: number };
};

function sameInstance(first: ReviewAnnotationEffect, second: ReviewAnnotationEffect) {
  const canonical = (instance: ReviewAnnotationEffect) => {
    const parsed = parseReviewAnnotationEffects({ enabled: true, instances: [instance] })
      ?.instances[0];
    return (
      parsed && {
        ...parsed,
        controls: Object.fromEntries(
          Object.entries(parsed.controls).sort(([a], [b]) => a.localeCompare(b))
        ),
        ...(parsed.anchors
          ? {
              anchors: Object.fromEntries(
                Object.entries(parsed.anchors).sort(([a], [b]) => a.localeCompare(b))
              ),
            }
          : {}),
      }
    );
  };
  return JSON.stringify(canonical(first)) === JSON.stringify(canonical(second));
}

/** Disposable gallery commands; content, queue and prepared resources remain owned by the session. */
export function useReviewAnnotationEffects(
  args: {
    session: Session;
    lane: ReviewAnnotationEffects | undefined;
    readLane(): ReviewAnnotationEffects | undefined;
    setLane(
      update: (lane: ReviewAnnotationEffects | undefined) => ReviewAnnotationEffects | undefined,
      discrete?: boolean
    ): void;
    flush(): Promise<void>;
    allowed(): boolean;
    beforeAction?: ReviewBeforeAction | undefined;
    performAction?(action: () => Promise<boolean>): Promise<boolean | undefined>;
    pause(): void;
    commands?: ReviewCommandPort;
    select(selection: ReviewSelection, context?: ReviewCommandContext): void;
  },
  acquire = applyReviewAnnotationCatalogDocument
) {
  const latest = useRef(args);
  latest.current = args;
  const mounted = useRef(true);
  const operation = useRef<AbortController | null>(null);
  const draft = useRef<Gesture | null>(null);
  const [, updateBodyGeometry] = useState(0);
  const bodyMeasurements = useRef(
    new Map<string, { x: number; y: number; width: number; height: number }>()
  ).current;
  const movementListeners = useRef(
    new Set<(instance: ReviewAnnotationEffect | null) => boolean | void>()
  );
  const movement = useRef<ReviewAnnotationMovement>({
    subscribe(listener) {
      movementListeners.current.add(listener);
      return () => {
        movementListeners.current.delete(listener);
      };
    },
  }).current;
  const notifyMovement = useCallback((instance: ReviewAnnotationEffect | null) => {
    let accepted = false;
    for (const listener of movementListeners.current)
      if (listener(instance) === true) accepted = true;
    return accepted;
  }, []);
  const completion = useRef<Promise<boolean> | null>(null);
  const fieldPublication = useRef<{
    staged: number;
    published: number;
    task: Promise<boolean> | null;
  }>({
    staged: 0,
    published: 0,
    task: null,
  });
  const failedChoice = useRef<Choice | null>(null);
  const failedContext = useRef<ReviewCommandContext | undefined>(undefined);
  const geometryOwner = useMemo(() => {
    // Session-local accepted snapshots cannot leak into a replacement source's inspector.
    let current: ReviewAnnotationGeometry | null = null;
    const listeners = new Set<() => void>();
    const geometry: ReviewAnnotationGeometrySource = {
      read: () => current,
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
    return {
      session: args.session,
      geometry,
      setGeometry(next: ReviewAnnotationGeometry | null) {
        if (JSON.stringify(current) === JSON.stringify(next)) return;
        current = next;
        for (const listener of listeners) listener();
      },
    };
  }, [args.session]);
  const { geometry, setGeometry } = geometryOwner;
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  useEffect(() => {
    mounted.current = true;
    notifyMovement(null);
    draft.current = null;
    failedChoice.current = null;
    failedContext.current = undefined;
    setGesture(null);
    setGeometry(null);
    bodyMeasurements.clear();
    setPending(false);
    setFailure(null);
    const protect = (event: BeforeUnloadEvent) => {
      const value = draft.current;
      if (
        !value ||
        value.session !== geometryOwner.session ||
        sameInstance(value.before, value.after)
      )
        return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => {
      window.removeEventListener('beforeunload', protect);
      mounted.current = false;
      operation.current?.abort();
      operation.current = null;
      draft.current = null;
      completion.current = null;
      fieldPublication.current = { staged: 0, published: 0, task: null };
    };
  }, [geometryOwner.session, setGeometry, notifyMovement, bodyMeasurements]);
  const active = (owner: typeof args, controller: AbortController) =>
    mounted.current && latest.current.session === owner.session && !controller.signal.aborted;
  const currentLane = () => args.session.getSnapshot().document.advancedContent.annotationEffects;
  const valid = (lane: ReviewAnnotationEffects) => {
    const parsed = parseReviewAnnotationEffects(lane);
    const workspace = args.session.getSnapshot().snapshot.workspace;
    const needed = new Set(parsed?.instances.map((item) => item.snapshotId));
    const documents = new Map(
      (workspace.effectSnapshots ?? [])
        .filter((snapshot) => needed.has(snapshot.id))
        .map((snapshot) => [
          snapshot.id,
          readReviewAnnotationEffectDocument(snapshot.source, snapshot.sha256),
        ])
    );
    return (
      parsed &&
      parsed.instances.every((item) => {
        const document = documents.get(item.snapshotId);
        return (
          item.end <=
            (item.timeDomain === 'result'
              ? buildReviewTimeMap(
                  workspace.source.duration,
                  args.session.getSnapshot().document.edits
                ).at(-1)!.resultEnd
              : workspace.source.duration) &&
          document &&
          reviewAnnotationEffectMatchesDocument(item, document)
        );
      })
    );
  };
  const execute = (
    action: (owner: typeof args, controller: AbortController) => Promise<void | boolean>,
    fallback: 'edit' | 'save' = 'edit',
    context?: ReviewCommandContext
  ): Promise<boolean> => {
    if (completion.current) return Promise.resolve(false);
    const owner = args;
    const admitted = async () => {
      if (
        !mounted.current ||
        latest.current.session !== owner.session ||
        operation.current ||
        !latest.current.allowed()
      )
        return false;
      const controller = new AbortController();
      operation.current = controller;
      setPending(true);
      setFailure(null);
      if (!context) owner.pause();
      try {
        await owner.flush();
        if (!active(owner, controller)) return false;
        if (context && !owner.commands?.isCurrent(context, 'temporal')) {
          setFailure('stale');
          return false;
        }
        const result = await action(owner, controller);
        return active(owner, controller) && result !== false;
      } catch {
        if (active(owner, controller)) setFailure((previous) => previous ?? fallback);
        return false;
      } finally {
        if (operation.current === controller) operation.current = null;
        if (active(owner, controller)) setPending(false);
      }
    };
    const result = context
      ? Promise.resolve(admitted())
      : owner.performAction
        ? Promise.resolve(owner.performAction(admitted)).then((value) => value === true)
        : new Promise<boolean>((resolve) => {
            (owner.beforeAction ?? ((continueAction) => continueAction()))(() => {
              void admitted().then(resolve);
            });
          });
    const settled = result.catch(() => {
      if (mounted.current && latest.current.session === owner.session) setFailure(fallback);
      return false;
    });
    completion.current = settled;
    void settled.then(() => {
      if (completion.current === settled) completion.current = null;
    });
    return settled;
  };
  const mutate = (
    update: (lane: ReviewAnnotationEffects | undefined) => ReviewAnnotationEffects | undefined
  ) =>
    execute(async (owner, controller) => {
      const lane = update(currentLane());
      if (lane && !valid(lane)) {
        setFailure('invalid');
        return false;
      }
      owner.setLane(() => lane);
      await owner.flush();
      controller.signal.throwIfAborted();
    });
  const hasFieldPublication = () => {
    const fields = fieldPublication.current;
    return fields.staged !== fields.published;
  };
  const publishFields = (): Promise<boolean> => {
    const fields = fieldPublication.current;
    if (fields.task) return fields.task;
    if (!hasFieldPublication()) return Promise.resolve(true);
    const owner = args;
    const current = () =>
      mounted.current &&
      latest.current.session === owner.session &&
      fieldPublication.current === fields;
    const task = (async () => {
      try {
        while (fields.published !== fields.staged) {
          const revision = fields.staged;
          await owner.flush();
          if (!current()) return false;
          fields.published = revision;
        }
        setFailure((previous) => (previous === 'edit' ? null : previous));
        return true;
      } catch {
        if (current()) setFailure('edit');
        return false;
      } finally {
        fields.task = null;
      }
    })();
    fields.task = task;
    return task;
  };
  const stageField = (
    update: (
      lane: ReviewAnnotationEffects | undefined
    ) => ReviewAnnotationEffects | undefined | false,
    onStaged?: () => void
  ): Promise<boolean> => {
    const owner = args;
    const stage = async () => {
      if (
        !mounted.current ||
        latest.current.session !== owner.session ||
        completion.current ||
        !latest.current.allowed()
      )
        return false;
      const current = owner.readLane();
      const lane = update(current);
      if (lane === false) return false;
      if (lane === current) return true;
      if (lane && !valid(lane)) {
        setFailure('invalid');
        return false;
      }
      owner.pause();
      setFailure(null);
      owner.setLane(() => lane, true);
      fieldPublication.current.staged += 1;
      onStaged?.();
      return publishFields();
    };
    if (owner.performAction) return owner.performAction(stage).then((result) => result === true);
    return new Promise<boolean>((resolve) => {
      (owner.beforeAction ?? ((action) => action()))(() => void stage().then(resolve));
    });
  };
  const cancelGesture = () => {
    notifyMovement(null);
    draft.current = null;
    setGesture(null);
  };
  const add = (choice: Choice, context?: ReviewCommandContext): Promise<string | null> => {
    if (draft.current) return Promise.resolve(null);
    let createdId: string | null = null;
    const instanceId = crypto.randomUUID();
    return execute(
      async (owner, controller) => {
        failedChoice.current = choice;
        failedContext.current = context;
        try {
          const id = await acquire({
            ...choice,
            instanceId,
            session: owner.session,
            signal: controller.signal,
            ...(context
              ? {
                  assertCurrentTarget: () => {
                    if (!owner.commands?.isCurrent(context, 'temporal'))
                      throw new ReviewAnnotationAcquisitionError('changed-source');
                  },
                }
              : {}),
          });
          if (active(owner, controller)) {
            failedChoice.current = null;
            createdId = id;
            if (context) owner.select({ kind: 'annotation-effect', id }, context);
            else owner.select({ kind: 'annotation-effect', id });
          }
        } catch (error) {
          if (!active(owner, controller)) return;
          const admitted = currentLane()?.instances.find(({ id }) => id === instanceId);
          if (admitted) {
            failedChoice.current = null;
            createdId = admitted.id;
            if (context) owner.select({ kind: 'annotation-effect', id: admitted.id }, context);
            else owner.select({ kind: 'annotation-effect', id: admitted.id });
            setFailure('save');
          } else if (
            error instanceof ReviewAnnotationAcquisitionError &&
            error.code === 'unsupported-kind'
          ) {
            failedChoice.current = null;
            setFailure('unsupported');
          } else setFailure('acquisition');
          throw error;
        }
      },
      'edit',
      context
    ).then(() => createdId);
  };
  const applyPatch = (item: ReviewAnnotationEffect, patch: Patch): ReviewAnnotationEffect => {
    const plane = geometry.read()?.[item.attachment];
    return {
      ...item,
      ...structuredClone(patch),
      ...(patch.transform && !patch.anchors && plane && item.anchors
        ? {
            anchors: transformReviewAnnotationAnchors(item, patch.transform, plane) ?? item.anchors,
          }
        : {}),
    };
  };
  const change = (
    id: string,
    edit: Patch | ((current: ReviewAnnotationEffect) => Patch | null)
  ) => {
    if (draft.current) return;
    void stageField((lane) => {
      const current = lane?.instances.find((item) => item.id === id);
      if (!lane || !current) return lane;
      const patch = typeof edit === 'function' ? edit(current) : edit;
      if (!patch) return lane;
      return {
        ...lane,
        instances: lane.instances.map((item) => (item.id === id ? applyPatch(item, patch) : item)),
      };
    });
  };
  const commitGesture = async (): Promise<boolean> => {
    const value = draft.current;
    if (!value) return publishFields();
    if (value.session !== args.session) return false;
    if (sameInstance(value.before, value.after)) {
      cancelGesture();
      return publishFields();
    }
    const replace = (lane: ReviewAnnotationEffects | undefined) => {
      const item = lane?.instances.find((entry) => entry.id === value.before.id);
      if (!lane || !item || !sameInstance(item, value.before)) {
        setFailure('stale');
        return false as const;
      }
      return {
        ...lane,
        instances: lane.instances.map((entry) => (entry.id === item.id ? value.after : entry)),
      };
    };
    const finish = () => {
      if (draft.current === value) cancelGesture();
    };
    if (value.kind === 'field') return stageField(replace, finish);
    const committed = await mutate((lane) => {
      const next = replace(lane);
      if (next === false) throw new Error('Annotation draft changed.');
      return next;
    });
    if (committed) finish();
    return committed;
  };
  const applyGesturePatch = (gesture: Gesture, patch: Patch) => {
    if (gesture.kind === 'placement') return applyPatch(gesture.before, patch);
    return applyPatch(
      gesture.after,
      patch.controls
        ? { ...patch, controls: { ...gesture.after.controls, ...patch.controls } }
        : patch
    );
  };
  const previewPlacement = (patch: Patch) => {
    const value = draft.current;
    if (!value || value.session !== args.session) return false;
    const parsed = parseReviewAnnotationEffects({
      enabled: true,
      instances: [applyGesturePatch(value, patch)],
    })?.instances[0];
    if (!parsed || !notifyMovement(parsed)) return false;
    draft.current = { ...value, after: parsed };
    return true;
  };
  return {
    geometry,
    bodyMeasurements,
    refreshBodyGeometry: () => updateBodyGeometry((value) => value + 1),
    movement,
    previewMovement: (transform: ReviewAnnotationEffectTransform) =>
      previewPlacement({ transform }),
    gestureId: gesture?.session === args.session ? gesture.before.id : null,
    placementGestureActive: gesture?.session === args.session && gesture.kind === 'placement',
    setGeometry,
    pending,
    failure,
    lane: args.lane,
    previewLane:
      gesture?.session === args.session &&
      args.lane?.instances.some(
        (item) => item.id === gesture.before.id && sameInstance(item, gesture.before)
      )
        ? {
            ...args.lane,
            instances: args.lane.instances.map((item) =>
              item.id === gesture.before.id ? gesture.after : item
            ),
          }
        : args.lane,
    add,
    change,
    enabled: (enabled: boolean) => {
      if (draft.current || completion.current) return;
      const owner = args;
      // A lane flag uses the same buffered content path as Zoom, without global operation busy.
      (owner.beforeAction ?? ((action) => action()))(() => {
        if (
          !mounted.current ||
          latest.current.session !== owner.session ||
          draft.current ||
          completion.current ||
          operation.current ||
          !latest.current.allowed()
        )
          return;
        owner.pause();
        owner.setLane((lane) => lane && { ...lane, enabled });
        setFailure(null);
      });
    },
    remove: (id: string) => {
      if (draft.current) cancelGesture();
      void mutate(
        (lane) => lane && { ...lane, instances: lane.instances.filter((item) => item.id !== id) }
      );
    },
    duplicate: (id: string) => {
      if (draft.current) return;
      void execute(async (owner, controller) => {
        const lane = currentLane();
        const original = lane?.instances.find((item) => item.id === id);
        if (!lane || !original) return;
        const copy = {
          ...structuredClone(original),
          id: crypto.randomUUID(),
          order: Math.max(-1, ...lane.instances.map((item) => item.order)) + 1,
        };
        const next = { ...lane, instances: [...lane.instances, copy] };
        if (!valid(next)) {
          setFailure('invalid');
          return;
        }
        owner.setLane(() => next);
        await owner.flush();
        if (active(owner, controller)) owner.select({ kind: 'annotation-effect', id: copy.id });
      });
    },
    /** Call inside the existing note/gesture admission; only the final pointer transaction enters history. */
    beginGesture: (id: string, kind: Gesture['kind'] = 'placement') => {
      if (!args.allowed() || draft.current || operation.current || completion.current) return false;
      const instance = args.readLane()?.instances.find((item) => item.id === id);
      if (!instance) return false;
      args.pause();
      const next = {
        session: args.session,
        kind,
        before: structuredClone(instance),
        after: structuredClone(instance),
      };
      draft.current = next;
      setGesture(next);
      return true;
    },
    previewGesture: (patch: Patch) => {
      if (
        (patch.transform || patch.anchors) &&
        Object.keys(patch).every((key) => key === 'transform' || key === 'anchors') &&
        previewPlacement(patch)
      )
        return;
      notifyMovement(null);
      const value = draft.current;
      if (!value || value.session !== args.session) return;
      const next = { ...value, after: applyGesturePatch(value, patch) };
      draft.current = next;
      setGesture(next);
    },
    cancelGesture,
    commitGesture,
    /** Idle selection stays atomic; only a draft or admitted command needs an async flush. */
    hasPending: () =>
      draft.current !== null || completion.current !== null || hasFieldPublication(),
    flush: async () => {
      const owner = args.session;
      if (completion.current && !(await completion.current))
        throw new Error('Annotation command failed.');
      if (!mounted.current || latest.current.session !== owner || !(await commitGesture()))
        throw new Error('Annotation draft was not committed.');
    },
    retry: () => {
      if (draft.current) void commitGesture();
      else if (hasFieldPublication()) void publishFields();
      else if (failure === 'acquisition' && failedChoice.current)
        return add(failedChoice.current, failedContext.current);
      else if (failure === 'save')
        void execute(async (owner) => {
          await owner.session.saveBuffered();
        }, 'save');
      else if (failure === 'edit') void execute(async () => undefined);
    },
  };
}
