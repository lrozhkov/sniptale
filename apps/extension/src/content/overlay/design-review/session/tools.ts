import { useDesignReviewCssDrafts } from './css-drafts';
import { useCallback, useEffect, useRef } from 'react';
import type { PageStyleDeclaration } from '@sniptale/runtime-contracts/page-style';
import type { PageStyleSelectionSnapshot } from '../../../selection/design-review/snapshot';
import {
  createPageStyleValuesFromPatch,
  readPageStyleSelectionSnapshot,
} from '../../../selection/design-review/snapshot';
import type { PageStyleDeclarationValueMap } from '../../../selection/design-review/snapshot';
import { applyPageStylePatchWithHistory, flushPendingPageStyleHistory } from '../runtime/actions';

/** Routes page-tool edits through the existing mutation/history transaction. */
export function useDesignReviewTools(
  enabled: boolean,
  selection: PageStyleSelectionSnapshot | null,
  updateValues: (values: PageStyleDeclarationValueMap) => void
) {
  const cssDrafts = useDesignReviewCssDrafts(enabled);
  const selectedTarget = useRef(selection?.element ?? null);
  selectedTarget.current = selection?.element ?? null;
  const gestureCancel = useRef<(() => boolean) | null>(null);
  const cancelGesture = useCallback(() => gestureCancel.current?.() ?? false, []);
  const registerGestureCancel = useCallback((cancel: () => boolean) => {
    gestureCancel.current = cancel;
    return () => {
      if (gestureCancel.current === cancel) gestureCancel.current = null;
    };
  }, []);
  useEffect(() => {
    if (!enabled) cancelGesture();
  }, [enabled, cancelGesture]);
  useEffect(
    () => () => {
      cancelGesture();
      flushPendingPageStyleHistory();
    },
    [selection?.element, cancelGesture]
  );
  return {
    cssDrafts,
    cancelGesture,
    registerGestureCancel,
    apply: async (declarations: PageStyleDeclaration[], deferCommit = false) => {
      if (!enabled || !selection?.element.isConnected) throw new Error('Unavailable review target');
      await applyPageStylePatchWithHistory({
        element: selection.element,
        patch: { declarations },
        deferCommit,
      });
      const next = readPageStyleSelectionSnapshot(selection.element);
      if (next && selectedTarget.current === selection.element)
        updateValues(createPageStyleValuesFromPatch(next.patch));
    },
    finish: flushPendingPageStyleHistory,
  };
}
