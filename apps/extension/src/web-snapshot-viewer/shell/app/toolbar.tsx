import { Download, FileDown, LoaderCircle, PanelTopClose, PanelTopOpen } from 'lucide-react';
import { formatDateTime, formatNumber, translate, type AppLocale } from '../../../platform/i18n';
import type { LoadedWebSnapshotPackage } from '../../viewer/assets';
import { WebSnapshotViewerModeSwitch, type WebSnapshotViewerMode } from './view-mode';
import { WebSnapshotZoomControls, type ViewerZoomControls } from './viewport-zoom';

const toolbarButtonClassName = [
  'inline-flex h-8 shrink-0 items-center justify-center rounded-md',
  'text-[var(--sniptale-color-text-muted)] transition',
  'hover:bg-[var(--sniptale-color-surface-hover)] hover:text-[var(--sniptale-color-text-primary)]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]',
  'disabled:cursor-wait disabled:opacity-60',
].join(' ');

function getHeaderTitle(loaded: LoadedWebSnapshotPackage, locale: AppLocale): string {
  const sourceTitle = loaded.manifest.source.title?.trim();
  return sourceTitle || translate('webSnapshotViewer.app.documentTitleFallback', locale);
}

function formatArchiveMegabytes(size: number, locale: AppLocale): string {
  const megabytes = size / 1_000_000;
  return `${formatNumber(
    megabytes,
    { maximumFractionDigits: megabytes < 10 ? 2 : 1 },
    locale
  )} ${translate('shared.bytes.mb', locale)}`;
}

function ViewerToolbarActions(props: {
  loaded: LoadedWebSnapshotPackage;
  locale: AppLocale;
  onPrint: () => void;
  printPending: boolean;
}) {
  const downloadLabel = translate('webSnapshotViewer.app.downloadPackage', props.locale);
  const pdfLabel = translate('webSnapshotViewer.app.exportPdf', props.locale);

  return (
    <div
      className="flex shrink-0 items-center rounded-md border border-[var(--sniptale-color-border-soft)]"
      role="group"
      aria-label={translate('webSnapshotViewer.app.exportActions', props.locale)}
    >
      <a
        aria-label={downloadLabel}
        className={`${toolbarButtonClassName} w-8`}
        download={props.loaded.archiveFilename}
        href={props.loaded.archiveUrl}
        title={downloadLabel}
      >
        <Download aria-hidden="true" size={15} />
      </a>
      <button
        type="button"
        aria-label={pdfLabel}
        className={`${toolbarButtonClassName} gap-1 border-l border-[var(--sniptale-color-border-soft)] px-2`}
        disabled={props.printPending}
        onClick={props.onPrint}
        title={pdfLabel}
      >
        {props.printPending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" size={14} />
        ) : (
          <FileDown aria-hidden="true" size={14} />
        )}
        <span className="text-[10px] font-bold tracking-wide">PDF</span>
      </button>
    </div>
  );
}

export function SnapshotViewerToolbar(props: {
  loaded: LoadedWebSnapshotPackage;
  locale: AppLocale;
  mode: WebSnapshotViewerMode;
  onCollapse: () => void;
  onModeChange: (mode: WebSnapshotViewerMode) => void;
  onPrint: () => void;
  printPending: boolean;
  zoom: ViewerZoomControls;
}) {
  const collapseLabel = translate('webSnapshotViewer.app.collapseToolbar', props.locale);
  const capturedAt = formatDateTime(
    new Date(props.loaded.manifest.capturedAt),
    { dateStyle: 'medium', timeStyle: 'short' },
    props.locale
  );

  return (
    <header
      className="flex min-h-[52px] w-full min-w-0 max-w-full flex-wrap items-center gap-x-4 gap-y-2
        border-b border-[var(--sniptale-color-border-soft)] px-4 py-2"
    >
      <div className="min-w-0 basis-64 flex-1">
        <div className="truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {getHeaderTitle(props.loaded, props.locale)}
        </div>
        <div
          className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--sniptale-color-text-muted)]"
          data-testid="snapshot-metadata"
        >
          <span className="shrink-0">{capturedAt}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">
            {formatArchiveMegabytes(props.loaded.archiveSize, props.locale)}
          </span>
          <span aria-hidden="true">·</span>
          <span className="min-w-0 truncate" title={props.loaded.manifest.source.url ?? undefined}>
            {props.loaded.manifest.source.url ?? '—'}
          </span>
        </div>
      </div>
      <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
        <ViewerToolbarActions
          loaded={props.loaded}
          locale={props.locale}
          onPrint={props.onPrint}
          printPending={props.printPending}
        />
        {props.mode === 'assets' ? null : (
          <WebSnapshotZoomControls locale={props.locale} {...props.zoom} />
        )}
        <WebSnapshotViewerModeSwitch
          locale={props.locale}
          mode={props.mode}
          onModeChange={props.onModeChange}
        />
        <button
          type="button"
          aria-label={collapseLabel}
          title={collapseLabel}
          className={`${toolbarButtonClassName} w-8`}
          onClick={props.onCollapse}
        >
          <PanelTopClose aria-hidden="true" size={16} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}

export function CollapsedToolbarButton(props: { locale: AppLocale; onExpand: () => void }) {
  const label = translate('webSnapshotViewer.app.expandToolbar', props.locale);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`${toolbarButtonClassName} fixed right-6 top-3 z-20 h-9 w-9 border
        border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)] shadow-md`}
      onClick={props.onExpand}
    >
      <PanelTopOpen aria-hidden="true" size={17} />
    </button>
  );
}
