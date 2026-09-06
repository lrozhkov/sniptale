import { useState } from 'react';
import type { ScenarioAiAttachmentMode } from './attachments';
import type { ScenarioEditorAiAttachmentDisclosure, ScenarioEditorAiRunSummary } from './types';
import { useScenarioAiModelBootstrapState } from './model-bootstrap-state';

export function useScenarioEditorAiState() {
  const [attachmentMode, setAttachmentMode] = useState<ScenarioAiAttachmentMode>('none');
  const [activeAttachmentDisclosure, setActiveAttachmentDisclosure] =
    useState<ScenarioEditorAiAttachmentDisclosure | null>(null);
  const baseState = useScenarioAiModelBootstrapState<ScenarioEditorAiRunSummary>(
    'scenario.editor.aiEditorRequestFailed'
  );

  return {
    ...baseState,
    activeAttachmentDisclosure,
    attachmentMode,
    setActiveAttachmentDisclosure,
    setAttachmentMode,
  };
}

export type ScenarioEditorAiState = ReturnType<typeof useScenarioEditorAiState>;
