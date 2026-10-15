import { useCallback, useEffect, useRef, useState } from 'react';
import type { EffectBundleCatalogEntry } from '../../features/video/project/effect-bundle/catalog';
import type {
  ReviewAnnotationEffect,
  ReviewAnnotationEffects,
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

type Session = ReturnType<typeof createVideoReviewSession>;
type Patch = Partial<Omit<ReviewAnnotationEffect, 'id' | 'snapshotId' | 'order'>>;
type Gesture = { session: Session; before: ReviewAnnotationEffect; after: ReviewAnnotationEffect };
type Failure = 'acquisition' | 'unsupported' | 'save' | 'edit' | 'stale' | 'invalid';
type Choice = {
  catalog: EffectBundleCatalogEntry;
  documentId: string;
  start: number;
  end?: number;
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
    setLane(
      update: (lane: ReviewAnnotationEffects | undefined) => ReviewAnnotationEffects | undefined
    ): void;
    flush(): Promise<void>;
    allowed(): boolean;
    beforeAction?: ReviewBeforeAction | undefined;
    performAction?(action: () => Promise<boolean>): Promise<boolean | undefined>;
    pause(): void;
    select(selection: ReviewSelection): void;
  },
  acquire = applyReviewAnnotationCatalogDocument
) {
  const latest = useRef(args);
  latest.current = args;
  const mounted = useRef(true);
  const operation = useRef<AbortController | null>(null);
  const draft = useRef<Gesture | null>(null);
  const completion = useRef<Promise<boolean> | null>(null);
  const failedChoice = useRef<Choice | null>(null);
  const [geometry, updateGeometry] = useState<ReviewAnnotationGeometry | null>(null);
  const setGeometry = useCallback((next: ReviewAnnotationGeometry | null) => {
    updateGeometry((previous) =>
      JSON.stringify(previous) === JSON.stringify(next) ? previous : next
    );
  }, []);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  useEffect(() => {
    mounted.current = true;
    draft.current = null;
    failedChoice.current = null;
    setGesture(null);
    updateGeometry(null);
    setPending(false);
    setFailure(null);
    const protect = (event: BeforeUnloadEvent) => {
      const value = draft.current;
      if (!value || value.session !== args.session || sameInstance(value.before, value.after))
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
    };
  }, [args.session]);
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
        .map((snapshot) => [snapshot.id, readReviewAnnotationEffectDocument(snapshot.source)])
    );
    return (
      parsed &&
      parsed.instances.every((item) => {
        const document = documents.get(item.snapshotId);
        return (
          item.end <= workspace.source.duration &&
          document &&
          reviewAnnotationEffectMatchesDocument(item, document)
        );
      })
    );
  };
  const execute = (
    action: (owner: typeof args, controller: AbortController) => Promise<void | boolean>,
    fallback: 'edit' | 'save' = 'edit'
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
      owner.pause();
      try {
        await owner.flush();
        if (!active(owner, controller)) return false;
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
    const result = owner.performAction
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
  const cancelGesture = () => {
    draft.current = null;
    setGesture(null);
  };
  const add = (choice: Choice): Promise<string | null> => {
    if (draft.current) return Promise.resolve(null);
    let createdId: string | null = null;
    const instanceId = crypto.randomUUID();
    return execute(async (owner, controller) => {
      failedChoice.current = choice;
      try {
        const id = await acquire({
          ...choice,
          instanceId,
          session: owner.session,
          signal: controller.signal,
        });
        if (active(owner, controller)) {
          failedChoice.current = null;
          createdId = id;
          owner.select({ kind: 'annotation-effect', id });
        }
      } catch (error) {
        if (!active(owner, controller)) return;
        const admitted = currentLane()?.instances.find(({ id }) => id === instanceId);
        if (admitted) {
          failedChoice.current = null;
          createdId = admitted.id;
          owner.select({ kind: 'annotation-effect', id: admitted.id });
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
    }).then(() => createdId);
  };
  const change = (id: string, patch: Patch) => {
    if (draft.current) return;
    void mutate(
      (lane) =>
        lane && {
          ...lane,
          instances: lane.instances.map((item) =>
            item.id === id ? { ...item, ...structuredClone(patch) } : item
          ),
        }
    );
  };
  const commitGesture = async (): Promise<boolean> => {
    const value = draft.current;
    if (!value) return true;
    if (value.session !== args.session) return false;
    if (sameInstance(value.before, value.after)) {
      cancelGesture();
      return true;
    }
    const committed = await mutate((lane) => {
      const item = lane?.instances.find((entry) => entry.id === value.before.id);
      if (!lane || !item || !sameInstance(item, value.before)) {
        setFailure('stale');
        throw new Error('Annotation draft changed.');
      }
      return {
        ...lane,
        instances: lane.instances.map((entry) => (entry.id === item.id ? value.after : entry)),
      };
    });
    if (committed && draft.current === value) cancelGesture();
    return committed;
  };
  return {
    geometry,
    gestureId: gesture?.session === args.session ? gesture.before.id : null,
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
      if (!draft.current)
        void execute(async (owner) => {
          await owner.flush();
          await owner.session.setTrackControl('annotationEffects', { enabled });
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
    beginGesture: (id: string) => {
      if (operation.current || draft.current || !args.allowed()) return false;
      const instance = args.lane?.instances.find((item) => item.id === id);
      if (!instance) return false;
      args.pause();
      const next = {
        session: args.session,
        before: structuredClone(instance),
        after: structuredClone(instance),
      };
      draft.current = next;
      setGesture(next);
      return true;
    },
    previewGesture: (patch: Patch) => {
      const value = draft.current;
      if (!value || value.session !== args.session) return;
      const next = { ...value, after: { ...value.before, ...structuredClone(patch) } };
      draft.current = next;
      setGesture(next);
    },
    cancelGesture,
    commitGesture,
    /** Idle selection stays atomic; only a draft or admitted command needs an async flush. */
    hasPending: () => draft.current !== null || completion.current !== null,
    flush: async () => {
      const owner = args.session;
      if (completion.current && !(await completion.current))
        throw new Error('Annotation command failed.');
      if (!mounted.current || latest.current.session !== owner || !(await commitGesture()))
        throw new Error('Annotation draft was not committed.');
    },
    retry: () => {
      if (draft.current) void commitGesture();
      else if (failure === 'acquisition' && failedChoice.current) return add(failedChoice.current);
      else if (failure === 'save')
        void execute(async (owner) => {
          await owner.session.saveBuffered();
        }, 'save');
      else if (failure === 'edit') void execute(async () => undefined);
    },
  };
}
