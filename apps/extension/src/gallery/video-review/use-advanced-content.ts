import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  QuickEditAdvancedContent,
  QuickEditAdvancedState,
} from '../../features/video/review/advanced/types';

type Session = ReturnType<
  typeof import('../../workflows/video-review/session').createVideoReviewSession
>;

const ADVANCED_SAVE_DEBOUNCE_MS = 250;
const TEXT_TYPING_SAVE_DEBOUNCE_MS = 1000;
type ContentMutation = (content: QuickEditAdvancedContent) => QuickEditAdvancedContent;
type PendingContent = {
  revision: number;
  value: QuickEditAdvancedContent;
  mutations: ContentMutation[];
  typing: boolean;
};

/** Rebases edits staged during an acknowledged write onto that acknowledged target. */
function pendingAfterAcknowledgement(
  current: PendingContent | null,
  sent: PendingContent
): PendingContent | null {
  if (!current || current.revision === sent.revision) return null;
  const mutations = current.mutations.slice(sent.mutations.length);
  const value = mutations.reduce((content, mutate) => mutate(content), sent.value);
  return { ...current, value, mutations };
}

/** Debounced advanced-content writer; every durable mutation is one history operation. */
export function useReviewAdvancedContent(
  session: Session,
  documentContent: QuickEditAdvancedContent
) {
  const [, setVersion] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const pending = useRef<PendingContent | null>(null);
  const generation = useRef(0);
  const nextRevision = useRef(0);
  const optimistic = useRef<PendingContent | null>(null);
  const mounted = useRef(true);
  const flush = useCallback(async (): Promise<void> => {
    while (pending.current) await session.flushAutosave(['content']);
  }, [session]);
  const stage = useCallback(
    (mutate: ContentMutation, typing = false) => {
      const previous = pending.current;
      const base = previous?.value ?? session.getSnapshot().document.advancedContent;
      const value = mutate(base);
      if (JSON.stringify(value) === JSON.stringify(base)) return;
      const entry: PendingContent = {
        revision: ++nextRevision.current,
        value,
        mutations: [...(previous?.mutations ?? []), mutate],
        typing,
      };
      optimistic.current = entry;
      pending.current = entry;
      setVersion((value) => value + 1);
      setSaveFailed(false);
      const epoch = generation.current;
      session.stageAutosave(
        'content',
        () => {
          const sent = pending.current;
          if (!sent) throw new Error('Review content buffer is unavailable.');
          return {
            change: { kind: 'content', content: sent.value },
            acknowledge: () => {
              if (epoch !== generation.current) return;
              const acknowledged = pendingAfterAcknowledgement(pending.current, sent);
              pending.current = acknowledged;
              optimistic.current = acknowledged;
              if (mounted.current) {
                if (!acknowledged) setSaveFailed(false);
                setVersion((value) => value + 1);
              }
            },
            fail: () => {
              if (epoch === generation.current && mounted.current) setSaveFailed(true);
            },
          };
        },
        { delay: typing ? TEXT_TYPING_SAVE_DEBOUNCE_MS : ADVANCED_SAVE_DEBOUNCE_MS }
      );
    },
    [session]
  );
  useEffect(() => {
    mounted.current = true;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flush().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      void flush().catch(() => undefined);
    };
  }, [flush]);
  useEffect(() => {
    if (!pending.current) optimistic.current = null;
    setVersion((value) => value + 1);
  }, [documentContent]);
  const reset = useCallback(() => {
    generation.current += 1;
    session.cancelAutosave('content');
    pending.current = null;
    optimistic.current = null;
    if (mounted.current) {
      setSaveFailed(false);
      setVersion((value) => value + 1);
    }
  }, [session]);
  return {
    content: optimistic.current?.value ?? documentContent,
    saveFailed,
    pending: pending.current !== null,
    flush,
    reset,
    commands: reviewContentCommands(stage),
  };
}

/** Authored mutations share the debounced history writer, independent of its React lifecycle. */
function reviewContentCommands(stage: (mutation: ContentMutation, typing?: boolean) => void) {
  return {
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
      typing = false
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
