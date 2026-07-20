import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEventHandler,
  type RefObject,
  type SetStateAction,
} from 'react';
import {
  ScenarioRecorderSidebarMetadataModal,
  ScenarioRecorderSidebarPreviewOverlay,
} from './overlays';
import { ScenarioRecorderSidebarSurface } from './surface';
import type { ScenarioRecorderSidebarStep } from './types';

function runStepHighlight(args: {
  latestStepId: string;
  setHighlightedStepId: Dispatch<SetStateAction<string | null>>;
  stepsContainerRef: RefObject<HTMLDivElement | null>;
}) {
  args.setHighlightedStepId(args.latestStepId);
  if (typeof args.stepsContainerRef.current?.scrollTo === 'function') {
    args.stepsContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  }
  return window.setTimeout(() => {
    args.setHighlightedStepId((current) => (current === args.latestStepId ? null : current));
  }, 1800);
}

function useHighlightedRecentStep(args: {
  highlightToken?: number;
  forcedHighlightStepId?: string | null;
  forcedHighlightVersion?: number;
  recentSteps: ScenarioRecorderSidebarStep[];
}) {
  const latestStepId = args.recentSteps[0]?.id ?? null;
  const [highlightedStepId, setHighlightedStepId] = useState<string | null>(null);
  const previousHighlightTokenRef = useRef(args.highlightToken ?? 0);
  const stepsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!latestStepId || (args.highlightToken ?? 0) === previousHighlightTokenRef.current) {
      return;
    }

    previousHighlightTokenRef.current = args.highlightToken ?? 0;
    const timeoutId = runStepHighlight({
      latestStepId,
      setHighlightedStepId,
      stepsContainerRef,
    });

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [args.highlightToken, latestStepId]);

  useEffect(() => {
    if (!args.forcedHighlightStepId || args.forcedHighlightStepId !== latestStepId) {
      return;
    }

    const timeoutId = runStepHighlight({
      latestStepId: args.forcedHighlightStepId,
      setHighlightedStepId,
      stepsContainerRef,
    });

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [args.forcedHighlightStepId, args.forcedHighlightVersion, latestStepId]);

  return { highlightedStepId, stepsContainerRef };
}

export function ScenarioRecorderSidebar(props: {
  dragging: boolean;
  highlightToken?: number;
  forcedHighlightStepId?: string | null;
  forcedHighlightVersion?: number;
  onDeleteStep: (stepId: string) => void;
  onFinish: () => void;
  onMoveStep: (stepId: string, toIndex: number) => void;
  onOpenEditor: (stepId?: string | null) => void;
  onSidebarHeaderMouseDown: MouseEventHandler<HTMLDivElement>;
  projectName: string | null;
  position: { x: number; y: number };
  recentSteps: ScenarioRecorderSidebarStep[];
  sidebarRef: RefObject<HTMLElement | null>;
}) {
  const sidebarState = useScenarioRecorderSidebarState();
  const { highlightedStepId, stepsContainerRef } = useHighlightedRecentStep({
    recentSteps: props.recentSteps,
    ...(props.highlightToken === undefined ? {} : { highlightToken: props.highlightToken }),
    ...(props.forcedHighlightStepId === undefined
      ? {}
      : { forcedHighlightStepId: props.forcedHighlightStepId }),
    ...(props.forcedHighlightVersion === undefined
      ? {}
      : { forcedHighlightVersion: props.forcedHighlightVersion }),
  });
  return (
    <>
      <ScenarioRecorderSidebarSurface
        dragging={props.dragging}
        dragStepId={sidebarState.dragStepId}
        highlightedStepId={highlightedStepId}
        onDeleteStep={props.onDeleteStep}
        onInspectStep={sidebarState.setInspectedStep}
        onMoveStep={props.onMoveStep}
        onOpenEditor={() => props.onOpenEditor()}
        onPreviewOpen={sidebarState.setPreviewStep}
        onSidebarHeaderMouseDown={props.onSidebarHeaderMouseDown}
        position={props.position}
        projectName={props.projectName}
        recentSteps={props.recentSteps}
        setDragStepId={sidebarState.setDragStepId}
        sidebarRef={props.sidebarRef}
        stepsContainerRef={stepsContainerRef}
      />
      {renderScenarioRecorderSidebarOverlays(sidebarState)}
    </>
  );
}

function renderScenarioRecorderSidebarOverlays(
  sidebarState: ReturnType<typeof useScenarioRecorderSidebarState>
) {
  return (
    <>
      <ScenarioRecorderSidebarMetadataModal
        inspectedStep={sidebarState.inspectedStep}
        onClose={sidebarState.closeInspectedStep}
      />
      <ScenarioRecorderSidebarPreviewOverlay
        onClose={sidebarState.closePreviewStep}
        step={sidebarState.previewStep}
      />
    </>
  );
}

function useScenarioRecorderSidebarState() {
  const [dragStepId, setDragStepId] = useState<string | null>(null);
  const [inspectedStep, setInspectedStep] = useState<ScenarioRecorderSidebarStep | null>(null);
  const [previewStep, setPreviewStep] = useState<ScenarioRecorderSidebarStep | null>(null);

  return {
    closeInspectedStep: () => setInspectedStep(null),
    closePreviewStep: () => setPreviewStep(null),
    dragStepId,
    inspectedStep,
    previewStep,
    setDragStepId,
    setInspectedStep,
    setPreviewStep,
  };
}
