import type { ReviewInspectorNavigation } from './inspector-navigation';
import { InspectorLayout } from '../../ui/compact-inspector-controls/layout';
import type { ReviewBeforeAction } from './note-transitions';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ReviewInspectorPresentation } from './inspector-sections';
import '../../ui/compact-inspector-controls/inspector-surface.css';
import './inspector.css';
import './inspector-navigation.css';
import {
  Archive,
  List,
  PanelLeft,
  ChevronsDownUp,
  ChevronsUpDown,
  Pencil,
  Trash2,
  Copy,
  Plus,
  FileDown,
  X,
} from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { translate } from '../../platform/i18n';
import type { ReviewAnnotation } from '../../features/video/review/types';
import {
  ReviewButton,
  reviewTimeLabel,
  reviewIconButtonClassName,
  reviewTextButtonClassName,
} from './controls';

type InspectorSection =
  | 'scene'
  | 'selected'
  | 'comments'
  | 'export'
  | 'history'
  | 'preview'
  | 'speech'
  | 'text';

function inspectorNavigationOptions(args: {
  shown: InspectorSection;
  context: ReviewInspectorNavigation['context'];
  settingsAvailable: boolean | undefined;
  selectionLabel: string | undefined;
  actionHistory: boolean;
  actions: boolean;
}): { id: InspectorSection; label: string }[] {
  const options: { id: InspectorSection; label: string }[] = [];
  options.push({ id: 'comments', label: translate('gallery.videoReview.comments') });
  if (args.settingsAvailable)
    options.push({ id: 'scene', label: translate('gallery.videoReview.scene') });
  if (args.shown === 'preview') {
    options.push({ id: 'preview', label: translate('gallery.videoReview.previewSection') });
    return options;
  }
  if (args.context === 'text' && args.settingsAvailable)
    options.push({ id: 'text', label: translate('gallery.videoReview.textTrackDocument') });
  if (args.context === 'speech')
    options.push({ id: 'speech', label: translate('gallery.videoReview.speechTitle') });
  if (args.context === 'selected' && args.selectionLabel)
    options.push({ id: 'selected', label: args.selectionLabel });
  if (args.context === 'history' && args.actionHistory)
    options.push({ id: 'history', label: translate('gallery.videoReview.telemetry') });
  if (args.context === 'export' && args.actions)
    options.push({ id: 'export', label: translate('gallery.videoReview.exportSection') });
  return options;
}

/** Fixed-open action inspector, with navigation separate from editing the current field. */
export function ReviewInspector(props: {
  beforeAction?: ReviewBeforeAction | undefined;
  filename: string;
  annotations: readonly ReviewAnnotation[];
  selectedId: string | null;
  busy: boolean;
  fullHeight?: boolean;
  resizeHandle?: ReactNode;
  onToggleHeight?(): void;
  message: string | null;
  recovery?: ReactNode;
  scene?: ReactNode;
  preview?: ReactNode;
  speech?: ReactNode;
  textDocument?: ReactNode;
  actionHistory?: ReactNode;
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
  onBackup?(): void;
  children: ReactNode;
  actions?: ReactNode;
  composer?: ReactNode;
  editingId?: string | undefined;
  navigation: ReviewInspectorNavigation;
  settingsAvailable?: boolean;
  saveStatus?: 'saving' | 'saved' | 'failed';
  onRetry?(): void;
}) {
  const { presentation, setPresentation, shown, context, setSection, scroll } = props.navigation;
  const previewHost = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (shown === 'preview') previewHost.current?.focus({ preventScroll: true });
  }, [shown]);
  return (
    <InspectorLayout>
      <aside
        onKeyDown={(event) => {
          if (shown === 'preview' && event.key === 'Escape' && !event.defaultPrevented) {
            event.preventDefault();
            event.stopPropagation();
            props.navigation.closePreview();
          }
        }}
        data-ui="gallery.videoReview.inspector"
        className={`sniptale-inspector-surface relative flex min-h-0 flex-col gap-2 border-l
        border-[var(--sniptale-color-border-soft)] p-3 [--sniptale-compact-font-size:12px] ${
          props.fullHeight ? 'col-start-2 row-start-1 row-span-2' : ''
        }`}
      >
        {props.resizeHandle}
        <ReviewInspectorHeader
          {...props}
          onBack={props.onBack}
          presentation={presentation}
          section={shown}
          onTogglePresentation={() =>
            (props.beforeAction ?? ((action) => action()))(() =>
              setPresentation((mode) => (mode === 'all' ? 'sections' : 'all'))
            )
          }
        />
        <ReviewInspectorStatus {...props} />
        {props.settingsAvailable ||
        props.selectionLabel ||
        props.actions ||
        shown === 'preview' ||
        shown === 'speech' ? (
          <div
            className="review-inspector-navigation shrink-0"
            data-ui="gallery.videoReview.inspectorNavigation"
          >
            <SegmentedSwitch<InspectorSection>
              density="compact"
              activeId={shown}
              ariaLabel={translate('gallery.videoReview.inspector')}
              options={inspectorNavigationOptions({
                shown,
                context,
                settingsAvailable: props.settingsAvailable,
                selectionLabel: props.selectionLabel,
                actionHistory: !!props.actionHistory,
                actions: !!props.actions,
              })}
              onChange={setSection}
            />
          </div>
        ) : null}
        <div hidden={shown !== 'history'} className="review-history-host min-h-0 flex-1">
          <ReviewInspectorPresentation value={presentation} section="history">
            {props.actionHistory}
          </ReviewInspectorPresentation>
        </div>
        <div
          hidden={shown === 'history'}
          ref={scroll}
          className="review-inspector-scroll min-h-0 flex-1 space-y-3 overflow-y-auto"
        >
          <ReviewInspectorPresentation
            value={presentation}
            section={shown}
            selectionScope={props.selectionPreferenceScope}
          >
            {shown === 'preview' ? (
              <div
                ref={previewHost}
                tabIndex={-1}
                aria-label={translate('gallery.videoReview.previewSection')}
                data-ui="gallery.videoReview.previewInspector"
              >
                {props.preview}
              </div>
            ) : shown === 'history' ? null : shown === 'export' ? (
              <section data-ui="gallery.videoReview.exportSection" className="space-y-3">
                {props.actions}
                <ReviewBackupAction {...props} />
              </section>
            ) : shown === 'text' ? (
              props.textDocument
            ) : shown === 'speech' ? (
              props.speech
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
    </InspectorLayout>
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
  const list = useRef<HTMLOListElement>(null);
  return (
    <ol ref={list} tabIndex={-1} className="review-inspector-list space-y-2">
      {props.annotations.map((annotation) => (
        <li
          key={annotation.id}
          data-selected={props.selectedId === annotation.id}
          data-editing={props.editingId === annotation.id}
          className={`group relative rounded-[var(--sniptale-radius-sm)]
              ${props.editingId === annotation.id ? '' : 'border p-3'}
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
                {props.selectedId === annotation.id ? (
                  <ReviewButton
                    label={translate('gallery.videoReview.deleteSelected')}
                    disabled={props.busy}
                    className={reviewIconButtonClassName}
                    data-note-delete
                    onClick={(event) => {
                      // Busy disables this action before its row disappears.
                      if (event.currentTarget.ownerDocument.activeElement === event.currentTarget)
                        list.current?.focus({ preventScroll: true });
                      props.onDelete(annotation);
                    }}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </ReviewButton>
                ) : null}
              </div>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Backup is an export action for the current document. */
function ReviewBackupAction(
  props: Pick<Parameters<typeof ReviewInspector>[0], 'onBackup' | 'busy'>
) {
  return props.onBackup ? (
    <ReviewButton
      label={translate('gallery.app.selectionBackup')}
      disabled={props.busy}
      className={`${reviewTextButtonClassName} justify-start`}
      onClick={props.onBackup}
    >
      <Archive size={15} aria-hidden="true" />
      <span>{translate('gallery.app.selectionBackup')}</span>
    </ReviewButton>
  ) : null;
}

/** Comment reports retain their own commands; export belongs to the inspector section. */
function ReviewInspectorFooter(
  props: Parameters<typeof ReviewInspector>[0] & { showReports: boolean }
) {
  return (
    <div className="min-h-0 max-h-[max(10rem,40%)] shrink-0 scroll-pt-20 space-y-2 overflow-y-auto">
      {props.showReports ? (
        <div className="grid grid-cols-1 gap-1" data-ui="gallery.videoReview.reportActions">
          <ReviewBackupAction {...props} />
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

/** The header close action returns to the viewer through the existing guarded exit. */
function ReviewInspectorHeader(
  props: Parameters<typeof ReviewInspector>[0] & {
    presentation: 'all' | 'sections';
    section: InspectorSection;
    onTogglePresentation(): void;
  }
) {
  return (
    <header className="flex shrink-0 items-center gap-1">
      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold" title={props.filename}>
        {props.filename}
      </h2>
      {props.section === 'scene' ||
      props.section === 'speech' ||
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

      <ContentToolbarButton
        type="button"
        tone="close"
        className="review-inspector-close"
        size="compact"
        title={translate('common.actions.close')}
        disabled={props.busy}
        onPointerDown={(event) => {
          // The guarded exit owns field flush; blur must not disable Close before click.
          if (event.button === 0) event.preventDefault();
        }}
        onClick={props.onBack}
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
