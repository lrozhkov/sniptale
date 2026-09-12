import { LibraryMediaPlayer } from '../../composition/library-preview/player';
import { useEffect, useRef, useState } from 'react';
import { ProductInput, ProductTextarea } from '@sniptale/ui/product-form-controls';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { GUIDE_LIMITS } from '@sniptale/runtime-contracts/scenario/types/guide';
import type {
  GuideImageImportPlacement,
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
  target?: Extract<GuideImageImportPlacement, { kind: 'replace-image' }>;
  onComplete?: () => void;
  t: Translate;
  onImport: (input: {
    sources: readonly GuideImageImportSource[];
    placement: GuideImageImportPlacement;
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

/** Reuses library navigation while presenting shared source-video playback and frame insertion. */
export function GuideVideoFrameResources(props: VideoResourcesProps) {
  const { t } = props;
  const state = useVideoFrames(props);
  const locked = props.disabled || state.pending;
  return (
    <div className="guide-video-preview">
      {state.source ? (
        <>
          <LibraryMediaPlayer
            key={state.source.url}
            videoRef={state.video}
            src={state.source.url}
            filename={state.source.filename}
            onReadyChange={state.onReadyChange}
          >
            <span role="status">{t('scenario.editor.loading')}</span>
          </LibraryMediaPlayer>
          <span>{state.source.filename}</span>
          {!props.target && (
            <>
              <label>
                {t('scenario.editor.guideStepTitle')}
                <ProductInput
                  value={state.title}
                  maxLength={GUIDE_LIMITS.maxLabelLength}
                  disabled={locked}
                  onChange={(event) => state.writeTitle(event.target.value)}
                />
              </label>
              <label>
                {t('scenario.editor.guideAddText')}
                <ProductTextarea
                  value={state.description}
                  rows={2}
                  maxLength={GUIDE_LIMITS.maxTextLength}
                  disabled={locked}
                  onChange={(event) => state.writeDescription(event.target.value)}
                />
              </label>
            </>
          )}
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
        </>
      ) : (
        <p>{t('scenario.editor.guideChooseVideoHint')}</p>
      )}
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
            <ProductActionButton compact tone="secondary" disabled={locked} onClick={state.retry}>
              {t('common.actions.retry')}
            </ProductActionButton>
          )}
        </p>
      )}
      {state.applied && <p role="status">{t('scenario.editor.guideVideoFrameAdded')}</p>}
    </div>
  );
}
