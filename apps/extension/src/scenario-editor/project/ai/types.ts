import type { ScenarioAiAttachmentMode } from './attachments';

export interface ScenarioEditorAiRunSummary {
  appliedStepIds: string[];
  instruction: string;
  requestedStepIds: string[];
  submittedAt: number;
}

export interface ScenarioEditorAiAttachmentDisclosure {
  mode: ScenarioAiAttachmentMode;
  screenshotCount: number;
  selectedStepId: string | null;
}
