import { useEffect, useRef, useState } from 'react';
import type { ContentAppLayoutScenarioProps } from './types';

type ActiveHighlight = {
  expiresAt: number;
  stepId: string;
};

type DeferredSidebarHighlightArgs = {
  isCompletelyHidden: boolean;
  scenario: ContentAppLayoutScenarioProps;
};

function buildActiveHighlight(stepId: string): ActiveHighlight {
  return {
    expiresAt: Date.now() + 1800,
    stepId,
  };
}

function shouldCarryActiveHighlight(activeHighlight: ActiveHighlight | null) {
  return Boolean(activeHighlight && activeHighlight.expiresAt > Date.now());
}

function startForcedHighlight(args: {
  setForcedHighlightStepId: (stepId: string) => void;
  setForcedHighlightVersion: React.Dispatch<React.SetStateAction<number>>;
  stepId: string;
}) {
  args.setForcedHighlightStepId(args.stepId);
  args.setForcedHighlightVersion((current) => current + 1);
}

function setActiveHighlight(args: {
  activeHighlightRef: React.MutableRefObject<ActiveHighlight | null>;
  stepId: string;
}) {
  args.activeHighlightRef.current = buildActiveHighlight(args.stepId);
}

function useLatestStepHighlightReplay(args: {
  activeHighlightRef: React.MutableRefObject<ActiveHighlight | null>;
  isCompletelyHidden: boolean;
  latestRecentStepId: string | null;
  pendingReplayStepIdRef: React.MutableRefObject<string | null>;
  previousHiddenStateRef: React.MutableRefObject<boolean>;
  previousHighlightTokenRef: React.MutableRefObject<number>;
  recentStepHighlightToken: number;
  setForcedHighlightStepId: (stepId: string) => void;
  setForcedHighlightVersion: React.Dispatch<React.SetStateAction<number>>;
}) {
  useEffect(() => {
    if (
      args.recentStepHighlightToken === args.previousHighlightTokenRef.current ||
      !args.latestRecentStepId
    ) {
      return;
    }

    args.previousHighlightTokenRef.current = args.recentStepHighlightToken;
    if (args.isCompletelyHidden) {
      args.pendingReplayStepIdRef.current = args.latestRecentStepId;
      return;
    }
    if (args.previousHiddenStateRef.current) {
      args.pendingReplayStepIdRef.current = null;
      setActiveHighlight({
        activeHighlightRef: args.activeHighlightRef,
        stepId: args.latestRecentStepId,
      });
      startForcedHighlight({
        setForcedHighlightStepId: args.setForcedHighlightStepId,
        setForcedHighlightVersion: args.setForcedHighlightVersion,
        stepId: args.latestRecentStepId,
      });
      return;
    }
    setActiveHighlight({
      activeHighlightRef: args.activeHighlightRef,
      stepId: args.latestRecentStepId,
    });
  }, [args]);
}

function useHiddenHighlightReplay(args: {
  activeHighlightRef: React.MutableRefObject<ActiveHighlight | null>;
  isCompletelyHidden: boolean;
  pendingReplayStepIdRef: React.MutableRefObject<string | null>;
  previousHiddenStateRef: React.MutableRefObject<boolean>;
  setForcedHighlightStepId: (stepId: string) => void;
  setForcedHighlightVersion: React.Dispatch<React.SetStateAction<number>>;
}) {
  useEffect(() => {
    if (args.isCompletelyHidden === args.previousHiddenStateRef.current) {
      return;
    }

    args.previousHiddenStateRef.current = args.isCompletelyHidden;
    if (args.isCompletelyHidden) {
      const activeHighlight = args.activeHighlightRef.current;
      if (shouldCarryActiveHighlight(activeHighlight) && activeHighlight) {
        args.pendingReplayStepIdRef.current = activeHighlight.stepId;
      }
      return;
    }
    if (!args.pendingReplayStepIdRef.current) {
      return;
    }

    startForcedHighlight({
      setForcedHighlightStepId: args.setForcedHighlightStepId,
      setForcedHighlightVersion: args.setForcedHighlightVersion,
      stepId: args.pendingReplayStepIdRef.current,
    });
    setActiveHighlight({
      activeHighlightRef: args.activeHighlightRef,
      stepId: args.pendingReplayStepIdRef.current,
    });
    args.pendingReplayStepIdRef.current = null;
  }, [args]);
}

export function useDeferredSidebarHighlight(args: DeferredSidebarHighlightArgs) {
  const latestRecentStepId = args.scenario.state.recentSteps[0]?.id ?? null;
  const recentStepHighlightToken = args.scenario.state.recentStepHighlightToken;
  const [forcedHighlightVersion, setForcedHighlightVersion] = useState(0);
  const [forcedHighlightStepId, setForcedHighlightStepId] = useState<string | null>(null);
  const previousHighlightTokenRef = useRef(recentStepHighlightToken);
  const previousHiddenStateRef = useRef(args.isCompletelyHidden);
  const pendingReplayStepIdRef = useRef<string | null>(null);
  const activeHighlightRef = useRef<ActiveHighlight | null>(null);

  useLatestStepHighlightReplay({
    activeHighlightRef,
    isCompletelyHidden: args.isCompletelyHidden,
    latestRecentStepId,
    pendingReplayStepIdRef,
    previousHiddenStateRef,
    previousHighlightTokenRef,
    recentStepHighlightToken,
    setForcedHighlightStepId,
    setForcedHighlightVersion,
  });
  useHiddenHighlightReplay({
    activeHighlightRef,
    isCompletelyHidden: args.isCompletelyHidden,
    pendingReplayStepIdRef,
    previousHiddenStateRef,
    setForcedHighlightStepId,
    setForcedHighlightVersion,
  });

  return { forcedHighlightStepId, forcedHighlightVersion };
}
