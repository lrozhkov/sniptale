import { useEffect } from 'react';
import type { VideoEditorLibrariesState } from '../app-model/types';
import { loadInitialProjectFromLocation } from '../../project/operations/ops';
import type { ApplyLoadedProject } from './types';
import type { VideoEditorSessionActions } from '../../contracts/commands/session';

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Resolves the initial workspace from the location and warms sidebar libraries.
 */
export function useVideoEditorBootstrap(
  applyLoadedProject: ApplyLoadedProject,
  setError: VideoEditorSessionActions['setError'],
  setReady: VideoEditorSessionActions['setReady'],
  refreshRecordings: VideoEditorLibrariesState['refreshRecordings'],
  refreshProjects: VideoEditorLibrariesState['refreshProjects'],
  refreshProjectExports: VideoEditorLibrariesState['refreshProjectExports']
): void {
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const resolved = await loadInitialProjectFromLocation();
        if (cancelled) {
          return;
        }

        applyLoadedProject(resolved.project, resolved.recordingId);

        await Promise.all([
          refreshRecordings(),
          refreshProjects(),
          refreshProjectExports(resolved.project.id),
        ]);

        if (!cancelled) {
          setReady(true);
        }
      } catch (bootstrapError) {
        if (!cancelled) {
          setError(toErrorMessage(bootstrapError));
          setReady(true);
        }
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [
    applyLoadedProject,
    refreshProjectExports,
    refreshProjects,
    refreshRecordings,
    setError,
    setReady,
  ]);
}
