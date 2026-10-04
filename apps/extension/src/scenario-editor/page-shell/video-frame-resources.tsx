import { GuideVideoActionNavigation, GuideVideoActionOverlay } from './video-action-navigation';
import type { GuideVideoAction } from '@sniptale/runtime-contracts/scenario/types/guide';
import { guideVideoActionAt } from './runtime/video-actions';
import { LibraryMediaPlayer } from '../../composition/library-preview/player';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { GuideVoiceField } from './voice-field';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { GUIDE_LIMITS } from '@sniptale/runtime-contracts/scenario/types/guide';
import type {
  GuideImageImportPlacement,
  TourImageImportPlacement,
  GuideImageImportSource,
} from '../../composition/persistence/scenario/store/public';
import type { Translate } from '../../platform/i18n';
import {
  captureGuideVideoFrame,
  loadGuideVideoSource,
  type GuideVideoSource,
} from './runtime/video-frame';
import './video-frame-resources.css';

type VideoResourcesProps = {
  mediaId: string;
  disabled: boolean;
  target?: GuideImageImportPlacement | TourImageImportPlacement;
  onComplete?: () => void;
  onAddTextStep?: ((title: string, description: string) => boolean) | undefined;
  t: Translate;
  onImport: (input: {
    sources: readonly GuideImageImportSource[];
    placement: GuideImageImportPlacement | TourImageImportPlacement;
    signal: AbortSignal;
    onProgress: (completed: number, total: number) => void;
  }) => Promise<boolean>;
};

/** Owns local video source lifetime and one capture-to-import transaction. */
function useVideoFrames(props: VideoResourcesProps) {
  const video = useRef<HTMLVideoElement>(null);
  const job = useRef<AbortController | null>(null);
  const [source, setSource] = useState<(GuideVideoSource & { url: string }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [applied, setApplied] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  useEffect(() => {
    setTitle('');
    setDescription('');
    setPending(false);
  }, [props.mediaId]);
  useEffect(() => {
    const controller = new AbortController();
    let url: string | null = null;
    setSource(null);
    setReady(false);
    setFailed(false);
    setApplied(false);
    setLoading(true);
    void loadGuideVideoSource({ mediaId: props.mediaId }, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(value.blob);
        setSource({ ...value, url });
        setLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => {
      controller.abort();
      job.current?.abort();
      job.current = null;
      if (url) URL.revokeObjectURL(url);
    };
  }, [props.mediaId, attempt]);
  const submit = async () => {
    if (job.current || !source || !video.current || props.disabled) return;
    const controller = new AbortController();
    job.current = controller;
    setPending(true);
    setFailed(false);
    setApplied(false);
    try {
      const frame = await captureGuideVideoFrame(video.current, controller.signal);
      controller.signal.throwIfAborted();
      const accepted = await props.onImport({
        sources: [
          {
            kind: 'video-frame',
            blob: frame.blob,
            source: {
              kind: 'video-frame',
              recordingId: source.recordingId,
              filename: source.filename.slice(0, GUIDE_LIMITS.maxLabelLength),
              timeSeconds: frame.timeSeconds,
              ...(guideVideoActionAt(source.actions ?? [], frame.timeSeconds)
                ? { action: guideVideoActionAt(source.actions ?? [], frame.timeSeconds)! }
                : {}),
            },
            title,
            description,
          },
        ],
        placement: props.target ?? { kind: 'steps' },
        signal: controller.signal,
        onProgress: () => {},
      });
      if (job.current !== controller || controller.signal.aborted) return;
      if (accepted) {
        setApplied(true);
        props.onComplete?.();
      } else setFailed(true);
    } catch {
      if (job.current === controller && !controller.signal.aborted) setFailed(true);
    } finally {
      if (job.current === controller) {
        job.current = null;
        setPending(false);
      }
    }
  };
  return {
    video,
    source,
    loading,
    ready,
    pending,
    failed,
    applied,
    title,
    description,
    submit,
    retry: () => setAttempt((value) => value + 1),
    onReadyChange: setReady,
    writeTitle: (value: string) => setTitle(value),
    writeDescription: (value: string) => setDescription(value),
    cancel: () => {
      job.current?.abort();
      job.current = null;
      setPending(false);
    },
  };
}

/** Reuses library playback; the scenario-owned footer remains inside its fullscreen root. */
export function GuideVideoFrameResources(props: VideoResourcesProps) {
  const { t } = props;
  const state = useVideoFrames(props);
  const [hoveredAction, setHoveredAction] = useState<GuideVideoAction | null>(null);
  const feedback = <VideoFrameFeedback state={state} t={t} disabled={props.disabled} />;
  return (
    <div className="guide-video-preview">
      {state.source ? (
        <LibraryMediaPlayer
          key={state.source.url}
          videoRef={state.video}
          src={state.source.url}
          filename={state.source.filename}
          onReadyChange={state.onReadyChange}
          footer={
            <VideoStepComposer key={props.mediaId} state={state} {...props}>
              {feedback}
            </VideoStepComposer>
          }
          renderTimeline={(playback) => (
            <GuideVideoActionNavigation
              playback={playback}
              actions={state.source?.actions ?? []}
              onHover={setHoveredAction}
              t={t}
            />
          )}
          renderOverlay={(playback) => (
            <GuideVideoActionOverlay
              playback={playback}
              action={
                guideVideoActionAt(hoveredAction ? [hoveredAction] : [], playback.media.time) ??
                guideVideoActionAt(state.source?.actions ?? [], playback.media.time)
              }
            />
          )}
        >
          <span role="status">{t('scenario.editor.loading')}</span>
        </LibraryMediaPlayer>
      ) : (
        <>
          <p>{t('scenario.editor.guideChooseVideoHint')}</p>
          {feedback}
        </>
      )}
    </div>
  );
}

type FrameState = ReturnType<typeof useVideoFrames>;

/** One draft can be captured with a frame or submitted as an asset-free Guide step. */
function VideoStepComposer(
  props: VideoResourcesProps & { state: FrameState; children: ReactNode }
) {
  const { state, t } = props;
  const [mode, setMode] = useState<'frame' | 'text' | null>(null);
  const [textResult, setTextResult] = useState<'added' | 'failed' | null>(null);
  const active = useRef(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const locked = props.disabled || state.pending;
  const metadata =
    !props.target || props.target.kind === 'steps' || props.target.kind === 'tour-slides';
  const textAllowed =
    Boolean(props.onAddTextStep) && (!props.target || props.target.kind === 'steps');
  const close = () => {
    active.current = false;
    setMode(null);
    trigger.current?.focus({ preventScroll: true });
  };
  const open = (next: 'frame' | 'text', button: HTMLButtonElement) => {
    trigger.current = button;
    active.current = true;
    setTextResult(null);
    setMode(next);
  };
  const submit = () => {
    if (!active.current || locked) return;
    if (mode === 'frame') {
      void state.submit();
      return;
    }
    if (!textAllowed) return;
    active.current = false;
    const accepted = props.onAddTextStep?.(state.title, state.description);
    setTextResult(accepted ? 'added' : 'failed');
    if (accepted) close();
    else active.current = true;
  };
  return (
    <div className="guide-video-composer">
      <div className="guide-video-composer-actions">
        <span className="guide-video-filename" title={state.source?.filename}>
          {state.source?.filename}
        </span>
        <ProductActionButton
          compact
          tone="primary"
          disabled={locked || !state.ready}
          onClick={() => void state.submit()}
        >
          {t(
            props.target
              ? 'scenario.editor.guideUseVideoFrame'
              : 'scenario.editor.guideVideoFrameStep'
          )}
        </ProductActionButton>
        {metadata && (
          <ProductActionButton
            compact
            tone="secondary"
            disabled={locked}
            onClick={(event) => open('frame', event.currentTarget)}
          >
            {t('scenario.editor.guideVideoEditDetails')}
          </ProductActionButton>
        )}
        {textAllowed && (
          <ProductActionButton
            compact
            tone="secondary"
            disabled={locked}
            onClick={(event) => open('text', event.currentTarget)}
          >
            {t('scenario.editor.guideVideoTextStep')}
          </ProductActionButton>
        )}
      </div>
      {mode && (
        <VideoStepForm
          state={state}
          t={t}
          disabled={locked}
          tour={props.target?.kind === 'tour-slides'}
          mode={mode}
          onSubmit={submit}
          onClose={close}
        >
          {textResult === 'failed' && (
            <p role="alert">{t('scenario.editor.guideVideoTextFailed')}</p>
          )}
          {props.children}
        </VideoStepForm>
      )}
      {!mode && textResult === 'added' && (
        <p role="status">{t('scenario.editor.guideVideoTextAdded')}</p>
      )}
      {!mode && props.children}
    </div>
  );
}

/** Owns the bounded form, its fields, keyboard dismissal and reachable feedback. */
function VideoStepForm({
  state,
  t,
  disabled,
  tour,
  mode,
  onSubmit,
  onClose,
  children,
}: {
  state: FrameState;
  t: Translate;
  disabled: boolean;
  tour: boolean;
  mode: 'frame' | 'text';
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  useLayoutEffect(() => {
    form.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
  }, [mode]);
  return (
    <form
      ref={form}
      className="guide-video-composer-form"
      aria-label={t(
        mode === 'text'
          ? 'scenario.editor.guideVideoTextStep'
          : 'scenario.editor.guideVideoEditDetails'
      )}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        if (state.pending) state.cancel();
        onClose();
      }}
    >
      <div className="guide-video-field">
        <span>{t('scenario.editor.guideStepTitle')}</span>
        <GuideVoiceField
          aria-label={t('scenario.editor.guideStepTitle')}
          formControl
          singleLine
          clearable
          value={state.title}
          maxLength={GUIDE_LIMITS.maxLabelLength}
          disabled={disabled}
          onValueChange={state.writeTitle}
        />
      </div>
      <div className="guide-video-field">
        <span>{t('scenario.editor.guideAddText')}</span>
        <GuideVoiceField
          aria-label={t('scenario.editor.guideAddText')}
          formControl
          clearable
          value={state.description}
          rows={2}
          maxLength={tour ? 4000 : GUIDE_LIMITS.maxTextLength}
          disabled={disabled}
          onValueChange={state.writeDescription}
        />
      </div>
      <div className="guide-video-composer-actions">
        <ProductActionButton
          type="submit"
          compact
          tone="primary"
          disabled={disabled || (mode === 'frame' && !state.ready)}
        >
          {t(mode === 'text' ? 'common.actions.save' : 'scenario.editor.guideUseVideoFrame')}
        </ProductActionButton>
        {!state.pending && (
          <ProductActionButton compact tone="secondary" onClick={onClose}>
            {t('common.actions.cancel')}
          </ProductActionButton>
        )}
      </div>
      {children}
    </form>
  );
}

function VideoFrameFeedback({
  state,
  t,
  disabled,
}: {
  state: FrameState;
  t: Translate;
  disabled: boolean;
}) {
  return (
    <>
      {state.loading && <p role="status">{t('scenario.editor.loading')}</p>}
      {state.pending && (
        <p role="status">
          {t('scenario.editor.guideVideoFramePending')}
          <ProductActionButton compact tone="secondary" onClick={state.cancel}>
            {t('common.actions.cancel')}
          </ProductActionButton>
        </p>
      )}
      {state.failed && (
        <p role="alert">
          {t('scenario.editor.guideVideoFrameFailed')}
          {!state.source && (
            <ProductActionButton compact tone="secondary" disabled={disabled} onClick={state.retry}>
              {t('common.actions.retry')}
            </ProductActionButton>
          )}
        </p>
      )}
      {state.applied && <p role="status">{t('scenario.editor.guideVideoFrameAdded')}</p>}
    </>
  );
}
