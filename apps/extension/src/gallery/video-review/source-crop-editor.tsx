import { useEffect, useRef, useState } from 'react';
import { fitQuickEditSourceCrop } from '../../features/video/review/advanced/canvas';
import type {
  QuickEditCanvasSize,
  QuickEditRect,
} from '../../features/video/review/advanced/types';
import { translate } from '../../platform/i18n';
import { ReviewButton } from './controls';
import { ReviewNumberRow } from './number-row';
import { useZoomPreviewFrame, useZoomPreviewSource } from './use-zoom-preview-source';

/** One local crop draft uses the existing source decoder and commits through the scene owner. */
export function ReviewSourceCropEditor(props: {
  file: File;
  source: { width: number; height: number };
  sourceTime: number;
  canvas: QuickEditCanvasSize;
  onApply(crop: QuickEditRect): void;
  onCancel(): void;
}) {
  const loader = useZoomPreviewSource(props.file);
  const [sourceTime] = useState(props.sourceTime);
  const { frame, status, retry } = useZoomPreviewFrame(loader, sourceTime);
  const maximum = fitQuickEditSourceCrop(props.source, props.canvas);
  const [draft, setDraft] = useState(() =>
    fitQuickEditSourceCrop(props.source, props.canvas, props.canvas.crop)
  );
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    crop: QuickEditRect;
    resize: boolean;
  } | null>(null);
  const cancel = props.onCancel;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [cancel]);
  useEffect(() => {
    const target = canvas.current;
    const context = target?.getContext('2d');
    if (!target || !context || !frame) return;
    context.clearRect(0, 0, target.width, target.height);
    context.drawImage(frame.image, 0, 0, target.width, target.height);
    const x = draft.x * target.width,
      y = draft.y * target.height;
    const width = draft.width * target.width,
      height = draft.height * target.height;
    context.fillStyle = '#00000099';
    context.fillRect(0, 0, target.width, y);
    context.fillRect(0, y + height, target.width, target.height - y - height);
    context.fillRect(0, y, x, height);
    context.fillRect(x + width, y, target.width - x - width, height);
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    context.fillStyle = '#ffffff';
    context.fillRect(x + width - 4, y + height - 4, 8, 8);
  }, [frame, draft]);
  const resize = (fraction: number) => {
    const width = maximum.width * fraction,
      height = maximum.height * fraction;
    setDraft((current) => ({
      width,
      height,
      x: Math.max(0, Math.min(1 - width, current.x + (current.width - width) / 2)),
      y: Math.max(0, Math.min(1 - height, current.y + (current.height - height) / 2)),
    }));
  };
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    };
  };
  const minimum = Math.max(
    1 / props.source.width / maximum.width,
    1 / props.source.height / maximum.height
  );
  return (
    <div className="space-y-2" data-ui="gallery.videoReview.sourceCropEditor">
      <canvas
        ref={canvas}
        width={480}
        height={Math.max(1, Math.round((480 * props.source.height) / props.source.width))}
        className="mx-auto block w-full touch-none rounded"
        style={{ maxWidth: (240 * props.source.width) / props.source.height }}
        role="application"
        tabIndex={0}
        aria-label={translate('gallery.videoReview.sourceCropArea')}
        onKeyDown={(event) => {
          const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
          const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
          if (!dx && !dy) return;
          event.preventDefault();
          const step = event.shiftKey ? 10 : 1;
          setDraft((current) => ({
            ...current,
            x: Math.max(
              0,
              Math.min(1 - current.width, current.x + (dx * step) / props.source.width)
            ),
            y: Math.max(
              0,
              Math.min(1 - current.height, current.y + (dy * step) / props.source.height)
            ),
          }));
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || !frame || drag.current) return;
          const at = point(event),
            bounds = event.currentTarget.getBoundingClientRect();
          const resizing =
            Math.abs(at.x - draft.x - draft.width) * bounds.width < 12 &&
            Math.abs(at.y - draft.y - draft.height) * bounds.height < 12;
          if (
            !resizing &&
            (at.x < draft.x ||
              at.x > draft.x + draft.width ||
              at.y < draft.y ||
              at.y > draft.y + draft.height)
          )
            return;
          event.preventDefault();
          event.currentTarget.focus();
          drag.current = { ...at, id: event.pointerId, crop: draft, resize: resizing };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (!active || active.id !== event.pointerId) return;
          const at = point(event),
            crop = active.crop;
          if (active.resize) {
            const ratio = crop.width / crop.height;
            const width = Math.max(
              maximum.width * minimum,
              Math.min(1 - crop.x, (1 - crop.y) * ratio, crop.width + at.x - active.x)
            );
            setDraft({ ...crop, width, height: width / ratio });
          } else
            setDraft({
              ...crop,
              x: Math.max(0, Math.min(1 - crop.width, crop.x + at.x - active.x)),
              y: Math.max(0, Math.min(1 - crop.height, crop.y + at.y - active.y)),
            });
        }}
        onPointerUp={(event) => {
          if (drag.current?.id !== event.pointerId) return;
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={() => {
          if (drag.current) setDraft(drag.current.crop);
          drag.current = null;
        }}
        onPointerCancel={() => {
          if (drag.current) setDraft(drag.current.crop);
          drag.current = null;
        }}
      />
      {status !== 'ready' ? (
        <p role="status" className="text-xs">
          {translate(
            status === 'failed'
              ? 'gallery.videoReview.previewFailed'
              : 'gallery.videoReview.previewLoading'
          )}
        </p>
      ) : null}
      {status === 'failed' ? (
        <ReviewButton label={translate('gallery.videoReview.retry')} onClick={retry} />
      ) : null}
      <ReviewNumberRow
        label={translate('gallery.videoReview.sourceCropSize')}
        unit="%"
        min={minimum * 100}
        max={100}
        step={1}
        value={(draft.width / maximum.width) * 100}
        onChange={(value) => resize(value / 100)}
      />
      <div className="flex flex-wrap gap-2">
        <ReviewButton
          label={translate('gallery.videoReview.sourceCropReset')}
          onClick={() => setDraft(maximum)}
        />
        <ReviewButton
          label={translate('gallery.videoReview.sourceCropApply')}
          onClick={() => props.onApply(draft)}
        />
        <ReviewButton label={translate('common.actions.cancel')} onClick={props.onCancel} />
      </div>
    </div>
  );
}
