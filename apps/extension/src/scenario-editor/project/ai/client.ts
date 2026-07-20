import { createScenarioEditorEgressAuthority } from '../../../features/ai/egress-authority';
import { isChromeAiModelId } from '../../../features/ai/chrome/constants';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  ProcessScenarioEditorWithLLMMessage,
  ProcessScenarioEditorWithLLMResponse,
} from '../../../contracts/ai/scenario';
import {
  createRuntimeMessagingTransport,
  type RuntimeMessagingTransport,
} from '../../../platform/runtime-messaging';
import { requestLlmSessionToken } from '../../../workflows/ai-session/llm-session';
import { runChromeAiScenarioRequest } from './chrome/scenario-runner';

type ScenarioAiPayload = {
  attachments: ProcessScenarioEditorWithLLMMessage['attachments'];
  instruction: string;
  modelId: string | null;
  projectOutlineJson?: string;
  projectSnapshotJson: string;
  selectedSlideCodeJson?: string;
  toolManifestJson?: string;
};

export type ScenarioAiClient = {
  requestResponse(payload: ScenarioAiPayload): Promise<ProcessScenarioEditorWithLLMResponse>;
};

export function createScenarioAiClient(
  transport: RuntimeMessagingTransport = createRuntimeMessagingTransport()
): ScenarioAiClient {
  return {
    async requestResponse(payload) {
      if (isChromeAiModelId(payload.modelId)) {
        return runChromeAiScenarioRequest({
          attachments: payload.attachments,
          contractVersion: 3,
          instruction: payload.instruction,
          projectOutlineJson: payload.projectOutlineJson,
          projectSnapshotJson: payload.projectSnapshotJson,
          selectedSlideCodeJson: payload.selectedSlideCodeJson,
          toolManifestJson: payload.toolManifestJson,
        });
      }

      const egressAuthority = await createScenarioEditorEgressAuthority({
        attachments: payload.attachments,
        contractVersion: 3,
        projectOutlineJson: payload.projectOutlineJson,
        projectSnapshotJson: payload.projectSnapshotJson,
        selectedSlideCodeJson: payload.selectedSlideCodeJson,
        toolManifestJson: payload.toolManifestJson,
      });
      const llmSessionToken = await requestLlmSessionToken('scenario-editor', egressAuthority);
      return transport.sendRuntimeMessage({
        attachments: payload.attachments,
        contractVersion: 3,
        instruction: payload.instruction,
        llmSessionToken,
        modelId: payload.modelId,
        projectOutlineJson: payload.projectOutlineJson,
        projectSnapshotJson: payload.projectSnapshotJson,
        selectedSlideCodeJson: payload.selectedSlideCodeJson,
        toolManifestJson: payload.toolManifestJson,
        type: MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM,
      });
    },
  };
}
