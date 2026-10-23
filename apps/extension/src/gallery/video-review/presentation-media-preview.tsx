import { useEffect, useRef, useState } from 'react';
import type { QuickEditPresentationSettings } from '../../features/video/review/advanced/presentation';
import { translate, useAppLocale } from '../../platform/i18n';
import { resolveReviewAssetBytes } from '../../workflows/video-review/asset-bytes';
import { createReviewPresentationMedia } from '../../workflows/video-review/presentation-media';
import { ReviewButton } from './controls';
import { PreviewNumericRow as ReviewPreviewNumberRow } from '../../ui/compact-inspector-controls/numeric-preview';

type Slot = Exclude<QuickEditPresentationSettings['intro'], { mode: 'none' }>;
type MediaPreviewProps = {
  slot: Slot;
  pending?: boolean | undefined;
  output: { width: number; height: number };
  onAudio(available: boolean): void;
};

/** Owns decoding, cancellation and serialized repaint of one immutable asset. */
function usePresentationMedia(props: MediaPreviewProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const seek = useRef<(time: number) => void>(() => {});
  const position = useRef(0);
  const [time, setTime] = useState(0);
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const scale = Math.min(1, 640 / props.output.width, 640 / props.output.height);
  const width = Math.max(1, Math.round(props.output.width * scale));
  const height = Math.max(1, Math.round(props.output.height * scale));
  const { slot, onAudio, pending } = props;
  const latest = useRef({ slot, onAudio });
  latest.current = { slot, onAudio };
  const assetId = slot.mode === 'image' ? slot.image.assetId : slot.video.assetId;
  const opened = useRef<string | null>(null);
  const available = !pending || opened.current === assetId;
  useEffect(() => {
    const slot = latest.current.slot;
    if (!available) return;
    opened.current = assetId;
    const controller = new AbortController();
    const { signal } = controller;
    let media: Awaited<ReturnType<typeof createReviewPresentationMedia>> | undefined;
    let requested = slot.mode === 'video' ? slot.video.trim.start : 0;
    let running = false;
    let revision = 0;
    setTime(requested);
    setStatus('loading');

    const draw = async () => {
      if (running || !media || signal.aborted) return;
      running = true;
      try {
        while (!signal.aborted) {
          const current = revision;
          const at = requested;
          const slot = latest.current.slot;
          const mapping =
            slot.mode === 'image'
              ? { kind: 'image' as const, assetId: slot.image.assetId }
              : {
                  kind: 'video' as const,
                  assetId: slot.video.assetId,
                  range: { start: at, end: at },
                  holdLast: at === slot.video.trim.end,
                };
          const lease = await media.frame(mapping, slot);
          try {
            if (signal.aborted) return;
            if (current === revision) {
              const context = canvas.current?.getContext('2d');
              if (!context) throw new Error('preview-canvas-unavailable');
              lease.draw(context);
              setStatus('ready');
            }
          } finally {
            lease.release();
          }
          if (current === revision) break;
        }
      } catch {
        if (!signal.aborted) {
          setStatus('error');

          media?.dispose();
        }
      } finally {
        running = false;
      }
    };
    seek.current = (value) => {
      const slot = latest.current.slot;
      requested =
        slot.mode === 'video'
          ? Math.min(slot.video.trim.end, Math.max(slot.video.trim.start, value))
          : 0;
      revision += 1;
      position.current = requested;
      setTime(requested);
      void draw();
    };
    void createReviewPresentationMedia({
      slot,
      output: { width, height },
      signal,
      readAsset: resolveReviewAssetBytes,
    })
      .then((ready) => {
        if (signal.aborted) {
          ready.dispose();
          return;
        }
        media = ready;
        latest.current.onAudio(ready.audioTrack !== null);
        void draw();
      })
      .catch(() => {
        if (!signal.aborted) setStatus('error');
      });
    return () => {
      seek.current = () => {};
      controller.abort();
      media?.dispose();
    };
  }, [assetId, width, height, retry, available]);
  useEffect(() => {
    seek.current(position.current);
  }, [slot]);
  return { canvas, seek, time, status, width, height, retry: () => setRetry((value) => value + 1) };
}

/** Silent local seek leaves authored placement and trim unchanged. */
export function ReviewPresentationMediaPreview(props: MediaPreviewProps) {
  useAppLocale();
  const { canvas, seek, time, status, width, height, retry } = usePresentationMedia(props);
  const { slot } = props;
  const filename = slot.mode === 'image' ? slot.image.filename : slot.video.filename;
  return (
    <div className="min-w-0 space-y-1" aria-busy={status === 'loading'}>
      <div
        className="relative flex h-28 items-center justify-center overflow-hidden rounded
          bg-[var(--sniptale-color-surface-muted)]"
      >
        <canvas
          ref={canvas}
          width={width}
          height={height}
          className="max-h-full max-w-full object-contain"
          aria-label={translate('gallery.videoReview.presentationMediaPreview')}
          style={{ visibility: status === 'ready' ? 'visible' : 'hidden' }}
        />
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
