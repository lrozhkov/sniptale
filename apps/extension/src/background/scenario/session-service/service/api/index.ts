import {
  createScenarioSessionServiceForwarders,
  type ScenarioSessionServiceApi,
} from './forwarders';
import { createScenarioSessionServiceRuntime } from '../../runtime';

/**
 * Owns per-tab scenario session state plus persisted pending-capture references.
 */
export class ScenarioSessionService {
  private readonly runtime = createScenarioSessionServiceRuntime();
  bufferPendingCapture!: ScenarioSessionServiceApi['bufferPendingCapture'];
  bumpProjectRevision!: ScenarioSessionServiceApi['bumpProjectRevision'];
  clearPendingCapture!: ScenarioSessionServiceApi['clearPendingCapture'];
  clearPendingCaptureIfCurrent!: ScenarioSessionServiceApi['clearPendingCaptureIfCurrent'];
  clearTab!: ScenarioSessionServiceApi['clearTab'];
  consumePendingCapture!: ScenarioSessionServiceApi['consumePendingCapture'];
  getPendingCapture!: ScenarioSessionServiceApi['getPendingCapture'];
  getRestoreSnapshot!: ScenarioSessionServiceApi['getRestoreSnapshot'];
  getSession!: ScenarioSessionServiceApi['getSession'];
  getSurface!: ScenarioSessionServiceApi['getSurface'];
  hasPendingCapture!: ScenarioSessionServiceApi['hasPendingCapture'];
  resolvePendingCapture!: ScenarioSessionServiceApi['resolvePendingCapture'];
  setActiveProject!: ScenarioSessionServiceApi['setActiveProject'];
  setCaptureMode!: ScenarioSessionServiceApi['setCaptureMode'];
  setEnabled!: ScenarioSessionServiceApi['setEnabled'];
  setRememberProjectSelection!: ScenarioSessionServiceApi['setRememberProjectSelection'];
  setSidebarVisible!: ScenarioSessionServiceApi['setSidebarVisible'];
  syncProjectRevision!: ScenarioSessionServiceApi['syncProjectRevision'];
  updateSurfaceState!: ScenarioSessionServiceApi['updateSurfaceState'];

  constructor() {
    Object.assign(this, createScenarioSessionServiceForwarders(this.runtime));
  }
}
