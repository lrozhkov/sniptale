import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const llmSessionRouteDescriptor = {
  handlerId: 'llm-session',
  messageTypes: [MessageType.REQUEST_LLM_SESSION],
  ownerModule: 'apps/extension/src/background/ai/llm/session-route.ts',
  policyAuthorityFamily: 'llm-session-issuance',
  policyStateIds: ['llm-session-tokens'],
  routeAuthorityFamily: 'background-owned-ipc',
} as const;

export const llmContentProcessingRouteDescriptor = {
  handlerId: 'llm-content-processing',
  messageTypes: [MessageType.PROCESS_WITH_LLM],
  ownerModule: 'apps/extension/src/background/ai/llm/router.ts',
  policyAuthorityFamily: 'llm-content-processing',
  policyStateIds: ['llm-session-tokens'],
  routeAuthorityFamily: 'background-owned-ipc',
} as const;

export const llmScenarioEditorProcessingRouteDescriptor = {
  handlerId: 'llm-scenario-editor-processing',
  messageTypes: [MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM],
  ownerModule: 'apps/extension/src/background/ai/llm/editor-router.ts',
  policyAuthorityFamily: 'llm-scenario-editor-processing',
  policyStateIds: ['llm-session-tokens'],
  routeAuthorityFamily: 'background-owned-ipc',
} as const;
