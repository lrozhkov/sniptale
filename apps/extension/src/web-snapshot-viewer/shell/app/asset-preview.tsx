import { ArrowLeft, Download, ExternalLink, File, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { translate, type AppLocale } from '../../../platform/i18n';
import type { LoadedWebSnapshotAsset } from '../../viewer/asset-objects';
import type { ViewerPackageFile } from '../../viewer/package-files';
import { createViewablePackageFileBlob, isPreviewableAssetImage } from './asset-opening';
import { getCatalogFileName } from './file-presentation';

export type PreviewSelection =
  | { kind: 'resource'; asset: LoadedWebSnapshotAsset }
  | { kind: 'package'; file: ViewerPackageFile };

const previewActionClassName = [
  'inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs',
  'text-[var(--sniptale-color-text-primary)]',
  'hover:bg-[var(--sniptale-color-surface-hover)]',
  'focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-[var(--sniptale-color-focus-ring)] disabled:opacity-50',
].join(' ');
const previewBodyClassName = [
  'min-h-64 overflow-auto rounded-xl border',
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-muted)] p-4',
].join(' ');
const previewMetadataClassName = [
  'flex min-h-56 flex-col items-center justify-center gap-2',
  'text-[var(--sniptale-color-text-secondary)]',
].join(' ');

function PreviewZoomControls(props: {
  locale: AppLocale;
  onZoomChange: (zoom: number) => void;
  zoom: number;
}) {
  return (
    <div
      aria-label={translate('webSnapshotViewer.app.previewZoom', props.locale)}
      className="flex items-center gap-1"
      role="group"
    >
      <button
        aria-label={translate('webSnapshotViewer.app.zoomOut', props.locale)}
        className={previewActionClassName}
        disabled={props.zoom <= 1}
        onClick={() => props.onZoomChange(Math.max(1, props.zoom - 0.25))}
        type="button"
      >
        <ZoomOut aria-hidden="true" size={16} />
      </button>
      <span className="min-w-9 text-center text-xs text-[var(--sniptale-color-text-secondary)]">
        {Math.round(props.zoom * 100)}%
      </span>
      <button
        aria-label={translate('webSnapshotViewer.app.zoomIn', props.locale)}
        className={previewActionClassName}
        disabled={props.zoom >= 1.5}
        onClick={() => props.onZoomChange(Math.min(1.5, props.zoom + 0.25))}
        type="button"
      >
        <ZoomIn aria-hidden="true" size={16} />
      </button>
    </div>
  );
}

function PreviewFileActions(props: {
  locale: AppLocale;
  name: string;
  onDownloadPackageFile: (file: ViewerPackageFile) => Promise<void>;
  onOpenPackageFile: (file: ViewerPackageFile) => Promise<void>;
  onOpenResourceAsset: (url: string) => Promise<void>;
  selection: PreviewSelection;
}) {
  const [errorKind, setErrorKind] = useState<'download' | 'open' | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const selectedFile = props.selection.kind === 'package' ? props.selection.file : null;
  const resourceAsset = props.selection.kind === 'resource' ? props.selection.asset : null;
  const runAction = (kind: 'download' | 'open', action: () => Promise<void>) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setErrorKind(null);
    void action()
      .catch(() => setErrorKind(kind))
      .finally(() => {
        pendingRef.current = false;
        setPending(false);
      });
  };
  return (
    <>
      <button
        className={previewActionClassName}
        disabled={pending}
        onClick={() =>
          runAction('open', () =>
            props.selection.kind === 'resource'
              ? props.onOpenResourceAsset(props.selection.asset.url)
              : props.onOpenPackageFile(props.selection.file)
          )
        }
        type="button"
      >
        <ExternalLink aria-hidden="true" size={15} />
        {translate('webSnapshotViewer.app.openAsset', props.locale)}
      </button>
      {selectedFile ? (
        <button
          className={previewActionClassName}
          disabled={pending}
          onClick={() => runAction('download', () => props.onDownloadPackageFile(selectedFile))}
          type="button"
        >
          <Download aria-hidden="true" size={15} />
          {translate('webSnapshotViewer.app.downloadAsset', props.locale)}
        </button>
      ) : resourceAsset?.downloadUrl ? (
        <a
          className={previewActionClassName}
          download={props.name}
          href={resourceAsset.downloadUrl}
        >
          <Download aria-hidden="true" size={15} />
          {translate('webSnapshotViewer.app.downloadAsset', props.locale)}
        </a>
      ) : null}
      {errorKind ? (
        <p className="basis-full text-xs text-[var(--sniptale-color-danger)]" role="status">
          {translate(
            errorKind === 'open'
              ? 'webSnapshotViewer.app.assetOpenFailed'
              : 'webSnapshotViewer.app.packageFileDownloadFailed',
            props.locale
          )}
        </p>
      ) : null}
    </>
  );
}

export function WebSnapshotAssetPreview(props: {
  locale: AppLocale;
  onClose: () => void;
  onDownloadPackageFile: (file: ViewerPackageFile) => Promise<void>;
  onExtractPackageFile: (file: ViewerPackageFile) => Promise<Blob>;
  onOpenPackageFile: (file: ViewerPackageFile) => Promise<void>;
  onOpenResourceAsset: (url: string) => Promise<void>;
  selection: PreviewSelection;
}) {
  const [previewObject, setPreviewObject] = useState<{ path: string; url: string } | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const { onExtractPackageFile } = props;
  const selectedFile = props.selection.kind === 'package' ? props.selection.file : null;
  const name =
    props.selection.kind === 'resource'
      ? getCatalogFileName(props.selection.asset.path)
      : props.selection.file.name;
  const mimeType =
    props.selection.kind === 'resource'
      ? props.selection.asset.mimeType
      : props.selection.file.mimeType;
  const isImage = isPreviewableAssetImage(mimeType);
  const imageUrl =
    props.selection.kind === 'resource'
      ? props.selection.asset.url
      : previewObject?.path === props.selection.file.path
        ? previewObject.url
        : null;

  useEffect(() => closeRef.current?.focus(), []);
  useEffect(() => {
    if (!selectedFile || !isPreviewableAssetImage(selectedFile.mimeType)) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    void onExtractPackageFile(selectedFile)
      .then((blob) => createViewablePackageFileBlob(blob, selectedFile.mimeType))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewObject({ path: selectedFile.path, url: objectUrl });
      })
      .catch(() => {
        if (!cancelled) setPreviewError(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [onExtractPackageFile, selectedFile]);

  return (
    <section
      aria-label={`${translate('webSnapshotViewer.app.previewAsset', props.locale)}: ${name}`}
      className="space-y-4"
      data-testid="snapshot-asset-preview"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          props.onClose();
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={previewActionClassName}
          onClick={props.onClose}
          ref={closeRef}
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={16} />
          {translate('webSnapshotViewer.app.closeAssetPreview', props.locale)}
        </button>
        <h2
          className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]"
          title={name}
        >
          {name}
        </h2>
        {isImage ? (
          <PreviewZoomControls locale={props.locale} onZoomChange={setZoom} zoom={zoom} />
        ) : null}
        <PreviewFileActions
          locale={props.locale}
          name={name}
          onDownloadPackageFile={props.onDownloadPackageFile}
          onOpenPackageFile={props.onOpenPackageFile}
          onOpenResourceAsset={props.onOpenResourceAsset}
          selection={props.selection}
        />
      </div>
      <div className={previewBodyClassName}>
        {imageUrl && isImage ? (
          <img
            alt={name}
            className="mx-auto block h-auto max-h-[60vh] max-w-full object-contain"
            src={imageUrl}
            style={{ zoom }}
          />
        ) : previewError ? (
          <p className="text-sm text-[var(--sniptale-color-danger)]" role="status">
            {translate('webSnapshotViewer.app.packageFileDownloadFailed', props.locale)}
          </p>
        ) : isImage ? (
          <p className="text-sm text-[var(--sniptale-color-text-muted)]" role="status">
            {translate('webSnapshotViewer.app.loading', props.locale)}
          </p>
        ) : (
          <div className={previewMetadataClassName}>
            <File aria-hidden="true" size={36} />
            <p className="text-sm">{name}</p>
            <p className="text-xs">{mimeType}</p>
          </div>
        )}
      </div>
    </section>
  );
}
