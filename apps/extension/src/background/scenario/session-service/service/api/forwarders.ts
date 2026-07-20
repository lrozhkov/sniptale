import type { ScenarioSessionServiceRuntime } from '../../runtime/types/index';

import { createScenarioSessionServicePendingCaptureApi } from '../pending-capture';
import { createScenarioSessionServiceReadsApi } from '../reads';
import { createScenarioSessionServiceRevisionApi } from '../revision';
import { createScenarioSessionServiceSessionStateApi } from '../session-state';
import { createScenarioSessionServiceSurfaceApi } from '../surface';
import { createScenarioSessionServiceTabApi } from '../tab';

export type ScenarioSessionServiceApi = ReturnType<
  typeof createScenarioSessionServicePendingCaptureApi
> &
  ReturnType<typeof createScenarioSessionServiceReadsApi> &
  ReturnType<typeof createScenarioSessionServiceRevisionApi> &
  ReturnType<typeof createScenarioSessionServiceSessionStateApi> &
  ReturnType<typeof createScenarioSessionServiceSurfaceApi> &
  ReturnType<typeof createScenarioSessionServiceTabApi>;

export function createScenarioSessionServiceForwarders(
  runtime: ScenarioSessionServiceRuntime
): ScenarioSessionServiceApi {
  const forwarders: ScenarioSessionServiceApi = {
    ...createScenarioSessionServicePendingCaptureApi(runtime),
    ...createScenarioSessionServiceReadsApi(runtime),
    ...createScenarioSessionServiceRevisionApi(runtime),
    ...createScenarioSessionServiceSessionStateApi(runtime),
    ...createScenarioSessionServiceSurfaceApi(runtime),
    ...createScenarioSessionServiceTabApi(runtime),
  };

  return forwarders;
}
