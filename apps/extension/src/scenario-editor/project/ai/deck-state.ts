import { translate } from '../../../platform/i18n';
import type { ScenarioAiOperation } from '@sniptale/runtime-contracts/scenario-ai-operations';
import { useScenarioAiModelBootstrapState } from './model-bootstrap-state';

interface ScenarioEditorDeckAiRunSummary {
  appliedOperations: ScenarioAiOperation[];
  instruction: string;
  selectedSlideId: string;
  submittedAt: number;
}

export function useScenarioEditorDeckAiState() {
  return useScenarioAiModelBootstrapState<ScenarioEditorDeckAiRunSummary>(
    translate('scenario.editor.aiEditorRequestFailed')
  );
}

export type ScenarioEditorDeckAiState = ReturnType<typeof useScenarioEditorDeckAiState>;
