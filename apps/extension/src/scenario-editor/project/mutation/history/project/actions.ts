import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import { cloneHistorySnapshot } from '@sniptale/foundation/history/clone';
import {
  applyProjectHistorySnapshot,
  type ScenarioProjectHistorySnapshot,
  type ScenarioProjectHistoryState,
} from './helpers';
import type { ScenarioProject } from '../../../../../features/scenario/contracts/types/project';

type ScenarioProjectHistoryActionArgs = {
  latestSnapshotRef: MutableRefObject<ScenarioProjectHistorySnapshot | null>;
  setHistoryState: Dispatch<SetStateAction<ScenarioProjectHistoryState>>;
  setProject: Dispatch<SetStateAction<ScenarioProject | null>>;
  setQuickEditStepId: Dispatch<SetStateAction<string | null>>;
  setSelectedStepId: Dispatch<SetStateAction<string | null>>;
};

function useScenarioEditorProjectUndoAction(args: ScenarioProjectHistoryActionArgs) {
  return useCallback(() => {
    args.setHistoryState((current) => {
      const previousSnapshot = current.past.at(-1);
      const currentSnapshot = args.latestSnapshotRef.current;
      if (!previousSnapshot || !currentSnapshot) {
        return current;
      }

      applyProjectHistorySnapshot({
        setProject: args.setProject,
        setQuickEditStepId: args.setQuickEditStepId,
        setSelectedStepId: args.setSelectedStepId,
        snapshot: previousSnapshot,
      });

      return {
        future: [cloneHistorySnapshot(currentSnapshot), ...current.future],
        past: current.past.slice(0, -1),
      };
    });
  }, [args]);
}

function useScenarioEditorProjectRedoAction(args: ScenarioProjectHistoryActionArgs) {
  return useCallback(() => {
    args.setHistoryState((current) => {
      const nextSnapshot = current.future[0];
      const currentSnapshot = args.latestSnapshotRef.current;
      if (!nextSnapshot || !currentSnapshot) {
        return current;
      }

      applyProjectHistorySnapshot({
        setProject: args.setProject,
        setQuickEditStepId: args.setQuickEditStepId,
        setSelectedStepId: args.setSelectedStepId,
        snapshot: nextSnapshot,
      });

      return {
        future: current.future.slice(1),
        past: [...current.past, cloneHistorySnapshot(currentSnapshot)],
      };
    });
  }, [args]);
}

export function useScenarioEditorProjectHistoryActions(args: {
  latestSnapshotRef: MutableRefObject<ScenarioProjectHistorySnapshot | null>;
  pendingMutationRef: MutableRefObject<ScenarioProjectHistorySnapshot | null>;
  setHistoryState: Dispatch<SetStateAction<ScenarioProjectHistoryState>>;
  setProject: Dispatch<SetStateAction<ScenarioProject | null>>;
  setQuickEditStepId: Dispatch<SetStateAction<string | null>>;
  setSelectedStepId: Dispatch<SetStateAction<string | null>>;
}) {
  const trackProjectMutation = useCallback(() => {
    args.pendingMutationRef.current = args.latestSnapshotRef.current;
  }, [args.latestSnapshotRef, args.pendingMutationRef]);

  const undoProjectChange = useScenarioEditorProjectUndoAction({
    latestSnapshotRef: args.latestSnapshotRef,
    setHistoryState: args.setHistoryState,
    setProject: args.setProject,
    setQuickEditStepId: args.setQuickEditStepId,
    setSelectedStepId: args.setSelectedStepId,
  });
  const redoProjectChange = useScenarioEditorProjectRedoAction({
    latestSnapshotRef: args.latestSnapshotRef,
    setHistoryState: args.setHistoryState,
    setProject: args.setProject,
    setQuickEditStepId: args.setQuickEditStepId,
    setSelectedStepId: args.setSelectedStepId,
  });

  return {
    redoProjectChange,
    trackProjectMutation,
    undoProjectChange,
  };
}
