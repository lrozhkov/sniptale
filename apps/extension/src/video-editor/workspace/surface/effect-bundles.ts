import { useCallback, useEffect, useRef, useState } from 'react';

import {
  deleteEffectBundle,
  listEffectBundles,
  saveEffectArtifact,
  setEffectBundleEnabled,
} from '../../../composition/persistence/effect-bundles';
import { importEffectArtifact } from '../../../features/video/project/effect-bundle';
import type { VideoEditorEffectCatalogItem } from '../../library/effects-dock/types';

export interface WorkspaceEffectBundlesState {
  catalogs: readonly VideoEditorEffectCatalogItem[];
  errorCode: 'EFFECT_CATALOG_FAILED' | null;
  isLoading: boolean;
  onDeleteEffectBundle(packId: string): Promise<void>;
  onImportEffectFile(file: File): Promise<void>;
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
    async onImportEffectFile(file) {
      const result = await importEffectArtifact(file);
      if (!result.ok) throw new Error(result.primaryCode);
      await saveEffectArtifact(result.artifact);
      await state.reload();
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
    return () => {
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
