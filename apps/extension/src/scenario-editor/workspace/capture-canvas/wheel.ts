import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import { updateScenarioStep } from '../../project/mutation/helpers';
import type { ScenarioStepPatch } from '../../project/mutation/helpers';
import { zoomImageTransform } from '../quick-edit/stage.helpers';

export function useScenarioWorkspaceWheelSession(args: {
  onUpdateStep: (patch: ScenarioStepPatch) => void;
  setDraftPatch: (patch: ScenarioStepPatch | null) => void;
  stageRef: React.RefObject<HTMLDivElement | null>;
  step: ScenarioCaptureStep;
}) {
  const { stageRef } = args;
  const { flushPendingZoom, handleWheel } = useScenarioWorkspaceWheelDraft(args);

  useLayoutEffect(() => {
    const stageNode = stageRef.current;
    if (!stageNode) {
      return;
    }

    stageNode.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      stageNode.removeEventListener('wheel', handleWheel);
      flushPendingZoom();
    };
  }, [flushPendingZoom, handleWheel, stageRef]);

  return {
    flushPendingZoom,
  };
}

function useScenarioWorkspaceWheelDraft(args: {
  onUpdateStep: (patch: ScenarioStepPatch) => void;
  setDraftPatch: (patch: ScenarioStepPatch | null) => void;
  step: ScenarioCaptureStep;
}) {
  const { onUpdateStep, setDraftPatch, step } = args;
  const refs = useScenarioWorkspaceWheelRefs(step);
  const flushPendingZoom = useScenarioWorkspacePendingZoom({
    ...refs,
    onUpdateStep,
    setDraftPatch,
  });

  const handleWheel = useScenarioWorkspaceWheelHandler({
    ...refs,
    flushPendingZoom,
    setDraftPatch,
  });

  return {
    flushPendingZoom,
    handleWheel,
  };
}

function useScenarioWorkspaceWheelRefs(step: ScenarioCaptureStep) {
  const draftStepRef = useRef(step);
  const pendingPatchRef = useRef<ScenarioStepPatch | null>(null);
  const pendingStepRef = useRef<ScenarioCaptureStep | null>(null);
  const flushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    draftStepRef.current = step;
  }, [step]);

  return { draftStepRef, flushTimerRef, pendingPatchRef, pendingStepRef };
}

function useScenarioWorkspacePendingZoom(args: {
  draftStepRef: React.MutableRefObject<ScenarioCaptureStep>;
  flushTimerRef: React.MutableRefObject<number | null>;
  onUpdateStep: (patch: ScenarioStepPatch) => void;
  pendingPatchRef: React.MutableRefObject<ScenarioStepPatch | null>;
  pendingStepRef: React.MutableRefObject<ScenarioCaptureStep | null>;
  setDraftPatch: (patch: ScenarioStepPatch | null) => void;
}) {
  const {
    draftStepRef,
    flushTimerRef,
    onUpdateStep,
    pendingPatchRef,
    pendingStepRef,
    setDraftPatch,
  } = args;

  const clearPendingZoom = useCallback(
    (options?: { preserveDraft?: boolean }) => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }

      pendingPatchRef.current = null;
      pendingStepRef.current = null;
      if (!options?.preserveDraft) {
        setDraftPatch(null);
      }
    },
    [flushTimerRef, pendingPatchRef, pendingStepRef, setDraftPatch]
  );

  const flushPendingZoom = useCallback(() => {
    const pendingPatch = pendingPatchRef.current;
    const previewStep = pendingStepRef.current ?? draftStepRef.current;

    if (pendingPatch) {
      onUpdateStep(pendingPatch);
      clearPendingZoom({ preserveDraft: true });
    }

    return previewStep;
  }, [clearPendingZoom, draftStepRef, onUpdateStep, pendingPatchRef, pendingStepRef]);

  return flushPendingZoom;
}

function useScenarioWorkspaceWheelHandler(args: {
  draftStepRef: React.MutableRefObject<ScenarioCaptureStep>;
  flushPendingZoom: () => ScenarioCaptureStep;
  flushTimerRef: React.MutableRefObject<number | null>;
  pendingPatchRef: React.MutableRefObject<ScenarioStepPatch | null>;
  pendingStepRef: React.MutableRefObject<ScenarioCaptureStep | null>;
  setDraftPatch: (patch: ScenarioStepPatch | null) => void;
}) {
  const {
    draftStepRef,
    flushPendingZoom,
    flushTimerRef,
    pendingPatchRef,
    pendingStepRef,
    setDraftPatch,
  } = args;

  return useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const baseStep = pendingStepRef.current ?? draftStepRef.current;
      const patch = {
        imageTransform: zoomImageTransform(baseStep, event.deltaY > 0 ? -0.08 : 0.08),
      } satisfies ScenarioStepPatch;

      pendingPatchRef.current = patch;
      pendingStepRef.current = updateScenarioStep(
        baseStep,
        patch,
        baseStep.updatedAt
      ) as ScenarioCaptureStep;
      setDraftPatch(patch);

      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }

      flushTimerRef.current = window.setTimeout(() => {
        flushPendingZoom();
      }, 260);
    },
    [draftStepRef, flushPendingZoom, flushTimerRef, pendingPatchRef, pendingStepRef, setDraftPatch]
  );
}
