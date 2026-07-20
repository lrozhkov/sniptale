import { expect, it } from 'vitest';

import {
  createScenarioSessionServicePendingCaptureApi,
  createScenarioSessionServiceSnapshotApi,
} from './index';
import { createScenarioSessionServicePendingCaptureApi as pendingApi } from './pending-capture';
import { createScenarioSessionServiceSnapshotApi as snapshotApi } from './snapshot/index';

it('keeps the reads facade thin', () => {
  expect(createScenarioSessionServiceSnapshotApi).toBe(snapshotApi);
  expect(createScenarioSessionServicePendingCaptureApi).toBe(pendingApi);
});
