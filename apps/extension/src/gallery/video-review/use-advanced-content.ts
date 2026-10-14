import { ReviewTrackLockedError } from '../../features/video/review/advanced/track-controls';
import { authoredCursorFocusPath } from '../../features/video/project/cursor-focus-path/authoring';
import { useRecoveryLifecycle } from './use-recovery-lifecycle';
import type { ReviewTextTypingTarget } from '../../features/video/review/text-types';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  QuickEditAdvancedContent,
  QuickEditAdvancedState,
} from '../../features/video/review/advanced/types';

type Session = ReturnType<
  typeof import('../../workflows/video-review/session').createVideoReviewSession
>;

import { EDITOR_AUTOSAVE_POLICY } from '../../features/autosave/policy';
type ContentMutation = (content: QuickEditAdvancedContent) => QuickEditAdvancedContent;
type TypingAction = { id: string; target: ReviewTextTypingTarget; continuation: boolean };
type PendingContent = {
  revision: number;
  value: QuickEditAdvancedContent;
  mutations: ContentMutation[];
  group: string;
  action?: TypingAction;
};

/** Rebases newer mutations of this group without consuming a later closed-group capture. */
function pendingAfterAcknowledgement(
  current: PendingContent,
  sent: PendingContent
): PendingContent | null {
  if (current.group !== sent.group) throw new Error('Review content capture changed.');
  if (current.revision === sent.revision) return null;
  const mutations = current.mutations.slice(sent.mutations.length);
  const value = mutations.reduce((content, mutate) => mutate(content), sent.value);
  return { ...current, value, mutations };
}

/** The UI owns unsaved field captures; the session owns their ordered durable publication. */
export function useReviewAdvancedContent(
  session: Session,
  documentContent: QuickEditAdvancedContent
) {
  const [, setVersion] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const pending = useRef<PendingContent[]>([]);
  const action = useRef<TypingAction | null>(null);
  const generation = useRef(0);
  const nextRevision = useRef(0);
  const optimistic = useRef<PendingContent | null>(null);
  const mounted = useRef(true);
  const failedCapture = useRef<ReturnType<Parameters<Session['stageAutosave']>[1]> | null>(null);
  const schedule = useCallback(() => {
    const first = pending.current[0];
    if (!first) return;
    const epoch = generation.current;
    session.stageAutosave(
      'content',
      () => {
        if (failedCapture.current) return failedCapture.current;
        const sent = pending.current[0];
        if (!sent) throw new Error('Review content buffer is unavailable.');
        const captured = {
          change: {
            kind: 'content' as const,
            content: sent.value,
            ...(sent.action
              ? {
                  typing: {
                    actionId: sent.action.id,
                    target: sent.action.target,
                    continuation: sent.action.continuation,
                    writeId: crypto.randomUUID(),
                  },
                }
              : {}),
          },
          acknowledge: () => {
            if (epoch !== generation.current) return;
            const current = pending.current[0];
            if (!current) throw new Error('Review content capture is unavailable.');
            const rest = pendingAfterAcknowledgement(current, sent);
            pending.current = [...(rest ? [rest] : []), ...pending.current.slice(1)];
            if (sent.action) sent.action.continuation = true;
            failedCapture.current = null;
            optimistic.current = pending.current.at(-1) ?? null;
            if (mounted.current) {
              setSaveFailed(false);
              setVersion((version) => version + 1);
            }
            if (pending.current.length) schedule();
          },
          fail: () => {
            if (epoch === generation.current && mounted.current) setSaveFailed(true);
          },
        };
        if (sent.action) failedCapture.current = captured;
        return captured;
      },
      EDITOR_AUTOSAVE_POLICY
    );
  }, [session]);
  const flush = useCallback(async (): Promise<void> => {
    while (pending.current.length) await session.flushAutosave(['content']);
  }, [session]);
  const endTyping = useCallback(() => {
    action.current = null;
  }, []);
  const stage = useCallback(
    (mutate: ContentMutation, target?: ReviewTextTypingTarget) => {
      const previous = pending.current.at(-1);
      const base = previous?.value ?? session.getSnapshot().document.advancedContent;
      const value = mutate(base);
      if (JSON.stringify(value) === JSON.stringify(base)) return;
      try {
        session.assertContentEditable(base, value);
      } catch (error) {
        if (error instanceof ReviewTrackLockedError) return;
        throw error;
      }
      if (!target) action.current = null;
      else if (!action.current || action.current.target.fragmentId !== target.fragmentId)
        action.current = { id: crypto.randomUUID(), target, continuation: false };
      const active = action.current;
      const sameGroup = active ? previous?.group === active.id : !!previous && !previous.action;
      const entry: PendingContent = {
        revision: ++nextRevision.current,
        value,
        mutations: [...(sameGroup && previous ? previous.mutations : []), mutate],
        group: active?.id ?? (sameGroup && previous ? previous.group : crypto.randomUUID()),
        ...(active ? { action: active } : {}),
      };
      pending.current = sameGroup
        ? [...pending.current.slice(0, -1), entry]
        : [...pending.current, entry];
      optimistic.current = entry;
      setVersion((version) => version + 1);
      setSaveFailed(false);
      schedule();
    },
    [session, schedule]
  );
  useRecoveryLifecycle(flush, mounted);
  useEffect(() => {
    if (!pending.current.length) optimistic.current = null;
    setVersion((version) => version + 1);
  }, [documentContent]);
  const reset = useCallback(() => {
    generation.current += 1;
    session.cancelAutosave('content');
    pending.current = [];
    optimistic.current = null;
    failedCapture.current = null;
    action.current = null;
    if (mounted.current) {
      setSaveFailed(false);
      setVersion((version) => version + 1);
    }
  }, [session]);
  return {
    content: optimistic.current?.value ?? documentContent,
    saveFailed,
    pending: pending.current.length > 0,
    flush,
    endTyping,
    reset,
    commands: reviewContentCommands(stage),
  };
}

/** Authored mutations share the debounced history writer, independent of its React lifecycle. */
function reviewContentCommands(
  stage: (mutation: ContentMutation, typing?: ReviewTextTypingTarget) => void
) {
  return {
    setCameraFollowDefaults: (
      cameraFollowDefaults: QuickEditAdvancedContent['cameraFollowDefaults']
    ) =>
      stage((content) => {
        const { cameraFollowDefaults: _previous, ...rest } = content;
        return cameraFollowDefaults ? { ...rest, cameraFollowDefaults } : rest;
      }),
    setCursorFocusPath: (cursorFocusPath: QuickEditAdvancedContent['cursorFocusPath']) =>
      stage((content) => {
        const { cursorFocusPath: _previous, ...rest } = content;
        return cursorFocusPath
          ? { ...rest, cursorFocusPath: authoredCursorFocusPath(cursorFocusPath) }
          : rest;
      }),
    setAnnotationEffects: (
      update: (
        lane: QuickEditAdvancedContent['annotationEffects']
      ) => QuickEditAdvancedContent['annotationEffects']
    ) =>
      stage((content) => {
        const { annotationEffects: previous, ...rest } = content;
        const annotationEffects = update(previous);
        return annotationEffects ? { ...rest, annotationEffects } : rest;
      }),
    setText: (
      update: (text: QuickEditAdvancedContent['text']) => QuickEditAdvancedContent['text'],
      typing?: ReviewTextTypingTarget
    ) =>
      stage((content) => {
        const { text: previous, ...rest } = content;
        const text = update(previous);
        return text ? { ...rest, text } : rest;
      }, typing),
    setCaptions: (captions: QuickEditAdvancedContent['captions']) =>
      stage((content) => {
        const { captions: _previous, ...rest } = content;
        return captions ? { ...rest, captions } : rest;
      }),
    setActionsEnabled: (actionsEnabled: boolean) =>
      stage((content) => ({ ...content, actionsEnabled })),
    setActionAudio: (
      update: (
        current: NonNullable<QuickEditAdvancedContent['actionAudio']>
      ) => NonNullable<QuickEditAdvancedContent['actionAudio']>
    ) =>
      stage((content) => {
        const next = update(content.actionAudio ?? []);
        if (!next.length) {
          const { actionAudio: _previous, ...rest } = content;
          return rest;
        }
        return { ...content, actionAudio: next };
      }),
    setKeyAnimations: (
      update: (
        current: NonNullable<QuickEditAdvancedContent['keyAnimations']>
      ) => NonNullable<QuickEditAdvancedContent['keyAnimations']>
    ) => stage((content) => ({ ...content, keyAnimations: update(content.keyAnimations ?? []) })),
    setClickAnimations: (
      update: (
        current: NonNullable<QuickEditAdvancedContent['clickAnimations']>
      ) => NonNullable<QuickEditAdvancedContent['clickAnimations']>
    ) =>
      stage((content) => ({ ...content, clickAnimations: update(content.clickAnimations ?? []) })),
    setZoom: (update: (zoom: QuickEditAdvancedState['zoom']) => QuickEditAdvancedState['zoom']) =>
      stage((content) => ({ ...content, zoom: update(content.zoom) })),
    setBackground: (
      update: (
        background: QuickEditAdvancedState['background']
      ) => QuickEditAdvancedState['background']
    ) => stage((content) => ({ ...content, background: update(content.background) })),
    setWatermark: (watermark: QuickEditAdvancedState['watermark']) =>
      stage((content) => {
        const { watermark: _previous, ...rest } = content;
        return watermark ? { ...rest, watermark } : rest;
      }),
    setPresentation: (presentation: QuickEditAdvancedState['presentation']) =>
      stage((content) => {
        const { presentation: _previous, ...rest } = content;
        return presentation ? { ...rest, presentation } : rest;
      }),
    setWindowHeader: (windowHeader: QuickEditAdvancedState['windowHeader']) =>
      stage((content) => {
        const { windowHeader: _previous, ...rest } = content;
        return windowHeader ? { ...rest, windowHeader } : rest;
      }),
    setWebcam: (
      update: (webcam: QuickEditAdvancedState['webcam']) => QuickEditAdvancedState['webcam']
    ) =>
      stage((content) => {
        const { webcam: previous, ...rest } = content;
        const webcam = update(previous);
        return webcam ? { ...rest, webcam } : rest;
      }),
    setCanvas: (canvas: QuickEditAdvancedState['canvas']) =>
      stage((content) => {
        const { canvas: _previous, ...rest } = content;
        return canvas ? { ...rest, canvas } : rest;
      }),
    setAudio: (
      update: (audio: QuickEditAdvancedState['audio']) => QuickEditAdvancedState['audio']
    ) => stage((content) => ({ ...content, audio: update(content.audio) })),
  };
}
