import { useEffect } from 'react';
import type { VideoEditorLibrariesState } from '../app-model/types';
import {
  loadInitialProjectFromLocation,
  ReviewProjectTransferError,
} from '../../project/operations/ops';
import { translate } from '../../../platform/i18n';
import type { TranslationKey } from '../../../platform/i18n/types';
import type { ApplyLoadedProject } from './types';
import type { VideoEditorSessionActions } from '../../contracts/commands/session';
import { createUserFacingErrorMessage } from '../../../platform/i18n/user-facing-error';

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

        if (resolved.project) applyLoadedProject(resolved.project, resolved.recordingId);

        setReady(true);
        if (resolved.project) {
          await Promise.allSettled([
            refreshRecordings(),
            refreshProjects(),
            refreshProjectExports(resolved.project.id),
          ]);
        } else {
          await Promise.allSettled([refreshRecordings(), refreshProjects()]);
        }
      } catch (bootstrapError) {
        if (!cancelled) {
          setError(
            bootstrapError instanceof ReviewProjectTransferError
              ? translate(transferRefusalKeys[bootstrapError.reason])
              : createUserFacingErrorMessage({
                  cause: bootstrapError,
                  detail: 'storage',
                  summaryKey: 'videoEditor.app.openFailed',
                })
          );
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

/** Only operation-owned categories can select specific UI copy. */
const transferRefusalKeys: Record<ReviewProjectTransferError['reason'], TranslationKey> = {
  timing: 'videoEditor.app.transferTimingUnsupported',
  joins: 'videoEditor.app.transferJoinsUnsupported',
  overlays: 'videoEditor.app.transferOverlaysUnsupported',
  resources: 'videoEditor.app.transferResourcesUnavailable',
  settings: 'videoEditor.app.transferSettingsUnsupported',
};
