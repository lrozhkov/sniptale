import { useCallback, useEffect, useRef, useState } from 'react';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import type { LoadedWebSnapshotPackage } from '../../viewer/assets';
import type { ViewerPackageFile } from '../../viewer/package-files';
import { createWebSnapshotHtmlExport } from '../../viewer/html-export';
import { createViewablePackageFileBlob } from './asset-opening';

const DOWNLOAD_URL_LIFETIME_MS = 1500;
const OPEN_URL_LIFETIME_MS = 60_000;

function downloadPackageFileBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.download = filename;
  anchor.href = objectUrl;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), DOWNLOAD_URL_LIFETIME_MS);
}

export function useViewerAssetActions(loaded: LoadedWebSnapshotPackage) {
  const downloadPendingRef = useRef(false);
  const extractPackageFile = useCallback(
    (file: ViewerPackageFile) => loaded.extractPackageFile(file.path),
    [loaded]
  );
  const downloadPackageFile = useCallback(
    async (file: ViewerPackageFile) => {
      if (downloadPendingRef.current) {
        throw new Error('Another snapshot package file is already being extracted.');
      }
      downloadPendingRef.current = true;
      try {
        downloadPackageFileBlob(await loaded.extractPackageFile(file.path), file.name);
      } finally {
        downloadPendingRef.current = false;
      }
    },
    [loaded]
  );
  const openPackageFile = useCallback(
    async (file: ViewerPackageFile) => {
      const blob = await loaded.extractPackageFile(file.path);
      const viewableBlob = await createViewablePackageFileBlob(blob, file.mimeType);
      const objectUrl = URL.createObjectURL(viewableBlob);
      try {
        await browserTabs.create({ active: true, url: objectUrl });
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), OPEN_URL_LIFETIME_MS);
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        throw error;
      }
    },
    [loaded]
  );
  const openResourceAsset = useCallback(async (url: string) => {
    await browserTabs.create({ active: true, url });
  }, []);
  return { downloadPackageFile, extractPackageFile, openPackageFile, openResourceAsset };
}

/** Own the disposable HTML export transaction and suppress downloads after owner release. */
export function useViewerHtmlExport(loaded: LoadedWebSnapshotPackage) {
  const [state, setState] = useState<'idle' | 'pending' | 'error'>('idle');
  const pending = useRef(false);
  const active = useRef<object | null>(null);
  useEffect(() => {
    active.current = {};
    pending.current = false;
    setState('idle');
    return () => {
      active.current = null;
    };
  }, [loaded]);
  const download = useCallback(async () => {
    if (pending.current || !active.current) return;
    const owner = active.current;
    pending.current = true;
    setState('pending');
    try {
      const artifact = await createWebSnapshotHtmlExport(loaded);
      if (active.current !== owner) return;
      downloadPackageFileBlob(artifact.blob, artifact.filename);
      setState('idle');
    } catch {
      if (active.current === owner) setState('error');
    } finally {
      if (active.current === owner) pending.current = false;
    }
  }, [loaded]);
  return { download, state };
}
