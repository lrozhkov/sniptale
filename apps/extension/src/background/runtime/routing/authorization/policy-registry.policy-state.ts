import type { PolicyStateId } from '../../../routing-contracts/policy-state';

export const BACKGROUND_OWNED_POLICY_STATE_IDS = [
  'ai-secret-unlock-requests',
  'content-action-activation-keys',
  'content-action-auto-start-grants',
  'content-action-capabilities',
  'content-action-runtime-tokens',
  'content-action-trusted-event-proofs',
  'llm-session-tokens',
  'page-access-tab-activation',
  'popup-export-staged-archives',
  'popup-tab-route-capabilities',
] as const satisfies readonly PolicyStateId[];

export const OFFSCREEN_RUNTIME_POLICY_STATE_IDS = [
  'project-export-capabilities',
  'project-export-job-ledger',
  'video-recording-control-lease',
] as const satisfies readonly PolicyStateId[];

export const POPUP_EXPORT_TAB_ROUTE_POLICY_STATE_IDS = [
  'popup-tab-route-capabilities',
] as const satisfies readonly PolicyStateId[];

export const CAPTURE_PRIVILEGED_TAB_POLICY_STATE_IDS = [
  'content-action-activation-keys',
  'content-action-capabilities',
  'content-action-runtime-tokens',
  'content-action-trusted-event-proofs',
] as const satisfies readonly PolicyStateId[];

export const PAGE_STYLE_PRIVILEGED_TAB_POLICY_STATE_IDS = [
  'page-access-tab-activation',
] as const satisfies readonly PolicyStateId[];

export const SCENARIO_PRIVILEGED_TAB_POLICY_STATE_IDS = [
  'tab-mode-runtime-state',
] as const satisfies readonly PolicyStateId[];

export const TAB_MODE_PRIVILEGED_TAB_POLICY_STATE_IDS = [
  'tab-mode-runtime-state',
] as const satisfies readonly PolicyStateId[];

export const VIDEO_CONTROL_PRIVILEGED_TAB_POLICY_STATE_IDS = [
  'video-recording-control-lease',
] as const satisfies readonly PolicyStateId[];

export const PROJECT_EXPORT_RUNTIME_POLICY_STATE_IDS = [
  'project-export-capabilities',
  'project-export-job-ledger',
] as const satisfies readonly PolicyStateId[];
