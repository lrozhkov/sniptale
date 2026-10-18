import { Download, ExternalLink, Eye, File, Image, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { translate, type AppLocale } from '../../../platform/i18n';
import type { ViewerPackageFile } from '../../viewer/package-files';
import { formatCatalogFileSize, getCatalogFileFormat } from './file-presentation';

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
    <div className="overflow-hidden rounded-[4px] border border-[var(--sniptale-color-border-soft)]">
      {props.files.map((file) => {
        const isActive = activePath === file.path;
        const Icon = file.kind === 'exported-image' ? Image : File;
        return (
          <article
            className="border-b border-[var(--sniptale-color-border-soft)] last:border-b-0"
            key={file.path}
          >
            <div className="flex min-h-14 min-w-0 items-center gap-2 px-2 py-2">
              <Icon
                aria-hidden
                className="size-4 shrink-0 text-[var(--sniptale-color-text-muted)]"
              />
              <div className="min-w-0 flex-1">
                <p
                  className={[
                    'select-text truncate text-[13px] leading-[18px] font-normal',
                    'text-[var(--sniptale-color-text-primary)]',
                  ].join(' ')}
                  title={file.path}
                >
                  {file.name}
                </p>
                <p
                  className={[
                    'select-text truncate text-[12px] leading-4 font-normal',
                    'text-[var(--sniptale-color-text-secondary)]',
                  ].join(' ')}
                >
                  {getCatalogFileFormat(file)} · {file.mimeType} ·{' '}
                  {formatCatalogFileSize(file.size)}
                </p>
              </div>
              <ContentToolbarButton
                tone="utility"
                aria-label={`${previewLabel}: ${file.name}`}
                className="h-8 w-8 cursor-pointer !p-0 disabled:cursor-wait"
                onClick={(event) => props.onPreviewPackageFile(file, event.currentTarget)}
                title={previewLabel}
                type="button"
              >
                <Eye aria-hidden="true" size={16} />
              </ContentToolbarButton>
              <ContentToolbarButton
                tone="utility"
                aria-label={`${openLabel}: ${file.name}`}
                className="h-8 w-8 cursor-pointer !p-0 disabled:cursor-wait"
                disabled={activePath !== null}
                onClick={() =>
                  runPackageFileAction(file, 'open', () => props.onOpenPackageFile(file))
                }
                title={openLabel}
                type="button"
              >
                {isActive ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
                ) : (
                  <ExternalLink aria-hidden="true" size={16} />
                )}
              </ContentToolbarButton>
              <ContentToolbarButton
                tone="utility"
                type="button"
                aria-label={`${downloadLabel}: ${file.name}`}
                className="h-8 w-8 cursor-pointer !p-0 disabled:cursor-wait"
                disabled={activePath !== null}
                onClick={() =>
                  runPackageFileAction(file, 'download', () => props.onDownloadPackageFile(file))
                }
                title={downloadLabel}
              >
                {isActive ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
                ) : (
                  <Download aria-hidden="true" size={16} />
                )}
              </ContentToolbarButton>
            </div>
            {error?.path === file.path ? (
              <p
                className="select-text px-2 pb-2 text-[14px] leading-5 font-normal text-[var(--sniptale-color-danger)]"
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
