import { useEffect, useMemo, useState } from 'react';
import type {
  ScenarioCaptureStep,
  ScenarioStepPatch,
} from '../../../features/scenario/contracts/types/project';
import { updateScenarioStep } from '../mutation/helpers';

export function useScenarioCaptureStepDraft(step: ScenarioCaptureStep) {
  const [draftPatch, setDraftPatch] = useState<ScenarioStepPatch | null>(null);

  useEffect(() => {
    setDraftPatch(null);
  }, [step]);

  const draftStep = useMemo(
    () =>
      draftPatch
        ? (updateScenarioStep(step, draftPatch, step.updatedAt) as ScenarioCaptureStep)
        : step,
    [draftPatch, step]
  );

  return {
    draftStep,
    setDraftPatch,
  };
}
