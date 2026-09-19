import { Undo2, Redo2, Pencil, Trash2, Copy, Download, ArrowLeft, Video } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
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
  recovery?: ReactNode;
  modeControl?: ReactNode;
  onBack(): void;
  onUndo(): void;
  onRedo(): void;
  onAdd(): void;
  onSelect(value: ReviewAnnotation): void;
  onHover(value: ReviewAnnotation | null): void;
  onEdit(value: ReviewAnnotation): void;
  onDelete(value: ReviewAnnotation): void;
  /** Shows a saved annotation as a burned overlay without retyping its text. */
  onShowOnVideo(value: ReviewAnnotation): void;
  onReport(action: 'copy' | 'download'): void;
  children: ReactNode;
  actions?: ReactNode;
  canvas?: ReactNode;
  composer?: ReactNode;
  contextKey?: string;
  settingsAvailable?: boolean;
  saveStatus?: 'saving' | 'saved' | 'failed';
  onRetry?(): void;
}) {
  const contextKey = props.contextKey ?? 'comments';
  const [section, setSection] = useState<'settings' | 'comments'>(
    contextKey.startsWith('settings') ? 'settings' : 'comments'
  );
  useEffect(() => {
    setSection(contextKey.startsWith('settings') ? 'settings' : 'comments');
  }, [contextKey]);
  return (
    <aside
      className="flex min-h-0 flex-col gap-3 overflow-hidden border-l
          border-[var(--sniptale-color-border-soft)] p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold">
          {translate('gallery.videoReview.editorTitle')}
        </h2>
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
      {props.modeControl}
      <div>
        <p
          className="truncate text-xs text-[var(--sniptale-color-text-muted)]"
          title={props.filename}
        >
          {props.filename}
        </p>
      </div>
      {props.saveStatus ? (
        <div
          className="flex items-center gap-2 text-xs text-[var(--sniptale-color-text-muted)]"
          role="status"
        >
          <span>
            {translate(
              props.saveStatus === 'saving'
                ? 'gallery.videoReview.saving'
                : props.saveStatus === 'failed'
                  ? 'gallery.videoReview.saveFailed'
                  : 'gallery.videoReview.committed'
            )}
          </span>
          {props.saveStatus === 'failed' ? (
            <ReviewButton
              label={translate('gallery.videoReview.retry')}
              disabled={props.busy}
              onClick={props.onRetry}
            />
          ) : null}
        </div>
      ) : null}
      {props.message ? (
        <p role="status" className="text-sm">
          {props.message}
        </p>
      ) : null}
      {props.recovery}
      {props.contextKey && props.settingsAvailable !== false ? (
        <SegmentedSwitch
          activeId={section}
          ariaLabel={translate('gallery.videoReview.inspector')}
          options={[
            { id: 'settings', label: translate('gallery.videoReview.properties') },
            { id: 'comments', label: translate('gallery.videoReview.comments') },
          ]}
          onChange={setSection}
        />
      ) : null}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {section === 'settings' ? (
          props.children
        ) : (
          <>
            {props.composer}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{translate('gallery.videoReview.comments')}</h3>
            </div>
            {!props.annotations.length ? (
              <p className="text-sm text-[var(--sniptale-color-text-muted)]">
                {translate('gallery.videoReview.commentsEmpty')}
              </p>
            ) : null}
            <ReviewAnnotationList
              annotations={props.annotations}
              selectedId={props.selectedId}
              busy={props.busy}
              onSelect={props.onSelect}
              onHover={props.onHover}
              onEdit={props.onEdit}
              onDelete={props.onDelete}
              onShowOnVideo={props.onShowOnVideo}
            />
            {props.canvas}
          </>
        )}
      </div>
      <ReviewInspectorFooter {...props} section={section} />
    </aside>
  );
}

/** Saved timeline comments with hover, select, and row actions. */
function ReviewAnnotationList(props: {
  annotations: readonly ReviewAnnotation[];
  selectedId: string | null;
  busy: boolean;
  onSelect(value: ReviewAnnotation): void;
  onHover(value: ReviewAnnotation | null): void;
  onEdit(value: ReviewAnnotation): void;
  onDelete(value: ReviewAnnotation): void;
  onShowOnVideo(value: ReviewAnnotation): void;
}) {
  return (
    <ol className="space-y-2">
      {props.annotations.map((annotation) => (
        <li
          key={annotation.id}
          className={`group relative rounded-lg border p-3
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
          <div className="mt-2 flex justify-end gap-1">
            <ReviewButton
              label={translate('gallery.videoReview.showOnVideo')}
              disabled={props.busy}
              className="!h-7 !min-h-7 !border-0 !bg-transparent !shadow-none"
              onClick={() => props.onShowOnVideo(annotation)}
            >
              <Video size={16} />
            </ReviewButton>
            <ReviewButton
              label={translate('gallery.videoReview.editComment')}
              disabled={props.busy}
              className="!h-7 !min-h-7 !border-0 !bg-transparent !shadow-none"
              onClick={() => props.onEdit(annotation)}
            >
              <Pencil size={16} />
            </ReviewButton>
            <ReviewButton
              label={translate('gallery.videoReview.deleteComment')}
              disabled={props.busy}
              className="!h-7 !min-h-7 !border-0 !bg-transparent !shadow-none"
              onClick={() => props.onDelete(annotation)}
            >
              <Trash2 size={16} />
            </ReviewButton>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Export/navigation remain visible; reporting belongs to the comments view. */
function ReviewInspectorFooter(
  props: Parameters<typeof ReviewInspector>[0] & { section: 'settings' | 'comments' }
) {
  const { section } = props;
  return (
    <div className="space-y-2 border-t border-[var(--sniptale-color-border-soft)] pt-3">
      {props.actions}
      {section === 'comments' ? (
        <div className="flex flex-wrap gap-2">
          <ReviewButton
            label={translate('gallery.videoReview.copyReport')}
            disabled={props.busy}
            title={translate('gallery.videoReview.reportScope')}
            className="flex-1 !border-0 !bg-transparent !shadow-none !text-xs"
            onClick={() => props.onReport('copy')}
          >
            <Copy size={14} />
            <span>{translate('gallery.videoReview.copyReport')}</span>
          </ReviewButton>
          <ReviewButton
            label={translate('gallery.videoReview.downloadReport')}
            disabled={props.busy}
            title={translate('gallery.videoReview.reportScope')}
            className="flex-1 !border-0 !bg-transparent !shadow-none !text-xs"
            onClick={() => props.onReport('download')}
          >
            <Download size={14} />
            <span>{translate('gallery.videoReview.downloadReport')}</span>
          </ReviewButton>
        </div>
      ) : null}
      <ReviewButton
        label={translate('gallery.videoReview.back')}
        disabled={props.busy}
        onClick={props.onBack}
        className="w-full !border-0 !bg-transparent !shadow-none"
      >
        <ArrowLeft size={15} />
        <span>{translate('gallery.videoReview.back')}</span>
      </ReviewButton>
    </div>
  );
}
