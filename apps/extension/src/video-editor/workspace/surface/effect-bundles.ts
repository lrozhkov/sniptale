import { useCallback, useEffect, useRef, useState } from 'react';

import {
  deleteEffectBundle,
  listEffectBundles,
  setEffectBundleEnabled,
} from '../../../composition/persistence/effect-bundles';
import {
  importEffectFiles,
  type EffectFileImportResult,
} from '../../../composition/persistence/effect-bundles/import-files';
import type { VideoEditorEffectCatalogItem } from '../../library/effects-dock/types';

export interface WorkspaceEffectBundlesState {
  catalogs: readonly VideoEditorEffectCatalogItem[];
  errorCode: 'EFFECT_CATALOG_FAILED' | null;
  isLoading: boolean;
  onDeleteEffectBundle(packId: string): Promise<void>;
  onImportEffectFiles(files: readonly File[]): Promise<EffectFileImportResult[]>;
  onSetEffectBundleEnabled(packId: string, enabled: boolean): Promise<void>;
}

export function useWorkspaceEffectBundles(): WorkspaceEffectBundlesState {
  const state = useEffectBundleCatalogState();
  return {
    catalogs: state.catalogs,
    errorCode: state.errorCode,
    isLoading: state.isLoading,
    async onDeleteEffectBundle(packId) {
      await deleteEffectBundle(packId);
      await state.reload();
    },
    async onImportEffectFiles(files) {
      const results = await importEffectFiles(files);
      await state.reload();
      return results;
    },
    async onSetEffectBundleEnabled(packId, enabled) {
      await setEffectBundleEnabled(packId, enabled);
      await state.reload();
    },
  };
}

function useEffectBundleCatalogState() {
  const [catalogs, setCatalogs] = useState<VideoEditorEffectCatalogItem[]>([]);
  const [errorCode, setErrorCode] = useState<'EFFECT_CATALOG_FAILED' | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const activeRequest = useRef(0);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    const request = activeRequest.current + 1;
    activeRequest.current = request;
    if (mounted.current) setIsLoading(true);
    try {
      const summaries = await listEffectBundles();
      const loaded: VideoEditorEffectCatalogItem[] = summaries.map((summary) =>
        summary.status === 'ready'
          ? { catalog: summary.entry, status: 'ready' }
          : { packId: summary.packId, status: 'invalid' }
      );
      if (mounted.current && activeRequest.current === request) {
        setCatalogs(loaded);
        setErrorCode(null);
      }
    } catch (error) {
      if (mounted.current && activeRequest.current === request) {
        setErrorCode(toSafeErrorCode(error));
      }
    } finally {
      if (mounted.current && activeRequest.current === request) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void reload();
    window.addEventListener('focus', reload);
    return () => {
      window.removeEventListener('focus', reload);
      mounted.current = false;
      activeRequest.current += 1;
    };
  }, [reload]);

  return { catalogs, errorCode, isLoading, reload };
}

function toSafeErrorCode(error: unknown): 'EFFECT_CATALOG_FAILED' {
  void error;
  return 'EFFECT_CATALOG_FAILED';
}
