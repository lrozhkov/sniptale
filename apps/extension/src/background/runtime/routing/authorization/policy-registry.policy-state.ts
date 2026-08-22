import { backgroundIngressContracts } from '../../../../contracts/messaging/contracts/runtime';
import type { PolicyStateId } from '../../../routing-contracts/policy-state';

export const BACKGROUND_OWNED_POLICY_STATE_IDS = collectPolicyStateIds('background-owned');
export const OFFSCREEN_RUNTIME_POLICY_STATE_IDS = collectPolicyStateIds('offscreen-runtime');
export const POPUP_EXPORT_TAB_ROUTE_POLICY_STATE_IDS =
  collectPolicyStateIds('popup-export-tab-route');
export const CAPTURE_PRIVILEGED_TAB_POLICY_STATE_IDS = collectPolicyStateIds(
  'privileged-tab-route:capture'
);
export const SCENARIO_PRIVILEGED_TAB_POLICY_STATE_IDS = collectPolicyStateIds(
  'privileged-tab-route:scenario'
);
export const TAB_MODE_PRIVILEGED_TAB_POLICY_STATE_IDS = collectPolicyStateIds(
  'privileged-tab-route:tab-mode'
);
export const VIDEO_CONTROL_PRIVILEGED_TAB_POLICY_STATE_IDS = collectPolicyStateIds(
  'privileged-tab-route:video-control'
);
export const VIDEO_RECORDING_SURFACE_PRIVILEGED_TAB_POLICY_STATE_IDS = collectPolicyStateIds(
  'privileged-tab-route:video-recording-surface'
);
export const PROJECT_EXPORT_RUNTIME_POLICY_STATE_IDS =
  collectPolicyStateIds('project-export-runtime');

function collectPolicyStateIds(authorizationPolicyId: string): readonly PolicyStateId[] {
  return [
    ...new Set(
      backgroundIngressContracts.flatMap((entry) => {
        if (entry.classification !== 'routed') {
          return [];
        }
        if (
          entry.authorizationPolicyId !== authorizationPolicyId &&
          !entry.alternateAuthorizationPolicyIds.includes(authorizationPolicyId)
        ) {
          return [];
        }
        return entry.policyStateIds as readonly PolicyStateId[];
      })
    ),
  ];
}
