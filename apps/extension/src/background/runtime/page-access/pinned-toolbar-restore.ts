import {
  readPinToTabSessionStorageState,
  readPinToTabToolbarVisibilitySessionStorageState,
} from '../../../composition/persistence/content-pin-session/index';
import type { BackgroundRuntimeMessageDeps } from '../routing/boundary/shared';
import { enableScreenshotModeGuarded } from '../tab-mode-router-screenshot';
import {
  ensureActivePageAccessRuntime,
  hasActivePageAccess,
  hasPinnedToolbarAllSitesAccess,
} from '../../page-access/service';
import { beginPinnedToolbarRestoreOperation } from '../../page-access/pinned-toolbar-operation';
import { waitForContentToolbarReady } from '../../page-access/readiness';
import { readScenarioRestoreState } from './scenario-restore';

type PinnedToolbarRestoreState = Pick<
  BackgroundRuntimeMessageDeps,
  | 'scenarioSessionService'
  | 'screenshotModeState'
  | 'viewportOwnerState'
  | 'viewportState'
  | 'webSnapshotViewerPorts'
>;

export async function restorePinnedToolbarAfterNavigation(
  tabId: number,
  runtimeState: PinnedToolbarRestoreState,
  reviewActive = false
): Promise<boolean> {
  const operation = beginPinnedToolbarRestoreOperation(tabId);
  return operation.runExclusive(async () => {
    if (
      !operation.isCurrent() ||
      (!reviewActive && !(await readPinToTabSessionStorageState(tabId)))
    ) {
      return false;
    }

    if (!operation.isCurrent() || (!reviewActive && !(await hasPinnedToolbarAllSitesAccess()))) {
      return false;
    }

    if (!operation.isCurrent() || !(await hasActivePageAccess(tabId))) {
      return false;
    }

    if (!operation.isCurrent()) {
      return false;
    }
    await ensureActivePageAccessRuntime(tabId);
    if (!operation.isCurrent()) {
      return false;
    }

    await waitForContentToolbarReady(tabId);
    if (!operation.isCurrent()) {
      return false;
    }

    const scenario = await readScenarioRestoreState(tabId, runtimeState);
    const toolbarVisible = scenario.shouldRestore
      ? scenario.surface.toolbarVisible
      : await readPinToTabToolbarVisibilitySessionStorageState(tabId);
    if (!operation.isCurrent()) {
      return false;
    }
    return enableScreenshotModeGuarded(
      tabId,
      runtimeState.screenshotModeState,
      runtimeState.viewportState,
      runtimeState.viewportOwnerState,
      runtimeState.webSnapshotViewerPorts,
      {
        commitGuard: async () =>
          operation.isCurrent() &&
          (reviewActive
            ? await hasActivePageAccess(tabId)
            : await hasPinnedToolbarAllSitesAccess()),
        readPreparationState: () => waitForContentToolbarReady(tabId),
        toolbarVisible,
      }
    );
  });
}
