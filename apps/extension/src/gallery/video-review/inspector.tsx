import {
  ChevronsDownUp,
  ChevronsUpDown,
  Pencil,
  Trash2,
  Copy,
  ArrowLeft,
  Plus,
  FileDown,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { translate } from '../../platform/i18n';
import type { ReviewAnnotation } from '../../features/video/review/types';
import {
  ReviewButton,
  reviewTimeLabel,
  reviewIconButtonClassName,
  reviewTextButtonClassName,
  reviewDeleteButtonClassName,
} from './controls';

/** Fixed-open action inspector, with navigation separate from editing the current field. */
export function ReviewInspector(props: {
  filename: string;
  annotations: readonly ReviewAnnotation[];
  selectedId: string | null;
  busy: boolean;
  fullHeight?: boolean;
  onToggleHeight?(): void;
  message: string | null;
  recovery?: ReactNode;
  scene?: ReactNode;
  selectionLabel?: string | undefined;
  onBack(): void;
  onClose?(): void;
  rangeSelected?: boolean;
  onAdd(): void;
  onSelect(value: ReviewAnnotation): void;
  onHover(value: ReviewAnnotation | null): void;
  onEdit(value: ReviewAnnotation): void;
  onDelete(value: ReviewAnnotation): void;
  onReport(action: 'copy' | 'download'): void;
  children: ReactNode;
  actions?: ReactNode;
  composer?: ReactNode;
  editingId?: string | undefined;
  contextKey?: string;
  settingsAvailable?: boolean;
  saveStatus?: 'saving' | 'saved' | 'failed';
  onRetry?(): void;
}) {
  const contextKey = props.contextKey ?? 'comments';
  type Section = 'scene' | 'selected' | 'comments';
  const contextSection: Section =
    !props.settingsAvailable || contextKey.startsWith('comments')
      ? 'comments'
      : props.selectionLabel
        ? 'selected'
        : 'scene';
  const [section, setSection] = useState<Section>(contextSection);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
  }, [contextKey, section]);
  const previousSettings = useRef(props.settingsAvailable);
  useEffect(() => {
    const modeChanged = previousSettings.current !== props.settingsAvailable;
    previousSettings.current = props.settingsAvailable;
    setSection((current) =>
      !modeChanged && contextSection === 'scene' && current === 'comments'
        ? current
        : contextSection
    );
  }, [contextKey, contextSection, props.settingsAvailable]);
  const shown = !props.settingsAvailable
    ? 'comments'
    : section === 'selected' && !props.selectionLabel
      ? 'scene'
      : section;
  return (
    <aside
      data-ui="gallery.videoReview.inspector"
      className={`flex min-h-0 flex-col gap-2 overflow-hidden border-l
        border-[var(--sniptale-color-border-soft)] p-3 [--sniptale-compact-font-size:12px] ${
          props.fullHeight
            ? 'min-[800px]:col-start-2 min-[800px]:row-start-1 min-[800px]:row-span-2'
            : ''
        }`}
    >
      <ReviewInspectorHeader {...props} />
      <div className="shrink-0">
        <p
          className="truncate text-xs text-[var(--sniptale-color-text-muted)]"
          title={props.filename}
        >
          {props.filename}
        </p>
      </div>
      {props.saveStatus === 'failed' ? (
        <div
          className="flex items-center gap-2 text-xs text-[var(--sniptale-color-text-muted)]"
          role="status"
        >
          <span>{translate('gallery.videoReview.saveFailed')}</span>
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
      {props.settingsAvailable ? (
        <div className="shrink-0" data-ui="gallery.videoReview.inspectorNavigation">
          <SegmentedSwitch<Section>
            wrap
            density="compact"
            activeId={shown}
            ariaLabel={translate('gallery.videoReview.inspector')}
            options={[
              { id: 'comments', label: translate('gallery.videoReview.comments') },
              { id: 'scene', label: translate('gallery.videoReview.scene') },
              ...(props.selectionLabel
                ? [{ id: 'selected' as const, label: props.selectionLabel }]
                : []),
            ]}
            onChange={setSection}
          />
        </div>
      ) : null}
      <div ref={scroll} className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {shown === 'scene' ? (
          props.scene
        ) : shown === 'selected' ? (
          props.children
        ) : (
          <>
            {!props.settingsAvailable &&
            (contextKey.startsWith('action:') || contextKey.startsWith('edit:')) ? (
              <section className="space-y-2 border-b border-[var(--sniptale-color-border-soft)] pb-3">
                <h3 className="text-sm font-semibold">{props.selectionLabel}</h3>
                {props.children}
              </section>
            ) : null}
            <ReviewNotes {...props} />
          </>
        )}
      </div>
      <ReviewInspectorFooter {...props} showReports={shown === 'comments'} />
    </aside>
  );
}

/** Saved timeline comments with hover, select, and row actions. */
function ReviewAnnotationList(props: {
  annotations: readonly ReviewAnnotation[];
  selectedId: string | null;
  editingId?: string | undefined;
  composer?: ReactNode;
  busy: boolean;
  onSelect(value: ReviewAnnotation): void;
  onHover(value: ReviewAnnotation | null): void;
  onEdit(value: ReviewAnnotation): void;
  onDelete(value: ReviewAnnotation): void;
}) {
  return (
    <ol className="space-y-2">
      {props.annotations.map((annotation) => (
        <li
          key={annotation.id}
          className={`group relative rounded-lg ${props.editingId === annotation.id ? '' : 'border p-3'}
              ${
                props.selectedId === annotation.id
                  ? 'border-[var(--sniptale-color-accent)]'
                  : 'border-[var(--sniptale-color-border-soft)]'
              }`}
          onMouseEnter={() => props.onHover(annotation)}
          onMouseLeave={() => props.onHover(null)}
        >
          {props.editingId === annotation.id ? (
            props.composer
          ) : (
            <>
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
                  label={translate('gallery.videoReview.editComment')}
                  disabled={props.busy}
                  className={reviewIconButtonClassName}
                  onClick={() => props.onEdit(annotation)}
                >
                  <Pencil size={16} />
                </ReviewButton>
                <ReviewButton
                  label={translate('gallery.videoReview.deleteComment')}
                  disabled={props.busy}
                  className={`${reviewDeleteButtonClassName} !w-8`}
                  onClick={() => props.onDelete(annotation)}
                >
                  <Trash2 size={16} />
                </ReviewButton>
              </div>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Reports remain above the export divider; all footer commands have readable labels. */
function ReviewInspectorFooter(
  props: Parameters<typeof ReviewInspector>[0] & { showReports: boolean }
) {
  return (
    <div className="min-h-0 max-h-[max(10rem,40%)] shrink-0 scroll-pt-20 space-y-2 overflow-y-auto">
      {props.showReports ? (
        <div className="grid grid-cols-1 gap-1" data-ui="gallery.videoReview.reportActions">
          <ReviewButton
            label={translate('gallery.videoReview.copyReport')}
            disabled={props.busy}
            className={`${reviewTextButtonClassName} justify-start`}
            onClick={() => props.onReport('copy')}
          >
            <Copy size={15} aria-hidden="true" />
            <span>{translate('gallery.videoReview.copyReport')}</span>
          </ReviewButton>
          <ReviewButton
            label={translate('gallery.videoReview.downloadReport')}
            disabled={props.busy}
            className={`${reviewTextButtonClassName} justify-start`}
            onClick={() => props.onReport('download')}
          >
            <FileDown size={15} aria-hidden="true" />
            <span>{translate('gallery.videoReview.downloadReport')}</span>
          </ReviewButton>
        </div>
      ) : null}
      <div
        data-ui="gallery.videoReview.exportFooter"
        className="border-t border-[var(--sniptale-color-border-soft)] pt-2"
      >
        {props.actions}
      </div>
    </div>
  );
}

/** The note feed owns note creation, empty state and row actions. */
function ReviewNotes(props: Parameters<typeof ReviewInspector>[0]) {
  return (
    <>
      {!props.annotations.some((note) => note.id === props.editingId) ? props.composer : null}
      {!props.composer ? (
        <div className="space-y-2">
          {!props.settingsAvailable ? (
            <h3 className="text-sm font-semibold">{translate('gallery.videoReview.comments')}</h3>
          ) : null}
          <ReviewButton
            label={translate(
              props.rangeSelected
                ? 'gallery.videoReview.commentRange'
                : 'gallery.videoReview.addComment'
            )}
            disabled={props.busy || !!props.composer}
            className={`${reviewTextButtonClassName} !w-full justify-center`}
            onClick={() => props.onAdd()}
          >
            <Plus size={16} aria-hidden="true" />
            <span>
              {translate(
                props.rangeSelected
                  ? 'gallery.videoReview.commentRange'
                  : 'gallery.videoReview.addComment'
              )}
            </span>
          </ReviewButton>
        </div>
      ) : null}
      {!props.annotations.length && !props.composer ? (
        <p className="text-sm text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.commentsEmpty')}
        </p>
      ) : null}
      <ReviewAnnotationList
        editingId={props.editingId}
        composer={props.composer}
        annotations={props.annotations}
        selectedId={props.selectedId}
        busy={props.busy}
        onSelect={props.onSelect}
        onHover={props.onHover}
        onEdit={props.onEdit}
        onDelete={props.onDelete}
      />
    </>
  );
}

/** Header exits share the flush owner; Back restores the viewer, Close dismisses it. */
function ReviewInspectorHeader(props: Parameters<typeof ReviewInspector>[0]) {
  return (
    <header className="flex shrink-0 items-center gap-1">
      <ReviewButton
        label={translate('gallery.videoReview.back')}
        disabled={props.busy}
        onClick={props.onBack}
        className={reviewIconButtonClassName}
      >
        <ArrowLeft size={16} aria-hidden="true" />
      </ReviewButton>
      <h2 className="min-w-0 flex-1 text-sm font-semibold">
        {translate('gallery.videoReview.editorTitle')}
      </h2>
      <ReviewButton
        label={translate(
          props.fullHeight
            ? 'videoEditor.app.panelRestoreHeight'
            : 'videoEditor.app.panelFullHeight'
        )}
        aria-pressed={!!props.fullHeight}
        className={reviewIconButtonClassName}
        onClick={props.onToggleHeight}
      >
        {props.fullHeight ? <ChevronsDownUp size={16} /> : <ChevronsUpDown size={16} />}
      </ReviewButton>
      <ReviewButton
        label={translate('common.actions.close')}
        disabled={props.busy}
        onClick={props.onClose ?? props.onBack}
        className={reviewIconButtonClassName}
      >
        <X size={16} aria-hidden="true" />
      </ReviewButton>
    </header>
  );
}
