import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ReviewInspectorPresentation } from './inspector-sections';
import '../../ui/compact-inspector-controls/inspector-surface.css';
import './inspector.css';
import './inspector-navigation.css';
import {
  List,
  PanelLeft,
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
import type { ReviewAnnotation, ReviewSelection } from '../../features/video/review/types';
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
  selectionHasSections?: boolean;
  selectionPreferenceScope?: string;
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
  contextSelection?: ReviewSelection;
  exportRequest?: number;
  settingsAvailable?: boolean;
  saveStatus?: 'saving' | 'saved' | 'failed';
  onRetry?(): void;
}) {
  type Section = 'scene' | 'selected' | 'comments' | 'export';
  const { presentation, setPresentation, shown, setSection, scroll } =
    useReviewInspectorNavigation(props);
  return (
    <aside
      data-ui="gallery.videoReview.inspector"
      className={`sniptale-inspector-surface flex min-h-0 flex-col gap-2 overflow-hidden border-l
        border-[var(--sniptale-color-border-soft)] p-3 [--sniptale-compact-font-size:12px] ${
          props.fullHeight
            ? 'min-[800px]:col-start-2 min-[800px]:row-start-1 min-[800px]:row-span-2'
            : ''
        }`}
    >
      <ReviewInspectorHeader
        {...props}
        presentation={presentation}
        section={shown}
        onTogglePresentation={() =>
          setPresentation((mode) => (mode === 'all' ? 'sections' : 'all'))
        }
      />
      <div className="shrink-0">
        <p
          className="truncate text-xs text-[var(--sniptale-color-text-muted)]"
          title={props.filename}
        >
          {props.filename}
        </p>
      </div>
      <ReviewInspectorStatus {...props} />
      {props.settingsAvailable || props.selectionLabel || props.actions ? (
        <div
          className="review-inspector-navigation shrink-0"
          data-ui="gallery.videoReview.inspectorNavigation"
        >
          <SegmentedSwitch<Section>
            density="compact"
            activeId={shown}
            ariaLabel={translate('gallery.videoReview.inspector')}
            options={[
              { id: 'comments', label: translate('gallery.videoReview.comments') },
              ...(props.settingsAvailable
                ? [{ id: 'scene' as const, label: translate('gallery.videoReview.scene') }]
                : []),
              ...(props.selectionLabel
                ? [{ id: 'selected' as const, label: props.selectionLabel }]
                : []),
              ...(props.actions
                ? [
                    {
                      id: 'export' as const,
                      label: translate('gallery.videoReview.exportSettings'),
                    },
                  ]
                : []),
            ]}
            onChange={setSection}
          />
        </div>
      ) : null}
      <div
        ref={scroll}
        className="review-inspector-scroll min-h-0 flex-1 space-y-3 overflow-y-auto"
      >
        <ReviewInspectorPresentation
          value={presentation}
          section={shown}
          selectionScope={props.selectionPreferenceScope}
        >
          {shown === 'export' ? (
            <section data-ui="gallery.videoReview.exportSection" className="space-y-3">
              <h3 className="text-sm font-semibold">
                {translate('gallery.videoReview.exportSettings')}
              </h3>
              {props.actions}
            </section>
          ) : shown === 'scene' ? (
            props.scene
          ) : shown === 'selected' ? (
            props.children
          ) : (
            <ReviewNotes {...props} />
          )}
        </ReviewInspectorPresentation>
      </div>
      <ReviewInspectorFooter {...props} showReports={shown === 'comments'} />
    </aside>
  );
}

/** Owns transient inspector navigation and the scroll reset for each explicit view change. */
function useReviewInspectorNavigation(props: Parameters<typeof ReviewInspector>[0]) {
  const [presentation, setPresentation] = useState<'all' | 'sections'>('all');
  const contextKey = props.contextKey ?? 'comments';
  type Section = 'scene' | 'selected' | 'comments' | 'export';
  const contextSection: Section = contextKey.startsWith('comments')
    ? 'comments'
    : props.selectionLabel
      ? 'selected'
      : props.settingsAvailable
        ? 'scene'
        : 'comments';
  const [section, setSection] = useState<Section>(contextSection);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
  }, [contextKey, section, presentation]);
  const previousSettings = useRef(props.settingsAvailable);
  const previousExportRequest = useRef(0);
  const exportAvailable = !!props.actions;
  useEffect(() => {
    const modeChanged = previousSettings.current !== props.settingsAvailable;
    previousSettings.current = props.settingsAvailable;
    const exportRequested = previousExportRequest.current !== (props.exportRequest ?? 0);
    previousExportRequest.current = props.exportRequest ?? 0;
    setSection((current) =>
      exportRequested && exportAvailable
        ? 'export'
        : !modeChanged && contextSection === 'scene' && current === 'comments'
          ? current
          : contextSection
    );
  }, [
    contextKey,
    contextSection,
    props.settingsAvailable,
    props.contextSelection,
    props.exportRequest,
    exportAvailable,
  ]);
  const shown =
    section === 'selected' && !props.selectionLabel
      ? props.settingsAvailable
        ? 'scene'
        : 'comments'
      : section === 'scene' && !props.settingsAvailable
        ? 'comments'
        : section;
  return { presentation, setPresentation, shown, setSection, scroll };
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
    <ol className="review-inspector-list space-y-2">
      {props.annotations.map((annotation) => (
        <li
          key={annotation.id}
          data-selected={props.selectedId === annotation.id}
          data-editing={props.editingId === annotation.id}
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
                aria-pressed={props.selectedId === annotation.id}
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
              <div className="review-inspector-row-actions flex justify-end gap-1">
                <ReviewButton
                  label={translate('gallery.videoReview.editComment')}
                  disabled={props.busy}
                  className={reviewIconButtonClassName}
                  onClick={() => props.onEdit(annotation)}
                >
                  <Pencil size={16} />
                </ReviewButton>
              </div>
              {props.selectedId === annotation.id ? (
                <div className="col-span-2 border-t border-[var(--sniptale-color-border-soft)] pt-3">
                  <ReviewButton
                    label={translate('gallery.videoReview.deleteSelected')}
                    disabled={props.busy}
                    className={`${reviewDeleteButtonClassName} !w-full justify-start`}
                    onClick={() => props.onDelete(annotation)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                    <span>{translate('gallery.videoReview.deleteSelected')}</span>
                  </ReviewButton>
                </div>
              ) : null}
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Comment reports retain their own commands; export belongs to the inspector section. */
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
          {!props.settingsAvailable && !props.selectionLabel ? (
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
function ReviewInspectorHeader(
  props: Parameters<typeof ReviewInspector>[0] & {
    presentation: 'all' | 'sections';
    section: 'scene' | 'selected' | 'comments' | 'export';
    onTogglePresentation(): void;
  }
) {
  return (
    <header className="flex shrink-0 items-center gap-1">
      <ContentToolbarButton
        type="button"
        tone="utility"
        size="compact"
        title={translate('gallery.videoReview.back')}
        disabled={props.busy}
        onClick={props.onBack}
      >
        <ArrowLeft size={16} aria-hidden="true" />
      </ContentToolbarButton>
      <h2 className="min-w-0 flex-1 text-sm font-semibold">
        {translate('gallery.videoReview.editorTitle')}
      </h2>
      <ContentToolbarButton
        type="button"
        tone="utility"
        size="compact"
        title={translate(
          props.fullHeight
            ? 'videoEditor.app.panelRestoreHeight'
            : 'videoEditor.app.panelFullHeight'
        )}
        aria-pressed={!!props.fullHeight}
        onClick={props.onToggleHeight}
      >
        {props.fullHeight ? <ChevronsDownUp size={16} /> : <ChevronsUpDown size={16} />}
      </ContentToolbarButton>
      {props.section === 'scene' ||
      (props.section === 'selected' && props.selectionHasSections === true) ? (
        <ContentToolbarButton
          type="button"
          tone="utility"
          size="compact"
          title={translate(
            props.presentation === 'all'
              ? 'scenario.editor.inspectorShowSections'
              : 'scenario.editor.inspectorShowAll'
          )}
          dataUi="gallery.videoReview.inspectorPresentation"
          onClick={props.onTogglePresentation}
        >
          {props.presentation === 'all' ? (
            <List size={16} aria-hidden="true" />
          ) : (
            <PanelLeft size={16} aria-hidden="true" />
          )}
        </ContentToolbarButton>
      ) : null}

      <ContentToolbarButton
        type="button"
        tone="utility"
        size="compact"
        title={translate('common.actions.close')}
        disabled={props.busy}
        onClick={props.onClose ?? props.onBack}
      >
        <X size={16} aria-hidden="true" />
      </ContentToolbarButton>
    </header>
  );
}

/** Save recovery and feedback stay visible above the inspector's scrollable settings. */
function ReviewInspectorStatus(
  props: Pick<
    Parameters<typeof ReviewInspector>[0],
    'saveStatus' | 'busy' | 'onRetry' | 'message' | 'recovery'
  >
) {
  return (
    <>
      {props.saveStatus === 'failed' ? (
        <div
          className="flex items-center gap-2 text-xs text-[var(--sniptale-color-text-muted)]"
          role="status"
        >
          <span>{translate('gallery.videoReview.saveFailed')}</span>
          <ReviewButton
            label={translate('gallery.videoReview.retry')}
            disabled={props.busy}
            onClick={props.onRetry}
          />
        </div>
      ) : null}
      {props.message ? (
        <p role="status" className="text-sm">
          {props.message}
        </p>
      ) : null}
      {props.recovery}
    </>
  );
}
