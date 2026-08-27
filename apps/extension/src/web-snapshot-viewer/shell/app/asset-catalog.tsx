import { File, FileCode2, Image, Type } from 'lucide-react';
import type { LoadedWebSnapshotAsset } from '../../viewer/asset-objects';
import { translate, type AppLocale } from '../../../platform/i18n';

type AssetKind = 'font' | 'image' | 'other' | 'style';

function getAssetKind(asset: LoadedWebSnapshotAsset): AssetKind {
  if (asset.mimeType.startsWith('image/')) return 'image';
  if (asset.mimeType.startsWith('font/')) return 'font';
  if (asset.mimeType === 'text/css') return 'style';
  return 'other';
}

function formatAssetSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getAssetName(path: string): string {
  return path.split('/').at(-1) || path;
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

function AssetCard(props: { asset: LoadedWebSnapshotAsset }) {
  const kind = getAssetKind(props.asset);
  const Icon = kind === 'font' ? Type : kind === 'style' ? FileCode2 : File;

  return (
    <article className={assetCardClassName}>
      {kind === 'image' ? (
        <div className={assetPreviewClassName}>
          <img
            alt={getAssetName(props.asset.path)}
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
          {getAssetName(props.asset.path)}
        </p>
        <p className="mt-1 truncate text-[10px] text-[var(--sniptale-color-text-muted)]">
          {props.asset.mimeType} · {formatAssetSize(props.asset.size)}
        </p>
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

export function WebSnapshotAssetCatalog(props: {
  assets: LoadedWebSnapshotAsset[];
  locale: AppLocale;
}) {
  if (props.assets.length === 0) {
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
      {assetGroups.map((group) => {
        const assets = props.assets.filter((asset) => getAssetKind(asset) === group.kind);
        if (assets.length === 0) return null;
        const GroupIcon = group.icon;
        return (
          <section key={group.kind}>
            <h3 className={assetGroupTitleClassName}>
              <GroupIcon aria-hidden className="size-4" />
              {translate(group.labelKey, props.locale)} ({assets.length})
            </h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
              {assets.map((asset) => (
                <AssetCard asset={asset} key={asset.path} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
