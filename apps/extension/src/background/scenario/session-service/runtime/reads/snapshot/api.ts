import type { ScenarioSessionServiceCore } from '../../types/core';
import { createPendingCaptureSnapshotApi } from './pending-capture';
import { createRestoreSnapshotApi } from './restore';
import { createSessionSnapshotApi } from './session';
import { createSurfaceSnapshotApi } from './surface';

export function createScenarioSessionServiceSnapshotApi(core: ScenarioSessionServiceCore) {
  return {
    ...createPendingCaptureSnapshotApi(core),
    ...createRestoreSnapshotApi(core),
    ...createSessionSnapshotApi(core),
    ...createSurfaceSnapshotApi(core),
  };
}
