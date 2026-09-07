import { listGallerySavedViews } from '../../../composition/persistence/gallery-saved-views/index';
import type { GallerySavedView } from '../../../composition/persistence/gallery-saved-views/contract';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listMediaLibrary } from '../../../composition/persistence/media-library/index';
import type { MediaLibraryItem } from '../../../composition/persistence/media-library/contracts';
import { translate } from '../../../platform/i18n';
import {
  listProjectExports,
  listVideoProjects,
} from '../../../composition/persistence/projects/index';
import { listRecordings } from '../../../composition/persistence/recordings/index';
import type { VideoEditorLibrariesState } from '../app-model/types';

/** Reads the disposable media picker collection while its drawer is open. */
export function useVideoEditorMediaLibrary(isOpen: boolean) {
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [savedViews, setSavedViews] = useState<GallerySavedView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    if (!isOpen) return;
    const revision = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const [entries, views] = await Promise.all([listMediaLibrary(), listGallerySavedViews()]);
      if (revision === request.current) {
        setItems(entries);
        setSavedViews(views);
      }
    } catch {
      if (revision === request.current) {
        setItems([]);
        setSavedViews([]);
        setError(translate('videoEditor.sidebar.libraryMediaUnavailable'));
      }
    } finally {
      if (revision === request.current) setLoading(false);
    }
  }, [isOpen]);
  useEffect(() => {
    void refresh();
    return () => {
      request.current += 1;
    };
  }, [refresh]);
  return { items, savedViews, loading, error, refresh };
}

/**
 * Maintains the sidebar library lists and refresh commands for the editor shell.
 */
export function useVideoEditorLibraries(): VideoEditorLibrariesState {
  const [recordings, setRecordings] = useState<VideoEditorLibrariesState['recordings']>([]);
  const [projects, setProjects] = useState<VideoEditorLibrariesState['projects']>([]);
  const [projectExports, setProjectExports] = useState<VideoEditorLibrariesState['projectExports']>(
    []
  );
  const projectExportsRequestRef = useRef(0);

  const refreshRecordings = useCallback(async () => {
    const items = await listRecordings();
    setRecordings(items.toSorted((a, b) => b.createdAt - a.createdAt));
  }, []);

  const refreshProjects = useCallback(async () => {
    const items = await listVideoProjects();
    setProjects(items);
  }, []);

  const refreshProjectExports = useCallback(async (projectId: string | null) => {
    const requestId = projectExportsRequestRef.current + 1;
    projectExportsRequestRef.current = requestId;

    if (!projectId) {
      setProjectExports([]);
      return;
    }

    setProjectExports([]);
    const entries = await listProjectExports(projectId);
    if (projectExportsRequestRef.current !== requestId) {
      return;
    }

    setProjectExports(entries.toSorted((a, b) => b.createdAt - a.createdAt));
  }, []);

  return useMemo(
    () => ({
      recordings,
      projects,
      projectExports,
      refreshRecordings,
      refreshProjects,
      refreshProjectExports,
    }),
    [
      projectExports,
      projects,
      recordings,
      refreshProjectExports,
      refreshProjects,
      refreshRecordings,
    ]
  );
}
