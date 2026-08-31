import { Download, File, FileCode2, Image, Type } from 'lucide-react';
import { useState } from 'react';
import type { LoadedWebSnapshotAsset } from '../../viewer/asset-objects';
import type { ViewerPackageFile } from '../../viewer/package-files';
import { translate, type AppLocale } from '../../../platform/i18n';
import {
  formatCatalogFileSize,
  getCatalogFileFormat,
  getCatalogFileName,
} from './file-presentation';
import { ViewerPackageFileList } from './package-file-list';

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
  'min-w-0 overflow-hidden rounded-[12px] border',
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-panel)]',
].join(' ');
const assetPreviewClassName = [
  'flex h-32 items-center justify-center overflow-hidden',
  'bg-[var(--sniptale-color-surface-muted)] p-2',
].join(' ');
const assetGroupTitleClassName = [
  'mb-2 flex items-center gap-2 text-xs font-semibold',
  'text-[var(--sniptale-color-text-secondary)]',
].join(' ');
const assetDownloadClassName = [
  'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded',
  'text-[var(--sniptale-color-text-muted)] hover:bg-[var(--sniptale-color-surface-hover)]',
  'hover:text-[var(--sniptale-color-text-primary)] focus-visible:outline-none',
  'focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]',
].join(' ');
const assetFormatTitleClassName = [
  'mb-2 text-[10px] font-semibold uppercase tracking-wide',
  'text-[var(--sniptale-color-text-muted)]',
].join(' ');
const catalogTabClassName = [
  'h-8 rounded-md px-2.5 text-[11px] font-medium transition-colors',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]',
].join(' ');

function AssetCard(props: { asset: LoadedWebSnapshotAsset; locale: AppLocale }) {
  const kind = getAssetKind(props.asset);
  const Icon = kind === 'font' ? Type : kind === 'style' ? FileCode2 : File;
  const assetName = getCatalogFileName(props.asset.path);
  const downloadLabel = translate('webSnapshotViewer.app.downloadAsset', props.locale);

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
      ) : (
        <div className="flex h-20 items-center justify-center bg-[var(--sniptale-color-surface-muted)]">
          <Icon aria-hidden className="size-7 text-[var(--sniptale-color-text-muted)]" />
        </div>
      )}
      <div className="p-2.5">
        <p
          className="truncate text-xs font-semibold text-[var(--sniptale-color-text-primary)]"
          title={props.asset.path}
        >
          {getCatalogFileName(props.asset.path)}
        </p>
        <div className="mt-1 flex items-center gap-1">
          <p className="min-w-0 flex-1 truncate text-[10px] text-[var(--sniptale-color-text-muted)]">
            {props.asset.mimeType} · {formatCatalogFileSize(props.asset.size)}
          </p>
          {props.asset.downloadUrl ? (
            <a
              aria-label={`${downloadLabel}: ${assetName}`}
              className={assetDownloadClassName}
              download={assetName}
              href={props.asset.downloadUrl}
              title={downloadLabel}
            >
              <Download aria-hidden="true" size={13} />
            </a>
          ) : null}
        </div>
      </div>
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

function ResourceAssetGroups(props: { assets: LoadedWebSnapshotAsset[]; locale: AppLocale }) {
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
              <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
                {formatAssets.map((asset) => (
                  <AssetCard asset={asset} key={asset.path} locale={props.locale} />
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
}) {
  const [selectedSection, setSelectedSection] = useState<CatalogSection>('exported-images');
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
      <div className="flex h-full items-center justify-center p-8 text-sm text-[var(--sniptale-color-text-muted)]">
        {translate('webSnapshotViewer.app.assetsEmpty', props.locale)}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-5" data-testid="snapshot-asset-catalog">
      <div>
        <h2 className="text-base font-semibold text-[var(--sniptale-color-text-primary)]">
          {translate('webSnapshotViewer.app.assetsTitle', props.locale)}
        </h2>
        <p className="mt-1 text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('webSnapshotViewer.app.assetsDescription', props.locale)}
        </p>
      </div>
      <div
        aria-label={translate('webSnapshotViewer.app.assetsTitle', props.locale)}
        className="flex flex-wrap gap-1"
        role="group"
      >
        {sections.map((section) => {
          const selected = section.id === resolvedSection;
          return (
            <button
              type="button"
              aria-pressed={selected}
              className={`${catalogTabClassName} ${
                selected
                  ? 'bg-[var(--sniptale-color-surface-hover)] text-[var(--sniptale-color-text-primary)]'
                  : 'text-[var(--sniptale-color-text-muted)] hover:text-[var(--sniptale-color-text-primary)]'
              }`}
              key={section.id}
              onClick={() => setSelectedSection(section.id)}
            >
              {section.label} ({section.count})
            </button>
          );
        })}
      </div>
      {resolvedSection === 'resources' ? (
        <ResourceAssetGroups assets={props.assets} locale={props.locale} />
      ) : (
        <ViewerPackageFileList
          files={resolvedSection === 'attachments' ? attachments : exportedImages}
          locale={props.locale}
          onDownloadPackageFile={props.onDownloadPackageFile}
        />
      )}
    </div>
  );
}
