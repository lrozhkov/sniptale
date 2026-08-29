import { Download, File, Image, LoaderCircle } from 'lucide-react';
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
}) {
  const [activePath, setActivePath] = useState<string | null>(null);
  const [errorPath, setErrorPath] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const downloadLabel = translate('webSnapshotViewer.app.downloadAsset', props.locale);
  const downloadPackageFile = (file: ViewerPackageFile) => {
    if (activePath !== null) return;
    setActivePath(file.path);
    setErrorPath(null);
    void props
      .onDownloadPackageFile(file)
      .catch(() => {
        if (mountedRef.current) setErrorPath(file.path);
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
                type="button"
                aria-label={`${downloadLabel}: ${file.name}`}
                className={downloadButtonClassName}
                disabled={activePath !== null}
                onClick={() => downloadPackageFile(file)}
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
            {errorPath === file.path ? (
              <p
                className="px-11 pb-2 text-[10px] text-[var(--sniptale-color-danger)]"
                role="status"
              >
                {translate('webSnapshotViewer.app.packageFileDownloadFailed', props.locale)}
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
