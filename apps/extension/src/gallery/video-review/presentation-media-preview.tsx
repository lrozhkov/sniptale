import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { QuickEditPresentationSettings } from '../../features/video/review/advanced/presentation';
import { createPreviewPresentationSession } from '../../features/video/composition/canvas/preview-presentation';
import { translate, useAppLocale } from '../../platform/i18n';
import { resolveReviewAssetBytes } from '../../workflows/video-review/asset-bytes';
import { createReviewPresentationMedia } from '../../workflows/video-review/presentation-media';
import { ReviewButton } from './controls';
import { PreviewNumericRow as ReviewPreviewNumberRow } from '../../ui/compact-inspector-controls/numeric-preview';
import { ReviewPreviewRendererContext } from './use-preview-preferences';
import {
  createPresentationMediaPaintOwner,
  type PresentationMediaPaintInput,
} from './presentation-media-paint';

type Slot = Exclude<QuickEditPresentationSettings['intro'], { mode: 'none' }>;
type MediaPreviewProps = {
  slot: Slot;
  pending?: boolean | undefined;
  output: { width: number; height: number };
  onAudio(available: boolean): void;
};

/** The source identity excludes recipe edits and local navigation. */
function assetKey(slot: Slot) {
  return JSON.stringify(
    slot.mode === 'image'
      ? ['image', slot.image.assetId, slot.image.width, slot.image.height]
      : [
          'video',
          slot.video.assetId,
          slot.video.source.width,
          slot.video.source.height,
          slot.video.source.duration,
          slot.video.source.size,
          slot.video.source.mimeType,
        ]
  );
}

/** Owns one admitted media lifetime and binds its disposable paint queue to the mounted inspector. */
function usePresentationMedia(props: MediaPreviewProps) {
  const canvas = useRef<HTMLCanvasElement>(null),
    gpuHost = useRef<HTMLDivElement>(null);
  const presenter = useRef<ReturnType<typeof createPreviewPresentationSession> | null>(null);
  const paint = useRef<ReturnType<typeof createPresentationMediaPaintOwner> | null>(null);
  const seek = useRef<(time: number) => void>(() => {});
  const position = useRef(0);
  const [time, setTime] = useState(0);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; status: 'loading' | 'ready' | 'error' }>({
    key: '',
    status: 'loading',
  });
  const renderer = useContext(ReviewPreviewRendererContext);
  const scale = Math.min(1, 640 / props.output.width, 640 / props.output.height);
  const width = Math.max(1, Math.round(props.output.width * scale));
  const height = Math.max(1, Math.round(props.output.height * scale));
  const sourceAssetKey = assetKey(props.slot);
  const sourceKey = JSON.stringify([sourceAssetKey, width, height, retry]);
  const latest = useRef({ sourceKey, slot: props.slot, renderer, onAudio: props.onAudio });
  latest.current = { sourceKey, slot: props.slot, renderer, onAudio: props.onAudio };
  const opened = useRef<string | null>(null);
  const available = !props.pending || opened.current === sourceAssetKey;
  const status = state.key === sourceKey ? state.status : 'loading';
  useLayoutEffect(() => {
    const owner = createPreviewPresentationSession({
      fallback: () => canvas.current,
      host: () => gpuHost.current,
      role: 'inspector',
      background: 'transparent',
    });
    owner.mount();
    presenter.current = owner;
    return () => {
      paint.current?.dispose();
      presenter.current = null;
      owner.dispose();
    };
  }, []);
  useEffect(() => {
    if (!available || latest.current.sourceKey !== sourceKey) return;
    const target = canvas.current,
      destination = presenter.current;
    if (!target || !destination) return;
    opened.current = sourceAssetKey;
    const controller = new AbortController();
    const { signal } = controller;
    const slot = latest.current.slot;
    let media: Awaited<ReturnType<typeof createReviewPresentationMedia>> | undefined;
    let owner: ReturnType<typeof createPresentationMediaPaintOwner> | undefined;
    position.current = slot.mode === 'video' ? slot.video.trim.start : 0;
    setTime(position.current);
    setState({ key: sourceKey, status: 'loading' });
    seek.current = (value) => {
      const slot = latest.current.slot;
      const at =
        slot.mode === 'video'
          ? Math.min(slot.video.trim.end, Math.max(slot.video.trim.start, value))
          : 0;
      position.current = at;
      setTime(at);
      owner?.request();
    };
    void createReviewPresentationMedia({
      slot,
      output: { width, height },
      signal,
      readAsset: resolveReviewAssetBytes,
    })
      .then((ready) => {
        if (signal.aborted || latest.current.sourceKey !== sourceKey) {
          ready.dispose();
          return;
        }
        media = ready;
        latest.current.onAudio(ready.audioTrack !== null);
        owner = createPresentationMediaPaintOwner({
          sourceKey,
          media: ready,
          canvas: target,
          output: { width, height },
          presenter: destination,
          read: (): PresentationMediaPaintInput => ({
            sourceKey: latest.current.sourceKey,
            slot: latest.current.slot,
            renderer: latest.current.renderer,
            time: position.current,
          }),
          ready: () => setState({ key: sourceKey, status: 'ready' }),
          fail: () => {
            setState({ key: sourceKey, status: 'error' });
            media?.dispose();
          },
        });
        paint.current = owner;
        owner.request();
      })
      .catch(() => {
        if (!signal.aborted && latest.current.sourceKey === sourceKey)
          setState({ key: sourceKey, status: 'error' });
      });
    return () => {
      seek.current = () => {};
      if (paint.current === owner) paint.current = null;
      owner?.dispose();
      controller.abort();
      media?.dispose();
    };
  }, [sourceKey, sourceAssetKey, width, height, available]);
  const settings = props.slot.mode === 'image' ? props.slot.image : props.slot.video;
  const trimStart = props.slot.mode === 'video' ? props.slot.video.trim.start : 0;
  const trimEnd = props.slot.mode === 'video' ? props.slot.video.trim.end : 0;
  useEffect(() => {
    seek.current(position.current);
  }, [
    sourceKey,
    renderer,
    settings.fit,
    settings.fillColor,
    settings.crop.panX,
    settings.crop.panY,
    trimStart,
    trimEnd,
  ]);
  return {
    canvas,
    gpuHost,
    seek,
    time,
    status,
    width,
    height,
    retry: () => setRetry((value) => value + 1),
  };
}

/** Silent local seek leaves authored placement and trim unchanged. */
export function ReviewPresentationMediaPreview(props: MediaPreviewProps) {
  useAppLocale();
  const { canvas, gpuHost, seek, time, status, width, height, retry } = usePresentationMedia(props);
  const { slot } = props;
  const filename = slot.mode === 'image' ? slot.image.filename : slot.video.filename;
  return (
    <div
      className="min-w-0 space-y-1"
      aria-busy={status === 'loading'}
      data-ui="gallery.videoReview.presentationMediaPreview"
    >
      <div
        className="relative flex h-28 items-center justify-center overflow-hidden rounded
          bg-[var(--sniptale-color-surface-muted)]"
      >
        <div
          className="relative"
          style={{
            width: `min(100%, ${(112 * width) / height}px)`,
            aspectRatio: width / height,
            visibility: status === 'ready' ? 'visible' : 'hidden',
          }}
        >
          <canvas
            ref={canvas}
            width={width}
            height={height}
            className="absolute inset-0 h-full w-full"
            aria-label={translate('gallery.videoReview.presentationMediaPreview')}
          />
          <div
            ref={gpuHost}
            data-ui="gallery.videoReview.presentationMedia.gpuHost"
            className="pointer-events-none absolute inset-0"
          />
        </div>
        {status === 'loading' && (
          <span
            role="status"
            className="absolute text-xs text-[var(--sniptale-color-text-secondary)]"
          >
            {translate('gallery.videoReview.presentationPreviewLoading')}
          </span>
        )}
        {status === 'error' && (
          <div className="absolute px-2 text-center text-xs">
            <p role="alert">{translate('gallery.videoReview.presentationMediaPreviewFailed')}</p>
            <ReviewButton
              label={translate('gallery.videoReview.presentationMediaRetry')}
              onClick={retry}
            />
          </div>
        )}
      </div>
      {filename && (
        <p
          className="truncate text-xs text-[var(--sniptale-color-text-secondary)]"
          title={filename}
        >
          {filename}
        </p>
      )}
      {slot.mode === 'video' && (
        <ReviewPreviewNumberRow
          label={translate('gallery.videoReview.presentationMediaPosition')}
          value={time}
          min={slot.video.trim.start}
          max={slot.video.trim.end}
          step={0.001}
          precision={3}
          unit="s"
          onChange={(value) => seek.current(value)}
          onPreview={(value) => {
            if (value !== null) seek.current(value);
          }}
        />
      )}
    </div>
  );
}
