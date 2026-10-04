import { Download, ExternalLink, Eye, File, Image, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { translate, type AppLocale } from '../../../platform/i18n';
import type { ViewerPackageFile } from '../../viewer/package-files';
import { formatCatalogFileSize, getCatalogFileFormat } from './file-presentation';

const downloadButtonClassName = [
  'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded',
  'text-[var(--sniptale-color-text-muted)] hover:bg-[var(--sniptale-color-surface-hover)]',
  'hover:text-[var(--sniptale-color-text-primary)] focus-visible:outline-none',
  'focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]',
  'disabled:cursor-wait disabled:opacity-50',
].join(' ');

export function ViewerPackageFileList(props: {
  files: ViewerPackageFile[];
  locale: AppLocale;
  onDownloadPackageFile: (file: ViewerPackageFile) => Promise<void>;
  onOpenPackageFile: (file: ViewerPackageFile) => Promise<void>;
  onPreviewPackageFile: (file: ViewerPackageFile, trigger: HTMLButtonElement) => void;
}) {
  const [activePath, setActivePath] = useState<string | null>(null);
  const [error, setError] = useState<{ kind: 'download' | 'open'; path: string } | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const downloadLabel = translate('webSnapshotViewer.app.downloadAsset', props.locale);
  const openLabel = translate('webSnapshotViewer.app.openAsset', props.locale);
  const previewLabel = translate('webSnapshotViewer.app.previewAsset', props.locale);
  const runPackageFileAction = (
    file: ViewerPackageFile,
    kind: 'download' | 'open',
    action: () => Promise<void>
  ) => {
    if (activePath !== null) return;
    setActivePath(file.path);
    setError(null);
    void action()
      .catch(() => {
        if (mountedRef.current) setError({ kind, path: file.path });
      })
      .finally(() => {
        if (mountedRef.current) setActivePath(null);
      });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--sniptale-color-border-soft)]">
      {props.files.map((file) => {
        const isActive = activePath === file.path;
        const Icon = file.kind === 'exported-image' ? Image : File;
        return (
          <article
            className="border-b border-[var(--sniptale-color-border-soft)] last:border-b-0"
            key={file.path}
          >
            <div className="flex min-w-0 items-center gap-3 px-3 py-2.5">
              <Icon
                aria-hidden
                className="size-5 shrink-0 text-[var(--sniptale-color-text-muted)]"
              />
              <button
                aria-label={`${previewLabel}: ${file.name}`}
                className={downloadButtonClassName}
                onClick={(event) => props.onPreviewPackageFile(file, event.currentTarget)}
                title={previewLabel}
                type="button"
              >
                <Eye aria-hidden="true" size={13} />
              </button>
              <button
                aria-label={`${openLabel}: ${file.name}`}
                className={downloadButtonClassName}
                disabled={activePath !== null}
                onClick={() =>
                  runPackageFileAction(file, 'open', () => props.onOpenPackageFile(file))
                }
                title={openLabel}
                type="button"
              >
                {isActive ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" size={13} />
                ) : (
                  <ExternalLink aria-hidden="true" size={13} />
                )}
              </button>
              <button
                type="button"
                aria-label={`${downloadLabel}: ${file.name}`}
                className={downloadButtonClassName}
                disabled={activePath !== null}
                onClick={() =>
                  runPackageFileAction(file, 'download', () => props.onDownloadPackageFile(file))
                }
                title={downloadLabel}
              >
                {isActive ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" size={13} />
                ) : (
                  <Download aria-hidden="true" size={13} />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-xs font-semibold text-[var(--sniptale-color-text-primary)]"
                  title={file.path}
                >
                  {file.name}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-[var(--sniptale-color-text-muted)]">
                  {getCatalogFileFormat(file)} · {file.mimeType} ·{' '}
                  {formatCatalogFileSize(file.size)}
                </p>
              </div>
            </div>
            {error?.path === file.path ? (
              <p
                className="px-11 pb-2 text-[10px] text-[var(--sniptale-color-danger)]"
                role="status"
              >
                {translate(
                  error.kind === 'open'
                    ? 'webSnapshotViewer.app.assetOpenFailed'
                    : 'webSnapshotViewer.app.packageFileDownloadFailed',
                  props.locale
                )}
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
