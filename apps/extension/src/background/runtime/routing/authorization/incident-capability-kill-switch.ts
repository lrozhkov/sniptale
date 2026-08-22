import {
  reject,
  type IpcAuthorizationResult,
} from '../../../routing-contracts/authorization-result';
import type { BackgroundIngressAuthorizationPolicyId } from '../../../../contracts/messaging/contracts/runtime';

export type IncidentCapabilityFamily = Exclude<
  BackgroundIngressAuthorizationPolicyId,
  `owner-local:${string}`
>;

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
