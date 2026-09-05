import { Undo2, Redo2, Pencil, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { translate } from '../../platform/i18n';
import type { ReviewAnnotation } from '../../features/video/review/types';
import { ReviewButton, reviewTimeLabel } from './controls';

/** Fixed-open action inspector, with navigation separate from editing the current field. */
export function ReviewInspector(props: {
  filename: string;
  annotations: readonly ReviewAnnotation[];
  selectedId: string | null;
  busy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  message: string | null;
  onBack(): void;
  onUndo(): void;
  onRedo(): void;
  onAdd(): void;
  onSelect(value: ReviewAnnotation): void;
  onHover(value: ReviewAnnotation | null): void;
  onEdit(value: ReviewAnnotation): void;
  onDelete(value: ReviewAnnotation): void;
  onReport(action: 'copy' | 'download'): void;
  children: ReactNode;
}) {
  return (
    <aside
      className="flex min-h-0 flex-col gap-3 overflow-y-auto border-l
          border-[var(--sniptale-color-border-soft)] p-4"
    >
      <div className="flex flex-wrap gap-2">
        <ReviewButton
          label={translate('gallery.videoReview.back')}
          disabled={props.busy}
          onClick={props.onBack}
        />
        <ReviewButton
          label={translate('gallery.videoReview.undo')}
          disabled={props.busy || !props.canUndo}
          onClick={props.onUndo}
        >
          <Undo2 size={16} />
        </ReviewButton>
        <ReviewButton
          label={translate('gallery.videoReview.redo')}
          disabled={props.busy || !props.canRedo}
          onClick={props.onRedo}
        >
          <Redo2 size={16} />
        </ReviewButton>
      </div>
      <div>
        <h2 className="font-semibold">{translate('gallery.videoReview.title')}</h2>
        <p
          className="truncate text-xs text-[var(--sniptale-color-text-muted)]"
          title={props.filename}
        >
          {props.filename}
        </p>
      </div>
      {props.message ? (
        <p role="status" className="text-sm">
          {props.message}
        </p>
      ) : null}
      <div className="min-h-48 flex-1 space-y-3 overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{translate('gallery.videoReview.comments')}</h3>
          <ReviewButton
            label={translate('gallery.videoReview.addComment')}
            disabled={props.busy}
            onClick={props.onAdd}
          />
        </div>
        {props.children}
        {!props.annotations.length ? (
          <p className="text-sm text-[var(--sniptale-color-text-muted)]">
            {translate('gallery.videoReview.empty')}
          </p>
        ) : null}
        <ol className="space-y-2">
          {props.annotations.map((annotation) => (
            <li
              key={annotation.id}
              className={`rounded border p-2
              ${
                props.selectedId === annotation.id
                  ? 'border-[var(--sniptale-color-accent)]'
                  : 'border-[var(--sniptale-color-border-soft)]'
              }`}
              onMouseEnter={() => props.onHover(annotation)}
              onMouseLeave={() => props.onHover(null)}
            >
              <button
                type="button"
                className="block w-full text-left"
                onClick={() => props.onSelect(annotation)}
              >
                <span className="text-xs tabular-nums text-[var(--sniptale-color-text-muted)]">
                  {annotation.anchor.kind === 'point'
                    ? reviewTimeLabel(annotation.anchor.time)
                    : `${reviewTimeLabel(annotation.anchor.start)}–${reviewTimeLabel(annotation.anchor.end)}`}
                </span>
                <span className="mt-1 block whitespace-pre-wrap break-words text-sm">
                  {annotation.text}
                </span>
              </button>
              <div className="mt-2 flex flex-wrap gap-1">
                <ReviewButton
                  label={translate('gallery.videoReview.editComment')}
                  disabled={props.busy}
                  onClick={() => props.onEdit(annotation)}
                >
                  <Pencil size={16} />
                </ReviewButton>
                <ReviewButton
                  label={translate('gallery.videoReview.deleteComment')}
                  disabled={props.busy}
                  onClick={() => props.onDelete(annotation)}
                >
                  <Trash2 size={16} />
                </ReviewButton>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="space-y-2 border-t border-[var(--sniptale-color-border-soft)] pt-3">
        <div className="flex flex-wrap gap-2">
          <ReviewButton
            label={translate('gallery.videoReview.copyReport')}
            disabled={props.busy}
            onClick={() => props.onReport('copy')}
          />
          <ReviewButton
            label={translate('gallery.videoReview.downloadReport')}
            disabled={props.busy}
            onClick={() => props.onReport('download')}
          />
        </div>
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.reportScope')}
        </p>
      </div>
    </aside>
  );
}
