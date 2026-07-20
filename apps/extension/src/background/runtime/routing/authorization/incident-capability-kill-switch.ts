import {
  reject,
  type IpcAuthorizationResult,
} from '../../../routing-contracts/authorization-result';

export type IncidentCapabilityFamily =
  | 'background-owned'
  | 'offscreen-runtime'
  | 'popup-export-tab-route'
  | 'privileged-tab-route:capture'
  | 'privileged-tab-route:page-style'
  | 'privileged-tab-route:scenario'
  | 'privileged-tab-route:tab-mode'
  | 'privileged-tab-route:video-control'
  | 'project-export-runtime'
  | 'video-control-camera-recorder-route'
  | 'video-control-no-tab-route'
  | 'video-control-owner-no-tab-route';

const disabledFamilies = new Set<IncidentCapabilityFamily>();

export function setIncidentCapabilityFamilyDisabled(
  family: IncidentCapabilityFamily,
  disabled: boolean
): void {
  if (disabled) {
    disabledFamilies.add(family);
    return;
  }
  disabledFamilies.delete(family);
}

export function rejectDisabledIncidentCapabilityFamily(
  family: IncidentCapabilityFamily
): IpcAuthorizationResult | null {
  return disabledFamilies.has(family)
    ? reject(`Incident policy disabled capability family: ${family}`)
    : null;
}

export function resetIncidentCapabilityKillSwitchForTests(): void {
  disabledFamilies.clear();
}
