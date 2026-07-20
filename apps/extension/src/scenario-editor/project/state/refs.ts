import { useRef } from 'react';
import {
  readScenarioEditorProjectId,
  readScenarioEditorStepId,
} from '@sniptale/runtime-contracts/scenario-editor/session';
import type { ScenarioProject } from '../../../features/scenario/contracts/types/project';

export function useScenarioEditorProjectStateRefs() {
  return {
    initialProjectIdRef: useRef<string | null>(readScenarioEditorProjectId(window.location.search)),
    initialStepIdRef: useRef<string | null>(readScenarioEditorStepId(window.location.search)),
    savedProjectRef: useRef<ScenarioProject | null>(null),
  };
}
