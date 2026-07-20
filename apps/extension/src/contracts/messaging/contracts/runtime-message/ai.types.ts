import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  ProcessScenarioEditorWithLLMMessage,
  ProcessScenarioEditorWithLLMResponse,
} from '../../../ai/scenario';
import type {
  AiSettingsMutationMessage,
  AiSettingsMutationResponse,
  AiSettingsQueryMessage,
  AiSettingsQueryResponse,
} from '../../ai-settings-runtime';
import type { AISecretUnlockMessage, AISecretUnlockResponse } from '../../ai-secret-unlock';
import type {
  ProcessWithLLMMessage,
  ProcessWithLLMResponse,
  RequestLlmSessionMessage,
  RequestLlmSessionResponse,
} from '../../llm';

export type RuntimeAiRequestByType = {
  [MessageType.REQUEST_LLM_SESSION]: RequestLlmSessionMessage;
  [MessageType.PROCESS_WITH_LLM]: ProcessWithLLMMessage;
  [MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM]: ProcessScenarioEditorWithLLMMessage;
  [MessageType.AI_SETTINGS_QUERY]: AiSettingsQueryMessage;
  [MessageType.AI_SETTINGS_MUTATION]: AiSettingsMutationMessage;
  [MessageType.AI_SECRET_UNLOCK]: AISecretUnlockMessage;
};

export type RuntimeAiResponseByType = {
  [MessageType.REQUEST_LLM_SESSION]: RequestLlmSessionResponse;
  [MessageType.PROCESS_WITH_LLM]: ProcessWithLLMResponse;
  [MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM]: ProcessScenarioEditorWithLLMResponse;
  [MessageType.AI_SETTINGS_QUERY]: AiSettingsQueryResponse;
  [MessageType.AI_SETTINGS_MUTATION]: AiSettingsMutationResponse;
  [MessageType.AI_SECRET_UNLOCK]: AISecretUnlockResponse;
};
