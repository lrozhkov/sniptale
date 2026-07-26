import { readPinToTabSessionStorageState } from '../../../composition/persistence/content-pin-session/index';
import type { BackgroundRuntimeMessageDeps } from '../routing/boundary/shared';
import { enableScreenshotMode } from '../tab-mode-router-screenshot';
import { ensureActivePageAccessRuntime, hasActivePageAccess } from './service';
import { beginPinnedToolbarOperation } from './pinned-toolbar-operation';

type PinnedToolbarRestoreState = Pick<
  BackgroundRuntimeMessageDeps,
  'screenshotModeState' | 'viewportOwnerState' | 'viewportState' | 'webSnapshotViewerPorts'
>;

export async function restorePinnedToolbarAfterNavigation(
  tabId: number,
  runtimeState: PinnedToolbarRestoreState
): Promise<boolean> {
  const operation = beginPinnedToolbarOperation(tabId);
  return operation.runExclusive(async () => {
    if (!operation.isCurrent() || !(await readPinToTabSessionStorageState(tabId))) {
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

    await enableScreenshotMode(
      tabId,
      runtimeState.screenshotModeState,
      runtimeState.viewportState,
      runtimeState.viewportOwnerState,
      runtimeState.webSnapshotViewerPorts
    );
    return operation.isCurrent();
  });
}
