import {
  Download,
  FileDown,
  Link2,
  Link2Off,
  LoaderCircle,
  PanelTopClose,
  PanelTopOpen,
} from 'lucide-react';
import { formatDateTime, formatNumber, translate, type AppLocale } from '../../../platform/i18n';
import type { LoadedWebSnapshotPackage } from '../../viewer/assets';
import { WebSnapshotViewerModeSwitch, type WebSnapshotViewerMode } from './view-mode';
import { WebSnapshotZoomControls, type ViewerZoomControls } from './viewport-zoom';

import { useViewerHtmlExport } from './asset-actions';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';

const toolbarButtonClassName = [
  'inline-flex h-8 min-h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[4px]',
  'text-[13px] leading-[18px] font-medium text-[var(--sniptale-color-text-secondary)] transition-colors',
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

function HtmlExportAction(props: { loaded: LoadedWebSnapshotPackage; locale: AppLocale }) {
  const { download, state } = useViewerHtmlExport(props.loaded);
  const label = translate('webSnapshotViewer.app.exportHtml', props.locale);
  return (
    <>
      <ProductActionButton
        compact
        tone="secondary"
        type="button"
        aria-label={label}
        aria-busy={state === 'pending'}
        className={`${toolbarButtonClassName} px-2.5`}
        disabled={state === 'pending'}
        onClick={() => {
          void download();
        }}
        title={translate('webSnapshotViewer.app.exportHtmlDescription', props.locale)}
      >
        {state === 'pending' ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
        ) : (
          <FileDown aria-hidden="true" size={16} />
        )}
        <span>HTML</span>
      </ProductActionButton>
      {state === 'error' ? (
        <span
          role="alert"
          className="order-last basis-full select-text whitespace-normal px-2 py-1
            text-[14px] leading-5 font-normal text-[var(--sniptale-color-danger)]"
        >
          {translate('webSnapshotViewer.app.exportHtmlFailed', props.locale)}
        </span>
      ) : null}
    </>
  );
}

function ViewerToolbarActions(props: {
  loaded: LoadedWebSnapshotPackage;
  locale: AppLocale;
  mode: WebSnapshotViewerMode;
  onPrint: () => void;
  printPending: boolean;
}) {
  if (props.mode === 'assets') return null;
  const showsScreenshot = props.mode === 'visual';
  const downloadLabel = translate(
    showsScreenshot
      ? 'webSnapshotViewer.app.downloadScreenshot'
      : 'webSnapshotViewer.app.downloadPackage',
    props.locale
  );
  const pdfLabel = translate('webSnapshotViewer.app.exportPdf', props.locale);

  return (
    <div
      className="flex max-w-full shrink-0 flex-wrap items-center gap-2"
      role="group"
      aria-label={translate('webSnapshotViewer.app.exportActions', props.locale)}
    >
      <a
        aria-label={downloadLabel}
        className={`${toolbarButtonClassName} px-2.5`}
        download={showsScreenshot ? props.loaded.screenshotFilename : props.loaded.archiveFilename}
        href={showsScreenshot ? props.loaded.screenshotUrl : props.loaded.archiveUrl}
        title={downloadLabel}
      >
        <Download aria-hidden="true" size={16} />
        <span>{showsScreenshot ? 'PNG' : 'ZIP'}</span>
      </a>
      {showsScreenshot ? null : <HtmlExportAction loaded={props.loaded} locale={props.locale} />}
      <ProductActionButton
        compact
        tone="secondary"
        type="button"
        aria-label={pdfLabel}
        className={`${toolbarButtonClassName} px-2.5`}
        disabled={props.printPending}
        onClick={props.onPrint}
        title={pdfLabel}
      >
        {props.printPending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
        ) : (
          <FileDown aria-hidden="true" size={16} />
        )}
        <span>PDF</span>
      </ProductActionButton>
    </div>
  );
}

function ViewerLinkToggle(props: {
  enabled: boolean;
  locale: AppLocale;
  onChange: (enabled: boolean) => void;
}) {
  const actionLabel = translate(
    props.enabled
      ? 'webSnapshotViewer.app.disableExternalLinks'
      : 'webSnapshotViewer.app.enableExternalLinks',
    props.locale
  );
  const Icon = props.enabled ? Link2 : Link2Off;
  return (
    <ContentToolbarButton
      tone="property"
      active={props.enabled}
      type="button"
      aria-label={actionLabel}
      aria-pressed={props.enabled}
      className={`${toolbarButtonClassName} !w-auto !min-w-0 !gap-1.5 !px-2.5`}
      onClick={() => props.onChange(!props.enabled)}
      title={actionLabel}
    >
      <Icon aria-hidden="true" size={16} />
      <span>{translate('webSnapshotViewer.app.externalLinks', props.locale)}</span>
    </ContentToolbarButton>
  );
}

export function SnapshotViewerToolbar(props: {
  externalLinksEnabled: boolean;
  loaded: LoadedWebSnapshotPackage;
  locale: AppLocale;
  mode: WebSnapshotViewerMode;
  onCollapse: () => void;
  onExternalLinksEnabledChange: (enabled: boolean) => void;
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
      data-ui="web-snapshot-viewer.toolbar"
      className="flex min-h-[52px] w-full min-w-0 max-w-full shrink-0 flex-wrap items-center gap-x-4 gap-y-2
        border-b border-[var(--sniptale-color-border-soft)] px-4 py-2"
    >
      <div className="min-w-0 basis-64 flex-1">
        <div
          className="select-text truncate text-[14px] leading-5 font-semibold text-[var(--sniptale-color-text-primary)]"
          title={getHeaderTitle(props.loaded, props.locale)}
        >
          {getHeaderTitle(props.loaded, props.locale)}
        </div>
        <div
          className="flex min-w-0 select-text items-center gap-1.5 text-[12px] leading-4 font-normal
            text-[var(--sniptale-color-text-secondary)]"
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
      <ViewerToolbarActions
        loaded={props.loaded}
        locale={props.locale}
        mode={props.mode}
        onPrint={props.onPrint}
        printPending={props.printPending}
      />
      <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
        {props.mode === 'static-document' ? (
          <ViewerLinkToggle
            enabled={props.externalLinksEnabled}
            locale={props.locale}
            onChange={props.onExternalLinksEnabledChange}
          />
        ) : null}
        {props.mode === 'assets' ? null : (
          <WebSnapshotZoomControls locale={props.locale} {...props.zoom} />
        )}
        <WebSnapshotViewerModeSwitch
          locale={props.locale}
          mode={props.mode}
          onModeChange={props.onModeChange}
        />
        <ContentToolbarButton
          tone="utility"
          type="button"
          aria-label={collapseLabel}
          title={collapseLabel}
          className="h-8 w-8 cursor-pointer !p-0"
          onClick={props.onCollapse}
        >
          <PanelTopClose aria-hidden="true" size={16} strokeWidth={2} />
        </ContentToolbarButton>
      </div>
    </header>
  );
}

export function CollapsedToolbarButton(props: { locale: AppLocale; onExpand: () => void }) {
  const label = translate('webSnapshotViewer.app.expandToolbar', props.locale);
  return (
    <div
      className="fixed right-6 top-3 z-20 rounded-[4px] border
      border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)] shadow-md"
    >
      <ContentToolbarButton
        tone="utility"
        type="button"
        aria-label={label}
        title={label}
        className="h-8 w-8 cursor-pointer !p-0"
        onClick={props.onExpand}
      >
        <PanelTopOpen aria-hidden="true" size={16} />
      </ContentToolbarButton>
    </div>
  );
}
