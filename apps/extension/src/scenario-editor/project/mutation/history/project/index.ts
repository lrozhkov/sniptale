import { useEffect, useRef, useState } from 'react';

import { cloneHistorySnapshot } from '@sniptale/foundation/history/clone';
import type { ScenarioProject } from '../../../../../features/scenario/contracts/types/project';
import { useScenarioEditorProjectHistoryActions } from './actions';
import {
  buildProjectHistorySnapshot,
  type ScenarioProjectHistorySnapshot,
  type ScenarioProjectHistoryState,
} from './helpers';

function useProjectSnapshotRefs(args: {
  project: ScenarioProject | null;
  quickEditStepId: string | null;
  selectedStepId: string | null;
}) {
  const latestSnapshotRef = useRef<ScenarioProjectHistorySnapshot | null>(
    args.project
      ? buildProjectHistorySnapshot({
          project: args.project,
          quickEditStepId: args.quickEditStepId,
          selectedStepId: args.selectedStepId,
        })
      : null
  );
  const pendingMutationRef = useRef<ScenarioProjectHistorySnapshot | null>(null);

  useEffect(() => {
    latestSnapshotRef.current = args.project
      ? buildProjectHistorySnapshot({
          project: args.project,
          quickEditStepId: args.quickEditStepId,
          selectedStepId: args.selectedStepId,
        })
      : null;
  }, [args.project, args.quickEditStepId, args.selectedStepId]);

  return { latestSnapshotRef, pendingMutationRef };
}

function useScenarioEditorProjectHistoryTracking(args: {
  project: ScenarioProject | null;
  pendingMutationRef: React.MutableRefObject<ScenarioProjectHistorySnapshot | null>;
  setHistoryState: React.Dispatch<React.SetStateAction<ScenarioProjectHistoryState>>;
}) {
  const { pendingMutationRef, project, setHistoryState } = args;

  useEffect(() => {
    pendingMutationRef.current = null;
    setHistoryState({ future: [], past: [] });
  }, [pendingMutationRef, project?.id, setHistoryState]);

  useEffect(() => {
    if (!project || !pendingMutationRef.current) {
      return;
    }

    const pendingSnapshot = pendingMutationRef.current;
    pendingMutationRef.current = null;
    if (!pendingSnapshot || pendingSnapshot.project === project) {
      return;
    }

    setHistoryState((current) => ({
      future: [],
      past: [...current.past, cloneHistorySnapshot(pendingSnapshot)],
    }));
  }, [pendingMutationRef, project, setHistoryState]);
}

export function useScenarioEditorProjectHistory(args: {
  project: ScenarioProject | null;
  quickEditStepId: string | null;
  selectedStepId: string | null;
  setProject: React.Dispatch<React.SetStateAction<ScenarioProject | null>>;
  setQuickEditStepId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedStepId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const [historyState, setHistoryState] = useState<ScenarioProjectHistoryState>({
    future: [],
    past: [],
  });
  const { latestSnapshotRef, pendingMutationRef } = useProjectSnapshotRefs(args);
  useScenarioEditorProjectHistoryTracking({
    project: args.project,
    pendingMutationRef,
    setHistoryState,
  });
  const actions = useScenarioEditorProjectHistoryActions({
    latestSnapshotRef,
    pendingMutationRef,
    setHistoryState,
    setProject: args.setProject,
    setQuickEditStepId: args.setQuickEditStepId,
    setSelectedStepId: args.setSelectedStepId,
  });

  return {
    canRedoProject: historyState.future.length > 0,
    canUndoProject: historyState.past.length > 0,
    ...actions,
  };
}
