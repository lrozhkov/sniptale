import { useCallback, useRef, useState } from 'react';
import {
  listProjectExports,
  listVideoProjects,
} from '../../../composition/persistence/projects/index';
import { listRecordings } from '../../../composition/persistence/recordings/index';
import type { VideoEditorLibrariesState } from '../app-model/types';

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

  return {
    recordings,
    projects,
    projectExports,
    refreshRecordings,
    refreshProjects,
    refreshProjectExports,
  };
}
