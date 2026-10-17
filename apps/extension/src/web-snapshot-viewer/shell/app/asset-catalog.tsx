import { Download, ExternalLink, Eye, File, FileCode2, Image, Type } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { useCommandPress } from '@sniptale/ui/control-language/press';
import type { LoadedWebSnapshotAsset } from '../../viewer/asset-objects';
import type { ViewerPackageFile } from '../../viewer/package-files';
import { translate, type AppLocale } from '../../../platform/i18n';
import {
  formatCatalogFileSize,
  getCatalogFileFormat,
  getCatalogFileName,
} from './file-presentation';
import { handleViewerTabNavigation } from './view-mode';
import { ViewerPackageFileList } from './package-file-list';
import { WebSnapshotAssetPreview, type PreviewSelection } from './asset-preview';

type AssetKind = 'font' | 'image' | 'other' | 'style';
type CatalogSection = 'attachments' | 'exported-images' | 'resources';

function getAssetKind(asset: LoadedWebSnapshotAsset): AssetKind {
  if (asset.mimeType.startsWith('image/')) return 'image';
  if (asset.mimeType.startsWith('font/')) return 'font';
  if (asset.mimeType === 'text/css') return 'style';
  return 'other';
}

function groupAssetsByFormat(
  assets: LoadedWebSnapshotAsset[]
): Map<string, LoadedWebSnapshotAsset[]> {
  const groups = new Map<string, LoadedWebSnapshotAsset[]>();
  for (const asset of assets) {
    const format = getCatalogFileFormat(asset);
    groups.set(format, [...(groups.get(format) ?? []), asset]);
  }
  return groups;
}

const assetCardClassName = [
  'min-w-0 overflow-hidden rounded-[4px] border',
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-panel)]',
].join(' ');
const assetPreviewClassName = [
  'flex h-32 items-center justify-center overflow-hidden',
  'bg-[var(--sniptale-color-surface-muted)] p-2',
].join(' ');
const assetGroupTitleClassName = [
  'mb-2 flex items-center gap-2 text-[14px] leading-5 font-[var(--sniptale-font-weight-interface-heading)]',
  'text-[var(--sniptale-color-text-secondary)]',
].join(' ');
const assetActionClassName = [
  'inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[4px]',
  'text-[var(--sniptale-color-text-muted)] hover:bg-[var(--sniptale-color-surface-hover)]',
  'hover:text-[var(--sniptale-color-text-primary)] focus-visible:outline-none',
  'focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]',
].join(' ');
const assetFormatTitleClassName = [
  'mb-2 text-[12px] leading-4 font-normal',
  'text-[var(--sniptale-color-text-secondary)]',
].join(' ');
const catalogTabClassName = [
  'inline-flex h-8 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-[4px]',
  'border-0 border-b-2 border-solid bg-transparent px-2.5 text-[13px] leading-[18px] font-medium',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]',
].join(' ');

function CatalogTab(props: {
  section: CatalogSection;
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  const press = useCommandPress({ onClick: props.onClick });
  return (
    <button
      {...press.props}
      type="button"
      role="tab"
      id={`web-snapshot-catalog-${props.section}-tab`}
      aria-controls={`web-snapshot-catalog-${props.section}-panel`}
      aria-selected={props.selected}
      tabIndex={props.selected ? 0 : -1}
      data-command-press=""
      data-pressing={press.pressed ? 'true' : undefined}
      className={[
        catalogTabClassName,
        props.selected
          ? 'border-[var(--sniptale-color-text-primary)] text-[var(--sniptale-color-text-primary)]'
          : 'border-transparent text-[var(--sniptale-color-text-secondary)]',
        'hover:text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
    >
      <span className="sniptale-command-content">{props.label}</span>
    </button>
  );
}

function AssetCard(props: {
  asset: LoadedWebSnapshotAsset;
  locale: AppLocale;
  onOpen: (url: string) => Promise<void>;
  onPreview: (asset: LoadedWebSnapshotAsset, trigger: HTMLButtonElement) => void;
}) {
  const [openFailed, setOpenFailed] = useState(false);
  const kind = getAssetKind(props.asset);
  const Icon = kind === 'font' ? Type : kind === 'style' ? FileCode2 : File;
  const assetName = getCatalogFileName(props.asset.path);
  const downloadLabel = translate('webSnapshotViewer.app.downloadAsset', props.locale);
  const previewLabel = translate('webSnapshotViewer.app.previewAsset', props.locale);
  const openLabel = translate('webSnapshotViewer.app.openAsset', props.locale);

  return (
    <article className={assetCardClassName}>
      {kind === 'image' ? (
        <div className={assetPreviewClassName}>
          <img
            alt={getCatalogFileName(props.asset.path)}
            className="max-h-full max-w-full object-contain"
            loading="lazy"
            src={props.asset.url}
          />
        </div>
      ) : null}
      <div className={kind === 'image' ? 'p-2' : 'flex min-h-14 min-w-0 items-center gap-2 p-2'}>
        {kind === 'image' ? null : (
          <Icon
            aria-hidden
            className="size-4 shrink-0 text-[var(--sniptale-color-text-secondary)]"
          />
        )}
        <div className="min-w-0 flex-1">
          <p
            className={[
              'select-text truncate text-[13px] leading-[18px] font-normal',
              'text-[var(--sniptale-color-text-primary)]',
            ].join(' ')}
            title={props.asset.path}
          >
            {getCatalogFileName(props.asset.path)}
          </p>
          <p
            className={[
              'select-text truncate text-[12px] leading-4 font-normal',
              'text-[var(--sniptale-color-text-secondary)]',
            ].join(' ')}
          >
            {props.asset.mimeType} · {formatCatalogFileSize(props.asset.size)}
          </p>
        </div>
        <div className={kind === 'image' ? 'mt-1 flex justify-end gap-2' : 'flex shrink-0 gap-2'}>
          <ContentToolbarButton
            tone="utility"
            aria-label={`${previewLabel}: ${assetName}`}
            className="h-8 w-8 cursor-pointer !p-0"
            onClick={(event) => props.onPreview(props.asset, event.currentTarget)}
            title={previewLabel}
            type="button"
          >
            <Eye aria-hidden="true" size={16} />
          </ContentToolbarButton>
          <ContentToolbarButton
            tone="utility"
            aria-label={`${openLabel}: ${assetName}`}
            className="h-8 w-8 cursor-pointer !p-0"
            onClick={() => {
              setOpenFailed(false);
              void props.onOpen(props.asset.url).catch(() => setOpenFailed(true));
            }}
            title={openLabel}
            type="button"
          >
            <ExternalLink aria-hidden="true" size={16} />
          </ContentToolbarButton>
          {props.asset.downloadUrl ? (
            <a
              aria-label={`${downloadLabel}: ${assetName}`}
              className={assetActionClassName}
              download={assetName}
              href={props.asset.downloadUrl}
              title={downloadLabel}
            >
              <Download aria-hidden="true" size={16} />
            </a>
          ) : null}
        </div>
      </div>
      {openFailed ? (
        <p
          className="select-text px-2 pb-2 text-[14px] leading-5 font-normal text-[var(--sniptale-color-danger)]"
          role="status"
        >
          {translate('webSnapshotViewer.app.assetOpenFailed', props.locale)}
        </p>
      ) : null}
    </article>
  );
}

const assetGroups: Array<{
  icon: typeof Image;
  kind: AssetKind;
  labelKey:
    | 'webSnapshotViewer.app.assetFonts'
    | 'webSnapshotViewer.app.assetImages'
    | 'webSnapshotViewer.app.assetOther'
    | 'webSnapshotViewer.app.assetStyles';
}> = [
  { icon: Image, kind: 'image', labelKey: 'webSnapshotViewer.app.assetImages' },
  { icon: Type, kind: 'font', labelKey: 'webSnapshotViewer.app.assetFonts' },
  {
    icon: FileCode2,
    kind: 'style',
    labelKey: 'webSnapshotViewer.app.assetStyles',
  },
  { icon: File, kind: 'other', labelKey: 'webSnapshotViewer.app.assetOther' },
];

function ResourceAssetGroups(props: {
  assets: LoadedWebSnapshotAsset[];
  locale: AppLocale;
  onOpen: (url: string) => Promise<void>;
  onPreview: (asset: LoadedWebSnapshotAsset, trigger: HTMLButtonElement) => void;
}) {
  return assetGroups.map((group) => {
    const assets = props.assets.filter((asset) => getAssetKind(asset) === group.kind);
    if (assets.length === 0) return null;
    const GroupIcon = group.icon;
    const assetsByFormat = groupAssetsByFormat(assets);
    return (
      <section key={group.kind}>
        <h3 className={assetGroupTitleClassName}>
          <GroupIcon aria-hidden className="size-4" />
          {translate(group.labelKey, props.locale)} ({assets.length})
        </h3>
        <div className="space-y-4">
          {Array.from(assetsByFormat.entries()).map(([format, formatAssets]) => (
            <div key={format}>
              <h4 className={assetFormatTitleClassName}>
                {format} ({formatAssets.length})
              </h4>
              <div
                className={
                  group.kind === 'image'
                    ? 'grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3'
                    : 'grid grid-cols-1 gap-1'
                }
              >
                {formatAssets.map((asset) => (
                  <AssetCard
                    asset={asset}
                    key={asset.path}
                    locale={props.locale}
                    onOpen={props.onOpen}
                    onPreview={props.onPreview}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  });
}

export function WebSnapshotAssetCatalog(props: {
  assets: LoadedWebSnapshotAsset[];
  packageFiles: ViewerPackageFile[];
  locale: AppLocale;
  onDownloadPackageFile: (file: ViewerPackageFile) => Promise<void>;
  onExtractPackageFile: (file: ViewerPackageFile) => Promise<Blob>;
  onOpenPackageFile: (file: ViewerPackageFile) => Promise<void>;
  onOpenResourceAsset: (url: string) => Promise<void>;
}) {
  const [selectedSection, setSelectedSection] = useState<CatalogSection>('exported-images');
  const [selection, setSelection] = useState<PreviewSelection | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!selection) triggerRef.current?.focus();
  }, [selection]);
  const showPreview = (nextSelection: PreviewSelection, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setSelection(nextSelection);
  };
  const exportedImages = props.packageFiles.filter((file) => file.kind === 'exported-image');
  const attachments = props.packageFiles.filter((file) => file.kind === 'attachment');
  const sections = [
    {
      count: exportedImages.length,
      id: 'exported-images' as const,
      label: translate('webSnapshotViewer.app.exportedImages', props.locale),
    },
    {
      count: attachments.length,
      id: 'attachments' as const,
      label: translate('webSnapshotViewer.app.downloadedAttachments', props.locale),
    },
    {
      count: props.assets.length,
      id: 'resources' as const,
      label: translate('webSnapshotViewer.app.pageResources', props.locale),
    },
  ].filter((section) => section.count > 0);
  const resolvedSection = sections.some((section) => section.id === selectedSection)
    ? selectedSection
    : sections[0]?.id;
  if (sections.length === 0 || resolvedSection === undefined) {
    return (
      <div
        className={[
          'flex h-full items-center justify-center p-4 text-[14px] leading-5 font-normal',
          'text-[var(--sniptale-color-text-secondary)]',
        ].join(' ')}
      >
        {translate('webSnapshotViewer.app.assetsEmpty', props.locale)}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 p-4" data-testid="snapshot-asset-catalog">
      <div className="space-y-4" hidden={selection !== null}>
        <div>
          <h2
            className="text-[14px] leading-5 font-[var(--sniptale-font-weight-interface-heading)]
            text-[var(--sniptale-color-text-primary)]"
          >
            {translate('webSnapshotViewer.app.assetsTitle', props.locale)}
          </h2>
          <p className="mt-1 text-[14px] leading-5 font-normal text-[var(--sniptale-color-text-secondary)]">
            {translate('webSnapshotViewer.app.assetsDescription', props.locale)}
          </p>
        </div>
        <div
          aria-label={translate('webSnapshotViewer.app.assetsTitle', props.locale)}
          className="flex gap-1 overflow-x-auto"
          role="tablist"
          data-ui="web-snapshot-viewer.catalog-tabs"
          onKeyDown={handleViewerTabNavigation}
        >
          {sections.map((section) => {
            const selected = section.id === resolvedSection;
            return (
              <CatalogTab
                section={section.id}
                selected={selected}
                label={`${section.label} (${section.count})`}
                key={section.id}
                onClick={() => setSelectedSection(section.id)}
              />
            );
          })}
        </div>
        <div
          className="space-y-4"
          role="tabpanel"
          id={`web-snapshot-catalog-${resolvedSection}-panel`}
          aria-labelledby={`web-snapshot-catalog-${resolvedSection}-tab`}
          tabIndex={0}
        >
          {resolvedSection === 'resources' ? (
            <ResourceAssetGroups
              assets={props.assets}
              locale={props.locale}
              onOpen={props.onOpenResourceAsset}
              onPreview={(asset, trigger) => showPreview({ kind: 'resource', asset }, trigger)}
            />
          ) : (
            <ViewerPackageFileList
              files={resolvedSection === 'attachments' ? attachments : exportedImages}
              locale={props.locale}
              onDownloadPackageFile={props.onDownloadPackageFile}
              onOpenPackageFile={props.onOpenPackageFile}
              onPreviewPackageFile={(file, trigger) =>
                showPreview({ kind: 'package', file }, trigger)
              }
            />
          )}
        </div>
        {sections
          .filter((section) => section.id !== resolvedSection)
          .map((section) => (
            <div
              key={section.id}
              role="tabpanel"
              id={`web-snapshot-catalog-${section.id}-panel`}
              aria-labelledby={`web-snapshot-catalog-${section.id}-tab`}
              hidden
            />
          ))}
      </div>
      {selection ? (
        <WebSnapshotAssetPreview
          locale={props.locale}
          onClose={() => setSelection(null)}
          onDownloadPackageFile={props.onDownloadPackageFile}
          onExtractPackageFile={props.onExtractPackageFile}
          onOpenPackageFile={props.onOpenPackageFile}
          onOpenResourceAsset={props.onOpenResourceAsset}
          selection={selection}
        />
      ) : null}
    </div>
  );
}
