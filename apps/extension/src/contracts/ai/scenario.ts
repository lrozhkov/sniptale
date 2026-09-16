import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ScenarioAiOperation } from '@sniptale/runtime-contracts/scenario-ai-operations';

export type ScenarioAIAttachment = {
  dataUrl: string;
  filename: string;
  mimeType: string;
  stepId: string;
  stepNumber: number;
};

/** The request binds its proposal to an explicit local selection and committed revision. */
export interface ProcessScenarioEditorWithLLMMessage {
  attachments: ScenarioAIAttachment[];
  contractVersion: 4;
  projectId: string;
  baseRevision: number;
  scope: { stepIds: string[]; blockIds: string[]; document?: boolean | undefined };
  instruction: string;
  llmSessionToken: string;
  modelId?: string | null | undefined;
  projectOutlineJson?: string | undefined;
  projectSnapshotJson: string;
  selectedStepJson?: string | undefined;
  toolManifestJson?: string | undefined;
  type: typeof MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM;
}

export type ScenarioAIParseError = 'invalid-json' | `invalid-schema:${number}`;

export interface ProcessScenarioEditorWithLLMResponse {
  error?: string | undefined;
  operations?: ScenarioAiOperation[] | undefined;
  parseError?: ScenarioAIParseError | undefined;
  success: boolean;
}
